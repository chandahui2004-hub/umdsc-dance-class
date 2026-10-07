import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { UploadManagerProvider } from '../features/media/uploadManager';
import { AppRoutes } from './routes';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UploadManagerProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </UploadManagerProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
