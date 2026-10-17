import { HardDrive, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../app/Toasts';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input, Select } from '../../components/Field';
import { Toggle } from '../../components/Toggle';
import { importBackup, parseBackup, resetAllData, type Backup } from '../../db/backup';
import { updateSettings } from '../../db/db';
import { setVacationMode } from '../../db/ops/review';
import { loadTemplate, removeSampleData } from '../../db/seed';
import type { Settings, Theme } from '../../db/types';
import { WEEKDAY_SHORT } from '../../domain/week';
import { useSettings } from '../../hooks/useSettings';
import { exportAndDownload } from './download';

export const REPO_URL = 'https://github.com/vejaysuriyaa-07/Posedge';

function Section({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-surface p-5 shadow-card">
      <div>
        <h2 className="text-base">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const THEMES: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'system', label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  const s = useSettings();
  const save = (patch: Partial<Omit<Settings, 'id'>>) => void updateSettings(patch);
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <h1 className="text-2xl">Settings</h1>

      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={s.theme === key}
              onClick={() => save({ theme: key })}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border text-sm ${s.theme === key ? 'border-brand bg-brand/10' : 'border-border text-muted hover:text-fg'}`}
            >
              <Icon size={16} aria-hidden /> {label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Planning"
        description="How many hours you realistically have each day, and which days are for resting."
      >
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAY_SHORT.map((d, i) => (
            <label key={d} className="grid gap-1 text-center text-[12px] text-muted">
              {d}
              <Input
                type="number"
                min={0}
                max={16}
                step={0.5}
                aria-label={`${d} capacity in hours`}
                className="px-1 text-center"
                value={(s.capacityMinByWeekday[i] ?? 0) / 60}
                onChange={(e) => {
                  const next = [...s.capacityMinByWeekday];
                  next[i] = Math.max(0, Math.round(Number(e.target.value) * 60));
                  save({ capacityMinByWeekday: next });
                }}
              />
            </label>
          ))}
        </div>
        <div>
          <p className="mb-2 text-[13px] text-muted">Rest days (never break your streak)</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_SHORT.map((d, i) => {
              const on = s.restDays.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    save({
                      restDays: on ? s.restDays.filter((x) => x !== i) : [...s.restDays, i].sort(),
                    })
                  }
                  className={`min-h-10 min-w-12 rounded-lg border px-3 text-sm ${on ? 'border-sky-400/60 bg-sky-500/10' : 'border-border text-muted hover:text-fg'}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section title="Review" description="Spaced repetition settings.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[13px] text-muted">
            Daily review cap
            <Input
              type="number"
              min={5}
              max={500}
              value={s.dailyReviewCap}
              onChange={(e) =>
                save({ dailyReviewCap: Math.max(1, Math.round(Number(e.target.value) || 1)) })
              }
            />
          </label>
          <label className="grid gap-1 text-[13px] text-muted">
            New cards per day
            <Input
              type="number"
              min={0}
              max={100}
              value={s.newCardsPerDay}
              onChange={(e) =>
                save({ newCardsPerDay: Math.max(0, Math.round(Number(e.target.value) || 0)) })
              }
            />
          </label>
        </div>
        <label className="grid gap-2 text-[13px] text-muted">
          <span className="flex justify-between">
            Target retention{' '}
            <span className="tabular font-medium text-fg">
              {Math.round(s.requestRetention * 100)}%
            </span>
          </span>
          <input
            type="range"
            min={0.8}
            max={0.95}
            step={0.01}
            value={s.requestRetention}
            onChange={(e) => save({ requestRetention: Number(e.target.value) })}
            className="accent-violet-500"
          />
          <span>
            At {Math.round(s.requestRetention * 100)}%, you should remember about{' '}
            {Math.round(s.requestRetention * 10)} in 10 cards when they come due. Higher means more
            frequent reviews; lower means fewer reviews but more forgetting.
          </span>
        </label>
        <VacationToggle on={s.vacationMode} />
      </Section>

      <Section title="Motivation">
        <Toggle
          checked={s.gamification}
          onChange={(v) => save({ gamification: v })}
          label="XP and levels"
          description="Off hides XP and levels. Streaks and the heatmap stay."
        />
        <Toggle
          checked={s.confetti}
          onChange={(v) => save({ confetti: v })}
          label="Confetti"
          description="Only for milestones, all Big 3, level ups, weekly reviews and 10+ card sessions."
        />
        <label className="flex min-h-10 items-center justify-between gap-4 text-sm">
          Backup reminder
          <Select
            className="w-40"
            value={s.backupReminderDays}
            onChange={(e) => save({ backupReminderDays: Number(e.target.value) })}
          >
            <option value={0}>Off</option>
            <option value={3}>Every 3 days</option>
            <option value={7}>Every week</option>
            <option value={14}>Every 2 weeks</option>
            <option value={30}>Every month</option>
          </Select>
        </label>
      </Section>

      <DataSection lastBackupAt={s.lastBackupAt} />
      <StorageSection />

      <Section title="About">
        <p className="text-sm text-muted">
          Posedge v{__APP_VERSION__}. Every day is a posedge.{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Source on GitHub
          </a>
        </p>
      </Section>
    </div>
  );
}

function VacationToggle({ on }: { on: boolean }) {
  const { toast } = useToast();
  return (
    <Toggle
      checked={on}
      label="Vacation mode"
      description="Nothing comes due and your streak is frozen. When you turn it off, due dates shift forward by the time you were away."
      onChange={async (v) => {
        const days = await setVacationMode(v);
        toast(
          v
            ? 'Vacation mode on. Enjoy the break.'
            : days
              ? `Welcome back. Due dates moved ${days} day${days === 1 ? '' : 's'} later.`
              : 'Vacation mode off.',
        );
      }}
    />
  );
}

function DataSection({ lastBackupAt }: { lastBackupAt?: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');

  const onFile = async (file: File) => {
    const r = parseBackup(await file.text());
    if (!r.ok) {
      toast({ message: `Couldn't read that backup: ${r.errors[0]}`, tone: 'warn', duration: 8000 });
      return;
    }
    setPending(r.backup);
  };

  return (
    <Section
      title="Data"
      description="Everything lives in this browser. Phone and laptop are separate; export a backup regularly."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={async () => {
            await exportAndDownload();
            toast('Backup downloaded.');
          }}
        >
          Export backup
        </Button>
        <Button onClick={() => fileRef.current?.click()}>Import backup</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <span className="text-[12px] text-muted">
          {lastBackupAt
            ? `Last backup ${new Date(lastBackupAt).toLocaleDateString()}`
            : 'No backup yet'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const n = await loadTemplate();
            await updateSettings({ onboarded: true });
            toast(n ? `Added ${n} template projects.` : 'Template projects are already here.');
          }}
        >
          Load VJ starter template
        </Button>
        <Button
          onClick={async () => {
            const r = await removeSampleData();
            toast(`Removed ${r.tasks} sample tasks and ${r.cards} sample cards.`);
          }}
        >
          Remove sample tasks
        </Button>
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          Reset all data
        </Button>
      </div>

      <Dialog
        open={!!pending && !confirmReplace}
        onClose={() => setPending(null)}
        title="Import backup"
        description={
          pending
            ? `Exported ${new Date(pending.exportedAt).toLocaleString()}: ${pending.data.projects.length} projects, ${pending.data.tasks.length} tasks, ${pending.data.reviewCards.length} cards.`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await importBackup(pending!, 'merge');
                setPending(null);
                toast('Backup merged.');
              }}
            >
              Merge
            </Button>
            <Button variant="danger" onClick={() => setConfirmReplace(true)}>
              Replace everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          <strong className="text-fg">Merge</strong> adds what&apos;s missing and keeps the newer
          copy of anything that exists in both. <strong className="text-fg">Replace</strong> wipes
          this browser&apos;s data first.
        </p>
      </Dialog>
      <Dialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        title="Replace all data?"
        description="Everything in this browser will be replaced by the backup. This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReplace(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await importBackup(pending!, 'replace');
                setConfirmReplace(false);
                setPending(null);
                toast('Backup restored.');
              }}
            >
              Replace
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Tip: export a backup of the current data first.</p>
      </Dialog>
      <Dialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setResetText('');
        }}
        title="Reset all data?"
        description="Deletes every project, task, card and setting in this browser."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={resetText !== 'RESET'}
              onClick={async () => {
                await resetAllData();
                setResetOpen(false);
                setResetText('');
                toast('All data cleared.');
              }}
            >
              Reset everything
            </Button>
          </>
        }
      >
        <label className="grid gap-1.5 text-[13px] text-muted">
          Type RESET to confirm
          <Input value={resetText} onChange={(e) => setResetText(e.target.value)} data-autofocus />
        </label>
      </Dialog>
    </Section>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

function StorageSection() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      if (!alive) return;
      setPersisted(p);
      if (est) setUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    })();
    return () => {
      alive = false;
    };
  }, [tick]);
  return (
    <Section title="Storage">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <HardDrive size={18} className="text-muted" aria-hidden />
        <span className="flex-1">
          {persisted === null
            ? 'Checking storage…'
            : persisted
              ? 'Persistent storage is on: the browser will not clear Posedge data on its own.'
              : 'Storage is best-effort: the browser may clear data under storage pressure.'}
          {usage ? (
            <span className="block text-[12px] text-muted">
              Using {formatBytes(usage.usage)} of {formatBytes(usage.quota)}
            </span>
          ) : null}
        </span>
        {!persisted ? (
          <Button
            size="sm"
            onClick={async () => {
              const ok = (await navigator.storage?.persist?.().catch(() => false)) ?? false;
              await updateSettings({ storagePersisted: ok });
              setTick((t) => t + 1);
            }}
          >
            Request persistent storage
          </Button>
        ) : null}
      </div>
      <p className="text-[13px] text-muted">
        On iPhone/iPad Safari, data for sites you don&apos;t visit for 7 days can be deleted.
        Install to Home Screen and keep backups.
      </p>
    </Section>
  );
}
