'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { shortAddress } from '../lib/arc';
import { Icon, TokenBadge } from './Icons';

function findTokenBalance(balances, symbol, requiredAmount = 0) {
  const sym = String(symbol || '').toUpperCase();
  const need = Number(requiredAmount) || 0;
  const matches = balances.filter((b) => String(b.token?.symbol || '').toUpperCase() === sym);
  if (!matches.length) return null;
  return matches.find((b) => parseFloat(b.amount ?? 0) >= need)
    ?? matches.sort((a, b) => parseFloat(b.amount ?? 0) - parseFloat(a.amount ?? 0))[0];
}

function mergeBalancesForDisplay(balances = []) {
  const bySymbol = new Map();
  for (const b of balances) {
    const sym = b.token?.symbol;
    if (!sym) continue;
    const amt = parseFloat(b.amount ?? 0) || 0;
    const cur = bySymbol.get(sym);
    if (!cur) {
      bySymbol.set(sym, { ...b, amount: String(amt) });
      continue;
    }
    bySymbol.set(sym, {
      ...cur,
      amount: String(parseFloat(cur.amount) + amt),
    });
  }
  return [...bySymbol.values()];
}

export default function BalanceCard({ wallet, balances = [], personalAddress, peerWallets = [], onTx }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState(null); // 'to_savings' | 'withdraw' | 'to_treasury'
  const [token, setToken] = useState('USDC');
  const [amount, setAmount] = useState('');

  const displayBalances = mergeBalancesForDisplay(balances);
  const total = displayBalances.reduce((s, b) => s + parseFloat(b.amount ?? 0), 0);
  const isPrimary = /primary/i.test(wallet.label ?? '');
  const isSavings = /savings/i.test(wallet.label ?? '');
  const savingsWallet = peerWallets.find((w) => /savings/i.test(w.label ?? ''));
  const treasuryWallet = peerWallets.find((w) => /primary/i.test(w.label ?? ''));

  const tokenOptions = displayBalances.length
    ? [...new Set(displayBalances.map((b) => b.token?.symbol).filter(Boolean))]
    : ['USDC', 'EURC'];

  async function copyAddress() {
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function resolveTokenEntry() {
    let tokEntry = findTokenBalance(balances, token, Number(amount));
    if (!tokEntry?.token?.id) {
      const balanceResp = await api.walletBalances(wallet.id);
      tokEntry = findTokenBalance(balanceResp.balances ?? [], token, amount);
    }
    if (!tokEntry?.token?.id) throw new Error(`No ${token} balance in this wallet`);
    return tokEntry;
  }

  async function submitTransfer(destinationAddress, label) {
    if (!destinationAddress) throw new Error('Destination missing');
    setBusy(true);
    setStatus(null);
    try {
      const tokEntry = await resolveTokenEntry();
      const res = await api.transfer(wallet.id, {
        tokenId: tokEntry.token.id,
        tokenSymbol: token,
        destinationAddress,
        amount: String(amount),
        requireApproval: Number(amount) > 1000,
      });
      if (res.error) throw new Error(res.error);
      setStatus(
        res.status === 'pending_approval'
          ? 'Queued for approval (> 1000)'
          : `${label} submitted`,
      );
      setMode(null);
      setAmount('');
      onTx?.();
    } catch (err) {
      setStatus(`Failed: ${err?.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (mode === 'to_savings') {
      if (!savingsWallet?.address) return setStatus('Savings wallet missing');
      await submitTransfer(savingsWallet.address, 'Transfer to Savings');
    } else if (mode === 'withdraw') {
      if (!personalAddress) return setStatus('Connect your personal wallet first');
      await submitTransfer(personalAddress, 'Withdrawal');
    } else if (mode === 'to_treasury') {
      if (!treasuryWallet?.address) return setStatus('Treasury wallet missing');
      await submitTransfer(treasuryWallet.address, 'Transfer to Treasury');
    }
  }

  function modeLabel() {
    if (mode === 'to_savings') return 'Move to Savings';
    if (mode === 'withdraw') return 'Withdraw to Wallet';
    if (mode === 'to_treasury') return 'Move to Treasury';
    return '';
  }

  function modeHint() {
    if (mode === 'to_savings') {
      return `${shortAddress(wallet.address)} → Savings (${shortAddress(savingsWallet?.address)})`;
    }
    if (mode === 'withdraw') {
      return `${shortAddress(wallet.address)} → ${shortAddress(personalAddress)}`;
    }
    if (mode === 'to_treasury') {
      return `${shortAddress(wallet.address)} → Treasury (${shortAddress(treasuryWallet?.address)})`;
    }
    return '';
  }

  return (
    <div className="card p-5 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isPrimary ? 'bg-brand/15 text-brand' : 'bg-white/5 text-ink-300'}`}>
            <Icon.Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-ink-100">{wallet.label}</div>
            <button
              onClick={copyAddress}
              className="flex items-center gap-1.5 text-[11px] font-mono text-ink-400 hover:text-brand transition"
              title="Copy address"
            >
              {shortAddress(wallet.address)}
              {copied ? <Icon.Check className="w-3 h-3 text-good" /> : <Icon.Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <a
          href={`https://testnet.arcscan.app/address/${wallet.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="pill bg-white/5 text-ink-300 hover:text-brand hover:bg-brand/10 transition"
        >
          <span>Arcscan</span>
          <Icon.ArrowUpRight className="w-3 h-3" />
        </a>
      </div>

      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1">Total value</div>
        <div className="number text-3xl font-semibold text-ink-100">
          ${total.toFixed(2)}
        </div>
      </div>

      {displayBalances.length === 0 ? (
        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-4 text-center mb-4">
          <div className="text-xs text-ink-400 mb-2">Wallet is empty</div>
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs inline-flex items-center gap-1 text-brand hover:underline"
          >
            Fund via faucet <Icon.ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <ul className="space-y-2 mb-4">
          {displayBalances.map((b, i) => (
            <li key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2.5">
                <TokenBadge symbol={b.token?.symbol} size={28} />
                <span className="text-sm font-medium text-ink-100">{b.token?.symbol}</span>
              </div>
              <span className="number text-base font-medium text-ink-100">
                {parseFloat(b.amount).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mode === null && displayBalances.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {isPrimary && savingsWallet && (
            <button
              onClick={() => setMode('to_savings')}
              className="btn bg-brand/15 text-brand border border-brand/25 hover:bg-brand/25 px-3 py-2"
            >
              <Icon.ArrowUpRight className="w-4 h-4 rotate-90" />
              Move to Savings
            </button>
          )}
          {isSavings && personalAddress && (
            <button onClick={() => setMode('withdraw')} className="btn-ghost">
              <Icon.ArrowUpRight className="w-4 h-4 -rotate-90" />
              Withdraw to Wallet
            </button>
          )}
          {isSavings && treasuryWallet && (
            <button onClick={() => setMode('to_treasury')} className="btn-ghost">
              <Icon.ArrowUpRight className="w-4 h-4 rotate-90" />
              Move to Treasury
            </button>
          )}
        </div>
      )}

      {mode && (
        <div className="rounded-lg border border-brand/20 bg-brand/5 p-3 space-y-2 animate-fade-up">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-brand uppercase tracking-wide">
              {modeLabel()}
            </span>
            <button
              onClick={() => { setMode(null); setAmount(''); setStatus(null); }}
              className="text-ink-400 hover:text-bad p-1"
            >
              <Icon.X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-brand/40"
            >
              {tokenOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm number focus:outline-none focus:border-brand/40"
            />
          </div>

          <div className="text-[11px] text-ink-400">{modeHint()}</div>

          <button
            onClick={confirmAction}
            disabled={busy || !amount || Number(amount) <= 0}
            className="btn-primary w-full"
          >
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      )}

      {status && <div className="mt-2 text-[11px] text-ink-300">{status}</div>}
    </div>
  );
}
