// CCTP (Cross-Chain Transfer Protocol) helper.
// Burn USDC on a source chain → wait for Circle's attestation → mint on Arc.
//
// Source-side burn happens in the user's MetaMask (non-custodial).
// Mint on Arc is initiated by the user's Circle Treasury wallet (or by user themselves).
// This service only orchestrates: it polls Circle's iris attestation API and
// returns enough metadata for the frontend to complete the mint.

// ---- Contract registry (testnets) ----------------------------------------
// CCTP V2 testnet addresses. Domain IDs: ethereum-sepolia=0, avalanche-fuji=1,
// arbitrum-sepolia=3, base-sepolia=6, polygon-amoy=7. Arc testnet domain TBD —
// configurable via env so we can flip it on once Circle publishes.

export const CCTP_DOMAINS = {
  'ethereum-sepolia': 0,
  'avalanche-fuji': 1,
  'arbitrum-sepolia': 3,
  'base-sepolia': 6,
  'polygon-amoy': 7,
  'arc-testnet': Number(process.env.ARC_CCTP_DOMAIN ?? 13),
};

export const CCTP_CONTRACTS = {
  'ethereum-sepolia': {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  'arc-testnet': {
    tokenMessenger: process.env.ARC_CCTP_TOKEN_MESSENGER ?? '',
    messageTransmitter: process.env.ARC_CCTP_MESSAGE_TRANSMITTER ?? '',
    usdc: process.env.ARC_USDC ?? '0x36009dD1abc92F40C82D4f9A28E6F5dE9aE1f1A8',
  },
};

const IRIS_BASE = process.env.CCTP_IRIS_URL ?? 'https://iris-api-sandbox.circle.com';

// Poll Circle's attestation service for a given source-side messageHash.
// Returns { status: 'pending'|'complete', attestation?, message? }.
export async function fetchAttestation(messageHash) {
  if (!messageHash || !messageHash.startsWith('0x')) {
    throw new Error('messageHash must be a 0x-prefixed bytes32 hex');
  }
  const url = `${IRIS_BASE}/attestations/${messageHash}`;
  const res = await fetch(url, { signal: AbortSignal.timeout?.(5000) });
  if (res.status === 404) return { status: 'pending' };
  if (!res.ok) throw new Error(`iris ${res.status}`);
  const json = await res.json();
  // iris returns { status: 'pending_confirmations' | 'complete', attestation }
  if (json.status === 'complete' && json.attestation) {
    return { status: 'complete', attestation: json.attestation, message: json.message };
  }
  return { status: 'pending', detail: json.status };
}

// Convenience: returns the full bridge spec the frontend needs to call
// depositForBurn on the source chain. The frontend signs/sends via MetaMask.
export function getBurnSpec({ fromChain, toChain }) {
  const src = CCTP_CONTRACTS[fromChain];
  const dstDomain = CCTP_DOMAINS[toChain];
  if (!src) throw new Error(`unsupported source chain: ${fromChain}`);
  if (dstDomain === undefined) throw new Error(`unsupported destination: ${toChain}`);
  if (!src.tokenMessenger) throw new Error(`source chain ${fromChain} has no tokenMessenger configured`);
  return {
    fromChain,
    toChain,
    destinationDomain: dstDomain,
    tokenMessenger: src.tokenMessenger,
    usdc: src.usdc,
  };
}
