import React, { useEffect } from 'react';

/**
 * BackgroundCanvas ensures the multi-shader interactive canvas background engine
 * is loaded, active, and syncing with localStorage preferences in the React workspace.
 */
export default function BackgroundCanvas() {
  useEffect(() => {
    let savedMode = localStorage.getItem('woxmail_bg_mode');
    if (!savedMode || savedMode === 'oled_monochrome') {
      savedMode = 'aurora';
    }
    const savedIntensity = localStorage.getItem('woxmail_bg_intensity') || '1.0';

    function apply() {
      if (window.WoxBackground) {
        window.WoxBackground.setMode(savedMode);
        window.WoxBackground.setIntensity(parseFloat(savedIntensity));
        if (typeof window.WoxBackground.resize === 'function') {
          window.WoxBackground.resize();
        }
      }
    }

    if (window.WoxBackground) {
      apply();
    } else {
      let script = document.querySelector('script[src="/js/backgrounds.js"]');
      if (!script) {
        script = document.createElement('script');
        script.src = '/js/backgrounds.js';
        script.async = true;
        document.body.appendChild(script);
      }
      script.addEventListener('load', apply);
    }
  }, []);

  return null;
}
