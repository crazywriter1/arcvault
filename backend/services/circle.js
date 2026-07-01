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

export async function getBalances(walletId) {
  const res = await client.getWalletTokenBalance({ id: walletId });
  return res.data?.tokenBalances ?? [];
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
