import React, { useId, useMemo, useState } from 'react';
import { legPayoffAtExpiry } from '../../engine/optionsPricing.ts';
import { formatINR, formatNum } from '../../utils/format.ts';

export interface PayoffLeg {
  instrumentType: 'CE' | 'PE' | 'FUT';
  strike?: number;
  /** Premium paid/received per unit (or futures entry price). */
  entryPrice: number;
  /** Signed quantity in units (+ long, - short). */
  qty: number;
}

export interface PayoffStats {
  maxProfit: number | 'UNLIMITED';
  maxLoss: number | 'UNLIMITED';
  breakevens: number[];
}

export function computePayoff(legs: PayoffLeg[], spot: number, points = 241) {
  const strikes = legs.map((l) => l.strike || spot).filter((s) => s > 0);
  const lo0 = Math.min(spot * 0.85, ...strikes.map((s) => s * 0.95));
  const hi0 = Math.max(spot * 1.15, ...strikes.map((s) => s * 1.05));
  const lo = Math.max(0, lo0);
  const hi = hi0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points; i++) {
    const x = lo + ((hi - lo) * i) / (points - 1);
    xs.push(x);
    ys.push(legs.reduce((acc, l) => acc + legPayoffAtExpiry(l, x), 0));
  }
  // Payoff is piecewise-linear and every strike lies inside [lo, hi], so outside the
  // range it is a straight line: towards price 0 it is finite (evaluate at 0); above
  // `hi` its slope is the net long quantity of calls + futures.
  const slopeHi = legs.reduce((acc, l) => acc + (l.instrumentType === 'PE' ? 0 : l.qty), 0);
  const atZero = legs.reduce((acc, l) => acc + legPayoffAtExpiry(l, 0), 0);
  const maxProfit: number | 'UNLIMITED' = slopeHi > 0 ? 'UNLIMITED' : Math.max(atZero, ...ys);
  const maxLoss: number | 'UNLIMITED' = slopeHi < 0 ? 'UNLIMITED' : Math.min(atZero, ...ys);
  const breakevens: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const a = ys[i - 1];
    const b = ys[i];
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const t = a / (a - b);
      breakevens.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
    }
  }
  const stats: PayoffStats = { maxProfit, maxLoss, breakevens };
  return { xs, ys, lo, hi, stats };
}

export const PayoffChart: React.FC<{ legs: PayoffLeg[]; spot: number; height?: number }> = ({ legs, spot, height = 180 }) => {
  const { xs, ys, lo, hi, stats } = useMemo(() => computePayoff(legs, spot), [legs, spot]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const W = 600;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 20;
  const yMax = Math.max(1, ...ys);
  const yMin = Math.min(-1, ...ys);
  const span = yMax - yMin || 1;
  const sx = (x: number) => padL + ((x - lo) / (hi - lo || 1)) * (W - padL - padR);
  const sy = (y: number) => padT + ((yMax - y) / span) * (H - padT - padB);
  const zeroY = sy(0);

  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
  const areaAbove = `${path} L${sx(hi).toFixed(1)},${zeroY.toFixed(1)} L${sx(lo).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const xVal = lo + ((fx - padL) / (W - padL - padR)) * (hi - lo);
    const idx = Math.round(((xVal - lo) / (hi - lo)) * (xs.length - 1));
    setHoverIdx(Math.max(0, Math.min(xs.length - 1, idx)));
  };

  const hv = hoverIdx !== null ? { x: xs[hoverIdx], y: ys[hoverIdx] } : null;
  const fmtStat = (v: number | 'UNLIMITED') => (v === 'UNLIMITED' ? 'Unlimited' : formatINR(v, { decimals: 0, signed: true }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-2 text-[11px]">
        <div
          className="rounded border border-gray-200 dark:border-kite-darkBorder p-1.5"
          data-tip="Max profit :: The most this strategy can make at expiry across all possible underlying prices. :: 'Unlimited' means profit keeps growing the further the price moves (e.g. a long call)."
        >
          <div className="text-kite-muted">Max profit</div>
          <div className="font-mono font-semibold text-kite-green">{fmtStat(stats.maxProfit)}</div>
        </div>
        <div
          className="rounded border border-gray-200 dark:border-kite-darkBorder p-1.5"
          data-tip="Max loss :: The worst outcome at expiry. Option buyers can lose at most the premium paid; naked option sellers can face unlimited losses. :: Always know your max loss before entering a trade."
        >
          <div className="text-kite-muted">Max loss</div>
          <div className="font-mono font-semibold text-kite-red">{fmtStat(stats.maxLoss)}</div>
        </div>
        <div
          className="rounded border border-gray-200 dark:border-kite-darkBorder p-1.5"
          data-tip="Breakeven :: The underlying price(s) at expiry where the strategy makes exactly ₹0. Above/below these points you profit or lose. :: Breakevens include the premium you paid or received."
        >
          <div className="text-kite-muted">Breakeven</div>
          <div className="font-mono font-semibold text-gray-800 dark:text-gray-100 truncate">
            {stats.breakevens.length ? stats.breakevens.map((b) => formatNum(b, 0)).join(' / ') : '—'}
          </div>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ height: H }}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHoverIdx(null)}
        data-tip="Payoff at expiry :: Each point shows your total profit or loss if the underlying closes at that price on expiry day. Green area = profit, red = loss. :: The dashed vertical line is today's spot price. Drag/hover to read exact values."
      >
        <defs>
          <clipPath id={`pa${uid}`}>
            <rect x="0" y="0" width={W} height={Math.max(0, zeroY)} />
          </clipPath>
          <clipPath id={`pb${uid}`}>
            <rect x="0" y={zeroY} width={W} height={Math.max(0, H - zeroY)} />
          </clipPath>
        </defs>
        <path d={areaAbove} fill="rgba(76,175,80,0.18)" clipPath={`url(#pa${uid})`} />
        <path d={areaAbove} fill="rgba(223,81,76,0.18)" clipPath={`url(#pb${uid})`} />
        <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="currentColor" className="text-gray-400" strokeWidth={1} />
        <line
          x1={sx(spot)}
          x2={sx(spot)}
          y1={padT}
          y2={H - padB}
          stroke="#387ed1"
          strokeDasharray="4 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path d={path} fill="none" stroke="#387ed1" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {stats.breakevens.map((b) => (
          <circle key={b} cx={sx(b)} cy={zeroY} r={3} fill="#f59e0b" />
        ))}
        {hv && (
          <>
            <line x1={sx(hv.x)} x2={sx(hv.x)} y1={padT} y2={H - padB} stroke="#888" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={sx(hv.x)} cy={sy(hv.y)} r={3.5} fill={hv.y >= 0 ? '#4caf50' : '#df514c'} />
          </>
        )}
        <text x={padL} y={H - 5} fontSize={10} fill="#888">
          {formatNum(lo, 0)}
        </text>
        <text x={W - padR} y={H - 5} fontSize={10} fill="#888" textAnchor="end">
          {formatNum(hi, 0)}
        </text>
        <text x={sx(spot)} y={H - 5} fontSize={10} fill="#387ed1" textAnchor="middle">
          Spot {formatNum(spot, 0)}
        </text>
      </svg>
      <div className="h-4 text-[11px] font-mono text-kite-muted">
        {hv ? (
          <>
            At {formatNum(hv.x, 0)} on expiry:{' '}
            <span className={hv.y >= 0 ? 'text-kite-green' : 'text-kite-red'}>{formatINR(hv.y, { decimals: 0, signed: true })}</span>
          </>
        ) : (
          'Hover / drag on the chart to read P&L at any price.'
        )}
      </div>
    </div>
  );
};
