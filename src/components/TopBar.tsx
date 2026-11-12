import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Eye,
  EyeOff,
  FastForward,
  HelpCircle,
  MousePointerClick,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import { useSimulatorStore, type AutoPlaySpeed, type MainNavTab } from '../store/useSimulatorStore.ts';
import { formatNum, formatPct, formatSimDate, getDisplaySymbol } from '../utils/format.ts';
import { NotificationsBell } from './NotificationsBell.tsx';

const DAY_STEPS = [
  { mode: '1D', label: '+1 Day' },
  { mode: '1W', label: '+1 Wk' },
  { mode: '1M', label: '+1 Mo' },
  { mode: '6M', label: '+6 Mo' },
  { mode: '1Y', label: '+1 Yr' },
] as const;
const INTRA_STEPS = ['5m', '15m', '1H', '1D'] as const;

const TIP_LABEL = { OFF: 'Tips OFF', HOVER: 'Tips ON', EXPLAIN: 'Explain' } as const;

export const TopBar: React.FC = () => {
  const {
    profile,
    quotes,
    instrumentsMap,
    activeTab,
    mobileWatchlistOpen,
    autoPlaySpeed,
    stepping,
    theme,
    tipMode,
    setActiveTab,
    stepTime,
    toggleIntradayMode,
    setAutoPlaySpeed,
    setTimelineModalOpen,
    selectSymbol,
    openFnoModal,
    toggleTheme,
    toggleHoverTips,
    updateProfileMeta,
  } = useSimulatorStore();
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);

  if (!profile) return null;

  const openOrdersCount = profile.orders.filter(
    (o) => o.status === 'OPEN' || o.status === 'TRIGGER PENDING' || o.status === 'AMO REQ RECEIVED'
  ).length;
  const openPositionsCount = profile.positions.filter((p) => p.netQty !== 0).length;
  const holdingsCount = profile.holdings.length;

  const navItems: Array<{ id: MainNavTab; label: string; badge?: number }> = [
    { id: 'DASHBOARD', label: 'Dashboard' },
    { id: 'CHART', label: 'Chart' },
    { id: 'ORDERS', label: 'Orders', badge: openOrdersCount || undefined },
    { id: 'HOLDINGS', label: 'Holdings', badge: holdingsCount || undefined },
    { id: 'POSITIONS', label: 'Positions', badge: openPositionsCount || undefined },
    { id: 'SIP_BASKETS', label: 'SIP & Baskets' },
    { id: 'FUNDS', label: 'Funds' },
    { id: 'CONSOLE', label: 'Console' },
  ];

  const isPlaying = autoPlaySpeed !== 'OFF';
  const handlePlayToggle = () => {
    if (isPlaying) setAutoPlaySpeed('OFF');
    else setAutoPlaySpeed(profile.intraday.enabled ? 'INTRADAY_5M' : 'WEEK_1S');
  };

  const tipButton = (compact: boolean) => (
    <button
      type="button"
      onClick={toggleHoverTips}
      aria-label="Beginner tips mode"
      className={`flex items-center justify-center gap-1 rounded text-[11px] font-medium border transition-colors ${
        compact ? 'w-9 h-9' : 'px-2 py-1'
      } ${
        tipMode === 'EXPLAIN'
          ? 'bg-kite-blue text-white border-kite-blue'
          : tipMode === 'HOVER'
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300'
            : 'border-gray-200 dark:border-kite-darkBorder text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      data-tip="Beginner Guide (3 modes) :: Tips ON — hover (or long-press on a phone) any button, order type, indicator or column for a plain-English explanation. Explain — every tap explains instead of acting (perfect for learning a new screen on your phone). Tips OFF — hide explanations. :: Tap to cycle Tips ON → Explain → OFF."
    >
      {tipMode === 'EXPLAIN' ? <MousePointerClick className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
      {!compact && <span className="hidden lg:inline">{TIP_LABEL[tipMode]}</span>}
    </button>
  );

  const speedSelect = (
    <select
      value={autoPlaySpeed}
      onChange={(e) => setAutoPlaySpeed(e.target.value as AutoPlaySpeed)}
      className="px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder text-gray-700 dark:text-gray-200 focus:outline-none focus:border-kite-blue"
      data-tip="Auto-Play Replay Speed :: Choose how fast time advances during Auto-Play — from 1 five-minute candle per tick up to 1 full month per second!"
    >
      <option value="OFF">Speed: Manual</option>
      <option value="INTRADAY_5M">Live: 5m candle / tick</option>
      <option value="DAY_1S">Fast: 1 Day / tick</option>
      <option value="WEEK_1S">Faster: 1 Week / tick</option>
      <option value="MONTH_1S">Turbo: 1 Month / tick</option>
    </select>
  );

  const modeToggle = (
    <button
      type="button"
      onClick={() => toggleIntradayMode(!profile.intraday.enabled)}
      className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium border transition-colors ${
        profile.intraday.enabled
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
          : 'bg-white dark:bg-kite-darkSurface border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:border-kite-blue'
      }`}
      data-tip="Investor Mode (EOD) vs Intraday Live (5m) :: Investor Mode lets you fast-forward by Days, Months, or Years for long-term investing. Intraday Live slows down inside a single market day (9:15 AM – 3:30 PM) in 5-minute steps for day-trading!"
    >
      <Clock className="w-3.5 h-3.5" />
      <span>{profile.intraday.enabled ? 'Intraday Live (5m)' : 'Investor Mode (EOD)'}</span>
    </button>
  );

  const stepButtons = (big: boolean) =>
    profile.intraday.enabled ? (
      <div className="flex items-center bg-white dark:bg-kite-darkSurface rounded border border-gray-200 dark:border-kite-darkBorder overflow-hidden">
        {INTRA_STEPS.map((st) => (
          <button
            key={st}
            disabled={stepping}
            onClick={() => stepTime(st)}
            className={`${big ? 'flex-1 py-2.5' : 'px-2.5 py-1'} text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-kite-blue hover:text-white border-r last:border-r-0 border-gray-200 dark:border-kite-darkBorder disabled:opacity-50 transition-colors`}
          >
            +{st}
          </button>
        ))}
      </div>
    ) : (
      <div className="flex items-center bg-white dark:bg-kite-darkSurface rounded border border-gray-200 dark:border-kite-darkBorder overflow-hidden">
        {DAY_STEPS.map((btn) => (
          <button
            key={btn.mode}
            disabled={stepping}
            onClick={() => stepTime(btn.mode)}
            className={`${big ? 'flex-1 py-2.5' : 'px-2.5 py-1'} text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-kite-blue hover:text-white border-r last:border-r-0 border-gray-200 dark:border-kite-darkBorder disabled:opacity-50 transition-colors`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    );

  const dateLabel = formatSimDate(profile.currentDate, profile.startDate, profile.blindMode);

  return (
    <header className="z-30 border-b border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      {/* ===== Phones: one compact row ===== */}
      <div className="md:hidden flex items-center gap-1.5 h-12 px-2">
        <button
          type="button"
          onClick={() => setTimelineModalOpen(true)}
          className="flex items-center gap-1.5 min-w-0 flex-1 px-2 h-9 rounded bg-slate-50 dark:bg-kite-darkBg border border-gray-200 dark:border-kite-darkBorder text-left"
          data-tip="Simulated Historical Date (Time-Machine) :: The past market day you are trading on. Tap to jump to another date or a famous era, start a new timeline, or reset."
        >
          <Calendar className="w-3.5 h-3.5 text-kite-orange shrink-0" />
          <span className="min-w-0">
            <span className="block font-mono font-semibold text-[12px] leading-tight text-gray-800 dark:text-gray-100 truncate">{dateLabel}</span>
            <span className="block text-[10px] leading-tight text-kite-muted font-mono whitespace-nowrap truncate">
              {profile.intraday.timeLabel} · {profile.intraday.enabled ? 'Intraday' : 'Investor'}
            </span>
          </span>
        </button>
        <button
          type="button"
          disabled={stepping}
          onClick={() => stepTime(profile.intraday.enabled ? '5m' : '1D')}
          className="h-9 px-2.5 rounded border border-gray-200 dark:border-kite-darkBorder text-[11px] font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50 shrink-0"
          data-tip={
            profile.intraday.enabled
              ? 'Step +5 minutes :: Moves the market forward one 5-minute candle. Use ⋯ for bigger jumps.'
              : 'Step +1 day :: Moves the market forward to the next trading day. Use ⋯ for weeks, months or years.'
          }
        >
          {profile.intraday.enabled ? '+5m' : '+1D'}
        </button>
        <button
          type="button"
          onClick={handlePlayToggle}
          aria-label={isPlaying ? 'Pause' : 'Auto-play'}
          className={`w-9 h-9 rounded flex items-center justify-center text-white shrink-0 ${isPlaying ? 'bg-kite-orange' : 'bg-kite-blue'}`}
          data-tip="Auto-Play :: Lets time run by itself (speed is set in ⋯). Pauses automatically on your auto-pause rules."
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setTimeSheetOpen(true)}
          aria-label="More time controls"
          className="w-9 h-9 rounded border border-gray-200 dark:border-kite-darkBorder flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0"
          data-tip="More time controls :: Bigger jumps (+1 week / month / year), Investor vs Intraday mode, auto-play speed and historical eras."
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {tipButton(true)}
        <NotificationsBell compact />
      </div>

      {/* Phones: time-machine bottom sheet */}
      {timeSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setTimeSheetOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-xl bg-white dark:bg-kite-darkSurface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">Time machine</span>
              <button onClick={() => setTimeSheetOpen(false)} className="p-1 text-gray-400" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2">{modeToggle}</div>
            {stepButtons(true)}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayToggle}
                className={`flex items-center gap-1 px-3 py-2 rounded text-[11px] font-semibold text-white ${isPlaying ? 'bg-kite-orange' : 'bg-kite-blue'}`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause' : 'Auto-Play'}
              </button>
              {speedSelect}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setTimeSheetOpen(false);
                  setTimelineModalOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded border border-gray-200 dark:border-kite-darkBorder font-semibold"
              >
                <FastForward className="w-3.5 h-3.5 text-kite-orange" /> Eras & jump date
              </button>
              <button
                onClick={() => updateProfileMeta({ blindMode: !profile.blindMode })}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded border border-gray-200 dark:border-kite-darkBorder font-semibold"
              >
                {profile.blindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {profile.blindMode ? 'Blind ON' : 'Blind mode'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Tablets / desktop: Kite header ===== */}
      <div className="hidden md:flex items-center justify-between h-12 px-3 gap-2">
        {/* Left: Pinned Indices (matches Marketwatch column) */}
        <div className="flex items-center gap-3 w-[275px] xl:w-[345px] pr-2 border-r border-kite-border dark:border-kite-darkBorder shrink-0 overflow-hidden">
          {profile.pinnedIndices.map((idxSym) => {
            const q = quotes[idxSym];
            const up = (q?.change ?? 0) >= 0;
            return (
              <div
                key={idxSym}
                role="button"
                className="flex items-center gap-1 text-[11px] xl:text-xs cursor-pointer group whitespace-nowrap"
                onClick={() => selectSymbol(idxSym, true)}
                onDoubleClick={() => openFnoModal(idxSym)}
                data-tip={
                  idxSym === 'NIFTY 50'
                    ? 'NIFTY 50 Market Benchmark :: Tracks India’s top 50 largest NSE companies across 13+ sectors — the main barometer of the Indian stock market. :: Single-click for Chart · Double-click for NIFTY Options Chain · Buy NIFTYBEES ETF to invest in it!'
                    : idxSym === 'SENSEX'
                      ? 'BSE SENSEX Benchmark :: Tracks 30 flagship blue-chip companies on the Bombay Stock Exchange — India’s oldest stock market index. :: Single-click for Chart · Double-click for SENSEX F&O Chain.'
                      : `${idxSym} :: A market index you pinned in Account → Settings. :: Single-click for Chart · Double-click for its F&O chain.`
                }
              >
                <span className="font-semibold text-gray-700 dark:text-gray-200 group-hover:text-kite-blue transition-colors">
                  {getDisplaySymbol(idxSym, instrumentsMap, profile.blindMode)}
                </span>
                <span className={`font-mono font-medium ${up ? 'text-kite-green' : 'text-kite-red'}`}>
                  {q?.available ? formatNum(q.ltp) : '—'}
                </span>
                {q?.available && (
                  <span className="text-[10px] text-kite-muted dark:text-kite-darkMuted font-mono hidden xl:inline">
                    {formatPct(q.changePct)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Center-Right: Logo + Main Nav */}
        <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div
              onClick={() => setActiveTab('DASHBOARD')}
              className="flex items-center gap-1.5 cursor-pointer pr-1 select-none shrink-0"
              title="Kite Historical Simulator"
            >
              <svg width="21" height="15" viewBox="0 0 30 20" fill="none">
                <polygon points="0,10 10,0 20,10 10,20" fill="#ff5722" />
                <polygon points="10,10 20,0 30,10 20,20" fill="#e64a19" opacity="0.88" />
              </svg>
              <span className="font-bold text-sm tracking-tight text-gray-800 dark:text-white hidden xl:inline">kite</span>
            </div>

            <nav className="flex items-center overflow-x-auto no-scrollbar min-w-0 flex-1">
              {navItems.map((item) => {
                const active = !mobileWatchlistOpen && activeTab === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`relative px-2 xl:px-2.5 py-3.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active ? 'text-kite-orange font-semibold' : 'text-gray-600 dark:text-gray-300 hover:text-kite-orange'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                          active ? 'bg-kite-orange/15 text-kite-orange' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-kite-orange rounded-t" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {tipButton(false)}

            <button
              type="button"
              onClick={() => updateProfileMeta({ blindMode: !profile.blindMode })}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                profile.blindMode
                  ? 'bg-purple-600/10 border-purple-500/40 text-purple-600 dark:text-purple-300'
                  : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              data-tip="Blind Practice Mode (Zero Hindsight) :: Hides the real calendar year and masks company names (e.g., RELIANCE → ENER-01) so you practice pure chart & risk discipline without already knowing which stocks became famous winners!"
            >
              {profile.blindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{profile.blindMode ? 'Blind ON' : 'Blind'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded border border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              data-tip="Light / Dark Theme :: Switch between classic Zerodha Kite Daylight White and Dark Terminal mode."
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <NotificationsBell />

            <button
              type="button"
              onClick={() => setActiveTab('PROFILE')}
              className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                activeTab === 'PROFILE'
                  ? 'border-kite-blue text-kite-blue'
                  : 'border-gray-200 dark:border-kite-darkBorder hover:border-kite-blue text-gray-700 dark:text-gray-200'
              }`}
              data-tip="Profile & Settings :: Your account page — settings (default product, pinned indices, TPIN prompt…), backups, saved timelines and offline data status."
            >
              <span className="w-5 h-5 rounded-full bg-kite-blue/15 text-kite-blue font-bold text-[10px] flex items-center justify-center">ZR</span>
              <span className="max-w-[110px] truncate hidden lg:inline">{profile.name}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tablets / desktop: Time-Machine strip */}
      <div className="hidden md:flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-50/90 dark:bg-[#15181e] border-t border-kite-border dark:border-kite-darkBorder text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setTimelineModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder hover:border-kite-orange text-gray-800 dark:text-gray-100 font-semibold shadow-2xs transition-colors"
            data-tip="Simulated Historical Date (Time-Machine) :: Shows the exact past market day you are currently trading on! Click to travel back to any date between 2000 and 2026, or pick famous eras like the 2008 Crash or 2020 COVID Crash."
          >
            <Calendar className="w-3.5 h-3.5 text-kite-orange" />
            <span className="font-mono">{dateLabel}</span>
            <span className="text-[11px] font-mono text-kite-muted dark:text-kite-darkMuted border-l border-gray-200 dark:border-gray-700 pl-1.5">
              {profile.intraday.timeLabel} IST
            </span>
          </button>
          {modeToggle}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {stepButtons(false)}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePlayToggle}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold text-white shadow-2xs transition-colors ${
                isPlaying ? 'bg-kite-orange hover:bg-kite-orangeHover' : 'bg-kite-blue hover:bg-kite-blueHover'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Auto-Play'}</span>
            </button>
            {speedSelect}
            <button
              type="button"
              onClick={() => setTimelineModalOpen(true)}
              className="p-1.5 rounded bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:border-kite-orange transition-colors"
              data-tip="Historical Market Eras & Date Jump :: Jump straight to famous market moments (2003 Bull Run, 2008 Financial Crisis, 2020 COVID Crash) to test how you would react!"
            >
              <FastForward className="w-3.5 h-3.5 text-kite-orange" />
            </button>
            <button
              type="button"
              onClick={() => setTimelineModalOpen(true)}
              className="p-1.5 rounded bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:border-kite-blue transition-colors"
              data-tip="Simulator Settings & Auto-Pause Rules :: Change your starting capital, create a new timeline, or tell Auto-Play to automatically pause whenever a Limit/GTT order fills or a holding moves sharply."
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
