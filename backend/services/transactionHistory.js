// Merge local SQLite transactions with Circle API history (Vercel-safe).

import { listTransactions } from './circle.js';

export function mapCircleState(state) {
  switch ((state || '').toUpperCase()) {
    case 'COMPLETE': case 'CONFIRMED': return 'confirmed';
    case 'FAILED': case 'CANCELLED': case 'DENIED': return 'failed';
    case 'INITIATED': case 'PENDING_RISK_SCREENING': case 'QUEUED': case 'SENT': return 'submitted';
    default: return 'submitted';
  }
}

function mapCircleTx(t, wallet) {
  const amt = Array.isArray(t.amounts) ? t.amounts[0] : (t.amount ?? '0');
  const isInbound = String(t.transactionType || '').toUpperCase() === 'INBOUND';
  return {
    id: `circle-${t.id}`,
    circle_tx_id: t.id,
    wallet_id: wallet.id,
    type: 'transfer',
    token_symbol: 'USDC',
    amount: String(amt),
    destination: isInbound
      ? (t.sourceAddress || wallet.address || '—')
      : (t.destinationAddress || '—'),
    status: mapCircleState(t.state),
    tx_hash: t.txHash || null,
    initiated_by: isInbound ? 'wallet' : 'user',
    created_at: t.createDate ? new Date(t.createDate).getTime() : Date.now(),
    remote: true,
  };
}

export async function fetchCircleTransactions(wallets = []) {
  const out = [];
  for (const w of wallets) {
    try {
      const txs = await listTransactions({ walletId: w.circle_wallet_id, pageSize: 50 });
      for (const t of txs) out.push(mapCircleTx(t, w));
    } catch (err) {
      console.error(`circle tx list ${w.circle_wallet_id}:`, err.message);
    }
  }
  return out;
}

export function mergeTransactionLists(localTxs = [], circleTxs = [], limit = 100) {
  const byCircleId = new Map();
  for (const tx of localTxs) {
    if (tx.circle_tx_id) byCircleId.set(tx.circle_tx_id, tx);
  }
  const merged = [...localTxs];
  for (const tx of circleTxs) {
    if (tx.circle_tx_id && byCircleId.has(tx.circle_tx_id)) continue;
    merged.push(tx);
  }
  return merged
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, limit);
}

export async function buildFullTransactionList({ ownerAddress, getTransactions, getWallets }) {
  const local = getTransactions(ownerAddress, { limit: 100 });
  const wallets = getWallets(ownerAddress);
  const circle = wallets.length ? await fetchCircleTransactions(wallets) : [];
  return mergeTransactionLists(local, circle);
}
