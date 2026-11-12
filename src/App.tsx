import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useSimulatorStore } from './store/useSimulatorStore.ts';
import { TopBar } from './components/TopBar.tsx';
import { Marketwatch } from './components/Marketwatch.tsx';
import { KiteChart } from './components/KiteChart.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { OrdersView } from './components/OrdersView.tsx';
import { HoldingsView } from './components/HoldingsView.tsx';
import { PositionsView } from './components/PositionsView.tsx';
import { SipBasketsView } from './components/SipBasketsView.tsx';
import { FundsView } from './components/FundsView.tsx';
import { ConsoleView } from './components/ConsoleView.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { OrderWindow } from './components/OrderWindow.tsx';
import { GttModal } from './components/GttModal.tsx';
import { AlertModal } from './components/AlertModal.tsx';
import { FnoChainModal } from './components/FnoChainModal.tsx';
import { TimelineModal } from './components/TimelineModal.tsx';
import { OrderDetailsSheet } from './components/OrderDetailsSheet.tsx';
import { GlossarySheet } from './components/GlossarySheet.tsx';
import { TpinModal } from './components/TpinModal.tsx';
import { HoverCoach } from './components/HoverCoach.tsx';
import { MobileNav, PortfolioSwitch } from './components/MobileNav.tsx';
import { AppUpdateToast } from './components/AppUpdateToast.tsx';

/** Keyboard shortcut events consumed by the Marketwatch (search focus, depth, delete). */
export type KiteShortcut = 'focus-search' | 'toggle-depth' | 'remove-selected';
export function emitShortcut(kind: KiteShortcut) {
  window.dispatchEvent(new CustomEvent<KiteShortcut>('kite-shortcut', { detail: kind }));
}

export const App: React.FC = () => {
  const {
    loading,
    profile,
    activeTab,
    mobileWatchlistOpen,
    autoPlaySpeed,
    toasts,
    bootstrap,
    stepTime,
    dismissToast,
    setMobileWatchlistOpen,
  } = useSimulatorStore();

  useEffect(() => {
    bootstrap();
    // Phones open on the watchlist, like the Kite app.
    if (window.matchMedia('(max-width: 767px)').matches) setMobileWatchlistOpen(true);
  }, [bootstrap, setMobileWatchlistOpen]);

  // Auto-Play Time-Machine Loop
  useEffect(() => {
    if (autoPlaySpeed === 'OFF') return;
    const intervalMs =
      autoPlaySpeed === 'INTRADAY_5M' ? 600 : autoPlaySpeed === 'DAY_1S' ? 750 : autoPlaySpeed === 'WEEK_1S' ? 900 : 1050;

    const timer = setInterval(() => {
      const st = useSimulatorStore.getState();
      if (st.stepping || st.autoPlaySpeed === 'OFF') return;
      if (autoPlaySpeed === 'INTRADAY_5M') st.stepTime('5m');
      else if (autoPlaySpeed === 'DAY_1S') st.stepTime('1D');
      else if (autoPlaySpeed === 'WEEK_1S') st.stepTime('1W');
      else if (autoPlaySpeed === 'MONTH_1S') st.stepTime('1M');
    }, intervalMs);

    return () => clearInterval(timer);
  }, [autoPlaySpeed, stepTime]);

  // Kite keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = useSimulatorStore.getState();
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;

      if (e.key === 'Escape') {
        st.closeOrderTicket();
        st.closeGttModal();
        st.closeAlertModal();
        st.closeFnoModal();
        st.closeGlossary();
        st.setOrderDetailsId(null);
        st.setNotificationsOpen(false);
        st.setTimelineModalOpen(false);
        return;
      }

      if (isInput || e.ctrlKey || e.metaKey || e.altKey) return;
      if (st.orderTicket.open || st.gttModal.open || st.alertModal.open || st.fnoModal.open || st.timelineModalOpen) return;

      // Shift + letter: jump to a section (Kite web)
      if (e.shiftKey) {
        const jump: Record<string, Parameters<typeof st.setActiveTab>[0]> = {
          O: 'ORDERS',
          H: 'HOLDINGS',
          P: 'POSITIONS',
          F: 'FUNDS',
          D: 'DASHBOARD',
          C: 'CONSOLE',
        };
        const tab = jump[e.key.toUpperCase()];
        if (tab) {
          e.preventDefault();
          st.setActiveTab(tab);
        }
        return;
      }

      const prof = st.profile;
      if (!prof) return;
      const sym = prof.selectedSymbol;

      if (e.key === '/') {
        e.preventDefault();
        if (window.matchMedia('(max-width: 767px)').matches) st.setMobileWatchlistOpen(true);
        emitShortcut('focus-search');
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const wl = prof.watchlists.find((w) => w.id === prof.activeWatchlistId);
        if (!wl || wl.symbols.length === 0) return;
        e.preventDefault();
        const i = wl.symbols.indexOf(sym);
        const next = e.key === 'ArrowDown' ? Math.min(wl.symbols.length - 1, i + 1) : Math.max(0, i - 1);
        void st.selectSymbol(wl.symbols[i < 0 ? 0 : next], false);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        st.setActiveTab('CHART');
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        emitShortcut('remove-selected');
        return;
      }
      if (/^[1-7]$/.test(e.key)) {
        e.preventDefault();
        void st.setActiveWatchlist(Number(e.key));
        return;
      }

      if (!sym) return;
      const k = e.key.toUpperCase();
      if (k === 'B') {
        e.preventDefault();
        st.openOrderTicket({ side: 'BUY', symbol: sym });
      } else if (k === 'S') {
        e.preventDefault();
        st.openOrderTicket({ side: 'SELL', symbol: sym });
      } else if (k === 'C') {
        e.preventDefault();
        st.setActiveTab('CHART');
      } else if (k === 'G') {
        e.preventDefault();
        st.openGttModal(sym);
      } else if (k === 'F') {
        e.preventDefault();
        st.openFnoModal(sym);
      } else if (k === 'D') {
        e.preventDefault();
        emitShortcut('toggle-depth');
      } else if (k === 'A') {
        e.preventDefault();
        st.openAlertModal(sym);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (loading || !profile) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#f9f9f9] dark:bg-[#121418] gap-3 px-6 text-center">
        <svg width="36" height="24" viewBox="0 0 30 20" fill="none" className="animate-pulse">
          <polygon points="0,10 10,0 20,10 10,20" fill="#ff5722" />
          <polygon points="10,10 20,0 30,10 20,20" fill="#e64a19" opacity="0.88" />
        </svg>
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Loading 25-Year NSE/BSE Historical Market Terminal...</div>
        <AppUpdateToast />
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-kite-bg dark:bg-kite-darkBg text-kite-text dark:text-kite-darkText pt-[env(safe-area-inset-top)]">
      <TopBar />

      {/* Main Split Workspace: Left Marketwatch + Right Active View */}
      <div className="flex flex-1 min-h-0 flex-row overflow-hidden">
        <Marketwatch />

        <main className={`${mobileWatchlistOpen ? 'hidden md:flex' : 'flex'} flex-col flex-1 min-w-0 h-full overflow-hidden`}>
          <PortfolioSwitch />
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === 'CHART' && <KiteChart />}
            {activeTab === 'DASHBOARD' && <DashboardView />}
            {activeTab === 'ORDERS' && <OrdersView />}
            {activeTab === 'HOLDINGS' && <HoldingsView />}
            {activeTab === 'POSITIONS' && <PositionsView />}
            {activeTab === 'SIP_BASKETS' && <SipBasketsView />}
            {activeTab === 'FUNDS' && <FundsView />}
            {activeTab === 'CONSOLE' && <ConsoleView />}
            {activeTab === 'PROFILE' && <ProfileView />}
          </div>
        </main>
      </div>

      <MobileNav />

      {/* Floating Tickets & Modals */}
      <OrderWindow />
      <GttModal />
      <AlertModal />
      <FnoChainModal />
      <TimelineModal />
      <OrderDetailsSheet />
      <GlossarySheet />
      <TpinModal />
      <HoverCoach />
      <AppUpdateToast />

      {/* Notification toasts (above the bottom nav on phones) */}
      <div className="fixed left-2 right-2 md:left-4 md:right-auto bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-4 z-50 flex flex-col gap-2 md:max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 p-3 rounded shadow-lg border bg-white dark:bg-kite-darkSurface border-gray-200 dark:border-kite-darkBorder text-xs"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-kite-green shrink-0 mt-0.5" />
            ) : t.kind === 'error' ? (
              <AlertCircle className="w-4 h-4 text-kite-red shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-kite-blue shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 dark:text-white">{t.title}</div>
              {t.body && <div className="text-[11px] text-kite-muted mt-0.5 leading-snug">{t.body}</div>}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.run();
                    dismissToast(t.id);
                  }}
                  className="mt-1.5 text-[11px] font-semibold text-kite-blue"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-gray-400 hover:text-gray-600 p-0.5" aria-label="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
