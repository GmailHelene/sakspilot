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
}

const DEFAULT_APPS: LauncherApp[] = [
  // Kommunikasjon
  { id: 'outlook', label: 'Outlook', url: 'https://outlook.live.com', color: '#0078D4', emoji: '📧' },
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', color: '#EA4335', emoji: '✉️' },
  { id: 'teams', label: 'Teams', url: 'https://teams.microsoft.com', color: '#6264A7', emoji: '💬' },
  { id: 'slack', label: 'Slack', url: 'https://app.slack.com', color: '#4A154B', emoji: '💼' },
  // Kalender
  { id: 'gcal', label: 'Google Kalender', url: 'https://calendar.google.com', color: '#4285F4', emoji: '📅' },
  // Regnskap / norsk
  { id: 'tripletex', label: 'Tripletex', url: 'https://tripletex.no', color: '#1B73B8', emoji: '💼' },
  { id: 'fiken', label: 'Fiken', url: 'https://fiken.no', color: '#FF6A3D', emoji: '💰' },
  // Bygg
  { id: 'holte', label: 'Holte', url: 'https://smart.holte.no', color: '#005AAB', emoji: '🏢' },
  // Utvikling
  { id: 'github', label: 'GitHub', url: 'https://github.com', color: '#181717', emoji: '🐙' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com', color: '#10A37F', emoji: '🤖' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai', color: '#D97757', emoji: '✨' },
  // Lagring
  { id: 'drive', label: 'Google Drive', url: 'https://drive.google.com', color: '#1FA463', emoji: '📁' },
];

const STORAGE_KEY = 'sakspilot_launcher_apps';

export default function Launcher() {
  const [apps, setApps] = useState<LauncherApp[]>(DEFAULT_APPS);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEmoji, setNewEmoji] = useState('🔗');
  const [mounted, setMounted] = useState(false);
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) setApps(parsed);
      }
    } catch {}
  }, []);

  function persist(next: LauncherApp[]) {
    setApps(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function addApp() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    const url = /^https?:\/\//.test(newUrl) ? newUrl : `https://${newUrl}`;
    persist([
      ...apps,
      { id: 'u-' + Date.now(), label: newLabel.trim(), url, color: '#1E3A5F', emoji: newEmoji || '🔗' },
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
              style={{
                ...iconButtonStyle,
                background: app.color,
                color: '#FFFFFF',
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                removeApp(app.id);
              }}
              title=""
            >
              {/* Forsøk favicon, fall tilbake til emoji */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(app.url).hostname)}&sz=64`}
                alt=""
                width={22}
                height={22}
                style={{ display: 'block' }}
                onError={(e) => {
                  // Hvis favicon ikke laster, erstatt med emoji
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.emoji-fallback')) {
                    const span = document.createElement('span');
                    span.className = 'emoji-fallback';
                    span.textContent = app.emoji;
                    span.style.fontSize = '18px';
                    parent.appendChild(span);
                  }
                }}
              />
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

        {adding && (
          <div style={addFormStyle}>
            <input
              type="text"
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value.slice(0, 2))}
              placeholder="🔗"
              style={{ ...inputStyle, textAlign: 'center', marginBottom: 4 }}
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Navn"
              style={inputStyle}
            />
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="URL"
              style={{ ...inputStyle, marginTop: 4 }}
              onKeyDown={(e) => e.key === 'Enter' && addApp()}
            />
            <button onClick={addApp} style={saveButtonStyle}>
              ✓
            </button>
          </div>
        )}
      </div>

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
  borderRadius: 10,
  textDecoration: 'none',
  marginBottom: 8,
  fontSize: 18,
  border: 'none',
  cursor: 'pointer',
  transition: 'transform 0.1s',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
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

const addFormStyle: React.CSSProperties = {
  padding: 6,
  background: tokens.color.navy,
  borderRadius: 6,
  margin: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  borderRadius: 4,
  border: 'none',
  fontSize: 11,
  fontFamily: 'inherit',
  background: tokens.color.white,
  color: tokens.color.text,
};

const saveButtonStyle: React.CSSProperties = {
  marginTop: 4,
  width: '100%',
  padding: '4px',
  background: tokens.color.gold,
  color: tokens.color.white,
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
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
