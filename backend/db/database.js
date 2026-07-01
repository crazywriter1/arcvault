// SQLite persistence via Node 22+ built-in node:sqlite. Zero native dependency.
// Multi-tenant: every user-owned row is scoped by `owner_address` (lowercased 0x hex).

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vercel serverless: only /tmp is writable; data is ephemeral between cold starts.
const dbPath = process.env.VERCEL === '1'
  ? path.join('/tmp', 'arcvault.db')
  : path.join(__dirname, 'arcvault.db');

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    owner_address TEXT NOT NULL,
    circle_wallet_id TEXT UNIQUE,
    address TEXT NOT NULL,
    blockchain TEXT NOT NULL,
    wallet_set_id TEXT,
    label TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wallets_owner ON wallets(owner_address);

  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    owner_address TEXT NOT NULL,
    label TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_config TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_config TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rules_owner ON rules(owner_address);

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    owner_address TEXT NOT NULL,
    circle_tx_id TEXT UNIQUE,
    wallet_id TEXT,
    type TEXT NOT NULL,
    token_symbol TEXT,
    amount TEXT,
    destination TEXT,
    status TEXT NOT NULL,
    tx_hash TEXT,
    rule_id TEXT,
    initiated_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_tx_owner ON transactions(owner_address);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    owner_address TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    action_json TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_owner ON chat_messages(owner_address);

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    owner_address TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_owner ON alerts(owner_address);

  CREATE TABLE IF NOT EXISTS auth_nonces (
    address TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chain_pings (
    id TEXT PRIMARY KEY,
    owner_address TEXT NOT NULL,
    kind TEXT NOT NULL,
    tx_hash TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pings_owner ON chain_pings(owner_address);
`);

export function now() { return Date.now(); }

function norm(addr) {
  if (!addr) throw new Error('owner_address required');
  return String(addr).toLowerCase();
}

// ---- wallets --------------------------------------------------------------

export function insertWallet({ id, ownerAddress, circleWalletId, address, blockchain, walletSetId, label }) {
  db.prepare(`
    INSERT OR IGNORE INTO wallets (id, owner_address, circle_wallet_id, address, blockchain, wallet_set_id, label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, norm(ownerAddress), circleWalletId, address, blockchain, walletSetId ?? null, label ?? null, now());
}

export function getWallets(ownerAddress) {
  return db.prepare(`SELECT * FROM wallets WHERE owner_address = ? ORDER BY created_at ASC`)
    .all(norm(ownerAddress));
}

export function getAllWalletsAcrossOwners() {
  // For scheduler only — iterates every tenant.
  return db.prepare(`SELECT * FROM wallets ORDER BY owner_address, created_at ASC`).all();
}

export function getDistinctOwners() {
  return db.prepare(`SELECT DISTINCT owner_address FROM wallets`).all().map(r => r.owner_address);
}

// ---- rules ----------------------------------------------------------------

export function insertRule(rule) {
  db.prepare(`
    INSERT INTO rules (id, owner_address, label, trigger_type, trigger_config, action_type, action_config, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rule.id, norm(rule.owner_address), rule.label, rule.trigger_type,
    JSON.stringify(rule.trigger_config),
    rule.action_type,
    JSON.stringify(rule.action_config),
    rule.enabled ? 1 : 0,
    now(),
  );
}

export function getRules(ownerAddress, { enabledOnly = false } = {}) {
  const sql = enabledOnly
    ? `SELECT * FROM rules WHERE owner_address = ? AND enabled = 1 ORDER BY created_at DESC`
    : `SELECT * FROM rules WHERE owner_address = ? ORDER BY created_at DESC`;
  return db.prepare(sql).all(norm(ownerAddress)).map(parseRule);
}

export function getAllActiveRulesAcrossOwners() {
  return db.prepare(`SELECT * FROM rules WHERE enabled = 1`).all().map(parseRule);
}

export function updateRuleLastRun(id) {
  db.prepare(`UPDATE rules SET last_run = ? WHERE id = ?`).run(now(), id);
}

export function deleteRule(id, ownerAddress) {
  db.prepare(`DELETE FROM rules WHERE id = ? AND owner_address = ?`).run(id, norm(ownerAddress));
}

function parseRule(row) {
  return {
    ...row,
    trigger_config: JSON.parse(row.trigger_config),
    action_config: JSON.parse(row.action_config),
    enabled: !!row.enabled,
  };
}

// ---- transactions ---------------------------------------------------------

export function insertTransaction(tx) {
  db.prepare(`
    INSERT INTO transactions
      (id, owner_address, circle_tx_id, wallet_id, type, token_symbol, amount, destination, status, tx_hash, rule_id, initiated_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tx.id, norm(tx.owner_address), tx.circle_tx_id ?? null, tx.wallet_id ?? null,
    tx.type, tx.token_symbol ?? null, String(tx.amount ?? ''),
    tx.destination ?? null, tx.status,
    tx.tx_hash ?? null, tx.rule_id ?? null,
    tx.initiated_by, now(),
  );
}

export function updateTransactionStatus(id, status, { tx_hash, circle_tx_id } = {}) {
  const confirmed = status === 'confirmed' ? now() : null;
  db.prepare(`
    UPDATE transactions
    SET status = ?,
        tx_hash = COALESCE(?, tx_hash),
        circle_tx_id = COALESCE(?, circle_tx_id),
        confirmed_at = COALESCE(?, confirmed_at)
    WHERE id = ?
  `).run(status, tx_hash ?? null, circle_tx_id ?? null, confirmed, id);
}

export function getTransactions(ownerAddress, { limit = 50 } = {}) {
  return db.prepare(`SELECT * FROM transactions WHERE owner_address = ? ORDER BY created_at DESC LIMIT ?`)
    .all(norm(ownerAddress), limit);
}

export function getTransaction(id, ownerAddress) {
  return db.prepare(`SELECT * FROM transactions WHERE id = ? AND owner_address = ?`)
    .get(id, norm(ownerAddress));
}

// ---- chat -----------------------------------------------------------------

export function insertChatMessage({ id, ownerAddress, role, content, action_json }) {
  db.prepare(`
    INSERT INTO chat_messages (id, owner_address, role, content, action_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, norm(ownerAddress), role, content, action_json ? JSON.stringify(action_json) : null, now());
}

export function getChatHistory(ownerAddress, limit = 50) {
  return db.prepare(`
    SELECT * FROM chat_messages WHERE owner_address = ? ORDER BY created_at DESC LIMIT ?
  `).all(norm(ownerAddress), limit).reverse();
}

export function clearChatHistory(ownerAddress) {
  return db.prepare(`DELETE FROM chat_messages WHERE owner_address = ?`).run(norm(ownerAddress)).changes;
}

// ---- alerts ---------------------------------------------------------------

export function insertAlert({ id, ownerAddress, level, message }) {
  db.prepare(`
    INSERT INTO alerts (id, owner_address, level, message, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(id, norm(ownerAddress), level, message, now());
}

export function getAlerts(ownerAddress, { unreadOnly = false, limit = 50 } = {}) {
  const where = unreadOnly ? `AND read = 0` : '';
  return db.prepare(`SELECT * FROM alerts WHERE owner_address = ? ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(norm(ownerAddress), limit);
}

export function markAlertsRead(ownerAddress) {
  db.prepare(`UPDATE alerts SET read = 1 WHERE read = 0 AND owner_address = ?`).run(norm(ownerAddress));
}

// ---- auth nonces (ephemeral, consumed on verify) --------------------------

export function putNonce(address, nonce, ttlMs = 5 * 60 * 1000) {
  const expiresAt = now() + ttlMs;
  db.prepare(`
    INSERT INTO auth_nonces (address, nonce, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET nonce = excluded.nonce, expires_at = excluded.expires_at
  `).run(norm(address), nonce, expiresAt);
}

export function consumeNonce(address) {
  const row = db.prepare(`SELECT nonce, expires_at FROM auth_nonces WHERE address = ?`).get(norm(address));
  db.prepare(`DELETE FROM auth_nonces WHERE address = ?`).run(norm(address));
  if (!row) return null;
  if (row.expires_at < now()) return null;
  return row.nonce;
}

// ---- on-chain pings (GM/GN) -----------------------------------------------

export function insertChainPing({ id, ownerAddress, kind, txHash }) {
  db.prepare(`
    INSERT INTO chain_pings (id, owner_address, kind, tx_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, norm(ownerAddress), kind, txHash ?? null, now());
}

export function getChainPings(ownerAddress, { limit = 30 } = {}) {
  return db.prepare(`
    SELECT * FROM chain_pings WHERE owner_address = ? ORDER BY created_at DESC LIMIT ?
  `).all(norm(ownerAddress), limit);
}
