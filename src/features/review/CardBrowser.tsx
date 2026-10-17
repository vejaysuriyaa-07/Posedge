import { useLiveQuery } from 'dexie-react-hooks';
import { Pause, Pencil, Play, Search, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../app/Toasts';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/Field';
import { ProjectBadge } from '../../components/ProjectBadge';
import { db } from '../../db/db';
import {
  deleteCard,
  restoreCards,
  reviewCardNow,
  setCardSuspended,
  updateCard,
} from '../../db/ops/review';
import type { Project, ReviewCard } from '../../db/types';
import { formatInterval, stateName, type CardStateName } from '../../domain/srs';
import { useProjects } from '../../hooks/useData';

const STATE_LABEL: Record<CardStateName, string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  relearning: 'Relearning',
};

export function cardStatusLabel(card: ReviewCard): string {
  if (card.suspended) return 'Suspended';
  if (card.queued) return 'Queued';
  return STATE_LABEL[stateName(card.fsrs)];
}

function dueLabel(card: ReviewCard, now: Date): string {
  if (card.suspended || card.queued) return '';
  const due = new Date(card.due);
  return due <= now ? 'due now' : `due in ${formatInterval(now, due)}`;
}

export function CardRow({ card, project }: { card: ReviewCard; project?: Project }) {
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const now = new Date();
  return (
    <li className="grid gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{card.prompt}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{card.answer}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label="Edit card" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label={card.suspended ? 'Unsuspend card' : 'Suspend card'}
            size="sm"
            onClick={() => void setCardSuspended(card.id, !card.suspended)}
          >
            {card.suspended ? <Play size={14} /> : <Pause size={14} />}
          </IconButton>
          <IconButton
            label="Review now"
            size="sm"
            onClick={async () => {
              await reviewCardNow(card.id);
              toast('Card is due now.');
            }}
          >
            <Zap size={14} />
          </IconButton>
          <IconButton
            label="Delete card"
            size="sm"
            onClick={async () => {
              const c = await deleteCard(card.id);
              if (c)
                toast({
                  message: 'Card deleted',
                  action: { label: 'Undo', onClick: () => void restoreCards([c]) },
                });
            }}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        {project ? <ProjectBadge project={project} short /> : null}
        <span className="rounded-md bg-elevated px-1.5 py-0.5">{cardStatusLabel(card)}</span>
        {card.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
        <span className="ml-auto">{dueLabel(card, now)}</span>
      </div>
      {editing ? <EditCardDialog card={card} onClose={() => setEditing(false)} /> : null}
    </li>
  );
}

export function EditCardDialog({ card, onClose }: { card: ReviewCard; onClose: () => void }) {
  const { active } = useProjects();
  const [prompt, setPrompt] = useState(card.prompt);
  const [answer, setAnswer] = useState(card.answer);
  const [code, setCode] = useState(card.codeSnippet ?? '');
  const [tags, setTags] = useState(card.tags.join(', '));
  const [projectId, setProjectId] = useState(card.projectId);
  const save = async () => {
    await updateCard(card.id, {
      prompt: prompt.trim(),
      answer: answer.trim(),
      codeSnippet: code.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      projectId,
    });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit card"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!prompt.trim() || !answer.trim()}
            onClick={() => void save()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Prompt">
          <Textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            data-autofocus
          />
        </Field>
        <Field label="Answer">
          <Textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </Field>
        <Field label="Code snippet">
          <Textarea
            rows={3}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono text-[12.5px]"
            spellCheck={false}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tags">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

const STATE_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All states' },
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'review', label: 'Review' },
  { key: 'relearning', label: 'Relearning' },
  { key: 'queued', label: 'Queued' },
  { key: 'suspended', label: 'Suspended' },
];

export function CardBrowser() {
  const { active, byId } = useProjects();
  const cards = useLiveQuery(() => db.reviewCards.toArray(), []);
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const [tag, setTag] = useState('');
  const [state, setState] = useState('');
  const tags = useMemo(() => [...new Set((cards ?? []).flatMap((c) => c.tags))].sort(), [cards]);
  const needle = q.trim().toLowerCase();
  const list = (cards ?? [])
    .filter((c) => !project || c.projectId === project)
    .filter((c) => !tag || c.tags.includes(tag))
    .filter((c) => {
      if (!state) return true;
      if (state === 'queued') return c.queued;
      if (state === 'suspended') return c.suspended;
      return !c.queued && !c.suspended && stateName(c.fsrs) === state;
    })
    .filter(
      (c) =>
        !needle ||
        c.prompt.toLowerCase().includes(needle) ||
        c.answer.toLowerCase().includes(needle) ||
        c.tags.some((t) => t.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search size={15} className="absolute top-3 left-3 text-muted" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards"
            aria-label="Search cards"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filter by project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by state"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          {STATE_FILTERS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-[12px] text-muted">
        {list.length} of {cards?.length ?? 0} cards
      </p>
      {list.length ? (
        <ul className="grid gap-2">
          {list.map((c) => (
            <CardRow key={c.id} card={c} project={byId.get(c.projectId)} />
          ))}
        </ul>
      ) : (
        <EmptyState
          message={
            cards?.length
              ? 'No cards match these filters.'
              : 'No cards yet. Finish a learning task to lock one in.'
          }
        />
      )}
    </div>
  );
}
