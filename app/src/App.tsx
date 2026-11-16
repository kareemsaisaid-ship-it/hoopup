import React from 'react';
import { AppRouter } from './app/router';
import { AppServicesProvider } from './services';

export const App: React.FC = () => {
  return (
    <AppServicesProvider>
      <AppRouter />
    </AppServicesProvider>
  );
};

export default App;
