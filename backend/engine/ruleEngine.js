// Rule engine — evaluates active rules per owner and triggers actions.

import { v4 as uuid } from 'uuid';
import {
  getRules, updateRuleLastRun,
  insertTransaction, insertAlert, getWallets,
  getDistinctOwners,
} from '../db/database.js';
import { getBalances, getRawBalances, findTokenBalance, transfer } from '../services/circle.js';
import { getPairRate } from '../services/fx.js';

function findWalletByLabel(wallets, label) {
  const q = String(label || '').trim().toLowerCase();
  if (!q) return null;
  return wallets.find((w) => String(w.label || '').toLowerCase() === q)
    || wallets.find((w) => String(w.label || '').toLowerCase().includes(q));
}

export async function evaluateRulesForOwner(ownerAddress) {
  const rules = getRules(ownerAddress, { enabledOnly: true });
  const wallets = getWallets(ownerAddress);
  const results = [];

  for (const rule of rules) {
    try {
      const fired = await evaluateTrigger(rule.trigger_config, wallets);
      if (fired) {
        await executeAction(rule, wallets, ownerAddress);
        updateRuleLastRun(rule.id);
        results.push({ ruleId: rule.id, fired: true });
      } else {
        results.push({ ruleId: rule.id, fired: false });
      }
    } catch (err) {
      console.error(`Rule ${rule.id} error:`, err.message);
      insertAlert({
        id: uuid(),
        ownerAddress,
        level: 'warn',
        message: `Rule "${rule.label}" failed: ${err.message}`,
      });
    }
  }
  return results;
}

export async function evaluateAll() {
  const owners = getDistinctOwners();
  const all = [];
  for (const o of owners) {
    try {
      const r = await evaluateRulesForOwner(o);
      all.push({ owner: o, results: r });
    } catch (err) {
      console.error(`evaluateAll owner ${o} error:`, err.message);
    }
  }
  return all;
}

async function evaluateTrigger(cfg, wallets) {
  if (cfg.type === 'threshold') {
    const wallet = findWalletByLabel(wallets, cfg.wallet) ?? wallets[0];
    if (!wallet) return false;
    const balances = await getBalances(wallet.circle_wallet_id);
    const tok = balances.find(b => b.token?.symbol === cfg.token);
    const amount = tok ? parseFloat(tok.amount) : 0;
    return compare(amount, cfg.operator, cfg.value);
  }
  if (cfg.type === 'fx_rate') {
    const rate = await getPairRate(cfg.pair);
    return compare(rate, cfg.operator, Number(cfg.value));
  }
  return false;
}

function compare(a, op, b) {
  switch (op) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '==': return a === b;
    default: return false;
  }
}

export async function executeAction(rule, wallets, ownerAddress) {
  const action = rule.action_config;
  const actionType = rule.action_type;

  if (actionType === 'alert') {
    insertAlert({
      id: uuid(),
      ownerAddress,
      level: action.level ?? 'info',
      message: action.message ?? `Rule "${rule.label}" triggered.`,
    });
    return;
  }

  if (actionType === 'transfer') {
    const fromWallet = findWalletByLabel(wallets, action.from) ?? wallets[0];
    if (!fromWallet) throw new Error('Source wallet not found');

    const balances = await getRawBalances(fromWallet.circle_wallet_id);
    const tok = findTokenBalance(balances, action.token ?? 'USDC', action.amount);
    if (!tok) throw new Error(`Token ${action.token} not held in wallet`);

    let destAddress = action.to;
    if (!destAddress?.startsWith('0x')) {
      const destWallet = findWalletByLabel(wallets, action.to);
      if (!destWallet) throw new Error(`Destination wallet "${action.to}" not found`);
      destAddress = destWallet.address;
    }

    const amount = Number(action.amount);
    const txId = uuid();
    if (amount > 1000) {
      insertTransaction({
        id: txId,
        owner_address: ownerAddress,
        wallet_id: fromWallet.id,
        type: 'transfer',
        token_symbol: tok.token.symbol,
        amount: String(amount),
        destination: destAddress,
        status: 'pending_approval',
        rule_id: rule.id,
        initiated_by: 'rule',
      });
      insertAlert({
        id: uuid(),
        ownerAddress,
        level: 'warn',
        message: `Rule "${rule.label}" wants to send ${amount} ${tok.token.symbol}. Approval required.`,
      });
      return;
    }

    const res = await transfer({
      walletId: fromWallet.circle_wallet_id,
      tokenId: tok.token.id,
      destinationAddress: destAddress,
      amount,
      refId: `rule-${rule.id}-${Date.now()}`,
    });
    insertTransaction({
      id: txId,
      owner_address: ownerAddress,
      circle_tx_id: res.id,
      wallet_id: fromWallet.id,
      type: 'transfer',
      token_symbol: tok.token.symbol,
      amount: String(amount),
      destination: destAddress,
      status: 'submitted',
      rule_id: rule.id,
      initiated_by: 'rule',
    });
    insertAlert({
      id: uuid(),
      ownerAddress,
      level: 'info',
      message: `Rule "${rule.label}" executed: sent ${amount} ${tok.token.symbol} → ${destAddress.slice(0, 10)}…`,
    });
  }
}
