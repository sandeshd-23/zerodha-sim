import type { Instrument } from '../src/types/simulator.ts';

interface RawUniverseItem {
  symbol: string;
  yahooTicker: string;
  name: string;
  sector: string;
  lotSize: number;
  isIndex?: boolean;
  isEtf?: boolean;
}

const RAW_UNIVERSE: RawUniverseItem[] = [
  // === INDICES ===
  { symbol: 'NIFTY 50', yahooTicker: '^NSEI', name: 'Nifty 50 Index', sector: 'Indices', lotSize: 25, isIndex: true },
  { symbol: 'SENSEX', yahooTicker: '^BSESN', name: 'BSE Sensex 30 Index', sector: 'Indices', lotSize: 10, isIndex: true },
  { symbol: 'NIFTY BANK', yahooTicker: '^NSEBANK', name: 'Nifty Bank Index', sector: 'Indices', lotSize: 15, isIndex: true },
  { symbol: 'NIFTY IT', yahooTicker: '^CNXIT', name: 'Nifty IT Index', sector: 'Indices', lotSize: 25, isIndex: true },
  { symbol: 'NIFTY AUTO', yahooTicker: '^CNXAUTO', name: 'Nifty Auto Index', sector: 'Indices', lotSize: 25, isIndex: true },
  { symbol: 'NIFTY PHARMA', yahooTicker: '^CNXPHARMA', name: 'Nifty Pharma Index', sector: 'Indices', lotSize: 25, isIndex: true },
  { symbol: 'NIFTY FMCG', yahooTicker: '^CNXFMCG', name: 'Nifty FMCG Index', sector: 'Indices', lotSize: 25, isIndex: true },

  // === ETFs (Passive / Gold / Debt / International) ===
  { symbol: 'NIFTYBEES', yahooTicker: 'NIFTYBEES.NS', name: 'Nippon India ETF Nifty 50 BeES', sector: 'ETF', lotSize: 1, isEtf: true },
  { symbol: 'JUNIORBEES', yahooTicker: 'JUNIORBEES.NS', name: 'Nippon India ETF Nifty Next 50 Junior BeES', sector: 'ETF', lotSize: 1, isEtf: true },
  { symbol: 'BANKBEES', yahooTicker: 'BANKBEES.NS', name: 'Nippon India ETF Bank BeES', sector: 'ETF', lotSize: 1, isEtf: true },
  { symbol: 'GOLDBEES', yahooTicker: 'GOLDBEES.NS', name: 'Nippon India ETF Gold BeES', sector: 'ETF', lotSize: 1, isEtf: true },
  { symbol: 'LIQUIDBEES', yahooTicker: 'LIQUIDBEES.NS', name: 'Nippon India ETF Liquid BeES', sector: 'ETF', lotSize: 1, isEtf: true },
  { symbol: 'ITBEES', yahooTicker: 'ITBEES.NS', name: 'Nippon India ETF Nifty IT', sector: 'ETF', lotSize: 1, isEtf: true },
  { symbol: 'MON100', yahooTicker: 'MON100.NS', name: 'Motilal Oswal Nasdaq 100 ETF', sector: 'ETF', lotSize: 1, isEtf: true },

  // === BANKING ===
  { symbol: 'HDFCBANK', yahooTicker: 'HDFCBANK.NS', name: 'HDFC Bank Ltd.', sector: 'Banking', lotSize: 550 },
  { symbol: 'ICICIBANK', yahooTicker: 'ICICIBANK.NS', name: 'ICICI Bank Ltd.', sector: 'Banking', lotSize: 700 },
  { symbol: 'SBIN', yahooTicker: 'SBIN.NS', name: 'State Bank of India', sector: 'Banking', lotSize: 750 },
  { symbol: 'KOTAKBANK', yahooTicker: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank Ltd.', sector: 'Banking', lotSize: 400 },
  { symbol: 'AXISBANK', yahooTicker: 'AXISBANK.NS', name: 'Axis Bank Ltd.', sector: 'Banking', lotSize: 625 },
  { symbol: 'INDUSINDBK', yahooTicker: 'INDUSINDBK.NS', name: 'IndusInd Bank Ltd.', sector: 'Banking', lotSize: 500 },
  { symbol: 'BANKBARODA', yahooTicker: 'BANKBARODA.NS', name: 'Bank of Baroda', sector: 'Banking', lotSize: 2925 },
  { symbol: 'PNB', yahooTicker: 'PNB.NS', name: 'Punjab National Bank', sector: 'Banking', lotSize: 8000 },
  { symbol: 'CANBK', yahooTicker: 'CANBK.NS', name: 'Canara Bank', sector: 'Banking', lotSize: 6750 },
  { symbol: 'FEDERALBNK', yahooTicker: 'FEDERALBNK.NS', name: 'The Federal Bank Ltd.', sector: 'Banking', lotSize: 5000 },
  { symbol: 'YESBANK', yahooTicker: 'YESBANK.NS', name: 'Yes Bank Ltd.', sector: 'Banking', lotSize: 15000 },
  { symbol: 'IDFCFIRSTB', yahooTicker: 'IDFCFIRSTB.NS', name: 'IDFC First Bank Ltd.', sector: 'Banking', lotSize: 7500 },

  // === FINANCIALS & NBFCs ===
  { symbol: 'BAJFINANCE', yahooTicker: 'BAJFINANCE.NS', name: 'Bajaj Finance Ltd.', sector: 'Financials', lotSize: 125 },
  { symbol: 'BAJAJFINSV', yahooTicker: 'BAJAJFINSV.NS', name: 'Bajaj Finserv Ltd.', sector: 'Financials', lotSize: 500 },
  { symbol: 'HDFCLIFE', yahooTicker: 'HDFCLIFE.NS', name: 'HDFC Life Insurance Co. Ltd.', sector: 'Financials', lotSize: 1100 },
  { symbol: 'SBILIFE', yahooTicker: 'SBILIFE.NS', name: 'SBI Life Insurance Co. Ltd.', sector: 'Financials', lotSize: 375 },
  { symbol: 'CHOLAFIN', yahooTicker: 'CHOLAFIN.NS', name: 'Cholamandalam Investment & Finance', sector: 'Financials', lotSize: 625 },
  { symbol: 'MUTHOOTFIN', yahooTicker: 'MUTHOOTFIN.NS', name: 'Muthoot Finance Ltd.', sector: 'Financials', lotSize: 550 },
  { symbol: 'SHRIRAMFIN', yahooTicker: 'SHRIRAMFIN.NS', name: 'Shriram Finance Ltd.', sector: 'Financials', lotSize: 300 },
  { symbol: 'PFC', yahooTicker: 'PFC.NS', name: 'Power Finance Corporation Ltd.', sector: 'Financials', lotSize: 1300 },
  { symbol: 'RECLTD', yahooTicker: 'RECLTD.NS', name: 'REC Ltd.', sector: 'Financials', lotSize: 1000 },
  { symbol: 'LICHSGFIN', yahooTicker: 'LICHSGFIN.NS', name: 'LIC Housing Finance Ltd.', sector: 'Financials', lotSize: 1000 },

  // === INFORMATION TECHNOLOGY ===
  { symbol: 'TCS', yahooTicker: 'TCS.NS', name: 'Tata Consultancy Services Ltd.', sector: 'IT', lotSize: 175 },
  { symbol: 'INFY', yahooTicker: 'INFY.NS', name: 'Infosys Ltd.', sector: 'IT', lotSize: 400 },
  { symbol: 'WIPRO', yahooTicker: 'WIPRO.NS', name: 'Wipro Ltd.', sector: 'IT', lotSize: 1500 },
  { symbol: 'HCLTECH', yahooTicker: 'HCLTECH.NS', name: 'HCL Technologies Ltd.', sector: 'IT', lotSize: 350 },
  { symbol: 'TECHM', yahooTicker: 'TECHM.NS', name: 'Tech Mahindra Ltd.', sector: 'IT', lotSize: 600 },
  { symbol: 'IRCTC', yahooTicker: 'IRCTC.NS', name: 'Indian Railway Catering & Tourism Corp', sector: 'Consumer', lotSize: 875 },
  { symbol: 'CDSL', yahooTicker: 'CDSL.NS', name: 'Central Depository Services (India) Ltd.', sector: 'Financials', lotSize: 475 },
  { symbol: 'PERSISTENT', yahooTicker: 'PERSISTENT.NS', name: 'Persistent Systems Ltd.', sector: 'IT', lotSize: 200 },
  { symbol: 'COFORGE', yahooTicker: 'COFORGE.NS', name: 'Coforge Ltd.', sector: 'IT', lotSize: 150 },
  { symbol: 'MPHASIS', yahooTicker: 'MPHASIS.NS', name: 'Mphasis Ltd.', sector: 'IT', lotSize: 275 },
  { symbol: 'TATAELXSI', yahooTicker: 'TATAELXSI.NS', name: 'Tata Elxsi Ltd.', sector: 'IT', lotSize: 100 },

  // === ENERGY, OIL & POWER ===
  { symbol: 'RELIANCE', yahooTicker: 'RELIANCE.NS', name: 'Reliance Industries Ltd.', sector: 'Energy', lotSize: 250 },
  { symbol: 'ONGC', yahooTicker: 'ONGC.NS', name: 'Oil and Natural Gas Corporation', sector: 'Energy', lotSize: 1925 },
  { symbol: 'NTPC', yahooTicker: 'NTPC.NS', name: 'NTPC Ltd.', sector: 'Energy', lotSize: 1500 },
  { symbol: 'POWERGRID', yahooTicker: 'POWERGRID.NS', name: 'Power Grid Corporation of India', sector: 'Energy', lotSize: 1800 },
  { symbol: 'COALINDIA', yahooTicker: 'COALINDIA.NS', name: 'Coal India Ltd.', sector: 'Energy', lotSize: 1050 },
  { symbol: 'TATAPOWER', yahooTicker: 'TATAPOWER.NS', name: 'Tata Power Company Ltd.', sector: 'Energy', lotSize: 1350 },
  { symbol: 'BPCL', yahooTicker: 'BPCL.NS', name: 'Bharat Petroleum Corporation', sector: 'Energy', lotSize: 1800 },
  { symbol: 'IOC', yahooTicker: 'IOC.NS', name: 'Indian Oil Corporation Ltd.', sector: 'Energy', lotSize: 4875 },
  { symbol: 'GAIL', yahooTicker: 'GAIL.NS', name: 'GAIL (India) Ltd.', sector: 'Energy', lotSize: 2250 },
  { symbol: 'ADANIENT', yahooTicker: 'ADANIENT.NS', name: 'Adani Enterprises Ltd.', sector: 'Energy', lotSize: 300 },
  { symbol: 'ADANIPORTS', yahooTicker: 'ADANIPORTS.NS', name: 'Adani Ports and SEZ Ltd.', sector: 'Infra & Cement', lotSize: 400 },
  { symbol: 'SUZLON', yahooTicker: 'SUZLON.NS', name: 'Suzlon Energy Ltd.', sector: 'Energy', lotSize: 10000 },
  { symbol: 'RPOWER', yahooTicker: 'RPOWER.NS', name: 'Reliance Power Ltd.', sector: 'Energy', lotSize: 15000 },

  // === AUTOMOBILES & AUTO ANCIL ===
  { symbol: 'MARUTI', yahooTicker: 'MARUTI.NS', name: 'Maruti Suzuki India Ltd.', sector: 'Auto', lotSize: 50 },
  { symbol: 'TATAMOTORS', yahooTicker: 'TMPV.NS', name: 'Tata Motors Ltd.', sector: 'Auto', lotSize: 550 },
  { symbol: 'M&M', yahooTicker: 'M&M.NS', name: 'Mahindra & Mahindra Ltd.', sector: 'Auto', lotSize: 350 },
  { symbol: 'BAJAJ-AUTO', yahooTicker: 'BAJAJ-AUTO.NS', name: 'Bajaj Auto Ltd.', sector: 'Auto', lotSize: 75 },
  { symbol: 'EICHERMOT', yahooTicker: 'EICHERMOT.NS', name: 'Eicher Motors Ltd.', sector: 'Auto', lotSize: 175 },
  { symbol: 'HEROMOTOCO', yahooTicker: 'HEROMOTOCO.NS', name: 'Hero MotoCorp Ltd.', sector: 'Auto', lotSize: 150 },
  { symbol: 'TVSMOTOR', yahooTicker: 'TVSMOTOR.NS', name: 'TVS Motor Company Ltd.', sector: 'Auto', lotSize: 350 },
  { symbol: 'ASHOKLEY', yahooTicker: 'ASHOKLEY.NS', name: 'Ashok Leyland Ltd.', sector: 'Auto', lotSize: 2500 },
  { symbol: 'MRF', yahooTicker: 'MRF.NS', name: 'MRF Ltd.', sector: 'Auto', lotSize: 5 },
  { symbol: 'BOSCHLTD', yahooTicker: 'BOSCHLTD.NS', name: 'Bosch Ltd.', sector: 'Auto', lotSize: 25 },
  { symbol: 'MOTHERSON', yahooTicker: 'MOTHERSON.NS', name: 'Samvardhana Motherson International', sector: 'Auto', lotSize: 3500 },

  // === FMCG & CONSUMER ===
  { symbol: 'ITC', yahooTicker: 'ITC.NS', name: 'ITC Ltd.', sector: 'FMCG', lotSize: 1600 },
  { symbol: 'HINDUNILVR', yahooTicker: 'HINDUNILVR.NS', name: 'Hindustan Unilever Ltd.', sector: 'FMCG', lotSize: 300 },
  { symbol: 'NESTLEIND', yahooTicker: 'NESTLEIND.NS', name: 'Nestle India Ltd.', sector: 'FMCG', lotSize: 200 },
  { symbol: 'BRITANNIA', yahooTicker: 'BRITANNIA.NS', name: 'Britannia Industries Ltd.', sector: 'FMCG', lotSize: 200 },
  { symbol: 'DABUR', yahooTicker: 'DABUR.NS', name: 'Dabur India Ltd.', sector: 'FMCG', lotSize: 1250 },
  { symbol: 'MARICO', yahooTicker: 'MARICO.NS', name: 'Marico Ltd.', sector: 'FMCG', lotSize: 1200 },
  { symbol: 'GODREJCP', yahooTicker: 'GODREJCP.NS', name: 'Godrej Consumer Products Ltd.', sector: 'FMCG', lotSize: 500 },
  { symbol: 'TATACONSUM', yahooTicker: 'TATACONSUM.NS', name: 'Tata Consumer Products Ltd.', sector: 'FMCG', lotSize: 450 },
  { symbol: 'COLPAL', yahooTicker: 'COLPAL.NS', name: 'Colgate-Palmolive (India) Ltd.', sector: 'FMCG', lotSize: 350 },
  { symbol: 'TITAN', yahooTicker: 'TITAN.NS', name: 'Titan Company Ltd.', sector: 'Consumer', lotSize: 175 },
  { symbol: 'ASIANPAINT', yahooTicker: 'ASIANPAINT.NS', name: 'Asian Paints Ltd.', sector: 'Consumer', lotSize: 200 },
  { symbol: 'BERGEPAINT', yahooTicker: 'BERGEPAINT.NS', name: 'Berger Paints India Ltd.', sector: 'Consumer', lotSize: 1320 },
  { symbol: 'PIDILITIND', yahooTicker: 'PIDILITIND.NS', name: 'Pidilite Industries Ltd.', sector: 'Chemicals', lotSize: 250 },
  { symbol: 'PAGEIND', yahooTicker: 'PAGEIND.NS', name: 'Page Industries Ltd.', sector: 'Consumer', lotSize: 15 },
  { symbol: 'TRENT', yahooTicker: 'TRENT.NS', name: 'Trent Ltd.', sector: 'Consumer', lotSize: 100 },
  { symbol: 'DMART', yahooTicker: 'DMART.NS', name: 'Avenue Supermarts Ltd.', sector: 'Consumer', lotSize: 150 },
  { symbol: 'HAVELLS', yahooTicker: 'HAVELLS.NS', name: 'Havells India Ltd.', sector: 'Consumer', lotSize: 500 },
  { symbol: 'VOLTAS', yahooTicker: 'VOLTAS.NS', name: 'Voltas Ltd.', sector: 'Consumer', lotSize: 300 },
  { symbol: 'INDIGO', yahooTicker: 'INDIGO.NS', name: 'InterGlobe Aviation Ltd.', sector: 'Consumer', lotSize: 150 },
  { symbol: 'ETERNAL', yahooTicker: 'ETERNAL.NS', name: 'Eternal Ltd. (Zomato)', sector: 'Consumer', lotSize: 2000 },
  { symbol: 'ZEEL', yahooTicker: 'ZEEL.NS', name: 'Zee Entertainment Enterprises', sector: 'Consumer', lotSize: 3000 },

  // === PHARMA & HEALTHCARE ===
  { symbol: 'SUNPHARMA', yahooTicker: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical Industries', sector: 'Pharma', lotSize: 350 },
  { symbol: 'DRREDDY', yahooTicker: 'DRREDDY.NS', name: 'Dr. Reddys Laboratories Ltd.', sector: 'Pharma', lotSize: 125 },
  { symbol: 'CIPLA', yahooTicker: 'CIPLA.NS', name: 'Cipla Ltd.', sector: 'Pharma', lotSize: 650 },
  { symbol: 'DIVISLAB', yahooTicker: 'DIVISLAB.NS', name: 'Divis Laboratories Ltd.', sector: 'Pharma', lotSize: 200 },
  { symbol: 'LUPIN', yahooTicker: 'LUPIN.NS', name: 'Lupin Ltd.', sector: 'Pharma', lotSize: 425 },
  { symbol: 'AUROPHARMA', yahooTicker: 'AUROPHARMA.NS', name: 'Aurobindo Pharma Ltd.', sector: 'Pharma', lotSize: 550 },
  { symbol: 'BIOCON', yahooTicker: 'BIOCON.NS', name: 'Biocon Ltd.', sector: 'Pharma', lotSize: 2500 },
  { symbol: 'APOLLOHOSP', yahooTicker: 'APOLLOHOSP.NS', name: 'Apollo Hospitals Enterprise', sector: 'Pharma', lotSize: 125 },
  { symbol: 'TORNTPHARM', yahooTicker: 'TORNTPHARM.NS', name: 'Torrent Pharmaceuticals Ltd.', sector: 'Pharma', lotSize: 250 },

  // === METALS & MINING ===
  { symbol: 'TATASTEEL', yahooTicker: 'TATASTEEL.NS', name: 'Tata Steel Ltd.', sector: 'Metals', lotSize: 5500 },
  { symbol: 'JSWSTEEL', yahooTicker: 'JSWSTEEL.NS', name: 'JSW Steel Ltd.', sector: 'Metals', lotSize: 675 },
  { symbol: 'HINDALCO', yahooTicker: 'HINDALCO.NS', name: 'Hindalco Industries Ltd.', sector: 'Metals', lotSize: 1400 },
  { symbol: 'VEDL', yahooTicker: 'VEDL.NS', name: 'Vedanta Ltd.', sector: 'Metals', lotSize: 1150 },
  { symbol: 'SAIL', yahooTicker: 'SAIL.NS', name: 'Steel Authority of India Ltd.', sector: 'Metals', lotSize: 4700 },
  { symbol: 'NMDC', yahooTicker: 'NMDC.NS', name: 'NMDC Ltd.', sector: 'Metals', lotSize: 4500 },

  // === INFRA, CAPITAL GOODS, DEFENCE & CEMENT ===
  { symbol: 'LT', yahooTicker: 'LT.NS', name: 'Larsen & Toubro Ltd.', sector: 'Infra & Cement', lotSize: 150 },
  { symbol: 'ULTRACEMCO', yahooTicker: 'ULTRACEMCO.NS', name: 'UltraTech Cement Ltd.', sector: 'Infra & Cement', lotSize: 100 },
  { symbol: 'GRASIM', yahooTicker: 'GRASIM.NS', name: 'Grasim Industries Ltd.', sector: 'Infra & Cement', lotSize: 250 },
  { symbol: 'SHREECEM', yahooTicker: 'SHREECEM.NS', name: 'Shree Cement Ltd.', sector: 'Infra & Cement', lotSize: 25 },
  { symbol: 'AMBUJACEM', yahooTicker: 'AMBUJACEM.NS', name: 'Ambuja Cements Ltd.', sector: 'Infra & Cement', lotSize: 900 },
  { symbol: 'ACC', yahooTicker: 'ACC.NS', name: 'ACC Ltd.', sector: 'Infra & Cement', lotSize: 300 },
  { symbol: 'SIEMENS', yahooTicker: 'SIEMENS.NS', name: 'Siemens Ltd.', sector: 'Infra & Cement', lotSize: 125 },
  { symbol: 'ABB', yahooTicker: 'ABB.NS', name: 'ABB India Ltd.', sector: 'Infra & Cement', lotSize: 125 },
  { symbol: 'BHEL', yahooTicker: 'BHEL.NS', name: 'Bharat Heavy Electricals Ltd.', sector: 'Infra & Cement', lotSize: 2625 },
  { symbol: 'BEL', yahooTicker: 'BEL.NS', name: 'Bharat Electronics Ltd.', sector: 'Infra & Cement', lotSize: 2850 },
  { symbol: 'HAL', yahooTicker: 'HAL.NS', name: 'Hindustan Aeronautics Ltd.', sector: 'Infra & Cement', lotSize: 150 },
  { symbol: 'DLF', yahooTicker: 'DLF.NS', name: 'DLF Ltd.', sector: 'Infra & Cement', lotSize: 825 },

  // === TELECOM & CHEMICALS ===
  { symbol: 'BHARTIARTL', yahooTicker: 'BHARTIARTL.NS', name: 'Bharti Airtel Ltd.', sector: 'Telecom', lotSize: 475 },
  { symbol: 'IDEA', yahooTicker: 'IDEA.NS', name: 'Vodafone Idea Ltd.', sector: 'Telecom', lotSize: 40000 },
  { symbol: 'SRF', yahooTicker: 'SRF.NS', name: 'SRF Ltd.', sector: 'Chemicals', lotSize: 375 },
  { symbol: 'UPL', yahooTicker: 'UPL.NS', name: 'UPL Ltd.', sector: 'Chemicals', lotSize: 1300 },
];

const sectorCounters: Record<string, number> = {};

export const DEFAULT_UNIVERSE: Instrument[] = RAW_UNIVERSE.map((item) => {
  const prefix = item.sector
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
  sectorCounters[prefix] = (sectorCounters[prefix] || 0) + 1;
  const idx = String(sectorCounters[prefix]).padStart(2, '0');
  return {
    symbol: item.symbol,
    yahooTicker: item.yahooTicker,
    name: item.name,
    blindSymbol: item.isIndex ? `IDX-${idx}` : item.isEtf ? `ETF-${idx}` : `${prefix}-${idx}`,
    blindName: item.isIndex
      ? `Market Benchmark Index #${idx}`
      : item.isEtf
        ? `${item.sector} Passive Fund #${idx}`
        : `${item.sector} Company #${idx}`,
    exchange: item.isIndex ? 'INDICES' : 'NSE',
    sector: item.sector,
    lotSize: item.lotSize,
    isIndex: Boolean(item.isIndex),
    isEtf: Boolean(item.isEtf),
  };
});

export { HISTORICAL_ERAS } from '../src/market/eras.ts';
