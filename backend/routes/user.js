// Per-user provisioning. First authenticated call returns the user's managed wallets;
// if none exist yet, a dedicated Circle wallet set + 2 wallets are created on the fly.

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../middleware/requireAuth.js';
import { provisionLimiter } from '../middleware/rateLimits.js';
import { getWallets, insertWallet } from '../db/database.js';
import {
  createWalletSet, createWallets,
  ARC_BLOCKCHAIN,
} from '../services/circle.js';

const router = Router();

// Simple in-memory guard against concurrent provisioning for the same owner.
const provisioningLocks = new Map();

async function provisionFor(ownerAddress) {
  if (provisioningLocks.has(ownerAddress)) {
    return provisioningLocks.get(ownerAddress);
  }
  const p = (async () => {
    // Strategy B: one Circle wallet set per user for clean isolation.
    const setName = `arcvault-${ownerAddress.slice(2, 10)}-${Date.now()}`;
    const walletSet = await createWalletSet(setName);
    if (!walletSet?.id) throw new Error('Circle wallet set creation failed');

    const created = await createWallets({
      walletSetId: walletSet.id,
      count: 2,
      accountType: 'EOA',
    });
    if (created.length < 2) throw new Error('Expected 2 wallets from Circle');

    const labels = ['Treasury Primary', 'Savings'];
    const rows = [];
    created.forEach((w, i) => {
      const row = {
        id: uuid(),
        ownerAddress,
        circleWalletId: w.id,
        address: w.address,
        blockchain: ARC_BLOCKCHAIN,
        walletSetId: walletSet.id,
        label: labels[i] ?? `Wallet ${i + 1}`,
      };
      insertWallet(row);
      rows.push(row);
    });
    return rows;
  })().finally(() => provisioningLocks.delete(ownerAddress));
  provisioningLocks.set(ownerAddress, p);
  return p;
}

// Returns the user's wallets, provisioning on first call.
router.get('/me', provisionLimiter, requireAuth, async (req, res) => {
  try {
    let wallets = getWallets(req.ownerAddress);
    if (wallets.length === 0) {
      await provisionFor(req.ownerAddress);
      wallets = getWallets(req.ownerAddress);
    }
    res.json({ address: req.ownerAddress, wallets });
  } catch (err) {
    console.error('provision error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Explicit re-trigger (idempotent: returns existing if already provisioned).
router.post('/provision', provisionLimiter, requireAuth, async (req, res) => {
  try {
    let wallets = getWallets(req.ownerAddress);
    if (wallets.length === 0) {
      await provisionFor(req.ownerAddress);
      wallets = getWallets(req.ownerAddress);
    }
    res.json({ address: req.ownerAddress, wallets, provisioned: true });
  } catch (err) {
    console.error('provision error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
