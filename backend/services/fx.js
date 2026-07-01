// FX oracle. Pulls a fiat USD/EUR rate from a free public source and caches it briefly.
// Stablecoin assumption: 1 USDC ≈ 1 USD, 1 EURC ≈ 1 EUR. Pegs can drift, but that drift
// is what fx_rate triggers care about — exact pricing requires a real on-chain oracle.
//
// Source: exchangerate.host (free, no key). If it goes down, the cached value is reused.

let cache = { ts: 0, rates: null };
const TTL_MS = 60_000; // 1 minute

const PRIMARY = 'https://api.exchangerate.host/latest?base=USD&symbols=EUR';
const FALLBACK = 'https://open.er-api.com/v6/latest/USD';

async function fetchPrimary() {
  const res = await fetch(PRIMARY, { signal: AbortSignal.timeout?.(5000) });
  if (!res.ok) throw new Error(`fx primary ${res.status}`);
  const json = await res.json();
  const eur = json?.rates?.EUR;
  if (typeof eur !== 'number') throw new Error('fx primary: bad payload');
  return { source: 'exchangerate.host', usd_eur: eur, eur_usd: 1 / eur };
}

async function fetchFallback() {
  const res = await fetch(FALLBACK, { signal: AbortSignal.timeout?.(5000) });
  if (!res.ok) throw new Error(`fx fallback ${res.status}`);
  const json = await res.json();
  const eur = json?.rates?.EUR;
  if (typeof eur !== 'number') throw new Error('fx fallback: bad payload');
  return { source: 'open.er-api.com', usd_eur: eur, eur_usd: 1 / eur };
}

export async function getFxRates() {
  const now = Date.now();
  if (cache.rates && (now - cache.ts) < TTL_MS) {
    return { ...cache.rates, cached: true, age_ms: now - cache.ts };
  }
  let rates;
  try {
    rates = await fetchPrimary();
  } catch (e1) {
    try {
      rates = await fetchFallback();
    } catch (e2) {
      if (cache.rates) {
        // Both upstreams failed — serve stale rather than break rules.
        return { ...cache.rates, cached: true, stale: true, age_ms: now - cache.ts };
      }
      throw new Error(`FX upstreams failed: ${e1.message} | ${e2.message}`);
    }
  }
  cache = { ts: now, rates };
  return { ...rates, cached: false, age_ms: 0 };
}

// Returns the numeric rate for a stablecoin pair like "USDC/EURC".
export async function getPairRate(pair) {
  const r = await getFxRates();
  const norm = String(pair || '').toUpperCase().replace(/\s+/g, '');
  switch (norm) {
    case 'USDC/EURC':
    case 'USD/EUR':
      return r.usd_eur;
    case 'EURC/USDC':
    case 'EUR/USD':
      return r.eur_usd;
    default:
      throw new Error(`unsupported pair: ${pair}`);
  }
}
