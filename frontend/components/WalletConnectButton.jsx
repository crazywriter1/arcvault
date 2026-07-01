'use client';

import { useEffect, useState } from 'react';
import { useWallet } from './WalletProvider';
import { shortAddress } from '../lib/arc';
import { Icon } from './Icons';

export default function WalletConnectButton() {
  const { address, connecting, error, isOnArc, connect, disconnect, switchToArc, walletName } = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <button disabled className="btn-primary opacity-60">
        <Icon.Wallet className="w-4 h-4" />
        Connect Wallet
      </button>
    );
  }

  if (!address) {
    return (
      <button onClick={connect} disabled={connecting} className="btn-primary">
        <Icon.Wallet className="w-4 h-4" />
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }

  if (!isOnArc) {
    return (
      <button onClick={switchToArc} className="btn bg-warn/15 text-warn border border-warn/25 hover:bg-warn/25 px-3 py-1.5 text-sm">
        <Icon.Zap className="w-4 h-4" />
        Switch to Arc
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="pill bg-white/5 text-ink-200 number border border-white/10" title={walletName ?? ''}>
        <span className="w-1.5 h-1.5 rounded-full bg-good animate-pulse-dot" />
        {shortAddress(address)}
      </span>
      <button onClick={disconnect} className="text-ink-400 hover:text-bad transition p-1" title="Disconnect">
        <Icon.X className="w-4 h-4" />
      </button>
      {error && <span className="text-[11px] text-bad">{error}</span>}
    </div>
  );
}
