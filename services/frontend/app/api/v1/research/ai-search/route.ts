/**
 * Custom proxy for AI search — bypasses the Next.js rewrite (which has a hard
 * 30-second timeout) so long-running LLM synthesis requests (1–2 min) can finish.
 */
import { type NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.INTERNAL_API_URL || "http://api:8000";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!q) {
    return NextResponse.json({ detail: "q is required" }, { status: 422 });
  }

  const backendUrl = `${BACKEND}/api/v1/research/ai-search?q=${encodeURIComponent(q)}`;

  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  if (auth) headers["authorization"] = auth;

  // 120-second abort — well above any realistic LLM synthesis time
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 120_000);

  try {
    const upstream = await fetch(backendUrl, {
      headers,
      signal: controller.signal,
    });

    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "proxy error";
    return NextResponse.json({ detail: msg }, { status: 504 });
  } finally {
    clearTimeout(tid);
  }
}
