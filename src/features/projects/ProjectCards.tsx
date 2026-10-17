import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Field';
import { db } from '../../db/db';
import type { Project } from '../../db/types';
import { CardRow } from '../review/CardBrowser';

export function ProjectCards({ project }: { project: Project }) {
  const [q, setQ] = useState('');
  const cards = useLiveQuery(
    () => db.reviewCards.where('projectId').equals(project.id).toArray(),
    [project.id],
  );
  const needle = q.trim().toLowerCase();
  const list = (cards ?? [])
    .filter(
      (c) =>
        !needle ||
        c.prompt.toLowerCase().includes(needle) ||
        c.answer.toLowerCase().includes(needle) ||
        c.tags.some((t) => t.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="grid max-w-4xl gap-3">
      <div className="relative">
        <Search size={15} className="absolute top-3 left-3 text-muted" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this project's cards"
          aria-label="Search cards"
          className="pl-9"
        />
      </div>
      {list.length ? (
        <ul className="grid gap-2">
          {list.map((c) => (
            <CardRow key={c.id} card={c} project={project} />
          ))}
        </ul>
      ) : (
        <EmptyState
          message={
            cards?.length
              ? 'No cards match.'
              : 'No cards yet. Finish a learning task to lock one in.'
          }
        />
      )}
    </div>
  );
}
