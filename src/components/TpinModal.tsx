import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';

/** Simulated CDSL e-DIS / TPIN authorisation shown before the first delivery sell of the day. */
export const TpinModal: React.FC = () => {
  const { tpinPrompt, closeTpinPrompt } = useSimulatorStore();
  const [pin, setPin] = useState('');
  if (!tpinPrompt.open) return null;
  const ok = /^\d{6}$/.test(pin);

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
      <div className="w-full md:max-w-sm rounded-t-xl md:rounded-md bg-white dark:bg-kite-darkSurface border border-gray-200 dark:border-kite-darkBorder shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-gray-800 dark:text-gray-100">
            <ShieldCheck className="w-5 h-5 text-emerald-600" /> CDSL authorisation
          </div>
          <button onClick={closeTpinPrompt} className="p-1 text-gray-400" aria-label="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-300 leading-relaxed" data-tip="TPIN / e-DIS :: Since 2020, selling shares from your Demat needs a daily authorisation with your depository (CDSL) using a 6-digit TPIN and OTP. Kite shows this before your first delivery sell of the day. :: In this simulator any 6 digits work — it’s just practice.">
          To sell shares from your demat, CDSL needs a one-time authorisation for today. Enter any 6-digit TPIN (simulated).
        </p>
        <input
          inputMode="numeric"
          autoFocus
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
          className="mt-3 w-full text-center tracking-[0.6em] font-mono text-lg py-2.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-gray-50 dark:bg-kite-darkBg focus:outline-none focus:border-kite-blue"
        />
        <button
          disabled={!ok}
          onClick={() => {
            setPin('');
            tpinPrompt.resume?.();
          }}
          className="mt-3 w-full py-2.5 rounded bg-emerald-600 disabled:opacity-40 text-white font-semibold"
        >
          Authorise &amp; continue
        </button>
        <p className="mt-2 text-[10px] text-kite-muted">You can turn this step off in Account → Settings.</p>
      </div>
    </div>
  );
};
