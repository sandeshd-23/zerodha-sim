# Kite Sim — 25+ Year Historical Trading & Investment Simulator

A **Zerodha Kite + Console** style simulator with **26+ years (2000–2026) of real NSE & BSE prices, splits and dividends** for the NIFTY 500, major indices and popular ETFs (~520 instruments).

It runs **entirely on your phone or browser**: the market data and the simulation engine are bundled into an installable web app (PWA) that works **offline** — no PC or server needed after the first load.

## Install on Android (no PC needed afterwards)

1. Publish the app on GitHub Pages once (see *Publishing* below). You get a link like `https://<your-user>.github.io/<repo>/`.
2. Open that link in **Chrome on Android**.
3. Wait for the toast **"Offline mode ready"** (it saves ~35 MB of prices on the phone, once).
4. Chrome menu **⋮ → Add to Home screen → Install**. The app opens full-screen like a native app and works in airplane mode.

Prices refresh automatically every week (a GitHub Action downloads new prices and republishes); the app picks them up the next time you open it while online.

### Moving your existing portfolio to the phone

Portfolios live on the device (IndexedDB). On the PC run:

```bash
npm run export:profiles
```

Copy `profiles-backup.json` to the phone (Drive, WhatsApp to yourself…) and use **Account → Import backup** in the app. Use **Account → Export backup** regularly on the phone as a safety copy.

## Publishing (GitHub Pages, free)

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repo: **Settings → Pages → Source: GitHub Actions**. (The repo must be public on a free plan.)
3. The workflow `.github/workflows/pages.yml` runs on every push and every Saturday: it downloads prices from Yahoo Finance, exports the offline data files, builds the app and deploys it. You can also run it by hand from the **Actions** tab (tick *full_resync* to re-download everything).

> GitHub pauses scheduled workflows after 60 days without repository activity — re-enable it from the Actions tab if the weekly refresh stops.

## Developing on the PC

```bash
npm install
npm run export:data      # build public/data from data/simulator.db (needed once, and after syncing)
npm run dev              # http://localhost:5173 — same offline engine as the phone (runs in a Web Worker)
```

Other commands:

| Command | What it does |
|---|---|
| `npm run sync` | Download any instruments not yet in `data/simulator.db` from Yahoo |
| `npm run export:data -- --sync` | Re-download **all** prices, then export the offline data |
| `npm run dev:server` | Old mode: Express + SQLite server (enables live Yahoo search / "Sync & Add") |
| `npm run build && npm run preview` | Production build incl. service worker, served on port 4173 |
| `npm run parity` | Checks the offline engine gives identical results to the SQLite engine |
| `npm run icons` | Regenerate app icons from `public/icons/logo.svg` |

### Adding more stocks

Edit `universe/extra.csv` (one ticker per line; Yahoo ticker defaults to `SYMBOL.NS`). The NIFTY 500 list lives in `universe/nifty500.csv` and F&O lot sizes in `universe/fo_lots.csv`. The next sync / weekly update includes them.

## Key Features

- **Configurable capital (default ₹2,00,000)**, deposits/withdrawals, pledging holdings for collateral margin, automatic monthly top-ups.
- **Zero future-leakage split/dividend engine:** 2002 prices show 2002 rupees; splits/bonuses adjust holdings and dividends are credited when their dates pass.
- **Time machine:** jump to any date or iconic era (2001, 2003 bull run, 2008 crash, 2020 COVID), Blind mode, +1D/+1W/+1M/+6M/+1Y steps, auto-play, and Intraday Live mode (5-minute candles 09:15–15:30 with 3:20 PM MIS square-off).
- **Kite parity:** 7 watchlists with sort, rename, swipe-to-trade, market depth; order window with CNC/MIS/MTF/NRML, Regular/Cover/AMO/Iceberg, Market/Limit/SL/SL-M, DAY/IOC/TTL validity, disclosed quantity, market protection, attached stoploss/target; GTT single & OCO; price alerts with Alert-Trigger-Orders; baskets & SIPs; Trades tab and order details; Day/Net positions with partial exit and conversions; holdings with pledge and CDSL TPIN authorisation; notifications bell; profile & settings.
- **Charts:** 1m to 1M timeframes, candles/Heikin-Ashi/bars/line/area, SMA/EMA/Bollinger/VWAP/Supertrend/RSI/MACD with adjustable periods, compare, drawing tools, trade markers.
- **F&O:** synthetic futures and Black-Scholes option chains with weekly + monthly expiries, greeks, OI, PCR, max pain and a strategy payoff chart.
- **Console:** portfolio vs NIFTY 50 vs FD, P&L calendar, STCG/LTCG tax report, tradebook journal, funds ledger.
- **Beginner guide:** hover (desktop), long-press (phone) or *Explain mode* (tap anything to learn what it does) on every button, label and column, plus a searchable glossary.

## Keyboard shortcuts (desktop)

| Key | Action |
|---|---|
| `B` / `S` | Buy / Sell the selected instrument |
| `C` or `Enter` | Chart |
| `G` | Create GTT |
| `A` | Create price alert |
| `F` | F&O chain |
| `D` | Toggle market depth |
| `/` | Search instruments |
| `↑` / `↓` | Move through the watchlist |
| `1`–`7` | Switch watchlist |
| `Del` | Remove selected from watchlist |
| `Shift`+`O` / `H` / `P` / `F` / `D` / `C` | Orders / Holdings / Positions / Funds / Dashboard / Console |
| `Esc` | Close windows |

---

Practice simulator with virtual money and historical prices from Yahoo Finance. Not affiliated with or endorsed by Zerodha.
