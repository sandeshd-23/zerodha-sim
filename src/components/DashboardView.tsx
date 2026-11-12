import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Bell,
  Briefcase,
  PieChart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { calculatePortfolioPerformance } from '../engine/charges.ts';
import { getAvailableMargin, getCollateralValue, getUsedMargin } from '../engine/simulationEngine.ts';
import {
  formatINR,
  formatNum,
  formatPct,
  getDisplaySymbol,
} from '../utils/format.ts';

const ALLOC_COLORS = [
  '#387ed1',
  '#ff5722',
  '#4caf50',
  '#a855f7',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#6366f1',
];

export const DashboardView: React.FC = () => {
  const {
    profile,
    quotes,
    derivativePrices,
    movers,
    instrumentsMap,
    selectSymbol,
    openOrderTicket,
    setActiveTab,
  } = useSimulatorStore();

  if (!profile) return null;

  const priceLookup = (s: string) => quotes[s]?.ltp || 0;
  const usedMargin = getUsedMargin(profile);
  const collateral = getCollateralValue(profile, priceLookup);
  const availMargin = getAvailableMargin(profile, priceLookup, true);

  let holdingsInvested = 0;
  let holdingsCurrent = 0;
  const holdingSlices: Array<{ symbol: string; value: number }> = [];

  for (const h of profile.holdings) {
    const qty = h.qty + h.t1Qty;
    const ltp = quotes[h.symbol]?.ltp || h.avgPrice;
    holdingsInvested += qty * h.avgPrice;
    const val = qty * ltp;
    holdingsCurrent += val;
    holdingSlices.push({ symbol: h.symbol, value: val });
  }
  holdingSlices.sort((a, b) => b.value - a.value);

  let openPositionsPnl = 0;
  for (const p of profile.positions) {
    if (p.netQty === 0) continue;
    const mark =
      p.instrumentType === 'EQ'
        ? quotes[p.underlyingSymbol]?.ltp || p.avgPrice
        : derivativePrices[p.contractKey] || p.avgPrice;
    openPositionsPnl += (mark - p.avgPrice) * p.netQty;
  }

  const totalNetWorth = profile.availableCash + holdingsCurrent + openPositionsPnl;
  const overallGain = totalNetWorth - profile.netCapitalInvested;
  const overallGainPct =
    profile.netCapitalInvested > 0 ? (overallGain / profile.netCapitalInvested) * 100 : 0;
  const holdingsPnl = holdingsCurrent - holdingsInvested;
  const holdingsPnlPct = holdingsInvested > 0 ? (holdingsPnl / holdingsInvested) * 100 : 0;

  const perf = calculatePortfolioPerformance(profile.equityHistory);

  // Build SVG mini equity curve vs Nifty 50
  const eqPoints = profile.equityHistory.slice(-180);
  const renderMiniBenchmarkSvg = () => {
    if (eqPoints.length < 2) {
      return (
        <div className="h-32 flex items-center justify-center text-xs text-kite-muted">
          Fast-forward a few days or months to see your Portfolio vs. NIFTY 50 curve!
        </div>
      );
    }
    const baseCap = eqPoints[0].netCapitalInvested || eqPoints[0].totalEquity || 200000;
    const baseNifty = eqPoints[0].niftyClose || 1;

    const portVals = eqPoints.map((p) => (p.totalEquity / Math.max(1, p.netCapitalInvested)) * baseCap);
    const niftyVals = eqPoints.map((p) => (p.niftyClose / baseNifty) * baseCap);
    const allVals = [...portVals, ...niftyVals];
    const minV = Math.min(...allVals) * 0.99;
    const maxV = Math.max(...allVals) * 1.01;
    const span = Math.max(1, maxV - minV);

    const W = 520;
    const H = 125;
    const toCoords = (arr: number[]) =>
      arr
        .map((v, idx) => {
          const x = (idx / (arr.length - 1)) * W;
          const y = H - ((v - minV) / span) * (H - 14) - 7;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 overflow-visible">
        <polyline
          fill="none"
          stroke="#9ca3af"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          points={toCoords(niftyVals)}
        />
        <polyline
          fill="none"
          stroke="#387ed1"
          strokeWidth="2.4"
          points={toCoords(portVals)}
        />
      </svg>
    );
  };

  return (
    <div className="p-3 md:p-5 space-y-4 md:space-y-6 overflow-y-auto h-full">
      {/* Greeting Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-kite-border dark:border-kite-darkBorder pb-3.5">
        <div>
          <h1 className="text-xl font-normal text-gray-800 dark:text-gray-100">
            Hi, Trader <span className="text-sm text-kite-muted font-normal">({profile.name})</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
          <span data-coach="net-worth">
            Net Worth:{' '}
            <strong className="text-sm text-gray-900 dark:text-white">
              {formatINR(totalNetWorth)}
            </strong>
          </span>
          <span
            className={overallGain >= 0 ? 'text-kite-green font-semibold' : 'text-kite-red font-semibold'}
            data-tip="Overall Gain :: Net worth minus all the money you deposited (starting capital + top-ups − withdrawals). The % is on deposited money."
          >
            {formatINR(overallGain, { signed: true })} ({formatPct(overallGainPct)})
          </span>
        </div>
      </div>

      {/* Top Row: Equity Margins Card + Holdings Summary Card (Authentic Kite 2-column layout) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-5">
        {/* Equity Margins */}
        <div className="p-4 md:p-5 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <PieChart className="w-4 h-4 text-kite-blue" />
              <span>Equity & Derivatives Margin</span>
            </div>
            <button
              onClick={() => setActiveTab('FUNDS')}
              className="min-h-[40px] md:min-h-0 text-xs text-kite-blue hover:underline font-medium"
            >
              Manage Funds (₹2L Default) →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-center">
            <div>
              <div className="text-2xl font-normal font-mono text-gray-800 dark:text-white">
                {formatINR(availMargin, { compact: availMargin >= 1e7 })}
              </div>
              <div className="text-xs text-kite-muted mt-0.5" data-coach="available-margin">Margin available</div>
            </div>
            <div className="space-y-1.5 text-xs border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-kite-darkBorder pt-3 sm:pt-0 sm:pl-4">
              <div className="flex justify-between">
                <span className="text-kite-muted" data-coach="used-margin">Margins used</span>
                <span className="font-mono">{formatINR(usedMargin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-kite-muted" data-coach="settled-cash">Settled cash</span>
                <span className="font-mono">{formatINR(profile.availableCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-kite-muted" data-coach="collateral">Pledged collateral</span>
                <span className="font-mono">{formatINR(collateral)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Holdings Summary */}
        <div className="p-4 md:p-5 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <Briefcase className="w-4 h-4 text-kite-orange" />
              <span>Holdings ({profile.holdings.length})</span>
            </div>
            <button
              onClick={() => setActiveTab('HOLDINGS')}
              className="min-h-[40px] md:min-h-0 text-xs text-kite-blue hover:underline font-medium"
            >
              View Holdings →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-center">
            <div>
              <div
                className={`text-2xl font-normal font-mono ${
                  holdingsPnl >= 0 ? 'text-kite-green' : 'text-kite-red'
                }`}
              >
                {formatINR(holdingsPnl, { signed: true, compact: Math.abs(holdingsPnl) >= 1e7 })}
              </div>
              <div className="text-xs text-kite-muted mt-0.5" data-coach="realised-pnl">
                Unrealized P&L ({formatPct(holdingsPnlPct)})
              </div>
            </div>

            <div className="space-y-1.5 text-xs border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-kite-darkBorder pt-3 sm:pt-0 sm:pl-4">
              <div className="flex justify-between">
                <span className="text-kite-muted" data-coach="current-value">Current value</span>
                <span className="font-mono">{formatINR(holdingsCurrent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-kite-muted" data-coach="investment">Investment</span>
                <span className="font-mono">{formatINR(holdingsInvested)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-kite-muted" data-coach="m2m">Open Positions M2M</span>
                <span
                  className={`font-mono ${
                    openPositionsPnl >= 0 ? 'text-kite-green' : 'text-kite-red'
                  }`}
                >
                  {formatINR(openPositionsPnl, { signed: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Zerodha Kite Signature Portfolio Allocation Bar */}
          {holdingsCurrent > 0 && (
            <div className="space-y-1.5 pt-1">
              <div
                className="h-2.5 w-full rounded-xs overflow-hidden flex bg-gray-100 dark:bg-gray-800"
                data-tip="Portfolio Allocation :: Each colour is one holding, sized by its share of your holdings value. :: If one stock is more than ~20–25%, a single bad result can hurt your whole portfolio."
              >
                {holdingSlices.map((sl, i) => (
                  <div
                    key={sl.symbol}
                    style={{
                      width: `${Math.max(1.5, (sl.value / holdingsCurrent) * 100)}%`,
                      backgroundColor: ALLOC_COLORS[i % ALLOC_COLORS.length],
                    }}
                    title={`${getDisplaySymbol(sl.symbol, instrumentsMap, profile.blindMode)}: ${formatINR(sl.value)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-[10px] text-kite-muted">
                {holdingSlices.slice(0, 5).map((sl, i) => (
                  <span key={sl.symbol} className="inline-flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: ALLOC_COLORS[i % ALLOC_COLORS.length] }}
                    />
                    {getDisplaySymbol(sl.symbol, instrumentsMap, profile.blindMode)}{' '}
                    {((sl.value / holdingsCurrent) * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Benchmark Comparison Card */}
      <div className="p-4 md:p-5 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2" data-coach="benchmark">
            <Award className="w-4 h-4 text-kite-blue" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
              Your Strategy vs. NIFTY 50 Index Benchmark
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
            <span
              className="inline-flex items-center gap-1.5"
              data-tip="Your Return & CAGR :: Total return of your account since the timeline began, and the same growth expressed per year (CAGR). :: Deposits during the run distort CAGR — check XIRR in Console."
            >
              <span className="w-3 h-0.5 bg-kite-blue inline-block" />
              Your Return: <strong>{formatPct(perf.totalReturnPct)}</strong> (CAGR {formatPct(perf.cagrPct)})
            </span>
            <span className="inline-flex items-center gap-1.5 text-kite-muted" data-coach="nifty50">
              <span className="w-3 h-0.5 bg-gray-400 inline-block" />
              NIFTY 50: <strong>{formatPct(perf.niftyReturnPct)}</strong> (CAGR {formatPct(perf.niftyCagrPct)})
            </span>
            <button
              onClick={() => setActiveTab('CONSOLE')}
              className="min-h-[40px] md:min-h-0 font-sans text-kite-blue hover:underline"
            >
              Full Console Analytics →
            </button>
          </div>
        </div>
        {renderMiniBenchmarkSvg()}
      </div>

      {/* Historical Day's Market Movers & Notifications */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
        {/* Top Gainers on Simulated Date */}
        <div className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 mb-3">
            <ArrowUpRight className="w-4 h-4 text-kite-green" />
            <span data-tip="Top Gainers :: Stocks that rose the most on the current simulated day, versus the previous close. :: Chasing yesterday’s top gainer is a classic beginner mistake — check the chart first.">Top Gainers on This Historical Day</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-kite-darkBorder text-xs">
            {movers.gainers.slice(0, 6).map((g) => (
              <div
                key={g.symbol}
                className="flex items-center justify-between min-h-[44px] md:min-h-0 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40 px-1 rounded cursor-pointer"
                onClick={() => selectSymbol(g.symbol, true)}
              >
                <div>
                  <div className="font-semibold text-gray-800 dark:text-gray-100">
                    {getDisplaySymbol(g.symbol, instrumentsMap, profile.blindMode)}
                  </div>
                  <div className="text-[10px] text-kite-muted">{g.sector}</div>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span>₹{formatNum(g.ltp)}</span>
                  <span className="text-kite-green font-semibold w-14 text-right">
                    +{g.changePct.toFixed(2)}%
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openOrderTicket({ side: 'BUY', symbol: g.symbol, price: g.ltp });
                    }}
                    className="w-8 h-8 md:w-5 md:h-5 rounded bg-kite-blue text-white font-sans font-bold text-[11px] md:text-[10px]"
                  >
                    B
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Losers on Simulated Date */}
        <div className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 mb-3">
            <ArrowDownRight className="w-4 h-4 text-kite-red" />
            <span data-tip="Top Losers :: Stocks that fell the most on the current simulated day. :: A falling price alone doesn’t make a stock cheap.">Top Losers on This Historical Day</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-kite-darkBorder text-xs">
            {movers.losers.slice(0, 6).map((l) => (
              <div
                key={l.symbol}
                className="flex items-center justify-between min-h-[44px] md:min-h-0 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40 px-1 rounded cursor-pointer"
                onClick={() => selectSymbol(l.symbol, true)}
              >
                <div>
                  <div className="font-semibold text-gray-800 dark:text-gray-100">
                    {getDisplaySymbol(l.symbol, instrumentsMap, profile.blindMode)}
                  </div>
                  <div className="text-[10px] text-kite-muted">{l.sector}</div>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span>₹{formatNum(l.ltp)}</span>
                  <span className="text-kite-red font-semibold w-14 text-right">
                    {l.changePct.toFixed(2)}%
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openOrderTicket({ side: 'BUY', symbol: l.symbol, price: l.ltp });
                    }}
                    className="w-8 h-8 md:w-5 md:h-5 rounded bg-kite-blue text-white font-sans font-bold text-[11px] md:text-[10px]"
                    title="Buy Dip"
                  >
                    B
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 52-Week Breakouts & Recent Corporate / Order Alerts */}
        <div className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2.5">
              <TrendingUp className="w-4 h-4 text-kite-blue" />
              <span data-coach="52w-high-low">52-Week High Breakouts Today</span>
            </div>
            {movers.breakouts52w.length === 0 ? (
              <p className="text-[11px] text-kite-muted py-2">
                No stocks breaking 52-week highs during todays session.
              </p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {movers.breakouts52w.slice(0, 4).map((b) => (
                  <div
                    key={b.symbol}
                    onClick={() => selectSymbol(b.symbol, true)}
                    className="flex items-center justify-between min-h-[40px] md:min-h-0 py-1 px-1.5 rounded bg-emerald-50/50 dark:bg-emerald-950/20 cursor-pointer"
                  >
                    <span className="font-semibold">
                      {getDisplaySymbol(b.symbol, instrumentsMap, profile.blindMode)}
                    </span>
                    <span className="font-mono text-kite-green">
                      ₹{formatNum(b.ltp)} (+{b.changePct.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-kite-darkBorder pt-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">
              <Bell className="w-3.5 h-3.5 text-kite-orange" />
              <span data-coach="corporate-actions">Recent Dividends, Splits & Triggers</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto text-[11px]">
              {profile.notifications.slice(0, 5).map((n) => (
                <div key={n.id} className="text-gray-600 dark:text-gray-300">
                  <span className="font-mono text-[10px] text-kite-muted mr-1.5">[{n.date}]</span>
                  <span>{n.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Tip Footer */}
      <div className="p-3.5 rounded bg-blue-50/60 dark:bg-kite-blue/10 border border-kite-blue/20 flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
          <Wallet className="w-4 h-4 text-kite-blue shrink-0" />
          <span>
            <strong>Want to test passive monthly SIP investing vs stock picking?</strong> Head to{' '}
            <button
              onClick={() => setActiveTab('SIP_BASKETS')}
              className="text-kite-blue font-semibold underline"
            >
              SIP & Baskets
            </button>{' '}
            to schedule a monthly Stock/ETF SIP, then click <strong>+1 Yr</strong> in the Time-Machine bar!
          </span>
        </div>
      </div>
    </div>
  );
};
