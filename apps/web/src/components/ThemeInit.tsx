'use client';

/**
 * ThemeInit, anvender brukerens valgte tema + mørk modus på <html> ved app-mount.
 * Lytter også på 'sakspilot:theme-updated' så ThemePicker/UtseendePage kan
 * trigge re-apply ved bytte.
 */

import { useEffect } from 'react';
import { applyTheme, getTheme, applyDarkMode, getDarkMode } from '@/lib/themes';

export default function ThemeInit() {
  useEffect(() => {
    applyTheme(getTheme());
    applyDarkMode(getDarkMode());
    function handler() {
      applyTheme(getTheme());
      applyDarkMode(getDarkMode());
    }
    window.addEventListener('sakspilot:theme-updated', handler);
    return () => window.removeEventListener('sakspilot:theme-updated', handler);
  }, []);
  return null;
}
