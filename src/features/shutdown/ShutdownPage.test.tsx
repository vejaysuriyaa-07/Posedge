import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../app/Toasts';
import { UiProvider } from '../../app/ui';
import { resetAllData } from '../../db/backup';
import { db } from '../../db/db';
import { createProject } from '../../db/ops/projects';
import { completeTask, createTask } from '../../db/ops/tasks';
import { nextWorkDay, shutdownDate } from '../../domain/shutdown';
import { mondayOf } from '../../domain/week';
import ShutdownPage from './ShutdownPage';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UiProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </UiProvider>
    </ToastProvider>
  );
}

const day = shutdownDate(new Date());

beforeEach(async () => {
  await resetAllData();
  const p = await createProject({ name: 'EE 577A', emoji: '🔲', color: 'indigo', kind: 'course' });
  const base = { projectId: p.id, day, weekStart: mondayOf(day) };
  const done = (await createTask({ ...base, title: 'Read chapter 4' })).task;
  await completeTask(done.id);
  await createTask({ ...base, title: 'Run DRC', estimateMin: 60 });
  await createTask({ ...base, title: 'Email the TA' });
});

describe('Daily shutdown', () => {
  it('tallies the day, carries tasks forward, and closes the day', async () => {
    const user = userEvent.setup();
    render(<ShutdownPage />, { wrapper: Providers });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/^Wrapping up /);
    expect(await screen.findByText('Read chapter 4')).toBeInTheDocument();

    const drc = await screen.findByRole('radiogroup', { name: 'Where Run DRC goes' });
    const ta = screen.getByRole('radiogroup', { name: 'Where Email the TA goes' });
    expect(within(drc).getByRole('radio', { name: 'Keep' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('button', { name: /^All to / }));
    await user.click(within(ta).getByRole('radio', { name: 'Backlog' }));
    await user.click(screen.getByRole('radio', { name: 'Good' }));
    await user.type(screen.getByPlaceholderText(/What went well/), 'Solid lab day');
    await user.click(screen.getByRole('button', { name: 'Shut down' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/, wrapped$/),
    );
    expect(screen.getByText('Solid lab day')).toBeInTheDocument();
    expect(screen.getByText('Felt good')).toBeInTheDocument();
    const next = nextWorkDay(day, []);
    await waitFor(async () => {
      const tasks = await db.tasks.toArray();
      expect(tasks.find((t) => t.title === 'Run DRC')?.day).toBe(next);
      const email = tasks.find((t) => t.title === 'Email the TA');
      expect(email?.day).toBeUndefined();
      expect(email?.weekStart).toBe(mondayOf(next));
    });
    expect(await db.dayLogs.get(day)).toMatchObject({ energy: 4, note: 'Solid lab day' });
    expect(screen.getByText(/Moved 2 tasks forward/)).toBeInTheDocument();
  });
});
