import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { GraphNode, KnowledgeGraph } from '../../domain/brain';
import { accentHex } from '../../domain/colors';
import { hashString, mulberry32 } from '../../domain/random';
import { formatDate, relativeDayLabel } from '../../domain/week';

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode>;

export interface GraphTooltip {
  x: number;
  y: number;
  title: string;
  meta: string;
}

export interface GraphCallbacks {
  onTooltip: (t: GraphTooltip | null) => void;
  onSelectProject: (id: string | undefined) => void;
  onOpenTask: (id: string) => void;
}

export interface GraphViewOptions {
  highlightIds: ReadonlySet<string>;
  selectedId?: string;
  isDark: boolean;
  today: string;
  reduced: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const STATUS = { todo: 'To do', doing: 'In progress', done: 'Done' } as const;
const MIN_K = 0.15;
const MAX_K = 5;

function rgba(hex: string, a: number): string {
  const h = hex.trim().replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(a, 0, 1)})`;
}

function readColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    fg: v('--pe-fg', '#e6e8ee'),
    muted: v('--pe-muted', '#9aa3b2'),
    brand: v('--pe-brand', '#a78bfa'),
    surface: v('--pe-surface', '#141821'),
    font: getComputedStyle(document.body).fontFamily || 'sans-serif',
  };
}

function linkDistance(l: SimLink): number {
  const s = l.source as SimNode;
  const t = l.target as SimNode;
  if (s.kind === 'card') return 14;
  if (s.kind === 'milestone') return 46;
  return t.kind === 'milestone' ? 24 : 34;
}

function charge(n: SimNode): number {
  return n.kind === 'project' ? -170 : n.kind === 'milestone' ? -60 : n.kind === 'task' ? -34 : -10;
}

/** Projects get extra room so their labels don't collide. */
function collideRadius(n: SimNode): number {
  return n.kind === 'project' ? n.radius + 26 : n.radius + 1.5;
}

const GRAVITY = 0.08;

type Gesture =
  | { type: 'node'; node: SimNode; sx: number; sy: number; moved: boolean }
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { type: 'pinch'; dist: number; k: number };

/**
 * The imperative side of the Brain's graph view: a d3-force layout drawn on a canvas, with pan,
 * zoom, pinch, node dragging and Obsidian-style hover highlighting. Draws only when something
 * changes (layout ticks, interaction), never in an idle loop.
 */
export class GraphEngine {
  private ctx: CanvasRenderingContext2D | null;
  private sim: Simulation<SimNode, SimLink> | null = null;
  private nodes = new Map<string, SimNode>();
  private links: SimLink[] = [];
  private adj = new Map<string, Set<string>>();
  private stats = new Map<string, { open: number; cards: number }>();
  private view = { k: 1, x: 0, y: 0 };
  private size = { w: 0, h: 0, dpr: 1 };
  private hoverId: string | undefined;
  private colors = readColors();
  private opts: GraphViewOptions = {
    highlightIds: new Set(),
    isDark: true,
    today: '',
    reduced: false,
  };
  private frame = 0;
  /** Until VJ pans, zooms or drags, the view keeps fitting the whole graph as it changes. */
  private userMoved = false;
  private ro: ResizeObserver | undefined;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  private cleanup: (() => void)[] = [];

  constructor(
    private wrap: HTMLElement,
    private canvas: HTMLCanvasElement,
    public callbacks: GraphCallbacks,
  ) {
    this.ctx = canvas.getContext('2d');
    this.measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(wrap);
    }
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      canvas.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => canvas.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => this.onDown(e));
    on('pointermove', (e) => this.onMove(e));
    on('pointerup', (e) => this.onUp(e));
    on('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.gesture = null;
    });
    on('pointerleave', () => {
      if (this.hoverId) {
        this.hoverId = undefined;
        this.requestDraw();
      }
      this.callbacks.onTooltip(null);
    });
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        this.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      },
      { passive: false },
    );
  }

  destroy() {
    this.sim?.stop();
    this.ro?.disconnect();
    this.cleanup.forEach((f) => f());
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  setOptions(opts: GraphViewOptions) {
    if (opts.isDark !== this.opts.isDark) this.colors = readColors();
    this.opts = opts;
    this.requestDraw();
  }

  /** Swaps in new graph data, keeping the positions of nodes that already exist. */
  setGraph(graph: KnowledgeGraph) {
    const prev = this.nodes;
    const next = new Map<string, SimNode>();
    for (const g of graph.nodes) {
      const old = prev.get(g.id);
      if (old) {
        next.set(g.id, Object.assign(old, g));
        continue;
      }
      const parent =
        g.kind === 'project' ? undefined : (next.get(g.projectId) ?? prev.get(g.projectId));
      const rand = mulberry32(hashString(g.id));
      const spread = g.kind === 'project' ? 260 : 50;
      next.set(g.id, {
        ...g,
        x: (parent?.x ?? 0) + (rand() - 0.5) * spread,
        y: (parent?.y ?? 0) + (rand() - 0.5) * spread,
      });
    }
    this.nodes = next;
    const links: SimLink[] = [];
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    for (const l of graph.links) {
      if (!next.has(l.source) || !next.has(l.target)) continue;
      links.push({ source: l.source, target: l.target });
      link(l.source, l.target);
      link(l.target, l.source);
    }
    this.adj = adj;
    const stats = new Map<string, { open: number; cards: number }>();
    for (const n of graph.nodes) {
      const s = stats.get(n.projectId) ?? { open: 0, cards: 0 };
      if (n.kind === 'task' && !n.done) s.open++;
      if (n.kind === 'card') s.cards++;
      stats.set(n.projectId, s);
    }
    this.stats = stats;

    // Settle synchronously when the graph appears or mostly changes, so it shows up in place.
    let added = 0;
    for (const id of next.keys()) if (!prev.has(id)) added++;
    const fresh = prev.size === 0 || added > next.size * 0.3;
    if (!this.sim) {
      this.sim = forceSimulation<SimNode, SimLink>()
        .force('charge', forceManyBody<SimNode>().strength(charge).distanceMax(360))
        .force('x', forceX<SimNode>(0))
        .force('y', forceY<SimNode>(0))
        .force('collide', forceCollide<SimNode>(collideRadius))
        .alphaDecay(0.035)
        .on('tick', () => this.requestDraw())
        .on('end', () => {
          if (!this.userMoved) this.fit(true);
        });
    }
    const sim = this.sim;
    this.shapeGravity();
    sim.nodes([...next.values()]);
    sim.force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((n) => n.id)
        .distance(linkDistance)
        .strength(0.8),
    );
    this.links = links;
    if (fresh || this.opts.reduced) {
      // Reduced motion: no animated settling, ever.
      sim.stop();
      sim.alpha(1);
      for (let i = 0; i < 320; i++) sim.tick();
      this.requestDraw();
    } else {
      sim.alpha(0.3).restart();
    }
    if (fresh && !this.userMoved) this.fit(false);
  }

  /** Gravity follows the panel's shape: a tall panel pulls harder sideways, a wide one vertically. */
  private shapeGravity() {
    const { w, h } = this.size;
    const ratio = w > 1 && h > 1 ? clamp(h / w, 0.55, 1.8) : 1;
    (this.sim?.force('x') as ReturnType<typeof forceX<SimNode>> | undefined)?.strength(
      GRAVITY * ratio,
    );
    (this.sim?.force('y') as ReturnType<typeof forceY<SimNode>> | undefined)?.strength(
      GRAVITY / ratio,
    );
  }

  fit(animate: boolean) {
    const { w, h } = this.size;
    const nodes = [...this.nodes.values()];
    if (!w || !h || !nodes.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, (n.x ?? 0) - n.radius);
      y0 = Math.min(y0, (n.y ?? 0) - n.radius);
      x1 = Math.max(x1, (n.x ?? 0) + n.radius);
      y1 = Math.max(y1, (n.y ?? 0) + n.radius + 16);
    }
    // Leave room at the sides for labels, which are drawn centered under nodes.
    const padX = Math.min(170, w * 0.24);
    const k = clamp(Math.min((w - padX) / (x1 - x0 || 1), (h - 72) / (y1 - y0 || 1)), 0.25, 2.2);
    this.moveView({ k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k }, animate);
  }

  focus(id: string) {
    this.userMoved = true;
    const n = this.nodes.get(id);
    const { w, h } = this.size;
    if (!n || !w) return;
    const k = clamp(Math.max(this.view.k, 1.6), MIN_K, MAX_K);
    this.moveView({ k, x: w / 2 - (n.x ?? 0) * k, y: h / 2 - (n.y ?? 0) * k }, true);
  }

  zoomBy(factor: number) {
    this.zoomAt(factor, this.size.w / 2, this.size.h / 2);
  }

  /** "Fit" button: fit now and resume auto-fitting. */
  refit() {
    this.userMoved = false;
    this.fit(true);
  }

  private zoomAt(factor: number, sx: number, sy: number) {
    this.userMoved = true;
    const v = this.view;
    const k = clamp(v.k * factor, MIN_K, MAX_K);
    this.view = { k, x: sx - ((sx - v.x) * k) / v.k, y: sy - ((sy - v.y) * k) / v.k };
    this.requestDraw();
  }

  private moveView(to: { k: number; x: number; y: number }, animate: boolean) {
    if (!animate || this.opts.reduced) {
      this.view = to;
      this.requestDraw();
      return;
    }
    const from = { ...this.view };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const e = 1 - (1 - t) ** 3;
      this.view = {
        k: from.k + (to.k - from.k) * e,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
      };
      this.draw();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private measure() {
    const r = this.wrap.getBoundingClientRect();
    const prev = this.size;
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (prev.w && (prev.w !== w || prev.h !== h)) {
      // Keep the same point centered when the panel resizes.
      this.view = {
        ...this.view,
        x: this.view.x + (w - prev.w) / 2,
        y: this.view.y + (h - prev.h) / 2,
      };
    }
    this.size = { w, h, dpr };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (!this.userMoved) this.fit(false);
    this.draw();
  }

  private requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    const ctx = this.ctx;
    const { w, h, dpr } = this.size;
    if (!ctx || !w || !h) return;
    const c = this.colors;
    const { k, x, y } = this.view;
    const { highlightIds, selectedId, isDark } = this.opts;
    const mode = isDark ? 'dark' : 'light';
    const hover = this.hoverId ? this.nodes.get(this.hoverId) : undefined;
    const focusSet = hover ? new Set([hover.id, ...(this.adj.get(hover.id) ?? [])]) : null;
    const lit = highlightIds.size ? highlightIds : null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);

    // Links: one faint pass, then the hovered node's (or the lit sources') links in the accent.
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    for (const l of this.links) {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      ctx.moveTo(s.x ?? 0, s.y ?? 0);
      ctx.lineTo(t.x ?? 0, t.y ?? 0);
    }
    ctx.strokeStyle = rgba(c.fg, focusSet || lit ? 0.06 : isDark ? 0.14 : 0.2);
    ctx.stroke();
    if (focusSet || lit) {
      ctx.beginPath();
      for (const l of this.links) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        // Hover: all of the node's links. Sources: each cited item's link up to its parent.
        const on = hover ? s.id === hover.id || t.id === hover.id : lit!.has(s.id);
        if (!on) continue;
        ctx.moveTo(s.x ?? 0, s.y ?? 0);
        ctx.lineTo(t.x ?? 0, t.y ?? 0);
      }
      ctx.strokeStyle = rgba(c.brand, 0.75);
      ctx.lineWidth = 1.3 / k;
      ctx.stroke();
    }

    for (const n of this.nodes.values()) {
      const dim = focusSet ? !focusSet.has(n.id) : lit ? !lit.has(n.id) : false;
      const nx = n.x ?? 0;
      const ny = n.y ?? 0;
      const accent = accentHex(n.color, mode);
      ctx.globalAlpha = (dim ? 0.14 : 1) * (n.done ? 0.45 : 1);
      ctx.beginPath();
      ctx.arc(nx, ny, n.radius, 0, Math.PI * 2);
      if (n.kind === 'milestone') {
        ctx.fillStyle = c.surface;
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.6 / Math.max(k, 0.6);
        ctx.stroke();
      } else {
        ctx.fillStyle =
          n.kind === 'card' ? rgba(c.muted, 0.85) : n.kind === 'task' ? rgba(accent, 0.8) : accent;
        ctx.fill();
      }
      if (n.id === selectedId || n.id === hover?.id || lit?.has(n.id)) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(nx, ny, n.radius + 2.5 / Math.max(k, 0.5), 0, Math.PI * 2);
        ctx.strokeStyle = c.brand;
        ctx.lineWidth = 1.5 / k;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Labels in screen space: projects always; tasks and milestones fade in as you zoom in, and a
    // label is skipped where it would overlap one already drawn (projects and lit items go first).
    const detail = clamp((k - 1.7) / 0.6, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const placed: [number, number, number, number][] = [];
    const rank = (n: SimNode) =>
      n.kind === 'project'
        ? 0
        : focusSet?.has(n.id) || lit?.has(n.id)
          ? 1
          : n.kind === 'milestone'
            ? 2
            : 3;
    const order = [...this.nodes.values()]
      .filter((n) => n.kind !== 'card')
      .sort((a, b) => rank(a) - rank(b));
    for (const n of order) {
      let a = n.kind === 'project' ? 1 : detail;
      if (focusSet?.has(n.id) || lit?.has(n.id)) a = 1;
      else if (focusSet) a *= 0.15;
      else if (lit && n.kind !== 'project') a *= 0.25;
      if (a < 0.03) continue;
      const sx = (n.x ?? 0) * k + x;
      const sy = (n.y ?? 0) * k + y + n.radius * k + 4;
      if (sx < -120 || sx > w + 120 || sy < -20 || sy > h + 20) continue;
      const text =
        n.kind === 'project'
          ? `${n.emoji} ${n.label}`
          : n.label.length > 34
            ? `${n.label.slice(0, 33).trimEnd()}…`
            : n.label;
      ctx.font = n.kind === 'project' ? `500 12px ${c.font}` : `400 11px ${c.font}`;
      const half = ctx.measureText(text).width / 2 + 3;
      const box: [number, number, number, number] = [sx - half, sy - 1, sx + half, sy + 14];
      if (
        n.kind !== 'project' &&
        placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])
      ) {
        continue;
      }
      placed.push(box);
      ctx.fillStyle = rgba(n.kind === 'project' ? c.fg : c.muted, a * 0.92);
      ctx.fillText(text, sx, sy);
    }
  }

  private local(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private hitTest(sx: number, sy: number): SimNode | undefined {
    const { k, x, y } = this.view;
    const wx = (sx - x) / k;
    const wy = (sy - y) / k;
    let best: SimNode | undefined;
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      const d = Math.hypot((n.x ?? 0) - wx, (n.y ?? 0) - wy);
      if (d < n.radius + 5 / k && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private describe(n: SimNode): Omit<GraphTooltip, 'x' | 'y'> {
    if (n.kind === 'project') {
      const s = this.stats.get(n.id);
      const open = s?.open ?? 0;
      const cards = s?.cards ?? 0;
      return {
        title: `${n.emoji} ${n.label}`,
        meta: `Project · ${open} open task${open === 1 ? '' : 's'} · ${cards} card${cards === 1 ? '' : 's'}`,
      };
    }
    if (n.kind === 'milestone') {
      return {
        title: n.label,
        meta: `${n.emoji} Milestone · week of ${n.date ? formatDate(n.date, 'MMM d') : '?'}`,
      };
    }
    if (n.kind === 'card') return { title: n.label, meta: `${n.emoji} Review card` };
    const bits = [
      n.status ? STATUS[n.status] : '',
      n.big3 ? 'Big 3' : '',
      n.date ? relativeDayLabel(n.date, this.opts.today) : '',
    ];
    return { title: n.label, meta: `${n.emoji} ${bits.filter(Boolean).join(' · ')}` };
  }

  private onDown(e: PointerEvent) {
    const p = this.local(e);
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = { type: 'pinch', dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: this.view.k };
      return;
    }
    const node = this.hitTest(p.x, p.y);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      this.gesture = { type: 'node', node, sx: p.x, sy: p.y, moved: false };
    } else {
      this.gesture = {
        type: 'pan',
        sx: p.x,
        sy: p.y,
        vx: this.view.x,
        vy: this.view.y,
        moved: false,
      };
    }
  }

  private onMove(e: PointerEvent) {
    const p = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (g?.type === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const target = clamp((g.k * dist) / (g.dist || 1), MIN_K, MAX_K);
      this.zoomAt(target / this.view.k, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      return;
    }
    if (g?.type === 'node') {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 3) {
        g.moved = true;
        if (!this.opts.reduced) this.sim?.alphaTarget(0.2).restart();
        this.callbacks.onTooltip(null);
      }
      if (g.moved) {
        this.userMoved = true;
        const { k, x, y } = this.view;
        g.node.fx = (p.x - x) / k;
        g.node.fy = (p.y - y) / k;
        if (this.opts.reduced) {
          g.node.x = g.node.fx;
          g.node.y = g.node.fy;
        }
        this.requestDraw();
      }
      return;
    }
    if (g?.type === 'pan') {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) > 3) g.moved = this.userMoved = true;
      this.view = { ...this.view, x: g.vx + p.x - g.sx, y: g.vy + p.y - g.sy };
      this.requestDraw();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const node = this.hitTest(p.x, p.y);
    if (node?.id !== this.hoverId) {
      this.hoverId = node?.id;
      this.requestDraw();
    }
    this.canvas.style.cursor = node ? 'pointer' : 'grab';
    if (node) {
      const maxX = this.size.w - 260;
      this.callbacks.onTooltip({
        ...this.describe(node),
        x: clamp(p.x + 14, 8, Math.max(8, maxX)),
        y: p.y + 16,
      });
    } else this.callbacks.onTooltip(null);
  }

  private onUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g?.type === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    this.gesture = null;
    if (g?.type === 'node') {
      g.node.fx = null;
      g.node.fy = null;
      this.sim?.alphaTarget(0);
      if (g.moved) return;
      const n = g.node;
      if (n.kind === 'task') this.callbacks.onOpenTask(n.id);
      else if (n.kind === 'project')
        this.callbacks.onSelectProject(n.id === this.opts.selectedId ? undefined : n.id);
      else this.callbacks.onSelectProject(n.projectId);
    } else if (g?.type === 'pan' && !g.moved) {
      this.callbacks.onSelectProject(undefined);
    }
  }
}
