import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, createChart, type Time } from 'lightweight-charts';
import {
  Award,
  BookOpen,
  Calendar,
  Download,
  FileSpreadsheet,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import {
  calculateIndianTaxSummary,
  calculatePortfolioPerformance,
} from '../engine/charges.ts';
import {
  formatINR,
  formatPct,
  maskContractDisplay,
} from '../utils/format.ts';

type ConsoleTab = 'BENCHMARK' | 'HEATMAP' | 'TAX' | 'JOURNAL' | 'LEDGER';

export const ConsoleView: React.FC = () => {
  const {
    profile,
    instrumentsMap,
    theme,
    updateProfileMeta,
  } = useSimulatorStore();

  const [tab, setTab] = useState<ConsoleTab>('BENCHMARK');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const benchContainerRef = useRef<HTMLDivElement | null>(null);

  const yearsAvailable = useMemo(() => {
    if (!profile) return [];
    const set = new Set<string>();
    for (const p of profile.equityHistory) {
      set.add(p.date.slice(0, 4));
    }
    return Array.from(set).sort();
  }, [profile]);

  useEffect(() => {
    if (yearsAvailable.length > 0 && (!selectedYear || !yearsAvailable.includes(selectedYear))) {
      setSelectedYear(yearsAvailable[yearsAvailable.length - 1]);
    }
  }, [yearsAvailable, selectedYear]);

  // Benchmark Lightweight Chart (Portfolio vs NIFTY 50 vs 7% Bank FD)
  useEffect(() => {
    const el = benchContainerRef.current;
    if (!el || tab !== 'BENCHMARK' || !profile || profile.equityHistory.length < 2) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#1b1e24' : '#ffffff' },
        textColor: isDark ? '#9ca3af' : '#555555',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(42,46,55,0.6)' : 'rgba(235,235,235,0.8)' },
        horzLines: { color: isDark ? 'rgba(42,46,55,0.6)' : 'rgba(235,235,235,0.8)' },
      },
    });

    const hist = profile.equityHistory;
    const baseCap = hist[0].netCapitalInvested || hist[0].totalEquity || 200000;
    const baseNifty = hist[0].niftyClose || 1;
    const startMs = new Date(hist[0].date + 'T00:00:00Z').getTime();

    const portSeries = chart.addLineSeries({
      color: '#387ed1',
      lineWidth: 2,
      title: 'Your Portfolio',
    });
    const niftySeries = chart.addLineSeries({
      color: '#ff5722',
      lineWidth: 2,
      title: 'NIFTY 50 Buy & Hold',
    });
    const fdSeries = chart.addLineSeries({
      color: '#10b981',
      lineWidth: 1,
      title: '7% Fixed Deposit',
    });

    portSeries.setData(
      hist.map((p) => ({
        time: p.date as Time,
        // Normalize if additional deposits occurred so comparison vs baseCap stays apples-to-apples, or show actual wealth
        value: Number(((p.totalEquity / Math.max(1, p.netCapitalInvested)) * baseCap).toFixed(2)),
      }))
    );

    niftySeries.setData(
      hist.map((p) => ({
        time: p.date as Time,
        value: Number(((p.niftyClose / baseNifty) * baseCap).toFixed(2)),
      }))
    );

    fdSeries.setData(
      hist.map((p) => {
        const yrs = Math.max(0, (new Date(p.date + 'T00:00:00Z').getTime() - startMs) / (365.25 * 86400000));
        return {
          time: p.date as Time,
          value: Number((baseCap * Math.pow(1.07, yrs)).toFixed(2)),
        };
      })
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (benchContainerRef.current) {
        chart.applyOptions({
          width: benchContainerRef.current.clientWidth,
          height: benchContainerRef.current.clientHeight,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [profile, tab, theme]);

  if (!profile) return null;

  const perf = calculatePortfolioPerformance(profile.equityHistory);
  const tax = calculateIndianTaxSummary(profile.trades);

  const closedTrades = profile.trades.filter((t) => typeof t.realizedPnl === 'number');
  const winningTrades = closedTrades.filter((t) => (t.realizedPnl || 0) > 0);
  const losingTrades = closedTrades.filter((t) => (t.realizedPnl || 0) < 0);
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
  const grossWins = winningTrades.reduce((a, t) => a + (t.realizedPnl || 0), 0);
  const grossLosses = Math.abs(losingTrades.reduce((a, t) => a + (t.realizedPnl || 0), 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99.9 : 0;

  const totalDividendsEarned = profile.ledger
    .filter((l) => l.category === 'DIVIDEND')
    .reduce((a, l) => a + l.credit, 0);

  const exportTradesCsv = () => {
    const header = 'Date,Time,Symbol,Product,Side,Qty,Price,Turnover,TotalCharges,RealizedPnL,TaxCategory,Note\n';
    const lines = profile.trades.map((t) =>
      [
        t.date,
        t.time,
        t.displaySymbol,
        t.product,
        t.side,
        t.qty,
        t.price,
        t.turnover,
        t.charges.totalCharges,
        t.realizedPnl ?? '',
        t.taxCategory ?? '',
        `"${(t.note || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
    const blob = new Blob([header + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zerodha_sim_tradebook_${profile.currentDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  type Trade = (typeof profile.trades)[number];
  const renderTagSelect = (t: Trade, cls: string) => (
    <select
      value={t.emotionTag || ''}
      aria-label="Mindset tag"
      data-coach="mindset-tag"
      onChange={(e) =>
        updateProfileMeta({
          tradeNote: {
            tradeId: t.id,
            note: t.note || '',
            emotionTag: (e.target.value || undefined) as typeof t.emotionTag,
          },
        })
      }
      className={cls}
    >
      <option value="">Tag...</option>
      <option value="DISCIPLINED">Disciplined</option>
      <option value="CONVICTION">Conviction</option>
      <option value="FOMO">FOMO</option>
      <option value="PANIC">Panic Exit</option>
      <option value="REVENGE">Revenge Trade</option>
    </select>
  );
  const renderNoteInput = (t: Trade, cls: string) => (
    <input
      type="text"
      defaultValue={t.note || ''}
      placeholder="Why did you take this trade?"
      aria-label="Trade journal note"
      data-tip="Trade Journal Note :: Write why you entered or exited — the setup, your plan, your feelings. :: Re-reading notes on losing trades is the fastest way to improve."
      onBlur={(e) => {
        if (e.target.value !== (t.note || '')) {
          updateProfileMeta({
            tradeNote: {
              tradeId: t.id,
              note: e.target.value,
              emotionTag: t.emotionTag,
            },
          });
        }
      }}
      className={cls}
    />
  );
  const sideBadge = (t: Trade) => (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
        t.side === 'BUY' ? 'bg-kite-blue/15 text-kite-blue' : 'bg-kite-orange/15 text-kite-orange'
      }`}
    >
      {t.side}
    </span>
  );
  const realizedCell = (t: Trade) =>
    typeof t.realizedPnl === 'number' ? (
      <span className={t.realizedPnl >= 0 ? 'text-kite-green' : 'text-kite-red'}>
        {formatINR(t.realizedPnl, { signed: true })}
        {t.taxCategory && (
          <span className="ml-1 text-[9px] px-1 rounded bg-gray-100 dark:bg-gray-800 text-kite-muted">{t.taxCategory}</span>
        )}
      </span>
    ) : (
      <span className="text-kite-muted">—</span>
    );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-kite-darkSurface">
      {/* Zerodha Console Header & Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between px-2 md:px-5 border-b border-kite-border dark:border-kite-darkBorder bg-slate-50/70 dark:bg-[#15181e]">
        <div className="flex items-center overflow-x-auto text-xs font-medium max-w-full [scrollbar-width:none]">
          {[
            { id: 'BENCHMARK', label: 'Portfolio vs. NIFTY 50', icon: TrendingUp },
            { id: 'HEATMAP', label: 'P&L Heatmap Calendar', icon: Calendar },
            { id: 'TAX', label: 'Tax P&L & Charges', icon: Receipt },
            { id: 'JOURNAL', label: `Tradebook & Journal (${profile.trades.length})`, icon: BookOpen },
            { id: 'LEDGER', label: 'Funds Statement', icon: FileSpreadsheet },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as ConsoleTab)}
                className={`flex items-center gap-1.5 px-3 md:px-4 py-3 min-h-[44px] md:min-h-0 border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'border-kite-blue text-kite-blue font-semibold'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={exportTradesCsv}
          className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[40px] md:min-h-0 rounded border border-gray-300 dark:border-kite-darkBorder text-[11px] font-medium hover:border-kite-blue my-1.5 ml-auto"
        >
          <Download className="w-3 h-3" />
          <span>Export Tradebook CSV</span>
        </button>
      </div>

      {/* Console Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-4 md:space-y-6 text-xs">
        {tab === 'BENCHMARK' && (
          <>
            {/* Performance Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
              <div className="p-3 md:p-3.5 rounded border border-kite-border dark:border-kite-darkBorder">
                <div className="text-[11px] text-kite-muted" data-tip="Your Return :: Total % gain of your account over the whole timeline, measured on the money you deposited.">Your Return</div>
                <div
                  className={`text-base font-mono font-bold mt-0.5 ${
                    perf.totalReturnPct >= 0 ? 'text-kite-green' : 'text-kite-red'
                  }`}
                >
                  {formatPct(perf.totalReturnPct)}
                </div>
                <div className="text-[10px] text-kite-muted font-mono" data-coach="cagr">CAGR: {formatPct(perf.cagrPct)}</div>
              </div>

              <div className="p-3 md:p-3.5 rounded border border-kite-border dark:border-kite-darkBorder">
                <div className="text-[11px] text-kite-muted" data-coach="benchmark">NIFTY 50 Return</div>
                <div
                  className={`text-base font-mono font-bold mt-0.5 ${
                    perf.niftyReturnPct >= 0 ? 'text-kite-orange' : 'text-kite-red'
                  }`}
                >
                  {formatPct(perf.niftyReturnPct)}
                </div>
                <div className="text-[10px] text-kite-muted font-mono" data-coach="cagr">
                  CAGR: {formatPct(perf.niftyCagrPct)}
                </div>
              </div>

              <div className="p-3 md:p-3.5 rounded border border-kite-border dark:border-kite-darkBorder">
                <div className="text-[11px] text-kite-muted" data-tip="Alpha vs. NIFTY :: Your return minus the NIFTY 50’s return over the same period. Positive = you beat simply buying the index. :: Most active traders end up with negative alpha after charges.">Alpha vs. Nifty</div>
                <div
                  className={`text-base font-mono font-bold mt-0.5 ${
                    perf.totalReturnPct - perf.niftyReturnPct >= 0 ? 'text-kite-green' : 'text-kite-red'
                  }`}
                >
                  {formatPct(perf.totalReturnPct - perf.niftyReturnPct)}
                </div>
                <div className="text-[10px] text-kite-muted">
                  {perf.totalReturnPct >= perf.niftyReturnPct ? 'Beating Index!' : 'Lagging Index'}
                </div>
              </div>

              <div className="p-3 md:p-3.5 rounded border border-kite-border dark:border-kite-darkBorder">
                <div className="text-[11px] text-kite-muted" data-coach="max-drawdown">Max Drawdown</div>
                <div className="text-base font-mono font-bold text-kite-red mt-0.5">
                  -{perf.maxDrawdownPct.toFixed(2)}%
                </div>
                <div className="text-[10px] text-kite-muted font-mono" data-tip="Sharpe Ratio :: Return earned per unit of volatility (risk). Above 1 is good, above 2 is excellent. :: Two portfolios with the same return — the higher Sharpe one was the smoother ride.">Sharpe: {perf.sharpeRatio}</div>
              </div>

              <div className="p-3 md:p-3.5 rounded border border-kite-border dark:border-kite-darkBorder">
                <div className="text-[11px] text-kite-muted" data-tip="Win Rate :: % of closed trades that made money. :: A low win rate is fine if your winners are much bigger than your losers.">Win Rate</div>
                <div className="text-base font-mono font-bold text-gray-800 dark:text-white mt-0.5">
                  {winRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-kite-muted font-mono">
                  {winningTrades.length}W / {losingTrades.length}L
                </div>
              </div>

              <div className="p-3 md:p-3.5 rounded border border-kite-border dark:border-kite-darkBorder">
                <div className="text-[11px] text-kite-muted" data-tip="Profit Factor :: Total profit from winning trades ÷ total loss from losing trades. Above 1 = profitable overall; 1.5+ is solid.">Profit Factor</div>
                <div className="text-base font-mono font-bold text-kite-blue mt-0.5">
                  {profitFactor.toFixed(2)}x
                </div>
                <div className="text-[10px] text-kite-muted font-mono">
                  Span: {perf.yearsElapsed} yrs
                </div>
              </div>
            </div>

            {/* Equity Curve Chart */}
            <div className="p-4 rounded border border-kite-border dark:border-kite-darkBorder space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-kite-blue" />
                  <span>Normalized Growth of {formatINR(profile.startingCapital, { decimals: 0 })}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium">
                  <span className="text-[#387ed1]">● Your Strategy</span>
                  <span className="text-[#ff5722]">● NIFTY 50 Index</span>
                  <span className="text-[#10b981]" data-tip="7% Bank FD :: What the same money would have earned in a fixed deposit at 7% a year — the “no-risk” hurdle your strategy should beat.">● 7% Bank FD</span>
                </div>
              </div>

              {profile.equityHistory.length < 2 ? (
                <div className="h-72 flex items-center justify-center text-kite-muted">
                  Advance at least +1 Day or +1 Month using the Time-Machine bar above to plot your equity curve!
                </div>
              ) : (
                <div ref={benchContainerRef} className="w-full h-64 md:h-80" />
              )}
            </div>
          </>
        )}

        {tab === 'HEATMAP' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-sm text-gray-800 dark:text-white" data-coach="pnl-calendar">
                  Zerodha Console Daily Portfolio P&L Heatmap
                </h2>
                <p className="text-[11px] text-kite-muted">
                  Each cell shows your daily portfolio net-worth change (green = profitable day, red = drawdown day).
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {yearsAvailable.map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    className={`px-2.5 py-1 min-h-[36px] md:min-h-0 rounded font-mono text-xs font-semibold ${
                      selectedYear === yr
                        ? 'bg-kite-blue text-white'
                        : 'border border-gray-200 dark:border-kite-darkBorder hover:border-kite-blue'
                    }`}
                  >
                    {profile.blindMode ? `Yr ${yearsAvailable.indexOf(yr) + 1}` : yr}
                  </button>
                ))}
              </div>
            </div>

            {/* 12-Month Grid for Selected Year */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {Array.from({ length: 12 }, (_, mIdx) => {
                const mm = String(mIdx + 1).padStart(2, '0');
                const ymPrefix = `${selectedYear}-${mm}`;
                const monthNames = [
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ];

                // Build daily delta map for this month
                const dayDeltaMap = new Map<number, { delta: number; date: string; realized: number }>();
                let monthNet = 0;
                const hist = profile.equityHistory;
                for (let i = 0; i < hist.length; i++) {
                  const pt = hist[i];
                  if (!pt.date.startsWith(ymPrefix)) continue;
                  const prev = i > 0 ? hist[i - 1] : pt;
                  const capDiff = pt.netCapitalInvested - prev.netCapitalInvested;
                  const delta = i === 0 ? 0 : pt.totalEquity - prev.totalEquity - capDiff;
                  const dayNum = Number(pt.date.slice(8, 10));
                  dayDeltaMap.set(dayNum, { delta, date: pt.date, realized: pt.realizedPnlDay });
                  monthNet += delta;
                }

                const daysInMonth = new Date(Number(selectedYear || 2020), mIdx + 1, 0).getDate();

                return (
                  <div
                    key={mm}
                    className="p-3 rounded border border-kite-border dark:border-kite-darkBorder bg-slate-50/40 dark:bg-[#15181e]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        {monthNames[mIdx]}
                      </span>
                      {dayDeltaMap.size > 0 && (
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            monthNet >= 0 ? 'text-kite-green' : 'text-kite-red'
                          }`}
                        >
                          {formatINR(monthNet, { compact: true, signed: true })}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: daysInMonth }, (_, dIdx) => {
                        const dNum = dIdx + 1;
                        const entry = dayDeltaMap.get(dNum);
                        let cellClass = 'bg-gray-200/60 dark:bg-gray-800/60 text-gray-400';
                        if (entry) {
                          if (entry.delta > 500) cellClass = 'bg-emerald-500 text-white font-semibold';
                          else if (entry.delta > 0) cellClass = 'bg-emerald-500/40 text-emerald-950 dark:text-white';
                          else if (entry.delta < -500) cellClass = 'bg-red-500 text-white font-semibold';
                          else if (entry.delta < 0) cellClass = 'bg-red-500/40 text-red-950 dark:text-white';
                          else cellClass = 'bg-blue-500/20 text-gray-700 dark:text-gray-200';
                        }
                        return (
                          <div
                            key={dNum}
                            title={
                              entry
                                ? `${entry.date}: Portfolio Δ ${formatINR(entry.delta, { signed: true })} (Realized: ${formatINR(entry.realized, { signed: true })})`
                                : `Day ${dNum}: Market Holiday / Not Reached`
                            }
                            className={`h-8 md:h-6 rounded-xs flex items-center justify-center text-[10px] font-mono ${cellClass}`}
                          >
                            {dNum}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'TAX' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Indian Capital Gains Tax P&L Card */}
            <div className="rounded border border-kite-border dark:border-kite-darkBorder overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-[#15181e] border-b border-kite-border dark:border-kite-darkBorder font-bold text-gray-800 dark:text-white">
                Indian Capital Gains & Speculative Tax P&L Summary
              </div>
              <div className="px-3 py-2 md:p-4 divide-y divide-gray-100 dark:divide-kite-darkBorder space-y-1">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-semibold" data-coach="stcg">Short-Term Capital Gains (STCG ≤ 365 days)</div>
                    <div className="text-[11px] text-kite-muted">Equity Delivery taxed at 20% in India</div>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      tax.stcgProfit >= 0 ? 'text-kite-green' : 'text-kite-red'
                    }`}
                  >
                    {formatINR(tax.stcgProfit, { signed: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-semibold" data-coach="ltcg">Long-Term Capital Gains (LTCG &gt; 365 days)</div>
                    <div className="text-[11px] text-kite-muted">
                      Taxed at 12.5% above ₹1,25,000 exemption
                    </div>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      tax.ltcgProfit >= 0 ? 'text-kite-green' : 'text-kite-red'
                    }`}
                  >
                    {formatINR(tax.ltcgProfit, { signed: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-semibold" data-coach="intraday-tax">Intraday Speculative Income (MIS)</div>
                    <div className="text-[11px] text-kite-muted">Taxed at applicable income tax slab</div>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      tax.intradayProfit >= 0 ? 'text-kite-green' : 'text-kite-red'
                    }`}
                  >
                    {formatINR(tax.intradayProfit, { signed: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-semibold" data-coach="intraday-tax">F&O Non-Speculative Business Income (NRML)</div>
                    <div className="text-[11px] text-kite-muted">Futures & Options realized P&L</div>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      tax.fnoProfit >= 0 ? 'text-kite-green' : 'text-kite-red'
                    }`}
                  >
                    {formatINR(tax.fnoProfit, { signed: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-semibold text-kite-blue" data-coach="dividend">Cash Dividends Earned</span>
                  <span className="font-mono font-bold text-kite-blue">
                    {formatINR(totalDividendsEarned)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 py-3 bg-amber-50/40 dark:bg-amber-950/15 px-2 rounded">
                  <span className="font-semibold" data-tip="Estimated Capital Gains Tax :: STCG at 20% plus LTCG at 12.5% on gains above ₹1.25 lakh, for this timeline. Simplified: ignores loss set-off across years, slab income and cess. :: Intraday/F&O profits are taxed at your slab and are not included here.">Estimated Capital Gains Tax Liability (STCG + LTCG)</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                    {formatINR(tax.estimatedStcgTax + tax.estimatedLtcgTax)}
                  </span>
                </div>
              </div>
            </div>

            {/* Brokerage & Statutory Charges Breakdown */}
            <div className="rounded border border-kite-border dark:border-kite-darkBorder overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-[#15181e] border-b border-kite-border dark:border-kite-darkBorder font-bold text-gray-800 dark:text-white">
                Brokerage, STT & Statutory Charges Leakage Report
              </div>
              <div className="px-3 py-2 md:p-4 divide-y divide-gray-100 dark:divide-kite-darkBorder space-y-1">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-kite-muted" data-coach="turnover">Total Traded Turnover</span>
                  <span className="font-mono font-semibold">{formatINR(tax.totalTurnover)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span data-coach="brokerage">Zerodha Brokerage (₹0 on CNC, ₹20/0.03% on MIS & F&O)</span>
                  <span className="font-mono">{formatINR(tax.brokeragePaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span data-coach="stt">Securities Transaction Tax (STT)</span>
                  <span className="font-mono">{formatINR(tax.sttPaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span data-coach="dp-charges">CDSL Depository (DP) Sell Charges (₹15.34/scrip/day)</span>
                  <span className="font-mono">{formatINR(tax.dpChargesPaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span data-tip="Exchange Txn, Stamp Duty, SEBI & GST :: Exchange transaction charges (~0.003% of turnover on shares), stamp duty (buy side only), SEBI’s ₹10/crore fee, and 18% GST on brokerage + exchange + SEBI charges." data-coach="exchange-charges">Exchange Txn, Stamp Duty, SEBI & 18% GST</span>
                  <span className="font-mono">{formatINR(tax.gstAndOtherPaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-3 font-bold text-kite-red">
                  <span data-coach="charges">Total Friction / Charges Paid</span>
                  <span className="font-mono">{formatINR(tax.totalChargesPaid)}</span>
                </div>
                <p className="pt-2 text-[11px] text-kite-muted leading-relaxed">
                  <strong>SEBI Insight:</strong> Notice how STT and DP charges accumulate rapidly when churning frequently, whereas long-term CNC compounding pays ₹0 brokerage and enjoys ₹1.25L tax-free LTCG!
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'JOURNAL' && (
          <div>
            {profile.trades.length === 0 ? (
              <div className="py-16 text-center text-kite-muted">
                No executed trades yet. Place your first trade to log entries in your Tradebook & Trading Journal!
              </div>
            ) : (
              <>
              {/* Phone: one card per trade */}
              <div className="md:hidden space-y-2">
                {profile.trades.slice(0, 200).map((t) => (
                  <div key={t.id} className="rounded border border-kite-border dark:border-kite-darkBorder p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {maskContractDisplay(t.displaySymbol, t.symbol, instrumentsMap, profile.blindMode)}
                          <span className="ml-1.5 text-[10px] font-mono text-kite-muted" data-coach="product-code">{t.product}</span>
                        </div>
                        <div className="font-mono text-[10px] text-kite-muted">
                          {t.date} {t.time}
                        </div>
                      </div>
                      <span data-coach="side">{sideBadge(t)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <div className="text-[10px] text-kite-muted">Qty × Price</div>
                        <div className="font-mono">
                          {t.qty} × ₹{t.price.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-kite-muted" data-coach="charges">Charges</div>
                        <div className="font-mono text-kite-muted">{formatINR(t.charges.totalCharges)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-kite-muted" data-coach="realised-pnl">Realized P&L</div>
                        <div className="font-mono font-semibold">{realizedCell(t)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {renderTagSelect(t, 'h-10 px-2 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-[12px]')}
                      {renderNoteInput(t, 'flex-1 min-w-0 h-10 px-2 rounded border border-gray-200 dark:border-kite-darkBorder bg-transparent focus:border-kite-blue focus:bg-white dark:focus:bg-kite-darkBg text-[12px] focus:outline-none')}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px] text-left">
                      <th className="py-2.5 px-2">Date</th>
                      <th className="py-2.5 px-2" data-coach="instrument">Instrument</th>
                      <th className="py-2.5 px-2" data-coach="side">Side</th>
                      <th className="py-2.5 px-2 text-right" data-tip="Qty × Price :: Number of shares/units filled and the price per unit of this fill.">Qty × Price</th>
                      <th className="py-2.5 px-2 text-right" data-coach="charges">Charges</th>
                      <th className="py-2.5 px-2 text-right" data-coach="realised-pnl">Net Realized P&L</th>
                      <th className="py-2.5 px-2" data-coach="mindset-tag">Mindset Tag</th>
                      <th className="py-2.5 px-2" data-tip="Trade Journal Note :: Your own notes on why you took the trade. :: Writing the reason before you click Buy stops many impulse trades.">Trade Journal Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                    {profile.trades.slice(0, 200).map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="py-2 px-2 font-mono text-[11px] text-kite-muted">
                          {t.date} {t.time}
                        </td>
                        <td className="py-2 px-2 font-semibold">
                          {maskContractDisplay(
                            t.displaySymbol,
                            t.symbol,
                            instrumentsMap,
                            profile.blindMode
                          )}
                          <span className="ml-1.5 text-[10px] font-mono text-kite-muted">{t.product}</span>
                        </td>
                        <td className="py-2 px-2">{sideBadge(t)}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {t.qty} × ₹{t.price.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-kite-muted">
                          {formatINR(t.charges.totalCharges)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-semibold">{realizedCell(t)}</td>
                        <td className="py-2 px-2">
                          {renderTagSelect(t, 'px-1.5 py-0.5 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-[11px]')}
                        </td>
                        <td className="py-2 px-2">
                          {renderNoteInput(t, 'w-full min-w-[160px] px-2 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-kite-blue bg-transparent focus:bg-white dark:focus:bg-kite-darkBg text-[11px] focus:outline-none')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {tab === 'LEDGER' && (
          <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
            <table className="w-full min-w-[560px] text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px] text-left">
                  <th className="py-2.5 px-2">Date</th>
                  <th className="py-2.5 px-2" data-coach="voucher-type">Voucher Type</th>
                  <th className="py-2.5 px-2" data-tip="Particulars :: A short description of the ledger entry — which trade, deposit, dividend or charge it was.">Particulars</th>
                  <th className="py-2.5 px-2 text-right" data-coach="debit-credit">Debit (₹)</th>
                  <th className="py-2.5 px-2 text-right" data-coach="debit-credit">Credit (₹)</th>
                  <th className="py-2.5 px-2 text-right" data-coach="running-balance">Net Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                {profile.ledger.slice(0, 300).map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="py-2 px-2 font-mono text-kite-muted whitespace-nowrap">{l.date}</td>
                    <td className="py-2 px-2">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[10px]">
                        {l.category}
                      </span>
                    </td>
                    <td className="py-2 px-2">{l.description}</td>
                    <td className="py-2 px-2 text-right font-mono text-kite-red">
                      {l.debit > 0 ? formatINR(l.debit) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-kite-green">
                      {l.credit > 0 ? formatINR(l.credit) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-semibold">
                      {formatINR(l.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
