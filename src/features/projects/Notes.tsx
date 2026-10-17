import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, useState } from 'react';
import { Textarea } from '../../components/Field';
import { Tabs } from '../../components/Tabs';
import { updateProject } from '../../db/ops/projects';
import type { Project } from '../../db/types';

export function renderMarkdown(src: string): string {
  const html = marked.parse(src, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html);
}

/** Markdown notes with an Edit / Preview toggle (side by side on wide screens). */
export function Notes({ project }: { project: Project }) {
  const [text, setText] = useState(project.notes ?? '');
  const [mode, setMode] = useState<'edit' | 'preview'>(project.notes ? 'preview' : 'edit');
  const html = useMemo(() => renderMarkdown(text), [text]);
  const save = () => {
    if ((text || undefined) !== project.notes)
      void updateProject(project.id, { notes: text || undefined });
  };
  return (
    <div className="grid gap-3">
      <div className="lg:hidden">
        <Tabs
          label="Notes mode"
          items={[
            { key: 'edit', label: 'Edit' },
            { key: 'preview', label: 'Preview' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={mode === 'edit' ? '' : 'hidden lg:block'}>
          <Textarea
            aria-label="Project notes (Markdown)"
            rows={18}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            placeholder={'# Links\n- [Spec](https://…)\n\n## Notes\nMarkdown works here.'}
            className="font-mono text-[13px]"
          />
          <p className="mt-1 text-[12px] text-muted">
            Saved when you click away. Markdown supported.
          </p>
        </div>
        <div
          className={`prose-posedge min-h-40 rounded-xl border border-border bg-surface p-4 text-sm ${mode === 'preview' ? '' : 'hidden lg:block'}`}
          // Sanitized with DOMPurify above.
          dangerouslySetInnerHTML={{
            __html: html || '<p class="text-muted">Nothing here yet.</p>',
          }}
        />
      </div>
    </div>
  );
}
