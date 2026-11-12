import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { formatNum, formatPct, getDisplayName, getDisplaySymbol } from '../utils/format.ts';
import type { PriceAlert } from '../types/simulator.ts';

type Property = PriceAlert['property'];
type Operator = PriceAlert['operator'];

const round2 = (n: number) => Number(n.toFixed(2));

function defaultValue(property: Property, operator: Operator, ltp: number): number {
  if (property === 'LTP') return round2(operator === '>=' ? ltp * 1.05 : ltp * 0.95);
  return operator === '>=' ? 3 : -3;
}

const inputCls =
  'w-full px-2.5 h-10 md:h-9 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-sm focus:outline-none focus:border-kite-blue';

/** Kite-style price alert: create / edit, with optional Alert Trigger Order (basket). */
export const AlertModal: React.FC = () => {
  const { alertModal, closeAlertModal, profile, quotes, instrumentsMap, saveAlert } = useSimulatorStore();

  const [property, setProperty] = useState<Property>('LTP');
  const [operator, setOperator] = useState<Operator>('>=');
  const [value, setValue] = useState(0);
  const [valueTouched, setValueTouched] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<PriceAlert['mode']>('ONE_TIME');
  const [basketId, setBasketId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const symbol = alertModal.symbol;
  const editing = alertModal.editAlertId ? profile?.alerts?.find((a) => a.id === alertModal.editAlertId) : undefined;

  useEffect(() => {
    if (!alertModal.open || !profile) return;
    const st = useSimulatorStore.getState();
    const ltp = st.quotes[alertModal.symbol]?.ltp || 0;
    const existing = alertModal.editAlertId ? profile.alerts?.find((a) => a.id === alertModal.editAlertId) : undefined;
    if (existing) {
      setProperty(existing.property);
      setOperator(existing.operator);
      setValue(existing.value);
      setValueTouched(true);
      setName(existing.name || '');
      setMode(existing.mode);
      setBasketId(existing.basketId || '');
    } else {
      setProperty('LTP');
      setOperator('>=');
      setValue(defaultValue('LTP', '>=', ltp));
      setValueTouched(false);
      setName('');
      setMode('ONE_TIME');
      setBasketId('');
    }
    // Only when the modal is (re)opened — not on every price tick.
  }, [alertModal.open, alertModal.symbol, alertModal.editAlertId]);

  if (!alertModal.open || !profile) return null;

  const q = quotes[symbol];
  const ltp = q?.ltp || 0;
  const changePct = q?.changePct || 0;
  const baskets = profile.baskets || [];
  const current = property === 'LTP' ? ltp : changePct;

  const changeProperty = (p: Property) => {
    setProperty(p);
    setValue(defaultValue(p, operator, ltp));
    setValueTouched(false);
  };
  const changeOperator = (op: Operator) => {
    setOperator(op);
    if (!valueTouched) setValue(defaultValue(property, op, ltp));
  };

  const valid = Number.isFinite(value) && (property === 'CHANGE_PCT' || value > 0);
  const alreadyTrue = valid && (operator === '>=' ? current >= value : current <= value);
  const distance = property === 'LTP' && ltp > 0 && valid ? ((value - ltp) / ltp) * 100 : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    await saveAlert({
      id: editing?.id,
      symbol,
      property,
      operator,
      value: property === 'LTP' ? round2(value) : Number(value.toFixed(2)),
      mode,
      name: name.trim() || undefined,
      basketId: basketId || undefined,
    });
    setSubmitting(false);
  };

  const seg = (on: boolean) =>
    `flex-1 h-10 md:h-8 rounded border font-semibold text-[11px] ${
      on ? 'border-kite-blue bg-kite-blue/10 text-kite-blue' : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4" onClick={closeAlertModal}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md rounded-t-xl md:rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden text-xs"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 md:px-5 py-3 border-b border-gray-200 dark:border-kite-darkBorder bg-slate-50 dark:bg-[#15181e]">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-kite-blue shrink-0" />
            <div className="font-bold text-sm text-gray-800 dark:text-white">{editing ? 'Modify alert' : 'Create alert'}</div>
          </div>
          <button type="button" onClick={closeAlertModal} className="p-2 -mr-2 rounded hover:bg-gray-200 dark:hover:bg-gray-800" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-5 space-y-4">
          {/* Instrument */}
          <div
            className="flex items-center justify-between gap-3 p-3 rounded bg-slate-50 dark:bg-[#14171d] border border-gray-200/80 dark:border-kite-darkBorder"
            data-tip="Instrument :: The stock, ETF or index this alert watches. To alert on another instrument, open its ⋯ menu in the watchlist (or press A with it selected)."
          >
            <div className="min-w-0">
              <div className="font-semibold text-gray-800 dark:text-white">{getDisplaySymbol(symbol, instrumentsMap, profile.blindMode)}</div>
              <div className="text-[11px] text-kite-muted truncate">{getDisplayName(symbol, instrumentsMap, profile.blindMode)}</div>
            </div>
            <div className="text-right font-mono shrink-0" data-tip="Current values :: Live LTP and today’s change, so you can pick a sensible alert level.">
              <div className={`font-semibold ${changePct >= 0 ? 'text-kite-green' : 'text-kite-red'}`}>{ltp > 0 ? `₹${formatNum(ltp)}` : '—'}</div>
              <div className="text-[10px] text-kite-muted">{formatPct(changePct)}</div>
            </div>
          </div>

          {/* Property */}
          <div>
            <label
              className="block text-[11px] text-kite-muted font-semibold mb-1.5"
              data-tip="Property :: What to watch. LTP — the share price itself. Day change % — how much it has moved today versus yesterday’s close."
            >
              Property
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => changeProperty('LTP')}
                className={seg(property === 'LTP')}
                data-tip="LTP — Last Traded Price :: Alert when the price crosses your level, e.g. “tell me if INFY goes above ₹1,800”."
              >
                LTP
              </button>
              <button
                type="button"
                onClick={() => changeProperty('CHANGE_PCT')}
                className={seg(property === 'CHANGE_PCT')}
                data-tip="Day change % :: Alert on a big daily move, e.g. “tell me if it falls 5% in a day” (enter -5 with ≤)."
              >
                Day change %
              </button>
            </div>
          </div>

          {/* Operator + value */}
          <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
            <div>
              <label
                className="block text-[11px] text-kite-muted font-semibold mb-1.5"
                data-tip="Condition :: ≥ fires when the value rises to or above your number. ≤ fires when it falls to or below it."
              >
                Condition
              </label>
              <div className="flex gap-1">
                {(['>=', '<='] as const).map((op) => (
                  <button key={op} type="button" onClick={() => changeOperator(op)} className={`${seg(operator === op)} w-12 !flex-none text-sm`}>
                    {op === '>=' ? '≥' : '≤'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="text-[11px] text-kite-muted font-semibold"
                  data-tip={
                    property === 'LTP'
                      ? 'Value (₹) :: The price level. Pre-filled 5% away from the current price.'
                      : 'Value (%) :: The day-change percentage, e.g. 3 for +3% or -5 for a 5% fall.'
                  }
                >
                  Value {property === 'LTP' ? '(₹)' : '(%)'}
                </label>
                {distance !== null && (
                  <span className="text-[10px] font-mono text-kite-muted" data-tip="Distance from LTP :: How far your alert level is from the current price.">
                    {distance >= 0 ? '+' : ''}
                    {distance.toFixed(2)}% from LTP
                  </span>
                )}
              </div>
              <input
                type="number"
                inputMode="decimal"
                step={property === 'LTP' ? '0.05' : '0.1'}
                value={Number.isFinite(value) ? value : ''}
                onChange={(e) => {
                  setValue(e.target.value === '' ? NaN : Number(e.target.value));
                  setValueTouched(true);
                }}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          {alreadyTrue && (
            <div className="text-[11px] text-amber-700 dark:text-amber-400">
              This condition is already true right now — the alert will fire on the next time step.
            </div>
          )}

          {/* Name */}
          <div>
            <label
              className="block text-[11px] text-kite-muted font-semibold mb-1.5"
              data-tip="Alert name :: Optional label shown in your alerts list and notification, e.g. “Buy zone” or “Breakout”."
            >
              Name <span className="font-normal opacity-70">(optional)</span>
            </label>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Buy zone"
              className={inputCls}
            />
          </div>

          {/* Mode */}
          <div>
            <label
              className="block text-[11px] text-kite-muted font-semibold mb-1.5"
              data-tip="Frequency :: Once — the alert fires one time and then turns off. Every day — it fires at most once per day and re-arms for the next session."
            >
              Trigger
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode('ONE_TIME')} className={seg(mode === 'ONE_TIME')}>
                Once
              </button>
              <button type="button" onClick={() => setMode('RECURRING')} className={seg(mode === 'RECURRING')}>
                Every day
              </button>
            </div>
          </div>

          {/* Alert Trigger Order */}
          <div>
            <label
              className="block text-[11px] text-kite-muted font-semibold mb-1.5"
              data-tip="Alert Trigger Order (ATO) :: Kite can place a whole basket of orders automatically the moment this alert fires — e.g. buy 3 stocks when NIFTY drops 2%. :: Orders are placed at trigger time and can be rejected if you lack funds then."
            >
              Alert Trigger Order <span className="font-normal opacity-70">(optional)</span>
            </label>
            <select
              value={basketId}
              onChange={(e) => setBasketId(e.target.value)}
              className={`${inputCls} text-xs`}
              disabled={baskets.length === 0}
            >
              <option value="">Only notify me</option>
              {baskets.map((b) => (
                <option key={b.id} value={b.id}>
                  Also place basket: {b.name} ({b.items.length} orders)
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10.5px] text-kite-muted leading-snug">
              {baskets.length === 0
                ? 'Create a basket under SIP & Baskets to auto-place its orders when this alert fires.'
                : basketId
                  ? 'Every order in the selected basket is placed automatically when the alert fires.'
                  : 'Pick a basket to have its orders placed automatically when the alert fires.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 px-4 md:px-5 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3 border-t border-gray-100 dark:border-kite-darkBorder">
          <button type="button" onClick={closeAlertModal} className="px-4 h-11 md:h-9 rounded border border-gray-300 dark:border-kite-darkBorder">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !valid}
            className="flex-1 md:flex-none px-5 h-11 md:h-9 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold disabled:opacity-50"
          >
            {editing ? 'Save alert' : 'Create alert'}
          </button>
        </div>
      </form>
    </div>
  );
};
