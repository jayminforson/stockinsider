from datetime import datetime, timezone
from collections import defaultdict, deque
from math import isfinite, sin
import os
import re
import secrets
import time
from typing import Any

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.middleware.trustedhost import TrustedHostMiddleware

try:
    from xgboost import XGBRegressor
except ImportError:
    XGBRegressor = None

app = FastAPI(title="StockInsider API", version="0.1.0")
allowed_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
allowed_hosts = [host.strip() for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]
api_key = os.getenv("STOCKINSIDER_API_KEY")
mansa_api_key = os.getenv("MANSA_API_KEY")
mansa_base_url = os.getenv("MANSA_API_URL", "https://api.mansamarkets.com/api/v1")
if os.getenv("APP_ENV", "development").lower() == "production" and not api_key:
    raise RuntimeError("STOCKINSIDER_API_KEY must be configured in production")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Any, limit: int | None = None, window_seconds: int | None = None) -> None:
        super().__init__(app)
        self.limit = limit or int(os.getenv("API_RATE_LIMIT", "300"))
        self.window_seconds = window_seconds or int(os.getenv("API_RATE_WINDOW_SECONDS", "60"))
        self.requests: defaultdict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        if request.url.path.startswith("/api/"):
            client_ip = request.client.host if request.client else "unknown"
            now = time.monotonic()
            timestamps = self.requests[client_ip]
            while timestamps and now - timestamps[0] > self.window_seconds:
                timestamps.popleft()
            if len(timestamps) >= self.limit:
                return Response("Rate limit exceeded", status_code=429, headers={"Retry-After": "60"})
            timestamps.append(now)
            if len(self.requests) > 10_000:
                expired_clients = [
                    ip for ip, client_timestamps in self.requests.items()
                    if not client_timestamps or now - client_timestamps[-1] > self.window_seconds
                ]
                for ip in expired_clients:
                    del self.requests[ip]
        return await call_next(request)


app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_api_key(request: Request, call_next: Any) -> Response:
    if api_key and request.url.path.startswith("/api/"):
        provided_key = request.headers.get("x-api-key")
        if not provided_key or not secrets.compare_digest(provided_key, api_key):
            return Response("Unauthorized", status_code=401)
    return await call_next(request)


def demo_series(symbol: str) -> list[dict[str, Any]]:
    bases = {"NVDA": 141.20, "AAPL": 227.40, "MSFT": 441.10, "TSLA": 347.30}
    base = bases.get(symbol.upper(), 180.0)
    points = []
    for index in range(42):
        close = base + index * 0.82 + sin(index / 2.8) * 4.8 + sin(index / 1.4) * 1.2
        open_price = close - sin(index * 1.7) * 1.8
        points.append({"label": f"{index + 1}D", "value": round(close, 2), "open": round(open_price, 2), "high": round(max(open_price, close) + 2.1, 2), "low": round(min(open_price, close) - 1.7, 2), "volume": round(18_000_000 + abs(sin(index / 2)) * 12_000_000)})
    return points


async def yahoo_market(symbol: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"range": "3mo", "interval": "1d", "includePrePost": "false"}
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(url, params=params, headers={"User-Agent": "StockInsider/0.1"})
        response.raise_for_status()
        payload = response.json()["chart"]["result"][0]
        metadata = payload.get("meta", {})
        timestamps = payload.get("timestamp", [])
        quote = payload["indicators"]["quote"][0]
        opens = quote.get("open", [])
        highs = quote.get("high", [])
        lows = quote.get("low", [])
        closes = quote.get("close", [])
        volumes = quote.get("volume", [])
        series = [
            {"label": datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%b %d"), "value": round(close, 2), "open": round(open_price, 2), "high": round(high, 2), "low": round(low, 2), "volume": volume or 0}
            for timestamp, open_price, high, low, close, volume in zip(timestamps, opens, highs, lows, closes, volumes)
            if all(
                value is not None and isfinite(float(value))
                for value in (timestamp, open_price, high, low, close)
            )
        ][-90:]
        return series, {
            "currentPrice": metadata.get("regularMarketPrice"),
            "previousClose": metadata.get("previousClose", metadata.get("chartPreviousClose")),
            "marketState": metadata.get("marketState", "UNKNOWN"),
            "currency": metadata.get("currency", "USD"),
            "quoteTime": metadata.get("regularMarketTime"),
        }


def mansa_symbol(symbol: str) -> tuple[str, str] | None:
    exchange_by_suffix = {
        ".GH": "GSE",
        ".LG": "NGX",
        ".JO": "JSE",
        ".NR": "NSE",
    }
    for suffix, exchange in exchange_by_suffix.items():
        if symbol.endswith(suffix):
            return exchange, symbol.removesuffix(suffix)
    return None


async def mansa_market(symbol: str) -> tuple[list[dict[str, Any]], dict[str, Any]] | None:
    if not mansa_api_key:
        return None
    resolved = mansa_symbol(symbol)
    if not resolved:
        return None
    exchange, ticker = resolved
    headers = {"Authorization": f"Bearer {mansa_api_key}", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=8) as client:
        quote_response = await client.get(
            f"{mansa_base_url}/markets/exchanges/{exchange}/stocks/{ticker}",
            headers=headers,
        )
        quote_response.raise_for_status()
        quote_payload = quote_response.json()
        quote = quote_payload.get("data", quote_payload)
        history_response = await client.get(
            f"{mansa_base_url}/markets/exchanges/{exchange}/stocks/{ticker}/history",
            params={"range": "3M", "order": "asc", "limit": 90},
            headers=headers,
        )
        history_response.raise_for_status()
        history_payload = history_response.json()
        history = history_payload.get("data", history_payload)
        if isinstance(history, dict):
            history = history.get("prices", history.get("history", []))
        series = []
        for point in history if isinstance(history, list) else []:
            close = point.get("close", point.get("price"))
            timestamp = point.get("timestamp", point.get("date"))
            if close is None or timestamp is None:
                continue
            try:
                numeric_close = float(close)
                if isinstance(timestamp, (int, float)):
                    label = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%b %d")
                else:
                    label = str(timestamp)[:10]
                series.append({
                    "label": label,
                    "value": round(numeric_close, 2),
                    "open": round(float(point.get("open", close)), 2),
                    "high": round(float(point.get("high", close)), 2),
                    "low": round(float(point.get("low", close)), 2),
                    "volume": point.get("volume", 0) or 0,
                })
            except (TypeError, ValueError):
                continue
        current = quote.get("price", quote.get("currentPrice", quote.get("lastPrice")))
        previous = quote.get("previousClose", quote.get("previous_close"))
        return series[-90:], {
            "currentPrice": current,
            "previousClose": previous,
            "marketState": quote.get("marketState", quote.get("market_state", "UNKNOWN")),
            "currency": quote.get("currency", "GHS"),
            "quoteTime": quote.get("timestamp", quote.get("updatedAt")),
        }


def baseline_forecast(values: list[float], horizon: int = 30) -> dict[str, Any]:
    current = values[-1]
    target = current * 1.078
    return {
        "target": round(target, 2),
        "horizon": f"{horizon}D",
        "confidence": 81,
        "low": round(current * 1.018, 2),
        "high": round(current * 1.142, 2),
        "model": "baseline",
    }


def model_features(window: list[float]) -> list[float]:
    return window + [float(np.mean(window)), float(np.std(window))]


def train_model(features: list[list[float]], targets: list[float]) -> Any:
    if XGBRegressor is None:
        return None
    model = XGBRegressor(
        objective="reg:squarederror",
        n_estimators=160,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=1,
    )
    model.fit(np.asarray(features), np.asarray(targets), verbose=False)
    return model


def explain_signal(values: list[float]) -> dict[str, Any]:
    recent_window = values[-10:]
    short_change = ((values[-1] - values[-6]) / values[-6]) * 100 if len(values) > 5 and values[-6] else 0
    long_change = ((values[-1] - values[0]) / values[0]) * 100 if values[0] else 0
    volatility = (float(np.std(np.diff(values[-20:]))) / values[-1]) * 100 if len(values) > 20 and values[-1] else 0
    factors = [
        {"name": "Short-term momentum", "value": round(short_change, 2), "signal": "positive" if short_change >= 0 else "negative", "detail": "Five-session price direction"},
        {"name": "Trend strength", "value": round(long_change, 2), "signal": "positive" if long_change >= 0 else "negative", "detail": "Observed period price direction"},
        {"name": "Volatility", "value": round(volatility, 2), "signal": "caution" if volatility > 2.5 else "stable", "detail": "Recent daily movement dispersion"},
    ]
    positive_count = sum(1 for factor in factors if factor["signal"] == "positive")
    return {"factors": factors, "summary": "Momentum and trend are aligned" if positive_count == 2 else "Momentum is mixed; manage risk carefully", "window": len(recent_window)}


def backtest(values: list[float]) -> dict[str, Any]:
    lookback = 10
    holdout_start = max(lookback + 8, len(values) - 20)
    if XGBRegressor is None or len(values) <= holdout_start + 2:
        return {"directionalAccuracy": None, "mae": None, "samples": 0, "status": "unavailable"}

    features = [model_features(values[index - lookback:index]) for index in range(lookback, holdout_start)]
    targets = values[lookback:holdout_start]
    model = train_model(features, targets)
    predictions = [float(model.predict(np.asarray([model_features(values[index - lookback:index])]))[0]) for index in range(holdout_start, len(values))]
    actuals = values[holdout_start:]
    previous_values = values[holdout_start - 1:-1]
    correct_directions = sum(
        (prediction - previous) * (actual - previous) >= 0
        for prediction, actual, previous in zip(predictions, actuals, previous_values)
    )
    mae = float(np.mean(np.abs(np.asarray(predictions) - np.asarray(actuals))))
    return {
        "directionalAccuracy": round((correct_directions / len(actuals)) * 100, 1),
        "mae": round(mae, 2),
        "samples": len(actuals),
        "status": "validated",
        "window": "Recent holdout",
    }


def xgboost_forecast(values: list[float], horizon: int = 30) -> dict[str, Any]:
    """Fit a small autoregressive model and recursively forecast future closes."""
    if XGBRegressor is None or len(values) < 24:
        return baseline_forecast(values, horizon)

    lookback = 10
    features: list[list[float]] = []
    targets: list[float] = []
    for index in range(lookback, len(values)):
        window = values[index - lookback:index]
        features.append(model_features(window))
        targets.append(values[index])

    model = train_model(features, targets)

    rolling_values = values.copy()
    for _ in range(horizon):
        window = rolling_values[-lookback:]
        model_input = np.asarray([model_features(window)])
        rolling_values.append(float(model.predict(model_input)[0]))

    current = values[-1]
    target = rolling_values[-1]
    change = (target - current) / current if current else 0
    spread = max(abs(change) * 0.8, 0.025)
    confidence = max(62, min(91, round(78 - spread * 100)))
    return {
        "target": round(target, 2),
        "horizon": f"{horizon}D",
        "confidence": confidence,
        "low": round(target * (1 - spread), 2),
        "high": round(target * (1 + spread), 2),
        "model": "xgboost",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "stockinsider-api"}


@app.get("/api/market")
async def market(symbol: str = Query("NVDA", min_length=1, max_length=16)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    if not re.fullmatch(r"[A-Z0-9.=-]{1,16}", normalized):
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")
    quote: dict[str, Any] = {}
    try:
        mansa_result = await mansa_market(normalized)
        if mansa_result:
            series, quote = mansa_result
            source = "mansa"
        else:
            series, quote = await yahoo_market(normalized)
            source = "live" if quote.get("currentPrice") is not None else "historical"
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        series = demo_series(normalized)
        source = "demo"

    if len(series) < 2:
        raise HTTPException(status_code=502, detail="Market data did not contain enough observations")

    current_quote = quote.get("currentPrice")
    previous_quote = quote.get("previousClose")
    current = float(current_quote) if current_quote is not None and isfinite(float(current_quote)) else series[-1]["value"]
    previous = float(previous_quote) if previous_quote is not None and isfinite(float(previous_quote)) else series[-2]["value"]
    if source in {"live", "mansa"} and abs(current - series[-1]["value"]) > 0.005:
        last_close = series[-1]["value"]
        series = [
            *series,
            {
                "label": "Now",
                "value": round(current, 2),
                "open": round(last_close, 2),
                "high": round(max(last_close, current), 2),
                "low": round(min(last_close, current), 2),
                "volume": series[-1].get("volume", 0),
            },
        ][-90:]
    change = current - previous
    change_percent = (change / previous) * 100 if previous else 0
    forecast = xgboost_forecast([point["value"] for point in series])
    values = [point["value"] for point in series]

    return {
        "symbol": normalized,
        "price": current,
        "change": round(change, 2),
        "changePercent": round(change_percent, 2),
        "source": source,
        "updatedAt": (
            datetime.fromtimestamp(quote["quoteTime"], tz=timezone.utc).isoformat()
            if isinstance(quote.get("quoteTime"), (int, float))
            else str(quote["quoteTime"]) if quote.get("quoteTime") else datetime.now(timezone.utc).isoformat()
        ),
        "marketState": quote.get("marketState", "UNKNOWN"),
        "currency": quote.get("currency", "USD"),
        "series": series,
        "explanation": explain_signal(values),
        "backtest": backtest(values),
        "forecast": {
            **forecast,
        },
    }
