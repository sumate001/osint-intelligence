// Use relative URL so requests go through Next.js proxy (next.config.mjs rewrites /api/* → backend)
// Falls back to absolute URL for server-side rendering if needed
const API_BASE =
  typeof window !== "undefined"
    ? ""  // browser: relative URL → proxy handles it
    : (process.env.NEXT_PUBLIC_API_URL || "http://api:8000");

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("osintdesk-auth");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

interface FetchOptions extends Omit<RequestInit, "body"> {
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, body, ...init } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
    const qs = q.toString();
    if (qs) url += `?${qs}`;
  }

  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(url, {
    ...init,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `HTTP ${response.status}`;
    try {
      const json = JSON.parse(text);
      const raw = json.detail ?? json.message;
      if (typeof raw === "string") {
        message = raw;
      } else if (Array.isArray(raw)) {
        message = raw.map((e: { msg?: string; loc?: string[] }) =>
          `${e.loc?.slice(1).join(".") ?? "field"}: ${e.msg ?? "invalid"}`
        ).join("; ");
      }
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json();
}

export async function apiLogin(
  email: string,
  password: string
): Promise<{ access_token: string; user_id: string; role: string }> {
  const form = new URLSearchParams({ username: email, password });
  const response = await fetch(`${API_BASE}/api/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) throw new Error("Login failed");
  return response.json();
}
