import type {
  DailyEquityPoint,
  GttLeg,
  GttRule,
  Holding,
  Instrument,
  LedgerCategory,
  MarketQuote,
  Order,
  OrderSide,
  OrderType,
  OrderValidity,
  OrderBasket,
  OrderVariety,
  Position,
  PriceAlert,
  ProductType,
  SimulationProfile,
  SimulatorNotification,
  TaxCategory,
  TradeRecord,
  WatchlistGroup,
} from '../types/simulator.ts';
import type { DayStepBar, DayStepPacket } from '../market/types.ts';
import { calculateRequiredMargin, calculateZerodhaCharges } from './charges.ts';
import { roundTick, stepIndexToTimeLabel } from './intraday.ts';
import { priceDerivativeContractKey } from './optionsPricing.ts';

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_WATCHLISTS: WatchlistGroup[] = [
  {
    id: 1,
    name: 'Top Bluechips',
    symbols: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'LT', 'BHARTIARTL', 'BAJFINANCE'],
  },
  {
    id: 2,
    name: 'Banking & Fin',
    symbols: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'BAJFINANCE', 'CHOLAFIN', 'PFC', 'PNB', 'YESBANK', 'CDSL'],
  },
  {
    id: 3,
    name: 'IT & Pharma',
    symbols: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'PERSISTENT', 'TATAELXSI', 'SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB'],
  },
  {
    id: 4,
    name: 'Auto & Consumer',
    symbols: ['MARUTI', 'TATAMOTORS', 'M&M', 'EICHERMOT', 'BAJAJ-AUTO', 'TITAN', 'ASIANPAINT', 'NESTLEIND', 'HINDUNILVR', 'TRENT', 'IRCTC'],
  },
  {
    id: 5,
    name: 'ETFs & Gold',
    symbols: ['NIFTYBEES', 'JUNIORBEES', 'BANKBEES', 'GOLDBEES', 'LIQUIDBEES', 'ITBEES', 'MON100'],
  },
  {
    id: 6,
    name: 'Infra & Energy',
    symbols: ['LT', 'NTPC', 'ONGC', 'TATAPOWER', 'COALINDIA', 'SIEMENS', 'BEL', 'HAL', 'ULTRACEMCO', 'TATASTEEL', 'HINDALCO'],
  },
  {
    id: 7,
    name: 'High-Beta & Traps',
    symbols: ['ADANIENT', 'SUZLON', 'IDEA', 'YESBANK', 'RPOWER', 'SAIL', 'BHEL', 'DLF', 'ZEEL', 'ETERNAL', 'VEDL'],
  },
];

export function createDefaultProfile(params?: {
  name?: string;
  startDate?: string;
  startingCapital?: number;
  niftyAtStart?: number;
}): SimulationProfile {
  const now = new Date().toISOString();
  const startDate = params?.startDate || '2014-01-02';
  const capital = params?.startingCapital ?? 200000; // Default ₹2,00,000 (2 Lakh Rs)
  const niftyClose = params?.niftyAtStart || 6200;

  return {
    id: uid('prof'),
    name: params?.name || 'Zerodha ₹2L Practice Account',
    createdAt: now,
    updatedAt: now,
    startDate,
    currentDate: startDate,
    intraday: {
      enabled: false,
      stepIndex: 74,
      totalSteps: 75,
      timeLabel: '15:30',
      marketOpen: true,
    },
    blindMode: false,
    startingCapital: capital,
    netCapitalInvested: capital,
    availableCash: capital,
    monthlyTopUp: 0,
    lastTopUpMonth: startDate.slice(0, 7),
    autoPause: {
      pauseOnGttTrigger: true,
      pauseOnStopLoss: true,
      pauseOnBigMovePct: 0,
    },
    pinnedIndices: ['NIFTY 50', 'SENSEX'],
    watchlists: JSON.parse(JSON.stringify(DEFAULT_WATCHLISTS)),
    activeWatchlistId: 1,
    selectedSymbol: 'RELIANCE',
    holdings: [],
    positions: [],
    orders: [],
    gtts: [],
    baskets: [],
    sips: [],
    trades: [],
    ledger: [
      {
        id: uid('ldg'),
        date: startDate,
        category: 'OPENING_BALANCE',
        description: `Opening Virtual Trading Capital (₹${capital.toLocaleString('en-IN')})`,
        debit: 0,
        credit: capital,
        balance: capital,
      },
    ],
    equityHistory: [
      {
        date: startDate,
        totalEquity: capital,
        cash: capital,
        holdingsValue: 0,
        positionsPnl: 0,
        realizedPnlDay: 0,
        chargesDay: 0,
        dividendsDay: 0,
        netCapitalInvested: capital,
        niftyClose,
      },
    ],
    dpSoldToday: [],
    notifications: [
      {
        id: uid('ntf'),
        date: startDate,
        type: 'INFO',
        title: 'Welcome to Kite Historical Simulator',
        message: `Account initialized on ${startDate} with ₹${capital.toLocaleString('en-IN')} capital.`,
      },
    ],
  };
}

function appendLedger(
  profile: SimulationProfile,
  date: string,
  category: LedgerCategory,
  description: string,
  debit: number,
  credit: number
): void {
  const d = Number(debit.toFixed(2));
  const c = Number(credit.toFixed(2));
  profile.availableCash = Number((profile.availableCash + c - d).toFixed(2));
  profile.ledger.unshift({
    id: uid('ldg'),
    date,
    category,
    description,
    debit: d,
    credit: c,
    balance: profile.availableCash,
  });
  if (profile.ledger.length > 2500) {
    profile.ledger.length = 2500;
  }
}

function pushNotification(
  profile: SimulationProfile,
  date: string,
  type: SimulatorNotification['type'],
  title: string,
  message: string
): void {
  profile.notifications.unshift({
    id: uid('ntf'),
    date,
    type,
    title,
    message,
  });
  if (profile.notifications.length > 120) {
    profile.notifications.length = 120;
  }
}

/** Appends a status entry to an order's timeline (shown in the order details sheet). */
export function addOrderHistory(order: Order, date: string, time: string, status: string, note?: string): void {
  if (!order.history) order.history = [];
  const entry: NonNullable<Order['history']>[number] = { date, time, status };
  if (note) entry.note = note;
  order.history.push(entry);
  if (order.history.length > 30) order.history.splice(1, order.history.length - 30);
}

/** Cancels an open order, releases its blocked margin and records why. */
function cancelOrder(order: Order, date: string, time: string, message: string): void {
  order.status = 'CANCELLED';
  order.marginBlocked = 0;
  order.statusMessage = message;
  addOrderHistory(order, date, time, 'CANCELLED', message);
}

function fmtInr(n: number): string {
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Minutes since 09:15 for a 'HH:MM' label (used for TTL validity). */
function minutesSinceOpen(label: string): number {
  const [hh, mm] = String(label || '15:30').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0) - (9 * 60 + 15);
}

export function getCollateralValue(profile: SimulationProfile, priceLookup: (sym: string) => number): number {
  let collateral = 0;
  for (const h of profile.holdings) {
    if (h.pledgedQty > 0) {
      const ltp = priceLookup(h.symbol) || h.avgPrice;
      collateral += h.pledgedQty * ltp * 0.85; // 15% Zerodha collateral haircut
    }
  }
  return Number(collateral.toFixed(2));
}

export function getUsedMargin(profile: SimulationProfile): number {
  let used = 0;
  for (const p of profile.positions) {
    if (p.netQty !== 0) used += p.marginBlocked;
  }
  for (const o of profile.orders) {
    if (o.status === 'OPEN' || o.status === 'TRIGGER PENDING' || o.status === 'AMO REQ RECEIVED') {
      used += o.marginBlocked;
    }
  }
  return Number(used.toFixed(2));
}

export function getAvailableMargin(
  profile: SimulationProfile,
  priceLookup: (sym: string) => number,
  includeCollateral = true
): number {
  const collateral = includeCollateral ? getCollateralValue(profile, priceLookup) : 0;
  const used = getUsedMargin(profile);
  return Number((profile.availableCash + collateral - used).toFixed(2));
}

function daysBetween(d1: string, d2: string): number {
  const t1 = new Date(d1 + 'T00:00:00Z').getTime();
  const t2 = new Date(d2 + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((t2 - t1) / 86400000));
}

export interface PlaceOrderInput {
  side: OrderSide;
  exchange: Order['exchange'];
  product: ProductType;
  variety: OrderVariety;
  orderType: OrderType;
  validity: OrderValidity;
  instrumentType: Order['instrumentType'];
  contractKey?: string;
  underlyingSymbol: string;
  displaySymbol?: string;
  strikePrice?: number;
  expiryDate?: string;
  lotSize?: number;
  qty: number;
  price?: number;
  triggerPrice?: number;
  stopLossTrigger?: number;
  icebergLegs?: number;
  tag?: string;
  /** Equity LIMIT/SL only: qty shown in market depth (10%–100% of qty). */
  disclosedQty?: number;
  /** Validity TTL: minutes (1–365) the order stays open. */
  ttlMinutes?: number;
  /** MARKET only: cancel instead of filling more than this % away from the reference LTP. */
  marketProtectionPct?: number;
  /** Equity REGULAR only: stoploss / target GTT created automatically once the order fills. */
  attachedGtt?: { stoplossPrice?: number; targetPrice?: number };
}

/**
 * Places an order into the profile and immediately matches if executable at current market price.
 */
export function placeOrderInProfile(
  profile: SimulationProfile,
  input: PlaceOrderInput,
  currentLtp: number,
  underlyingSpot: number,
  isIndex = false
): { ok: boolean; message: string; order?: Order } {
  if (isIndex && input.instrumentType === 'EQ') {
    return {
      ok: false,
      message: `${input.underlyingSymbol} is a spot index. Trade its ETF (e.g. NIFTYBEES/BANKBEES) or open F&O (FUT/CE/PE) to trade it!`,
    };
  }

  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, message: 'Quantity must be a positive integer.' };
  }

  const lotSize = Math.max(1, input.lotSize || 1);
  if (input.instrumentType !== 'EQ' && qty % lotSize !== 0) {
    return { ok: false, message: `F&O quantity must be a multiple of lot size (${lotSize}).` };
  }

  if (currentLtp <= 0) {
    return { ok: false, message: `${input.underlyingSymbol} was not listed or traded on ${profile.currentDate}.` };
  }

  const contractKey = input.contractKey || input.underlyingSymbol;
  const displaySymbol = input.displaySymbol || input.underlyingSymbol;
  const refPrice =
    input.orderType === 'LIMIT' || input.orderType === 'SL'
      ? Math.max(0.05, Number(input.price || currentLtp))
      : currentLtp;
  const triggerPrice = Math.max(0, Number(input.triggerPrice || 0));

  if ((input.orderType === 'SL' || input.orderType === 'SL-M') && triggerPrice <= 0) {
    return { ok: false, message: 'Stop-Loss orders require a valid Trigger Price.' };
  }

  if (input.variety === 'CO' && (!input.stopLossTrigger || input.stopLossTrigger <= 0)) {
    return { ok: false, message: 'Cover Orders (CO) require a mandatory Stop-Loss Trigger Price.' };
  }

  // Validity TTL: 1–365 minutes
  let ttlMinutes: number | undefined;
  if (input.validity === 'TTL') {
    const ttl = Math.floor(Number(input.ttlMinutes));
    if (!Number.isFinite(ttl) || ttl < 1 || ttl > 365) {
      return { ok: false, message: 'TTL validity needs a duration between 1 and 365 minutes.' };
    }
    ttlMinutes = ttl;
  }

  // Disclosed quantity: equity LIMIT / SL orders only (ignored elsewhere)
  let disclosedQty: number | undefined;
  const dq = Math.floor(Number(input.disclosedQty) || 0);
  if (dq > 0 && input.instrumentType === 'EQ' && (input.orderType === 'LIMIT' || input.orderType === 'SL')) {
    const minDq = Math.ceil(qty * 0.1);
    if (dq < minDq || dq > qty) {
      return {
        ok: false,
        message: `Disclosed quantity must be at least 10% of the order quantity (${minDq}) and not more than the order quantity (${qty}).`,
      };
    }
    disclosedQty = dq;
  }

  // Market protection: MARKET orders only
  const mpp = Number(input.marketProtectionPct) || 0;
  const marketProtectionPct = input.orderType === 'MARKET' && mpp > 0 ? Math.min(100, mpp) : undefined;

  // Attached stoploss / target (becomes a GTT once the order fills)
  let attachedGtt: Order['attachedGtt'];
  const attSl = Number(input.attachedGtt?.stoplossPrice) || 0;
  const attTg = Number(input.attachedGtt?.targetPrice) || 0;
  if (attSl > 0 || attTg > 0) {
    if (input.instrumentType !== 'EQ') {
      return { ok: false, message: 'Stoploss / target can be attached only to stock & ETF (equity) orders.' };
    }
    if (input.variety !== 'REGULAR') {
      return { ok: false, message: 'Stoploss / target can be attached only to Regular orders.' };
    }
    const entryRef =
      input.orderType === 'LIMIT' || input.orderType === 'SL'
        ? Math.max(0.05, Number(input.price || currentLtp))
        : input.orderType === 'SL-M' && Number(input.triggerPrice) > 0
          ? Number(input.triggerPrice)
          : currentLtp;
    const entryTxt = fmtInr(roundTick(entryRef));
    if (input.side === 'BUY') {
      if (attSl > 0 && attSl >= entryRef) {
        return { ok: false, message: `Stoploss (${fmtInr(attSl)}) must be below your buy price (${entryTxt}) — it limits your loss if the price falls.` };
      }
      if (attTg > 0 && attTg <= entryRef) {
        return { ok: false, message: `Target (${fmtInr(attTg)}) must be above your buy price (${entryTxt}) — it books profit when the price rises.` };
      }
    } else {
      if (attSl > 0 && attSl <= entryRef) {
        return { ok: false, message: `Stoploss (${fmtInr(attSl)}) must be above your sell price (${entryTxt}) — it limits your loss if the price rises.` };
      }
      if (attTg > 0 && attTg >= entryRef) {
        return { ok: false, message: `Target (${fmtInr(attTg)}) must be below your sell price (${entryTxt}) — it books profit when the price falls.` };
      }
    }
    attachedGtt = {};
    if (attSl > 0) attachedGtt.stoplossPrice = roundTick(attSl);
    if (attTg > 0) attachedGtt.targetPrice = roundTick(attTg);
  }
  const extras: Partial<Order> = {};
  if (disclosedQty !== undefined) extras.disclosedQty = disclosedQty;
  if (ttlMinutes !== undefined) extras.ttlMinutes = ttlMinutes;
  if (marketProtectionPct !== undefined) extras.marketProtectionPct = marketProtectionPct;
  if (attachedGtt) extras.attachedGtt = attachedGtt;

  // Check CNC Sell holdings availability
  const existingHolding = profile.holdings.find((h) => h.symbol === input.underlyingSymbol);
  const totalOwnedShares = existingHolding ? existingHolding.qty + existingHolding.t1Qty - existingHolding.pledgedQty : 0;

  if (input.product === 'CNC' && input.instrumentType === 'EQ' && input.side === 'SELL') {
    // Also subtract shares already committed to open CNC SELL orders
    const committedSellQty = profile.orders
      .filter(
        (o) =>
          (o.status === 'OPEN' || o.status === 'TRIGGER PENDING') &&
          o.product === 'CNC' &&
          o.side === 'SELL' &&
          o.underlyingSymbol === input.underlyingSymbol
      )
      .reduce((acc, o) => acc + (o.qty - o.filledQty), 0);

    if (totalOwnedShares - committedSellQty < qty) {
      const pledgedMsg =
        existingHolding && existingHolding.pledgedQty > 0
          ? ` (${existingHolding.pledgedQty} shares are pledged — unpledge first or use MIS for intraday shorting)`
          : ' (Use MIS product to short-sell stocks you do not hold)';
      return {
        ok: false,
        message: `Insufficient CNC holdings to sell ${qty} qty. Available unpledged: ${Math.max(0, totalOwnedShares - committedSellQty)}${pledgedMsg}.`,
      };
    }
  }

  if (input.product === 'MTF' && input.side === 'SELL') {
    // Allow MTF sell only if closing an existing MTF long position
    const existingMtf = profile.positions.find(
      (p) => p.contractKey === contractKey && p.product === 'MTF' && p.netQty > 0
    );
    if (!existingMtf || existingMtf.netQty < qty) {
      return {
        ok: false,
        message: 'MTF shorting is not permitted by SEBI. Use MIS or F&O (NRML) to short-sell.',
      };
    }
  }

  // Check if order reduces/closes an existing position (requires 0 new margin!)
  const existingPos = profile.positions.find(
    (p) => p.contractKey === contractKey && p.product === input.product && p.netQty !== 0
  );
  const isClosingPosition =
    existingPos &&
    ((existingPos.netQty > 0 && input.side === 'SELL' && qty <= existingPos.netQty) ||
      (existingPos.netQty < 0 && input.side === 'BUY' && qty <= Math.abs(existingPos.netQty)));

  const estCharges = calculateZerodhaCharges({
    side: input.side,
    exchange: input.exchange,
    product: input.product,
    instrumentType: input.instrumentType,
    qty,
    price: refPrice,
    isDpAlreadyChargedToday: profile.dpSoldToday.includes(input.underlyingSymbol),
  });

  const requiredMargin = isClosingPosition
    ? 0
    : calculateRequiredMargin({
        side: input.side,
        product: input.product,
        instrumentType: input.instrumentType,
        qty,
        price: refPrice,
        underlyingPrice: underlyingSpot,
        existingHoldingQty: totalOwnedShares,
      });

  const canUseCollateral =
    input.product === 'MIS' ||
    input.product === 'MTF' ||
    input.instrumentType === 'FUT' ||
    ((input.instrumentType === 'CE' || input.instrumentType === 'PE') && input.side === 'SELL');

  const availMargin = getAvailableMargin(
    profile,
    (sym) => (sym === input.underlyingSymbol ? underlyingSpot : 0),
    canUseCollateral
  );

  if (requiredMargin + estCharges.totalCharges > availMargin + 0.01) {
    const shortfall = Number((requiredMargin + estCharges.totalCharges - availMargin).toFixed(2));
    const orderRej: Order = {
      id: uid('ord'),
      side: input.side,
      exchange: input.exchange,
      product: input.product,
      variety: input.variety,
      orderType: input.orderType,
      validity: input.validity,
      instrumentType: input.instrumentType,
      contractKey,
      underlyingSymbol: input.underlyingSymbol,
      displaySymbol,
      strikePrice: input.strikePrice,
      expiryDate: input.expiryDate,
      lotSize,
      qty,
      filledQty: 0,
      price: roundTick(refPrice),
      triggerPrice: roundTick(triggerPrice),
      avgFillPrice: 0,
      status: 'REJECTED',
      statusMessage: `Insufficient funds. Required: ₹${(requiredMargin + estCharges.totalCharges).toLocaleString('en-IN')}, Shortfall: ₹${shortfall.toLocaleString('en-IN')}`,
      placedDate: profile.currentDate,
      placedTime: profile.intraday.timeLabel,
      updatedAt: `${profile.currentDate} ${profile.intraday.timeLabel}`,
      charges: estCharges,
      marginBlocked: 0,
      tag: input.tag,
      ...extras,
    };
    addOrderHistory(orderRej, profile.currentDate, profile.intraday.timeLabel, 'REJECTED', orderRej.statusMessage);
    profile.orders.unshift(orderRej);
    return { ok: false, message: orderRej.statusMessage!, order: orderRej };
  }

  const initialStatus: Order['status'] =
    input.variety === 'AMO'
      ? 'AMO REQ RECEIVED'
      : input.orderType === 'SL' || input.orderType === 'SL-M'
        ? 'TRIGGER PENDING'
        : 'OPEN';

  const order: Order = {
    id: uid('ord'),
    side: input.side,
    exchange: input.exchange,
    product: input.product,
    variety: input.variety,
    orderType: input.orderType,
    validity: input.validity,
    instrumentType: input.instrumentType,
    contractKey,
    underlyingSymbol: input.underlyingSymbol,
    displaySymbol,
    strikePrice: input.strikePrice,
    expiryDate: input.expiryDate,
    lotSize,
    qty,
    filledQty: 0,
    price: roundTick(refPrice),
    triggerPrice: triggerPrice > 0 ? roundTick(triggerPrice) : 0,
    stopLossTrigger: input.stopLossTrigger ? roundTick(input.stopLossTrigger) : undefined,
    icebergLegs: input.variety === 'ICEBERG' ? Math.max(2, Math.min(10, input.icebergLegs || 3)) : undefined,
    icebergCurrentLeg: input.variety === 'ICEBERG' ? 1 : undefined,
    avgFillPrice: 0,
    status: initialStatus,
    placedDate: profile.currentDate,
    placedTime: profile.intraday.timeLabel,
    updatedAt: `${profile.currentDate} ${profile.intraday.timeLabel}`,
    charges: estCharges,
    marginBlocked: requiredMargin,
    tag: input.tag,
    ...extras,
  };
  addOrderHistory(
    order,
    profile.currentDate,
    profile.intraday.timeLabel,
    initialStatus,
    initialStatus === 'AMO REQ RECEIVED' ? 'After-market order queued for next open' : 'Order placed'
  );

  profile.orders.unshift(order);

  // If AMO, keep queued until next trading day open
  if (order.variety === 'AMO') {
    return {
      ok: true,
      message: `AMO ${order.side} order queued for next market open (${order.displaySymbol} × ${order.qty}).`,
      order,
    };
  }

  // Evaluate immediate execution against current LTP
  const matched = tryExecutePendingOrderOnBar(
    profile,
    order,
    { open: currentLtp, high: currentLtp, low: currentLtp, close: currentLtp },
    underlyingSpot,
    profile.currentDate,
    profile.intraday.timeLabel
  );

  // IOC unfilled cancellation
  if (!matched && order.validity === 'IOC' && (order.status === 'OPEN' || order.status === 'TRIGGER PENDING')) {
    cancelOrder(order, profile.currentDate, profile.intraday.timeLabel, 'IOC order cancelled (price not immediately available).');
    return { ok: false, message: order.statusMessage!, order };
  }

  if (matched) {
    return {
      ok: true,
      message: `${order.side} ${order.qty} ${order.displaySymbol} executed @ ₹${order.avgFillPrice.toLocaleString('en-IN')}${
        order.attachedGtt?.createdGttId ? ' — stoploss/target GTT created.' : ''
      }`,
      order,
    };
  }

  if (order.status === 'CANCELLED') {
    return { ok: false, message: order.statusMessage || 'Order cancelled.', order };
  }

  return {
    ok: true,
    message: `${order.orderType} ${order.side} order placed (${order.status}) for ${order.displaySymbol}.`,
    order,
  };
}

/**
 * Evaluates a single pending order against an OHLC bar [low, high] and executes fill + accounting if triggered.
 */
export function tryExecutePendingOrderOnBar(
  profile: SimulationProfile,
  order: Order,
  bar: { open: number; high: number; low: number; close: number },
  underlyingSpot: number,
  execDate: string,
  execTime: string,
  isAutoSquareOff = false,
  events?: string[]
): boolean {
  if (order.status !== 'OPEN' && order.status !== 'TRIGGER PENDING' && order.status !== 'AMO REQ RECEIVED') {
    return false;
  }

  if (order.variety === 'AMO' && order.status === 'AMO REQ RECEIVED') {
    // Convert AMO into active order at market open
    order.status = order.orderType === 'SL' || order.orderType === 'SL-M' ? 'TRIGGER PENDING' : 'OPEN';
    addOrderHistory(order, execDate, execTime, order.status, 'AMO sent to exchange at market open');
  }

  let fillPrice: number | null = null;

  if (order.orderType === 'MARKET') {
    fillPrice = bar.open > 0 ? bar.open : bar.close;
  } else if (order.orderType === 'LIMIT') {
    if (order.side === 'BUY' && bar.low <= order.price) {
      fillPrice = Math.min(order.price, bar.open > 0 ? bar.open : order.price);
    } else if (order.side === 'SELL' && bar.high >= order.price) {
      fillPrice = Math.max(order.price, bar.open > 0 ? bar.open : order.price);
    }
  } else if (order.orderType === 'SL-M') {
    if (order.side === 'BUY' && bar.high >= order.triggerPrice) {
      fillPrice = Math.max(order.triggerPrice, bar.open);
    } else if (order.side === 'SELL' && bar.low <= order.triggerPrice) {
      fillPrice = Math.min(order.triggerPrice, bar.open);
    }
  } else if (order.orderType === 'SL') {
    // First check trigger
    if (order.status === 'TRIGGER PENDING') {
      if (
        (order.side === 'BUY' && bar.high >= order.triggerPrice) ||
        (order.side === 'SELL' && bar.low <= order.triggerPrice)
      ) {
        order.status = 'OPEN';
        addOrderHistory(order, execDate, execTime, 'TRIGGERED', `Trigger ₹${order.triggerPrice} hit — limit order now OPEN`);
      }
    }
    if (order.status === 'OPEN') {
      if (order.side === 'BUY' && bar.low <= order.price && bar.high >= order.triggerPrice) {
        fillPrice = order.price;
      } else if (order.side === 'SELL' && bar.high >= order.price && bar.low <= order.triggerPrice) {
        fillPrice = order.price;
      }
    }
  }

  if (fillPrice === null || fillPrice <= 0) return false;
  fillPrice = roundTick(fillPrice);

  // Market protection: refuse fills too far from the reference LTP captured at placement
  const mpp = order.orderType === 'MARKET' ? order.marketProtectionPct || 0 : 0;
  if (mpp > 0 && order.price > 0) {
    const limit = order.side === 'BUY' ? order.price * (1 + mpp / 100) : order.price * (1 - mpp / 100);
    const tooFar = order.side === 'BUY' ? fillPrice > limit + 1e-9 : fillPrice < limit - 1e-9;
    if (tooFar) {
      const msg = `Market protection (${mpp}%) cancelled this order: the fill price ₹${fillPrice} was more than ${mpp}% away from the reference price ₹${order.price}.`;
      cancelOrder(order, execDate, execTime, msg);
      events?.push(`Order cancelled by market protection: ${order.side} ${order.qty} ${order.displaySymbol}`);
      return false;
    }
  }

  if (order.orderType === 'SL-M') {
    addOrderHistory(order, execDate, execTime, 'TRIGGERED', `Trigger ₹${order.triggerPrice} hit — market order sent`);
  }

  // Compute exact charges at actual fill price
  const charges = calculateZerodhaCharges({
    side: order.side,
    exchange: order.exchange,
    product: order.product,
    instrumentType: order.instrumentType,
    qty: order.qty,
    price: fillPrice,
    isDpAlreadyChargedToday: profile.dpSoldToday.includes(order.underlyingSymbol),
    isAutoSquareOff,
  });

  order.filledQty = order.qty;
  order.avgFillPrice = fillPrice;
  order.charges = charges;
  order.status = 'COMPLETE';
  order.marginBlocked = 0;
  order.updatedAt = `${execDate} ${execTime}`;

  addOrderHistory(
    order,
    execDate,
    execTime,
    'COMPLETE',
    `Filled ${order.qty}${order.variety === 'ICEBERG' && order.icebergLegs ? ` (${order.icebergLegs} iceberg legs)` : ''} @ ₹${fillPrice}`
  );
  if (order.variety === 'ICEBERG' && order.icebergLegs) order.icebergCurrentLeg = order.icebergLegs;

  applyOrderFillToPortfolio(profile, order, fillPrice, charges, underlyingSpot, execDate, execTime);
  createAttachedGtt(profile, order, execDate, execTime, events);

  // If Cover Order (CO), spawn linked Stop-Loss Market child order
  if (order.variety === 'CO' && order.stopLossTrigger && order.stopLossTrigger > 0) {
    const slSide: OrderSide = order.side === 'BUY' ? 'SELL' : 'BUY';
    const childOrder: Order = {
      id: uid('ord'),
      side: slSide,
      exchange: order.exchange,
      product: order.product,
      variety: 'CO',
      orderType: 'SL-M',
      validity: 'DAY',
      instrumentType: order.instrumentType,
      contractKey: order.contractKey,
      underlyingSymbol: order.underlyingSymbol,
      displaySymbol: order.displaySymbol,
      strikePrice: order.strikePrice,
      expiryDate: order.expiryDate,
      lotSize: order.lotSize,
      qty: order.qty,
      filledQty: 0,
      price: order.stopLossTrigger,
      triggerPrice: order.stopLossTrigger,
      avgFillPrice: 0,
      status: 'TRIGGER PENDING',
      placedDate: execDate,
      placedTime: execTime,
      updatedAt: `${execDate} ${execTime}`,
      charges: calculateZerodhaCharges({
        side: slSide,
        exchange: order.exchange,
        product: order.product,
        instrumentType: order.instrumentType,
        qty: order.qty,
        price: order.stopLossTrigger,
      }),
      marginBlocked: 0,
      tag: 'CO-SL',
      parentOrderId: order.id,
    };
    addOrderHistory(childOrder, execDate, execTime, 'TRIGGER PENDING', 'Cover order stop-loss leg placed');
    profile.orders.unshift(childOrder);
  }

  return true;
}

/**
 * Creates the stoploss / target GTT attached to an order once it has fully filled
 * (OCO when both prices are set, SINGLE otherwise) on the opposite side.
 */
function createAttachedGtt(
  profile: SimulationProfile,
  order: Order,
  execDate: string,
  execTime: string,
  events?: string[]
): void {
  const att = order.attachedGtt;
  if (!att || att.createdGttId || order.instrumentType !== 'EQ' || order.status !== 'COMPLETE') return;
  const sl = att.stoplossPrice || 0;
  const tg = att.targetPrice || 0;
  if (sl <= 0 && tg <= 0) return;
  const qty = order.filledQty || order.qty;
  const side: OrderSide = order.side === 'BUY' ? 'SELL' : 'BUY';
  const product: GttRule['product'] = order.product === 'MIS' ? 'MIS' : order.product === 'MTF' ? 'MTF' : 'CNC';
  const isOco = sl > 0 && tg > 0;
  const legs: GttLeg[] = [];
  if (tg > 0) legs.push({ label: isOco ? 'TARGET' : 'SINGLE', triggerPrice: tg, limitPrice: tg, qty });
  if (sl > 0) legs.push({ label: isOco ? 'STOPLOSS' : 'SINGLE', triggerPrice: sl, limitPrice: sl, qty });

  const expDt = new Date(execDate + 'T00:00:00Z');
  expDt.setUTCFullYear(expDt.getUTCFullYear() + 1);
  const gtt: GttRule = {
    id: uid('gtt'),
    type: isOco ? 'OCO' : 'SINGLE',
    symbol: order.underlyingSymbol,
    exchange: order.exchange === 'BSE' ? 'BSE' : 'NSE',
    side,
    product,
    createdAtDate: execDate,
    expiresAtDate: expDt.toISOString().slice(0, 10),
    ltpAtCreation: order.avgFillPrice,
    legs,
    status: 'ACTIVE',
  };
  profile.gtts.unshift(gtt);
  att.createdGttId = gtt.id;

  const parts = [tg > 0 ? `target ₹${tg}` : '', sl > 0 ? `stoploss ₹${sl}` : ''].filter(Boolean).join(', ');
  addOrderHistory(order, execDate, execTime, 'GTT CREATED', `${gtt.type} GTT ${side} ${qty} (${parts})`);
  const msg = `${gtt.type === 'OCO' ? 'OCO' : 'Single'} GTT created for ${order.displaySymbol}: ${side} ${qty} (${parts}).`;
  events?.push(msg);
  pushNotification(profile, execDate, 'GTT', 'Stoploss / target GTT created', msg);
}

function applyOrderFillToPortfolio(
  profile: SimulationProfile,
  order: Order,
  fillPrice: number,
  charges: Order['charges'],
  underlyingSpot: number,
  execDate: string,
  execTime: string
): void {
  const qty = order.qty;
  const turnover = Number((qty * fillPrice).toFixed(2));

  // === 1. CNC EQUITY DELIVERY ===
  if (order.product === 'CNC' && order.instrumentType === 'EQ') {
    if (order.side === 'BUY') {
      let holding = profile.holdings.find((h) => h.symbol === order.underlyingSymbol);
      if (!holding) {
        holding = {
          symbol: order.underlyingSymbol,
          exchange: order.exchange === 'BSE' ? 'BSE' : 'NSE',
          qty: 0,
          t1Qty: qty,
          pledgedQty: 0,
          avgPrice: fillPrice,
          firstBuyDate: execDate,
          lots: [{ buyDate: execDate, qty, buyPrice: fillPrice }],
          totalDividendsReceived: 0,
        };
        profile.holdings.push(holding);
      } else {
        const totalPrev = holding.qty + holding.t1Qty;
        const newAvg = (totalPrev * holding.avgPrice + qty * fillPrice) / (totalPrev + qty);
        holding.t1Qty += qty;
        holding.avgPrice = Number(newAvg.toFixed(2));
        holding.lots.push({ buyDate: execDate, qty, buyPrice: fillPrice });
      }

      appendLedger(
        profile,
        execDate,
        'TRADE_BUY',
        `CNC BUY ${qty} × ${order.displaySymbol} @ ₹${fillPrice}`,
        turnover,
        0
      );
      if (charges.totalCharges > 0) {
        appendLedger(
          profile,
          execDate,
          'CHARGES',
          `Statutory charges (${order.displaySymbol} CNC BUY)`,
          charges.totalCharges,
          0
        );
      }

      profile.trades.unshift({
        id: uid('trd'),
        orderId: order.id,
        date: execDate,
        time: execTime,
        symbol: order.underlyingSymbol,
        displaySymbol: order.displaySymbol,
        exchange: order.exchange,
        product: order.product,
        instrumentType: order.instrumentType,
        side: 'BUY',
        qty,
        price: fillPrice,
        turnover,
        charges,
      });
    } else {
      // CNC SELL — FIFO tax lot matching
      const holding = profile.holdings.find((h) => h.symbol === order.underlyingSymbol);
      let remaining = qty;
      let costBasis = 0;
      let weightedDays = 0;

      if (holding) {
        while (remaining > 0 && holding.lots.length > 0) {
          const lot = holding.lots[0];
          const take = Math.min(remaining, lot.qty);
          costBasis += take * lot.buyPrice;
          weightedDays += take * daysBetween(lot.buyDate, execDate);
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 0) holding.lots.shift();
        }
        // Deduct from settled qty first, then t1Qty
        const fromSettled = Math.min(holding.qty, qty);
        holding.qty -= fromSettled;
        holding.t1Qty = Math.max(0, holding.t1Qty - (qty - fromSettled));

        const totalLeft = holding.qty + holding.t1Qty;
        if (totalLeft <= 0) {
          profile.holdings = profile.holdings.filter((h) => h.symbol !== order.underlyingSymbol);
        } else if (holding.lots.length > 0) {
          const lotVal = holding.lots.reduce((a, l) => a + l.qty * l.buyPrice, 0);
          const lotQty = holding.lots.reduce((a, l) => a + l.qty, 0);
          if (lotQty > 0) holding.avgPrice = Number((lotVal / lotQty).toFixed(2));
        }
      }

      const avgHoldDays = Math.round(weightedDays / qty);
      const grossPnl = turnover - costBasis;
      const netRealizedPnl = Number((grossPnl - charges.totalCharges).toFixed(2));
      const taxCategory: TaxCategory =
        avgHoldDays === 0 ? 'INTRADAY' : avgHoldDays > 365 ? 'LTCG' : 'STCG';

      if (charges.dpCharges > 0 && !profile.dpSoldToday.includes(order.underlyingSymbol)) {
        profile.dpSoldToday.push(order.underlyingSymbol);
      }

      appendLedger(
        profile,
        execDate,
        'TRADE_SELL',
        `CNC SELL ${qty} × ${order.displaySymbol} @ ₹${fillPrice}`,
        0,
        turnover
      );
      if (charges.totalCharges - charges.dpCharges > 0) {
        appendLedger(
          profile,
          execDate,
          'CHARGES',
          `Statutory charges (${order.displaySymbol} CNC SELL)`,
          Number((charges.totalCharges - charges.dpCharges).toFixed(2)),
          0
        );
      }
      if (charges.dpCharges > 0) {
        appendLedger(
          profile,
          execDate,
          'DP_CHARGE',
          `CDSL Depository (DP) charge for ${order.displaySymbol}`,
          charges.dpCharges,
          0
        );
      }

      profile.trades.unshift({
        id: uid('trd'),
        orderId: order.id,
        date: execDate,
        time: execTime,
        symbol: order.underlyingSymbol,
        displaySymbol: order.displaySymbol,
        exchange: order.exchange,
        product: order.product,
        instrumentType: order.instrumentType,
        side: 'SELL',
        qty,
        price: fillPrice,
        turnover,
        charges,
        realizedPnl: netRealizedPnl,
        holdingDays: avgHoldDays,
        taxCategory,
      });
    }
    return;
  }

  // === 2. POSITIONS (MIS Intraday, MTF Margin Delivery, NRML Futures & Options) ===
  const posId = `${order.contractKey}|${order.product}`;
  let pos = profile.positions.find((p) => p.id === posId);
  if (!pos) {
    pos = {
      id: posId,
      contractKey: order.contractKey,
      underlyingSymbol: order.underlyingSymbol,
      displaySymbol: order.displaySymbol,
      exchange: order.exchange,
      product: order.product,
      instrumentType: order.instrumentType,
      strikePrice: order.strikePrice,
      expiryDate: order.expiryDate,
      lotSize: order.lotSize,
      netQty: 0,
      buyQty: 0,
      sellQty: 0,
      avgPrice: 0,
      buyValue: 0,
      sellValue: 0,
      realizedPnl: 0,
      marginBlocked: 0,
      openedDate: execDate,
      mtfInterestAccrued: 0,
      lots: [],
    };
    profile.positions.push(pos);
  }

  const signedDelta = order.side === 'BUY' ? qty : -qty;
  const prevNet = pos.netQty;
  let realizedGross = 0;

  if (order.side === 'BUY') {
    pos.buyQty += qty;
    pos.buyValue = Number((pos.buyValue + turnover).toFixed(2));
  } else {
    pos.sellQty += qty;
    pos.sellValue = Number((pos.sellValue + turnover).toFixed(2));
  }

  if (prevNet === 0 || Math.sign(prevNet) === Math.sign(signedDelta)) {
    // Opening or adding to existing direction
    const totalAbs = Math.abs(prevNet) + qty;
    pos.avgPrice = Number(((Math.abs(prevNet) * pos.avgPrice + qty * fillPrice) / totalAbs).toFixed(2));
    pos.netQty = prevNet + signedDelta;
    if (prevNet === 0) pos.openedDate = execDate;
  } else {
    // Closing or reversing existing position
    const closedQty = Math.min(Math.abs(prevNet), qty);
    if (prevNet > 0) {
      // Closing long
      realizedGross = (fillPrice - pos.avgPrice) * closedQty;
    } else {
      // Covering short
      realizedGross = (pos.avgPrice - fillPrice) * closedQty;
    }
    pos.realizedPnl = Number((pos.realizedPnl + realizedGross).toFixed(2));

    const newNet = prevNet + signedDelta;
    pos.netQty = newNet;
    if (newNet === 0) {
      pos.avgPrice = 0;
    } else if (Math.sign(newNet) !== Math.sign(prevNet)) {
      // Reversed direction with remainder
      pos.avgPrice = fillPrice;
      pos.openedDate = execDate;
    }

    // Settle gross realized M2M into cash immediately
    if (realizedGross >= 0) {
      appendLedger(
        profile,
        execDate,
        order.instrumentType === 'EQ' ? 'TRADE_SELL' : 'FNO_SETTLEMENT',
        `Realized M2M profit on ${closedQty} × ${order.displaySymbol} (${order.product})`,
        0,
        realizedGross
      );
    } else {
      appendLedger(
        profile,
        execDate,
        order.instrumentType === 'EQ' ? 'TRADE_SELL' : 'FNO_SETTLEMENT',
        `Realized M2M loss on ${closedQty} × ${order.displaySymbol} (${order.product})`,
        Math.abs(realizedGross),
        0
      );
    }
  }

  // Deduct brokerage & statutory charges
  if (charges.totalCharges > 0) {
    appendLedger(
      profile,
      execDate,
      'CHARGES',
      `Brokerage & statutory charges (${order.displaySymbol} ${order.product} ${order.side})`,
      charges.totalCharges,
      0
    );
  }

  // Recompute marginBlocked for remaining open netQty
  if (pos.netQty === 0) {
    pos.marginBlocked = 0;
  } else {
    pos.marginBlocked = calculateRequiredMargin({
      side: pos.netQty > 0 ? 'BUY' : 'SELL',
      product: pos.product,
      instrumentType: pos.instrumentType,
      qty: Math.abs(pos.netQty),
      price: pos.avgPrice,
      underlyingPrice: underlyingSpot || pos.avgPrice,
    });
  }

  const closedAny = prevNet !== 0 && Math.sign(prevNet) !== Math.sign(signedDelta);
  const holdDays = daysBetween(pos.openedDate, execDate);
  const taxCat: TaxCategory =
    order.instrumentType !== 'EQ'
      ? 'FNO'
      : order.product === 'MIS' || holdDays === 0
        ? 'INTRADAY'
        : holdDays > 365
          ? 'LTCG'
          : 'STCG';

  profile.trades.unshift({
    id: uid('trd'),
    orderId: order.id,
    date: execDate,
    time: execTime,
    symbol: order.underlyingSymbol,
    displaySymbol: order.displaySymbol,
    exchange: order.exchange,
    product: order.product,
    instrumentType: order.instrumentType,
    side: order.side,
    qty,
    price: fillPrice,
    turnover,
    charges,
    realizedPnl: closedAny ? Number((realizedGross - charges.totalCharges).toFixed(2)) : undefined,
    holdingDays: closedAny ? holdDays : undefined,
    taxCategory: closedAny ? taxCat : undefined,
  });
}

/**
 * Converts an open MIS long equity position to CNC Delivery Holding (or CNC Holding to MIS).
 */
export function convertPositionProduct(
  profile: SimulationProfile,
  positionId: string,
  toProduct?: ProductType,
  qty?: number,
  underlyingSpot?: number
): { ok: boolean; message: string } {
  const pos = profile.positions.find((p) => p.id === positionId);

  // CNC → MIS: today's delivery buy (T1 shares) back to an intraday position.
  // positionId may be the holding symbol or '<SYMBOL>|CNC'.
  if (toProduct === 'MIS' && (!pos || pos.product === 'CNC')) {
    const sym = positionId.split('|')[0];
    const holding = profile.holdings.find((h) => h.symbol === sym);
    if (!holding) return { ok: false, message: `No CNC holding of ${sym} found to convert.` };
    return convertDeliveryToIntraday(profile, holding, qty, underlyingSpot);
  }

  if (!pos || pos.netQty === 0) {
    return { ok: false, message: 'No active open position to convert.' };
  }
  const fullQty = Math.abs(pos.netQty);
  const convQty = qty === undefined || qty === null ? fullQty : Math.floor(Number(qty));
  if (!Number.isFinite(convQty) || convQty <= 0) {
    return { ok: false, message: 'Enter a valid quantity to convert.' };
  }
  if (convQty > fullQty) {
    return { ok: false, message: `You can convert at most ${fullQty} qty of this position.` };
  }

  if (pos.instrumentType !== 'EQ') {
    if (!toProduct) {
      return { ok: false, message: 'Only Equity positions can be converted between MIS and CNC.' };
    }
    if (!((pos.product === 'NRML' && toProduct === 'MIS') || (pos.product === 'MIS' && toProduct === 'NRML'))) {
      return {
        ok: false,
        message: 'F&O positions can only be converted between NRML (carry forward) and MIS (intraday).',
      };
    }
    const lot = Math.max(1, pos.lotSize || 1);
    if (convQty % lot !== 0) {
      return { ok: false, message: `F&O conversion quantity must be a multiple of the lot size (${lot}).` };
    }
    return movePositionToProduct(profile, pos, toProduct, convQty, underlyingSpot);
  }

  const target: ProductType = toProduct || 'CNC';
  if (target === pos.product) {
    return { ok: false, message: `This position is already ${target}.` };
  }
  if (target === 'NRML') {
    return { ok: false, message: 'NRML is for F&O. Equity positions convert between MIS (intraday), MTF and CNC (delivery).' };
  }

  if (target === 'CNC') {
    if (pos.netQty < 0) {
      return { ok: false, message: 'Short MIS positions cannot be converted to CNC Delivery in Indian cash markets.' };
    }
    if (pos.product !== 'MIS' && pos.product !== 'MTF') {
      return { ok: false, message: 'Unsupported position conversion.' };
    }
    const isFull = convQty === fullQty;
    const freedMargin = isFull ? pos.marginBlocked : Number(((pos.marginBlocked * convQty) / fullQty).toFixed(2));
    const fullCost = Number((convQty * pos.avgPrice).toFixed(2));
    const freeCashAfterUnblock = profile.availableCash - (getUsedMargin(profile) - freedMargin);
    if (freeCashAfterUnblock < fullCost) {
      return {
        ok: false,
        message: `Insufficient cash to convert to CNC Delivery. Need ₹${fullCost.toLocaleString('en-IN')}, available: ₹${Math.max(0, freeCashAfterUnblock).toLocaleString('en-IN')}.`,
      };
    }

    appendLedger(
      profile,
      profile.currentDate,
      'TRADE_BUY',
      `Position Conversion (${pos.product} → CNC): ${convQty} × ${pos.underlyingSymbol} @ ₹${pos.avgPrice}`,
      fullCost,
      0
    );

    let holding = profile.holdings.find((h) => h.symbol === pos.underlyingSymbol);
    if (!holding) {
      holding = {
        symbol: pos.underlyingSymbol,
        exchange: pos.exchange === 'BSE' ? 'BSE' : 'NSE',
        qty: 0,
        t1Qty: convQty,
        pledgedQty: 0,
        avgPrice: pos.avgPrice,
        firstBuyDate: profile.currentDate,
        lots: [{ buyDate: profile.currentDate, qty: convQty, buyPrice: pos.avgPrice }],
        totalDividendsReceived: 0,
      };
      profile.holdings.push(holding);
    } else {
      const totalPrev = holding.qty + holding.t1Qty;
      holding.avgPrice = Number(
        ((totalPrev * holding.avgPrice + convQty * pos.avgPrice) / (totalPrev + convQty)).toFixed(2)
      );
      holding.t1Qty += convQty;
      holding.lots.push({ buyDate: profile.currentDate, qty: convQty, buyPrice: pos.avgPrice });
    }

    if (isFull) {
      pos.netQty = 0;
      pos.marginBlocked = 0;
      return { ok: true, message: `Converted ${holding.symbol} position to CNC Delivery Holdings.` };
    }
    pos.netQty -= convQty;
    pos.buyQty = Math.max(0, pos.buyQty - convQty);
    pos.buyValue = Number(Math.max(0, pos.buyValue - convQty * pos.avgPrice).toFixed(2));
    pos.marginBlocked = Number(Math.max(0, pos.marginBlocked - freedMargin).toFixed(2));
    return {
      ok: true,
      message: `Converted ${convQty} of ${fullQty} ${holding.symbol} to CNC Delivery Holdings (${pos.netQty} remain ${pos.product}).`,
    };
  }

  // Equity MIS ↔ MTF (long positions only)
  if (pos.product === 'CNC' || (target !== 'MIS' && target !== 'MTF')) {
    return { ok: false, message: 'Unsupported position conversion.' };
  }
  if (pos.netQty < 0) {
    return {
      ok: false,
      message: 'Short positions cannot be converted to MTF — SEBI allows MTF only for buying. Keep it MIS or square it off.',
    };
  }
  return movePositionToProduct(profile, pos, target, convQty, underlyingSpot);
}

/** Moves convQty of a position into the same contract under another product (MIS ↔ MTF, MIS ↔ NRML). */
function movePositionToProduct(
  profile: SimulationProfile,
  pos: Position,
  toProduct: ProductType,
  convQty: number,
  underlyingSpot?: number
): { ok: boolean; message: string } {
  const sign = Math.sign(pos.netQty);
  const side: OrderSide = sign > 0 ? 'BUY' : 'SELL';
  const fullQty = Math.abs(pos.netQty);
  const isFull = convQty === fullQty;
  const freedMargin = isFull ? pos.marginBlocked : Number(((pos.marginBlocked * convQty) / fullQty).toFixed(2));

  const targetId = `${pos.contractKey}|${toProduct}`;
  let target = profile.positions.find((p) => p.id === targetId);
  if (target && target.netQty !== 0 && Math.sign(target.netQty) !== sign) {
    return {
      ok: false,
      message: `You already have an opposite ${toProduct} position in ${pos.displaySymbol}. Square it off before converting.`,
    };
  }
  const targetAbs = target ? Math.abs(target.netQty) : 0;
  const newAbs = targetAbs + convQty;
  const newAvg = Number(
    ((targetAbs * (target?.avgPrice || 0) + convQty * pos.avgPrice) / newAbs).toFixed(2)
  );
  const newTargetMargin = calculateRequiredMargin({
    side,
    product: toProduct,
    instrumentType: pos.instrumentType,
    qty: newAbs,
    price: newAvg,
    underlyingPrice: underlyingSpot || newAvg,
  });
  const targetCurMargin = target && target.netQty !== 0 ? target.marginBlocked : 0;
  const extraNeeded = Number((newTargetMargin - targetCurMargin - freedMargin).toFixed(2));
  if (extraNeeded > 0) {
    const avail = getAvailableMargin(profile, () => 0, true);
    if (extraNeeded > avail + 0.01) {
      return {
        ok: false,
        message: `Insufficient margin to convert to ${toProduct}. Extra margin needed: ₹${extraNeeded.toLocaleString('en-IN')}, available: ₹${Math.max(0, avail).toLocaleString('en-IN')}.`,
      };
    }
  }

  if (!target) {
    target = {
      ...pos,
      id: targetId,
      product: toProduct,
      netQty: 0,
      buyQty: 0,
      sellQty: 0,
      avgPrice: 0,
      buyValue: 0,
      sellValue: 0,
      realizedPnl: 0,
      marginBlocked: 0,
      mtfInterestAccrued: 0,
      lots: [],
    };
    profile.positions.push(target);
  }
  if (target.netQty === 0) target.openedDate = pos.openedDate;

  const movedValue = Number((convQty * pos.avgPrice).toFixed(2));
  if (sign > 0) {
    pos.buyQty = Math.max(0, pos.buyQty - convQty);
    pos.buyValue = Number(Math.max(0, pos.buyValue - movedValue).toFixed(2));
    target.buyQty += convQty;
    target.buyValue = Number((target.buyValue + movedValue).toFixed(2));
  } else {
    pos.sellQty = Math.max(0, pos.sellQty - convQty);
    pos.sellValue = Number(Math.max(0, pos.sellValue - movedValue).toFixed(2));
    target.sellQty += convQty;
    target.sellValue = Number((target.sellValue + movedValue).toFixed(2));
  }
  target.netQty = sign * newAbs;
  target.avgPrice = newAvg;
  target.marginBlocked = newTargetMargin;

  const fromProduct = pos.product;
  pos.netQty -= sign * convQty;
  pos.marginBlocked = isFull ? 0 : Number(Math.max(0, pos.marginBlocked - freedMargin).toFixed(2));

  return {
    ok: true,
    message: `Converted ${convQty} ${pos.displaySymbol} from ${fromProduct} to ${toProduct}.${
      toProduct === 'MIS' ? ' MIS positions are auto squared-off at 3:20 PM.' : ''
    }`,
  };
}

/**
 * CNC → MIS for today's delivery buys (holding.t1Qty). qty defaults to all of t1Qty.
 */
export function convertHoldingToIntraday(
  profile: SimulationProfile,
  symbol: string,
  qty?: number,
  underlyingSpot?: number
): { ok: boolean; message: string } {
  const holding = profile.holdings.find((h) => h.symbol === symbol);
  if (!holding) return { ok: false, message: `No CNC holding of ${symbol} found to convert.` };
  return convertDeliveryToIntraday(profile, holding, qty, underlyingSpot);
}

/** CNC → MIS: turns today's (unsettled T1) delivery purchase back into an intraday position. */
function convertDeliveryToIntraday(
  profile: SimulationProfile,
  holding: Holding,
  qty: number | undefined,
  underlyingSpot?: number
): { ok: boolean; message: string } {
  if (holding.t1Qty <= 0) {
    return {
      ok: false,
      message: `Only shares bought today can be converted from CNC to MIS. Your ${holding.symbol} shares are already settled in your demat.`,
    };
  }
  const convQty = qty === undefined || qty === null ? holding.t1Qty : Math.floor(Number(qty));
  if (!Number.isFinite(convQty) || convQty <= 0) {
    return { ok: false, message: 'Enter a valid quantity to convert.' };
  }
  if (convQty > holding.t1Qty) {
    return {
      ok: false,
      message: `You can convert at most ${holding.t1Qty} ${holding.symbol} shares (bought today) from CNC to MIS.`,
    };
  }
  const committedSellQty = profile.orders
    .filter(
      (o) =>
        (o.status === 'OPEN' || o.status === 'TRIGGER PENDING' || o.status === 'AMO REQ RECEIVED') &&
        o.product === 'CNC' &&
        o.side === 'SELL' &&
        o.underlyingSymbol === holding.symbol
    )
    .reduce((acc, o) => acc + (o.qty - o.filledQty), 0);
  if (holding.qty + holding.t1Qty - holding.pledgedQty - committedSellQty < convQty) {
    return { ok: false, message: `Some ${holding.symbol} shares are reserved by open CNC sell orders. Cancel them first.` };
  }
  const misId = `${holding.symbol}|MIS`;
  const existingMis = profile.positions.find((p) => p.id === misId);
  if (existingMis && existingMis.netQty < 0) {
    return { ok: false, message: `You have an MIS short in ${holding.symbol}. Square it off before converting.` };
  }

  // Take shares out of today's lots (latest first)
  let remaining = convQty;
  let cost = 0;
  for (let i = holding.lots.length - 1; i >= 0 && remaining > 0; i--) {
    const lot = holding.lots[i];
    if (lot.buyDate !== profile.currentDate) continue;
    const take = Math.min(remaining, lot.qty);
    lot.qty -= take;
    cost += take * lot.buyPrice;
    remaining -= take;
  }
  if (remaining > 0) cost += remaining * holding.avgPrice;
  holding.lots = holding.lots.filter((l) => l.qty > 0);
  cost = Number(cost.toFixed(2));
  const avg = Number((cost / convQty).toFixed(2));

  holding.t1Qty -= convQty;
  if (holding.qty + holding.t1Qty <= 0) {
    profile.holdings = profile.holdings.filter((h) => h.symbol !== holding.symbol);
  } else if (holding.lots.length > 0) {
    const lotVal = holding.lots.reduce((a, l) => a + l.qty * l.buyPrice, 0);
    const lotQty = holding.lots.reduce((a, l) => a + l.qty, 0);
    if (lotQty > 0) holding.avgPrice = Number((lotVal / lotQty).toFixed(2));
  }

  appendLedger(
    profile,
    profile.currentDate,
    'TRADE_SELL',
    `Position Conversion (CNC → MIS): ${convQty} × ${holding.symbol} @ ₹${avg} (delivery buy reversed)`,
    0,
    cost
  );

  let pos = existingMis;
  if (!pos) {
    pos = {
      id: misId,
      contractKey: holding.symbol,
      underlyingSymbol: holding.symbol,
      displaySymbol: holding.symbol,
      exchange: holding.exchange,
      product: 'MIS',
      instrumentType: 'EQ',
      lotSize: 1,
      netQty: 0,
      buyQty: 0,
      sellQty: 0,
      avgPrice: 0,
      buyValue: 0,
      sellValue: 0,
      realizedPnl: 0,
      marginBlocked: 0,
      openedDate: profile.currentDate,
      mtfInterestAccrued: 0,
      lots: [],
    };
    profile.positions.push(pos);
  }
  const prevAbs = pos.netQty;
  const newAbs = prevAbs + convQty;
  pos.avgPrice = Number(((prevAbs * pos.avgPrice + convQty * avg) / newAbs).toFixed(2));
  if (prevAbs === 0) pos.openedDate = profile.currentDate;
  pos.netQty = newAbs;
  pos.buyQty += convQty;
  pos.buyValue = Number((pos.buyValue + cost).toFixed(2));
  pos.marginBlocked = calculateRequiredMargin({
    side: 'BUY',
    product: 'MIS',
    instrumentType: 'EQ',
    qty: newAbs,
    price: pos.avgPrice,
    underlyingPrice: underlyingSpot || pos.avgPrice,
  });

  return {
    ok: true,
    message: `Converted ${convQty} ${holding.symbol} from CNC to MIS (intraday). It will be auto squared-off at 3:20 PM.`,
  };
}

/**
 * Processes an Intraday 5-minute step (09:15 -> 15:30 IST), matching open orders
 * and triggering 3:20 PM IST MIS Auto-Square-Off!
 */
export interface IntradayAdvanceOptions {
  /** Allow auto-pause (alerts / GTT) to stop a multi-step advance early. */
  allowPause?: boolean;
  /** Whether a symbol is a spot index (blocks EQ basket orders on indices). */
  isIndex?: (symbol: string) => boolean;
}

export function advanceIntradayInProfile(
  profile: SimulationProfile,
  stepsToAdvance: number,
  getQuoteForStep: (symbol: string, stepIdx: number) => MarketQuote,
  options: IntradayAdvanceOptions = {}
): { dayCompleted: boolean; triggeredEvents: string[]; pausedEarly?: boolean; pauseReason?: string } {
  const events: string[] = [];
  profile.intraday.enabled = true;

  for (let s = 0; s < stepsToAdvance; s++) {
    if (profile.intraday.stepIndex >= 74) {
      return { dayCompleted: true, triggeredEvents: events };
    }

    profile.intraday.stepIndex += 1;
    const stepIdx = profile.intraday.stepIndex;
    const timeLabel = stepIndexToTimeLabel(stepIdx);
    profile.intraday.timeLabel = timeLabel;
    profile.intraday.marketOpen = stepIdx < 74;

    // Match open / trigger-pending orders
    for (const ord of profile.orders) {
      if (ord.status !== 'OPEN' && ord.status !== 'TRIGGER PENDING') continue;
      const uQuote = getQuoteForStep(ord.underlyingSymbol, stepIdx);
      if (!uQuote.available) continue;

      let contractLtp = uQuote.ltp;
      if (ord.instrumentType !== 'EQ') {
        contractLtp = priceDerivativeContractKey(
          ord.contractKey,
          uQuote.ltp,
          uQuote.annualizedVol,
          profile.currentDate
        ).ltp;
      }

      const filled = tryExecutePendingOrderOnBar(
        profile,
        ord,
        { open: contractLtp, high: contractLtp, low: contractLtp, close: contractLtp },
        uQuote.ltp,
        profile.currentDate,
        timeLabel,
        false,
        events
      );
      if (filled) {
        events.push(`Order filled: ${ord.side} ${ord.qty} ${ord.displaySymbol} @ ₹${ord.avgFillPrice}`);
      }
    }

    // Validity TTL: each 5-minute step consumes 5 minutes of the order's life
    const nowMin = minutesSinceOpen(timeLabel);
    for (const ord of profile.orders) {
      if (ord.validity !== 'TTL' || !ord.ttlMinutes) continue;
      if (ord.status !== 'OPEN' && ord.status !== 'TRIGGER PENDING') continue;
      const elapsed = ord.placedDate === profile.currentDate ? nowMin - minutesSinceOpen(ord.placedTime) : Infinity;
      if (elapsed >= ord.ttlMinutes) {
        cancelOrder(ord, profile.currentDate, timeLabel, `TTL expired (${ord.ttlMinutes} min validity ended unfilled).`);
        events.push(`TTL expired: ${ord.side} ${ord.qty} ${ord.displaySymbol} cancelled`);
      }
    }

    // GTT rules on the step LTP
    const stepBar = (sym: string) => {
      const q = getQuoteForStep(sym, stepIdx);
      if (!q.available || q.ltp <= 0) return undefined;
      return { open: q.ltp, high: q.ltp, low: q.ltp, close: q.ltp, prevClose: q.prevClose };
    };
    const gttRes = evaluateGttRules(profile, profile.currentDate, timeLabel, stepBar, events);

    // Price alerts on the step LTP (+ Alert Trigger Orders)
    const alertFired = evaluatePriceAlerts(
      profile,
      profile.currentDate,
      timeLabel,
      stepBar,
      () => (sym: string) => {
        const q = getQuoteForStep(sym, stepIdx);
        return { ltp: q.available ? q.ltp : 0, annualizedVol: q.annualizedVol, isIndex: options.isIndex?.(sym) };
      },
      events
    );

    // 15:20 IST (stepIndex === 73): Zerodha MIS Auto-Square-Off!
    if (stepIdx === 73) {
      squareOffAllMisPositions(profile, (sym) => {
        const q = getQuoteForStep(sym, stepIdx);
        return { price: q.ltp, vol: q.annualizedVol };
      }, timeLabel, true, events);
    }

    // 15:30 IST (stepIndex === 74): Market Close — expire open DAY orders
    if (stepIdx === 74) {
      cancelOpenDayOrders(profile);
    }

    // Auto-pause a multi-step advance
    if (options.allowPause && s < stepsToAdvance - 1 && stepIdx < 74) {
      let reason: string | undefined;
      if (alertFired && profile.settings?.pauseOnAlert !== false) {
        reason = `Auto-paused at ${timeLabel}: price alert triggered.`;
      } else if (profile.autoPause.pauseOnStopLoss && gttRes.slTriggered) {
        reason = `Auto-paused at ${timeLabel}: Stop-Loss GTT triggered.`;
      } else if (profile.autoPause.pauseOnGttTrigger && gttRes.triggered) {
        reason = `Auto-paused at ${timeLabel}: GTT order triggered.`;
      }
      if (reason) {
        return { dayCompleted: false, triggeredEvents: events, pausedEarly: true, pauseReason: reason };
      }
    }
  }

  return { dayCompleted: profile.intraday.stepIndex >= 74, triggeredEvents: events };
}

/**
 * Evaluates ACTIVE GTT rules against a bar per symbol (daily bar, or a single-price
 * intraday step bar). Legs whose limit price differs from the trigger price place a
 * LIMIT order at the leg's limitPrice (Kite behaviour); otherwise the order fills at
 * the trigger (or the gap open) as before.
 */
function evaluateGttRules(
  profile: SimulationProfile,
  date: string,
  time: string,
  getBar: (symbol: string) => { open: number; high: number; low: number; close: number } | undefined,
  events: string[]
): { triggered: boolean; slTriggered: boolean } {
  let triggered = false;
  let slTriggered = false;
  for (const gtt of profile.gtts) {
    if (gtt.status !== 'ACTIVE') continue;
    if (date > gtt.expiresAtDate) {
      gtt.status = 'EXPIRED';
      continue;
    }
    const b = getBar(gtt.symbol);
    if (!b) continue;
    const isBuyRule = gtt.side === 'BUY';

    for (const leg of gtt.legs) {
      let hit = false;
      let upward: boolean;
      if (gtt.type === 'OCO') {
        // SELL OCO (exit a long): TARGET above, STOPLOSS below. BUY OCO (cover a short): mirrored.
        upward = (leg.label === 'TARGET') !== isBuyRule;
        if (upward && b.high >= leg.triggerPrice) hit = true;
        if (!upward && b.low <= leg.triggerPrice) hit = true;
      } else {
        // SINGLE GTT: triggers based on direction relative to creation LTP
        upward = leg.triggerPrice >= gtt.ltpAtCreation;
        if (leg.triggerPrice >= gtt.ltpAtCreation && b.high >= leg.triggerPrice) hit = true;
        if (leg.triggerPrice <= gtt.ltpAtCreation && b.low <= leg.triggerPrice) hit = true;
      }
      if (!hit) continue;

      const separateLimit = leg.limitPrice > 0 && roundTick(leg.limitPrice) !== roundTick(leg.triggerPrice);
      let msg: string;
      if (!separateLimit) {
        const execPrice =
          leg.label === 'SINGLE'
            ? roundTick(leg.limitPrice || leg.triggerPrice)
            : roundTick(upward ? Math.max(leg.triggerPrice, b.open) : Math.min(leg.triggerPrice, b.open));

        const res = placeOrderInProfile(
          profile,
          {
            side: gtt.side,
            exchange: gtt.exchange,
            product: gtt.product,
            variety: 'REGULAR',
            orderType: 'MARKET',
            validity: 'DAY',
            instrumentType: 'EQ',
            underlyingSymbol: gtt.symbol,
            qty: leg.qty,
            price: execPrice,
            tag: `GTT-${leg.label}`,
          },
          execPrice,
          execPrice,
          false
        );
        msg = res.ok
          ? `GTT (${leg.label}) triggered on ${gtt.symbol}: ${gtt.side} ${leg.qty} @ ₹${execPrice}`
          : `GTT (${leg.label}) triggered on ${gtt.symbol} but rejected: ${res.message}`;
      } else {
        // Price at which the trigger was crossed (gap opens fill at the open)
        const crossPrice = roundTick(
          upward ? Math.max(leg.triggerPrice, b.open || leg.triggerPrice) : Math.min(leg.triggerPrice, b.open || leg.triggerPrice)
        );
        const res = placeOrderInProfile(
          profile,
          {
            side: gtt.side,
            exchange: gtt.exchange,
            product: gtt.product,
            variety: 'REGULAR',
            orderType: 'LIMIT',
            validity: 'DAY',
            instrumentType: 'EQ',
            underlyingSymbol: gtt.symbol,
            qty: leg.qty,
            price: leg.limitPrice,
            tag: `GTT-${leg.label}`,
          },
          crossPrice,
          crossPrice,
          false
        );
        // Remaining part of the bar after the trigger can still reach the limit price
        if (res.ok && res.order && res.order.status === 'OPEN') {
          tryExecutePendingOrderOnBar(
            profile,
            res.order,
            { open: res.order.price, high: b.high, low: b.low, close: b.close },
            b.close,
            date,
            time,
            false,
            events
          );
        }
        const o = res.order;
        msg = !res.ok
          ? `GTT (${leg.label}) triggered on ${gtt.symbol} but rejected: ${res.message}`
          : o && o.status === 'COMPLETE'
            ? `GTT (${leg.label}) triggered on ${gtt.symbol}: ${gtt.side} ${leg.qty} LIMIT ₹${o.price} filled @ ₹${o.avgFillPrice}`
            : `GTT (${leg.label}) triggered on ${gtt.symbol}: ${gtt.side} ${leg.qty} LIMIT order @ ₹${roundTick(leg.limitPrice)} is open`;
      }

      gtt.status = 'TRIGGERED';
      gtt.triggeredLeg = leg.label;
      gtt.triggeredDate = date;
      triggered = true;
      if (leg.label === 'STOPLOSS') slTriggered = true;
      events.push(msg);
      pushNotification(profile, date, 'GTT', `GTT ${leg.label} Triggered`, msg);
      break; // OCO: once one leg triggers, sibling leg is automatically cancelled!
    }
  }
  return { triggered, slTriggered };
}

export interface BasketQuote {
  ltp: number;
  annualizedVol: number;
  isIndex?: boolean;
}

/**
 * Places every order in a basket (Kite "Execute basket"). Used by the basket route and by
 * Alert Trigger Orders. priceLookup returns the underlying's LTP / vol for a symbol.
 */
export function executeBasketInProfile(
  profile: SimulationProfile,
  basket: OrderBasket,
  priceLookup: (symbol: string) => BasketQuote | null | undefined,
  tag = `BASKET:${basket.name}`
): { successCount: number; results: Array<{ symbol: string; ok: boolean; message: string }> } {
  let successCount = 0;
  const results: Array<{ symbol: string; ok: boolean; message: string }> = [];
  for (const item of basket.items) {
    const q = priceLookup(item.symbol) || { ltp: 0, annualizedVol: 0.25 };
    let ltp = q.ltp;
    if (item.instrumentType !== 'EQ' && q.ltp > 0) {
      ltp = priceDerivativeContractKey(item.contractKey, q.ltp, q.annualizedVol, profile.currentDate).ltp;
    }
    const r = placeOrderInProfile(
      profile,
      {
        side: item.side,
        exchange: item.exchange,
        product: item.product,
        variety: 'REGULAR',
        orderType: item.orderType,
        validity: 'DAY',
        instrumentType: item.instrumentType,
        contractKey: item.contractKey,
        underlyingSymbol: item.symbol,
        displaySymbol: item.displaySymbol,
        strikePrice: item.strikePrice,
        expiryDate: item.expiryDate,
        lotSize: item.lotSize,
        qty: item.qty,
        price: item.price || ltp,
        triggerPrice: item.triggerPrice,
        tag,
      },
      ltp,
      q.ltp,
      Boolean(q.isIndex)
    );
    if (r.ok) successCount += 1;
    results.push({ symbol: item.displaySymbol || item.symbol, ok: r.ok, message: r.message });
  }
  return { successCount, results };
}

/**
 * Evaluates ACTIVE price alerts. LTP alerts fire when the bar's high/low crosses the value;
 * CHANGE_PCT alerts compare close vs prevClose. ONE_TIME alerts become TRIGGERED; RECURRING
 * alerts fire at most once per trading day. Returns true if any alert fired.
 */
function evaluatePriceAlerts(
  profile: SimulationProfile,
  date: string,
  time: string,
  getBar: (symbol: string) => { open: number; high: number; low: number; close: number; prevClose: number } | undefined,
  basketLookupFor: (alert: PriceAlert, triggerPrice: number) => (symbol: string) => BasketQuote | null | undefined,
  events: string[]
): boolean {
  let anyFired = false;
  for (const alert of profile.alerts || []) {
    if (alert.status !== 'ACTIVE') continue;
    if (alert.mode === 'RECURRING' && alert.lastTriggeredDate === date) continue;
    const b = getBar(alert.symbol);
    if (!b || b.close <= 0) continue;
    const ge = alert.operator === '>=';
    const opTxt = ge ? '≥' : '≤';

    let fired = false;
    let price = b.close;
    let msg = '';
    if (alert.property === 'CHANGE_PCT') {
      if (!(b.prevClose > 0)) continue;
      const chg = ((b.close - b.prevClose) / b.prevClose) * 100;
      fired = ge ? chg >= alert.value : chg <= alert.value;
      price = b.close;
      msg = `${alert.symbol} moved ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% today at ${fmtInr(price)} (Change ${opTxt} ${alert.value}%)`;
    } else {
      fired = ge ? b.high >= alert.value : b.low <= alert.value;
      if (fired) {
        price = roundTick(ge ? Math.max(alert.value, b.open || alert.value) : Math.min(alert.value, b.open || alert.value));
        if (b.high === b.low) price = b.close;
      }
      const v = Number(alert.value).toLocaleString('en-IN');
      msg = `${alert.symbol} ${ge ? 'crossed' : 'fell to'} ₹${v} (LTP ${opTxt} ${v})`;
    }
    if (!fired) continue;

    anyFired = true;
    alert.triggerCount = (alert.triggerCount || 0) + 1;
    alert.lastTriggeredDate = date;
    alert.lastTriggeredPrice = price;
    if (alert.mode !== 'RECURRING') alert.status = 'TRIGGERED';

    const basket = alert.basketId ? profile.baskets.find((bk) => bk.id === alert.basketId) : undefined;
    if (basket) {
      const res = executeBasketInProfile(profile, basket, basketLookupFor(alert, price), `ALERT:${alert.name || alert.symbol}`);
      msg += ` — basket "${basket.name}": ${res.successCount}/${basket.items.length} orders placed`;
    } else if (alert.basketId) {
      msg += ' — linked basket no longer exists';
    }
    events.push(`Alert: ${msg}`);
    pushNotification(profile, date, 'ALERT', `Alert: ${alert.name || alert.symbol}`, `${msg} [${time}]`);
  }
  return anyFired;
}

function squareOffAllMisPositions(
  profile: SimulationProfile,
  lookupSpot: (sym: string) => { price: number; vol: number },
  execTime: string,
  chargePenalty: boolean,
  events: string[]
): void {
  // First cancel open MIS orders so they don't block or double-fire
  for (const ord of profile.orders) {
    if ((ord.status === 'OPEN' || ord.status === 'TRIGGER PENDING') && ord.product === 'MIS') {
      cancelOrder(ord, profile.currentDate, execTime, 'Cancelled prior to 3:20 PM MIS auto-square-off.');
    }
  }
  // Intraday (MIS) GTTs die with the MIS positions they protect
  for (const gtt of profile.gtts) {
    if (gtt.status === 'ACTIVE' && gtt.product === 'MIS') {
      gtt.status = 'CANCELLED';
    }
  }

  for (const pos of profile.positions) {
    if (pos.product === 'MIS' && pos.netQty !== 0) {
      const spotInfo = lookupSpot(pos.underlyingSymbol);
      let exitPrice = spotInfo.price || pos.avgPrice;
      if (pos.instrumentType !== 'EQ') {
        exitPrice = priceDerivativeContractKey(
          pos.contractKey,
          spotInfo.price,
          spotInfo.vol,
          profile.currentDate
        ).ltp;
      }
      const exitSide: OrderSide = pos.netQty > 0 ? 'SELL' : 'BUY';
      const qty = Math.abs(pos.netQty);

      const sqOrder: Order = {
        id: uid('ord'),
        side: exitSide,
        exchange: pos.exchange,
        product: 'MIS',
        variety: 'REGULAR',
        orderType: 'MARKET',
        validity: 'DAY',
        instrumentType: pos.instrumentType,
        contractKey: pos.contractKey,
        underlyingSymbol: pos.underlyingSymbol,
        displaySymbol: pos.displaySymbol,
        strikePrice: pos.strikePrice,
        expiryDate: pos.expiryDate,
        lotSize: pos.lotSize,
        qty,
        filledQty: 0,
        price: exitPrice,
        triggerPrice: 0,
        avgFillPrice: 0,
        status: 'OPEN',
        placedDate: profile.currentDate,
        placedTime: execTime,
        updatedAt: `${profile.currentDate} ${execTime}`,
        charges: calculateZerodhaCharges({
          side: exitSide,
          exchange: pos.exchange,
          product: 'MIS',
          instrumentType: pos.instrumentType,
          qty,
          price: exitPrice,
          isAutoSquareOff: chargePenalty,
        }),
        marginBlocked: 0,
        tag: 'AUTO-SQ-OFF',
      };
      addOrderHistory(sqOrder, profile.currentDate, execTime, 'OPEN', 'MIS auto square-off order');
      profile.orders.unshift(sqOrder);
      tryExecutePendingOrderOnBar(
        profile,
        sqOrder,
        { open: exitPrice, high: exitPrice, low: exitPrice, close: exitPrice },
        spotInfo.price,
        profile.currentDate,
        execTime,
        chargePenalty
      );

      const msg = `MIS Auto-Squared-Off at 3:20 PM: ${exitSide} ${qty} ${pos.displaySymbol} @ ₹${exitPrice}${chargePenalty ? ' (₹59 call & trade fee applied)' : ''}`;
      events.push(msg);
      pushNotification(profile, profile.currentDate, 'ORDER', '3:20 PM MIS Square-Off', msg);
    }
  }
}

function cancelOpenDayOrders(profile: SimulationProfile): void {
  for (const ord of profile.orders) {
    if (ord.status === 'OPEN' || ord.status === 'TRIGGER PENDING') {
      cancelOrder(ord, profile.currentDate, '15:30', 'Unfilled DAY order expired at 3:30 PM market close.');
    }
  }
}

/**
 * Fast-Forwards across 1 or many trading days (e.g. +1 Day, +1 Month, +1 Year),
 * accurately processing T+1 settlement, Splits/Bonuses, Dividends, Monthly Top-ups,
 * AMOs, GTTs (Single & OCO), Open Orders, Stock/ETF SIPs, MTF daily interest,
 * F&O Monthly Expiries, and Daily Equity Curve points!
 */
export function processMultiDayFastForward(
  profile: SimulationProfile,
  packets: DayStepPacket[],
  instrumentsMap: Map<string, Instrument>
): { pausedEarly: boolean; pauseReason?: string; daysProcessed: number; events: string[] } {
  const events: string[] = [];
  let daysProcessed = 0;

  for (const pkt of packets) {
    const prevCash = profile.availableCash;
    const tradesBefore = profile.trades.length;
    let dividendsToday = 0;
    let gttTriggeredToday = false;
    let slTriggeredToday = false;

    // Close out any open MIS positions from previous partial intraday day before moving to new date
    for (const pos of profile.positions) {
      if (pos.product === 'MIS' && pos.netQty !== 0) {
        const b = pkt.bars[pos.underlyingSymbol];
        const closeP = b?.prevClose || pos.avgPrice;
        squareOffAllMisPositions(
          profile,
          () => ({ price: closeP, vol: b?.annualizedVol || 0.25 }),
          '15:20',
          true,
          events
        );
      }
    }
    // Clear closed zero-net positions from previous days (keep only open multi-day MTF/NRML positions!)
    profile.positions = profile.positions.filter((p) => p.netQty !== 0);

    // Cancel any leftover previous-day non-AMO open orders
    for (const ord of profile.orders) {
      if ((ord.status === 'OPEN' || ord.status === 'TRIGGER PENDING') && ord.placedDate < pkt.date) {
        cancelOrder(ord, profile.currentDate, '15:30', 'Expired at previous session close.');
      }
    }
    // Intraday (MIS) GTTs never carry over to the next session
    for (const gtt of profile.gtts) {
      if (gtt.status === 'ACTIVE' && gtt.product === 'MIS') gtt.status = 'CANCELLED';
    }

    // Advance current date
    profile.currentDate = pkt.date;
    profile.dpSoldToday = [];
    profile.intraday.stepIndex = 74;
    profile.intraday.timeLabel = '15:30';
    profile.intraday.marketOpen = true;
    daysProcessed += 1;

    // 1. T+1 Settlement: promote yesterday's t1Qty into settled Demat qty
    for (const h of profile.holdings) {
      if (h.t1Qty > 0) {
        h.qty += h.t1Qty;
        h.t1Qty = 0;
      }
    }

    // 2. Corporate Actions — Stock Splits & Bonus Issues
    for (const sp of pkt.splits) {
      const ratioNum = sp.numerator / sp.denominator;
      if (!Number.isFinite(ratioNum) || ratioNum <= 0 || ratioNum === 1) continue;

      const holding = profile.holdings.find((h) => h.symbol === sp.symbol);
      if (holding && holding.qty + holding.t1Qty > 0) {
        const oldTotal = holding.qty + holding.t1Qty;
        const exactNew = oldTotal * ratioNum;
        const wholeNew = Math.floor(exactNew + 1e-9);
        const fracShares = Math.max(0, exactNew - wholeNew);

        holding.qty = wholeNew;
        holding.t1Qty = 0;
        holding.pledgedQty = Math.min(wholeNew, Math.floor(holding.pledgedQty * ratioNum));
        holding.avgPrice = Number((holding.avgPrice / ratioNum).toFixed(2));
        for (const lot of holding.lots) {
          lot.qty = Math.max(1, Math.round(lot.qty * ratioNum));
          lot.buyPrice = Number((lot.buyPrice / ratioNum).toFixed(2));
        }

        const exClose = pkt.bars[sp.symbol]?.close || holding.avgPrice;
        if (fracShares > 0.001) {
          const fracCash = Number((fracShares * exClose).toFixed(2));
          if (fracCash > 0) {
            appendLedger(
              profile,
              pkt.date,
              'SPLIT_CASH',
              `Fractional share entitlement on ${sp.symbol} (${sp.ratio} Split/Bonus)`,
              0,
              fracCash
            );
          }
        }

        const msg = `${sp.symbol} ${sp.ratio} Split/Bonus: Holdings adjusted ${oldTotal} → ${wholeNew} qty (New Avg: ₹${holding.avgPrice})`;
        events.push(msg);
        pushNotification(profile, pkt.date, 'CORPORATE_ACTION', `${sp.symbol} Split/Bonus (${sp.ratio})`, msg);
      }

      // Also adjust active GTT rules on that symbol
      for (const gtt of profile.gtts) {
        if (gtt.status === 'ACTIVE' && gtt.symbol === sp.symbol) {
          gtt.ltpAtCreation = roundTick(gtt.ltpAtCreation / ratioNum);
          for (const leg of gtt.legs) {
            leg.triggerPrice = roundTick(leg.triggerPrice / ratioNum);
            leg.limitPrice = roundTick(leg.limitPrice / ratioNum);
            leg.qty = Math.max(1, Math.floor(leg.qty * ratioNum));
          }
        }
      }
    }

    // 3. Corporate Actions — Cash Dividends
    for (const div of pkt.dividends) {
      const holding = profile.holdings.find((h) => h.symbol === div.symbol);
      if (holding && holding.qty + holding.t1Qty > 0) {
        const shares = holding.qty + holding.t1Qty;
        const payout = Number((shares * div.amount).toFixed(2));
        if (payout > 0) {
          holding.totalDividendsReceived = Number((holding.totalDividendsReceived + payout).toFixed(2));
          dividendsToday += payout;
          appendLedger(
            profile,
            pkt.date,
            'DIVIDEND',
            `Cash Dividend: ${div.symbol} (${shares} qty × ₹${div.amount.toFixed(2)}/sh)`,
            0,
            payout
          );
          const msg = `Dividend credited: ₹${payout.toLocaleString('en-IN')} from ${div.symbol}`;
          events.push(msg);
          pushNotification(profile, pkt.date, 'CORPORATE_ACTION', `${div.symbol} Dividend Credited`, msg);
        }
      }
    }

    // 4. Optional Monthly Savings Top-Up (on 1st trading day of each new YYYY-MM)
    const ym = pkt.date.slice(0, 7);
    if (profile.monthlyTopUp > 0 && profile.lastTopUpMonth !== ym) {
      profile.lastTopUpMonth = ym;
      profile.netCapitalInvested = Number((profile.netCapitalInvested + profile.monthlyTopUp).toFixed(2));
      appendLedger(
        profile,
        pkt.date,
        'MONTHLY_SAVINGS',
        `Scheduled Monthly Savings Top-Up (${ym})`,
        0,
        profile.monthlyTopUp
      );
      events.push(`Monthly savings top-up credited: +₹${profile.monthlyTopUp.toLocaleString('en-IN')}`);
    } else if (!profile.lastTopUpMonth) {
      profile.lastTopUpMonth = ym;
    }

    // 5. Execute AMO (After Market Orders) at 09:15 Market Open
    for (const ord of profile.orders) {
      if (ord.status === 'AMO REQ RECEIVED') {
        const b = pkt.bars[ord.underlyingSymbol];
        if (!b) continue;
        let barForContract = b;
        if (ord.instrumentType !== 'EQ') {
          const pOpen = priceDerivativeContractKey(ord.contractKey, b.open, b.annualizedVol, pkt.date).ltp;
          const pClose = priceDerivativeContractKey(ord.contractKey, b.close, b.annualizedVol, pkt.date).ltp;
          barForContract = {
            ...b,
            open: pOpen,
            high: Math.max(pOpen, pClose),
            low: Math.min(pOpen, pClose),
            close: pClose,
          };
        }
        const filled = tryExecutePendingOrderOnBar(profile, ord, barForContract, b.open, pkt.date, '09:15', false, events);
        if (filled) {
          events.push(`AMO executed: ${ord.side} ${ord.qty} ${ord.displaySymbol} @ ₹${ord.avgFillPrice}`);
        } else if ((ord.status as Order['status']) !== 'CANCELLED') {
          // Unfilled AMO DAY order expires at close
          cancelOrder(ord, pkt.date, '15:30', 'AMO limit/trigger not reached during session.');
        }
      }
    }

    // 6. Evaluate Active GTT Rules (Single & OCO)
    const gttRes = evaluateGttRules(profile, pkt.date, '15:30', (sym) => pkt.bars[sym], events);
    gttTriggeredToday = gttRes.triggered;
    slTriggeredToday = gttRes.slTriggered;

    // 6b. Price alerts (LTP crosses use the day's high/low) + Alert Trigger Orders
    const alertFiredToday = evaluatePriceAlerts(
      profile,
      pkt.date,
      '15:30',
      (sym) => pkt.bars[sym],
      (alert, triggerPrice) => (sym: string) => {
        const b = pkt.bars[sym];
        if (!b) return null;
        return {
          ltp: sym === alert.symbol && alert.property === 'LTP' ? triggerPrice : b.close,
          annualizedVol: b.annualizedVol,
          isIndex: instrumentsMap.get(sym)?.isIndex,
        };
      },
      events
    );

    // 7. Execute Scheduled Stock & ETF SIPs
    const dtObj = new Date(pkt.date + 'T00:00:00Z');
    const dayOfMonth = dtObj.getUTCDate();
    const weekday = dtObj.getUTCDay(); // 1 = Mon .. 5 = Fri

    for (const sip of profile.sips) {
      if (sip.status !== 'ACTIVE') continue;

      let shouldRun = false;
      if (sip.frequency === 'MONTHLY') {
        const lastYm = sip.lastRunDate ? sip.lastRunDate.slice(0, 7) : '';
        if (lastYm !== ym && dayOfMonth >= sip.dayOfMonth) {
          shouldRun = true;
        }
      } else {
        // WEEKLY
        const daysSinceLast = sip.lastRunDate ? daysBetween(sip.lastRunDate, pkt.date) : 999;
        if (daysSinceLast >= 5 && weekday >= (sip.dayOfMonth || 1)) {
          shouldRun = true;
        }
      }

      if (shouldRun) {
        let anyBought = false;
        let installmentSpent = 0;
        for (const alloc of sip.allocations) {
          const b = pkt.bars[alloc.symbol];
          const inst = instrumentsMap.get(alloc.symbol);
          if (!b || b.close <= 0 || inst?.isIndex) continue;

          const qtyToBuy =
            alloc.mode === 'QTY' ? Math.floor(alloc.value) : Math.floor(alloc.value / b.close);
          if (qtyToBuy <= 0) continue;

          const res = placeOrderInProfile(
            profile,
            {
              side: 'BUY',
              exchange: 'NSE',
              product: 'CNC',
              variety: 'REGULAR',
              orderType: 'MARKET',
              validity: 'DAY',
              instrumentType: 'EQ',
              underlyingSymbol: alloc.symbol,
              qty: qtyToBuy,
              price: b.close,
              tag: 'SIP',
            },
            b.close,
            b.close,
            false
          );
          if (res.ok && res.order) {
            anyBought = true;
            installmentSpent += qtyToBuy * b.close;
          }
        }

        sip.lastRunDate = pkt.date;
        if (anyBought) {
          sip.installmentsExecuted += 1;
          sip.totalInvested = Number((sip.totalInvested + installmentSpent).toFixed(2));
          const msg = `SIP "${sip.name}" executed (#${sip.installmentsExecuted}): ₹${Math.round(installmentSpent).toLocaleString('en-IN')} invested.`;
          events.push(msg);
          pushNotification(profile, pkt.date, 'SIP', `SIP Executed: ${sip.name}`, msg);
        }
      }
    }

    // 8. Deduct Daily MTF Interest (0.04% per day on 75% funded delivery amount)
    for (const pos of profile.positions) {
      if (pos.product === 'MTF' && pos.netQty > 0) {
        const fundedAmount = pos.netQty * pos.avgPrice * 0.75;
        const dailyInterest = Number((fundedAmount * 0.0004).toFixed(2));
        if (dailyInterest >= 0.01) {
          pos.mtfInterestAccrued = Number((pos.mtfInterestAccrued + dailyInterest).toFixed(2));
          appendLedger(
            profile,
            pkt.date,
            'MTF_INTEREST',
            `MTF Daily Interest (0.04%) on ${pos.underlyingSymbol}`,
            dailyInterest,
            0
          );
        }
      }
    }

    // 9. F&O Monthly Expiry Cash Settlement (NRML FUT/CE/PE expiring <= pkt.date)
    for (const pos of profile.positions) {
      if (pos.instrumentType !== 'EQ' && pos.netQty !== 0 && pos.expiryDate && pkt.date >= pos.expiryDate) {
        const b = pkt.bars[pos.underlyingSymbol];
        const spotClose = b?.close || pos.avgPrice;
        const settled = priceDerivativeContractKey(
          pos.contractKey,
          spotClose,
          b?.annualizedVol || 0.25,
          pkt.date
        );
        const settlePrice = settled.intrinsicValue;
        const exitSide: OrderSide = pos.netQty > 0 ? 'SELL' : 'BUY';
        const qty = Math.abs(pos.netQty);

        const expOrder: Order = {
          id: uid('ord'),
          side: exitSide,
          exchange: 'NFO',
          product: 'NRML',
          variety: 'REGULAR',
          orderType: 'MARKET',
          validity: 'DAY',
          instrumentType: pos.instrumentType,
          contractKey: pos.contractKey,
          underlyingSymbol: pos.underlyingSymbol,
          displaySymbol: pos.displaySymbol,
          strikePrice: pos.strikePrice,
          expiryDate: pos.expiryDate,
          lotSize: pos.lotSize,
          qty,
          filledQty: 0,
          price: settlePrice,
          triggerPrice: 0,
          avgFillPrice: 0,
          status: 'OPEN',
          placedDate: pkt.date,
          placedTime: '15:30',
          updatedAt: `${pkt.date} 15:30`,
          charges: calculateZerodhaCharges({
            side: exitSide,
            exchange: 'NFO',
            product: 'NRML',
            instrumentType: pos.instrumentType,
            qty,
            price: settlePrice,
          }),
          marginBlocked: 0,
          tag: 'EXPIRY',
        };
        addOrderHistory(expOrder, pkt.date, '15:30', 'OPEN', 'F&O expiry settlement order');
        profile.orders.unshift(expOrder);
        // Handle 0.00 intrinsic worthless option expiry cleanly
        if (settlePrice <= 0) {
          const lossOrGain = pos.netQty > 0 ? -pos.avgPrice * qty : pos.avgPrice * qty;
          expOrder.status = 'COMPLETE';
          expOrder.filledQty = qty;
          expOrder.avgFillPrice = 0;
          addOrderHistory(expOrder, pkt.date, '15:30', 'COMPLETE', 'Expired worthless (settled @ ₹0)');
          if (lossOrGain >= 0) {
            appendLedger(
              profile,
              pkt.date,
              'FNO_SETTLEMENT',
              `Option Expiry Settlement (Worthless OTM): ${pos.displaySymbol}`,
              0,
              lossOrGain
            );
          } else {
            appendLedger(
              profile,
              pkt.date,
              'FNO_SETTLEMENT',
              `Option Expired Worthless: ${pos.displaySymbol}`,
              Math.abs(lossOrGain),
              0
            );
          }
          profile.trades.unshift({
            id: uid('trd'),
            orderId: expOrder.id,
            date: pkt.date,
            time: '15:30',
            symbol: pos.underlyingSymbol,
            displaySymbol: pos.displaySymbol,
            exchange: 'NFO',
            product: 'NRML',
            instrumentType: pos.instrumentType,
            side: exitSide,
            qty,
            price: 0,
            turnover: 0,
            charges: expOrder.charges,
            realizedPnl: Number(lossOrGain.toFixed(2)),
            holdingDays: daysBetween(pos.openedDate, pkt.date),
            taxCategory: 'FNO',
          });
          pos.netQty = 0;
          pos.marginBlocked = 0;
        } else {
          tryExecutePendingOrderOnBar(
            profile,
            expOrder,
            { open: settlePrice, high: settlePrice, low: settlePrice, close: settlePrice },
            spotClose,
            pkt.date,
            '15:30'
          );
        }
        const msg = `F&O Expiry Settled: ${pos.displaySymbol} @ ₹${settlePrice}`;
        events.push(msg);
        pushNotification(profile, pkt.date, 'ORDER', 'F&O Expiry Settlement', msg);
      }
    }

    // 10. Compute End-of-Day Equity Snapshot for Console Chart & P&L Heatmap Calendar
    let holdingsVal = 0;
    let bigMoveSymbol: string | null = null;
    for (const h of profile.holdings) {
      const b = pkt.bars[h.symbol];
      const ltp = b?.close || h.avgPrice;
      holdingsVal += (h.qty + h.t1Qty) * ltp;
      if (profile.autoPause.pauseOnBigMovePct > 0 && b && b.prevClose > 0) {
        const movePct = Math.abs(((b.close - b.prevClose) / b.prevClose) * 100);
        if (movePct >= profile.autoPause.pauseOnBigMovePct) {
          bigMoveSymbol = `${h.symbol} (${movePct.toFixed(1)}%)`;
        }
      }
    }

    let unrealizedPositionsPnl = 0;
    for (const p of profile.positions) {
      if (p.netQty === 0) continue;
      const b = pkt.bars[p.underlyingSymbol];
      const spot = b?.close || p.avgPrice;
      let markPrice = spot;
      if (p.instrumentType !== 'EQ') {
        markPrice = priceDerivativeContractKey(p.contractKey, spot, b?.annualizedVol || 0.25, pkt.date).ltp;
      }
      unrealizedPositionsPnl += (markPrice - p.avgPrice) * p.netQty;
    }

    const newTradesCount = profile.trades.length - tradesBefore;
    let realizedToday = 0;
    let chargesToday = 0;
    for (let i = 0; i < newTradesCount; i++) {
      const tr = profile.trades[i];
      chargesToday += tr.charges.totalCharges;
      if (typeof tr.realizedPnl === 'number') {
        realizedToday += tr.realizedPnl;
      }
    }

    const totalEquity = Number((profile.availableCash + holdingsVal + unrealizedPositionsPnl).toFixed(2));
    const eqPoint: DailyEquityPoint = {
      date: pkt.date,
      totalEquity,
      cash: profile.availableCash,
      holdingsValue: Number(holdingsVal.toFixed(2)),
      positionsPnl: Number(unrealizedPositionsPnl.toFixed(2)),
      realizedPnlDay: Number(realizedToday.toFixed(2)),
      chargesDay: Number(chargesToday.toFixed(2)),
      dividendsDay: Number(dividendsToday.toFixed(2)),
      netCapitalInvested: profile.netCapitalInvested,
      niftyClose: pkt.niftyClose,
    };

    const lastEq = profile.equityHistory[profile.equityHistory.length - 1];
    if (lastEq && lastEq.date === pkt.date) {
      profile.equityHistory[profile.equityHistory.length - 1] = eqPoint;
    } else {
      profile.equityHistory.push(eqPoint);
    }

    // Keep orders & trades bounded so multi-decade SIP profiles remain snappy
    if (profile.orders.length > 1500) profile.orders.length = 1500;
    if (profile.trades.length > 2000) profile.trades.length = 2000;

    // 11. Smart Auto-Pause check
    if (packets.length > 1) {
      if (profile.autoPause.pauseOnStopLoss && slTriggeredToday) {
        return {
          pausedEarly: true,
          pauseReason: `Auto-paused on ${pkt.date}: Stop-Loss GTT triggered.`,
          daysProcessed,
          events,
        };
      }
      if (profile.autoPause.pauseOnGttTrigger && gttTriggeredToday) {
        return {
          pausedEarly: true,
          pauseReason: `Auto-paused on ${pkt.date}: GTT order triggered.`,
          daysProcessed,
          events,
        };
      }
      if (alertFiredToday && profile.settings?.pauseOnAlert !== false) {
        return {
          pausedEarly: true,
          pauseReason: `Auto-paused on ${pkt.date}: price alert triggered.`,
          daysProcessed,
          events,
        };
      }
      if (bigMoveSymbol) {
        return {
          pausedEarly: true,
          pauseReason: `Auto-paused on ${pkt.date}: Big daily move in holding ${bigMoveSymbol}.`,
          daysProcessed,
          events,
        };
      }
    }
    void prevCash;
  }

  return { pausedEarly: false, daysProcessed, events };
}

export function adjustFundsInProfile(
  profile: SimulationProfile,
  action: 'ADD' | 'WITHDRAW' | 'SET_STARTING',
  amount: number
): { ok: boolean; message: string } {
  const val = Number(amount);
  if (!Number.isFinite(val) || val <= 0) {
    return { ok: false, message: 'Enter a valid positive Rupee amount.' };
  }

  if (action === 'ADD') {
    profile.netCapitalInvested = Number((profile.netCapitalInvested + val).toFixed(2));
    appendLedger(
      profile,
      profile.currentDate,
      'FUNDS_ADDED',
      `Instant UPI / NetBanking Pay-in (+₹${val.toLocaleString('en-IN')})`,
      0,
      val
    );
    updateTodayEquitySnapshotCash(profile, val, val);
    return { ok: true, message: `Added ₹${val.toLocaleString('en-IN')} to trading funds.` };
  }

  if (action === 'WITHDRAW') {
    const freeCash = profile.availableCash - getUsedMargin(profile);
    if (val > freeCash) {
      return {
        ok: false,
        message: `Withdrawable cash is ₹${Math.max(0, freeCash).toLocaleString('en-IN')} (cannot withdraw blocked margin).`,
      };
    }
    profile.netCapitalInvested = Number(Math.max(1, profile.netCapitalInvested - val).toFixed(2));
    appendLedger(
      profile,
      profile.currentDate,
      'FUNDS_WITHDRAWN',
      `Payout Withdrawal to Bank (-₹${val.toLocaleString('en-IN')})`,
      val,
      0
    );
    updateTodayEquitySnapshotCash(profile, -val, -val);
    return { ok: true, message: `Withdrew ₹${val.toLocaleString('en-IN')} from trading funds.` };
  }

  // SET_STARTING: updates base capital delta cleanly
  const delta = val - profile.startingCapital;
  const freeCash = profile.availableCash - getUsedMargin(profile);
  if (delta < 0 && Math.abs(delta) > freeCash) {
    return {
      ok: false,
      message: 'Cannot reduce starting capital below currently invested/blocked funds. Reset timeline or exit holdings first.',
    };
  }
  profile.startingCapital = val;
  profile.netCapitalInvested = Number(Math.max(1, profile.netCapitalInvested + delta).toFixed(2));
  if (delta >= 0) {
    appendLedger(
      profile,
      profile.currentDate,
      'OPENING_BALANCE',
      `Adjusted Starting Capital to ₹${val.toLocaleString('en-IN')}`,
      0,
      delta
    );
  } else {
    appendLedger(
      profile,
      profile.currentDate,
      'OPENING_BALANCE',
      `Adjusted Starting Capital to ₹${val.toLocaleString('en-IN')}`,
      Math.abs(delta),
      0
    );
  }
  updateTodayEquitySnapshotCash(profile, delta, delta);
  return { ok: true, message: `Starting capital updated to ₹${val.toLocaleString('en-IN')}.` };
}

function updateTodayEquitySnapshotCash(profile: SimulationProfile, cashDelta: number, capDelta: number): void {
  const last = profile.equityHistory[profile.equityHistory.length - 1];
  if (last && last.date === profile.currentDate) {
    last.cash = Number((last.cash + cashDelta).toFixed(2));
    last.totalEquity = Number((last.totalEquity + cashDelta).toFixed(2));
    last.netCapitalInvested = Number(Math.max(1, last.netCapitalInvested + capDelta).toFixed(2));
  }
}
