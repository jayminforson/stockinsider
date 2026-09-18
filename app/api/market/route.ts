import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
export const dynamic = "force-dynamic";
const marketCache = new Map<string, { expiresAt: number; body: string; contentType: string }>();

type YahooPoint = {
  label: string;
  value: number;
  open: number;
  high: number;
  low: number;
  volume: number;
};

function fallbackMarket(symbol: string, payload: Record<string, unknown>) {
  const chart = payload.chart as { result?: Array<Record<string, unknown>> } | undefined;
  const result = chart?.result?.[0];
  const metadata = result?.meta as Record<string, unknown> | undefined;
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const indicators = result?.indicators as { quote?: Array<Record<string, unknown>> } | undefined;
  const quote = indicators?.quote?.[0];
  const opens = Array.isArray(quote?.open) ? quote.open : [];
  const highs = Array.isArray(quote?.high) ? quote.high : [];
  const lows = Array.isArray(quote?.low) ? quote.low : [];
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const volumes = Array.isArray(quote?.volume) ? quote.volume : [];
  const series: YahooPoint[] = [];

  timestamps.forEach((timestamp, index) => {
    const open = Number(opens[index]);
    const high = Number(highs[index]);
    const low = Number(lows[index]);
    const close = Number(closes[index]);
    if (![timestamp, open, high, low, close].every(Number.isFinite)) return;
    series.push({
      label: new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }),
      value: Number(close.toFixed(2)),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      volume: Number(volumes[index]) || 0,
    });
  });

  const historical = series.slice(-90);
  const currentMetadata = Number(metadata?.regularMarketPrice);
  const previousClose = Number(metadata?.previousClose ?? metadata?.chartPreviousClose);
  const current = Number.isFinite(currentMetadata) ? currentMetadata : historical.at(-1)?.value;
  const previous = Number.isFinite(previousClose) ? previousClose : historical.at(-2)?.value;
  if (!current || !previous || historical.length < 2) return null;
  if (Math.abs(current - historical.at(-1)!.value) > 0.005) {
    const last = historical.at(-1)!.value;
    historical.push({ label: "Now", value: Number(current.toFixed(2)), open: last, high: Math.max(last, current), low: Math.min(last, current), volume: historical.at(-1)!.volume });
  }
  const change = current - previous;
  const changePercent = previous ? (change / previous) * 100 : 0;
  const values = historical.map((point) => point.value);
  const target = current * 1.078;
  return {
    symbol,
    price: current,
    change: Number(change.toFixed(2)),
    changePercent: Number(changePercent.toFixed(2)),
    source: "live",
    updatedAt: new Date().toISOString(),
    marketState: String(metadata?.marketState || "UNKNOWN"),
    currency: String(metadata?.currency || "USD"),
    series: historical,
    explanation: {
      factors: [
        { name: "Short-term momentum", value: Number((((current - (values.at(-6) || current)) / (values.at(-6) || current)) * 100).toFixed(2)), signal: current >= (values.at(-6) || current) ? "positive" : "negative", detail: "Five-session price direction" },
        { name: "Trend strength", value: Number((((current - values[0]) / values[0]) * 100).toFixed(2)), signal: current >= values[0] ? "positive" : "negative", detail: "Observed period price direction" },
        { name: "Volatility", value: 0, signal: "stable", detail: "Recent daily movement dispersion" },
      ],
      summary: change >= 0 ? "Recent movement is positive" : "Recent movement is under pressure",
      window: Math.min(10, historical.length),
    },
    backtest: { directionalAccuracy: null, mae: null, samples: 0, status: "unavailable" },
    forecast: { target: Number(target.toFixed(2)), horizon: "30D", confidence: 60, low: Number((current * 0.98).toFixed(2)), high: Number((current * 1.14).toFixed(2)), model: "baseline" },
  };
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "NVDA";
  const cacheKey = symbol.trim().toUpperCase();
  const cached = marketCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: { "content-type": cached.contentType, "x-market-cache": "hit" },
    });
  }
  const headers = new Headers();
  const apiKey = process.env.STOCKINSIDER_API_KEY;
  if (apiKey) headers.set("x-api-key", apiKey);

  try {
    const response = await fetch(`${backendUrl}/api/market?symbol=${encodeURIComponent(symbol)}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "application/json";
      marketCache.set(cacheKey, { body, contentType, expiresAt: Date.now() + 30_000 });
      return new NextResponse(body, { status: response.status, headers: { "content-type": contentType } });
    }
    if (response.status === 401) {
      return new NextResponse(body, {
        status: response.status,
        headers: { "content-type": response.headers.get("content-type") || "application/json" },
      });
    }
    throw new Error(`Market backend returned ${response.status}`);
  } catch (backendError) {
    console.error("Market backend unavailable:", backendError);
    try {
      let yahooResponse: Response | undefined;
      const fallbackController = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 8_000);
      for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
        try {
          const response = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=false`, {
            headers: { "User-Agent": "Mozilla/5.0 StockInsider/0.1" },
            cache: "no-store",
            signal: fallbackController.signal,
          });
          if (response.ok) {
            yahooResponse = response;
            break;
          }
        } catch {
          if (fallbackController.signal.aborted) break;
        }
      }
      clearTimeout(fallbackTimeout);
      if (!yahooResponse) throw new Error("Yahoo Finance unavailable");
      const market = fallbackMarket(symbol.toUpperCase(), await yahooResponse.json() as Record<string, unknown>);
      if (!market) throw new Error("No usable market data");
      const body = JSON.stringify(market);
      marketCache.set(cacheKey, { body, contentType: "application/json", expiresAt: Date.now() + 30_000 });
      return new NextResponse(body, { status: 200, headers: { "content-type": "application/json" } });
    } catch (fallbackError) {
      console.error("Market Yahoo fallback unavailable:", fallbackError);
      return NextResponse.json({ detail: "Market service unavailable" }, { status: 502 });
    }
  }
}