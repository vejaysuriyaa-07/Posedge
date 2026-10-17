import { useEffect, useRef, useState } from 'react';
import type { BrainGraph, BrainProjectNode, BrainSatellite } from '../../domain/brain';
import { countdownLabel, mulberry32 } from '../../domain/brain';
import { PALETTE } from '../../domain/colors';
import { formatDate, relativeDayLabel } from '../../domain/week';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { HUD, rgba, type CoreActivity } from './hud';

interface Hit {
  id: string;
  kind: 'core' | 'project' | 'task' | 'milestone';
  x: number;
  y: number;
  r: number;
  projectId?: string;
}

interface HoverInfo {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export interface NeuralCoreProps {
  graph: BrainGraph;
  today: string;
  activity: CoreActivity;
  centerLabel: string;
  selectedId?: string;
  label: string;
  onSelectProject: (id: string | undefined) => void;
  onOpenTask: (id: string) => void;
  onCoreClick: () => void;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const STATUS_LABEL = { todo: 'To do', doing: 'In progress', done: 'Done' } as const;

function describe(hit: Hit, graph: BrainGraph, today: string): Omit<HoverInfo, 'x' | 'y'> | null {
  if (hit.kind === 'core') return { title: 'EDGE core', lines: ['Click to talk to EDGE'] };
  const project = graph.projects.find(
    (p) => p.id === (hit.kind === 'project' ? hit.id : hit.projectId),
  );
  if (!project) return null;
  if (hit.kind === 'project') {
    const lines = [
      `${project.weekDone}/${project.weekTotal} done this week · ${project.openTotal} open`,
      `${project.cards} card${project.cards === 1 ? '' : 's'}${project.dueCards ? ` · ${project.dueCards} due` : ''}`,
    ];
    if (project.nextMilestone) {
      lines.push(
        `Next: ${project.nextMilestone.title} (${countdownLabel(project.nextMilestone.daysUntil)})`,
      );
    }
    return { title: `${project.emoji} ${project.name}`, lines };
  }
  const sat = project.satellites.find((s) => s.id === hit.id);
  if (!sat) return null;
  if (sat.kind === 'milestone') {
    return {
      title: `◆ ${sat.title}`,
      lines: [
        `${project.emoji} Milestone · week of ${sat.date ? formatDate(sat.date, 'MMM d') : '?'}`,
      ],
    };
  }
  const meta = [
    STATUS_LABEL[sat.status],
    sat.isBig3 ? 'Big 3' : '',
    sat.date ? relativeDayLabel(sat.date, today) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return { title: sat.title, lines: [`${project.emoji} ${meta}`, 'Click to open'] };
}

/**
 * The Brain's animated "neural core": an arc reactor (VJ) with projects in orbit, their tasks and
 * milestones as satellites and review cards as stars. Pulses flow out along the links in
 * proportion to recent activity, and inward while EDGE is thinking or speaking.
 */
export function NeuralCore(props: NeuralCoreProps) {
  const {
    graph,
    today,
    activity,
    centerLabel,
    selectedId,
    label,
    onSelectProject,
    onOpenTask,
    onCoreClick,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const live = useRef({
    graph,
    activity,
    centerLabel,
    selectedId,
    hoverId: undefined as string | undefined,
    level: 0,
    ripples: [] as { projectId: string; start: number }[],
  });
  const hitsRef = useRef<Hit[]>([]);
  const drawRef = useRef<(now: number) => void>(() => {});
  const prevDone = useRef(new Map<string, number>());

  useEffect(() => {
    const L = live.current;
    L.graph = graph;
    L.activity = activity;
    L.centerLabel = centerLabel;
    L.selectedId = selectedId;
    if (reduced) drawRef.current(performance.now());
  }, [graph, activity, centerLabel, selectedId, reduced]);

  // A shockwave from a project whenever one of its tasks gets completed.
  useEffect(() => {
    for (const p of graph.projects) {
      const before = prevDone.current.get(p.id);
      if (before !== undefined && p.doneLast7 > before) {
        live.current.ripples.push({ projectId: p.id, start: performance.now() });
      }
      prevDone.current.set(p.id, p.doneLast7);
    }
  }, [graph]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return;
    const size = { w: 0, h: 0, dpr: 1 };
    let bg: HTMLCanvasElement | null = null;

    const buildBackground = () => {
      const { w, h, dpr } = size;
      bg = document.createElement('canvas');
      bg.width = Math.round(w * dpr);
      bg.height = Math.round(h * dpr);
      const b = bg.getContext('2d');
      if (!b) return;
      b.scale(dpr, dpr);
      b.fillStyle = HUD.bg;
      b.fillRect(0, 0, w, h);
      const glow = b.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      glow.addColorStop(0, 'rgba(14, 44, 68, 0.95)');
      glow.addColorStop(0.45, 'rgba(6, 18, 32, 0.6)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      b.fillStyle = glow;
      b.fillRect(0, 0, w, h);
      b.fillStyle = rgba(HUD.cyan, 0.07);
      for (let x = 12; x < w; x += 24) for (let y = 12; y < h; y += 24) b.fillRect(x, y, 1, 1);
      // Static star dust for depth; the bright twinkling stars are the review cards.
      const rand = mulberry32(7);
      for (let i = 0; i < Math.round((w * h) / 2600); i++) {
        b.fillStyle = rgba(HUD.ice, 0.05 + rand() * 0.14);
        b.beginPath();
        b.arc(rand() * w, rand() * h, 0.3 + rand() * 0.6, 0, TAU);
        b.fill();
      }
      const vignette = b.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.35,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75,
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      b.fillStyle = vignette;
      b.fillRect(0, 0, w, h);
    };

    const arcs = (
      cx: number,
      cy: number,
      r: number,
      rot: number,
      count: number,
      len: number,
      color: string,
      width: number,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (let k = 0; k < count; k++) {
        const a = rot + (k / count) * TAU;
        ctx.beginPath();
        ctx.arc(cx, cy, r, a, a + len);
        ctx.stroke();
      }
    };

    const dot = (x: number, y: number, r: number, color: string) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
    };

    const glowDot = (x: number, y: number, r: number, hex: string, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(hex, alpha));
      g.addColorStop(1, rgba(hex, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };

    const drawSatellite = (
      s: BrainSatellite,
      p: BrainProjectNode,
      x: number,
      y: number,
      t: number,
    ) => {
      const accent = PALETTE[p.color][400];
      if (s.kind === 'milestone') {
        const d = 5.5;
        ctx.beginPath();
        ctx.moveTo(x, y - d);
        ctx.lineTo(x + d, y);
        ctx.lineTo(x, y + d);
        ctx.lineTo(x - d, y);
        ctx.closePath();
        ctx.fillStyle = rgba(accent, 0.3);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        if (p.nextMilestone?.id === s.id) {
          const ux = Math.cos(p.angle);
          ctx.font = `600 8.5px ${HUD.font}`;
          ctx.textAlign = ux < -0.2 ? 'right' : 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = rgba(PALETTE[p.color][200], 0.85);
          const text = countdownLabel(p.nextMilestone.daysUntil);
          const tx = x + (ux < -0.2 ? -9 : 9);
          ctx.fillText(text, tx, y);
          const tw = ctx.measureText(text).width;
          const x0 = ux < -0.2 ? tx - tw : tx;
          return { x0: x0 - 2, x1: x0 + tw + 2, y0: y - 6, y1: y + 6 };
        }
        return;
      }
      if (s.isBig3) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, TAU);
        ctx.strokeStyle = rgba(HUD.amber, 0.8);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (s.status === 'done') {
        glowDot(x, y, 7, accent, 0.45);
        dot(x, y, 2.8, accent);
      } else if (s.status === 'doing') {
        const halo = 3.4 + 4 * (0.5 + 0.5 * Math.sin(t * 0.005));
        glowDot(x, y, halo + 3, HUD.ice, 0.35);
        dot(x, y, 3.2, HUD.navy);
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, TAU);
        ctx.strokeStyle = HUD.ice;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        dot(x, y, 3.2, HUD.navy);
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, TAU);
        ctx.strokeStyle = rgba(accent, 0.9);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    };

    const draw = (now: number) => {
      const { w, h, dpr } = size;
      if (!w || !h) return;
      const L = live.current;
      const t = reduced ? 0 : now;
      const target = L.activity === 'speaking' ? 1 : L.activity === 'thinking' ? 0.6 : 0;
      L.level = reduced ? target : L.level + (target - L.level) * 0.06;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (bg) ctx.drawImage(bg, 0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.max(70, Math.min(w, h) / 2 - 10);
      const nodeR = clamp(R * 0.085, 13, 26);
      const Rp = R * 0.56;
      const Rc = clamp(R * 0.14, 22, 52);
      const ro0 = nodeR + Math.max(16, R * 0.09);
      const ro1 = ro0 + Math.max(12, R * 0.065);
      // The project orbit stretches into an ellipse on wide or tall canvases, like a tilted orbital plane.
      const Rx = clamp(w / 2 - (ro1 + 64), Rp, Rp * 1.9);
      const Ry = clamp(h / 2 - (ro1 + 40), Rp, Rp * 1.5);
      // Small canvases (phones) only label the selected or hovered node; the Nodes list names them all.
      const showLabels = R >= 200;
      const hits: Hit[] = [];
      const projects = L.graph.projects;
      const n = projects.length;

      // Stars: one per review card; due cards glow amber.
      for (const s of L.graph.stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.0016 + s.phase);
        dot(
          cx + s.x * (w / 2 - 6),
          cy + s.y * (h / 2 - 6),
          s.size * (s.due ? 0.9 : 0.6),
          s.due ? rgba(HUD.amber, 0.35 + 0.55 * tw) : rgba(HUD.ice, 0.12 + 0.45 * tw),
        );
      }

      // Radar sweep.
      if ('createConicGradient' in ctx) {
        const sweep = t * 0.0005;
        const wedge = 0.9;
        const g = ctx.createConicGradient(sweep - wedge, cx, cy);
        g.addColorStop(0, rgba(HUD.cyan, 0));
        g.addColorStop(wedge / TAU, rgba(HUD.cyan, 0.09));
        g.addColorStop(wedge / TAU + 0.001, rgba(HUD.cyan, 0));
        g.addColorStop(1, rgba(HUD.cyan, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.97, 0, TAU);
        ctx.fill();
      }

      // Outer dial with degree ticks.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.00003);
      ctx.strokeStyle = rgba(HUD.cyan, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * TAU;
        const r0 = R - (i % 10 === 0 ? 9 : 4);
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(HUD.cyan, 0.38);
      ctx.font = `500 7.5px ${HUD.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.fillText(
          String(i * 30).padStart(3, '0'),
          Math.cos(a) * (R - 18),
          Math.sin(a) * (R - 18),
        );
      }
      ctx.restore();
      arcs(cx, cy, R * 0.92, t * 0.00012, 3, 0.55, rgba(HUD.cyan, 0.32), 2);
      arcs(cx, cy, R * 0.89, -t * 0.00008, 6, 0.16, rgba(HUD.cyan, 0.18), 1);

      // Project ring.
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = rgba(HUD.cyan, 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Rx, Ry, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      const inward = L.level > 0.3;
      const labels: { text: string; x: number; y: number; alt: number; color: string }[] = [];
      // Rects already taken by milestone countdowns; project labels steer around them.
      const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
      projects.forEach((p, i) => {
        const accent = PALETTE[p.color][400];
        const bob = reduced ? 0 : Math.sin(t * 0.0008 + i) * 2;
        const px = cx + Math.cos(p.angle) * (Rx + bob);
        const py = cy + Math.sin(p.angle) * (Ry + bob);
        const dist = Math.hypot(px - cx, py - cy) || 1;
        const ux = (px - cx) / dist;
        const uy = (py - cy) / dist;
        const outward = Math.atan2(uy, ux);
        const active = p.id === L.selectedId || p.id === L.hoverId;

        // Spoke from the core, slightly curved.
        const x0 = cx + ux * Rc * 1.2;
        const y0 = cy + uy * Rc * 1.2;
        const x1 = px - ux * nodeR;
        const y1 = py - uy * nodeR;
        const qx = (x0 + x1) / 2 - uy * dist * 0.12;
        const qy = (y0 + y1) / 2 + ux * dist * 0.12;
        ctx.strokeStyle = rgba(accent, 0.16 + 0.35 * p.energy + (active ? 0.35 : 0));
        ctx.lineWidth = 1 + p.energy * 1.2 + (active ? 0.5 : 0);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(qx, qy, x1, y1);
        ctx.stroke();

        if (!reduced) {
          const count = 1 + Math.round(p.energy * 3) + (inward ? 2 : 0);
          const speed = 0.00016 * (1 + L.level * 2.5);
          for (let k = 0; k < count; k++) {
            let u = (t * speed + k / count + i * 0.137) % 1;
            if (inward) u = 1 - u;
            const a = (1 - u) * (1 - u);
            const b = 2 * (1 - u) * u;
            const c = u * u;
            const bx = a * x0 + b * qx + c * x1;
            const by = a * y0 + b * qy + c * y1;
            glowDot(bx, by, 7, inward ? HUD.cyan : accent, 0.75);
            dot(bx, by, 1.5, HUD.ice);
          }
        }

        // Satellites fan out away from the core, squeezed to stay inside the project's sector.
        const maxHalf =
          n <= 2
            ? Math.PI * 0.75
            : Math.min(Math.PI * 0.75, (Math.PI / n) * ((Rx + Ry) / 2 / ro1) * 0.8);
        let rawHalf = 0;
        for (const s of p.satellites) rawHalf = Math.max(rawHalf, Math.abs(s.angle - p.angle));
        const squeeze = rawHalf > maxHalf ? maxHalf / rawHalf : 1;
        p.satellites.forEach((s, k) => {
          const a =
            outward +
            (s.angle - p.angle) * squeeze +
            (reduced ? 0 : Math.sin(t * 0.0004 + k) * 0.03);
          const r = s.orbit ? ro1 : ro0;
          const sx = px + Math.cos(a) * r;
          const sy = py + Math.sin(a) * r;
          ctx.strokeStyle = rgba(accent, active ? 0.35 : 0.14);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a) * nodeR, py + Math.sin(a) * nodeR);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          const taken = drawSatellite(s, p, sx, sy, t);
          if (taken) placed.push(taken);
          hits.push({ id: s.id, kind: s.kind, x: sx, y: sy, r: 7, projectId: p.id });
        });

        // Node: glow, body, weekly progress arc, emoji.
        glowDot(
          px,
          py,
          nodeR * (2.1 + 0.5 * p.energy + (active ? 0.4 : 0)),
          accent,
          0.2 + 0.25 * p.energy + (active ? 0.15 : 0),
        );
        dot(px, py, nodeR, HUD.navy);
        ctx.beginPath();
        ctx.arc(px, py, nodeR, 0, TAU);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, nodeR + 4, 0, TAU);
        ctx.strokeStyle = rgba(accent, 0.14);
        ctx.lineWidth = 2;
        ctx.stroke();
        if (p.weekTotal) {
          ctx.beginPath();
          ctx.arc(px, py, nodeR + 4, -Math.PI / 2, -Math.PI / 2 + TAU * (p.weekDone / p.weekTotal));
          ctx.strokeStyle = accent;
          ctx.stroke();
        }
        if (p.id === L.selectedId) {
          ctx.setLineDash([3, 5]);
          arcs(px, py, nodeR + 10, t * 0.001, 1, TAU, rgba(HUD.ice, 0.7), 1);
          ctx.setLineDash([]);
        }
        ctx.font = `${Math.round(nodeR * 0.95)}px ${HUD.emoji}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(p.emoji, px, py + 1);

        // Label below the node, or above it when satellites hang below (placed after all nodes).
        const name = p.name.length > 18 ? `${p.name.slice(0, 17).trimEnd()}…` : p.name;
        const above = py - nodeR - 12;
        const below = py + nodeR + 15;
        if (showLabels || active)
          labels.push({
            text: name.toUpperCase(),
            x: px,
            y: uy > 0.35 ? above : below,
            alt: uy > 0.35 ? below : above,
            color: rgba(PALETTE[p.color][200], active ? 1 : 0.85),
          });

        hits.push({ id: p.id, kind: 'project', x: px, y: py, r: nodeR + 4 });
      });

      // Labels: try the preferred side, then the other side, then nudge, so names never overlap.
      ctx.font = `600 9px ${HUD.font}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.8px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      for (const lb of labels) {
        const half = ctx.measureText(lb.text).width / 2 + 4;
        const rect = (y: number) => ({ x0: lb.x - half, x1: lb.x + half, y0: y - 7, y1: y + 7 });
        const free = (y: number) => {
          const r = rect(y);
          return !placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
        };
        const nudge = lb.y < lb.alt ? -12 : 12;
        const y = [lb.y, lb.alt, lb.y + nudge, lb.alt - nudge].find(free) ?? lb.y;
        placed.push(rect(y));
        ctx.strokeStyle = rgba(HUD.bg, 0.85);
        ctx.strokeText(lb.text, lb.x, y);
        ctx.fillStyle = lb.color;
        ctx.fillText(lb.text, lb.x, y);
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      // Completion shockwaves.
      L.ripples = L.ripples.filter((rp) => now - rp.start < 1400);
      for (const rp of L.ripples) {
        const hit = hits.find((hh) => hh.id === rp.projectId);
        const p = projects.find((pp) => pp.id === rp.projectId);
        if (!hit || !p) continue;
        const k = (now - rp.start) / 1400;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, nodeR + k * nodeR * 3.5, 0, TAU);
        ctx.strokeStyle = rgba(PALETTE[p.color][300], 1 - k);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // The core: an arc reactor that breathes, spins up while EDGE thinks and "talks" while it speaks.
      const pulse = 0.5 + 0.5 * Math.sin(t * (0.0018 + L.level * 0.006));
      const flicker = L.activity === 'thinking' && !reduced ? 0.12 * Math.sin(t * 0.05) : 0;
      const glow = 0.4 + 0.15 * pulse + 0.3 * L.level + flicker;
      const halo = ctx.createRadialGradient(cx, cy, Rc * 0.2, cx, cy, Rc * 3.2);
      halo.addColorStop(0, rgba(HUD.cyan, glow * 0.6));
      halo.addColorStop(0.4, rgba(HUD.cyanDeep, glow * 0.18));
      halo.addColorStop(1, rgba(HUD.cyanDeep, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, Rc * 3.2, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, Rc * 1.14, 0, TAU);
      ctx.strokeStyle = rgba(HUD.cyan, 0.25);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, Rc, 0, TAU);
      ctx.strokeStyle = rgba(HUD.cyan, 0.75);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.0004 * (1 + L.level * 3));
      for (let k = 0; k < 10; k++) {
        const a0 = (k / 10) * TAU + 0.07;
        const a1 = ((k + 1) / 10) * TAU - 0.07;
        ctx.beginPath();
        ctx.arc(0, 0, Rc * 0.86, a0, a1);
        ctx.arc(0, 0, Rc * 0.66, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = rgba(HUD.cyan, 0.14 + 0.12 * pulse + 0.1 * L.level);
        ctx.fill();
        ctx.strokeStyle = rgba(HUD.cyan, 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      const center = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rc * 0.62);
      center.addColorStop(0, '#ffffff');
      center.addColorStop(0.4, rgba(HUD.ice, 0.95));
      center.addColorStop(0.75, rgba(HUD.cyan, 0.55 + 0.2 * L.level));
      center.addColorStop(1, rgba(HUD.cyan, 0));
      ctx.fillStyle = center;
      ctx.beginPath();
      ctx.arc(cx, cy, Rc * 0.62, 0, TAU);
      ctx.fill();
      ctx.fillStyle = HUD.navy;
      ctx.font = `800 ${Math.round(Rc * 0.34)}px ${HUD.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(L.centerLabel, cx, cy + 1);

      if (L.level > 0.02) {
        // Voice ring: radial bars that dance while EDGE responds.
        const bars = 72;
        ctx.strokeStyle = rgba(HUD.cyan, 0.8 * L.level);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < bars; i++) {
          const a = (i / bars) * TAU;
          const amp = reduced
            ? 0.3
            : Math.abs(Math.sin(t * 0.011 + i * 0.9) * Math.sin(t * 0.0067 + i * 1.7)) *
              (L.activity === 'speaking' ? 1 : 0.35);
          const r0 = Rc * 1.24;
          const len = Rc * (0.05 + 0.5 * amp) * L.level;
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
        }
        ctx.stroke();
      }
      if (L.activity === 'thinking') {
        arcs(cx, cy, Rc * 1.55, t * 0.004, 2, 0.9, rgba(HUD.ice, 0.65), 2);
        arcs(cx, cy, Rc * 1.7, -t * 0.0025, 3, 0.35, rgba(HUD.cyan, 0.4), 1);
      }
      hits.push({ id: 'core', kind: 'core', x: cx, y: cy, r: Rc });

      // Hover highlight for small targets.
      const hovered = hits.find(
        (hh) => hh.id === L.hoverId && (hh.kind === 'task' || hh.kind === 'milestone'),
      );
      if (hovered) {
        ctx.beginPath();
        ctx.arc(hovered.x, hovered.y, 9, 0, TAU);
        ctx.strokeStyle = rgba(HUD.ice, 0.8);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      hitsRef.current = hits;
    };
    drawRef.current = draw;

    const measure = () => {
      const rect = wrap.getBoundingClientRect();
      size.w = Math.max(1, Math.round(rect.width));
      size.h = Math.max(1, Math.round(rect.height));
      size.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(size.w * size.dpr);
      canvas.height = Math.round(size.h * size.dpr);
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      buildBackground();
      draw(performance.now());
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    ro?.observe(wrap);
    let raf = 0;
    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    if (!reduced) raf = requestAnimationFrame(loop);
    // Redraw once the HUD font arrives (matters for the static reduced-motion frame).
    void document.fonts?.ready.then(() => draw(performance.now()));
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(raf);
      drawRef.current = () => {};
    };
  }, [reduced]);

  const hitAt = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: Hit | null = null;
    let bestD = Infinity;
    for (const hh of hitsRef.current) {
      const d = Math.hypot(hh.x - x, hh.y - y) - hh.r;
      if (d < 5 && d < bestD) {
        best = hh;
        bestD = d;
      }
    }
    return { hit: best, x, y };
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block"
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = hitAt(e.clientX, e.clientY);
          const hit = r?.hit ?? null;
          live.current.hoverId = hit?.id;
          e.currentTarget.style.cursor = hit ? 'pointer' : 'default';
          const info = hit ? describe(hit, live.current.graph, today) : null;
          const maxX = e.currentTarget.clientWidth - 264;
          setHover(info && r ? { ...info, x: Math.min(r.x + 14, maxX), y: r.y + 14 } : null);
          if (reduced) drawRef.current(performance.now());
        }}
        onPointerLeave={() => {
          live.current.hoverId = undefined;
          setHover(null);
          if (reduced) drawRef.current(performance.now());
        }}
        onClick={(e) => {
          const hit = hitAt(e.clientX, e.clientY)?.hit;
          if (!hit) return onSelectProject(undefined);
          if (hit.kind === 'core') return onCoreClick();
          if (hit.kind === 'project')
            return onSelectProject(hit.id === selectedId ? undefined : hit.id);
          if (hit.kind === 'task') return onOpenTask(hit.id);
          onSelectProject(hit.projectId);
        }}
      />
      {hover ? (
        <div
          className="hud-tooltip pointer-events-none absolute z-10 max-w-64"
          style={{ left: hover.x, top: hover.y }}
          aria-hidden
        >
          <p className="font-medium text-cyan-50">{hover.title}</p>
          {hover.lines.map((l) => (
            <p key={l} className="text-[12px] text-cyan-100/70">
              {l}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
