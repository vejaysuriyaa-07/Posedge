import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/Toasts';
import { UiProvider } from '../../app/ui';
import { resetAllData } from '../../db/backup';
import { db } from '../../db/db';
import { createProject } from '../../db/ops/projects';
import { createTask } from '../../db/ops/tasks';
import { mondayOf, todayStr } from '../../domain/week';
import { FlowHost } from './FlowHost';
import { closePlanner, getFlow, openFlow, setFlow, updateFlow } from './flowStore';

// Finishing the only Big 3 task celebrates; jsdom has no canvas for confetti.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UiProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </UiProvider>
    </ToastProvider>
  );
}

async function seed() {
  const p = await createProject({
    name: 'DV Interview Prep',
    emoji: '🎯',
    color: 'violet',
    kind: 'prep',
  });
  const day = todayStr();
  const base = { projectId: p.id, day, weekStart: mondayOf(day) };
  await createTask({ ...base, title: 'Read the UVM chapter', estimateMin: 30 });
  await createTask({ ...base, title: 'SVA drill', estimateMin: 45, isBig3: true });
  await createTask({ ...base, title: 'Tidy notes' });
}

/** Moves the current stint's start back, as if that much time had passed. */
function spend(minutes: number) {
  act(() =>
    updateFlow((s) => ({
      ...s,
      current: s.current
        ? { ...s.current, startedAt: s.current.startedAt - minutes * 60_000 }
        : null,
    })),
  );
}

beforeEach(async () => {
  await resetAllData();
  localStorage.clear();
  act(() => {
    setFlow(null);
    closePlanner();
  });
});

describe('Flow', () => {
  it('plans, runs a task to done, logs the time, and ends with a summary', async () => {
    const user = userEvent.setup();
    await seed();
    render(<FlowHost />, { wrapper: Providers });
    act(() => openFlow());

    const planner = await screen.findByRole('dialog', { name: 'Plan a flow' });
    const order = await within(planner).findByRole('list', { name: 'Flow order' });
    // Big 3 goes first; a task without an estimate counts as 25 minutes.
    await waitFor(() => expect(within(order).getAllByRole('listitem')).toHaveLength(3));
    expect(within(order).getAllByRole('listitem')[0]).toHaveTextContent('SVA drill');
    expect(planner).toHaveTextContent('3 tasks · 1h 40m');
    await user.click(within(planner).getByLabelText('Include Tidy notes'));
    expect(planner).toHaveTextContent('2 tasks · 1.25h');

    await user.click(within(planner).getByRole('button', { name: 'Start flow' }));
    const run = await screen.findByRole('dialog', { name: 'Flow' });
    expect(within(run).getByRole('heading', { level: 1 })).toHaveTextContent('SVA drill');
    expect(within(run).getByRole('timer')).toHaveTextContent('45:00');
    await waitFor(() =>
      expect(within(run).getByRole('button', { name: 'Pause (Space)' })).toHaveFocus(),
    );

    spend(12);
    await user.click(within(run).getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(within(run).getByRole('heading', { level: 1 })).toHaveTextContent(
        'Read the UVM chapter',
      ),
    );
    await waitFor(async () => {
      const t = await db.tasks.filter((x) => x.title === 'SVA drill').first();
      expect(t?.status).toBe('done');
    });
    await waitFor(async () => expect(await db.focusSessions.count()).toBe(1));
    expect((await db.focusSessions.toArray())[0]).toMatchObject({ minutes: 12 });

    await user.click(within(run).getByRole('button', { name: 'End flow' }));
    const summary = await screen.findByRole('dialog', { name: 'Flow summary' });
    expect(within(summary).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Good stopping point',
    );
    expect(summary).toHaveTextContent('One task done, with 12m of focus.');
    await user.click(within(summary).getByRole('button', { name: 'Back to Today' }));
    expect(getFlow()).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('defers, extends, pauses with the keyboard and minimizes to a pill', async () => {
    const user = userEvent.setup();
    await seed();
    render(<FlowHost />, { wrapper: Providers });
    act(() => openFlow());
    const planner = await screen.findByRole('dialog', { name: 'Plan a flow' });
    await waitFor(() => expect(within(planner).getAllByRole('listitem')).toHaveLength(3));
    await user.click(within(planner).getByRole('button', { name: 'Start flow' }));
    const run = await screen.findByRole('dialog', { name: 'Flow' });
    await waitFor(() =>
      expect(within(run).getByRole('heading', { level: 1 })).toHaveTextContent('SVA drill'),
    );

    await user.click(within(run).getByRole('button', { name: 'Later' }));
    expect(within(run).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Read the UVM chapter',
    );
    expect(getFlow()?.queue.at(-1)).toBeDefined();

    await user.keyboard('+');
    expect(within(run).getByRole('timer')).toHaveTextContent('35:00');
    await user.keyboard(' ');
    expect(within(run).getByRole('timer')).toHaveTextContent('Paused');

    await user.keyboard('{Escape}');
    const pill = await screen.findByRole('timer', { name: /^Flow: Read the UVM chapter/ });
    expect(pill).toHaveAccessibleName(/paused/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open flow full screen' }));
    expect(await screen.findByRole('dialog', { name: 'Flow' })).toBeInTheDocument();
  });

  it('moves on when the current task is completed elsewhere', async () => {
    const user = userEvent.setup();
    await seed();
    render(<FlowHost />, { wrapper: Providers });
    act(() => openFlow());
    const planner = await screen.findByRole('dialog', { name: 'Plan a flow' });
    await waitFor(() => expect(within(planner).getAllByRole('listitem')).toHaveLength(3));
    await user.click(within(planner).getByRole('button', { name: 'Start flow' }));
    const run = await screen.findByRole('dialog', { name: 'Flow' });
    await waitFor(() =>
      expect(within(run).getByRole('heading', { level: 1 })).toHaveTextContent('SVA drill'),
    );
    const sva = await db.tasks.filter((x) => x.title === 'SVA drill').first();
    await db.tasks.update(sva!.id, { status: 'done', completedAt: new Date().toISOString() });
    await waitFor(() =>
      expect(within(run).getByRole('heading', { level: 1 })).toHaveTextContent(
        'Read the UVM chapter',
      ),
    );
    expect(getFlow()?.done).toEqual([
      expect.objectContaining({ taskId: sva!.id, outcome: 'done' }),
    ]);
  });
});
