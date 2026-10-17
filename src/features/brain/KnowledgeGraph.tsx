import { Maximize, Minus, Plus } from 'lucide-react';
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import type { KnowledgeGraph as Graph } from '../../domain/brain';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  GraphEngine,
  type GraphSettings,
  type GraphTooltip,
  type ReplayState,
} from './graphEngine';

export interface KnowledgeGraphHandle {
  toggleReplay: () => void;
  /** Fit the whole graph again (and keep fitting as the panel resizes). */
  refit: () => void;
}

export interface KnowledgeGraphProps {
  graph: Graph;
  today: string;
  isDark: boolean;
  /** Items to keep lit while the rest dims (search matches or the latest answer's sources). */
  highlightIds: ReadonlySet<string>;
  selectedId?: string;
  /** Change `seq` to pan and zoom to a node. */
  focus?: { id: string; seq: number };
  settings: GraphSettings;
  label: string;
  onSelectProject: (id: string | undefined) => void;
  onOpenTask: (id: string) => void;
  onReplay: (s: ReplayState) => void;
  /** Where the zoom controls sit (defaults to the bottom-right corner). */
  controlsStyle?: CSSProperties;
  /** Space covered by floating UI that fitting should avoid. */
  insets?: { right: number; bottom: number };
  ref?: Ref<KnowledgeGraphHandle>;
}

const ZOOM_BTN =
  'grid size-8 place-items-center text-muted transition hover:bg-elevated hover:text-fg';

/**
 * An Obsidian-style graph view: drag to pan (with momentum), scroll or pinch to zoom, drag nodes.
 * Hovering a node lights it and its neighbors and fades the rest. Keyboard: arrows pan, + and -
 * zoom, 0 fits.
 */
export function KnowledgeGraph(props: KnowledgeGraphProps) {
  const {
    graph,
    today,
    isDark,
    highlightIds,
    selectedId,
    focus,
    settings,
    label,
    onSelectProject,
    onOpenTask,
    onReplay,
    controlsStyle,
    insets,
    ref,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GraphEngine | null>(null);
  const reduced = useReducedMotion();
  const [tooltip, setTooltip] = useState<GraphTooltip | null>(null);
  const hintId = useId();

  useEffect(() => {
    if (!wrapRef.current || !canvasRef.current) return;
    const e = new GraphEngine(wrapRef.current, canvasRef.current, {
      onTooltip: setTooltip,
      onSelectProject: () => {},
      onOpenTask: () => {},
      onReplay: () => {},
    });
    engine.current = e;
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (engine.current) {
      engine.current.callbacks = { onTooltip: setTooltip, onSelectProject, onOpenTask, onReplay };
    }
  }, [onSelectProject, onOpenTask, onReplay]);

  useEffect(() => {
    engine.current?.setOptions({ highlightIds, selectedId, isDark, today, reduced });
  }, [highlightIds, selectedId, isDark, today, reduced]);

  useEffect(() => {
    engine.current?.setSettings(settings);
  }, [settings]);

  const insetRight = insets?.right ?? 0;
  const insetBottom = insets?.bottom ?? 0;
  useEffect(() => {
    engine.current?.setInsets({ right: insetRight, bottom: insetBottom });
  }, [insetRight, insetBottom]);

  useEffect(() => {
    engine.current?.setGraph(graph);
  }, [graph]);

  useEffect(() => {
    if (focus) engine.current?.focus(focus.id);
  }, [focus]);

  useImperativeHandle(
    ref,
    () => ({
      toggleReplay: () => engine.current?.toggleReplay(),
      refit: () => engine.current?.refit(),
    }),
    [],
  );

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        className="block touch-none select-none [outline-offset:-2px]"
      />
      <p id={hintId} className="sr-only">
        Arrow keys pan, plus and minus zoom, 0 fits the graph.
      </p>
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[250px] rounded-lg border border-border bg-elevated px-3 py-2 shadow-card"
          style={{ left: tooltip.x, top: tooltip.y }}
          aria-hidden
        >
          <p className="text-[13px] leading-snug font-medium break-words">{tooltip.title}</p>
          <p className="mt-0.5 text-[12px] text-muted">{tooltip.meta}</p>
        </div>
      ) : null}
      <div
        className={`absolute z-10 flex overflow-hidden rounded-lg border border-border bg-surface shadow-card ${
          controlsStyle ? '' : 'right-3 bottom-3'
        }`}
        style={controlsStyle}
      >
        <button
          type="button"
          className={ZOOM_BTN}
          aria-label="Zoom out"
          title="Zoom out (−)"
          onClick={() => engine.current?.zoomBy(1 / 1.3)}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className={`${ZOOM_BTN} border-x border-border`}
          aria-label="Zoom in"
          title="Zoom in (+)"
          onClick={() => engine.current?.zoomBy(1.3)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className={ZOOM_BTN}
          aria-label="Fit graph to view"
          title="Fit (0)"
          onClick={() => engine.current?.refit()}
        >
          <Maximize size={14} />
        </button>
      </div>
    </div>
  );
}
