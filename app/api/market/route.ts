import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "NVDA";
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
    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ detail: "Market service unavailable" }, { status: 502 });
  }
}