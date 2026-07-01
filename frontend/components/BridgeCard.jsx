'use client';

// CCTP bridge UI: burn USDC on a source chain (Sepolia) → poll Circle's
// attestation API → mint on Arc. The user signs the burn in their own wallet;
// the mint step is a separate transaction once the attestation is ready.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserProvider, Contract, Interface, getBytes, hexlify, keccak256, parseUnits, zeroPadValue } from 'ethers';
import { useWallet } from './WalletProvider';
import { useToast } from './Toast';
import { api } from '../lib/api';
import { BRIDGE_SOURCES, ensureChain, ensureArcNetwork, shortAddress } from '../lib/arc';
import { Icon } from './Icons';

const STATE_KEY = 'arcvault:bridge_state';

const TOKEN_MESSENGER_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)',
];
const MESSAGE_TRANSMITTER_ABI = [
  'event MessageSent(bytes message)',
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
];
const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

const SOURCE = 'ethereum-sepolia';

export default function BridgeCard({ treasuryWallet }) {
  const { address, eth, walletName } = useWallet();
  const { toast } = useToast();
  const [chainsCfg, setChainsCfg] = useState(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('treasury');
  const [stage, setStage] = useState('idle'); // idle | switching | approving | burning | polling | ready_to_mint | minting | done | error
  const [intent, setIntent] = useState(null); // { burnTxHash, message, messageHash, amount, recipient }
  const [attestation, setAttestation] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // Load chain registry + persisted intent on mount.
  useEffect(() => {
    api.bridgeChains().then(setChainsCfg).catch(() => {});
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.intent) {
          setIntent(parsed.intent);
          setStage(parsed.stage ?? 'polling');
          setAttestation(parsed.attestation ?? null);
        }
      }
    } catch {}
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Persist relevant state.
  useEffect(() => {
    if (!intent) { localStorage.removeItem(STATE_KEY); return; }
    localStorage.setItem(STATE_KEY, JSON.stringify({ intent, stage, attestation }));
  }, [intent, stage, attestation]);

  // Polling loop once we have a messageHash but no attestation yet.
  useEffect(() => {
    if (!intent?.messageHash) return;
    if (attestation) return;
    if (stage !== 'polling') return;
    let cancelled = false;
    async function tick() {
      try {
        const r = await api.bridgeAttestation(intent.messageHash);
        if (cancelled) return;
        if (r.status === 'complete' && r.attestation) {
          setAttestation(r.attestation);
          setStage('ready_to_mint');
          toast.success('Attestation ready — finalize on Arc to mint.');
        }
      } catch (err) {
        // transient — keep polling
      }
    }
    tick();
    pollRef.current = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(pollRef.current); };
  }, [intent, attestation, stage, toast]);

  const sourceCfg = BRIDGE_SOURCES[SOURCE];
  const arcDomain = chainsCfg?.domains?.['arc-testnet'];
  const sourceContracts = chainsCfg?.contracts?.[SOURCE];
  const arcContracts = chainsCfg?.contracts?.['arc-testnet'];

  const recipientAddress = useMemo(() => {
    if (recipient === 'treasury') return treasuryWallet?.address ?? '';
    return address ?? '';
  }, [recipient, treasuryWallet, address]);

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setIntent(null); setAttestation(null); setStage('idle'); setAmount(''); setError(null);
    localStorage.removeItem(STATE_KEY);
  }, []);

  async function startBridge() {
    setError(null);
    if (!eth) { setError('Connect a wallet first'); return; }
    if (!sourceContracts?.tokenMessenger) { setError('Bridge contracts not configured'); return; }
    if (arcDomain === undefined) { setError('Arc domain not configured'); return; }
    if (!recipientAddress) { setError('No recipient address'); return; }
    const amt = Number(amount);
    if (!(amt > 0)) { setError('Enter an amount'); return; }

    try {
      // 1. Switch to source chain.
      setStage('switching');
      await ensureChain(eth, sourceCfg);

      const browser = new BrowserProvider(eth);
      const signer = await browser.getSigner();
      const usdc = new Contract(sourceCfg.usdc, ERC20_APPROVE_ABI, signer);
      const tokenMessenger = new Contract(sourceContracts.tokenMessenger, TOKEN_MESSENGER_ABI, signer);

      const amountUnits = parseUnits(String(amt), 6);

      // 2. Approve TokenMessenger to spend our USDC.
      setStage('approving');
      const owner = await signer.getAddress();
      const allowance = await usdc.allowance(owner, sourceContracts.tokenMessenger);
      if (allowance < amountUnits) {
        const tx = await usdc.approve(sourceContracts.tokenMessenger, amountUnits);
        toast.info(`Approving USDC… ${tx.hash.slice(0, 10)}…`);
        await tx.wait();
      }

      // 3. depositForBurn.
      setStage('burning');
      const mintRecipient = zeroPadValue(recipientAddress, 32);
      const burnTx = await tokenMessenger.depositForBurn(
        amountUnits,
        arcDomain,
        mintRecipient,
        sourceCfg.usdc,
      );
      toast.info(`Burn submitted: ${burnTx.hash.slice(0, 10)}…`);
      const receipt = await burnTx.wait();

      // 4. Extract MessageSent log → derive messageHash.
      const iface = new Interface(MESSAGE_TRANSMITTER_ABI);
      let message = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'MessageSent') { message = parsed.args.message; break; }
        } catch {}
      }
      if (!message) throw new Error('MessageSent log not found in receipt');
      const messageHash = keccak256(getBytes(message));

      const next = {
        burnTxHash: burnTx.hash,
        message: hexlify(message),
        messageHash,
        amount: String(amt),
        recipient: recipientAddress,
        recipientLabel: recipient,
      };
      setIntent(next);
      setStage('polling');
      toast.success('Burn confirmed. Waiting for Circle attestation…');
    } catch (err) {
      console.error(err);
      setError(err?.shortMessage || err?.message || 'Bridge failed');
      setStage('error');
    }
  }

  async function finalizeMint() {
    setError(null);
    if (!eth || !intent || !attestation) return;
    if (!arcContracts?.messageTransmitter) {
      setError('Arc MessageTransmitter not configured — attestation saved, mint manually once available.');
      return;
    }
    try {
      setStage('minting');
      await ensureArcNetwork(eth);
      const browser = new BrowserProvider(eth);
      const signer = await browser.getSigner();
      const transmitter = new Contract(arcContracts.messageTransmitter, MESSAGE_TRANSMITTER_ABI, signer);
      const tx = await transmitter.receiveMessage(intent.message, attestation);
      toast.info(`Mint submitted: ${tx.hash.slice(0, 10)}…`);
      await tx.wait();
      toast.success(`Bridged ${intent.amount} USDC to Arc`);
      setStage('done');
    } catch (err) {
      console.error(err);
      setError(err?.shortMessage || err?.message || 'Mint failed');
      setStage('ready_to_mint');
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
            <Icon.Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink-100">Bridge to Arc</h2>
            <p className="text-[11px] text-ink-400">USDC via Circle CCTP · Sepolia → Arc</p>
          </div>
        </div>
        {intent && (
          <button onClick={reset} className="text-[11px] text-ink-400 hover:text-bad">Clear</button>
        )}
      </div>

      {!intent && (
        <>
          <label className="text-[11px] uppercase tracking-wider text-ink-400">Amount (USDC)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full mt-1 mb-3 rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm number focus:outline-none focus:border-brand/40"
          />

          <label className="text-[11px] uppercase tracking-wider text-ink-400">Recipient on Arc</label>
          <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
            <button
              onClick={() => setRecipient('treasury')}
              className={`btn px-3 py-2 text-xs ${recipient === 'treasury' ? 'bg-brand/20 text-brand border border-brand/30' : 'btn-ghost'}`}
            >
              Treasury {treasuryWallet?.address && `· ${shortAddress(treasuryWallet.address)}`}
            </button>
            <button
              onClick={() => setRecipient('self')}
              className={`btn px-3 py-2 text-xs ${recipient === 'self' ? 'bg-brand/20 text-brand border border-brand/30' : 'btn-ghost'}`}
            >
              My wallet · {shortAddress(address)}
            </button>
          </div>

          <button
            onClick={startBridge}
            disabled={!amount || stage === 'switching' || stage === 'approving' || stage === 'burning'}
            className="btn-primary w-full"
          >
            {stage === 'switching' && 'Switching to Sepolia…'}
            {stage === 'approving' && 'Approving USDC…'}
            {stage === 'burning' && 'Burning on Sepolia…'}
            {(stage === 'idle' || stage === 'error') && `Bridge ${amount || '0'} USDC → Arc`}
          </button>

          <p className="mt-3 text-[11px] text-ink-500 leading-relaxed">
            CCTP burns USDC on Sepolia and mints native USDC on Arc using Circle's attestation.
            You'll sign two transactions in {walletName ?? 'your wallet'}: an approve + the burn.
          </p>
        </>
      )}

      {intent && (
        <div className="space-y-3">
          <Step label="Burn on Sepolia" done txHash={intent.burnTxHash} explorer={sourceCfg.blockExplorerUrls[0]} />
          <Step
            label="Circle attestation"
            done={!!attestation}
            pending={stage === 'polling'}
            detail={attestation ? 'Attested' : 'Polling iris-api…'}
          />
          <Step
            label="Mint on Arc"
            done={stage === 'done'}
            pending={stage === 'minting'}
            disabled={!attestation || stage === 'done'}
          />

          <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3 text-[11px] space-y-1">
            <Row k="Amount" v={`${intent.amount} USDC`} />
            <Row k="Recipient" v={shortAddress(intent.recipient)} />
            <Row k="Message hash" v={shortAddress(intent.messageHash)} mono />
          </div>

          {stage === 'ready_to_mint' && (
            <button onClick={finalizeMint} className="btn-primary w-full">
              Finalize on Arc
            </button>
          )}
          {stage === 'minting' && (
            <button disabled className="btn-primary w-full opacity-60">Minting on Arc…</button>
          )}
          {stage === 'done' && (
            <div className="text-xs text-good text-center">Bridge complete ✓</div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 text-[11px] text-bad break-words">
          {error}
        </div>
      )}
    </div>
  );
}

function Step({ label, done, pending, disabled, detail, txHash, explorer }) {
  const color = done ? 'text-good border-good/30 bg-good/10'
    : pending ? 'text-brand border-brand/30 bg-brand/10'
    : disabled ? 'text-ink-500 border-white/5'
    : 'text-ink-300 border-white/10';
  return (
    <div className={`flex items-center justify-between rounded-lg border ${color} px-3 py-2`}>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-good' : pending ? 'bg-brand animate-pulse-dot' : 'bg-ink-500'}`} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-[11px]">
        {txHash && explorer ? (
          <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono hover:underline">
            {txHash.slice(0, 10)}…
          </a>
        ) : detail}
      </div>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-400">{k}</span>
      <span className={`text-ink-200 ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  );
}
