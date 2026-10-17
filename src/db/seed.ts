import { defaultTemplateKey } from '../domain/columns';
import { normalizeName } from '../domain/fuzzy';
import { addWeeksStr, mondayOf, parseDate, toDateStr, todayStr, weekDays } from '../domain/week';
import { db } from './db';
import { createMilestone } from './ops/milestones';
import { createProject } from './ops/projects';
import { createCards } from './ops/review';
import { createTask, type TaskInput } from './ops/tasks';
import type { ColorKey, ProjectKind } from './types';

interface SeedTask {
  title: string;
  estimateMin: number;
  kind?: 'task' | 'learn';
  priority?: 1 | 2 | 3;
  big3?: boolean;
  /** Leave in the week's backlog instead of assigning a day. */
  backlog?: boolean;
}

interface SeedProject {
  name: string;
  emoji: string;
  color: ColorKey;
  kind: ProjectKind;
  tasks: SeedTask[];
}

export const TEMPLATE_PROJECTS: SeedProject[] = [
  {
    name: 'EE 577A VLSI System Design',
    emoji: '🔲',
    color: 'indigo',
    kind: 'course',
    tasks: [
      { title: 'Finish lab layout and run DRC/LVS', estimateMin: 120, priority: 1, big3: true },
      { title: 'Review lecture notes on clock trees', estimateMin: 45, kind: 'learn' },
    ],
  },
  {
    name: 'EE 599 RL + LLMs Project',
    emoji: '🤖',
    color: 'fuchsia',
    kind: 'course',
    tasks: [
      { title: 'Sync with team on project milestones', estimateMin: 30 },
      { title: 'Read PPO paper sections 3-4', estimateMin: 60, kind: 'learn' },
    ],
  },
  {
    name: 'EE 658 Course Producer',
    emoji: '✅',
    color: 'amber',
    kind: 'work',
    tasks: [
      { title: 'Grade homework batch', estimateMin: 90 },
      { title: 'Hold office hours', estimateMin: 60, backlog: true },
    ],
  },
  {
    name: 'Desk Job',
    emoji: '💼',
    color: 'orange',
    kind: 'work',
    tasks: [
      { title: 'Desk shift', estimateMin: 240 },
      { title: 'Submit timesheet', estimateMin: 10 },
    ],
  },
  {
    name: 'DV Interview Prep',
    emoji: '🎯',
    color: 'violet',
    kind: 'prep',
    tasks: [
      { title: 'Combinational vs sequential: timing basics', estimateMin: 60, kind: 'learn' },
      { title: 'FSM design drill: sequence detector', estimateMin: 45, kind: 'learn', big3: true },
      { title: 'Write a DV study plan for the month', estimateMin: 30 },
    ],
  },
  {
    name: 'Verilog / SystemVerilog / UVM',
    emoji: '📚',
    color: 'sky',
    kind: 'learning',
    tasks: [
      { title: 'SV classes and inheritance', estimateMin: 60, kind: 'learn' },
      { title: 'Blocking vs nonblocking exercises', estimateMin: 45, kind: 'learn' },
    ],
  },
  {
    name: 'C++ / Python',
    emoji: '🐍',
    color: 'emerald',
    kind: 'learning',
    tasks: [
      { title: 'Python: numpy vectorization practice', estimateMin: 45, kind: 'learn' },
      { title: 'C++ smart pointers refresher', estimateMin: 45, kind: 'learn', backlog: true },
    ],
  },
  {
    name: 'LeetCode',
    emoji: '🧩',
    color: 'lime',
    kind: 'learning',
    tasks: [
      { title: 'Two easy array problems', estimateMin: 45 },
      { title: 'Bit manipulation set', estimateMin: 45, kind: 'learn' },
    ],
  },
  {
    name: 'Camera ISP + Tiny Tapeout',
    emoji: '📷',
    color: 'teal',
    kind: 'passion',
    tasks: [
      { title: 'Bilinear demosaic in Python', estimateMin: 120, kind: 'learn', big3: true },
      { title: 'Collect test images for the golden model', estimateMin: 30 },
    ],
  },
  {
    name: 'New-Grad Job Pipeline',
    emoji: '🚀',
    color: 'rose',
    kind: 'pipeline',
    tasks: [
      { title: 'Update resume with ISP project', estimateMin: 60 },
      { title: 'Shortlist 5 DV new-grad roles', estimateMin: 45, backlog: true },
    ],
  },
];

export const DV_MILESTONES = [
  'Digital design fundamentals',
  'SystemVerilog language + OOP',
  'SV constraints + randomization',
  'Functional coverage',
  'SVA assertions',
  'UVM basics (components, phases, factory)',
  'UVM sequences + TLM + scoreboards',
  'Protocols (AXI, APB, UART, SPI, I2C)',
  'Mock interviews + project polish',
  'Final review sprint',
];

export const ISP_MILESTONES = [
  'Python golden model (demosaic, AWB, gamma)',
  'RTL pipeline blocks',
  'Testbench vs golden model',
  'Tiny Tapeout submission',
];

export const SAMPLE_CARDS = [
  {
    prompt: 'Write an SVA property: after req rises, gnt must be high within 1 to 3 cycles.',
    answer:
      'Use $rose to catch the rising edge, then an overlapping implication into a 1-3 cycle delay range.',
    codeSnippet:
      'property p_req_gnt;\n  @(posedge clk) disable iff (!rst_n)\n    $rose(req) |-> ##[1:3] gnt;\nendproperty\na_req_gnt: assert property (p_req_gnt);',
    tags: ['SVA'],
  },
  {
    prompt: 'List the UVM phases in order. Which one consumes simulation time?',
    answer:
      'build, connect, end_of_elaboration, start_of_simulation, run (with reset/configure/main/shutdown sub-phases), extract, check, report, final. Only run_phase and its sub-phases are tasks, so only they consume time.',
    tags: ['UVM'],
  },
  {
    prompt: "Blocking vs nonblocking in a clocked always block: what race does '=' cause?",
    answer:
      "With '=', a flop's new value is visible immediately, so another always block on the same edge may read the old or the new value depending on scheduling order. '<=' samples every right-hand side first and updates in the NBA region, so all flops see pre-edge values.",
    tags: ['Verilog'],
  },
];

/** Monday of the week containing the last day of the month `offset` months from `today`. */
function endOfMonthWeek(today: string, offset: number): string {
  const d = parseDate(today);
  const last = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return mondayOf(toDateStr(last));
}

/**
 * Creates VJ's starter projects, milestones, a few sample tasks for this week and three sample
 * DV cards. Projects whose names already exist are skipped. Returns the number of projects created.
 */
export async function loadTemplate(now: Date = new Date()): Promise<number> {
  const today = todayStr(now);
  const weekStart = mondayOf(today);
  const openDays = weekDays(weekStart).filter((d) => d >= today);
  return db.transaction(
    'rw',
    [db.projects, db.milestones, db.tasks, db.reviewCards, db.settings, db.activityDays],
    async () => {
      const existing = new Set((await db.projects.toArray()).map((p) => normalizeName(p.name)));
      let created = 0;
      let dayCursor = 0;
      let dvProjectId: string | undefined;
      for (const sp of TEMPLATE_PROJECTS) {
        if (existing.has(normalizeName(sp.name))) continue;
        const project = await createProject(
          {
            name: sp.name,
            emoji: sp.emoji,
            color: sp.color,
            kind: sp.kind,
            templateKey: defaultTemplateKey(sp.kind),
            seeded: true,
          },
          now,
        );
        created++;
        if (sp.name === 'DV Interview Prep') {
          dvProjectId = project.id;
          for (const [i, title] of DV_MILESTONES.entries()) {
            await createMilestone({
              projectId: project.id,
              title,
              weekStart: endOfMonthWeek(today, i),
              seeded: true,
            });
          }
        }
        if (sp.name === 'Camera ISP + Tiny Tapeout') {
          for (const [i, title] of ISP_MILESTONES.entries()) {
            await createMilestone({
              projectId: project.id,
              title,
              weekStart: addWeeksStr(weekStart, 2 + i * 4),
              seeded: true,
            });
          }
        }
        for (const t of sp.tasks) {
          const input: TaskInput = {
            projectId: project.id,
            title: t.title,
            kind: t.kind ?? 'task',
            priority: t.priority ?? 2,
            estimateMin: t.estimateMin,
            weekStart,
            isBig3: t.big3,
            source: 'manual',
            seeded: true,
          };
          if (!t.backlog && openDays.length) {
            input.day = openDays[dayCursor % openDays.length];
            dayCursor++;
          }
          await createTask(input, now);
        }
      }
      if (dvProjectId) {
        await createCards(
          SAMPLE_CARDS.map((c) => ({ ...c, projectId: dvProjectId!, seeded: true })),
          now,
        );
      }
      // Seeding is not "use": keep lastProjectId pointing at the DV project for quick add.
      const s = await db.settings.get('settings');
      if (s && dvProjectId) await db.settings.put({ ...s, lastProjectId: dvProjectId });
      return created;
    },
  );
}

/** Removes sample tasks and sample cards (projects and milestones stay). */
export async function removeSampleData(): Promise<{ tasks: number; cards: number }> {
  return db.transaction('rw', [db.tasks, db.reviewCards], async () => {
    const tasks = await db.tasks.filter((t) => !!t.seeded).primaryKeys();
    const cards = await db.reviewCards.filter((c) => !!c.seeded).primaryKeys();
    await db.tasks.bulkDelete(tasks);
    await db.reviewCards.bulkDelete(cards);
    return { tasks: tasks.length, cards: cards.length };
  });
}

/** Used by tests and the welcome dialog to know whether anything exists yet. */
export async function hasAnyData(): Promise<boolean> {
  return (await db.projects.count()) > 0;
}
