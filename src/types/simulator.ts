export type Exchange = 'NSE' | 'BSE' | 'NFO' | 'INDICES';
export type ProductType = 'CNC' | 'MIS' | 'MTF' | 'NRML';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type OrderVariety = 'REGULAR' | 'CO' | 'AMO' | 'ICEBERG';
export type OrderValidity = 'DAY' | 'IOC' | 'TTL';
export type OrderSide = 'BUY' | 'SELL';
export type InstrumentType = 'EQ' | 'FUT' | 'CE' | 'PE';

export type OrderStatus =
  | 'OPEN'
  | 'TRIGGER PENDING'
  | 'AMO REQ RECEIVED'
  | 'COMPLETE'
  | 'CANCELLED'
  | 'REJECTED';

export interface Instrument {
  symbol: string;
  yahooTicker: string;
  name: string;
  blindSymbol: string;
  blindName: string;
  exchange: Exchange;
  sector: string;
  lotSize: number;
  isIndex: boolean;
  isEtf: boolean;
  firstDate?: string;
  lastDate?: string;
}

export interface DepthLevel {
  price: number;
  orders: number;
  qty: number;
}

export interface MarketQuote {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  avgPrice: number;
  high52w: number;
  low52w: number;
  upperCircuit: number;
  lowerCircuit: number;
  annualizedVol: number;
  available: boolean;
  firstDate?: string;
  date?: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  totalBidQty: number;
  totalAskQty: number;
}

export interface CandleBar {
  time: string | number; // 'YYYY-MM-DD' for daily/weekly/monthly, Unix seconds for intraday
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SplitEvent {
  symbol: string;
  date: string;
  numerator: number;
  denominator: number;
  ratio: string;
}

export interface DividendEvent {
  symbol: string;
  date: string;
  amount: number; // Adjusted to the simulated date's share basis
}

export interface ChargesBreakdown {
  turnover: number;
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebiCharges: number;
  stampDuty: number;
  gst: number;
  dpCharges: number;
  autoSquareOffFee: number;
  totalCharges: number;
}

export interface Order {
  id: string;
  side: OrderSide;
  exchange: Exchange;
  product: ProductType;
  variety: OrderVariety;
  orderType: OrderType;
  validity: OrderValidity;
  instrumentType: InstrumentType;
  contractKey: string;
  underlyingSymbol: string;
  displaySymbol: string;
  strikePrice?: number;
  expiryDate?: string;
  lotSize: number;
  qty: number;
  filledQty: number;
  price: number;
  triggerPrice: number;
  stopLossTrigger?: number; // Used by Cover Orders (CO)
  icebergLegs?: number;
  icebergCurrentLeg?: number;
  avgFillPrice: number;
  status: OrderStatus;
  statusMessage?: string;
  placedDate: string;
  placedTime: string;
  updatedAt: string;
  charges: ChargesBreakdown;
  marginBlocked: number;
  tag?: string;
  parentOrderId?: string;
  /** Equity only: quantity shown in market depth (min 10% of qty). */
  disclosedQty?: number;
  /** Validity TTL: minutes the order stays open before auto-cancel. */
  ttlMinutes?: number;
  /** Market-order protection (%): rejects fills worse than LTP ± this %. */
  marketProtectionPct?: number;
  /** Stoploss / target to attach as an OCO GTT once this order fills. */
  attachedGtt?: { stoplossPrice?: number; targetPrice?: number; createdGttId?: string };
  /** Status timeline for the order details sheet. */
  history?: Array<{ date: string; time: string; status: string; note?: string }>;
}

export interface TaxLot {
  buyDate: string;
  qty: number;
  buyPrice: number;
}

export interface Holding {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  qty: number; // Settled Demat shares
  t1Qty: number; // Today's unsettled CNC purchases
  pledgedQty: number; // Pledged for collateral margin
  avgPrice: number;
  firstBuyDate: string;
  lots: TaxLot[];
  totalDividendsReceived: number;
}

export interface Position {
  id: string;
  contractKey: string;
  underlyingSymbol: string;
  displaySymbol: string;
  exchange: Exchange;
  product: ProductType;
  instrumentType: InstrumentType;
  strikePrice?: number;
  expiryDate?: string;
  lotSize: number;
  netQty: number;
  buyQty: number;
  sellQty: number;
  avgPrice: number;
  buyValue: number;
  sellValue: number;
  realizedPnl: number;
  marginBlocked: number;
  openedDate: string;
  mtfInterestAccrued: number;
  lots: TaxLot[];
}

export interface GttLeg {
  label: 'SINGLE' | 'TARGET' | 'STOPLOSS';
  triggerPrice: number;
  limitPrice: number;
  qty: number;
}

export interface GttRule {
  id: string;
  type: 'SINGLE' | 'OCO';
  symbol: string;
  exchange: 'NSE' | 'BSE';
  side: OrderSide;
  product: 'CNC' | 'MTF' | 'MIS';
  createdAtDate: string;
  expiresAtDate: string;
  ltpAtCreation: number;
  legs: GttLeg[];
  status: 'ACTIVE' | 'TRIGGERED' | 'CANCELLED' | 'EXPIRED';
  triggeredLeg?: string;
  triggeredDate?: string;
}

export interface BasketItem {
  id: string;
  side: OrderSide;
  symbol: string;
  exchange: Exchange;
  product: ProductType;
  orderType: OrderType;
  qty: number;
  price: number;
  triggerPrice: number;
  instrumentType: InstrumentType;
  contractKey: string;
  displaySymbol: string;
  strikePrice?: number;
  expiryDate?: string;
  lotSize: number;
}

export interface OrderBasket {
  id: string;
  name: string;
  createdAt: string;
  items: BasketItem[];
}

export interface SipAllocation {
  symbol: string;
  mode: 'AMOUNT' | 'QTY';
  value: number; // ₹ amount or share count
}

export interface SipSchedule {
  id: string;
  name: string;
  frequency: 'WEEKLY' | 'MONTHLY';
  dayOfMonth: number; // 1-28 for monthly, 1-5 weekday for weekly
  status: 'ACTIVE' | 'PAUSED';
  allocations: SipAllocation[];
  createdDate: string;
  lastRunDate?: string;
  totalInvested: number;
  installmentsExecuted: number;
}

export type TaxCategory = 'STCG' | 'LTCG' | 'INTRADAY' | 'FNO';

export interface TradeRecord {
  id: string;
  orderId: string;
  date: string;
  time: string;
  symbol: string;
  displaySymbol: string;
  exchange: Exchange;
  product: ProductType;
  instrumentType: InstrumentType;
  side: OrderSide;
  qty: number;
  price: number;
  turnover: number;
  charges: ChargesBreakdown;
  realizedPnl?: number; // Populated when closing/reducing a long or short
  holdingDays?: number;
  taxCategory?: TaxCategory;
  note?: string;
  emotionTag?: 'DISCIPLINED' | 'FOMO' | 'PANIC' | 'CONVICTION' | 'REVENGE';
}

export type LedgerCategory =
  | 'OPENING_BALANCE'
  | 'FUNDS_ADDED'
  | 'FUNDS_WITHDRAWN'
  | 'MONTHLY_SAVINGS'
  | 'TRADE_BUY'
  | 'TRADE_SELL'
  | 'CHARGES'
  | 'DP_CHARGE'
  | 'DIVIDEND'
  | 'SPLIT_CASH'
  | 'MTF_INTEREST'
  | 'FNO_SETTLEMENT';

export interface LedgerEntry {
  id: string;
  date: string;
  category: LedgerCategory;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface DailyEquityPoint {
  date: string;
  totalEquity: number;
  cash: number;
  holdingsValue: number;
  positionsPnl: number;
  realizedPnlDay: number;
  chargesDay: number;
  dividendsDay: number;
  netCapitalInvested: number; // Tracks starting capital + deposits - withdrawals
  niftyClose: number;
}

export interface WatchlistGroup {
  id: number;
  name: string;
  symbols: string[];
}

export interface IntradaySessionState {
  enabled: boolean;
  stepIndex: number; // 0 to 74 (75 five-minute bars from 09:15 to 15:30 IST)
  totalSteps: number; // 75
  timeLabel: string; // e.g. '09:15', '15:20', '15:30'
  marketOpen: boolean;
}

export interface AutoPauseSettings {
  pauseOnGttTrigger: boolean;
  pauseOnStopLoss: boolean;
  pauseOnBigMovePct: number; // 0 = off, e.g. 10 = pause on +-10% single-day holding move
}

export interface SimulatorNotification {
  id: string;
  date: string;
  type: 'ORDER' | 'GTT' | 'CORPORATE_ACTION' | 'SIP' | 'MARGIN' | 'INFO' | 'ALERT';
  title: string;
  message: string;
}

/** Kite-style price alert (optionally "Alert Trigger Order": places a basket when it fires). */
export interface PriceAlert {
  id: string;
  name?: string;
  symbol: string;
  /** LTP crosses a price, or day change % crosses a value. */
  property: 'LTP' | 'CHANGE_PCT';
  operator: '>=' | '<=';
  value: number;
  /** ONE_TIME disables after firing; RECURRING re-arms the next day. */
  mode: 'ONE_TIME' | 'RECURRING';
  status: 'ACTIVE' | 'TRIGGERED' | 'DISABLED';
  createdDate: string;
  ltpAtCreation: number;
  triggerCount: number;
  lastTriggeredDate?: string;
  lastTriggeredPrice?: number;
  /** Alert Trigger Order: basket executed automatically when the alert fires. */
  basketId?: string;
}

export interface UserSettings {
  defaultProduct?: 'CNC' | 'MIS';
  defaultOrderType?: 'MARKET' | 'LIMIT';
  /** Ask for simulated CDSL TPIN before the first CNC sell of the day. */
  tpinPrompt?: boolean;
  chartType?: string;
  chartTimeframe?: string;
  /** Whether watchlist rows show change in % or absolute. */
  watchlistChange?: 'PCT' | 'ABS';
  watchlistSort?: 'NONE' | 'CHANGE' | 'LTP' | 'ALPHA' | 'EXCHANGE';
  pauseOnAlert?: boolean;
}

export interface ChartDrawing {
  id: string;
  kind: 'HLINE' | 'TREND' | 'RAY' | 'RECT' | 'FIB';
  /** Points as (time, price); time is 'YYYY-MM-DD' or unix seconds. */
  points: Array<{ time: string | number; price: number }>;
  color?: string;
}

export interface SimulationProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  startDate: string;
  currentDate: string;
  intraday: IntradaySessionState;
  blindMode: boolean;
  startingCapital: number; // Default 200000 (₹2,00,000)
  netCapitalInvested: number;
  availableCash: number;
  monthlyTopUp: number; // Optional recurring monthly savings deposit (default 0)
  lastTopUpMonth?: string; // 'YYYY-MM'
  autoPause: AutoPauseSettings;
  pinnedIndices: [string, string]; // Default ['NIFTY 50', 'SENSEX']
  watchlists: WatchlistGroup[];
  activeWatchlistId: number;
  selectedSymbol: string;
  holdings: Holding[];
  positions: Position[];
  orders: Order[];
  gtts: GttRule[];
  baskets: OrderBasket[];
  sips: SipSchedule[];
  trades: TradeRecord[];
  ledger: LedgerEntry[];
  equityHistory: DailyEquityPoint[];
  dpSoldToday: string[]; // Tracks symbols already charged ₹15.34 DP fee today
  notifications: SimulatorNotification[];
  /** Id of the newest notification the user has seen (for the bell's unread count). */
  notificationsReadAt?: string;
  alerts?: PriceAlert[];
  settings?: UserSettings;
  /** Chart drawings per symbol. */
  chartDrawings?: Record<string, ChartDrawing[]>;
  /** Date of the last simulated CDSL TPIN authorisation. */
  tpinAuthorisedDate?: string;
}

export interface OptionContractQuote {
  strike: number;
  expiryDate: string;
  daysToExpiry: number;
  lotSize: number;
  /** True when this strike row belongs to a weekly (non-monthly) index expiry. */
  isWeeklyExpiry?: boolean;
  ce: {
    contractKey: string;
    displaySymbol: string;
    ltp: number;
    iv: number;
    delta: number;
    theta: number;
    /** Change in delta per ₹1 move in the underlying. */
    gamma: number;
    /** Change in premium (₹) per 1 volatility point. */
    vega: number;
    oi: number;
    /** Synthetic change in open interest vs previous session (contracts × lot). */
    oiChange: number;
    /** Synthetic traded volume for the session (contracts × lot). */
    volume: number;
    changePct: number;
  };
  pe: {
    contractKey: string;
    displaySymbol: string;
    ltp: number;
    iv: number;
    delta: number;
    theta: number;
    /** Change in delta per ₹1 move in the underlying. */
    gamma: number;
    /** Change in premium (₹) per 1 volatility point. */
    vega: number;
    oi: number;
    /** Synthetic change in open interest vs previous session (contracts × lot). */
    oiChange: number;
    /** Synthetic traded volume for the session (contracts × lot). */
    volume: number;
    changePct: number;
  };
}

export interface FuturesContractQuote {
  contractKey: string;
  displaySymbol: string;
  expiryDate: string;
  daysToExpiry: number;
  lotSize: number;
  ltp: number;
  basis: number;
  marginRequired: number;
}
