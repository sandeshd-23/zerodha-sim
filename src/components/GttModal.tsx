import React, { useEffect, useState } from 'react';
import { Target, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { formatNum, getDisplaySymbol } from '../utils/format.ts';
import type { GttLeg, OrderSide } from '../types/simulator.ts';

type LegKey = 'SINGLE' | 'STOPLOSS' | 'TARGET';

interface LegState {
  trigger: number;
  limit: number;
  qty: number;
  /** Once the user edits the limit price it no longer follows the trigger. */
  limitTouched: boolean;
}

const round2 = (n: number) => Number(n.toFixed(2));

/** Kite pre-fills the limit 0.5% beyond the trigger so the order is likely to fill once triggered. */
function defaultLimit(trigger: number, side: OrderSide): number {
  return round2(side === 'BUY' ? trigger * 1.005 : trigger * 0.995);
}

function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function makeLeg(trigger: number, qty: number, side: OrderSide): LegState {
  const t = round2(trigger);
  return { trigger: t, limit: defaultLimit(t, side), qty, limitTouched: false };
}

const inputCls =
  'w-full px-2.5 h-10 md:h-9 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg font-mono text-sm focus:outline-none focus:border-kite-blue disabled:bg-gray-100 dark:disabled:bg-gray-800/70 disabled:text-gray-400';

export const GttModal: React.FC = () => {
  const { gttModal, closeGttModal, profile, quotes, instrumentsMap, createGtt, modifyGtt } = useSimulatorStore();

  const symbol = gttModal.symbol;
  const ltp = quotes[symbol]?.ltp || 100;
  const currentDate = profile?.currentDate || new Date().toISOString().slice(0, 10);
  const maxExpiry = addYears(currentDate, 1);
  const editing = gttModal.editGttId ? profile?.gtts.find((g) => g.id === gttModal.editGttId) : undefined;

  const [side, setSide] = useState<OrderSide>(gttModal.side);
  const [gttType, setGttType] = useState<'SINGLE' | 'OCO'>('SINGLE');
  const [product, setProduct] = useState<'CNC' | 'MIS'>('CNC');
  const [expiry, setExpiry] = useState(maxExpiry);
  const [legs, setLegs] = useState<Record<LegKey, LegState>>({
    SINGLE: makeLeg(ltp, 1, 'BUY'),
    STOPLOSS: makeLeg(ltp, 1, 'SELL'),
    TARGET: makeLeg(ltp, 1, 'SELL'),
  });
  const [submitting, setSubmitting] = useState(false);

  // Initialise / prefill whenever the modal opens.
  useEffect(() => {
    if (!gttModal.open || !profile) return;
    const st = useSimulatorStore.getState();
    const q = st.quotes[gttModal.symbol]?.ltp || 100;
    const h = profile.holdings.find((x) => x.symbol === gttModal.symbol);
    const held = h ? h.qty + h.t1Qty : 0;
    const existing = gttModal.editGttId ? profile.gtts.find((g) => g.id === gttModal.editGttId) : undefined;

    if (existing) {
      setSide(existing.side);
      setGttType(existing.type);
      setProduct(existing.product === 'MIS' ? 'MIS' : 'CNC');
      setExpiry(existing.expiresAtDate);
      const fromLeg = (l?: GttLeg): LegState | undefined =>
        l ? { trigger: l.triggerPrice, limit: l.limitPrice, qty: l.qty, limitTouched: true } : undefined;
      const qty = existing.legs[0]?.qty || 1;
      setLegs({
        SINGLE: fromLeg(existing.legs.find((l) => l.label === 'SINGLE')) || makeLeg(q, qty, existing.side),
        STOPLOSS: fromLeg(existing.legs.find((l) => l.label === 'STOPLOSS')) || makeLeg(q * 0.92, qty, existing.side),
        TARGET: fromLeg(existing.legs.find((l) => l.label === 'TARGET')) || makeLeg(q * 1.2, qty, existing.side),
      });
      return;
    }

    const s = gttModal.side;
    const qty = s === 'SELL' && held > 0 ? held : Math.max(1, Math.floor(15000 / q));
    setSide(s);
    setGttType(s === 'SELL' && held > 0 ? 'OCO' : 'SINGLE');
    setProduct('CNC');
    setExpiry(addYears(profile.currentDate, 1));
    setLegs({
      SINGLE: makeLeg(s === 'BUY' ? q * 0.95 : q * 1.1, qty, s),
      STOPLOSS: makeLeg(q * 0.92, qty, s),
      TARGET: makeLeg(q * 1.2, qty, s),
    });
    // Only re-run when the modal is (re)opened for a symbol / GTT — not on every price tick.
  }, [gttModal.open, gttModal.symbol, gttModal.side, gttModal.editGttId]);

  if (!gttModal.open || !profile) return null;

  const inst = instrumentsMap[symbol];
  const holding = profile.holdings.find((h) => h.symbol === symbol);
  const heldQty = holding ? holding.qty + holding.t1Qty : 0;
  const pctFromLtp = (p: number) => (ltp > 0 ? `${p >= ltp ? '+' : ''}${(((p - ltp) / ltp) * 100).toFixed(2)}%` : '—');

  const updateLeg = (key: LegKey, patch: Partial<LegState>) =>
    setLegs((cur) => {
      const next = { ...cur[key], ...patch };
      if (patch.trigger !== undefined && !next.limitTouched) next.limit = defaultLimit(patch.trigger, side);
      return { ...cur, [key]: next };
    });

  const changeSide = (s: OrderSide) => {
    setSide(s);
    if (s === 'BUY') setGttType('SINGLE');
    // Re-derive untouched limit prices for the new side.
    setLegs((cur) => {
      const fix = (l: LegState): LegState => (l.limitTouched ? l : { ...l, limit: defaultLimit(l.trigger, s) });
      return { SINGLE: fix(cur.SINGLE), STOPLOSS: fix(cur.STOPLOSS), TARGET: fix(cur.TARGET) };
    });
  };

  const changeProduct = (p: 'CNC' | 'MIS') => {
    setProduct(p);
    setExpiry(p === 'MIS' ? currentDate : maxExpiry);
  };

  const activeKeys: LegKey[] = gttType === 'OCO' ? ['STOPLOSS', 'TARGET'] : ['SINGLE'];

  const errors: string[] = [];
  for (const k of activeKeys) {
    const l = legs[k];
    if (!(l.trigger > 0) || !(l.limit > 0)) errors.push('Prices must be greater than zero.');
    if (!(l.qty >= 1)) errors.push('Quantity must be at least 1.');
    if (ltp > 0 && Math.abs(l.trigger - ltp) / ltp < 0.0025) errors.push('Trigger must be at least 0.25% away from LTP.');
  }
  if (gttType === 'OCO') {
    if (legs.STOPLOSS.trigger >= ltp) errors.push('Stoploss trigger must be below LTP.');
    if (legs.TARGET.trigger <= ltp) errors.push('Target trigger must be above LTP.');
  }
  if (expiry < currentDate || expiry > maxExpiry) errors.push('Expiry must be within one year from today.');
  const uniqueErrors = Array.from(new Set(errors));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uniqueErrors.length > 0) return;
    const outLegs: GttLeg[] = activeKeys.map((k) => ({
      label: k,
      triggerPrice: round2(legs[k].trigger),
      limitPrice: round2(legs[k].limit),
      qty: Math.floor(legs[k].qty),
    }));
    setSubmitting(true);
    if (editing) {
      await modifyGtt(editing.id, { legs: outLegs, product, expiresAtDate: expiry });
    } else {
      await createGtt({
        type: gttType,
        symbol,
        exchange: inst?.exchange === 'BSE' ? 'BSE' : 'NSE',
        side,
        product,
        ltpAtCreation: ltp,
        legs: outLegs,
        expiresAtDate: expiry,
      });
    }
    setSubmitting(false);
  };

  const legMeta: Record<LegKey, { title: string; box: string; accent: string; tip: string; presets: number[] }> = {
    SINGLE: {
      title: 'Trigger',
      box: 'border-gray-200 dark:border-kite-darkBorder bg-slate-50/60 dark:bg-[#14171d]',
      accent: 'text-kite-blue',
      tip:
        side === 'BUY'
          ? 'Single trigger (buy) :: When the LTP reaches the trigger price, a LIMIT buy order is placed at your limit price. :: Typical use: “buy if it dips to ₹X”.'
          : 'Single trigger (sell) :: When the LTP reaches the trigger price, a LIMIT sell order is placed at your limit price. :: Typical use: book profit at a target, or a simple stop-loss.',
      presets: side === 'BUY' ? [-3, -5, -10, -15, 3, 5] : [5, 10, 20, -5, -8, -10],
    },
    STOPLOSS: {
      title: 'Stoploss',
      box: 'border-red-300/60 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/15',
      accent: 'text-kite-red',
      tip: 'Stoploss leg :: If the price falls to this trigger, a sell order is placed to limit your loss — and the target leg is cancelled.',
      presets: [-5, -8, -10, -15],
    },
    TARGET: {
      title: 'Target',
      box: 'border-emerald-300/60 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/15',
      accent: 'text-kite-green',
      tip: 'Target leg :: If the price rises to this trigger, a sell order is placed to book profit — and the stoploss leg is cancelled.',
      presets: [10, 20, 30, 50],
    },
  };

  const segBtn = (on: boolean, color: 'blue' | 'orange' | 'soft') =>
    `flex-1 h-10 md:h-8 rounded border font-semibold disabled:opacity-40 ${
      on
        ? color === 'blue'
          ? 'border-kite-blue bg-kite-blue text-white'
          : color === 'orange'
            ? 'border-kite-orange bg-kite-orange text-white'
            : 'border-kite-blue bg-kite-blue/10 text-kite-blue'
        : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4" onClick={closeGttModal}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg rounded-t-xl md:rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden text-xs"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 md:px-5 py-3 border-b border-gray-200 dark:border-kite-darkBorder bg-slate-50 dark:bg-[#15181e]">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-4 h-4 text-kite-blue shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-sm text-gray-800 dark:text-white truncate">
                {editing ? 'Modify' : 'Create'} GTT · {getDisplaySymbol(symbol, instrumentsMap, profile.blindMode)}
              </div>
              <div
                className="font-mono text-kite-muted text-[11px]"
                data-tip="LTP — Last Traded Price :: The current market price. Trigger prices are measured as % away from this."
              >
                LTP ₹{formatNum(ltp)}
                {heldQty > 0 && <span className="ml-2 font-sans">· You hold {heldQty}</span>}
              </div>
            </div>
          </div>
          <button type="button" onClick={closeGttModal} className="p-2 -mr-2 rounded hover:bg-gray-200 dark:hover:bg-gray-800" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[11px] text-kite-muted font-semibold mb-1.5"
                data-tip="Transaction type :: BUY GTT: buy when the price reaches your level (e.g. buy the dip). SELL GTT: sell shares you hold at a target or stop-loss."
              >
                Transaction type
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(editing)} onClick={() => changeSide('BUY')} className={segBtn(side === 'BUY', 'blue')}>
                  BUY
                </button>
                <button type="button" disabled={Boolean(editing)} onClick={() => changeSide('SELL')} className={segBtn(side === 'SELL', 'orange')}>
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label
                className="block text-[11px] text-kite-muted font-semibold mb-1.5"
                data-tip="Trigger type :: Single — one trigger price. OCO (One Cancels Other) — a stoploss AND a target for a holding; when one fires, the other is cancelled automatically."
              >
                Trigger type
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(editing)}
                  onClick={() => setGttType('SINGLE')}
                  className={segBtn(gttType === 'SINGLE', 'soft')}
                  data-tip="Single :: One trigger price; one order is placed when it’s hit."
                >
                  Single
                </button>
                <button
                  type="button"
                  disabled={Boolean(editing) || side === 'BUY'}
                  onClick={() => setGttType('OCO')}
                  className={segBtn(gttType === 'OCO', 'soft')}
                  data-tip="OCO — One Cancels Other :: Stoploss + target on shares you hold. Available for SELL GTTs only."
                >
                  OCO
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[11px] text-kite-muted font-semibold mb-1.5"
                data-tip="Product :: CNC (delivery) — the triggered order is a normal delivery order; the GTT can stay active for up to a year. MIS (intraday) — the triggered order is intraday and is squared off the same day, so the GTT is valid only for today."
              >
                Product
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => changeProduct('CNC')} className={segBtn(product === 'CNC', 'soft')}>
                  CNC
                </button>
                <button type="button" onClick={() => changeProduct('MIS')} className={segBtn(product === 'MIS', 'soft')}>
                  MIS
                </button>
              </div>
              {product === 'MIS' && <div className="text-[10px] text-kite-muted mt-1">For today’s intraday only — expires at market close.</div>}
            </div>

            <div>
              <label
                className="block text-[11px] text-kite-muted font-semibold mb-1.5"
                data-tip="Expiry :: The GTT is cancelled automatically if not triggered by this date. Kite allows up to 1 year from today. :: Fires automatically even while you fast-forward time."
              >
                Expires on
              </label>
              <input
                type="date"
                value={expiry}
                min={currentDate}
                max={maxExpiry}
                disabled={product === 'MIS'}
                onChange={(e) => setExpiry(e.target.value || maxExpiry)}
                className={`${inputCls} font-sans`}
              />
            </div>
          </div>

          {/* Legs */}
          <div className={gttType === 'OCO' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
            {activeKeys.map((k) => {
              const l = legs[k];
              const meta = legMeta[k];
              return (
                <div key={k} className={`p-3 rounded border space-y-2 ${meta.box}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${meta.accent}`} data-tip={meta.tip}>
                      {meta.title}
                    </span>
                    <span
                      className={`font-mono ${meta.accent}`}
                      data-tip="% from LTP :: How far the trigger is from the current price. The GTT fires only when the price moves this much."
                    >
                      {pctFromLtp(l.trigger)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        className="block text-[10px] text-kite-muted mb-0.5"
                        data-tip="Trigger price :: When the last traded price touches this level, your order is sent to the exchange."
                      >
                        Trigger price
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        value={l.trigger}
                        onChange={(e) => updateLeg(k, { trigger: Number(e.target.value) })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-[10px] text-kite-muted mb-0.5"
                        data-tip="Limit price :: The price of the LIMIT order placed once triggered. Kite pre-fills it 0.5% beyond the trigger (higher for buys, lower for sells) so it is likely to fill even if the price moves fast."
                      >
                        Limit price
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        value={l.limit}
                        onChange={(e) => updateLeg(k, { limit: Number(e.target.value), limitTouched: true })}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-[10px] text-kite-muted mb-0.5"
                      data-tip={
                        side === 'SELL'
                          ? 'Quantity :: Shares to sell when triggered. For holdings, usually your full held quantity.'
                          : 'Quantity :: Shares to buy when triggered. You need enough funds at the time it triggers, not now.'
                      }
                    >
                      Qty{heldQty > 0 && side === 'SELL' ? ` (held ${heldQty})` : ''}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={l.qty}
                      onChange={(e) => updateLeg(k, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                      className={`${inputCls} font-semibold`}
                    />
                  </div>

                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {meta.presets.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateLeg(k, { trigger: round2(ltp * (1 + p / 100)) })}
                        className="px-2 h-8 md:h-6 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px] font-mono hover:border-kite-blue"
                      >
                        {p > 0 ? `+${p}%` : `${p}%`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {uniqueErrors.length > 0 && (
            <ul className="text-[11px] text-kite-red space-y-0.5 list-disc pl-4">
              {uniqueErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-kite-muted leading-snug">
            GTT orders are not blocked against your funds. When triggered, a limit order is placed — it can still be rejected if you don’t have enough funds or
            shares at that time.
          </p>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 px-4 md:px-5 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3 border-t border-gray-100 dark:border-kite-darkBorder">
          <button type="button" onClick={closeGttModal} className="px-4 h-11 md:h-9 rounded border border-gray-300 dark:border-kite-darkBorder">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || uniqueErrors.length > 0}
            className="flex-1 md:flex-none px-5 h-11 md:h-9 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold disabled:opacity-50"
          >
            {editing ? 'Modify GTT' : 'Place GTT'}
          </button>
        </div>
      </form>
    </div>
  );
};
