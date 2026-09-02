/**
 * WoxMail Theme Manager
 */
(function() {
  const STORAGE_KEY = 'woxmail_theme';
  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';
  const THEME_SYSTEM = 'system';

  /**
   * Determine the effective theme based on user preference and system setting
   * @param {string} preference 
   * @returns {string}
   */
  function getEffectiveTheme(preference) {
    if (preference === THEME_SYSTEM) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT;
    }
    return preference === THEME_LIGHT ? THEME_LIGHT : THEME_DARK;
  }

  /**
   * Apply the theme to the document
   * @param {string} theme 
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  /**
   * Set and save the theme
   * @param {string} theme - 'dark', 'light', or 'system'
   */
  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(getEffectiveTheme(theme));
  }

  /**
   * Toggle between dark and light themes
   */
  function toggle() {
    const currentEffective = getEffectiveTheme(localStorage.getItem(STORAGE_KEY) || THEME_SYSTEM);
    const next = currentEffective === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    setTheme(next);
  }

  // Initialize theme, accent, density, font on load
  const savedTheme = localStorage.getItem(STORAGE_KEY) || THEME_DARK;
  applyTheme(getEffectiveTheme(savedTheme));

  const savedAccent = localStorage.getItem('woxmail_accent') || 'purple';
  if (savedAccent) document.documentElement.setAttribute('data-accent', savedAccent);

  const savedDensity = localStorage.getItem('woxmail_density') || 'comfortable';
  if (savedDensity) document.documentElement.setAttribute('data-density', savedDensity);

  const savedFont = localStorage.getItem('woxmail_font') || 'inter';
  if (savedFont) document.documentElement.setAttribute('data-font', savedFont);

  const savedGlass = localStorage.getItem('woxmail_glass');
  if (savedGlass === 'true') document.documentElement.setAttribute('data-glass', 'true');

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentPref = localStorage.getItem(STORAGE_KEY) || THEME_SYSTEM;
    if (currentPref === THEME_SYSTEM) {
      applyTheme(e.matches ? THEME_DARK : THEME_LIGHT);
    }
  });

  // Export to window
  window.WoxTheme = {
    setTheme,
    toggle,
    getTheme: () => localStorage.getItem(STORAGE_KEY) || THEME_SYSTEM,
    setAccent: (accent) => {
      localStorage.setItem('woxmail_accent', accent);
      document.documentElement.setAttribute('data-accent', accent);
    },
    getAccent: () => localStorage.getItem('woxmail_accent') || 'purple',
    setDensity: (density) => {
      localStorage.setItem('woxmail_density', density);
      document.documentElement.setAttribute('data-density', density);
    },
    getDensity: () => localStorage.getItem('woxmail_density') || 'comfortable',
    setFont: (font) => {
      localStorage.setItem('woxmail_font', font);
      document.documentElement.setAttribute('data-font', font);
    },
    getFont: () => localStorage.getItem('woxmail_font') || 'inter',
    THEME_LIGHT,
    THEME_DARK,
    THEME_SYSTEM
  };
})();
