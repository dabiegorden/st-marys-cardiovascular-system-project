/**
 * Thin fetch wrapper for the Express API (proxied same-origin under /api).
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: { field: string; message: string }[];
  constructor(
    status: number,
    message: string,
    code?: string,
    errors?: { field: string; message: string }[],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

function handleAuthRedirect(err: ApiError) {
  if (typeof window === "undefined") return;
  const here = window.location.pathname;
  if (err.status === 401 && !here.startsWith("/login")) {
    window.location.href = `/login?next=${encodeURIComponent(here + window.location.search)}`;
  } else if (err.code === "PASSWORD_CHANGE_REQUIRED" && !here.startsWith("/change-password")) {
    window.location.href = "/change-password";
  } else if (err.code === "TWO_FACTOR_SETUP_REQUIRED" && !here.startsWith("/setup-2fa")) {
    window.location.href = "/setup-2fa";
  }
}

type Init = RequestInit & { json?: unknown };

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = new ApiError(
      res.status,
      data?.error ?? data?.message ?? `Request failed (${res.status})`,
      data?.code,
      data?.errors,
    );
    handleAuthRedirect(err);
    throw err;
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
}
