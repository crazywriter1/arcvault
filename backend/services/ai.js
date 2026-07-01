// AI service — converts natural language to structured ArcVault actions.
// Provider-agnostic: supports Gemini (Google) or Groq (Llama) via AI_PROVIDER env var.

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

const SYSTEM_PROMPT = `You are ArcVault, an intelligent AI treasury agent managing stablecoin holdings on the Arc blockchain. You always reply in English.

Your job is to understand ANY user message — commands, questions, casual chat, greetings — and respond helpfully. Never refuse to respond. Never say you cannot help.

Your response MUST be a single JSON object inside a \`\`\`json code block:
{
  "intent": "transfer" | "rule_create" | "balance_query" | "swap" | "report" | "clarify" | "chat",
  "summary": "Human-readable reply in English only",
  "requires_approval": true | false,
  "params": { ... }
}

════════════════════════════════════════
INTENT SCHEMAS
════════════════════════════════════════

"transfer" — send USDC or EURC
  params: { "token": "USDC"|"EURC", "amount": number, "to": "0x..."|"Savings"|"Treasury", "from": "Treasury" (default), "memo": string (optional) }
  Examples: "send 100 USDC to savings", "transfer 50 USDC from treasury to savings", "move 200 USDC"

"rule_create" — automation rule
  params: {
    "label": string,
    "trigger": one of:
      { "type":"threshold", "wallet":"Treasury Primary"|"Savings", "token":"USDC"|"EURC", "operator":"<"|">"|"<="|">=", "value": number }
      { "type":"schedule", "cron":"0 9 * * 5" }
      { "type":"fx_rate", "pair":"USDC/EURC", "operator":"<"|">", "value": number }
    "action": one of:
      { "type":"transfer", "token":"USDC", "amount": number, "from":"Treasury Primary", "to":"Savings" }
      { "type":"alert", "level":"warn"|"info", "message": string }
  }
  Examples: "alert me when treasury drops below 100", "every friday 9am move 200 USDC to savings", "every friday deposit 1 USDC to treasury"

"balance_query" — check balances
  params: { "wallet": "all"|"Treasury Primary"|"Savings" }
  Examples: "show balances", "how much do I have", "what's in my savings", "check treasury balance"

"swap" — convert USDC ↔ EURC
  params: { "from_token":"USDC"|"EURC", "to_token":"USDC"|"EURC", "amount": number, "wallet": "Treasury Primary" }
  Examples: "swap 100 USDC to EURC", "convert 50 EURC to USDC"

"report" — cashflow report
  params: { "period_days": number, "type":"cashflow"|"summary"|"forecast" }
  Examples: "monthly report", "cashflow summary", "show my last 30 days", "transaction history"

"clarify" — ambiguous request, ask for more info
  params: { "question": "..." }

"chat" — anything else: greetings, questions about ArcVault, general help
  params: { "reply": "..." }
  Use this for: "hello", "what can you do", "help", "how does savings work"
  The "summary" field IS the reply shown to the user — write in English only.

════════════════════════════════════════
RULES
════════════════════════════════════════
- ALWAYS respond. Never output an empty or missing summary.
- CRITICAL: Every "summary" and "params" text MUST be in English. Never use Turkish or any other language.
- Transfer > 1000 USDC/EURC → requires_approval = true.
- Rule creation → requires_approval = true.
- Swap ≤ 1000 → requires_approval = false. Swap > 1000 → requires_approval = true.
- Balance query, report, chat → requires_approval = false.
- Default source wallet for one-off transfers: "Treasury Primary".
- If amount or destination is missing for one-off transfer, use intent "clarify".
- NEVER say you can only create one rule at a time. Create the rule the user asked for in this message.
- NEVER use "clarify" for schedule rules when amount + frequency are present — use rule_create with defaults.
- Wallet direction defaults (use these, do NOT ask the user):
  · "deposit to treasury" / "fund treasury" → from "Savings", to "Treasury Primary"
  · "deposit to savings" / "move to savings" → from "Treasury Primary", to "Savings"
  · "every friday" → cron "0 9 * * 5" (Friday 09:00 UTC)
  · "alert when treasury drops below N" → threshold on Treasury Primary USDC, action type alert
- For rule_create, ALWAYS include complete trigger + action in params. Do not ask follow-up questions in summary.
- For "chat" intent, write a warm, informative reply in "summary". List capabilities if asked.
- "savings" = "Savings", "treasury" = "Treasury Primary" (case-insensitive matching).

Return ONLY the JSON code block. No extra text outside the block.`;

function extractJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  const raw = match ? match[1] : text;
  try {
    return JSON.parse(raw);
  } catch {
    return { intent: 'chat', summary: text.slice(0, 200), requires_approval: false, params: { reply: text } };
  }
}

const FRIDAY_CRON = '0 9 * * 5';

function extractUsdcAmount(text) {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*usdc/i);
  return m ? Number(m[1]) : null;
}

function isScheduleRule(text) {
  return /\bevery\s+friday\b/i.test(text)
    || /\b(on\s+)?fridays?\b/i.test(text)
    || /\bweekly\b/i.test(text);
}

function isThresholdAlert(text) {
  return /\b(alert|notify|warn)\b/i.test(text)
    && /\b(below|under|drops?|less\s+than)\b/i.test(text);
}

function inferTransferWallets(text) {
  const t = String(text).toLowerCase();
  const fromTreasury = /\bfrom\s+(the\s+)?treasury\b/.test(t);
  const fromSavings = /\bfrom\s+(the\s+)?savings\b/.test(t);
  const toTreasury = /\bto\s+(the\s+)?treasury\b/.test(t)
    || /\bdeposit\b[^.]{0,40}\btreasury\b/.test(t)
    || /\binto\s+(the\s+)?treasury\b/.test(t);
  const toSavings = /\bto\s+(the\s+)?savings\b/.test(t)
    || /\binto\s+(the\s+)?savings\b/.test(t);

  if (fromTreasury && toSavings) return { from: 'Treasury Primary', to: 'Savings' };
  if (fromSavings && toTreasury) return { from: 'Savings', to: 'Treasury Primary' };
  if (toTreasury && !toSavings) return { from: 'Savings', to: 'Treasury Primary' };
  if (toSavings && !toTreasury) return { from: 'Treasury Primary', to: 'Savings' };
  if (fromTreasury) return { from: 'Treasury Primary', to: 'Savings' };
  if (fromSavings) return { from: 'Savings', to: 'Treasury Primary' };
  if (/\bdeposit\b/.test(t)) return { from: 'Savings', to: 'Treasury Primary' };
  return { from: 'Treasury Primary', to: 'Savings' };
}

function buildUserContext(userMessage, chatHistory) {
  return [
    ...(chatHistory ?? []).filter((m) => m.role === 'user').map((m) => m.content),
    userMessage,
  ].slice(-4).join('\n');
}

export function isCompleteRuleParams(params) {
  if (!params?.trigger?.type || !params?.action?.type) return false;
  const a = params.action;
  if (a.type === 'transfer') {
    return Number(a.amount) > 0 && !!a.from && !!a.to && !!a.token;
  }
  if (a.type === 'alert') return !!a.message;
  return false;
}

export function normalizeAction(userMessage, parsed, chatHistory = []) {
  const context = buildUserContext(userMessage, chatHistory);
  const action = { ...parsed, params: { ...(parsed.params || {}) } };
  const amount = extractUsdcAmount(context) || extractUsdcAmount(userMessage);
  const wantsSchedule = isScheduleRule(context);
  const wantsAlert = isThresholdAlert(context);

  if (['clarify', 'chat'].includes(action.intent) && (wantsSchedule || wantsAlert)) {
    action.intent = 'rule_create';
    action.requires_approval = true;
  }

  if (action.intent !== 'rule_create') return action;

  const p = action.params;
  if (!p.label) {
    p.label = wantsSchedule
      ? `Friday ${amount || 1} USDC transfer`
      : 'Treasury USDC low alert';
  }

  if (!p.trigger) {
    if (wantsSchedule) {
      p.trigger = { type: 'schedule', cron: FRIDAY_CRON };
    } else if (wantsAlert) {
      const m = context.match(/(?:below|under|drops?\s+below|less\s+than)\s+(\d+(?:\.\d+)?)/i);
      p.trigger = {
        type: 'threshold',
        wallet: 'Treasury Primary',
        token: 'USDC',
        operator: '<',
        value: m ? Number(m[1]) : 100,
      };
    }
  }

  if (!p.action) {
    if (p.trigger?.type === 'schedule') {
      const { from, to } = inferTransferWallets(context);
      p.action = { type: 'transfer', token: 'USDC', amount: amount || 1, from, to };
    } else if (p.trigger?.type === 'threshold') {
      p.action = {
        type: 'alert',
        level: 'warn',
        message: `Treasury USDC dropped below ${p.trigger.value}`,
      };
    }
  } else if (p.action.type === 'transfer') {
    const { from, to } = inferTransferWallets(context);
    if (!p.action.from) p.action.from = from;
    if (!p.action.to) p.action.to = to;
    if (!p.action.amount) p.action.amount = amount || 1;
    if (!p.action.token) p.action.token = 'USDC';
  }

  if (isCompleteRuleParams(p)) {
    if (p.trigger?.type === 'schedule' && p.action?.type === 'transfer') {
      action.summary = `Rule: ${p.action.amount} USDC from ${p.action.from} to ${p.action.to}, every Friday 09:00 UTC.`;
    } else if (p.trigger?.type === 'threshold') {
      action.summary = `Rule: alert when ${p.trigger.wallet} ${p.trigger.token} ${p.trigger.operator} ${p.trigger.value}.`;
    }
    action.intent = 'rule_create';
    action.requires_approval = true;
  }

  return action;
}

function buildContext(walletsContext) {
  if (!walletsContext?.length) return '';
  return `\n\nAVAILABLE WALLETS:\n${walletsContext.map(w => `- "${w.label}" (${w.address})`).join('\n')}`;
}

// Gemini requires history to start with role 'user'. slice(-N) can cut mid-turn (model first).
function normalizeGeminiHistory(chatHistory, maxMessages = 6) {
  const mapped = (chatHistory ?? [])
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(msg.content ?? '') }],
    }))
    .filter((m) => m.parts[0].text);

  let slice = mapped.slice(-maxMessages);

  // Drop incomplete trailing user (failed prior request left user without assistant reply).
  if (slice.length && slice[slice.length - 1].role === 'user') {
    slice = slice.slice(0, -1);
  }

  // Never start on a model turn — walk forward until we hit a user message.
  while (slice.length && slice[0].role === 'model') {
    slice = slice.slice(1);
  }

  return slice;
}

// ---------- Gemini provider ----------
async function callGemini(userMessage, { walletsContext, chatHistory }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT });

  const history = normalizeGeminiHistory(chatHistory);

  const chat = m.startChat({ history });
  let lastErr;
  for (let i = 0; i < 3; i += 1) {
    try {
      const result = await chat.sendMessage(userMessage + buildContext(walletsContext));
      return result.response.text();
    } catch (err) {
      lastErr = err;
      const status = Number(err?.status || 0);
      const retryable = status === 429 || status === 503;
      if (!retryable || i === 2) break;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------- Groq provider (OpenAI-compatible) ----------
async function callGroq(userMessage, { walletsContext, chatHistory }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing');
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(chatHistory ?? []).slice(-6).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: userMessage + buildContext(walletsContext) },
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

async function callLLM(userMessage, opts) {
  if (PROVIDER === 'groq') return callGroq(userMessage, opts);
  try {
    return await callGemini(userMessage, opts);
  } catch (err) {
    // Fail over to Groq when Gemini is throttled/unavailable and key is configured.
    if (process.env.GROQ_API_KEY) {
      try {
        return await callGroq(userMessage, opts);
      } catch {
        // fall through to original error below
      }
    }
    throw err;
  }
}

export async function parseCommand(userMessage, { walletsContext = [], chatHistory = [] } = {}) {
  const text = await callLLM(userMessage, { walletsContext, chatHistory });
  const parsed = normalizeAction(userMessage, extractJson(text), chatHistory);
  return { raw: text, parsed };
}

export async function generateReport({ transactions, balances, periodDays }) {
  const prompt = `You are a treasury analyst. Given this data, produce a concise English cashflow report.

Balances:
${JSON.stringify(balances, null, 2)}

Transactions (last ${periodDays} days):
${JSON.stringify(transactions.slice(0, 50), null, 2)}

Output: total inflow, total outflow, net change, and a 1-sentence recommendation.`;
  const text = await callLLM(prompt, { walletsContext: [], chatHistory: [] });
  return text;
}
