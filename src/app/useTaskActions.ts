import { useCallback } from 'react';
import {
  completeTask,
  deleteTask,
  duplicateTask,
  restoreTasks,
  uncompleteTask,
  type CompletionResult,
} from '../db/ops/tasks';
import { db } from '../db/db';
import { useSettings } from '../hooks/useSettings';
import { celebrate } from './celebrate';
import { useToast } from './Toasts';
import { useUi } from './ui';

/** Task actions with the app's feedback: XP toasts, level-ups, confetti rules, undo, Lock it in. */
export function useTaskActions() {
  const { toast, announce } = useToast();
  const ui = useUi();
  const settings = useSettings();

  const feedback = useCallback(
    (r: CompletionResult) => {
      const g = settings.gamification;
      const xpText = g ? `+${r.xp.total} XP` : 'Done';
      announce(`Completed ${r.task.title}. ${g ? `${r.xp.total} XP.` : ''}`);
      if (r.allBig3) {
        toast({
          message: g ? `All Big 3 done. ${xpText}` : 'All Big 3 done this week.',
          tone: 'xp',
        });
        celebrate(settings.confetti);
      } else if (r.offer) {
        toast({ message: g ? `Offer! ${xpText}` : 'Offer!', tone: 'xp' });
      } else if (g) {
        toast({ message: xpText, tone: 'xp', duration: 2000 });
      }
      if (g && r.levelsGained > 0) {
        toast({ message: `Level ${r.levelAfter.level}: ${r.levelAfter.title}`, tone: 'xp' });
        announce(`Level up. Level ${r.levelAfter.level}, ${r.levelAfter.title}.`);
        celebrate(settings.confetti);
      }
    },
    [announce, toast, settings.gamification, settings.confetti],
  );

  const complete = useCallback(
    async (id: string) => {
      const r = await completeTask(id);
      if (!r) return null;
      feedback(r);
      if (r.task.kind === 'learn') ui.openLockItIn(r.task.id);
      return r;
    },
    [feedback, ui],
  );

  const uncomplete = useCallback(
    async (id: string) => {
      const t = await uncompleteTask(id);
      if (t) announce(`Marked ${t.title} as not done.`);
      return t;
    },
    [announce],
  );

  const toggle = useCallback(
    async (id: string) => {
      const task = await db.tasks.get(id);
      if (!task) return;
      if (task.status === 'done') await uncomplete(id);
      else await complete(id);
    },
    [complete, uncomplete],
  );

  const remove = useCallback(
    async (id: string) => {
      const t = await deleteTask(id);
      if (!t) return;
      ui.closeTask();
      toast({
        message: `Deleted "${t.title}"`,
        action: { label: 'Undo', onClick: () => void restoreTasks([t]) },
      });
    },
    [toast, ui],
  );

  const duplicate = useCallback(
    async (id: string) => {
      const copy = await duplicateTask(id);
      if (copy) {
        toast('Duplicated');
        ui.openTask(copy.id);
      }
    },
    [toast, ui],
  );

  return { complete, uncomplete, toggle, remove, duplicate, feedback };
}
