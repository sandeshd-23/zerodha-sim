import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, Download, Edit3, Info, Search, Target, Trash2, XCircle } from 'lucide-react';
import { useSimulatorStore, type OrdersSubTab } from '../store/useSimulatorStore.ts';
import type { GttRule, Order, TradeRecord } from '../types/simulator.ts';
import { formatINR, formatNum, formatPct, getDisplaySymbol, maskContractDisplay } from '../utils/format.ts';
import { AlertsView } from './AlertsView.tsx';
import {
  ActionSheet,
  ConfirmDialog,
  PRODUCT_TIPS,
  STATUS_TIPS,
  downloadCsv,
  isOpenStatus,
  openTicketFromOrder,
  statusPillClass,
} from './OrderDetailsSheet.tsx';

const SideBadge: React.FC<{ side: 'BUY' | 'SELL' }> = ({ side }) => (
  <span
    data-tip={
      side === 'BUY'
        ? 'BUY :: You are buying — opening a long position or closing a short.'
        : 'SELL :: You are selling — exiting shares you own, or short-selling (intraday / F&O only).'
    }
    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
      side === 'BUY' ? 'bg-kite-blue/15 text-kite-blue' : 'bg-kite-orange/15 text-kite-orange'
    }`}
  >
    {side}
  </span>
);

/** Validity / variety / disclosed / tag badges shown next to the instrument. */
const OrderBadges: React.FC<{ o: Order }> = ({ o }) => (
  <>
    {o.variety !== 'REGULAR' && (
      <span
        data-tip="Variety :: AMO = After Market Order (queued until 9:15 AM). CO = Cover Order with compulsory stop-loss. ICEBERG = big order split into smaller hidden legs."
        className="ml-1.5 px-1 rounded bg-gray-100 dark:bg-gray-800 text-[9px] font-semibold text-kite-muted"
      >
        {o.variety}
      </span>
    )}
    {o.validity !== 'DAY' && (
      <span
        data-tip="Validity :: IOC = Immediate-or-Cancel (unfilled part is cancelled instantly). TTL = Time-To-Live: the order auto-cancels after the chosen minutes."
        className="ml-1 px-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] font-semibold"
      >
        {o.validity}
        {o.validity === 'TTL' && o.ttlMinutes ? ` ${o.ttlMinutes}m` : ''}
      </span>
    )}
    {o.disclosedQty ? (
      <span
        data-tip="Disclosed quantity :: Only this many shares are shown in market depth at a time, hiding your full order size."
        className="ml-1 px-1 rounded bg-gray-100 dark:bg-gray-800 text-[9px] font-mono text-kite-muted"
      >
        DQ {o.disclosedQty}
      </span>
    ) : null}
    {o.tag && (
      <span data-tip="Tag :: Your own label for this order." className="ml-1 px-1 rounded bg-kite-blue/10 text-kite-blue text-[9px]">
        #{o.tag}
      </span>
    )}
    {o.attachedGtt && (o.attachedGtt.stoplossPrice || o.attachedGtt.targetPrice) && (
      <span
        data-tip="Stoploss / target attached :: A GTT OCO rule will be created on the holding once this order fills."
        className="ml-1 px-1 rounded bg-emerald-500/15 text-kite-green text-[9px] font-semibold"
      >
        SL/TGT
      </span>
    )}
  </>
);

const TH: React.FC<{ tip?: string; right?: boolean; children?: React.ReactNode }> = ({ tip, right, children }) => (
  <th data-tip={tip} className={`py-2.5 px-2 font-medium ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);

const selectCls =
  'h-10 md:h-8 px-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-xs focus:outline-none focus:border-kite-blue';

export const OrdersView: React.FC = () => {
  const {
    profile,
    quotes,
    derivativePrices,
    instrumentsMap,
    ordersSubTab,
    setOrdersSubTab,
    setOrderDetailsId,
    cancelOrder,
    cancelAllOrders,
    openGttModal,
    cancelGtt,
    selectSymbol,
  } = useSimulatorStore();

  const [search, setSearch] = useState('');
  const [product, setProduct] = useState('ALL');
  const [side, setSide] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [gttSheetId, setGttSheetId] = useState<string | null>(null);
  const [deleteGttId, setDeleteGttId] = useState<string | null>(null);

  useEffect(() => {
    setStatus('ALL');
  }, [ordersSubTab]);

  const data = useMemo(() => {
    if (!profile) return null;
    const open = profile.orders.filter((o) => isOpenStatus(o.status));
    const executed = profile.orders.filter((o) => !isOpenStatus(o.status));
    return { open, executed, trades: profile.trades, gtts: profile.gtts };
  }, [profile]);

  if (!profile || !data) return null;

  const name = (o: { displaySymbol: string; underlyingSymbol: string }) =>
    maskContractDisplay(o.displaySymbol, o.underlyingSymbol, instrumentsMap, profile.blindMode);
  const tradeName = (t: TradeRecord) => maskContractDisplay(t.displaySymbol, t.symbol, instrumentsMap, profile.blindMode);
  const ltpOf = (o: Order) =>
    o.instrumentType === 'EQ' ? quotes[o.underlyingSymbol]?.ltp : derivativePrices[o.contractKey] ?? undefined;
  const q = search.trim().toUpperCase();

  const matchOrder = (o: Order) =>
    (!q || name(o).toUpperCase().includes(q) || (o.tag || '').toUpperCase().includes(q)) &&
    (product === 'ALL' || o.product === product) &&
    (side === 'ALL' || o.side === side) &&
    (status === 'ALL' || o.status === status);

  const openRows = data.open.filter(matchOrder);
  const executedRows = data.executed.filter(matchOrder);
  const tradeRows = data.trades.filter(
    (t) =>
      (!q || tradeName(t).toUpperCase().includes(q)) &&
      (product === 'ALL' || t.product === product) &&
      (side === 'ALL' || t.side === side)
  );
  const gttRows = data.gtts.filter(
    (g) =>
      (!q || getDisplaySymbol(g.symbol, instrumentsMap, profile.blindMode).toUpperCase().includes(q)) &&
      (product === 'ALL' || g.product === product) &&
      (side === 'ALL' || g.side === side) &&
      (status === 'ALL' || g.status === status)
  );

  const activeAlerts = (profile.alerts || []).filter((a) => a.status === 'ACTIVE').length;
  const tabs: Array<{ id: OrdersSubTab; label: string; n: number; tip: string }> = [
    {
      id: 'OPEN',
      label: 'Open',
      n: data.open.length,
      tip: 'Open orders :: Orders waiting to execute — limit orders not yet at your price, stop-loss orders waiting for their trigger, and AMOs queued for the next open. :: Tap one to modify or cancel it.',
    },
    {
      id: 'EXECUTED',
      label: 'Executed',
      n: data.executed.length,
      tip: 'Executed orders :: Orders that are finished — completed (filled), cancelled or rejected. Tap a rejected order to see why.',
    },
    {
      id: 'TRADES',
      label: 'Trades',
      n: data.trades.length,
      tip: 'Trades :: One row per actual fill at the exchange. A single order can create several trades if it fills in parts. :: This is what your contract note is built from.',
    },
    {
      id: 'GTT',
      label: 'GTT',
      n: data.gtts.filter((g) => g.status === 'ACTIVE').length,
      tip: 'GTT (Good Till Triggered) :: Standing instructions valid for up to 1 year: when the LTP hits your trigger, a limit order is placed automatically. :: Use OCO GTTs to set a stop-loss and target on long-term holdings.',
    },
    {
      id: 'ALERTS',
      label: 'Alerts',
      n: activeAlerts,
      tip: 'Alerts :: Price alerts that notify you when a stock crosses a level. Attach a basket to make it an Alert Trigger Order (ATO).',
    },
  ];

  const statusOptions: Record<string, string[]> = {
    OPEN: ['OPEN', 'TRIGGER PENDING', 'AMO REQ RECEIVED'],
    EXECUTED: ['COMPLETE', 'CANCELLED', 'REJECTED'],
    GTT: ['ACTIVE', 'TRIGGERED', 'CANCELLED', 'EXPIRED'],
  };

  const exportExecuted = () => {
    downloadCsv(`orders-${profile.currentDate}.csv`, [
      ['Order ID', 'Placed', 'Updated', 'Side', 'Instrument', 'Exchange', 'Product', 'Variety', 'Order type', 'Validity', 'Qty', 'Filled', 'Price', 'Trigger', 'Avg price', 'Charges', 'Status', 'Message', 'Tag'],
      ...executedRows.map((o) => [
        o.id,
        `${o.placedDate} ${o.placedTime}`,
        o.updatedAt,
        o.side,
        name(o),
        o.exchange,
        o.product,
        o.variety,
        o.orderType,
        o.validity === 'TTL' ? `TTL ${o.ttlMinutes || ''}m` : o.validity,
        o.qty,
        o.filledQty,
        o.price,
        o.triggerPrice,
        o.avgFillPrice,
        o.charges?.totalCharges ?? 0,
        o.status,
        o.statusMessage || '',
        o.tag || '',
      ]),
    ]);
  };
  const exportTrades = () => {
    downloadCsv(`tradebook-${profile.currentDate}.csv`, [
      ['Trade ID', 'Order ID', 'Date', 'Time', 'Side', 'Instrument', 'Exchange', 'Product', 'Qty', 'Price', 'Value', 'Charges', 'Realised P&L'],
      ...tradeRows.map((t) => [
        t.id,
        t.orderId,
        t.date,
        t.time,
        t.side,
        tradeName(t),
        t.exchange,
        t.product,
        t.qty,
        t.price,
        t.turnover,
        t.charges?.totalCharges ?? 0,
        t.realizedPnl ?? '',
      ]),
    ]);
  };

  const cancelOrderObj = cancelId ? profile.orders.find((o) => o.id === cancelId) : undefined;
  const gttSheet = gttSheetId ? profile.gtts.find((g) => g.id === gttSheetId) : undefined;
  const deleteGtt = deleteGttId ? profile.gtts.find((g) => g.id === deleteGttId) : undefined;
  const gttLtp = (g: GttRule) => quotes[g.symbol]?.ltp || g.ltpAtCreation;

  const empty = (title: string, body: React.ReactNode) => (
    <div className="py-14 px-4 text-center space-y-2 max-w-lg mx-auto">
      <Info className="w-7 h-7 mx-auto text-kite-muted" />
      <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</div>
      <p className="text-xs text-kite-muted leading-relaxed">{body}</p>
    </div>
  );

  const filtersActive = Boolean(q) || product !== 'ALL' || side !== 'ALL' || status !== 'ALL';
  const noMatch = <div className="py-12 text-center text-xs text-kite-muted">No results for these filters.</div>;

  /* ---------- Order card (phones) ---------- */
  const OrderCard = ({ o, showLtp }: { o: Order; showLtp: boolean }) => {
    const ltp = ltpOf(o);
    return (
      <button
        onClick={() => setOrderDetailsId(o.id)}
        className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800/50"
      >
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-kite-muted">
            <SideBadge side={o.side} />
            <span className="font-mono">
              {o.filledQty}/{o.qty}
            </span>
          </span>
          <span className={`px-1.5 py-0.5 rounded font-semibold ${statusPillClass(o.status)}`}>{o.status}</span>
        </div>
        <div className="flex items-center justify-between mt-1 gap-2">
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">
            {name(o)}
            <OrderBadges o={o} />
          </span>
          <span className="font-mono text-[12px] shrink-0">
            {o.status === 'COMPLETE' && o.avgFillPrice > 0
              ? formatNum(o.avgFillPrice)
              : o.orderType === 'MARKET' || o.orderType === 'SL-M'
                ? 'MKT'
                : formatNum(o.price)}
            {o.triggerPrice > 0 && <span className="text-kite-muted"> / {formatNum(o.triggerPrice)} trg</span>}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1 text-[10px] text-kite-muted">
          <span>
            {o.exchange} · {o.product} · {o.orderType} · {o.placedTime}
          </span>
          {showLtp && ltp !== undefined ? <span className="font-mono">LTP {formatNum(ltp)}</span> : <span>{o.placedDate}</span>}
        </div>
        {o.status === 'REJECTED' && o.statusMessage && <div className="mt-1 text-[10px] text-kite-red truncate">{o.statusMessage}</div>}
      </button>
    );
  };

  const productTip = 'Product :: CNC = delivery (long term), MIS = intraday with leverage, NRML = F&O overnight, MTF = margin-funded delivery.';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-kite-darkSurface">
      {/* Sub-navigation */}
      <div className="flex items-center border-b border-kite-border dark:border-kite-darkBorder overflow-x-auto no-scrollbar">
        <div className="flex items-center text-xs font-medium md:px-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setOrdersSubTab(t.id)}
              data-tip={t.tip}
              className={`px-3 md:px-4 min-h-[44px] whitespace-nowrap border-b-2 transition-colors ${
                ordersSubTab === t.id
                  ? 'border-kite-orange text-kite-orange font-semibold'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t.label}
              {t.n > 0 && <span className="ml-1 text-[10px] opacity-75">({t.n})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-5">
        {ordersSubTab === 'ALERTS' ? (
          <AlertsView />
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[150px] md:flex-none md:w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-kite-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  data-tip="Search :: Filter by instrument name (or order tag)."
                  className="w-full h-10 md:h-8 pl-8 pr-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-xs focus:outline-none focus:border-kite-blue"
                />
              </div>
              <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectCls} data-tip={productTip} aria-label="Product filter">
                <option value="ALL">All products</option>
                <option value="CNC">CNC</option>
                <option value="MIS">MIS</option>
                <option value="NRML">NRML</option>
                <option value="MTF">MTF</option>
              </select>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value)}
                className={selectCls}
                data-tip="Side filter :: Show only BUY or only SELL entries."
                aria-label="Side filter"
              >
                <option value="ALL">Buy & Sell</option>
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
              {statusOptions[ordersSubTab] && (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={selectCls}
                  data-tip="Status filter :: Narrow the list to a single order / GTT status."
                  aria-label="Status filter"
                >
                  <option value="ALL">All statuses</option>
                  {statusOptions[ordersSubTab].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {ordersSubTab === 'OPEN' && data.open.length > 0 && (
                  <button
                    onClick={() => setConfirmCancelAll(true)}
                    data-tip="Cancel all :: Cancel every pending order (open, trigger-pending and AMO) in one go. Blocked margin is released."
                    className="inline-flex items-center gap-1 h-10 md:h-8 px-3 rounded border border-kite-red/50 text-kite-red text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel all
                  </button>
                )}
                {(ordersSubTab === 'EXECUTED' || ordersSubTab === 'TRADES') && (
                  <button
                    onClick={ordersSubTab === 'EXECUTED' ? exportExecuted : exportTrades}
                    disabled={ordersSubTab === 'EXECUTED' ? executedRows.length === 0 : tradeRows.length === 0}
                    data-tip="Download CSV :: Save the (filtered) list as a spreadsheet file — handy for your own journal or tax workings."
                    className="inline-flex items-center gap-1 h-10 md:h-8 px-3 rounded border border-gray-300 dark:border-kite-darkBorder text-xs font-semibold text-kite-blue disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Download</span> CSV
                  </button>
                )}
                {ordersSubTab === 'GTT' && (
                  <button
                    onClick={() => openGttModal(profile.selectedSymbol || 'RELIANCE', 'BUY')}
                    data-tip="New GTT :: Create a Single trigger (e.g. buy on a dip) or an OCO with stop-loss + target on a holding. Valid for 1 year. :: Shortcut: G"
                    className="inline-flex items-center gap-1 h-10 md:h-8 px-3 rounded bg-kite-blue hover:bg-kite-blueHover text-white text-xs font-semibold"
                  >
                    <Target className="w-3.5 h-3.5" /> New GTT
                  </button>
                )}
              </div>
            </div>

            {/* ---------------- OPEN ---------------- */}
            {ordersSubTab === 'OPEN' &&
              (data.open.length === 0 ? (
                empty(
                  'No pending orders',
                  <>
                    Market orders fill instantly, so they go straight to <strong>Executed</strong>. Orders show here while they wait: a{' '}
                    <strong>LIMIT</strong> buy below the current price, a <strong>stop-loss (SL)</strong> waiting for its trigger, or an{' '}
                    <strong>AMO</strong> placed after market hours. Try a limit order from the watchlist!
                  </>
                )
              ) : openRows.length === 0 ? (
                noMatch
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px]">
                          <TH tip="Time :: When the order was placed (simulated date & IST time).">Time</TH>
                          <TH tip="Type :: BUY or SELL.">Type</TH>
                          <TH tip="Instrument :: The stock or F&O contract. Badges show variety, validity, disclosed qty and your tag.">Instrument</TH>
                          <TH tip={productTip}>Product</TH>
                          <TH right tip="Qty. :: Filled / total quantity. Partially-filled orders stay open for the rest.">
                            Qty.
                          </TH>
                          <TH right tip="LTP :: Last traded price right now — compare it with your price to see how far the order is from filling.">
                            LTP
                          </TH>
                          <TH right tip="Price :: Your limit price (MKT for market orders). 'trg' is the stop-loss trigger price.">Price</TH>
                          <TH tip="Status :: OPEN = waiting in the order book, TRIGGER PENDING = SL waiting for trigger, AMO = queued for next open.">Status</TH>
                          <TH right />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                        {openRows.map((o) => {
                          const ltp = ltpOf(o);
                          return (
                            <tr key={o.id} onClick={() => setOrderDetailsId(o.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                              <td className="py-2.5 px-2 font-mono text-kite-muted whitespace-nowrap">
                                {o.placedTime}
                                <div className="text-[10px]">{o.placedDate}</div>
                              </td>
                              <td className="py-2.5 px-2">
                                <SideBadge side={o.side} />
                              </td>
                              <td className="py-2.5 px-2 font-semibold">
                                {name(o)}
                                <span className="ml-1 text-[10px] font-normal text-kite-muted">{o.exchange}</span>
                                <OrderBadges o={o} />
                              </td>
                              <td className="py-2.5 px-2 font-mono text-[11px]" data-tip={PRODUCT_TIPS[o.product]}>
                                {o.product}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono">
                                {o.filledQty}/{o.qty}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono">{ltp !== undefined ? formatNum(ltp) : '—'}</td>
                              <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                                {o.orderType === 'MARKET' || o.orderType === 'SL-M' ? 'MKT' : formatNum(o.price)}
                                {o.triggerPrice > 0 && <span className="text-kite-muted"> / {formatNum(o.triggerPrice)} trg</span>}
                              </td>
                              <td className="py-2.5 px-2">
                                <span data-tip={STATUS_TIPS[o.status]} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusPillClass(o.status)}`}>
                                  {o.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => openTicketFromOrder(o, 'MODIFY')}
                                  data-tip="Modify :: Change qty, price, trigger or validity of this pending order."
                                  className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-gray-800 text-kite-blue"
                                  aria-label="Modify order"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setCancelId(o.id)}
                                  data-tip="Cancel :: Withdraw this order. Blocked margin is released."
                                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-gray-800 text-kite-red"
                                  aria-label="Cancel order"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
                    {openRows.map((o) => (
                      <OrderCard key={o.id} o={o} showLtp />
                    ))}
                  </div>
                </>
              ))}

            {/* ---------------- EXECUTED ---------------- */}
            {ordersSubTab === 'EXECUTED' &&
              (data.executed.length === 0 ? (
                empty(
                  'No executed orders yet',
                  <>
                    Completed, cancelled and rejected orders appear here. Buy a stock from the watchlist (tap it, then <strong>Buy</strong>) — a
                    market order fills instantly and shows up in this list.
                  </>
                )
              ) : executedRows.length === 0 ? (
                noMatch
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px]">
                          <TH tip="Time :: When the order finished (filled / cancelled / rejected).">Time</TH>
                          <TH tip="Type :: BUY or SELL.">Type</TH>
                          <TH tip="Instrument :: The stock or F&O contract.">Instrument</TH>
                          <TH tip={productTip}>Product</TH>
                          <TH right tip="Qty. :: Filled / ordered quantity.">
                            Qty.
                          </TH>
                          <TH right tip="Avg. price :: The average price at which the order actually executed.">
                            Avg. price
                          </TH>
                          <TH right tip="Charges :: Brokerage + STT + exchange + SEBI + stamp duty + GST (+ DP charges on delivery sells). Tap the order for the full breakdown.">
                            Charges
                          </TH>
                          <TH tip="Status :: COMPLETE (filled), CANCELLED or REJECTED. Tap a rejected order to see the reason.">Status</TH>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                        {executedRows.slice(0, 300).map((o) => (
                          <tr key={o.id} onClick={() => setOrderDetailsId(o.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className="py-2 px-2 font-mono text-[11px] text-kite-muted whitespace-nowrap">{o.updatedAt}</td>
                            <td className="py-2 px-2">
                              <SideBadge side={o.side} />
                            </td>
                            <td className="py-2 px-2 font-semibold">
                              {name(o)}
                              <span className="ml-1 text-[10px] font-normal text-kite-muted">{o.exchange}</span>
                              <OrderBadges o={o} />
                            </td>
                            <td className="py-2 px-2 font-mono text-[11px]" data-tip={PRODUCT_TIPS[o.product]}>
                              {o.product}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">
                              {o.filledQty}/{o.qty}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">{o.avgFillPrice > 0 ? formatNum(o.avgFillPrice) : '—'}</td>
                            <td className="py-2 px-2 text-right font-mono text-kite-muted">
                              {o.status === 'COMPLETE' && o.charges ? formatINR(o.charges.totalCharges) : '—'}
                            </td>
                            <td className="py-2 px-2">
                              <span data-tip={STATUS_TIPS[o.status]} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusPillClass(o.status)}`}>
                                {o.status}
                              </span>
                              {o.status === 'REJECTED' && o.statusMessage && (
                                <div className="text-[10px] text-kite-red mt-0.5 max-w-xs truncate">{o.statusMessage}</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
                    {executedRows.slice(0, 300).map((o) => (
                      <OrderCard key={o.id} o={o} showLtp={false} />
                    ))}
                  </div>
                  {executedRows.length > 300 && (
                    <div className="py-3 text-center text-[11px] text-kite-muted">Showing latest 300 of {executedRows.length}. Download CSV for all.</div>
                  )}
                </>
              ))}

            {/* ---------------- TRADES ---------------- */}
            {ordersSubTab === 'TRADES' &&
              (data.trades.length === 0 ? (
                empty(
                  'No trades yet',
                  <>
                    A <strong>trade</strong> is one actual fill at the exchange. When an order executes (fully or in parts), each fill is listed here
                    with its exact time and price — the same data your broker’s contract note uses.
                  </>
                )
              ) : tradeRows.length === 0 ? (
                noMatch
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px]">
                          <TH tip="Trade time :: Exact date & time of this fill at the exchange.">Time</TH>
                          <TH tip="Type :: BUY or SELL.">Type</TH>
                          <TH tip="Instrument :: The stock or contract traded.">Instrument</TH>
                          <TH tip={productTip}>Product</TH>
                          <TH right tip="Qty. :: Quantity filled in this trade.">
                            Qty.
                          </TH>
                          <TH right tip="Price :: The price this fill executed at.">
                            Price
                          </TH>
                          <TH right tip="Value :: Qty × price (the turnover of this trade).">
                            Value
                          </TH>
                          <TH right tip="Charges :: All statutory charges + brokerage paid for this fill.">
                            Charges
                          </TH>
                          <TH right tip="Realised P&L :: Profit or loss locked in when this trade closed (part of) an existing position, after charges.">
                            Realised
                          </TH>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                        {tradeRows.slice(0, 300).map((t) => (
                          <tr key={t.id} onClick={() => setOrderDetailsId(t.orderId)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className="py-2 px-2 font-mono text-[11px] text-kite-muted whitespace-nowrap">
                              {t.date} {t.time}
                            </td>
                            <td className="py-2 px-2">
                              <SideBadge side={t.side} />
                            </td>
                            <td className="py-2 px-2 font-semibold">
                              {tradeName(t)}
                              <span className="ml-1 text-[10px] font-normal text-kite-muted">{t.exchange}</span>
                            </td>
                            <td className="py-2 px-2 font-mono text-[11px]" data-tip={PRODUCT_TIPS[t.product]}>
                              {t.product}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">{t.qty}</td>
                            <td className="py-2 px-2 text-right font-mono">{formatNum(t.price)}</td>
                            <td className="py-2 px-2 text-right font-mono">{formatINR(t.turnover)}</td>
                            <td className="py-2 px-2 text-right font-mono text-kite-muted">{formatINR(t.charges?.totalCharges ?? 0)}</td>
                            <td
                              className={`py-2 px-2 text-right font-mono ${
                                t.realizedPnl === undefined ? 'text-kite-muted' : t.realizedPnl >= 0 ? 'text-kite-green' : 'text-kite-red'
                              }`}
                            >
                              {t.realizedPnl === undefined ? '—' : formatINR(t.realizedPnl, { signed: true })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
                    {tradeRows.slice(0, 300).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setOrderDetailsId(t.orderId)}
                        className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800/50"
                      >
                        <div className="flex items-center justify-between text-[10px] text-kite-muted">
                          <span className="flex items-center gap-1.5">
                            <SideBadge side={t.side} />
                            <span className="font-mono">{t.qty} qty</span>
                          </span>
                          <span className="font-mono">
                            {t.date} {t.time}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1 gap-2">
                          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">{tradeName(t)}</span>
                          <span className="font-mono text-[12px]">{formatNum(t.price)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-kite-muted">
                          <span>
                            {t.exchange} · {t.product} · Chg {formatINR(t.charges?.totalCharges ?? 0)}
                          </span>
                          {t.realizedPnl !== undefined && (
                            <span className={`font-mono ${t.realizedPnl >= 0 ? 'text-kite-green' : 'text-kite-red'}`}>
                              {formatINR(t.realizedPnl, { signed: true })}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {tradeRows.length > 300 && (
                    <div className="py-3 text-center text-[11px] text-kite-muted">Showing latest 300 of {tradeRows.length}. Download CSV for all.</div>
                  )}
                </>
              ))}

            {/* ---------------- GTT ---------------- */}
            {ordersSubTab === 'GTT' &&
              (data.gtts.length === 0 ? (
                empty(
                  'No GTTs yet',
                  <>
                    A <strong>GTT (Good Till Triggered)</strong> waits up to a year for your price. Use a <strong>Single</strong> GTT to buy on a dip,
                    or an <strong>OCO</strong> (one-cancels-other) GTT to set both a stop-loss and a target on a stock you hold. When the LTP hits a
                    trigger, a limit order is placed automatically.
                  </>
                )
              ) : gttRows.length === 0 ? (
                noMatch
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px]">
                          <TH tip="Created :: Date the GTT was set up. GTTs expire one year after creation.">Created</TH>
                          <TH tip="Instrument :: The stock and whether the GTT will BUY or SELL when triggered.">Instrument</TH>
                          <TH tip="Type :: SINGLE = one trigger price. OCO = two triggers (stop-loss & target); when one fires the other is cancelled.">Type</TH>
                          <TH tip="Trigger :: Price(s) at which the GTT fires and places its limit order. '% away' shows how far the LTP still has to move.">
                            Trigger
                          </TH>
                          <TH right tip="LTP :: Current last traded price.">
                            LTP
                          </TH>
                          <TH right tip="Qty. :: Quantity that will be ordered when the GTT triggers.">
                            Qty.
                          </TH>
                          <TH tip="Expires :: GTTs are valid for 1 year, then expire automatically.">Expires</TH>
                          <TH tip="Status :: ACTIVE (waiting), TRIGGERED (order placed), CANCELLED or EXPIRED.">Status</TH>
                          <TH right />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                        {gttRows.map((g) => {
                          const ltp = gttLtp(g);
                          return (
                            <tr key={g.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                              <td className="py-2.5 px-2 font-mono text-kite-muted">{g.createdAtDate}</td>
                              <td className="py-2.5 px-2 font-semibold">
                                <span className="mr-1.5">
                                  <SideBadge side={g.side} />
                                </span>
                                <span className="cursor-pointer hover:text-kite-blue" onClick={() => void selectSymbol(g.symbol, true)}>
                                  {getDisplaySymbol(g.symbol, instrumentsMap, profile.blindMode)}
                                </span>
                                <span className="ml-1 text-[10px] font-normal text-kite-muted">{g.product}</span>
                              </td>
                              <td className="py-2.5 px-2 font-semibold">{g.type}</td>
                              <td className="py-2.5 px-2 font-mono">
                                {g.legs.map((leg, i) => (
                                  <div key={i} className="whitespace-nowrap">
                                    <span className="text-[10px] text-kite-muted">{leg.label === 'SINGLE' ? '' : `${leg.label}: `}</span>
                                    <strong>{formatNum(leg.triggerPrice)}</strong>
                                    {g.status === 'ACTIVE' && ltp > 0 && (
                                      <span className="ml-1 text-[10px] text-kite-muted">
                                        ({formatPct(((leg.triggerPrice - ltp) / ltp) * 100)})
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono">{formatNum(ltp)}</td>
                              <td className="py-2.5 px-2 text-right font-mono">{g.legs[0]?.qty || 0}</td>
                              <td className="py-2.5 px-2 font-mono text-kite-muted">{g.expiresAtDate}</td>
                              <td className="py-2.5 px-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusPillClass(g.status)}`}>
                                  {g.status}
                                  {g.triggeredLeg ? ` (${g.triggeredLeg})` : ''}
                                </span>
                                {g.triggeredDate && <div className="text-[10px] text-kite-muted mt-0.5">{g.triggeredDate}</div>}
                              </td>
                              <td className="py-2.5 px-2 text-right whitespace-nowrap">
                                {g.status === 'ACTIVE' && (
                                  <>
                                    <button
                                      onClick={() => openGttModal(g.symbol, g.side, g.id)}
                                      data-tip="Modify GTT :: Change trigger prices, limit prices or quantity of this GTT."
                                      className="p-1.5 rounded text-kite-blue hover:bg-blue-50 dark:hover:bg-gray-800"
                                      aria-label="Modify GTT"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteGttId(g.id)}
                                      data-tip="Delete GTT :: Cancel this standing trigger. Nothing will be placed."
                                      className="p-1.5 rounded text-kite-red hover:bg-red-50 dark:hover:bg-gray-800"
                                      aria-label="Delete GTT"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
                    {gttRows.map((g) => {
                      const ltp = gttLtp(g);
                      return (
                        <button
                          key={g.id}
                          onClick={() => setGttSheetId(g.id)}
                          className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800/50"
                        >
                          <div className="flex items-center justify-between text-[10px] text-kite-muted">
                            <span className="flex items-center gap-1.5">
                              <SideBadge side={g.side} />
                              <span>
                                {g.type} · {g.product}
                              </span>
                            </span>
                            <span className={`px-1.5 py-0.5 rounded font-semibold ${statusPillClass(g.status)}`}>{g.status}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1 gap-2">
                            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">
                              {getDisplaySymbol(g.symbol, instrumentsMap, profile.blindMode)}
                            </span>
                            <span className="font-mono text-[12px] text-right">
                              {g.legs.map((l) => formatNum(l.triggerPrice)).join(' / ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[10px] text-kite-muted">
                            <span>
                              Qty {g.legs[0]?.qty || 0} · till {g.expiresAtDate}
                            </span>
                            <span className="font-mono">LTP {formatNum(ltp)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ))}

            {filtersActive && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => {
                    setSearch('');
                    setProduct('ALL');
                    setSide('ALL');
                    setStatus('ALL');
                  }}
                  className="text-[11px] text-kite-blue font-semibold min-h-[36px] px-3"
                >
                  Clear filters
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancelAll}
        title="Cancel all open orders?"
        message={
          <>
            This cancels all <strong>{data.open.length}</strong> pending order(s) — open, trigger-pending and AMO. Margin they blocked is released.
          </>
        }
        confirmLabel="Cancel all"
        onConfirm={() => void cancelAllOrders()}
        onClose={() => setConfirmCancelAll(false)}
      />
      <ConfirmDialog
        open={Boolean(cancelOrderObj)}
        title="Cancel order?"
        message={
          cancelOrderObj ? (
            <>
              Cancel the pending <strong>{cancelOrderObj.side}</strong> order for <strong>{cancelOrderObj.qty - cancelOrderObj.filledQty}</strong> ×{' '}
              <strong>{name(cancelOrderObj)}</strong>?
            </>
          ) : null
        }
        confirmLabel="Cancel order"
        onConfirm={() => cancelOrderObj && void cancelOrder(cancelOrderObj.id)}
        onClose={() => setCancelId(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteGtt)}
        title="Delete GTT?"
        message={
          deleteGtt ? (
            <>
              Delete the {deleteGtt.type} {deleteGtt.side} GTT on <strong>{getDisplaySymbol(deleteGtt.symbol, instrumentsMap, profile.blindMode)}</strong>{' '}
              (trigger {deleteGtt.legs.map((l) => `₹${formatNum(l.triggerPrice)}`).join(' / ')})?
            </>
          ) : null
        }
        confirmLabel="Delete GTT"
        onConfirm={() => deleteGtt && void cancelGtt(deleteGtt.id)}
        onClose={() => setDeleteGttId(null)}
      />
      <ActionSheet
        open={Boolean(gttSheet)}
        onClose={() => setGttSheetId(null)}
        title={gttSheet ? `${gttSheet.side} ${getDisplaySymbol(gttSheet.symbol, instrumentsMap, profile.blindMode)}` : ''}
        subtitle={gttSheet ? `${gttSheet.type} GTT · ${gttSheet.status} · trigger ${gttSheet.legs.map((l) => formatNum(l.triggerPrice)).join(' / ')}` : ''}
        actions={
          gttSheet
            ? [
                {
                  label: 'Modify GTT',
                  icon: <Edit3 className="w-4 h-4" />,
                  tone: 'blue',
                  hidden: gttSheet.status !== 'ACTIVE',
                  onClick: () => openGttModal(gttSheet.symbol, gttSheet.side, gttSheet.id),
                },
                { label: 'View chart', icon: <BarChart2 className="w-4 h-4" />, onClick: () => void selectSymbol(gttSheet.symbol, true) },
                {
                  label: 'Delete GTT',
                  icon: <Trash2 className="w-4 h-4" />,
                  tone: 'red',
                  hidden: gttSheet.status !== 'ACTIVE',
                  onClick: () => setDeleteGttId(gttSheet.id),
                },
              ]
            : []
        }
      />
    </div>
  );
};
