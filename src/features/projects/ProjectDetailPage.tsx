import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useToast } from '../../app/Toasts';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Field';
import { Tabs } from '../../components/Tabs';
import { db } from '../../db/db';
import { deleteProject, setProjectArchived } from '../../db/ops/projects';
import type { Project } from '../../db/types';
import { Board } from './Board';
import { Milestones } from './Milestones';
import { Notes } from './Notes';
import { ProjectCards } from './ProjectCards';
import { EditProjectDialog, KIND_LABELS } from './ProjectForm';

type TabKey = 'board' | 'milestones' | 'notes' | 'cards';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'notes', label: 'Notes' },
  { key: 'cards', label: 'Cards' },
];

export default function ProjectDetailPage() {
  const { id = '' } = useParams();
  const project = useLiveQuery(() => db.projects.get(id), [id], null);
  if (project === null) return null;
  if (!project) {
    return (
      <EmptyState
        message="That project doesn't exist anymore."
        action={
          <Link to="/projects" className="text-sm font-medium text-brand hover:underline">
            Back to projects
          </Link>
        }
      />
    );
  }
  return <ProjectDetail key={project.id} project={project} />;
}

function ProjectDetail({ project }: { project: Project }) {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'board') as TabKey;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  return (
    <section className="mx-auto grid max-w-[1400px] gap-5" data-pc={project.color}>
      <header className="flex flex-wrap items-start gap-4">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-(--pc-tint) text-2xl"
          aria-hidden
        >
          {project.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl">{project.name}</h1>
          <p className="text-[13px] text-muted">
            {KIND_LABELS[project.kind]}
            {project.description ? ` · ${project.description}` : ''}
            {project.archived ? ' · Archived' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await setProjectArchived(project.id, !project.archived);
              toast(
                project.archived
                  ? 'Project restored'
                  : 'Project archived. Find it under Projects > Archived.',
              );
            }}
          >
            {project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {project.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleting(true)}
            aria-label="Delete project"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </header>
      <Tabs
        label="Project sections"
        items={TABS}
        value={tab}
        onChange={(key) => setParams(key === 'board' ? {} : { tab: key }, { replace: true })}
      />
      <div role="tabpanel">
        {tab === 'board' ? <Board project={project} /> : null}
        {tab === 'milestones' ? <Milestones project={project} /> : null}
        {tab === 'notes' ? <Notes project={project} /> : null}
        {tab === 'cards' ? <ProjectCards project={project} /> : null}
      </div>
      {editing ? <EditProjectDialog project={project} onClose={() => setEditing(false)} /> : null}
      {deleting ? (
        <DeleteProjectDialog project={project} onClose={() => setDeleting(false)} />
      ) : null}
    </section>
  );
}

function DeleteProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Delete ${project.name}?`}
      description="This removes the project with its tasks, milestones and review cards. XP and history stay. Archiving is usually the better choice."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={text !== 'DELETE'}
            onClick={async () => {
              await deleteProject(project.id);
              onClose();
              navigate('/projects');
            }}
          >
            Delete project
          </Button>
        </>
      }
    >
      <label className="grid gap-1.5 text-[13px] text-muted">
        Type DELETE to confirm
        <Input value={text} onChange={(e) => setText(e.target.value)} data-autofocus />
      </label>
    </Dialog>
  );
}
