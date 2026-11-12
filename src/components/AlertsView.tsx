import React, { useState } from 'react';
import { BarChart2, Bell, BellOff, BellRing, Edit3, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import type { PriceAlert } from '../types/simulator.ts';
import { formatNum, formatPct, getDisplaySymbol } from '../utils/format.ts';
import { ActionSheet, ConfirmDialog, statusPillClass } from './OrderDetailsSheet.tsx';

export function alertConditionLabel(a: PriceAlert): string {
  const op = a.operator === '>=' ? '≥' : '≤';
  if (a.property === 'LTP') return `LTP ${op} ₹${formatNum(a.value)}`;
  return `Day change ${op} ${a.value > 0 ? '+' : ''}${formatNum(a.value)}%`;
}

const ALERT_STATUS_TIPS: Record<PriceAlert['status'], string> = {
  ACTIVE: 'Active :: The alert is armed and checked on every price update.',
  TRIGGERED:
    'Triggered :: The condition was met. A "Once" alert stops after firing — edit or re-enable it to arm it again.',
  DISABLED: 'Disabled :: Paused by you. It will not fire until you enable it again.',
};

type StatusFilter = 'ALL' | PriceAlert['status'];

/** Kite-style price alerts list (Orders → Alerts). */
export const AlertsView: React.FC = () => {
  const { profile, quotes, instrumentsMap, openAlertModal, toggleAlert, deleteAlert, selectSymbol } = useSimulatorStore();
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (!profile) return null;
  const alerts = profile.alerts || [];
  const q = search.trim().toUpperCase();
  const rows = alerts.filter(
    (a) =>
      (filter === 'ALL' || a.status === filter) &&
      (!q ||
        getDisplaySymbol(a.symbol, instrumentsMap, profile.blindMode).toUpperCase().includes(q) ||
        (a.name || '').toUpperCase().includes(q))
  );
  const basketName = (id?: string) => (id ? profile.baskets.find((b) => b.id === id)?.name || 'Deleted basket' : undefined);
  const sym = (s: string) => getDisplaySymbol(s, instrumentsMap, profile.blindMode);

  const distance = (a: PriceAlert) => {
    const quote = quotes[a.symbol];
    if (!quote) return null;
    if (a.property === 'LTP') {
      if (!quote.ltp) return null;
      return { now: `₹${formatNum(quote.ltp)}`, away: ((a.value - quote.ltp) / quote.ltp) * 100 };
    }
    return { now: formatPct(quote.changePct), away: null };
  };

  const sheetAlert = alerts.find((a) => a.id === sheetId);
  const deleteAlertObj = alerts.find((a) => a.id === deleteId);

  const counts = {
    ALL: alerts.length,
    ACTIVE: alerts.filter((a) => a.status === 'ACTIVE').length,
    TRIGGERED: alerts.filter((a) => a.status === 'TRIGGERED').length,
    DISABLED: alerts.filter((a) => a.status === 'DISABLED').length,
  };

  const ToggleIcon = ({ a }: { a: PriceAlert }) =>
    a.status === 'DISABLED' ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search alerts"
          data-tip="Search :: Filter alerts by stock symbol or alert name."
          className="flex-1 min-w-[140px] md:flex-none md:w-56 h-10 md:h-8 px-3 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-xs focus:outline-none focus:border-kite-blue"
        />
        <div className="flex rounded border border-gray-300 dark:border-kite-darkBorder overflow-hidden text-[11px] font-semibold">
          {(['ALL', 'ACTIVE', 'TRIGGERED', 'DISABLED'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              data-tip={f === 'ALL' ? 'All alerts :: Show every alert regardless of status.' : ALERT_STATUS_TIPS[f as PriceAlert['status']]}
              className={`px-2.5 h-10 md:h-8 ${filter === f ? 'bg-kite-blue text-white' : 'text-gray-600 dark:text-gray-300'}`}
            >
              {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()} ({counts[f]})
            </button>
          ))}
        </div>
        <button
          onClick={() => openAlertModal(profile.selectedSymbol || 'RELIANCE')}
          data-tip="New alert :: Get notified when a stock's price (LTP) or day change % crosses a level you choose. :: Optionally attach a basket to make it an Alert Trigger Order (ATO) that places orders automatically. Shortcut: A"
          className="ml-auto inline-flex items-center gap-1 h-10 md:h-8 px-3 rounded bg-kite-blue hover:bg-kite-blueHover text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> New alert
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="py-14 px-4 text-center space-y-2 max-w-lg mx-auto">
          <BellRing className="w-8 h-8 mx-auto text-kite-muted" />
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200">No alerts yet</div>
          <p className="text-xs text-kite-muted leading-relaxed">
            An <strong>alert</strong> watches the market for you: e.g. “tell me when RELIANCE LTP ≥ ₹3,000” or “when NIFTYBEES falls 3% in a day”.
            Choose <strong>Once</strong> (fires one time) or <strong>Every day</strong> (re-arms daily).
          </p>
          <p className="text-xs text-kite-muted leading-relaxed">
            Link a basket to turn it into an <strong>Alert Trigger Order (ATO)</strong> — the basket’s orders are placed automatically the moment the
            alert fires. Great for “buy the dip” plans without staring at the screen.
          </p>
          <button
            onClick={() => openAlertModal(profile.selectedSymbol || 'RELIANCE')}
            className="mt-2 inline-flex items-center gap-1 h-10 px-4 rounded bg-kite-blue text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Create your first alert
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-xs text-kite-muted">No alerts match this filter.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-kite-darkBorder text-kite-muted text-[11px] text-left">
                  <th className="py-2.5 px-2" data-tip="Alert :: The alert's name (or the stock) and the instrument it watches.">Alert</th>
                  <th className="py-2.5 px-2" data-tip="Condition :: What must happen for the alert to fire — LTP (last traded price) or Day change % crossing your value.">Condition</th>
                  <th className="py-2.5 px-2 text-right" data-tip="Now :: The current LTP (or day change %), and how far the price still has to move to hit your alert.">Now</th>
                  <th className="py-2.5 px-2" data-tip="Mode :: Once = fires a single time then stops. Every day = re-arms each trading day (fires at most once per day).">Mode</th>
                  <th className="py-2.5 px-2" data-tip="Alert Trigger Order (ATO) :: A basket of orders placed automatically when the alert fires. :: Zerodha's ATO lets you pre-plan entries/exits around a price level.">ATO basket</th>
                  <th className="py-2.5 px-2" data-tip="Triggered :: How many times this alert has fired and the last date/price it fired at.">Triggered</th>
                  <th className="py-2.5 px-2" data-tip="Status :: Active (armed), Triggered (fired; Once alerts stop here) or Disabled (paused by you).">Status</th>
                  <th className="py-2.5 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                {rows.map((a) => {
                  const d = distance(a);
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="py-2.5 px-2">
                        <div
                          className="font-semibold cursor-pointer hover:text-kite-blue"
                          onClick={() => void selectSymbol(a.symbol, true)}
                        >
                          {sym(a.symbol)}
                        </div>
                        {a.name && <div className="text-[10px] text-kite-muted">{a.name}</div>}
                      </td>
                      <td className="py-2.5 px-2 font-mono">{alertConditionLabel(a)}</td>
                      <td className="py-2.5 px-2 text-right font-mono">
                        {d ? d.now : '—'}
                        {d && d.away !== null && a.status === 'ACTIVE' && (
                          <div className="text-[10px] text-kite-muted">{formatPct(d.away)} away</div>
                        )}
                      </td>
                      <td className="py-2.5 px-2">{a.mode === 'ONE_TIME' ? 'Once' : 'Every day'}</td>
                      <td className="py-2.5 px-2">
                        {a.basketId ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-semibold">
                            <ShoppingBasket className="w-3 h-3" /> {basketName(a.basketId)}
                          </span>
                        ) : (
                          <span className="text-kite-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[11px]">
                        {a.triggerCount > 0 ? (
                          <>
                            {a.triggerCount}×
                            {a.lastTriggeredDate && (
                              <div className="text-[10px] text-kite-muted">
                                {a.lastTriggeredDate}
                                {a.lastTriggeredPrice ? ` @ ₹${formatNum(a.lastTriggeredPrice)}` : ''}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-kite-muted">Never</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <span data-tip={ALERT_STATUS_TIPS[a.status]} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusPillClass(a.status)}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => openAlertModal(a.symbol, a.id)}
                          data-tip="Edit alert :: Change the condition, value, mode or attached basket."
                          className="p-1.5 rounded text-kite-blue hover:bg-blue-50 dark:hover:bg-gray-800"
                          aria-label="Edit alert"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void toggleAlert(a.id)}
                          data-tip={a.status === 'DISABLED' ? 'Enable :: Re-arm this alert so it fires again.' : 'Disable :: Pause this alert without deleting it.'}
                          className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                          aria-label={a.status === 'DISABLED' ? 'Enable alert' : 'Disable alert'}
                        >
                          <ToggleIcon a={a} />
                        </button>
                        <button
                          onClick={() => setDeleteId(a.id)}
                          data-tip="Delete alert :: Remove this alert permanently."
                          className="p-1.5 rounded text-kite-red hover:bg-red-50 dark:hover:bg-gray-800"
                          aria-label="Delete alert"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <div className="md:hidden -mx-3 divide-y divide-gray-100 dark:divide-kite-darkBorder border-y border-gray-100 dark:border-kite-darkBorder">
            {rows.map((a) => {
              const d = distance(a);
              return (
                <button key={a.id} onClick={() => setSheetId(a.id)} className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800/50">
                  <div className="flex items-center justify-between text-[10px] text-kite-muted">
                    <span>
                      {a.mode === 'ONE_TIME' ? 'Once' : 'Every day'}
                      {a.triggerCount > 0 ? ` · fired ${a.triggerCount}×` : ''}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${statusPillClass(a.status)}`}>{a.status}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {sym(a.symbol)}
                      {a.name && <span className="ml-1.5 text-[11px] font-normal text-kite-muted">{a.name}</span>}
                    </span>
                    <span className="font-mono text-[12px]">{alertConditionLabel(a)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-kite-muted">
                    <span>
                      {a.basketId ? (
                        <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-300">
                          <ShoppingBasket className="w-3 h-3" /> ATO: {basketName(a.basketId)}
                        </span>
                      ) : a.lastTriggeredDate ? (
                        `Last: ${a.lastTriggeredDate}${a.lastTriggeredPrice ? ` @ ₹${formatNum(a.lastTriggeredPrice)}` : ''}`
                      ) : (
                        'Not triggered yet'
                      )}
                    </span>
                    <span className="font-mono">
                      {d ? `Now ${d.now}` : ''}
                      {d && d.away !== null && a.status === 'ACTIVE' ? ` (${formatPct(d.away)})` : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <ActionSheet
        open={Boolean(sheetAlert)}
        onClose={() => setSheetId(null)}
        title={sheetAlert ? sym(sheetAlert.symbol) : ''}
        subtitle={sheetAlert ? alertConditionLabel(sheetAlert) : ''}
        actions={
          sheetAlert
            ? [
                { label: 'Edit alert', icon: <Edit3 className="w-4 h-4" />, tone: 'blue', onClick: () => openAlertModal(sheetAlert.symbol, sheetAlert.id) },
                {
                  label: sheetAlert.status === 'DISABLED' ? 'Enable alert' : 'Disable alert',
                  icon: <ToggleIcon a={sheetAlert} />,
                  onClick: () => void toggleAlert(sheetAlert.id),
                },
                { label: 'View chart', icon: <BarChart2 className="w-4 h-4" />, onClick: () => void selectSymbol(sheetAlert.symbol, true) },
                { label: 'Delete alert', icon: <Trash2 className="w-4 h-4" />, tone: 'red', onClick: () => setDeleteId(sheetAlert.id) },
              ]
            : []
        }
      />
      <ConfirmDialog
        open={Boolean(deleteAlertObj)}
        title="Delete alert?"
        message={
          deleteAlertObj ? (
            <>
              Delete the alert <strong>{sym(deleteAlertObj.symbol)}: {alertConditionLabel(deleteAlertObj)}</strong>? This can’t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        onConfirm={() => deleteAlertObj && void deleteAlert(deleteAlertObj.id)}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
};
