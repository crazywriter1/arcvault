// MVP stablecoin swap via Treasury ↔ Savings liquidity pair at FX oracle rate.
// Leg 1: send from_token from source wallet to peer wallet.
// Leg 2: send to_token from peer wallet back to source wallet.

import { getBalances, getRawBalances, findTokenBalance, transfer } from './circle.js';
import { getPairRate } from './fx.js';

function findPeerWallet(wallets, sourceWallet) {
  if (wallets.length < 2) return null;
  return wallets.find((w) => w.id !== sourceWallet.id) ?? null;
}

export async function quoteSwap({ fromToken, toToken, amount }) {
  const from = String(fromToken || '').toUpperCase();
  const to = String(toToken || '').toUpperCase();
  const amt = Number(amount);
  if (!from || !to || !Number.isFinite(amt) || amt <= 0) {
    throw new Error('invalid swap params');
  }
  if (from === to) throw new Error('from and to token must differ');

  const pair = `${from}/${to}`;
  const rate = await getPairRate(pair);
  const toAmount = Number((amt * rate).toFixed(6));
  return { from, to, fromAmount: amt, toAmount, rate, pair };
}

export async function executeSwap({ wallets, sourceWallet, fromToken, toToken, amount, refPrefix = 'swap' }) {
  const quote = await quoteSwap({ fromToken, toToken, amount });
  const peer = findPeerWallet(wallets, sourceWallet);
  if (!peer) throw new Error('Need Treasury + Savings wallets for swap');

  const srcBalances = await getRawBalances(sourceWallet.circle_wallet_id);
  const peerBalances = await getRawBalances(peer.circle_wallet_id);

  const fromEntry = findTokenBalance(srcBalances, quote.from, quote.fromAmount);
  if (!fromEntry) throw new Error(`No ${quote.from} in ${sourceWallet.label}`);

  const toEntry = findTokenBalance(peerBalances, quote.to, quote.toAmount);
  if (!toEntry) throw new Error(`${peer.label} has no ${quote.to} for swap liquidity`);

  const srcBal = parseFloat(fromEntry.amount ?? 0);
  const peerBal = parseFloat(toEntry.amount ?? 0);
  if (srcBal < quote.fromAmount) {
    throw new Error(`Insufficient ${quote.from} in ${sourceWallet.label} (have ${srcBal.toFixed(2)})`);
  }
  if (peerBal < quote.toAmount) {
    throw new Error(
      `${peer.label} needs at least ${quote.toAmount.toFixed(4)} ${quote.to} for this swap (have ${peerBal.toFixed(2)}). Fund ${peer.label} with ${quote.to} first.`,
    );
  }

  const leg1 = await transfer({
    walletId: sourceWallet.circle_wallet_id,
    tokenId: fromEntry.token.id,
    destinationAddress: peer.address,
    amount: quote.fromAmount,
    refId: `${refPrefix}-leg1-${Date.now()}`,
  });

  const leg2 = await transfer({
    walletId: peer.circle_wallet_id,
    tokenId: toEntry.token.id,
    destinationAddress: sourceWallet.address,
    amount: quote.toAmount,
    refId: `${refPrefix}-leg2-${Date.now()}`,
  });

  return { quote, peerLabel: peer.label, leg1, leg2 };
}
