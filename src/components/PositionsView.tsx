import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, BarChart2, Bell, Info, LogOut, Plus, Power } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import type { Position, ProductType } from '../types/simulator.ts';
import { formatINR, formatNum, formatPct, maskContractDisplay } from '../utils/format.ts';
import { ActionSheet, ConfirmDialog, PRODUCT_TIPS, Sheet } from './OrderDetailsSheet.tsx';

type Row = Position & { ltp: number; unrealized: number; pnl: number; chgPct: number };

/** Allowed conversion targets for a position (Kite rules). */
export function allowedConversions(p: Position): ProductType[] {
  if (p.netQty === 0) return [];
  if (p.instrumentType !== 'EQ') {
    if (p.product === 'NRML') return ['MIS'];
    if (p.product === 'MIS') return ['NRML'];
    return [];
  }
  const long = p.netQty > 0;
  switch (p.product) {
    case 'MIS':
      return long ? ['CNC', 'MTF'] : [];
    case 'MTF':
      return ['CNC', 'MIS'];
    case 'CNC':
      return long ? ['MIS'] : [];
    default:
      return [];
  }
}

const CONVERT_TIPS: Record<string, string> = {
  'MIS>CNC': 'MIS → CNC :: Turn today’s intraday buy into a delivery holding. You must pay the full value (the leverage is removed) and the shares arrive in Holdings on T+1.',
  'MIS>MTF': 'MIS → MTF :: Carry an intraday buy overnight using the Margin Trading Facility — you pay part, the broker funds the rest and charges daily interest.',
  'MTF>CNC': 'MTF → CNC :: Pay off the broker-funded part so the shares become fully yours. Interest stops accruing.',
  'MTF>MIS': 'MTF → MIS :: Make it an intraday position again — it will be auto-squared off at 3:20 PM if you don’t exit.',
  'CNC>MIS': 'CNC → MIS :: Turn shares bought today for delivery into an intraday position (only today’s T1 quantity). It must be exited today.',
  'NRML>MIS': 'NRML → MIS :: Make an F&O carry-forward position intraday — lower margin but it is auto-squared off at 3:20 PM.',
  'MIS>NRML': 'MIS → NRML :: Carry an intraday F&O position overnight. Needs the full SPAN + exposure margin in your account.',
};

const TH: React.FC<{ tip?: string; left?: boolean; children?: React.ReactNode }> = ({ tip, left, children }) => (
  <th data-tip={tip} className={`py-2.5 px-2 font-medium ${left ? 'text-left' : 'text-right'}`}>
    {children}
  </th>
);

const pnlCls = (v: number) => (v >= 0 ? 'text-kite-green' : 'text-kite-red');

export const PositionsView: React.FC = () => {
  const {
    profile,
    quotes,
    derivativePrices,
    instrumentsMap,
    selectSymbol,
    convertPosition,
    squareOffPositions,
    openOrderTicket,
    openAlertModal,
  } = useSimulatorStore();

  const [mode, setMode] = useState<'NET' | 'DAY'>('NET');
  const [selected, setSelected] = useState<string[]>([]);
  const [exitId, setExitId] = useState<string | null>(null);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'ALL' | 'SELECTED'>(null);

  const ltpFor = (p: { instrumentType: string; underlyingSymbol: string; contractKey: string }, fallback: number) =>
    p.instrumentType === 'EQ' ? quotes[p.underlyingSymbol]?.ltp || fallback : derivativePrices[p.contractKey] || fallback;

  const calc = useMemo(() => {
    if (!profile) return null;
    let totalUnrealized = 0;
    let totalRealized = 0;
    let totalMargin = 0;
    let totalMtfInterest = 0;
    const open: Row[] = [];
    const closed: Position[] = [];
    for (const p of profile.positions) {
      totalRealized += p.realizedPnl;
      totalMtfInterest += p.mtfInterestAccrued || 0;
      if (p.netQty === 0) {
        closed.push(p);
        continue;
      }
      const ltp = ltpFor(p, p.avgPrice);
      const unrealized = (ltp - p.avgPrice) * p.netQty;
      totalUnrealized += unrealized;
      totalMargin += p.marginBlocked;
      open.push({
        ...p,
        ltp,
        unrealized,
        pnl: unrealized + p.realizedPnl,
        chgPct: p.avgPrice > 0 ? ((ltp - p.avgPrice) / p.avgPrice) * 100 * Math.sign(p.netQty) : 0,
      });
    }

    // Day view: today's activity grouped by instrument + product (from the tradebook)
    const dayMap = new Map<
      string,
      {
        key: string;
        symbol: string;
        displaySymbol: string;
        exchange: string;
        product: ProductType;
        instrumentType: string;
        buyQty: number;
        buyValue: number;
        sellQty: number;
        sellValue: number;
      }
    >();
    for (const t of profile.trades) {
      if (t.date !== profile.currentDate) continue;
      const key = `${t.displaySymbol}|${t.product}`;
      let d = dayMap.get(key);
      if (!d) {
        d = {
          key,
          symbol: t.symbol,
          displaySymbol: t.displaySymbol,
          exchange: t.exchange,
          product: t.product,
          instrumentType: t.instrumentType,
          buyQty: 0,
          buyValue: 0,
          sellQty: 0,
          sellValue: 0,
        };
        dayMap.set(key, d);
      }
      if (t.side === 'BUY') {
        d.buyQty += t.qty;
        d.buyValue += t.qty * t.price;
      } else {
        d.sellQty += t.qty;
        d.sellValue += t.qty * t.price;
      }
    }
    const day = [...dayMap.values()].map((d) => {
      const pos = profile.positions.find((p) => p.displaySymbol === d.displaySymbol && p.product === d.product);
      const ltp =
        d.instrumentType === 'EQ'
          ? quotes[d.symbol]?.ltp || 0
          : (pos && derivativePrices[pos.contractKey]) || (d.buyQty ? d.buyValue / d.buyQty : d.sellValue / Math.max(1, d.sellQty));
      const net = d.buyQty - d.sellQty;
      const dayPnl = d.sellValue - d.buyValue + net * ltp;
      return { ...d, ltp, net, dayPnl, positionId: pos && pos.netQty !== 0 ? pos.id : undefined };
    });
    const dayTotal = day.reduce((s, d) => s + d.dayPnl, 0);
    return { open, closed, day, dayTotal, totalUnrealized, totalRealized, totalMargin, totalMtfInterest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, quotes, derivativePrices]);

  if (!profile || !calc) return null;
  const { open, closed, day } = calc;
  const openPnl = open.reduce((s, p) => s + p.pnl, 0);

  const name = (p: { displaySymbol: string; underlyingSymbol: string }) =>
    maskContractDisplay(p.displaySymbol, p.underlyingSymbol, instrumentsMap, profile.blindMode);

  const exitPos = open.find((p) => p.id === exitId);
  const convertPos = open.find((p) => p.id === convertId);
  const sheetPos = open.find((p) => p.id === sheetId);
  const selectedOpen = selected.filter((id) => open.some((p) => p.id === id));
  const allChecked = open.length > 0 && selectedOpen.length === open.length;

  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const addMore = (p: Row) =>
    openOrderTicket({
      side: p.netQty > 0 ? 'BUY' : 'SELL',
      symbol: p.underlyingSymbol,
      product: p.product,
      instrumentType: p.instrumentType,
      contractKey: p.contractKey,
      displaySymbol: p.displaySymbol,
      strikePrice: p.strikePrice,
      expiryDate: p.expiryDate,
      lotSize: p.lotSize,
      price: p.instrumentType === 'EQ' ? undefined : p.ltp,
    });

  const summary = [
    {
      label: 'M2M (unrealised)',
      value: calc.totalUnrealized,
      signed: true,
      tip: 'M2M / Unrealised P&L :: Mark-to-market profit or loss on positions still open, valued at the current LTP. It becomes real only when you exit. :: For F&O, the exchange settles M2M into your account every day.',
    },
    {
      label: 'Realised P&L',
      value: calc.totalRealized,
      signed: true,
      tip: 'Realised P&L :: Profit or loss already locked in today by closing (part of) positions. This money is final.',
    },
    {
      label: 'Total P&L',
      value: calc.totalUnrealized + calc.totalRealized,
      signed: true,
      tip: 'Total P&L :: Realised + unrealised P&L across all positions (before charges).',
    },
    {
      label: 'Margin blocked',
      value: calc.totalMargin,
      signed: false,
      tip: 'Margin blocked :: Money set aside from your funds to hold these open positions (intraday leverage, F&O SPAN + exposure, or your MTF share). Released when you exit.',
    },
  ];

  const ExitBtn = ({ p }: { p: Row }) => (
    <button
      onClick={() => setExitId(p.id)}
      data-tip="Exit :: Close this position (fully or partially) with a market order in the opposite direction. :: F&O exits are in whole lots."
      className="px-2.5 py-1 min-h-[30px] rounded bg-kite-orange hover:bg-kite-orangeHover text-white font-semibold text-[10px]"
    >
      Exit
    </button>
  );

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-kite-darkSurface">
      <div className="p-3 md:p-5 space-y-4">
        {/* Title row + Day/Net toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="text-sm font-semibold text-gray-800 dark:text-white"
            data-tip="Positions :: Short-term trades: intraday (MIS), margin-funded delivery (MTF) and F&O (NRML/MIS). Delivery shares (CNC) move to Holdings once settled (T+1)."
          >
            Positions ({open.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-gray-300 dark:border-kite-darkBorder overflow-hidden text-[11px] font-semibold">
              {(['NET', 'DAY'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  data-tip={
                    m === 'NET'
                      ? 'Net positions :: Your open positions right now, including those carried from earlier days (MTF / NRML). This is what you can exit or convert.'
                      : "Day positions :: Only today's activity — total quantity bought and sold today and the P&L made on those trades, including delivery (CNC) trades."
                  }
                  className={`px-3 h-9 md:h-8 ${mode === m ? 'bg-kite-blue text-white' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  {m === 'NET' ? 'Net' : 'Day'}
                </button>
              ))}
            </div>
            {mode === 'NET' && selectedOpen.length > 0 && (
              <button
                onClick={() => setConfirm('SELECTED')}
                data-tip="Exit selected :: Square off all the ticked positions at market price in one go."
                className="inline-flex items-center gap-1 h-9 md:h-8 px-3 rounded bg-kite-orange text-white text-xs font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" /> Exit ({selectedOpen.length})
              </button>
            )}
            {mode === 'NET' && open.length > 0 && (
              <button
                onClick={() => setConfirm('ALL')}
                data-tip="Square off all :: Close every open position at market price. :: MIS positions are anyway auto-squared off at 3:20 PM (with a ₹50 + GST fee)."
                className="inline-flex items-center gap-1 h-9 md:h-8 px-3 rounded bg-kite-red hover:opacity-90 text-white text-xs font-semibold"
              >
                <Power className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Square off</span> all
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-3 border-b border-kite-border dark:border-kite-darkBorder">
          {summary.map((s) => (
            <div key={s.label}>
              <div className="text-[11px] text-kite-muted" data-tip={s.tip}>
                {s.label}
              </div>
              <div
                className={`text-base md:text-lg font-mono font-semibold mt-0.5 ${
                  s.signed ? pnlCls(s.value) : 'text-gray-800 dark:text-white'
                }`}
              >
                {formatINR(s.value, { signed: s.signed })}
              </div>
            </div>
          ))}
          {calc.totalMtfInterest > 0 && (
            <div className="col-span-2 md:col-span-4 text-[11px] text-amber-700 dark:text-amber-300">
              <span data-tip="MTF interest :: Daily interest (≈0.04% per day, ~15% a year) charged on the amount the broker funds for your MTF positions. It accrues every calendar day until you exit or convert to CNC.">
                MTF interest accrued: −{formatINR(calc.totalMtfInterest)}
              </span>
            </div>
          )}
        </div>

        {mode === 'NET' ? (
          <>
            {open.length === 0 ? (
              <div className="py-12 text-center space-y-2 max-w-lg mx-auto">
                <Info className="w-7 h-7 mx-auto text-kite-muted" />
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">No open positions</div>
                <p className="text-xs text-kite-muted leading-relaxed">
                  Positions are short-term trades: an <strong>intraday MIS</strong> buy or short-sell (≈5x leverage, must close the same day), an{' '}
                  <strong>MTF</strong> margin-funded buy, or an <strong>F&O</strong> futures/options contract. Long-term delivery (CNC) buys show in{' '}
                  <strong>Holdings</strong> instead. Open MIS positions auto-square-off at 3:20 PM IST.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px]">
                        <th className="py-2.5 px-2 w-8 text-left">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={() => setSelected(allChecked ? [] : open.map((p) => p.id))}
                            aria-label="Select all positions"
                            data-tip="Select all :: Tick positions to exit several at once."
                            className="w-4 h-4 accent-kite-blue"
                          />
                        </th>
                        <TH left tip="Product :: CNC = delivery, MIS = intraday (auto square-off 3:20 PM), NRML = F&O carry-forward, MTF = margin-funded delivery.">
                          Product
                        </TH>
                        <TH left tip="Instrument :: The stock or F&O contract (symbol, expiry, strike, CE/PE). Tap to open its chart.">
                          Instrument
                        </TH>
                        <TH tip="Qty. :: Net quantity. Positive (blue) = long / bought; negative (orange) = short / sold. F&O qty = lots × lot size.">Qty.</TH>
                        <TH tip="Avg. :: Average price of the open quantity.">Avg.</TH>
                        <TH tip="LTP :: Last traded price.">LTP</TH>
                        <TH tip="P&L :: Realised + unrealised profit/loss on this position (before charges).">P&L</TH>
                        <TH tip="Chg. :: % move of the LTP from your average price, in your favour (+) or against you (−).">Chg.</TH>
                        <TH tip="Margin :: Funds blocked for this position.">Margin</TH>
                        <TH />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                      {open.map((p) => {
                        const conv = allowedConversions(p);
                        return (
                          <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className="py-3 px-2">
                              <input
                                type="checkbox"
                                checked={selected.includes(p.id)}
                                onChange={() => toggleSel(p.id)}
                                aria-label="Select position"
                                className="w-4 h-4 accent-kite-blue"
                              />
                            </td>
                            <td className="py-3 px-2">
                              <span data-tip={PRODUCT_TIPS[p.product]} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[10px] font-semibold">
                                {p.product}
                              </span>
                            </td>
                            <td className="py-3 px-2 font-semibold">
                              <span className="cursor-pointer hover:text-kite-blue" onClick={() => void selectSymbol(p.underlyingSymbol, true)}>
                                {name(p)}
                              </span>
                              <span className="ml-1 text-[10px] font-normal text-kite-muted">{p.exchange}</span>
                              {p.mtfInterestAccrued > 0 && (
                                <span
                                  className="ml-1.5 text-[10px] text-amber-600 font-mono"
                                  data-tip="MTF interest :: Interest charged so far on the broker-funded part of this MTF position."
                                >
                                  int −₹{formatNum(p.mtfInterestAccrued, 0)}
                                </span>
                              )}
                              {p.openedDate !== profile.currentDate && (
                                <span
                                  className="ml-1.5 px-1 rounded bg-gray-100 dark:bg-gray-800 text-[9px] text-kite-muted"
                                  data-tip="Carry-forward :: This position was opened on an earlier day and carried overnight."
                                >
                                  CF
                                </span>
                              )}
                            </td>
                            <td className={`py-3 px-2 text-right font-mono font-bold ${p.netQty > 0 ? 'text-kite-blue' : 'text-kite-orange'}`}>
                              {p.netQty > 0 ? `+${p.netQty}` : p.netQty}
                              {p.instrumentType !== 'EQ' && p.lotSize > 1 && (
                                <div className="text-[9px] font-normal text-kite-muted">{Math.abs(p.netQty) / p.lotSize} lot</div>
                              )}
                            </td>
                            <td className="py-3 px-2 text-right font-mono">{formatNum(p.avgPrice)}</td>
                            <td className="py-3 px-2 text-right font-mono">{formatNum(p.ltp)}</td>
                            <td className={`py-3 px-2 text-right font-mono font-semibold ${pnlCls(p.pnl)}`}>{formatINR(p.pnl, { signed: true })}</td>
                            <td className={`py-3 px-2 text-right font-mono ${pnlCls(p.chgPct)}`}>{formatPct(p.chgPct)}</td>
                            <td className="py-3 px-2 text-right font-mono text-kite-muted">{formatINR(p.marginBlocked)}</td>
                            <td className="py-3 px-2 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {conv.length > 0 && (
                                  <button
                                    onClick={() => setConvertId(p.id)}
                                    data-tip="Convert :: Change this position's product (e.g. intraday MIS → delivery CNC) without exiting it."
                                    className="inline-flex items-center gap-1 px-2 py-1 min-h-[30px] rounded border border-gray-300 dark:border-kite-darkBorder hover:border-kite-blue text-[10px] font-semibold"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" /> Convert
                                  </button>
                                )}
                                <ExitBtn p={p} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 dark:border-kite-darkBorder">
                        <td colSpan={6} className="py-2.5 px-2 text-right text-kite-muted">
                          Total
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono font-semibold ${pnlCls(openPnl)}`}>
                          {formatINR(openPnl, { signed: true })}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Phone cards */}
                <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
                  {open.map((p) => (
                    <button key={p.id} onClick={() => setSheetId(p.id)} className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800/50">
                      <div className="flex items-center justify-between text-[10px] text-kite-muted">
                        <span>
                          Qty.{' '}
                          <span className={`font-mono font-semibold ${p.netQty > 0 ? 'text-kite-blue' : 'text-kite-orange'}`}>
                            {p.netQty > 0 ? `+${p.netQty}` : p.netQty}
                          </span>{' '}
                          · Avg. <span className="font-mono">{formatNum(p.avgPrice)}</span>
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono font-semibold">{p.product}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 gap-2">
                        <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">{name(p)}</span>
                        <span className={`font-mono text-[13px] font-semibold ${pnlCls(p.pnl)}`}>{formatINR(p.pnl, { signed: true })}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[10px] text-kite-muted">
                        <span>
                          {p.exchange}
                          {p.mtfInterestAccrued > 0 ? ` · int −₹${formatNum(p.mtfInterestAccrued, 0)}` : ''}
                        </span>
                        <span className="font-mono">
                          LTP {formatNum(p.ltp)} <span className={pnlCls(p.chgPct)}>({formatPct(p.chgPct)})</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Closed today */}
            {closed.length > 0 && (
              <div className="pt-3">
                <h3
                  className="text-xs font-semibold text-kite-muted mb-1.5"
                  data-tip="Closed positions :: Positions you opened and fully exited today. Their profit/loss is realised. They disappear at the end of the trading day."
                >
                  Closed today ({closed.length})
                </h3>
                <div className="divide-y divide-gray-100 dark:divide-kite-darkBorder opacity-80">
                  {closed.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[10px]">{c.product}</span>
                        <span className="truncate font-medium">{name(c)}</span>
                      </span>
                      <span className="text-[10px] text-kite-muted font-mono hidden sm:inline">
                        B {c.buyQty} · S {c.sellQty}
                      </span>
                      <span className={`font-mono font-semibold ${pnlCls(c.realizedPnl)}`}>{formatINR(c.realizedPnl, { signed: true })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ---------------- DAY VIEW ---------------- */
          <>
            {day.length === 0 ? (
              <div className="py-12 text-center space-y-2 max-w-lg mx-auto">
                <Info className="w-7 h-7 mx-auto text-kite-muted" />
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">No trades today</div>
                <p className="text-xs text-kite-muted leading-relaxed">
                  The <strong>Day</strong> view lists everything you bought or sold on {profile.currentDate} — intraday, F&O and delivery — with the
                  day’s buy/sell quantities and the P&L from today’s trades only. Switch to <strong>Net</strong> to manage positions carried from
                  earlier days.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px]">
                        <TH left tip="Product :: The product the trades were done in.">Product</TH>
                        <TH left tip="Instrument :: Stock or contract traded today.">Instrument</TH>
                        <TH tip="Buy qty. :: Total quantity bought today.">Buy qty.</TH>
                        <TH tip="Buy avg. :: Average price of today's buys.">Buy avg.</TH>
                        <TH tip="Sell qty. :: Total quantity sold today.">Sell qty.</TH>
                        <TH tip="Sell avg. :: Average price of today's sells.">Sell avg.</TH>
                        <TH tip="Net qty. :: Bought − sold today. Non-zero means today's trades left a position open.">Net</TH>
                        <TH tip="LTP :: Last traded price.">LTP</TH>
                        <TH tip="Day P&L :: Sell value − buy value + (net qty × LTP). Profit from today's trades only.">Day P&L</TH>
                        <TH />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                      {day.map((d) => (
                        <tr key={d.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                          <td className="py-2.5 px-2">
                            <span data-tip={PRODUCT_TIPS[d.product]} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[10px] font-semibold">
                              {d.product}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 font-semibold">
                            <span className="cursor-pointer hover:text-kite-blue" onClick={() => void selectSymbol(d.symbol, true)}>
                              {maskContractDisplay(d.displaySymbol, d.symbol, instrumentsMap, profile.blindMode)}
                            </span>
                            <span className="ml-1 text-[10px] font-normal text-kite-muted">{d.exchange}</span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-kite-blue">{d.buyQty || '—'}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{d.buyQty ? formatNum(d.buyValue / d.buyQty) : '—'}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-kite-orange">{d.sellQty || '—'}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{d.sellQty ? formatNum(d.sellValue / d.sellQty) : '—'}</td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold">{d.net > 0 ? `+${d.net}` : d.net}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{formatNum(d.ltp)}</td>
                          <td className={`py-2.5 px-2 text-right font-mono font-semibold ${pnlCls(d.dayPnl)}`}>{formatINR(d.dayPnl, { signed: true })}</td>
                          <td className="py-2.5 px-2 text-right">
                            {d.positionId && (
                              <button
                                onClick={() => setExitId(d.positionId!)}
                                data-tip="Exit :: Close the open position created by today's trades."
                                className="px-2.5 py-1 min-h-[30px] rounded bg-kite-orange text-white font-semibold text-[10px]"
                              >
                                Exit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 dark:border-kite-darkBorder">
                        <td colSpan={8} className="py-2.5 px-2 text-right text-kite-muted">
                          Day total
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono font-semibold ${pnlCls(calc.dayTotal)}`}>{formatINR(calc.dayTotal, { signed: true })}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
                  {day.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => (d.positionId ? setSheetId(d.positionId) : void selectSymbol(d.symbol, true))}
                      className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800/50"
                    >
                      <div className="flex items-center justify-between text-[10px] text-kite-muted">
                        <span className="font-mono">
                          <span className="text-kite-blue">B {d.buyQty}</span>
                          {d.buyQty ? ` @ ${formatNum(d.buyValue / d.buyQty)}` : ''} · <span className="text-kite-orange">S {d.sellQty}</span>
                          {d.sellQty ? ` @ ${formatNum(d.sellValue / d.sellQty)}` : ''}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono font-semibold">{d.product}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 gap-2">
                        <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">
                          {maskContractDisplay(d.displaySymbol, d.symbol, instrumentsMap, profile.blindMode)}
                        </span>
                        <span className={`font-mono text-[13px] font-semibold ${pnlCls(d.dayPnl)}`}>{formatINR(d.dayPnl, { signed: true })}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[10px] text-kite-muted">
                        <span>Net {d.net > 0 ? `+${d.net}` : d.net}</span>
                        <span className="font-mono">LTP {formatNum(d.ltp)}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="md:hidden flex justify-between text-xs pt-1">
                  <span className="text-kite-muted">Day total</span>
                  <span className={`font-mono font-semibold ${pnlCls(calc.dayTotal)}`}>{formatINR(calc.dayTotal, { signed: true })}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Phone action sheet */}
      <ActionSheet
        open={Boolean(sheetPos)}
        onClose={() => setSheetId(null)}
        title={sheetPos ? name(sheetPos) : ''}
        subtitle={
          sheetPos
            ? `${sheetPos.product} · Qty ${sheetPos.netQty > 0 ? '+' : ''}${sheetPos.netQty} · Avg ${formatNum(sheetPos.avgPrice)} · LTP ${formatNum(sheetPos.ltp)}`
            : ''
        }
        actions={
          sheetPos
            ? [
                { label: 'Exit', icon: <LogOut className="w-4 h-4" />, tone: 'orange', onClick: () => setExitId(sheetPos.id) },
                {
                  label: sheetPos.netQty > 0 ? 'Add (buy more)' : 'Add (sell more)',
                  icon: <Plus className="w-4 h-4" />,
                  tone: 'blue',
                  onClick: () => addMore(sheetPos),
                },
                {
                  label: 'Convert',
                  icon: <ArrowLeftRight className="w-4 h-4" />,
                  hidden: allowedConversions(sheetPos).length === 0,
                  onClick: () => setConvertId(sheetPos.id),
                },
                { label: 'Create alert', icon: <Bell className="w-4 h-4" />, onClick: () => openAlertModal(sheetPos.underlyingSymbol) },
                { label: 'View chart', icon: <BarChart2 className="w-4 h-4" />, onClick: () => void selectSymbol(sheetPos.underlyingSymbol, true) },
              ]
            : []
        }
      />

      {exitPos && (
        <ExitDialog
          key={exitPos.id}
          p={exitPos}
          label={name(exitPos)}
          onClose={() => setExitId(null)}
          onExit={(qty) => {
            setExitId(null);
            setSelected((s) => s.filter((x) => x !== exitPos.id));
            void squareOffPositions(exitPos.id, qty < Math.abs(exitPos.netQty) ? qty : undefined);
          }}
        />
      )}
      {convertPos && (
        <ConvertDialog
          key={convertPos.id}
          p={convertPos}
          label={name(convertPos)}
          onClose={() => setConvertId(null)}
          onConvert={(to, qty) => {
            setConvertId(null);
            void convertPosition(convertPos.id, to, qty < Math.abs(convertPos.netQty) ? qty : undefined);
          }}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'ALL' ? 'Square off all positions?' : `Exit ${selectedOpen.length} position(s)?`}
        message={
          confirm === 'ALL' ? (
            <>
              All <strong>{open.length}</strong> open position(s) will be closed with market orders. Unrealised P&L of{' '}
              <strong className={pnlCls(calc.totalUnrealized)}>{formatINR(calc.totalUnrealized, { signed: true })}</strong> becomes realised.
            </>
          ) : (
            <>The selected positions will be closed with market orders at the current price.</>
          )
        }
        confirmLabel={confirm === 'ALL' ? 'Square off all' : 'Exit selected'}
        tone="orange"
        onConfirm={() => {
          if (confirm === 'ALL') void squareOffPositions();
          else void squareOffPositions(selectedOpen);
          setSelected([]);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Quantity helpers: equity in shares, F&O in lots                     */
/* ------------------------------------------------------------------ */

const QtyInput: React.FC<{ p: Row; qty: number; setQty: (n: number) => void; max: number }> = ({ p, qty, setQty, max }) => {
  const isFno = p.instrumentType !== 'EQ' && p.lotSize > 1;
  const step = isFno ? p.lotSize : 1;
  const units = isFno ? qty / p.lotSize : qty;
  const maxUnits = isFno ? max / p.lotSize : max;
  return (
    <div>
      <label
        className="text-[11px] text-kite-muted"
        data-tip={
          isFno
            ? `Lots :: F&O trades in whole lots. 1 lot = ${p.lotSize} units, so the quantity is lots × ${p.lotSize}.`
            : 'Quantity :: Number of shares. Defaults to the full position; reduce it for a partial exit/convert.'
        }
      >
        {isFno ? `Lots (1 lot = ${p.lotSize})` : 'Quantity'} · max {maxUnits}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => setQty(Math.max(step, qty - step))}
          className="w-10 h-10 rounded border border-gray-300 dark:border-kite-darkBorder text-base font-semibold"
          aria-label="Decrease"
        >
          −
        </button>
        <input
          inputMode="numeric"
          value={units}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0);
            setQty(Math.min(max, Math.max(0, n * step)));
          }}
          className="flex-1 h-10 text-center font-mono text-sm rounded border border-gray-300 dark:border-kite-darkBorder bg-gray-50 dark:bg-kite-darkBg focus:outline-none focus:border-kite-blue"
        />
        <button
          onClick={() => setQty(Math.min(max, qty + step))}
          className="w-10 h-10 rounded border border-gray-300 dark:border-kite-darkBorder text-base font-semibold"
          aria-label="Increase"
        >
          +
        </button>
        <button onClick={() => setQty(max)} className="h-10 px-2.5 rounded border border-gray-300 dark:border-kite-darkBorder text-[11px] font-semibold text-kite-blue">
          All
        </button>
      </div>
      {isFno && <div className="mt-1 text-[10px] text-kite-muted font-mono">= {qty} qty</div>}
    </div>
  );
};

const ExitDialog: React.FC<{ p: Row; label: string; onClose: () => void; onExit: (qty: number) => void }> = ({ p, label, onClose, onExit }) => {
  const max = Math.abs(p.netQty);
  const [qty, setQty] = useState(max);
  const estPnl = (p.ltp - p.avgPrice) * qty * Math.sign(p.netQty);
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Exit ${label}`}
      subtitle={`${p.product} · ${p.netQty > 0 ? 'SELL' : 'BUY'} at market · LTP ₹${formatNum(p.ltp)}`}
      maxW="md:max-w-sm"
    >
      <div className="px-4 py-3 space-y-3">
        <QtyInput p={p} qty={qty} setQty={setQty} max={max} />
        <div className="flex justify-between text-[11px]">
          <span className="text-kite-muted" data-tip="Estimated P&L :: Roughly what you lock in at the current LTP, before charges. The actual fill price can differ slightly.">
            Est. P&L on exit
          </span>
          <span className={`font-mono font-semibold ${pnlCls(estPnl)}`}>{formatINR(estPnl, { signed: true })}</span>
        </div>
        {qty < max && qty > 0 && (
          <p className="text-[11px] text-kite-muted">
            Partial exit — {max - qty} {p.instrumentType !== 'EQ' ? 'qty' : 'shares'} stay open.
          </p>
        )}
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <button onClick={onClose} className="flex-1 min-h-[42px] rounded border border-gray-300 dark:border-kite-darkBorder font-semibold">
          Cancel
        </button>
        <button
          disabled={qty <= 0}
          onClick={() => onExit(qty)}
          className="flex-1 min-h-[42px] rounded bg-kite-orange hover:bg-kite-orangeHover disabled:opacity-40 text-white font-semibold"
        >
          Exit {qty < max ? 'partially' : ''}
        </button>
      </div>
    </Sheet>
  );
};

const ConvertDialog: React.FC<{
  p: Row;
  label: string;
  onClose: () => void;
  onConvert: (to: ProductType, qty: number) => void;
}> = ({ p, label, onClose, onConvert }) => {
  const targets = allowedConversions(p);
  const max = Math.abs(p.netQty);
  const [to, setTo] = useState<ProductType>(targets[0]);
  const [qty, setQty] = useState(max);
  const value = qty * p.avgPrice;
  return (
    <Sheet open onClose={onClose} title={`Convert ${label}`} subtitle={`Current product: ${p.product}`} maxW="md:max-w-sm">
      <div className="px-4 py-3 space-y-3">
        <div>
          <div
            className="text-[11px] text-kite-muted mb-1"
            data-tip="Convert position :: Changes the product type of an open position without placing a new trade. No brokerage is charged, but margin requirements change."
          >
            Convert to
          </div>
          <div className="flex flex-wrap gap-2">
            {targets.map((t) => (
              <button
                key={t}
                onClick={() => setTo(t)}
                data-tip={CONVERT_TIPS[`${p.product}>${t}`] || PRODUCT_TIPS[t]}
                className={`min-h-[40px] px-4 rounded border text-xs font-semibold ${
                  to === t ? 'border-kite-blue bg-kite-blue/10 text-kite-blue' : 'border-gray-300 dark:border-kite-darkBorder'
                }`}
              >
                {p.product} → {t}
              </button>
            ))}
          </div>
          {CONVERT_TIPS[`${p.product}>${to}`] && (
            <p className="mt-2 text-[11px] text-kite-muted leading-snug">{CONVERT_TIPS[`${p.product}>${to}`].split('::')[1]?.trim()}</p>
          )}
        </div>
        <QtyInput p={p} qty={qty} setQty={setQty} max={max} />
        {to === 'CNC' && (
          <div className="flex justify-between text-[11px]">
            <span className="text-kite-muted" data-tip="Funds needed :: Delivery (CNC) needs the full value in cash; the leverage you had is removed.">
              Approx. funds needed
            </span>
            <span className="font-mono font-semibold">{formatINR(value)}</span>
          </div>
        )}
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <button onClick={onClose} className="flex-1 min-h-[42px] rounded border border-gray-300 dark:border-kite-darkBorder font-semibold">
          Cancel
        </button>
        <button
          disabled={qty <= 0 || !to}
          onClick={() => onConvert(to, qty)}
          className="flex-1 min-h-[42px] rounded bg-kite-blue hover:bg-kite-blueHover disabled:opacity-40 text-white font-semibold"
        >
          Convert
        </button>
      </div>
    </Sheet>
  );
};
