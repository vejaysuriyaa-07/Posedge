import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, streamChat } from '../../ai/client';
import { ToastProvider } from '../../app/Toasts';
import { UiProvider } from '../../app/ui';
import { resetAllData } from '../../db/backup';
import { getSettings, updateSettings } from '../../db/db';
import { createProject } from '../../db/ops/projects';
import { createTask } from '../../db/ops/tasks';
import { mondayOf, todayStr } from '../../domain/week';
import BrainPage, { modelLabel } from './BrainPage';

vi.mock('../../ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ai/client')>()),
  streamChat: vi.fn(),
}));

// jsdom has no 2D canvas; the graph simply doesn't draw.
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

const done = (text: string) => ({
  text,
  usage: { inputTokens: 1, outputTokens: 1 },
  stopReason: 'end_turn',
});

beforeEach(async () => {
  await resetAllData();
  vi.mocked(streamChat).mockReset();
});

describe('Brain', () => {
  it('shows the ask page and the graph, with no AI controls until a key is connected', async () => {
    await seed();
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Ask your brain' })).toBeInTheDocument();
    const graph = screen.getByRole('region', { name: 'Graph' });
    expect(
      await within(graph).findByRole('button', { name: /DV Interview Prep/ }),
    ).toBeInTheDocument();
    expect(
      within(graph).getByRole('img', { name: /Graph of 1 project · 1 task · 0 cards · 0 topics/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Connect an Anthropic API key to ask questions')).toBeInTheDocument();
    expect(screen.getByLabelText('Ask your brain')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Brief me on today' })).not.toBeInTheDocument();
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('focuses a project from the graph chips and shows its card', async () => {
    const user = userEvent.setup();
    const project = await seed();
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    const chips = await screen.findByRole('list', { name: 'Focus a project' });
    await user.click(await within(chips).findByRole('button', { name: /DV Interview Prep/ }));
    expect(screen.getByText('1 open task · 0 milestones ahead · 0 cards')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open project' })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    );
    await user.click(screen.getByRole('button', { name: 'Close project details' }));
    expect(screen.queryByRole('link', { name: 'Open project' })).not.toBeInTheDocument();
  });

  it('answers with numbered sources from short refs, records usage, and keeps the thread for follow-ups', async () => {
    const user = userEvent.setup();
    await seed();
    await updateSettings({ aiEnabled: true, aiApiKey: 'sk-ant-test' });
    vi.mocked(streamChat).mockImplementation(async ({ onText }) => {
      onText?.('Start with **SVA sequences** [[t1]] ', '');
      onText?.('for DV Interview Prep [[p1]].', '');
      return {
        text: 'Start with **SVA sequences** [[t1]] for DV Interview Prep [[p1]].',
        usage: { inputTokens: 900, outputTokens: 12 },
        stopReason: 'end_turn',
      };
    });
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Brief me on today' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Brief me on today' }),
    ).toBeInTheDocument();
    const sources = await screen.findByRole('region', { name: 'Sources' });
    expect(
      within(sources)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining('SVA sequences'),
      expect.stringContaining('DV Interview Prep'),
    ]);
    const answer = screen.getByRole('region', { name: 'Answer' });
    expect(
      within(answer).getByRole('button', { name: 'Source 1: SVA sequences' }),
    ).toHaveTextContent('1');
    expect(within(answer).getByText('SVA sequences', { selector: 'strong' })).toBeInTheDocument();
    expect(answer).not.toHaveTextContent('[[');
    expect(screen.getByRole('region', { name: 'Graph' })).toHaveTextContent(
      '2 sources from the latest answer',
    );

    const call = vi.mocked(streamChat).mock.calls[0]![0];
    expect(call.apiKey).toBe('sk-ant-test');
    expect(call.messages).toEqual([{ role: 'user', content: 'Brief me on today' }]);
    expect(call.system.persona).toMatch(/Cite your sources/);
    const snapshot = JSON.parse(call.system.context!.replace(/^[^\n]*\n/, ''));
    expect(snapshot.projects[0]).toMatchObject({ id: 'p1', name: 'DV Interview Prep' });
    expect(snapshot.tasks[0]).toMatchObject({ id: 't1', projectId: 'p1', title: 'SVA sequences' });
    await waitFor(async () => expect((await getSettings()).aiUsage?.requests).toBe(1));

    vi.mocked(streamChat).mockResolvedValueOnce(done('About 45 minutes.'));
    await user.type(screen.getByLabelText('Ask a follow-up'), 'How long will it take?{Enter}');
    expect(await screen.findByText('About 45 minutes.')).toBeInTheDocument();
    const second = vi.mocked(streamChat).mock.calls[1]![0];
    expect(second.system.context).toBe(call.system.context);
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);

    await user.click(screen.getByRole('button', { name: 'New thread' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Ask your brain' })).toBeInTheDocument();
  });

  it('shows a calm error with a retry when the request fails', async () => {
    const user = userEvent.setup();
    await seed();
    await updateSettings({ aiEnabled: true, aiApiKey: 'sk-ant-test' });
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
    vi.mocked(streamChat).mockResolvedValueOnce(done('Nothing urgent.'));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing urgent.')).toBeInTheDocument();
    expect(vi.mocked(streamChat).mock.calls[1]![0].messages).toEqual([
      { role: 'user', content: "What's due this week?" },
    ]);
  });

  it('opens the graph full screen and closes it with Escape, returning focus', async () => {
    const user = userEvent.setup();
    await seed();
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    const expand = screen.getByRole('button', { name: 'Full screen graph' });
    await user.click(expand);
    expect(screen.getByRole('complementary', { name: 'Graph, full screen' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    // The page behind is inert while the graph covers it.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ask your brain' }).closest('[inert]'),
    ).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('complementary', { name: 'Graph, full screen' }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Full screen graph' })).toHaveFocus(),
    );
  });

  it('searches the graph and reports matches', async () => {
    const user = userEvent.setup();
    await seed();
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    const graph = screen.getByRole('region', { name: 'Graph' });
    await within(graph).findByRole('button', { name: /DV Interview Prep/ });
    await user.type(within(graph).getByLabelText('Search the graph'), 'sva');
    expect(within(graph).getByText('1 match')).toBeInTheDocument();
    await user.type(within(graph).getByLabelText('Search the graph'), 'zzz');
    expect(within(graph).getByText('No matches')).toBeInTheDocument();
    await user.click(within(graph).getByRole('button', { name: 'Clear search' }));
    expect(within(graph).getByText(/1 project · 1 task/)).toBeInTheDocument();
  });

  it('changes graph settings live, remembers them, and resets to defaults', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('posedge.graph.v1');
    render(
      <Providers>
        <BrainPage />
      </Providers>,
    );
    await user.click(screen.getByRole('button', { name: 'Graph settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Graph settings' });
    const repel = within(dialog).getByLabelText('Repel force');
    fireEvent.change(repel, { target: { value: '2' } });
    expect(within(dialog).getByText('200%')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('posedge.graph.v1')!).settings.repelForce).toBe(2);
    await user.click(within(dialog).getByRole('button', { name: /Reset to defaults/ }));
    expect(JSON.parse(localStorage.getItem('posedge.graph.v1')!).settings.repelForce).toBe(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Graph settings' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Topics' }));
    expect(screen.getByRole('button', { name: 'Topics' })).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(localStorage.getItem('posedge.graph.v1')!).options.includeTopics).toBe(false);
    localStorage.removeItem('posedge.graph.v1');
  });

  it('labels models in plain words', () => {
    expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5');
    expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5');
    expect(modelLabel('my-custom-model')).toBe('my-custom-model');
  });
});
