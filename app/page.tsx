"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bell, ChevronDown, Clock3, Gauge, Menu, Moon, RefreshCw, Search, Settings2, Sparkles, Star, Sun, TrendingUp, UserRound } from "lucide-react";

type Point = { label: string; value: number; open?: number; high?: number; low?: number; volume?: number };
type Factor = { name: string; value: number; signal: string; detail: string };
type Market = { symbol: string; price: number; change: number; changePercent: number; source: string; updatedAt: string; series: Point[]; explanation: { factors: Factor[]; summary: string; window: number }; backtest: { directionalAccuracy: number | null; mae: number | null; samples: number; status: string; window?: string }; forecast: { target: number; horizon: string; confidence: number; low: number; high: number; model?: string } };
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
  { symbol: "NVDA", name: "NVIDIA Corp.", price: "$141.20", change: "+2.07%", tone: "up" },
  { symbol: "AAPL", name: "Apple Inc.", price: "$227.40", change: "+0.84%", tone: "up" },
  { symbol: "TSLA", name: "Tesla, Inc.", price: "$347.30", change: "-1.18%", tone: "down" },
  { symbol: "MSFT", name: "Microsoft Corp.", price: "$441.10", change: "+1.32%", tone: "up" },
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
];
const initialMarketSymbols = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "AMD", "PLTR", "COIN", "NFLX"];
const defaultWatchlistSymbols = watchlistCatalog.map((item) => item.symbol);

const companyNames: Record<string, string> = {
  NVDA: "NVIDIA Corp.",
  AAPL: "Apple Inc.",
  TSLA: "Tesla, Inc.",
  MSFT: "Microsoft Corp.",
};

function money(value: number) { return `$${value.toFixed(2)}`; }

function PriceChart({ market, range, chartType }: { market: Market; range: ChartRange; chartType: ChartType }) {
  const width = 840;
  const height = 286;
  const rangeLength = { "1W": 7, "1M": 30, "3M": 90 }[range];
  const visibleSeries = market.series.slice(-rangeLength);
  const values = visibleSeries.map((point) => point.value);
  const candleValues = visibleSeries.flatMap((point) => [point.high ?? point.value, point.low ?? point.value]);
  const chartValues = chartType === "candles" ? candleValues : values;
  const min = Math.min(...chartValues) * 0.985;
  const max = Math.max(...chartValues) * 1.015;
  const valueY = (value: number) => height - ((value - min) / Math.max(max - min, 0.0001)) * height;
  const points = visibleSeries.map((point, index) => {
    const x = (index / Math.max(visibleSeries.length - 1, 1)) * width;
    const y = valueY(point.value);
    return `${x},${y}`;
  }).join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  return <div className="chart-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${market.symbol} price chart`} preserveAspectRatio="none">
      <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b8f26a" stopOpacity=".22" /><stop offset="100%" stopColor="#b8f26a" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={(height / 3) * line} y2={(height / 3) * line} className="chart-grid" />)}
      {chartType === "area" && <polygon points={area} fill="url(#chartFill)" />}
      {(chartType === "line" || chartType === "area") && <><polyline points={points} fill="none" stroke="#b8f26a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /><circle cx={width} cy={valueY(values.at(-1)!)} r="5" fill="#b8f26a" /></>}
      {chartType === "candles" && visibleSeries.map((point, index) => {
        const candleWidth = Math.max(5, width / visibleSeries.length * 0.55);
        const x = (index / Math.max(visibleSeries.length - 1, 1)) * width;
        const open = point.open ?? point.value;
        const close = point.value;
        const rising = close >= open;
        const bodyTop = Math.min(valueY(open), valueY(close));
        const bodyHeight = Math.max(2, Math.abs(valueY(open) - valueY(close)));
        return <g key={`${point.label}-${index}`} className={rising ? "candle-up" : "candle-down"}><line x1={x} x2={x} y1={valueY(point.high ?? Math.max(open, close))} y2={valueY(point.low ?? Math.min(open, close))} /><rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} /></g>;
      })}
      {chartType === "volume" && visibleSeries.map((point, index) => { const maxVolume = Math.max(...visibleSeries.map((item) => item.volume ?? 0), 1); const barWidth = Math.max(5, width / visibleSeries.length * 0.65); const x = (index / Math.max(visibleSeries.length - 1, 1)) * width; const barHeight = ((point.volume ?? 0) / maxVolume) * height; return <rect key={`${point.label}-${index}`} className={point.value >= (point.open ?? point.value) ? "volume-up" : "volume-down"} x={x - barWidth / 2} y={height - barHeight} width={barWidth} height={barHeight} />; })}
    </svg>
    <div className="chart-axis"><span>{visibleSeries[0]?.label}</span><span>{range}</span><span>{visibleSeries.at(-1)?.label}</span></div>
  </div>;
}

export default function Home() {
  const [symbol, setSymbol] = useState("NVDA");
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
    setLoading(true); setError(""); setSymbol(normalized);
    try {
      const response = await fetch(`/api/market?symbol=${encodeURIComponent(normalized)}`);
      if (!response.ok) throw new Error("Market feed unavailable");
      const nextMarket: Market = await response.json();
      setMarket(nextMarket);
      setLastSuccessfulUpdate(nextMarket.updatedAt);
    } catch {
      setError("Live feed unavailable. Showing the latest local snapshot.");
      setMarket({ ...fallback, symbol: normalized });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    async function loadBestPerformingStock() {
      try {
        const responses = await Promise.all(initialMarketSymbols.map(async (candidate) => {
          const response = await fetch(`/api/market?symbol=${candidate}`);
          if (!response.ok) return null;
          return response.json() as Promise<Market>;
        }));
        const bestMarket = responses.filter((candidate): candidate is Market => candidate !== null).sort((left, right) => right.changePercent - left.changePercent)[0];
        if (!bestMarket) throw new Error("No market data available");
        setSymbol(bestMarket.symbol);
        setMarket(bestMarket);
        setLastSuccessfulUpdate(bestMarket.updatedAt);
      } catch {
        await loadMarket();
      } finally {
        setLoading(false);
      }
    }

    loadBestPerformingStock();
  }, []);
  useEffect(() => {
    window.localStorage.setItem("stockinsider-watchlist", JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("stockinsider-theme", theme);
  }, [theme]);
  const signal = useMemo(() => market.changePercent >= 0 ? "Bullish" : "Cautious", [market.changePercent]);
  const searchSuggestions = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return [];
    return stockSuggestions.filter(({ symbol, name }) => symbol.toLowerCase().includes(trimmedQuery) || name.toLowerCase().includes(trimmedQuery)).slice(0, 6);
  }, [query]);
  const isWatching = watchlistSymbols.includes(market.symbol);
  const isStale = market.source !== "live" || Date.now() - new Date(lastSuccessfulUpdate).getTime() > 5 * 60 * 1000;
  const watchlistItems = watchlistSymbols.map((watchSymbol) => watchlistCatalog.find((item) => item.symbol === watchSymbol) || { symbol: watchSymbol, name: "Custom instrument", price: "--", change: "--", tone: "up" });
  const movers = showAllMovers ? ["ARM", "PLTR", "COIN", "AMD", "SMCI"] : ["ARM", "PLTR", "COIN"];
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

        <div className="search-row"><div className="search-box-wrap"><div className="search-box"><Search size={18} /><input aria-label="Search a ticker" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loadMarket(query)} placeholder="Search ticker or company" /></div>{searchSuggestions.length > 0 && (
            <div className="search-suggestions" aria-label="Stock suggestions">
              {searchSuggestions.map((item) => (
                <button key={item.symbol} type="button" className="suggestion-item" onClick={() => { setQuery(item.symbol); loadMarket(item.symbol); }}>
                  <span className="suggestion-symbol">{item.symbol}</span>
                  <span className="suggestion-name">{item.name}</span>
                </button>
              ))}
            </div>
          )}</div><button className="button-primary" onClick={() => loadMarket(query || symbol)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> {loading ? "Syncing" : "Analyze"}</button></div>
        {error && <div className="notice"><span>{error}</span><button onClick={() => loadMarket()} aria-label="Retry live market data"><RefreshCw size={14} /></button></div>}
        <div className={`data-status ${isStale ? "stale" : "fresh"}`}><span className="status-dot" />{loading ? "Updating market data..." : isStale ? "Showing a stale or demo snapshot" : "Live data refreshed"}<span className="status-time">{loading ? "" : new Date(lastSuccessfulUpdate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>

        <div className="section-heading"><div><span className="section-kicker">Focused view</span><h2>{market.symbol} <span className="company-name">/ {companyNames[market.symbol] || "Market instrument"}</span></h2></div><div className="chart-actions"><span className={`source-tag ${market.source}`}>{market.source === "live" ? "● Live data" : "○ Demo snapshot"}</span><button className={`watch-button ${isWatching ? "selected" : ""}`} onClick={() => { toggleWatchlist(market.symbol); announce(isWatching ? `${market.symbol} removed from watchlist.` : `${market.symbol} added to watchlist.`); }} aria-label={isWatching ? "Remove from watchlist" : "Add to watchlist"}><Star size={16} fill={isWatching ? "currentColor" : "none"} /></button></div></div>
        <div className="quote-line"><strong>{money(market.price)}</strong><span className={market.changePercent >= 0 ? "positive" : "negative"}>{market.change >= 0 ? "+" : "-"}{money(Math.abs(market.change))} ({market.changePercent.toFixed(2)}%)</span><span className="muted">Today</span></div>
        <div className={`chart-card ${loading ? "is-loading" : ""}`}><div className="chart-meta"><div className="chart-title"><span>Price history</span><small>{chartType === "candles" ? "OHLC" : chartType === "volume" ? "Volume profile" : "Daily close"}</small></div><div className="chart-controls"><div className="chart-type-tabs" role="group" aria-label="Chart type">{([['line', 'Line'], ['area', 'Area'], ['candles', 'Candles'], ['volume', 'Volume']] as [ChartType, string][]).map(([type, label]) => <button key={type} className={chartType === type ? "selected" : ""} aria-pressed={chartType === type} onClick={() => setChartType(type)}>{label}</button>)}</div><div className="range-tabs" role="group" aria-label="Chart range">{(["1W", "1M", "3M"] as ChartRange[]).map((range) => <button key={range} className={chartRange === range ? "selected" : ""} aria-pressed={chartRange === range} onClick={() => setChartRange(range)}>{range}</button>)}</div></div></div>{loading ? <div className="chart-skeleton" aria-label="Loading price history" /> : <PriceChart market={market} range={chartRange} chartType={chartType} />}</div>

        <section className="forecast-panel" id="signals"><div className="forecast-header"><div><span className="section-kicker">Model outlook</span><h2>Forecast signal</h2></div><div className="confidence"><Gauge size={16} /><span><strong>{market.forecast.confidence}%</strong> confidence</span></div></div><div className="forecast-grid"><div className="forecast-target"><span>Predicted target <small>30 days</small></span><strong>{money(market.forecast.target)}</strong><span className={market.forecast.target >= market.price ? "positive forecast-gain" : "negative forecast-gain"}><TrendingUp size={15} /> {market.forecast.target >= market.price ? "+" : ""}{(((market.forecast.target - market.price) / market.price) * 100).toFixed(1)}% model outlook</span></div><div className="range-box"><div className="range-labels"><span>Bear case<br /><strong>{money(market.forecast.low)}</strong></span><span className="range-marker">Current<br /><strong>{money(market.price)}</strong></span><span>Base case<br /><strong>{money(market.forecast.high)}</strong></span></div><div className="range-track"><span className="range-fill" /><i className="range-dot" /></div><div className="range-foot"><span>Model range</span><span>{signal} momentum</span></div></div></div><div className="model-note"><Sparkles size={15} /><span>Signal is based on price momentum, volume trend, and sector strength. Refreshed daily.</span><button aria-label="Open model details" aria-expanded={modelDetailsOpen} onClick={() => setModelDetailsOpen(!modelDetailsOpen)}><ArrowUpRight size={15} /></button></div>{modelDetailsOpen && <div className="model-details">{market.explanation.summary}. The {market.forecast.model || "baseline"} model was evaluated against {market.backtest.samples || "limited"} recent observations.</div>}<div className="insight-grid"><div className="insight-card"><div className="insight-card-heading"><span className="section-kicker">Why this signal</span><Sparkles size={15} /></div><p>{market.explanation.summary}.</p>{market.explanation.factors.map((factor) => <div className="factor-row" key={factor.name}><div><strong>{factor.name}</strong><span>{factor.detail}</span></div><b className={factor.signal === "negative" || factor.signal === "caution" ? "negative" : "positive"}>{factor.value > 0 ? "+" : ""}{factor.value.toFixed(2)}%</b></div>)}</div><div className="insight-card"><div className="insight-card-heading"><span className="section-kicker">Model track record</span><Gauge size={15} /></div>{market.backtest.status === "validated" ? <><div className="accuracy-number">{market.backtest.directionalAccuracy?.toFixed(1)}%</div><p>Directional accuracy on the recent holdout window.</p><div className="backtest-meta"><span>{market.backtest.samples} test sessions</span><span>MAE {money(market.backtest.mae || 0)}</span></div></> : <><div className="accuracy-number">--</div><p>Not enough history to validate this model yet.</p></>}</div></div></section>
      </section>

      <aside className="side-column" id="watchlist"><div className="side-header"><div><span className="section-kicker">Your universe</span><h2>Watchlist <small className="watch-count">{watchlistSymbols.length}</small></h2></div><button className={`icon-button ${settingsOpen ? "active" : ""}`} aria-label="Watchlist settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={17} /></button></div>{settingsOpen && <div className="inline-status">Your watchlist is saved in this browser.</div>}<div className="watchlist">{watchlistItems.map((item) => <button className={`watch-row ${item.symbol === market.symbol ? "current" : ""}`} key={item.symbol} onClick={() => loadMarket(item.symbol)}><div className="company-avatar">{item.symbol.slice(0, 1)}</div><div className="watch-name"><strong>{item.symbol}</strong><span>{item.name}</span></div><div className="watch-quote"><strong>{item.price}</strong><span className={item.tone === "up" ? "positive" : "negative"}>{item.change}</span></div><ChevronDown size={15} className="watch-chevron" /></button>)}</div><button className="add-watch" onClick={() => { if (!isWatching) toggleWatchlist(market.symbol); announce(`${market.symbol} added to watchlist.`); }}><span>+</span> {isWatching ? "Saved to watchlist" : "Add to watchlist"}</button>
      <div className="side-divider" /><div className="side-header"><div><span className="section-kicker">Market pulse</span><h2>Top movers</h2></div><button className="text-button" onClick={() => setShowAllMovers(!showAllMovers)}>{showAllMovers ? "Show less" : "View all"}</button></div><div className="movers">{movers.map((mover, index) => <div className="mover-row" key={mover}><span className="mover-rank">{String(index + 1).padStart(2, "0")}</span><div className={`mover-icon ${index === 1 ? "orange" : index === 2 ? "red" : "green"}`}>{mover.slice(0, 1)}</div><div className="mover-name"><strong>{mover}</strong><span>{mover === "ARM" ? "Arm Holdings" : mover === "PLTR" ? "Palantir Tech." : mover === "COIN" ? "Coinbase Global" : "Market mover"}</span></div><span className={index === 2 ? "negative" : "positive"}>{index === 2 ? "-4.72%" : `+${(8.42 - index * 2.24).toFixed(2)}%`}</span></div>)}</div></aside>
    </div>
    {statusMessage && <div className="toast" role="status">{statusMessage}</div>}<footer><span><span className="live-dot" /> Data refreshes every 5 minutes</span><span>StockInsider v0.1 · For research, not financial advice</span></footer>
  </main>;
}
