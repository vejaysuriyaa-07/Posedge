import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { MODEL_OPTIONS, resolveModel, testKey, type AiError } from '../../ai/client';
import { Button } from '../../components/Button';
import { Input, Select } from '../../components/Field';
import { Toggle } from '../../components/Toggle';
import { updateSettings } from '../../db/db';
import { recordAiUsage } from '../../db/ops/ai';
import type { Settings } from '../../db/types';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </div>
  );
}

const fmt = new Intl.NumberFormat('en-US');

/** Settings > AI: key, test, model, enable toggle, monthly usage and the privacy note. */
export function AiSettings({ s }: { s: Settings }) {
  const [show, setShow] = useState(false);
  const [keyDraft, setKeyDraft] = useState(s.aiApiKey ?? '');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const custom = !!s.aiModelOverride;
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const usage = s.aiUsage?.month === month ? s.aiUsage : null;

  const saveKey = () => {
    const k = keyDraft.trim();
    if (k !== (s.aiApiKey ?? '')) void updateSettings({ aiApiKey: k || undefined });
  };

  const runTest = async () => {
    const k = keyDraft.trim();
    if (!k) return;
    saveKey();
    setTesting(true);
    setStatus(null);
    try {
      const u = await testKey({ apiKey: k, model: resolveModel(s) });
      await recordAiUsage(u);
      setStatus({ ok: true, text: `Key works with ${resolveModel(s)}.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as AiError).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-surface p-5 shadow-card">
      <div>
        <h2 className="flex items-center gap-2 text-base">
          <Sparkles size={16} className="text-brand" aria-hidden /> AI
        </h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Powers "Ask your brain" in the Brain. Uses your own Anthropic API key.
        </p>
      </div>
      <Toggle
        checked={s.aiEnabled}
        onChange={(v) => void updateSettings({ aiEnabled: v })}
        label="Enable AI features"
        description={s.aiApiKey ? undefined : 'Add an API key below to use AI.'}
      />
      <Row
        label="Anthropic API key"
        hint={
          <>
            Create one in the{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              Anthropic Console
            </a>
            .
          </>
        }
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={show ? 'text' : 'password'}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onBlur={saveKey}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Anthropic API key"
              className="pr-10 font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide API key' : 'Show API key'}
              className="absolute top-0 right-0 grid size-10 place-items-center text-muted hover:text-fg"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <Button onClick={() => void runTest()} disabled={!keyDraft.trim() || testing}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : null} Test key
          </Button>
        </div>
        {status ? (
          <p role="status" className={`text-[13px] ${status.ok ? 'text-ok' : 'text-warn'}`}>
            {status.text}
          </p>
        ) : null}
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Model">
          <Select
            value={custom ? 'custom' : s.aiModel}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'custom')
                void updateSettings({ aiModelOverride: s.aiModelOverride || s.aiModel });
              else void updateSettings({ aiModel: v, aiModelOverride: undefined });
            }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="custom">Custom model id…</option>
          </Select>
        </Row>
        {custom ? (
          <Row label="Custom model id">
            <Input
              defaultValue={s.aiModelOverride}
              onBlur={(e) =>
                void updateSettings({ aiModelOverride: e.target.value.trim() || undefined })
              }
              placeholder="claude-…"
              spellCheck={false}
              className="font-mono text-[13px]"
            />
          </Row>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-elevated/60 p-3 text-center">
        <div>
          <div className="tabular text-lg font-semibold">{fmt.format(usage?.inputTokens ?? 0)}</div>
          <div className="text-[11px] text-muted">tokens in this month</div>
        </div>
        <div>
          <div className="tabular text-lg font-semibold">
            {fmt.format(usage?.outputTokens ?? 0)}
          </div>
          <div className="text-[11px] text-muted">tokens out this month</div>
        </div>
        <div>
          <div className="tabular text-lg font-semibold">{fmt.format(usage?.requests ?? 0)}</div>
          <div className="text-[11px] text-muted">requests</div>
        </div>
      </div>
      <Toggle
        checked={s.aiVoiceReplies}
        onChange={(v) => void updateSettings({ aiVoiceReplies: v })}
        label="Read answers aloud"
        description="Uses your browser's built-in voice. You can also toggle this from the ask box."
      />
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.aiKeyInBackup}
          onChange={(e) => void updateSettings({ aiKeyInBackup: e.target.checked })}
          className="size-4 accent-violet-500"
        />
        Include API key in backup
      </label>
      <p className="text-[13px] text-muted">
        Your key stays in this browser and is only sent to api.anthropic.com. API usage is billed by
        Anthropic separately from a claude.ai subscription. Set a spend limit in the Anthropic
        Console.
      </p>
    </section>
  );
}
