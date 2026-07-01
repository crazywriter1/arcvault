// Tiered rate limits. Most critical: anything that triggers external Circle/Gemini calls.
// Keys by IP by default. Behind a proxy, configure `trust proxy` in server.js.

import rateLimit from 'express-rate-limit';

function mkLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

// Global floor — blunt defense vs. noisy bots
export const globalLimiter = mkLimiter({
  windowMs: 60_000,
  max: 200,
  message: 'too many requests',
});

const isDev = process.env.NODE_ENV !== 'production';

// Auth: nonce/verify are cheap but spammy-prone (phishers, brute attempts)
export const authLimiter = mkLimiter({
  windowMs: 60_000,
  max: isDev ? 120 : 15,
  message: 'too many auth attempts, slow down',
});

// Provisioning creates real Circle wallet sets — the expensive one to abuse.
// Tight per-IP + per-minute. First successful provision is cached in DB anyway.
export const provisionLimiter = mkLimiter({
  windowMs: 60_000,
  max: isDev ? 60 : 5,
  message: 'too many provisioning attempts',
});

// AI chat: each call hits Gemini/Groq quota.
export const chatLimiter = mkLimiter({
  windowMs: 60_000,
  max: 20,
  message: 'slow down — too many AI requests',
});

// Transfers / approvals — bot flood defense for on-chain operations.
export const txLimiter = mkLimiter({
  windowMs: 60_000,
  max: 30,
  message: 'too many transaction operations',
});
