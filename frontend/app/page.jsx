'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useWallet } from '../components/WalletProvider';
import BalanceCard from '../components/BalanceCard';
import PersonalWalletCard from '../components/PersonalWalletCard';
import TransactionList from '../components/TransactionList';
import ChatInterface from '../components/ChatInterface';
import RuleList from '../components/RuleList';
import AlertBanner from '../components/AlertBanner';
import BridgeCard from '../components/BridgeCard';
import WalletConnectButton from '../components/WalletConnectButton';
import GmGnButton from '../components/GmGnButton';
import TreasuryHealthCard from '../components/TreasuryHealthCard';
import ActivityFeed from '../components/ActivityFeed';
import PayrollSimulator from '../components/PayrollSimulator';
import WhatIfSimulator from '../components/WhatIfSimulator';
import { Icon } from '../components/Icons';
import { StatCardSkeleton, WalletCardSkeleton } from '../components/Skeleton';

export default function Page() {
  const { authed, address, authenticating } = useWallet();

  if (!authed) {
    return <ConnectGate authenticating={authenticating} address={address} />;
  }
  return <Dashboard />;
}

function ConnectGate({ authenticating, address }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand to-brand-soft flex items-center justify-center shadow-glow mb-6">
          <Icon.Wallet className="w-8 h-8 text-ink-950" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-100 mb-2">
          Arc<span className="text-brand">Vault</span>
        </h1>
        <p className="text-sm text-ink-400 mb-8">
          Your personal AI treasury agent on Arc Network.
          Connect your wallet to provision your own private treasury.
        </p>
        <div className="flex justify-center">
          <WalletConnectButton />
        </div>
        {authenticating && (
          <p className="mt-4 text-xs text-ink-400">Awaiting signature in MetaMask…</p>
        )}
        {address && !authenticating && (
          <p className="mt-4 text-[11px] text-ink-500 font-mono">{address}</p>
        )}
        <div className="mt-10 text-[11px] text-ink-500 leading-relaxed">
          Each connected wallet gets its own isolated Circle wallet set with a
          Treasury Primary + Savings wallet. No one else can see or move your funds.
        </div>
      </div>
    </main>
  );
}

function Dashboard() {
  const { address } = useWallet();
  const [wallets, setWallets] = useState([]);
  const [txs, setTxs] = useState([]);
  const [rules, setRules] = useState([]);
  const [health, setHealth] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState(null);
  const [insightsKey, setInsightsKey] = useState(0);

  async function refresh() {
    try {
      const [b, t, r, h] = await Promise.all([
        api.allBalances(),
        api.listTxs(),
        api.listRules(),
        api.health(),
      ]);
      const txsRaw = t.transactions ?? [];
      const pendingSync = txsRaw
        .filter((x) => x.status === 'submitted' && x.circle_tx_id && !x.remote)
        .slice(0, 5);
      if (pendingSync.length) {
        await Promise.all(pendingSync.map((x) => api.syncTx(x.id).catch(() => null)));
      }
      const t2 = await api.listTxs();
      const nextWallets = b.wallets ?? [];
      // Keep last known wallets if a cold serverless instance briefly returns empty.
      setWallets((prev) => (nextWallets.length ? nextWallets : prev));
      setTxs((prev) => {
        const next = t2.transactions ?? txsRaw;
        return next.length ? next : prev;
      });
      setRules(r.rules ?? []);
      setHealth(h);
      setInsightsKey((k) => k + 1);
    } catch (err) {
      console.error('refresh failed:', err);
    }
  }

  useEffect(() => {
    (async () => {
      // Ensure user is provisioned (creates wallet set + 2 wallets on first call).
      setProvisioning(true);
      setProvisionError(null);
      try {
        const me = await api.me();
        if (me.error) {
          setProvisionError(me.error);
          console.error('provision:', me.error);
        }
      } catch (e) {
        setProvisionError(e.message);
        console.error('provision failed:', e);
      } finally {
        setProvisioning(false);
      }
      await api.clearChatHistory().catch(() => {});
      await refresh();
      setMounted(true);
    })();
    const iv = setInterval(refresh, 60000);
    return () => clearInterval(iv);
  }, []);

  const totalUsd = wallets.reduce((sum, w) =>
    sum + (w.balances ?? []).reduce((s, b) => s + parseFloat(b.amount ?? 0), 0), 0);
  const totalTokens = wallets.reduce((s, w) => s + (w.balances?.length ?? 0), 0);
  const pendingCount = txs.filter(t => t.status === 'pending_approval').length;
  const activeRuleCount = rules.filter(r => r.enabled).length;

  const treasury = wallets.find(w => /primary/i.test(w.wallet?.label ?? ''))?.wallet ?? wallets[0]?.wallet;
  const managedWallets = wallets.map((w) => w.wallet);

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex items-center justify-between pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-soft flex items-center justify-center shadow-glow">
            <Icon.Wallet className="w-5 h-5 text-ink-950" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink-100">
              Arc<span className="text-brand">Vault</span>
            </h1>
            <p className="text-[11px] text-ink-400">AI Treasury Agent · Arc Testnet</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`pill border ${health?.status === 'ok' ? 'bg-good/10 text-good border-good/20' : 'bg-bad/10 text-bad border-bad/20'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${health?.status === 'ok' ? 'bg-good animate-pulse-dot' : 'bg-bad'}`} />
            {health?.status === 'ok' ? 'Online' : 'Offline'}
          </span>
          {health?.arc_block && (
            <span className="pill bg-white/5 text-ink-300 number">
              block {health.arc_block.toLocaleString()}
            </span>
          )}
          <div className="ml-2">
            <WalletConnectButton />
          </div>
        </div>
      </header>

      <GmGnButton onPing={refresh} />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TreasuryHealthCard refreshKey={insightsKey} />
        <ActivityFeed refreshKey={insightsKey} />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {!mounted ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total Balance" value={`$${totalUsd.toFixed(2)}`} accent />
            <StatCard label="Wallets" value={wallets.length} sub={`${totalTokens} tokens`} />
            <StatCard label="Active Rules" value={activeRuleCount} sub={`${rules.length} total`} />
            <StatCard label="Pending" value={pendingCount} sub="approvals" highlight={pendingCount > 0 ? 'warn' : undefined} />
          </>
        )}
      </section>

      <AlertBanner />

      {provisionError && (
        <div className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          Treasury setup failed: {provisionError}. Use &quot;Setup Treasury&quot; on Personal Wallet or retry in a minute.
        </div>
      )}

      <section className="order-2 lg:order-1">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-100">Your Wallets</h2>
            <p className="text-[11px] text-ink-400">
              Personal wallet for deposits/withdrawals · Treasury and Savings can be moved manually too
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <PersonalWalletCard treasuryWallet={treasury} onTx={refresh} />
          {provisioning && (
            <>
              <div className="card p-8 text-center text-sm text-ink-400 col-span-1">
                Provisioning your treasury wallets…
              </div>
              <WalletCardSkeleton />
            </>
          )}
          {!provisioning && !mounted && (
            <>
              <WalletCardSkeleton />
              <WalletCardSkeleton />
            </>
          )}
          {wallets.map(w => (
            <BalanceCard
              key={w.wallet.id}
              wallet={w.wallet}
              balances={w.balances}
              personalAddress={address}
              peerWallets={managedWallets}
              onTx={refresh}
            />
          ))}
        </div>
      </section>

      <div className="order-1 lg:order-2 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <section className="lg:col-span-1 lg:col-start-3 lg:row-start-1 sticky top-3 z-20 self-start w-full h-[min(420px,calc(100dvh-1.5rem))] lg:h-[min(680px,calc(100dvh-2rem))]">
          <ChatInterface onActionExecuted={refresh} />
        </section>

        <section className="lg:col-span-2 lg:col-start-1 lg:row-start-1 space-y-5">
          <BridgeCard treasuryWallet={treasury} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PayrollSimulator onCreated={refresh} />
            <WhatIfSimulator />
          </div>
          <RuleList rules={rules} onChange={refresh} />
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
                  <Icon.Send className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink-100">Transactions</h2>
                  <p className="text-[11px] text-ink-400">{txs.length} total</p>
                </div>
              </div>
            </div>
            <TransactionList txs={txs.slice(0, 20)} onChange={refresh} />
          </div>
        </section>
      </div>

      <footer className="pt-6 border-t border-white/5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-[11px] text-ink-500">
        <div>ArcVault · built on Arc Network · chain ID 5042002</div>
        <div className="flex items-center gap-4">
          <a href="https://docs.arc.network" target="_blank" rel="noopener noreferrer" className="hover:text-brand transition">Arc Docs</a>
          <a href="https://developers.circle.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand transition">Circle API</a>
          <a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer" className="hover:text-brand transition">Explorer</a>
        </div>
      </footer>
    </main>
  );
}

function StatCard({ label, value, sub, accent, highlight }) {
  const color = highlight === 'warn' ? 'text-warn' : accent ? 'text-brand' : 'text-ink-100';
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">{label}</div>
      <div className={`number text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>}
    </div>
  );
}
