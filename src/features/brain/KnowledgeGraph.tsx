import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KnowledgeGraph as Graph } from '../../domain/brain';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { GraphEngine, type GraphTooltip } from './graphEngine';

export interface KnowledgeGraphProps {
  graph: Graph;
  today: string;
  isDark: boolean;
  /** Items the latest answer cited; they stay lit while the rest dims. */
  highlightIds: ReadonlySet<string>;
  selectedId?: string;
  /** Change `seq` to pan and zoom to a node. */
  focus?: { id: string; seq: number };
  label: string;
  onSelectProject: (id: string | undefined) => void;
  onOpenTask: (id: string) => void;
}

const ZOOM_BTN = 'grid size-8 place-items-center text-muted hover:bg-elevated hover:text-fg';

/**
 * An Obsidian-style graph view: drag to pan, scroll or pinch to zoom, drag nodes around.
 * Hovering a node lights it and its neighbors and fades the rest.
 */
export function KnowledgeGraph(props: KnowledgeGraphProps) {
  const {
    graph,
    today,
    isDark,
    highlightIds,
    selectedId,
    focus,
    label,
    onSelectProject,
    onOpenTask,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GraphEngine | null>(null);
  const reduced = useReducedMotion();
  const [tooltip, setTooltip] = useState<GraphTooltip | null>(null);

  useEffect(() => {
    if (!wrapRef.current || !canvasRef.current) return;
    const e = new GraphEngine(wrapRef.current, canvasRef.current, {
      onTooltip: setTooltip,
      onSelectProject: () => {},
      onOpenTask: () => {},
    });
    engine.current = e;
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (engine.current)
      engine.current.callbacks = { onTooltip: setTooltip, onSelectProject, onOpenTask };
  }, [onSelectProject, onOpenTask]);

  useEffect(() => {
    engine.current?.setOptions({ highlightIds, selectedId, isDark, today, reduced });
  }, [highlightIds, selectedId, isDark, today, reduced]);

  useEffect(() => {
    engine.current?.setGraph(graph);
  }, [graph]);

  useEffect(() => {
    if (focus) engine.current?.focus(focus.id);
  }, [focus]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block touch-none select-none"
      />
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[250px] rounded-lg border border-border bg-elevated px-3 py-2 shadow-card"
          style={{ left: tooltip.x, top: tooltip.y }}
          aria-hidden
        >
          <p className="text-[13px] leading-snug font-medium">{tooltip.title}</p>
          <p className="mt-0.5 text-[12px] text-muted">{tooltip.meta}</p>
        </div>
      ) : null}
      <div className="absolute right-3 bottom-3 flex overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <button
          type="button"
          className={ZOOM_BTN}
          aria-label="Zoom out"
          onClick={() => engine.current?.zoomBy(1 / 1.3)}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className={`${ZOOM_BTN} border-x border-border`}
          aria-label="Zoom in"
          onClick={() => engine.current?.zoomBy(1.3)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className={ZOOM_BTN}
          aria-label="Fit graph to view"
          onClick={() => engine.current?.refit()}
        >
          <Maximize size={14} />
        </button>
      </div>
    </div>
  );
}
