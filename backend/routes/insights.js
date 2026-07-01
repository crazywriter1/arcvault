// Insights: health score, activity feed, what-if simulation, chain ping log.

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getWallets, getRules, getTransactions, insertChainPing, getChainPings,
  insertRule,
} from '../db/database.js';
import { getBalances } from '../services/circle.js';
import { computeHealthScore, buildActivityFeed, runWhatIf } from '../services/insights.js';

const router = Router();
router.use(requireAuth);

async function loadWalletRows(ownerAddress) {
  const wallets = getWallets(ownerAddress);
  const out = [];
  for (const w of wallets) {
    try {
      const balances = await getBalances(w.circle_wallet_id);
      out.push({ wallet: w, balances });
    } catch {
      out.push({ wallet: w, balances: [] });
    }
  }
  return out;
}

router.get('/health', async (req, res) => {
  try {
    const walletRows = await loadWalletRows(req.ownerAddress);
    const rules = getRules(req.ownerAddress);
    const transactions = getTransactions(req.ownerAddress, { limit: 100 });
    res.json(computeHealthScore({ walletRows, rules, transactions }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/activity', async (req, res) => {
  try {
    const transactions = getTransactions(req.ownerAddress, { limit: 50 });
    const pings = getChainPings(req.ownerAddress, { limit: 30 });
    res.json({ items: buildActivityFeed({ transactions, pings }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ping', (req, res) => {
  const { kind, tx_hash: txHash } = req.body ?? {};
  if (!kind || !['gm', 'gn'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be gm or gn' });
  }
  const id = uuid();
  insertChainPing({ id, ownerAddress: req.ownerAddress, kind, txHash });
  res.json({ id, status: 'logged' });
});

router.post('/whatif', async (req, res) => {
  try {
    const walletRows = await loadWalletRows(req.ownerAddress);
    const rules = getRules(req.ownerAddress);
    const result = runWhatIf({ walletRows, rules, scenario: req.body ?? {} });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/presets/payroll', (req, res) => {
  const {
    recipient,
    amount = 200,
    token = 'USDC',
    day_of_month: dayOfMonth = 1,
    label = 'Monthly payroll',
  } = req.body ?? {};

  if (!recipient?.startsWith('0x') || recipient.length !== 42) {
    return res.status(400).json({ error: 'valid 0x recipient required' });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'invalid amount' });
  }
  const day = Math.min(28, Math.max(1, Number(dayOfMonth) || 1));

  const id = uuid();
  insertRule({
    id,
    owner_address: req.ownerAddress,
    label,
    trigger_type: 'schedule',
    trigger_config: { type: 'schedule', cron: `0 9 ${day} * *` },
    action_type: 'transfer',
    action_config: {
      type: 'transfer',
      token,
      amount: amt,
      from: 'Treasury Primary',
      to: recipient,
    },
    enabled: true,
  });

  res.json({
    id,
    status: 'created',
    message: `Payroll rule: ${amt} ${token} to ${recipient.slice(0, 6)}… on day ${day} each month at 09:00`,
  });
});

export default router;
