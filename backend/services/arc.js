// Arc Network RPC wrapper via ethers.js.
// Used for on-chain reads (block height, tx confirmations, ERC20 raw balances).

import 'dotenv/config';
import { ethers } from 'ethers';

const RPC = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID || 5042002);

export const provider = new ethers.JsonRpcProvider(RPC, {
  chainId: CHAIN_ID,
  name: 'arc-testnet',
});

// Minimal ERC20 ABI for balanceOf + decimals + symbol
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export async function getBlockNumber() {
  return provider.getBlockNumber();
}

export async function getNativeBalance(address) {
  const wei = await provider.getBalance(address);
  return ethers.formatUnits(wei, 18);
}

export async function getErc20Balance(tokenAddress, walletAddress) {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [raw, decimals, symbol] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.decimals(),
    contract.symbol(),
  ]);
  return {
    symbol,
    decimals,
    raw: raw.toString(),
    formatted: ethers.formatUnits(raw, decimals),
  };
}

export async function getTransactionReceipt(txHash) {
  return provider.getTransactionReceipt(txHash);
}

export async function waitForTx(txHash, confirmations = 1) {
  return provider.waitForTransaction(txHash, confirmations);
}
