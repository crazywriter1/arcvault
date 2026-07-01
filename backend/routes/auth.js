// SIWE endpoints: client requests a nonce/message, signs it, posts back for verification.

import { Router } from 'express';
import { createNonce, verifyAndIssueToken, verifyToken } from '../services/auth.js';
import { authLimiter } from '../middleware/rateLimits.js';

const router = Router();
router.use(authLimiter);
const COOKIE_NAME = 'arcvault_session';
const isProd = process.env.NODE_ENV === 'production';
const sameSite = isProd ? 'none' : 'lax';
const cookieMaxAge = 24 * 60 * 60 * 1000;

router.post('/nonce', (req, res) => {
  const { address } = req.body ?? {};
  if (!address || typeof address !== 'string' || !address.startsWith('0x') || address.length !== 42) {
    return res.status(400).json({ error: 'valid 0x address required' });
  }
  const { nonce, message } = createNonce(address);
  res.json({ nonce, message });
});

router.post('/verify', (req, res) => {
  const { address, message, signature } = req.body ?? {};
  if (!address || !message || !signature) {
    return res.status(400).json({ error: 'address, message, signature required' });
  }
  try {
    const token = verifyAndIssueToken({ address, message, signature });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite,
      maxAge: cookieMaxAge,
      path: '/',
    });
    res.json({ ok: true, address: address.toLowerCase() });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.get('/session', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  return res.json({ address: payload.address });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: '/',
  });
  res.json({ ok: true });
});

export default router;
