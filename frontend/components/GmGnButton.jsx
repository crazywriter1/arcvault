'use client';

// Tiny on-chain ping via MetaMask — counts as a real Arc testnet tx.
import { useEffect, useState } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { useWallet } from './WalletProvider';
import { ERC20_ABI, TOKENS } from '../lib/arc';
import { api } from '../lib/api';
import { loadStreak, recordStreakPing } from '../lib/streak';

// 0.000001 token units (6 decimals) — self-transfer.
const PING = 1n;

async function selfPing(eth, address, token) {
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const c = new Contract(token.address, ERC20_ABI, signer);
  const tx = await c.transfer(address, PING);
  const receipt = await tx.wait();
  return receipt?.hash || tx.hash;
}

export default function GmGnButton({ onPing }) {
  const { address, eth, isOnArc, switchToArc } = useWallet();
  const [busy, setBusy] = useState(null);
  const [hint, setHint] = useState(null);
  const [streak, setStreak] = useState({ streak: 0, pingedToday: false });

  useEffect(() => {
    setStreak(loadStreak());
  }, []);

  async function ping(kind) {
    if (!eth || !address) return;
    setBusy(kind);
    setHint(null);
    try {
      if (!isOnArc) await switchToArc();
      const primary = kind === 'gn' ? TOKENS.EURC : TOKENS.USDC;
      setHint('Confirm in wallet…');
      let txHash;
      try {
        txHash = await selfPing(eth, address, primary);
        setHint(`${kind.toUpperCase()} ✓`);
      } catch (err) {
        if (kind === 'gn' && primary.symbol === 'EURC') {
          txHash = await selfPing(eth, address, TOKENS.USDC);
          setHint('GN ✓ (USDC)');
        } else {
          throw err;
        }
      }
      const next = recordStreakPing();
      setStreak(next);
      api.logPing({ kind, tx_hash: txHash }).catch(() => {});
      onPing?.();
    } catch (err) {
      setHint(err?.shortMessage || err?.message || 'Failed');
    } finally {
      setBusy(null);
      setTimeout(() => setHint(null), 3500);
    }
  }

  const base = 'rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition disabled:opacity-40';

  return (
    <div
      className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-ink-900/60 border border-white/10 backdrop-blur-sm"
      title="Sign a tiny self-transfer on Arc testnet (MetaMask)"
    >
      {streak.streak > 0 && (
        <span
          className="pill bg-warn/15 text-warn border border-warn/25 text-[10px] px-2"
          title={streak.pingedToday ? 'Pinged today' : 'GM streak'}
        >
          🔥 {streak.streak}d
        </span>
      )}
      <button
        type="button"
        className={`${base} bg-warn/15 text-warn border-warn/30 hover:bg-warn/25`}
        disabled={!!busy || !address}
        onClick={() => ping('gm')}
      >
        {busy === 'gm' ? '…' : '☀️ GM'}
      </button>
      <button
        type="button"
        className={`${base} bg-brand/15 text-brand border-brand/30 hover:bg-brand/25`}
        disabled={!!busy || !address}
        onClick={() => ping('gn')}
      >
        {busy === 'gn' ? '…' : '🌙 GN'}
      </button>
      {hint && (
        <span className="text-[10px] text-ink-300 px-1 max-w-[90px] truncate" title={hint}>
          {hint}
        </span>
      )}
    </div>
  );
}