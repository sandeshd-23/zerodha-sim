import React, { useRef } from 'react';
import {
  BarChart3,
  BookOpenText,
  CalendarClock,
  CloudDownload,
  Download,
  FileText,
  History,
  LayoutDashboard,
  Moon,
  Sun,
  Upload,
  Wallet,
  BellRing,
  ChevronRight,
} from 'lucide-react';
import { lastBackupAt, useSimulatorStore, type TipMode } from '../store/useSimulatorStore.ts';
import { requestPrefetch, API_MODE } from '../api/client.ts';
import { formatINR } from '../utils/format.ts';

const Section: React.FC<{ title: string; tip?: string; children: React.ReactNode }> = ({ title, tip, children }) => (
  <section className="rounded-md border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
    <h3 className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-kite-muted" data-tip={tip}>
      {title}
    </h3>
    <div className="px-4 pb-4">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; tip?: string; children: React.ReactNode }> = ({ label, tip, children }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0 border-gray-100 dark:border-kite-darkBorder">
    <span className="text-xs text-gray-700 dark:text-gray-200" data-tip={tip}>
      {label}
    </span>
    <div className="shrink-0">{children}</div>
  </div>
);

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded border border-gray-200 dark:border-kite-darkBorder overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1.5 text-[11px] font-semibold border-r last:border-r-0 border-gray-200 dark:border-kite-darkBorder ${
            value === o.value ? 'bg-kite-blue text-white' : 'text-gray-600 dark:text-gray-300 bg-white dark:bg-kite-darkSurface'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className={`relative w-10 h-6 rounded-full transition-colors ${on ? 'bg-kite-blue' : 'bg-gray-300 dark:bg-gray-700'}`}
  >
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

/** Kite-style Profile / Account page: shortcuts, settings, timelines, backups, offline data. */
export const ProfileView: React.FC = () => {
  const s = useSimulatorStore();
  const { profile } = s;
  const fileRef = useRef<HTMLInputElement>(null);
  if (!profile) return null;
  const settings = profile.settings || {};
  const indices = s.instruments.filter((i) => i.isIndex);
  const backupAt = lastBackupAt();
  const initials =
    profile.name
      .split(/\s+/)
      .filter((w) => /[A-Za-z]/.test(w[0] || ''))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || 'ZR';
  const ds = s.dataStatus;

  const links: Array<{ label: string; icon: React.ReactNode; onClick: () => void; tip: string }> = [
    { label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, onClick: () => s.setActiveTab('DASHBOARD'), tip: 'Dashboard :: Net worth, margins, allocation and today’s market movers.' },
    { label: 'Funds', icon: <Wallet className="w-4 h-4" />, onClick: () => s.setActiveTab('FUNDS'), tip: 'Funds :: Add or withdraw virtual money and see your margin statement.' },
    { label: 'Console', icon: <BarChart3 className="w-4 h-4" />, onClick: () => s.setActiveTab('CONSOLE'), tip: 'Console :: Reports — portfolio vs NIFTY, P&L calendar, tax P&L, tradebook and ledger.' },
    { label: 'SIP & Baskets', icon: <CalendarClock className="w-4 h-4" />, onClick: () => s.setActiveTab('SIP_BASKETS'), tip: 'SIP & Baskets :: Automatic monthly/weekly investing and multi-order baskets.' },
    {
      label: 'Alerts',
      icon: <BellRing className="w-4 h-4" />,
      onClick: () => {
        s.setOrdersSubTab('ALERTS');
        s.setActiveTab('ORDERS');
      },
      tip: 'Price alerts :: Get notified (or auto-place a basket) when a stock crosses a price.',
    },
    { label: 'Glossary', icon: <BookOpenText className="w-4 h-4" />, onClick: () => s.openGlossary(), tip: 'Glossary :: Every trading term used in the app, explained in plain English.' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 md:p-5 space-y-3 pb-8">
        {/* User card */}
        <div className="flex items-center gap-3 p-4 rounded-md border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
          <div className="w-12 h-12 rounded-full bg-kite-blue/15 text-kite-blue font-bold flex items-center justify-center">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{profile.name}</div>
            <div className="text-[11px] text-kite-muted">
              Practice account · started {profile.startDate} · capital {formatINR(profile.startingCapital, { decimals: 0 })}
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {['NSE', 'BSE', 'NFO (F&O)', 'MTF'].map((seg) => (
                <span key={seg} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                  {seg}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => s.setTimelineModalOpen(true)}
            className="px-3 py-2 rounded border border-gray-200 dark:border-kite-darkBorder text-xs font-semibold text-kite-blue"
            data-tip="Timelines :: Create a new practice timeline, jump to a historical era, or reset this account."
          >
            Timelines
          </button>
        </div>

        {/* Shortcuts */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {links.map((l) => (
            <button
              key={l.label}
              onClick={l.onClick}
              data-tip={l.tip}
              className="flex flex-col items-center gap-1.5 py-3 rounded-md border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-[11px] font-medium text-gray-700 dark:text-gray-200 active:bg-gray-50"
            >
              <span className="text-kite-blue">{l.icon}</span>
              {l.label}
            </button>
          ))}
        </div>

        <Section title="Settings" tip="Settings :: Preferences are saved with this timeline (theme and tips are saved on this device).">
          <Row label="Theme" tip="Theme :: Daylight white or dark terminal.">
            <button
              onClick={s.toggleTheme}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-gray-200 dark:border-kite-darkBorder text-[11px] font-semibold"
            >
              {s.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {s.theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </Row>
          <Row
            label="Beginner tips"
            tip="Beginner tips :: Hover — hover (or long-press on a phone) to see explanations. Explain — every tap explains instead of acting, great for learning the screen. Off — no tips."
          >
            <Segmented<TipMode>
              value={s.tipMode}
              onChange={s.setTipMode}
              options={[
                { value: 'HOVER', label: 'Hover' },
                { value: 'EXPLAIN', label: 'Explain' },
                { value: 'OFF', label: 'Off' },
              ]}
            />
          </Row>
          <Row label="Default product" tip="Default product :: Pre-selected product when you open a Buy/Sell window. CNC = delivery (long-term), MIS = intraday.">
            <Segmented
              value={settings.defaultProduct || 'CNC'}
              onChange={(v) => s.updateSettings({ defaultProduct: v })}
              options={[
                { value: 'CNC', label: 'CNC' },
                { value: 'MIS', label: 'MIS' },
              ]}
            />
          </Row>
          <Row label="Default order type" tip="Default order type :: MARKET fills now at the best price; LIMIT waits for your price.">
            <Segmented
              value={settings.defaultOrderType || 'MARKET'}
              onChange={(v) => s.updateSettings({ defaultOrderType: v })}
              options={[
                { value: 'MARKET', label: 'Market' },
                { value: 'LIMIT', label: 'Limit' },
              ]}
            />
          </Row>
          <Row label="Watchlist change" tip="Watchlist change :: Show day change as a percentage or in rupees.">
            <Segmented
              value={settings.watchlistChange || 'PCT'}
              onChange={(v) => s.updateSettings({ watchlistChange: v })}
              options={[
                { value: 'PCT', label: '%' },
                { value: 'ABS', label: '₹' },
              ]}
            />
          </Row>
          <Row label="Pinned indices" tip="Pinned indices :: The two indices shown at the top of the app, like Kite’s NIFTY 50 / SENSEX ticker.">
            <div className="flex gap-1.5">
              {[0, 1].map((slot) => (
                <select
                  key={slot}
                  value={profile.pinnedIndices[slot]}
                  onChange={(e) => {
                    const next = [...profile.pinnedIndices] as [string, string];
                    next[slot] = e.target.value;
                    void s.updateProfileMeta({ pinnedIndices: next });
                  }}
                  className="max-w-[130px] px-2 py-1.5 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg text-[11px]"
                >
                  {indices.map((i) => (
                    <option key={i.symbol} value={i.symbol}>
                      {i.symbol}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </Row>
          <Row
            label="CDSL TPIN prompt"
            tip="CDSL authorisation (TPIN) :: In real Kite, selling delivery shares needs a once-a-day CDSL TPIN authorisation. Keep this on to practise that step."
          >
            <Toggle on={settings.tpinPrompt !== false} onChange={(v) => s.updateSettings({ tpinPrompt: v })} label="TPIN prompt" />
          </Row>
          <Row label="Pause auto-play on price alert" tip="Pause on alert :: Stop auto-play when one of your price alerts triggers, so you can react.">
            <Toggle on={settings.pauseOnAlert !== false} onChange={(v) => s.updateSettings({ pauseOnAlert: v })} label="Pause on alert" />
          </Row>
          <Row label="Blind mode" tip="Blind mode :: Hides real years and company names so hindsight can’t help you.">
            <Toggle on={profile.blindMode} onChange={(v) => s.updateProfileMeta({ blindMode: v })} label="Blind mode" />
          </Row>
        </Section>

        <Section
          title="Backup"
          tip="Backup :: Your portfolios live only on this device. Export a backup file now and then (e.g. to Google Drive) so you never lose them."
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => s.exportBackup()}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-kite-blue text-white text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" /> Export backup
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-gray-200 dark:border-kite-darkBorder text-xs font-semibold"
            >
              <Upload className="w-3.5 h-3.5" /> Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void s.importBackup(f);
                e.target.value = '';
              }}
            />
            <span className="text-[11px] text-kite-muted">
              {backupAt ? `Last backup ${new Date(backupAt).toLocaleDateString()}` : 'No backup yet'}
            </span>
          </div>
        </Section>

        <Section title="Offline data" tip="Offline data :: Prices for every stock are stored on this device, so the app works without internet or a PC.">
          <Row label="Prices available through">
            <span className="font-mono text-xs">{s.dataAsOf || '—'}</span>
          </Row>
          <Row label="Instruments">
            <span className="font-mono text-xs">{s.instruments.length}</span>
          </Row>
          {API_MODE === 'worker' && (
            <Row label="Saved on device">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">
                  {ds.total ? `${ds.done}/${ds.total} files` : ds.phase === 'loading' ? 'starting…' : '—'}
                </span>
                {ds.total > 0 && ds.done < ds.total && (
                  <button onClick={requestPrefetch} className="flex items-center gap-1 px-2 py-1 rounded border text-[11px]">
                    <CloudDownload className="w-3.5 h-3.5" /> Download now
                  </button>
                )}
              </div>
            </Row>
          )}
          <Row label="App version">
            <span className="font-mono text-xs">{__APP_VERSION__}</span>
          </Row>
        </Section>

        <Section title="Timelines">
          {s.profilesList.map((p) => (
            <button
              key={p.id}
              onClick={() => p.id !== profile.id && s.loadProfile(p.id)}
              className="w-full flex items-center justify-between gap-2 py-2.5 border-t first:border-t-0 border-gray-100 dark:border-kite-darkBorder text-left"
            >
              <span className="min-w-0">
                <span className={`block text-xs font-semibold truncate ${p.id === profile.id ? 'text-kite-blue' : 'text-gray-800 dark:text-gray-100'}`}>
                  {p.name}
                </span>
                <span className="block text-[11px] text-kite-muted font-mono">{p.currentDate}</span>
              </span>
              {p.id === profile.id ? <span className="text-[10px] text-kite-blue font-semibold">ACTIVE</span> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>
          ))}
          <button
            onClick={() => s.setTimelineModalOpen(true)}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-kite-blue"
          >
            <History className="w-3.5 h-3.5" /> New timeline, jump date or reset
          </button>
        </Section>

        <p className="flex items-start gap-1.5 text-[11px] text-kite-muted px-1">
          <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Practice simulator with virtual money and historical prices (Yahoo Finance). Not affiliated with or endorsed by Zerodha.
        </p>
      </div>
    </div>
  );
};
