import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiAuthService, ApiDataService } from './apiAdapter';
import { AppServicesContext } from './context';
import { MockAuthService, MockDataService, MockStorage } from './mockAdapter';
import { SupabaseAuthService, SupabaseDataService } from './supabaseAdapter';
import type { AppServicesContextValue, AuthService, DataService } from './types';

declare global {
  interface Window {
    __HOOPUP_DEMO_RESET__?: () => void;
  }
}

export interface AppServicesProviderProps {
  children: React.ReactNode;
  forceMode?: 'demo' | 'connected';
}

export const AppServicesProvider: React.FC<AppServicesProviderProps> = ({ children, forceMode }) => {
  // 1. API Mode (Takes precedence when VITE_API_BASE_URL is set)
  const apiAuth = useMemo(() => new ApiAuthService(), []);
  const apiData = useMemo(() => new ApiDataService(apiAuth), [apiAuth]);

  // 2. Supabase Mode
  const supabaseAuth = useMemo(() => new SupabaseAuthService(), []);
  const supabaseData = useMemo(() => new SupabaseDataService(supabaseAuth), [supabaseAuth]);

  // 3. Demo Mode
  const mockStorage = useMemo(() => new MockStorage(), []);
  const mockAuth = useMemo(() => new MockAuthService(mockStorage), [mockStorage]);
  const mockData = useMemo(() => new MockDataService(mockStorage, mockAuth), [mockStorage, mockAuth]);

  // Determine connected backend configuration & type
  const connectedModeType: 'connected-api' | 'connected-supabase' | 'demo' = useMemo(() => {
    if (apiAuth.isConfigured) return 'connected-api';
    if (supabaseAuth.isConfigured) return 'connected-supabase';
    return 'demo';
  }, [apiAuth.isConfigured, supabaseAuth.isConfigured]);

  const isConfigured = apiAuth.isConfigured || supabaseAuth.isConfigured;

  // Determine active mode: demo vs connected
  const [useDemo, setUseDemo] = useState<boolean>(() => {
    if (forceMode === 'demo') return true;
    if (forceMode === 'connected') return false;

    // Default to demo if neither API nor Supabase is configured
    if (!isConfigured) return true;

    const saved = typeof window !== 'undefined' ? localStorage.getItem('hoopup_preferred_mode') : null;

    // When VITE_API_BASE_URL is set, default to connected-api unless explicitly saved as demo
    if (apiAuth.isConfigured) {
      return saved === 'demo';
    }

    // Supabase fallback keeps original behavior (default demo unless saved as connected)
    return saved === 'demo' || !saved;
  });

  const connectedAuth: AuthService = apiAuth.isConfigured ? apiAuth : supabaseAuth;
  const connectedData: DataService = apiAuth.isConfigured ? apiData : supabaseData;

  const auth: AuthService = useDemo ? mockAuth : connectedAuth;
  const data: DataService = useDemo ? mockData : connectedData;

  const resetDemoState = useCallback(() => {
    mockStorage.resetAll();
  }, [mockStorage]);

  // Expose global reset hook for automated E2E tests (Seat G4)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__HOOPUP_DEMO_RESET__ = resetDemoState;

      // Handle ?demo_reset=true query param
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo_reset') === 'true') {
        resetDemoState();
        // Clean URL parameter without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete('demo_reset');
        window.history.replaceState({}, '', url.toString());
      }
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__HOOPUP_DEMO_RESET__;
      }
    };
  }, [resetDemoState]);

  const value: AppServicesContextValue = useMemo(
    () => ({
      auth,
      data,
      isDemo: useDemo,
      isConfigured: apiAuth.isConfigured ? apiAuth.isConfigured : supabaseAuth.isConfigured,
      connectedModeType,
      resetDemoState,
      setUseDemo: (val: boolean) => {
        setUseDemo(val);
        if (typeof window !== 'undefined') {
          localStorage.setItem('hoopup_preferred_mode', val ? 'demo' : 'connected');
        }
      },
    }),
    [auth, data, resetDemoState, useDemo, apiAuth.isConfigured, supabaseAuth.isConfigured, connectedModeType]
  );

  return <AppServicesContext.Provider value={value}>{children}</AppServicesContext.Provider>;
};
