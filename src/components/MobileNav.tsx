import React from 'react';
import { BarChart2, Briefcase, BookOpen, List, UserCircle2 } from 'lucide-react';
import { useSimulatorStore, type MainNavTab } from '../store/useSimulatorStore.ts';

const PORTFOLIO_TABS: MainNavTab[] = ['HOLDINGS', 'POSITIONS'];
const ACCOUNT_TABS: MainNavTab[] = ['PROFILE', 'DASHBOARD', 'FUNDS', 'CONSOLE', 'SIP_BASKETS'];

/** Kite Android-style bottom navigation (phones only). */
export const MobileNav: React.FC = () => {
  const { profile, activeTab, mobileWatchlistOpen, setActiveTab, setMobileWatchlistOpen } = useSimulatorStore();
  if (!profile) return null;

  const openOrders = profile.orders.filter(
    (o) => o.status === 'OPEN' || o.status === 'TRIGGER PENDING' || o.status === 'AMO REQ RECEIVED'
  ).length;
  const openPositions = profile.positions.filter((p) => p.netQty !== 0).length;

  const items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
    badge?: number;
    onClick: () => void;
    tip: string;
  }> = [
    {
      key: 'wl',
      label: 'Watchlist',
      icon: <List className="w-5 h-5" />,
      active: mobileWatchlistOpen,
      onClick: () => setMobileWatchlistOpen(true),
      tip: 'Watchlist :: Your 7 lists of stocks with live prices. Tap a stock for Buy / Sell / Chart / Depth actions.',
    },
    {
      key: 'chart',
      label: 'Chart',
      icon: <BarChart2 className="w-5 h-5" />,
      active: !mobileWatchlistOpen && activeTab === 'CHART',
      onClick: () => setActiveTab('CHART'),
      tip: 'Chart :: Candlestick chart of the selected stock with indicators, drawings and your trades.',
    },
    {
      key: 'orders',
      label: 'Orders',
      icon: <BookOpen className="w-5 h-5" />,
      active: !mobileWatchlistOpen && activeTab === 'ORDERS',
      badge: openOrders || undefined,
      onClick: () => setActiveTab('ORDERS'),
      tip: 'Orders :: Open and executed orders, trades, GTTs and price alerts.',
    },
    {
      key: 'portfolio',
      label: 'Portfolio',
      icon: <Briefcase className="w-5 h-5" />,
      active: !mobileWatchlistOpen && PORTFOLIO_TABS.includes(activeTab),
      badge: openPositions || undefined,
      onClick: () => setActiveTab(PORTFOLIO_TABS.includes(activeTab) ? activeTab : 'HOLDINGS'),
      tip: 'Portfolio :: Holdings (long-term delivery shares in your Demat) and Positions (today’s intraday / F&O trades).',
    },
    {
      key: 'account',
      label: 'Account',
      icon: <UserCircle2 className="w-5 h-5" />,
      active: !mobileWatchlistOpen && ACCOUNT_TABS.includes(activeTab),
      onClick: () => setActiveTab('PROFILE'),
      tip: 'Account :: Dashboard, Funds, Console reports, SIPs & Baskets, settings, backups and the glossary.',
    },
  ];

  return (
    <nav className="md:hidden shrink-0 border-t border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-14">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            data-tip={it.tip}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              it.active ? 'text-kite-blue' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.badge !== undefined && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-[16px] h-4 px-1 rounded-full bg-kite-orange text-white text-[9px] font-bold flex items-center justify-center">
                {it.badge}
              </span>
            )}
            {it.active && <span className="absolute top-0 left-1/4 right-1/4 h-[2px] rounded-b bg-kite-blue" />}
          </button>
        ))}
      </div>
    </nav>
  );
};

/** Holdings | Positions switcher shown above the portfolio views on phones. */
export const PortfolioSwitch: React.FC = () => {
  const { activeTab, setActiveTab, profile } = useSimulatorStore();
  if (!profile || !PORTFOLIO_TABS.includes(activeTab)) return null;
  const tabs: Array<{ id: MainNavTab; label: string; n: number }> = [
    { id: 'HOLDINGS', label: 'Holdings', n: profile.holdings.length },
    { id: 'POSITIONS', label: 'Positions', n: profile.positions.filter((p) => p.netQty !== 0).length },
  ];
  return (
    <div className="md:hidden flex border-b border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          className={`relative flex-1 py-3 text-xs font-semibold ${
            activeTab === t.id ? 'text-kite-blue' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {t.label} {t.n > 0 && <span className="ml-0.5 text-[10px] opacity-70">({t.n})</span>}
          {activeTab === t.id && <span className="absolute bottom-0 left-6 right-6 h-[2px] bg-kite-blue rounded-t" />}
        </button>
      ))}
    </div>
  );
};
