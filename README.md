# ArcVault — AI Treasury Agent

An autonomous AI assistant that manages an SMB's stablecoin treasury on Arc Network through natural-language commands.

## Architecture

```
┌─────────────────────────────────┐
│  Frontend (Next.js :3000)       │
│  Dashboard · Chat · RuleBuilder │
└─────────────┬───────────────────┘
              │ /api/* (rewrite)
┌─────────────▼───────────────────┐
│  Backend (Express :3001)        │
│  ├─ routes/        REST API     │
│  ├─ services/                   │
│  │   ├─ circle.js  Prog Wallets │
│  │   ├─ arc.js     ethers RPC   │
│  │   └─ ai.js      Gemini/Groq  │
│  ├─ engine/                     │
│  │   ├─ ruleEngine.js           │
│  │   └─ scheduler.js (cron)     │
│  └─ db/  SQLite (node:sqlite)   │
└─────────────┬───────────────────┘
              │
   ┌──────────┴──────────┐
   ▼                     ▼
Circle API         Arc Testnet RPC
(wallets, txs)     (chain reads)
```

## Setup

### 0. WSL + Line Endings (recommended before first commit)

To avoid CRLF/LF noise when working from WSL and pushing to GitHub:

```bash
git config --global core.autocrlf input
git config --global core.eol lf
```

This repository also includes `.gitattributes` and `.editorconfig` so source files are normalized as LF.

### 1. API Keys

`backend/.env`:
```
CIRCLE_API_KEY=TEST_API_KEY:...
CIRCLE_ENTITY_SECRET=           # Auto-filled by init-entity
AI_PROVIDER=gemini              # or "groq"
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
SESSION_SECRET=change_me_very_long_random_secret
SIWE_DOMAIN=arcvault.local
CORS_ORIGINS=http://localhost:3000
PORT=3001
```

### 2. Backend

```bash
cd backend
npm install
npm run init-entity    # Generate + register Entity Secret (once)
npm run init-wallet    # Create Treasury + Savings wallets
npm run dev            # Runs on :3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # Runs on :3000
```

Frontend env (optional for separate backend host):

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

### 4. Fund the Wallets

Copy the Treasury address from the dashboard →
[faucet.circle.com](https://faucet.circle.com) → select Arc Testnet → request test USDC.

## Example Chat Commands

- "Show me the balance of all my wallets"
- "Transfer 50 USDC from Treasury to Savings"
- "Alert me if Treasury USDC drops below 100"
- "Every Friday at 09:00, move 200 USDC to Savings"
- "Generate a 30-day cashflow report"

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server + Arc block status |
| GET | `/api/wallet/` | List wallets |
| GET | `/api/wallet/balances/all` | All balances |
| POST | `/api/wallet/:id/transfer` | Initiate transfer |
| POST | `/api/wallet/tx/:id/approve` | Approve pending tx |
| GET | `/api/rules/` | List rules |
| POST | `/api/rules/` | Create rule |
| POST | `/api/rules/evaluate` | Evaluate rules now |
| POST | `/api/agent/chat` | Send command to AI |
| POST | `/api/agent/execute` | Execute parsed action |
| GET | `/api/agent/alerts` | System alerts |

## Security Notes

- `.env` is gitignored — never commit it.
- Auth now uses an `httpOnly` session cookie (instead of storing bearer tokens in `sessionStorage`).
- CORS is origin-restricted via `CORS_ORIGINS` (comma-separated allowlist).
- In production, session cookies are sent as `Secure; SameSite=None` for cross-origin frontend/backend deployments.
- `backend/output/recovery_file.dat` is the Circle Entity Secret recovery file. Back it up securely.
- Any transfer > 1000 USDC/EURC is automatically queued as `pending_approval` and is NOT executed without user confirmation.
- The rule engine only runs with a `TEST_API_KEY`. Review all thresholds before switching to a production key.

## Roadmap

- **CCTP Bridge** — Ethereum Sepolia → Arc USDC via `@circle-fin/cctp-sdk`
- **Telegram bot** — instant push for critical alerts
- **FX Oracle** — real-time StableFX quote fetching + rate-based rule triggers
- **Multi-tenant** — wallet-set isolation for multiple businesses
