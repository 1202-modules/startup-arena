const SESSION_KEY = "startup-game-current-session";

export function readSessionId(): string | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveSessionId(id: string): void {
  try { localStorage.setItem(SESSION_KEY, id); } catch { /* The in-memory session remains usable. */ }
}

export function clearSessionId(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* Nothing else to clear. */ }
}
