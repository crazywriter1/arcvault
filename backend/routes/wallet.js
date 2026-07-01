// Wallet routes — list wallets, check balances, send transfers. All owner-scoped.

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getWallets, insertTransaction, updateTransactionStatus,
  getTransactions, getTransaction,
} from '../db/database.js';
import {
  getBalances, transfer, getTransaction as circleGetTx,
} from '../services/circle.js';
import { ensureWallets } from '../services/provision.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { txLimiter } from '../middleware/rateLimits.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ wallets: getWallets(req.ownerAddress) });
});

router.get('/:id/balances', async (req, res) => {
  const wallet = getWallets(req.ownerAddress).find(w => w.id === req.params.id);
  if (!wallet) return res.status(404).json({ error: 'wallet not found' });
  try {
    const balances = await getBalances(wallet.circle_wallet_id);
    res.json({ wallet, balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/balances/all', async (req, res) => {
  await ensureWallets(req.ownerAddress);
  const wallets = getWallets(req.ownerAddress);
  const out = [];
  for (const w of wallets) {
    try {
      const balances = await getBalances(w.circle_wallet_id);
      out.push({ wallet: w, balances });
    } catch (err) {
      out.push({ wallet: w, balances: [], error: err.message });
    }
  }
  res.json({ wallets: out });
});

router.post('/:id/transfer', txLimiter, async (req, res) => {
  const { tokenId, tokenSymbol, destinationAddress, amount, requireApproval = false } = req.body ?? {};
  const wallet = getWallets(req.ownerAddress).find(w => w.id === req.params.id);
  if (!wallet) return res.status(404).json({ error: 'wallet not found' });
  if (!tokenId || !destinationAddress || !amount) {
    return res.status(400).json({ error: 'missing tokenId/destinationAddress/amount' });
  }

  const txId = uuid();
  if (requireApproval) {
    insertTransaction({
      id: txId,
      owner_address: req.ownerAddress,
      wallet_id: wallet.id,
      type: 'transfer',
      token_symbol: tokenSymbol,
      amount: String(amount),
      destination: destinationAddress,
      status: 'pending_approval',
      initiated_by: 'user',
    });
    return res.json({ id: txId, status: 'pending_approval' });
  }

  try {
    const result = await transfer({
      walletId: wallet.circle_wallet_id,
      tokenId,
      destinationAddress,
      amount,
      refId: `user-${txId}`,
    });
    insertTransaction({
      id: txId,
      owner_address: req.ownerAddress,
      circle_tx_id: result.id,
      wallet_id: wallet.id,
      type: 'transfer',
      token_symbol: tokenSymbol,
      amount: String(amount),
      destination: destinationAddress,
      status: 'submitted',
      initiated_by: 'user',
    });
    res.json({ id: txId, circle_tx_id: result.id, status: 'submitted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tx/:id/approve', txLimiter, async (req, res) => {
  const tx = getTransaction(req.params.id, req.ownerAddress);
  if (!tx) return res.status(404).json({ error: 'tx not found' });
  if (tx.status !== 'pending_approval') {
    return res.status(400).json({ error: `tx status is ${tx.status}, cannot approve` });
  }
  const wallet = getWallets(req.ownerAddress).find(w => w.id === tx.wallet_id);
  if (!wallet) return res.status(404).json({ error: 'source wallet missing' });

  try {
    const balances = await getBalances(wallet.circle_wallet_id);
    const tokEntry = balances.find(b => b.token?.symbol === tx.token_symbol);
    if (!tokEntry) return res.status(400).json({ error: 'token no longer held' });

    const result = await transfer({
      walletId: wallet.circle_wallet_id,
      tokenId: tokEntry.token.id,
      destinationAddress: tx.destination,
      amount: tx.amount,
      refId: `approved-${tx.id}`,
    });
    updateTransactionStatus(tx.id, 'submitted', { circle_tx_id: result.id });
    res.json({ id: tx.id, circle_tx_id: result.id, status: 'submitted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tx/:id/reject', (req, res) => {
  const tx = getTransaction(req.params.id, req.ownerAddress);
  if (!tx) return res.status(404).json({ error: 'tx not found' });
  updateTransactionStatus(tx.id, 'rejected');
  res.json({ id: tx.id, status: 'rejected' });
});

router.get('/tx/list', (req, res) => {
  res.json({ transactions: getTransactions(req.ownerAddress, { limit: 100 }) });
});

router.post('/tx/:id/sync', async (req, res) => {
  const tx = getTransaction(req.params.id, req.ownerAddress);
  if (!tx?.circle_tx_id) return res.status(404).json({ error: 'no circle_tx_id' });
  try {
    const remote = await circleGetTx(tx.circle_tx_id);
    const mapped = mapCircleState(remote?.state);
    updateTransactionStatus(tx.id, mapped, { tx_hash: remote?.txHash });
    res.json({ id: tx.id, status: mapped, remote_state: remote?.state, tx_hash: remote?.txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function mapCircleState(state) {
  switch ((state || '').toUpperCase()) {
    case 'COMPLETE': case 'CONFIRMED': return 'confirmed';
    case 'FAILED': case 'CANCELLED': case 'DENIED': return 'failed';
    case 'INITIATED': case 'PENDING_RISK_SCREENING': case 'QUEUED': case 'SENT': return 'submitted';
    default: return 'submitted';
  }
}

export default router;
