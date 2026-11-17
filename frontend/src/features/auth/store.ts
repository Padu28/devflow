import { create } from 'zustand';
import type { User } from '@/lib/types';

export type ThemeMode = 'dark' | 'light';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  bootstrapped: boolean;
  theme: ThemeMode;
  reduceMotion: boolean;
  lastOrgSlug: string | null;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clearSession: () => void;
  setBootstrapped: (value: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setReduceMotion: (value: boolean) => void;
  setLastOrgSlug: (slug: string) => void;
}

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('devflow-theme');
  return stored === 'light' ? 'light' : 'dark';
};

const getInitialReduceMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('devflow-reduce-motion') === 'true';
};

const getInitialOrgSlug = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('devflow-last-org');
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  bootstrapped: false,
  theme: getInitialTheme(),
  reduceMotion: getInitialReduceMotion(),
  lastOrgSlug: getInitialOrgSlug(),

  setSession: (accessToken, user) => set({ accessToken, user, bootstrapped: true }),
  setUser: (user) => set({ user }),
  clearSession: () => set({ accessToken: null, user: null, bootstrapped: true }),
  setBootstrapped: (bootstrapped) => set({ bootstrapped }),

  setTheme: (theme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(theme);
      localStorage.setItem('devflow-theme', theme);
    }
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  setReduceMotion: (reduceMotion) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('reduce-motion', reduceMotion);
      localStorage.setItem('devflow-reduce-motion', String(reduceMotion));
    }
    set({ reduceMotion });
  },

  setLastOrgSlug: (slug) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('devflow-last-org', slug);
    }
    set({ lastOrgSlug: slug });
  },
}));

