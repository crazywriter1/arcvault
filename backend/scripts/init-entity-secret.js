// Generates a 32-byte Entity Secret and registers it with Circle.
// Run this ONCE to bootstrap the developer-controlled wallet system.
// Saves ciphertext recovery file to ./output/ — DO NOT lose it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import {
  registerEntitySecretCiphertext,
} from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  console.error('❌ CIRCLE_API_KEY missing in .env');
  process.exit(1);
}

// If already set, don't regenerate — avoids accidental key rotation.
if (process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_ENTITY_SECRET.length === 64) {
  console.log('ℹ️  CIRCLE_ENTITY_SECRET already set in .env. Skipping generation.');
  console.log('   If you want to rotate, remove it from .env first.');
  process.exit(0);
}

const entitySecret = crypto.randomBytes(32).toString('hex');
console.log('🔐 Generated Entity Secret (32 bytes hex):');
console.log('   ' + entitySecret);

try {
  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
  });

  const outputDir = path.resolve('./output');
  fs.mkdirSync(outputDir, { recursive: true });
  const recoveryPath = path.join(outputDir, 'recovery_file.dat');
  fs.writeFileSync(recoveryPath, response.data?.recoveryFile ?? '');
  console.log(`✅ Recovery file saved: ${recoveryPath}`);

  // Patch .env with new entity secret
  const envPath = path.resolve('.env');
  let env = fs.readFileSync(envPath, 'utf-8');
  env = env.replace(/CIRCLE_ENTITY_SECRET=.*/g, `CIRCLE_ENTITY_SECRET=${entitySecret}`);
  fs.writeFileSync(envPath, env);
  console.log('✅ .env updated with CIRCLE_ENTITY_SECRET');
  console.log('\n⚠️  BACKUP the recovery_file.dat AND the entity secret above.');
} catch (err) {
  console.error('❌ Failed to register entity secret:', err?.response?.data || err.message);
  process.exit(1);
}
