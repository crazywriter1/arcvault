// FX rate route — exposes the cached USD/EUR oracle to the client.
// Rules consume the same service directly, so this route is purely informational.

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getFxRates, getPairRate } from '../services/fx.js';

const router = Router();

router.get('/rates', requireAuth, async (req, res) => {
  try {
    const r = await getFxRates();
    res.json(r);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/rate', requireAuth, async (req, res) => {
  const pair = req.query.pair;
  if (!pair) return res.status(400).json({ error: 'pair query param required' });
  try {
    const rate = await getPairRate(pair);
    res.json({ pair, rate });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
