import React from 'react';
import { BarChart2, Edit3, ExternalLink, RotateCcw, X, XCircle } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import type { Order, OrderStatus } from '../types/simulator.ts';
import { formatINR, formatNum, maskContractDisplay } from '../utils/format.ts';

/* ------------------------------------------------------------------ */
/* Shared UI primitives for the Orders / Positions / Holdings views    */
/* ------------------------------------------------------------------ */

/** Kite-style sheet: bottom sheet on phones, centred modal on desktop. */
export const Sheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Tailwind max-width class used from `md` upwards. */
  maxW?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxW = 'md:max-w-md', children }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/50 md:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxW} rounded-t-xl md:rounded-md max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)] bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl text-xs text-gray-700 dark:text-gray-200`}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        {(title || subtitle) && (
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 pt-3 pb-2.5 bg-white dark:bg-kite-darkSurface border-b border-gray-100 dark:border-kite-darkBorder">
            <div className="min-w-0">
              {title && <div className="text-sm font-semibold text-gray-800 dark:text-white truncate">{title}</div>}
              {subtitle && <div className="text-[11px] text-kite-muted mt-0.5">{subtitle}</div>}
            </div>
            <button
              onClick={onClose}
              className="-mr-2 -mt-1 w-10 h-10 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export interface SheetAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  tip?: string;
  tone?: 'default' | 'blue' | 'orange' | 'red' | 'green';
  hidden?: boolean;
}

const TONE: Record<NonNullable<SheetAction['tone']>, string> = {
  default: 'text-gray-700 dark:text-gray-200',
  blue: 'text-kite-blue',
  orange: 'text-kite-orange',
  red: 'text-kite-red',
  green: 'text-kite-green',
};

/** Kite Android-style action sheet (tap a row/card → list of actions). */
export const ActionSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  header?: React.ReactNode;
  actions: SheetAction[];
}> = ({ open, onClose, title, subtitle, header, actions }) => (
  <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle} maxW="md:max-w-sm">
    {header}
    <div className="py-1">
      {actions
        .filter((a) => !a.hidden)
        .map((a) => (
          <button
            key={a.label}
            data-tip={a.tip}
            onClick={() => {
              onClose();
              a.onClick();
            }}
            className={`w-full min-h-[46px] flex items-center gap-3 px-4 text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-800/50 ${TONE[a.tone || 'default']}`}
          >
            <span className="w-5 flex justify-center opacity-90">{a.icon}</span>
            <span>{a.label}</span>
          </button>
        ))}
    </div>
  </Sheet>
);

/** Small confirmation dialog (Kite asks before cancelling / exiting). */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  tone?: 'red' | 'blue' | 'orange';
  onConfirm: () => void;
  onClose: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirm', tone = 'red', onConfirm, onClose }) => (
  <Sheet open={open} onClose={onClose} title={title} maxW="md:max-w-sm">
    <div className="px-4 py-3 text-[12px] leading-relaxed text-gray-600 dark:text-gray-300">{message}</div>
    <div className="flex gap-2 px-4 pb-4">
      <button
        onClick={onClose}
        className="flex-1 min-h-[42px] rounded border border-gray-300 dark:border-kite-darkBorder font-semibold"
      >
        Cancel
      </button>
      <button
        onClick={() => {
          onClose();
          onConfirm();
        }}
        className={`flex-1 min-h-[42px] rounded text-white font-semibold ${
          tone === 'red' ? 'bg-kite-red' : tone === 'orange' ? 'bg-kite-orange' : 'bg-kite-blue'
        } hover:opacity-90`}
      >
        {confirmLabel}
      </button>
    </div>
  </Sheet>
);

/** Downloads rows as a CSV file (Blob + <a download>). */
export function downloadCsv(filename: string, rows: Array<Array<string | number | undefined | null>>) {
  const esc = (v: string | number | undefined | null) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const isOpenStatus = (s: OrderStatus) => s === 'OPEN' || s === 'TRIGGER PENDING' || s === 'AMO REQ RECEIVED';

export function statusPillClass(status: string): string {
  switch (status) {
    case 'COMPLETE':
    case 'TRIGGERED':
      return 'bg-emerald-500/15 text-kite-green';
    case 'REJECTED':
      return 'bg-red-500/15 text-kite-red';
    case 'CANCELLED':
    case 'EXPIRED':
    case 'DISABLED':
      return 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400';
    case 'ACTIVE':
      return 'bg-kite-blue/15 text-kite-blue';
    default:
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
}

export const STATUS_TIPS: Record<string, string> = {
  OPEN: 'OPEN :: The order is sitting in the exchange order book waiting for the market to reach your limit price. :: You can still Modify or Cancel it.',
  'TRIGGER PENDING':
    'TRIGGER PENDING :: A stop-loss order waiting for its trigger price. Once the market touches the trigger, it is sent to the exchange. :: Used to cap losses automatically.',
  'AMO REQ RECEIVED':
    'AMO received :: After-Market Order stored by the broker. It goes to the exchange when the market opens at 9:15 AM. :: You can cancel it any time before the open.',
  COMPLETE: 'COMPLETE :: The order was fully executed (filled). The trade now shows in Trades and in your Positions / Holdings.',
  CANCELLED: 'CANCELLED :: The order was cancelled (by you, by validity expiry like IOC/TTL, or at the end of the day) before it fully filled.',
  REJECTED:
    'REJECTED :: The broker or exchange refused the order — e.g. not enough margin, price outside the circuit limit, or wrong quantity. :: Tap the order to read the exact reason.',
};

export const PRODUCT_TIPS: Record<string, string> = {
  CNC: 'CNC (Cash & Carry) :: Delivery product for long-term investing. Bought shares settle into your Demat on T+1 and appear in Holdings. :: No leverage — you pay the full value.',
  MIS: 'MIS (Margin Intraday Squareoff) :: Intraday product with leverage (≈5x on equity). Must be closed the same day — Zerodha auto-squares off around 3:20 PM. :: A small auto square-off fee applies if you forget.',
  NRML: 'NRML (Normal) :: F&O product to carry futures/options overnight until expiry. Needs full SPAN + exposure margin.',
  MTF: 'MTF (Margin Trading Facility) :: Buy delivery stocks paying only part of the value; the broker funds the rest and charges daily interest (≈0.04%/day). :: Interest keeps accruing until you sell or convert to CNC.',
};

/** Build openOrderTicket params from an existing order. */
export function ticketParamsFromOrder(o: Order) {
  return {
    side: o.side,
    symbol: o.underlyingSymbol,
    product: o.product,
    orderType: o.orderType,
    qty: o.qty,
    price: o.orderType === 'MARKET' || o.orderType === 'SL-M' ? undefined : o.price,
    instrumentType: o.instrumentType,
    contractKey: o.contractKey,
    displaySymbol: o.displaySymbol,
    strikePrice: o.strikePrice,
    expiryDate: o.expiryDate,
    lotSize: o.lotSize,
  };
}

/** Opens the order window pre-filled from `o` (modify keeps the id; repeat places a fresh order). */
export function openTicketFromOrder(o: Order, mode: 'MODIFY' | 'REPEAT') {
  const st = useSimulatorStore.getState();
  const params = ticketParamsFromOrder(o);
  if (params.price === undefined && o.instrumentType !== 'EQ') {
    params.price = st.derivativePrices[o.contractKey] || o.avgFillPrice || o.price || undefined;
  }
  st.openOrderTicket({ ...params, modifyOrderId: mode === 'MODIFY' ? o.id : undefined });
  const patch: Parameters<typeof st.updateOrderTicket>[0] = {
    validity: o.validity,
    disclosedQty: o.disclosedQty || 0,
    ttlMinutes: o.ttlMinutes || 30,
  };
  if (o.triggerPrice > 0) patch.triggerPrice = o.triggerPrice;
  if (mode === 'REPEAT') {
    patch.variety = o.variety;
    patch.tag = o.tag || '';
    if (o.icebergLegs) patch.icebergLegs = o.icebergLegs;
    if (o.stopLossTrigger) patch.stopLossTrigger = o.stopLossTrigger;
    if (o.marketProtectionPct) patch.marketProtectionPct = o.marketProtectionPct;
  }
  st.updateOrderTicket(patch);
}

/* ------------------------------------------------------------------ */
/* Order details sheet                                                 */
/* ------------------------------------------------------------------ */

const Field: React.FC<{ label: string; tip?: string; children: React.ReactNode; mono?: boolean }> = ({
  label,
  tip,
  children,
  mono = true,
}) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-kite-darkBorder/70">
    <span className="text-kite-muted shrink-0" data-tip={tip}>
      {label}
    </span>
    <span className={`text-right text-gray-800 dark:text-gray-100 ${mono ? 'font-mono' : ''}`}>{children}</span>
  </div>
);

export const OrderDetailsSheet: React.FC = () => {
  const {
    profile,
    orderDetailsId,
    setOrderDetailsId,
    instrumentsMap,
    quotes,
    derivativePrices,
    cancelOrder,
    selectSymbol,
    setActiveTab,
    setOrdersSubTab,
  } = useSimulatorStore();
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const order = profile && orderDetailsId ? profile.orders.find((o) => o.id === orderDetailsId) : undefined;
  if (!profile || !order) return null;

  const close = () => setOrderDetailsId(null);
  const name = maskContractDisplay(order.displaySymbol, order.underlyingSymbol, instrumentsMap, profile.blindMode);
  const isFno = order.instrumentType !== 'EQ';
  const ltp = isFno ? derivativePrices[order.contractKey] : quotes[order.underlyingSymbol]?.ltp;
  const open = isOpenStatus(order.status);
  const fills = profile.trades.filter((t) => t.orderId === order.id);
  const c = order.charges;
  const gtt = order.attachedGtt?.createdGttId ? profile.gtts.find((g) => g.id === order.attachedGtt?.createdGttId) : undefined;

  const timeline =
    order.history && order.history.length > 0
      ? order.history
      : [
          { date: order.placedDate, time: order.placedTime, status: 'PUT ORDER REQ RECEIVED', note: 'Order received by the broker (OMS)' },
          ...(order.status !== 'AMO REQ RECEIVED'
            ? [
                {
                  date: order.updatedAt.split(' ')[0] || order.placedDate,
                  time: order.updatedAt.split(' ')[1] || order.placedTime,
                  status: order.status,
                  note: order.statusMessage,
                },
              ]
            : []),
        ];

  const qtyLabel = isFno
    ? `${order.filledQty} / ${order.qty} (${formatNum(order.qty / Math.max(1, order.lotSize), 0)} lot${order.qty / Math.max(1, order.lotSize) === 1 ? '' : 's'})`
    : `${order.filledQty} / ${order.qty}`;

  return (
    <>
      <Sheet
        open
        onClose={close}
        maxW="md:max-w-lg"
        title={
          <span className="flex items-center gap-2">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                order.side === 'BUY' ? 'bg-kite-blue/15 text-kite-blue' : 'bg-kite-orange/15 text-kite-orange'
              }`}
            >
              {order.side}
            </span>
            <span className="truncate">{name}</span>
            <span className="text-[10px] font-normal text-kite-muted">{order.exchange}</span>
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2">
            <span
              data-tip={STATUS_TIPS[order.status]}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusPillClass(order.status)}`}
            >
              {order.status}
            </span>
            {ltp !== undefined && (
              <span data-tip="LTP :: Last Traded Price — the most recent price at which this instrument traded.">
                LTP ₹{formatNum(ltp)}
              </span>
            )}
          </span>
        }
      >
        <div className="px-4 pb-3">
          {order.statusMessage && (
            <div
              className={`mt-3 p-2.5 rounded text-[11px] leading-snug ${
                order.status === 'REJECTED'
                  ? 'bg-red-500/10 text-kite-red'
                  : 'bg-gray-100 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300'
              }`}
              data-tip="Status message :: The reason sent back by the broker / exchange for the current status — especially useful for rejections (e.g. insufficient funds, circuit limit)."
            >
              {order.statusMessage}
            </div>
          )}

          {/* Main fields */}
          <div className="mt-2 grid md:grid-cols-2 md:gap-x-6">
            <Field label="Quantity" tip="Filled / total quantity :: How many shares (or F&O units) have executed out of what you asked for. A partially filled order stays open for the rest. :: F&O quantity is always a multiple of the lot size.">
              {qtyLabel}
            </Field>
            <Field label="Price" tip="Order price :: Your limit price. MARKET orders have no price — they fill at the best available price.">
              {order.orderType === 'MARKET' || order.orderType === 'SL-M' ? 'MKT' : `₹${formatNum(order.price)}`}
            </Field>
            <Field label="Avg. price" tip="Average fill price :: The volume-weighted price at which your order actually executed. Can differ from your limit price (only better, never worse).">
              {order.avgFillPrice > 0 ? `₹${formatNum(order.avgFillPrice)}` : '—'}
            </Field>
            <Field label="Trigger price" tip="Trigger price :: For stop-loss (SL / SL-M) orders: the order is sent to the exchange only when the LTP touches this price. :: A buy SL triggers when price rises to it, a sell SL when price falls to it.">
              {order.triggerPrice > 0 ? `₹${formatNum(order.triggerPrice)}` : '—'}
            </Field>
            <Field label="Order type" mono={false} tip="Order type :: MARKET = fill now at best price. LIMIT = only at your price or better. SL = stop-loss limit. SL-M = stop-loss market.">
              {order.orderType}
            </Field>
            <Field label="Product" mono={false} tip={PRODUCT_TIPS[order.product]}>
              {order.product}
            </Field>
            <Field label="Variety" mono={false} tip="Variety :: REGULAR = normal order. AMO = After Market Order, queued until 9:15 AM. CO = Cover Order with a compulsory stop-loss. ICEBERG = a big order split into smaller legs to hide its size.">
              {order.variety}
              {order.variety === 'ICEBERG' && order.icebergLegs ? ` (${order.icebergCurrentLeg || 1}/${order.icebergLegs} legs)` : ''}
            </Field>
            <Field label="Validity" mono={false} tip="Validity :: DAY = stays open till market close. IOC = Immediate-or-Cancel: whatever doesn't fill instantly is cancelled. TTL = Time-To-Live: auto-cancels after the minutes you chose.">
              {order.validity}
              {order.validity === 'TTL' && order.ttlMinutes ? ` · ${order.ttlMinutes} min` : ''}
            </Field>
            {order.disclosedQty ? (
              <Field label="Disclosed qty." tip="Disclosed quantity :: Only this much of your order is shown in market depth at a time (min 10% of qty) so big orders don't move the market. Equity only.">
                {order.disclosedQty}
              </Field>
            ) : null}
            {order.stopLossTrigger ? (
              <Field label="CO stoploss" tip="Cover order stop-loss :: The compulsory stop-loss leg of a Cover Order. It is placed automatically once the main order fills.">
                ₹{formatNum(order.stopLossTrigger)}
              </Field>
            ) : null}
            {order.marketProtectionPct ? (
              <Field label="Market protection" tip="Market protection :: Rejects a market order if it would fill more than this % away from the LTP — a safety net against thin order books.">
                {order.marketProtectionPct}%
              </Field>
            ) : null}
            {order.tag ? (
              <Field label="Tag" mono={false} tip="Tag :: Your own label for this order (e.g. 'swing', 'dividend-play') so you can filter and review orders later.">
                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px]">{order.tag}</span>
              </Field>
            ) : null}
            <Field label="Margin blocked" tip="Margin blocked :: Money set aside from your available funds while this order/position is active. Released when it is cancelled or closed.">
              {formatINR(order.marginBlocked)}
            </Field>
            <Field label="Placed at" tip="Placed at :: The simulated date and exchange time (IST) when you placed the order.">
              {order.placedDate} {order.placedTime}
            </Field>
            <Field label="Order ID" tip="Order ID :: Unique id the broker gives each order. Quote it if you ever raise a support ticket.">
              <span className="text-[10px] break-all">{order.id}</span>
            </Field>
          </div>

          {/* Attached stoploss / target (GTT) */}
          {order.attachedGtt && (order.attachedGtt.stoplossPrice || order.attachedGtt.targetPrice) && (
            <div className="mt-4">
              <div
                className="text-[11px] font-semibold text-kite-muted uppercase tracking-wide mb-1"
                data-tip="Stoploss & target :: Kite lets you attach a stop-loss and/or target to a buy order. When the order fills, they are created as a GTT OCO (one-cancels-other) rule on your holding. :: When one leg fires, the other is cancelled automatically."
              >
                Stoploss / target
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {order.attachedGtt.stoplossPrice ? (
                  <span className="px-2 py-1 rounded bg-red-500/10 text-kite-red font-mono">SL ₹{formatNum(order.attachedGtt.stoplossPrice)}</span>
                ) : null}
                {order.attachedGtt.targetPrice ? (
                  <span className="px-2 py-1 rounded bg-emerald-500/10 text-kite-green font-mono">
                    Target ₹{formatNum(order.attachedGtt.targetPrice)}
                  </span>
                ) : null}
                {order.attachedGtt.createdGttId ? (
                  <button
                    onClick={() => {
                      close();
                      setActiveTab('ORDERS');
                      setOrdersSubTab('GTT');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 min-h-[32px] rounded border border-kite-blue/40 text-kite-blue font-semibold"
                    data-tip="View GTT :: Jump to the GTT tab to see or modify the stop-loss/target rule created from this order."
                  >
                    GTT {gtt ? `· ${gtt.status}` : ''} <ExternalLink className="w-3 h-3" />
                  </button>
                ) : (
                  <span className="text-kite-muted">GTT is created once the order is filled.</span>
                )}
              </div>
            </div>
          )}

          {/* Charges */}
          {c && c.totalCharges > 0 && (
            <div className="mt-4">
              <div
                className="text-[11px] font-semibold text-kite-muted uppercase tracking-wide mb-1"
                data-tip="Charges :: Every trade in India pays brokerage plus government & exchange levies. Zerodha: ₹0 brokerage on delivery, ₹20 or 0.03% (lower) on intraday/F&O. :: STT and stamp duty are taxes; GST is 18% on brokerage + exchange + SEBI fees."
              >
                Charges
              </div>
              <div className="grid grid-cols-2 gap-x-6">
                <Field label="Brokerage" tip="Brokerage :: The broker's fee. Zerodha charges ₹0 for equity delivery and max ₹20 per executed order for intraday & F&O.">
                  ₹{formatNum(c.brokerage)}
                </Field>
                <Field label="STT/CTT" tip="Securities Transaction Tax :: A government tax on the trade value. Delivery: 0.1% on buy & sell. Intraday: 0.025% on sell. Options: on the sell premium.">
                  ₹{formatNum(c.stt)}
                </Field>
                <Field label="Exchange txn." tip="Exchange transaction charges :: Fee the NSE/BSE charges on turnover (≈0.003% on equity).">
                  ₹{formatNum(c.exchangeTxn)}
                </Field>
                <Field label="SEBI fees" tip="SEBI turnover fee :: ₹10 per crore of turnover, paid to the market regulator.">
                  ₹{formatNum(c.sebiCharges)}
                </Field>
                <Field label="Stamp duty" tip="Stamp duty :: State tax collected on the BUY side only (0.015% for delivery, 0.003% intraday).">
                  ₹{formatNum(c.stampDuty)}
                </Field>
                <Field label="GST" tip="GST :: 18% on brokerage + exchange charges + SEBI fees.">
                  ₹{formatNum(c.gst)}
                </Field>
                {c.dpCharges > 0 && (
                  <Field label="DP charges" tip="DP charges :: ₹15.34 (incl. GST) per stock per day when you SELL delivery shares from your Demat — charged by the depository (CDSL) + broker.">
                    ₹{formatNum(c.dpCharges)}
                  </Field>
                )}
                {c.autoSquareOffFee > 0 && (
                  <Field label="Auto sq-off fee" tip="Auto square-off fee :: ₹50 + GST charged when the broker has to close your MIS / F&O intraday position at 3:20 PM because you didn't.">
                    ₹{formatNum(c.autoSquareOffFee)}
                  </Field>
                )}
                <Field label="Total" tip="Total charges :: Sum of all the charges above, deducted from your funds.">
                  <strong>₹{formatNum(c.totalCharges)}</strong>
                </Field>
              </div>
            </div>
          )}

          {/* Fills */}
          {fills.length > 0 && (
            <div className="mt-4">
              <div
                className="text-[11px] font-semibold text-kite-muted uppercase tracking-wide mb-1"
                data-tip="Trades (fills) :: An order can execute in several pieces (fills) at slightly different prices. Each one is a trade."
              >
                Trades ({fills.length})
              </div>
              {fills.map((t) => (
                <div key={t.id} className="flex justify-between py-1.5 border-b border-gray-100 dark:border-kite-darkBorder/70 font-mono text-[11px]">
                  <span className="text-kite-muted">
                    {t.date} {t.time}
                  </span>
                  <span>
                    {t.qty} @ ₹{formatNum(t.price)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="mt-4">
            <div
              className="text-[11px] font-semibold text-kite-muted uppercase tracking-wide mb-2"
              data-tip="Order history :: Every step the order went through — received by the broker, validated, sent to the exchange, triggered, modified, filled or cancelled."
            >
              Order history
            </div>
            <ol className="relative ml-1.5 border-l border-gray-200 dark:border-kite-darkBorder">
              {timeline.map((h, i) => (
                <li key={i} className="ml-3 pb-2.5 last:pb-0">
                  <span
                    className={`absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-kite-darkSurface ${
                      h.status === 'COMPLETE'
                        ? 'bg-kite-green'
                        : h.status === 'REJECTED' || h.status === 'CANCELLED'
                          ? 'bg-kite-red'
                          : 'bg-kite-blue'
                    }`}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-semibold text-[11px] text-gray-800 dark:text-gray-100">{h.status}</span>
                    <span className="font-mono text-[10px] text-kite-muted">
                      {h.date} {h.time}
                    </span>
                  </div>
                  {h.note && <div className="text-[11px] text-kite-muted leading-snug">{h.note}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 flex gap-2 px-4 py-3 bg-white dark:bg-kite-darkSurface border-t border-gray-100 dark:border-kite-darkBorder">
          {open && (
            <>
              <button
                onClick={() => {
                  close();
                  openTicketFromOrder(order, 'MODIFY');
                }}
                data-tip="Modify :: Change the quantity, price, trigger or validity of this pending order without losing its place in the queue logic."
                className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold"
              >
                <Edit3 className="w-3.5 h-3.5" /> Modify
              </button>
              <button
                onClick={() => setConfirmCancel(true)}
                data-tip="Cancel order :: Withdraw this pending order from the exchange. Any margin it blocked is released."
                className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded border border-kite-red/50 text-kite-red font-semibold"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </button>
            </>
          )}
          <button
            onClick={() => {
              close();
              openTicketFromOrder(order, 'REPEAT');
            }}
            data-tip="Repeat :: Open a new order window pre-filled with the same instrument, side, product, quantity and price."
            className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded border border-gray-300 dark:border-kite-darkBorder font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Repeat
          </button>
          <button
            onClick={() => {
              close();
              void selectSymbol(order.underlyingSymbol, true);
            }}
            data-tip="View chart :: Open the candlestick chart of this instrument (the underlying for F&O)."
            className="min-h-[42px] px-3 inline-flex items-center justify-center gap-1.5 rounded border border-gray-300 dark:border-kite-darkBorder font-semibold"
            aria-label="View chart"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chart</span>
          </button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel order?"
        message={
          <>
            Cancel the pending <strong>{order.side}</strong> order for <strong>{order.qty - order.filledQty}</strong> ×{' '}
            <strong>{name}</strong>? Any blocked margin will be released.
          </>
        }
        confirmLabel="Cancel order"
        onConfirm={() => void cancelOrder(order.id)}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  );
};
