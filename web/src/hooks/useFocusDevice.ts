import { useEffect, useState } from "react";
import { useAppPreferences } from "@/hooks/useAppPreferences";

let audio: AudioContext | undefined;
export function unlockCompletionSound() {
  try { audio ??= new AudioContext(); void audio.resume().catch(() => undefined); } catch { /* Audio is optional. */ }
}
export function playCompletionSound() {
  if (!audio || audio.state !== "running") return;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = audio!.createOscillator();
    const gain = audio!.createGain();
    const start = audio!.currentTime + index * 0.16;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    oscillator.connect(gain); gain.connect(audio!.destination);
    oscillator.start(start); oscillator.stop(start + 0.45);
  });
}
/** Asks once, from a user gesture, so a session that ends in a background tab can still alert. */
export function requestCompletionNotifications() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Promise.resolve(Notification.requestPermission()).catch(() => undefined);
}
export function notifyCompletion(body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try {
    const notification = new Notification("Pomodoro complete", { body, tag: "pokus-timer", icon: "/pwa-192.png" });
    notification.onclick = () => { window.focus(); notification.close(); };
  } catch { /* Some browsers only allow notifications from a service worker. */ }
}
export function useFocusDevice(running: boolean) {
  const { keepAwake } = useAppPreferences();
  const [wakeError, setWakeError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (!alive || !running || !keepAwake || document.visibilityState !== "visible") return;
      if (!("wakeLock" in navigator)) { setWakeError("Keeping the screen awake is not supported here."); return; }
      try {
        if (lock && !lock.released) return;
        const next = await navigator.wakeLock.request("screen");
        if (!alive) { await next.release(); return; }
        lock = next; setWakeError(null);
        lock.addEventListener("release", () => { if (alive && document.visibilityState === "visible") setWakeError("Screen wake lock was released. Your timer will still recover when you return."); });
      } catch { if (alive) setWakeError("The screen may sleep. Your timer will still recover when you return."); }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { alive = false; document.removeEventListener("visibilitychange", acquire); void lock?.release().catch(() => undefined); };
  }, [keepAwake, running]);
  return keepAwake && running ? wakeError : null;
}
