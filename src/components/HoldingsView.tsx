import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart2,
  Bell,
  Download,
  Info,
  Lock,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Target,
  Unlock,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { NumberInput } from './NumberInput.tsx';
import type { Holding } from '../types/simulator.ts';
import { formatINR, formatNum, formatPct, getDisplaySymbol } from '../utils/format.ts';
import { ActionSheet, Sheet, downloadCsv } from './OrderDetailsSheet.tsx';

/** Same haircut the engine applies to pledged shares (Zerodha ≈15% for most large caps). */
const COLLATERAL_FACTOR = 0.85;

type SortKey = 'NAME' | 'PNL' | 'PNL_PCT' | 'CUR_VAL' | 'DAY_CHG';

type Row = Holding & {
  name: string;
  totalQty: number;
  ltp: number;
  invested: number;
  curVal: number;
  pnl: number;
  netChgPct: number;
  dayChg: number;
  dayChgPct: number;
};

const pnlCls = (v: number) => (v >= 0 ? 'text-kite-green' : 'text-kite-red');

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'NAME', label: 'Name' },
  { id: 'PNL', label: 'P&L' },
  { id: 'PNL_PCT', label: 'P&L %' },
  { id: 'CUR_VAL', label: 'Current value' },
  { id: 'DAY_CHG', label: 'Day change' },
];

export const HoldingsView: React.FC = () => {
  const {
    profile,
    quotes,
    instrumentsMap,
    selectSymbol,
    openOrderTicket,
    openGttModal,
    openAlertModal,
    pledgeHolding,
    authoriseTpin,
    convertHoldingToIntraday,
  } = useSimulatorStore();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('NAME');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [sheetSym, setSheetSym] = useState<string | null>(null);
  const [pledgeSym, setPledgeSym] = useState<string | null>(null);

  if (!profile) return null;

  let totalInvested = 0;
  let totalCurrent = 0;
  let dayPnl = 0;
  let totalDividends = 0;
  let collateral = 0;

  const all: Row[] = profile.holdings.map((h) => {
    const totalQty = h.qty + h.t1Qty;
    const q = quotes[h.symbol];
    const ltp = q?.ltp || h.avgPrice;
    const prevClose = q?.prevClose || ltp;
    const invested = totalQty * h.avgPrice;
    const curVal = totalQty * ltp;
    const pnl = curVal - invested;
    totalInvested += invested;
    totalCurrent += curVal;
    dayPnl += (ltp - prevClose) * totalQty;
    totalDividends += h.totalDividendsReceived || 0;
    collateral += h.pledgedQty * ltp * COLLATERAL_FACTOR;
    return {
      ...h,
      name: getDisplaySymbol(h.symbol, instrumentsMap, profile.blindMode),
      totalQty,
      ltp,
      invested,
      curVal,
      pnl,
      netChgPct: h.avgPrice > 0 ? ((ltp - h.avgPrice) / h.avgPrice) * 100 : 0,
      dayChg: (ltp - prevClose) * totalQty,
      dayChgPct: q?.changePct || 0,
    };
  });

  const qs = search.trim().toUpperCase();
  const rows = all
    .filter((r) => !qs || r.name.toUpperCase().includes(qs))
    .sort((a, b) => {
      let d = 0;
      switch (sortKey) {
        case 'NAME':
          d = a.name.localeCompare(b.name);
          break;
        case 'PNL':
          d = a.pnl - b.pnl;
          break;
        case 'PNL_PCT':
          d = a.netChgPct - b.netChgPct;
          break;
        case 'CUR_VAL':
          d = a.curVal - b.curVal;
          break;
        case 'DAY_CHG':
          d = a.dayChgPct - b.dayChgPct;
          break;
      }
      return d * sortDir;
    });

  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const prevValue = totalCurrent - dayPnl;
  const dayPnlPct = prevValue > 0 ? (dayPnl / prevValue) * 100 : 0;
  const tpinOk = profile.tpinAuthorisedDate === profile.currentDate;

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === 'NAME' ? 1 : -1);
    }
  };

  const exportCsv = () =>
    downloadCsv(`holdings-${profile.currentDate}.csv`, [
      ['Instrument', 'Exchange', 'Qty (settled)', 'T1 qty', 'Pledged qty', 'Avg cost', 'LTP', 'Invested', 'Current value', 'P&L', 'Net chg %', 'Day chg %', 'Dividends'],
      ...rows.map((r) => [
        r.name,
        r.exchange,
        r.qty,
        r.t1Qty,
        r.pledgedQty,
        r.avgPrice.toFixed(2),
        r.ltp.toFixed(2),
        r.invested.toFixed(2),
        r.curVal.toFixed(2),
        r.pnl.toFixed(2),
        r.netChgPct.toFixed(2),
        r.dayChgPct.toFixed(2),
        (r.totalDividendsReceived || 0).toFixed(2),
      ]),
    ]);

  const exit = (r: Row) => openOrderTicket({ side: 'SELL', symbol: r.symbol, product: 'CNC', qty: Math.max(1, r.totalQty - r.pledgedQty) });
  const add = (r: Row) => openOrderTicket({ side: 'BUY', symbol: r.symbol, product: 'CNC' });

  const sheetRow = all.find((r) => r.symbol === sheetSym);
  const pledgeRow = all.find((r) => r.symbol === pledgeSym);

  const SortTh = ({ k, label, tip, left }: { k?: SortKey; label: string; tip: string; left?: boolean }) => (
    <th
      data-tip={tip}
      onClick={k ? () => setSort(k) : undefined}
      className={`py-2.5 px-2 font-medium ${left ? 'text-left' : 'text-right'} ${k ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200' : ''}`}
    >
      {label}
      {k && sortKey === k && (sortDir === 1 ? <ArrowUp className="inline w-3 h-3 ml-0.5" /> : <ArrowDown className="inline w-3 h-3 ml-0.5" />)}
    </th>
  );

  const Badges = ({ r }: { r: Row }) => (
    <>
      {r.t1Qty > 0 && (
        <span
          className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono"
          data-tip={`T1 :: ${r.t1Qty} share(s) bought on the last trading day are not yet settled in your Demat (India settles on T+1). You can sell them (BTST), but they can't be pledged until settlement.`}
        >
          T1 {r.t1Qty}
        </span>
      )}
      {r.pledgedQty > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-[9px] px-1 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 font-mono"
          data-tip={`Pledged :: ${r.pledgedQty} share(s) are pledged as collateral, giving ≈${Math.round(COLLATERAL_FACTOR * 100)}% of their value as margin for intraday & F&O. Unpledge before selling them.`}
        >
          <ShieldCheck className="w-2.5 h-2.5" />
          {r.pledgedQty}
        </span>
      )}
    </>
  );

  const summary = [
    { label: 'Total investment', value: formatINR(totalInvested), cls: 'text-gray-800 dark:text-white', tip: 'Total investment :: What you paid for all your holdings (quantity × average buy price).' },
    { label: 'Current value', value: formatINR(totalCurrent), cls: 'text-gray-800 dark:text-white', tip: 'Current value :: What your holdings are worth now at the latest price (LTP).' },
    {
      label: "Day's P&L",
      value: (
        <>
          {formatINR(dayPnl, { signed: true })} <span className="text-[11px]">({formatPct(dayPnlPct)})</span>
        </>
      ),
      cls: pnlCls(dayPnl),
      tip: "Day's P&L :: How much your holdings gained or lost today, versus yesterday's closing prices.",
    },
    {
      label: 'Total P&L',
      value: (
        <>
          {formatINR(totalPnl, { signed: true })} <span className="text-[11px]">({formatPct(totalPnlPct)})</span>
        </>
      ),
      cls: pnlCls(totalPnl),
      tip: 'Total P&L :: Current value − total investment. This is unrealised — it becomes real profit/loss only when you sell. :: Dividends are shown separately.',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-kite-darkSurface">
      <div className="p-3 md:p-5 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-3 border-b border-kite-border dark:border-kite-darkBorder">
          {summary.map((s) => (
            <div key={s.label}>
              <div className="text-[11px] text-kite-muted" data-tip={s.tip}>
                {s.label}
              </div>
              <div className={`text-base md:text-lg font-mono font-semibold mt-0.5 ${s.cls}`}>{s.value}</div>
            </div>
          ))}
          <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span
              className="text-kite-muted"
              data-tip="Dividends :: Cash paid by companies to shareholders, credited to your funds on the payment date. Shown here as a running total."
            >
              Dividends received <strong className="font-mono text-kite-blue">{formatINR(totalDividends)}</strong>
            </span>
            {collateral > 0 && (
              <span
                className="text-kite-muted"
                data-tip={`Collateral margin :: Value of pledged shares after a ${Math.round((1 - COLLATERAL_FACTOR) * 100)}% haircut. It can be used as margin for intraday and F&O trades (not for delivery buys).`}
              >
                Collateral (after haircut) <strong className="font-mono text-purple-600 dark:text-purple-300">{formatINR(collateral)}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[150px] md:flex-none md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-kite-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search holdings"
              data-tip="Search :: Filter your holdings by stock name."
              className="w-full h-10 md:h-8 pl-8 pr-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-xs focus:outline-none focus:border-kite-blue"
            />
          </div>
          <div className="flex items-center">
            <select
              value={sortKey}
              onChange={(e) => {
                const k = e.target.value as SortKey;
                setSortKey(k);
                setSortDir(k === 'NAME' ? 1 : -1);
              }}
              aria-label="Sort holdings"
              data-tip="Sort :: Order your holdings by name, P&L, P&L %, current value or today's change."
              className="h-10 md:h-8 px-2 rounded-l border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-xs focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === 1 ? -1 : 1))}
              aria-label="Toggle sort direction"
              data-tip="Sort direction :: Switch between ascending and descending."
              className="h-10 md:h-8 w-10 md:w-8 flex items-center justify-center rounded-r border border-l-0 border-gray-300 dark:border-kite-darkBorder"
            >
              {sortDir === 1 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {tpinOk ? (
              <span
                className="inline-flex items-center gap-1 h-10 md:h-8 px-2.5 rounded bg-emerald-500/10 text-kite-green text-[11px] font-semibold"
                data-tip="Authorised today :: You've completed today's CDSL e-DIS (TPIN) authorisation, so you can sell your delivery holdings without another prompt today."
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Authorised
              </span>
            ) : (
              <button
                onClick={() => void authoriseTpin()}
                disabled={profile.holdings.length === 0}
                data-tip="Authorisation (CDSL e-DIS / TPIN) :: To sell shares from your Demat, CDSL needs you to authorise them each day using your 6-digit TPIN + OTP (or a standing POA/DDPI). :: Authorise in the morning so your sell orders go through instantly."
                className="inline-flex items-center gap-1 h-10 md:h-8 px-2.5 rounded border border-emerald-600/50 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold disabled:opacity-40"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Authorise
              </button>
            )}
            <button
              onClick={exportCsv}
              disabled={rows.length === 0}
              data-tip="Download CSV :: Save your holdings as a spreadsheet file."
              className="inline-flex items-center gap-1 h-10 md:h-8 px-2.5 rounded border border-gray-300 dark:border-kite-darkBorder text-[11px] font-semibold text-kite-blue disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {all.length === 0 ? (
          <div className="py-12 text-center space-y-2 max-w-md mx-auto">
            <Info className="w-7 h-7 mx-auto text-kite-muted" />
            <div className="text-sm font-medium text-gray-700 dark:text-gray-200">You don&apos;t have any holdings yet</div>
            <p className="text-xs text-kite-muted leading-relaxed">
              Holdings are shares you own in your <strong>Demat</strong> account for the long term. Buy a stock or ETF (e.g. NIFTYBEES, RELIANCE)
              from the watchlist with product <strong>CNC (Longterm)</strong>. It shows here right away marked <strong>T1</strong> and becomes fully
              settled the next trading day (T+1).
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-kite-muted">No holdings match “{search}”.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px]">
                    <SortTh k="NAME" left label="Instrument" tip="Instrument :: The stock / ETF. T1 = bought recently and not yet settled; the shield shows pledged shares. Click to sort." />
                    <SortTh label="Qty." tip="Qty. :: Total shares you hold (settled + T1)." />
                    <SortTh label="Avg. cost" tip="Average cost :: Your average buy price per share across all purchases." />
                    <SortTh label="LTP" tip="LTP :: Last traded price." />
                    <SortTh label="Invested" tip="Invested :: Qty × average cost." />
                    <SortTh k="CUR_VAL" label="Cur. val" tip="Current value :: Qty × LTP. Click to sort." />
                    <SortTh k="PNL" label="P&L" tip="P&L :: Current value − invested (unrealised). Click to sort." />
                    <SortTh k="PNL_PCT" label="Net chg." tip="Net change :: % gain/loss from your average cost. Click to sort." />
                    <SortTh k="DAY_CHG" label="Day chg." tip="Day change :: How much the stock moved today vs yesterday's close. Click to sort." />
                    <th className="py-2.5 px-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                  {rows.map((r) => (
                    <tr key={r.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="py-3 px-2 font-semibold text-gray-800 dark:text-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="cursor-pointer hover:text-kite-blue" onClick={() => void selectSymbol(r.symbol, true)}>
                            {r.name}
                          </span>
                          <Badges r={r} />
                        </div>
                        {(r.totalDividendsReceived || 0) > 0 && (
                          <div className="text-[10px] font-normal text-kite-blue" data-tip="Dividends :: Total dividends this holding has paid you.">
                            Div. {formatINR(r.totalDividendsReceived)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-mono">{r.totalQty}</td>
                      <td className="py-3 px-2 text-right font-mono">{formatNum(r.avgPrice)}</td>
                      <td className="py-3 px-2 text-right font-mono">{formatNum(r.ltp)}</td>
                      <td className="py-3 px-2 text-right font-mono text-kite-muted">{formatINR(r.invested)}</td>
                      <td className="py-3 px-2 text-right font-mono">{formatINR(r.curVal)}</td>
                      <td className={`py-3 px-2 text-right font-mono font-semibold ${pnlCls(r.pnl)}`}>{formatINR(r.pnl, { signed: true })}</td>
                      <td className={`py-3 px-2 text-right font-mono ${pnlCls(r.netChgPct)}`}>{formatPct(r.netChgPct)}</td>
                      <td className={`py-3 px-2 text-right font-mono ${pnlCls(r.dayChgPct)}`}>{formatPct(r.dayChgPct)}</td>
                      <td className="py-3 px-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => add(r)}
                            data-tip="Add :: Buy more of this stock for delivery (CNC). Your average cost is recalculated."
                            className="px-2 py-1 min-h-[28px] rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold text-[10px]"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => exit(r)}
                            data-tip="Exit :: Sell this holding. Needs today's CDSL authorisation (TPIN) and costs a ₹15.34 DP charge once per stock per day. :: Pledged shares must be unpledged first."
                            className="px-2 py-1 min-h-[28px] rounded bg-kite-orange hover:bg-kite-orangeHover text-white font-semibold text-[10px]"
                          >
                            Exit
                          </button>
                          <button
                            onClick={() => openGttModal(r.symbol, 'SELL')}
                            data-tip="Create GTT :: Set a stop-loss and/or target that stays active for a year — a sell order is placed automatically when the price hits it."
                            className="p-1.5 rounded border border-gray-300 dark:border-kite-darkBorder hover:border-kite-blue text-kite-blue"
                            aria-label="Create GTT"
                          >
                            <Target className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openAlertModal(r.symbol)}
                            data-tip="Create alert :: Get notified when this stock crosses a price or day-change level."
                            className="p-1.5 rounded border border-gray-300 dark:border-kite-darkBorder hover:border-kite-blue text-gray-600 dark:text-gray-300"
                            aria-label="Create alert"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPledgeSym(r.symbol)}
                            disabled={r.qty === 0 && r.pledgedQty === 0}
                            data-tip={`Pledge / unpledge :: Pledge settled shares to get ≈${Math.round(COLLATERAL_FACTOR * 100)}% of their value as collateral margin for intraday & F&O. You still own them and get dividends.`}
                            className="p-1.5 rounded border border-gray-300 dark:border-kite-darkBorder hover:border-purple-500 text-purple-600 dark:text-purple-300 disabled:opacity-30"
                            aria-label="Pledge"
                          >
                            {r.pledgedQty > 0 ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
              {rows.map((r) => (
                <button key={r.symbol} onClick={() => setSheetSym(r.symbol)} className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800/50">
                  <div className="flex items-center justify-between text-[10px] text-kite-muted">
                    <span>
                      Qty. <span className="font-mono">{r.totalQty}</span> · Avg. <span className="font-mono">{formatNum(r.avgPrice)}</span>
                    </span>
                    <span className={`font-mono ${pnlCls(r.netChgPct)}`}>{formatPct(r.netChgPct)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">{r.name}</span>
                      <Badges r={r} />
                    </span>
                    <span className={`font-mono text-[13px] font-semibold ${pnlCls(r.pnl)}`}>{formatINR(r.pnl, { signed: true })}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-kite-muted">
                    <span>
                      Invested <span className="font-mono">{formatNum(r.invested)}</span>
                    </span>
                    <span className="font-mono">
                      LTP {formatNum(r.ltp)} <span className={pnlCls(r.dayChgPct)}>({formatPct(r.dayChgPct)})</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <ActionSheet
        open={Boolean(sheetRow)}
        onClose={() => setSheetSym(null)}
        title={sheetRow?.name}
        subtitle={sheetRow ? `Qty ${sheetRow.totalQty} · Avg ${formatNum(sheetRow.avgPrice)} · LTP ${formatNum(sheetRow.ltp)}` : ''}
        header={
          sheetRow ? (
            <div className="grid grid-cols-3 gap-2 px-4 py-3 text-[11px] border-b border-gray-100 dark:border-kite-darkBorder">
              <div>
                <div className="text-kite-muted">Invested</div>
                <div className="font-mono">{formatINR(sheetRow.invested, { compact: true })}</div>
              </div>
              <div>
                <div className="text-kite-muted">Current</div>
                <div className="font-mono">{formatINR(sheetRow.curVal, { compact: true })}</div>
              </div>
              <div>
                <div className="text-kite-muted">P&L</div>
                <div className={`font-mono ${pnlCls(sheetRow.pnl)}`}>{formatINR(sheetRow.pnl, { compact: true, signed: true })}</div>
              </div>
            </div>
          ) : null
        }
        actions={
          sheetRow
            ? [
                { label: 'Add (buy more)', icon: <Plus className="w-4 h-4" />, tone: 'blue', onClick: () => add(sheetRow) },
                { label: 'Exit (sell)', icon: <LogOut className="w-4 h-4" />, tone: 'orange', onClick: () => exit(sheetRow) },
                { label: 'Create GTT', icon: <Target className="w-4 h-4" />, onClick: () => openGttModal(sheetRow.symbol, 'SELL') },
                { label: 'Create alert', icon: <Bell className="w-4 h-4" />, onClick: () => openAlertModal(sheetRow.symbol) },
                {
                  label: sheetRow.pledgedQty > 0 ? 'Pledge / unpledge' : 'Pledge for margin',
                  icon: <Lock className="w-4 h-4" />,
                  hidden: sheetRow.qty === 0 && sheetRow.pledgedQty === 0,
                  onClick: () => setPledgeSym(sheetRow.symbol),
                },
                {
                  label: "Convert today's buy to intraday (MIS)",
                  icon: <LogOut className="w-4 h-4 rotate-180" />,
                  hidden: !(profile.holdings.find((h) => h.symbol === sheetRow.symbol)?.lots || []).some((l) => l.buyDate === profile.currentDate),
                  onClick: () => void convertHoldingToIntraday(sheetRow.symbol),
                },
                { label: 'View chart', icon: <BarChart2 className="w-4 h-4" />, onClick: () => void selectSymbol(sheetRow.symbol, true) },
              ]
            : []
        }
      />

      {pledgeRow && (
        <PledgeDialog
          key={pledgeRow.symbol}
          r={pledgeRow}
          onClose={() => setPledgeSym(null)}
          onSubmit={(target) => {
            setPledgeSym(null);
            void pledgeHolding(pledgeRow.symbol, target);
          }}
        />
      )}
    </div>
  );
};

/** Partial pledge / unpledge (pledgeHolding takes the new total pledged quantity). */
const PledgeDialog: React.FC<{ r: Row; onClose: () => void; onSubmit: (newPledgedTotal: number) => void }> = ({ r, onClose, onSubmit }) => {
  const free = Math.max(0, r.qty - r.pledgedQty);
  const [mode, setMode] = useState<'PLEDGE' | 'UNPLEDGE'>(free > 0 ? 'PLEDGE' : 'UNPLEDGE');
  const max = mode === 'PLEDGE' ? free : r.pledgedQty;
  const [qty, setQty] = useState(max);
  const target = mode === 'PLEDGE' ? r.pledgedQty + qty : r.pledgedQty - qty;
  const collateralAfter = target * r.ltp * COLLATERAL_FACTOR;
  const changeVal = qty * r.ltp * COLLATERAL_FACTOR;

  return (
    <Sheet open onClose={onClose} title={`Pledge ${r.name}`} subtitle={`LTP ₹${formatNum(r.ltp)} · haircut ${Math.round((1 - COLLATERAL_FACTOR) * 100)}%`} maxW="md:max-w-sm">
      <div className="px-4 py-3 space-y-3">
        <p
          className="text-[11px] text-kite-muted leading-relaxed"
          data-tip="Pledging :: You mark shares in your Demat as collateral with the broker (via CDSL). You keep ownership and dividends, and get margin for intraday / F&O trades. :: The broker applies a haircut (≈15% here) to protect against price falls. Only settled shares (not T1) can be pledged."
        >
          Pledge settled shares to get collateral margin for intraday & F&O. You keep ownership and dividends. Only settled (non-T1) shares can be
          pledged.
        </p>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div className="text-kite-muted">Settled</div>
            <div className="font-mono">{r.qty}</div>
          </div>
          <div>
            <div className="text-kite-muted">Pledged</div>
            <div className="font-mono text-purple-600 dark:text-purple-300">{r.pledgedQty}</div>
          </div>
          <div>
            <div className="text-kite-muted">Free</div>
            <div className="font-mono">{free}</div>
          </div>
        </div>
        <div className="flex rounded border border-gray-300 dark:border-kite-darkBorder overflow-hidden text-xs font-semibold">
          {(['PLEDGE', 'UNPLEDGE'] as const).map((m) => (
            <button
              key={m}
              disabled={m === 'PLEDGE' ? free === 0 : r.pledgedQty === 0}
              onClick={() => {
                setMode(m);
                setQty(m === 'PLEDGE' ? free : r.pledgedQty);
              }}
              data-tip={
                m === 'PLEDGE'
                  ? 'Pledge :: Mark more shares as collateral to increase your margin.'
                  : 'Unpledge :: Release pledged shares (needed before you can sell them). Margin drops accordingly.'
              }
              className={`flex-1 h-10 disabled:opacity-30 ${mode === m ? 'bg-purple-600 text-white' : ''}`}
            >
              {m === 'PLEDGE' ? 'Pledge' : 'Unpledge'}
            </button>
          ))}
        </div>
        <div>
          <label className="text-[11px] text-kite-muted">Quantity · max {max}</label>
          <div className="mt-1 flex items-center gap-2">
            <NumberInput
              integer
              min={0}
              max={max}
              value={qty}
              onChange={setQty}
              className="flex-1 h-10 text-center font-mono text-sm rounded border border-gray-300 dark:border-kite-darkBorder bg-gray-50 dark:bg-kite-darkBg focus:outline-none focus:border-purple-500"
            />
            <button onClick={() => setQty(max)} className="h-10 px-3 rounded border border-gray-300 dark:border-kite-darkBorder text-[11px] font-semibold text-purple-600">
              All
            </button>
          </div>
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-kite-muted">{mode === 'PLEDGE' ? 'Margin added' : 'Margin released'}</span>
            <span className="font-mono">{formatINR(changeVal)}</span>
          </div>
          <div className="flex justify-between">
            <span
              className="text-kite-muted"
              data-tip={`Collateral value after haircut :: Pledged qty × LTP × ${COLLATERAL_FACTOR}. This is the margin you can use; it moves with the share price every day.`}
            >
              Collateral after haircut
            </span>
            <span className="font-mono font-semibold text-purple-600 dark:text-purple-300">{formatINR(collateralAfter)}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <button onClick={onClose} className="flex-1 min-h-[42px] rounded border border-gray-300 dark:border-kite-darkBorder font-semibold">
          Cancel
        </button>
        <button
          disabled={qty <= 0}
          onClick={() => onSubmit(target)}
          className="flex-1 min-h-[42px] rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-semibold"
        >
          {mode === 'PLEDGE' ? `Pledge ${qty}` : `Unpledge ${qty}`}
        </button>
      </div>
    </Sheet>
  );
};
