"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bell, ChevronDown, Clock3, Gauge, Menu, Moon, RefreshCw, Search, Settings2, Sparkles, Star, Sun, TrendingUp, UserRound } from "lucide-react";

type Point = { label: string; value: number; open?: number; high?: number; low?: number; volume?: number };
type Factor = { name: string; value: number; signal: string; detail: string };
type Market = { symbol: string; price: number; change: number; changePercent: number; source: string; updatedAt: string; marketState?: string; currency?: string; series: Point[]; explanation: { factors: Factor[]; summary: string; window: number }; backtest: { directionalAccuracy: number | null; mae: number | null; samples: number; status: string; window?: string }; forecast: { target: number; horizon: string; confidence: number; low: number; high: number; model?: string } };
type ChartRange = "1W" | "1M" | "3M";
type ChartType = "line" | "area" | "candles" | "volume";
type Theme = "day" | "night";

const fallback: Market = {
  symbol: "NVDA", price: 141.2, change: 2.86, changePercent: 2.07, source: "demo", updatedAt: new Date().toISOString(),
  series: Array.from({ length: 42 }, (_, index) => ({ label: `${index + 1}D`, value: 128 + index * 0.82 + Math.sin(index / 2.8) * 4.8 })),
  explanation: { factors: [{ name: "Short-term momentum", value: 2.4, signal: "positive", detail: "Five-session price direction" }, { name: "Trend strength", value: 24.2, signal: "positive", detail: "Observed period price direction" }, { name: "Volatility", value: 1.2, signal: "stable", detail: "Recent daily movement dispersion" }], summary: "Momentum and trend are aligned", window: 10 },
  backtest: { directionalAccuracy: 75, mae: 1.42, samples: 20, status: "validated", window: "Recent holdout" },
  forecast: { target: 152.01, horizon: "30D", confidence: 81, low: 144.38, high: 161.26, model: "baseline" },
};

const watchlistCatalog = [
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
];
const stockSuggestions = [
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "META", name: "Meta Platforms, Inc." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices" },
  { symbol: "PLTR", name: "Palantir Technologies" },
  { symbol: "COIN", name: "Coinbase Global" },
  { symbol: "NFLX", name: "Netflix, Inc." },
  { symbol: "SPY", name: "SPDR S&P 500 ETF" },
  { symbol: "QQQ", name: "Invesco NASDAQ 100 ETF" },
  { symbol: "AVGO", name: "Broadcom Inc." },
  { symbol: "ORCL", name: "Oracle Corp." },
  { symbol: "CRM", name: "Salesforce, Inc." },
  { symbol: "ADBE", name: "Adobe Inc." },
  { symbol: "INTC", name: "Intel Corp." },
  { symbol: "QCOM", name: "Qualcomm Inc." },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "V", name: "Visa Inc." },
  { symbol: "MA", name: "Mastercard Inc." },
  { symbol: "WMT", name: "Walmart Inc." },
  { symbol: "COST", name: "Costco Wholesale Corp." },
  { symbol: "KO", name: "The Coca-Cola Company" },
  { symbol: "PEP", name: "PepsiCo, Inc." },
  { symbol: "LLY", name: "Eli Lilly and Company" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "XOM", name: "Exxon Mobil Corp." },
  { symbol: "CVX", name: "Chevron Corp." },
  { symbol: "BA", name: "The Boeing Company" },
  { symbol: "DIS", name: "The Walt Disney Company" },
  { symbol: "UBER", name: "Uber Technologies" },
  { symbol: "ABNB", name: "Airbnb, Inc." },
  { symbol: "SPOT", name: "Spotify Technology" },
  { symbol: "SHOP", name: "Shopify Inc." },
  { symbol: "IWM", name: "iShares Russell 2000 ETF" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF" },
  { symbol: "GCB.GH", name: "GCB Bank PLC (Ghana)" },
  { symbol: "MTNGH.GH", name: "MTN Ghana PLC" },
  { symbol: "EGH.GH", name: "Ecobank Ghana PLC" },
  { symbol: "SCB.GH", name: "Standard Chartered Bank Ghana" },
  { symbol: "GOIL.GH", name: "Ghana Oil Company PLC" },
  { symbol: "FML.GH", name: "Fan Milk PLC (Ghana)" },
  { symbol: "SOGEGH.GH", name: "Societe Generale Ghana" },
  { symbol: "TLW.GH", name: "Tullow Oil PLC (Ghana)" },
  { symbol: "SCOM.NR", name: "Safaricom PLC (Kenya)" },
  { symbol: "EABL.NR", name: "East African Breweries (Kenya)" },
  { symbol: "DANGCEM.LG", name: "Dangote Cement (Nigeria)" },
  { symbol: "MTNN.LG", name: "MTN Nigeria Communications" },
  { symbol: "NPN.JO", name: "Naspers Limited (South Africa)" },
  { symbol: "MTN.JO", name: "MTN Group (South Africa)" },
  { symbol: "SHP.JO", name: "Shoprite Holdings (South Africa)" },
];
const initialMarketSymbols = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "AMD", "AVGO", "JPM", "SPY", "QQQ"];
const defaultWatchlistSymbols = watchlistCatalog.map((item) => item.symbol);

const companyNames: Record<string, string> = {
  NVDA: "NVIDIA Corp.",
  AAPL: "Apple Inc.",
  TSLA: "Tesla, Inc.",
  MSFT: "Microsoft Corp.",
  AMZN: "Amazon.com, Inc.",
  META: "Meta Platforms, Inc.",
  GOOGL: "Alphabet Inc.",
  AMD: "Advanced Micro Devices",
  PLTR: "Palantir Technologies",
  COIN: "Coinbase Global",
  NFLX: "Netflix, Inc.",
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco NASDAQ 100 ETF",
  AVGO: "Broadcom Inc.",
  ORCL: "Oracle Corp.",
  CRM: "Salesforce, Inc.",
  ADBE: "Adobe Inc.",
  INTC: "Intel Corp.",
  QCOM: "Qualcomm Inc.",
  JPM: "JPMorgan Chase & Co.",
  V: "Visa Inc.",
  MA: "Mastercard Inc.",
  WMT: "Walmart Inc.",
  COST: "Costco Wholesale Corp.",
  KO: "The Coca-Cola Company",
  PEP: "PepsiCo, Inc.",
  LLY: "Eli Lilly and Company",
  JNJ: "Johnson & Johnson",
  XOM: "Exxon Mobil Corp.",
  CVX: "Chevron Corp.",
  BA: "The Boeing Company",
  DIS: "The Walt Disney Company",
  UBER: "Uber Technologies",
  ABNB: "Airbnb, Inc.",
  SPOT: "Spotify Technology",
  SHOP: "Shopify Inc.",
  IWM: "iShares Russell 2000 ETF",
  DIA: "SPDR Dow Jones Industrial Average ETF",
  "GCB.GH": "GCB Bank PLC (Ghana)",
  "MTNGH.GH": "MTN Ghana PLC",
  "EGH.GH": "Ecobank Ghana PLC",
  "SCB.GH": "Standard Chartered Bank Ghana",
  "GOIL.GH": "Ghana Oil Company PLC",
  "FML.GH": "Fan Milk PLC (Ghana)",
  "SOGEGH.GH": "Societe Generale Ghana",
  "TLW.GH": "Tullow Oil PLC (Ghana)",
  "SCOM.NR": "Safaricom PLC (Kenya)",
  "EABL.NR": "East African Breweries (Kenya)",
  "DANGCEM.LG": "Dangote Cement (Nigeria)",
  "MTNN.LG": "MTN Nigeria Communications",
  "NPN.JO": "Naspers Limited (South Africa)",
  "MTN.JO": "MTN Group (South Africa)",
  "SHP.JO": "Shoprite Holdings (South Africa)",
};

function money(value: number) { return `$${value.toFixed(2)}`; }

function PriceChart({ market, range, chartType }: { market: Market; range: ChartRange; chartType: ChartType }) {
  const width = 840;
  const height = 286;
  const rangeLength = { "1W": 7, "1M": 30, "3M": 90 }[range];
  const visibleSeries = market.series.slice(-rangeLength);
  const values = visibleSeries.map((point) => point.value);
  const candleValues = visibleSeries.flatMap((point) => [
    point.open ?? point.value,
    point.value,
    point.high ?? point.value,
    point.low ?? point.value,
  ]);
  const volumeValues = visibleSeries.map((point) => point.volume ?? 0);
  const chartValues = chartType === "candles" ? candleValues : chartType === "volume" ? volumeValues : values;
  const dataMin = Math.min(...chartValues);
  const dataMax = Math.max(...chartValues);
  const padding = Math.max((dataMax - dataMin) * 0.08, dataMax * 0.005, 0.01);
  const min = dataMin - padding;
  const max = dataMax + padding;
  const valueY = (value: number) => height - ((value - min) / Math.max(max - min, 0.0001)) * height;
  const axisValues = [max, max - (max - min) / 3, max - ((max - min) * 2) / 3, min];
  const formatAxisValue = (value: number) => chartType === "volume"
    ? `${(value / 1_000_000).toFixed(1)}M`
    : `$${value.toFixed(2)}`;
  const points = visibleSeries.map((point, index) => {
    const x = (index / Math.max(visibleSeries.length - 1, 1)) * width;
    const y = valueY(point.value);
    return `${x},${y}`;
  }).join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  return <div className="chart-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${market.symbol} price chart`} preserveAspectRatio="none">
      <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b8f26a" stopOpacity=".22" /><stop offset="100%" stopColor="#b8f26a" stopOpacity="0" /></linearGradient></defs>
      {axisValues.map((axisValue, index) => <g key={axisValue}><line x1="0" x2={width} y1={(height / 3) * index} y2={(height / 3) * index} className="chart-grid" /><text x="8" y={(height / 3) * index - (index === 0 ? -12 : 4)} className="chart-label">{formatAxisValue(axisValue)}</text></g>)}
      {chartType === "area" && <polygon points={area} fill="url(#chartFill)" />}
      {(chartType === "line" || chartType === "area") && <><polyline points={points} fill="none" stroke="#b8f26a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /><circle cx={width} cy={valueY(values.at(-1)!)} r="5" fill="#b8f26a" /></>}
      {chartType === "candles" && visibleSeries.map((point, index) => {
        const candleSlot = width / visibleSeries.length;
        const candleWidth = Math.max(5, candleSlot * 0.58);
        const x = candleSlot * (index + 0.5);
        const open = point.open ?? point.value;
        const close = point.value;
        const high = Math.max(point.high ?? close, open, close);
        const low = Math.min(point.low ?? close, open, close);
        const rising = close >= open;
        const bodyTop = Math.min(valueY(open), valueY(close));
        const bodyHeight = Math.max(2, Math.abs(valueY(open) - valueY(close)));
        return <g key={`${point.label}-${index}`} className={rising ? "candle-up" : "candle-down"}><line x1={x} x2={x} y1={valueY(high)} y2={valueY(low)} /><rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} /></g>;
      })}
      {chartType === "volume" && visibleSeries.map((point, index) => { const barWidth = Math.max(5, width / visibleSeries.length * 0.65); const x = (index / Math.max(visibleSeries.length - 1, 1)) * width; const barHeight = height - valueY(point.volume ?? 0); return <rect key={`${point.label}-${index}`} className={point.value >= (point.open ?? point.value) ? "volume-up" : "volume-down"} x={x - barWidth / 2} y={height - barHeight} width={barWidth} height={barHeight} />; })}
    </svg>
    <div className="chart-axis"><span>{visibleSeries[0]?.label}</span><span>{range}</span><span>{visibleSeries.at(-1)?.label}</span></div>
  </div>;
}

export default function Home() {
  const [symbol, setSymbol] = useState("NVDA");
  const marketRequestVersion = useRef(0);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, { price: number; change: number; changePercent: number; source: string }>>({});
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<Market>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() => {
    if (typeof window === "undefined") return defaultWatchlistSymbols;
    const storedWatchlist = window.localStorage.getItem("stockinsider-watchlist");
    if (!storedWatchlist) return defaultWatchlistSymbols;
    try {
      const parsed = JSON.parse(storedWatchlist);
      return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : defaultWatchlistSymbols;
    } catch {
      return defaultWatchlistSymbols;
    }
  });
  const [chartRange, setChartRange] = useState<ChartRange>("1M");
  const [chartType, setChartType] = useState<ChartType>("area");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelDetailsOpen, setModelDetailsOpen] = useState(false);
  const [showAllMovers, setShowAllMovers] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState(fallback.updatedAt);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "night";
    const storedTheme = window.localStorage.getItem("stockinsider-theme");
    return storedTheme === "day" || storedTheme === "night" ? storedTheme : "night";
  });

  async function loadMarket(nextSymbol = symbol) {
    const normalized = nextSymbol.trim().toUpperCase();
    if (!normalized) return;
    const requestVersion = ++marketRequestVersion.current;
    setLoading(true); setError(""); setSymbol(normalized);
    try {
      const response = await fetch(`/api/market?symbol=${encodeURIComponent(normalized)}`);
      if (!response.ok) throw new Error("Market feed unavailable");
      const nextMarket: Market = await response.json();
      if (requestVersion !== marketRequestVersion.current) return;
      setMarket(nextMarket);
      setLiveQuotes((current) => ({ ...current, [nextMarket.symbol]: nextMarket }));
      setLastSuccessfulUpdate(nextMarket.updatedAt);
    } catch {
      if (requestVersion !== marketRequestVersion.current) return;
      setError(`${normalized} is unavailable right now. No price was returned.`);
      setSymbol(market.symbol);
    } finally {
      if (requestVersion === marketRequestVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    const requestVersion = ++marketRequestVersion.current;
    async function loadBestPerformingStock() {
      try {
        const responses = await Promise.all(initialMarketSymbols.map(async (candidate) => {
          const response = await fetch(`/api/market?symbol=${candidate}`);
          if (!response.ok) return null;
          return response.json() as Promise<Market>;
        }));
        const bestMarket = responses.filter((candidate): candidate is Market => candidate !== null).sort((left, right) => right.changePercent - left.changePercent)[0];
        if (!bestMarket) throw new Error("No market data available");
        if (requestVersion !== marketRequestVersion.current) return;
        setSymbol(bestMarket.symbol);
        setMarket(bestMarket);
        setLiveQuotes((current) => ({ ...current, [bestMarket.symbol]: bestMarket }));
        setLastSuccessfulUpdate(bestMarket.updatedAt);
      } catch {
        if (requestVersion !== marketRequestVersion.current) return;
        setError("Live feed unavailable. Showing the latest local snapshot.");
        setMarket(fallback);
      } finally {
        if (requestVersion === marketRequestVersion.current) setLoading(false);
      }
    }

    loadBestPerformingStock();
  }, []);
  const movers = useMemo(() => showAllMovers ? ["ARM", "PLTR", "COIN", "AMD", "SMCI"] : ["ARM", "PLTR", "COIN"], [showAllMovers]);
  useEffect(() => {
    let cancelled = false;
    async function loadVisibleQuotes() {
      const symbols = Array.from(new Set([...watchlistSymbols, ...movers]));
      const results = await Promise.all(symbols.map(async (candidate) => {
        try {
          const response = await fetch(`/api/market?symbol=${encodeURIComponent(candidate)}`);
          if (!response.ok) return null;
          return await response.json() as Market;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      setLiveQuotes((current) => {
        const next = { ...current };
        results.forEach((result) => {
          if (result) next[result.symbol] = result;
        });
        return next;
      });
    }
    void loadVisibleQuotes();
    const interval = window.setInterval(() => { void loadVisibleQuotes(); }, 5 * 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [movers, watchlistSymbols]);
  useEffect(() => {
    window.localStorage.setItem("stockinsider-watchlist", JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("stockinsider-theme", theme);
  }, [theme]);
  const [currentTime, setCurrentTime] = useState(0);
  useEffect(() => {
    const updateTime = () => setCurrentTime(Date.now());
    updateTime();
    const interval = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const signal = useMemo(() => market.changePercent >= 0 ? "Bullish" : "Cautious", [market.changePercent]);
  const searchSuggestions = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return [];
    return stockSuggestions.filter(({ symbol, name }) => symbol.toLowerCase().includes(trimmedQuery) || name.toLowerCase().includes(trimmedQuery)).slice(0, 6);
  }, [query]);
  const isWatching = watchlistSymbols.includes(market.symbol);
  const isStale = !["live", "mansa"].includes(market.source) || (currentTime > 0 && currentTime - new Date(lastSuccessfulUpdate).getTime() > 5 * 60 * 1000);
  const watchlistItems = watchlistSymbols.map((watchSymbol) => {
    const catalogItem = watchlistCatalog.find((item) => item.symbol === watchSymbol);
    const quote = liveQuotes[watchSymbol];
    return {
      symbol: watchSymbol,
      name: catalogItem?.name || companyNames[watchSymbol] || "Custom instrument",
      price: quote ? money(quote.price) : "Unavailable",
      change: quote ? `${quote.change >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "Unavailable",
      tone: quote && quote.change >= 0 ? "up" : "down",
    };
  });
  const forecastRange = market.forecast.high - market.forecast.low;
  const forecastPosition = forecastRange > 0
    ? Math.min(100, Math.max(0, ((market.price - market.forecast.low) / forecastRange) * 100))
    : 50;
  const forecastTargetPosition = forecastRange > 0
    ? Math.min(100, Math.max(0, ((market.forecast.target - market.forecast.low) / forecastRange) * 100))
    : 50;
  function announce(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 2600);
  }
  function toggleWatchlist(symbolToToggle: string) {
    setWatchlistSymbols((current) => current.includes(symbolToToggle) ? current.filter((item) => item !== symbolToToggle) : [...current, symbolToToggle]);
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark">S<span>i</span></div><div><div className="brand-name">StockInsider</div><div className="brand-caption">Market intelligence desk</div></div></div>
      <nav className="main-nav"><a className="active" href="#overview">Overview</a><a href="#signals">Signals</a><a href="#watchlist">Watchlist</a></nav>
      <div className="top-actions"><button className="theme-toggle" aria-label={`Switch to ${theme === "night" ? "day" : "night"} mode`} aria-pressed={theme === "day"} onClick={() => setTheme(theme === "night" ? "day" : "night")}><span className="theme-icon">{theme === "night" ? <Sun size={17} /> : <Moon size={17} />}</span><span className="theme-label">{theme === "night" ? "Day" : "Night"}</span></button><button className={`icon-button ${notificationsOpen ? "active" : ""}`} aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen(!notificationsOpen); setAccountOpen(false); }}><Bell size={18} /></button><button className={`avatar ${accountOpen ? "active" : ""}`} aria-label="Open account menu" aria-expanded={accountOpen} onClick={() => { setAccountOpen(!accountOpen); setNotificationsOpen(false); }}><UserRound size={17} /></button><button className="mobile-menu" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(!mobileNavOpen)}><Menu size={19} /></button></div>
      {notificationsOpen && <div className="top-popover"><strong>All clear</strong><span>No new market alerts.</span></div>}
      {accountOpen && <div className="top-popover account-popover"><strong>Analyst account</strong><span>Research mode enabled.</span><button onClick={() => { setAccountOpen(false); announce("Account settings are coming soon."); }}>Account settings</button></div>}
    </header>
    {mobileNavOpen && <nav className="mobile-nav"><a href="#overview" onClick={() => setMobileNavOpen(false)}>Overview</a><a href="#signals" onClick={() => setMobileNavOpen(false)}>Signals</a><a href="#watchlist" onClick={() => setMobileNavOpen(false)}>Watchlist</a></nav>}

    <section className="ticker-strip"><div className="ticker-pulse"><span className="live-dot" /> Markets open</div><div className="ticker-item">S&P 500 <strong>5,842.12</strong> <span className="positive">+0.42%</span></div><div className="ticker-item">NASDAQ <strong>19,310.79</strong> <span className="positive">+0.78%</span></div><div className="ticker-item">VIX <strong>16.22</strong> <span className="negative">-4.10%</span></div><div className="ticker-time"><Clock3 size={14} /> Updated 2 min ago</div></section>

    <div className="content-grid" id="overview">
      <section className="main-column">
        <div className="eyebrow"><span className="eyebrow-line" /> Daily market brief <span className="eyebrow-date">SEPT 08, 2026</span></div>
        <div className="hero-row"><div><h1>See the signal<br /><em>before the noise.</em></h1><p className="hero-copy">A clearer read on where the market is moving next.</p></div><div className="hero-stats"><div><span>Portfolio pulse</span><strong className="positive">+4.82%</strong></div><div><span>Active signals</span><strong>12</strong></div></div></div>
        <div className="beginner-guide"><div className="guide-heading"><span className="section-kicker">New to trading?</span><h2>Start here</h2><p>Use StockInsider in three simple steps. This site provides research signals, not guaranteed results.</p></div><div className="guide-steps"><div><b>1</b><strong>Search a stock</strong><span>Type a company name or ticker above.</span></div><div><b>2</b><strong>Read the signal</strong><span>See whether momentum is positive, mixed, or cautious.</span></div><div><b>3</b><strong>Check the range</strong><span>Compare today’s price with the possible 30-day range.</span></div></div></div>

        <div className="search-row"><div className="search-box-wrap"><div className="search-box"><Search size={18} /><input aria-label="Search a ticker" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loadMarket(query)} placeholder="Search ticker or company" /></div>{searchSuggestions.length > 0 && (
            <div className="search-suggestions" aria-label="Stock suggestions">
              {searchSuggestions.map((item) => (
                <button key={item.symbol} type="button" className="suggestion-item" onClick={() => { setQuery(""); loadMarket(item.symbol); }}>
                  <span className="suggestion-symbol">{item.symbol}</span>
                  <span className="suggestion-name">{item.name}</span>
                </button>
              ))}
            </div>
          )}</div><button className="button-primary" onClick={() => loadMarket(query || symbol)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> {loading ? "Syncing" : "Analyze"}</button></div>
        {error && <div className="notice"><span>{error}</span><button onClick={() => loadMarket()} aria-label="Retry live market data"><RefreshCw size={14} /></button></div>}
        <div className={`data-status ${isStale ? "stale" : "fresh"}`}><span className="status-dot" />{loading ? "Updating market data..." : isStale ? "Showing a stale or demo snapshot" : "Live data refreshed"}<span className="status-time">{loading ? "" : new Date(lastSuccessfulUpdate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>

        <div className="section-heading"><div><span className="section-kicker">Focused view</span><h2>{market.symbol} <span className="company-name">/ {companyNames[market.symbol] || "Market instrument"}</span></h2></div><div className="chart-actions"><span className={`source-tag ${market.source}`}>{market.source === "mansa" ? "● Mansa live quote" : market.source === "live" ? "● Live quote" : market.source === "historical" ? "○ Delayed quote" : "○ Demo snapshot"}</span><button className={`watch-button ${isWatching ? "selected" : ""}`} onClick={() => { toggleWatchlist(market.symbol); announce(isWatching ? `${market.symbol} removed from watchlist.` : `${market.symbol} added to watchlist.`); }} aria-label={isWatching ? "Remove from watchlist" : "Add to watchlist"}><Star size={16} fill={isWatching ? "currentColor" : "none"} /></button></div></div>
        <div className="quote-line"><strong>{money(market.price)}</strong><span className={market.changePercent >= 0 ? "positive" : "negative"}>{market.change >= 0 ? "+" : "-"}{money(Math.abs(market.change))} ({market.changePercent.toFixed(2)}%)</span><span className="muted">Today</span></div>
        <div className={`chart-card ${loading ? "is-loading" : ""}`}><div className="chart-meta"><div className="chart-title"><span>Price history</span><small>{chartType === "candles" ? "OHLC" : chartType === "volume" ? "Volume profile" : "Daily close"}</small></div><div className="chart-controls"><div className="chart-type-tabs" role="group" aria-label="Chart type">{([['line', 'Line'], ['area', 'Area'], ['candles', 'Candles'], ['volume', 'Volume']] as [ChartType, string][]).map(([type, label]) => <button key={type} className={chartType === type ? "selected" : ""} aria-pressed={chartType === type} onClick={() => setChartType(type)}>{label}</button>)}</div><div className="range-tabs" role="group" aria-label="Chart range">{(["1W", "1M", "3M"] as ChartRange[]).map((range) => <button key={range} className={chartRange === range ? "selected" : ""} aria-pressed={chartRange === range} onClick={() => setChartRange(range)}>{range}</button>)}</div></div></div>{loading ? <div className="chart-skeleton" aria-label="Loading price history" /> : <PriceChart market={market} range={chartRange} chartType={chartType} />}</div>

        <section className="forecast-panel" id="signals"><div className="forecast-header"><div><span className="section-kicker">What may happen next</span><h2>30-day outlook</h2></div><div className="confidence"><Gauge size={16} /><span><strong>{market.forecast.confidence}%</strong> confidence</span></div></div><div className="forecast-grid"><div className="forecast-target"><span>Possible price in 30 days</span><strong>{money(market.forecast.target)}</strong><span className={market.forecast.target >= market.price ? "positive forecast-gain" : "negative forecast-gain"}><TrendingUp size={15} /> {market.forecast.target >= market.price ? "+" : ""}{(((market.forecast.target - market.price) / market.price) * 100).toFixed(1)}% from today</span></div><div className="range-box"><div className="range-labels"><span>Lower estimate<br /><strong>{money(market.forecast.low)}</strong></span><span className="range-marker">Today<br /><strong>{money(market.price)}</strong></span><span>Upper estimate<br /><strong>{money(market.forecast.high)}</strong></span></div><div className="range-track" aria-label={`Possible price range from ${money(market.forecast.low)} to ${money(market.forecast.high)}`}><span className="range-fill" style={{ width: `${forecastTargetPosition}%` }} /><i className="range-dot" style={{ left: `${forecastPosition}%` }} /></div><div className="range-foot"><span>Estimated range</span><span>{signal === "Bullish" ? "Positive momentum" : "Cautious momentum"}</span></div></div></div><div className="model-note"><Sparkles size={15} /><span>Use this as one research signal. It is not a promise that the price will rise.</span><button aria-label="Show how this outlook is calculated" aria-expanded={modelDetailsOpen} onClick={() => setModelDetailsOpen(!modelDetailsOpen)}><ArrowUpRight size={15} /></button></div>{modelDetailsOpen && <div className="model-details">{market.explanation.summary}. The forecast uses recent price movement and is checked against {market.backtest.samples || "limited"} previous observations.</div>}<div className="insight-grid"><div className="insight-card"><div className="insight-card-heading"><span className="section-kicker">Why this signal?</span><Sparkles size={15} /></div><p>{market.explanation.summary}. Positive means recent movement supports the signal; caution means the stock is moving unpredictably.</p>{market.explanation.factors.map((factor) => <div className="factor-row" key={factor.name}><div><strong>{factor.name === "Short-term momentum" ? "Recent movement" : factor.name === "Trend strength" ? "Overall direction" : "Price swings"}</strong><span>{factor.detail}</span></div><b className={factor.signal === "negative" || factor.signal === "caution" ? "negative" : "positive"}>{factor.value > 0 ? "+" : ""}{factor.value.toFixed(2)}%</b></div>)}</div><div className="insight-card"><div className="insight-card-heading"><span className="section-kicker">Past signal accuracy</span><Gauge size={15} /></div>{market.backtest.status === "validated" ? <><div className="accuracy-number">{market.backtest.directionalAccuracy?.toFixed(1)}%</div><p>How often the recent signal correctly predicted the direction.</p><div className="backtest-meta"><span>{market.backtest.samples} past checks</span><span>Average error {money(market.backtest.mae || 0)}</span></div></> : <><div className="accuracy-number">--</div><p>Not enough history to measure accuracy yet.</p></>}</div></div></section>
      </section>

      <aside className="side-column" id="watchlist"><div className="side-header"><div><span className="section-kicker">Your universe</span><h2>Watchlist <small className="watch-count">{watchlistSymbols.length}</small></h2></div><button className={`icon-button ${settingsOpen ? "active" : ""}`} aria-label="Watchlist settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={17} /></button></div>{settingsOpen && <div className="inline-status">Your watchlist is saved in this browser.</div>}<div className="watchlist">{watchlistItems.map((item) => <button className={`watch-row ${item.symbol === market.symbol ? "current" : ""}`} key={item.symbol} onClick={() => loadMarket(item.symbol)}><div className="company-avatar">{item.symbol.slice(0, 1)}</div><div className="watch-name"><strong>{item.symbol}</strong><span>{item.name}</span></div><div className="watch-quote"><strong>{item.price}</strong><span className={item.tone === "up" ? "positive" : "negative"}>{item.change}</span></div><ChevronDown size={15} className="watch-chevron" /></button>)}</div><button className="add-watch" onClick={() => { if (!isWatching) toggleWatchlist(market.symbol); announce(`${market.symbol} added to watchlist.`); }}><span>+</span> {isWatching ? "Saved to watchlist" : "Add to watchlist"}</button>
      <div className="side-divider" /><div className="side-header"><div><span className="section-kicker">Market pulse</span><h2>Top movers</h2></div><button className="text-button" onClick={() => setShowAllMovers(!showAllMovers)}>{showAllMovers ? "Show less" : "View all"}</button></div><div className="movers">{movers.map((mover, index) => { const quote = liveQuotes[mover]; const moverName = mover === "ARM" ? "Arm Holdings" : mover === "PLTR" ? "Palantir Tech." : mover === "COIN" ? "Coinbase Global" : mover === "AMD" ? "Advanced Micro Devices" : mover === "SMCI" ? "Super Micro Computer" : "Market mover"; return <div className="mover-row" key={mover}><span className="mover-rank">{String(index + 1).padStart(2, "0")}</span><div className={`mover-icon ${index === 1 ? "orange" : index === 2 ? "red" : "green"}`}>{mover.slice(0, 1)}</div><div className="mover-name"><strong>{mover}</strong><span>{moverName}</span></div><span className={quote && quote.changePercent < 0 ? "negative" : "positive"}>{quote ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "Loading..."}</span></div>; })}</div></aside>
    </div>
    {statusMessage && <div className="toast" role="status">{statusMessage}</div>}<footer><span><span className="live-dot" /> Data refreshes every 5 minutes</span><span>StockInsider v0.1 · For research, not financial advice</span></footer>
  </main>;
}
