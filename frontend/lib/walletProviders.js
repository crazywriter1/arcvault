// EIP-6963: Multi Injected Provider Discovery.
// Wallets announce themselves via the `eip6963:announceProvider` event.
// This lets us support any browser wallet (MetaMask, Coinbase, Rabby, Trust, Brave, etc.)
// without bundling any wallet-specific SDK.
//
// Security note: each provider exposes only a standard EIP-1193 request() method.
// Private keys never leave the wallet's sandboxed extension process.

'use client';

import { useEffect, useState } from 'react';

// Known non-EVM wallets that still announce via EIP-6963 but can't sign on Arc.
// Match by rdns (reverse-DNS identifier) or name substring.
const NON_EVM_RDNS = [
  'com.pontem',      // Pontem — Aptos/Sui
  'xyz.pontem',
  'io.pontem',
];
const NON_EVM_NAME_HINTS = ['pontem'];

function isEvmCompatible(info) {
  const rdns = (info?.rdns || '').toLowerCase();
  const name = (info?.name || '').toLowerCase();
  if (NON_EVM_RDNS.some(x => rdns === x || rdns.startsWith(x + '.'))) return false;
  if (NON_EVM_NAME_HINTS.some(x => name.includes(x))) return false;
  return true;
}

// Hook that returns the list of discovered EIP-6963 providers (EVM-compatible only).
export function useWalletProviders() {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const byUuid = new Map();

    const onAnnounce = (event) => {
      const detail = event.detail;
      if (!detail?.info?.uuid || !detail?.provider) return;
      if (!isEvmCompatible(detail.info)) return;
      byUuid.set(detail.info.uuid, detail);
      setProviders(Array.from(byUuid.values()));
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    // Ask any wallets that loaded before us to re-announce.
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Legacy fallback: some wallets only expose window.ethereum without EIP-6963.
    // Add it as a last-resort entry if nothing is announced shortly.
    const legacyTimer = setTimeout(() => {
      if (byUuid.size === 0 && window.ethereum) {
        byUuid.set('legacy-injected', {
          info: {
            uuid: 'legacy-injected',
            name: window.ethereum.isMetaMask ? 'MetaMask' : 'Injected Wallet',
            icon: '',
            rdns: 'legacy.injected',
          },
          provider: window.ethereum,
        });
        setProviders(Array.from(byUuid.values()));
      }
    }, 300);

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      clearTimeout(legacyTimer);
    };
  }, []);

  return providers;
}
