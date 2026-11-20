import type { AppState } from '../types';

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AccountStats {
  xp: number;
  completed: number;
  studyMinutes: number;
  coverage: number;
  bestStreak: number;
  mocksTaken: number;
  mockAvg: number;
  updatedAt: string | null;
}

export interface PlannerSnapshot {
  state: AppState | null;
  revision: number;
  updatedAt: string | null;
}

export interface AuthPayload {
  user: AccountUser;
  stats: AccountStats;
  planner: PlannerSnapshot;
}

export interface SaveResult {
  revision: number;
  stats: AccountStats;
  updatedAt: string;
  user: AccountUser;
}

export class ApiError extends Error {
  status: number;
  field?: string;

  constructor(message: string, status = 0, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Cannot reach the ASCENT server. Check your connection and try again.',
      0,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed (${response.status}).`,
      response.status,
      payload?.field,
    );
  }
  return payload as T;
}

export const api = {
  register(input: { name: string; email: string; password: string }) {
    return request<AuthPayload>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  login(input: { email: string; password: string }) {
    return request<AuthPayload>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  me() {
    return request<AuthPayload>('/api/auth/me');
  },

  savePlanner(state: AppState) {
    return request<SaveResult>('/api/planner', {
      method: 'PUT',
      body: JSON.stringify({ state }),
    });
  },

  stats() {
    return request<{ stats: AccountStats }>('/api/stats');
  },

  leaderboard() {
    return request<{ leaders: Array<{ id: string; name: string; xp: number; completed: number; you: boolean }> }>(
      '/api/leaderboard',
    );
  },
};

/**
 * Last-chance save when the tab is closing. Most planner payloads fit in the
 * keepalive budget; failures are harmless because the debounced save usually
 * wins the race.
 */
export function beaconSave(state: AppState) {
  try {
    const body = JSON.stringify({ state });
    if (body.length > 60_000) return;
    fetch('/api/planner', {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => undefined);
  } catch {
    // no-op
  }
}
