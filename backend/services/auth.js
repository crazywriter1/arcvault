// SIWE-style auth: user signs a message with their wallet, backend verifies & issues a session token.
// Token is an HMAC-signed compact string: base64url(payload).base64url(hmac)
// No external JWT dep needed — Node crypto suffices.

import crypto from 'node:crypto';
import { verifyMessage } from 'ethers';
import { putNonce, consumeNonce } from '../db/database.js';

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error('SESSION_SECRET missing in .env');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_DOMAIN = process.env.SIWE_DOMAIN || 'arcvault.local';
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID || 5042002);

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function hmac(input) {
  return crypto.createHmac('sha256', SECRET).update(input).digest();
}

export function buildSiweMessage({ address, nonce, domain = DEFAULT_DOMAIN }) {
  const issuedAt = new Date().toISOString();
  return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to ArcVault. This signature will not trigger a blockchain transaction or cost any gas.

URI: https://${domain}
Version: 1
Chain ID: ${CHAIN_ID}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

export function createNonce(address) {
  const nonce = crypto.randomBytes(16).toString('hex');
  putNonce(address, nonce);
  const message = buildSiweMessage({ address, nonce });
  return { nonce, message };
}

export function verifyAndIssueToken({ address, message, signature }) {
  const addr = String(address || '').toLowerCase();
  if (!addr.startsWith('0x') || addr.length !== 42) throw new Error('invalid address');
  const siwe = parseAndValidateSiweMessage(message, addr);
  const storedNonce = consumeNonce(addr);
  if (!storedNonce) throw new Error('nonce expired or unknown');
  if (storedNonce !== siwe.nonce) throw new Error('nonce mismatch');

  // Recover signer from signature
  let recovered;
  try {
    recovered = verifyMessage(message, signature).toLowerCase();
  } catch (e) {
    throw new Error(`signature verify failed: ${e.message}`);
  }
  if (recovered !== addr) throw new Error('signature does not match address');

  return signToken(addr);
}

function parseAndValidateSiweMessage(message, expectedAddress) {
  if (!message || typeof message !== 'string') throw new Error('invalid SIWE message');
  const lines = message.split('\n');
  if (lines.length < 9) throw new Error('malformed SIWE message');

  const firstLine = lines[0] || '';
  const firstLineMatch = /^(.+?) wants you to sign in with your Ethereum account:$/.exec(firstLine);
  if (!firstLineMatch) throw new Error('SIWE domain line invalid');
  const domain = firstLineMatch[1].trim();
  if (domain !== DEFAULT_DOMAIN) throw new Error('SIWE domain mismatch');

  const addressLine = (lines[1] || '').trim().toLowerCase();
  if (!addressLine || addressLine !== expectedAddress) throw new Error('SIWE address mismatch');

  const statement = (lines[3] || '').trim();
  if (
    statement !==
    'Sign in to ArcVault. This signature will not trigger a blockchain transaction or cost any gas.'
  ) {
    throw new Error('SIWE statement mismatch');
  }

  const fields = {};
  for (const line of lines.slice(5)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key] = value;
  }

  if (fields.URI !== `https://${DEFAULT_DOMAIN}`) throw new Error('SIWE URI mismatch');
  if (fields.Version !== '1') throw new Error('SIWE version mismatch');
  if (Number(fields['Chain ID']) !== CHAIN_ID) throw new Error('SIWE chain mismatch');
  if (!/^[a-f0-9]{32}$/i.test(fields.Nonce || '')) throw new Error('SIWE nonce invalid');

  const issuedAt = Date.parse(fields['Issued At'] || '');
  if (!Number.isFinite(issuedAt)) throw new Error('SIWE issuedAt invalid');
  const now = Date.now();
  if (Math.abs(now - issuedAt) > 10 * 60 * 1000) throw new Error('SIWE issuedAt outside allowed window');

  return {
    domain,
    nonce: fields.Nonce.toLowerCase(),
  };
}

export function signToken(address) {
  const payload = { sub: address.toLowerCase(), exp: Date.now() + TOKEN_TTL_MS };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(payloadB64));
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = b64url(hmac(payloadB64));
  // Constant-time compare
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch { return null; }
  if (!payload.sub || !payload.exp) return null;
  if (payload.exp < Date.now()) return null;
  return { address: payload.sub };
}
