import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../../app/Toasts';
import { useUi } from '../../app/ui';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, Input, Select } from '../../components/Field';
import { createProject, updateProject } from '../../db/ops/projects';
import {
  COLOR_KEYS,
  PROJECT_KINDS,
  type ColorKey,
  type Project,
  type ProjectKind,
} from '../../db/types';
import { COLUMN_TEMPLATES, defaultTemplateKey } from '../../domain/columns';
import { COLOR_LABELS } from '../../domain/colors';

export const EMOJI_OPTIONS = [
  '🔲',
  '🤖',
  '✅',
  '💼',
  '🎯',
  '📚',
  '🐍',
  '🧩',
  '📷',
  '🚀',
  '📘',
  '✨',
  '🧠',
  '💡',
  '🔬',
  '🧪',
  '⚙️',
  '🛠️',
  '🖥️',
  '💾',
  '📡',
  '🔌',
  '⚡',
  '📈',
  '📝',
  '🗂️',
  '📅',
  '🏃',
  '🏋️',
  '🎓',
  '🧮',
  '🎧',
  '🎨',
  '🌱',
  '🏠',
  '💰',
  '✈️',
  '📖',
  '🔭',
  '🏆',
];

export const KIND_LABELS: Record<ProjectKind, string> = {
  course: 'Course',
  work: 'Work',
  prep: 'Interview prep',
  learning: 'Learning track',
  passion: 'Passion project',
  pipeline: 'Job pipeline',
};

interface FormState {
  name: string;
  emoji: string;
  color: ColorKey;
  kind: ProjectKind;
  templateKey: string;
  description: string;
  targetDate: string;
}

function ProjectFormFields({
  state,
  set,
  isNew,
}: {
  state: FormState;
  set: (p: Partial<FormState>) => void;
  isNew: boolean;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <Input
          value={state.name}
          onChange={(e) => set({ name: e.target.value })}
          data-autofocus
          placeholder="e.g. Camera ISP"
        />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-muted">Icon</legend>
        <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Icon">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={state.emoji === e}
              aria-label={`Icon ${e}`}
              onClick={() => set({ emoji: e })}
              className={`grid aspect-square min-h-9 place-items-center rounded-lg text-lg ${state.emoji === e ? 'bg-brand/20 ring-2 ring-brand' : 'hover:bg-elevated'}`}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-muted">Color</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
          {COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={state.color === c}
              aria-label={COLOR_LABELS[c]}
              title={COLOR_LABELS[c]}
              data-pc={c}
              onClick={() => set({ color: c })}
              className={`size-9 rounded-full bg-(--pc) ${state.color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
            />
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <Select
            value={state.kind}
            onChange={(e) => {
              const kind = e.target.value as ProjectKind;
              set({ kind, ...(isNew ? { templateKey: defaultTemplateKey(kind) } : {}) });
            }}
          >
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target date (optional)">
          <Input
            type="date"
            value={state.targetDate}
            onChange={(e) => set({ targetDate: e.target.value })}
          />
        </Field>
      </div>
      {isNew ? (
        <Field label="Board columns">
          <Select value={state.templateKey} onChange={(e) => set({ templateKey: e.target.value })}>
            {COLUMN_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Description (optional)">
        <Input
          value={state.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="One line about what this is for"
        />
      </Field>
    </div>
  );
}

export function NewProjectDialog() {
  const ui = useUi();
  if (!ui.newProjectOpen) return null;
  return <NewProjectDialogInner onClose={() => ui.setNewProjectOpen(false)} />;
}

function NewProjectDialogInner({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [state, setState] = useState<FormState>({
    name: '',
    emoji: '🎯',
    color: 'violet',
    kind: 'learning',
    templateKey: defaultTemplateKey('learning'),
    description: '',
    targetDate: '',
  });
  const set = (p: Partial<FormState>) => setState((s) => ({ ...s, ...p }));
  const submit = async () => {
    if (!state.name.trim()) return;
    const p = await createProject({
      name: state.name,
      emoji: state.emoji,
      color: state.color,
      kind: state.kind,
      templateKey: state.templateKey,
      description: state.description,
      targetDate: state.targetDate || undefined,
    });
    toast(`Created ${p.emoji} ${p.name}`);
    onClose();
    navigate(`/projects/${p.id}`);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="New project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!state.name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ProjectFormFields state={state} set={set} isNew />
      </form>
    </Dialog>
  );
}

export function EditProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [state, setState] = useState<FormState>({
    name: project.name,
    emoji: project.emoji,
    color: project.color,
    kind: project.kind,
    templateKey: '',
    description: project.description ?? '',
    targetDate: project.targetDate ?? '',
  });
  const set = (p: Partial<FormState>) => setState((s) => ({ ...s, ...p }));
  const submit = async () => {
    if (!state.name.trim()) return;
    await updateProject(project.id, {
      name: state.name.trim(),
      emoji: state.emoji,
      color: state.color,
      kind: state.kind,
      description: state.description.trim() || undefined,
      targetDate: state.targetDate || undefined,
    });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!state.name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ProjectFormFields state={state} set={set} isNew={false} />
    </Dialog>
  );
}
