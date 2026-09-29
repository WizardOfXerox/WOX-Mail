import React, { createContext, useContext, useState, useEffect } from 'react';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';

const dictionaries = { en, es, fr, de };
const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'];

const IntlContext = createContext({
  locale: 'en',
  setLocale: () => {},
  t: (key, fallback = '') => fallback || key,
  isRtl: false
});

export function IntlProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try {
      const stored = localStorage.getItem('woxmail_lang');
      if (stored && dictionaries[stored]) return stored;
      const browserLang = navigator.language?.split('-')[0];
      if (browserLang && dictionaries[browserLang]) return browserLang;
    } catch {}
    return 'en';
  });

  const setLocale = (newLocale) => {
    if (dictionaries[newLocale] || newLocale === 'en') {
      setLocaleState(newLocale);
      try {
        localStorage.setItem('woxmail_lang', newLocale);
      } catch {}
    }
  };

  const isRtl = RTL_LOCALES.includes(locale);

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  }, [locale, isRtl]);

  const t = (key, fallback = '') => {
    const dict = dictionaries[locale] || dictionaries.en;
    return dict[key] || dictionaries.en[key] || fallback || key;
  };

  return (
    <IntlContext.Provider value={{ locale, setLocale, t, isRtl }}>
      {children}
    </IntlContext.Provider>
  );
}

export function useIntl() {
  return useContext(IntlContext);
}

export default IntlProvider;
