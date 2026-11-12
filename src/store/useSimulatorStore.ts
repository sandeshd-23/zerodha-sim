import { create } from 'zustand';
import type {
  ChartDrawing,
  Exchange,
  GttRule,
  Instrument,
  InstrumentType,
  MarketQuote,
  OrderBasket,
  OrderSide,
  OrderType,
  OrderValidity,
  OrderVariety,
  PriceAlert,
  ProductType,
  SimulationProfile,
  SipSchedule,
  UserSettings,
} from '../types/simulator.ts';
import { api, API_MODE, onWorkerEvent, type WorkerEvent } from '../api/client.ts';
import type { DataCapabilities } from '../market/types.ts';

export type MainNavTab =
  | 'CHART'
  | 'DASHBOARD'
  | 'ORDERS'
  | 'HOLDINGS'
  | 'POSITIONS'
  | 'SIP_BASKETS'
  | 'FUNDS'
  | 'CONSOLE'
  | 'PROFILE';

export type OrdersSubTab = 'OPEN' | 'EXECUTED' | 'TRADES' | 'GTT' | 'ALERTS';

export type AutoPlaySpeed = 'OFF' | 'INTRADAY_5M' | 'DAY_1S' | 'WEEK_1S' | 'MONTH_1S';

/** Off: no tips. Hover: tips on mouse hover / long-press. Explain: a tap explains instead of acting. */
export type TipMode = 'OFF' | 'HOVER' | 'EXPLAIN';

export interface HistoricalEra {
  id: string;
  label: string;
  date: string;
  description: string;
}

export interface MarketMoversData {
  gainers: Array<{ symbol: string; name: string; sector: string; ltp: number; changePct: number }>;
  losers: Array<{ symbol: string; name: string; sector: string; ltp: number; changePct: number }>;
  breakouts52w: Array<{ symbol: string; name: string; ltp: number; high52w: number; changePct: number }>;
  sectors: Array<{ sector: string; avgChangePct: number; count: number }>;
}

export interface OrderTicketState {
  open: boolean;
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
  price: number;
  triggerPrice: number;
  stopLossTrigger: number;
  icebergLegs: number;
  modifyOrderId?: string;
  /** Kite extras */
  disclosedQty: number;
  ttlMinutes: number;
  marketProtectionPct: number;
  tag: string;
  attachStoploss: boolean;
  stoplossPrice: number;
  attachTarget: boolean;
  targetPrice: number;
}

export interface ToastMessage {
  id: string;
  kind: 'success' | 'error' | 'info';
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

export interface DataStatus {
  phase: 'loading' | 'downloading' | 'ready' | 'error';
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  dataAsOf?: string;
  offline?: boolean;
  message?: string;
}

interface SimulatorStore {
  loading: boolean;
  stepping: boolean;
  theme: 'light' | 'dark';
  tipMode: TipMode;
  /** Back-compat: true when tipMode !== 'OFF'. */
  hoverTipsEnabled: boolean;
  activeTab: MainNavTab;
  ordersSubTab: OrdersSubTab;
  mobileWatchlistOpen: boolean;
  autoPlaySpeed: AutoPlaySpeed;
  timelineModalOpen: boolean;
  fnoModal: { open: boolean; symbol: string };
  gttModal: { open: boolean; symbol: string; side: OrderSide; editGttId?: string };
  alertModal: { open: boolean; symbol: string; editAlertId?: string };
  orderDetailsId: string | null;
  notificationsOpen: boolean;
  glossaryOpen: boolean;
  glossaryFocus?: string;
  tpinPrompt: { open: boolean; resume?: () => void };
  orderTicket: OrderTicketState;
  toasts: ToastMessage[];

  capabilities: DataCapabilities;
  dataAsOf?: string;
  dataStatus: DataStatus;

  instruments: Instrument[];
  instrumentsMap: Record<string, Instrument>;
  eras: HistoricalEra[];
  calendarBounds: { minDate: string; maxDate: string; totalTradingDays: number };
  profilesList: Array<{ id: string; name: string; updatedAt: string; currentDate: string; startingCapital: number }>;
  profile: SimulationProfile | null;
  quotes: Record<string, MarketQuote>;
  derivativePrices: Record<string, number>;
  movers: MarketMoversData;

  // UI actions
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  toggleHoverTips: () => void;
  setTipMode: (mode: TipMode) => void;
  setActiveTab: (tab: MainNavTab) => void;
  setOrdersSubTab: (tab: OrdersSubTab) => void;
  setMobileWatchlistOpen: (open: boolean) => void;
  setTimelineModalOpen: (open: boolean) => void;
  openFnoModal: (symbol: string) => void;
  closeFnoModal: () => void;
  openGttModal: (symbol: string, side?: OrderSide, editGttId?: string) => void;
  closeGttModal: () => void;
  openAlertModal: (symbol: string, editAlertId?: string) => void;
  closeAlertModal: () => void;
  setOrderDetailsId: (id: string | null) => void;
  setNotificationsOpen: (open: boolean) => void;
  openGlossary: (focus?: string) => void;
  closeGlossary: () => void;
  closeTpinPrompt: () => void;
  pushToast: (kind: ToastMessage['kind'], title: string, body?: string, action?: ToastMessage['action']) => void;
  dismissToast: (id: string) => void;

  openOrderTicket: (params: {
    side: OrderSide;
    symbol: string;
    product?: ProductType;
    orderType?: OrderType;
    qty?: number;
    price?: number;
    instrumentType?: InstrumentType;
    contractKey?: string;
    displaySymbol?: string;
    strikePrice?: number;
    expiryDate?: string;
    lotSize?: number;
    modifyOrderId?: string;
  }) => void;
  updateOrderTicket: (patch: Partial<OrderTicketState>) => void;
  closeOrderTicket: () => void;

  bootstrap: (profileId?: string) => Promise<void>;
  selectSymbol: (symbol: string, switchToChart?: boolean) => Promise<void>;
  setActiveWatchlist: (watchlistId: number) => Promise<void>;
  addSymbolToWatchlist: (symbol: string) => Promise<void>;
  removeSymbolFromWatchlist: (symbol: string) => Promise<void>;
  moveWatchlistSymbol: (symbol: string, dir: -1 | 1) => Promise<void>;
  renameWatchlist: (watchlistId: number, name: string) => Promise<void>;
  addCustomRemoteStock: (params: { symbol: string; yahooTicker: string; name?: string; exchange?: 'NSE' | 'BSE' | 'US/GLOBAL' }) => Promise<void>;
  fetchQuotes: (symbols: string[]) => Promise<void>;

  stepTime: (mode: '5m' | '15m' | '1H' | '1D' | '1W' | '1M' | '6M' | '1Y' | 'JUMP', targetDate?: string) => Promise<void>;
  toggleIntradayMode: (enabled: boolean) => Promise<void>;
  setAutoPlaySpeed: (speed: AutoPlaySpeed) => void;

  submitOrderTicket: () => Promise<boolean>;
  cancelOrder: (orderId: string) => Promise<void>;
  cancelAllOrders: () => Promise<void>;
  convertPosition: (positionId: string, toProduct?: ProductType, qty?: number) => Promise<void>;
  /** CNC→MIS for shares bought for delivery today (holding t1Qty). */
  convertHoldingToIntraday: (symbol: string, qty?: number) => Promise<void>;
  squareOffPositions: (positionId?: string | string[], qty?: number) => Promise<void>;
  pledgeHolding: (symbol: string, pledgeQty: number) => Promise<void>;
  authoriseTpin: () => Promise<void>;

  createGtt: (
    rule: Omit<GttRule, 'id' | 'createdAtDate' | 'expiresAtDate' | 'status'> & { expiresAtDate?: string }
  ) => Promise<void>;
  modifyGtt: (gttId: string, patch: Partial<Pick<GttRule, 'legs' | 'product' | 'expiresAtDate'>>) => Promise<void>;
  cancelGtt: (gttId: string) => Promise<void>;

  saveAlert: (alert: Partial<PriceAlert> & Pick<PriceAlert, 'symbol' | 'property' | 'operator' | 'value' | 'mode'>) => Promise<boolean>;
  toggleAlert: (alertId: string) => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;

  saveBasket: (basket: OrderBasket) => Promise<void>;
  deleteBasket: (basketId: string) => Promise<void>;
  executeBasket: (basketId: string) => Promise<void>;

  saveSip: (sip: SipSchedule) => Promise<void>;
  toggleSip: (sipId: string) => Promise<void>;
  deleteSip: (sipId: string) => Promise<void>;

  adjustFunds: (action: 'ADD' | 'WITHDRAW' | 'SET_STARTING', amount: number) => Promise<void>;
  updateProfileMeta: (
    patch: Partial<SimulationProfile> & {
      tradeNote?: { tradeId: string; note: string; emotionTag?: SimulationProfile['trades'][0]['emotionTag'] };
      markNotificationsRead?: boolean;
      drawings?: { symbol: string; items: ChartDrawing[] };
    }
  ) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  saveDrawings: (symbol: string, items: ChartDrawing[]) => Promise<void>;
  markNotificationsRead: () => Promise<void>;

  createNewProfile: (params: { name: string; startDate: string; startingCapital: number; blindMode: boolean }) => Promise<void>;
  loadProfile: (id: string) => Promise<void>;
  resetCurrentProfile: (params: { startDate?: string; startingCapital?: number; name?: string; blindMode?: boolean }) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  exportBackup: () => Promise<void>;
  importBackup: (file: File) => Promise<void>;
}

const ls = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

const initialTheme: 'light' | 'dark' = typeof window !== 'undefined' && ls.get('kite_sim_theme') === 'dark' ? 'dark' : 'light';

function readTipMode(): TipMode {
  if (typeof window === 'undefined') return 'HOVER';
  const m = ls.get('kite_tip_mode');
  if (m === 'OFF' || m === 'HOVER' || m === 'EXPLAIN') return m;
  return ls.get('kite_hover_tips') === 'false' ? 'OFF' : 'HOVER';
}
const initialTipMode = readTipMode();

function applyThemeToDocument(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#121418' : '#ffffff');
}
applyThemeToDocument(initialTheme);

function buildInstrumentsMap(list: Instrument[]): Record<string, Instrument> {
  const m: Record<string, Instrument> = {};
  for (const i of list) m[i.symbol] = i;
  return m;
}

const DEFAULT_TICKET: OrderTicketState = {
  open: false,
  side: 'BUY',
  exchange: 'NSE',
  product: 'CNC',
  variety: 'REGULAR',
  orderType: 'MARKET',
  validity: 'DAY',
  instrumentType: 'EQ',
  contractKey: 'RELIANCE',
  underlyingSymbol: 'RELIANCE',
  displaySymbol: 'RELIANCE',
  lotSize: 1,
  qty: 1,
  price: 0,
  triggerPrice: 0,
  stopLossTrigger: 0,
  icebergLegs: 3,
  disclosedQty: 0,
  ttlMinutes: 30,
  marketProtectionPct: 0,
  tag: '',
  attachStoploss: false,
  stoplossPrice: 0,
  attachTarget: false,
  targetPrice: 0,
};

export const useSimulatorStore = create<SimulatorStore>((set, get) => {
  /** Applies the standard state payload every profile endpoint returns. */
  const applyState = (data: any, extra?: Partial<SimulatorStore>) => {
    const patch: Partial<SimulatorStore> = { ...extra };
    if (data?.profile) patch.profile = data.profile;
    if (data?.profilesList) patch.profilesList = data.profilesList;
    if (data?.quotes) patch.quotes = { ...get().quotes, ...data.quotes };
    if (data?.derivativePrices) patch.derivativePrices = data.derivativePrices;
    if (data?.movers) patch.movers = data.movers;
    set(patch);
  };

  /** POST/DELETE to a profile route and apply the result. Returns the response data. */
  const profileCall = async (
    method: 'POST' | 'DELETE',
    suffix: string,
    body?: unknown,
    opts?: { success?: string; error?: string; extra?: Partial<SimulatorStore> }
  ) => {
    const prof = get().profile;
    if (!prof) return null;
    try {
      const res = await api(method, `/profiles/${encodeURIComponent(prof.id)}${suffix}`, body);
      if (res.ok) {
        applyState(res.data, opts?.extra);
        if (opts?.success) get().pushToast('success', opts.success, res.data.message);
      } else {
        if (res.data?.profile) applyState(res.data);
        if (opts?.error) get().pushToast('error', opts.error, res.data?.message);
      }
      return res;
    } catch (err) {
      get().pushToast('error', opts?.error || 'Something went wrong', (err as Error).message);
      return null;
    }
  };

  // Offline data download progress from the engine worker
  if (typeof window !== 'undefined' && API_MODE === 'worker') {
    onWorkerEvent((e: WorkerEvent) => {
      const ds = get().dataStatus;
      if (e.type === 'data-progress') {
        set({
          dataStatus: {
            ...ds,
            phase: e.done >= e.total ? 'ready' : 'downloading',
            done: e.done,
            total: e.total,
            bytesDone: e.bytesDone,
            bytesTotal: e.bytesTotal,
          },
        });
        if (e.done >= e.total && e.total > 0 && ds.phase === 'downloading') {
          get().pushToast('success', 'Offline mode ready', 'All market data is saved on this device — works without internet.');
        }
      } else if (e.type === 'data-ready') {
        set({ dataAsOf: e.dataAsOf, dataStatus: { ...ds, dataAsOf: e.dataAsOf, offline: e.offline, phase: ds.phase === 'loading' ? 'downloading' : ds.phase } });
        if (e.updated) {
          get().pushToast('info', 'Market data updated', `Prices now available through ${e.dataAsOf}.`);
        }
      } else if (e.type === 'data-error') {
        set({ dataStatus: { ...ds, phase: 'error', message: e.message } });
      }
    });
  }

  return {
    loading: true,
    stepping: false,
    theme: initialTheme,
    tipMode: initialTipMode,
    hoverTipsEnabled: initialTipMode !== 'OFF',
    activeTab: 'CHART',
    ordersSubTab: 'OPEN',
    mobileWatchlistOpen: false,
    autoPlaySpeed: 'OFF',
    timelineModalOpen: false,
    fnoModal: { open: false, symbol: 'NIFTY 50' },
    gttModal: { open: false, symbol: 'RELIANCE', side: 'SELL' },
    alertModal: { open: false, symbol: 'RELIANCE' },
    orderDetailsId: null,
    notificationsOpen: false,
    glossaryOpen: false,
    tpinPrompt: { open: false },
    orderTicket: DEFAULT_TICKET,
    toasts: [],

    capabilities: { remoteSearch: API_MODE === 'http', addTicker: API_MODE === 'http', liveSync: API_MODE === 'http' },
    dataStatus: { phase: 'loading', done: 0, total: 0, bytesDone: 0, bytesTotal: 0 },

    instruments: [],
    instrumentsMap: {},
    eras: [],
    calendarBounds: { minDate: '2000-01-03', maxDate: '2026-10-30', totalTradingDays: 6700 },
    profilesList: [],
    profile: null,
    quotes: {},
    derivativePrices: {},
    movers: { gainers: [], losers: [], breakouts52w: [], sectors: [] },

    setTheme: (theme) => {
      ls.set('kite_sim_theme', theme);
      applyThemeToDocument(theme);
      set({ theme });
    },

    toggleTheme: () => {
      get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
    },

    setTipMode: (tipMode) => {
      ls.set('kite_tip_mode', tipMode);
      set({ tipMode, hoverTipsEnabled: tipMode !== 'OFF' });
    },

    toggleHoverTips: () => {
      const order: TipMode[] = ['HOVER', 'EXPLAIN', 'OFF'];
      const next = order[(order.indexOf(get().tipMode) + 1) % order.length];
      get().setTipMode(next);
      const msg: Record<TipMode, [string, string]> = {
        HOVER: ['Tips: Hover', 'Hover (or long-press on a phone) any button, label or column to learn what it means.'],
        EXPLAIN: ['Tips: Explain mode', 'Tap anything to see what it does — taps explain instead of acting. Tap the ? again to turn it off.'],
        OFF: ['Tips off', 'Beginner explanations are hidden. Tap the ? to turn them back on.'],
      };
      get().pushToast('info', msg[next][0], msg[next][1]);
    },

    setActiveTab: (activeTab) => set({ activeTab, mobileWatchlistOpen: false }),
    setOrdersSubTab: (ordersSubTab) => set({ ordersSubTab }),
    setMobileWatchlistOpen: (mobileWatchlistOpen) => set({ mobileWatchlistOpen }),
    setTimelineModalOpen: (timelineModalOpen) => set({ timelineModalOpen }),
    openFnoModal: (symbol) => set({ fnoModal: { open: true, symbol } }),
    closeFnoModal: () => set((s) => ({ fnoModal: { ...s.fnoModal, open: false } })),
    openGttModal: (symbol, side = 'SELL', editGttId) => set({ gttModal: { open: true, symbol, side, editGttId } }),
    closeGttModal: () => set((s) => ({ gttModal: { ...s.gttModal, open: false, editGttId: undefined } })),
    openAlertModal: (symbol, editAlertId) => set({ alertModal: { open: true, symbol, editAlertId } }),
    closeAlertModal: () => set((s) => ({ alertModal: { ...s.alertModal, open: false, editAlertId: undefined } })),
    setOrderDetailsId: (orderDetailsId) => set({ orderDetailsId }),
    setNotificationsOpen: (notificationsOpen) => {
      set({ notificationsOpen });
      if (notificationsOpen) void get().markNotificationsRead();
    },
    openGlossary: (glossaryFocus) => set({ glossaryOpen: true, glossaryFocus }),
    closeGlossary: () => set({ glossaryOpen: false, glossaryFocus: undefined }),
    closeTpinPrompt: () => set({ tpinPrompt: { open: false } }),

    pushToast: (kind, title, body, action) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      set((s) => ({ toasts: [{ id, kind, title, body, action }, ...s.toasts].slice(0, 4) }));
      setTimeout(() => {
        get().dismissToast(id);
      }, action ? 9000 : 4500);
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    openOrderTicket: (params) => {
      const state = get();
      const inst = state.instrumentsMap[params.symbol];
      const q = state.quotes[params.symbol];
      const ltp = params.price ?? q?.ltp ?? 100;
      const isIdx = Boolean(inst?.isIndex);

      if (isIdx && (!params.instrumentType || params.instrumentType === 'EQ')) {
        // Indices cannot be bought directly in cash — open their Synthetic F&O Option & Futures Chain!
        set({ fnoModal: { open: true, symbol: params.symbol } });
        state.pushToast(
          'info',
          `${params.symbol} is an Index`,
          'Select a Futures or Option contract from the F&O Chain (or buy NIFTYBEES / BANKBEES ETF for delivery).'
        );
        return;
      }

      const settings = state.profile?.settings || {};
      const instType = params.instrumentType || 'EQ';
      const lotSize = instType === 'EQ' ? 1 : params.lotSize || inst?.lotSize || 1;
      const defaultProduct: ProductType = params.product || (instType !== 'EQ' ? 'NRML' : settings.defaultProduct || 'CNC');
      const existing = params.modifyOrderId ? state.profile?.orders.find((o) => o.id === params.modifyOrderId) : undefined;

      set({
        orderTicket: {
          ...DEFAULT_TICKET,
          open: true,
          side: params.side,
          exchange: instType !== 'EQ' ? 'NFO' : inst?.exchange === 'BSE' ? 'BSE' : 'NSE',
          product: defaultProduct,
          variety: 'REGULAR',
          orderType: params.orderType || settings.defaultOrderType || 'MARKET',
          validity: existing?.validity || 'DAY',
          instrumentType: instType,
          contractKey: params.contractKey || params.symbol,
          underlyingSymbol: params.symbol,
          displaySymbol: params.displaySymbol || params.symbol,
          strikePrice: params.strikePrice,
          expiryDate: params.expiryDate,
          lotSize,
          qty: params.qty || lotSize,
          price: Number(ltp.toFixed(2)),
          triggerPrice: Number((params.side === 'BUY' ? ltp * 1.01 : ltp * 0.99).toFixed(2)),
          stopLossTrigger: Number((params.side === 'BUY' ? ltp * 0.98 : ltp * 1.02).toFixed(2)),
          stoplossPrice: Number((params.side === 'BUY' ? ltp * 0.95 : ltp * 1.05).toFixed(2)),
          targetPrice: Number((params.side === 'BUY' ? ltp * 1.1 : ltp * 0.9).toFixed(2)),
          icebergLegs: 3,
          disclosedQty: existing?.disclosedQty || 0,
          ttlMinutes: existing?.ttlMinutes || 30,
          modifyOrderId: params.modifyOrderId,
        },
      });
    },

    updateOrderTicket: (patch) =>
      set((s) => ({
        orderTicket: { ...s.orderTicket, ...patch },
      })),

    closeOrderTicket: () =>
      set((s) => ({
        orderTicket: { ...s.orderTicket, open: false, modifyOrderId: undefined },
      })),

    bootstrap: async (profileId) => {
      set({ loading: true });
      try {
        const res = await api('GET', '/bootstrap', undefined, { profileId });
        const data = res.data;
        if (!res.ok || !data.profile) throw new Error(data?.message || `HTTP ${res.status}`);
        set({
          loading: false,
          instruments: data.instruments || [],
          instrumentsMap: buildInstrumentsMap(data.instruments || []),
          eras: data.eras || [],
          calendarBounds: data.calendarBounds || get().calendarBounds,
          capabilities: data.capabilities || get().capabilities,
          dataAsOf: data.dataAsOf || get().dataAsOf,
          profilesList: data.profilesList || [],
          profile: data.profile,
          quotes: data.quotes || {},
          derivativePrices: data.derivativePrices || {},
          movers: data.movers || get().movers,
        });
        if (API_MODE === 'http') set({ dataStatus: { ...get().dataStatus, phase: 'ready', dataAsOf: data.dataAsOf } });
        // Ask the browser not to evict saved portfolios / offline data.
        if (API_MODE === 'worker' && navigator.storage?.persist) {
          navigator.storage.persist().catch(() => undefined);
        }
      } catch (err) {
        set({ loading: false });
        get().pushToast('error', 'Could not start the simulator', (err as Error).message);
      }
    },

    selectSymbol: async (symbol, switchToChart = false) => {
      const prof = get().profile;
      if (!prof) return;
      if (switchToChart) set({ activeTab: 'CHART', mobileWatchlistOpen: false });
      await get().updateProfileMeta({ selectedSymbol: symbol });
    },

    setActiveWatchlist: async (watchlistId) => {
      await get().updateProfileMeta({ activeWatchlistId: watchlistId });
    },

    addSymbolToWatchlist: async (symbol) => {
      const prof = get().profile;
      if (!prof) return;
      const active = prof.watchlists.find((w) => w.id === prof.activeWatchlistId);
      if (active && active.symbols.length >= 50 && !active.symbols.includes(symbol)) {
        get().pushToast('error', 'Watchlist full', 'Kite allows 50 instruments per watchlist. Remove one or switch to another list (1–7).');
        return;
      }
      const nextWls = prof.watchlists.map((w) => {
        if (w.id !== prof.activeWatchlistId) return w;
        if (w.symbols.includes(symbol)) return w;
        return { ...w, symbols: [...w.symbols, symbol] };
      });
      await get().updateProfileMeta({ watchlists: nextWls, selectedSymbol: symbol });
    },

    removeSymbolFromWatchlist: async (symbol) => {
      const prof = get().profile;
      if (!prof) return;
      const nextWls = prof.watchlists.map((w) => {
        if (w.id !== prof.activeWatchlistId) return w;
        return { ...w, symbols: w.symbols.filter((s) => s !== symbol) };
      });
      await get().updateProfileMeta({ watchlists: nextWls });
    },

    moveWatchlistSymbol: async (symbol, dir) => {
      const prof = get().profile;
      if (!prof) return;
      const nextWls = prof.watchlists.map((w) => {
        if (w.id !== prof.activeWatchlistId) return w;
        const i = w.symbols.indexOf(symbol);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= w.symbols.length) return w;
        const symbols = [...w.symbols];
        [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
        return { ...w, symbols };
      });
      await get().updateProfileMeta({ watchlists: nextWls });
    },

    renameWatchlist: async (watchlistId, name) => {
      const prof = get().profile;
      if (!prof) return;
      const nextWls = prof.watchlists.map((w) => (w.id === watchlistId ? { ...w, name } : w));
      await get().updateProfileMeta({ watchlists: nextWls });
    },

    addCustomRemoteStock: async (params) => {
      if (!get().capabilities.addTicker) {
        get().pushToast('info', 'Not available offline', 'Add new tickers to universe/extra.csv — they are included in the next data update.');
        return;
      }
      get().pushToast('info', `Fetching 25-year history for ${params.symbol}...`);
      try {
        const res = await api('POST', '/instruments/add', params);
        const data = res.data;
        if (!data.ok) {
          get().pushToast('error', `Could not fetch ${params.symbol}`, data.message);
          return;
        }
        set({
          instruments: data.instruments,
          instrumentsMap: buildInstrumentsMap(data.instruments),
        });
        await get().addSymbolToWatchlist(data.instrument.symbol);
        get().pushToast('success', `${data.instrument.symbol} added!`, `Loaded history (${data.instrument.firstDate} → ${data.instrument.lastDate})`);
      } catch (err) {
        get().pushToast('error', 'Network error syncing stock', (err as Error).message);
      }
    },

    fetchQuotes: async (symbols) => {
      const prof = get().profile;
      if (!prof || symbols.length === 0) return;
      const res = await api('POST', '/quotes', {
        symbols,
        date: prof.currentDate,
        intraday: prof.intraday.enabled,
        step: prof.intraday.stepIndex,
      });
      if (res.ok && res.data.quotes) set({ quotes: { ...get().quotes, ...res.data.quotes } });
    },

    stepTime: async (mode, targetDate) => {
      const prof = get().profile;
      if (!prof || get().stepping) return;
      set({ stepping: true });
      try {
        const res = await api('POST', `/profiles/${encodeURIComponent(prof.id)}/time/step`, { mode, targetDate });
        const data = res.data;
        if (!res.ok) {
          set({ stepping: false, autoPlaySpeed: 'OFF' });
          if (data.requiresReset) {
            set({ timelineModalOpen: true });
          }
          get().pushToast('error', 'Time-Machine Notice', data.message);
          return;
        }

        applyState(data, { stepping: false });

        if (data.pausedEarly || data.reachedEnd) {
          set({ autoPlaySpeed: 'OFF' });
          if (data.pauseReason) {
            get().pushToast('info', 'Auto-Play Paused', data.pauseReason);
          } else if (data.reachedEnd) {
            get().pushToast('info', 'End of Historical Data', 'Reached the latest available trading session.');
          }
        } else if (Array.isArray(data.events) && data.events.length > 0) {
          const latestEvent = data.events[data.events.length - 1];
          const more = data.events.length > 1 ? ` (+${data.events.length - 1} more events)` : '';
          get().pushToast('info', 'Market Event', `${latestEvent}${more}`);
        }
      } catch (err) {
        set({ stepping: false, autoPlaySpeed: 'OFF' });
        get().pushToast('error', 'Step error', (err as Error).message);
      }
    },

    toggleIntradayMode: async (enabled) => {
      set({ autoPlaySpeed: 'OFF' });
      const res = await profileCall('POST', '/time/toggle-intraday', { enabled });
      if (res?.ok) {
        get().pushToast(
          'info',
          enabled ? 'Intraday Live Mode (09:15 IST)' : 'End-of-Day Investor Mode (15:30 IST)',
          enabled
            ? 'Step 5m/15m candles or hit Play to trade intraday MIS with 3:20 PM auto-square-off!'
            : 'Switched back to daily/monthly/yearly fast-forwarding.'
        );
      }
    },

    setAutoPlaySpeed: (autoPlaySpeed) => set({ autoPlaySpeed }),

    submitOrderTicket: async () => {
      const prof = get().profile;
      const t = get().orderTicket;
      if (!prof) return false;

      if (t.modifyOrderId) {
        const res = await profileCall(
          'POST',
          '/orders/modify',
          {
            orderId: t.modifyOrderId,
            qty: t.qty,
            price: t.price,
            triggerPrice: t.triggerPrice,
            orderType: t.orderType,
            disclosedQty: t.disclosedQty,
            validity: t.validity,
            ttlMinutes: t.ttlMinutes,
          },
          { success: 'Order Modified', error: 'Modify Failed' }
        );
        if (res?.ok) {
          set({ orderTicket: { ...t, open: false, modifyOrderId: undefined } });
          return true;
        }
        return false;
      }

      // Simulated CDSL TPIN authorisation before the first delivery sell of the day (Kite/CDSL flow)
      const needsTpin =
        t.side === 'SELL' &&
        t.product === 'CNC' &&
        t.instrumentType === 'EQ' &&
        prof.settings?.tpinPrompt !== false &&
        prof.tpinAuthorisedDate !== prof.currentDate &&
        prof.holdings.some((h) => h.symbol === t.underlyingSymbol && h.qty > 0);
      if (needsTpin) {
        return new Promise<boolean>((resolve) => {
          set({
            tpinPrompt: {
              open: true,
              resume: async () => {
                await get().authoriseTpin();
                resolve(await get().submitOrderTicket());
              },
            },
          });
        });
      }

      const res = await profileCall('POST', '/orders/place', {
        side: t.side,
        exchange: t.exchange,
        product: t.product,
        variety: t.variety,
        orderType: t.orderType,
        validity: t.validity,
        instrumentType: t.instrumentType,
        contractKey: t.contractKey,
        underlyingSymbol: t.underlyingSymbol,
        displaySymbol: t.displaySymbol,
        strikePrice: t.strikePrice,
        expiryDate: t.expiryDate,
        lotSize: t.lotSize,
        qty: t.qty,
        price: t.price,
        triggerPrice: t.triggerPrice,
        stopLossTrigger: t.variety === 'CO' ? t.stopLossTrigger : undefined,
        icebergLegs: t.variety === 'ICEBERG' ? t.icebergLegs : undefined,
        disclosedQty: t.instrumentType === 'EQ' && t.disclosedQty > 0 ? t.disclosedQty : undefined,
        ttlMinutes: t.validity === 'TTL' ? t.ttlMinutes : undefined,
        marketProtectionPct: t.orderType === 'MARKET' && t.marketProtectionPct > 0 ? t.marketProtectionPct : undefined,
        tag: t.tag || undefined,
        attachedGtt:
          t.instrumentType === 'EQ' && t.variety === 'REGULAR' && (t.attachStoploss || t.attachTarget)
            ? {
                stoplossPrice: t.attachStoploss ? t.stoplossPrice : undefined,
                targetPrice: t.attachTarget ? t.targetPrice : undefined,
              }
            : undefined,
      });
      if (res?.ok) {
        set((s) => ({ orderTicket: { ...s.orderTicket, open: false } }));
        get().pushToast('success', 'Order Placed', res.data.message);
        return true;
      }
      get().pushToast('error', 'Order Rejected', res?.data?.message);
      return false;
    },

    cancelOrder: async (orderId) => {
      const res = await profileCall('POST', '/orders/cancel', { orderId });
      if (res?.ok) get().pushToast('info', 'Order Cancelled', res.data.message);
    },

    cancelAllOrders: async () => {
      await profileCall('POST', '/orders/cancel', { all: true }, { success: 'Orders Cancelled', error: 'Nothing to cancel' });
    },

    convertPosition: async (positionId, toProduct, qty) => {
      await profileCall('POST', '/positions/convert', { positionId, toProduct, qty }, { success: 'Position Converted', error: 'Conversion Failed' });
    },

    convertHoldingToIntraday: async (symbol, qty) => {
      await profileCall('POST', '/positions/convert', { symbol, toProduct: 'MIS', qty }, { success: 'Converted to intraday (MIS)', error: 'Conversion Failed' });
    },

    squareOffPositions: async (positionId, qty) => {
      const body = Array.isArray(positionId) ? { positionIds: positionId } : { positionId, qty };
      await profileCall('POST', '/positions/square-off', body, { success: 'Position Squared Off' });
    },

    pledgeHolding: async (symbol, pledgeQty) => {
      await profileCall('POST', '/holdings/pledge', { symbol, pledgeQty }, { success: 'Collateral Pledge Updated', error: 'Pledge Failed' });
    },

    authoriseTpin: async () => {
      set({ tpinPrompt: { open: false } });
      await profileCall('POST', '/holdings/authorise', {});
    },

    createGtt: async (rule) => {
      await profileCall('POST', '/gtt/create', rule, {
        success: 'GTT Active',
        error: 'GTT Failed',
        extra: { gttModal: { ...get().gttModal, open: false, editGttId: undefined } },
      });
    },

    modifyGtt: async (gttId, patch) => {
      await profileCall('POST', '/gtt/modify', { gttId, ...patch }, {
        success: 'GTT Modified',
        error: 'Modify Failed',
        extra: { gttModal: { ...get().gttModal, open: false, editGttId: undefined } },
      });
    },

    cancelGtt: async (gttId) => {
      const res = await profileCall('POST', '/gtt/cancel', { gttId });
      if (res?.ok) get().pushToast('info', 'GTT Cancelled');
    },

    saveAlert: async (alert) => {
      const res = await profileCall('POST', '/alerts/save', alert, {
        success: 'Alert Saved',
        error: 'Alert Failed',
        extra: { alertModal: { ...get().alertModal, open: false, editAlertId: undefined } },
      });
      return Boolean(res?.ok);
    },

    toggleAlert: async (alertId) => {
      await profileCall('POST', `/alerts/${encodeURIComponent(alertId)}/toggle`, {});
    },

    deleteAlert: async (alertId) => {
      await profileCall('DELETE', `/alerts/${encodeURIComponent(alertId)}`, undefined, { success: 'Alert Deleted' });
    },

    saveBasket: async (basket) => {
      await profileCall('POST', '/baskets/save', basket, { success: 'Basket Saved' });
    },

    deleteBasket: async (basketId) => {
      await profileCall('DELETE', `/baskets/${encodeURIComponent(basketId)}`);
    },

    executeBasket: async (basketId) => {
      await profileCall('POST', `/baskets/${encodeURIComponent(basketId)}/execute`, {}, { success: 'Basket Executed' });
    },

    saveSip: async (sip) => {
      await profileCall('POST', '/sips/save', sip, { success: 'Stock/ETF SIP Created' });
    },

    toggleSip: async (sipId) => {
      await profileCall('POST', `/sips/${encodeURIComponent(sipId)}/toggle`, {});
    },

    deleteSip: async (sipId) => {
      await profileCall('DELETE', `/sips/${encodeURIComponent(sipId)}`);
    },

    adjustFunds: async (action, amount) => {
      await profileCall('POST', '/funds', { action, amount }, { success: 'Funds Updated', error: 'Funds Update Failed' });
    },

    updateProfileMeta: async (patch) => {
      await profileCall('POST', '/update-meta', patch);
    },

    updateSettings: async (patch) => {
      const prof = get().profile;
      if (!prof) return;
      // optimistic
      set({ profile: { ...prof, settings: { ...(prof.settings || {}), ...patch } } });
      await profileCall('POST', '/update-meta', { settings: patch });
    },

    saveDrawings: async (symbol, items) => {
      const prof = get().profile;
      if (!prof) return;
      set({ profile: { ...prof, chartDrawings: { ...(prof.chartDrawings || {}), [symbol]: items } } });
      await profileCall('POST', '/update-meta', { drawings: { symbol, items } });
    },

    markNotificationsRead: async () => {
      const prof = get().profile;
      if (!prof || !prof.notifications[0] || prof.notificationsReadAt === prof.notifications[0].id) return;
      set({ profile: { ...prof, notificationsReadAt: prof.notifications[0].id } });
      await profileCall('POST', '/update-meta', { markNotificationsRead: true });
    },

    createNewProfile: async (params) => {
      set({ autoPlaySpeed: 'OFF' });
      const res = await api('POST', '/profiles/create', params);
      if (res.ok) {
        applyState(res.data, { timelineModalOpen: false });
        get().pushToast('success', 'New Timeline Created', `${res.data.profile.name} (${res.data.profile.currentDate})`);
      } else {
        get().pushToast('error', 'Could not create timeline', res.data?.message);
      }
    },

    loadProfile: async (id) => {
      set({ autoPlaySpeed: 'OFF' });
      const res = await api('POST', '/profiles/load', { id });
      if (res.ok) {
        applyState(res.data, { timelineModalOpen: false });
        get().pushToast('info', 'Timeline Loaded', res.data.profile.name);
      }
    },

    resetCurrentProfile: async (params) => {
      const prof = get().profile;
      if (!prof) return;
      set({ autoPlaySpeed: 'OFF' });
      const res = await api('POST', '/profiles/reset', { id: prof.id, ...params });
      if (res.ok) {
        applyState(res.data, { timelineModalOpen: false });
        get().pushToast('success', 'Account Reset', res.data.message);
      }
    },

    deleteProfile: async (id) => {
      set({ autoPlaySpeed: 'OFF' });
      const res = await api('DELETE', `/profiles/${encodeURIComponent(id)}`);
      if (res.ok) {
        applyState(res.data);
        get().pushToast('info', 'Timeline Deleted');
      }
    },

    exportBackup: async () => {
      const res = await api('GET', '/profiles/export');
      if (!res.ok) {
        get().pushToast('error', 'Backup failed', res.data?.message);
        return;
      }
      const json = JSON.stringify(res.data, null, 1);
      const name = `kite-sim-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([json], name, { type: 'application/json' });
      try {
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        if (nav.canShare && nav.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
          await navigator.share({ files: [file], title: 'Kite Simulator backup' });
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(file);
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        ls.set('kite_last_backup', new Date().toISOString());
        get().pushToast('success', 'Backup saved', `${res.data.profiles.length} timeline(s) exported to ${name}.`);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') get().pushToast('error', 'Backup failed', (err as Error).message);
      }
    },

    importBackup: async (file) => {
      try {
        const parsed = JSON.parse(await file.text());
        const res = await api('POST', '/profiles/import', parsed);
        if (res.ok) {
          applyState(res.data, { timelineModalOpen: false });
          get().pushToast('success', 'Backup imported', res.data.message);
        } else {
          get().pushToast('error', 'Import failed', res.data?.message);
        }
      } catch (err) {
        get().pushToast('error', 'Import failed', `Not a valid backup file (${(err as Error).message}).`);
      }
    },
  };
});

export function lastBackupAt(): string | null {
  return ls.get('kite_last_backup');
}
