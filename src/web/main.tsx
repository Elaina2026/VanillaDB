import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth.js';
import { ThemeProvider } from './hooks/useTheme.js';
import { I18nProvider } from './hooks/useI18n.js';
import { App } from './App.js';
import './index.css';

// Defensive handler to suppress external extension/web-vitals startTime crashes
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (
      event.message?.includes("reading 'startTime'") ||
      (event.error && typeof event.error === 'object' && 'message' in event.error && String(event.error.message).includes("reading 'startTime'"))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
