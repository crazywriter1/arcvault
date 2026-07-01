'use client';

// Modal that lists every EIP-6963 wallet the browser has injected.
// The user picks one, and we return that provider to the caller (WalletProvider).

import { useWalletProviders } from '../lib/walletProviders';
import { Icon } from './Icons';

export default function WalletPicker({ open, onClose, onPick }) {
  const providers = useWalletProviders();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm p-5 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-100">Connect a wallet</h3>
            <p className="text-[11px] text-ink-400">Pick any installed wallet</p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-bad p-1">
            <Icon.X className="w-4 h-4" />
          </button>
        </div>

        {providers.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-sm text-ink-300 mb-1">No EVM wallets detected</div>
            <p className="text-[11px] text-ink-400">Install one from the options below.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {providers.map(p => (
              <li key={p.info.uuid}>
                <button
                  onClick={() => onPick(p)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-brand/30 transition text-left"
                >
                  {p.info.icon ? (
                    <img src={p.info.icon} alt="" className="w-8 h-8 rounded" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-brand/15 text-brand flex items-center justify-center">
                      <Icon.Wallet className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-100 truncate">{p.info.name}</div>
                    <div className="text-[11px] text-ink-400 truncate">{p.info.rdns}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 pt-3 border-t border-white/5">
          <div className="text-[11px] text-ink-400 mb-2">Don't see your wallet?</div>
          <div className="grid grid-cols-2 gap-2">
            <WalletInstallLink name="MetaMask" href="https://metamask.io/download/" />
            <WalletInstallLink name="Coinbase" href="https://www.coinbase.com/wallet/downloads" />
            <WalletInstallLink name="Rabby" href="https://rabby.io/" />
            <WalletInstallLink name="Trust" href="https://trustwallet.com/download" />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-ink-500 leading-relaxed">
          ArcVault never sees your private key. You only sign a message to prove ownership.
          All signing happens inside your wallet extension.
        </div>
      </div>
    </div>
  );
}

function WalletInstallLink({ name, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-1 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-brand/30 hover:bg-white/[0.05] transition text-xs text-ink-200"
    >
      <span>{name}</span>
      <Icon.ArrowUpRight className="w-3 h-3 text-ink-400" />
    </a>
  );
}
