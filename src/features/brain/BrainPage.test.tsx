import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamChat } from '../../ai/client';
import { ToastProvider } from '../../app/Toasts';
import { UiProvider } from '../../app/ui';
import { resetAllData } from '../../db/backup';
import { getSettings, updateSettings } from '../../db/db';
import { createProject } from '../../db/ops/projects';
import { createTask } from '../../db/ops/tasks';
import { mondayOf, todayStr } from '../../domain/week';
import BrainPage from './BrainPage';

vi.mock('../../ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ai/client')>()),
  streamChat: vi.fn(),
}));

// jsdom has no 2D canvas; the core simply doesn't draw.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

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
  const project = await createProject({
    name: 'DV Interview Prep',
    emoji: '🎯',
    color: 'violet',
    kind: 'prep',
  });
  await createTask({
    projectId: project.id,
    title: 'SVA sequences',
    weekStart: mondayOf(todayStr()),
    day: todayStr(),
  });
  return project;
}

beforeEach(async () => {
  await resetAllData();
  vi.mocked(streamChat).mockReset();
});

describe('Brain', () => {
  it('shows the core, telemetry and nodes, with EDGE offline and no AI controls without a key', async () => {
    await seed();
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('NEURAL CORE');
    const nodes = screen.getByRole('region', { name: 'Nodes' });
    expect(
      await within(nodes).findByRole('button', { name: /DV Interview Prep/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /1 active projects in orbit: DV Interview Prep, 0 of 1 done/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/EDGE is offline/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Brief me' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ask EDGE')).toBeDisabled();
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('opens a project focus panel from the nodes list', async () => {
    const user = userEvent.setup();
    const project = await seed();
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: /DV Interview Prep/ }));
    const panel = screen.getByRole('region', { name: 'DV Interview Prep details' });
    expect(within(panel).getByRole('link', { name: 'Open project' })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    );
    await user.click(within(panel).getByRole('button', { name: 'Close details' }));
    expect(
      screen.queryByRole('region', { name: 'DV Interview Prep details' }),
    ).not.toBeInTheDocument();
  });

  it('briefs VJ with a streamed reply grounded in the snapshot, and records usage', async () => {
    const user = userEvent.setup();
    await seed();
    await updateSettings({ aiEnabled: true, aiApiKey: 'sk-ant-test' });
    vi.mocked(streamChat).mockImplementation(async ({ onText }) => {
      onText?.('Good evening, VJ. ', 'Good evening, VJ. ');
      onText?.('SVA sequences is on deck.', 'Good evening, VJ. SVA sequences is on deck.');
      return {
        text: 'Good evening, VJ. SVA sequences is on deck.',
        usage: { inputTokens: 900, outputTokens: 12 },
        stopReason: 'end_turn',
      };
    });
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Brief me' }));
    const log = screen.getByRole('log', { name: 'Conversation with EDGE' });
    expect(
      await within(log).findByText('Good evening, VJ. SVA sequences is on deck.'),
    ).toBeInTheDocument();

    const call = vi.mocked(streamChat).mock.calls[0]![0];
    expect(call.apiKey).toBe('sk-ant-test');
    expect(call.messages).toEqual([{ role: 'user', content: 'Brief me' }]);
    expect(call.system.persona).toMatch(/You are EDGE/);
    const snapshot = JSON.parse(call.system.context!.replace(/^[^\n]*\n/, ''));
    expect(snapshot.projects[0].name).toBe('DV Interview Prep');
    expect(snapshot.tasks[0].title).toBe('SVA sequences');
    await waitFor(async () => expect((await getSettings()).aiUsage?.requests).toBe(1));

    // A follow-up reuses the same snapshot and sends the history.
    vi.mocked(streamChat).mockResolvedValueOnce({
      text: 'Two.',
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: 'end_turn',
    });
    await user.type(screen.getByLabelText('Ask EDGE'), 'How many?{Enter}');
    expect(await within(log).findByText('Two.')).toBeInTheDocument();
    const second = vi.mocked(streamChat).mock.calls[1]![0];
    expect(second.system.context).toBe(call.system.context);
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('shows a calm error with a retry when the request fails', async () => {
    const user = userEvent.setup();
    await seed();
    await updateSettings({ aiEnabled: true, aiApiKey: 'sk-ant-test' });
    const { AiError } = await import('../../ai/client');
    vi.mocked(streamChat).mockRejectedValueOnce(
      new AiError('rate_limit', 'Rate limited by Anthropic (429). Give it a minute and try again.'),
    );
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: "What's due this week?" }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limited');
    vi.mocked(streamChat).mockResolvedValueOnce({
      text: 'Nothing urgent.',
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: 'end_turn',
    });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing urgent.')).toBeInTheDocument();
    expect(vi.mocked(streamChat).mock.calls[1]![0].messages).toEqual([
      { role: 'user', content: "What's due this week?" },
    ]);
  });
});
