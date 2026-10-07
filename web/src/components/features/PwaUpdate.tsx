import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { canApplyUpdate } from "@/lib/pwa";

export function PwaUpdate({ hasSession = false, saving = false }: { hasSession?: boolean; saving?: boolean }) {
  const [hasOverlay, setHasOverlay] = useState(false);
  const [error, setError] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError() { setError(true); },
    onRegisteredSW(_url, registration) {
      setRegistration(registration);
    },
  });
  useEffect(() => {
    const update = () => { if (registration && navigator.onLine && document.visibilityState === "visible") void registration.update().catch(() => undefined); };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [registration]);
  useEffect(() => {
    const check = () => setHasOverlay(Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]')));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true }); check();
    return () => observer.disconnect();
  }, []);
  if (!needRefresh && !error) return null;
  const allowed = canApplyUpdate(hasSession, hasOverlay, saving);
  return <div className="app-notice" role="status">
    <p>{error ? "Offline installation could not finish. Reconnect and reload to try again." : allowed ? "A new version of Pokus is ready." : "Update ready. Finish your session and close any open sheets to update."}</p>
    {needRefresh ? <Button size="sm" variant="outline" disabled={!allowed} onClick={() => { if (canApplyUpdate(hasSession, Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]')), saving)) void updateServiceWorker(true).catch(() => setError(true)); }}>Update app</Button> : null}
  </div>;
}
