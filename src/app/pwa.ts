import { registerSW } from 'virtual:pwa-register';

const UPDATED_FLAG = 'posedge-updated';

/**
 * Registers the service worker (autoUpdate). When a new version takes over, the page reloads;
 * a session flag lets the next load say "Updated to new version".
 */
export function setupPwa(onOfflineReady: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      try {
        sessionStorage.setItem(UPDATED_FLAG, '1');
      } catch {
        // ignore
      }
    }
  });
  registerSW({ immediate: true, onOfflineReady });
}

/** True once, right after an update reload. */
export function consumeUpdatedFlag(): boolean {
  try {
    const v = sessionStorage.getItem(UPDATED_FLAG);
    if (v) sessionStorage.removeItem(UPDATED_FLAG);
    return !!v;
  } catch {
    return false;
  }
}
