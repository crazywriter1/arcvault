// Client-side Arc Network helpers: network config, token addresses, MetaMask utilities.

export const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: '0x' + (5042002).toString(16),
  name: 'Arc Testnet',
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
};

// ERC-20 representations of the stablecoins on Arc Testnet (both 6 decimals).
export const TOKENS = {
  USDC: { address: '0x3600000000000000000000000000000000000000', symbol: 'USDC', decimals: 6 },
  EURC: { address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', symbol: 'EURC', decimals: 6 },
};

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

// Ensure the given EIP-1193 provider is on Arc Testnet; add the network if missing.
// Accepts an explicit provider (preferred) or falls back to window.ethereum.
export async function ensureArcNetwork(provider) {
  const eth = provider || (typeof window !== 'undefined' ? window.ethereum : null);
  if (!eth) throw new Error('No wallet provider available');
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET.chainIdHex }],
    });
  } catch (err) {
    // 4902 = network not added
    if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message ?? '')) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_TESTNET.chainIdHex,
          chainName: ARC_TESTNET.name,
          rpcUrls: ARC_TESTNET.rpcUrls,
          blockExplorerUrls: ARC_TESTNET.blockExplorerUrls,
          nativeCurrency: ARC_TESTNET.nativeCurrency,
        }],
      });
    } else {
      throw err;
    }
  }
}

export function shortAddress(a) {
  if (!a) return '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Source chains we expose for CCTP bridging into Arc. Keep this short for MVP.
export const BRIDGE_SOURCES = {
  'ethereum-sepolia': {
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    name: 'Ethereum Sepolia',
    rpcUrls: ['https://sepolia.drpc.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
};

export async function ensureChain(provider, cfg) {
  const eth = provider || (typeof window !== 'undefined' ? window.ethereum : null);
  if (!eth) throw new Error('No wallet provider available');
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: cfg.chainIdHex }],
    });
  } catch (err) {
    if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message ?? '')) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: cfg.chainIdHex,
          chainName: cfg.name,
          rpcUrls: cfg.rpcUrls,
          blockExplorerUrls: cfg.blockExplorerUrls,
          nativeCurrency: cfg.nativeCurrency,
        }],
      });
    } else {
      throw err;
    }
  }
}
