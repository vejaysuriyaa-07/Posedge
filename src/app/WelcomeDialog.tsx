import { useState } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Logo } from '../components/Logo';
import { updateSettings } from '../db/db';
import { loadTemplate } from '../db/seed';
import { useSettingsLoaded } from '../hooks/useSettings';
import { useToast } from './Toasts';

/** First-run choice: VJ's starter template or an empty workspace. */
export function WelcomeDialog() {
  const settings = useSettingsLoaded();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!settings || settings.onboarded) return null;

  const finish = async (template: boolean) => {
    setBusy(true);
    try {
      if (template) {
        const n = await loadTemplate();
        toast(`Loaded ${n} projects. Have a look at this week.`);
      }
      await updateSettings({ onboarded: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => void finish(false)} title="Welcome to Posedge" size="md">
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="text-base font-semibold">Every day is a posedge.</p>
            <p className="text-[13px] text-muted">
              Plan by the week, see progress, and keep what you study.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted">
          Everything stays in this browser. No account, no server. Export a backup from Settings now
          and then.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void finish(true)}
            data-autofocus
          >
            Start with VJ&apos;s template
          </Button>
          <Button disabled={busy} onClick={() => void finish(false)}>
            Start empty
          </Button>
        </div>
        <p className="text-[12px] text-muted">
          The template adds 10 projects (courses, DV prep, ISP, job pipeline), milestones, a few
          sample tasks for this week and 3 DV review cards. Remove the samples any time in Settings.
        </p>
      </div>
    </Dialog>
  );
}
