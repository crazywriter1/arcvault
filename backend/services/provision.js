// Ensure managed wallets exist — local SQLite + Circle recovery (Vercel serverless safe).

import { v4 as uuid } from 'uuid';
import { getWallets, insertWallet } from '../db/database.js';
import {
  createWalletSet, createWallets, listWalletSets, listWallets,
  ARC_BLOCKCHAIN,
} from './circle.js';

const provisioningLocks = new Map();

function walletSetNameFor(ownerAddress) {
  return `arcvault-${ownerAddress.toLowerCase()}`;
}

function ownerTag(ownerAddress) {
  return ownerAddress.slice(2, 10).toLowerCase();
}

async function recoverWalletsFromCircle(ownerAddress) {
  const sets = await listWalletSets();
  const tag = ownerTag(ownerAddress);
  const deterministic = walletSetNameFor(ownerAddress);
  const candidates = sets.filter((s) => {
    const n = String(s.name || '').toLowerCase();
    return n === deterministic || n.includes(tag);
  });
  if (!candidates.length) return [];

  const match = candidates.find((s) => s.name === deterministic)
    ?? candidates.sort((a, b) => new Date(b.createDate || 0) - new Date(a.createDate || 0))[0];

  const circleWallets = await listWallets({ walletSetId: match.id });
  if (!circleWallets.length) return [];

  const labels = ['Treasury Primary', 'Savings'];
  circleWallets.slice(0, 2).forEach((w, i) => {
    insertWallet({
      id: uuid(),
      ownerAddress,
      circleWalletId: w.id,
      address: w.address,
      blockchain: ARC_BLOCKCHAIN,
      walletSetId: match.id,
      label: labels[i] ?? `Wallet ${i + 1}`,
    });
  });

  return getWallets(ownerAddress);
}

async function createFreshWallets(ownerAddress) {
  const setName = walletSetNameFor(ownerAddress);
  const sets = await listWalletSets();
  let walletSet = sets.find((s) => s.name === setName);

  if (!walletSet) {
    walletSet = await createWalletSet(setName);
  }
  if (!walletSet?.id) throw new Error('Circle wallet set creation failed');

  let circleWallets = await listWallets({ walletSetId: walletSet.id });
  if (circleWallets.length < 2) {
    const created = await createWallets({
      walletSetId: walletSet.id,
      count: 2 - circleWallets.length,
      accountType: 'EOA',
    });
    circleWallets = [...circleWallets, ...created];
  }
  if (circleWallets.length < 2) throw new Error('Expected 2 wallets from Circle');

  const labels = ['Treasury Primary', 'Savings'];
  circleWallets.slice(0, 2).forEach((w, i) => {
    insertWallet({
      id: uuid(),
      ownerAddress,
      circleWalletId: w.id,
      address: w.address,
      blockchain: ARC_BLOCKCHAIN,
      walletSetId: walletSet.id,
      label: labels[i] ?? `Wallet ${i + 1}`,
    });
  });

  return getWallets(ownerAddress);
}

export async function ensureWallets(ownerAddress) {
  let wallets = getWallets(ownerAddress);
  if (wallets.length >= 2) return wallets;

  if (provisioningLocks.has(ownerAddress)) {
    return provisioningLocks.get(ownerAddress);
  }

  const p = (async () => {
    wallets = getWallets(ownerAddress);
    if (wallets.length >= 2) return wallets;

    wallets = await recoverWalletsFromCircle(ownerAddress);
    if (wallets.length >= 2) return wallets;

    return createFreshWallets(ownerAddress);
  })().finally(() => provisioningLocks.delete(ownerAddress));

  provisioningLocks.set(ownerAddress, p);
  return p;
}
