import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Layers, LineChart, Minus, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { api } from '../api/client.ts';
import type { BasketItem, FuturesContractQuote, OptionContractQuote, OrderBasket, OrderSide } from '../types/simulator.ts';
import { priceDerivativeContractKey, type ExpiryInfo } from '../engine/optionsPricing.ts';
import { formatINR, formatNum, getDisplaySymbol, maskContractDisplay } from '../utils/format.ts';
import { PayoffChart, type PayoffLeg } from './chart/PayoffChart.tsx';
import { readLocalRaw, useIsPhone, writeLocal } from './chart/useIsPhone.ts';

const STRATEGY_BASKET_NAME = 'Option strategy';

type Tab = 'CHAIN' | 'FUTURES' | 'PAYOFF';
type Leg = 'CE' | 'PE';

interface SheetTarget {
  kind: 'CE' | 'PE' | 'FUT';
  contractKey: string;
  displaySymbol: string;
  strike?: number;
  expiryDate: string;
  lotSize: number;
  ltp: number;
  /** Greeks / stats for display */
  info?: OptionContractQuote['ce'];
}

function compactQty(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}k`;
  return `${s}${a}`;
}

const TIPS = {
  oi: 'Open Interest (OI) :: Total number of option contracts (shown in shares) still open — not yet squared off or expired. :: Big call OI at a strike often acts like resistance; big put OI like support, because option writers defend those levels.',
  oiChg: 'OI change :: How much open interest grew (+) or shrank (−) versus the previous session. :: Rising price + rising OI = fresh positions building. Falling OI = traders closing out.',
  volume: 'Volume :: Number of contracts (in shares) traded today at this strike. :: High volume = liquid strike with tighter bid/ask spreads — easier to enter and exit.',
  iv: 'Implied Volatility (IV) :: The volatility the option price is “implying” for the future, as a yearly %. Higher IV = more expensive options. :: Buying options when IV is very high is risky — IV often falls after events (IV crush).',
  delta: 'Delta :: How much the option price moves for a ₹1 move in the underlying. Calls: 0 to 1, Puts: 0 to −1. :: Delta ≈ rough probability the option expires in-the-money. ATM ≈ 0.5.',
  gamma: 'Gamma :: How fast Delta changes for a ₹1 move in the underlying. Highest for at-the-money options close to expiry. :: High gamma = option price can swing wildly — great for buyers, dangerous for sellers.',
  vega: 'Vega :: Rupees the premium gains (or loses) when implied volatility rises (or falls) by 1 point. :: Long options are long vega — they benefit when volatility rises.',
  theta: 'Theta :: Rupees of premium the option loses per day just from time passing (time decay). :: Option buyers fight theta every day; option sellers earn it. Decay speeds up sharply in the last week.',
  ltp: 'Last Traded Price (LTP) :: The current premium per share of this option. Multiply by lot size for the cost of one lot. :: Premium = intrinsic value + time value.',
  chg: '% Change :: Premium change versus yesterday’s close. Options move far more (in %) than the underlying — that is leverage.',
  strike: 'Strike price :: The price at which the option lets you buy (call) or sell (put) the underlying at expiry. :: Shaded cells are in-the-money (ITM): calls below spot, puts above spot.',
  bs: 'Buy / Sell :: B buys the option (pay premium, limited risk). S sells / writes it (receive premium, needs big margin, risk can be unlimited). :: Beginners usually start by buying or with hedged spreads.',
  basket: 'Add to strategy basket :: Adds this contract (BUY or SELL, any number of lots) to the “Option strategy” basket so you can see the combined payoff and place all legs together.',
};

export const FnoChainModal: React.FC = () => {
  const { fnoModal, closeFnoModal, profile, instrumentsMap, openOrderTicket, saveBasket, executeBasket } =
    useSimulatorStore();
  const isPhone = useIsPhone();

  const [expiryInfo, setExpiryInfo] = useState<ExpiryInfo[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [futures, setFutures] = useState<FuturesContractQuote[]>([]);
  const [options, setOptions] = useState<OptionContractQuote[]>([]);
  const [atmStrike, setAtmStrike] = useState<number>(0);
  const [spotLtp, setSpotLtp] = useState<number>(0);
  const [spotVol, setSpotVol] = useState<number>(0.2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('CHAIN');
  const [showGreeks, setShowGreeks] = useState<boolean>(() => readLocalRaw('kite.fno.greeks') === '1');
  const [compactPref, setCompactPref] = useState<string | null>(() => readLocalRaw('kite.fno.compact'));
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [sheetSide, setSheetSide] = useState<OrderSide>('BUY');
  const [sheetLots, setSheetLots] = useState(1);
  const [payoffSource, setPayoffSource] = useState<'BASKET' | 'POSITIONS'>('BASKET');

  const compact = compactPref === null ? isPhone : compactPref === '1';

  // Reset expiry when the underlying changes
  useEffect(() => {
    setSelectedExpiry('');
    setTab('CHAIN');
  }, [fnoModal.symbol]);

  useEffect(() => {
    if (!fnoModal.open || !profile) return;
    let cancelled = false;
    async function fetchChain() {
      setLoading(true);
      try {
        const query: Record<string, string> = {
          symbol: fnoModal.symbol,
          date: profile!.currentDate,
          intraday: String(profile!.intraday.enabled),
          step: String(profile!.intraday.stepIndex),
        };
        if (selectedExpiry) query.expiry = selectedExpiry;
        const { data, ok } = await api('GET', '/fno/chain', undefined, query);
        if (cancelled) return;
        if (ok && data.ok) {
          const info: ExpiryInfo[] =
            data.expiryInfo ||
            (data.expiries || []).map((d: string) => ({ date: d, kind: 'M' as const, daysToExpiry: 0 }));
          setExpiryInfo(info);
          if (data.selectedExpiry && data.selectedExpiry !== selectedExpiry) setSelectedExpiry(data.selectedExpiry);
          setFutures(data.futures || []);
          setOptions(data.options || []);
          setAtmStrike(data.atmStrike || 0);
          setSpotLtp(data.quote?.ltp || 0);
          setSpotVol(data.quote?.annualizedVol || 0.2);
          setError(null);
        } else {
          setError(data?.message || 'Option chain unavailable for this date.');
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchChain();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fnoModal.open, fnoModal.symbol, profile?.currentDate, profile?.intraday.enabled, profile?.intraday.stepIndex, profile?.id, selectedExpiry]);

  useEffect(() => {
    if (!fnoModal.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sheet) setSheet(null);
        else closeFnoModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fnoModal.open, sheet, closeFnoModal]);

  // ---- Derived chain statistics ----
  const stats = useMemo(() => {
    if (!options.length) return null;
    let ceOi = 0;
    let peOi = 0;
    let maxOi = 1;
    for (const r of options) {
      ceOi += r.ce.oi;
      peOi += r.pe.oi;
      maxOi = Math.max(maxOi, r.ce.oi, r.pe.oi);
    }
    // Max pain: strike where option WRITERS pay out the least at expiry.
    let maxPain = options[0].strike;
    let minPayout = Infinity;
    for (const k of options) {
      let payout = 0;
      for (const r of options) {
        payout += r.ce.oi * Math.max(0, k.strike - r.strike) + r.pe.oi * Math.max(0, r.strike - k.strike);
      }
      if (payout < minPayout) {
        minPayout = payout;
        maxPain = k.strike;
      }
    }
    const atmRow = options.find((r) => r.strike === atmStrike) || options[Math.floor(options.length / 2)];
    return {
      pcr: ceOi > 0 ? peOi / ceOi : 0,
      maxPain,
      maxOi,
      atmIv: (atmRow.ce.iv + atmRow.pe.iv) / 2,
      lot: atmRow.lotSize,
      dte: atmRow.daysToExpiry,
      totalCeOi: ceOi,
      totalPeOi: peOi,
    };
  }, [options, atmStrike]);

  if (!fnoModal.open || !profile) return null;

  const underlying = fnoModal.symbol;
  const dispSym = getDisplaySymbol(underlying, instrumentsMap, profile.blindMode);
  const mask = (s: string) => maskContractDisplay(s, underlying, instrumentsMap, profile.blindMode);
  const strategyBasket = profile.baskets.find((b) => b.name === STRATEGY_BASKET_NAME);
  const strategyItems = (strategyBasket?.items || []).filter((i) => i.symbol === underlying && i.instrumentType !== 'EQ');
  const fnoPositions = profile.positions.filter(
    (p) => p.underlyingSymbol === underlying && p.instrumentType !== 'EQ' && p.netQty !== 0
  );

  const expiryLabel = (e: ExpiryInfo, idx: number) => {
    if (profile.blindMode) {
      const sameKindIdx = expiryInfo.slice(0, idx + 1).filter((x) => x.kind === e.kind).length;
      return `${e.kind === 'W' ? 'Week' : 'Month'} ${sameKindIdx}`;
    }
    const d = new Date(e.date + 'T00:00:00Z');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  };

  const openTicket = (t: SheetTarget, side: OrderSide, lots = 1) => {
    openOrderTicket({
      side,
      symbol: underlying,
      product: 'NRML',
      instrumentType: t.kind,
      contractKey: t.contractKey,
      displaySymbol: t.displaySymbol,
      strikePrice: t.strike,
      expiryDate: t.expiryDate,
      lotSize: t.lotSize,
      qty: t.lotSize * Math.max(1, lots),
      price: t.ltp,
    });
    setSheet(null);
    closeFnoModal();
  };

  const addToBasket = async (t: SheetTarget, side: OrderSide, lots: number) => {
    const item: BasketItem = {
      id: `bi_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      side,
      symbol: underlying,
      exchange: 'NFO',
      product: 'NRML',
      orderType: 'MARKET',
      qty: t.lotSize * Math.max(1, lots),
      price: 0,
      triggerPrice: 0,
      instrumentType: t.kind,
      contractKey: t.contractKey,
      displaySymbol: t.displaySymbol,
      strikePrice: t.strike,
      expiryDate: t.expiryDate,
      lotSize: t.lotSize,
    };
    const basket: OrderBasket = strategyBasket
      ? { ...strategyBasket, items: [...strategyBasket.items, item] }
      : {
          id: `bsk_${Date.now().toString(36)}`,
          name: STRATEGY_BASKET_NAME,
          createdAt: profile.currentDate,
          items: [item],
        };
    await saveBasket(basket); // store shows the "Basket Saved" toast
    setSheet(null);
  };

  const removeBasketItem = async (id: string) => {
    if (!strategyBasket) return;
    await saveBasket({ ...strategyBasket, items: strategyBasket.items.filter((i) => i.id !== id) });
  };

  const clearStrategy = async () => {
    if (!strategyBasket) return;
    if (!window.confirm('Remove all legs for this underlying from the “Option strategy” basket?')) return;
    await saveBasket({ ...strategyBasket, items: strategyBasket.items.filter((i) => i.symbol !== underlying) });
  };

  const openSheet = (row: OptionContractQuote, leg: Leg, side: OrderSide = 'BUY') => {
    const c = leg === 'CE' ? row.ce : row.pe;
    setSheet({
      kind: leg,
      contractKey: c.contractKey,
      displaySymbol: c.displaySymbol,
      strike: row.strike,
      expiryDate: row.expiryDate,
      lotSize: row.lotSize,
      ltp: c.ltp,
      info: c,
    });
    setSheetSide(side);
    setSheetLots(1);
  };

  const optTarget = (row: OptionContractQuote, leg: Leg): SheetTarget => {
    const c = leg === 'CE' ? row.ce : row.pe;
    return {
      kind: leg,
      contractKey: c.contractKey,
      displaySymbol: c.displaySymbol,
      strike: row.strike,
      expiryDate: row.expiryDate,
      lotSize: row.lotSize,
      ltp: c.ltp,
    };
  };

  // ---- Payoff legs ----
  const payoffLegs: PayoffLeg[] =
    payoffSource === 'BASKET'
      ? strategyItems.map((i) => ({
          instrumentType: i.instrumentType as 'CE' | 'PE' | 'FUT',
          strike: i.strikePrice,
          entryPrice:
            i.price > 0 ? i.price : priceDerivativeContractKey(i.contractKey, spotLtp, spotVol, profile.currentDate).ltp,
          qty: i.side === 'BUY' ? i.qty : -i.qty,
        }))
      : fnoPositions.map((p) => ({
          instrumentType: p.instrumentType as 'CE' | 'PE' | 'FUT',
          strike: p.strikePrice,
          entryPrice: p.avgPrice,
          qty: p.netQty,
        }));

  // ---- Rendering helpers ----
  const itmCe = (strike: number) => strike < spotLtp;
  const itmPe = (strike: number) => strike > spotLtp;
  const itmBg = 'bg-[#fff8e1] dark:bg-amber-900/15';
  const th = 'py-2 px-1.5 font-semibold whitespace-nowrap';
  const td = 'py-1.5 px-1.5 whitespace-nowrap';
  const chgCls = (v: number) => (v > 0 ? 'text-kite-green' : v < 0 ? 'text-kite-red' : 'text-kite-muted');

  const oiCell = (v: number, side: Leg) => (
    <div className="relative">
      <div
        className={`absolute inset-y-0 ${side === 'CE' ? 'right-0' : 'left-0'} ${
          side === 'CE' ? 'bg-kite-red/15' : 'bg-kite-green/15'
        } rounded-sm`}
        style={{ width: `${Math.round((v / (stats?.maxOi || 1)) * 100)}%` }}
      />
      <span className="relative">{compactQty(v)}</span>
    </div>
  );

  const bsButtons = (row: OptionContractQuote, leg: Leg) => (
    <div className={`flex items-center gap-1 ${leg === 'PE' ? 'justify-end' : ''}`}>
      <button
        onClick={() => openTicket(optTarget(row, leg), 'BUY')}
        className="w-8 h-8 md:w-6 md:h-6 rounded bg-kite-blue text-white font-sans font-bold text-[11px]"
        data-tip={`Buy ${leg} :: Opens a BUY order for 1 lot of this ${leg === 'CE' ? 'call' : 'put'}. You pay the premium; max loss = premium paid.`}
      >
        B
      </button>
      <button
        onClick={() => openTicket(optTarget(row, leg), 'SELL')}
        className="w-8 h-8 md:w-6 md:h-6 rounded bg-kite-orange text-white font-sans font-bold text-[11px]"
        data-tip={`Sell ${leg} :: Opens a SELL (write) order for 1 lot. You receive the premium but must post large margin — losses can be much bigger than the premium.`}
      >
        S
      </button>
      <button
        onClick={() => openSheet(row, leg)}
        className="w-8 h-8 md:w-6 md:h-6 rounded border border-gray-300 dark:border-kite-darkBorder text-kite-muted hover:text-kite-blue flex items-center justify-center"
        data-tip={TIPS.basket}
        aria-label="Add to basket"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  // Spot separator position (Kite draws a line where the spot sits between strikes)
  const spotRowIdx = options.findIndex((r) => r.strike > spotLtp);

  const renderFullTable = () => (
    <table className="min-w-max w-full text-right font-mono text-[11px] border-collapse">
      <thead className="sticky top-0 z-20 bg-gray-100 dark:bg-[#1f232b] text-kite-muted text-[10px] uppercase">
        <tr>
          <th colSpan={showGreeks ? 11 : 8} className="py-1 text-center text-kite-blue font-bold tracking-wider" data-tip="Calls (CE) :: Call options gain value when the underlying RISES. Left side of the chain.">
            Calls
          </th>
          <th className="sticky left-0 right-0 z-30 bg-gray-200 dark:bg-gray-800" />
          <th colSpan={showGreeks ? 11 : 8} className="py-1 text-center text-kite-orange font-bold tracking-wider" data-tip="Puts (PE) :: Put options gain value when the underlying FALLS. Right side of the chain.">
            Puts
          </th>
        </tr>
        <tr>
          <th className={`${th} text-left`} data-tip={TIPS.bs}>Trade</th>
          {showGreeks && <th className={th} data-tip={TIPS.gamma}>Gamma</th>}
          {showGreeks && <th className={th} data-tip={TIPS.vega}>Vega</th>}
          {showGreeks && <th className={th} data-tip={TIPS.theta}>Theta</th>}
          <th className={th} data-tip={TIPS.delta}>Delta</th>
          <th className={th} data-tip={TIPS.oiChg}>OI Chg</th>
          <th className={th} data-tip={TIPS.oi}>OI</th>
          <th className={th} data-tip={TIPS.volume}>Volume</th>
          <th className={th} data-tip={TIPS.iv}>IV</th>
          <th className={th} data-tip={TIPS.chg}>Chg%</th>
          <th className={`${th} text-kite-blue`} data-tip={TIPS.ltp}>LTP</th>
          <th className={`${th} sticky left-0 right-0 z-30 text-center bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-white px-3`} data-tip={TIPS.strike}>
            Strike
          </th>
          <th className={`${th} text-left text-kite-orange`} data-tip={TIPS.ltp}>LTP</th>
          <th className={`${th} text-left`} data-tip={TIPS.chg}>Chg%</th>
          <th className={`${th} text-left`} data-tip={TIPS.iv}>IV</th>
          <th className={`${th} text-left`} data-tip={TIPS.volume}>Volume</th>
          <th className={`${th} text-left`} data-tip={TIPS.oi}>OI</th>
          <th className={`${th} text-left`} data-tip={TIPS.oiChg}>OI Chg</th>
          <th className={`${th} text-left`} data-tip={TIPS.delta}>Delta</th>
          {showGreeks && <th className={`${th} text-left`} data-tip={TIPS.theta}>Theta</th>}
          {showGreeks && <th className={`${th} text-left`} data-tip={TIPS.vega}>Vega</th>}
          {showGreeks && <th className={`${th} text-left`} data-tip={TIPS.gamma}>Gamma</th>}
          <th className={`${th} text-right`} data-tip={TIPS.bs}>Trade</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
        {options.map((row, idx) => {
          const isAtm = row.strike === atmStrike;
          const ceBg = itmCe(row.strike) ? itmBg : '';
          const peBg = itmPe(row.strike) ? itmBg : '';
          return (
            <React.Fragment key={row.strike}>
              {idx === spotRowIdx && spotRowIdx > 0 && (
                <tr>
                  <td colSpan={showGreeks ? 23 : 17} className="p-0">
                    <div className="relative h-0 border-t-2 border-kite-blue">
                      <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 px-2 rounded-full bg-kite-blue text-white text-[10px] font-sans font-semibold" data-tip="Spot price :: The current price of the underlying. Strikes above it are OTM calls / ITM puts; below it ITM calls / OTM puts.">
                        Spot {formatNum(spotLtp)}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              <tr className={isAtm ? 'font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}>
                <td className={`${td} text-left ${ceBg}`}>{bsButtons(row, 'CE')}</td>
                {showGreeks && <td className={`${td} ${ceBg}`}>{row.ce.gamma.toFixed(4)}</td>}
                {showGreeks && <td className={`${td} ${ceBg}`}>{row.ce.vega.toFixed(2)}</td>}
                {showGreeks && <td className={`${td} ${ceBg} text-kite-red`}>{row.ce.theta.toFixed(2)}</td>}
                <td className={`${td} ${ceBg}`}>{row.ce.delta.toFixed(2)}</td>
                <td className={`${td} ${ceBg} ${chgCls(row.ce.oiChange)}`}>{compactQty(row.ce.oiChange)}</td>
                <td className={`${td} ${ceBg}`}>{oiCell(row.ce.oi, 'CE')}</td>
                <td className={`${td} ${ceBg} text-kite-muted`}>{compactQty(row.ce.volume)}</td>
                <td className={`${td} ${ceBg} text-kite-muted`}>{row.ce.iv.toFixed(1)}</td>
                <td className={`${td} ${ceBg} ${chgCls(row.ce.changePct)}`}>{row.ce.changePct.toFixed(1)}%</td>
                <td className={`${td} ${ceBg} font-semibold text-gray-800 dark:text-white`}>{formatNum(row.ce.ltp)}</td>
                <td
                  className={`${td} sticky left-0 right-0 z-10 text-center font-bold px-3 ${
                    isAtm ? 'bg-amber-200 dark:bg-amber-700/50' : 'bg-gray-100 dark:bg-gray-800'
                  } text-gray-800 dark:text-gray-100`}
                >
                  {formatNum(row.strike, row.strike % 1 ? 1 : 0)}
                  {isAtm && <span className="ml-1 text-[9px] text-amber-700 dark:text-amber-300">ATM</span>}
                </td>
                <td className={`${td} ${peBg} text-left font-semibold text-gray-800 dark:text-white`}>{formatNum(row.pe.ltp)}</td>
                <td className={`${td} ${peBg} text-left ${chgCls(row.pe.changePct)}`}>{row.pe.changePct.toFixed(1)}%</td>
                <td className={`${td} ${peBg} text-left text-kite-muted`}>{row.pe.iv.toFixed(1)}</td>
                <td className={`${td} ${peBg} text-left text-kite-muted`}>{compactQty(row.pe.volume)}</td>
                <td className={`${td} ${peBg} text-left`}>{oiCell(row.pe.oi, 'PE')}</td>
                <td className={`${td} ${peBg} text-left ${chgCls(row.pe.oiChange)}`}>{compactQty(row.pe.oiChange)}</td>
                <td className={`${td} ${peBg} text-left`}>{row.pe.delta.toFixed(2)}</td>
                {showGreeks && <td className={`${td} ${peBg} text-left text-kite-red`}>{row.pe.theta.toFixed(2)}</td>}
                {showGreeks && <td className={`${td} ${peBg} text-left`}>{row.pe.vega.toFixed(2)}</td>}
                {showGreeks && <td className={`${td} ${peBg} text-left`}>{row.pe.gamma.toFixed(4)}</td>}
                <td className={`${td} ${peBg}`}>{bsButtons(row, 'PE')}</td>
              </tr>
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );

  // Compact (phone) mode: OI | LTP | Strike | LTP | OI — tap a side to trade.
  const renderCompactTable = () => (
    <table className="w-full text-right font-mono text-[12px] border-collapse">
      <thead className="sticky top-0 z-20 bg-gray-100 dark:bg-[#1f232b] text-kite-muted text-[10px] uppercase">
        <tr>
          <th className={th} data-tip={TIPS.oi}>OI</th>
          <th className={`${th} text-kite-blue`} data-tip={`Call LTP :: ${TIPS.ltp.split('::')[1]} Tap a call cell to Buy / Sell / add it to a basket.`}>Call LTP</th>
          <th className={`${th} text-center bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-white`} data-tip={TIPS.strike}>Strike</th>
          <th className={`${th} text-left text-kite-orange`} data-tip={`Put LTP :: ${TIPS.ltp.split('::')[1]} Tap a put cell to Buy / Sell / add it to a basket.`}>Put LTP</th>
          <th className={`${th} text-left`} data-tip={TIPS.oi}>OI</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
        {options.map((row, idx) => {
          const isAtm = row.strike === atmStrike;
          const ceBg = itmCe(row.strike) ? itmBg : '';
          const peBg = itmPe(row.strike) ? itmBg : '';
          return (
            <React.Fragment key={row.strike}>
              {idx === spotRowIdx && spotRowIdx > 0 && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <div className="relative h-0 border-t-2 border-kite-blue">
                      <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 px-2 rounded-full bg-kite-blue text-white text-[10px] font-sans font-semibold">
                        Spot {formatNum(spotLtp)}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              <tr>
                <td className={`${td} ${ceBg} cursor-pointer`} onClick={() => openSheet(row, 'CE')}>
                  {oiCell(row.ce.oi, 'CE')}
                </td>
                <td className={`${td} ${ceBg} cursor-pointer h-11`} onClick={() => openSheet(row, 'CE')}>
                  <div className="font-semibold text-gray-800 dark:text-white">{formatNum(row.ce.ltp)}</div>
                  <div className={`text-[10px] ${chgCls(row.ce.changePct)}`}>{row.ce.changePct.toFixed(1)}%</div>
                </td>
                <td
                  className={`${td} text-center font-bold ${
                    isAtm ? 'bg-amber-200 dark:bg-amber-700/50' : 'bg-gray-100 dark:bg-gray-800'
                  } text-gray-800 dark:text-gray-100`}
                >
                  {formatNum(row.strike, row.strike % 1 ? 1 : 0)}
                </td>
                <td className={`${td} ${peBg} text-left cursor-pointer`} onClick={() => openSheet(row, 'PE')}>
                  <div className="font-semibold text-gray-800 dark:text-white">{formatNum(row.pe.ltp)}</div>
                  <div className={`text-[10px] ${chgCls(row.pe.changePct)}`}>{row.pe.changePct.toFixed(1)}%</div>
                </td>
                <td className={`${td} ${peBg} text-left cursor-pointer`} onClick={() => openSheet(row, 'PE')}>
                  {oiCell(row.pe.oi, 'PE')}
                </td>
              </tr>
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );

  const statChip = (label: string, value: string, tip: string) => (
    <div className="shrink-0 px-2 py-1 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface" data-tip={tip}>
      <div className="text-[9px] uppercase tracking-wide text-kite-muted">{label}</div>
      <div className="font-mono font-semibold text-[12px] text-gray-800 dark:text-gray-100">{value}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-[1px] md:p-4" onClick={closeFnoModal}>
      <div
        className="w-full md:max-w-6xl h-[92dvh] md:h-auto md:max-h-[90vh] flex flex-col rounded-t-xl md:rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl overflow-hidden text-xs pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 md:px-5 py-2.5 border-b border-gray-200 dark:border-kite-darkBorder bg-slate-50 dark:bg-[#15181e]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Activity className="w-4 h-4 text-kite-orange shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-gray-800 dark:text-white truncate" data-tip="Option chain :: A table of every call (CE) and put (PE) option for one expiry, lined up by strike price. :: Prices here are simulated with Black-Scholes from the stock's historical volatility on this date.">
                {dispSym} · Option chain
              </h2>
              <p className="text-[11px] text-kite-muted font-mono truncate">
                Spot ₹{formatNum(spotLtp)} · Black-Scholes on historical volatility
              </p>
            </div>
          </div>
          <button onClick={closeFnoModal} className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-800" aria-label="Close" data-tip="Close :: Close the option chain (Esc).">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex gap-1.5 px-3 md:px-5 py-2 overflow-x-auto border-b border-gray-200 dark:border-kite-darkBorder bg-slate-50/60 dark:bg-[#15181e]">
            {statChip('Spot', formatNum(spotLtp), 'Spot :: The live price of the underlying stock / index that these options are based on.')}
            {statChip('ATM', formatNum(atmStrike, 0), 'ATM strike :: At-the-money — the strike closest to the spot price. ATM options have delta ≈ 0.5 and the most time value.')}
            {statChip(
              'PCR',
              stats.pcr.toFixed(2),
              `Put-Call Ratio (PCR) :: Total put OI ÷ total call OI for this expiry (puts ${compactQty(stats.totalPeOi)} / calls ${compactQty(stats.totalCeOi)}). :: PCR above ~1.2 is often read as bullish support from put writers, below ~0.7 as bearish — but it is only a sentiment hint.`
            )}
            {statChip(
              'Max pain',
              formatNum(stats.maxPain, 0),
              'Max pain :: The strike at which option buyers (all calls + puts shown) would lose the most — i.e. option writers pay out the least — if the market expired there. :: Some traders believe prices drift toward max pain near expiry. Treat it as a curiosity, not a signal.'
            )}
            {statChip('Lot', String(stats.lot), 'Lot size :: F&O contracts trade in fixed lots. 1 lot = this many shares/units. Premium × lot size = cost of one lot.')}
            {statChip('ATM IV', `${stats.atmIv.toFixed(1)}%`, 'ATM implied volatility :: The volatility priced into the at-the-money options (yearly %). Higher IV → costlier options. :: Compare with past IV: buying when IV is low and selling when IV is high is a classic edge.')}
            {statChip('DTE', `${stats.dte}d`, 'Days to expiry (DTE) :: Calendar days left until this expiry. Time value (and theta decay) accelerates as DTE approaches 0.')}
          </div>
        )}

        {/* Expiry selector */}
        <div className="flex items-center gap-1.5 px-3 md:px-5 py-2 overflow-x-auto border-b border-gray-200 dark:border-kite-darkBorder">
          <span className="shrink-0 font-semibold text-gray-600 dark:text-gray-300 mr-1" data-tip="Expiry :: The date on which the options settle. W = weekly expiry (index options only), M = monthly expiry (last expiry of the month; stocks have monthlies only). :: Weeklies are cheaper but decay much faster.">
            Expiry
          </span>
          {expiryInfo.map((e, idx) => (
            <button
              key={e.date}
              onClick={() => setSelectedExpiry(e.date)}
              className={`shrink-0 flex items-center gap-1 px-2.5 h-9 md:h-7 rounded font-mono text-[11px] font-semibold border ${
                selectedExpiry === e.date
                  ? 'bg-kite-blue border-kite-blue text-white'
                  : 'bg-white dark:bg-kite-darkSurface border-gray-200 dark:border-kite-darkBorder text-gray-700 dark:text-gray-200'
              }`}
              data-tip={`${e.kind === 'W' ? 'Weekly' : 'Monthly'} expiry :: ${e.daysToExpiry} day(s) to expiry. ${
                e.kind === 'W'
                  ? 'Weekly index options expire every week — cheap, but time decay is brutal in the final days.'
                  : 'Monthly contracts expire on the last expiry day of the month; futures expire on the same day.'
              }`}
            >
              <span>{expiryLabel(e, idx)}</span>
              <span
                className={`px-1 rounded text-[9px] ${
                  selectedExpiry === e.date ? 'bg-white/25' : e.kind === 'W' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300' : 'bg-kite-blue/15 text-kite-blue'
                }`}
              >
                {e.kind}
              </span>
              <span className={`text-[10px] ${selectedExpiry === e.date ? 'text-white/80' : 'text-kite-muted'}`}>{e.daysToExpiry}d</span>
            </button>
          ))}
        </div>

        {/* Tabs + view toggles */}
        <div className="flex items-center justify-between gap-2 px-3 md:px-5 border-b border-gray-200 dark:border-kite-darkBorder">
          <div className="flex items-center">
            {(
              [
                ['CHAIN', 'Chain', 'Option chain :: Calls on the left, puts on the right, strikes in the middle.'],
                ['FUTURES', 'Futures', 'Futures :: Monthly futures contracts for this underlying — near, next and far month.'],
                ['PAYOFF', `Payoff${strategyItems.length ? ` (${strategyItems.length})` : ''}`, 'Strategy payoff :: Shows the profit / loss at expiry of the legs in your “Option strategy” basket or your open F&O positions.'],
              ] as Array<[Tab, string, string]>
            ).map(([k, label, tip]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`h-10 px-3 font-semibold border-b-2 ${
                  tab === k ? 'border-kite-orange text-kite-orange' : 'border-transparent text-gray-600 dark:text-gray-300'
                }`}
                data-tip={tip}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'CHAIN' && (
            <div className="flex items-center gap-1.5">
              {!compact && (
                <button
                  onClick={() => {
                    setShowGreeks((v) => {
                      writeLocal('kite.fno.greeks', v ? '0' : '1');
                      return !v;
                    });
                  }}
                  className={`h-8 px-2 rounded border text-[11px] font-semibold ${
                    showGreeks ? 'border-kite-blue bg-kite-blue/10 text-kite-blue' : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300'
                  }`}
                  data-tip="Greeks :: Show / hide Gamma, Vega and Theta columns. Greeks measure how an option's price reacts to price moves (delta, gamma), volatility (vega) and time (theta)."
                >
                  Greeks
                </button>
              )}
              <button
                onClick={() => {
                  const next = compact ? '0' : '1';
                  writeLocal('kite.fno.compact', next);
                  setCompactPref(next);
                }}
                className="h-8 px-2 rounded border border-gray-200 dark:border-kite-darkBorder text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1"
                data-tip="Compact / Full view :: Compact shows just OI and LTP (best on phones) — tap a row side to trade. Full shows OI change, volume, IV, delta and greeks; scroll sideways, the strike column stays pinned."
              >
                <Layers className="w-3.5 h-3.5" />
                {compact ? 'Full' : 'Compact'}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
          {error ? (
            <div className="p-10 text-center text-kite-muted">{error}</div>
          ) : loading && options.length === 0 ? (
            <div className="p-10 text-center text-kite-muted">Computing option chain…</div>
          ) : tab === 'CHAIN' ? (
            <div className={loading ? 'opacity-60 transition-opacity' : ''}>{compact ? renderCompactTable() : renderFullTable()}</div>
          ) : tab === 'FUTURES' ? (
            <div className="p-3 md:p-5 space-y-2">
              <p className="text-[11px] text-kite-muted" data-tip="Futures :: A futures contract obliges you to buy/sell the underlying at today's futures price on expiry. You only post margin (~15-20%), so profits and losses are leveraged.">
                Futures are monthly only and expire with the monthly options.
              </p>
              {futures.map((fut) => {
                const t: SheetTarget = {
                  kind: 'FUT',
                  contractKey: fut.contractKey,
                  displaySymbol: fut.displaySymbol,
                  expiryDate: fut.expiryDate,
                  lotSize: fut.lotSize,
                  ltp: fut.ltp,
                };
                return (
                  <div
                    key={fut.contractKey}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded border border-gray-200 dark:border-kite-darkBorder bg-slate-50/50 dark:bg-[#14171d]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 dark:text-gray-100">{mask(fut.displaySymbol)}</div>
                      <div className="text-[11px] text-kite-muted font-mono flex flex-wrap gap-x-2">
                        <span data-tip="Lot size :: Futures trade in fixed lots. P&L per ₹1 move = lot size.">Lot {fut.lotSize}</span>
                        <span data-tip="Days to expiry :: Calendar days until this future settles at the closing spot price.">{fut.daysToExpiry}d to expiry</span>
                        <span data-tip="Margin :: Approximate money blocked to hold 1 lot (≈18% of contract value here). Losses beyond margin are debited daily (mark-to-market).">
                          Margin ≈ {formatINR(fut.marginRequired, { decimals: 0 })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="text-right font-mono mr-1">
                        <div className="font-bold text-gray-800 dark:text-white">₹{formatNum(fut.ltp)}</div>
                        <div
                          className={`text-[10px] ${fut.basis >= 0 ? 'text-kite-green' : 'text-kite-red'}`}
                          data-tip="Basis :: Futures price minus spot price. Usually positive (premium) because of the cost of carry (interest); it shrinks to 0 on expiry day."
                        >
                          Basis {fut.basis >= 0 ? '+' : ''}
                          {formatNum(fut.basis)}
                        </div>
                      </div>
                      <button onClick={() => openTicket(t, 'BUY')} className="w-10 h-10 md:w-8 md:h-8 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-bold" data-tip="Buy future :: Go long 1 lot — you profit if the price rises by expiry.">
                        B
                      </button>
                      <button onClick={() => openTicket(t, 'SELL')} className="w-10 h-10 md:w-8 md:h-8 rounded bg-kite-orange hover:bg-kite-orangeHover text-white font-bold" data-tip="Sell future :: Go short 1 lot — you profit if the price falls by expiry.">
                        S
                      </button>
                      <button
                        onClick={() => {
                          setSheet(t);
                          setSheetSide('BUY');
                          setSheetLots(1);
                        }}
                        className="w-10 h-10 md:w-8 md:h-8 rounded border border-gray-300 dark:border-kite-darkBorder text-kite-muted hover:text-kite-blue flex items-center justify-center"
                        data-tip={TIPS.basket}
                        aria-label="Add to basket"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 md:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded border border-gray-200 dark:border-kite-darkBorder overflow-hidden">
                  {(
                    [
                      ['BASKET', `Strategy basket (${strategyItems.length})`, 'Strategy basket :: Legs you added with “+” from the chain. Not traded yet — a what-if before you place the orders.'],
                      ['POSITIONS', `Open positions (${fnoPositions.length})`, 'Open positions :: Your actual open F&O positions in this underlying, at your average entry prices.'],
                    ] as Array<['BASKET' | 'POSITIONS', string, string]>
                  ).map(([k, label, tip]) => (
                    <button
                      key={k}
                      onClick={() => setPayoffSource(k)}
                      className={`h-9 px-3 text-[11px] font-semibold ${payoffSource === k ? 'bg-kite-blue text-white' : 'text-gray-600 dark:text-gray-300'}`}
                      data-tip={tip}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {payoffSource === 'BASKET' && strategyItems.length > 0 && strategyBasket && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={clearStrategy}
                      className="h-9 px-3 rounded border border-gray-300 dark:border-kite-darkBorder text-[11px] font-semibold text-gray-600 dark:text-gray-300"
                      data-tip="Clear legs :: Removes this underlying's legs from the “Option strategy” basket."
                    >
                      Clear
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm(`Place all ${strategyBasket.items.length} order(s) in “${STRATEGY_BASKET_NAME}” at market?`)) {
                          await executeBasket(strategyBasket.id);
                        }
                      }}
                      className="h-9 px-3 rounded bg-kite-blue text-white text-[11px] font-semibold flex items-center gap-1"
                      data-tip="Place basket :: Sends every leg in the basket as a market NRML order at once (like Kite's basket order). Margin for the whole strategy is checked."
                    >
                      <ShoppingBasket className="w-3.5 h-3.5" /> Place all
                    </button>
                  </div>
                )}
              </div>

              {payoffLegs.length === 0 ? (
                <div className="p-6 text-center text-kite-muted rounded border border-dashed border-gray-300 dark:border-kite-darkBorder">
                  <LineChart className="w-6 h-6 mx-auto mb-2 opacity-60" />
                  {payoffSource === 'BASKET'
                    ? 'No legs yet. Tap “+” next to any call, put or future in the chain to build a strategy (e.g. buy a call + sell a higher call = bull call spread).'
                    : 'No open F&O positions in this underlying.'}
                </div>
              ) : (
                <>
                  <PayoffChart legs={payoffLegs} spot={spotLtp} height={isPhone ? 170 : 220} />
                  <div className="divide-y divide-gray-100 dark:divide-kite-darkBorder rounded border border-gray-200 dark:border-kite-darkBorder">
                    {(payoffSource === 'BASKET' ? strategyItems : []).map((i, idx) => (
                      <div key={i.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                        <div className="min-w-0">
                          <span className={`mr-1.5 px-1 rounded text-[10px] font-bold ${i.side === 'BUY' ? 'bg-kite-blue/15 text-kite-blue' : 'bg-kite-orange/15 text-kite-orange'}`}>
                            {i.side}
                          </span>
                          <span className="font-semibold text-gray-800 dark:text-gray-100">{mask(i.displaySymbol)}</span>
                          <span className="ml-1.5 font-mono text-kite-muted">
                            {i.qty / Math.max(1, i.lotSize)} lot · @{formatNum(payoffLegs[idx]?.entryPrice || 0)}
                          </span>
                        </div>
                        <button
                          onClick={() => removeBasketItem(i.id)}
                          className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-kite-muted hover:text-kite-red"
                          data-tip="Remove leg :: Delete this leg from the strategy basket."
                          aria-label="Remove leg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {payoffSource === 'POSITIONS' &&
                      fnoPositions.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <div className="min-w-0">
                            <span className={`mr-1.5 px-1 rounded text-[10px] font-bold ${p.netQty > 0 ? 'bg-kite-blue/15 text-kite-blue' : 'bg-kite-orange/15 text-kite-orange'}`}>
                              {p.netQty > 0 ? 'LONG' : 'SHORT'}
                            </span>
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{mask(p.displaySymbol)}</span>
                            <span className="ml-1.5 font-mono text-kite-muted">
                              {Math.abs(p.netQty)} qty · avg {formatNum(p.avgPrice)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                  <p className="text-[11px] text-kite-muted" data-tip="How to read a payoff chart :: The horizontal axis is where the underlying could close on expiry; the vertical axis is your total profit/loss. Where the line crosses ₹0 are your breakevens. :: Legs with different expiries are approximated as if all expired together.">
                    Payoff at expiry. Basket legs use today's chain price as the entry premium; mixed expiries are approximated as all expiring together.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contract action sheet (Buy / Sell / Add to basket) */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={(e) => { e.stopPropagation(); setSheet(null); }}>
          <div
            className="w-full md:max-w-sm rounded-t-xl md:rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-bold text-sm text-gray-800 dark:text-white">{mask(sheet.displaySymbol)}</div>
                <div className="font-mono text-kite-muted">
                  LTP ₹{formatNum(sheet.ltp)} · Lot {sheet.lotSize} · 1 lot ≈ {formatINR(sheet.ltp * sheet.lotSize, { decimals: 0 })}
                </div>
              </div>
              <button onClick={() => setSheet(null)} className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            {sheet.info && (
              <div className="grid grid-cols-4 gap-1.5 mb-3 font-mono text-[11px]">
                {(
                  [
                    ['Delta', sheet.info.delta.toFixed(2), TIPS.delta],
                    ['Gamma', sheet.info.gamma.toFixed(4), TIPS.gamma],
                    ['Vega', sheet.info.vega.toFixed(2), TIPS.vega],
                    ['Theta', sheet.info.theta.toFixed(2), TIPS.theta],
                    ['IV', `${sheet.info.iv.toFixed(1)}%`, TIPS.iv],
                    ['OI', compactQty(sheet.info.oi), TIPS.oi],
                    ['OI chg', compactQty(sheet.info.oiChange), TIPS.oiChg],
                    ['Volume', compactQty(sheet.info.volume), TIPS.volume],
                  ] as Array<[string, string, string]>
                ).map(([k, v, tip]) => (
                  <div key={k} className="rounded bg-gray-50 dark:bg-[#14171d] p-1.5" data-tip={tip}>
                    <div className="text-[9px] uppercase text-kite-muted">{k}</div>
                    <div className="font-semibold text-gray-800 dark:text-gray-100">{v}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex rounded border border-gray-200 dark:border-kite-darkBorder overflow-hidden" data-tip="Side :: BUY = you pay premium (long). SELL = you receive premium (short / write) and need margin.">
                {(['BUY', 'SELL'] as OrderSide[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSheetSide(s)}
                    className={`h-10 px-4 font-semibold ${
                      sheetSide === s ? (s === 'BUY' ? 'bg-kite-blue text-white' : 'bg-kite-orange text-white') : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1" data-tip="Lots :: Number of lots. Quantity = lots × lot size.">
                <button onClick={() => setSheetLots((l) => Math.max(1, l - 1))} className="w-10 h-10 rounded border border-gray-200 dark:border-kite-darkBorder flex items-center justify-center" aria-label="Fewer lots">
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={sheetLots}
                  onChange={(e) => setSheetLots(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className="w-14 h-10 text-center font-mono rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                />
                <button onClick={() => setSheetLots((l) => l + 1)} className="w-10 h-10 rounded border border-gray-200 dark:border-kite-darkBorder flex items-center justify-center" aria-label="More lots">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-[11px] text-kite-muted font-mono mb-3">
              Qty {sheetLots * sheet.lotSize} · Premium {formatINR(sheet.ltp * sheet.lotSize * sheetLots, { decimals: 0 })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => addToBasket(sheet, sheetSide, sheetLots)}
                className="h-11 rounded border border-kite-blue text-kite-blue font-semibold flex items-center justify-center gap-1"
                data-tip={TIPS.basket}
              >
                <ShoppingBasket className="w-4 h-4" /> Add to basket
              </button>
              <button
                onClick={() => openTicket(sheet, sheetSide, sheetLots)}
                className={`h-11 rounded text-white font-semibold ${sheetSide === 'BUY' ? 'bg-kite-blue' : 'bg-kite-orange'}`}
                data-tip="Place order :: Opens the order window pre-filled with this contract, side and quantity (NRML product)."
              >
                {sheetSide === 'BUY' ? 'Buy' : 'Sell'} {sheetLots} lot{sheetLots > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
