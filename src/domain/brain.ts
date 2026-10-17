import type { ColorKey, Milestone, Project, ReviewCard, Task, TaskStatus } from '../db/types';
import { addDaysStr, dateOfIso } from './week';

/**
 * The Brain's knowledge graph: projects, their milestones, tasks and review cards as nodes, linked
 * the way they belong together, plus topic nodes (like Obsidian tags) that bridge projects sharing
 * a term. Pure; the canvas view runs the force layout and drawing.
 */

export const MAX_GRAPH_TASKS = 400;
export const MAX_GRAPH_CARDS = 300;
export const MAX_TOPICS = 40;
/** Completed tasks stay in the graph this many days (when completed items are shown). */
export const DONE_WINDOW_DAYS = 14;

export type GraphNodeKind = 'project' | 'milestone' | 'task' | 'card' | 'topic';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Owning project ('' for topics, which span projects). */
  projectId: string;
  color: ColorKey;
  /** The project's emoji, so color is never the only cue ('' for topics). */
  emoji: string;
  radius: number;
  done: boolean;
  big3: boolean;
  status?: TaskStatus;
  /** Planned day or due date (tasks) or week (milestones). */
  date?: string;
  /** When the item came to be (ISO), for the growth replay. */
  born: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  counts: { projects: number; milestones: number; tasks: number; cards: number; topics: number };
}

export interface KnowledgeGraphInput {
  today: string;
  projects: Project[];
  tasks: Task[];
  milestones: Milestone[];
  cards: Pick<ReviewCard, 'id' | 'projectId' | 'taskId' | 'prompt' | 'suspended' | 'createdAt'>[];
}

export interface GraphOptions {
  includeCards: boolean;
  includeDone: boolean;
  includeTopics: boolean;
}

/** Words that never make a topic: English filler and generic task verbs. */
const STOPWORDS = new Set(
  (
    'about above after again against also among another around away back basic basics batch been before begin being ' +
    'below between both build came cant check come could daily design does doing done down drill during each easy ' +
    'every exercise exercises few final finish first from full gets give going good great half hard have having ' +
    'here high hold into just keep last learn lecture least less like list lists long look made make many ' +
    'means might milestone milestones month more most much must need needs next note notes once only order ' +
    'other over paper part parts plan plans practice prep problem problems project projects question quick read really ' +
    'refresher review rise rises same section sections should show since small solve some start still study submit ' +
    'such sync take task tasks team than that their them then there these they thing things this those ' +
    'three through time today together tomorrow under until update upon very want week weekly well were what ' +
    'when where which while will with within without work would write year your'
  ).split(' '),
);

/** Terms in a title: acronyms (SVA, UVM, C++, LLMs) and words of 4+ letters, minus filler. */
export function topicTerms(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tok of text.match(/[A-Za-z][A-Za-z0-9]*(?:\+\+|#)?/g) ?? []) {
    const acronym = /^[A-Z][A-Z0-9]{1,5}s?$/.test(tok) || /\+\+|#$/.test(tok);
    const word = tok.toLowerCase();
    if (!acronym && (word.length < 4 || STOPWORDS.has(word))) continue;
    const key = acronym ? (/[A-Z0-9]s$/.test(tok) ? word.slice(0, -1) : word) : stem(word);
    if (STOPWORDS.has(key)) continue;
    // Shown as written (acronyms keep their case, words are lowercased), never as the stem.
    if (!out.has(key))
      out.set(key, acronym ? (/[A-Z0-9]s$/.test(tok) ? tok.slice(0, -1) : tok) : word);
  }
  return out;
}

/** Light English plural stemming, just enough to join "class"/"classes" and "cycle"/"cycles". */
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ss|x|sh|[^a]ch)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

const byOpenFirst = (a: Task, b: Task) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  a.priority - b.priority ||
  (a.day ?? a.dueDate ?? '9999').localeCompare(b.day ?? b.dueDate ?? '9999') ||
  a.order - b.order;

export function buildKnowledgeGraph(
  input: KnowledgeGraphInput,
  opts: GraphOptions,
): KnowledgeGraph {
  const doneSince = addDaysStr(input.today, -(DONE_WINDOW_DAYS - 1));
  const projects = input.projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const present = new Set<string>();

  const tasks = input.tasks
    .filter(
      (t) =>
        byId.has(t.projectId) &&
        (t.status !== 'done' ||
          (opts.includeDone && !!t.completedAt && dateOfIso(t.completedAt) >= doneSince)),
    )
    .sort(byOpenFirst)
    .slice(0, MAX_GRAPH_TASKS);
  const openByProject = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== 'done')
      openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + 1);
  }

  for (const p of projects) {
    nodes.push({
      id: p.id,
      kind: 'project',
      label: p.name,
      projectId: p.id,
      color: p.color,
      emoji: p.emoji,
      radius: 6 + Math.min(6, Math.sqrt(openByProject.get(p.id) ?? 0) * 1.5),
      done: false,
      big3: false,
      born: p.createdAt,
    });
    present.add(p.id);
  }

  const milestones = input.milestones
    .filter((m) => byId.has(m.projectId) && (!m.done || opts.includeDone))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.order - b.order);
  for (const m of milestones) {
    const p = byId.get(m.projectId)!;
    nodes.push({
      id: m.id,
      kind: 'milestone',
      label: m.title,
      projectId: p.id,
      color: p.color,
      emoji: p.emoji,
      radius: 4.5,
      done: m.done,
      big3: false,
      date: m.weekStart,
      born: p.createdAt,
    });
    links.push({ source: m.id, target: p.id });
    present.add(m.id);
  }

  for (const t of tasks) {
    const p = byId.get(t.projectId)!;
    nodes.push({
      id: t.id,
      kind: 'task',
      label: t.title,
      projectId: p.id,
      color: p.color,
      emoji: p.emoji,
      radius: t.isBig3 ? 3.8 : 3,
      done: t.status === 'done',
      big3: t.isBig3,
      status: t.status,
      ...(t.day || t.dueDate ? { date: t.day ?? t.dueDate } : {}),
      born: t.createdAt,
    });
    links.push({
      source: t.id,
      target: t.milestoneId && present.has(t.milestoneId) ? t.milestoneId : p.id,
    });
    present.add(t.id);
  }

  let cardCount = 0;
  if (opts.includeCards) {
    const cards = input.cards
      .filter((c) => !c.suspended && byId.has(c.projectId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_GRAPH_CARDS);
    for (const c of cards) {
      const p = byId.get(c.projectId)!;
      nodes.push({
        id: c.id,
        kind: 'card',
        label: c.prompt,
        projectId: p.id,
        color: p.color,
        emoji: p.emoji,
        radius: 1.9,
        done: false,
        big3: false,
        born: c.createdAt,
      });
      links.push({ source: c.id, target: c.taskId && present.has(c.taskId) ? c.taskId : p.id });
    }
    cardCount = cards.length;
  }

  let topicCount = 0;
  if (opts.includeTopics) {
    // A topic is a term used by two or more items (besides project names) across two or more
    // projects: it bridges them, like a tag. Its label is the shortest form seen ("class", not
    // "classes"), and topics linking exactly the same items collapse into one.
    const terms = new Map<
      string,
      { display: string; items: Set<string>; projects: Set<string>; own: number }
    >();
    for (const n of nodes) {
      for (const [key, display] of topicTerms(n.label)) {
        const t = terms.get(key) ?? { display, items: new Set(), projects: new Set(), own: 0 };
        if (display.length < t.display.length) t.display = display;
        t.items.add(n.id);
        t.projects.add(n.projectId);
        if (n.kind !== 'project') t.own++;
        terms.set(key, t);
      }
    }
    const born = new Map(nodes.map((n) => [n.id, n.born]));
    const seen = new Set<string>();
    const topics = [...terms.entries()]
      .filter(([, t]) => t.own >= 2 && t.projects.size >= 2)
      .sort((a, b) => b[1].items.size - a[1].items.size || a[0].localeCompare(b[0]))
      .filter(([, t]) => {
        const signature = [...t.items].sort().join('|');
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .slice(0, MAX_TOPICS);
    for (const [key, t] of topics) {
      const id = `topic:${key}`;
      const items = [...t.items];
      nodes.push({
        id,
        kind: 'topic',
        label: t.display,
        projectId: '',
        color: 'violet',
        emoji: '',
        radius: 2.6 + Math.min(4, Math.sqrt(items.length) * 1.1),
        done: false,
        big3: false,
        born: items.map((i) => born.get(i) ?? '').sort()[0] ?? '',
      });
      for (const item of items) links.push({ source: item, target: id });
    }
    topicCount = topics.length;
  }

  return {
    nodes,
    links,
    counts: {
      projects: projects.length,
      milestones: milestones.length,
      tasks: tasks.length,
      cards: cardCount,
      topics: topicCount,
    },
  };
}

/** Ids directly linked to `id` (both directions). */
export function neighborIds(links: GraphLink[], id: string): Set<string> {
  const out = new Set<string>();
  for (const l of links) {
    if (l.source === id) out.add(l.target);
    else if (l.target === id) out.add(l.source);
  }
  return out;
}

/** Strips markdown symbols and citation refs so text reads cleanly aloud. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/[`*_#>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits streamed text into whole sentences ready to speak, keeping the unfinished tail.
 * With `final`, the tail is returned as a sentence too.
 */
export function takeSentences(
  buffer: string,
  final = false,
): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const re = /[^.!?\n]*(?:[.!?]+["')\]]*(?=\s)|\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    const s = speakable(m[0]);
    if (s) sentences.push(s);
    last = re.lastIndex;
  }
  let rest = buffer.slice(last);
  if (final) {
    const s = speakable(rest);
    if (s) sentences.push(s);
    rest = '';
  }
  return { sentences, rest };
}
