export function canApplyUpdate(hasSession: boolean, hasOverlay: boolean, saving: boolean) {
  return !hasSession && !hasOverlay && !saving;
}
export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
