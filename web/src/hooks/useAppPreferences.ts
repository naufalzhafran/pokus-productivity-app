import { useSyncExternalStore } from "react";

export interface AppPreferences { theme: "system" | "light" | "dark"; sound: boolean; keepAwake: boolean; reviewAfterSession: boolean; /** Pokus the daily plan fills each day. */ dailyCapacity: number }
export const DAILY_CAPACITY_RANGE = { min: 1, max: 12 } as const;
const defaults: AppPreferences = { theme: "system", sound: true, keepAwake: false, reviewAfterSession: true, dailyCapacity: 6 };
function readCapacity(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= DAILY_CAPACITY_RANGE.min && value <= DAILY_CAPACITY_RANGE.max ? value : defaults.dailyCapacity;
}
const key = "pokus-device-preferences-v1";
function read(): AppPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return { theme: ["system", "light", "dark"].includes(value?.theme) ? value.theme : "system", sound: value?.sound !== false, keepAwake: value?.keepAwake === true, reviewAfterSession: value?.reviewAfterSession !== false, dailyCapacity: readCapacity(value?.dailyCapacity) };
  } catch { return defaults; }
}
let preferences = read();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function updateAppPreferences(update: Partial<AppPreferences>) {
  preferences = { ...preferences, ...update };
  try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Settings still work for this launch. */ }
  listeners.forEach((listener) => listener());
}
window.addEventListener("storage", (event) => {
  if (event.key === key) { preferences = read(); listeners.forEach((listener) => listener()); }
});
export function useAppPreferences() {
  return useSyncExternalStore(subscribe, () => preferences, () => defaults);
}
export function applyAppearance() {
  const dark = preferences.theme === "dark" || (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  // Either OS media query may match when the user explicitly overrides appearance.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", dark ? "#0E0E22" : "#F7F7FB");
  });
}
export function watchAppearance() {
  applyAppearance();
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", applyAppearance);
  const unsubscribe = subscribe(applyAppearance);
  return () => { query.removeEventListener("change", applyAppearance); unsubscribe(); };
}
