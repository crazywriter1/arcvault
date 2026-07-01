import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../services/auth.js';

test('signToken and verifyToken roundtrip', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const token = signToken(address);
  const payload = verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.address, address);
});

test('verifyToken rejects tampered token', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const token = signToken(address);
  const [payload, sig] = token.split('.');
  const tampered = `${payload}.${sig.slice(0, -1)}x`;
  const result = verifyToken(tampered);
  assert.equal(result, null);
});
