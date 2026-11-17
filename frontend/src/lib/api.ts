import { useAuthStore } from '@/features/auth/store';
import type { AuthResponse } from './types';

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = null,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        useAuthStore.getState().clearSession();
        return null;
      }
      const data = (await res.json()) as AuthResponse;
      useAuthStore.getState().setSession(data.access_token, data.user);
      return data.access_token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
  skipAuth?: boolean;
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  const reqId = res.headers.get('X-Request-ID') ?? undefined;
  try {
    const json = await res.json();
    if (json && typeof json === 'object' && 'error' in json && json.error) {
      const err = json.error as { code?: string; message?: string; details?: unknown };
      return new ApiError(
        res.status,
        err.code || 'http_error',
        err.message || res.statusText || 'Request failed',
        err.details ?? null,
        json.request_id || reqId,
      );
    }
  } catch {
    // Non-JSON error body
  }
  return new ApiError(res.status, 'http_error', res.statusText || 'Request failed', null, reqId);
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, timeoutMs = 15000, skipAuth = false, headers: customHeaders, ...rest } = opts;

  const exec = async (tokenOverride?: string | null): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(customHeaders);
    if (body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const token = tokenOverride ?? useAuthStore.getState().accessToken;
    if (!skipAuth && token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    try {
      return await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers,
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await exec();
  if (res.status === 401 && !skipAuth && !path.startsWith('/api/v1/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await exec(newToken);
    }
  }

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T = void>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
};

