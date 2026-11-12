import React, { useEffect, useRef } from 'react';
import { Bell, BellRing, Briefcase, CalendarClock, Info, Target, TrendingUp, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import type { SimulatorNotification } from '../types/simulator.ts';

const ICONS: Record<SimulatorNotification['type'], React.ReactNode> = {
  ORDER: <TrendingUp className="w-3.5 h-3.5 text-kite-blue" />,
  GTT: <Target className="w-3.5 h-3.5 text-kite-orange" />,
  ALERT: <BellRing className="w-3.5 h-3.5 text-amber-500" />,
  CORPORATE_ACTION: <Briefcase className="w-3.5 h-3.5 text-purple-500" />,
  SIP: <CalendarClock className="w-3.5 h-3.5 text-emerald-500" />,
  MARGIN: <Info className="w-3.5 h-3.5 text-kite-red" />,
  INFO: <Info className="w-3.5 h-3.5 text-kite-muted" />,
};

export function unreadCount(notifications: SimulatorNotification[], readAt?: string): number {
  if (!notifications.length) return 0;
  const idx = readAt ? notifications.findIndex((n) => n.id === readAt) : -1;
  return idx < 0 ? (readAt ? notifications.length : Math.min(notifications.length, 9)) : idx;
}

/** Kite-style notification bell: order fills, GTT & alert triggers, SIPs, dividends, splits. */
export const NotificationsBell: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { profile, notificationsOpen, setNotificationsOpen } = useSimulatorStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setNotificationsOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [notificationsOpen, setNotificationsOpen]);

  if (!profile) return null;
  const unread = unreadCount(profile.notifications, profile.notificationsReadAt);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className={`relative flex items-center justify-center rounded border border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
          compact ? 'w-9 h-9' : 'p-1.5'
        }`}
        aria-label="Notifications"
        data-tip="Notifications :: Everything that happened while time moved forward — order fills, GTT and price-alert triggers, SIP instalments, dividends credited and stock splits. :: The red badge counts new ones since you last opened this."
      >
        <Bell className="w-3.5 h-3.5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-kite-red text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div
          ref={panelRef}
          className="fixed md:absolute inset-x-2 md:inset-x-auto md:right-0 top-[calc(env(safe-area-inset-top)+52px)] md:top-full md:mt-2 z-50 md:w-[360px] max-h-[70dvh] flex flex-col rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl text-xs"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-kite-darkBorder">
            <span className="font-semibold text-gray-800 dark:text-gray-100">Notifications</span>
            <button onClick={() => setNotificationsOpen(false)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto divide-y divide-gray-100 dark:divide-kite-darkBorder">
            {profile.notifications.length === 0 && (
              <div className="p-6 text-center text-kite-muted">
                Nothing yet. Place orders, set GTTs or alerts, then move time forward.
              </div>
            )}
            {profile.notifications.slice(0, 80).map((n, i) => (
              <div key={n.id} className={`flex gap-2.5 px-3 py-2.5 ${i < unread ? 'bg-blue-50/50 dark:bg-kite-blue/5' : ''}`}>
                <div className="mt-0.5 shrink-0">{ICONS[n.type] || ICONS.INFO}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800 dark:text-gray-100 truncate">{n.title}</span>
                    <span className="font-mono text-[10px] text-kite-muted shrink-0">{n.date}</span>
                  </div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug mt-0.5">{n.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
