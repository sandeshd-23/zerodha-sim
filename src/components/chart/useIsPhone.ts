import { useEffect, useState } from 'react';

const PHONE_QUERY = '(max-width: 767px)';

/** True below Tailwind `md` (768px). Updates on resize / rotation. */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setIsPhone(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return isPhone;
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return { ...(typeof fallback === 'object' && fallback !== null ? fallback : {}), ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export function readLocalRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // storage unavailable (private mode / quota) — ignore
  }
}
