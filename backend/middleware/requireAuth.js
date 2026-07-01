// Attaches `req.ownerAddress` when a valid Bearer token is present.
// Responds 401 otherwise.

import { verifyToken } from '../services/auth.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const cookieToken = req.cookies?.arcvault_session || null;
  const token = bearer || cookieToken;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.ownerAddress = payload.address;
  next();
}
