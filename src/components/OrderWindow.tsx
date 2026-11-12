import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripHorizontal, Info, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { calculateRequiredMargin, calculateZerodhaCharges } from '../engine/charges.ts';
import { getAvailableMargin } from '../engine/simulationEngine.ts';
import { formatINR, formatNum, getDisplaySymbol, maskContractDisplay } from '../utils/format.ts';
import type { OrderType, OrderVariety, ProductType } from '../types/simulator.ts';

const PHONE_QUERY = '(max-width: 767px)';

function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isPhone;
}

const VARIETY_TIPS: Record<OrderVariety, string> = {
  REGULAR: 'Regular order :: A normal order placed during market hours (9:15 AM – 3:30 PM).',
  CO: 'Cover order (CO) :: An intraday order that must carry a compulsory stop-loss. Because your risk is capped, the margin needed is lower. Auto squared-off before market close.',
  AMO: 'After Market Order (AMO) :: Place an order outside market hours; it is sent to the exchange when the market opens next.',
  ICEBERG: 'Iceberg order :: Splits a big order into smaller “legs” so others don’t see your full size in market depth. Useful for large quantities.',
};

const ORDER_TYPE_TIPS: Record<OrderType, string> = {
  MARKET: 'Market order :: Buy or sell immediately at the best available price. Fast, but the exact price isn’t guaranteed.',
  LIMIT: 'Limit order :: Buy or sell only at your price or better. It waits in the order book until the market reaches your price.',
  SL: 'Stop-loss limit (SL) :: When the price hits your trigger price, a LIMIT order at your price is sent. Used to limit losses (or to enter on a breakout).',
  'SL-M': 'Stop-loss market (SL-M) :: When the price hits your trigger price, a MARKET order is sent. Fills for sure once triggered, but the price can slip.',
};

const inputCls =
  'w-full px-2.5 h-10 md:h-9 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg disabled:bg-gray-100 dark:disabled:bg-gray-800/70 disabled:text-gray-400 font-mono text-sm focus:outline-none focus:border-kite-blue';

function pctDiff(price: number, ref: number): string {
  if (!(ref > 0) || !(price > 0)) return '—';
  const d = ((price - ref) / ref) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(2)}%`;
}

export const OrderWindow: React.FC = () => {
  const { profile, quotes, derivativePrices, instrumentsMap, orderTicket, updateOrderTicket, closeOrderTicket, submitOrderTicket } =
    useSimulatorStore();

  const isPhone = useIsPhone();
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showChargesDetail, setShowChargesDetail] = useState(false);
  const [moreOptions, setMoreOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keep the floating window on-screen after a resize.
  useEffect(() => {
    const onResize = () => setPos({ x: 0, y: 0 });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Expand "More options" automatically when the ticket already uses them (e.g. modify).
  useEffect(() => {
    if (!orderTicket.open) return;
    setMoreOptions(orderTicket.validity !== 'DAY' || orderTicket.disclosedQty > 0 || Boolean(orderTicket.tag));
  }, [orderTicket.open, orderTicket.modifyOrderId]);

  if (!orderTicket.open || !profile) return null;

  const t = orderTicket;
  const isBuy = t.side === 'BUY';
  const isEq = t.instrumentType === 'EQ';
  const headerBg = isBuy ? 'bg-kite-blue' : 'bg-kite-orange';
  const btnBg = isBuy ? 'bg-kite-blue hover:bg-kite-blueHover' : 'bg-kite-orange hover:bg-kite-orangeHover';
  const accentRadio = isBuy ? 'accent-[#387ed1]' : 'accent-[#ff5722]';

  const spotQuote = quotes[t.underlyingSymbol];
  const spotLtp = spotQuote?.ltp || t.price || 100;
  const contractLtp = isEq ? spotLtp : derivativePrices[t.contractKey] || t.price || spotLtp;

  const isMarketLike = t.orderType === 'MARKET' || t.orderType === 'SL-M';
  const priceEnabled = !isMarketLike;
  const triggerEnabled = t.variety === 'CO' || t.orderType === 'SL' || t.orderType === 'SL-M';
  const effectivePrice = isMarketLike ? contractLtp : t.price || contractLtp;

  const holding = profile.holdings.find((h) => h.symbol === t.underlyingSymbol);
  const ownedUnpledgedQty = holding ? Math.max(0, holding.qty + holding.t1Qty - holding.pledgedQty) : 0;

  const charges = calculateZerodhaCharges({
    side: t.side,
    exchange: t.exchange,
    product: t.product,
    instrumentType: t.instrumentType,
    qty: t.qty,
    price: effectivePrice,
    isDpAlreadyChargedToday: profile.dpSoldToday.includes(t.underlyingSymbol),
  });

  const reqMargin = calculateRequiredMargin({
    side: t.side,
    product: t.product,
    instrumentType: t.instrumentType,
    qty: t.qty,
    price: effectivePrice,
    underlyingPrice: spotLtp,
    existingHoldingQty: ownedUnpledgedQty,
  });

  const canUseCollateral =
    t.product === 'MIS' || t.product === 'MTF' || t.instrumentType === 'FUT' || ((t.instrumentType === 'CE' || t.instrumentType === 'PE') && t.side === 'SELL');

  const availMargin = getAvailableMargin(profile, (s) => quotes[s]?.ltp || 0, canUseCollateral);
  const enough = availMargin >= reqMargin + charges.totalCharges;

  const showDisclosed = isEq && (t.orderType === 'LIMIT' || t.orderType === 'SL');
  const disclosedWarn =
    showDisclosed && t.disclosedQty > 0 && (t.disclosedQty < Math.ceil(t.qty * 0.1) || t.disclosedQty > t.qty)
      ? `Must be between ${Math.ceil(t.qty * 0.1)} (10%) and ${t.qty}`
      : '';
  const showSlTarget = isEq && t.variety === 'REGULAR' && !t.modifyOrderId;
  const slWrongSide = t.attachStoploss && (isBuy ? t.stoplossPrice >= effectivePrice : t.stoplossPrice <= effectivePrice);
  const tgtWrongSide = t.attachTarget && (isBuy ? t.targetPrice <= effectivePrice : t.targetPrice >= effectivePrice);

  /* Drag (desktop floating window) — pointer events, constrained to the viewport */
  const onDragStart = (e: React.PointerEvent) => {
    if (isPhone || e.button !== 0) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: PointerEvent) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dx = Math.max(-rect.left, Math.min(vw - rect.right, ev.clientX - start.x));
      const dy = Math.max(-rect.top, Math.min(vh - rect.bottom, ev.clientY - start.y));
      setPos({ x: start.origX + dx, y: start.origY + dy });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const applyCapitalPercent = (pct: number) => {
    if (t.side === 'SELL' && t.product === 'CNC' && ownedUnpledgedQty > 0) {
      updateOrderTicket({ qty: Math.max(1, Math.floor(ownedUnpledgedQty * pct)) });
      return;
    }
    const unitMargin = Math.max(
      0.05,
      calculateRequiredMargin({
        side: t.side,
        product: t.product,
        instrumentType: t.instrumentType,
        qty: t.lotSize || 1,
        price: effectivePrice,
        underlyingPrice: spotLtp,
      })
    );
    const budget = Math.max(0, availMargin * 0.992 * pct); // leave headroom for statutory charges
    const lots = Math.max(1, Math.floor(budget / unitMargin));
    updateOrderTicket({ qty: lots * (t.lotSize || 1) });
  };

  const setOrderType = (ot: OrderType) =>
    updateOrderTicket({ orderType: ot, disclosedQty: ot === 'LIMIT' || ot === 'SL' ? t.disclosedQty : 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await submitOrderTicket();
    setSubmitting(false);
  };

  const maskedTitle = isEq
    ? getDisplaySymbol(t.underlyingSymbol, instrumentsMap, profile.blindMode)
    : maskContractDisplay(t.displaySymbol, t.underlyingSymbol, instrumentsMap, profile.blindMode);

  const activeChip = (on: boolean) =>
    on
      ? isBuy
        ? 'border-kite-blue bg-kite-blue/5 text-kite-blue font-semibold'
        : 'border-kite-orange bg-kite-orange/5 text-kite-orange font-semibold'
      : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300';

  const products: Array<{ id: ProductType; label: string; sub: string; tip: string }> = isEq
    ? [
        {
          id: 'MIS',
          label: 'Intraday',
          sub: 'MIS',
          tip: 'Intraday (MIS) :: Buy and sell on the same day with up to 5x leverage. Open MIS positions are auto squared-off around 3:20 PM. :: Leverage multiplies losses too.',
        },
        {
          id: 'CNC',
          label: 'Longterm',
          sub: 'CNC',
          tip: 'Longterm / Delivery (CNC) :: Pay the full amount; shares are delivered to your Demat and you can hold them as long as you like. Zerodha charges ₹0 brokerage on delivery.',
        },
        {
          id: 'MTF',
          label: 'MTF',
          sub: 'Margin',
          tip: 'Margin Trading Facility (MTF) :: Buy delivery shares paying only part (about 25%); the broker funds the rest and charges daily interest. Risky for beginners.',
        },
      ]
    : [
        { id: 'MIS', label: 'Intraday', sub: 'MIS', tip: 'Intraday (MIS) :: F&O position that is auto squared-off the same day.' },
        { id: 'NRML', label: 'Overnight', sub: 'NRML', tip: 'Overnight (NRML) :: Carry the F&O position until expiry, with full SPAN + exposure margin blocked.' },
      ];

  const panelCls = isPhone
    ? 'w-full rounded-t-xl max-h-[92dvh] bg-white dark:bg-kite-darkSurface shadow-2xl flex flex-col overflow-hidden'
    : 'fixed bottom-5 right-6 z-50 w-[435px] max-w-[95vw] max-h-[calc(100dvh-2.5rem)] rounded-md shadow-2xl border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface flex flex-col overflow-hidden';

  const panel = (
    <div
      ref={panelRef}
      style={isPhone ? undefined : { transform: `translate(${pos.x}px, ${pos.y}px)` }}
      className={panelCls}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header (BUY blue / SELL orange) */}
      <div
        onPointerDown={onDragStart}
        className={`${headerBg} text-white px-4 py-3 shrink-0 flex items-start justify-between gap-2 ${isPhone ? '' : 'cursor-move select-none touch-none'}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm truncate">
              {t.modifyOrderId ? 'Modify ' : ''}
              {isBuy ? 'Buy' : 'Sell'} {maskedTitle}
            </span>
            <span className="text-xs font-mono opacity-95">× {t.qty} Qty</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] opacity-95 font-mono">
            {isEq ? (
              (['NSE', 'BSE'] as const).map((ex) => (
                <label
                  key={ex}
                  className="flex items-center gap-1 cursor-pointer min-h-[28px]"
                  onPointerDown={(e) => e.stopPropagation()}
                  data-tip={
                    ex === 'NSE'
                      ? 'NSE — National Stock Exchange :: India’s largest, most liquid exchange. Most people trade on NSE for tighter bid-ask spreads.'
                      : 'BSE — Bombay Stock Exchange :: Asia’s oldest exchange. Shares bought on NSE or BSE land in the same Demat account.'
                  }
                >
                  <input type="radio" checked={t.exchange === ex} onChange={() => updateOrderTicket({ exchange: ex })} />
                  <span>
                    {ex} ₹{formatNum(contractLtp)}
                  </span>
                </label>
              ))
            ) : (
              <span data-tip="Lot size :: F&O contracts trade only in multiples of the lot size set by the exchange.">
                NFO ₹{formatNum(contractLtp)} · Lot {t.lotSize}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
          {!t.modifyOrderId && (
            <button
              type="button"
              onClick={() => updateOrderTicket({ side: isBuy ? 'SELL' : 'BUY' })}
              className="px-2 h-8 md:h-6 rounded bg-white/20 hover:bg-white/30 text-[11px] font-semibold"
              data-tip="Switch side :: Flip this order between Buy and Sell without re-entering the details."
            >
              {isBuy ? 'Sell' : 'Buy'} ⇄
            </button>
          )}
          {!isPhone && <GripHorizontal className="w-4 h-4 opacity-60" />}
          <button type="button" onClick={closeOrderTicket} className="p-1.5 rounded hover:bg-white/20" aria-label="Close order window">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Variety tabs */}
      <div className="flex shrink-0 border-b border-gray-200 dark:border-kite-darkBorder bg-gray-50 dark:bg-[#15181e] px-2 md:px-4 text-xs font-medium overflow-x-auto no-scrollbar">
        {(['REGULAR', 'CO', 'AMO', 'ICEBERG'] as OrderVariety[]).map((v) => (
          <button
            key={v}
            type="button"
            disabled={Boolean(t.modifyOrderId) && t.variety !== v}
            onClick={() => updateOrderTicket({ variety: v, product: v === 'CO' && t.product === 'CNC' ? 'MIS' : t.product })}
            data-tip={VARIETY_TIPS[v]}
            className={`px-3 h-10 md:h-9 border-b-2 whitespace-nowrap transition-colors disabled:opacity-40 ${
              t.variety === v
                ? isBuy
                  ? 'border-kite-blue text-kite-blue font-semibold'
                  : 'border-kite-orange text-kite-orange font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {v === 'REGULAR' ? 'Regular' : v === 'CO' ? 'Cover' : v === 'AMO' ? 'AMO' : 'Iceberg'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col text-xs">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5">
          {/* Product */}
          <div className="flex flex-wrap items-center gap-2">
            {products.map((p) => (
              <label
                key={p.id}
                data-tip={p.tip}
                className={`flex items-center gap-1.5 px-2.5 min-h-[40px] md:min-h-[32px] rounded border cursor-pointer transition-colors ${activeChip(t.product === p.id)}`}
              >
                <input
                  type="radio"
                  name="product"
                  className={accentRadio}
                  checked={t.product === p.id}
                  disabled={t.variety === 'CO' && p.id === 'CNC'}
                  onChange={() => updateOrderTicket({ product: p.id })}
                />
                <span>{p.label}</span>
                <span className="text-[10px] opacity-75 font-mono">{p.sub}</span>
              </label>
            ))}
          </div>

          {/* Qty / Price / Trigger */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  className="text-[11px] text-kite-muted font-medium"
                  data-tip={
                    t.lotSize > 1
                      ? 'Quantity :: Number of units. For F&O it must be a multiple of the lot size.'
                      : 'Quantity :: Number of shares to buy or sell.'
                  }
                >
                  Qty.
                </label>
                {t.lotSize > 1 && (
                  <span
                    className="text-[10px] text-kite-muted font-mono"
                    data-tip={`Lots :: F&O trades in lots. 1 lot = ${t.lotSize} units, so ${t.qty} qty = ${(t.qty / t.lotSize).toFixed(2).replace(/\.00$/, '')} lot(s).`}
                  >
                    {Math.round(t.qty / t.lotSize)} lot{Math.round(t.qty / t.lotSize) === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={t.lotSize}
                step={t.lotSize}
                value={t.qty}
                onChange={(e) => updateOrderTicket({ qty: Math.max(1, Math.floor(Number(e.target.value) || 0)) })}
                className={`${inputCls} font-semibold`}
              />
            </div>

            <div>
              <label
                className="block text-[11px] text-kite-muted font-medium mb-1"
                data-tip="Price :: The limit price — the most you’ll pay when buying, or the least you’ll accept when selling. Disabled for Market / SL-M orders, which fill at the market price."
              >
                Price
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.05"
                disabled={!priceEnabled}
                value={priceEnabled ? t.price : contractLtp}
                onChange={(e) => updateOrderTicket({ price: Number(e.target.value) })}
                className={inputCls}
              />
            </div>

            <div>
              <label
                className="block text-[11px] text-kite-muted font-medium mb-1"
                data-tip={
                  t.variety === 'CO'
                    ? 'Stop-loss trigger :: Cover orders need a compulsory stop-loss. If the price hits this trigger, your position exits at market.'
                    : 'Trigger price :: For SL / SL-M orders: the order is activated only when the market price touches this level. :: For a stop-loss on a buy position, keep the trigger below the current price.'
                }
              >
                {t.variety === 'CO' ? 'SL trigger' : 'Trigger price'}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.05"
                disabled={!triggerEnabled}
                value={t.variety === 'CO' ? t.stopLossTrigger : t.triggerPrice}
                onChange={(e) =>
                  t.variety === 'CO'
                    ? updateOrderTicket({ stopLossTrigger: Number(e.target.value) })
                    : updateOrderTicket({ triggerPrice: Number(e.target.value) })
                }
                className={inputCls}
              />
            </div>
          </div>

          {/* Quick sizing + iceberg legs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span
                className="text-[10px] text-kite-muted mr-1"
                data-tip="Quick size :: Fill the quantity using a share of your available margin (or of the shares you hold, when selling delivery holdings)."
              >
                {t.side === 'SELL' && t.product === 'CNC' && ownedUnpledgedQty > 0 ? `Held (${ownedUnpledgedQty}):` : 'Size:'}
              </span>
              {[
                { label: '25%', pct: 0.25 },
                { label: '50%', pct: 0.5 },
                { label: '75%', pct: 0.75 },
                { label: 'Max', pct: 1.0 },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => applyCapitalPercent(b.pct)}
                  className="px-2.5 h-8 md:h-6 rounded bg-gray-100 dark:bg-gray-800 hover:bg-kite-blue/15 hover:text-kite-blue text-[10px] font-semibold"
                >
                  {b.label}
                </button>
              ))}
            </div>

            {t.variety === 'ICEBERG' && (
              <label
                className="flex items-center gap-1.5"
                data-tip="Iceberg legs :: How many equal smaller orders your quantity is split into (2–10). Each leg is placed after the previous one fills."
              >
                <span className="text-[11px] text-kite-muted">Legs</span>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={t.icebergLegs}
                  onChange={(e) => updateOrderTicket({ icebergLegs: Math.max(2, Math.min(10, Number(e.target.value) || 2)) })}
                  className="w-14 px-1.5 h-8 md:h-6 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg font-mono text-center"
                />
              </label>
            )}
          </div>

          {/* Order type */}
          <div className="pt-2 border-t border-gray-100 dark:border-kite-darkBorder space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {(['MARKET', 'LIMIT', 'SL', 'SL-M'] as OrderType[]).map((ot) => (
                <label key={ot} className="flex items-center gap-1.5 cursor-pointer min-h-[36px] md:min-h-0" data-tip={ORDER_TYPE_TIPS[ot]}>
                  <input type="radio" name="orderType" className={accentRadio} checked={t.orderType === ot} onChange={() => setOrderType(ot)} />
                  <span className="text-[11px] font-medium">{ot === 'MARKET' ? 'Market' : ot === 'LIMIT' ? 'Limit' : ot}</span>
                </label>
              ))}
            </div>

            {t.orderType === 'MARKET' && (
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] text-kite-muted"
                  data-tip="Market protection :: Guards a market order against a bad fill in a fast or thin market: if the fill price would be worse than LTP ± this %, the order is cancelled instead. :: Kite’s default is Auto — the exchange-recommended band."
                >
                  Market protection
                </span>
                <select
                  value={t.marketProtectionPct}
                  onChange={(e) => updateOrderTicket({ marketProtectionPct: Number(e.target.value) })}
                  className="h-9 md:h-7 px-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-[11px]"
                >
                  <option value={0}>Auto</option>
                  {[0.5, 1, 2, 3, 5].map((p) => (
                    <option key={p} value={p}>
                      {p}%
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* More options: validity, disclosed qty, tag */}
          <div className="border-t border-gray-100 dark:border-kite-darkBorder pt-2">
            <button
              type="button"
              onClick={() => setMoreOptions((o) => !o)}
              className="flex items-center gap-1 text-[11px] font-medium text-kite-blue min-h-[32px]"
              data-tip="More options :: Validity (Day / Immediate / Minutes), disclosed quantity and an order tag."
            >
              {moreOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {moreOptions ? 'Hide options' : 'More options'}
            </button>

            {moreOptions && (
              <div className="mt-2 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-[11px] text-kite-muted w-full sm:w-auto">Validity</span>
                  {(
                    [
                      { id: 'DAY', label: 'Day', tip: 'Validity: Day :: The order stays open until it fills or the market closes (3:30 PM), then it is cancelled.' },
                      {
                        id: 'IOC',
                        label: 'Immediate (IOC)',
                        tip: 'Validity: Immediate or Cancel (IOC) :: Whatever can be filled right now is filled; the rest is cancelled instantly.',
                      },
                      {
                        id: 'TTL',
                        label: 'Minutes',
                        tip: 'Validity: Minutes (TTL) :: The order stays open only for the minutes you choose, then cancels automatically. :: Handy for limit orders you don’t want lingering all day.',
                      },
                    ] as const
                  ).map((v) => (
                    <label key={v.id} className="flex items-center gap-1.5 cursor-pointer min-h-[36px] md:min-h-0 text-[11px]" data-tip={v.tip}>
                      <input
                        type="radio"
                        name="validity"
                        className={accentRadio}
                        checked={t.validity === v.id}
                        onChange={() => updateOrderTicket({ validity: v.id })}
                      />
                      <span>{v.label}</span>
                    </label>
                  ))}
                  {t.validity === 'TTL' && (
                    <label className="flex items-center gap-1.5" data-tip="Minutes :: How long (1–375 min) the order stays open before it is auto-cancelled.">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={375}
                        value={t.ttlMinutes}
                        onChange={(e) => updateOrderTicket({ ttlMinutes: Math.max(1, Math.min(375, Math.floor(Number(e.target.value) || 1))) })}
                        className="w-16 px-1.5 h-9 md:h-7 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg font-mono text-center"
                      />
                      <span className="text-[11px] text-kite-muted">min</span>
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {showDisclosed && (
                    <div>
                      <label
                        className="block text-[11px] text-kite-muted font-medium mb-1"
                        data-tip="Disclosed quantity :: Show only part of your order in market depth (minimum 10% of the quantity). The rest stays hidden and is revealed as each part fills. Equity LIMIT / SL orders only."
                      >
                        Disclosed qty
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={t.qty}
                        value={t.disclosedQty || ''}
                        placeholder="0"
                        onChange={(e) => updateOrderTicket({ disclosedQty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                        className={inputCls}
                      />
                      <div className={`text-[10px] mt-0.5 ${disclosedWarn ? 'text-kite-red' : 'text-kite-muted'}`}>
                        {disclosedWarn || `min 10% of qty (${Math.ceil(t.qty * 0.1)})`}
                      </div>
                    </div>
                  )}
                  <div className={showDisclosed ? '' : 'col-span-2'}>
                    <label
                      className="block text-[11px] text-kite-muted font-medium mb-1"
                      data-tip="Tag :: An optional label (max 20 characters) to identify this order later in your order book — e.g. “swing”, “breakout”."
                    >
                      Tag <span className="opacity-70">(optional)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={t.tag}
                      onChange={(e) => updateOrderTicket({ tag: e.target.value.slice(0, 20) })}
                      placeholder="e.g. swing"
                      className={`${inputCls} font-sans`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stoploss / Target (attached GTT OCO) */}
          {showSlTarget && (
            <div className="border-t border-gray-100 dark:border-kite-darkBorder pt-2 space-y-2">
              <div
                className="text-[11px] font-semibold text-gray-700 dark:text-gray-200"
                data-tip="Stoploss / Target :: Optionally protect this trade. After the order is filled, Kite creates a GTT OCO (one-cancels-other): if either the stoploss or the target is hit, that exit order is placed and the other is cancelled. :: The GTT stays active for up to a year, even across days."
              >
                Stoploss / Target
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      key: 'sl',
                      label: 'Stoploss',
                      on: t.attachStoploss,
                      price: t.stoplossPrice,
                      wrong: slWrongSide,
                      color: 'text-kite-red',
                      toggle: (v: boolean) => updateOrderTicket({ attachStoploss: v }),
                      set: (v: number) => updateOrderTicket({ stoplossPrice: v }),
                      tip: isBuy
                        ? 'Stoploss :: The price below your buy price at which you want to exit to cap your loss. A sell order is placed automatically if the stock falls to it.'
                        : 'Stoploss :: For a short sell, the price above which you exit to cap your loss.',
                    },
                    {
                      key: 'tgt',
                      label: 'Target',
                      on: t.attachTarget,
                      price: t.targetPrice,
                      wrong: tgtWrongSide,
                      color: 'text-kite-green',
                      toggle: (v: boolean) => updateOrderTicket({ attachTarget: v }),
                      set: (v: number) => updateOrderTicket({ targetPrice: v }),
                      tip: isBuy
                        ? 'Target :: The price above your buy price at which you want to book profit. A sell order is placed automatically if the stock rises to it.'
                        : 'Target :: For a short sell, the lower price at which you buy back to book profit.',
                    },
                  ] as const
                ).map((leg) => (
                  <div key={leg.key} className="rounded border border-gray-200 dark:border-kite-darkBorder p-2">
                    <label className="flex items-center justify-between gap-2 cursor-pointer min-h-[32px]" data-tip={leg.tip}>
                      <span className="flex items-center gap-1.5">
                        <input type="checkbox" className={accentRadio} checked={leg.on} onChange={(e) => leg.toggle(e.target.checked)} />
                        <span className="text-[11px] font-medium">{leg.label}</span>
                      </span>
                      {leg.on && <span className={`text-[10px] font-mono ${leg.color}`}>{pctDiff(leg.price, effectivePrice)}</span>}
                    </label>
                    {leg.on && (
                      <>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.05"
                          value={leg.price}
                          onChange={(e) => leg.set(Number(e.target.value))}
                          className={`${inputCls} mt-1`}
                        />
                        {leg.wrong && (
                          <div className="text-[10px] mt-0.5 text-kite-red">
                            {leg.key === 'sl'
                              ? `Should be ${isBuy ? 'below' : 'above'} the order price`
                              : `Should be ${isBuy ? 'above' : 'below'} the order price`}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              {(t.attachStoploss || t.attachTarget) && (
                <p className="text-[10.5px] text-kite-muted leading-snug">
                  A GTT {t.attachStoploss && t.attachTarget ? 'OCO' : 'single-trigger'} order for {t.qty} qty will be created after this order is filled.
                </p>
              )}
            </div>
          )}

          {/* Margin & charges */}
          <div className="rounded bg-slate-50 dark:bg-[#14171d] p-2.5 border border-gray-200/80 dark:border-kite-darkBorder space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-3">
                <span data-tip="Required margin :: Money needed to place this order. Delivery (CNC) needs 100% of the trade value; Intraday (MIS) needs about 20% (5x leverage); F&O needs SPAN + exposure margin.">
                  Req.{' '}
                  <strong className="font-mono text-gray-800 dark:text-white">{formatINR(reqMargin)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setShowChargesDetail(!showChargesDetail)}
                  data-tip="Charges :: Brokerage plus government taxes and fees for this order: STT, exchange transaction charges, SEBI fee, stamp duty and GST. Zerodha charges ₹0 brokerage on delivery and max ₹20 per intraday/F&O order. :: Tap to see the breakup."
                  className="inline-flex items-center gap-0.5 text-kite-blue hover:underline font-medium min-h-[28px]"
                >
                  <Info className="w-3 h-3" />
                  <span>Charges {formatINR(charges.totalCharges)}</span>
                  {showChargesDetail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              <span data-tip="Available margin :: Your free cash (plus collateral from pledged holdings for MIS / MTF / F&O). Green = enough for this order; red = not enough.">
                Avail.{' '}
                <strong className={`font-mono ${enough ? 'text-kite-green' : 'text-kite-red'}`}>{formatINR(availMargin)}</strong>
              </span>
            </div>

            {showChargesDetail && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-2 border-t border-gray-200 dark:border-gray-800 text-[10px] font-mono text-gray-600 dark:text-gray-400">
                <div className="flex justify-between" data-tip="Turnover :: Total value of the trade (quantity × price).">
                  <span>Turnover</span>
                  <span>{formatINR(charges.turnover)}</span>
                </div>
                <div className="flex justify-between" data-tip="Brokerage :: Zerodha’s fee — ₹0 for delivery, 0.03% or ₹20 (whichever is lower) per intraday / F&O order.">
                  <span>Brokerage</span>
                  <span>{formatINR(charges.brokerage)}</span>
                </div>
                <div className="flex justify-between" data-tip="STT — Securities Transaction Tax :: A government tax on buying/selling securities. Delivery: 0.1% on both buy and sell.">
                  <span>STT</span>
                  <span>{formatINR(charges.stt)}</span>
                </div>
                <div className="flex justify-between" data-tip="Exchange transaction charges :: Fee charged by NSE/BSE on the turnover.">
                  <span>Exchange txn</span>
                  <span>{formatINR(charges.exchangeTxn)}</span>
                </div>
                <div className="flex justify-between" data-tip="Stamp duty :: State-government tax charged on the buy side only.">
                  <span>Stamp duty</span>
                  <span>{formatINR(charges.stampDuty)}</span>
                </div>
                <div className="flex justify-between" data-tip="GST + SEBI fee :: 18% GST on brokerage and exchange charges, plus SEBI’s ₹10 per crore turnover fee.">
                  <span>GST + SEBI</span>
                  <span>{formatINR(charges.gst + charges.sebiCharges)}</span>
                </div>
                {charges.dpCharges > 0 && (
                  <div
                    className="flex justify-between col-span-2 text-amber-600 dark:text-amber-400"
                    data-tip="DP charges :: Depository fee (₹13.50 + GST) charged once per stock per day when you sell delivery shares from your Demat."
                  >
                    <span>CDSL DP charge</span>
                    <span>{formatINR(charges.dpCharges)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 flex items-center gap-2 px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3 border-t border-gray-100 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
          <button
            type="submit"
            disabled={submitting}
            className={`flex-1 h-11 md:h-10 rounded text-white font-semibold text-xs shadow-sm transition-colors disabled:opacity-60 ${btnBg}`}
          >
            {submitting ? 'Placing…' : t.modifyOrderId ? 'Modify' : isBuy ? 'Buy' : 'Sell'}
          </button>
          <button
            type="button"
            onClick={closeOrderTicket}
            className="px-5 h-11 md:h-10 rounded border border-gray-300 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );

  if (!isPhone) return panel;

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">{panel}</div>;
};
