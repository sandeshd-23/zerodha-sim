/**
 * Beginner help content: the glossary (stable keys, categories, aliases) plus
 * the resolver used by HoverCoach to turn any UI element into a tip card.
 *
 * Element → tip resolution order:
 *   1. `data-tip="Title :: Body :: Tip :: Shortcut"` (explicit text wins)
 *   2. `data-coach="glossaryKey"` (stable glossary lookup)
 *   3. visible text of buttons / headers / labels / selects matched against
 *      UI labels and glossary aliases
 *   4. regex rules for dynamic labels
 *   5. native `title` attribute
 */

export interface TooltipContent {
  title: string;
  body: string;
  tip?: string;
  shortcut?: string;
  /** When set, the card can show "Learn more →" opening this glossary entry. */
  glossaryKey?: string;
}

export const GLOSSARY_CATEGORIES = [
  'Basics',
  'Orders',
  'Products',
  'Charges & taxes',
  'Margins',
  'Charts & indicators',
  'F&O & options',
  'Corporate actions',
  'Console & reports',
  'Simulator',
] as const;

export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface GlossaryEntry {
  key: string;
  category: GlossaryCategory;
  title: string;
  body: string;
  tip?: string;
  shortcut?: string;
  /** Lower-case visible-text synonyms used for automatic matching. */
  aliases?: string[];
  /** Case-sensitive visible-text synonyms (e.g. "1m" vs "1M"). */
  exactAliases?: string[];
}

/**
 * Parses explicit `data-tip` strings formatted as:
 *   "Title :: Explanation :: Optional Beginner Tip :: Optional Shortcut"
 * or plain "Explanation"
 */
export function parseDataTip(raw: string): TooltipContent {
  const parts = raw.split('::').map((p) => p.trim());
  const title = parts[0] || '';
  const body = parts[1] || '';
  const tip = parts[2] || undefined;
  const shortcut = parts[3] || undefined;
  if (parts.length >= 2 && (title || body)) {
    return { title: title || 'Beginner Guide', body, tip, shortcut };
  }
  return { title: 'Beginner Guide', body: title || raw };
}

const g = (
  category: GlossaryCategory,
  key: string,
  title: string,
  body: string,
  extra: Partial<Pick<GlossaryEntry, 'tip' | 'shortcut' | 'aliases' | 'exactAliases'>> = {}
): GlossaryEntry => ({ key, category, title, body, ...extra });

// ---------------------------------------------------------------------------
// GLOSSARY
// ---------------------------------------------------------------------------
export const GLOSSARY: GlossaryEntry[] = [
  // ======================= BASICS =======================
  g('Basics', 'watchlist', 'Marketwatch (Watchlist)',
    'Your personal list of stocks, indices and ETFs with live prices. Hover or tap a stock to Buy, Sell, open its Chart or check Market Depth.',
    { tip: 'You get 7 watchlist tabs (up to 50 instruments each).', aliases: ['watchlist', 'marketwatch'] }),
  g('Basics', 'dashboard', 'Dashboard — Portfolio Overview',
    'Your total account value, available margin, P&L summary, holdings allocation and the day’s top gainers & losers in one place.',
    { aliases: ['dashboard'] }),
  g('Basics', 'holdings', 'Holdings — Long-Term Demat Shares',
    'Shares you bought for delivery (CNC). They sit in your Demat account with no daily fees until you sell.',
    { tip: 'Most long-term investors live in Holdings.', aliases: ['holdings'] }),
  g('Basics', 'positions', 'Positions — Open Short-Term Trades',
    'Today’s intraday (MIS) trades, margin (MTF) trades and Futures & Options contracts that are still open, plus what you closed today.',
    { tip: 'Intraday (MIS) positions are auto-squared off near market close if you forget to exit.', aliases: ['positions'] }),
  g('Basics', 'funds', 'Funds & Margin',
    'Your available cash and margin, money blocked in trades, and controls to add or withdraw virtual money.',
    { aliases: ['funds'] }),
  g('Basics', 'net-worth', 'Net Worth',
    'Everything your account is worth right now: cash + current value of holdings + live profit/loss of open positions.',
    { tip: 'Compare it with the money you deposited to see your true gain.', aliases: ['net worth'] }),
  g('Basics', 'ltp', 'LTP — Last Traded Price',
    'The price at which the most recent trade happened. It is the “current price” you see everywhere.',
    { aliases: ['ltp', 'last price', 'last traded price'] }),
  g('Basics', 'ohlc', 'OHLC — Open, High, Low, Close',
    'The four prices that describe a period: where it opened, the highest and lowest it traded, and where it closed. Every candle on a chart is one OHLC.',
    { aliases: ['ohlc'] }),
  g('Basics', 'open-price', 'Open',
    'The first traded price of the session (NSE opens at 9:15 AM IST after a short pre-open auction).',
    { aliases: ['open', 'open price'] }),
  g('Basics', 'high-price', 'High',
    'The highest price the stock traded at during the period.',
    { aliases: ['high', 'day high'] }),
  g('Basics', 'low-price', 'Low',
    'The lowest price the stock traded at during the period.',
    { aliases: ['low', 'day low'] }),
  g('Basics', 'close-price', 'Close',
    'The official closing price — on NSE it is a weighted average of the last 30 minutes of trading, so it can differ from the very last trade.',
    { aliases: ['close', 'close price'] }),
  g('Basics', 'prev-close', 'Previous Close',
    'Yesterday’s closing price. Today’s change (₹ and %) is measured from this number.',
    { aliases: ['prev close', 'prev. close', 'previous close'] }),
  g('Basics', 'volume', 'Volume',
    'How many shares changed hands in the period. Big moves on high volume are more trustworthy than moves on thin volume.',
    { aliases: ['volume', 'vol', 'vol.'] }),
  g('Basics', 'atp', 'Average Traded Price (ATP)',
    'The average price of all trades today, weighted by quantity. Similar to VWAP for the day.',
    { aliases: ['avg. traded price', 'average traded price', 'atp', 'avg traded price'] }),
  g('Basics', 'bid-ask', 'Bid, Ask / Offer',
    'Bid = the best price buyers are willing to pay. Ask (Kite calls it Offer) = the best price sellers will accept. The gap between them is the spread.',
    { tip: 'A market buy usually fills near the Offer; a market sell near the Bid.', aliases: ['bid', 'ask', 'offer', 'offers', 'bids', 'bid / offer', 'bid/ask'] }),
  g('Basics', 'market-depth', 'Market Depth',
    'The order book: the 5 best buy prices (bids) and 5 best sell prices (offers) with the quantity waiting at each.',
    { tip: 'Thin depth means your order can move the price — use Limit orders.', aliases: ['market depth', 'depth'], shortcut: 'D' }),
  g('Basics', 'total-bid-offer-qty', 'Total Bid / Offer Quantity',
    'Total shares waiting to be bought (bid) and sold (offer) across the whole order book, not just the top 5 levels.',
    { aliases: ['total bid qty', 'total offer qty', 'total bid quantity', 'total offer quantity', 'total'] }),
  g('Basics', 'circuit', 'Upper / Lower Circuit',
    'Daily price limits set by the exchange (2%, 5%, 10% or 20% bands). At the upper circuit there are only buyers; at the lower circuit only sellers, so trading can freeze.',
    { aliases: ['upper circuit', 'lower circuit', 'circuit', 'circuit limits', 'uc', 'lc'] }),
  g('Basics', '52w-high-low', '52-Week High / Low',
    'The highest and lowest prices of the last one year. A stock breaking its 52-week high is often in a strong uptrend.',
    { aliases: ['52w high', '52w low', '52-week high', '52-week low', '52 week high', '52 week low', '52w h/l'] }),
  g('Basics', 't1-settlement', 'T+1 Settlement',
    'Indian stock trades settle one trading day after the trade. Shares you buy show as “T1” and land in your Demat the next day; sale money becomes settled cash the next day.',
    { aliases: ['t+1', 't1', 't1 qty', 't+1 settlement'] }),
  g('Basics', 'dividend', 'Dividend',
    'A share of company profits paid in cash per share. You must hold the shares before the ex-date (record date) to get it. Dividends are taxed at your income slab.',
    { aliases: ['dividend', 'dividends'] }),
  g('Basics', 'nifty50', 'NIFTY 50',
    'NSE’s index of 50 large Indian companies. It is the standard benchmark — if you can’t beat it, a NIFTY index fund/ETF is the simpler choice.',
    { aliases: ['nifty 50', 'nifty'] }),
  g('Basics', 'etf', 'ETF — Exchange Traded Fund',
    'A fund that trades like a stock. NIFTYBEES, for example, tracks the NIFTY 50 so one unit gives you a slice of all 50 companies.',
    { aliases: ['etf', 'etfs'] }),

  // ======================= ORDERS =======================
  g('Orders', 'orders', 'Orders & GTT Book',
    'Orders waiting for your price (Open), orders filled/cancelled today (Executed), GTT triggers and price alerts.',
    { aliases: ['orders'] }),
  g('Orders', 'buy', 'Buy',
    'Opens the blue Buy ticket to purchase shares (or cover a short position).',
    { tip: 'Choose “Longterm CNC” if you want to buy & hold with no leverage.', shortcut: 'B' }),
  g('Orders', 'sell', 'Sell',
    'Opens the orange Sell ticket to sell shares you own, or to short-sell intraday (MIS) if you expect a fall today.',
    { shortcut: 'S' }),
  g('Orders', 'market-order', 'Market Order',
    'Buys or sells right now at the best available price. Fast and simple, but the exact price isn’t guaranteed.',
    { aliases: ['market'] }),
  g('Orders', 'limit-order', 'Limit Order',
    'You set the maximum price to pay (buy) or minimum to accept (sell). It waits in Open Orders until the market reaches your price.',
    { aliases: ['limit'] }),
  g('Orders', 'trigger-price', 'Trigger Price',
    'The price that “wakes up” a stop-loss or GTT order. Until the market touches it, nothing is sent to the exchange.',
    { aliases: ['trigger price', 'trigger', 'trig. price', 'trig.'] }),
  g('Orders', 'stoploss', 'Stop-loss',
    'A pre-planned exit that limits your loss if price moves against you. Decide it before you enter the trade, not after.',
    { aliases: ['stoploss', 'stop loss', 'stop-loss'] }),
  g('Orders', 'sl-order', 'SL — Stop-Loss Limit Order',
    'Sleeps until the Trigger Price is hit, then places a Limit order at your price. Protects you, but may not fill in a very fast fall.',
    { aliases: ['sl'] }),
  g('Orders', 'sl-m-order', 'SL-M — Stop-Loss Market Order',
    'Sleeps until the Trigger Price is hit, then fires a Market order — you get out, but the fill price can slip in a crash.',
    { aliases: ['sl-m', 'slm'] }),
  g('Orders', 'target', 'Target',
    'The price where you plan to book profit. Pair it with a stop-loss (e.g. a GTT OCO) so both exits are automatic.',
    { aliases: ['target', 'target price'] }),
  g('Orders', 'regular-order', 'Regular Order',
    'The normal order used for almost every trade during market hours (9:15 AM – 3:30 PM IST).',
    { tip: 'New to trading? Keep “Regular” selected.', aliases: ['regular'] }),
  g('Orders', 'amo', 'AMO — After Market Order',
    'Lets you queue an order when the market is closed. It is sent to the exchange when the next session opens.',
    { aliases: ['amo', 'after market order'] }),
  g('Orders', 'cover-order', 'Cover Order (CO)',
    'An intraday order that must carry a compulsory stop-loss, so your maximum loss is capped from the start. Gets extra leverage because risk is limited.',
    { aliases: ['cover', 'co', 'cover order'] }),
  g('Orders', 'bracket-order', 'Bracket Order (BO)',
    'An intraday order with both a target and a stop-loss attached. Zerodha discontinued BOs in 2020; use a Cover Order or GTT OCO instead.',
    { aliases: ['bracket', 'bo', 'bracket order'] }),
  g('Orders', 'iceberg', 'Iceberg Order',
    'Splits a large order into several smaller “legs” sent one after another, so you don’t reveal (or move) the market with one huge order.',
    { aliases: ['iceberg', 'iceberg legs', 'legs'] }),
  g('Orders', 'disclosed-qty', 'Disclosed Quantity',
    'Shows only part of your order in market depth; the rest stays hidden and is revealed as each part fills (minimum 10% of quantity for equity).',
    { aliases: ['disclosed qty', 'disclosed qty.', 'disclosed quantity'] }),
  g('Orders', 'validity-day', 'DAY Validity',
    'The order stays active for today’s session and is cancelled automatically at market close if it didn’t fill.',
    { aliases: ['day', 'validity'] }),
  g('Orders', 'ioc', 'IOC — Immediate or Cancel',
    'Fills whatever it can at this instant and cancels the rest immediately instead of waiting.',
    { aliases: ['ioc', 'immediate or cancel'] }),
  g('Orders', 'ttl', 'TTL — Time to Live',
    'A validity in minutes: the order stays open for the number of minutes you choose, then cancels if unfilled.',
    { aliases: ['ttl', 'minutes'] }),
  g('Orders', 'market-protection', 'Market Protection',
    'A safety limit on market and SL-M orders: Kite sends them as limit orders a small % away from LTP so a thin order book can’t give you a terrible fill.',
    { aliases: ['market protection'] }),
  g('Orders', 'gtt', 'GTT — Good Till Triggered',
    'A trigger that watches price for up to 1 year and places your order only when the trigger is hit. No money is blocked until then.',
    { shortcut: 'G', aliases: ['gtt', 'good till triggered'] }),
  g('Orders', 'gtt-single', 'GTT Single',
    'One trigger price, one order — e.g. “buy if it falls to ₹900” or a single stop-loss on a holding.',
    { aliases: ['single'] }),
  g('Orders', 'gtt-oco', 'GTT OCO — One Cancels the Other',
    'A target above and a stop-loss below on shares you own. Whichever hits first executes and the other is cancelled automatically.',
    { aliases: ['oco', 'oco (target+sl)', 'one cancels other'] }),
  g('Orders', 'price-alert', 'Price Alert',
    'Notifies you when a price (or volume/%) condition is met. It doesn’t trade unless you attach an ATO basket.',
    { aliases: ['alert', 'alerts', 'price alert', 'price alerts'] }),
  g('Orders', 'ato', 'ATO — Alert Trigger Order',
    'An alert with a basket of orders attached: when the alert condition hits, the basket is placed automatically.',
    { aliases: ['ato', 'alert trigger order'] }),
  g('Orders', 'basket-order', 'Basket Order',
    'A saved group of up to 20 orders that you can review (with total margin) and place in one click.',
    { aliases: ['basket', 'baskets', 'order baskets', 'basket order'] }),
  g('Orders', 'sip', 'SIP — Systematic Investment Plan',
    'Automatically buys a fixed ₹ amount or quantity every week/month. Averages out market ups and downs and removes emotion.',
    { tip: 'Try “₹10,000 every month into NIFTYBEES”, then fast-forward 10 years.', aliases: ['sip', 'sips', 'automated stock & etf sips', 'stock sip'] }),
  g('Orders', 'order-status', 'Order Status',
    'OPEN = waiting for your limit price · TRIGGER PENDING = waiting for the stop trigger · COMPLETE = filled · REJECTED/CANCELLED = not filled.',
    { aliases: ['status'] }),
  g('Orders', 'modify-order', 'Modify Order',
    'Change the price, trigger or quantity of an open order that hasn’t filled yet.',
    { aliases: ['modify'] }),

  // ======================= PRODUCTS =======================
  g('Products', 'cnc', 'CNC — Cash and Carry (Delivery)',
    'Pay 100% in cash; shares go to your Demat and you can hold them for days or decades. Zerodha charges ₹0 brokerage on delivery.',
    { tip: 'Best choice for beginners and long-term investing.', aliases: ['cnc', 'longterm cnc (1x)', 'longterm', 'delivery', 'longterm cnc'] }),
  g('Products', 'mis', 'MIS — Margin Intraday Squareoff',
    'Same-day trading with leverage (up to 5x on equity). All MIS positions must be closed today — open ones are auto squared-off near close.',
    { tip: 'Leverage multiplies losses as much as profits.', aliases: ['mis', 'intraday mis (5x)', 'intraday', 'intraday mis'] }),
  g('Products', 'nrml', 'NRML — Normal (F&O overnight)',
    'The product for holding Futures & Options overnight, up to the contract’s expiry. Requires full SPAN + exposure margin.',
    { aliases: ['nrml', 'overnight nrml', 'overnight', 'normal'] }),
  g('Products', 'mtf', 'MTF — Margin Trading Facility',
    'Buy delivery shares paying part of the value (e.g. 25%) while the broker funds the rest and charges daily interest (0.04%/day here, ~14.6% a year).',
    { aliases: ['mtf', 'margin mtf (4x)', 'margin trading facility'] }),
  g('Products', 'product-code', 'Product',
    'CNC = long-term delivery · MIS = same-day intraday · MTF = leveraged delivery · NRML = overnight F&O.',
    { aliases: ['product'] }),

  // ======================= CHARGES & TAXES =======================
  g('Charges & taxes', 'brokerage', 'Brokerage',
    'Zerodha’s fee: ₹0 on equity delivery; ₹20 or 0.03% (whichever is lower) per executed intraday/futures order; flat ₹20 per executed options order.',
    { aliases: ['brokerage'] }),
  g('Charges & taxes', 'stt', 'STT — Securities Transaction Tax',
    'A government tax on trades: 0.1% on both buy and sell for delivery, 0.025% on the sell side for intraday. F&O pays STT on the sell side (rates revised in recent budgets).',
    { tip: 'STT is usually the biggest charge on delivery trades.', aliases: ['stt', 'stt/ctt', 'securities transaction tax'] }),
  g('Charges & taxes', 'exchange-charges', 'Exchange Transaction Charges',
    'Fees charged by NSE/BSE on turnover — tiny for shares (about 0.003%) and higher on option premium.',
    { aliases: ['exchange txn charges', 'exchange transaction charges', 'txn charges', 'transaction charges', 'exchange charges'] }),
  g('Charges & taxes', 'sebi-fee', 'SEBI Turnover Fee',
    'SEBI’s regulatory fee: ₹10 per crore of turnover (0.0001%).',
    { aliases: ['sebi fee', 'sebi fees', 'sebi turnover fee', 'sebi'] }),
  g('Charges & taxes', 'stamp-duty', 'Stamp Duty',
    'A state tax charged on the buy side only: 0.015% for delivery, 0.003% for intraday, small rates for F&O.',
    { aliases: ['stamp duty', 'stamp'] }),
  g('Charges & taxes', 'gst', 'GST',
    '18% GST is charged on brokerage, exchange transaction charges and SEBI fees (not on STT or stamp duty).',
    { aliases: ['gst'] }),
  g('Charges & taxes', 'dp-charges', 'DP Charges',
    'A depository fee charged once per stock per day when you sell from your Demat holdings, regardless of quantity (about ₹15–16 incl. GST; ₹15.34 here).',
    { tip: 'Selling 1 share or 1,000 shares costs the same DP charge.', aliases: ['dp charges', 'dp charge', 'dp'] }),
  g('Charges & taxes', 'charges', 'Charges',
    'Everything you paid on a trade besides price: brokerage + STT + exchange charges + SEBI fee + stamp duty + GST (+ DP charges on delivery sells).',
    { aliases: ['charges', 'total charges', 'taxes & charges'] }),
  g('Charges & taxes', 'stcg', 'STCG — Short-Term Capital Gains',
    'Profit on listed shares/equity funds held 12 months or less. Taxed at 20% (for sales on or after 23 July 2024).',
    { aliases: ['stcg', 'short term capital gains', 'short-term capital gains'] }),
  g('Charges & taxes', 'ltcg', 'LTCG — Long-Term Capital Gains',
    'Profit on listed shares/equity funds held more than 12 months. The first ₹1.25 lakh a year is tax-free; the rest is taxed at 12.5%.',
    { tip: 'Holding past one year can cut your tax a lot.', aliases: ['ltcg', 'long term capital gains', 'long-term capital gains'] }),
  g('Charges & taxes', 'intraday-tax', 'Intraday & F&O Tax',
    'Intraday equity profit is “speculative business income”; F&O is “non-speculative business income”. Both are added to your income and taxed at your slab rate.',
    { aliases: ['intraday tax', 'speculative', 'speculative income', 'f&o income', 'business income'] }),
  g('Charges & taxes', 'tax-pnl', 'Tax P&L',
    'Console’s report splitting your realised profits into STCG, LTCG, intraday and F&O buckets, with charges, for filing taxes.',
    { aliases: ['tax p&l', 'tax p&l & charges', 'tax pnl'] }),

  // ======================= MARGINS =======================
  g('Margins', 'available-margin', 'Available Margin',
    'How much you can use for new trades right now: cash + collateral from pledged shares − margin already used.',
    { aliases: ['margin available', 'available margin', 'available margin (cash + collateral)'] }),
  g('Margins', 'used-margin', 'Used Margin',
    'Money currently blocked for open positions and pending orders. It comes back when those positions close or the orders are cancelled.',
    { aliases: ['used margin', 'margins used', 'margin used', 'used margin (positions & open orders)'] }),
  g('Margins', 'margin', 'Margin',
    'The money (or collateral) you must keep aside to hold a trade. With leverage, margin is only a part of the trade’s full value.',
    { aliases: ['margin', 'margin blocked', 'margin required', 'required margin'] }),
  g('Margins', 'available-cash', 'Available Cash',
    'Cash you can use for delivery (CNC) buys and option buying. Collateral margin can’t be used for these.',
    { aliases: ['available cash', 'available cash (for cnc delivery & option buy)', 'cash'] }),
  g('Margins', 'opening-balance', 'Opening Balance',
    'The cash in your account at the start of the day, before today’s trades and pay-ins.',
    { aliases: ['opening balance'] }),
  g('Margins', 'settled-cash', 'Settled vs Unsettled Cash',
    'Settled cash has finished T+1 settlement and is fully yours (withdrawable). Unsettled cash — like today’s sale proceeds — can be traded with but not withdrawn until settlement.',
    { aliases: ['settled cash', 'unsettled cash', 'settled ledger cash balance', 'withdrawable balance'] }),
  g('Margins', 'collateral', 'Collateral (Pledged Holdings)',
    'Margin you get by pledging shares you own, after a “haircut”. Usable for intraday and F&O, but not for buying delivery shares.',
    { aliases: ['collateral', 'pledged collateral', 'collateral (pledged holdings @ 85% after haircut)', 'collateral margin'] }),
  g('Margins', 'pledge', 'Pledge / Unpledge',
    'Pledge locks your Demat shares as collateral so you get margin without selling them. Unpledge releases them so you can sell again.',
    { tip: 'Overnight F&O needs at least 50% of margin in cash (the 50:50 rule).', aliases: ['pledge', 'unpledge', 'pledged', 'pledge qty'] }),
  g('Margins', 'haircut', 'Collateral Haircut',
    'The % cut applied to pledged shares’ value to cover their volatility. A 15% haircut on ₹1,00,000 of shares gives ₹85,000 of margin.',
    { aliases: ['haircut'] }),
  g('Margins', 'span-margin', 'SPAN Margin',
    'The minimum F&O margin set by the exchange, calculated to cover a worst-case one-day loss on your position.',
    { aliases: ['span', 'span margin'] }),
  g('Margins', 'exposure-margin', 'Exposure Margin',
    'An extra buffer the exchange collects on top of SPAN for F&O positions. SPAN + exposure = the margin you need to hold a futures or short option position.',
    { aliases: ['exposure', 'exposure margin'] }),
  g('Margins', 'peak-margin', 'Peak Margin',
    'SEBI rule requiring full upfront margin all day — the exchange checks your margin at random intraday snapshots, so leverage is capped.',
    { aliases: ['peak margin', 'peak margin penalty'] }),
  g('Margins', 'tpin', 'CDSL TPIN / e-DIS Authorisation',
    'Before shares leave your Demat on a sale, CDSL asks you to authorise it with your TPIN (and an OTP). One authorisation is valid for the day.',
    { aliases: ['tpin', 'e-dis', 'edis', 'authorise', 'authorize', 'cdsl tpin'] }),
  g('Margins', 'payin-payout', 'Pay-in / Withdraw',
    'Pay-in adds money to your trading account (instantly via UPI). Withdraw sends unused settled cash back to your bank.',
    { aliases: ['pay-in', 'payin', 'payout', 'withdraw', 'add funds'] }),

  // ======================= CHARTS & INDICATORS =======================
  g('Charts & indicators', 'chart', 'Price Chart',
    'Historical price candles with volume and indicators, so you can study the trend before you trade.',
    { shortcut: 'C', aliases: ['chart'] }),
  g('Charts & indicators', 'candles', 'Candlesticks',
    'Each candle shows Open, High, Low and Close. Green = closed above its open; red = closed below. The thin wicks show the high and low.',
    { aliases: ['candles', 'candlestick', 'candle'] }),
  g('Charts & indicators', 'heikin-ashi', 'Heikin-Ashi',
    'Smoothed candles built from averaged prices. Trends look cleaner (long runs of one colour), but the prices aren’t the real traded prices.',
    { aliases: ['heikin-ashi', 'heikin ashi', 'ha'] }),
  g('Charts & indicators', 'tf-1m', '1-Minute Candles', 'Each candle = 1 minute. Very noisy; used by scalpers.', { exactAliases: ['1m', '1 min'] }),
  g('Charts & indicators', 'tf-3m', '3-Minute Candles', 'Each candle = 3 minutes of trading.', { aliases: ['3m', '3 min'] }),
  g('Charts & indicators', 'tf-5m', '5-Minute Candles',
    'Each candle = 5 minutes (75 candles per 9:15–3:30 session). The most popular intraday timeframe.',
    { aliases: ['5m', '5 min'] }),
  g('Charts & indicators', 'tf-15m', '15-Minute Candles', 'Each candle = 15 minutes — filters out 5-minute noise for cleaner intraday swings.', { aliases: ['15m', '15 min'] }),
  g('Charts & indicators', 'tf-30m', '30-Minute Candles', 'Each candle = 30 minutes; good for spotting the day’s structure.', { aliases: ['30m', '30 min'] }),
  g('Charts & indicators', 'tf-1h', '1-Hour Candles', 'Each candle = 1 hour — popular for swing trades lasting a few days.', { aliases: ['1h', '60m', '1 hour'] }),
  g('Charts & indicators', 'tf-2h', '2-Hour Candles', 'Each candle = 2 hours of trading.', { aliases: ['2h', '2 hour'] }),
  g('Charts & indicators', 'tf-1d', 'Daily Candles', 'Each candle = 1 trading day. The default for investors and positional traders.', { aliases: ['1d', 'day candles', 'daily'] }),
  g('Charts & indicators', 'tf-1w', 'Weekly Candles', 'Each candle = 1 week’s OHLC — ideal for spotting multi-year trends.', { aliases: ['1w', 'weekly'] }),
  g('Charts & indicators', 'tf-1mo', 'Monthly Candles', 'Each candle = 1 month. Shows 10–25 years of wealth creation on one screen.', { exactAliases: ['1M'], aliases: ['1mo', 'monthly'] }),
  g('Charts & indicators', 'sma', 'SMA — Simple Moving Average',
    'The plain average of the last N closes (e.g. 20, 50, 200). Price above a rising SMA suggests an uptrend.',
    { tip: 'The 200-day SMA is the classic long-term trend line.', aliases: ['sma', 'sma 20', 'sma 50', 'sma 200', 'moving average'] }),
  g('Charts & indicators', 'ema', 'EMA — Exponential Moving Average',
    'A moving average that gives more weight to recent prices, so it reacts faster than an SMA.',
    { aliases: ['ema', 'ema 21', 'ema 9', 'ema 50'] }),
  g('Charts & indicators', 'bollinger', 'Bollinger Bands',
    'Bands 2 standard deviations above and below a 20-period SMA. A tight “squeeze” often comes before a big move; touching a band means price is stretched.',
    { aliases: ['bollinger', 'bollinger bands', 'bb'] }),
  g('Charts & indicators', 'vwap', 'VWAP — Volume Weighted Average Price',
    'The day’s average price weighted by volume, reset every session. Intraday traders treat price above VWAP as strong, below as weak.',
    { aliases: ['vwap'] }),
  g('Charts & indicators', 'supertrend', 'Supertrend',
    'A trend line based on ATR (default 10, 3). Green below price in uptrends, red above in downtrends — often used as a trailing stop.',
    { aliases: ['supertrend'] }),
  g('Charts & indicators', 'rsi', 'RSI — Relative Strength Index',
    'Momentum on a 0–100 scale (usually 14 periods). Above 70 = overbought, below 30 = oversold. Strong trends can stay overbought for long.',
    { aliases: ['rsi', 'rsi 14', 'rsi (14)'] }),
  g('Charts & indicators', 'macd', 'MACD',
    'Difference between the 12 and 26 EMAs, with a 9-period signal line. A cross above the signal hints at rising momentum; below, falling.',
    { aliases: ['macd'] }),
  g('Charts & indicators', 'trend-line', 'Trend Line',
    'A drawn line connecting rising lows (uptrend) or falling highs (downtrend). A break of the line can signal a trend change.',
    { aliases: ['trend line', 'trendline', 'line'] }),
  g('Charts & indicators', 'horizontal-line', 'Horizontal Line',
    'A flat line at a price you care about — support, resistance, your entry or your stop.',
    { aliases: ['horizontal line', 'hline', 'h-line'] }),
  g('Charts & indicators', 'fibonacci', 'Fibonacci Retracement',
    'Levels at 23.6%, 38.2%, 50%, 61.8% and 78.6% of a move, where pullbacks often pause.',
    { aliases: ['fibonacci', 'fib', 'fib retracement'] }),
  g('Charts & indicators', 'compare', 'Compare',
    'Overlays another stock or index on the chart in % terms so you can see which performed better.',
    { aliases: ['compare'] }),
  g('Charts & indicators', 'chart-markers', 'Splits, Dividends & Trade Markers',
    'Chart markers for stock splits, bonuses, dividends and your own buy/sell fills.',
    { aliases: ['splits & trades', 'markers'] }),

  // ======================= F&O & OPTIONS =======================
  g('F&O & options', 'fno', 'Futures & Options (F&O)',
    'Derivative contracts on a stock or index that expire on a fixed date. They use leverage — great for hedging, dangerous for guessing.',
    { tip: 'Master long-term CNC investing before F&O.', shortcut: 'F', aliases: ['f&o', 'f&o chain', 'fno', 'derivatives'] }),
  g('F&O & options', 'futures', 'Futures',
    'An agreement to buy/sell an underlying at a set price on expiry. Profit/loss moves almost 1:1 with the underlying × lot size.',
    { aliases: ['futures', 'fut'] }),
  g('F&O & options', 'futures-basis', 'Futures Basis (Premium/Discount)',
    'Futures price − spot price. Usually positive (a premium) because of interest cost, shrinking to zero by expiry.',
    { aliases: ['basis', 'futures basis', 'premium/discount'] }),
  g('F&O & options', 'call-option', 'Call Option (CE)',
    'The right to buy at the strike price. Call buyers profit when the price rises well above strike + premium paid.',
    { aliases: ['ce', 'call', 'calls', 'trade ce', 'call ltp'] }),
  g('F&O & options', 'put-option', 'Put Option (PE)',
    'The right to sell at the strike price. Put buyers profit when the price falls — also used to insure a portfolio.',
    { aliases: ['pe', 'put', 'puts', 'trade pe', 'put ltp'] }),
  g('F&O & options', 'strike', 'Strike Price',
    'The fixed price at which an option can be exercised. The option chain lists many strikes around the current price.',
    { aliases: ['strike', 'strike price'] }),
  g('F&O & options', 'premium', 'Option Premium',
    'The price of an option per unit. Multiply by the lot size for the cost of one lot. Buyers can lose at most the premium paid.',
    { aliases: ['premium', 'option premium'] }),
  g('F&O & options', 'lot-size', 'Lot Size',
    'F&O trades only in fixed multiples called lots (e.g. one NIFTY lot = a set number of units). Exchanges revise lot sizes periodically.',
    { aliases: ['lot size', 'lot', 'lots'] }),
  g('F&O & options', 'expiry', 'Expiry (Weekly / Monthly)',
    'The last day a contract trades. Monthly contracts expire on the last expiry day of the month; index options also have weekly expiries. Current NSE NIFTY expiry is Tuesday (older eras used Thursday).',
    { aliases: ['expiry', 'expiry date', 'weekly expiry', 'monthly expiry'] }),
  g('F&O & options', 'moneyness', 'ATM / ITM / OTM',
    'At-the-money = strike near the current price. In-the-money = has intrinsic value (call strike below price, put strike above). Out-of-the-money = only time value.',
    { tip: 'Cheap OTM options usually expire worthless.', aliases: ['atm', 'itm', 'otm', 'moneyness'] }),
  g('F&O & options', 'oi', 'OI — Open Interest',
    'Number of contracts currently open at a strike. High OI marks liquid strikes and often acts as support/resistance.',
    { aliases: ['oi', 'open interest'] }),
  g('F&O & options', 'oi-change', 'OI Change',
    'How much open interest rose or fell today. Rising OI + rising price = fresh longs; rising OI + falling price = fresh shorts.',
    { aliases: ['oi chg', 'oi chg.', 'oi change', 'chg in oi', 'change in oi'] }),
  g('F&O & options', 'pcr', 'PCR — Put-Call Ratio',
    'Total put OI ÷ total call OI. Around 1 is neutral; very high or very low readings are often read as extreme sentiment.',
    { aliases: ['pcr', 'put call ratio', 'put-call ratio'] }),
  g('F&O & options', 'max-pain', 'Max Pain',
    'The strike at which option buyers together would lose the most (writers gain most) if expiry happened there.',
    { aliases: ['max pain'] }),
  g('F&O & options', 'iv', 'IV — Implied Volatility',
    'The volatility the market is pricing into an option. High IV = expensive premiums (common before events and in crashes).',
    { aliases: ['iv', 'iv%', 'implied volatility'] }),
  g('F&O & options', 'delta', 'Delta',
    'How much the option price moves for a ₹1 move in the underlying. ATM options have delta ≈ 0.5 (calls) or −0.5 (puts).',
    { aliases: ['delta', 'δ'] }),
  g('F&O & options', 'gamma', 'Gamma',
    'How fast delta changes as price moves. Highest for ATM options near expiry — why they can swing wildly.',
    { aliases: ['gamma', 'γ'] }),
  g('F&O & options', 'theta', 'Theta (Time Decay)',
    'How much premium an option loses per day just from time passing. Hurts buyers, helps sellers; speeds up near expiry.',
    { aliases: ['theta', 'θ', 'time decay'] }),
  g('F&O & options', 'vega', 'Vega',
    'How much the premium changes for a 1-point change in implied volatility.',
    { aliases: ['vega', 'ν'] }),
  g('F&O & options', 'payoff', 'Payoff Chart',
    'A graph of your profit/loss at expiry across underlying prices — shows max profit, max loss and breakeven at a glance.',
    { aliases: ['payoff', 'payoff chart', 'payoff graph'] }),

  // ======================= POSITIONS (Basics/Orders) =======================
  g('Basics', 'm2m', 'M2M — Mark to Market',
    'Live profit/loss of open positions at today’s price. For overnight F&O it is settled daily against the previous close.',
    { aliases: ['m2m', 'm2m p&l', 'open positions m2m', 'mark to market'] }),
  g('Basics', 'pnl', 'P&L — Profit & Loss',
    'Green (+) means current value is above what you paid; red (−) means below.',
    { aliases: ['p&l', 'pnl', 'p/l'] }),
  g('Basics', 'realised-pnl', 'Realised vs Unrealised P&L',
    'Realised P&L is locked in by closing a trade. Unrealised P&L is on paper — it changes with price until you exit.',
    { aliases: ['realised p&l', 'realized p&l', 'unrealised p&l', 'unrealized p&l', 'net realized p&l', 'net realised p&l', 'realised', 'unrealised'] }),
  g('Basics', 'day-net-positions', 'Day vs Net Positions',
    'Day shows only trades made today. Net shows everything still open including F&O carried from earlier days.',
    { aliases: ['day positions', 'net positions', 'day / net'] }),
  g('Basics', 'square-off', 'Square Off',
    'Closing a position by placing the opposite order (sell what you bought, buy back what you shorted).',
    { aliases: ['square off', 'square-off', 'squareoff', 'exit'] }),
  g('Basics', 'convert-position', 'Convert Position',
    'Change a position’s product, e.g. MIS → CNC to keep an intraday buy as a delivery holding (requires full cash).',
    { aliases: ['convert', 'convert to cnc', 'convert position'] }),
  g('Basics', 'avg-price', 'Average Price',
    'Your weighted average buy price across purchases. Adjusted automatically for splits and bonuses.',
    { aliases: ['avg. cost', 'avg.', 'avg cost', 'avg. price', 'average price'] }),
  g('Basics', 'net-qty', 'Net Quantity',
    'Positive = long (gain if price rises); negative = short (gain if price falls).',
    { aliases: ['net qty.', 'net qty'] }),
  g('Basics', 'qty', 'Quantity',
    'Number of shares or contract units you own or ordered.',
    { aliases: ['qty.', 'qty', 'quantity'] }),
  g('Basics', 'instrument', 'Instrument',
    'The stock, ETF, index or contract being traded. Tap a symbol in a table to open its chart.',
    { aliases: ['instrument', 'symbol', 'scrip'] }),
  g('Basics', 'current-value', 'Current Value',
    'Quantity × LTP — what your position is worth if sold now.',
    { aliases: ['cur. val', 'current value', 'cur val'] }),
  g('Basics', 'investment', 'Investment',
    'Quantity × average buy price — the money you put into the position.',
    { aliases: ['investment', 'invested'] }),
  g('Basics', 'net-change', 'Net Change %',
    'Total % gain or loss compared with your average price.',
    { aliases: ['net chg.', 'net chg'] }),
  g('Basics', 'day-change', 'Day Change %',
    'Today’s % move compared with the previous close.',
    { aliases: ['day chg.', 'day chg', 'change', 'chg.', 'chg'] }),

  // ======================= CORPORATE ACTIONS =======================
  g('Corporate actions', 'stock-split', 'Stock Split',
    'A company splits each share into more shares (e.g. 1:5). Your quantity goes up, price per share goes down — your total value stays the same.',
    { aliases: ['split', 'splits', 'stock split'] }),
  g('Corporate actions', 'bonus', 'Bonus Issue',
    'Free extra shares given to existing holders (e.g. 1:1 = one free share per share held). Price adjusts down so total value is unchanged.',
    { aliases: ['bonus', 'bonus issue'] }),
  g('Corporate actions', 'ex-date', 'Ex-date / Record Date',
    'To get a dividend, bonus or split you must hold the shares before the ex-date. Buying on/after it doesn’t qualify.',
    { aliases: ['ex-date', 'ex date', 'record date'] }),
  g('Corporate actions', 'corporate-actions', 'Corporate Actions',
    'Company events that change your holding: dividends, splits, bonuses, rights issues, buybacks and mergers.',
    { aliases: ['corporate actions', 'corp actions'] }),

  // ======================= CONSOLE & REPORTS =======================
  g('Console & reports', 'console', 'Console — Reports & Analytics',
    'Zerodha’s back office: P&L calendar, benchmark comparison, XIRR, tax P&L, tradebook and funds ledger.',
    { aliases: ['console'] }),
  g('Console & reports', 'xirr', 'XIRR',
    'Your annualised return that accounts for the timing of every deposit/withdrawal and SIP. The fairest single number for SIP-style investing.',
    { aliases: ['xirr'] }),
  g('Console & reports', 'cagr', 'CAGR — Compound Annual Growth Rate',
    'The steady yearly growth rate that would turn your start value into your end value. Ignores the timing of extra deposits — use XIRR for that.',
    { aliases: ['cagr'] }),
  g('Console & reports', 'max-drawdown', 'Max Drawdown',
    'The biggest peak-to-bottom fall your portfolio suffered. It shows the pain you had to sit through to earn the return.',
    { tip: 'A 50% drawdown needs a 100% gain to recover.', aliases: ['max drawdown', 'drawdown', 'max dd', 'mdd'] }),
  g('Console & reports', 'benchmark', 'Benchmark (NIFTY 50)',
    'Compares your portfolio with simply holding the NIFTY 50 with the same money on the same dates.',
    { aliases: ['benchmark', 'portfolio vs. nifty 50', 'vs nifty'] }),
  g('Console & reports', 'pnl-calendar', 'P&L Heatmap Calendar',
    'Green days were profitable, red days lost money. Great for spotting streaks and overtrading.',
    { aliases: ['p&l heatmap calendar', 'heatmap', 'calendar'] }),
  g('Console & reports', 'tradebook', 'Tradebook',
    'Every executed trade (fill) with date, side, quantity, price and charges.',
    { aliases: ['tradebook', 'tradebook & journal', 'trade book'] }),
  g('Console & reports', 'side', 'Side (Buy / Sell)',
    'BUY means you bought (or covered a short); SELL means you sold (or opened a short).',
    { aliases: ['side', 'type', 'trade type'] }),
  g('Console & reports', 'mindset-tag', 'Mindset Tag (Journal)',
    'Label why you took a trade — Disciplined, FOMO, Panic, Revenge… Reviewing tags shows which habits cost you money.',
    { aliases: ['mindset tag', 'mindset', 'emotion', 'emotion tag', 'journal', 'note', 'notes'] }),
  g('Console & reports', 'ledger', 'Funds Ledger',
    'Bank-passbook style list of every money movement: pay-ins, withdrawals, trade settlements, charges, dividends and interest.',
    { aliases: ['ledger', 'funds statement', 'statement', 'funds ledger'] }),
  g('Console & reports', 'voucher-type', 'Voucher Type',
    'The kind of ledger entry: e.g. bank receipt (pay-in), payment (withdrawal), journal (charges, interest), dividend.',
    { aliases: ['voucher type', 'voucher', 'particulars'] }),
  g('Console & reports', 'debit-credit', 'Debit / Credit',
    'Debit = money going out of your account (purchases, charges, withdrawals). Credit = money coming in (sales, pay-ins, dividends).',
    { aliases: ['debit', 'credit', 'debit/credit', 'dr', 'cr', 'debit / credit'] }),
  g('Console & reports', 'running-balance', 'Running Balance',
    'Your cash balance after each ledger entry.',
    { aliases: ['balance', 'running balance', 'closing balance'] }),
  g('Console & reports', 'turnover', 'Turnover',
    'Total value of all buys and sells. Most charges (exchange, SEBI, STT) are a % of turnover.',
    { aliases: ['turnover'] }),

  // ======================= SIMULATOR =======================
  g('Simulator', 'time-machine', 'Time Machine',
    'This simulator replays real Indian market history. You start on a past date and move time forward with the buttons in the top bar.',
    { tip: 'Fast-forward runs every trading day in between: orders, GTTs, SIPs, splits and dividends all happen.', aliases: ['time machine', 'time-machine'] }),
  g('Simulator', 'auto-play', 'Auto-Play',
    'Advances time automatically at the chosen speed so you can watch the market unfold and react in real time.',
    { aliases: ['auto-play', 'autoplay', 'auto play', 'play'] }),
  g('Simulator', 'investor-mode', 'Investor vs Intraday Mode',
    'Investor mode moves day by day (end-of-day prices). Intraday mode steps through 5-minute candles inside a session for day-trading practice.',
    { aliases: ['investor mode', 'intraday mode', 'investor', 'session mode'] }),
  g('Simulator', 'eras', 'Market Eras',
    'Preset start dates at famous moments — the 2008 crash, 2020 COVID fall, bull runs — so you can practise in different market moods.',
    { aliases: ['era', 'eras', 'historical eras', 'market eras', 'pick an era'] }),
  g('Simulator', 'timelines', 'Timelines (Profiles)',
    'Separate saved simulations, each with its own start date, capital, trades and history. Switch between them anytime.',
    { aliases: ['timeline', 'timelines', 'profile', 'profiles', 'saved timelines'] }),
  g('Simulator', 'start-capital', 'Starting Capital',
    'The virtual money a timeline begins with (default ₹2,00,000). Returns are measured against it plus any later deposits.',
    { aliases: ['starting capital', 'start capital', 'configured starting capital', 'capital', 'initial capital'] }),
  g('Simulator', 'blind-mode', 'Blind Mode',
    'Hides real stock names and dates so hindsight can’t help you — you trade only on the chart, like the future really feels.',
    { tip: 'The best test of whether your strategy works without knowing what happened.', aliases: ['blind mode', 'blind'] }),
  g('Simulator', 'auto-pause', 'Auto-Pause Rules',
    'Auto-Play stops by itself on important events (order fills, GTT triggers, big moves) so you never miss something you need to act on.',
    { aliases: ['auto-pause', 'auto pause', 'auto-pause rules', 'pause on'] }),
  g('Simulator', 'monthly-topup', 'Monthly Savings Top-Up',
    'Adds a fixed amount of new money on the first trading day of every simulated month, like investing part of your salary.',
    { aliases: ['monthly top-up', 'monthly topup', 'top-up', 'monthly savings'] }),
  g('Simulator', 'offline-backup', 'Offline Mode & Backups',
    'Your timelines are stored on this device, so the app works offline. Export a backup file regularly; import it to restore on a new phone or after clearing data.',
    { aliases: ['offline', 'offline mode', 'backup', 'export backup', 'import backup', 'restore'] }),
  g('Simulator', 'tip-modes', 'Beginner Tip Modes',
    'Tips ON: hover (or long-press on a phone) for help. Explain: every tap explains instead of acting. Off: no tips.',
    { aliases: ['tips', 'explain mode', 'tip mode', 'beginner tips'] }),
];

export const GLOSSARY_BY_KEY: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((e) => [e.key, e]));

const ALIAS_INDEX: Record<string, string> = {};
const EXACT_ALIAS_INDEX: Record<string, string> = {};
for (const e of GLOSSARY) {
  for (const a of e.aliases || []) {
    const k = a.toLowerCase();
    if (!(k in ALIAS_INDEX)) ALIAS_INDEX[k] = e.key;
  }
  for (const a of e.exactAliases || []) {
    if (!(a in EXACT_ALIAS_INDEX)) EXACT_ALIAS_INDEX[a] = e.key;
  }
}

export function getGlossaryEntry(key: string | undefined | null): GlossaryEntry | undefined {
  return key ? GLOSSARY_BY_KEY[key] : undefined;
}

export function glossaryToTooltip(e: GlossaryEntry): TooltipContent {
  return { title: e.title, body: e.body, tip: e.tip, shortcut: e.shortcut, glossaryKey: e.key };
}

/**
 * Generic words that are only treated as glossary terms on table headers /
 * labels (a "Close" button must not explain the closing price).
 */
const HEADER_ONLY_WORDS = new Set([
  'open', 'close', 'high', 'low', 'type', 'total', 'cash', 'balance', 'change', 'chg', 'chg.', 'note', 'notes',
  'calendar', 'statement', 'capital', 'profile', 'profiles', 'investor', 'blind', 'line', 'minutes', 'backup',
  'restore', 'offline', 'authorise', 'authorize', 'invested', 'trigger', 'target', 'side', 'mindset',
  'emotion', 'journal', 'symbol', 'scrip', 'premium', 'lot', 'lots', 'call', 'put', 'calls', 'puts', 'ha', 'bb',
  'markers', 'era', 'timeline', 'tips', 'normal', 'delivery', 'intraday', 'overnight', 'longterm', 'play',
]);

/**
 * Finds the glossary key for a piece of visible text (exact case first, then lower-case).
 * `strict` skips generic words that are only meaningful as table headers / labels.
 */
export function findGlossaryKeyForText(text: string, strict = false): string | undefined {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (!raw || raw.length > 60) return undefined;
  if (EXACT_ALIAS_INDEX[raw]) return EXACT_ALIAS_INDEX[raw];
  const lower = raw.toLowerCase();
  const stripped = lower.replace(/\(\d+\)/g, '').replace(/\s+\d+$/, '').replace(/[:*]+$/, '').trim();
  for (const cand of [lower, stripped]) {
    const key = ALIAS_INDEX[cand];
    if (key && !(strict && HEADER_ONLY_WORDS.has(cand))) return key;
  }
  return undefined;
}

/** Simple search used by the glossary sheet. */
export function searchGlossary(query: string, category?: GlossaryCategory | 'All'): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  return GLOSSARY.filter((e) => {
    if (category && category !== 'All' && e.category !== category) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.body.toLowerCase().includes(q) ||
      e.key.includes(q) ||
      (e.aliases || []).some((a) => a.includes(q)) ||
      (e.exactAliases || []).some((a) => a.toLowerCase() === q)
    );
  });
}

// ---------------------------------------------------------------------------
// UI-specific labels (buttons whose meaning is about the app, not a term).
// These take priority over glossary aliases for exact visible-text matches.
// ---------------------------------------------------------------------------
type UiTip = TooltipContent;
const UI_EXACT: Record<string, UiTip> = {
  // Top navigation
  chart: { title: 'Interactive Price Chart', body: 'Historical candlestick chart with volume and technical indicators so you can study the trend before buying or selling.', shortcut: 'C', glossaryKey: 'chart' },
  orders: { title: 'Orders & GTT Book', body: 'Orders waiting for your price (Open), orders completed or cancelled today (Executed), and long-term GTT triggers.', glossaryKey: 'orders' },
  'sip & baskets': { title: 'Stock SIPs & Order Baskets', body: 'Automate fixed weekly/monthly stock or ETF investments as you fast-forward time, or bundle several orders into a 1-click Basket.', tip: 'Try “₹10,000 every month into NIFTYBEES for 10 years”!', glossaryKey: 'sip' },
  funds: { title: 'Funds & Margin Balance', body: 'Check your available cash, margin blocked in trades, add or withdraw virtual money, or change your ₹2,00,000 starting capital.', glossaryKey: 'funds' },
  console: { title: 'Zerodha Console — Analytics & Tax P&L', body: 'P&L calendar heatmap, returns vs NIFTY 50, XIRR, and Indian STCG/LTCG tax estimates.', glossaryKey: 'console' },

  // Time machine
  '+5m': { title: 'Step Forward 5 Minutes', body: 'Advances the clock by one 5-minute candle (9:15 AM – 3:30 PM IST) and checks whether pending Limit or Stop-Loss orders get hit.', glossaryKey: 'time-machine' },
  '+15m': { title: 'Step Forward 15 Minutes', body: 'Advances the intraday clock by three 5-minute candles.', glossaryKey: 'time-machine' },
  '+1h': { title: 'Step Forward 1 Hour', body: 'Advances the intraday session by 12 five-minute candles.', glossaryKey: 'time-machine' },
  '+1d': { title: 'Fast-Forward 1 Trading Day', body: 'Moves to the next NSE trading day (skipping weekends/holidays), settles T+1 shares, runs pending Limit/GTT/SIP orders and credits dividends.', glossaryKey: 'time-machine' },
  '+1 day': { title: 'Fast-Forward 1 Trading Day', body: 'Moves to the next market day, settles T+1 shares, triggers matching Limit/GTT orders and applies splits or dividends.', glossaryKey: 'time-machine' },
  '+1 wk': { title: 'Fast-Forward 1 Week (~5 Trading Days)', body: 'Simulates every trading day of the next week — checking stop-losses, GTTs, SIPs, splits and dividends along the way.', glossaryKey: 'time-machine' },
  '+1 mo': { title: 'Fast-Forward 1 Month (~21 Trading Days)', body: 'Jumps forward 1 month while simulating every day in between (SIPs, F&O expiries, dividends and GTTs all execute).', glossaryKey: 'time-machine' },
  '+6 mo': { title: 'Fast-Forward 6 Months', body: 'Simulates half a year of market history in one click to see how long-term investments behave across cycles.', glossaryKey: 'time-machine' },
  '+1 yr': { title: 'Fast-Forward 1 Full Year', body: 'Simulates ~250 trading days — running SIPs, splits, dividends and GTTs — so you can test multi-year compounding.', glossaryKey: 'time-machine' },
  'auto-play': { title: 'Auto-Play Market Replay', body: 'Advances candles or days hands-free at your chosen speed so you can watch charts unfold and trade in real time.', glossaryKey: 'auto-play' },
  pause: { title: 'Pause Auto-Play', body: 'Freezes time immediately so you can analyse the chart or place orders calmly.', glossaryKey: 'auto-play' },

  // Quick actions
  b: { title: 'Buy (Open Blue Buy Window)', body: 'Opens the Buy order ticket to purchase shares (or cover a short position).', tip: 'Select “Longterm CNC” if you want to buy & hold with zero leverage.', shortcut: 'B', glossaryKey: 'cnc' },
  s: { title: 'Sell (Open Orange Sell Window)', body: 'Opens the Sell ticket to sell shares in Holdings — or short-sell intraday using MIS if you expect a fall today.', shortcut: 'S', glossaryKey: 'mis' },
  'buy (b)': { title: 'Buy This Stock', body: 'Opens the Buy order ticket for the stock you are viewing.', tip: 'Use “Market” for instant purchase or “Limit” to name your maximum price.', shortcut: 'B', glossaryKey: 'limit-order' },
  'sell (s)': { title: 'Sell This Stock', body: 'Opens the Sell ticket to sell from your Demat Holdings or open an intraday short (MIS).', shortcut: 'S', glossaryKey: 'mis' },
  '+ sync & add': { title: 'Download 25-Year History & Add to Watchlist', body: 'Fetches this company’s historical daily prices, splits and dividends from the internet and saves them to your simulator.' },
  '+ sync practice': { title: 'Sync Foreign Stock for Chart Practice', body: 'Real Zerodha trades only NSE/BSE, so US stocks can’t be bought on Kite — sync here if you still want its history for practice.' },
  '25%': { title: 'Use 25% of Available Funds / Shares', body: 'Calculates the quantity using a quarter of your available cash (or 25% of your shares when selling).' },
  '50%': { title: 'Use 50% of Available Funds / Shares', body: 'Fills Quantity using half your available cash or held shares.' },
  '75%': { title: 'Use 75% of Available Funds / Shares', body: 'Fills Quantity using 75% of your available cash or held shares.' },
  max: { title: 'Max Quantity', body: 'The most shares you can afford after leaving a small buffer for taxes & charges (or all your shares when selling CNC).' },
  'place gtt': { title: 'Activate GTT Rule', body: 'Saves this trigger for 365 simulated days. No cash is blocked until the trigger price is hit.', glossaryKey: 'gtt' },
  '+ new gtt': { title: 'Create New GTT Rule', body: 'Set a 1-year buy-the-dip trigger or an OCO target + stop-loss on any stock.', glossaryKey: 'gtt' },
  add: { title: 'Buy More Shares', body: 'Opens the Buy window to add to this holding or position (your average price will change).', glossaryKey: 'avg-price' },
  exit: { title: 'Exit / Sell Position', body: 'Opens a pre-filled opposite order to close the holding or trade and lock in your profit or loss.', glossaryKey: 'square-off' },
  pledge: { title: 'Pledge Shares for Collateral Margin', body: 'Locks your Demat shares as collateral so you get ~85% of their value as extra margin for intraday/F&O (₹30 + GST pledge fee).', glossaryKey: 'pledge' },
  unpledge: { title: 'Unpledge Shares', body: 'Releases your pledged shares so you can sell them again.', glossaryKey: 'pledge' },
  'convert to cnc': { title: 'Convert to Long-Term Delivery (CNC)', body: 'Pays the remaining cash so your MIS/MTF trade becomes a normal Demat holding instead of being squared off.', glossaryKey: 'convert-position' },
  cancel: { title: 'Cancel / Close', body: 'Closes this dialog or cancels the pending order and releases any blocked margin.' },
  modify: { title: 'Modify Pending Order', body: 'Change the Limit price, Trigger price or Quantity of an open order that hasn’t executed yet.', glossaryKey: 'modify-order' },

  // SIP / Console tabs
  'load bluechip template': { title: 'Pre-Fill Bluechip Monthly SIP Example', body: 'Loads a ready-made ₹15,000/month SIP split across HDFCBANK, TCS and RELIANCE so you can see how SIPs work.', glossaryKey: 'sip' },
  'export tradebook csv': { title: 'Download Tradebook as CSV', body: 'Exports all your simulated trades and charges to a CSV file for Excel or Google Sheets.', glossaryKey: 'tradebook' },

  // F&O chain columns kept from v1
  'call ltp': { title: 'Call Option Premium', body: 'Current price of 1 unit of the Call option. Multiply by lot size for the cost of one lot.', glossaryKey: 'premium' },
  'put ltp': { title: 'Put Option Premium', body: 'Current price of 1 unit of the Put option. Multiply by lot size for the cost of one lot.', glossaryKey: 'premium' },
  'trade ce': { title: 'Trade CALL Option (CE — Bullish)', body: 'Buying a Call profits when the price rises sharply before expiry (max loss = premium). Selling a Call collects premium if price stays flat/falls (high risk).', glossaryKey: 'call-option' },
  'trade pe': { title: 'Trade PUT Option (PE — Bearish / Insurance)', body: 'Buying a Put profits when the market falls — great for insuring a portfolio. Selling a Put collects premium if price stays flat/rises.', glossaryKey: 'put-option' },
};

const TEXT_TAGS = new Set(['button', 'th', 'label', 'select', 'summary', 'a']);

function visibleText(el: HTMLElement): string {
  if (el.tagName === 'SELECT') {
    // Use the option labels so selects can be matched by their content.
    return Array.from((el as HTMLSelectElement).options).map((o) => o.text).join(' ');
  }
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Resolves beginner-friendly tooltip content for any UI element.
 */
export function resolveHoverTooltip(el: HTMLElement): TooltipContent | null {
  const coachKey = el.getAttribute('data-coach') || undefined;
  const coachEntry = getGlossaryEntry(coachKey);

  // 1. Explicit `data-tip` attribute takes highest priority
  const explicitTip = el.getAttribute('data-tip');
  if (explicitTip) {
    const parsed = parseDataTip(explicitTip);
    if (coachEntry) return { ...parsed, glossaryKey: coachEntry.key, shortcut: parsed.shortcut || coachEntry.shortcut };
    const key = findGlossaryKeyForText(parsed.title.replace(/\s+[—–(-].*$/, '')) || findGlossaryKeyForText(visibleText(el), true);
    return { ...parsed, glossaryKey: key };
  }

  // 2. Stable glossary key
  if (coachEntry) return glossaryToTooltip(coachEntry);

  // 3. Visible text on buttons, labels, selects, table headers
  const tag = el.tagName.toLowerCase();
  const rawTitle = el.getAttribute('data-orig-title') || el.getAttribute('title') || '';

  if (TEXT_TAGS.has(tag) || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab') {
    const rawText = visibleText(el);
    const lower = rawText.toLowerCase();
    const stripped = lower.replace(/\(\d+\)/g, '').replace(/\s+\d+$/, '').trim();

    if (tag !== 'select') {
      const ui = UI_EXACT[lower] || UI_EXACT[stripped];
      if (ui) return ui;
      const key = findGlossaryKeyForText(rawText, tag !== 'th' && tag !== 'label');
      if (key) return glossaryToTooltip(GLOSSARY_BY_KEY[key]);
    }

    // 4. Pattern-based explanations for dynamic labels
    if (lower.startsWith('open orders')) {
      return { title: 'Open / Pending Orders', body: 'Limit, Stop-Loss and AMO orders waiting for the market to reach your price. Modify or cancel them anytime while open.', glossaryKey: 'order-status' };
    }
    if (lower.startsWith('executed orders')) {
      return { title: 'Executed, Cancelled & Rejected Orders', body: 'Every order that filled, was cancelled, or got rejected (e.g. insufficient funds).', glossaryKey: 'order-status' };
    }
    if (lower.startsWith('gtt triggers')) {
      return { title: 'Active GTT Rules', body: 'Buy-the-dip or stop-loss/target triggers watching the market for up to 365 days.', glossaryKey: 'gtt' };
    }
    if (lower.startsWith('square off all')) {
      return { title: 'Square Off All Open Positions', body: 'Closes every open intraday (MIS), margin (MTF) and F&O trade at market price and moves realised P&L to cash.', glossaryKey: 'square-off' };
    }
    if (lower.startsWith('switch to sell') || lower.startsWith('switch to buy')) {
      return { title: 'Flip Between BUY and SELL', body: 'Switches the order window between Buying (blue) and Selling (orange), keeping your stock and quantity.' };
    }
    if ((lower.startsWith('buy ') || lower.startsWith('sell ')) && lower.length < 28) {
      const buying = lower.startsWith('buy ');
      return {
        title: buying ? 'Place Buy Order' : 'Place Sell Order',
        body: buying
          ? 'Submits your Buy order with realistic Zerodha brokerage & statutory charges.'
          : 'Submits your Sell order (a DP charge applies once per stock per day when selling CNC holdings).',
        glossaryKey: 'charges',
      };
    }
    if (lower.startsWith('add ₹') || lower === '+ deposit') {
      return { title: 'Deposit Virtual Cash (UPI Pay-In)', body: 'Adds virtual ₹ to your trading account immediately so you can test larger portfolios or top up savings.', glossaryKey: 'payin-payout' };
    }
    if (lower.startsWith('withdraw ₹') || lower === '- withdraw') {
      return { title: 'Withdraw Cash to Bank', body: 'Simulates withdrawing unused cash from your trading balance back to your bank.', glossaryKey: 'payin-payout' };
    }
    if (lower === 'update base capital') {
      return { title: 'Set Fixed Starting Capital', body: 'Updates your baseline starting capital (default ₹2,00,000) and adjusts your cash by the difference.', glossaryKey: 'start-capital' };
    }
    if (lower === 'pledge holdings →') {
      return { title: 'Go to Holdings to Pledge Shares', body: 'Pledge Demat shares to unlock collateral margin for F&O or intraday without selling your investments.', glossaryKey: 'pledge' };
    }
    if (/^[+-]\d+%$/.test(lower)) {
      return { title: `Set Trigger ${rawText} from Current Price`, body: `Quick-fills the trigger price ${rawText} away from the Last Traded Price (LTP).`, glossaryKey: 'trigger-price' };
    }
    if (tag === 'select') {
      if (lower.includes('candles') && lower.includes('heikin')) {
        return {
          title: 'Chart Style',
          body: 'Candles show Open, High, Low & Close (green = closed higher than open, red = lower). Heikin-Ashi smooths trends; Line/Area show closing prices only.',
          tip: 'Most traders prefer Candles for spotting rejections and momentum.',
          glossaryKey: 'candles',
        };
      }
      if (lower.includes('rsi') && lower.includes('macd')) {
        return {
          title: 'Momentum Sub-Chart (RSI & MACD)',
          body: 'RSI (0–100) spots stretched prices (>70 overbought, <30 oversold). MACD spots momentum shifts when its line crosses the signal line.',
          glossaryKey: 'rsi',
        };
      }
    }
  }

  // 5. Fallback: upgrade any native `title` attribute into a styled card
  if (rawTitle) {
    if (rawTitle.includes('::')) return parseDataTip(rawTitle);
    return { title: 'Kite Guide', body: rawTitle, glossaryKey: findGlossaryKeyForText(rawTitle, true) };
  }

  return null;
}
