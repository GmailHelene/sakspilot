'use client';

/**
 * ThemeInit — anvender brukerens valgte tema på <html>-elementet ved app-mount.
 * Lytter også på 'sakspilot:theme-updated' så ThemePicker kan trigge re-apply.
 */

import { useEffect } from 'react';
import { applyTheme, getTheme } from '@/lib/themes';

export default function ThemeInit() {
  useEffect(() => {
    applyTheme(getTheme());
    function handler() {
      applyTheme(getTheme());
    }
    window.addEventListener('sakspilot:theme-updated', handler);
    return () => window.removeEventListener('sakspilot:theme-updated', handler);
  }, []);
  return null;
}
