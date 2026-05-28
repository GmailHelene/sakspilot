'use client';

import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';

/**
 * Basaas-style icon-launcher.
 * Smal vertikal kolonne, ikon-basert. Brukeren ser favorittapper og
 * kan klikke for å åpne i ny fane (web) eller default browser (Electron).
 *
 * Henter favicon dynamisk fra Google's favicon-API for konsistente ikoner
 * uten å måtte hoste dem selv. Faller tilbake til emoji hvis bilde ikke
 * kan lastes.
 */

interface LauncherApp {
  id: string;
  label: string;
  url: string;
  color: string;
  emoji: string;
  /// Brand-slug for simple-icons.org. Null for tjenester uten kjent brand-ikon
  /// (f.eks. norske SaaS) — da brukes emoji som fallback.
  brandSlug?: string | null;
}

// brandSlug = simple-icons.org sin slug for offisielt brand-ikon i hvit farge
// (cdn.simpleicons.org/{slug}/{color} returnerer SVG i ønsket farge)
const DEFAULT_APPS: LauncherApp[] = [
  // Kommunikasjon
  { id: 'outlook', label: 'Outlook', url: 'https://outlook.office.com/mail/', color: '#0078D4', emoji: '📧', brandSlug: 'microsoftoutlook' },
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', color: '#EA4335', emoji: '✉️', brandSlug: 'gmail' },
  { id: 'teams', label: 'Teams', url: 'https://teams.microsoft.com', color: '#6264A7', emoji: '💬', brandSlug: 'microsoftteams' },
  { id: 'slack', label: 'Slack', url: 'https://app.slack.com', color: '#4A154B', emoji: '💼', brandSlug: 'slack' },
  // Kalender
  { id: 'gcal', label: 'Google Kalender', url: 'https://calendar.google.com', color: '#4285F4', emoji: '📅', brandSlug: 'googlecalendar' },
  // Regnskap / norsk
  { id: 'tripletex', label: 'Tripletex', url: 'https://tripletex.no', color: '#1B73B8', emoji: '💼', brandSlug: null },
  { id: 'fiken', label: 'Fiken', url: 'https://fiken.no', color: '#FF6A3D', emoji: '💰', brandSlug: null },
  // Bygg
  { id: 'holte', label: 'Holte', url: 'https://smart.holte.no', color: '#005AAB', emoji: '🏢', brandSlug: null },
  // Utvikling
  { id: 'github', label: 'GitHub', url: 'https://github.com', color: '#181717', emoji: '🐙', brandSlug: 'github' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com', color: '#10A37F', emoji: '🤖', brandSlug: 'openai' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai', color: '#D97757', emoji: '✨', brandSlug: 'anthropic' },
  // Lagring
  { id: 'drive', label: 'Google Drive', url: 'https://drive.google.com', color: '#1FA463', emoji: '📁', brandSlug: 'googledrive' },
];

const STORAGE_KEY = 'sakspilot_launcher_apps';

interface MySite {
  id: string;
  label: string;
  url: string;
}

export default function Launcher() {
  const [apps, setApps] = useState<LauncherApp[]>(DEFAULT_APPS);
  const [mySites, setMySites] = useState<MySite[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEmoji, setNewEmoji] = useState('🔗');
  const [mounted, setMounted] = useState(false);
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    loadFromStorage();
    function handler() {
      loadFromStorage();
    }
    window.addEventListener('sakspilot:launcher-updated', handler);
    // Lytt også når Mine sites endres (Sidebar disptacher det)
    window.addEventListener('sakspilot:sites-updated', handler);
    // storage-eventet fyrer på andre tabs/vinduer — fanger samme-vindu via custom event
    return () => {
      window.removeEventListener('sakspilot:launcher-updated', handler);
      window.removeEventListener('sakspilot:sites-updated', handler);
    };
  }, []);

  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) setApps(parsed);
      }
      const sites = localStorage.getItem('sakspilot_my_sites');
      if (sites) {
        const parsed = JSON.parse(sites);
        if (Array.isArray(parsed)) setMySites(parsed);
      } else {
        setMySites([]);
      }
    } catch {}
  }

  function persist(next: LauncherApp[]) {
    setApps(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function addApp() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    const url = /^https?:\/\//.test(newUrl) ? newUrl : `https://${newUrl}`;
    // Forsøk å auto-utlede brandSlug fra hostname (f.eks. notion.so → notion)
    let brandSlug: string | null = null;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const firstSegment = hostname.split('.')[0];
      // Bare bruk hvis det er en kjent simple-icons brand (vi gjetter)
      if (/^[a-z0-9]+$/.test(firstSegment) && firstSegment.length > 2) {
        brandSlug = firstSegment;
      }
    } catch {}
    persist([
      ...apps,
      {
        id: 'u-' + Date.now(),
        label: newLabel.trim(),
        url,
        color: '#1E3A5F',
        emoji: newEmoji || '🔗',
        brandSlug,
      },
    ]);
    setNewLabel('');
    setNewUrl('');
    setNewEmoji('🔗');
    setAdding(false);
  }

  function removeApp(id: string) {
    if (!confirm('Fjern denne snarveien?')) return;
    persist(apps.filter((a) => a.id !== id));
  }

  function resetToDefaults() {
    if (!confirm('Tilbakestill alle snarveier til standard? Dine egne fjernes.')) return;
    persist(DEFAULT_APPS);
  }

  return (
    <aside style={launcherStyle}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'visible', padding: '8px 0' }}>
        {mounted && apps.map((app) => (
          <div
            key={app.id}
            style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
            onMouseEnter={() => setTooltipId(app.id)}
            onMouseLeave={() => setTooltipId(null)}
          >
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={async (e) => {
                // I Electron: åpne INNE i dashbordet via BrowserView, ikke ny tab
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const api = (typeof window !== 'undefined' ? (window as any).sakspilot : null);
                if (api?.isDesktop && api.openInWindow) {
                  e.preventDefault();
                  await api.openInWindow(app.url, app.label);
                }
              }}
              style={{
                ...iconButtonStyle,
                background: app.color,
                color: '#FFFFFF',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = '';
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                removeApp(app.id);
              }}
              title=""
            >
              {/* Foretrekker simple-icons (offisielt brand-SVG i hvit) — faller
                  tilbake til emoji for tjenester uten brand-slug eller hvis
                  CDN feiler. */}
              {app.brandSlug ? (
                <img
                  src={`https://cdn.simpleicons.org/${app.brandSlug}/ffffff`}
                  alt=""
                  width={22}
                  height={22}
                  style={{ display: 'block' }}
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.emoji-fallback')) {
                      const span = document.createElement('span');
                      span.className = 'emoji-fallback';
                      span.textContent = app.emoji;
                      span.style.fontSize = '20px';
                      parent.appendChild(span);
                    }
                  }}
                />
              ) : (
                <span style={{ fontSize: 20, fontWeight: 700 }}>
                  {app.emoji}
                </span>
              )}
            </a>

            {tooltipId === app.id && (
              <div style={tooltipStyle}>
                {app.label}
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                  Høyreklikk for å fjerne
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Mine sites — favicon-knapper, vises rett under apps */}
        {mounted && mySites.length > 0 && (
          <>
            <div
              style={{
                width: 28,
                height: 1,
                background: 'rgba(255,255,255,0.15)',
                margin: '12px auto',
              }}
            />
            {mySites.map((s) => (
              <div
                key={s.id}
                style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
                onMouseEnter={() => setTooltipId('site-' + s.id)}
                onMouseLeave={() => setTooltipId(null)}
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async (e) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const api = (typeof window !== 'undefined' ? (window as any).sakspilot : null);
                    if (api?.isDesktop && api.openInWindow) {
                      e.preventDefault();
                      await api.openInWindow(s.url, s.label);
                    }
                  }}
                  style={{
                    ...iconButtonStyle,
                    background: 'white',
                    color: '#1E3A5F',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.transform = '';
                  }}
                >
                  <LauncherSiteFavicon url={s.url} label={s.label} />
                </a>
                {tooltipId === 'site-' + s.id && (
                  <div style={tooltipStyle}>{s.label}</div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Legg til-knapp */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <button
            onClick={() => setAdding(!adding)}
            style={{
              ...iconButtonStyle,
              background: tokens.color.bgAlt,
              color: tokens.color.navy,
              fontSize: 20,
              fontWeight: 600,
            }}
            title="Legg til app"
          >
            {adding ? '×' : '+'}
          </button>
        </div>

      </div>

      {/* Add-modal — sentral popup i stedet for inline form i den smale stripa */}
      {adding && (
        <div
          onClick={() => setAdding(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(23, 43, 77, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            fontFamily: tokens.font.sans,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              padding: 28,
              borderRadius: 16,
              maxWidth: 420,
              width: '100%',
              boxShadow: tokens.shadow.xl,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, color: tokens.color.navy, marginBottom: 6 }}>
              Legg til snarvei
            </h2>
            <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 20 }}>
              Legg til en webapp som åpnes inne i Sakspilot-vinduet.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={modalLabel}>Ikon (emoji)</label>
              <input
                type="text"
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))}
                placeholder="🔗"
                style={{ ...modalInput, width: 60, fontSize: 22, textAlign: 'center' }}
                maxLength={4}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={modalLabel}>Navn</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="F.eks. Notion"
                style={modalInput}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={modalLabel}>URL</label>
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://notion.so"
                style={modalInput}
                onKeyDown={(e) => e.key === 'Enter' && addApp()}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAdding(false)}
                style={{
                  padding: '10px 18px',
                  background: 'transparent',
                  color: tokens.color.text,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Avbryt
              </button>
              <button
                onClick={addApp}
                style={{
                  padding: '10px 22px',
                  background: tokens.gradient.navy,
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Legg til
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset-knapp nederst */}
      <button
        onClick={resetToDefaults}
        style={resetButtonStyle}
        title="Tilbakestill snarveier"
      >
        ↻
      </button>
    </aside>
  );
}

function LauncherSiteFavicon({ url, label }: { url: string; label: string }) {
  const [tier, setTier] = useState<0 | 1 | 2>(0);
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {}
  if (tier === 2) {
    const palette = ['#1E3A5F', '#C2185B', '#2C5F2D', '#0086CC', '#A358DF', '#FF7A45', '#00B884', '#E2445C'];
    let hash = 0;
    for (let i = 0; i < hostname.length; i++) hash = (hash * 31 + hostname.charCodeAt(i)) | 0;
    const bg = palette[Math.abs(hash) % palette.length];
    const letter = (label || hostname).charAt(0).toUpperCase();
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: bg,
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {letter}
      </div>
    );
  }
  const src = tier === 0
    ? `https://icons.duckduckgo.com/ip3/${hostname}.ico`
    : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  return (
    <img
      src={src}
      alt=""
      width={22}
      height={22}
      style={{ display: 'block', borderRadius: 4 }}
      onError={() => setTier((t) => (t + 1) as 0 | 1 | 2)}
    />
  );
}

const launcherStyle: React.CSSProperties = {
  width: 60,
  minWidth: 60,
  background: tokens.color.navyDark,
  borderRight: `1px solid ${tokens.color.navy}`,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const iconButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: 12, // litt mer rounded — moderne app-launcher-look
  textDecoration: 'none',
  marginBottom: 8,
  fontSize: 18,
  border: 'none',
  cursor: 'pointer',
  transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s',
  boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
};

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  left: 50,
  top: '50%',
  transform: 'translateY(-50%)',
  background: '#1A1A1A',
  color: '#FFFFFF',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 12,
  whiteSpace: 'nowrap',
  zIndex: 100,
  pointerEvents: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};

const modalLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: tokens.color.textMuted,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const modalInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${tokens.color.border}`,
  fontSize: 14,
  fontFamily: 'inherit',
  background: tokens.color.white,
  color: tokens.color.text,
};

const resetButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  margin: '8px auto',
  background: 'transparent',
  color: 'rgba(255,255,255,0.4)',
  border: 'none',
  borderRadius: 6,
  fontSize: 16,
  cursor: 'pointer',
};
