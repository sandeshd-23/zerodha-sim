import React, { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CalendarPlus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { NumberInput } from './NumberInput.tsx';
import { getAvailableMargin, getCollateralValue, getUsedMargin } from '../engine/simulationEngine.ts';
import { formatINR } from '../utils/format.ts';

export const FundsView: React.FC = () => {
  const { profile, quotes, adjustFunds, updateProfileMeta, setActiveTab } = useSimulatorStore();

  const [payinAmt, setPayinAmt] = useState(50000);
  const [baseCapInput, setBaseCapInput] = useState(profile?.startingCapital || 200000);
  const [monthlyTopUpInput, setMonthlyTopUpInput] = useState(profile?.monthlyTopUp || 0);

  if (!profile) return null;

  const priceLookup = (s: string) => quotes[s]?.ltp || 0;
  const usedMargin = getUsedMargin(profile);
  const collateral = getCollateralValue(profile, priceLookup);
  const availMargin = getAvailableMargin(profile, priceLookup, true);
  const availCashOnly = getAvailableMargin(profile, priceLookup, false);

  return (
    <div className="p-3 md:p-5 overflow-y-auto h-full bg-white dark:bg-kite-darkSurface space-y-4 md:space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kite-border dark:border-kite-darkBorder pb-4">
        <div>
          <h1 className="text-base font-bold text-gray-800 dark:text-white">
            Funds & Virtual Trading Capital
          </h1>
          <p className="text-[11px] text-kite-muted">
            Default starting balance is <strong>₹2,00,000 (2 Lakh ₹)</strong> — change your base capital, add/withdraw funds, or set an automatic monthly savings deposit anytime!
          </p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <button
            onClick={() => adjustFunds('ADD', payinAmt)}
            className="flex-1 sm:flex-none justify-center min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded bg-kite-green hover:opacity-90 text-white font-semibold shadow-2xs"
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>Add ₹{(payinAmt / 1000).toFixed(0)}k</span>
          </button>
          <button
            onClick={() => adjustFunds('WITHDRAW', payinAmt)}
            className="flex-1 sm:flex-none justify-center min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold shadow-2xs"
          >
            <ArrowDownCircle className="w-4 h-4" />
            <span>Withdraw ₹{(payinAmt / 1000).toFixed(0)}k</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        {/* Authentic Zerodha Equity Margin Statement Table */}
        <div className="rounded border border-kite-border dark:border-kite-darkBorder overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-[#15181e] border-b border-kite-border dark:border-kite-darkBorder font-semibold text-gray-700 dark:text-gray-200">
            Equity & Derivatives Margin Statement
          </div>
          <div className="divide-y divide-gray-100 dark:divide-kite-darkBorder px-3 py-2 md:p-4 space-y-0.5">
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-gray-600 dark:text-gray-300 font-medium" data-coach="available-margin">Available margin (Cash + Collateral)</span>
              <span className="text-lg font-mono font-bold text-kite-blue">{formatINR(availMargin)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-gray-600 dark:text-gray-300 font-medium" data-coach="used-margin">Used margin (Positions & Open Orders)</span>
              <span className="font-mono font-semibold">{formatINR(usedMargin)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-gray-600 dark:text-gray-300 font-medium" data-coach="available-cash">Available cash (For CNC Delivery & Option Buy)</span>
              <span className="font-mono font-semibold text-kite-green">{formatINR(availCashOnly)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 text-kite-muted">
              <span data-coach="settled-cash">Settled ledger cash balance</span>
              <span className="font-mono">{formatINR(profile.availableCash)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 text-kite-muted">
              <span data-coach="start-capital">Configured starting capital</span>
              <span className="font-mono">{formatINR(profile.startingCapital)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 text-kite-muted">
              <span data-tip="Net Capital Deposited :: Starting capital + all pay-ins and monthly top-ups − withdrawals. Your real profit is net worth minus this number.">Total net capital deposited</span>
              <span className="font-mono">{formatINR(profile.netCapitalInvested)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 text-kite-muted">
              <span className="inline-flex items-center gap-1" data-coach="collateral">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                Collateral (Pledged Holdings @ 85% after haircut)
              </span>
              <span className="font-mono text-purple-600 dark:text-purple-300">{formatINR(collateral)}</span>
            </div>
          </div>
          <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-[#15181e] border-t border-kite-border dark:border-kite-darkBorder text-[11px] text-kite-muted flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>Want extra margin for Intraday / F&O without selling holdings?</span>
            <button
              onClick={() => setActiveTab('HOLDINGS')}
              className="min-h-[40px] md:min-h-0 text-kite-blue font-semibold hover:underline"
            >
              Pledge Holdings →
            </button>
          </div>
        </div>

        {/* Capital Controls Panel */}
        <div className="space-y-4">
          {/* 1. Change Fixed Starting Capital */}
          <div className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-slate-50/40 dark:bg-[#15181e] space-y-3">
            <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white">
              <RefreshCw className="w-4 h-4 text-kite-blue" />
              <span data-coach="start-capital">Change Your Fixed Starting Capital (Default ₹2,00,000)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[25000, 50000, 100000, 200000, 500000, 1000000, 2500000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setBaseCapInput(preset)}
                  className={`min-h-[36px] md:min-h-0 px-2.5 py-1 rounded border font-mono text-[11px] ${
                    baseCapInput === preset
                      ? 'border-kite-blue bg-kite-blue/10 text-kite-blue font-semibold'
                      : 'border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface'
                  }`}
                >
                  {formatINR(preset, { compact: true })}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <NumberInput
                integer
                min={1000}
                step={10000}
                value={baseCapInput}
                onChange={setBaseCapInput}
                className="flex-1 min-w-[140px] h-10 px-3 py-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface font-mono text-sm"
              />
              <button
                onClick={() => adjustFunds('SET_STARTING', baseCapInput)}
                className="h-10 px-4 py-2 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold"
              >
                Update Base Capital
              </button>
            </div>
          </div>

          {/* 2. Custom Instant Pay-in / Payout */}
          <div className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-slate-50/40 dark:bg-[#15181e] space-y-3">
            <div className="font-semibold text-gray-800 dark:text-white" data-coach="payin-payout">
              Instant Virtual UPI Pay-In / Bank Withdrawal
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <NumberInput
                integer
                min={1}
                step={5000}
                value={payinAmt}
                onChange={setPayinAmt}
                className="flex-1 min-w-[140px] h-10 px-3 py-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface font-mono text-sm"
              />
              <button
                onClick={() => adjustFunds('ADD', payinAmt)}
                className="h-10 px-3.5 py-2 rounded bg-kite-green text-white font-semibold"
              >
                + Deposit
              </button>
              <button
                onClick={() => adjustFunds('WITHDRAW', payinAmt)}
                className="h-10 px-3.5 py-2 rounded border border-gray-300 dark:border-kite-darkBorder hover:border-kite-red font-semibold"
              >
                - Withdraw
              </button>
            </div>
          </div>

          {/* 3. Recurring Monthly Salary / Savings Top-Up */}
          <div className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-slate-50/40 dark:bg-[#15181e] space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white">
              <CalendarPlus className="w-4 h-4 text-kite-orange" />
              <span data-coach="monthly-topup">Automatic Monthly Savings Top-Up (For Multi-Year SIP Runs)</span>
            </div>
            <p className="text-[11px] text-kite-muted">
              Simulate adding fresh savings from your monthly salary on the 1st trading day of every simulated month (set ₹0 to trade strictly on your fixed lump sum).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <NumberInput
                integer
                min={0}
                step={5000}
                value={monthlyTopUpInput}
                onChange={setMonthlyTopUpInput}
                className="flex-1 min-w-[140px] h-10 px-3 py-2 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface font-mono text-sm"
              />
              <button
                onClick={async () => {
                  await updateProfileMeta({ monthlyTopUp: monthlyTopUpInput });
                  useSimulatorStore
                    .getState()
                    .pushToast(
                      'success',
                      'Monthly Savings Updated',
                      monthlyTopUpInput > 0
                        ? `₹${monthlyTopUpInput.toLocaleString('en-IN')}/month will auto-credit as you fast-forward.`
                        : 'Monthly auto-deposit disabled (strict fixed capital mode).'
                    );
                }}
                className="h-10 px-4 py-2 rounded bg-kite-orange hover:bg-kite-orangeHover text-white font-semibold"
              >
                Save Monthly Rule
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
