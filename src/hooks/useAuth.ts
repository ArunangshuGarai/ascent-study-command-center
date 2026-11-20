import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  api,
  type AccountStats,
  type AccountUser,
  type AuthPayload,
  type PlannerSnapshot,
} from '../lib/api';

type AuthStatus = 'loading' | 'anon' | 'authed';

interface SessionState {
  status: AuthStatus;
  user: AccountUser | null;
  stats: AccountStats | null;
  planner: PlannerSnapshot | null;
  error: string | null;
}

const EMPTY_SESSION: SessionState = {
  status: 'loading',
  user: null,
  stats: null,
  planner: null,
  error: null,
};

function fromPayload(payload: AuthPayload): SessionState {
  return {
    status: 'authed',
    user: payload.user,
    stats: payload.stats,
    planner: payload.planner,
    error: null,
  };
}

export function useAuth() {
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setSession((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const payload = await api.me();
      if (mounted.current) setSession(fromPayload(payload));
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setSession({ status: 'anon', user: null, stats: null, planner: null, error: null });
        return;
      }
      setSession({
        status: 'anon',
        user: null,
        stats: null,
        planner: null,
        error: error instanceof Error ? error.message : 'Could not reach the ASCENT server.',
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const payload = await api.register(input);
    setSession(fromPayload(payload));
    return payload;
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const payload = await api.login(input);
    setSession(fromPayload(payload));
    return payload;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Clearing the client session is still the right move.
    }
    setSession({ status: 'anon', user: null, stats: null, planner: null, error: null });
  }, []);

  const setStats = useCallback((stats: AccountStats) => {
    setSession((current) => (current.status === 'authed' ? { ...current, stats } : current));
  }, []);

  const setUser = useCallback((user: AccountUser) => {
    setSession((current) => (current.status === 'authed' ? { ...current, user } : current));
  }, []);

  return {
    ...session,
    register,
    login,
    logout,
    load,
    setStats,
    setUser,
  };
}

export type AuthApi = ReturnType<typeof useAuth>;
