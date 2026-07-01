// ArcVault backend entry point.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { db } from './db/database.js';
import walletRoutes from './routes/wallet.js';
import agentRoutes from './routes/agent.js';
import rulesRoutes from './routes/rules.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import fxRoutes from './routes/fx.js';
import bridgeRoutes from './routes/bridge.js';
import insightsRoutes from './routes/insights.js';
import { globalLimiter } from './middleware/rateLimits.js';
import * as scheduler from './engine/scheduler.js';
import { getBlockNumber } from './services/arc.js';

const app = express();
app.set('trust proxy', 1); // needed for correct IP-based rate limiting behind a reverse proxy
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use('/api/', globalLimiter);

app.get('/api/health', async (req, res) => {
  try {
    const block = await getBlockNumber();
    res.json({ status: 'ok', arc_block: block });
  } catch (err) {
    res.json({ status: 'degraded', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/fx', fxRoutes);
app.use('/api/bridge', bridgeRoutes);
app.use('/api/insights', insightsRoutes);

const isVercelRuntime = process.env.VERCEL === '1';
if (!isVercelRuntime) {
  const PORT = Number(process.env.PORT || 3001);
  app.listen(PORT, () => {
    console.log(`🚀 ArcVault backend listening on http://localhost:${PORT}`);
    console.log(`   Arc testnet: ${process.env.ARC_RPC_URL}`);
    scheduler.start();
  });
}

process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });

export default app;
