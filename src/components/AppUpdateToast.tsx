import React, { useEffect, useState } from 'react';
import { CloudDownload, RefreshCw, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';

const mb = (b: number) => (b / 1048576).toFixed(1);

/**
 * App-level status: new version available (service worker), offline market-data download progress,
 * and an "offline" badge when the device has no connection.
 */
export const AppUpdateToast: React.FC = () => {
  const dataStatus = useSimulatorStore((s) => s.dataStatus);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [hideDownload, setHideDownload] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new version every hour while the app is open
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const downloading = dataStatus.phase === 'downloading' && dataStatus.total > 0 && dataStatus.done < dataStatus.total;
  const pct = dataStatus.bytesTotal ? Math.round((dataStatus.bytesDone / dataStatus.bytesTotal) * 100) : 0;

  return (
    <div className="fixed z-[60] left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+6px)] flex flex-col items-center gap-1.5 pointer-events-none w-[min(94vw,420px)]">
      {!online && (
        <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800/90 text-white text-[11px] font-medium shadow">
          <WifiOff className="w-3 h-3" />
          Offline — simulator keeps working
        </div>
      )}

      {needRefresh && (
        <div className="pointer-events-auto w-full flex items-center gap-2 p-2.5 rounded-md bg-kite-blue text-white text-xs shadow-lg">
          <RefreshCw className="w-4 h-4 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">New version available</div>
            <div className="text-[11px] opacity-90">Reload to get the latest features. Your portfolios are kept.</div>
          </div>
          <button
            onClick={() => updateServiceWorker(true)}
            className="px-2.5 py-1.5 rounded bg-white text-kite-blue font-semibold text-[11px]"
          >
            Reload
          </button>
          <button onClick={() => setNeedRefresh(false)} className="p-1 opacity-80 hover:opacity-100" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {downloading && !hideDownload && (
        <div
          className="pointer-events-auto w-full p-2.5 rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder text-xs shadow-lg"
          data-tip="Offline data download :: The app is saving 25 years of prices for every stock on this device, so it works with no internet (airplane mode, no PC). This happens once; weekly updates are small."
        >
          <div className="flex items-center gap-2">
            <CloudDownload className="w-4 h-4 text-kite-blue shrink-0" />
            <div className="flex-1 font-semibold text-gray-800 dark:text-gray-100">Saving market data for offline use</div>
            <span className="font-mono text-[11px] text-kite-muted">
              {mb(dataStatus.bytesDone)}/{mb(dataStatus.bytesTotal)} MB
            </span>
            <button onClick={() => setHideDownload(true)} className="p-0.5 text-gray-400" aria-label="Hide">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-1.5 h-1.5 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full bg-kite-blue transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {dataStatus.phase === 'error' && (
        <div className="pointer-events-auto w-full p-2.5 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-200 shadow-lg">
          <div className="font-semibold">Market data unavailable</div>
          <div className="text-[11px] mt-0.5">{dataStatus.message}</div>
        </div>
      )}
    </div>
  );
};
