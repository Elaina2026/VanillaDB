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
  const shouldSuppress = (err: any, msg?: any) => {
    let str = '';
    if (typeof err === 'string') str += err + ' ';
    if (err && typeof err === 'object') {
      str += (err.message || '') + ' ' + (err.stack || '') + ' ';
    }
    if (typeof msg === 'string') str += msg + ' ';
    return (
      str.includes("reading 'startTime'") ||
      str.includes("reading 'processingStart'") ||
      str.includes('reportAllChanges')
    );
  };

  const prevOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (shouldSuppress(error, message)) {
      return true;
    }
    if (typeof prevOnError === 'function') {
      return prevOnError.apply(this, arguments as any);
    }
    return false;
  };

  window.addEventListener(
    'error',
    (event) => {
      if (shouldSuppress(event.error, event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (shouldSuppress(event.reason, event.reason?.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
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
