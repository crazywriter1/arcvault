// CCTP bridge route — burn-spec lookup + iris attestation proxy.
// State for in-flight bridges lives in the client (localStorage). Backend is stateless.

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { txLimiter } from '../middleware/rateLimits.js';
import { getBurnSpec, fetchAttestation, CCTP_DOMAINS, CCTP_CONTRACTS } from '../services/cctp.js';

const router = Router();

router.use(requireAuth);

// Static reference data: which chains we know about, their domains, and contracts.
router.get('/chains', (req, res) => {
  res.json({
    domains: CCTP_DOMAINS,
    contracts: CCTP_CONTRACTS,
  });
});

// Returns the burn spec the frontend needs to hand to the user's source-chain wallet.
router.post('/spec', txLimiter, (req, res) => {
  const { fromChain, toChain } = req.body ?? {};
  try {
    const spec = getBurnSpec({ fromChain, toChain });
    res.json(spec);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Proxy Circle's iris attestation API. Frontend polls this with the messageHash
// emitted by the source-chain TokenMessenger.depositForBurn.
router.get('/attestation/:messageHash', async (req, res) => {
  try {
    const r = await fetchAttestation(req.params.messageHash);
    res.json(r);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
