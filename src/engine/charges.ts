import type {
  ChargesBreakdown,
  DailyEquityPoint,
  Exchange,
  InstrumentType,
  OrderSide,
  ProductType,
  TradeRecord,
} from '../types/simulator.ts';

export interface ChargeCalcParams {
  side: OrderSide;
  exchange: Exchange;
  product: ProductType;
  instrumentType: InstrumentType;
  qty: number;
  price: number;
  isDpAlreadyChargedToday?: boolean;
  isAutoSquareOff?: boolean;
}

/**
 * Exact Zerodha Brokerage & Indian Statutory Charges Formula
 * (Brokerage, STT, NSE/BSE Transaction Charge, SEBI Fee, Stamp Duty, 18% GST, CDSL ₹15.34 DP Charge)
 */
export function calculateZerodhaCharges(params: ChargeCalcParams): ChargesBreakdown {
  const qty = Math.abs(params.qty);
  const price = Math.max(0, params.price);
  const turnover = Number((qty * price).toFixed(2));

  if (turnover <= 0 || qty <= 0) {
    return {
      turnover: 0,
      brokerage: 0,
      stt: 0,
      exchangeTxn: 0,
      sebiCharges: 0,
      stampDuty: 0,
      gst: 0,
      dpCharges: 0,
      autoSquareOffFee: 0,
      totalCharges: 0,
    };
  }

  let brokerage = 0;
  let stt = 0;
  let exchangeTxn = 0;
  let stampDuty = 0;
  let dpCharges = 0;

  const sebiCharges = turnover * 0.000001; // ₹10 per crore

  if (params.instrumentType === 'CE' || params.instrumentType === 'PE') {
    // Equity / Index Options
    brokerage = 20;
    stt = params.side === 'SELL' ? turnover * 0.001 : 0; // 0.1% on sell premium
    exchangeTxn = turnover * 0.0003503; // NSE Options 0.03503%
    stampDuty = params.side === 'BUY' ? turnover * 0.00003 : 0; // 0.003% on buy
  } else if (params.instrumentType === 'FUT') {
    // Equity / Index Futures
    brokerage = Math.min(20, turnover * 0.0003);
    stt = params.side === 'SELL' ? turnover * 0.0002 : 0; // 0.02% on sell
    exchangeTxn = turnover * 0.0000173; // 0.00173%
    stampDuty = params.side === 'BUY' ? turnover * 0.00002 : 0; // 0.002% on buy
  } else if (params.product === 'MIS') {
    // Equity Intraday
    brokerage = Math.min(20, turnover * 0.0003);
    stt = params.side === 'SELL' ? turnover * 0.00025 : 0; // 0.025% on sell
    exchangeTxn = turnover * (params.exchange === 'BSE' ? 0.0000375 : 0.0000297);
    stampDuty = params.side === 'BUY' ? turnover * 0.00003 : 0; // 0.003% on buy
  } else if (params.product === 'MTF') {
    // Margin Trading Facility (0.03% or ₹20 brokerage + Delivery STT/Stamp)
    brokerage = Math.min(20, turnover * 0.0003);
    stt = turnover * 0.001; // 0.1%
    exchangeTxn = turnover * (params.exchange === 'BSE' ? 0.0000375 : 0.0000297);
    stampDuty = params.side === 'BUY' ? turnover * 0.00015 : 0;
  } else {
    // CNC Equity Delivery — ₹0 Brokerage on Zerodha!
    brokerage = 0;
    stt = turnover * 0.001; // 0.1% on both buy & sell
    exchangeTxn = turnover * (params.exchange === 'BSE' ? 0.0000375 : 0.0000297);
    stampDuty = params.side === 'BUY' ? turnover * 0.00015 : 0; // 0.015% on buy
    if (params.side === 'SELL' && !params.isDpAlreadyChargedToday) {
      dpCharges = 15.34; // ₹13.50 CDSL/Zerodha DP + 18% GST, once per scrip per day
    }
  }

  const autoSquareOffFee = params.isAutoSquareOff ? 59.0 : 0; // ₹50 + 18% GST
  const gst = (brokerage + exchangeTxn + sebiCharges) * 0.18;

  const round2 = (n: number) => Number(n.toFixed(2));
  const b = round2(brokerage);
  const s = Math.round(stt); // Indian STT is rounded to nearest Rupee
  const ex = round2(exchangeTxn);
  const sb = round2(sebiCharges);
  const sd = round2(stampDuty);
  const g = round2(gst);
  const dp = round2(dpCharges);
  const sq = round2(autoSquareOffFee);
  const totalCharges = round2(b + s + ex + sb + sd + g + dp + sq);

  return {
    turnover,
    brokerage: b,
    stt: s,
    exchangeTxn: ex,
    sebiCharges: sb,
    stampDuty: sd,
    gst: g,
    dpCharges: dp,
    autoSquareOffFee: sq,
    totalCharges,
  };
}

export function calculateRequiredMargin(params: {
  side: OrderSide;
  product: ProductType;
  instrumentType: InstrumentType;
  qty: number;
  price: number;
  underlyingPrice?: number;
  existingHoldingQty?: number;
}): number {
  const qty = Math.abs(params.qty);
  const notional = qty * Math.max(0, params.price);

  if (params.instrumentType === 'CE' || params.instrumentType === 'PE') {
    if (params.side === 'BUY') {
      return Number(notional.toFixed(2)); // Full option premium
    }
    // Option writing SPAN + Exposure (~16% of underlying contract notional)
    const uPrice = params.underlyingPrice || params.price * 20;
    return Number((qty * uPrice * 0.16).toFixed(2));
  }

  if (params.instrumentType === 'FUT') {
    return Number((notional * 0.18).toFixed(2)); // ~18% Futures SPAN + Exposure
  }

  if (params.product === 'MIS') {
    return Number((notional * 0.2).toFixed(2)); // 5x Intraday leverage (20% margin)
  }

  if (params.product === 'MTF') {
    return Number((notional * 0.25).toFixed(2)); // 4x MTF delivery leverage (25% margin)
  }

  // CNC Delivery
  if (params.side === 'SELL' && (params.existingHoldingQty || 0) >= qty) {
    return 0; // Selling owned Demat shares requires zero cash margin
  }
  return Number(notional.toFixed(2));
}

export interface TaxReportSummary {
  stcgProfit: number;
  ltcgProfit: number;
  intradayProfit: number;
  fnoProfit: number;
  totalRealizedPnl: number;
  estimatedStcgTax: number; // 20%
  estimatedLtcgTax: number; // 12.5% above ₹1,25,000 exemption
  totalChargesPaid: number;
  totalTurnover: number;
  brokeragePaid: number;
  sttPaid: number;
  dpChargesPaid: number;
  gstAndOtherPaid: number;
}

export function calculateIndianTaxSummary(trades: TradeRecord[]): TaxReportSummary {
  let stcgProfit = 0;
  let ltcgProfit = 0;
  let intradayProfit = 0;
  let fnoProfit = 0;
  let totalChargesPaid = 0;
  let totalTurnover = 0;
  let brokeragePaid = 0;
  let sttPaid = 0;
  let dpChargesPaid = 0;
  let gstAndOtherPaid = 0;

  for (const t of trades) {
    totalTurnover += t.turnover;
    totalChargesPaid += t.charges.totalCharges;
    brokeragePaid += t.charges.brokerage;
    sttPaid += t.charges.stt;
    dpChargesPaid += t.charges.dpCharges;
    gstAndOtherPaid +=
      t.charges.gst +
      t.charges.exchangeTxn +
      t.charges.sebiCharges +
      t.charges.stampDuty +
      t.charges.autoSquareOffFee;

    if (typeof t.realizedPnl === 'number') {
      if (t.taxCategory === 'LTCG') ltcgProfit += t.realizedPnl;
      else if (t.taxCategory === 'STCG') stcgProfit += t.realizedPnl;
      else if (t.taxCategory === 'FNO') fnoProfit += t.realizedPnl;
      else intradayProfit += t.realizedPnl;
    }
  }

  const estimatedStcgTax = stcgProfit > 0 ? stcgProfit * 0.2 : 0;
  const taxableLtcg = Math.max(0, ltcgProfit - 125000);
  const estimatedLtcgTax = taxableLtcg * 0.125;

  const r2 = (n: number) => Number(n.toFixed(2));

  return {
    stcgProfit: r2(stcgProfit),
    ltcgProfit: r2(ltcgProfit),
    intradayProfit: r2(intradayProfit),
    fnoProfit: r2(fnoProfit),
    totalRealizedPnl: r2(stcgProfit + ltcgProfit + intradayProfit + fnoProfit),
    estimatedStcgTax: r2(estimatedStcgTax),
    estimatedLtcgTax: r2(estimatedLtcgTax),
    totalChargesPaid: r2(totalChargesPaid),
    totalTurnover: r2(totalTurnover),
    brokeragePaid: r2(brokeragePaid),
    sttPaid: r2(sttPaid),
    dpChargesPaid: r2(dpChargesPaid),
    gstAndOtherPaid: r2(gstAndOtherPaid),
  };
}

export function calculatePortfolioPerformance(equityHistory: DailyEquityPoint[]) {
  if (equityHistory.length === 0) {
    return {
      cagrPct: 0,
      niftyCagrPct: 0,
      totalReturnPct: 0,
      niftyReturnPct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      yearsElapsed: 0,
    };
  }

  const first = equityHistory[0];
  const last = equityHistory[equityHistory.length - 1];
  const d0 = new Date(first.date + 'T00:00:00Z').getTime();
  const d1 = new Date(last.date + 'T00:00:00Z').getTime();
  const yearsElapsed = Math.max(0, (d1 - d0) / (365.25 * 86400 * 1000));

  const baseCap = Math.max(1, last.netCapitalInvested || first.totalEquity);
  const totalReturnPct = ((last.totalEquity - baseCap) / baseCap) * 100;
  const niftyReturnPct =
    first.niftyClose > 0 && last.niftyClose > 0
      ? ((last.niftyClose - first.niftyClose) / first.niftyClose) * 100
      : 0;

  const cagrPct =
    yearsElapsed >= 0.25 && last.totalEquity > 0
      ? (Math.pow(last.totalEquity / baseCap, 1 / yearsElapsed) - 1) * 100
      : totalReturnPct;

  const niftyCagrPct =
    yearsElapsed >= 0.25 && first.niftyClose > 0 && last.niftyClose > 0
      ? (Math.pow(last.niftyClose / first.niftyClose, 1 / yearsElapsed) - 1) * 100
      : niftyReturnPct;

  // Max Drawdown & Daily Returns Sharpe
  let peak = 0;
  let maxDd = 0;
  const dailyRets: number[] = [];

  for (let i = 0; i < equityHistory.length; i++) {
    const eq = equityHistory[i].totalEquity;
    if (eq > peak) peak = eq;
    if (peak > 0) {
      const dd = ((peak - eq) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
    if (i > 0 && equityHistory[i - 1].totalEquity > 0) {
      const prevEq = equityHistory[i - 1].totalEquity;
      const capDelta = equityHistory[i].netCapitalInvested - equityHistory[i - 1].netCapitalInvested;
      const adjustedCurr = eq - capDelta;
      dailyRets.push((adjustedCurr - prevEq) / prevEq);
    }
  }

  let sharpeRatio = 0;
  if (dailyRets.length > 10) {
    const rfDaily = 0.065 / 252;
    const mean = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
    const variance = dailyRets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (dailyRets.length - 1);
    const std = Math.sqrt(variance);
    if (std > 1e-8) {
      sharpeRatio = ((mean - rfDaily) / std) * Math.sqrt(252);
    }
  }

  const r2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2));
  return {
    cagrPct: r2(cagrPct),
    niftyCagrPct: r2(niftyCagrPct),
    totalReturnPct: r2(totalReturnPct),
    niftyReturnPct: r2(niftyReturnPct),
    maxDrawdownPct: r2(maxDd),
    sharpeRatio: r2(sharpeRatio),
    yearsElapsed: r2(yearsElapsed),
  };
}
