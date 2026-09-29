import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { IntlProvider } from '../i18n/IntlProvider.jsx';

const root = createRoot(document.getElementById('admin-root'));
root.render(
  <IntlProvider>
    <App />
  </IntlProvider>
);
