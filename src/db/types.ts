import { z } from 'zod';

/** Zod schemas are the source of truth for persisted records; TS types are inferred from them. */

export const COLOR_KEYS = [
  'violet',
  'sky',
  'emerald',
  'amber',
  'rose',
  'teal',
  'indigo',
  'orange',
  'lime',
  'fuchsia',
] as const;
export const ColorKeySchema = z.enum(COLOR_KEYS);
export type ColorKey = z.infer<typeof ColorKeySchema>;

export const PROJECT_KINDS = ['course', 'work', 'prep', 'learning', 'passion', 'pipeline'] as const;
export const ProjectKindSchema = z.enum(PROJECT_KINDS);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

export const DateStrSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const TimestampSchema = z.string().min(1);

export const ColumnSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });
export type Column = z.infer<typeof ColumnSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().min(1),
  color: ColorKeySchema,
  kind: ProjectKindSchema,
  description: z.string().optional(),
  /** Markdown notes shown on the project's Notes tab. */
  notes: z.string().optional(),
  columns: z.array(ColumnSchema).min(1),
  archived: z.boolean(),
  order: z.number(),
  createdAt: TimestampSchema,
  targetDate: DateStrSchema.optional(),
  seeded: z.boolean().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const MilestoneSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  /** Monday of the week the milestone is due. */
  weekStart: DateStrSchema,
  done: z.boolean(),
  doneAt: TimestampSchema.optional(),
  order: z.number(),
  seeded: z.boolean().optional(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const TASK_KINDS = ['task', 'learn', 'milestone'] as const;
export const TaskKindSchema = z.enum(TASK_KINDS);
export type TaskKind = z.infer<typeof TaskKindSchema>;

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const PrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Priority = z.infer<typeof PrioritySchema>;

export const SLOTS = ['am', 'pm', 'eve'] as const;
export const SlotSchema = z.enum(SLOTS);
export type Slot = z.infer<typeof SlotSchema>;

export const TaskSourceSchema = z.enum(['manual', 'import', 'ai']);
export type TaskSource = z.infer<typeof TaskSourceSchema>;

export const TaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
  kind: TaskKindSchema,
  status: TaskStatusSchema,
  columnId: z.string().min(1),
  priority: PrioritySchema,
  estimateMin: z.number().int().nonnegative().optional(),
  /** Monday of the planned week. Always the Monday of `day` when `day` is set. */
  weekStart: DateStrSchema.optional(),
  /** Planned calendar day (YYYY-MM-DD). */
  day: DateStrSchema.optional(),
  slot: SlotSchema.optional(),
  dueDate: DateStrSchema.optional(),
  isBig3: z.boolean(),
  milestoneId: z.string().optional(),
  order: z.number(),
  createdAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  source: TaskSourceSchema,
  importBatchId: z.string().optional(),
  seeded: z.boolean().optional(),
  /** Set when a completed learn task was skipped in "Lock it in"; shown under Review > Needs cards. */
  needsCards: z.boolean().optional(),
  /** XP granted when this task was completed, so un-completing can reverse it exactly. */
  xpAwarded: z.number().optional(),
  /** Portion of xpAwarded that is the week's "all Big 3 done" bonus. */
  bonusXp: z.number().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

/** ts-fsrs Card with Dates serialized as ISO strings. */
export const SerializedFsrsCardSchema = z.object({
  due: TimestampSchema,
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number().int().min(0).max(3),
  last_review: TimestampSchema.optional(),
});
export type SerializedFsrsCard = z.infer<typeof SerializedFsrsCardSchema>;

export const ReviewCardSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().optional(),
  projectId: z.string().min(1),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  codeSnippet: z.string().optional(),
  tags: z.array(z.string()),
  fsrs: SerializedFsrsCardSchema,
  /** Duplicate of fsrs.due (ISO, UTC) for indexing. */
  due: TimestampSchema,
  /** Waiting for a new-card slot on a later day. */
  queued: z.boolean(),
  suspended: z.boolean(),
  createdAt: TimestampSchema,
  /** Local day on which this card used one of the day's new-card slots. */
  slotDate: DateStrSchema.optional(),
  seeded: z.boolean().optional(),
});
export type ReviewCard = z.infer<typeof ReviewCardSchema>;

export const RatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Rating = z.infer<typeof RatingSchema>;

export const ReviewLogSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  rating: RatingSchema,
  reviewedAt: TimestampSchema,
  /** FSRS state before the review (0 new, 1 learning, 2 review, 3 relearning). */
  state: z.number().int().min(0).max(3),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  durationMs: z.number().nonnegative(),
});
export type ReviewLog = z.infer<typeof ReviewLogSchema>;

export const ActivityDaySchema = z.object({
  date: DateStrSchema,
  tasksDone: z.number().int(),
  reviewsDone: z.number().int(),
  focusMin: z.number(),
  xp: z.number(),
  freezeUsed: z.boolean(),
  isRestDay: z.boolean(),
});
export type ActivityDay = z.infer<typeof ActivityDaySchema>;

export const FocusSessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().optional(),
  startedAt: TimestampSchema,
  minutes: z.number().nonnegative(),
});
export type FocusSession = z.infer<typeof FocusSessionSchema>;

export const WeeklyReviewSchema = z.object({
  weekStart: DateStrSchema,
  big3TaskIds: z.array(z.string()),
  wins: z.string(),
  worked: z.string(),
  change: z.string(),
  plannedMin: z.number(),
  completedAt: TimestampSchema,
});
export type WeeklyReview = z.infer<typeof WeeklyReviewSchema>;

export const ImportBatchSchema = z.object({
  id: z.string().min(1),
  createdAt: TimestampSchema,
  rawText: z.string(),
  created: z.object({
    projects: z.array(z.string()),
    milestones: z.array(z.string()),
    tasks: z.array(z.string()),
  }),
  summary: z.string().optional(),
  undoneAt: TimestampSchema.optional(),
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

/** One row per day closed with the daily shutdown. */
export const DayLogSchema = z.object({
  date: DateStrSchema,
  shutdownAt: TimestampSchema,
  /** 1 (drained) to 5 (energized). */
  energy: z.number().int().min(1).max(5).optional(),
  note: z.string().max(500).optional(),
});
export type DayLog = z.infer<typeof DayLogSchema>;

export const ThemeSchema = z.enum(['dark', 'light', 'system']);
export type Theme = z.infer<typeof ThemeSchema>;

export const InboxPackSchema = z.object({
  /** File name in the repo's inbox/ folder, e.g. "2026-10-18.md". */
  name: z.string().min(1),
  text: z.string(),
  fetchedAt: TimestampSchema,
});
export type InboxPack = z.infer<typeof InboxPackSchema>;

export const SettingsSchema = z.object({
  id: z.literal('settings'),
  theme: ThemeSchema,
  /** Mon..Sun, minutes. */
  capacityMinByWeekday: z.array(z.number().nonnegative()).length(7),
  /** Weekday indexes, 0 = Monday .. 6 = Sunday. */
  restDays: z.array(z.number().int().min(0).max(6)),
  dailyReviewCap: z.number().int().positive(),
  newCardsPerDay: z.number().int().nonnegative(),
  requestRetention: z.number().min(0.7).max(0.99),
  vacationMode: z.boolean(),
  vacationStartedAt: TimestampSchema.optional(),
  confetti: z.boolean(),
  gamification: z.boolean(),
  backupReminderDays: z.number().int().nonnegative(),
  lastBackupAt: TimestampSchema.optional(),
  xpTotal: z.number(),
  freezes: z.number().int().min(0).max(3),
  longestStreak: z.number().int().nonnegative(),
  schemaVersion: z.number().int(),
  /** Active days counted toward the next freeze (a freeze is earned every 7). */
  freezeProgress: z.number().int().nonnegative(),
  /** Last local day the streak/freeze bookkeeping has processed. */
  streakReconciledThrough: DateStrSchema.optional(),
  /** Weeks (Monday dates) whose "all Big 3 done" bonus was granted. */
  big3BonusWeeks: z.array(DateStrSchema),
  /** First-run welcome dialog answered. */
  onboarded: z.boolean(),
  lastProjectId: z.string().optional(),
  /** Result of navigator.storage.persist() on first run. */
  storagePersisted: z.boolean().optional(),
  focusDefaultMin: z.union([z.literal(25), z.literal(50)]),
  /** AI (EDGE / Ask Posedge). The key never leaves this browser except to api.anthropic.com. */
  aiEnabled: z.boolean(),
  aiApiKey: z.string().optional(),
  aiModel: z.string(),
  /** Free-text model id for future models; wins over aiModel when set. */
  aiModelOverride: z.string().optional(),
  /** Include the API key in backup exports (off by default). */
  aiKeyInBackup: z.boolean(),
  /** Speak EDGE's replies aloud in the Brain. */
  aiVoiceReplies: z.boolean(),
  /** Token usage for the current month (resets when the month changes). */
  aiUsage: z
    .object({
      month: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      requests: z.number(),
    })
    .optional(),
  /**
   * Inbox: suggestion packs written to a private GitHub repo by a daily Gmail/Calendar check.
   * The token is read-only, stays in this browser (never in backups) and only goes to api.github.com.
   */
  inboxRepo: z.string(),
  inboxToken: z.string().optional(),
  inboxCheckedAt: TimestampSchema.optional(),
  /** Message from the last failed check; cleared by a successful one. */
  inboxError: z.string().optional(),
  /** Pack file names already applied or dismissed. */
  inboxSeen: z.array(z.string()),
  /** Packs fetched and waiting for review. */
  inboxPending: z.array(InboxPackSchema),
  /** Profile notes (me.md) and the upcoming agenda (agenda.md) from the brain repo, for EDGE. */
  brainAbout: z.string().optional(),
  brainAgenda: z.string().optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  theme: 'dark',
  capacityMinByWeekday: [180, 120, 180, 120, 180, 240, 60],
  restDays: [],
  dailyReviewCap: 30,
  newCardsPerDay: 8,
  requestRetention: 0.9,
  vacationMode: false,
  confetti: true,
  gamification: true,
  backupReminderDays: 7,
  xpTotal: 0,
  freezes: 0,
  longestStreak: 0,
  schemaVersion: SCHEMA_VERSION,
  freezeProgress: 0,
  big3BonusWeeks: [],
  onboarded: false,
  focusDefaultMin: 25,
  aiEnabled: false,
  aiModel: 'claude-sonnet-5-5',
  aiKeyInBackup: false,
  aiVoiceReplies: false,
  inboxRepo: 'vejaysuriyaa-07/posedge-brain',
  inboxSeen: [],
  inboxPending: [],
};
