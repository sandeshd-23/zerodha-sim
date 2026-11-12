import type { Instrument } from '../types/simulator.ts';

export function formatINR(value: number, options?: { compact?: boolean; decimals?: number; signed?: boolean }): string {
  const num = Number.isFinite(value) ? value : 0;
  const sign = num < 0 ? '-' : options?.signed && num > 0 ? '+' : '';
  const abs = Math.abs(num);

  if (options?.compact) {
    if (abs >= 1e7) {
      return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    }
    if (abs >= 1e5) {
      return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
    }
    if (abs >= 1e3) {
      return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
    }
  }

  const decimals = options?.decimals ?? 2;
  return `${sign}₹${abs.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatNum(value: number, decimals = 2): string {
  const num = Number.isFinite(value) ? value : 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPct(value: number, signed = true): string {
  const num = Number.isFinite(value) ? value : 0;
  const prefix = signed && num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(2)}%`;
}

export function formatSimDate(isoDate: string, startDate: string, blindMode: boolean): string {
  if (!blindMode) {
    const dt = new Date(isoDate + 'T00:00:00Z');
    return dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  const t0 = new Date(startDate + 'T00:00:00Z').getTime();
  const t1 = new Date(isoDate + 'T00:00:00Z').getTime();
  const totalDays = Math.max(0, Math.round((t1 - t0) / 86400000));
  const year = Math.floor(totalDays / 365) + 1;
  const rem = totalDays % 365;
  const month = Math.floor(rem / 30) + 1;
  const day = (rem % 30) + 1;
  return `Year ${year}, M${month} D${day}`;
}

export function getDisplaySymbol(
  symbol: string,
  instrumentsMap: Record<string, Instrument>,
  blindMode: boolean
): string {
  if (!blindMode) return symbol;
  return instrumentsMap[symbol]?.blindSymbol || symbol;
}

export function getDisplayName(
  symbol: string,
  instrumentsMap: Record<string, Instrument>,
  blindMode: boolean
): string {
  const inst = instrumentsMap[symbol];
  if (!inst) return symbol;
  return blindMode ? inst.blindName : inst.name;
}

export function maskContractDisplay(
  displaySymbol: string,
  underlyingSymbol: string,
  instrumentsMap: Record<string, Instrument>,
  blindMode: boolean
): string {
  if (!blindMode) return displaySymbol;
  const blindSym = getDisplaySymbol(underlyingSymbol, instrumentsMap, true);
  return displaySymbol
    .replace(underlyingSymbol, blindSym)
    .replace(/\b\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, 'EXP');
}
