import { useEffect } from 'react';
import { consumeUpdatedFlag, setupPwa } from './pwa';
import { useToast } from './Toasts';

/** Registers the service worker once and surfaces update / offline-ready toasts. */
export function PwaStatus() {
  const { toast } = useToast();
  useEffect(() => {
    if (consumeUpdatedFlag()) toast({ message: 'Updated to new version', tone: 'success' });
    if (import.meta.env.PROD) setupPwa(() => toast('Posedge now works offline.'));
  }, [toast]);
  return null;
}
