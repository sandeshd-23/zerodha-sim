import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  BarChart2,
  Bell,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  ListOrdered,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { api } from '../api/client.ts';
import type { Instrument, MarketQuote, UserSettings } from '../types/simulator.ts';
import { formatNum, formatPct, getDisplayName, getDisplaySymbol } from '../utils/format.ts';

interface RemoteHit {
  symbol: string;
  yahooTicker: string;
  name: string;
  exchange: 'NSE' | 'BSE' | 'US/GLOBAL';
  exchangeLabel?: string;
  isIndian?: boolean;
  alreadySynced: boolean;
}

type SearchFilter = 'ALL' | 'EQ' | 'INDEX' | 'ETF' | 'FNO';
type SortKey = NonNullable<UserSettings['watchlistSort']>;

const PHONE_QUERY = '(max-width: 767px)';
const SWIPE_TRIGGER = 72;
const SWIPE_MAX = 112;
const MAX_RESULTS = 30;

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

/** F&O contracts exist for indices and for stocks with an exchange lot size (ETFs have none). */
function hasFno(inst?: Instrument): boolean {
  if (!inst || inst.isEtf) return false;
  return inst.isIndex || inst.lotSize > 1;
}

function exchangeTag(inst?: Instrument): string {
  if (!inst) return 'NSE';
  if (inst.isIndex) return 'INDEX';
  return inst.exchange === 'BSE' ? 'BSE' : 'NSE';
}

function formatChange(q: MarketQuote, mode: 'PCT' | 'ABS'): string {
  if (mode === 'ABS') return `${q.change > 0 ? '+' : ''}${formatNum(q.change)}`;
  return formatPct(q.changePct);
}

const SORT_OPTIONS: Array<{ id: SortKey; label: string; tip: string }> = [
  { id: 'NONE', label: 'Manual (my order)', tip: 'Manual order :: Shows stocks in the order you added or arranged them. Use ⋯ → Move up / Move down to reorder.' },
  { id: 'CHANGE', label: '% Change', tip: 'Sort by % change :: Biggest gainers of the day at the top, biggest losers at the bottom.' },
  { id: 'LTP', label: 'LTP (price)', tip: 'Sort by LTP :: Highest-priced shares first. A high share price does not mean a “bigger” or better company — market cap matters, not price.' },
  { id: 'ALPHA', label: 'Alphabetically (A–Z)', tip: 'Sort A–Z :: Sorts the list by trading symbol.' },
  { id: 'EXCHANGE', label: 'Exchange', tip: 'Sort by exchange :: Groups instruments by exchange (BSE, INDEX, NSE), then A–Z.' },
];

const FILTERS: Array<{ id: SearchFilter; label: string; tip: string }> = [
  { id: 'ALL', label: 'All', tip: 'All instruments :: Stocks, ETFs and indices.' },
  { id: 'EQ', label: 'Equity', tip: 'Equity (stocks) :: Shares of individual companies listed on NSE/BSE. Buying one makes you a part-owner of that company.' },
  { id: 'INDEX', label: 'Index', tip: 'Indices :: A basket that tracks a market segment (e.g. NIFTY 50). You can’t buy an index directly — trade its F&O contracts or an index ETF like NIFTYBEES.' },
  { id: 'ETF', label: 'ETF', tip: 'ETF — Exchange Traded Fund :: A mutual-fund-like basket that trades like a stock (e.g. NIFTYBEES, GOLDBEES). Cheap, diversified, great for beginners.' },
  { id: 'FNO', label: 'F&O', tip: 'F&O available :: Instruments with Futures & Options contracts (indices and ~200 large stocks). F&O is leveraged and risky — learn cash trading first.' },
];

/* ------------------------------------------------------------------ */
/* Market depth drawer                                                 */
/* ------------------------------------------------------------------ */

const DepthStat: React.FC<{ label: string; value: React.ReactNode; tip: string; className?: string }> = ({ label, value, tip, className }) => (
  <div className="flex justify-between gap-2" data-tip={tip}>
    <span className="text-kite-muted">{label}</span>
    <span className={`font-mono ${className || ''}`}>{value}</span>
  </div>
);

const DepthPanel: React.FC<{ sym: string; inst?: Instrument; q: MarketQuote }> = ({ sym, inst, q }) => {
  const openOrderTicket = useSimulatorStore((s) => s.openOrderTicket);
  return (
    <div className="px-3 py-2.5 bg-slate-50 dark:bg-[#14171d] border-t border-gray-200 dark:border-kite-darkBorder text-[11px] space-y-2.5">
      {!inst?.isIndex && q.bids.length > 0 && (
        <div className="grid grid-cols-2 gap-3 font-mono">
          {(['BID', 'OFFER'] as const).map((sideLabel) => {
            const isBid = sideLabel === 'BID';
            const levels = isBid ? q.bids : q.asks;
            return (
              <div key={sideLabel}>
                <div className="flex justify-between text-[10px] text-kite-muted pb-1 border-b border-gray-200 dark:border-gray-800">
                  <span
                    data-tip={
                      isBid
                        ? 'Bid — what buyers will pay :: The 5 best prices buyers are waiting to buy at, highest first. A MARKET sell order fills against these bids. :: Tap a bid row to pre-fill a SELL limit order at that price.'
                        : 'Offer (Ask) — what sellers want :: The 5 lowest prices sellers are waiting to sell at. A MARKET buy order fills against these offers. :: Tap an offer row to pre-fill a BUY limit order at that price.'
                    }
                  >
                    {sideLabel}
                  </span>
                  <span data-tip="Orders :: How many separate orders are waiting at that price level.">ORDERS</span>
                  <span data-tip="Qty — quantity :: Total number of shares waiting to be traded at that price.">QTY</span>
                </div>
                {levels.map((lvl, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => openOrderTicket({ side: isBid ? 'SELL' : 'BUY', symbol: sym, orderType: 'LIMIT', price: lvl.price })}
                    className={`w-full flex justify-between py-1 md:py-0.5 rounded px-0.5 ${
                      isBid ? 'text-kite-blue hover:bg-blue-500/10' : 'text-kite-red hover:bg-red-500/10'
                    }`}
                  >
                    <span>{formatNum(lvl.price)}</span>
                    <span className="text-gray-500">{lvl.orders}</span>
                    <span>{lvl.qty.toLocaleString('en-IN')}</span>
                  </button>
                ))}
                <div
                  className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-800 font-semibold text-gray-700 dark:text-gray-300"
                  data-tip={
                    isBid
                      ? 'Total buy quantity :: All shares buyers are waiting to buy across the whole order book (not just the top 5). :: More buyers than sellers can hint at demand, but big orders can be placed and cancelled to mislead — don’t trade on this alone.'
                      : 'Total sell quantity :: All shares sellers are offering across the whole order book (not just the top 5).'
                  }
                >
                  <span>Total</span>
                  <span>{(isBid ? q.totalBidQty : q.totalAskQty).toLocaleString('en-IN')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t border-gray-200 dark:border-gray-800">
        <DepthStat label="Open" value={formatNum(q.open)} tip="Open :: The first traded price of the day, at 9:15 AM (set by the pre-open auction from 9:00–9:08)." />
        <DepthStat label="High" value={formatNum(q.high)} tip="Day high :: The highest price traded today." />
        <DepthStat label="Low" value={formatNum(q.low)} tip="Day low :: The lowest price traded today." />
        <DepthStat label="Prev. close" value={formatNum(q.prevClose)} tip="Previous close :: Yesterday’s official closing price (the weighted average of the last 30 minutes). Today’s change % is measured from this." />
        <DepthStat label="Volume" value={q.volume.toLocaleString('en-IN')} tip="Volume :: Number of shares traded today. High volume means lots of interest and easy buying/selling (good liquidity)." />
        <DepthStat label="Avg. price" value={formatNum(q.avgPrice)} tip="Average traded price (ATP) :: The volume-weighted average price of all trades today. Traders compare LTP to ATP (similar to VWAP) to judge if the stock is trading rich or cheap intraday." />
        <DepthStat label="52W low" value={formatNum(q.low52w)} className="text-kite-red" tip="52-week low :: The lowest price in the last one year. Falling near it can mean weakness — or a bargain. Do your research." />
        <DepthStat label="52W high" value={formatNum(q.high52w)} className="text-kite-green" tip="52-week high :: The highest price in the last one year. Breaking above it is called a 52-week breakout." />
        <DepthStat
          label="LCL / UCL"
          value={`${formatNum(q.lowerCircuit)} / ${formatNum(q.upperCircuit)}`}
          tip="Lower / Upper circuit limit :: The exchange-set price band for today (2%, 5%, 10% or 20% from previous close). The stock cannot trade outside this band — orders priced beyond it are rejected. :: A stock “locked in upper circuit” has only buyers and no sellers."
        />
        <DepthStat
          label="Hist. IV"
          value={`${(q.annualizedVol * 100).toFixed(1)}%`}
          tip="Historical volatility (annualised) :: How much the price has swung recently, as a yearly %. 30% means a typical yearly move of about ±30%. :: Real Kite shows implied volatility (IV) for options; this simulator uses volatility from past prices."
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Watchlist row                                                       */
/* ------------------------------------------------------------------ */

interface RowProps {
  sym: string;
  inst?: Instrument;
  q?: MarketQuote;
  displaySym: string;
  heldQty: number;
  isSelected: boolean;
  isPhone: boolean;
  explainMode: boolean;
  changeMode: 'PCT' | 'ABS';
  actionsOpen: boolean;
  depthOpen: boolean;
  onToggleActions: (sym: string, open?: boolean) => void;
  onToggleDepth: (sym: string) => void;
  onMore: (sym: string) => void;
}

const hoverBtn =
  'w-6 h-6 rounded border bg-white dark:bg-kite-darkSurface border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-200 hover:border-kite-blue flex items-center justify-center';

const WatchRow: React.FC<RowProps> = ({
  sym,
  inst,
  q,
  displaySym,
  heldQty,
  isSelected,
  isPhone,
  explainMode,
  changeMode,
  actionsOpen,
  depthOpen,
  onToggleActions,
  onToggleDepth,
  onMore,
}) => {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const swipeRef = useRef<{ x: number; y: number; id: number; axis: 'h' | 'v' | null } | null>(null);
  const dxRef = useRef(0);
  const suppressClickUntil = useRef(0);
  const lastPointerType = useRef<string>('mouse');

  const available = Boolean(q?.available);
  const tradable = available && !inst?.isIndex;
  const up = (q?.change ?? 0) >= 0;
  const fno = hasFno(inst);
  const st = useSimulatorStore.getState;

  const buy = () => st().openOrderTicket({ side: 'BUY', symbol: sym });
  const sell = () => st().openOrderTicket({ side: 'SELL', symbol: sym });
  const chart = () => void st().selectSymbol(sym, true);
  const gtt = () => st().openGttModal(sym, heldQty > 0 ? 'SELL' : 'BUY');
  const alert = () => st().openAlertModal(sym);
  const optionChain = () => st().openFnoModal(sym);

  const setOffset = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    lastPointerType.current = e.pointerType;
    if (e.pointerType === 'mouse' || !available || explainMode) return;
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      s.axis = Math.abs(mx) > Math.abs(my) * 1.3 ? 'h' : 'v';
      if (s.axis === 'v') {
        swipeRef.current = null;
        return;
      }
      setDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    setOffset(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, mx)));
  };

  const endSwipe = (commit: boolean) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || s.axis !== 'h') return;
    suppressClickUntil.current = Date.now() + 400;
    const d = dxRef.current;
    setDragging(false);
    setOffset(0);
    if (!commit) return;
    if (d >= SWIPE_TRIGGER) buy();
    else if (d <= -SWIPE_TRIGGER) sell();
  };

  const onRowClick = () => {
    if (Date.now() < suppressClickUntil.current) return;
    void st().selectSymbol(sym, false);
    if (isPhone || lastPointerType.current !== 'mouse') onToggleActions(sym);
  };

  const actionBtn =
    'flex-1 min-w-0 h-11 md:h-9 flex flex-col items-center justify-center gap-0.5 rounded text-[10px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

  return (
    <div className="group relative">
      {/* Swipe backdrop (Kite app: swipe right = Buy, left = Sell) */}
      {dx !== 0 && (
        <div className="absolute inset-x-0 top-0 h-[52px] md:h-[42px] flex items-center justify-between text-white text-xs font-bold">
          <div
            className={`h-full flex items-center pl-4 bg-kite-blue transition-opacity ${dx > 0 ? 'opacity-100' : 'opacity-0'}`}
            style={{ width: Math.max(0, dx) + 8 }}
          >
            {dx >= SWIPE_TRIGGER ? 'BUY ✓' : 'BUY'}
          </div>
          <div
            className={`h-full flex items-center justify-end pr-4 bg-kite-orange transition-opacity ${dx < 0 ? 'opacity-100' : 'opacity-0'}`}
            style={{ width: Math.max(0, -dx) + 8 }}
          >
            {dx <= -SWIPE_TRIGGER ? '✓ SELL' : 'SELL'}
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={-1}
        onClick={onRowClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endSwipe(true)}
        onPointerCancel={() => endSwipe(false)}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
        data-tip={
          isPhone
            ? `${displaySym} :: Tap for Buy / Sell / Chart / Depth and more. Swipe right to Buy, swipe left to Sell — just like the Kite app.`
            : undefined
        }
        className={`relative flex items-center justify-between px-3 h-[52px] md:h-[42px] cursor-pointer ${
          dragging ? '' : 'transition-transform duration-150'
        } ${
          actionsOpen
            ? 'bg-gray-50 dark:bg-[#22262e]'
            : isSelected
              ? 'bg-white dark:bg-kite-darkSurface md:bg-[#f3f8fd] md:dark:bg-[#1d2633]'
              : 'bg-white dark:bg-kite-darkSurface md:hover:bg-gray-50 md:dark:hover:bg-[#22262e]'
        }`}
      >
        {isSelected && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-kite-blue md:hidden" />}

        {/* Left: symbol + tags */}
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-[13px] md:text-xs font-medium truncate ${
                available ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400'
              }`}
            >
              {displaySym}
            </span>
            {heldQty > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] px-1 rounded bg-kite-blue/10 text-kite-blue font-mono font-semibold shrink-0"
                data-tip={`Holding: ${heldQty} shares :: You own ${heldQty} shares of this in your Demat (including any bought today that settle T+1).`}
              >
                <Briefcase className="w-2.5 h-2.5" />
                {heldQty}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className="text-[9px] tracking-wide text-kite-muted"
              data-tip={
                inst?.isIndex
                  ? 'INDEX :: A market index — a number that tracks a basket of stocks. You can’t buy it directly; trade its F&O or an index ETF.'
                  : exchangeTag(inst) === 'BSE'
                    ? 'BSE :: Listed on the Bombay Stock Exchange. Shares bought on BSE or NSE land in the same Demat account.'
                    : 'NSE :: Listed on the National Stock Exchange — India’s largest exchange, with the most trading volume.'
              }
            >
              {exchangeTag(inst)}
            </span>
            {inst?.isEtf && (
              <span
                className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                data-tip="ETF — Exchange Traded Fund :: A fund that holds a basket (e.g. NIFTY 50 stocks or gold) and trades like a share. :: ETFs are a low-cost way to start investing."
              >
                ETF
              </span>
            )}
          </div>
        </div>

        {/* Right: change + LTP */}
        {q?.available ? (
          <div className="flex items-center gap-2 text-xs font-mono shrink-0">
            <span
              className="text-[11px] text-kite-muted dark:text-kite-darkMuted"
              data-tip={
                changeMode === 'ABS'
                  ? 'Day change (₹) :: How many rupees the price moved since yesterday’s close.'
                  : 'Day change (%) :: % move since yesterday’s close. Switch between % and ₹ from the sort menu (⇅).'
              }
            >
              {formatChange(q, changeMode)}
            </span>
            {up ? <ChevronUp className="w-3.5 h-3.5 text-kite-green -mx-1" /> : <ChevronDown className="w-3.5 h-3.5 text-kite-red -mx-1" />}
            <span
              className={`font-semibold w-[72px] text-right text-[13px] md:text-xs ${up ? 'text-kite-green' : 'text-kite-red'}`}
              data-tip="LTP — Last Traded Price :: The price of the most recent trade. Green when above yesterday’s close, red when below."
            >
              {formatNum(q.ltp)}
            </span>
          </div>
        ) : q ? (
          <span
            className="text-[10px] text-kite-muted italic"
            data-tip="Pre-IPO :: This company wasn’t listed yet on the simulated date. It appears with real prices once time reaches its listing date."
          >
            Pre-IPO {q.firstDate ? `(${q.firstDate.slice(0, 4)})` : ''}
          </span>
        ) : (
          <span className="text-[10px] text-kite-muted">…</span>
        )}

        {/* Desktop hover strip (mouse only; touch uses the inline bar) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="hidden [@media(hover:hover)]:md:group-hover:flex items-center gap-1 absolute right-2 top-1/2 -translate-y-1/2 bg-white dark:bg-[#22262e] pl-2 py-0.5 rounded"
        >
          {tradable && (
            <>
              <button
                type="button"
                onClick={buy}
                className="w-6 h-6 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-bold text-[11px]"
                data-tip="Buy (Key: B) :: Opens the order window to buy this stock."
              >
                B
              </button>
              <button
                type="button"
                onClick={sell}
                className="w-6 h-6 rounded bg-kite-orange hover:bg-kite-orangeHover text-white font-bold text-[11px]"
                data-tip="Sell (Key: S) :: Opens the order window to sell. Selling shares you don’t own is only allowed intraday (MIS)."
              >
                S
              </button>
            </>
          )}
          {available && (
            <>
              <button
                type="button"
                onClick={() => onToggleDepth(sym)}
                className={depthOpen ? 'w-6 h-6 rounded border flex items-center justify-center bg-kite-blue text-white border-kite-blue' : hoverBtn}
                data-tip="Market depth (Key: D) :: Top 5 buy bids and sell offers, today’s Open/High/Low, volume, 52-week range and circuit limits. :: Tap any bid/offer price inside depth to pre-fill a limit order."
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={chart}
                className={hoverBtn}
                data-tip="Chart (Key: C) :: Opens the candlestick chart with indicators and your trade markers."
              >
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
              {!inst?.isIndex && (
                <button
                  type="button"
                  onClick={gtt}
                  className={hoverBtn}
                  data-tip="Create GTT — Good Till Triggered (Key: G) :: A standing order valid for up to 1 year: buy when the price dips to your level, or protect a holding with a target + stop-loss (OCO)."
                >
                  <Target className="w-3.5 h-3.5" />
                </button>
              )}
              {fno && (
                <button
                  type="button"
                  onClick={optionChain}
                  className={`${hoverBtn} !w-auto px-1.5 text-[9px] font-bold hover:!border-kite-orange hover:text-kite-orange`}
                  data-tip="F&O — Futures & Options (Key: F) :: Opens the option chain and futures for this symbol. :: Leveraged and risky — beginners should start with regular delivery (CNC) buys."
                >
                  F&O
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => void st().removeSymbolFromWatchlist(sym)}
            className={`${hoverBtn} hover:!border-kite-red hover:text-kite-red`}
            data-tip="Delete (Key: Del) :: Removes this instrument from the current watchlist. You can add it back anytime from search."
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onMore(sym)}
            className={hoverBtn}
            data-tip="More :: Info, create alert, add to basket, move up/down and more."
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline action bar (phones / touch) */}
      {actionsOpen && (
        <div className="px-2 pb-2 pt-1 bg-gray-50 dark:bg-[#22262e] border-t border-gray-100 dark:border-kite-darkBorder/70 space-y-1.5">
          {tradable && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={buy}
                className="flex-1 h-10 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold text-xs"
                data-tip="Buy :: Opens the order window to buy this stock. Shortcut: swipe the row right."
              >
                BUY
              </button>
              <button
                type="button"
                onClick={sell}
                className="flex-1 h-10 rounded bg-kite-orange hover:bg-kite-orangeHover text-white font-semibold text-xs"
                data-tip="Sell :: Opens the order window to sell. Shortcut: swipe the row left. :: Selling shares you don’t own is only allowed intraday (MIS)."
              >
                SELL
              </button>
            </div>
          )}
          <div className="flex gap-1">
            <button type="button" onClick={chart} className={actionBtn} data-tip="Chart :: Opens the candlestick chart for this instrument.">
              <BarChart2 className="w-4 h-4" />
              Chart
            </button>
            {available && (
              <button
                type="button"
                onClick={() => onToggleDepth(sym)}
                className={`${actionBtn} ${depthOpen ? '!text-kite-blue' : ''}`}
                data-tip="Market depth :: Top 5 bids & offers, OHLC, volume, 52-week range and circuit limits."
              >
                <ListOrdered className="w-4 h-4" />
                Depth
              </button>
            )}
            {available && !inst?.isIndex && (
              <button
                type="button"
                onClick={gtt}
                className={actionBtn}
                data-tip="GTT — Good Till Triggered :: Set a price; the order is placed automatically if the stock reaches it (valid up to 1 year)."
              >
                <Target className="w-4 h-4" />
                GTT
              </button>
            )}
            <button
              type="button"
              onClick={alert}
              className={actionBtn}
              data-tip="Create alert :: Get notified when the price (or day change %) crosses a level you choose."
            >
              <Bell className="w-4 h-4" />
              Alert
            </button>
            {fno && available && (
              <button
                type="button"
                onClick={optionChain}
                className={actionBtn}
                data-tip="F&O — Option chain :: Futures and options contracts for this symbol. Leveraged and risky — learn the basics first."
              >
                <span className="text-[11px] font-bold leading-4">F&O</span>
                {inst?.isIndex ? 'Chain' : 'F&O'}
              </button>
            )}
            <button type="button" onClick={() => onMore(sym)} className={actionBtn} data-tip="More :: Info, add to basket, move up/down, remove.">
              <MoreHorizontal className="w-4 h-4" />
              More
            </button>
          </div>
        </div>
      )}

      {depthOpen && q?.available && <DepthPanel sym={sym} inst={inst} q={q} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Marketwatch                                                         */
/* ------------------------------------------------------------------ */

export const Marketwatch: React.FC = () => {
  const {
    profile,
    quotes,
    instruments,
    instrumentsMap,
    mobileWatchlistOpen,
    capabilities,
    tipMode,
    selectSymbol,
    setActiveWatchlist,
    addSymbolToWatchlist,
    removeSymbolFromWatchlist,
    moveWatchlistSymbol,
    renameWatchlist,
    updateSettings,
    addCustomRemoteStock,
    openOrderTicket,
    openAlertModal,
    setActiveTab,
    pushToast,
    fetchQuotes,
  } = useSimulatorStore();

  const isPhone = useIsPhone();
  const searchRef = useRef<HTMLInputElement>(null);
  const requestedRef = useRef<Set<string>>(new Set());

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('ALL');
  const [highlight, setHighlight] = useState(0);
  const [remoteHits, setRemoteHits] = useState<RemoteHit[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [depthSym, setDepthSym] = useState<string | null>(null);
  const [actionsSym, setActionsSym] = useState<string | null>(null);
  const [moreSym, setMoreSym] = useState<string | null>(null);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const blind = Boolean(profile?.blindMode);
  const trimmedQuery = query.trim().toUpperCase();

  /* Remote (Yahoo) search — server mode only */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || blind || !capabilities.remoteSearch) {
      setRemoteHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingRemote(true);
      try {
        const { data } = await api('GET', '/search', undefined, { q: trimmed });
        setRemoteHits(data.remote || []);
      } catch {
        setRemoteHits([]);
      } finally {
        setSearchingRemote(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, blind, capabilities.remoteSearch]);

  /* Local search: prefix matches first, then contains; symbol, name and sector */
  const localMatches: Instrument[] = useMemo(() => {
    if (!trimmedQuery) return [];
    const scored: Array<{ inst: Instrument; score: number; sym: string }> = [];
    for (const inst of instruments) {
      if (filter === 'EQ' && (inst.isIndex || inst.isEtf)) continue;
      if (filter === 'INDEX' && !inst.isIndex) continue;
      if (filter === 'ETF' && !inst.isEtf) continue;
      if (filter === 'FNO' && !hasFno(inst)) continue;
      const sym = getDisplaySymbol(inst.symbol, instrumentsMap, blind).toUpperCase();
      const name = getDisplayName(inst.symbol, instrumentsMap, blind).toUpperCase();
      const sector = (inst.sector || '').toUpperCase();
      let score = -1;
      if (sym === trimmedQuery) score = 0;
      else if (sym.startsWith(trimmedQuery)) score = 1;
      else if (name.startsWith(trimmedQuery)) score = 2;
      else if (name.split(/[\s&.-]+/).some((w) => w.startsWith(trimmedQuery))) score = 3;
      else if (sym.includes(trimmedQuery)) score = 4;
      else if (name.includes(trimmedQuery)) score = 5;
      else if (sector.includes(trimmedQuery)) score = 6;
      if (score >= 0) scored.push({ inst, score, sym });
    }
    scored.sort((a, b) => a.score - b.score || a.sym.localeCompare(b.sym));
    return scored.slice(0, MAX_RESULTS).map((s) => s.inst);
  }, [trimmedQuery, filter, instruments, instrumentsMap, blind]);

  useEffect(() => setHighlight(0), [trimmedQuery, filter]);

  /* Keyboard shortcuts dispatched by App.tsx */
  useEffect(() => {
    const onShortcut = (e: Event) => {
      const kind = (e as CustomEvent<string>).detail;
      const st = useSimulatorStore.getState();
      const prof = st.profile;
      if (kind === 'focus-search') {
        setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      if (!prof) return;
      const sel = prof.selectedSymbol;
      if (kind === 'toggle-depth') {
        setDepthSym((cur) => (cur === sel ? null : sel));
      } else if (kind === 'remove-selected') {
        const wl = prof.watchlists.find((w) => w.id === prof.activeWatchlistId);
        if (sel && wl?.symbols.includes(sel)) void st.removeSymbolFromWatchlist(sel);
      }
    };
    window.addEventListener('kite-shortcut', onShortcut);
    return () => window.removeEventListener('kite-shortcut', onShortcut);
  }, []);

  const activeWatchlist = profile
    ? profile.watchlists.find((w) => w.id === profile.activeWatchlistId) || profile.watchlists[0]
    : undefined;

  /* Fetch quotes for visible symbols the engine isn't tracking (or that are stale) */
  const currentDate = profile?.currentDate || '';
  const visibleSymbols = useMemo(() => {
    const set = new Set<string>(activeWatchlist?.symbols || []);
    for (const s of profile?.pinnedIndices || []) set.add(s);
    for (const i of localMatches) set.add(i.symbol);
    return Array.from(set);
  }, [activeWatchlist?.symbols, profile?.pinnedIndices, localMatches]);

  const missingKey = visibleSymbols
    .filter((s) => {
      const q = quotes[s];
      return !q || (q.date !== undefined && q.date !== currentDate);
    })
    .join('|');

  useEffect(() => {
    if (!missingKey) return;
    const timer = setTimeout(() => {
      const todo = missingKey.split('|').filter((s) => !requestedRef.current.has(`${s}@${currentDate}`));
      if (todo.length === 0) return;
      for (const s of todo) requestedRef.current.add(`${s}@${currentDate}`);
      void fetchQuotes(todo);
    }, 200);
    return () => clearTimeout(timer);
  }, [missingKey, currentDate, fetchQuotes]);

  if (!profile || !activeWatchlist) return null;

  const settings = profile.settings || {};
  const sortKey: SortKey = settings.watchlistSort || 'NONE';
  const changeMode: 'PCT' | 'ABS' = settings.watchlistChange || 'PCT';
  const explainMode = tipMode === 'EXPLAIN';

  const holdingsQtyMap: Record<string, number> = {};
  for (const h of profile.holdings) holdingsQtyMap[h.symbol] = h.qty + h.t1Qty;

  const disp = (s: string) => getDisplaySymbol(s, instrumentsMap, blind);

  const rows = [...activeWatchlist.symbols];
  if (sortKey !== 'NONE') {
    rows.sort((a, b) => {
      const qa = quotes[a];
      const qb = quotes[b];
      if (sortKey === 'CHANGE') return (qb?.changePct ?? -Infinity) - (qa?.changePct ?? -Infinity);
      if (sortKey === 'LTP') return (qb?.ltp ?? -Infinity) - (qa?.ltp ?? -Infinity);
      if (sortKey === 'EXCHANGE') {
        const c = exchangeTag(instrumentsMap[a]).localeCompare(exchangeTag(instrumentsMap[b]));
        if (c !== 0) return c;
      }
      return disp(a).localeCompare(disp(b));
    });
  }

  const indianRemoteHits = remoteHits.filter((h) => h.isIndian !== false && !h.alreadySynced);
  const globalRemoteHits = remoteHits.filter((h) => h.isIndian === false && !h.alreadySynced);

  const clearSearch = () => {
    setQuery('');
    setFilter('ALL');
  };

  const addFromSearch = (sym: string) => {
    if (!activeWatchlist.symbols.includes(sym)) void addSymbolToWatchlist(sym);
    else void selectSymbol(sym, false);
    clearSearch();
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      clearSearch();
      e.currentTarget.blur();
      return;
    }
    if (!trimmedQuery || localMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(localMatches.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = localMatches[highlight];
      if (hit) addFromSearch(hit.symbol);
    }
  };

  const startRename = () => {
    setRenameValue(activeWatchlist.name);
    setRenaming(true);
  };
  const commitRename = () => {
    const name = renameValue.trim().slice(0, 24);
    setRenaming(false);
    if (name && name !== activeWatchlist.name) void renameWatchlist(activeWatchlist.id, name);
  };

  const toggleActions = (sym: string, open?: boolean) =>
    setActionsSym((cur) => ((open ?? cur !== sym) ? sym : null));
  const toggleDepth = (sym: string) => setDepthSym((cur) => (cur === sym ? null : sym));
  const openMore = (sym: string) => {
    setMoreInfoOpen(false);
    setMoreSym(sym);
  };

  const moreInst = moreSym ? instrumentsMap[moreSym] : undefined;
  const moreQuote = moreSym ? quotes[moreSym] : undefined;
  const moreIdx = moreSym ? activeWatchlist.symbols.indexOf(moreSym) : -1;

  return (
    <aside
      className={`${
        mobileWatchlistOpen ? 'flex' : 'hidden'
      } md:flex w-full md:w-[275px] xl:w-[345px] shrink-0 border-r border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface flex-col h-full select-none`}
    >
      {/* Pinned indices (phones — on desktop they live in the top bar) */}
      <div className="md:hidden flex border-b border-kite-border dark:border-kite-darkBorder">
        {profile.pinnedIndices.map((idxSym, i) => {
          const q = quotes[idxSym];
          const up = (q?.change ?? 0) >= 0;
          return (
            <button
              key={idxSym}
              type="button"
              onClick={() => void selectSymbol(idxSym, true)}
              className={`flex-1 min-w-0 min-h-[44px] px-3 py-1.5 text-left ${i > 0 ? 'border-l border-kite-border dark:border-kite-darkBorder' : ''}`}
              data-tip={`${disp(idxSym)} :: A pinned market index — the overall mood of the market. Tap to open its chart. :: You can’t buy an index directly; use an index ETF like NIFTYBEES or its F&O.`}
            >
              <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 truncate">{disp(idxSym)}</div>
              {q?.available ? (
                <div className="flex items-baseline gap-1.5 font-mono">
                  <span className={`text-xs font-semibold ${up ? 'text-kite-green' : 'text-kite-red'}`}>{formatNum(q.ltp)}</span>
                  <span className="text-[10px] text-kite-muted">{formatChange(q, changeMode)}</span>
                </div>
              ) : (
                <div className="text-[10px] text-kite-muted">—</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative p-2.5 border-b border-kite-border dark:border-kite-darkBorder">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-kite-muted absolute left-2.5 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            enterKeyHint="search"
            placeholder={blind ? 'Search masked code or sector (e.g. BANK, IT, ETF)' : 'Search eg: infy bse, nifty fut, gold etf'}
            data-tip="Search & add instruments (Key: /) :: Type a symbol, company name or sector. Tap + to add it to this watchlist (max 50 per list), or B / S to trade directly. :: Use ↑ ↓ to move through results and Enter to add."
            className="w-full pl-8 pr-14 h-10 md:h-8 text-[13px] md:text-xs rounded border border-gray-200 dark:border-kite-darkBorder bg-gray-50/70 dark:bg-kite-darkBg text-gray-800 dark:text-gray-100 placeholder:text-kite-muted focus:outline-none focus:border-kite-blue focus:bg-white dark:focus:bg-kite-darkSurface"
          />
          {query ? (
            <button type="button" onClick={clearSearch} className="absolute right-1 p-2 text-gray-400 hover:text-gray-600" aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span
              className="absolute right-2.5 text-[10px] font-mono text-kite-muted"
              data-tip="Watchlist size :: Instruments in this watchlist out of the 50 Kite allows per list. You have 7 lists."
            >
              {activeWatchlist.symbols.length}/50
            </span>
          )}
        </div>

        {trimmedQuery.length > 0 && (
          <div className="absolute left-0 right-0 top-[52px] md:top-11 z-40 mx-2 bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder rounded shadow-xl max-h-[60dvh] md:max-h-[420px] flex flex-col">
            {/* Filter chips */}
            <div className="flex gap-1 px-2 py-1.5 border-b border-gray-100 dark:border-kite-darkBorder overflow-x-auto no-scrollbar shrink-0">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  data-tip={f.tip}
                  className={`px-2.5 h-8 md:h-6 rounded-full text-[11px] font-medium whitespace-nowrap border ${
                    filter === f.id
                      ? 'border-kite-blue bg-kite-blue/10 text-kite-blue'
                      : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto divide-y divide-gray-100 dark:divide-kite-darkBorder">
              {localMatches.map((inst, idx) => {
                const inWl = activeWatchlist.symbols.includes(inst.symbol);
                const q = quotes[inst.symbol];
                const up = (q?.change ?? 0) >= 0;
                return (
                  <div
                    key={inst.symbol}
                    onMouseEnter={() => setHighlight(idx)}
                    className={`flex items-center justify-between px-3 py-2 min-h-[48px] text-xs ${
                      idx === highlight ? 'bg-gray-50 dark:bg-gray-800/70' : ''
                    }`}
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => {
                        void selectSymbol(inst.symbol, true);
                        clearSearch();
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-800 dark:text-gray-100">{disp(inst.symbol)}</span>
                        <span className="text-[9px] px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{exchangeTag(inst)}</span>
                        {inst.isEtf && <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">ETF</span>}
                        {hasFno(inst) && !inst.isIndex && <span className="text-[9px] px-1 rounded bg-kite-orange/10 text-kite-orange">F&O</span>}
                      </div>
                      <div className="text-[11px] text-kite-muted truncate">
                        {getDisplayName(inst.symbol, instrumentsMap, blind)}
                        {inst.sector ? ` · ${inst.sector}` : ''}
                      </div>
                    </div>

                    {q?.available && (
                      <div className="text-right font-mono mx-2 shrink-0">
                        <div className={`text-[11px] font-semibold ${up ? 'text-kite-green' : 'text-kite-red'}`}>{formatNum(q.ltp)}</div>
                        <div className="text-[10px] text-kite-muted">{formatPct(q.changePct)}</div>
                      </div>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      {!inst.isIndex && q?.available !== false && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              openOrderTicket({ side: 'BUY', symbol: inst.symbol });
                              clearSearch();
                            }}
                            className="w-9 h-9 md:w-6 md:h-6 rounded bg-kite-blue text-white font-bold text-[11px] hover:bg-kite-blueHover"
                            data-tip="Buy :: Open a buy order for this instrument without adding it to the watchlist."
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openOrderTicket({ side: 'SELL', symbol: inst.symbol });
                              clearSearch();
                            }}
                            className="w-9 h-9 md:w-6 md:h-6 rounded bg-kite-orange text-white font-bold text-[11px] hover:bg-kite-orangeHover"
                            data-tip="Sell :: Open a sell order for this instrument."
                          >
                            S
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => addFromSearch(inst.symbol)}
                        disabled={inWl}
                        className={`w-9 h-9 md:w-6 md:h-6 flex items-center justify-center rounded border ${
                          inWl
                            ? 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-600 cursor-default'
                            : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-kite-blue hover:text-kite-blue'
                        }`}
                        data-tip={inWl ? 'Already added :: This instrument is already in the current watchlist.' : 'Add to watchlist :: Adds this instrument to the current watchlist (max 50).'}
                      >
                        {inWl ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}

              {capabilities.remoteSearch && !blind && indianRemoteHits.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#14171d] text-[10px] font-semibold uppercase tracking-wider text-kite-muted">
                    Fetch 25-Yr History from NSE / BSE Live
                  </div>
                  {indianRemoteHits.map((hit) => (
                    <div key={hit.yahooTicker} className="flex items-center justify-between px-3 py-2 min-h-[48px] hover:bg-blue-50/40 dark:hover:bg-gray-800/70 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-800 dark:text-gray-100">{hit.symbol}</span>
                          <span className="text-[10px] px-1 rounded bg-blue-50 dark:bg-blue-950/60 text-kite-blue">{hit.exchangeLabel || hit.exchange}</span>
                        </div>
                        <div className="text-[11px] text-kite-muted truncate">{hit.name}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void addCustomRemoteStock(hit);
                          clearSearch();
                        }}
                        className="px-2 h-9 md:h-7 rounded bg-kite-blue hover:bg-kite-blueHover text-white text-[11px] font-semibold shrink-0 ml-2"
                      >
                        + Sync & Add
                      </button>
                    </div>
                  ))}
                </>
              )}

              {capabilities.remoteSearch && !blind && globalRemoteHits.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-amber-50/80 dark:bg-amber-950/30 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    US / Global Stock (Real Zerodha trades NSE/BSE India only)
                  </div>
                  {globalRemoteHits.map((hit) => (
                    <div key={hit.yahooTicker} className="flex items-center justify-between px-3 py-2 min-h-[48px] hover:bg-amber-50/40 dark:hover:bg-gray-800/70 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-800 dark:text-gray-100">{hit.symbol}</span>
                          <span className="text-[10px] px-1 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">{hit.exchangeLabel || 'US'}</span>
                        </div>
                        <div className="text-[11px] text-kite-muted truncate">{hit.name}</div>
                        <div className="text-[10px] text-amber-700 dark:text-amber-400/90 leading-tight mt-0.5">
                          Not on NSE/BSE — use MON100 ETF for US tech, or sync for chart practice
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void addCustomRemoteStock(hit);
                          clearSearch();
                        }}
                        className="px-2 h-9 md:h-7 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold shrink-0 ml-2"
                      >
                        + Sync Practice
                      </button>
                    </div>
                  ))}
                </>
              )}

              {localMatches.length === 0 && indianRemoteHits.length === 0 && globalRemoteHits.length === 0 && (
                <div className="p-4 text-center text-xs text-kite-muted">
                  {searchingRemote ? 'Searching NSE/BSE & global symbols...' : 'No matching instruments found.'}
                </div>
              )}

              {!capabilities.remoteSearch && (
                <div className="px-3 py-2 text-[10.5px] leading-snug text-kite-muted bg-slate-50 dark:bg-[#14171d]">
                  Can't find it? Add tickers to <span className="font-mono">universe/extra.csv</span> — they're included in the next weekly data update.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Watchlist subheader: name (renamable) + sort menu */}
      <div className="relative flex items-center justify-between gap-2 px-3 h-10 md:h-8 text-[11px] bg-gray-50/60 dark:bg-[#161920] border-b border-kite-border dark:border-kite-darkBorder text-kite-muted">
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            maxLength={24}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              else if (e.key === 'Escape') setRenaming(false);
            }}
            className="flex-1 min-w-0 px-2 h-8 md:h-6 text-xs rounded border border-kite-blue bg-white dark:bg-kite-darkBg text-gray-800 dark:text-gray-100 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => isPhone && startRename()}
            onDoubleClick={startRename}
            className="group/name flex items-center gap-1.5 min-w-0 h-full font-semibold text-gray-600 dark:text-gray-300"
            data-tip="Watchlist name :: Tap (or double-click) to rename this watchlist — e.g. “Banks”, “Long-term”, “Ideas”."
          >
            <span className="truncate">
              {activeWatchlist.id}. {activeWatchlist.name}
            </span>
            <span className="font-normal text-kite-muted">({activeWatchlist.symbols.length})</span>
            <Pencil
              className="w-3 h-3 shrink-0 opacity-60 md:opacity-0 md:group-hover/name:opacity-60"
              onClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
            />
          </button>
        )}
        <button
          type="button"
          onClick={() => setSortMenuOpen((o) => !o)}
          className={`flex items-center gap-1 h-full px-1 shrink-0 ${sortKey !== 'NONE' ? 'text-kite-blue' : ''}`}
          data-tip="Sort & display :: Sort the list by % change, LTP, name or exchange, and choose whether change shows in % or ₹."
        >
          <ArrowDownUp className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">{sortKey === 'NONE' ? 'Sort' : SORT_OPTIONS.find((o) => o.id === sortKey)?.label}</span>
        </button>

        {sortMenuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
            <div className="absolute right-2 top-full mt-1 z-40 w-56 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface shadow-xl py-1 text-xs text-gray-700 dark:text-gray-200">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-kite-muted">Sort by</div>
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    void updateSettings({ watchlistSort: o.id });
                    setSortMenuOpen(false);
                  }}
                  data-tip={o.tip}
                  className="w-full flex items-center justify-between px-3 h-10 md:h-8 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span>{o.label}</span>
                  {sortKey === o.id && <Check className="w-3.5 h-3.5 text-kite-blue" />}
                </button>
              ))}
              <div className="mt-1 pt-1 border-t border-gray-100 dark:border-kite-darkBorder px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-kite-muted">
                Show change as
              </div>
              <div className="flex gap-1 px-3 pb-2">
                {(['PCT', 'ABS'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => void updateSettings({ watchlistChange: m })}
                    data-tip={
                      m === 'PCT'
                        ? 'Change in % :: Shows how much each instrument moved today in percent — best for comparing stocks.'
                        : 'Change in ₹ :: Shows how many rupees each instrument moved today.'
                    }
                    className={`flex-1 h-9 md:h-7 rounded border text-[11px] font-semibold ${
                      changeMode === m ? 'border-kite-blue bg-kite-blue/10 text-kite-blue' : 'border-gray-200 dark:border-kite-darkBorder'
                    }`}
                  >
                    {m === 'PCT' ? '% change' : '₹ change'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Scrip list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-gray-100 dark:divide-kite-darkBorder/70">
        {rows.length === 0 && (
          <div className="p-6 text-center text-xs text-kite-muted leading-relaxed">
            This watchlist is empty.
            <br />
            Use the search bar above to add stocks, ETFs or indices.
          </div>
        )}
        {rows.map((sym) => (
          <WatchRow
            key={sym}
            sym={sym}
            inst={instrumentsMap[sym]}
            q={quotes[sym]}
            displaySym={disp(sym)}
            heldQty={holdingsQtyMap[sym] || 0}
            isSelected={profile.selectedSymbol === sym}
            isPhone={isPhone}
            explainMode={explainMode}
            changeMode={changeMode}
            actionsOpen={actionsSym === sym}
            depthOpen={depthSym === sym}
            onToggleActions={toggleActions}
            onToggleDepth={toggleDepth}
            onMore={openMore}
          />
        ))}
        {isPhone && rows.length > 0 && (
          <div className="px-3 py-3 text-center text-[10px] text-kite-muted">Tip: swipe a row right to Buy, left to Sell.</div>
        )}
      </div>

      {/* Bottom 7 watchlist tabs */}
      <div className="flex items-center justify-between border-t border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface px-1">
        <div className="flex items-center flex-1">
          {profile.watchlists.map((wl) => {
            const active = wl.id === profile.activeWatchlistId;
            return (
              <button
                key={wl.id}
                type="button"
                onClick={() => {
                  setActionsSym(null);
                  setDepthSym(null);
                  void setActiveWatchlist(wl.id);
                }}
                data-tip={`Watchlist ${wl.id} — ${wl.name} :: Switch to watchlist ${wl.id} (${wl.symbols.length} instruments). Kite gives you 7 watchlists of up to 50 instruments each. :: Keyboard: press ${wl.id}.`}
                className={`flex-1 h-11 md:h-9 text-xs font-semibold border-t-2 transition-colors ${
                  active
                    ? 'border-kite-orange text-kite-orange bg-orange-50/30 dark:bg-orange-950/15'
                    : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {wl.id}
              </button>
            );
          })}
        </div>
        <div
          className="px-2 text-kite-muted"
          data-tip="7 watchlists :: Like real Kite, tabs 1–7 let you group instruments — e.g. bluechips, banks, ETFs, ideas. Rename a list by tapping its name above."
        >
          <Layers className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* "More" sheet */}
      {moreSym && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/50" onClick={() => setMoreSym(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-sm rounded-t-xl md:rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)] text-xs"
          >
            <div className="sticky top-0 bg-white dark:bg-kite-darkSurface flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-kite-darkBorder">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-gray-800 dark:text-white">{disp(moreSym)}</div>
                <div className="text-[11px] text-kite-muted truncate">{getDisplayName(moreSym, instrumentsMap, blind)}</div>
              </div>
              <button type="button" onClick={() => setMoreSym(null)} className="p-2 -mr-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const item = 'w-full flex items-center gap-3 px-4 h-12 md:h-10 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent';
              const close = () => setMoreSym(null);
              const sym = moreSym;
              const reorderDisabled = sortKey !== 'NONE';
              return (
                <div className="py-1">
                  <button
                    type="button"
                    className={item}
                    onClick={() => setMoreInfoOpen((o) => !o)}
                    data-tip="Info :: Company name, sector, F&O lot size and listing date."
                  >
                    <Info className="w-4 h-4 text-kite-muted" />
                    <span className="flex-1">Info</span>
                    {moreInfoOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {moreInfoOpen && (
                    <div className="mx-4 mb-2 p-3 rounded bg-slate-50 dark:bg-[#14171d] grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px]">
                      <span className="text-kite-muted">Name</span>
                      <span className="text-right">{getDisplayName(sym, instrumentsMap, blind)}</span>
                      <span className="text-kite-muted">Type</span>
                      <span className="text-right">{moreInst?.isIndex ? 'Index' : moreInst?.isEtf ? 'ETF' : 'Equity (stock)'}</span>
                      <span className="text-kite-muted">Exchange</span>
                      <span className="text-right">{exchangeTag(moreInst)}</span>
                      <span className="text-kite-muted">Sector</span>
                      <span className="text-right">{moreInst?.sector || '—'}</span>
                      <span className="text-kite-muted" data-tip="Lot size :: F&O contracts trade in fixed lots. One NIFTY lot, for example, is a set number of units — you can’t buy fewer.">
                        F&O lot size
                      </span>
                      <span className="text-right font-mono">{hasFno(moreInst) && moreInst ? moreInst.lotSize : 'No F&O'}</span>
                      <span className="text-kite-muted" data-tip="Listed since :: The first date this simulator has price data for (usually the listing date or 2000, whichever is later).">
                        Listed since
                      </span>
                      <span className="text-right font-mono">{moreInst?.firstDate || moreQuote?.firstDate || '—'}</span>
                      {holdingsQtyMap[sym] > 0 && (
                        <>
                          <span className="text-kite-muted">You hold</span>
                          <span className="text-right font-mono">{holdingsQtyMap[sym]} shares</span>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className={item}
                    onClick={() => {
                      close();
                      openAlertModal(sym);
                    }}
                    data-tip="Create alert (Key: A) :: Get a notification when the price or day change % crosses your level. Optionally fire a basket order (Alert Trigger Order)."
                  >
                    <Bell className="w-4 h-4 text-kite-muted" />
                    Create alert
                  </button>
                  {!moreInst?.isIndex && (
                    <button
                      type="button"
                      className={item}
                      onClick={() => {
                        close();
                        setActiveTab('SIP_BASKETS');
                        pushToast('info', 'Add to basket', `Open or create a basket and add ${disp(sym)} to it.`);
                      }}
                      data-tip="Add to basket :: Baskets let you place up to 20 orders in one go. Opens Baskets so you can add this instrument."
                    >
                      <ShoppingBasket className="w-4 h-4 text-kite-muted" />
                      Add to basket
                    </button>
                  )}
                  {moreQuote?.available && (
                    <button
                      type="button"
                      className={item}
                      onClick={() => {
                        close();
                        setDepthSym(sym);
                      }}
                      data-tip="Market depth :: Top 5 bids and offers plus OHLC, volume and circuit limits."
                    >
                      <ListOrdered className="w-4 h-4 text-kite-muted" />
                      Market depth
                    </button>
                  )}
                  <button
                    type="button"
                    className={item}
                    onClick={() => {
                      close();
                      void selectSymbol(sym, true);
                    }}
                    data-tip="Chart :: Opens the candlestick chart."
                  >
                    <BarChart2 className="w-4 h-4 text-kite-muted" />
                    Chart
                  </button>
                  <button
                    type="button"
                    className={item}
                    disabled={reorderDisabled || moreIdx <= 0}
                    onClick={() => void moveWatchlistSymbol(sym, -1)}
                    data-tip={reorderDisabled ? 'Move up :: Turn sorting off (Sort → Manual) to reorder the list by hand.' : 'Move up :: Moves this instrument one place up in the watchlist.'}
                  >
                    <ArrowUp className="w-4 h-4 text-kite-muted" />
                    Move up
                  </button>
                  <button
                    type="button"
                    className={item}
                    disabled={reorderDisabled || moreIdx < 0 || moreIdx >= activeWatchlist.symbols.length - 1}
                    onClick={() => void moveWatchlistSymbol(sym, 1)}
                    data-tip={reorderDisabled ? 'Move down :: Turn sorting off (Sort → Manual) to reorder the list by hand.' : 'Move down :: Moves this instrument one place down in the watchlist.'}
                  >
                    <ArrowDown className="w-4 h-4 text-kite-muted" />
                    Move down
                  </button>
                  {reorderDisabled && <div className="px-4 pb-1 text-[10px] text-kite-muted">Reordering works when sort is set to Manual.</div>}
                  <button
                    type="button"
                    className={`${item} !text-kite-red`}
                    onClick={() => {
                      close();
                      setActionsSym(null);
                      void removeSymbolFromWatchlist(sym);
                    }}
                    data-tip="Remove :: Deletes this instrument from the current watchlist (not from your holdings)."
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove from watchlist
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </aside>
  );
};
