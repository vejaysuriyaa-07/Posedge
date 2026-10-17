import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { GraphNode, GraphNodeKind, KnowledgeGraph } from '../../domain/brain';
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

export interface ReplayState {
  active: boolean;
  /** Creation time of the latest node shown (ISO). */
  date?: string;
}

export interface GraphCallbacks {
  onTooltip: (t: GraphTooltip | null) => void;
  onSelectProject: (id: string | undefined) => void;
  onOpenTask: (id: string) => void;
  onReplay: (s: ReplayState) => void;
}

export interface GraphViewOptions {
  highlightIds: ReadonlySet<string>;
  selectedId?: string;
  isDark: boolean;
  today: string;
  reduced: boolean;
}

/** Obsidian-style knobs. Forces are multipliers of the defaults (1 = default). */
export interface GraphSettings {
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  nodeSize: number;
  linkThickness: number;
  /** Zoom level at which task, milestone and topic labels finish fading in. */
  textFade: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  centerForce: 1,
  repelForce: 1,
  linkForce: 1,
  linkDistance: 1,
  nodeSize: 1,
  linkThickness: 1,
  textFade: 1.8,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const STATUS = { todo: 'To do', doing: 'In progress', done: 'Done' } as const;
const MIN_K = 0.12;
const MAX_K = 6;
const GRAVITY = 0.08;
const APPEAR_MS = 320;
const FADE_MS = 160;
const KIND_RANK: Record<GraphNodeKind, number> = {
  project: 0,
  topic: 1,
  milestone: 2,
  task: 3,
  card: 4,
};

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

function baseDistance(l: SimLink): number {
  const s = l.source as SimNode;
  const t = l.target as SimNode;
  if (t.kind === 'topic') return 60;
  if (s.kind === 'card') return 16;
  if (s.kind === 'milestone') return 46;
  return t.kind === 'milestone' ? 26 : 36;
}

function baseCharge(n: SimNode): number {
  if (n.kind === 'project') return -170;
  if (n.kind === 'topic') return -90;
  if (n.kind === 'milestone') return -60;
  return n.kind === 'task' ? -34 : -10;
}

/** Room each node keeps around itself; projects get extra so their labels never collide. */
function personalSpace(n: SimNode): number {
  if (n.kind === 'project') return 26;
  if (n.kind === 'topic') return 10;
  if (n.kind === 'milestone') return 6;
  return n.kind === 'task' ? 4 : 2.5;
}

type Gesture =
  | { type: 'node'; node: SimNode; sx: number; sy: number; moved: boolean }
  | {
      type: 'pan';
      sx: number;
      sy: number;
      vx: number;
      vy: number;
      moved: boolean;
      lx: number;
      ly: number;
      lt: number;
      velX: number;
      velY: number;
    }
  | { type: 'pinch'; dist: number; k: number };

interface View {
  k: number;
  x: number;
  y: number;
}

/**
 * The imperative side of the Brain's graph: a d3-force layout drawn on a canvas, with smooth
 * zoom, momentum panning, pinch, node dragging, Obsidian-style hover highlighting, live force
 * settings and a growth replay. It draws only while something moves, never in an idle loop.
 */
export class GraphEngine {
  private ctx: CanvasRenderingContext2D | null;
  private sim: Simulation<SimNode, SimLink>;
  private nodes = new Map<string, SimNode>();
  private links: SimLink[] = [];
  private adj = new Map<string, Set<string>>();
  private stats = new Map<string, { open: number; cards: number }>();
  private view: View = { k: 1, x: 0, y: 0 };
  private size = { w: 0, h: 0, dpr: 1 };
  /** Space covered by floating UI (answers drawer, ask bar) that fitting should avoid. */
  private insets = { right: 0, bottom: 0 };
  private layoutRatio = 1;
  private lastAutoFit = 0;
  private colors = readColors();
  private opts: GraphViewOptions = {
    highlightIds: new Set(),
    isDark: true,
    today: '',
    reduced: false,
  };
  private settings: GraphSettings = { ...DEFAULT_GRAPH_SETTINGS };
  private frame = 0;
  private ro: ResizeObserver | undefined;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  private cleanup: (() => void)[] = [];
  /** Until VJ pans, zooms or drags, the view keeps fitting the whole graph as it changes. */
  private userMoved = false;
  private hasGraph = false;

  // Animations, all advanced by the same frame loop.
  private hoverId: string | undefined;
  private fade = {
    set: null as Set<string> | null,
    hoverId: undefined as string | undefined,
    value: 0,
    target: 0,
    at: 0,
  };
  private appear = new Map<string, number>();
  private viewAnim: { from: View; to: View; start: number; dur: number } | null = null;
  private zoomTarget: { k: number; sx: number; sy: number } | null = null;
  private inertia: { vx: number; vy: number; at: number } | null = null;
  private replay: {
    order: SimNode[];
    shown: number;
    start: number;
    dur: number;
    visible: Set<string>;
    lastFit: number;
  } | null = null;

  constructor(
    private wrap: HTMLElement,
    private canvas: HTMLCanvasElement,
    public callbacks: GraphCallbacks,
  ) {
    this.ctx = canvas.getContext('2d');
    this.sim = forceSimulation<SimNode, SimLink>()
      .force('charge', forceManyBody<SimNode>().distanceMax(380))
      .force('x', forceX<SimNode>(0))
      .force('y', forceY<SimNode>(0))
      .force('collide', forceCollide<SimNode>().strength(0.9).iterations(2))
      .force(
        'link',
        forceLink<SimNode, SimLink>([]).id((n) => n.id),
      )
      .alphaDecay(0.032)
      .on('tick', () => {
        // While the layout moves on its own, keep it framed (until VJ takes over the view).
        const now = performance.now();
        if (!this.userMoved && !this.replay && !this.gesture && now - this.lastAutoFit > 400) {
          this.lastAutoFit = now;
          this.fit(true);
        }
        this.requestDraw();
      })
      .on('end', () => {
        if (!this.userMoved && !this.replay) this.fit(true);
      });
    this.sim.stop();
    this.applyForces();
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
      this.releaseNode();
      this.gesture = null;
    });
    on('pointerleave', () => {
      if (!this.gesture) this.setHover(undefined);
      this.callbacks.onTooltip(null);
    });
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('keydown', (e) => this.onKey(e));
  }

  destroy() {
    this.sim.stop();
    this.ro?.disconnect();
    this.cleanup.forEach((f) => f());
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  setOptions(opts: GraphViewOptions) {
    if (opts.isDark !== this.opts.isDark) this.colors = readColors();
    const wasReduced = this.opts.reduced;
    this.opts = opts;
    if (opts.reduced && !wasReduced) this.sim.stop();
    this.requestDraw();
  }

  setSettings(s: GraphSettings) {
    const forcesChanged =
      s.centerForce !== this.settings.centerForce ||
      s.repelForce !== this.settings.repelForce ||
      s.linkForce !== this.settings.linkForce ||
      s.linkDistance !== this.settings.linkDistance ||
      s.nodeSize !== this.settings.nodeSize;
    this.settings = { ...s };
    if (forcesChanged) {
      this.applyForces();
      if (this.hasGraph) this.reheat(0.5);
    }
    this.requestDraw();
  }

  /** Swaps in new graph data, keeping the positions of nodes that already exist. */
  setGraph(graph: KnowledgeGraph) {
    if (this.replay) this.stopReplay();
    const prev = this.nodes;
    const next = new Map<string, SimNode>();
    const now = performance.now();
    for (const g of graph.nodes) {
      const old = prev.get(g.id);
      if (old) {
        next.set(g.id, Object.assign(old, g));
        continue;
      }
      const anchor =
        g.kind === 'project' || g.kind === 'topic'
          ? undefined
          : (next.get(g.projectId) ?? prev.get(g.projectId));
      const rand = mulberry32(hashString(g.id));
      const spread = anchor ? 40 : 300;
      next.set(g.id, {
        ...g,
        x: (anchor?.x ?? 0) + (rand() - 0.5) * spread,
        y: (anchor?.y ?? 0) + (rand() - 0.5) * spread,
      });
      // New items pop in once the graph is on screen; the first load appears settled.
      if (this.hasGraph && prev.size && !this.opts.reduced) this.appear.set(g.id, now);
    }
    for (const id of this.appear.keys()) if (!next.has(id)) this.appear.delete(id);
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
    this.links = links;
    this.adj = adj;
    const stats = new Map<string, { open: number; cards: number }>();
    for (const n of graph.nodes) {
      if (!n.projectId) continue;
      const s = stats.get(n.projectId) ?? { open: 0, cards: 0 };
      if (n.kind === 'task' && !n.done) s.open++;
      if (n.kind === 'card') s.cards++;
      stats.set(n.projectId, s);
    }
    this.stats = stats;
    if (this.hoverId && !next.has(this.hoverId)) this.setHover(undefined);

    let added = 0;
    for (const id of next.keys()) if (!prev.has(id)) added++;
    // Settle synchronously when the graph appears or mostly changes, so it shows up in place.
    const fresh = prev.size === 0 || added > next.size * 0.3;
    this.sim.nodes([...next.values()]);
    this.linkForce().links(links);
    this.applyForces();
    this.hasGraph = next.size > 0;
    if (fresh) {
      const { w, h } = this.size;
      this.layoutRatio = w > 1 && h > 1 ? clamp(h / w, 0.55, 1.8) : 1;
    }
    if (fresh || this.opts.reduced) {
      this.sim.stop();
      this.sim.alpha(1);
      const ticks = Math.min(400, 160 + next.size);
      for (let i = 0; i < ticks; i++) this.sim.tick();
      this.appear.clear();
      if (!this.userMoved) this.fit(false);
    } else {
      this.reheat(0.3);
    }
    this.requestDraw();
  }

  setInsets(insets: { right: number; bottom: number }) {
    if (insets.right === this.insets.right && insets.bottom === this.insets.bottom) return;
    this.insets = { ...insets };
    if (!this.userMoved) this.fit(true);
  }

  /** Fit button: fit now and resume auto-fitting. */
  refit() {
    this.userMoved = false;
    this.fit(true);
  }

  focus(id: string) {
    const n = this.nodes.get(id);
    const { w, h } = this.size;
    if (!n || w < 2) return;
    this.userMoved = true;
    const k = clamp(Math.max(this.view.k, 1.7), MIN_K, MAX_K);
    this.moveView({ k, x: w / 2 - (n.x ?? 0) * k, y: h / 2 - (n.y ?? 0) * k }, true);
  }

  zoomBy(factor: number) {
    this.userMoved = true;
    this.zoomSmooth(factor, this.size.w / 2, this.size.h / 2);
  }

  /** Grows the graph node by node in creation order (Obsidian's "animate"). Call again to stop. */
  toggleReplay() {
    if (this.replay) {
      this.stopReplay();
      return;
    }
    const order = [...this.nodes.values()].sort(
      (a, b) =>
        a.born.localeCompare(b.born) ||
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        a.id.localeCompare(b.id),
    );
    if (!order.length) return;
    this.setHover(undefined);
    this.callbacks.onTooltip(null);
    this.replay = {
      order,
      shown: 0,
      start: performance.now(),
      dur: clamp(order.length * 40, 3500, 10000),
      visible: new Set(),
      lastFit: 0,
    };
    if (!this.opts.reduced) {
      this.sim.nodes([]);
      this.linkForce().links([]);
    }
    this.callbacks.onReplay({ active: true, date: order[0]!.born });
    this.requestDraw();
  }

  // ---------------------------------------------------------------- layout

  private linkForce() {
    return this.sim.force('link') as ForceLink<SimNode, SimLink>;
  }

  private applyForces() {
    const s = this.settings;
    const { w, h } = this.size;
    // Gravity follows the panel's shape: a tall panel pulls harder sideways, a wide one vertically.
    const ratio = w > 1 && h > 1 ? clamp(h / w, 0.55, 1.8) : 1;
    (this.sim.force('x') as ReturnType<typeof forceX<SimNode>>).strength(
      GRAVITY * s.centerForce * ratio,
    );
    (this.sim.force('y') as ReturnType<typeof forceY<SimNode>>).strength(
      (GRAVITY * s.centerForce) / ratio,
    );
    (this.sim.force('charge') as ReturnType<typeof forceManyBody<SimNode>>).strength(
      (n) => baseCharge(n) * s.repelForce,
    );
    (this.sim.force('collide') as ReturnType<typeof forceCollide<SimNode>>).radius(
      (n) => n.radius * s.nodeSize + personalSpace(n),
    );
    this.linkForce()
      .distance((l) => baseDistance(l) * s.linkDistance)
      .strength(clamp(0.7 * s.linkForce, 0, 2));
  }

  private reheat(alpha: number) {
    if (this.opts.reduced) {
      // No animated settling: jump to the new equilibrium.
      this.sim.alpha(alpha);
      for (let i = 0; i < 150; i++) this.sim.tick();
      this.sim.stop();
      if (!this.userMoved) this.fit(false);
      this.requestDraw();
      return;
    }
    this.sim.alpha(Math.max(this.sim.alpha(), alpha)).restart();
  }

  private visibleNodes(): SimNode[] {
    const all = [...this.nodes.values()];
    const r = this.replay;
    return r ? all.filter((n) => r.visible.has(n.id)) : all;
  }

  private fit(animate: boolean, nodes = this.visibleNodes()) {
    const { w, h } = this.size;
    if (w < 2 || h < 2 || !nodes.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of nodes) {
      const r = n.radius * this.settings.nodeSize;
      x0 = Math.min(x0, (n.x ?? 0) - r);
      y0 = Math.min(y0, (n.y ?? 0) - r);
      x1 = Math.max(x1, (n.x ?? 0) + r);
      y1 = Math.max(y1, (n.y ?? 0) + r + 16);
    }
    // Fit into the area not covered by floating UI, leaving room at the sides for labels.
    const aw = Math.max(80, w - this.insets.right);
    const ah = Math.max(80, h - this.insets.bottom);
    const padX = Math.min(170, aw * 0.24);
    const k = clamp(Math.min((aw - padX) / (x1 - x0 || 1), (ah - 80) / (y1 - y0 || 1)), 0.2, 2.2);
    this.moveView({ k, x: aw / 2 - ((x0 + x1) / 2) * k, y: ah / 2 - ((y0 + y1) / 2) * k }, animate);
  }

  // ---------------------------------------------------------------- view

  private moveView(to: View, animate: boolean) {
    this.zoomTarget = null;
    this.inertia = null;
    if (!animate || this.opts.reduced) {
      this.viewAnim = null;
      this.view = to;
    } else {
      this.viewAnim = { from: { ...this.view }, to, start: performance.now(), dur: 450 };
    }
    this.requestDraw();
  }

  private zoomAround(k: number, sx: number, sy: number) {
    const v = this.view;
    const nk = clamp(k, MIN_K, MAX_K);
    this.view = { k: nk, x: sx - ((sx - v.x) * nk) / v.k, y: sy - ((sy - v.y) * nk) / v.k };
  }

  /** Eases toward the target zoom (instant under reduced motion). */
  private zoomSmooth(factor: number, sx: number, sy: number) {
    this.viewAnim = null;
    this.inertia = null;
    const base = this.zoomTarget?.k ?? this.view.k;
    const k = clamp(base * factor, MIN_K, MAX_K);
    if (this.opts.reduced) {
      this.zoomAround(k, sx, sy);
      this.zoomTarget = null;
    } else {
      this.zoomTarget = { k, sx, sy };
    }
    this.requestDraw();
  }

  private measure() {
    const r = this.wrap.getBoundingClientRect();
    const prev = this.size;
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === prev.w && h === prev.h && dpr === prev.dpr) return;
    if (prev.w > 1 && prev.h > 1) {
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
    this.applyForces();
    // A big change in the panel's shape (e.g. going full screen) re-spreads the layout to suit it.
    const ratio = w > 1 && h > 1 ? clamp(h / w, 0.55, 1.8) : 1;
    if (this.hasGraph && Math.abs(Math.log(ratio / this.layoutRatio)) > 0.25 && !this.replay) {
      this.layoutRatio = ratio;
      this.reheat(0.35);
    } else if (!this.hasGraph) {
      this.layoutRatio = ratio;
    }
    if (!this.userMoved) this.fit(false);
    this.draw(performance.now());
  }

  // ---------------------------------------------------------------- frames

  private requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame((now) => {
      this.frame = 0;
      const busy = this.step(now);
      this.draw(now);
      if (busy) this.requestDraw();
    });
  }

  /** Advances animations; returns true while any still runs. */
  private step(now: number): boolean {
    let busy = false;
    if (this.viewAnim) {
      const a = this.viewAnim;
      const t = Math.min(1, (now - a.start) / a.dur);
      const e = easeOut(t);
      this.view = {
        k: a.from.k + (a.to.k - a.from.k) * e,
        x: a.from.x + (a.to.x - a.from.x) * e,
        y: a.from.y + (a.to.y - a.from.y) * e,
      };
      if (t >= 1) this.viewAnim = null;
      else busy = true;
    }
    if (this.zoomTarget) {
      const z = this.zoomTarget;
      const k = this.view.k + (z.k - this.view.k) * 0.28;
      this.zoomAround(Math.abs(z.k - k) / z.k < 0.002 ? z.k : k, z.sx, z.sy);
      if (this.view.k === z.k) this.zoomTarget = null;
      else busy = true;
    }
    if (this.inertia) {
      const i = this.inertia;
      const dt = Math.min(48, now - i.at);
      i.at = now;
      const decay = Math.pow(0.92, dt / 16);
      i.vx *= decay;
      i.vy *= decay;
      this.view = { ...this.view, x: this.view.x + i.vx * dt, y: this.view.y + i.vy * dt };
      if (Math.hypot(i.vx, i.vy) < 0.02) this.inertia = null;
      else busy = true;
    }
    const f = this.fade;
    if (f.value !== f.target) {
      const d = Math.max(0, now - f.at) / FADE_MS;
      f.at = now;
      f.value =
        f.target > f.value ? Math.min(f.target, f.value + d) : Math.max(f.target, f.value - d);
      if (f.value === 0) f.set = null;
      busy = busy || f.value !== f.target;
    }
    if (this.appear.size) {
      for (const [id, t0] of this.appear) if (now - t0 > APPEAR_MS) this.appear.delete(id);
      busy = busy || this.appear.size > 0;
    }
    if (this.replay) busy = this.stepReplay(now) || busy;
    return busy;
  }

  private stepReplay(now: number): boolean {
    const r = this.replay!;
    const t = clamp((now - r.start) / r.dur, 0, 1);
    const target = Math.max(1, Math.ceil(t * r.order.length));
    if (target > r.shown) {
      for (let i = r.shown; i < target; i++) {
        const n = r.order[i]!;
        r.visible.add(n.id);
        if (!this.opts.reduced) this.appear.set(n.id, now);
        if (!this.opts.reduced) {
          // Sprout from an already visible neighbor, then let the forces carry it into place.
          let anchor: SimNode | undefined;
          for (const id of this.adj.get(n.id) ?? []) {
            if (r.visible.has(id) && id !== n.id) {
              anchor = this.nodes.get(id);
              break;
            }
          }
          const rand = mulberry32(hashString(n.id) ^ i);
          n.x = (anchor?.x ?? 0) + (rand() - 0.5) * 24;
          n.y = (anchor?.y ?? 0) + (rand() - 0.5) * 24;
          n.vx = 0;
          n.vy = 0;
        }
      }
      r.shown = target;
      if (!this.opts.reduced) {
        this.sim.nodes(r.order.slice(0, target));
        this.linkForce().links(
          this.links.filter(
            (l) =>
              r.visible.has((l.source as SimNode).id) && r.visible.has((l.target as SimNode).id),
          ),
        );
        this.sim.alpha(Math.max(this.sim.alpha(), 0.4)).restart();
      }
      this.callbacks.onReplay({ active: true, date: r.order[target - 1]!.born });
    }
    if (!this.userMoved && now - r.lastFit > 350) {
      r.lastFit = now;
      this.fit(!this.opts.reduced, this.visibleNodes());
    }
    if (t >= 1) {
      this.stopReplay();
      return false;
    }
    return true;
  }

  private stopReplay() {
    if (!this.replay) return;
    this.replay = null;
    this.sim.nodes([...this.nodes.values()]);
    this.linkForce().links(this.links);
    this.applyForces();
    this.reheat(0.3);
    this.callbacks.onReplay({ active: false });
    this.requestDraw();
  }

  // ---------------------------------------------------------------- drawing

  private nodeAlpha(n: SimNode, lit: ReadonlySet<string> | null): number {
    const f = this.fade;
    const base = n.done ? 0.45 : 1;
    const litDim = lit && !lit.has(n.id) ? 0.16 : 1;
    if (!f.set || f.value === 0) return base * litDim;
    const target = f.set.has(n.id) ? 1 : 0.12;
    return base * (litDim + (target - litDim) * f.value);
  }

  private draw(now: number) {
    const ctx = this.ctx;
    const { w, h, dpr } = this.size;
    if (!ctx || w < 2 || h < 2) return;
    const c = this.colors;
    const s = this.settings;
    const { k, x, y } = this.view;
    const { highlightIds, selectedId, isDark } = this.opts;
    const mode = isDark ? 'dark' : 'light';
    const lit = highlightIds.size ? highlightIds : null;
    const fadeOn = this.fade.set && this.fade.value > 0 ? this.fade : null;
    const visible = this.replay?.visible;
    const shown = (n: SimNode) => !visible || visible.has(n.id);
    const scaleOf = (n: SimNode) => {
      const t0 = this.appear.get(n.id);
      return t0 === undefined ? 1 : easeOut(clamp((now - t0) / APPEAR_MS, 0, 1));
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);

    // Links: one faint pass, then the hovered node's (or the lit items') links in the accent.
    const base = isDark ? 0.15 : 0.2;
    const dimmed = fadeOn ? base + (0.05 - base) * fadeOn.value : lit ? 0.06 : base;
    ctx.lineWidth = (1 / k) * s.linkThickness;
    ctx.strokeStyle = rgba(c.fg, dimmed);
    ctx.beginPath();
    for (const l of this.links) {
      const a = l.source as SimNode;
      const b = l.target as SimNode;
      if (!shown(a) || !shown(b)) continue;
      ctx.moveTo(a.x ?? 0, a.y ?? 0);
      ctx.lineTo(b.x ?? 0, b.y ?? 0);
    }
    ctx.stroke();
    if (fadeOn || lit) {
      const hover = fadeOn?.hoverId;
      ctx.beginPath();
      for (const l of this.links) {
        const a = l.source as SimNode;
        const b = l.target as SimNode;
        if (!shown(a) || !shown(b)) continue;
        // Hover: all of the node's links. Lit items: each one's link up to its parent.
        const on = hover ? a.id === hover || b.id === hover : !!lit?.has(a.id);
        if (!on) continue;
        ctx.moveTo(a.x ?? 0, a.y ?? 0);
        ctx.lineTo(b.x ?? 0, b.y ?? 0);
      }
      const v = fadeOn?.value ?? 0;
      ctx.strokeStyle = rgba(c.brand, hover ? 0.8 * v : 0.6 * (1 - v));
      ctx.lineWidth = (1.4 / k) * s.linkThickness;
      ctx.stroke();
    }

    for (const n of this.nodes.values()) {
      if (!shown(n)) continue;
      const nx = n.x ?? 0;
      const ny = n.y ?? 0;
      const r = n.radius * s.nodeSize * scaleOf(n);
      if (r <= 0.05) continue;
      ctx.globalAlpha = this.nodeAlpha(n, lit);
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      if (n.kind === 'milestone') {
        ctx.fillStyle = c.surface;
        ctx.fill();
        ctx.strokeStyle = accentHex(n.color, mode);
        ctx.lineWidth = 1.6 / Math.max(k, 0.6);
        ctx.stroke();
      } else {
        ctx.fillStyle =
          n.kind === 'topic'
            ? rgba(c.fg, 0.88)
            : n.kind === 'card'
              ? rgba(c.muted, 0.85)
              : n.kind === 'task'
                ? rgba(accentHex(n.color, mode), 0.85)
                : accentHex(n.color, mode);
        ctx.fill();
      }
      if (n.id === selectedId || n.id === this.hoverId || lit?.has(n.id)) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(nx, ny, r + 2.5 / Math.max(k, 0.5), 0, Math.PI * 2);
        ctx.strokeStyle = c.brand;
        ctx.lineWidth = 1.5 / k;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Labels in screen space: projects always; the rest fade in with zoom. A label is skipped where
    // it would overlap one already drawn (projects, then hovered or lit items, go first).
    const detail = clamp((k - (s.textFade - 0.55)) / 0.55, 0, 1);
    const topicDetail = clamp((k - (s.textFade - 1)) / 0.55, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const placed: [number, number, number, number][] = [];
    const inFocus = (n: SimNode) => !!(fadeOn?.set?.has(n.id) || lit?.has(n.id));
    const rank = (n: SimNode) =>
      n.kind === 'project' ? 0 : inFocus(n) ? 1 : KIND_RANK[n.kind] + 1;
    const order = [...this.nodes.values()]
      .filter((n) => n.kind !== 'card' && shown(n))
      .sort((a, b) => rank(a) - rank(b));
    for (const n of order) {
      let a = n.kind === 'project' ? 1 : n.kind === 'topic' ? topicDetail : detail;
      if (inFocus(n)) a = 1;
      else if (fadeOn) a *= 1 - 0.85 * fadeOn.value;
      else if (lit) a *= n.kind === 'project' ? 0.55 : 0.25;
      a *= scaleOf(n);
      if (a < 0.03) continue;
      const r = n.radius * s.nodeSize;
      const sx = (n.x ?? 0) * k + x;
      const below = (n.y ?? 0) * k + y + r * k + 4;
      const above = (n.y ?? 0) * k + y - r * k - 18;
      if (sx < -150 || sx > w + 150 || below < -20 || above > h + 20) continue;
      const text =
        n.kind === 'project'
          ? `${n.emoji} ${n.label}`
          : n.kind === 'topic'
            ? `#${n.label}`
            : n.label.length > 34
              ? `${n.label.slice(0, 33).trimEnd()}…`
              : n.label;
      ctx.font = n.kind === 'project' ? `500 12px ${c.font}` : `400 11px ${c.font}`;
      const half = ctx.measureText(text).width / 2 + 3;
      // Keep labels of on-screen nodes fully inside the canvas.
      const lx = sx >= 0 && sx <= w && w > half * 2 + 8 ? clamp(sx, half + 4, w - half - 4) : sx;
      const free = (ty: number) =>
        !placed.some(
          (q) => lx - half < q[2] && lx + half > q[0] && ty - 1 < q[3] && ty + 14 > q[1],
        );
      // Projects try below, above, then nudged further out; others only below. A label that can't
      // find room steps aside (the project chips still name every project), unless it's in focus.
      const spots = n.kind === 'project' ? [below, above, below + 14, above - 14] : [below];
      const ty = spots.find(free) ?? (inFocus(n) || n.id === selectedId ? below : undefined);
      if (ty === undefined) continue;
      placed.push([lx - half, ty - 1, lx + half, ty + 14]);
      ctx.fillStyle = rgba(n.kind === 'project' || n.kind === 'topic' ? c.fg : c.muted, a * 0.92);
      ctx.fillText(text, lx, ty);
    }
  }

  // ---------------------------------------------------------------- input

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
      if (this.replay && !this.replay.visible.has(n.id)) continue;
      const d = Math.hypot((n.x ?? 0) - wx, (n.y ?? 0) - wy);
      // Generous targets: at least ~8px on screen, so small nodes stay easy to hit.
      const reach = Math.max(n.radius * this.settings.nodeSize, 8 / k) + 2 / k;
      if (d < reach && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private setHover(id: string | undefined) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    const f = this.fade;
    f.at = performance.now();
    if (id) {
      f.set = new Set([id, ...(this.adj.get(id) ?? [])]);
      f.hoverId = id;
      f.target = 1;
    } else {
      f.target = 0;
      f.hoverId = undefined;
    }
    if (this.opts.reduced) {
      f.value = f.target;
      if (!id) f.set = null;
    }
    this.requestDraw();
  }

  private describe(n: SimNode): Omit<GraphTooltip, 'x' | 'y'> {
    if (n.kind === 'project') {
      const st = this.stats.get(n.id);
      const open = st?.open ?? 0;
      const cards = st?.cards ?? 0;
      return {
        title: `${n.emoji} ${n.label}`,
        meta: `Project · ${open} open task${open === 1 ? '' : 's'} · ${cards} card${cards === 1 ? '' : 's'}`,
      };
    }
    if (n.kind === 'topic') {
      const deg = this.adj.get(n.id)?.size ?? 0;
      return {
        title: `#${n.label}`,
        meta: `Topic · links ${deg} item${deg === 1 ? '' : 's'} across projects`,
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

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = this.local(e);
    this.userMoved = true;
    // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as larger steps.
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomSmooth(Math.exp(-clamp(delta, -120, 120) * (e.ctrlKey ? 0.01 : 0.0022)), p.x, p.y);
  }

  private onKey(e: KeyboardEvent) {
    const step = 60;
    const keys: Record<string, () => void> = {
      '+': () => this.zoomBy(1.25),
      '=': () => this.zoomBy(1.25),
      '-': () => this.zoomBy(1 / 1.25),
      _: () => this.zoomBy(1 / 1.25),
      '0': () => this.refit(),
      ArrowLeft: () => this.panBy(step, 0),
      ArrowRight: () => this.panBy(-step, 0),
      ArrowUp: () => this.panBy(0, step),
      ArrowDown: () => this.panBy(0, -step),
    };
    const fn = keys[e.key];
    if (!fn || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    fn();
  }

  private panBy(dx: number, dy: number) {
    this.userMoved = true;
    const v = this.view;
    this.moveView({ k: v.k, x: v.x + dx, y: v.y + dy }, true);
  }

  private onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = this.local(e);
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // The pointer may already be gone (e.g. a cancelled touch); dragging still works without it.
    }
    this.pointers.set(e.pointerId, p);
    this.inertia = null;
    this.viewAnim = null;
    this.zoomTarget = null;
    if (this.pointers.size === 2) {
      this.releaseNode();
      const [a, b] = [...this.pointers.values()];
      this.gesture = { type: 'pinch', dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: this.view.k };
      return;
    }
    if (this.pointers.size > 2) return;
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
        lx: p.x,
        ly: p.y,
        lt: performance.now(),
        velX: 0,
        velY: 0,
      };
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private onMove(e: PointerEvent) {
    const p = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (g?.type === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.userMoved = true;
      this.zoomAround((g.k * dist) / (g.dist || 1), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      this.requestDraw();
      return;
    }
    if (g?.type === 'node') {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 4) {
        g.moved = true;
        this.userMoved = true;
        this.canvas.style.cursor = 'grabbing';
        this.callbacks.onTooltip(null);
        if (!this.opts.reduced && !this.replay) this.sim.alphaTarget(0.3).restart();
      }
      if (g.moved) {
        const { k, x, y } = this.view;
        g.node.fx = (p.x - x) / k;
        g.node.fy = (p.y - y) / k;
        if (this.opts.reduced || this.replay) {
          g.node.x = g.node.fx;
          g.node.y = g.node.fy;
        }
        this.requestDraw();
      }
      return;
    }
    if (g?.type === 'pan') {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 4) {
        g.moved = true;
        this.userMoved = true;
      }
      if (g.moved) {
        const t = performance.now();
        const dt = Math.max(1, t - g.lt);
        // Smoothed release velocity for momentum.
        g.velX = 0.8 * ((p.x - g.lx) / dt) + 0.2 * g.velX;
        g.velY = 0.8 * ((p.y - g.ly) / dt) + 0.2 * g.velY;
        g.lx = p.x;
        g.ly = p.y;
        g.lt = t;
        this.view = { ...this.view, x: g.vx + p.x - g.sx, y: g.vy + p.y - g.sy };
        this.requestDraw();
      }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const node = this.hitTest(p.x, p.y);
    this.setHover(node?.id);
    this.canvas.style.cursor = node ? 'pointer' : 'grab';
    if (node) {
      const maxX = this.size.w - 262;
      const flipY = p.y > this.size.h - 90;
      this.callbacks.onTooltip({
        ...this.describe(node),
        x: clamp(p.x + 14, 8, Math.max(8, maxX)),
        y: flipY ? p.y - 70 : p.y + 18,
      });
    } else this.callbacks.onTooltip(null);
  }

  private releaseNode() {
    const g = this.gesture;
    if (g?.type !== 'node') return;
    g.node.fx = null;
    g.node.fy = null;
    this.sim.alphaTarget(0);
  }

  private onUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g?.type === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    this.gesture = null;
    this.canvas.style.cursor = e.pointerType === 'mouse' ? 'grab' : '';
    if (g?.type === 'node') {
      g.node.fx = null;
      g.node.fy = null;
      this.sim.alphaTarget(0);
      if (g.moved) return;
      const n = g.node;
      if (n.kind === 'task') this.callbacks.onOpenTask(n.id);
      else if (n.kind === 'project')
        this.callbacks.onSelectProject(n.id === this.opts.selectedId ? undefined : n.id);
      else if (n.kind === 'topic') this.focus(n.id);
      else this.callbacks.onSelectProject(n.projectId);
    } else if (g?.type === 'pan') {
      if (!g.moved) {
        this.callbacks.onSelectProject(undefined);
        return;
      }
      const recent = performance.now() - g.lt < 60;
      if (recent && !this.opts.reduced && Math.hypot(g.velX, g.velY) > 0.15) {
        this.inertia = { vx: g.velX, vy: g.velY, at: performance.now() };
        this.requestDraw();
      }
    }
  }
}
