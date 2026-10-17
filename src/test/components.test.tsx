import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../app/Toasts';
import { UiProvider } from '../app/ui';
import { TaskCard } from '../components/TaskCard';
import { resetAllData } from '../db/backup';
import { db, getSettings } from '../db/db';
import { createProject } from '../db/ops/projects';
import { createCards, reviewCardNow } from '../db/ops/review';
import { completeTask, createTask } from '../db/ops/tasks';
import { todayStr } from '../domain/week';
import { LockItInSheet } from '../features/review/LockItInSheet';
import { ReviewSession } from '../features/review/ReviewSession';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UiProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </UiProvider>
    </ToastProvider>
  );
}

async function setup() {
  const project = await createProject({
    name: 'DV Interview Prep',
    emoji: '🎯',
    color: 'violet',
    kind: 'prep',
  });
  return project;
}

beforeEach(async () => {
  await resetAllData();
});

describe('TaskCard', () => {
  it('completes a task: status, XP and the day count update in one go', async () => {
    const user = userEvent.setup();
    const project = await setup();
    const { task } = await createTask({
      projectId: project.id,
      title: 'Grade homework',
      day: todayStr(),
    });
    render(
      <Providers>
        <TaskCard task={task} project={project} today={todayStr()} />
      </Providers>,
    );
    await user.click(screen.getByRole('checkbox', { name: /Complete: Grade homework/ }));
    await waitFor(async () => expect((await db.tasks.get(task.id))?.status).toBe('done'));
    expect((await getSettings()).xpTotal).toBe(10);
    expect((await db.activityDays.get(todayStr()))?.tasksDone).toBe(1);
    expect(await screen.findByText('+10 XP')).toBeInTheDocument();
  });
});

describe('Lock it in', () => {
  it('creates cards for the finished learn task and clears Needs cards', async () => {
    const user = userEvent.setup();
    const project = await setup();
    const { task } = await createTask({
      projectId: project.id,
      title: 'SVA implication',
      kind: 'learn',
    });
    const done = await completeTask(task.id);
    expect(done?.task.needsCards).toBe(true);
    const onClose = vi.fn();
    render(
      <Providers>
        <LockItInSheet task={done!.task} project={project} onClose={onClose} />
      </Providers>,
    );
    expect(
      screen.getByRole('heading', { name: 'What should future-you be able to recall?' }),
    ).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /Save card/ });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Prompt'), 'What does |=> mean?');
    await user.type(
      screen.getByLabelText('Answer / your notes'),
      'Non-overlapping implication: check starts next cycle.',
    );
    expect(screen.getByLabelText('Tags')).toHaveValue('DV Interview Prep');
    await user.click(screen.getByRole('button', { name: /Save card/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const cards = await db.reviewCards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      taskId: task.id,
      prompt: 'What does |=> mean?',
      tags: ['DV Interview Prep'],
      queued: false,
    });
    expect((await db.tasks.get(task.id))?.needsCards).toBeUndefined();
  });
});

describe('Review session', () => {
  it('reveals the answer and records a rating', async () => {
    const user = userEvent.setup();
    const project = await setup();
    const { cards } = await createCards([
      { projectId: project.id, prompt: 'Which UVM phase consumes time?', answer: 'run_phase' },
    ]);
    await reviewCardNow(cards[0]!.id);
    const card = (await db.reviewCards.get(cards[0]!.id))!;
    render(
      <Providers>
        <ReviewSession initial={[card]} byId={new Map([[project.id, project]])} onDone={() => {}} />
      </Providers>,
    );
    expect(screen.getByText('Which UVM phase consumes time?')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.queryByText('run_phase')).not.toBeInTheDocument();
    await user.keyboard(' ');
    expect(await screen.findByText('run_phase')).toBeInTheDocument();
    const good = screen.getByRole('button', { name: /Good/ });
    expect(good).toHaveTextContent(/\d+(m|h|d|mo|y)/);
    await user.click(good);
    expect(await screen.findByText('Session done')).toBeInTheDocument();
    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.rating).toBe(3);
    expect((await getSettings()).xpTotal).toBe(2);
  });
});
