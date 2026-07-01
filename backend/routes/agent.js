// AI Agent chat + action execution — owner-scoped.

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getWallets, insertChatMessage, getChatHistory, clearChatHistory,
  insertRule, insertTransaction,
  getAlerts, markAlertsRead,
  getTransactions,
} from '../db/database.js';
import { parseCommand, generateReport, isCompleteRuleParams } from '../services/ai.js';
import { getBalances, transfer } from '../services/circle.js';
import { quoteSwap, executeSwap } from '../services/swap.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { chatLimiter } from '../middleware/rateLimits.js';

const router = Router();
router.use(requireAuth);

function findWalletByLabel(wallets, label) {
  const q = String(label || '').trim().toLowerCase();
  if (!q) return null;
  return wallets.find((w) => String(w.label || '').toLowerCase() === q)
    || wallets.find((w) => String(w.label || '').toLowerCase().includes(q));
}

router.get('/history', (req, res) => {
  res.json({ messages: getChatHistory(req.ownerAddress, 50) });
});

router.delete('/history', (req, res) => {
  const deleted = clearChatHistory(req.ownerAddress);
  res.json({ status: 'ok', deleted });
});

router.post('/chat', chatLimiter, async (req, res) => {
  const { message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const wallets = getWallets(req.ownerAddress);
  const history = getChatHistory(req.ownerAddress, 10);

  const userMsgId = uuid();
  insertChatMessage({ id: userMsgId, ownerAddress: req.ownerAddress, role: 'user', content: message });

  try {
    const { parsed, raw } = await parseCommand(message, {
      walletsContext: wallets,
      chatHistory: history,
    });

    let finalAction = parsed;
    if (parsed.intent === 'rule_create' && isCompleteRuleParams(parsed.params)) {
      const { label, trigger, action: ruleAction } = parsed.params;
      const ruleId = uuid();
      insertRule({
        id: ruleId,
        owner_address: req.ownerAddress,
        label: label ?? 'Automation rule',
        trigger_type: trigger.type,
        trigger_config: trigger,
        action_type: ruleAction.type,
        action_config: ruleAction,
        enabled: true,
      });
      finalAction = {
        ...parsed,
        auto_created: true,
        rule_id: ruleId,
        requires_approval: false,
        summary: `Rule created: "${label}" — ${parsed.summary}`,
      };
    }

    const asstId = uuid();
    insertChatMessage({
      id: asstId,
      ownerAddress: req.ownerAddress,
      role: 'assistant',
      content: finalAction.summary ?? raw,
      action_json: finalAction,
    });

    const enrichment = await maybeEnrich(finalAction, wallets, req.ownerAddress);

    res.json({ id: asstId, action: finalAction, enrichment });
  } catch (err) {
    console.error('chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/execute', chatLimiter, async (req, res) => {
  const { action } = req.body ?? {};
  if (!action?.intent) return res.status(400).json({ error: 'action.intent required' });
  const wallets = getWallets(req.ownerAddress);

  try {
    if (action.intent === 'rule_create') {
      const { label, trigger, action: ruleAction } = action.params ?? {};
      const id = uuid();
      insertRule({
        id,
        owner_address: req.ownerAddress,
        label: label ?? 'Unnamed Rule',
        trigger_type: trigger.type,
        trigger_config: trigger,
        action_type: ruleAction.type,
        action_config: ruleAction,
        enabled: true,
      });
      return res.json({ status: 'rule_created', id });
    }

    if (action.intent === 'transfer') {
      const { token = 'USDC', amount, to, from = 'Treasury' } = action.params ?? {};
      const srcWallet = findWalletByLabel(wallets, from) ?? wallets[0];
      if (!srcWallet) return res.status(400).json({ error: 'no source wallet' });

      let destAddress = to;
      if (!destAddress?.startsWith('0x')) {
        const destWallet = findWalletByLabel(wallets, to);
        if (!destWallet) return res.status(400).json({ error: `destination "${to}" not found` });
        destAddress = destWallet.address;
      }

      const balances = await getBalances(srcWallet.circle_wallet_id);
      const tokEntry = balances.find(b => b.token?.symbol === token);
      if (!tokEntry) return res.status(400).json({ error: `no ${token} held in ${srcWallet.label}` });

      const txId = uuid();
      const result = await transfer({
        walletId: srcWallet.circle_wallet_id,
        tokenId: tokEntry.token.id,
        destinationAddress: destAddress,
        amount,
        refId: `ai-${txId}`,
      });
      insertTransaction({
        id: txId,
        owner_address: req.ownerAddress,
        circle_tx_id: result.id,
        wallet_id: srcWallet.id,
        type: 'transfer',
        token_symbol: token,
        amount: String(amount),
        destination: destAddress,
        status: 'submitted',
        initiated_by: 'ai',
      });
      return res.json({ status: 'submitted', id: txId, circle_tx_id: result.id });
    }

    if (action.intent === 'swap') {
      const {
        from_token: fromToken,
        to_token: toToken,
        amount,
        wallet: walletLabel = 'Treasury Primary',
      } = action.params ?? {};

      const srcWallet = findWalletByLabel(wallets, walletLabel) ?? wallets[0];
      if (!srcWallet) return res.status(400).json({ error: 'no source wallet' });

      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'invalid swap amount' });
      }

      const txId = uuid();
      if (amt > 1000) {
        const quote = await quoteSwap({ fromToken, toToken, amount: amt });
        insertTransaction({
          id: txId,
          owner_address: req.ownerAddress,
          wallet_id: srcWallet.id,
          type: 'swap',
          token_symbol: quote.from,
          amount: String(quote.fromAmount),
          destination: `${quote.toAmount} ${quote.to}`,
          status: 'pending_approval',
          initiated_by: 'ai',
        });
        return res.json({
          status: 'pending_approval',
          id: txId,
          quote,
          message: `Swap ${quote.fromAmount} ${quote.from} → ${quote.toAmount.toFixed(4)} ${quote.to} requires approval`,
        });
      }

      const result = await executeSwap({
        wallets,
        sourceWallet: srcWallet,
        fromToken,
        toToken,
        amount: amt,
        refPrefix: `ai-${txId}`,
      });

      insertTransaction({
        id: txId,
        owner_address: req.ownerAddress,
        circle_tx_id: result.leg2.id,
        wallet_id: srcWallet.id,
        type: 'swap',
        token_symbol: result.quote.from,
        amount: String(result.quote.fromAmount),
        destination: `${result.quote.toAmount} ${result.quote.to}`,
        status: 'submitted',
        initiated_by: 'ai',
      });

      return res.json({
        status: 'submitted',
        id: txId,
        quote: result.quote,
        message: `Swapped ${result.quote.fromAmount} ${result.quote.from} → ${result.quote.toAmount.toFixed(4)} ${result.quote.to} (rate ${result.quote.rate.toFixed(4)})`,
      });
    }

    res.status(400).json({ error: `intent ${action.intent} not directly executable` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/alerts', (req, res) => {
  res.json({ alerts: getAlerts(req.ownerAddress, { limit: 20 }) });
});

router.post('/alerts/read', (req, res) => {
  markAlertsRead(req.ownerAddress);
  res.json({ status: 'ok' });
});

async function maybeEnrich(action, wallets, ownerAddress) {
  if (action.intent === 'balance_query') {
    const out = [];
    for (const w of wallets) {
      try {
        const balances = await getBalances(w.circle_wallet_id);
        out.push({
          label: w.label,
          address: w.address,
          tokens: balances.map(b => ({ symbol: b.token?.symbol, amount: b.amount })),
        });
      } catch {
        out.push({ label: w.label, address: w.address, tokens: [], error: 'balance fetch failed' });
      }
    }
    return { balances: out };
  }

  if (action.intent === 'report') {
    const period = action.params?.period_days ?? 30;
    const txs = getTransactions(ownerAddress, { limit: 100 });
    const balancesByWallet = [];
    for (const w of wallets) {
      try {
        const b = await getBalances(w.circle_wallet_id);
        balancesByWallet.push({ wallet: w.label, tokens: b.map(x => ({ symbol: x.token?.symbol, amount: x.amount })) });
      } catch {
        balancesByWallet.push({ wallet: w.label, tokens: [] });
      }
    }
    const report = await generateReport({ transactions: txs, balances: balancesByWallet, periodDays: period });
    return { report };
  }

  if (action.intent === 'swap') {
    try {
      const { from_token, to_token, amount } = action.params ?? {};
      const quote = await quoteSwap({ fromToken: from_token, toToken: to_token, amount });
      return { quote };
    } catch (err) {
      return { quote_error: err.message };
    }
  }

  return null;
}

export default router;
