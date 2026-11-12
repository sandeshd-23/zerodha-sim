import React, { useState } from 'react';
import {
  CalendarClock,
  Pause,
  Play,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import type { BasketItem, SipAllocation } from '../types/simulator.ts';
import { calculateRequiredMargin, calculateZerodhaCharges } from '../engine/charges.ts';
import { formatINR, getDisplaySymbol } from '../utils/format.ts';

export const SipBasketsView: React.FC = () => {
  const {
    profile,
    instruments,
    instrumentsMap,
    quotes,
    saveSip,
    toggleSip,
    deleteSip,
    saveBasket,
    deleteBasket,
    executeBasket,
  } = useSimulatorStore();

  const [subTab, setSubTab] = useState<'SIP' | 'BASKETS'>('SIP');

  // SIP Builder State
  const [sipName, setSipName] = useState('Monthly Core Index + Gold SIP');
  const [sipFreq, setSipFreq] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');
  const [sipDay, setSipDay] = useState(5);
  const [sipAllocs, setSipAllocs] = useState<SipAllocation[]>([
    { symbol: 'NIFTYBEES', mode: 'AMOUNT', value: 8000 },
    { symbol: 'JUNIORBEES', mode: 'AMOUNT', value: 4000 },
    { symbol: 'GOLDBEES', mode: 'AMOUNT', value: 3000 },
  ]);
  const [newAllocSym, setNewAllocSym] = useState('HDFCBANK');
  const [newAllocAmt, setNewAllocAmt] = useState(5000);

  // Basket Builder State
  const [basketName, setBasketName] = useState('Diversified Bluechip Starter Basket');
  const [basketItems, setBasketItems] = useState<BasketItem[]>([]);
  const [bSym, setBSym] = useState('RELIANCE');
  const [bSide, setBSide] = useState<'BUY' | 'SELL'>('BUY');
  const [bProduct, setBProduct] = useState<'CNC' | 'MIS'>('CNC');
  const [bQty, setBQty] = useState(10);

  if (!profile) return null;

  const tradableEquities = instruments.filter((i) => !i.isIndex);

  const handleCreateSip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sipAllocs.length === 0) return;
    await saveSip({
      id: '',
      name: sipName || 'Custom Stock SIP',
      frequency: sipFreq,
      dayOfMonth: sipDay,
      status: 'ACTIVE',
      allocations: sipAllocs,
      createdDate: profile.currentDate,
      totalInvested: 0,
      installmentsExecuted: 0,
    });
  };

  const addItemToDraftBasket = () => {
    const q = quotes[bSym];
    const price = q?.ltp || 500;
    const item: BasketItem = {
      id: `bi_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      side: bSide,
      symbol: bSym,
      exchange: 'NSE',
      product: bProduct,
      orderType: 'MARKET',
      qty: Math.max(1, bQty),
      price,
      triggerPrice: 0,
      instrumentType: 'EQ',
      contractKey: bSym,
      displaySymbol: bSym,
      lotSize: 1,
    };
    setBasketItems([...basketItems, item]);
  };

  const handleSaveBasket = async () => {
    if (basketItems.length === 0) return;
    await saveBasket({
      id: '',
      name: basketName || 'Order Basket',
      createdAt: profile.currentDate,
      items: basketItems,
    });
    setBasketItems([]);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-kite-darkSurface overflow-y-auto">
      {/* Sub-navigation */}
      <div className="flex items-center px-2 md:px-5 border-b border-kite-border dark:border-kite-darkBorder text-xs font-medium overflow-x-auto [scrollbar-width:none] shrink-0">
        <button
          onClick={() => setSubTab('SIP')}
          className={`px-3 md:px-4 py-3 min-h-[44px] whitespace-nowrap border-b-2 transition-colors ${
            subTab === 'SIP'
              ? 'border-kite-orange text-kite-orange font-semibold'
              : 'border-transparent text-gray-600 dark:text-gray-400'
          }`}
        >
          Automated Stock & ETF SIPs ({profile.sips.length})
        </button>
        <button
          onClick={() => setSubTab('BASKETS')}
          className={`px-3 md:px-4 py-3 min-h-[44px] whitespace-nowrap border-b-2 transition-colors ${
            subTab === 'BASKETS'
              ? 'border-kite-orange text-kite-orange font-semibold'
              : 'border-transparent text-gray-600 dark:text-gray-400'
          }`}
        >
          Order Baskets ({profile.baskets.length})
        </button>
      </div>

      <div className="p-3 md:p-5 space-y-4 md:space-y-6 text-xs">
        {subTab === 'SIP' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {/* Create SIP Form */}
            <form
              onSubmit={handleCreateSip}
              className="p-3.5 md:p-5 rounded border border-kite-border dark:border-kite-darkBorder bg-slate-50/50 dark:bg-[#15181e] space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <div className="flex items-center gap-2 font-bold text-sm text-gray-800 dark:text-white">
                  <CalendarClock className="w-4 h-4 text-kite-blue" />
                  <span data-coach="sip">Create Automated Stock / ETF SIP</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSipName('Bluechip Compounders ₹15k/mo');
                    setSipAllocs([
                      { symbol: 'HDFCBANK', mode: 'AMOUNT', value: 5000 },
                      { symbol: 'TCS', mode: 'AMOUNT', value: 5000 },
                      { symbol: 'RELIANCE', mode: 'AMOUNT', value: 5000 },
                    ]);
                  }}
                  className="inline-flex items-center gap-1 min-h-[40px] md:min-h-0 text-[11px] text-kite-blue hover:underline"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Load Bluechip Template</span>
                </button>
              </div>

              <p className="text-[11px] text-kite-muted leading-relaxed">
                Schedule recurring CNC Delivery investments. As you click <strong>+1 Mo</strong> or <strong>+1 Yr</strong> (or Auto-Play), your SIP executes automatically every month! Pair with a Monthly Savings Top-Up in the <strong>Funds</strong> tab to simulate investing from monthly salary over 10–20 years.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="sip-name" className="block text-[11px] font-medium mb-1" data-tip="SIP Name :: A label for this plan so you can recognise it later, e.g. “Retirement NIFTY SIP”.">SIP Name</label>
                  <input
                    id="sip-name"
                    type="text"
                    value={sipName}
                    onChange={(e) => setSipName(e.target.value)}
                    className="w-full h-10 md:h-auto px-3 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                  />
                </div>
                <div>
                  <label htmlFor="sip-freq" className="block text-[11px] font-medium mb-1" data-tip="SIP Frequency :: How often the SIP buys. Monthly runs on the chosen day (or the next trading day if it’s a holiday); weekly runs once every week. :: Monthly suits salary-style investing.">Frequency</label>
                  <select
                    id="sip-freq"
                    value={sipFreq}
                    onChange={(e) => setSipFreq(e.target.value as 'MONTHLY' | 'WEEKLY')}
                    className="w-full h-10 md:h-auto px-2.5 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                  >
                    <option value="MONTHLY">Monthly (Day {sipDay})</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </div>
              </div>

              {/* Add stock to SIP */}
              <div className="flex flex-wrap items-end gap-2 pt-1">
                <div className="flex-1 min-w-[160px]">
                  <label htmlFor="sip-sym" className="block text-[11px] font-medium mb-1" data-tip="Add Stock / ETF :: Choose what this SIP buys. Add several to split one instalment across stocks/ETFs. :: An index ETF like NIFTYBEES is the simplest diversified SIP.">Add Stock / ETF</label>
                  <select
                    id="sip-sym"
                    value={newAllocSym}
                    onChange={(e) => setNewAllocSym(e.target.value)}
                    className="w-full h-10 md:h-auto px-2.5 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                  >
                    {tradableEquities.map((i) => (
                      <option key={i.symbol} value={i.symbol}>
                        {getDisplaySymbol(i.symbol, instrumentsMap, profile.blindMode)} — {i.sector}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-32">
                  <label htmlFor="sip-amt" className="block text-[11px] font-medium mb-1" data-tip="Instalment Amount :: Rupees invested in this stock every instalment. The simulator buys as many whole shares as this amount allows (CNC delivery). :: If one share costs more than the amount, nothing is bought that time.">Amount (₹)</label>
                  <input
                    id="sip-amt"
                    type="number"
                    min={500}
                    step={500}
                    value={newAllocAmt}
                    onChange={(e) => setNewAllocAmt(Number(e.target.value))}
                    className="w-full h-10 md:h-auto px-2.5 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (sipAllocs.some((a) => a.symbol === newAllocSym)) return;
                    setSipAllocs([...sipAllocs, { symbol: newAllocSym, mode: 'AMOUNT', value: newAllocAmt }]);
                  }}
                  className="w-full sm:w-auto h-10 md:h-auto px-3 py-1.5 rounded border border-kite-blue text-kite-blue font-semibold hover:bg-kite-blue/10"
                  data-tip="Add Leg :: Adds the chosen stock and amount to this SIP. Each leg is bought separately on every instalment."
                >
                  + Add Leg
                </button>
              </div>

              {/* Allocations list */}
              <div className="divide-y divide-gray-200 dark:divide-kite-darkBorder rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
                {sipAllocs.map((a, idx) => (
                  <div key={a.symbol} className="flex items-center justify-between px-3 py-2">
                    <span className="font-semibold">
                      {getDisplaySymbol(a.symbol, instrumentsMap, profile.blindMode)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-700 dark:text-gray-200">
                        {formatINR(a.value, { decimals: 0 })} / {sipFreq === 'MONTHLY' ? 'mo' : 'wk'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSipAllocs(sipAllocs.filter((_, i) => i !== idx))}
                        className="w-9 h-9 md:w-auto md:h-auto inline-flex items-center justify-center text-gray-400 hover:text-kite-red"
                        aria-label="Remove leg"
                        data-tip="Remove Leg :: Removes this stock from the SIP draft."
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span
                  className="font-mono text-kite-muted"
                  data-tip="Total per Instalment :: Sum of all legs — the cash each SIP run needs. If your cash is short on the run day, that instalment is skipped. :: Add a Monthly Savings Top-Up in Funds so long SIP runs never run dry."
                >
                  Total per installment:{' '}
                  <strong className="text-gray-800 dark:text-white">
                    {formatINR(
                      sipAllocs.reduce((acc, a) => acc + a.value, 0),
                      { decimals: 0 }
                    )}
                  </strong>
                </span>
                <button
                  type="submit"
                  data-tip="Activate SIP :: Saves the schedule. It runs automatically as you move time forward with the Time Machine or Auto-Play."
                  className="w-full sm:w-auto h-10 px-4 py-2 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold"
                >
                  Activate SIP Schedule
                </button>
              </div>
            </form>

            {/* Active SIPs List */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-gray-800 dark:text-white">
                Your Scheduled SIPs ({profile.sips.length})
              </h3>
              {profile.sips.length === 0 ? (
                <div className="p-8 rounded border border-dashed border-gray-300 dark:border-kite-darkBorder text-center text-kite-muted">
                  No active SIP schedules yet. Activate the template on the left and fast-forward 5 years!
                </div>
              ) : (
                profile.sips.map((sip) => (
                  <div
                    key={sip.id}
                    className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-gray-800 dark:text-white break-words">{sip.name}</span>
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            sip.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-kite-green'
                              : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                          }`}
                        >
                          {sip.status} · {sip.frequency}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleSip(sip.id)}
                          className="w-10 h-10 md:w-auto md:h-auto inline-flex items-center justify-center p-1.5 rounded border border-gray-200 dark:border-kite-darkBorder hover:border-kite-blue"
                          aria-label={sip.status === 'ACTIVE' ? 'Pause SIP' : 'Resume SIP'}
                          data-tip={
                            sip.status === 'ACTIVE'
                              ? 'Pause SIP :: Stops future instalments without deleting the plan or its history.'
                              : 'Resume SIP :: Restarts instalments from the next scheduled date.'
                          }
                        >
                          {sip.status === 'ACTIVE' ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-kite-blue" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteSip(sip.id)}
                          className="w-10 h-10 md:w-auto md:h-auto inline-flex items-center justify-center p-1.5 rounded border border-gray-200 dark:border-kite-darkBorder hover:border-kite-red text-kite-red"
                          aria-label="Delete SIP"
                          data-tip="Delete SIP :: Removes this schedule. Shares already bought stay in your Holdings."
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {sip.allocations.map((a) => (
                        <span
                          key={a.symbol}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-gray-800 font-mono text-[11px]"
                        >
                          {getDisplaySymbol(a.symbol, instrumentsMap, profile.blindMode)}:{' '}
                          {formatINR(a.value, { decimals: 0 })}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-kite-muted font-mono pt-1 border-t border-gray-100 dark:border-kite-darkBorder">
                      <span data-tip="Instalments Run :: How many times this SIP has executed so far.">Installments run: {sip.installmentsExecuted}</span>
                      <span data-tip="Total Invested :: Total money this SIP has put in (cost, not current value). Check Holdings for today’s value.">Total Invested: {formatINR(sip.totalInvested, { decimals: 0 })}</span>
                      <span>Last run: {sip.lastRunDate || 'Pending next step'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* BASKETS TAB */
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            <div className="p-3.5 md:p-5 rounded border border-kite-border dark:border-kite-darkBorder bg-slate-50/50 dark:bg-[#15181e] space-y-4">
              <div className="flex items-center gap-2 font-bold text-sm text-gray-800 dark:text-white">
                <ShoppingBag className="w-4 h-4 text-kite-orange" />
                <span data-coach="basket-order">Create Multi-Order Basket</span>
              </div>

              <div>
                <label htmlFor="bk-name" className="block text-[11px] font-medium mb-1" data-tip="Basket Name :: A label for this group of orders, e.g. “Monthly rebalance”.">Basket Name</label>
                <input
                  id="bk-name"
                  type="text"
                  value={basketName}
                  onChange={(e) => setBasketName(e.target.value)}
                  className="w-full h-10 md:h-auto px-3 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <div className="col-span-2">
                  <label htmlFor="bk-sym" className="block text-[11px] font-medium mb-1" data-tip="Instrument :: The stock or ETF for this order in the basket.">Instrument</label>
                  <select
                    id="bk-sym"
                    value={bSym}
                    onChange={(e) => setBSym(e.target.value)}
                    className="w-full h-10 md:h-auto px-2 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                  >
                    {tradableEquities.map((i) => (
                      <option key={i.symbol} value={i.symbol}>
                        {getDisplaySymbol(i.symbol, instrumentsMap, profile.blindMode)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bk-side" className="block text-[11px] font-medium mb-1" data-tip="Side :: BUY to purchase, SELL to sell shares you hold (CNC) or short-sell intraday (MIS).">Side</label>
                  <select
                    id="bk-side"
                    value={bSide}
                    onChange={(e) => setBSide(e.target.value as 'BUY' | 'SELL')}
                    className="w-full h-10 md:h-auto px-2 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bk-product" className="block text-[11px] font-medium mb-1" data-tip="Product :: CNC = delivery, paid fully in cash, held as long as you like. MIS = intraday with leverage; must be closed the same day. :: Beginners: stick to CNC.">Product</label>
                  <select
                    id="bk-product"
                    value={bProduct}
                    onChange={(e) => setBProduct(e.target.value as 'CNC' | 'MIS')}
                    className="w-full h-10 md:h-auto px-2 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface"
                  >
                    <option value="CNC">CNC</option>
                    <option value="MIS">MIS</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bk-qty" className="block text-[11px] font-medium mb-1" data-tip="Quantity :: Number of shares for this order.">Qty</label>
                  <input
                    id="bk-qty"
                    type="number"
                    min={1}
                    value={bQty}
                    onChange={(e) => setBQty(Number(e.target.value))}
                    className="w-full h-10 md:h-auto px-2 py-1.5 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface font-mono"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={addItemToDraftBasket}
                className="w-full sm:w-auto justify-center h-10 md:h-auto inline-flex items-center gap-1 px-3 py-1.5 rounded border border-kite-blue text-kite-blue font-semibold hover:bg-kite-blue/10"
                data-tip="Add Order to Draft :: Adds this order to the basket below. Nothing is placed until you Execute the saved basket."
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Order to Draft Basket</span>
              </button>

              {basketItems.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="divide-y divide-gray-200 dark:divide-kite-darkBorder rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface">
                    {basketItems.map((it, idx) => {
                      const ltp = quotes[it.symbol]?.ltp || it.price;
                      const m = calculateRequiredMargin({
                        side: it.side,
                        product: it.product,
                        instrumentType: 'EQ',
                        qty: it.qty,
                        price: ltp,
                      });
                      return (
                        <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div>
                            <span
                              className={`mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                it.side === 'BUY'
                                  ? 'bg-kite-blue/15 text-kite-blue'
                                  : 'bg-kite-orange/15 text-kite-orange'
                              }`}
                            >
                              {it.side}
                            </span>
                            <span className="font-semibold">
                              {getDisplaySymbol(it.symbol, instrumentsMap, profile.blindMode)}
                            </span>
                            <span className="ml-2 text-kite-muted font-mono">
                              {it.product} × {it.qty}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono">
                            <span>{formatINR(m)}</span>
                            <button
                              onClick={() => setBasketItems(basketItems.filter((_, i) => i !== idx))}
                              className="w-9 h-9 md:w-auto md:h-auto inline-flex items-center justify-center text-gray-400 hover:text-kite-red"
                              aria-label="Remove order"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className="font-mono text-kite-muted"
                      data-tip="Estimated Total Margin :: Money needed to place every order in the basket at current prices, including estimated charges. CNC buys need the full value; MIS needs only the intraday margin." data-coach="margin"
                    >
                      Est. Total Margin:{' '}
                      <strong className="text-gray-800 dark:text-white">
                        {formatINR(
                          basketItems.reduce(
                            (acc, it) =>
                              acc +
                              calculateRequiredMargin({
                                side: it.side,
                                product: it.product,
                                instrumentType: 'EQ',
                                qty: it.qty,
                                price: quotes[it.symbol]?.ltp || it.price,
                              }) +
                              calculateZerodhaCharges({
                                side: it.side,
                                exchange: 'NSE',
                                product: it.product,
                                instrumentType: 'EQ',
                                qty: it.qty,
                                price: quotes[it.symbol]?.ltp || it.price,
                              }).totalCharges,
                            0
                          )
                        )}
                      </strong>
                    </span>
                    <button
                      onClick={handleSaveBasket}
                      className="w-full sm:w-auto h-10 px-4 py-2 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold"
                    >
                      Save Basket
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Saved Baskets */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-gray-800 dark:text-white">
                Saved Baskets ({profile.baskets.length})
              </h3>
              {profile.baskets.length === 0 ? (
                <div className="p-8 rounded border border-dashed border-gray-300 dark:border-kite-darkBorder text-center text-kite-muted">
                  Build a multi-stock basket on the left to execute up to 20 orders in one click!
                </div>
              ) : (
                profile.baskets.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded border border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-gray-800 dark:text-white break-words min-w-0">
                        {b.name} ({b.items.length} orders)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => executeBasket(b.id)}
                          className="h-10 md:h-auto px-3 py-1 rounded bg-kite-blue hover:bg-kite-blueHover text-white font-semibold"
                          data-tip="Execute All :: Places every order in this basket at market price right now (charges apply to each order). :: Check you have enough margin first."
                        >
                          Execute All
                        </button>
                        <button
                          onClick={() => deleteBasket(b.id)}
                          className="w-10 h-10 md:w-auto md:h-auto inline-flex items-center justify-center p-1 text-kite-red hover:bg-red-50 dark:hover:bg-gray-800 rounded"
                          aria-label="Delete basket"
                          data-tip="Delete Basket :: Removes this saved basket. Orders already executed are not affected."
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {b.items.map((it) => (
                        <span
                          key={it.id}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-gray-800 font-mono text-[11px]"
                        >
                          {it.side} {getDisplaySymbol(it.symbol, instrumentsMap, profile.blindMode)} × {it.qty}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
