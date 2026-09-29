import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { IntlProvider } from '../i18n/IntlProvider.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

const root = createRoot(document.getElementById('dashboard-root'));
root.render(
  <ErrorBoundary>
    <IntlProvider>
      <App />
    </IntlProvider>
  </ErrorBoundary>
);
