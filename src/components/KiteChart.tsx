import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  createChart,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import {
  Activity,
  Bell,
  ChevronDown,
  GitCompare,
  Layers,
  PenLine,
  Settings2,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { api } from '../api/client.ts';
import type { CandleBar, ChartDrawing, DividendEvent, SplitEvent } from '../types/simulator.ts';
import {
  computeBollingerBands,
  computeEMA,
  computeHeikinAshi,
  computeMACD,
  computeRSI,
  computeSMA,
  computeSupertrend,
  computeVWAP,
} from '../engine/indicators.ts';
import { formatINR, formatNum, formatPct, getDisplayName, getDisplaySymbol } from '../utils/format.ts';
import { useIsPhone, readLocal, writeLocal } from './chart/useIsPhone.ts';
import {
  DEFAULT_DRAWING_COLOR,
  DRAWING_COLORS,
  DRAWING_TOOL_INFO,
  DrawingsPrimitive,
  POINTS_NEEDED,
  buildTimeIndex,
  logicalToTime,
  timeToSeconds,
  type DrawingTool,
  type TimeIndex,
} from './chart/chartDrawings.ts';
import {
  DEFAULT_INDICATOR_PARAMS,
  OVERLAY_META,
  PARAM_FIELDS,
  loadIndicatorParams,
  loadOscillator,
  loadOverlays,
  saveIndicatorParams,
  saveOscillator,
  saveOverlays,
  type IndicatorParams,
  type OscillatorPane,
  type OverlayKey,
} from './chart/indicatorSettings.ts';

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '1D', '1W', '1M'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const INTRADAY_TF = new Set<Timeframe>(['1m', '3m', '5m', '15m', '30m', '1H', '2H']);

const TF_TIPS: Record<Timeframe, string> = {
  '1m': '1-minute candles :: Each candle = 1 minute of trading (last 3 sessions). :: Very noisy — mostly for scalpers. Beginners should zoom out.',
  '3m': '3-minute candles :: Each candle = 3 minutes (last 6 sessions). Popular with intraday traders for entries.',
  '5m': '5-minute candles :: Each candle = 5 minutes. The classic intraday chart — 75 candles per session (09:15–15:30).',
  '15m': '15-minute candles :: Each candle = 15 minutes. Good for intraday trend and short swing setups.',
  '30m': '30-minute candles :: Each candle = 30 minutes — ~13 per day. Smooths intraday noise.',
  '1H': '1-hour candles :: Each candle = 1 hour. Useful to time swing trades lasting a few days.',
  '2H': '2-hour candles :: Each candle = 2 hours (about 3 per session).',
  '1D': 'Daily candles :: Each candle = one full trading day (open, high, low, close). The default for investors and swing traders.',
  '1W': 'Weekly candles :: Each candle = one week. Shows the big-picture trend and filters out daily noise.',
  '1M': 'Monthly candles :: Each candle = one month. Best for long-term investing decisions over years.',
};

type ChartStyle = 'CANDLE' | 'HOLLOW' | 'HEIKIN' | 'BAR' | 'LINE' | 'AREA';
const CHART_STYLES: Array<{ key: ChartStyle; label: string }> = [
  { key: 'CANDLE', label: 'Candles' },
  { key: 'HOLLOW', label: 'Hollow candles' },
  { key: 'HEIKIN', label: 'Heikin-Ashi' },
  { key: 'BAR', label: 'OHLC bars' },
  { key: 'LINE', label: 'Line' },
  { key: 'AREA', label: 'Area' },
];

interface ChartPrefs {
  volume: boolean;
  markers: boolean;
  portfolioLines: boolean;
  log: boolean;
}
const DEFAULT_PREFS: ChartPrefs = { volume: true, markers: true, portfolioLines: true, log: false };
const PREFS_KEY = 'kite.chart.prefs';

type Panel = 'NONE' | 'INDICATORS' | 'DRAW' | 'COMPARE' | 'SETTINGS';

interface PriceLineSpec {
  price: number;
  color: string;
  style: LineStyle;
  title: string;
}

const UP = '#4caf50';
const DOWN = '#df514c';

export const KiteChart: React.FC = () => {
  const {
    profile,
    quotes,
    instruments,
    instrumentsMap,
    theme,
    openOrderTicket,
    openGttModal,
    openAlertModal,
    openFnoModal,
    updateSettings,
    saveDrawings,
  } = useSimulatorStore();
  const isPhone = useIsPhone();

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('CANDLE');
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>(loadOverlays);
  const [params, setParams] = useState<IndicatorParams>(loadIndicatorParams);
  const [oscillator, setOscillator] = useState<OscillatorPane>(loadOscillator);
  const [prefs, setPrefs] = useState<ChartPrefs>(() => readLocal(PREFS_KEY, DEFAULT_PREFS));
  const [panel, setPanel] = useState<Panel>('NONE');

  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [compareCandles, setCompareCandles] = useState<CandleBar[]>([]);
  const [compareSymbol, setCompareSymbol] = useState<string | null>(null);
  const [compareQuery, setCompareQuery] = useState('');
  const [splits, setSplits] = useState<SplitEvent[]>([]);
  const [dividends, setDividends] = useState<DividendEvent[]>([]);
  const [available, setAvailable] = useState(true);
  const [firstDate, setFirstDate] = useState<string | undefined>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const [tool, setTool] = useState<DrawingTool>('NONE');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const oscContainerRef = useRef<HTMLDivElement | null>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const primaryRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const oscChartRef = useRef<IChartApi | null>(null);
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  const timeIndexRef = useRef<TimeIndex | null>(null);
  const lastViewKeyRef = useRef<string>('');
  const savedRangeRef = useRef<LogicalRange | null>(null);
  const syncingRef = useRef(false);
  const pendingRef = useRef<{ time: string | number; price: number } | null>(null);
  const downRef = useRef<{ x: number; y: number; hadPending: boolean } | null>(null);
  const drawingsRef = useRef<ChartDrawing[]>([]);
  const selectedRef = useRef<string | null>(null);
  const toolRef = useRef<DrawingTool>('NONE');
  drawingsRef.current = drawings;
  selectedRef.current = selectedId;
  toolRef.current = tool;

  const symbol = profile?.selectedSymbol || 'RELIANCE';
  const simDate = profile?.currentDate || '2014-02-03';
  const intradayEnabled = Boolean(profile?.intraday.enabled);
  const stepIndex = profile?.intraday.stepIndex ?? 74;
  const isDark = theme === 'dark';
  const isIntradayTf = INTRADAY_TF.has(timeframe);
  const compareActive = Boolean(compareSymbol && compareCandles.length > 0);

  // ---- Restore persisted timeframe / chart type once per profile ----
  useEffect(() => {
    const s = profile?.settings;
    if (s?.chartTimeframe && (TIMEFRAMES as readonly string[]).includes(s.chartTimeframe)) {
      setTimeframe(s.chartTimeframe as Timeframe);
    }
    if (s?.chartType && CHART_STYLES.some((c) => c.key === s.chartType)) setChartStyle(s.chartType as ChartStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const changeTimeframe = (tf: Timeframe) => {
    setTimeframe(tf);
    if (profile?.settings?.chartTimeframe !== tf) updateSettings({ chartTimeframe: tf });
  };
  const changeStyle = (st: ChartStyle) => {
    setChartStyle(st);
    if (profile?.settings?.chartType !== st) updateSettings({ chartType: st });
  };

  // ---- Drawings: sync from the profile when symbol / stored drawings change ----
  const storedDrawingsKey = JSON.stringify(profile?.chartDrawings?.[symbol] || []);
  useEffect(() => {
    setDrawings(profile?.chartDrawings?.[symbol] || []);
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, storedDrawingsKey]);

  const commitDrawings = useCallback(
    (next: ChartDrawing[]) => {
      setDrawings(next);
      saveDrawings(symbol, next);
    },
    [saveDrawings, symbol]
  );

  // Reset transient drawing state when switching symbol
  useEffect(() => {
    setTool('NONE');
    pendingRef.current = null;
    setCompareSymbol((c) => (c === symbol ? null : c));
  }, [symbol]);

  // ---- Load candles (+ compare) ----
  useEffect(() => {
    let cancelled = false;
    async function loadCandles() {
      try {
        const { data } = await api('GET', '/candles', undefined, {
          symbol,
          date: simDate,
          tf: timeframe,
          intraday: intradayEnabled,
          step: stepIndex,
          compare: compareSymbol || undefined,
        });
        if (cancelled) return;
        setCandles(data.candles || []);
        setCompareCandles(compareSymbol ? data.compare || [] : []);
        setSplits(data.splits || []);
        setDividends(data.dividends || []);
        setAvailable(Boolean(data.available));
        setFirstDate(data.firstDate);
      } catch {
        // ignore transient fetch errors
      }
    }
    loadCandles();
    return () => {
      cancelled = true;
    };
  }, [symbol, simDate, timeframe, intradayEnabled, stepIndex, compareSymbol]);

  const displayBars = useMemo(() => (chartStyle === 'HEIKIN' ? computeHeikinAshi(candles) : candles), [candles, chartStyle]);

  // ---- Indicator data (shared by chart + legend) ----
  const indicatorData = useMemo(() => {
    const toMap = (pts: Array<{ time: string | number; value: number }>) => {
      const m = new Map<string, number>();
      for (const p of pts) m.set(String(p.time), p.value);
      return m;
    };
    const res: Partial<Record<OverlayKey, { lines: Array<Array<{ time: string | number; value: number; color?: string }>>; map: Map<string, number> }>> = {};
    if (overlays.SMA1) {
      const d = computeSMA(candles, params.sma1);
      res.SMA1 = { lines: [d], map: toMap(d) };
    }
    if (overlays.SMA2) {
      const d = computeSMA(candles, params.sma2);
      res.SMA2 = { lines: [d], map: toMap(d) };
    }
    if (overlays.SMA3) {
      const d = computeSMA(candles, params.sma3);
      res.SMA3 = { lines: [d], map: toMap(d) };
    }
    if (overlays.EMA) {
      const d = computeEMA(candles, params.ema);
      res.EMA = { lines: [d], map: toMap(d) };
    }
    if (overlays.VWAP) {
      const d = computeVWAP(candles, params.vwapLength);
      res.VWAP = { lines: [d], map: toMap(d) };
    }
    if (overlays.BB) {
      const bb = computeBollingerBands(candles, params.bbLength, params.bbStdDev);
      res.BB = { lines: [bb.upper, bb.middle, bb.lower], map: toMap(bb.middle) };
    }
    if (overlays.SUPERTREND) {
      const st = computeSupertrend(candles, params.stPeriod, params.stMultiplier);
      res.SUPERTREND = { lines: [st], map: toMap(st) };
    }
    return res;
  }, [candles, overlays, params]);

  // ---- Compare series aligned (as-of join) to main bars ----
  const compareAligned = useMemo(() => {
    if (!compareSymbol || compareCandles.length === 0 || candles.length === 0) return null;
    const out: Array<number | null> = new Array(candles.length).fill(null);
    let j = 0;
    const cts = compareCandles.map((c) => timeToSeconds(c.time));
    for (let i = 0; i < candles.length; i++) {
      const t = timeToSeconds(candles[i].time);
      while (j + 1 < cts.length && cts[j + 1] <= t) j++;
      if (cts[j] <= t) out[i] = compareCandles[j].close;
    }
    return out;
  }, [compareSymbol, compareCandles, candles]);

  // ---- Markers & portfolio price lines (as stable string keys) ----
  const markers = useMemo<SeriesMarker<Time>[]>(() => {
    if (timeframe !== '1D' || displayBars.length === 0 || !profile || !prefs.markers) return [];
    const barDateSet = new Set(displayBars.map((b) => String(b.time)));
    const out: SeriesMarker<Time>[] = [];
    if (!profile.blindMode) {
      for (const sp of splits) {
        if (barDateSet.has(sp.date)) {
          out.push({ time: sp.date as Time, position: 'aboveBar', color: '#8b5cf6', shape: 'circle', text: `Split ${sp.ratio}` });
        }
      }
      for (const dv of dividends.slice(-25)) {
        if (barDateSet.has(dv.date)) {
          out.push({ time: dv.date as Time, position: 'belowBar', color: '#0ea5e9', shape: 'circle', text: `Div ₹${dv.amount}` });
        }
      }
    }
    for (const tr of profile.trades) {
      if (tr.symbol === symbol && tr.instrumentType === 'EQ' && barDateSet.has(tr.date)) {
        out.push({
          time: tr.date as Time,
          position: tr.side === 'BUY' ? 'belowBar' : 'aboveBar',
          color: tr.side === 'BUY' ? '#387ed1' : '#ff5722',
          shape: tr.side === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: `${tr.side} ${tr.qty}`,
        });
      }
    }
    out.sort((a, b) => (String(a.time) < String(b.time) ? -1 : String(a.time) > String(b.time) ? 1 : 0));
    return out;
  }, [timeframe, displayBars, profile, prefs.markers, splits, dividends, symbol]);
  const markersKey = JSON.stringify(markers);

  const priceLines = useMemo<PriceLineSpec[]>(() => {
    if (!profile || !prefs.portfolioLines) return [];
    const out: PriceLineSpec[] = [];
    const holding = profile.holdings.find((h) => h.symbol === symbol);
    if (holding && holding.qty + holding.t1Qty > 0) {
      out.push({ price: holding.avgPrice, color: '#387ed1', style: LineStyle.Dashed, title: `Avg (${holding.qty + holding.t1Qty})` });
    }
    for (const pos of profile.positions) {
      if (pos.underlyingSymbol === symbol && pos.instrumentType === 'EQ' && pos.netQty !== 0) {
        out.push({
          price: pos.avgPrice,
          color: pos.netQty > 0 ? '#10b981' : '#f97316',
          style: LineStyle.Dashed,
          title: `${pos.product} ${pos.netQty > 0 ? 'LONG' : 'SHORT'} (${pos.netQty})`,
        });
      }
    }
    for (const ord of profile.orders) {
      if (
        ord.underlyingSymbol === symbol &&
        ord.instrumentType === 'EQ' &&
        (ord.status === 'OPEN' || ord.status === 'TRIGGER PENDING' || ord.status === 'AMO REQ RECEIVED')
      ) {
        const linePrice = ord.orderType === 'SL-M' || ord.orderType === 'SL' ? ord.triggerPrice || ord.price : ord.price;
        if (linePrice > 0) out.push({ price: linePrice, color: '#f59e0b', style: LineStyle.Dotted, title: `${ord.orderType} ${ord.side} ${ord.qty}` });
      }
    }
    for (const gtt of profile.gtts) {
      if (gtt.status === 'ACTIVE' && gtt.symbol === symbol) {
        for (const leg of gtt.legs) {
          out.push({
            price: leg.triggerPrice,
            color: leg.label === 'STOPLOSS' ? DOWN : '#14b8a6',
            style: LineStyle.SparseDotted,
            title: `GTT ${leg.label} (${leg.qty})`,
          });
        }
      }
    }
    for (const al of profile.alerts || []) {
      if (al.status === 'ACTIVE' && al.symbol === symbol && al.property === 'LTP') {
        out.push({ price: al.value, color: '#eab308', style: LineStyle.LargeDashed, title: `Alert ${al.operator} ${al.value}` });
      }
    }
    return out;
  }, [profile, prefs.portfolioLines, symbol]);
  const priceLinesKey = JSON.stringify(priceLines);

  // Shared % extremes for compare-mode autoscale (both scales map the same % range)
  const pctRangeRef = useRef<{ min: number; max: number; base: number } | null>(null);

  // ---- Main chart ----
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container || !available) return;

    const bgColor = isDark ? '#1b1e24' : '#ffffff';
    const textColor = isDark ? '#9ca3af' : '#555555';
    const gridColor = isDark ? 'rgba(42, 46, 55, 0.65)' : 'rgba(235, 235, 235, 0.8)';
    const scaleMargins = { top: 0.08, bottom: prefs.volume ? 0.22 : 0.06 };

    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: bgColor }, textColor, fontFamily: 'Inter, sans-serif', fontSize: isPhone ? 10 : 11 },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: gridColor,
        scaleMargins,
        minimumWidth: 60,
        mode: prefs.log && !compareActive ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      leftPriceScale: { visible: compareActive, borderColor: gridColor, scaleMargins, minimumWidth: 56 },
      timeScale: { borderColor: gridColor, timeVisible: isIntradayTf, secondsVisible: false, rightOffset: isPhone ? 3 : 6 },
      // Touch: horizontal drag pans, pinch zooms; vertical swipes are left to the page.
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      kineticScroll: { touch: true, mouse: false },
    });
    mainChartRef.current = chart;

    const ohlc = displayBars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close }));
    let primary: ISeriesApi<SeriesType>;
    if (chartStyle === 'CANDLE' || chartStyle === 'HEIKIN' || chartStyle === 'HOLLOW') {
      const s = chart.addCandlestickSeries({
        upColor: chartStyle === 'HOLLOW' ? 'rgba(0,0,0,0)' : UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
      });
      s.setData(ohlc);
      primary = s as unknown as ISeriesApi<SeriesType>;
    } else if (chartStyle === 'BAR') {
      const s = chart.addBarSeries({ upColor: UP, downColor: DOWN });
      s.setData(ohlc);
      primary = s as unknown as ISeriesApi<SeriesType>;
    } else if (chartStyle === 'LINE') {
      const s = chart.addLineSeries({ color: '#387ed1', lineWidth: 2 });
      s.setData(displayBars.map((b) => ({ time: b.time as Time, value: b.close })));
      primary = s as unknown as ISeriesApi<SeriesType>;
    } else {
      const s = chart.addAreaSeries({
        lineColor: '#387ed1',
        topColor: 'rgba(56, 126, 209, 0.28)',
        bottomColor: 'rgba(56, 126, 209, 0.01)',
        lineWidth: 2,
      });
      s.setData(displayBars.map((b) => ({ time: b.time as Time, value: b.close })));
      primary = s as unknown as ISeriesApi<SeriesType>;
    }
    primaryRef.current = primary;

    if (prefs.volume) {
      const volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.83, bottom: 0 } });
      volSeries.setData(
        candles.map((b) => ({
          time: b.time as Time,
          value: b.volume,
          color: b.close >= b.open ? 'rgba(76, 175, 80, 0.28)' : 'rgba(223, 81, 76, 0.28)',
        }))
      );
    }

    // Technical overlays
    (Object.keys(indicatorData) as OverlayKey[]).forEach((key) => {
      const entry = indicatorData[key];
      if (!entry) return;
      const meta = OVERLAY_META[key];
      entry.lines.forEach((pts, li) => {
        const s = chart.addLineSeries({
          color: key === 'BB' ? (li === 1 ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.6)') : meta.color,
          lineWidth: key === 'SMA3' || key === 'SUPERTREND' ? 2 : 1,
          lineStyle: key === 'VWAP' ? LineStyle.Dashed : key === 'BB' && li === 1 ? LineStyle.Dotted : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(pts.map((p) => (p.color ? { time: p.time as Time, value: p.value, color: p.color } : { time: p.time as Time, value: p.value })));
      });
    });

    // Markers & portfolio price lines
    if (markers.length) primary.setMarkers(markers);
    for (const pl of priceLines) {
      primary.createPriceLine({ price: pl.price, color: pl.color, lineWidth: 1, lineStyle: pl.style, axisLabelVisible: true, title: pl.title });
    }

    // Compare (% change, rebased to 0% at the first visible bar, on the left scale)
    let compareSeries: ISeriesApi<'Line'> | null = null;
    const rebase = (range: LogicalRange | null) => {
      if (!compareSeries || !compareAligned || candles.length === 0) return;
      const n = candles.length;
      const from = Math.max(0, Math.min(n - 1, Math.ceil(range?.from ?? 0)));
      const to = Math.max(from, Math.min(n - 1, Math.floor(range?.to ?? n - 1)));
      let k = from;
      while (k < n && compareAligned[k] === null) k++;
      if (k >= n) return;
      const baseMain = candles[from].close;
      const baseCmp = compareAligned[k] as number;
      const data: Array<{ time: Time; value: number }> = [];
      let cMin = 0;
      let cMax = 0;
      for (let i = 0; i < n; i++) {
        const v = compareAligned[i];
        if (v === null) continue;
        const pct = (v / baseCmp - 1) * 100;
        data.push({ time: candles[i].time as Time, value: Number(pct.toFixed(3)) });
        if (i >= from && i <= to) {
          cMin = Math.min(cMin, pct);
          cMax = Math.max(cMax, pct);
        }
      }
      let mMin = 0;
      let mMax = 0;
      for (let i = from; i <= to; i++) {
        mMin = Math.min(mMin, (candles[i].low / baseMain - 1) * 100);
        mMax = Math.max(mMax, (candles[i].high / baseMain - 1) * 100);
      }
      pctRangeRef.current = { min: Math.min(cMin, mMin), max: Math.max(cMax, mMax), base: baseMain };
      compareSeries.setData(data);
    };
    if (compareActive && compareAligned) {
      compareSeries = chart.addLineSeries({
        color: '#ff9800',
        lineWidth: 2,
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: 'custom', formatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, minMove: 0.01 },
        autoscaleInfoProvider: (): AutoscaleInfo | null => {
          const r = pctRangeRef.current;
          return r ? { priceRange: { minValue: r.min, maxValue: r.max } } : null;
        },
      });
      // Make the main price scale cover the same % range so both lines align visually.
      primary.applyOptions({
        autoscaleInfoProvider: (base: () => AutoscaleInfo | null): AutoscaleInfo | null => {
          const r = pctRangeRef.current;
          if (!r) return base();
          return { priceRange: { minValue: r.base * (1 + r.min / 100), maxValue: r.base * (1 + r.max / 100) } };
        },
      });
    }

    // Drawings primitive
    const primitive = new DrawingsPrimitive();
    primary.attachPrimitive(primitive);
    primitiveRef.current = primitive;
    timeIndexRef.current = buildTimeIndex(displayBars);
    primitive.setState({
      drawings: drawingsRef.current,
      selectedId: selectedRef.current,
      preview: null,
      index: timeIndexRef.current,
      isDark,
    });

    // Crosshair legend
    chart.subscribeCrosshairMove((param) => {
      if (param.logical === undefined || param.logical === null || !param.time) {
        setHoverIdx(null);
        return;
      }
      const i = Math.round(param.logical);
      setHoverIdx(i >= 0 && i < candles.length ? i : null);
    });

    // Tap / click selects a drawing (when no tool is active)
    chart.subscribeClick((param) => {
      if (toolRef.current !== 'NONE' || !param.point) return;
      const id = primitive.hitTestDrawing(param.point.x, param.point.y, chart.timeScale().width());
      setSelectedId(id);
    });

    // Visible range: restore, persist, sync oscillator, rebase compare
    const viewKey = `${symbol}|${timeframe}`;
    if (lastViewKeyRef.current !== viewKey || !savedRangeRef.current) {
      lastViewKeyRef.current = viewKey;
      const total = displayBars.length;
      if (total > 0) {
        const visibleCount = Math.min(total, isPhone ? (timeframe === '1M' ? 80 : 110) : timeframe === '1M' ? 120 : 200);
        savedRangeRef.current = { from: Math.max(0, total - visibleCount), to: total + (isPhone ? 3 : 5) } as LogicalRange;
      }
    }
    let raf = 0;
    const onRange = (range: LogicalRange | null) => {
      if (range) savedRangeRef.current = range;
      if (!syncingRef.current && range && oscChartRef.current) {
        syncingRef.current = true;
        oscChartRef.current.timeScale().setVisibleLogicalRange(range);
        syncingRef.current = false;
      }
      if (compareSeries) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => rebase(range));
      }
    };
    if (savedRangeRef.current) {
      rebase(savedRangeRef.current);
      chart.timeScale().setVisibleLogicalRange(savedRangeRef.current);
    } else {
      rebase(null);
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      cancelAnimationFrame(raf);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      mainChartRef.current = null;
      primaryRef.current = null;
      primitiveRef.current = null;
      pctRangeRef.current = null;
    };
    // markers/priceLines are tracked via their string keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    candles,
    displayBars,
    chartStyle,
    indicatorData,
    isDark,
    timeframe,
    symbol,
    available,
    markersKey,
    priceLinesKey,
    prefs.volume,
    prefs.log,
    compareActive,
    compareAligned,
    isPhone,
  ]);

  // Push drawing state to the primitive without recreating the chart
  useEffect(() => {
    primitiveRef.current?.setState({ drawings, selectedId, isDark });
  }, [drawings, selectedId, isDark]);

  // ---- Oscillator sub-pane (RSI / MACD), time-synced with the main chart ----
  useEffect(() => {
    const oscEl = oscContainerRef.current;
    if (!oscEl || oscillator === 'NONE' || candles.length < 20) return;

    const bgColor = isDark ? '#1b1e24' : '#ffffff';
    const textColor = isDark ? '#9ca3af' : '#555555';
    const gridColor = isDark ? 'rgba(42, 46, 55, 0.65)' : 'rgba(235, 235, 235, 0.8)';

    const oscChart = createChart(oscEl, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: bgColor }, textColor, fontFamily: 'Inter, sans-serif', fontSize: 10 },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      rightPriceScale: { borderColor: gridColor, minimumWidth: 60 },
      leftPriceScale: { visible: compareActive, borderColor: gridColor, minimumWidth: 56 },
      timeScale: { borderColor: gridColor, timeVisible: isIntradayTf, visible: !isPhone, rightOffset: isPhone ? 3 : 6 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      crosshair: { mode: CrosshairMode.Normal },
    });
    oscChartRef.current = oscChart;

    // Whitespace series with every bar time keeps logical indices aligned with the main chart
    const ws = oscChart.addLineSeries({ visible: false, priceLineVisible: false, lastValueVisible: false });
    ws.setData(candles.map((b) => ({ time: b.time as Time })));

    if (oscillator === 'RSI') {
      const rsiSeries = oscChart.addLineSeries({ color: '#8b5cf6', lineWidth: 2, priceLineVisible: false });
      rsiSeries.setData(computeRSI(candles, params.rsiLength).map((p) => ({ time: p.time as Time, value: p.value })));
      rsiSeries.createPriceLine({ price: 70, color: 'rgba(223,81,76,0.6)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '70' });
      rsiSeries.createPriceLine({ price: 30, color: 'rgba(76,175,80,0.6)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '30' });
    } else {
      const m = computeMACD(candles, params.macdFast, params.macdSlow, params.macdSignal);
      const hist = oscChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      hist.setData(m.histogram.map((p) => ({ time: p.time as Time, value: p.value, color: p.color })));
      const macdLine = oscChart.addLineSeries({ color: '#387ed1', lineWidth: 1, priceLineVisible: false });
      macdLine.setData(m.macd.map((p) => ({ time: p.time as Time, value: p.value })));
      const sigLine = oscChart.addLineSeries({ color: '#ff5722', lineWidth: 1, priceLineVisible: false });
      sigLine.setData(m.signal.map((p) => ({ time: p.time as Time, value: p.value })));
    }

    const initial = mainChartRef.current?.timeScale().getVisibleLogicalRange() || savedRangeRef.current;
    if (initial) oscChart.timeScale().setVisibleLogicalRange(initial);
    const onRange = (range: LogicalRange | null) => {
      if (syncingRef.current || !range || !mainChartRef.current) return;
      syncingRef.current = true;
      mainChartRef.current.timeScale().setVisibleLogicalRange(range);
      syncingRef.current = false;
    };
    oscChart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      oscChart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      oscChart.remove();
      oscChartRef.current = null;
    };
  }, [candles, oscillator, isDark, isIntradayTf, params.rsiLength, params.macdFast, params.macdSlow, params.macdSignal, isPhone, compareActive]);

  // ---- Drawing interaction ----
  const cancelDrawing = useCallback(() => {
    pendingRef.current = null;
    downRef.current = null;
    primitiveRef.current?.setState({ preview: null });
    setTool('NONE');
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const chart = mainChartRef.current;
    const series = primaryRef.current;
    const idx = timeIndexRef.current;
    const el = mainContainerRef.current;
    if (!chart || !series || !idx || !el) return null;
    const rect = el.getBoundingClientRect();
    const leftW = compareActive ? chart.priceScale('left').width() : 0;
    const x = e.clientX - rect.left - leftW;
    const y = e.clientY - rect.top;
    const l = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (l === null || price === null) return null;
    const time = logicalToTime(l, idx);
    if (time === null) return null;
    return { time, price: Number(price.toFixed(2)) };
  };

  const finishDrawing = (points: Array<{ time: string | number; price: number }>) => {
    if (tool === 'NONE') return;
    const d: ChartDrawing = {
      id: `dr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      kind: tool,
      points,
      color: DEFAULT_DRAWING_COLOR[tool],
    };
    commitDrawings([...drawingsRef.current, d]);
    setSelectedId(d.id);
    pendingRef.current = null;
    downRef.current = null;
    primitiveRef.current?.setState({ preview: null });
    setTool('NONE');
  };

  const previewWith = (pt: { time: string | number; price: number }) => {
    if (tool === 'NONE') return;
    const points = POINTS_NEEDED[tool] === 1 ? [pt] : pendingRef.current ? [pendingRef.current, pt] : [pt];
    if (POINTS_NEEDED[tool] === 2 && !pendingRef.current) {
      primitiveRef.current?.setState({ preview: null });
      return;
    }
    primitiveRef.current?.setState({ preview: { id: '__preview', kind: tool, points, color: DEFAULT_DRAWING_COLOR[tool] } });
  };

  const onOverlayDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'NONE') return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const pt = pointFromEvent(e);
    if (!pt) return;
    if (POINTS_NEEDED[tool] === 1) {
      finishDrawing([pt]);
      return;
    }
    downRef.current = { x: e.clientX, y: e.clientY, hadPending: Boolean(pendingRef.current) };
    if (!pendingRef.current) pendingRef.current = pt;
    previewWith(pt);
  };

  const onOverlayMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'NONE') return;
    const pt = pointFromEvent(e);
    if (pt) previewWith(pt);
  };

  const onOverlayUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'NONE' || !pendingRef.current || !downRef.current) return;
    const pt = pointFromEvent(e);
    if (!pt) return;
    const dragged = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y) > 10;
    if (downRef.current.hadPending || dragged) finishDrawing([pendingRef.current, pt]);
    downRef.current = null;
  };

  // Keyboard: Esc cancels drawing / deselects; Delete removes the selected drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (toolRef.current !== 'NONE') cancelDrawing();
        else if (selectedRef.current) setSelectedId(null);
        setPanel('NONE');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        commitDrawings(drawingsRef.current.filter((d) => d.id !== selectedRef.current));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cancelDrawing, commitDrawings]);

  const selectedDrawing = drawings.find((d) => d.id === selectedId) || null;

  // ---- Compare search results ----
  const compareResults = useMemo(() => {
    if (panel !== 'COMPARE' || !profile) return [];
    const q = compareQuery.trim().toLowerCase();
    return instruments
      .filter((i) => i.symbol !== symbol)
      .filter((i) => {
        if (!q) return true;
        const ds = getDisplaySymbol(i.symbol, instrumentsMap, profile.blindMode).toLowerCase();
        const dn = getDisplayName(i.symbol, instrumentsMap, profile.blindMode).toLowerCase();
        return ds.includes(q) || dn.includes(q);
      })
      .sort((a, b) => Number(b.isIndex) - Number(a.isIndex))
      .slice(0, 40);
  }, [panel, compareQuery, instruments, instrumentsMap, symbol, profile]);

  if (!profile) return null;

  const inst = instrumentsMap[symbol];
  const quote = quotes[symbol];
  const up = (quote?.change ?? 0) >= 0;
  const activeIdx = hoverIdx !== null && hoverIdx < candles.length ? hoverIdx : candles.length - 1;
  const activeBar = activeIdx >= 0 ? candles[activeIdx] : null;
  const prevBar = activeIdx > 0 ? candles[activeIdx - 1] : null;
  const barChg = activeBar && prevBar ? ((activeBar.close - prevBar.close) / prevBar.close) * 100 : 0;
  const isIndex = Boolean(inst?.isIndex);
  const dispSym = getDisplaySymbol(symbol, instrumentsMap, profile.blindMode);
  const activeOverlayCount = (Object.keys(overlays) as OverlayKey[]).filter((k) => overlays[k]).length + (oscillator !== 'NONE' ? 1 : 0);

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? 'NONE' : p));
  const setOverlay = (k: OverlayKey, v: boolean) =>
    setOverlays((prev) => {
      const next = { ...prev, [k]: v };
      saveOverlays(next);
      return next;
    });
  const setParam = (k: keyof IndicatorParams, v: number) =>
    setParams((prev) => saveIndicatorParams({ ...prev, [k]: v }));
  const changeOsc = (o: OscillatorPane) => {
    setOscillator(o);
    saveOscillator(o);
  };
  const changePrefs = (patch: Partial<ChartPrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      writeLocal(PREFS_KEY, next);
      return next;
    });

  const chip = (active: boolean) =>
    `shrink-0 h-10 md:h-7 px-2.5 md:px-2 rounded border font-semibold flex items-center gap-1 transition-colors ${
      active
        ? 'border-kite-blue bg-kite-blue/10 text-kite-blue'
        : 'border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  const paramInputs = (key: OverlayKey | 'RSI' | 'MACD') => (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {PARAM_FIELDS[key].map((f) => (
        <label key={f.key} className="flex items-center gap-1 text-[11px] text-kite-muted">
          {f.label}
          <input
            type="number"
            inputMode="decimal"
            step={f.step || 1}
            value={params[f.key]}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setParam(f.key, v);
            }}
            className="w-16 h-9 md:h-7 px-1.5 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-gray-800 dark:text-gray-100 font-mono"
          />
        </label>
      ))}
    </div>
  );

  const actionBtnBase = 'flex items-center justify-center gap-1 rounded text-xs font-semibold transition-colors';

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-kite-darkSurface">
      {/* Instrument header */}
      <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-1.5 md:py-2.5 border-b border-kite-border dark:border-kite-darkBorder">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm md:text-base font-bold text-gray-800 dark:text-white truncate">{dispSym}</h1>
            <span className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium">
              {inst?.sector || 'Equity'}
            </span>
            {quote?.available && (
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className={`text-sm md:text-base font-bold ${up ? 'text-kite-green' : 'text-kite-red'}`}>₹{formatNum(quote.ltp)}</span>
                <span className={`text-[11px] md:text-xs ${up ? 'text-kite-green' : 'text-kite-red'}`}>
                  {up ? '+' : ''}
                  {formatNum(quote.change)} ({formatPct(quote.changePct)})
                </span>
              </div>
            )}
          </div>
          <p className="hidden md:block text-[11px] text-kite-muted truncate">
            {getDisplayName(symbol, instrumentsMap, profile.blindMode)}
            {quote?.available && (
              <span className="ml-2 font-mono" data-tip="52-week range :: The lowest and highest price in the past year. Near the high = strong momentum; near the low = weakness (or value, if the business is fine).">
                · 52W: ₹{formatNum(quote.low52w)} – ₹{formatNum(quote.high52w)}
              </span>
            )}
          </p>
        </div>

        {/* Desktop action buttons */}
        <div className="hidden md:flex items-center gap-1.5">
          {quote?.available && !isIndex && (
            <>
              <button
                onClick={() => openOrderTicket({ side: 'BUY', symbol })}
                className={`${actionBtnBase} px-3.5 py-1.5 bg-kite-blue hover:bg-kite-blueHover text-white`}
                data-tip="Buy :: Opens the order window to buy this stock. Shortcut: B. :: CNC = delivery (hold for days/years), MIS = intraday (auto square-off at 3:20 PM)."
              >
                BUY
              </button>
              <button
                onClick={() => openOrderTicket({ side: 'SELL', symbol })}
                className={`${actionBtnBase} px-3.5 py-1.5 bg-kite-orange hover:bg-kite-orangeHover text-white`}
                data-tip="Sell :: Opens the order window to sell shares you hold (or short-sell intraday with MIS). Shortcut: S."
              >
                SELL
              </button>
              <button
                onClick={() => openGttModal(symbol)}
                className={`${actionBtnBase} px-2.5 py-1.5 border border-gray-300 dark:border-kite-darkBorder hover:border-kite-blue text-gray-700 dark:text-gray-200`}
                data-tip="GTT (Good Till Triggered) :: Set a target and/or stop-loss that waits up to a year and places the order automatically when the price is hit."
              >
                <Target className="w-3.5 h-3.5 text-kite-blue" /> GTT
              </button>
            </>
          )}
          {quote?.available && (
            <>
              <button
                onClick={() => openAlertModal(symbol)}
                className={`${actionBtnBase} px-2.5 py-1.5 border border-gray-300 dark:border-kite-darkBorder hover:border-kite-blue text-gray-700 dark:text-gray-200`}
                data-tip="Price alert :: Get notified when the price crosses a level. Active alert levels appear as yellow dashed lines on the chart."
              >
                <Bell className="w-3.5 h-3.5 text-amber-500" /> Alert
              </button>
              <button
                onClick={() => openFnoModal(symbol)}
                className={`${actionBtnBase} px-2.5 py-1.5 border border-gray-300 dark:border-kite-darkBorder hover:border-kite-orange text-gray-700 dark:text-gray-200`}
                data-tip="F&O option chain :: Futures and options (calls / puts) on this underlying with greeks, OI, PCR, max pain and a strategy payoff chart."
              >
                <Activity className="w-3.5 h-3.5 text-kite-orange" /> Option chain
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toolbar: one horizontally-scrolling chip row on phones */}
      <div className="relative border-b border-kite-border dark:border-kite-darkBorder bg-slate-50/60 dark:bg-[#15181e] text-[11px]">
        <div className="flex items-center gap-1.5 px-2 md:px-4 py-1.5 overflow-x-auto md:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="shrink-0 flex items-center rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface overflow-hidden">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => changeTimeframe(tf)}
                className={`h-10 md:h-7 min-w-[40px] md:min-w-0 px-2 font-semibold transition-colors ${
                  timeframe === tf ? 'bg-kite-blue text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                data-tip={TF_TIPS[tf]}
              >
                {tf}
              </button>
            ))}
          </div>

          <div
            className="shrink-0 relative"
            data-tip="Chart type :: Candles show open/high/low/close for each period (green = closed higher, red = lower). Hollow candles, Heikin-Ashi (smoothed trend candles), OHLC bars, Line (closes only) and Area are alternatives. :: Heikin-Ashi makes trends easier to see but its prices are averaged, not real trades."
          >
            <select
              value={chartStyle}
              onChange={(e) => changeStyle(e.target.value as ChartStyle)}
              className="h-10 md:h-7 pl-2 pr-6 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-gray-700 dark:text-gray-200 font-semibold appearance-none"
              aria-label="Chart type"
            >
              {CHART_STYLES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-kite-muted" />
          </div>

          <button
            onClick={() => togglePanel('INDICATORS')}
            className={chip(panel === 'INDICATORS' || activeOverlayCount > 0)}
            data-tip="Indicators :: Add moving averages, Bollinger Bands, VWAP, Supertrend, RSI or MACD and change their periods. :: Don't overload the chart — 2–3 indicators are usually enough."
          >
            <Layers className="w-3.5 h-3.5" /> Indicators{activeOverlayCount ? ` (${activeOverlayCount})` : ''}
          </button>

          <button
            onClick={() => togglePanel('DRAW')}
            className={chip(panel === 'DRAW' || tool !== 'NONE')}
            data-tip="Drawing tools :: Horizontal lines, trend lines, rays, rectangles and Fibonacci retracements. Drawings are saved per stock. :: Tap a drawing to select it, then delete it."
          >
            <PenLine className="w-3.5 h-3.5" /> Draw{drawings.length ? ` (${drawings.length})` : ''}
          </button>

          {compareSymbol ? (
            <span className="shrink-0 h-10 md:h-7 pl-2 pr-1 rounded border border-orange-400/60 bg-orange-500/10 text-orange-600 dark:text-orange-300 font-semibold flex items-center gap-1">
              <GitCompare className="w-3.5 h-3.5" />
              <span data-tip="Comparison :: The orange line shows the % change of the compared symbol since the first bar on screen; the left axis is in %. Your main chart is scaled to the same % range so the two can be compared directly.">
                vs {getDisplaySymbol(compareSymbol, instrumentsMap, profile.blindMode)}
              </span>
              <button
                onClick={() => setCompareSymbol(null)}
                className="w-8 h-8 md:w-5 md:h-5 flex items-center justify-center rounded hover:bg-orange-500/20"
                aria-label="Remove comparison"
                data-tip="Remove comparison :: Stop comparing and return to the normal price chart."
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ) : (
            <button
              onClick={() => togglePanel('COMPARE')}
              className={chip(panel === 'COMPARE')}
              data-tip="Compare :: Overlay another stock or index as a % change line — e.g. compare a stock with NIFTY 50 to see if it is outperforming the market (relative strength)."
            >
              <GitCompare className="w-3.5 h-3.5" /> Compare
            </button>
          )}

          <button
            onClick={() => togglePanel('SETTINGS')}
            className={chip(panel === 'SETTINGS')}
            data-tip="Chart settings :: Show or hide volume, split/dividend/trade markers and your portfolio price lines, or switch to a logarithmic price scale."
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="md:hidden">Settings</span>
          </button>
        </div>

        {/* Popover panels (outside the scroll row so they are not clipped) */}
        {panel !== 'NONE' && (
          <div className="absolute z-30 left-2 right-2 md:left-auto md:right-4 top-full mt-1 md:w-[380px] max-h-[60vh] overflow-y-auto rounded-md border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface shadow-xl p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-gray-800 dark:text-white">
                {panel === 'INDICATORS' ? 'Indicators' : panel === 'DRAW' ? 'Drawing tools' : panel === 'COMPARE' ? 'Compare with' : 'Chart settings'}
              </span>
              <button onClick={() => setPanel('NONE')} className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close panel">
                <X className="w-4 h-4" />
              </button>
            </div>

            {panel === 'INDICATORS' && (
              <div className="space-y-2">
                {(Object.keys(OVERLAY_META) as OverlayKey[]).map((k) => (
                  <div key={k} className="rounded border border-gray-100 dark:border-kite-darkBorder p-2" data-tip={OVERLAY_META[k].tip}>
                    <label className="flex items-center gap-2 cursor-pointer min-h-[32px]">
                      <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlay(k, e.target.checked)} className="w-4 h-4" />
                      <span className="w-3 h-0.5 rounded" style={{ background: OVERLAY_META[k].color }} />
                      <span className="font-semibold text-gray-800 dark:text-gray-100">{OVERLAY_META[k].label(params)}</span>
                    </label>
                    {overlays[k] && paramInputs(k)}
                  </div>
                ))}
                <div className="rounded border border-gray-100 dark:border-kite-darkBorder p-2">
                  <div className="font-semibold text-gray-800 dark:text-gray-100 mb-1" data-tip="Oscillator pane :: A separate panel below the chart for momentum indicators that move in their own range.">
                    Lower pane
                  </div>
                  <div className="flex gap-1">
                    {(
                      [
                        ['NONE', 'Off', 'Lower pane off :: Hide the oscillator panel to give the price chart more room.'],
                        ['RSI', 'RSI', 'RSI (Relative Strength Index) :: Momentum from 0 to 100. Above 70 = overbought (may pull back), below 30 = oversold (may bounce). :: In strong trends RSI can stay overbought for a long time.'],
                        ['MACD', 'MACD', 'MACD :: Difference between a fast and a slow EMA (blue) and its signal line (orange); bars show the gap. Blue crossing above orange = bullish momentum.'],
                      ] as Array<[OscillatorPane, string, string]>
                    ).map(([k, label, tip]) => (
                      <button key={k} onClick={() => changeOsc(k)} className={chip(oscillator === k)} data-tip={tip}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {oscillator !== 'NONE' && paramInputs(oscillator)}
                </div>
                <button
                  onClick={() => setParams(saveIndicatorParams(DEFAULT_INDICATOR_PARAMS))}
                  className="h-9 px-3 rounded border border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 font-semibold"
                  data-tip="Reset periods :: Restore the standard settings (SMA 20/50/200, EMA 21, BB 20,2, RSI 14, MACD 12/26/9, Supertrend 10,3)."
                >
                  Reset periods to defaults
                </button>
              </div>
            )}

            {panel === 'DRAW' && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5">
                  {DRAWING_TOOL_INFO.map((t) => (
                    <button
                      key={t.kind}
                      onClick={() => {
                        pendingRef.current = null;
                        setTool(t.kind);
                        setSelectedId(null);
                        setPanel('NONE');
                      }}
                      className={`${chip(tool === t.kind)} justify-center`}
                      data-tip={t.tip}
                    >
                      {t.short}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-kite-muted">
                  Pick a tool, then tap/click on the chart ({'1 point for H-Line, 2 points for the others'} — or press and drag). Tap an existing drawing to select it.
                </p>
                {drawings.length > 0 && (
                  <div className="rounded border border-gray-100 dark:border-kite-darkBorder divide-y divide-gray-100 dark:divide-kite-darkBorder">
                    {drawings.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-2 py-1">
                        <button
                          onClick={() => setSelectedId(d.id)}
                          className={`text-left flex-1 min-h-[32px] ${selectedId === d.id ? 'text-kite-blue font-semibold' : 'text-gray-700 dark:text-gray-200'}`}
                          data-tip="Select drawing :: Highlights this drawing on the chart so you can recolour or delete it."
                        >
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: d.color || DEFAULT_DRAWING_COLOR[d.kind] }} />
                          {DRAWING_TOOL_INFO.find((x) => x.kind === d.kind)?.label} · {d.points.map((p) => formatNum(p.price)).join(' → ')}
                        </button>
                        <button
                          onClick={() => {
                            commitDrawings(drawings.filter((x) => x.id !== d.id));
                            if (selectedId === d.id) setSelectedId(null);
                          }}
                          className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded text-kite-muted hover:text-kite-red"
                          aria-label="Delete drawing"
                          data-tip="Delete :: Remove this drawing."
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {drawings.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete all ${drawings.length} drawing(s) on ${dispSym}?`)) {
                        commitDrawings([]);
                        setSelectedId(null);
                      }
                    }}
                    className="h-9 px-3 rounded border border-kite-red/50 text-kite-red font-semibold"
                    data-tip="Clear all :: Delete every drawing on this stock's chart (asks for confirmation)."
                  >
                    Clear all drawings
                  </button>
                )}
              </div>
            )}

            {panel === 'COMPARE' && (
              <div>
                <input
                  autoFocus={!isPhone}
                  value={compareQuery}
                  onChange={(e) => setCompareQuery(e.target.value)}
                  placeholder="Search stock or index (e.g. NIFTY 50)"
                  className="w-full h-10 px-2 mb-2 rounded border border-gray-200 dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface text-gray-800 dark:text-gray-100"
                  data-tip="Search :: Type a symbol or company name to compare against."
                />
                <div className="divide-y divide-gray-100 dark:divide-kite-darkBorder">
                  {compareResults.map((i) => (
                    <button
                      key={i.symbol}
                      onClick={() => {
                        setCompareSymbol(i.symbol);
                        setCompareQuery('');
                        setPanel('NONE');
                      }}
                      className="w-full text-left px-1.5 py-2 min-h-[40px] hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-gray-800 dark:text-gray-100">{getDisplaySymbol(i.symbol, instrumentsMap, profile.blindMode)}</span>
                      <span className="text-[10px] text-kite-muted truncate">
                        {i.isIndex ? 'INDEX' : getDisplayName(i.symbol, instrumentsMap, profile.blindMode)}
                      </span>
                    </button>
                  ))}
                  {compareResults.length === 0 && <div className="py-3 text-center text-kite-muted">No matches</div>}
                </div>
              </div>
            )}

            {panel === 'SETTINGS' && (
              <div className="space-y-1">
                {(
                  [
                    ['volume', 'Volume bars', 'Volume :: Shares traded in each period, shown as bars at the bottom. Big moves on high volume are more trustworthy.'],
                    ['markers', 'Splits, dividends & my trades', 'Markers :: Purple = stock split, blue = dividend, arrows = your own buys and sells (daily chart).'],
                    ['portfolioLines', 'Portfolio lines', 'Portfolio lines :: Dashed lines for your average buy price, open orders, GTT triggers and price alerts.'],
                    ['log', 'Logarithmic scale', 'Log scale :: Equal % moves take equal height, which makes long-term charts (years) easier to read. Off while comparing.'],
                  ] as Array<[keyof ChartPrefs, string, string]>
                ).map(([k, label, tip]) => (
                  <label key={k} className="flex items-center gap-2 min-h-[40px] cursor-pointer" data-tip={tip}>
                    <input type="checkbox" checked={prefs[k]} onChange={(e) => changePrefs({ [k]: e.target.checked })} className="w-4 h-4" />
                    <span className="text-gray-800 dark:text-gray-100">{label}</span>
                  </label>
                ))}
                <button
                  onClick={() => {
                    savedRangeRef.current = null;
                    lastViewKeyRef.current = '';
                    const total = displayBars.length;
                    mainChartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - (isPhone ? 110 : 200)), to: total + 5 });
                    mainChartRef.current?.priceScale('right').applyOptions({ autoScale: true });
                  }}
                  className="h-9 px-3 rounded border border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 font-semibold"
                  data-tip="Reset view :: Zoom back to the default window of recent bars and re-enable auto-scaling."
                >
                  Reset chart view
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active drawing tool / selected drawing bar */}
      {(tool !== 'NONE' || selectedDrawing) && (
        <div className="flex items-center gap-2 px-3 md:px-4 py-1 border-b border-kite-border dark:border-kite-darkBorder bg-amber-50/70 dark:bg-amber-900/10 text-[11px] overflow-x-auto">
          {tool !== 'NONE' ? (
            <>
              <PenLine className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="shrink-0 font-semibold text-gray-700 dark:text-gray-200">
                {DRAWING_TOOL_INFO.find((t) => t.kind === tool)?.label}: {POINTS_NEEDED[tool] === 1 ? 'tap the price level' : 'tap the first point, then the second (or drag)'}
              </span>
              <button onClick={cancelDrawing} className="shrink-0 ml-auto h-9 md:h-6 px-2 rounded border border-gray-300 dark:border-kite-darkBorder font-semibold" data-tip="Cancel :: Stop drawing (Esc).">
                Cancel
              </button>
            </>
          ) : selectedDrawing ? (
            <>
              <span className="shrink-0 font-semibold text-gray-700 dark:text-gray-200">
                {DRAWING_TOOL_INFO.find((t) => t.kind === selectedDrawing.kind)?.label}
              </span>
              {DRAWING_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => commitDrawings(drawings.map((d) => (d.id === selectedDrawing.id ? { ...d, color: c } : d)))}
                  className={`shrink-0 w-7 h-7 md:w-5 md:h-5 rounded-full border-2 ${selectedDrawing.color === c ? 'border-gray-800 dark:border-white' : 'border-transparent'}`}
                  style={{ background: c }}
                  aria-label={`Colour ${c}`}
                  data-tip="Colour :: Change this drawing's colour."
                />
              ))}
              <button
                onClick={() => {
                  commitDrawings(drawings.filter((d) => d.id !== selectedDrawing.id));
                  setSelectedId(null);
                }}
                className="shrink-0 ml-auto h-9 md:h-6 px-2 rounded border border-kite-red/50 text-kite-red font-semibold flex items-center gap-1"
                data-tip="Delete drawing :: Remove the selected drawing (Delete key)."
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              <button onClick={() => setSelectedId(null)} className="shrink-0 h-9 md:h-6 px-2 rounded border border-gray-300 dark:border-kite-darkBorder font-semibold" data-tip="Deselect :: Unselect the drawing (Esc).">
                Done
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Chart area */}
      {!available ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
            {dispSym} was not yet listed on {simDate}
          </div>
          <p className="text-xs text-kite-muted max-w-md">
            {firstDate
              ? `Historical NSE/BSE listing data for this instrument begins on ${firstDate}. Fast-forward past ${firstDate} or pick another stock!`
              : 'Pick another instrument or fast-forward time.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative" onClick={() => panel !== 'NONE' && setPanel('NONE')}>
          {activeBar && (
            <div
              className={`absolute top-1 md:top-2 ${compareActive ? 'left-14' : 'left-2 md:left-3'} z-10 pointer-events-none flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-0.5 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded bg-white/85 dark:bg-kite-darkSurface/85 border border-gray-200/70 dark:border-kite-darkBorder text-[10px] md:text-[11px] font-mono max-w-[calc(100%-5rem)]`}
            >
              <span className="text-kite-muted">
                {typeof activeBar.time === 'number'
                  ? new Date(activeBar.time * 1000).toISOString().slice(isPhone ? 5 : 0, 16).replace('T', ' ')
                  : String(activeBar.time)}
              </span>
              <span>
                O <strong className="text-gray-800 dark:text-white">{formatNum(activeBar.open)}</strong>
              </span>
              <span>
                H <strong className="text-kite-green">{formatNum(activeBar.high)}</strong>
              </span>
              <span>
                L <strong className="text-kite-red">{formatNum(activeBar.low)}</strong>
              </span>
              <span>
                C <strong className={barChg >= 0 ? 'text-kite-green' : 'text-kite-red'}>{formatNum(activeBar.close)}</strong>
              </span>
              <span className={barChg >= 0 ? 'text-kite-green' : 'text-kite-red'}>{formatPct(barChg)}</span>
              <span className="hidden md:inline">
                Vol <strong>{activeBar.volume.toLocaleString('en-IN')}</strong>
              </span>
              {(Object.keys(indicatorData) as OverlayKey[]).map((k) => {
                const v = indicatorData[k]?.map.get(String(activeBar.time));
                return (
                  <span key={k} className="hidden md:inline" style={{ color: OVERLAY_META[k].color }}>
                    {OVERLAY_META[k].label(params)} {v !== undefined ? formatNum(v) : '—'}
                  </span>
                );
              })}
              {compareActive && compareAligned && compareSymbol && (
                <span className="text-orange-500">
                  {getDisplaySymbol(compareSymbol, instrumentsMap, profile.blindMode)} {compareAligned[activeIdx] != null ? formatNum(compareAligned[activeIdx] as number) : '—'}
                </span>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 w-full relative">
            <div ref={mainContainerRef} className="absolute inset-0" />
            {tool !== 'NONE' && (
              <div
                className="absolute inset-0 z-20 cursor-crosshair"
                style={{ touchAction: 'none' }}
                onPointerDown={onOverlayDown}
                onPointerMove={onOverlayMove}
                onPointerUp={onOverlayUp}
                onPointerCancel={() => {
                  downRef.current = null;
                }}
              />
            )}
          </div>

          {oscillator !== 'NONE' && (
            <div className="h-24 md:h-36 border-t border-kite-border dark:border-kite-darkBorder relative shrink-0">
              <div
                className="absolute top-1 left-3 z-10 text-[10px] font-semibold text-kite-muted pointer-events-none"
              >
                {oscillator === 'RSI'
                  ? `RSI (${params.rsiLength}) — 70 overbought / 30 oversold`
                  : `MACD (${params.macdFast}, ${params.macdSlow}, ${params.macdSignal})`}
              </div>
              <div ref={oscContainerRef} className="absolute inset-0" />
            </div>
          )}
        </div>
      )}

      {/* Holding quick bar */}
      {profile.holdings.some((h) => h.symbol === symbol) &&
        (() => {
          const h = profile.holdings.find((x) => x.symbol === symbol)!;
          const totalQty = h.qty + h.t1Qty;
          if (totalQty <= 0) return null;
          const ltp = quote?.ltp || h.avgPrice;
          const pnl = (ltp - h.avgPrice) * totalQty;
          const pnlPct = h.avgPrice > 0 ? ((ltp - h.avgPrice) / h.avgPrice) * 100 : 0;
          return (
            <div className="px-3 md:px-4 py-1.5 md:py-2 border-t border-kite-border dark:border-kite-darkBorder bg-blue-50/50 dark:bg-kite-blue/10 flex items-center justify-between gap-2 text-[11px] md:text-xs overflow-x-auto">
              <div className="flex items-center gap-3 md:gap-4 font-mono shrink-0" data-tip="Your holding :: Shares of this stock in your demat (CNC), your average buy price, current value and unrealised profit/loss.">
                <span className="font-sans font-semibold text-gray-700 dark:text-gray-200">
                  <span className="hidden md:inline">Your CNC holding: </span>
                  <strong>{totalQty} qty</strong>
                </span>
                <span>Avg {formatINR(h.avgPrice)}</span>
                <span className="hidden md:inline">Val {formatINR(totalQty * ltp)}</span>
                <span className={`font-semibold ${pnl >= 0 ? 'text-kite-green' : 'text-kite-red'}`}>
                  {formatINR(pnl, { signed: true })} ({formatPct(pnlPct)})
                </span>
              </div>
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                <button onClick={() => openOrderTicket({ side: 'BUY', symbol })} className="px-2.5 py-1 rounded bg-kite-blue text-white font-semibold text-[11px]" data-tip="Add more :: Buy more shares — your average price will be recalculated.">
                  + Add more
                </button>
                <button onClick={() => openGttModal(symbol, 'SELL')} className="px-2.5 py-1 rounded border border-kite-blue text-kite-blue font-semibold text-[11px]" data-tip="Target / stop-loss GTT :: Create an OCO GTT that sells automatically at your target or stop-loss price.">
                  Set target / SL GTT
                </button>
                <button onClick={() => openOrderTicket({ side: 'SELL', symbol, qty: totalQty })} className="px-2.5 py-1 rounded bg-kite-orange text-white font-semibold text-[11px]" data-tip="Exit holding :: Sell your entire holding of this stock.">
                  Exit holding
                </button>
              </div>
              <button
                onClick={() => openOrderTicket({ side: 'SELL', symbol, qty: totalQty })}
                className="md:hidden shrink-0 h-9 px-3 rounded bg-kite-orange text-white font-semibold"
                data-tip="Exit holding :: Sell your entire holding of this stock."
              >
                Exit
              </button>
            </div>
          );
        })()}

      {/* Phone action bar */}
      {quote?.available && (
        <div className={`md:hidden grid ${isIndex ? 'grid-cols-2' : 'grid-cols-5'} gap-1.5 px-2 py-1.5 border-t border-kite-border dark:border-kite-darkBorder bg-white dark:bg-kite-darkSurface`}>
          {!isIndex && (
            <>
              <button onClick={() => openOrderTicket({ side: 'BUY', symbol })} className={`${actionBtnBase} h-10 bg-kite-blue text-white`} data-tip="Buy :: Open the order window to buy this stock.">
                Buy
              </button>
              <button onClick={() => openOrderTicket({ side: 'SELL', symbol })} className={`${actionBtnBase} h-10 bg-kite-orange text-white`} data-tip="Sell :: Open the order window to sell this stock.">
                Sell
              </button>
              <button onClick={() => openGttModal(symbol)} className={`${actionBtnBase} h-10 border border-gray-300 dark:border-kite-darkBorder text-gray-700 dark:text-gray-200`} data-tip="GTT :: Good Till Triggered — an order that waits for your trigger price for up to a year.">
                <Target className="w-3.5 h-3.5 text-kite-blue" /> GTT
              </button>
            </>
          )}
          <button onClick={() => openAlertModal(symbol)} className={`${actionBtnBase} h-10 border border-gray-300 dark:border-kite-darkBorder text-gray-700 dark:text-gray-200`} data-tip="Alert :: Get notified when the price crosses a level.">
            <Bell className="w-3.5 h-3.5 text-amber-500" /> Alert
          </button>
          <button onClick={() => openFnoModal(symbol)} className={`${actionBtnBase} h-10 border border-gray-300 dark:border-kite-darkBorder text-gray-700 dark:text-gray-200`} data-tip="Option chain :: Futures & options on this underlying.">
            <Activity className="w-3.5 h-3.5 text-kite-orange" /> F&O
          </button>
        </div>
      )}
    </div>
  );
};
