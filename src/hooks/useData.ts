import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import type { Project } from '../db/types';

/** All projects sorted by sidebar order (archived included; filter as needed). */
export function useAllProjects(): Project[] | undefined {
  return useLiveQuery(() => db.projects.orderBy('order').toArray(), []);
}

export function useProjects(): {
  projects: Project[];
  active: Project[];
  byId: Map<string, Project>;
  loaded: boolean;
} {
  const all = useAllProjects();
  return useMemo(() => {
    const projects = all ?? [];
    return {
      projects,
      active: projects.filter((p) => !p.archived),
      byId: new Map(projects.map((p) => [p.id, p])),
      loaded: all !== undefined,
    };
  }, [all]);
}
