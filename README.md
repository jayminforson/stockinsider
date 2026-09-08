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

Open http://localhost:3000. Set `NEXT_PUBLIC_API_URL` if the backend is hosted elsewhere.

## Security

Copy `.env.example` to `.env.local` for local configuration. `STOCKINSIDER_API_KEY` is server-only: the Next.js proxy sends it to FastAPI, so it is never bundled into browser JavaScript. In production, set `APP_ENV=production` and a long random key; the backend refuses to start without it. Also restrict `CORS_ORIGINS` and `ALLOWED_HOSTS` to real deployment values, and terminate HTTPS at the reverse proxy.
