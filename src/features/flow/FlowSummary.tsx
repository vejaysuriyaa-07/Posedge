import { Check, Circle, Moon, Sparkles, Sun } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { minutesToLog, summarizeFlow, type FlowState } from '../../domain/flow';
import { formatMinutes } from '../../domain/quickAddParser';
import { useProjects } from '../../hooks/useData';
import { useCountUp } from '../../hooks/useCountUp';
import type { FlowEngine } from './useFlowEngine';

/** End of a flow: what got done, time spent against the estimates, and where to go next. */
export function FlowSummary({ flow, engine }: { flow: FlowState; engine: FlowEngine }) {
  const navigate = useNavigate();
  const { byId } = useProjects();
  const sum = summarizeFlow(flow.done);
  const rows = flow.done.filter((d) => d.outcome === 'done' || minutesToLog(d.ms) > 0);
  const learn = flow.done.filter(
    (d) => d.outcome === 'done' && engine.tasks.get(d.taskId)?.kind === 'learn',
  ).length;
  const doneCount = useCountUp(sum.done);
  const minutes = useCountUp(sum.minutes);
  const delta = sum.spentDoneMin - sum.estimatedDoneMin;
  const evening = new Date().getHours() >= 17;
  const allDone = sum.done > 0 && sum.left === 0;

  const leave = (to: string) => {
    engine.actions.close();
    navigate(to);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-10 text-center sm:py-16">
      <div className="relative grid size-28 place-items-center">
        <span
          aria-hidden
          className="pe-ripple absolute inset-0 rounded-full border-2 border-brand"
        />
        <span
          aria-hidden
          className="pe-ripple absolute inset-0 rounded-full border border-brand [animation-delay:250ms]"
        />
        <span className="pe-rise grid size-20 place-items-center rounded-full bg-brand text-brand-fg shadow-[0_10px_40px_-8px_var(--pe-brand)]">
          {allDone ? <Check size={36} strokeWidth={2.5} /> : <Sparkles size={32} />}
        </span>
      </div>

      <h1 className="pe-rise mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
        {allDone ? 'Flow complete' : sum.done ? 'Good stopping point' : 'Flow ended'}
      </h1>
      <p className="pe-rise mt-2 text-[15px] text-muted">
        {sum.done
          ? `${sum.done === 1 ? 'One task' : `${sum.done} tasks`} done${sum.minutes ? `, with ${formatMinutes(sum.minutes)} of focus` : ''}.`
          : "Nothing finished this time, and that's okay. The time still counts."}
      </p>

      <dl className="pe-rise mt-8 grid w-full grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Tasks done" value={String(doneCount)} />
        <Stat label="Focus" value={formatMinutes(minutes) || '0m'} />
        <Stat
          label={
            !sum.done || Math.abs(delta) <= 2
              ? 'vs estimate'
              : delta > 0
                ? 'Over estimate'
                : 'Under estimate'
          }
          value={
            !sum.done ? '–' : Math.abs(delta) <= 2 ? 'On time' : formatMinutes(Math.abs(delta))
          }
        />
      </dl>

      {rows.length ? (
        <ul className="pe-rise mt-6 grid w-full grid-cols-1 gap-1.5 text-left">
          {rows.map((d) => {
            const t = engine.tasks.get(d.taskId);
            const p = t ? byId.get(t.projectId) : undefined;
            const spent = minutesToLog(d.ms);
            return (
              <li
                key={d.taskId}
                data-pc={p?.color}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-surface/80 px-3 py-2 text-[14px] backdrop-blur-sm"
              >
                {d.outcome === 'done' ? (
                  <Check size={16} className="shrink-0 text-ok" aria-label="Done" />
                ) : (
                  <Circle size={15} className="shrink-0 text-muted" aria-label="Not finished" />
                )}
                <span aria-hidden>{p?.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{t?.title ?? 'Deleted task'}</span>
                <span className="tabular shrink-0 text-[12.5px] text-muted">
                  {spent ? formatMinutes(spent) : '<1m'}
                  {d.outcome === 'done' ? ` of ~${formatMinutes(d.estimateMin)}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {learn ? (
        <p className="pe-rise mt-4 text-[13.5px] text-muted">
          {learn === 1 ? 'A learning task is' : `${learn} learning tasks are`} ready for cards in{' '}
          <Link
            to="/review"
            onClick={() => engine.actions.close()}
            className="font-medium text-brand hover:underline"
          >
            Review
          </Link>
          .
        </p>
      ) : null}

      <div className="pe-rise mt-8 flex flex-wrap justify-center gap-3">
        <Button
          variant="primary"
          data-autofocus
          onClick={() => leave('/')}
          className="min-h-11 px-5"
        >
          <Sun size={16} /> Back to Today
        </Button>
        <Button onClick={() => leave('/shutdown')} className="min-h-11 px-5">
          <Moon size={16} /> {evening ? 'Wrap up the day' : 'Daily shutdown'}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/80 px-2 py-3 backdrop-blur-sm">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-xl font-semibold sm:text-2xl">{value}</dd>
    </div>
  );
}
