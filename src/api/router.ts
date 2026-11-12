/**
 * The simulator's API, independent of transport. Used by:
 *  - the PC server (Express → router), and
 *  - the offline PWA (Web Worker → router), so the phone needs no server at all.
 *
 * Every handler: load profile → make sure the market data it touches is in memory → run the
 * (synchronous) simulation logic → save → respond with the full state.
 */
import type { MarketEngine, CandleTimeframe } from '../market/marketEngine.ts';
import { HISTORICAL_ERAS } from '../market/eras.ts';
import {
  addOrderHistory,
  adjustFundsInProfile,
  advanceIntradayInProfile,
  convertHoldingToIntraday,
  convertPositionProduct,
  createDefaultProfile,
  executeBasketInProfile,
  placeOrderInProfile,
  processMultiDayFastForward,
  type PlaceOrderInput,
} from '../engine/simulationEngine.ts';
import { generateSyntheticDerivatives, priceDerivativeContractKey } from '../engine/optionsPricing.ts';
import { roundTick, stepIndexToTimeLabel } from '../engine/intraday.ts';
import type { GttRule, OrderBasket, SimulationProfile, SipSchedule } from '../types/simulator.ts';
import type { ProfileStore } from './profileStore.ts';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

export interface ApiRequest {
  method: HttpMethod;
  /** Path without the /api prefix, e.g. "/profiles/abc/orders/place". */
  path: string;
  query?: Record<string, string | undefined>;
  body?: any;
}

export interface ApiResponse {
  status: number;
  body: any;
}

export interface RouterContext {
  market: MarketEngine;
  store: ProfileStore;
  /** Sync state of the PC server (Yahoo download); static when offline. */
  getSyncStatus?: () => unknown;
}

type Handler = (params: Record<string, string>, req: ApiRequest) => Promise<ApiResponse>;

const ok = (body: any): ApiResponse => ({ status: 200, body });
const fail = (status: number, body: any): ApiResponse => ({ status, body });
const notFound = () => fail(404, { ok: false, message: 'Profile not found' });

const OPEN_STATUSES = new Set(['OPEN', 'TRIGGER PENDING', 'AMO REQ RECEIVED']);

export function collectProfileSymbols(profile: SimulationProfile): string[] {
  const set = new Set<string>(profile.pinnedIndices);
  set.add('NIFTY 50');
  set.add('SENSEX');
  if (profile.selectedSymbol) set.add(profile.selectedSymbol);

  const activeWl = profile.watchlists.find((w) => w.id === profile.activeWatchlistId);
  if (activeWl) {
    for (const s of activeWl.symbols) set.add(s);
  }
  for (const h of profile.holdings) set.add(h.symbol);
  for (const p of profile.positions) set.add(p.underlyingSymbol);
  for (const o of profile.orders) {
    if (OPEN_STATUSES.has(o.status)) {
      set.add(o.underlyingSymbol);
    }
  }
  for (const g of profile.gtts) {
    if (g.status === 'ACTIVE') set.add(g.symbol);
  }
  for (const sip of profile.sips) {
    if (sip.status === 'ACTIVE') {
      for (const a of sip.allocations) set.add(a.symbol);
    }
  }
  for (const a of profile.alerts || []) {
    if (a.status !== 'ACTIVE') continue;
    set.add(a.symbol);
    // Alert Trigger Orders: the linked basket's symbols must be priced when the alert fires
    const bk = a.basketId ? profile.baskets.find((b) => b.id === a.basketId) : undefined;
    for (const item of bk?.items || []) set.add(item.symbol);
  }
  return Array.from(set);
}

export function createRouter(ctx: RouterContext) {
  const { market, store } = ctx;

  async function ensureFor(profile: SimulationProfile, extra: string[] = []) {
    await market.ensureSymbols([...collectProfileSymbols(profile), ...extra]);
  }

  async function buildStateResponse(profile: SimulationProfile, extra?: Record<string, unknown>) {
    const symbols = collectProfileSymbols(profile);
    await market.ensureSymbols(symbols);
    await market.ensureMovers(profile.currentDate);
    const quotes = market.getQuotesBatch(symbols, profile.currentDate, profile.intraday.enabled, profile.intraday.stepIndex);
    // Also attach live derivative prices for any open F&O positions
    const derivativePrices: Record<string, number> = {};
    for (const p of profile.positions) {
      if (p.instrumentType !== 'EQ') {
        const spotQ =
          quotes[p.underlyingSymbol] ||
          market.getQuote(p.underlyingSymbol, profile.currentDate, profile.intraday.enabled, profile.intraday.stepIndex);
        derivativePrices[p.contractKey] = priceDerivativeContractKey(
          p.contractKey,
          spotQ.ltp,
          spotQ.annualizedVol,
          profile.currentDate
        ).ltp;
      }
    }

    return {
      profile,
      profilesList: await store.list(),
      quotes,
      derivativePrices,
      movers: market.getMarketMovers(profile.currentDate),
      ...extra,
    };
  }

  const isIndex = (sym: string) => Boolean(market.getInstrument(sym)?.isIndex);

  async function newProfile(params: { name: string; startDate: string; startingCapital: number }) {
    const niftyQ = market.getQuote('NIFTY 50', params.startDate);
    return createDefaultProfile({ ...params, niftyAtStart: niftyQ.ltp || 6000 });
  }

  async function ensureDefaultProfile(): Promise<SimulationProfile> {
    const existing = await store.list();
    if (existing.length > 0) {
      const loaded = await store.get(existing[0].id);
      if (loaded) return loaded;
    }
    const startDate = market.resolveTradingDate('2014-02-03', 'on_or_after');
    const created = await newProfile({ name: 'Zerodha ₹2L Practice Account', startDate, startingCapital: 200000 });
    await store.save(created);
    return created;
  }

  /** Loads the profile and its market data; returns null when missing. */
  async function load(id: string, extraSymbols: string[] = []): Promise<SimulationProfile | null> {
    const profile = await store.get(id);
    if (!profile) return null;
    await ensureFor(profile, extraSymbols);
    return profile;
  }

  async function saveAndRespond(profile: SimulationProfile, extra?: Record<string, unknown>): Promise<ApiResponse> {
    await store.save(profile);
    return ok({ ...(extra || {}), ...(await buildStateResponse(profile)) });
  }

  // Order matters only for overlapping patterns; specific routes first.
  const routes: Array<[HttpMethod, RegExp, string[], Handler]> = [];
  const route = (method: HttpMethod, pattern: string, handler: Handler) => {
    const keys: string[] = [];
    const re = new RegExp(
      '^' +
        pattern.replace(/:([a-zA-Z]+)/g, (_m, k) => {
          keys.push(k);
          return '([^/]+)';
        }) +
        '$'
    );
    routes.push([method, re, keys, handler]);
  };

  // === BOOTSTRAP ===
  route('GET', '/bootstrap', async (_p, req) => {
    const requestedId = req.query?.profileId;
    let profile = requestedId ? await store.get(requestedId) : null;
    if (!profile) profile = await ensureDefaultProfile();
    await ensureFor(profile);
    return ok({
      instruments: market.getInstruments(),
      eras: HISTORICAL_ERAS,
      calendarBounds: market.getCalendarBounds(),
      syncStatus: ctx.getSyncStatus ? ctx.getSyncStatus() : { running: false, total: 0, completed: 0, failed: [] },
      capabilities: market.capabilities,
      dataAsOf: market.dataAsOf,
      ...(await buildStateResponse(profile)),
    });
  });

  // === CANDLES & QUOTES & OPTION CHAIN ===
  route('GET', '/candles', async (_p, req) => {
    const q = req.query || {};
    const symbol = String(q.symbol || 'RELIANCE');
    const date = String(q.date || '2020-03-24');
    const tf = String(q.tf || '1D') as CandleTimeframe;
    const intraday = q.intraday === 'true';
    const step = Number(q.step ?? 74);
    const compare = q.compare ? String(q.compare) : undefined;
    await market.ensureSymbols(compare ? [symbol, compare] : [symbol]);
    const payload = market.getCandles(symbol, date, tf, intraday, step);
    if (compare) {
      return ok({ ...payload, compare: market.getCandles(compare, date, tf, intraday, step).candles });
    }
    return ok(payload);
  });

  route('POST', '/quotes', async (_p, req) => {
    const { symbols, date, intraday, step } = (req.body || {}) as {
      symbols: string[];
      date: string;
      intraday?: boolean;
      step?: number;
    };
    await market.ensureSymbols(symbols || []);
    const quotes = market.getQuotesBatch(symbols || [], date, Boolean(intraday), Number(step ?? 74));
    return ok({ quotes });
  });

  route('GET', '/fno/chain', async (_p, req) => {
    const q = req.query || {};
    const symbol = String(q.symbol || 'NIFTY 50');
    const date = String(q.date || '2020-03-24');
    const intraday = q.intraday === 'true';
    const step = Number(q.step ?? 74);
    const expiry = typeof q.expiry === 'string' ? q.expiry : undefined;

    await market.ensureSymbols([symbol]);
    const inst = market.getInstrument(symbol);
    const quote = market.getQuote(symbol, date, intraday, step);
    if (!quote.available || quote.ltp <= 0) {
      return fail(400, { ok: false, message: `${symbol} not traded on ${date}` });
    }

    const chain = generateSyntheticDerivatives({
      symbol,
      spot: quote.ltp,
      prevClose: quote.prevClose,
      annualizedVol: quote.annualizedVol,
      lotSize: inst?.lotSize || 1,
      simDate: date,
      expiryDate: expiry,
      isIndex: inst?.isIndex,
    });
    return ok({ ok: true, quote, ...chain });
  });

  // === PROFILES / TIMELINES ===
  route('POST', '/profiles/create', async (_p, req) => {
    const { name, startDate, startingCapital, blindMode } = (req.body || {}) as {
      name?: string;
      startDate?: string;
      startingCapital?: number;
      blindMode?: boolean;
    };
    const resolvedDate = market.resolveTradingDate(startDate || '2014-02-03', 'on_or_after');
    const profile = await newProfile({
      name: name || `Timeline (${resolvedDate})`,
      startDate: resolvedDate,
      startingCapital: Number(startingCapital) > 0 ? Number(startingCapital) : 200000,
    });
    if (blindMode) profile.blindMode = true;
    return saveAndRespond(profile, { ok: true });
  });

  route('POST', '/profiles/load', async (_p, req) => {
    const { id } = (req.body || {}) as { id: string };
    const profile = await load(id);
    if (!profile) return notFound();
    return ok({ ok: true, ...(await buildStateResponse(profile)) });
  });

  route('POST', '/profiles/reset', async (_p, req) => {
    const { id, startDate, startingCapital, name, blindMode } = (req.body || {}) as {
      id: string;
      startDate?: string;
      startingCapital?: number;
      name?: string;
      blindMode?: boolean;
    };
    const old = await store.get(id);
    const resolvedDate = market.resolveTradingDate(startDate || old?.startDate || '2014-02-03', 'on_or_after');
    const fresh = await newProfile({
      name: name || old?.name || 'Zerodha ₹2L Practice Account',
      startDate: resolvedDate,
      startingCapital: Number(startingCapital) > 0 ? Number(startingCapital) : old?.startingCapital || 200000,
    });
    fresh.id = old?.id || fresh.id;
    if (old) fresh.watchlists = old.watchlists;
    if (old?.settings) fresh.settings = old.settings;
    if (typeof blindMode === 'boolean') fresh.blindMode = blindMode;
    else if (old) fresh.blindMode = old.blindMode;

    return saveAndRespond(fresh, {
      ok: true,
      message: `Account reset to ${resolvedDate} with ₹${fresh.startingCapital.toLocaleString('en-IN')}.`,
    });
  });

  route('GET', '/profiles/export', async () => {
    const list = await store.list();
    const profiles: SimulationProfile[] = [];
    for (const s of list) {
      const p = await store.get(s.id);
      if (p) profiles.push(p);
    }
    return ok({ ok: true, format: 'kite-sim-backup', version: 1, exportedAt: new Date().toISOString(), profiles });
  });

  route('POST', '/profiles/import', async (_p, req) => {
    const body = req.body || {};
    const incoming: unknown[] = Array.isArray(body.profiles) ? body.profiles : Array.isArray(body) ? body : [body];
    const existingIds = new Set((await store.list()).map((s) => s.id));
    let imported = 0;
    let last: SimulationProfile | null = null;
    for (const raw of incoming) {
      const p = raw as SimulationProfile;
      if (!p || typeof p !== 'object' || !p.id || !p.currentDate || !Array.isArray(p.holdings) || !Array.isArray(p.watchlists)) {
        continue;
      }
      if (existingIds.has(p.id) && !body.overwrite) {
        p.id = `${p.id}_imp${Math.random().toString(36).slice(2, 6)}`;
        p.name = `${p.name} (imported)`;
      }
      await store.save(p);
      existingIds.add(p.id);
      imported += 1;
      last = p;
    }
    if (!last) return fail(400, { ok: false, message: 'No valid simulator profiles found in that file.' });
    await ensureFor(last);
    return ok({ ok: true, message: `Imported ${imported} timeline(s).`, ...(await buildStateResponse(last)) });
  });

  route('DELETE', '/profiles/:id', async (p) => {
    await store.delete(p.id);
    const nextProfile = await ensureDefaultProfile();
    await ensureFor(nextProfile);
    return ok({ ok: true, ...(await buildStateResponse(nextProfile)) });
  });

  route('POST', '/profiles/:id/update-meta', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const patch = (req.body || {}) as Partial<SimulationProfile> & {
      tradeNote?: { tradeId: string; note: string; emotionTag?: SimulationProfile['trades'][0]['emotionTag'] };
      markNotificationsRead?: boolean;
      drawings?: { symbol: string; items: unknown[] };
    };

    if (patch.name) profile.name = patch.name;
    if (typeof patch.blindMode === 'boolean') profile.blindMode = patch.blindMode;
    if (patch.selectedSymbol) profile.selectedSymbol = patch.selectedSymbol;
    if (typeof patch.activeWatchlistId === 'number') profile.activeWatchlistId = patch.activeWatchlistId;
    if (Array.isArray(patch.watchlists)) profile.watchlists = patch.watchlists;
    if (Array.isArray(patch.pinnedIndices) && patch.pinnedIndices.length === 2) {
      profile.pinnedIndices = patch.pinnedIndices as [string, string];
    }
    if (patch.autoPause) profile.autoPause = { ...profile.autoPause, ...patch.autoPause };
    if (typeof patch.monthlyTopUp === 'number' && patch.monthlyTopUp >= 0) {
      profile.monthlyTopUp = patch.monthlyTopUp;
    }
    if (patch.settings) profile.settings = { ...(profile.settings || {}), ...patch.settings };
    if (patch.markNotificationsRead) profile.notificationsReadAt = profile.notifications[0]?.id || profile.notificationsReadAt;
    if (patch.drawings && typeof patch.drawings.symbol === 'string' && Array.isArray(patch.drawings.items)) {
      profile.chartDrawings = { ...(profile.chartDrawings || {}), [patch.drawings.symbol]: patch.drawings.items as never };
      if (patch.drawings.items.length === 0) delete profile.chartDrawings[patch.drawings.symbol];
    }
    if (patch.tradeNote) {
      const tr = profile.trades.find((t) => t.id === patch.tradeNote!.tradeId);
      if (tr) {
        tr.note = patch.tradeNote.note;
        tr.emotionTag = patch.tradeNote.emotionTag;
      }
    }

    return saveAndRespond(profile, { ok: true });
  });

  // === TIME-MACHINE & INTRADAY CONTROLS ===
  route('POST', '/profiles/:id/time/toggle-intraday', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { enabled } = (req.body || {}) as { enabled: boolean };
    if (enabled) {
      // If current day already at 15:30 close, advance to next trading day 09:15 open so we don't replay past bars!
      if (profile.intraday.stepIndex >= 74) {
        const nextDay = market.computeTargetDate(profile.currentDate, '1D');
        if (nextDay > profile.currentDate) {
          // Promote T+1 holdings on new morning
          for (const h of profile.holdings) {
            if (h.t1Qty > 0) {
              h.qty += h.t1Qty;
              h.t1Qty = 0;
            }
          }
          profile.currentDate = nextDay;
          profile.dpSoldToday = [];
        }
      }
      profile.intraday.enabled = true;
      profile.intraday.stepIndex = 0;
      profile.intraday.timeLabel = stepIndexToTimeLabel(0); // 09:15
      profile.intraday.marketOpen = true;
    } else {
      // Fast-complete remainder of current intraday day to 15:30 close
      if (profile.intraday.enabled && profile.intraday.stepIndex < 74) {
        const rem = 74 - profile.intraday.stepIndex;
        advanceIntradayInProfile(profile, rem, (sym, stepIdx) => market.getQuote(sym, profile.currentDate, true, stepIdx), {
          isIndex,
        });
      }
      profile.intraday.enabled = false;
      profile.intraday.stepIndex = 74;
      profile.intraday.timeLabel = '15:30';
      profile.intraday.marketOpen = true;
    }

    return saveAndRespond(profile, { ok: true });
  });

  route('POST', '/profiles/:id/time/step', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();

    const { mode, targetDate } = (req.body || {}) as {
      mode: '5m' | '15m' | '1H' | '1D' | '1W' | '1M' | '6M' | '1Y' | 'JUMP';
      targetDate?: string;
    };

    // Intraday steps
    if (mode === '5m' || mode === '15m' || mode === '1H') {
      const steps = mode === '5m' ? 1 : mode === '15m' ? 3 : 12;
      if (!profile.intraday.enabled || profile.intraday.stepIndex >= 74) {
        // Start next trading morning at 09:15 first
        const nextDay = market.computeTargetDate(profile.currentDate, '1D');
        if (nextDay > profile.currentDate) {
          for (const h of profile.holdings) {
            if (h.t1Qty > 0) {
              h.qty += h.t1Qty;
              h.t1Qty = 0;
            }
          }
          profile.currentDate = nextDay;
          profile.dpSoldToday = [];
        }
        profile.intraday.enabled = true;
        profile.intraday.stepIndex = 0;
        profile.intraday.timeLabel = '09:15';
        profile.intraday.marketOpen = true;
      } else {
        const resIntra = advanceIntradayInProfile(
          profile,
          steps,
          (sym, stepIdx) => market.getQuote(sym, profile.currentDate, true, stepIdx),
          { allowPause: true, isIndex }
        );
        return saveAndRespond(profile, {
          ok: true,
          events: resIntra.triggeredEvents,
          dayCompleted: resIntra.dayCompleted,
          ...(resIntra.pausedEarly ? { pausedEarly: true, pauseReason: resIntra.pauseReason } : {}),
        });
      }

      return saveAndRespond(profile, { ok: true, events: [] });
    }

    // If jumping to an earlier historical date, warn/require reset unless portfolio is completely empty!
    let resolvedTarget: string;
    if (mode === 'JUMP' && targetDate) {
      if (targetDate < profile.currentDate) {
        const hasHistory =
          profile.holdings.length > 0 || profile.positions.some((x) => x.netQty !== 0) || profile.trades.length > 0;
        if (hasHistory) {
          return fail(400, {
            ok: false,
            requiresReset: true,
            message:
              'Jumping backward in time requires resetting this account (or creating a new Timeline) so past trades remain chronologically valid.',
          });
        }
        // Fresh untouched account jumping backward — simply re-anchor startDate & currentDate!
        const cleanDate = market.resolveTradingDate(targetDate, 'on_or_after');
        const niftyQ = market.getQuote('NIFTY 50', cleanDate);
        profile.startDate = cleanDate;
        profile.currentDate = cleanDate;
        profile.lastTopUpMonth = cleanDate.slice(0, 7);
        profile.intraday = { enabled: false, stepIndex: 74, totalSteps: 75, timeLabel: '15:30', marketOpen: true };
        profile.equityHistory = [
          {
            date: cleanDate,
            totalEquity: profile.availableCash,
            cash: profile.availableCash,
            holdingsValue: 0,
            positionsPnl: 0,
            realizedPnlDay: 0,
            chargesDay: 0,
            dividendsDay: 0,
            netCapitalInvested: profile.netCapitalInvested,
            niftyClose: niftyQ.ltp || 6000,
          },
        ];
        if (profile.ledger[0]) profile.ledger[0].date = cleanDate;
        return saveAndRespond(profile, { ok: true, events: [`Time-Machine anchored to ${cleanDate}`] });
      }
      resolvedTarget = market.resolveTradingDate(targetDate, 'on_or_before');
    } else {
      resolvedTarget = market.computeTargetDate(profile.currentDate, mode === 'JUMP' ? '1D' : mode);
    }

    // If currently mid-day in Intraday mode, finish today to 15:30 first
    if (profile.intraday.enabled && profile.intraday.stepIndex < 74) {
      advanceIntradayInProfile(
        profile,
        74 - profile.intraday.stepIndex,
        (sym, stepIdx) => market.getQuote(sym, profile.currentDate, true, stepIdx),
        { isIndex }
      );
      profile.intraday.enabled = false;
    }

    if (resolvedTarget <= profile.currentDate) {
      return saveAndRespond(profile, {
        ok: true,
        reachedEnd: true,
        events: ['Reached latest available historical market date.'],
      });
    }

    const trackedSymbols = collectProfileSymbols(profile);
    await market.ensureSymbols(trackedSymbols);
    const packets = market.getStepPackets(profile.currentDate, resolvedTarget, trackedSymbols);
    const instMap = new Map(market.getInstruments().map((i) => [i.symbol, i]));

    const simResult = processMultiDayFastForward(profile, packets, instMap);
    return saveAndRespond(profile, {
      ok: true,
      pausedEarly: simResult.pausedEarly,
      pauseReason: simResult.pauseReason,
      daysProcessed: simResult.daysProcessed,
      events: simResult.events,
    });
  });

  // === ORDERS ===
  route('POST', '/profiles/:id/orders/place', async (p, req) => {
    const input = (req.body || {}) as PlaceOrderInput;
    const profile = await load(p.id, [input.underlyingSymbol]);
    if (!profile) return notFound();
    const inst = market.getInstrument(input.underlyingSymbol);
    const spotQuote = market.getQuote(
      input.underlyingSymbol,
      profile.currentDate,
      profile.intraday.enabled,
      profile.intraday.stepIndex
    );

    let contractLtp = spotQuote.ltp;
    if (input.instrumentType !== 'EQ' && input.contractKey) {
      contractLtp = priceDerivativeContractKey(input.contractKey, spotQuote.ltp, spotQuote.annualizedVol, profile.currentDate).ltp;
    }

    const result = placeOrderInProfile(profile, input, contractLtp, spotQuote.ltp, Boolean(inst?.isIndex));
    return saveAndRespond(profile, { ...result });
  });

  route('POST', '/profiles/:id/orders/cancel', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { orderId, all } = (req.body || {}) as { orderId?: string; all?: boolean };
    const targets = all
      ? profile.orders.filter((o) => OPEN_STATUSES.has(o.status))
      : profile.orders.filter((o) => o.id === orderId && OPEN_STATUSES.has(o.status));
    if (targets.length === 0) {
      return fail(400, { ok: false, message: all ? 'No open orders to cancel.' : 'Order cannot be cancelled.' });
    }
    for (const ord of targets) {
      ord.status = 'CANCELLED';
      ord.marginBlocked = 0;
      ord.statusMessage = 'Cancelled by user.';
      addOrderHistory(ord, profile.currentDate, profile.intraday.timeLabel, 'CANCELLED', 'Cancelled by user');
    }
    return saveAndRespond(profile, {
      ok: true,
      message: all ? `Cancelled ${targets.length} open order(s).` : `Cancelled order for ${targets[0].displaySymbol}.`,
    });
  });

  route('POST', '/profiles/:id/orders/modify', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { orderId, qty, price, triggerPrice, orderType, disclosedQty, validity, ttlMinutes } = (req.body || {}) as {
      orderId: string;
      qty?: number;
      price?: number;
      triggerPrice?: number;
      orderType?: PlaceOrderInput['orderType'];
      disclosedQty?: number;
      validity?: PlaceOrderInput['validity'];
      ttlMinutes?: number;
    };
    const ord = profile.orders.find((o) => o.id === orderId);
    if (!ord || !OPEN_STATUSES.has(ord.status)) {
      return fail(400, { ok: false, message: 'Order is no longer open for modification.' });
    }
    const newQty = qty && qty > 0 ? Math.floor(qty) : ord.qty;
    if (ord.instrumentType !== 'EQ' && newQty % Math.max(1, ord.lotSize || 1) !== 0) {
      return fail(400, { ok: false, message: `F&O quantity must be a multiple of lot size (${ord.lotSize}).` });
    }
    if (typeof disclosedQty === 'number' && disclosedQty > 0) {
      const minDq = Math.ceil(newQty * 0.1);
      if (Math.floor(disclosedQty) < minDq || Math.floor(disclosedQty) > newQty) {
        return fail(400, {
          ok: false,
          message: `Disclosed quantity must be at least 10% of the order quantity (${minDq}) and not more than ${newQty}.`,
        });
      }
    }
    if ((validity || ord.validity) === 'TTL' && typeof ttlMinutes === 'number' && (ttlMinutes < 1 || ttlMinutes > 365)) {
      return fail(400, { ok: false, message: 'TTL validity needs a duration between 1 and 365 minutes.' });
    }
    const changes: string[] = [];
    if (newQty !== ord.qty) changes.push(`qty ${ord.qty}→${newQty}`);
    if (price && price > 0 && roundTick(price) !== ord.price) changes.push(`price ₹${ord.price}→₹${roundTick(price)}`);
    if (typeof triggerPrice === 'number' && triggerPrice >= 0 && roundTick(triggerPrice) !== ord.triggerPrice) {
      changes.push(`trigger ₹${ord.triggerPrice}→₹${roundTick(triggerPrice)}`);
    }
    if (orderType && orderType !== ord.orderType) changes.push(`type ${ord.orderType}→${orderType}`);
    if (validity && validity !== ord.validity) changes.push(`validity ${ord.validity}→${validity}`);

    if (qty && qty > 0) ord.qty = Math.floor(qty);
    if (price && price > 0) ord.price = roundTick(price);
    if (typeof triggerPrice === 'number' && triggerPrice >= 0) ord.triggerPrice = roundTick(triggerPrice);
    if (orderType) ord.orderType = orderType;
    if (typeof disclosedQty === 'number' && disclosedQty >= 0) ord.disclosedQty = Math.floor(disclosedQty) || undefined;
    if (validity) ord.validity = validity;
    if (typeof ttlMinutes === 'number' && ttlMinutes > 0) ord.ttlMinutes = Math.floor(ttlMinutes);
    if (ord.validity === 'TTL' && !ord.ttlMinutes) ord.ttlMinutes = 1;
    addOrderHistory(
      ord,
      profile.currentDate,
      profile.intraday.timeLabel,
      'MODIFIED',
      changes.length > 0 ? changes.join(', ') : 'Order modified'
    );

    return saveAndRespond(profile, { ok: true, message: `Modified order for ${ord.displaySymbol}.` });
  });

  // === POSITIONS & HOLDINGS ===
  route('POST', '/profiles/:id/positions/convert', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { positionId, symbol, toProduct, qty } = (req.body || {}) as {
      positionId?: string;
      symbol?: string;
      toProduct?: SimulationProfile['positions'][0]['product'];
      qty?: number;
    };
    // Holding reference (CNC → MIS for today's delivery buys): { symbol, toProduct: 'MIS', qty? }
    if (!positionId && symbol) {
      if (toProduct && toProduct !== 'MIS') {
        return fail(400, { ok: false, message: 'Holdings can only be converted to MIS (intraday).' });
      }
      const hq = market.getQuote(symbol, profile.currentDate, profile.intraday.enabled, profile.intraday.stepIndex);
      const hr = convertHoldingToIntraday(profile, symbol, qty, hq.available ? hq.ltp : undefined);
      return saveAndRespond(profile, { ...hr });
    }
    if (!positionId) return fail(400, { ok: false, message: 'Pass a positionId (or a holding symbol) to convert.' });
    const pos = profile.positions.find((x) => x.id === positionId);
    const underlying = pos?.underlyingSymbol || String(positionId || '').split('|')[0];
    const spotQ = market.getQuote(underlying, profile.currentDate, profile.intraday.enabled, profile.intraday.stepIndex);
    const result = convertPositionProduct(profile, positionId, toProduct, qty, spotQ.available ? spotQ.ltp : undefined);
    return saveAndRespond(profile, { ...result });
  });

  route('POST', '/profiles/:id/positions/square-off', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { positionId, positionIds, qty } = (req.body || {}) as {
      positionId?: string;
      positionIds?: string[];
      qty?: number;
    };
    // If no id is given, squares off ALL open positions.
    const idSet = positionIds && positionIds.length > 0 ? new Set(positionIds) : positionId ? new Set([positionId]) : null;
    const targets = idSet
      ? profile.positions.filter((x) => idSet.has(x.id) && x.netQty !== 0)
      : profile.positions.filter((x) => x.netQty !== 0);

    if (qty && qty > 0 && targets.length === 1) {
      const t = targets[0];
      const lot = Math.max(1, t.lotSize || 1);
      const want = Math.floor(qty);
      if (want > Math.abs(t.netQty)) {
        return fail(400, { ok: false, message: `You can exit at most ${Math.abs(t.netQty)} qty of ${t.displaySymbol}.` });
      }
      if (t.instrumentType !== 'EQ' && want % lot !== 0) {
        return fail(400, { ok: false, message: `F&O exit quantity must be a multiple of the lot size (${lot}).` });
      }
    }

    let closedCount = 0;
    for (const pos of targets) {
      const spotQ = market.getQuote(pos.underlyingSymbol, profile.currentDate, profile.intraday.enabled, profile.intraday.stepIndex);
      let ltp = spotQ.ltp;
      if (pos.instrumentType !== 'EQ') {
        ltp = priceDerivativeContractKey(pos.contractKey, spotQ.ltp, spotQ.annualizedVol, profile.currentDate).ltp;
      }
      const exitSide = pos.netQty > 0 ? 'SELL' : 'BUY';
      const fullQty = Math.abs(pos.netQty);
      const exitQty = qty && qty > 0 && targets.length === 1 ? Math.min(fullQty, Math.floor(qty)) : fullQty;
      const r = placeOrderInProfile(
        profile,
        {
          side: exitSide,
          exchange: pos.exchange,
          product: pos.product,
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
          qty: Math.min(fullQty, exitQty),
          tag: 'SQUARE-OFF',
        },
        ltp,
        spotQ.ltp,
        false
      );
      if (r.ok) closedCount += 1;
    }
    return saveAndRespond(profile, { ok: true, message: `Squared off ${closedCount} open position(s).` });
  });

  route('POST', '/profiles/:id/holdings/pledge', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { symbol, pledgeQty } = (req.body || {}) as { symbol: string; pledgeQty: number };
    const holding = profile.holdings.find((h) => h.symbol === symbol);
    if (!holding) {
      return fail(404, { ok: false, message: 'Holding not found' });
    }
    const maxPledgeable = holding.qty; // Only settled Demat shares can be pledged on CDSL
    const desired = Math.max(0, Math.min(maxPledgeable, Math.floor(pledgeQty)));
    holding.pledgedQty = desired;
    return saveAndRespond(profile, {
      ok: true,
      message: `${symbol} pledged shares updated to ${desired}/${maxPledgeable} (85% collateral margin active).`,
    });
  });

  route('POST', '/profiles/:id/holdings/authorise', async (p) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    profile.tpinAuthorisedDate = profile.currentDate;
    return saveAndRespond(profile, { ok: true, message: 'CDSL authorisation successful for today (simulated TPIN).' });
  });

  // === GTT (SINGLE & OCO) ===
  route('POST', '/profiles/:id/gtt/create', async (p, req) => {
    const body = (req.body || {}) as Omit<GttRule, 'id' | 'createdAtDate' | 'expiresAtDate' | 'status'> & {
      expiresAtDate?: string;
    };
    const profile = await load(p.id, [body.symbol]);
    if (!profile) return notFound();
    const expDt = new Date(profile.currentDate + 'T00:00:00Z');
    expDt.setUTCFullYear(expDt.getUTCFullYear() + 1);
    const defaultExpiry = expDt.toISOString().slice(0, 10);
    const expiresAtDate =
      body.expiresAtDate && body.expiresAtDate > profile.currentDate && body.expiresAtDate <= defaultExpiry
        ? body.expiresAtDate
        : defaultExpiry;

    if (body.product && !['CNC', 'MTF', 'MIS'].includes(body.product)) {
      return fail(400, { ok: false, message: 'GTT product must be CNC, MTF or MIS.' });
    }
    const gtt: GttRule = {
      ...body,
      product: body.product || 'CNC',
      id: `gtt_${Date.now().toString(36)}`,
      createdAtDate: profile.currentDate,
      expiresAtDate,
      status: 'ACTIVE',
    };
    profile.gtts.unshift(gtt);
    return saveAndRespond(profile, { ok: true, message: `GTT (${gtt.type}) created for ${gtt.symbol}.` });
  });

  route('POST', '/profiles/:id/gtt/modify', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { gttId, legs, product, expiresAtDate } = (req.body || {}) as Partial<GttRule> & { gttId: string };
    const gtt = profile.gtts.find((g) => g.id === gttId);
    if (!gtt || gtt.status !== 'ACTIVE') return fail(400, { ok: false, message: 'GTT is no longer active.' });
    if (Array.isArray(legs) && legs.length === gtt.legs.length) {
      gtt.legs = legs.map((l, i) => ({
        ...gtt.legs[i],
        triggerPrice: roundTick(Number(l.triggerPrice) || gtt.legs[i].triggerPrice),
        limitPrice: roundTick(Number(l.limitPrice) || gtt.legs[i].limitPrice),
        qty: Math.max(1, Math.floor(Number(l.qty) || gtt.legs[i].qty)),
      }));
    }
    if (product) gtt.product = product;
    if (expiresAtDate && expiresAtDate > profile.currentDate) gtt.expiresAtDate = expiresAtDate;
    return saveAndRespond(profile, { ok: true, message: `GTT for ${gtt.symbol} modified.` });
  });

  route('POST', '/profiles/:id/gtt/cancel', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { gttId } = (req.body || {}) as { gttId: string };
    const gtt = profile.gtts.find((g) => g.id === gttId);
    if (gtt && gtt.status === 'ACTIVE') {
      gtt.status = 'CANCELLED';
    }
    return saveAndRespond(profile, { ok: true, message: 'GTT cancelled.' });
  });

  // === PRICE ALERTS ===
  route('POST', '/profiles/:id/alerts/save', async (p, req) => {
    const body = (req.body || {}) as NonNullable<SimulationProfile['alerts']>[0];
    const profile = await load(p.id, body.symbol ? [body.symbol] : []);
    if (!profile) return notFound();
    if (!body.symbol || !(Number(body.value) > 0 || body.property === 'CHANGE_PCT')) {
      return fail(400, { ok: false, message: 'Alert needs a symbol and a value.' });
    }
    profile.alerts = profile.alerts || [];
    const q = market.getQuote(body.symbol, profile.currentDate, profile.intraday.enabled, profile.intraday.stepIndex);
    const alert = {
      ...body,
      id: body.id || `alr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdDate: body.createdDate || profile.currentDate,
      ltpAtCreation: q.ltp,
      status: 'ACTIVE' as const,
      triggerCount: body.triggerCount || 0,
    };
    const idx = profile.alerts.findIndex((a) => a.id === alert.id);
    if (idx >= 0) profile.alerts[idx] = alert;
    else profile.alerts.unshift(alert);
    return saveAndRespond(profile, { ok: true, message: `Alert "${alert.name || alert.symbol}" saved.` });
  });

  route('POST', '/profiles/:id/alerts/:alertId/toggle', async (p) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const a = (profile.alerts || []).find((x) => x.id === p.alertId);
    if (a) a.status = a.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    return saveAndRespond(profile, { ok: true });
  });

  route('DELETE', '/profiles/:id/alerts/:alertId', async (p) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    profile.alerts = (profile.alerts || []).filter((x) => x.id !== p.alertId);
    return saveAndRespond(profile, { ok: true, message: 'Alert deleted.' });
  });

  // === BASKETS ===
  route('POST', '/profiles/:id/baskets/save', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const basket = (req.body || {}) as OrderBasket;
    if (!basket.id) basket.id = `bsk_${Date.now().toString(36)}`;
    if (!basket.createdAt) basket.createdAt = profile.currentDate;

    const idx = profile.baskets.findIndex((b) => b.id === basket.id);
    if (idx >= 0) profile.baskets[idx] = basket;
    else profile.baskets.unshift(basket);

    return saveAndRespond(profile, { ok: true, message: `Basket "${basket.name}" saved.` });
  });

  route('DELETE', '/profiles/:id/baskets/:basketId', async (p) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    profile.baskets = profile.baskets.filter((b) => b.id !== p.basketId);
    return saveAndRespond(profile, { ok: true });
  });

  route('POST', '/profiles/:id/baskets/:basketId/execute', async (p) => {
    const stored = await store.get(p.id);
    if (!stored) return notFound();
    const basketSyms = (stored.baskets.find((b) => b.id === p.basketId)?.items || []).map((i) => i.symbol);
    const profile = await load(p.id, basketSyms);
    if (!profile) return notFound();
    const basket = profile.baskets.find((b) => b.id === p.basketId);
    if (!basket) {
      return fail(404, { ok: false, message: 'Basket not found' });
    }
    const { successCount } = executeBasketInProfile(profile, basket, (sym) => {
      const q = market.getQuote(sym, profile.currentDate, profile.intraday.enabled, profile.intraday.stepIndex);
      return { ltp: q.ltp, annualizedVol: q.annualizedVol, isIndex: isIndex(sym) };
    });
    return saveAndRespond(profile, {
      ok: true,
      message: `Executed ${successCount}/${basket.items.length} orders in "${basket.name}".`,
    });
  });

  // === AUTOMATED STOCK & ETF SIPs ===
  route('POST', '/profiles/:id/sips/save', async (p, req) => {
    const sip = (req.body || {}) as SipSchedule;
    const profile = await load(p.id, (sip.allocations || []).map((a) => a.symbol));
    if (!profile) return notFound();
    if (!sip.id) sip.id = `sip_${Date.now().toString(36)}`;
    if (!sip.createdDate) sip.createdDate = profile.currentDate;
    sip.totalInvested = sip.totalInvested || 0;
    sip.installmentsExecuted = sip.installmentsExecuted || 0;

    const idx = profile.sips.findIndex((s) => s.id === sip.id);
    if (idx >= 0) profile.sips[idx] = sip;
    else profile.sips.unshift(sip);

    return saveAndRespond(profile, {
      ok: true,
      message: `SIP "${sip.name}" scheduled! Fast-forward months/years to watch it compound.`,
    });
  });

  route('POST', '/profiles/:id/sips/:sipId/toggle', async (p) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const sip = profile.sips.find((s) => s.id === p.sipId);
    if (sip) {
      sip.status = sip.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    }
    return saveAndRespond(profile, { ok: true });
  });

  route('DELETE', '/profiles/:id/sips/:sipId', async (p) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    profile.sips = profile.sips.filter((s) => s.id !== p.sipId);
    return saveAndRespond(profile, { ok: true });
  });

  // === FUNDS ===
  route('POST', '/profiles/:id/funds', async (p, req) => {
    const profile = await load(p.id);
    if (!profile) return notFound();
    const { action, amount } = (req.body || {}) as {
      action: 'ADD' | 'WITHDRAW' | 'SET_STARTING';
      amount: number;
    };
    const result = adjustFundsInProfile(profile, action, amount);
    return saveAndRespond(profile, { ...result });
  });

  // Serialise requests: handlers await between load and save, and auto-play fires quickly.
  let chain: Promise<unknown> = Promise.resolve();

  async function dispatch(req: ApiRequest): Promise<ApiResponse> {
    const path = req.path.split('?')[0];
    await market.init();
    for (const [method, re, keys, handler] of routes) {
      if (method !== req.method) continue;
      const m = re.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      try {
        return await handler(params, req);
      } catch (err) {
        console.error('[router]', req.method, path, err);
        return fail(500, { ok: false, message: (err as Error).message || 'Internal error' });
      }
    }
    return fail(404, { ok: false, message: `No route for ${req.method} ${path}` });
  }

  return function handle(req: ApiRequest): Promise<ApiResponse> {
    const run = chain.then(() => dispatch(req));
    chain = run.catch(() => undefined);
    return run;
  };
}
