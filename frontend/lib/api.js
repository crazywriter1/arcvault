// Thin client for backend API. Auth uses httpOnly cookie sessions.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
function withBase(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

async function j(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text }; }
}

function req(path, opts = {}) {
  const headers = opts.headers || {};
  return fetch(withBase(path), { ...opts, headers, credentials: 'include' }).then(j);
}

function jsonReq(path, method, body) {
  return req(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const api = {
  // public
  health: () => fetch(withBase('/api/health'), { credentials: 'include' }).then(j),
  nonce: (address) => fetch(withBase('/api/auth/nonce'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ address }),
  }).then(j),
  verify: (body) => fetch(withBase('/api/auth/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }).then(j),
  session: () => req('/api/auth/session'),
  logout: () => jsonReq('/api/auth/logout', 'POST'),

  // user (requires auth)
  me: () => req('/api/user/me'),
  provision: () => jsonReq('/api/user/provision', 'POST'),

  // wallets (auth)
  listWallets: () => req('/api/wallet/'),
  walletBalances: (walletId) => req(`/api/wallet/${walletId}/balances`),
  allBalances: () => req('/api/wallet/balances/all'),
  transfer: (walletId, body) => jsonReq(`/api/wallet/${walletId}/transfer`, 'POST', body),
  listTxs: () => req('/api/wallet/tx/list'),
  approveTx: (txId) => jsonReq(`/api/wallet/tx/${txId}/approve`, 'POST'),
  rejectTx: (txId) => jsonReq(`/api/wallet/tx/${txId}/reject`, 'POST'),
  syncTx: (txId) => jsonReq(`/api/wallet/tx/${txId}/sync`, 'POST'),

  // rules (auth)
  listRules: () => req('/api/rules/'),
  createRule: (body) => jsonReq('/api/rules/', 'POST', body),
  deleteRule: (id) => jsonReq(`/api/rules/${id}`, 'DELETE'),
  evaluateRules: () => jsonReq('/api/rules/evaluate', 'POST'),

  // agent (auth)
  chat: (message) => jsonReq('/api/agent/chat', 'POST', { message }),
  execute: (action) => jsonReq('/api/agent/execute', 'POST', { action }),
  chatHistory: () => req('/api/agent/history'),
  clearChatHistory: () => jsonReq('/api/agent/history', 'DELETE'),
  alerts: () => req('/api/agent/alerts'),
  markAlertsRead: () => jsonReq('/api/agent/alerts/read', 'POST'),

  // fx (auth)
  fxRates: () => req('/api/fx/rates'),
  fxRate: (pair) => req(`/api/fx/rate?pair=${encodeURIComponent(pair)}`),

  // bridge (auth)
  bridgeChains: () => req('/api/bridge/chains'),
  bridgeSpec: (body) => jsonReq('/api/bridge/spec', 'POST', body),
  bridgeAttestation: (messageHash) => req(`/api/bridge/attestation/${messageHash}`),

  // insights (auth)
  treasuryHealth: () => req('/api/insights/health'),
  activityFeed: () => req('/api/insights/activity'),
  logPing: (body) => jsonReq('/api/insights/ping', 'POST', body),
  whatIf: (body) => jsonReq('/api/insights/whatif', 'POST', body),
  setupPayroll: (body) => jsonReq('/api/insights/presets/payroll', 'POST', body),
};
