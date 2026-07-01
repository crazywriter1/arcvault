const STREAK_KEY = 'arcvault:gm_streak';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUtc() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function loadStreak() {
  if (typeof window === 'undefined') return { streak: 0, lastDate: null, pingedToday: false };
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const data = raw ? JSON.parse(raw) : { streak: 0, lastDate: null };
    const today = todayUtc();
    return {
      streak: data.streak || 0,
      lastDate: data.lastDate || null,
      pingedToday: data.lastDate === today,
    };
  } catch {
    return { streak: 0, lastDate: null, pingedToday: false };
  }
}

export function recordStreakPing() {
  if (typeof window === 'undefined') return loadStreak();
  const today = todayUtc();
  const yesterday = yesterdayUtc();
  const prev = loadStreak();
  if (prev.lastDate === today) return prev;

  let streak = 1;
  if (prev.lastDate === yesterday) streak = (prev.streak || 0) + 1;

  const next = { streak, lastDate: today };
  localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  return { ...next, pingedToday: true };
}
