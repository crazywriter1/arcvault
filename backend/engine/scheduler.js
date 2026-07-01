// Scheduler — polls rule engine across all owners + registers cron-based rules.

import cron from 'node-cron';
import { evaluateAll, executeAction } from './ruleEngine.js';
import { getAllActiveRulesAcrossOwners, getWallets, updateRuleLastRun } from '../db/database.js';

const scheduledTasks = new Map();

export function start() {
  cron.schedule('*/1 * * * *', async () => {
    try {
      const all = await evaluateAll();
      const total = all.reduce((n, o) => n + o.results.filter(r => r.fired).length, 0);
      if (total) {
        console.log(`[scheduler] ${total} rule(s) fired across ${all.length} owner(s)`);
      }
    } catch (err) {
      console.error('[scheduler] poll error:', err.message);
    }
  });

  syncCronRules();
  cron.schedule('*/5 * * * *', syncCronRules);

  console.log('⏱️  Scheduler started (1-min polling + cron rules, multi-tenant)');
}

function syncCronRules() {
  const rules = getAllActiveRulesAcrossOwners().filter(r => r.trigger_config?.type === 'schedule');
  const activeIds = new Set(rules.map(r => r.id));

  for (const [id, task] of scheduledTasks) {
    if (!activeIds.has(id)) {
      task.stop();
      scheduledTasks.delete(id);
    }
  }

  for (const rule of rules) {
    if (scheduledTasks.has(rule.id)) continue;
    const expr = rule.trigger_config?.cron;
    if (!expr || !cron.validate(expr)) continue;
    const ownerAddress = rule.owner_address;
    const task = cron.schedule(expr, async () => {
      try {
        const wallets = getWallets(ownerAddress);
        await executeAction(rule, wallets, ownerAddress);
        updateRuleLastRun(rule.id);
        console.log(`[scheduler] cron fired: ${rule.label} (owner ${ownerAddress.slice(0, 8)}…)`);
      } catch (e) {
        console.error(`[scheduler] cron rule ${rule.id} error:`, e.message);
      }
    });
    scheduledTasks.set(rule.id, task);
    console.log(`[scheduler] cron registered: ${rule.label} (${expr}) for ${ownerAddress.slice(0, 8)}…`);
  }
}
