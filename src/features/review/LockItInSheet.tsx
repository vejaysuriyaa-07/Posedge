import { useLiveQuery } from 'dexie-react-hooks';
import { Code2, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../app/Toasts';
import { useUi } from '../../app/ui';
import { Button, IconButton } from '../../components/Button';
import { Field, Input, Textarea } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { db } from '../../db/db';
import { createCards } from '../../db/ops/review';
import type { Project, ProjectKind, Task } from '../../db/types';

export const PROMPT_TIPS = [
  'One idea per card.',
  'Answerable in under 30 seconds.',
  'Ask why or how, contrast two things, produce code, predict output, or debug.',
  'Write the answer in your own words.',
];

const EXAMPLES: Record<ProjectKind | 'dv', string[]> = {
  dv: [
    'Write an SVA property: after req rises, gnt must be high within 1 to 3 cycles.',
    'List the UVM phases in order. Which one consumes simulation time?',
    "Blocking vs nonblocking in a clocked always block: what race does '=' cause?",
    "Who calls a sequence's body(), and what does start() need?",
  ],
  course: [
    'Why does a larger fan-out slow down a gate? Name the two terms that grow.',
    'Contrast setup and hold violations: which one can a slower clock fix?',
  ],
  learning: [
    'Predict the output: what does this snippet print, and why?',
    'When would you pick a std::unique_ptr over a std::shared_ptr?',
  ],
  passion: [
    'Why does bilinear demosaicing cause zipper artifacts at edges?',
    'Gray-world AWB: what assumption does it make, and when does it fail?',
  ],
  prep: [
    'Draw the FSM for a 1011 sequence detector (overlapping). How many states?',
    'Why is a 2-flop synchronizer enough for a single-bit CDC signal but not a bus?',
  ],
  work: ['What are the three most common mistakes in this assignment, and how do you spot them?'],
  pipeline: ['What is your 30-second answer to "Tell me about your ISP project"?'],
};

export function examplesFor(project?: Pick<Project, 'name' | 'kind'>): string[] {
  if (!project) return EXAMPLES.learning;
  if (/\b(dv|uvm|systemverilog|verilog|sva)\b/i.test(project.name) || project.kind === 'prep') {
    return EXAMPLES.dv;
  }
  return EXAMPLES[project.kind];
}

interface Row {
  prompt: string;
  answer: string;
  code: string;
  showCode: boolean;
  tags: string;
}

const emptyRow = (tag: string): Row => ({
  prompt: '',
  answer: '',
  code: '',
  showCode: false,
  tags: tag,
});

/** Mounted once in the layout; opens for ui.lockItInTaskId. */
export function LockItInHost() {
  const ui = useUi();
  const data = useLiveQuery(async () => {
    if (!ui.lockItInTaskId) return undefined;
    const task = await db.tasks.get(ui.lockItInTaskId);
    const project = task ? await db.projects.get(task.projectId) : undefined;
    return { task, project };
  }, [ui.lockItInTaskId]);
  if (!ui.lockItInTaskId || !data?.task) return null;
  return (
    <LockItInSheet
      key={data.task.id}
      task={data.task}
      project={data.project}
      onClose={ui.closeLockItIn}
    />
  );
}

export function LockItInSheet({
  task,
  project,
  onClose,
}: {
  task: Task;
  project?: Project;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([emptyRow(project?.name ?? '')]);
  const [showTips, setShowTips] = useState(false);
  const [saving, setSaving] = useState(false);
  const examples = examplesFor(project);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const valid = rows.filter((r) => r.prompt.trim() && r.answer.trim());
  const incomplete = rows.some(
    (r) => (r.prompt.trim() || r.answer.trim()) && !(r.prompt.trim() && r.answer.trim()),
  );

  const save = async () => {
    if (!valid.length || incomplete) return;
    setSaving(true);
    try {
      const r = await createCards(
        valid.map((row) => ({
          projectId: task.projectId,
          taskId: task.id,
          prompt: row.prompt,
          answer: row.answer,
          codeSnippet: row.code || undefined,
          tags: row.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        })),
      );
      toast({
        message:
          r.queued > 0
            ? `Locked in ${r.cards.length} card${r.cards.length > 1 ? 's' : ''}. ${r.queued} will unlock on a later day.`
            : `Locked in ${r.cards.length} card${r.cards.length > 1 ? 's' : ''}. First review tomorrow.`,
        tone: 'success',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    toast({ message: 'Saved to Needs cards. Add them any time from Review.' });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={skip}
      title="What should future-you be able to recall?"
      subtitle={
        <span>
          {project ? `${project.emoji} ` : ''}
          {task.title}
        </span>
      }
      width="lg"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={!valid.length || incomplete || saving}
          >
            Save {valid.length > 1 ? `${valid.length} cards` : 'card'}
          </Button>
          <Button variant="ghost" onClick={skip}>
            Skip for now
          </Button>
          <div className="flex-1" />
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showTips}
              onClick={() => setShowTips((v) => !v)}
            >
              <Lightbulb size={15} /> Prompt tips
            </Button>
            {showTips ? (
              <div
                role="note"
                className="absolute right-0 bottom-full z-10 mb-2 w-72 rounded-xl border border-border bg-elevated p-3 text-[13px] shadow-xl"
              >
                <ul className="list-disc space-y-1 pl-4">
                  {PROMPT_TIPS.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </>
      }
    >
      <div className="grid gap-5">
        {rows.map((row, i) => (
          <fieldset key={i} className="grid gap-3 rounded-xl border border-border p-3">
            <legend className="px-1 text-[12px] font-medium text-muted">Card {i + 1}</legend>
            <Field label="Prompt">
              <Textarea
                rows={2}
                value={row.prompt}
                onChange={(e) => update(i, { prompt: e.target.value })}
                placeholder={examples[i % examples.length]}
                data-autofocus={i === 0 ? true : undefined}
                required
              />
            </Field>
            <Field label="Answer / your notes">
              <Textarea
                rows={3}
                value={row.answer}
                onChange={(e) => update(i, { answer: e.target.value })}
                placeholder="In your own words…"
                required
              />
            </Field>
            {row.showCode ? (
              <Field label="Code snippet (optional)">
                <Textarea
                  rows={4}
                  value={row.code}
                  onChange={(e) => update(i, { code: e.target.value })}
                  className="font-mono text-[12.5px]"
                  spellCheck={false}
                />
              </Field>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Tags" className="min-w-40 flex-1">
                <Input
                  value={row.tags}
                  onChange={(e) => update(i, { tags: e.target.value })}
                  placeholder="comma, separated"
                />
              </Field>
              {!row.showCode ? (
                <Button size="sm" variant="ghost" onClick={() => update(i, { showCode: true })}>
                  <Code2 size={15} /> Add code
                </Button>
              ) : null}
              {rows.length > 1 ? (
                <IconButton
                  label={`Remove card ${i + 1}`}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </IconButton>
              ) : null}
            </div>
          </fieldset>
        ))}
        {rows.length < 3 ? (
          <Button
            variant="ghost"
            onClick={() => setRows((rs) => [...rs, emptyRow(project?.name ?? '')])}
          >
            <Plus size={15} /> Add another card
          </Button>
        ) : null}
        <div className="rounded-xl bg-elevated/60 p-3 text-[13px] text-muted">
          <p className="mb-1 font-medium text-fg">Examples</p>
          <ul className="list-disc space-y-1 pl-4">
            {examples.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
