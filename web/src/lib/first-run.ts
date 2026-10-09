const key = (owner: string) => `pokus-welcome-dismissed:${owner}`;

export function welcomeDismissed(owner: string) {
  try { return localStorage.getItem(key(owner)) === "true"; } catch { return false; }
}
export function dismissWelcome(owner: string) {
  try { localStorage.setItem(key(owner), "true"); } catch { /* The card simply shows again next time. */ }
}
/** A brand-new account: nothing created yet and no focus history, once everything has loaded. */
export function isFirstRun(counts: { projects: number; tasks: number; captures: number; sessions: number }) {
  return Object.values(counts).every((count) => count === 0);
}
