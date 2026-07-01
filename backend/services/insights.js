// Treasury health score, activity feed shaping, and what-if rule simulation.

function walletTotals(walletRows) {
  let treasury = 0;
  let savings = 0;
  for (const row of walletRows) {
    const sum = (row.balances ?? []).reduce((s, b) => s + parseFloat(b.amount ?? 0), 0);
    const label = row.wallet?.label ?? '';
    if (/savings/i.test(label)) savings += sum;
    else treasury += sum;
  }
  return { treasury, savings, total: treasury + savings };
}

function compare(a, op, b) {
  switch (op) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '==': return a === b;
    default: return false;
  }
}

export function computeHealthScore({ walletRows = [], rules = [], transactions = [] }) {
  const { treasury, savings, total } = walletTotals(walletRows);
  const savingsPct = total > 0 ? savings / total : 0;
  const activeRules = rules.filter((r) => r.enabled).length;
  const pending = transactions.filter((t) => t.status === 'pending_approval').length;

  let score = 72;
  const factors = [];

  if (total === 0) {
    score = 35;
    factors.push({ key: 'empty', impact: -37, note: 'No funds in managed wallets' });
  } else {
    if (savingsPct >= 0.15 && savingsPct <= 0.45) {
      score += 14;
      factors.push({ key: 'allocation', impact: 14, note: `Healthy savings ratio (${(savingsPct * 100).toFixed(0)}%)` });
    } else if (savingsPct < 0.1) {
      score -= 12;
      factors.push({ key: 'allocation', impact: -12, note: 'Savings reserve is low — consider moving 15–30% to Savings' });
    } else if (savingsPct > 0.6) {
      score -= 6;
      factors.push({ key: 'allocation', impact: -6, note: 'Most funds locked in Savings — Treasury may be underfunded for ops' });
    }

    if (treasury < 10) {
      score -= 10;
      factors.push({ key: 'treasury', impact: -10, note: 'Treasury balance is very low' });
    }
  }

  if (activeRules >= 1 && activeRules <= 6) {
    score += 8;
    factors.push({ key: 'automation', impact: 8, note: `${activeRules} automation rule(s) active` });
  } else if (activeRules === 0) {
    score -= 8;
    factors.push({ key: 'automation', impact: -8, note: 'No automation rules — treasury runs manually only' });
  }

  if (pending > 0) {
    score -= pending * 6;
    factors.push({ key: 'pending', impact: -pending * 6, note: `${pending} transfer(s) awaiting approval` });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade = 'At Risk';
  if (score >= 85) grade = 'Excellent';
  else if (score >= 70) grade = 'Good';
  else if (score >= 50) grade = 'Fair';

  const weakest = factors.filter((f) => f.impact < 0).sort((a, b) => a.impact - b.impact)[0];
  const tip = weakest?.note
    ?? (score >= 85 ? 'Treasury looks well balanced. Keep your Savings reserve steady.' : 'Add a threshold alert or schedule a recurring Savings transfer.');

  return {
    score,
    grade,
    tip,
    savings_pct: Math.round(savingsPct * 100),
    treasury_usd: treasury,
    savings_usd: savings,
    active_rules: activeRules,
    pending_approvals: pending,
    factors,
  };
}

export function buildActivityFeed({ transactions = [], pings = [] }) {
  const ARCSCAN_TX = 'https://testnet.arcscan.app/tx/';
  const items = [];

  for (const t of transactions) {
    items.push({
      id: t.id,
      kind: t.type || 'transfer',
      source: t.initiated_by || 'system',
      title: formatTxTitle(t),
      amount: t.amount,
      token: t.token_symbol,
      status: t.status,
      created_at: t.created_at,
      tx_hash: t.tx_hash || null,
      explorer_url: t.tx_hash ? `${ARCSCAN_TX}${t.tx_hash}` : null,
    });
  }

  for (const p of pings) {
    items.push({
      id: p.id,
      kind: 'ping',
      source: 'wallet',
      title: p.kind === 'gn' ? '🌙 GN on Arc' : '☀️ GM on Arc',
      amount: '0.000001',
      token: p.kind === 'gn' ? 'EURC' : 'USDC',
      status: 'confirmed',
      created_at: p.created_at,
      tx_hash: p.tx_hash || null,
      explorer_url: p.tx_hash ? `${ARCSCAN_TX}${p.tx_hash}` : null,
    });
  }

  items.sort((a, b) => b.created_at - a.created_at);
  return items.slice(0, 40);
}

function formatTxTitle(t) {
  if (t.type === 'swap') return `Swap ${t.amount} ${t.token_symbol}`;
  if (t.initiated_by === 'rule') return `Rule transfer ${t.amount} ${t.token_symbol}`;
  if (t.initiated_by === 'ai') return `AI transfer ${t.amount} ${t.token_symbol}`;
  return `Transfer ${t.amount} ${t.token_symbol}`;
}

export function runWhatIf({ walletRows = [], rules = [], scenario }) {
  const { treasury, savings, total } = walletTotals(walletRows);
  const hypo = Number(scenario?.balance);
  const walletLabel = scenario?.wallet || 'Treasury Primary';
  const token = scenario?.token || 'USDC';
  const operator = scenario?.operator || '<';
  const threshold = Number(scenario?.value ?? 100);

  const row = walletRows.find((w) =>
    new RegExp(walletLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(w.wallet?.label ?? ''),
  ) ?? walletRows[0];

  const currentBal = (row?.balances ?? [])
    .filter((b) => b.token?.symbol === token)
    .reduce((s, b) => s + parseFloat(b.amount ?? 0), 0);

  const testBalance = Number.isFinite(hypo) ? hypo : currentBal;
  const conditionMet = compare(testBalance, operator, threshold);

  const triggeredRules = rules.filter((r) => {
    if (!r.enabled) return false;
    const cfg = r.trigger_config;
    if (cfg?.type !== 'threshold') return false;
    if (cfg.token !== token) return false;
    if (!new RegExp(walletLabel, 'i').test(cfg.wallet ?? '')) return false;
    return compare(testBalance, cfg.operator, Number(cfg.value));
  });

  const actions = triggeredRules.map((r) => ({
    rule_id: r.id,
    label: r.label,
    action: r.action_type,
    detail: describeRuleAction(r),
  }));

  let summary;
  if (Number.isFinite(hypo)) {
    summary = conditionMet
      ? `If ${walletLabel} ${token} were ${testBalance}, ${triggeredRules.length} rule(s) would fire.`
      : `At hypothetical ${testBalance} ${token}, no threshold rules would fire (threshold ${operator} ${threshold}).`;
  } else {
    summary = compare(currentBal, operator, threshold)
      ? `Current balance ${currentBal} ${token} already triggers ${triggeredRules.length} rule(s).`
      : `Current balance is ${currentBal} ${token}. A drop ${operator} ${threshold} would trigger ${countMatchingThresholdRules(rules, walletLabel, token, operator, threshold)} rule(s).`;
  }

  return {
    summary,
    current_balance: currentBal,
    test_balance: testBalance,
    threshold: { operator, value: threshold, token, wallet: walletLabel },
    treasury_usd: treasury,
    savings_usd: savings,
    total_usd: total,
    triggered_rules: triggeredRules.length,
    actions,
  };
}

function countMatchingThresholdRules(rules, walletLabel, token, operator, threshold) {
  return rules.filter((r) => {
    if (!r.enabled || r.trigger_config?.type !== 'threshold') return false;
    const cfg = r.trigger_config;
    if (cfg.token !== token) return false;
    if (!new RegExp(walletLabel, 'i').test(cfg.wallet ?? '')) return false;
    return cfg.operator === operator && Number(cfg.value) === threshold;
  }).length;
}

function describeRuleAction(rule) {
  const a = rule.action_config;
  if (rule.action_type === 'alert') return `Alert: ${a.message ?? 'notify'}`;
  if (rule.action_type === 'transfer') return `Send ${a.amount} ${a.token} → ${a.to}`;
  return rule.action_type;
}
