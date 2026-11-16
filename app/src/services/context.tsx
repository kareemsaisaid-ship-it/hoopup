import { createContext, useContext } from 'react';
import type { AppServicesContextValue } from './types';

export const AppServicesContext = createContext<AppServicesContextValue | null>(null);

export const useAppServices = (): AppServicesContextValue => {
  const ctx = useContext(AppServicesContext);
  if (!ctx) {
    throw new Error('useAppServices must be used within an AppServicesProvider');
  }
  return ctx;
};
