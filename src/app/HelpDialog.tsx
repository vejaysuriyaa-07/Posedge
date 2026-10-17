import { Dialog } from '../components/Dialog';
import { Kbd } from '../components/Kbd';
import { useHotkeys } from '../hooks/useHotkeys';
import { useUi } from './ui';

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['N'], label: 'Quick add a task' },
  { keys: ['Ctrl/⌘', 'K'], label: 'Command palette' },
  { keys: ['G', 'T'], label: 'Go to Today' },
  { keys: ['G', 'W'], label: 'Go to Week' },
  { keys: ['G', 'P'], label: 'Go to Projects' },
  { keys: ['G', 'R'], label: 'Go to Review' },
  { keys: ['G', 'B'], label: 'Go to Brain' },
  { keys: ['/'], label: 'Talk to EDGE (Brain)' },
  { keys: ['G', 'S'], label: 'Go to Settings' },
  { keys: ['E'], label: 'Edit the focused task' },
  { keys: ['X'], label: 'Toggle the focused task complete' },
  { keys: ['Space'], label: 'Reveal the answer (Review)' },
  { keys: ['1', '2', '3', '4'], label: 'Rate Again / Hard / Good / Easy (Review)' },
  {
    keys: ['Space', '←↑↓→'],
    label: 'Pick up and move a task from its handle (drag with the keyboard)',
  },
  { keys: ['?'], label: 'This help' },
];

/** `?` opens the shortcut list. Shortcuts are ignored while typing in a field. */
export function HelpDialog() {
  const ui = useUi();
  useHotkeys({
    '?': (e) => {
      e.preventDefault();
      ui.setHelpOpen(true);
    },
  });
  return (
    <Dialog
      open={ui.helpOpen}
      onClose={() => ui.setHelpOpen(false)}
      title="Keyboard shortcuts"
      description="Single keys are ignored while you type in a field."
    >
      <dl className="grid gap-2">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-4 text-sm">
            <dt className="text-muted">{s.label}</dt>
            <dd className="flex shrink-0 gap-1">
              {s.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
