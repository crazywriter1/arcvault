'use client';

// Wallet + SIWE auth context. Supports any EIP-6963 provider (MetaMask, Coinbase,
// Rabby, Trust, Brave, etc.) via an explicit picker. The picked provider drives
// every subsequent action — we never touch window.ethereum directly after selection.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BrowserProvider } from 'ethers';
import { ARC_TESTNET, ensureArcNetwork } from '../lib/arc';
import { api } from '../lib/api';
import WalletPicker from './WalletPicker';

const WalletCtx = createContext(null);
const PICK_KEY = 'arcvault:picked_rdns';

export function WalletProvider({ children }) {
  const [providerEntry, setProviderEntry] = useState(null); // { info, provider } from EIP-6963
  const [pickerOpen, setPickerOpen] = useState(false);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState(null);
  const authInFlight = useRef(false);

  // SIWE sign-in for a given address, using the currently picked provider.
  const signInWithEthereum = useCallback(async (addr, eth) => {
    if (!eth) return;
    if (authInFlight.current) return;
    authInFlight.current = true;
    setAuthenticating(true);
    setError(null);
    try {
      const existing = await api.session();
      if (existing?.address?.toLowerCase() === addr.toLowerCase()) {
        setAuthed(true);
        return;
      }

      const { nonce, message, error: nonceErr } = await api.nonce(addr);
      if (nonceErr) throw new Error(nonceErr);
      if (!nonce || !message) throw new Error('Backend did not return nonce/message');

      const ethersProvider = new BrowserProvider(eth);
      const signer = await ethersProvider.getSigner();
      const signature = await signer.signMessage(message);

      const verifyRes = await api.verify({ address: addr, message, signature });
      if (verifyRes.error || !verifyRes.ok) throw new Error(verifyRes.error || 'verify failed');

      setAuthed(true);

      // Provisions wallets on first sign-in (idempotent).
      try { await api.me(); } catch {}
    } catch (err) {
      console.error('SIWE failed:', err);
      setError(err?.message || 'Sign-in failed');
      setAuthed(false);
    } finally {
      setAuthenticating(false);
      authInFlight.current = false;
    }
  }, []);

  // Attaches listeners to a given EIP-1193 provider and completes the connect flow.
  const useProvider = useCallback(async (entry) => {
    setProviderEntry(entry);
    localStorage.setItem(PICK_KEY, entry.info.rdns || entry.info.name);
    const eth = entry.provider;
    try {
      const accs = await eth.request({ method: 'eth_requestAccounts' });
      const addr = accs?.[0] ?? null;
      setAddress(addr);
      await ensureArcNetwork(eth);
      const id = await eth.request({ method: 'eth_chainId' });
      setChainId(parseInt(id, 16));
      localStorage.setItem('arcvault:connected', '1');
      if (addr) await signInWithEthereum(addr, eth);
    } catch (err) {
      setError(err?.message || 'Connection failed');
    }
  }, [signInWithEthereum]);

  // Entry point for the "Connect Wallet" button — opens the picker.
  const connect = useCallback(() => {
    setError(null);
    setPickerOpen(true);
  }, []);

  const onPick = useCallback(async (entry) => {
    setPickerOpen(false);
    setConnecting(true);
    try {
      await useProvider(entry);
    } finally {
      setConnecting(false);
    }
  }, [useProvider]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setAuthed(false);
    setProviderEntry(null);
    api.logout().catch(() => {});
    localStorage.removeItem('arcvault:connected');
    localStorage.removeItem(PICK_KEY);
  }, []);

  // Attach account/chain change listeners to the currently picked provider.
  useEffect(() => {
    const eth = providerEntry?.provider;
    if (!eth?.on) return;
    const onAccounts = (accs) => {
      const next = accs?.[0] ?? null;
      setAddress(next);
      setAuthed(false);
      api.logout().catch(() => {});
      if (next) signInWithEthereum(next, eth);
    };
    const onChain = (id) => setChainId(parseInt(id, 16));
    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [providerEntry, signInWithEthereum]);

  // Auto-reconnect: on mount, if user had connected before, try to silently resume
  // using the previously-picked provider (identified by its EIP-6963 rdns).
  useEffect(() => {
    const prev = localStorage.getItem('arcvault:connected');
    if (!prev) return;
    const savedRdns = localStorage.getItem(PICK_KEY);

    // Listen for EIP-6963 announcements to find the previously-used wallet.
    const seen = new Map();
    const onAnnounce = async (event) => {
      const detail = event.detail;
      if (!detail?.info?.uuid) return;
      seen.set(detail.info.uuid, detail);
      const match = Array.from(seen.values()).find(
        p => (p.info.rdns || p.info.name) === savedRdns,
      );
      if (!match) return;
      window.removeEventListener('eip6963:announceProvider', onAnnounce);

      // Silently check if already authorized; don't force a popup on reload.
      try {
        const accs = await match.provider.request({ method: 'eth_accounts' });
        if (accs?.[0]) {
          setProviderEntry(match);
          setAddress(accs[0]);
          const id = await match.provider.request({ method: 'eth_chainId' });
          setChainId(parseInt(id, 16));
          const existing = await api.session();
          if (existing?.address?.toLowerCase() === accs[0].toLowerCase()) {
            setAuthed(true);
          } else {
            signInWithEthereum(accs[0], match.provider);
          }
        }
      } catch (e) {
        console.warn('auto-reconnect failed:', e.message);
      }
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    const t = setTimeout(() => window.removeEventListener('eip6963:announceProvider', onAnnounce), 2000);
    return () => { clearTimeout(t); window.removeEventListener('eip6963:announceProvider', onAnnounce); };
  }, [signInWithEthereum]);

  const isOnArc = chainId === ARC_TESTNET.chainId;

  return (
    <WalletCtx.Provider value={{
      address, chainId, connecting, authenticating, authed, error, isOnArc,
      connect, disconnect,
      switchToArc: () => ensureArcNetwork(providerEntry?.provider),
      signIn: () => address && providerEntry && signInWithEthereum(address, providerEntry.provider),
      eth: providerEntry?.provider ?? null,
      walletName: providerEntry?.info?.name ?? null,
      walletIcon: providerEntry?.info?.icon ?? null,
    }}>
      {children}
      <WalletPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPick} />
    </WalletCtx.Provider>
  );
}

export const useWallet = () => useContext(WalletCtx) ?? {};
