import { useEffect, useState } from "react";
import { Download, Lightbulb, Volume2, Sun, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppPreferences, updateAppPreferences, type AppPreferences } from "@/hooks/useAppPreferences";
import { unlockCompletionSound, playCompletionSound } from "@/hooks/useFocusDevice";
import { isStandalone } from "@/lib/pwa";

interface InstallPrompt extends Event { prompt(): Promise<{ outcome: string }> }
export function AppSettings() {
  const settings = useAppPreferences();
  const [installed, setInstalled] = useState(isStandalone);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ready, setReady] = useState(false);
  const [showHelp, setShowHelp] = useState(() => { try { return localStorage.getItem("pokus-install-dismissed") !== "true"; } catch { return true; } });
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    let alive = true;
    if ("serviceWorker" in navigator) void navigator.serviceWorker.ready.then(() => { if (alive) setReady(true); });
    window.addEventListener("beforeinstallprompt", install); window.addEventListener("appinstalled", complete);
    return () => { alive = false; window.removeEventListener("beforeinstallprompt", install); window.removeEventListener("appinstalled", complete); };
  }, []);
  return <Card><CardHeader><CardTitle>Make Pokus yours</CardTitle><CardDescription>Preferences for this device.</CardDescription></CardHeader><CardContent className="flex flex-col gap-6">
    <div className="flex flex-col gap-3"><p className="flex items-center gap-2 text-sm font-medium"><Sun className="size-4" />Appearance</p><ToggleGroup variant="outline" className="grid grid-cols-3" value={[settings.theme]} onValueChange={(values) => values[0] && updateAppPreferences({ theme: values[0] as AppPreferences["theme"] })} aria-label="Appearance">
      {(["system", "light", "dark"] as const).map((theme) => <ToggleGroupItem key={theme} value={theme}>{theme[0].toUpperCase() + theme.slice(1)}</ToggleGroupItem>)}
    </ToggleGroup></div>
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Volume2 className="size-4" />Completion sound</span><Checkbox checked={settings.sound} onCheckedChange={(checked) => { updateAppPreferences({ sound: Boolean(checked) }); if (checked) unlockCompletionSound(); }} /></label>
    {settings.sound ? <Button variant="outline" onClick={() => { unlockCompletionSound(); window.setTimeout(playCompletionSound, 100); }}>Test sound</Button> : null}
    <div><label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Smartphone className="size-4" />Keep screen awake</span><Checkbox checked={settings.keepAwake} onCheckedChange={(checked) => updateAppPreferences({ keepAwake: Boolean(checked) })} /></label><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Only while a timer is running and Pokus is open. Your phone may release this in low power mode.</p></div>
    <div><label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Lightbulb className="size-4" />Review knowledge after sessions</span><Checkbox checked={settings.reviewAfterSession} onCheckedChange={(checked) => updateAppPreferences({ reviewAfterSession: Boolean(checked) })} /></label><p className="mt-1 text-xs leading-relaxed text-muted-foreground">When a session ends, offer one knowledge note that’s due for review.</p></div>
    <p className="text-xs leading-relaxed text-muted-foreground">Sound plays while Pokus is open. When your phone is locked, the timer catches up when you return.</p>
    <div className="border-t pt-4"><p className="text-sm font-medium">{installed ? "Pokus is installed" : "Pokus on your Home Screen"}</p><p className="mt-1 text-xs text-muted-foreground">{ready ? "Ready for offline use after sign-in." : "Connect to finish preparing offline use."}</p>
      {!installed && (showHelp ? <div className="mt-3 flex flex-col gap-3 text-sm"><p className="leading-relaxed">{ios ? "In Safari, open Share, choose Add to Home Screen, then keep Open as Web App enabled and tap Add." : "Open your browser menu and choose Install app or Add to Home Screen."}</p>
        {prompt ? <Button onClick={async () => { await prompt.prompt(); setPrompt(null); }}><Download data-icon="inline-start" />Install Pokus</Button> : null}
        <Button variant="ghost" onClick={() => { setShowHelp(false); try { localStorage.setItem("pokus-install-dismissed", "true"); } catch { /* Dismiss for this launch. */ } }}>Dismiss instructions</Button>
      </div> : <Button variant="link" onClick={() => setShowHelp(true)}>Show install instructions</Button>)}
    </div>
  </CardContent></Card>;
}
