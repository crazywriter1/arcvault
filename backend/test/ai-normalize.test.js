import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAction, isCompleteRuleParams } from '../services/ai.js';

test('every friday deposit to treasury creates schedule rule with defaults', () => {
  const parsed = normalizeAction(
    'every friday deposit to treasury 1 usdc',
    { intent: 'clarify', summary: 'which wallet?', params: { question: 'source?' } },
    [],
  );
  assert.equal(parsed.intent, 'rule_create');
  assert.equal(parsed.params.trigger.cron, '0 9 * * 5');
  assert.equal(parsed.params.action.amount, 1);
  assert.equal(parsed.params.action.from, 'Savings');
  assert.equal(parsed.params.action.to, 'Treasury Primary');
  assert.ok(isCompleteRuleParams(parsed.params));
});

test('from treasury to savings uses explicit direction', () => {
  const parsed = normalizeAction(
    'from treasury to savings',
    { intent: 'clarify', params: {} },
    [{ role: 'user', content: 'every friday deposit 1 usdc' }],
  );
  assert.equal(parsed.params.action.from, 'Treasury Primary');
  assert.equal(parsed.params.action.to, 'Savings');
});

test('threshold alert rule is complete', () => {
  const parsed = normalizeAction(
    'alert me if treasury drops below 100 USDC',
    { intent: 'chat', params: {} },
    [],
  );
  assert.equal(parsed.intent, 'rule_create');
  assert.equal(parsed.params.trigger.value, 100);
  assert.equal(parsed.params.action.type, 'alert');
  assert.ok(isCompleteRuleParams(parsed.params));
});
