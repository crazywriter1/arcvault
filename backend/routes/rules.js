// Rule CRUD routes — owner-scoped.

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getRules, insertRule, deleteRule } from '../db/database.js';
import { evaluateRulesForOwner } from '../engine/ruleEngine.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ rules: getRules(req.ownerAddress) });
});

router.post('/', (req, res) => {
  const { label, trigger, action, enabled = true } = req.body ?? {};
  if (!label || !trigger || !action) {
    return res.status(400).json({ error: 'missing label/trigger/action' });
  }
  const id = uuid();
  insertRule({
    id,
    owner_address: req.ownerAddress,
    label,
    trigger_type: trigger.type,
    trigger_config: trigger,
    action_type: action.type,
    action_config: action,
    enabled,
  });
  res.json({ id, status: 'created' });
});

router.delete('/:id', (req, res) => {
  deleteRule(req.params.id, req.ownerAddress);
  res.json({ id: req.params.id, status: 'deleted' });
});

router.post('/evaluate', async (req, res) => {
  try {
    const results = await evaluateRulesForOwner(req.ownerAddress);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
