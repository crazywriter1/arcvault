// Creates an ArcVault wallet set + a primary treasury wallet on Arc Testnet.
// Idempotent: if wallets already exist in local DB, does nothing.

import 'dotenv/config';
import { v4 as uuid } from 'uuid';
import {
  createWalletSet,
  listWalletSets,
  createWallets,
  listWallets,
  ARC_BLOCKCHAIN,
} from '../services/circle.js';
import { insertWallet, getWallets } from '../db/database.js';

const existing = getWallets();
if (existing.length > 0) {
  console.log('Wallets already present in local DB:');
  existing.forEach(w => console.log(`   - [${w.label}] ${w.address}`));
  console.log('   Skipping creation.');
  process.exit(0);
}

console.log('🔧 Setting up ArcVault wallets on Arc Testnet...');

// Find or create a wallet set
let walletSet;
const sets = await listWalletSets();
walletSet = sets.find(s => s.name === 'ArcVault Treasury');
if (!walletSet) {
  walletSet = await createWalletSet('ArcVault Treasury');
  console.log(`✅ Created wallet set: ${walletSet.id}`);
} else {
  console.log(`✅ Using existing wallet set: ${walletSet.id}`);
}

// Check existing Circle wallets in this set
let wallets = await listWallets({ walletSetId: walletSet.id });
wallets = wallets.filter(w => w.blockchain === ARC_BLOCKCHAIN);

if (wallets.length === 0) {
  console.log('🔨 Creating 2 wallets on Arc Testnet (treasury + savings)...');
  wallets = await createWallets({
    walletSetId: walletSet.id,
    count: 2,
    accountType: 'EOA',
  });
}

const labels = ['Treasury (Primary)', 'Savings'];
wallets.forEach((w, i) => {
  insertWallet({
    id: uuid(),
    circleWalletId: w.id,
    address: w.address,
    blockchain: w.blockchain,
    walletSetId: walletSet.id,
    label: labels[i] ?? `Wallet ${i + 1}`,
  });
  console.log(`✅ ${labels[i]}: ${w.address}`);
});

console.log('\n💧 Fund the treasury address via: https://faucet.circle.com');
console.log('   Select blockchain: Arc Testnet, paste the address above.\n');
