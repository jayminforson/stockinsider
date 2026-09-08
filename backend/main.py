from datetime import datetime, timezone
from collections import defaultdict, deque
from math import sin
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
    def __init__(self, app: Any, limit: int = 60, window_seconds: int = 60) -> None:
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
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


async def yahoo_series(symbol: str) -> list[dict[str, Any]]:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"range": "3mo", "interval": "1d", "includePrePost": "false"}
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(url, params=params, headers={"User-Agent": "StockInsider/0.1"})
        response.raise_for_status()
        payload = response.json()["chart"]["result"][0]
        timestamps = payload.get("timestamp", [])
        quote = payload["indicators"]["quote"][0]
        opens = quote.get("open", [])
        highs = quote.get("high", [])
        lows = quote.get("low", [])
        closes = quote.get("close", [])
        volumes = quote.get("volume", [])
        return [
            {"label": datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%b %d"), "value": round(close, 2), "open": round(open_price, 2), "high": round(high, 2), "low": round(low, 2), "volume": volume or 0}
            for timestamp, open_price, high, low, close, volume in zip(timestamps, opens, highs, lows, closes, volumes)
            if close is not None and open_price is not None and high is not None and low is not None
        ][-90:]


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
async def market(symbol: str = Query("NVDA", min_length=1, max_length=8)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    if not re.fullmatch(r"[A-Z0-9.=-]{1,8}", normalized):
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")
    try:
        series = await yahoo_series(normalized)
        source = "live"
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        series = demo_series(normalized)
        source = "demo"

    if len(series) < 2:
        raise HTTPException(status_code=502, detail="Market data did not contain enough observations")

    current = series[-1]["value"]
    previous = series[-2]["value"]
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
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "series": series,
        "explanation": explain_signal(values),
        "backtest": backtest(values),
        "forecast": {
            **forecast,
        },
    }
