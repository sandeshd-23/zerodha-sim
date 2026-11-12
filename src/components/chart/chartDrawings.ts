/**
 * Lightweight drawing tools for lightweight-charts v4 (Kite / TradingView-lite):
 * horizontal line, trend line, ray, rectangle and Fibonacci retracement.
 *
 * Drawings are stored as (time, price) points so they survive timeframe changes.
 * They are rendered through a series primitive (v4.1+ plugin API) that maps every
 * point to a *fractional logical index* of the currently loaded bars — so a drawing
 * made on the daily chart still lands in the right place on 15m or weekly bars, and
 * points outside the loaded range are extrapolated instead of being clamped.
 */
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CandleBar, ChartDrawing } from '../../types/simulator.ts';

export type DrawingKind = ChartDrawing['kind'];
export type DrawingTool = 'NONE' | DrawingKind;

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86'];

export const DRAWING_COLORS = ['#387ed1', '#ff5722', '#4caf50', '#a855f7', '#f59e0b', '#df514c'];

export const DEFAULT_DRAWING_COLOR: Record<DrawingKind, string> = {
  HLINE: '#f59e0b',
  TREND: '#387ed1',
  RAY: '#a855f7',
  RECT: '#06b6d4',
  FIB: '#787b86',
};

export const POINTS_NEEDED: Record<DrawingKind, number> = { HLINE: 1, TREND: 2, RAY: 2, RECT: 2, FIB: 2 };

// ---------------------------------------------------------------------------
// Time <-> logical index mapping
// ---------------------------------------------------------------------------

export interface TimeIndex {
  ts: number[]; // bar times as unix seconds
  step: number; // median seconds between bars
  intraday: boolean;
  bars: CandleBar[];
}

/**
 * 'YYYY-MM-DD' -> seconds at the 09:15 session open. Intraday bars use UTC-aligned
 * "display" timestamps (09:15 IST is stored as 09:15 UTC), so we do the same here.
 */
export function timeToSeconds(t: string | number): number {
  if (typeof t === 'number') return t;
  const [y, m, d] = t.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1, 9, 15) / 1000;
}

export function buildTimeIndex(bars: CandleBar[]): TimeIndex {
  const ts = bars.map((b) => timeToSeconds(b.time));
  const diffs: number[] = [];
  for (let i = 1; i < ts.length; i++) diffs.push(ts[i] - ts[i - 1]);
  diffs.sort((a, b) => a - b);
  const step = diffs.length ? Math.max(1, diffs[Math.floor(diffs.length / 2)]) : 86400;
  return { ts, step, intraday: bars.length > 0 && typeof bars[0].time === 'number', bars };
}

/** Map any stored time to a (fractional) logical index of the loaded bars. */
export function timeToLogical(t: string | number, idx: TimeIndex): number | null {
  const { ts, step } = idx;
  const n = ts.length;
  if (n === 0) return null;
  const sec = timeToSeconds(t);
  if (sec <= ts[0]) return (sec - ts[0]) / step;
  if (sec >= ts[n - 1]) return n - 1 + (sec - ts[n - 1]) / step;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= sec) lo = mid;
    else hi = mid;
  }
  const span = Math.max(1, ts[hi] - ts[lo]);
  const within = sec - ts[lo];
  // Inside one bar's period → position within that bar; across a gap (overnight /
  // weekend) → proportional position between the two bars.
  if (within < step) return lo + Math.min(1, within / Math.max(step, span));
  return lo + within / span;
}

/** Convert a logical index (from a pointer position) to a storable time. */
export function logicalToTime(l: number, idx: TimeIndex): string | number | null {
  const { bars, ts, step, intraday } = idx;
  const n = bars.length;
  if (n === 0) return null;
  const r = Math.round(l);
  if (r >= 0 && r < n) return bars[r].time;
  const sec = r < 0 ? ts[0] + r * step : ts[n - 1] + (r - (n - 1)) * step;
  if (intraday) return Math.round(sec);
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

export interface DrawingRenderState {
  drawings: ChartDrawing[];
  /** A drawing being placed (preview). */
  preview: ChartDrawing | null;
  selectedId: string | null;
  index: TimeIndex | null;
  isDark: boolean;
}

type DrawTarget = Parameters<ISeriesPrimitivePaneRenderer['draw']>[0];

interface ScreenPt {
  x: number;
  y: number;
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private state: DrawingRenderState = { drawings: [], preview: null, selectedId: null, index: null, isDark: false };
  private readonly views: readonly ISeriesPrimitivePaneView[];

  constructor() {
    const renderer: ISeriesPrimitivePaneRenderer = { draw: (target) => this.draw(target) };
    this.views = [{ renderer: () => renderer, zOrder: () => 'top' }];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart as unknown as IChartApi;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return this.views;
  }

  setState(patch: Partial<DrawingRenderState>): void {
    this.state = { ...this.state, ...patch };
    this.requestUpdate?.();
  }

  /** Screen position of a stored point (media/CSS pixels), or null if not mappable. */
  toScreen(pt: { time: string | number; price: number }): ScreenPt | null {
    if (!this.chart || !this.series || !this.state.index) return null;
    const l = timeToLogical(pt.time, this.state.index);
    if (l === null) return null;
    const x = this.chart.timeScale().logicalToCoordinate(l as Logical);
    const y = this.series.priceToCoordinate(pt.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  /** Returns the id of the drawing under (x, y) in media pixels, if any. */
  hitTestDrawing(x: number, y: number, width: number): string | null {
    const tol = 9;
    for (let i = this.state.drawings.length - 1; i >= 0; i--) {
      const d = this.state.drawings[i];
      const pts = d.points.map((p) => this.toScreen(p));
      if (pts.some((p) => p === null)) continue;
      const [a, b] = pts as ScreenPt[];
      if (d.kind === 'HLINE') {
        if (Math.abs(y - a.y) <= tol) return d.id;
      } else if (d.kind === 'TREND') {
        if (distToSegment({ x, y }, a, b) <= tol) return d.id;
      } else if (d.kind === 'RAY') {
        const end = extendRay(a, b, width);
        if (distToSegment({ x, y }, a, end) <= tol) return d.id;
      } else if (d.kind === 'RECT') {
        const x0 = Math.min(a.x, b.x) - tol;
        const x1 = Math.max(a.x, b.x) + tol;
        const y0 = Math.min(a.y, b.y) - tol;
        const y1 = Math.max(a.y, b.y) + tol;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return d.id;
      } else if (d.kind === 'FIB') {
        const x0 = Math.min(a.x, b.x) - tol;
        const y0 = Math.min(a.y, b.y) - tol;
        const y1 = Math.max(a.y, b.y) + tol;
        if (x >= x0 && y >= y0 && y <= y1) return d.id;
      }
    }
    return null;
  }

  private draw(target: DrawTarget): void {
    const { drawings, preview, selectedId, isDark } = this.state;
    if (!this.chart || !this.series) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const all = preview ? [...drawings, preview] : drawings;
      for (const d of all) {
        const pts = d.points.map((p) => this.toScreen(p));
        if (pts.length === 0 || pts.some((p) => p === null)) continue;
        const sp = pts as ScreenPt[];
        const selected = d.id === selectedId || d === preview;
        const color = d.color || DEFAULT_DRAWING_COLOR[d.kind];
        ctx.save();
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.font = '10px Inter, sans-serif';
        if (d.kind === 'HLINE') {
          const y = Math.round(sp[0].y) + 0.5;
          ctx.setLineDash([6, 4]);
          line(ctx, 0, y, mediaSize.width, y);
          ctx.setLineDash([]);
          label(ctx, d.points[0].price.toFixed(2), 4, y - 3, color, isDark);
        } else if (d.kind === 'TREND' && sp.length === 2) {
          line(ctx, sp[0].x, sp[0].y, sp[1].x, sp[1].y);
          const pct = ((d.points[1].price - d.points[0].price) / Math.max(0.0001, d.points[0].price)) * 100;
          if (selected) label(ctx, `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, sp[1].x + 6, sp[1].y - 4, color, isDark);
        } else if (d.kind === 'RAY' && sp.length === 2) {
          const end = extendRay(sp[0], sp[1], mediaSize.width);
          line(ctx, sp[0].x, sp[0].y, end.x, end.y);
        } else if (d.kind === 'RECT' && sp.length === 2) {
          const x = Math.min(sp[0].x, sp[1].x);
          const y = Math.min(sp[0].y, sp[1].y);
          const w = Math.abs(sp[1].x - sp[0].x);
          const h = Math.abs(sp[1].y - sp[0].y);
          ctx.globalAlpha = 0.14;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        } else if (d.kind === 'FIB' && sp.length === 2) {
          const p1 = d.points[0].price;
          const p2 = d.points[1].price;
          const x0 = Math.min(sp[0].x, sp[1].x);
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = color;
          line(ctx, sp[0].x, sp[0].y, sp[1].x, sp[1].y);
          ctx.setLineDash([]);
          FIB_LEVELS.forEach((lvl, i) => {
            const price = p2 + (p1 - p2) * lvl;
            const y = this.series!.priceToCoordinate(price);
            if (y === null) return;
            const c = d.color || FIB_COLORS[i];
            ctx.strokeStyle = c;
            ctx.lineWidth = selected ? 1.5 : 1;
            line(ctx, x0, Math.round(y) + 0.5, mediaSize.width, Math.round(y) + 0.5);
            if (i < FIB_LEVELS.length - 1) {
              const next = this.series!.priceToCoordinate(p2 + (p1 - p2) * FIB_LEVELS[i + 1]);
              if (next !== null) {
                ctx.globalAlpha = 0.06;
                ctx.fillStyle = c;
                ctx.fillRect(x0, Math.min(y, next), mediaSize.width - x0, Math.abs(next - y));
                ctx.globalAlpha = 1;
              }
            }
            label(ctx, `${(lvl * 100).toFixed(1)}% (${price.toFixed(2)})`, x0 + 4, y - 3, c, isDark);
          });
        }
        if (selected) {
          for (const p of sp) {
            ctx.beginPath();
            ctx.fillStyle = isDark ? '#1b1e24' : '#ffffff';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    });
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, isDark: boolean) {
  const w = ctx.measureText(text).width + 6;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = isDark ? '#1b1e24' : '#ffffff';
  ctx.fillRect(x - 2, y - 10, w, 13);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x + 1, y);
}

function extendRay(a: ScreenPt, b: ScreenPt, width: number): ScreenPt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.001) return { x: a.x, y: dy >= 0 ? 1e5 : -1e5 };
  const targetX = dx > 0 ? width + 10 : -10;
  const t = (targetX - a.x) / dx;
  return { x: targetX, y: a.y + dy * t };
}

function distToSegment(p: ScreenPt, a: ScreenPt, b: ScreenPt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

export const DRAWING_TOOL_INFO: Array<{ kind: DrawingKind; label: string; short: string; tip: string }> = [
  {
    kind: 'HLINE',
    label: 'Horizontal line',
    short: 'H-Line',
    tip: 'Horizontal line :: Tap/click once on the chart to mark a price level — e.g. a support, resistance or your target. :: Levels where price bounced several times are the strongest.',
  },
  {
    kind: 'TREND',
    label: 'Trend line',
    short: 'Trend',
    tip: 'Trend line :: Tap two points (or drag) to connect swing lows in an uptrend or swing highs in a downtrend. :: A clean break of a long trend line often signals a change in trend.',
  },
  {
    kind: 'RAY',
    label: 'Ray',
    short: 'Ray',
    tip: 'Ray :: Like a trend line, but it extends forever to the right — useful to project where a trend line will be in the future.',
  },
  {
    kind: 'RECT',
    label: 'Rectangle',
    short: 'Rect',
    tip: 'Rectangle :: Tap two opposite corners to highlight a zone — e.g. a consolidation range, a supply/demand zone or a gap.',
  },
  {
    kind: 'FIB',
    label: 'Fib retracement',
    short: 'Fib',
    tip: 'Fibonacci retracement :: Tap the start of a move (e.g. swing low) then its end (swing high). Lines at 23.6%, 38.2%, 50%, 61.8% and 78.6% show where a pullback may pause. :: The 50–61.8% “golden zone” is the most watched.',
  },
];
