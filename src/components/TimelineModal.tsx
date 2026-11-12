import React, { useRef, useState } from 'react';
import {
  Calendar,
  Compass,
  Download,
  FolderPlus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { NumberInput } from './NumberInput.tsx';
import { formatINR } from '../utils/format.ts';

export const TimelineModal: React.FC = () => {
  const {
    timelineModalOpen,
    setTimelineModalOpen,
    profile,
    profilesList,
    eras,
    calendarBounds,
    stepTime,
    createNewProfile,
    loadProfile,
    resetCurrentProfile,
    deleteProfile,
    updateProfileMeta,
    exportBackup,
    importBackup,
  } = useSimulatorStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<'ERAS' | 'NEW' | 'PROFILES' | 'SETTINGS'>('ERAS');
  const [jumpDate, setJumpDate] = useState(profile?.currentDate || '2014-02-03');
  const [newName, setNewName] = useState('2008 Crash ₹2L Challenge');
  const [newDate, setNewDate] = useState('2008-01-08');
  const [newCap, setNewCap] = useState(200000);
  const [newBlind, setNewBlind] = useState(false);

  const [resetDate, setResetDate] = useState(profile?.startDate || '2014-02-03');
  const [resetCap, setResetCap] = useState(profile?.startingCapital || 200000);

  if (!timelineModalOpen || !profile) return null;

  const hasTrades = profile.trades.length > 0 || profile.holdings.length > 0;

  const handleEraPick = async (eraDate: string, eraLabel: string) => {
    if (!hasTrades) {
      await stepTime('JUMP', eraDate);
      setTimelineModalOpen(false);
    } else {
      // Offer creating a fresh timeline on that era so current portfolio isn't overwritten unintentionally!
      await createNewProfile({
        name: `${eraLabel.slice(0, 24)} (₹2L)`,
        startDate: eraDate,
        startingCapital: profile.startingCapital || 200000,
        blindMode: profile.blindMode,
      });
    }
  };

  const handleRandomBlindYear = async () => {
    // Pick random date between 2002 and 2022 so user has at least 4 years of runway ahead
    const minTs = new Date('2002-01-02T00:00:00Z').getTime();
    const maxTs = new Date('2022-01-02T00:00:00Z').getTime();
    const randTs = minTs + Math.floor(Math.random() * (maxTs - minTs));
    const randDate = new Date(randTs).toISOString().slice(0, 10);
    await createNewProfile({
      name: `Blind Challenge #${Math.floor(100 + Math.random() * 900)}`,
      startDate: randDate,
      startingCapital: 200000,
      blindMode: true,
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-[1px] md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setTimelineModalOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Time machine and timelines"
        className="w-full max-w-3xl bg-white dark:bg-kite-darkSurface rounded-t-xl md:rounded-md shadow-2xl border border-gray-200 dark:border-kite-darkBorder overflow-hidden flex flex-col max-h-[92dvh] md:max-h-[88vh] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="md:hidden flex justify-center pt-2 bg-slate-50 dark:bg-[#15181e]">
          <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 md:px-5 py-3 md:py-3.5 border-b border-gray-200 dark:border-kite-darkBorder bg-slate-50 dark:bg-[#15181e]">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="w-5 h-5 text-kite-orange shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-800 dark:text-white" data-coach="time-machine">
                25-Year Time-Machine & Simulation Timelines
              </h2>
              <p className="text-[11px] text-kite-muted dark:text-kite-darkMuted">
                Dataset range: {calendarBounds.minDate} to {calendarBounds.maxDate} ({calendarBounds.totalTradingDays.toLocaleString()} NSE/BSE trading sessions)
              </p>
            </div>
          </div>
          <button
            onClick={() => setTimelineModalOpen(false)}
            aria-label="Close"
            className="shrink-0 w-10 h-10 md:w-auto md:h-auto inline-flex items-center justify-center p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500"
          >
            <X className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        </div>

        {/* Sub-nav */}
        <div className="flex shrink-0 overflow-x-auto [scrollbar-width:none] border-b border-gray-200 dark:border-kite-darkBorder px-2 md:px-5 bg-white dark:bg-kite-darkSurface text-xs font-medium">
          {[
            { id: 'ERAS', label: 'Historical Eras & Jump Date', coach: 'eras' },
            { id: 'NEW', label: 'New Timeline / Blind Mode', coach: 'blind-mode' },
            { id: 'PROFILES', label: `Saved Timelines (${profilesList.length})`, coach: 'timelines' },
            { id: 'SETTINGS', label: 'Reset & Auto-Pause Rules', coach: 'auto-pause' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              data-coach={t.coach}
              className={`px-3 md:px-3.5 py-2.5 min-h-[44px] md:min-h-0 whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-kite-orange text-kite-orange font-semibold'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-4 md:p-5 overflow-y-auto overscroll-contain space-y-5 text-xs">
          {tab === 'ERAS' && (
            <>
              {/* Custom Date Jump */}
              <div className="p-3.5 rounded border border-gray-200 dark:border-kite-darkBorder bg-slate-50/70 dark:bg-[#15181e] flex flex-wrap items-end justify-between gap-3">
                <div>
                  <label
                    htmlFor="tl-jump-date"
                    className="block font-semibold text-gray-800 dark:text-gray-200 mb-1"
                    data-tip="Jump to Date :: Moves the simulation to any date in the dataset. Going forward replays every trading day in between (orders, GTTs, SIPs, splits, dividends). :: To go back in time, start a new timeline instead."
                  >
                    Fast-Forward or Jump to Specific Calendar Date
                  </label>
                  <p className="text-[11px] text-kite-muted">
                    Jumping forward evaluates all open GTTs, SIPs, splits, and dividends along the way.
                  </p>
                </div>
                <div className="flex w-full sm:w-auto items-center gap-2">
                  <input
                    id="tl-jump-date"
                    type="date"
                    min={calendarBounds.minDate}
                    max={calendarBounds.maxDate}
                    value={jumpDate}
                    onChange={(e) => setJumpDate(e.target.value)}
                    className="flex-1 sm:flex-none min-w-0 h-10 md:h-auto px-2.5 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-gray-800 dark:text-white font-mono text-xs"
                  />
                  <button
                    onClick={async () => {
                      await stepTime('JUMP', jumpDate);
                      setTimelineModalOpen(false);
                    }}
                    className="h-10 md:h-auto px-3.5 py-1.5 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold whitespace-nowrap"
                    data-tip="Go to Date :: Jumps the clock to the chosen date in this timeline."
                  >
                    Go to Date
                  </button>
                </div>
              </div>

              {/* Random Blind Challenge Banner */}
              <div className="p-3.5 rounded border border-purple-500/30 bg-purple-500/5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-purple-800 dark:text-purple-300" data-coach="blind-mode">
                      Zero-Hindsight Random Blind Year Challenge (₹2,00,000)
                    </div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-400">
                      Drops you into a mystery year (2002–2022) with masked ticker names so you test pure chart reading & risk management!
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleRandomBlindYear}
                  className="w-full sm:w-auto h-10 md:h-auto px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold shrink-0"
                  data-tip="Start Blind Run :: Creates a new ₹2,00,000 timeline on a random date between 2002 and 2022 with names and years hidden. Your current timeline is kept."
                >
                  Start Blind Run
                </button>
              </div>

              {/* Curated Historical Eras Grid */}
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-2.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-kite-orange" />
                  <span data-coach="eras">Iconic Indian Market Eras {hasTrades ? '(launches a fresh ₹2L timeline)' : '(jumps directly)'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {eras.map((era) => (
                    <button
                      key={era.id}
                      onClick={() => handleEraPick(era.date, era.label)}
                      data-tip={`${era.label} :: ${era.description} :: ${hasTrades ? 'You already have trades, so this starts a fresh timeline on ' + era.date + ' (your current one is kept).' : 'Jumps this timeline to ' + era.date + '.'}`}
                      className="text-left p-3 rounded border border-gray-200 dark:border-kite-darkBorder hover:border-kite-orange dark:hover:border-kite-orange bg-white dark:bg-kite-darkBg transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-gray-800 dark:text-gray-100 group-hover:text-kite-orange">
                          {era.label}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          {era.date}
                        </span>
                      </div>
                      <p className="text-[11px] text-kite-muted dark:text-kite-darkMuted leading-relaxed">
                        {era.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'NEW' && (
            <div className="space-y-4 max-w-lg">
              <div>
                <label htmlFor="tl-new-name" className="block font-medium text-gray-700 dark:text-gray-300 mb-1" data-tip="Timeline Name :: A name for this separate simulation so you can find it under Saved Timelines.">Timeline Name</label>
                <input
                  id="tl-new-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-10 px-3 py-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tl-new-date" className="block font-medium text-gray-700 dark:text-gray-300 mb-1" data-tip="Starting Date :: The historical day this timeline begins on. Prices before it are visible on charts; everything after it is the “future” you will live through.">Starting Date</label>
                  <input
                    id="tl-new-date"
                    type="date"
                    min={calendarBounds.minDate}
                    max={calendarBounds.maxDate}
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full h-10 px-3 py-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="tl-new-cap" className="block font-medium text-gray-700 dark:text-gray-300 mb-1" data-coach="start-capital">
                    Starting Capital (₹)
                  </label>
                  <NumberInput
                    id="tl-new-cap"
                    integer
                    min={1000}
                    step={10000}
                    value={newCap}
                    onChange={setNewCap}
                    className="w-full h-10 px-3 py-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[50000, 100000, 200000, 500000, 1000000, 2500000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setNewCap(amt)}
                    className={`min-h-[36px] md:min-h-0 px-2.5 py-1 rounded border text-[11px] font-mono ${
                      newCap === amt
                        ? 'border-kite-blue bg-kite-blue/10 text-kite-blue font-semibold'
                        : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {formatINR(amt, { compact: true })}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 min-h-[40px]" data-coach="blind-mode">
                <input
                  type="checkbox"
                  checked={newBlind}
                  onChange={(e) => setNewBlind(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  Enable <strong>Blind / Anti-Hindsight Mode</strong> (masks year & stock names)
                </span>
              </label>

              <button
                onClick={() =>
                  createNewProfile({
                    name: newName || 'New Practice Account',
                    startDate: newDate,
                    startingCapital: newCap,
                    blindMode: newBlind,
                  })
                }
                className="w-full sm:w-auto justify-center h-10 flex items-center gap-1.5 px-4 py-2 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold"
                data-tip="Create & Switch :: Starts a brand-new timeline with these settings and switches to it. Your other timelines are saved and untouched."
              >
                <FolderPlus className="w-4 h-4" />
                <span>Create & Switch to Timeline</span>
              </button>
            </div>
          )}

          {tab === 'PROFILES' && (
            <div className="space-y-2">
              {profilesList.map((p) => {
                const isCurr = p.id === profile.id;
                return (
                  <div
                    key={p.id}
                    className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded border ${
                      isCurr
                        ? 'border-kite-blue bg-kite-blue/5'
                        : 'border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <span className="break-words min-w-0">{p.name}</span>
                        {isCurr && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-kite-blue text-white">ACTIVE</span>
                        )}
                      </div>
                      <div className="text-[11px] text-kite-muted font-mono mt-0.5">
                        Sim Date: {p.currentDate} · Starting Capital: {formatINR(p.startingCapital, { decimals: 0 })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isCurr && (
                        <button
                          onClick={() => loadProfile(p.id)}
                          className="h-10 md:h-auto px-3 py-1 rounded bg-kite-blue text-white font-semibold hover:bg-kite-blueHover"
                          data-tip="Switch Timeline :: Loads this saved simulation. The current one is saved automatically."
                        >
                          Switch
                        </button>
                      )}
                      {profilesList.length > 1 && (
                        <button
                          onClick={() => deleteProfile(p.id)}
                          className="w-10 h-10 md:w-auto md:h-auto inline-flex items-center justify-center p-1.5 rounded text-gray-400 hover:text-kite-red hover:bg-red-50 dark:hover:bg-red-950/30"
                          aria-label="Delete timeline"
                          data-tip="Delete Timeline :: Permanently removes this timeline and all its trades from this device. :: Export a backup first if you might want it later."
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Backup / restore */}
              <div className="mt-4 p-3.5 rounded border border-gray-200 dark:border-kite-darkBorder bg-slate-50/70 dark:bg-[#15181e] space-y-2.5">
                <div className="font-semibold text-gray-800 dark:text-gray-100" data-coach="offline-backup">
                  Backup & Restore
                </div>
                <p className="text-[11px] text-kite-muted leading-relaxed">
                  Timelines live only on this device. Export a backup file to keep them safe or move them to another phone or computer.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => void exportBackup()}
                    className="h-10 inline-flex items-center justify-center gap-1.5 px-3.5 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold"
                    data-tip="Export Backup :: Saves all your timelines (trades, holdings, settings) to one .json file. On a phone you can share it to Drive, email, etc."
                  >
                    <Download className="w-4 h-4" />
                    Export backup
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 inline-flex items-center justify-center gap-1.5 px-3.5 rounded border border-gray-300 dark:border-kite-darkBorder hover:border-kite-blue font-semibold text-gray-700 dark:text-gray-200"
                    data-tip="Import Backup :: Restores timelines from a backup .json file exported earlier. :: Export the current data first if you’re unsure."
                  >
                    <Upload className="w-4 h-4" />
                    Import backup
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void importBackup(f);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === 'SETTINGS' && (
            <div className="space-y-6">
              {/* Auto-Pause Smart Rules */}
              <div className="p-4 rounded border border-gray-200 dark:border-kite-darkBorder space-y-3">
                <div className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-kite-blue" />
                  <span data-coach="auto-pause">Fast-Forward Smart Auto-Pause Rules</span>
                </div>
                <label
                  className="flex items-center gap-2 cursor-pointer min-h-[40px] md:min-h-0"
                  data-tip="Pause on GTT Trigger :: Auto-Play / fast-forward stops on the day one of your GTTs fires, so you can review what happened."
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 shrink-0"
                    checked={profile.autoPause.pauseOnGttTrigger}
                    onChange={(e) =>
                      updateProfileMeta({
                        autoPause: { ...profile.autoPause, pauseOnGttTrigger: e.target.checked },
                      })
                    }
                  />
                  <span>Automatically pause fast-forward when any GTT order triggers</span>
                </label>
                <label
                  className="flex items-center gap-2 cursor-pointer min-h-[40px] md:min-h-0"
                  data-tip="Pause on Stop-Loss :: Time stops when a stop-loss order executes, so you can decide whether to re-enter or move on."
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 shrink-0"
                    checked={profile.autoPause.pauseOnStopLoss}
                    onChange={(e) =>
                      updateProfileMeta({
                        autoPause: { ...profile.autoPause, pauseOnStopLoss: e.target.checked },
                      })
                    }
                  />
                  <span>Automatically pause fast-forward when a Stop-Loss triggers</span>
                </label>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <label
                    htmlFor="tl-bigmove"
                    data-tip="Pause on Big Move :: Stops fast-forward when any holding rises or falls by at least this % in one day — big moves often come with news worth a look."
                  >
                    Pause when any holding moves in a single day by:
                  </label>
                  <select
                    id="tl-bigmove"
                    value={profile.autoPause.pauseOnBigMovePct}
                    onChange={(e) =>
                      updateProfileMeta({
                        autoPause: { ...profile.autoPause, pauseOnBigMovePct: Number(e.target.value) },
                      })
                    }
                    className="h-10 md:h-auto px-2 py-1 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg"
                  >
                    <option value={0}>Disabled</option>
                    <option value={5}>±5% or more</option>
                    <option value={8}>±8% or more</option>
                    <option value={12}>±12% or more</option>
                  </select>
                </div>
              </div>

              {/* Reset Current Timeline */}
              <div className="p-4 rounded border border-red-300/60 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/10 space-y-3">
                <div className="font-semibold text-kite-red flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4" />
                  <span className="break-words min-w-0">Reset Current Account ({profile.name})</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400">
                  Clears all trades, holdings, and ledger entries in this timeline and restarts cleanly at your chosen date and capital.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <div>
                    <label htmlFor="tl-reset-date" className="block text-[11px] font-medium mb-1" data-tip="Reset Start Date :: The date this timeline restarts from after the reset.">Reset Start Date</label>
                    <input
                      id="tl-reset-date"
                      type="date"
                      min={calendarBounds.minDate}
                      max={calendarBounds.maxDate}
                      value={resetDate}
                      onChange={(e) => setResetDate(e.target.value)}
                      className="w-full h-10 md:h-auto px-2.5 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="tl-reset-cap" className="block text-[11px] font-medium mb-1" data-coach="start-capital">Reset Capital (₹)</label>
                    <NumberInput
                      id="tl-reset-cap"
                    integer
                      min={1000}
                      step={10000}
                      value={resetCap}
                      onChange={setResetCap}
                      className="w-full h-10 md:h-auto px-2.5 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkBg font-mono"
                    />
                  </div>
                </div>
                <button
                  onClick={() =>
                    resetCurrentProfile({
                      startDate: resetDate,
                      startingCapital: resetCap,
                    })
                  }
                  className="w-full sm:w-auto h-10 md:h-auto px-3.5 py-1.5 rounded bg-kite-red hover:opacity-90 text-white font-semibold"
                  data-tip="Reset Timeline :: Wipes all trades, holdings and ledger entries in this timeline and restarts it at the date and capital above. This can’t be undone. :: Export a backup first."
                >
                  Reset Timeline Now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
