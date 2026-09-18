# StockInsider

A full-stack stock intelligence dashboard with a Next.js frontend and FastAPI market-data service.

## Stack

- Next.js + TypeScript for the interface
- FastAPI + Python for market data and forecast calculations
- Yahoo Finance chart endpoint for live, keyless quotes
- XGBoost autoregressive model using lagged prices and rolling volatility
- Explainable signal factors and recent holdout backtesting metrics
- Browser-persisted watchlist with live/stale data states
- Deterministic demo fallback when the upstream market feed is unavailable

## Run

```powershell
npm install
npm run dev
```

In a second terminal:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.main:app --reload --port 8000
```

The forecast endpoint trains a small XGBoost regressor per requested ticker and recursively predicts the next 30 days. It also returns `explanation.factors` and `backtest` metrics from a recent held-out window. If XGBoost is not installed or there is not enough history, the API reports `forecast.model: "baseline"` and keeps the dashboard available.

Open http://localhost:3000. Set `BACKEND_URL` if the backend is hosted elsewhere; requests are proxied through the Next.js server.

## Production deployment

The frontend proxies market requests through `/api/market`, so the backend API key stays server-side. The frontend is configured for a standalone Next.js build and the repository includes Docker files for running both services together:

```bash
cp .env.example .env
# Set a long random STOCKINSIDER_API_KEY and your public host values in .env
docker compose up --build -d
```

The frontend is available on port `3000` and the backend health check is available inside the stack at `/health`. For a split deployment, deploy the frontend with `npm ci && npm run build && npm start`, set `BACKEND_URL` to the private backend URL, and set the same `STOCKINSIDER_API_KEY` in both services. Set `CORS_ORIGINS` and `ALLOWED_HOSTS` to the actual production origins and hostnames.

For African exchange coverage, configure an authorized Mansa Markets API key with `MANSA_API_KEY`. Mansa is preferred for exchange-qualified African symbols such as `GCB.GH` and `MTNGH.GH`; Yahoo Finance remains the fallback for other symbols. Do not commit API keys.

The Next.js configuration uses standalone output for Docker builds, but automatically disables it on Vercel so Vercel can apply its native Next.js output tracing.

The backend request limiter defaults to `API_RATE_LIMIT=300` requests per `API_RATE_WINDOW_SECONDS=60` per client. Adjust these values for the capacity of the deployment; the dashboard refreshes visible quotes every five minutes to avoid exhausting the limit during normal use.

## Security

Copy `.env.example` to `.env.local` for local configuration. `STOCKINSIDER_API_KEY` is server-only: the Next.js proxy sends it to FastAPI, so it is never bundled into browser JavaScript. In production, set `APP_ENV=production` and a long random key; the backend refuses to start without it. Also restrict `CORS_ORIGINS` and `ALLOWED_HOSTS` to real deployment values, and terminate HTTPS at the reverse proxy.
