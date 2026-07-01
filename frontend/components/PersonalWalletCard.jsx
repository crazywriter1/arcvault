'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';
import { useWallet } from './WalletProvider';
// MetaMask label is replaced dynamically by the connected wallet's name.
import { ERC20_ABI, TOKENS, shortAddress } from '../lib/arc';
import { api } from '../lib/api';
import { Icon, TokenBadge } from './Icons';

export default function PersonalWalletCard({ treasuryWallet, onTx }) {
  const { address, isOnArc, eth, walletName } = useWallet();
  const [balances, setBalances] = useState({ USDC: '0', EURC: '0' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState(null); // 'deposit' | 'withdraw' | null
  const [token, setToken] = useState('USDC');
  const [amount, setAmount] = useState('');

  const fetchBalances = useCallback(async () => {
    if (!address || !isOnArc || !eth) return;
    const provider = new BrowserProvider(eth);
    const out = {};
    for (const t of Object.values(TOKENS)) {
      try {
        const c = new Contract(t.address, ERC20_ABI, provider);
        const raw = await c.balanceOf(address);
        out[t.symbol] = formatUnits(raw, t.decimals);
      } catch {
        out[t.symbol] = '0';
      }
    }
    setBalances(out);
  }, [address, isOnArc, eth]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setStatus('Address copied');
    setTimeout(() => setStatus(null), 1200);
  }

  async function doDeposit() {
    if (!treasuryWallet?.address) { setStatus('Treasury wallet missing'); return; }
    if (!eth) { setStatus('No wallet connected'); return; }
    setBusy(true); setStatus(null);
    try {
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const tok = TOKENS[token];
      const c = new Contract(tok.address, ERC20_ABI, signer);
      const tx = await c.transfer(treasuryWallet.address, parseUnits(amount, tok.decimals));
      setStatus(`Submitted: ${tx.hash.slice(0, 10)}…`);
      await tx.wait();
      setStatus(`Deposit confirmed`);
      setMode(null); setAmount('');
      fetchBalances();
      onTx?.();
    } catch (err) {
      setStatus(`Failed: ${err?.shortMessage || err?.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function doWithdraw() {
    if (!treasuryWallet?.id) { setStatus('Treasury wallet missing'); return; }
    setBusy(true); setStatus(null);
    try {
      // Find the Circle tokenId for the requested symbol from treasury balances.
      const balanceResp = await api.walletBalances(treasuryWallet.id);
      const tokEntry = (balanceResp.balances ?? []).find(b => b.token?.symbol === token);
      if (!tokEntry) throw new Error(`Treasury holds no ${token}`);
      const res = await api.transfer(treasuryWallet.id, {
        tokenId: tokEntry.token.id,
        tokenSymbol: token,
        destinationAddress: address,
        amount: String(amount),
        requireApproval: Number(amount) > 1000,
      });
      if (res.error) throw new Error(res.error);
      setStatus(res.status === 'pending_approval'
        ? 'Queued for approval (> 1000)'
        : `Withdrawal submitted`);
      setMode(null); setAmount('');
      onTx?.();
    } catch (err) {
      setStatus(`Failed: ${err?.message}`);
    } finally {
      setBusy(false);
    }
  }

  const totalUsd = useMemo(() =>
    parseFloat(balances.USDC || 0) + parseFloat(balances.EURC || 0),
    [balances],
  );

  if (!address) {
    return (
      <div className="card p-5 border-dashed">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-white/5 text-ink-300 flex items-center justify-center">
            <Icon.Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-ink-200">Personal Wallet</div>
            <div className="text-[11px] text-ink-400">Connect a wallet to deposit / withdraw</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-ink-400 leading-relaxed">
          Use this slot to link your own wallet. Deposits move funds to a managed Treasury wallet where the AI agent can operate autonomously.
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand to-brand-soft text-ink-950 flex items-center justify-center">
            <Icon.Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-ink-100">Personal Wallet</div>
            <button onClick={copyAddress} className="flex items-center gap-1.5 text-[11px] font-mono text-ink-400 hover:text-brand transition">
              {shortAddress(address)}
              <Icon.Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
        <span className="pill bg-brand/10 text-brand">{walletName ?? 'Wallet'}</span>
      </div>

      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1">Total value</div>
        <div className="number text-3xl font-semibold text-ink-100">${totalUsd.toFixed(2)}</div>
      </div>

      <ul className="space-y-2 mb-4">
        {Object.keys(TOKENS).map(sym => (
          <li key={sym} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-2.5">
              <TokenBadge symbol={sym} size={28} />
              <span className="text-sm font-medium text-ink-100">{sym}</span>
            </div>
            <span className="number text-base font-medium text-ink-100">
              {parseFloat(balances[sym] || 0).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      {/* Action buttons */}
      {mode === null && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMode('deposit')} disabled={!treasuryWallet} className="btn bg-brand/15 text-brand border border-brand/25 hover:bg-brand/25 px-3 py-2">
            <Icon.ArrowUpRight className="w-4 h-4 rotate-90" /> Deposit
          </button>
          <button onClick={() => setMode('withdraw')} disabled={!treasuryWallet} className="btn-ghost">
            <Icon.ArrowUpRight className="w-4 h-4 -rotate-90" /> Withdraw
          </button>
        </div>
      )}

      {mode && (
        <div className="rounded-lg border border-brand/20 bg-brand/5 p-3 space-y-2 animate-fade-up">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-brand uppercase tracking-wide">
              {mode === 'deposit' ? 'Deposit to Treasury' : `Withdraw to ${walletName ?? 'Wallet'}`}
            </span>
            <button onClick={() => { setMode(null); setAmount(''); setStatus(null); }} className="text-ink-400 hover:text-bad p-1">
              <Icon.X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={token}
              onChange={e => setToken(e.target.value)}
              className="rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-brand/40"
            >
              {Object.keys(TOKENS).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm number focus:outline-none focus:border-brand/40"
            />
          </div>

          <div className="text-[11px] text-ink-400">
            {mode === 'deposit'
              ? `From: ${shortAddress(address)} → Treasury (${shortAddress(treasuryWallet?.address)})`
              : `From: Treasury (${shortAddress(treasuryWallet?.address)}) → ${shortAddress(address)}`}
          </div>

          <button
            onClick={mode === 'deposit' ? doDeposit : doWithdraw}
            disabled={busy || !amount || Number(amount) <= 0}
            className="btn-primary w-full"
          >
            {busy ? 'Working…' : `Confirm ${mode}`}
          </button>
        </div>
      )}

      {status && <div className="mt-2 text-[11px] text-ink-300">{status}</div>}
    </div>
  );
}
