// Per-user provisioning. First authenticated call returns the user's managed wallets;
// if none exist yet, a dedicated Circle wallet set + 2 wallets are created on the fly.

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { provisionLimiter } from '../middleware/rateLimits.js';
import { getWallets } from '../db/database.js';
import { ensureWallets } from '../services/provision.js';

const router = Router();

router.get('/me', provisionLimiter, requireAuth, async (req, res) => {
  try {
    const wallets = await ensureWallets(req.ownerAddress);
    res.json({ address: req.ownerAddress, wallets });
  } catch (err) {
    console.error('provision error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/provision', provisionLimiter, requireAuth, async (req, res) => {
  try {
    const wallets = await ensureWallets(req.ownerAddress);
    res.json({ address: req.ownerAddress, wallets, provisioned: true });
  } catch (err) {
    console.error('provision error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
