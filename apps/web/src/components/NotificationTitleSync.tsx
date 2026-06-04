'use client';

/**
 * Synker varselstall til nettleser-fanen.
 *   - Tab-tittel: "(3) Sakspilot: ..." hvis det er nye varsler
 *   - Favicon: liten rød badge-prikk når sum > 0 (kun via canvas-overlay,
 *     ingen ekstra HTTP-request)
 *
 * Brukes inn fra AppLayout (eller layout.tsx), én instans per side er nok.
 * Komponenten renderer ingenting.
 */
import { useEffect, useRef } from 'react';
import { useNotifications } from '@/lib/notifications';

export function NotificationTitleSync() {
  const { counts } = useNotifications();
  const originalTitleRef = useRef<string | null>(null);
  const originalFaviconRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title.replace(/^\(\d+\)\s*/, '');
    }
    if (originalFaviconRef.current === null) {
      const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      originalFaviconRef.current = link?.href || '/favicon.ico';
    }

    if (!counts) return;

    // Summér unread for ALLE områder
    const totalUnread = Object.values(counts).reduce((s, c) => s + c.unread, 0);

    // Tab-tittel
    const baseTitle = originalTitleRef.current ?? 'Sakspilot';
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) ${baseTitle}` : baseTitle;

    // Favicon-overlay: tegn original favicon på canvas + rød badge i topp-høyre
    if (totalUnread === 0) {
      const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (link && originalFaviconRef.current) link.href = originalFaviconRef.current;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 32, 32);
      // Rød sirkel topp-høyre
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(24, 8, 7, 0, Math.PI * 2);
      ctx.fill();
      // Tall i hvit
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(totalUnread > 9 ? '9+' : String(totalUnread), 24, 8);

      const dataUrl = canvas.toDataURL('image/png');
      let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = dataUrl;
    };
    img.onerror = () => {
      // Hvis favicon ikke kan loades (CORS osv), bare oppdater tittel
    };
    img.src = originalFaviconRef.current;
  }, [counts]);

  return null;
}
