import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/Toasts';
import { resetAllData } from '../../db/backup';
import { db, getSettings, updateSettings } from '../../db/db';
import { createProject } from '../../db/ops/projects';
import ImportPage from './ImportPage';

// jsdom doesn't implement scrolling.
Element.prototype.scrollIntoView = vi.fn();

function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </ToastProvider>
  );
}

const PACK = {
  name: '2026-10-18.md',
  fetchedAt: '2026-10-18T14:00:00.000Z',
  text: [
    '> EE 658 exam is Friday; one form to finish.',
    '',
    '# Project: EE 658',
    '- [ ] Finish the safety training ~45m due:2026-10-31',
    '  Source: email from HR',
  ].join('\n'),
};

beforeEach(async () => {
  await resetAllData();
  await createProject({ name: 'EE 658', emoji: '🧪', color: 'teal', kind: 'work' });
  await updateSettings({ inboxPending: [PACK] });
});

describe('Import: from your inbox', () => {
  it('reviews a pack in the preview and resolves it on import', async () => {
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper: Providers });
    const panel = await screen.findByRole('region', { name: 'From your inbox' });
    expect(panel).toHaveTextContent('EE 658 exam is Friday');
    expect(panel).toHaveTextContent('1 suggestion');

    await user.click(screen.getByRole('button', { name: 'Review' }));
    const editor = screen.getByLabelText<HTMLTextAreaElement>('Plan to import (Markdown or JSON)');
    expect(editor.value.startsWith('# Project: EE 658')).toBe(true);
    expect(screen.getByRole('button', { name: 'In review below' })).toBeDisabled();
    expect(await screen.findByText('Finish the safety training')).toBeInTheDocument();
    expect(screen.getByText(/matches existing/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Import 1 task$/ }));
    await waitFor(async () => expect((await getSettings()).inboxPending).toEqual([]));
    expect((await getSettings()).inboxSeen).toContain('2026-10-18.md');
    const task = (await db.tasks.toArray())[0];
    expect(task).toMatchObject({ title: 'Finish the safety training', dueDate: '2026-10-31' });
    expect(task?.notes).toBe('Source: email from HR');
    expect(await screen.findByText('Imported 1 task from your inbox.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'From your inbox' })).not.toBeInTheDocument();

    // Undo removes the tasks and puts the pack back.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await getSettings()).inboxPending).toHaveLength(1));
    expect(await screen.findByRole('region', { name: 'From your inbox' })).toBeInTheDocument();
  });

  it('dismisses a pack, with undo', async () => {
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'From your inbox' })).not.toBeInTheDocument(),
    );
    expect(await db.tasks.count()).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('region', { name: 'From your inbox' })).toBeInTheDocument();
  });

  it('keeps a pasted plan recoverable when a pack replaces it', async () => {
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper: Providers });
    const editor = screen.getByLabelText<HTMLTextAreaElement>('Plan to import (Markdown or JSON)');
    await user.type(editor, 'my own plan');
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    expect(editor.value).toMatch(/^# Project: EE 658/);
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(editor.value).toBe('my own plan');
  });
});
