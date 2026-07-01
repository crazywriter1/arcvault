// Circle Programmable Wallets SDK wrapper.
// Handles wallet sets, wallets, balance queries, and USDC/EURC transfers on Arc testnet.

import 'dotenv/config';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  throw new Error('CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET missing in .env');
}

export const client = initiateDeveloperControlledWalletsClient({
  apiKey,
  entitySecret,
});

// Circle's blockchain identifier for Arc Testnet
export const ARC_BLOCKCHAIN = 'ARC-TESTNET';

export async function createWalletSet(name = 'ArcVault Treasury') {
  const res = await client.createWalletSet({ name });
  return res.data?.walletSet;
}

export async function listWalletSets() {
  const res = await client.listWalletSets({});
  return res.data?.walletSets ?? [];
}

export async function createWallets({ walletSetId, count = 1, accountType = 'EOA' }) {
  const res = await client.createWallets({
    walletSetId,
    blockchains: [ARC_BLOCKCHAIN],
    count,
    accountType,
  });
  return res.data?.wallets ?? [];
}

export async function listWallets({ walletSetId } = {}) {
  const res = await client.listWallets(walletSetId ? { walletSetId } : {});
  return res.data?.wallets ?? [];
}

export async function getWallet(walletId) {
  const res = await client.getWallet({ id: walletId });
  return res.data?.wallet;
}

export async function getRawBalances(walletId) {
  const res = await client.getWalletTokenBalance({ id: walletId });
  return res.data?.tokenBalances ?? [];
}

/** Circle may return duplicate rows per symbol (multiple token IDs). Merge for display. */
export function mergeTokenBalances(balances = []) {
  const seenIds = new Set();
  const unique = balances.filter((b) => {
    const id = b.token?.id;
    if (!id) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  const bySymbol = new Map();
  for (const b of unique) {
    const sym = String(b.token?.symbol || '').toUpperCase();
    if (!sym) continue;
    const amt = parseFloat(b.amount ?? 0) || 0;
    const cur = bySymbol.get(sym);
    if (!cur) {
      bySymbol.set(sym, { ...b, amount: String(amt) });
      continue;
    }
    const total = parseFloat(cur.amount) + amt;
    const useMeta = amt > parseFloat(cur.amount ?? 0) ? b : cur;
    bySymbol.set(sym, { ...useMeta, amount: String(Number(total.toFixed(6))) });
  }
  return [...bySymbol.values()].sort((a, b) =>
    String(a.token?.symbol || '').localeCompare(String(b.token?.symbol || '')),
  );
}

/** Pick a token row with enough balance for transfers (uses raw Circle rows). */
export function findTokenBalance(balances, symbol, requiredAmount = 0) {
  const sym = String(symbol || '').toUpperCase();
  const need = Number(requiredAmount) || 0;
  const matches = balances.filter((b) => String(b.token?.symbol || '').toUpperCase() === sym);
  if (!matches.length) return null;
  return matches.find((b) => parseFloat(b.amount ?? 0) >= need)
    ?? matches.sort((a, b) => parseFloat(b.amount ?? 0) - parseFloat(a.amount ?? 0))[0];
}

export async function getBalances(walletId) {
  return mergeTokenBalances(await getRawBalances(walletId));
}

// Transfer a stablecoin (USDC/EURC) on Arc.
// tokenId comes from Circle's token catalog (obtained from getBalances[].token.id).
export async function transfer({ walletId, tokenId, destinationAddress, amount, refId }) {
  const res = await client.createTransaction({
    walletId,
    tokenId,
    destinationAddress,
    amounts: [String(amount)],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    refId: refId ?? `arcvault-${Date.now()}`,
  });
  return res.data;
}

export async function getTransaction(txId) {
  const res = await client.getTransaction({ id: txId });
  return res.data?.transaction;
}

export async function listTransactions({ walletId, pageSize = 20 } = {}) {
  const res = await client.listTransactions({
    walletIds: walletId ? [walletId] : undefined,
    pageSize,
  });
  return res.data?.transactions ?? [];
}
