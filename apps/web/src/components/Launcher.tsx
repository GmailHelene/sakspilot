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
  /// 'web' (default) = åpnes som webside (BrowserView i Electron, ny fane i browser).
  /// 'local' = åpner et lokalt Windows-program via shell.openPath. Kun Electron.
  kind?: 'web' | 'local';
  /// Sti til .exe / .lnk / .bat når kind='local'. Brukes i stedet for url.
  exePath?: string;
  /// Egendefinert ikon som data-URL (base64). Hvis satt, brukes denne i stedet
  /// for brand-SVG/favicon/initialer. Sparer plass: hold under 50 KB per ikon.
  iconDataUrl?: string;
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

interface TooltipState {
  id: string;
  label: string;
  // Fixed-coord posisjon (forhindrer clipping av overflow:auto-container)
  top: number;
  left: number;
}

export default function Launcher() {
  const [apps, setApps] = useState<LauncherApp[]>(DEFAULT_APPS);
  const [mySites, setMySites] = useState<MySite[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEmoji, setNewEmoji] = useState('🔗');
  // Lokal-app-modus i add-modal: 'web' (default URL) eller 'local' (.exe-fil)
  const [newKind, setNewKind] = useState<'web' | 'local'>('web');
  const [newExePath, setNewExePath] = useState('');
  const [newIconDataUrl, setNewIconDataUrl] = useState<string | null>(null);
  const [iconErr, setIconErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // Drag-and-drop reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function showTooltip(e: React.MouseEvent, id: string, label: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ id, label, top: rect.top + rect.height / 2, left: rect.right + 8 });
  }
  function hideTooltip() {
    setTooltip(null);
  }

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...apps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  }

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
    const label = newLabel.trim();
    if (!label) return;

    if (newKind === 'local') {
      if (!newExePath.trim()) return;
      persist([
        ...apps,
        {
          id: 'u-' + Date.now(),
          label,
          url: '', // ikke brukt for lokale
          color: '#374151',
          emoji: newEmoji || '⚙️',
          brandSlug: null,
          kind: 'local',
          exePath: newExePath.trim(),
          iconDataUrl: newIconDataUrl || undefined,
        },
      ]);
    } else {
      if (!newUrl.trim()) return;
      const url = /^https?:\/\//.test(newUrl) ? newUrl : `https://${newUrl}`;
      // Forsøk å auto-utlede brandSlug fra hostname (f.eks. notion.so → notion)
      let brandSlug: string | null = null;
      try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        const firstSegment = hostname.split('.')[0];
        if (/^[a-z0-9]+$/.test(firstSegment) && firstSegment.length > 2) {
          brandSlug = firstSegment;
        }
      } catch {}
      persist([
        ...apps,
        {
          id: 'u-' + Date.now(),
          label,
          url,
          color: '#1E3A5F',
          emoji: newEmoji || '🔗',
          brandSlug,
          kind: 'web',
          iconDataUrl: newIconDataUrl || undefined,
        },
      ]);
    }
    setNewLabel('');
    setNewUrl('');
    setNewEmoji('🔗');
    setNewExePath('');
    setNewKind('web');
    setNewIconDataUrl(null);
    setIconErr(null);
    setAdding(false);
  }

  // Egendefinert ikon-opplasting. Aksepterer PNG/JPG/SVG, maks 200KB (1024 base64).
  // Lagres som data-URL så det kan synes på tvers av enheter via cloud-sync.
  async function onIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    setIconErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|svg\+xml|webp|gif)$/i.test(file.type)) {
      setIconErr('Bare PNG, JPG, SVG, WebP og GIF er støttet.');
      return;
    }
    if (file.size > 200 * 1024) {
      setIconErr('Bildet er for stort (maks 200 KB). Kompresser det først.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setNewIconDataUrl(dataUrl);
    } catch (err) {
      setIconErr('Kunne ikke lese bildet: ' + (err instanceof Error ? err.message : 'ukjent feil'));
    }
  }

  async function pickExe() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (typeof window !== 'undefined' ? (window as any).sakspilot : null);
    if (!api?.isDesktop || !api.pickExeFile) {
      alert('Krever Sakspilot Desktop (.exe-versjonen). I nettleseren kan vi ikke åpne lokale programmer.');
      return;
    }
    const r = await api.pickExeFile();
    if (r?.ok) {
      setNewExePath(r.filePath);
      if (!newLabel.trim() && r.suggestedLabel) setNewLabel(r.suggestedLabel);
    }
  }

  async function openApp(app: LauncherApp) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (typeof window !== 'undefined' ? (window as any).sakspilot : null);
    if (app.kind === 'local') {
      if (!api?.isDesktop || !api.openLocalPath) {
        alert(`«${app.label}» er et lokalt program og krever Sakspilot Desktop.`);
        return;
      }
      const r = await api.openLocalPath(app.exePath || '');
      if (!r?.ok) {
        alert(`Kunne ikke åpne ${app.label}: ${r?.error || 'ukjent feil'}`);
      }
      return;
    }
    // Web — som før
    if (api?.isDesktop && api.openInWindow) {
      await api.openInWindow(app.url, app.label);
    } else {
      window.open(app.url, '_blank', 'noopener,noreferrer');
    }
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
        {mounted && apps.map((app, i) => {
          const isDragging = dragIndex === i;
          const isOver = dragOverIndex === i && dragIndex !== i;
          return (
          <div
            key={app.id}
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
              // Skjul default-drag-bilde litt så det ikke ser stygt ut
              try { e.dataTransfer.setData('text/plain', app.id); } catch {}
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverIndex !== i) setDragOverIndex(i);
            }}
            onDragLeave={() => {
              if (dragOverIndex === i) setDragOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i);
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              opacity: isDragging ? 0.35 : 1,
              // Visuelle drop-indikatorer: tykk gull-strek over hover-targetet
              boxShadow: isOver ? 'inset 0 3px 0 0 #D4A017' : 'none',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => showTooltip(e, app.id, app.kind === 'local' ? `${app.label} (lokalt program)` : app.label)}
            onMouseLeave={hideTooltip}
          >
            <button
              onClick={(e) => {
                e.preventDefault();
                openApp(app);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                removeApp(app.id);
              }}
              style={{
                ...iconButtonStyle,
                background: app.color,
                color: '#FFFFFF',
                cursor: 'grab',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = '';
              }}
              title=""
              aria-label={app.label}
            >
              {/* Prioritetsrekkefølge:
                  1. Egendefinert opplastet ikon (iconDataUrl)
                  2. simple-icons brand-SVG (cdn.simpleicons.org)
                  3. Initialer fra label (fallback) */}
              {app.iconDataUrl ? (
                <img
                  src={app.iconDataUrl}
                  alt=""
                  width={26}
                  height={26}
                  style={{
                    display: 'block',
                    borderRadius: 6,
                    objectFit: 'cover',
                    pointerEvents: 'none',
                  }}
                  draggable={false}
                />
              ) : app.brandSlug ? (
                <img
                  src={`https://cdn.simpleicons.org/${app.brandSlug}/ffffff`}
                  alt=""
                  width={22}
                  height={22}
                  style={{ display: 'block', pointerEvents: 'none' }}
                  draggable={false}
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.label-fallback')) {
                      const span = document.createElement('span');
                      span.className = 'label-fallback';
                      // Initialer fra label (1-2 bokstaver), ikke kjede-emoji
                      const src = (app.label || '').replace(/^www\./, '');
                      const words = src.split(/[\s\-_.]+/).filter(Boolean);
                      const initials = words.length >= 2
                        ? (words[0][0] + words[1][0]).toUpperCase()
                        : src.slice(0, 2).toUpperCase();
                      span.textContent = initials || '?';
                      span.style.fontSize = '12px';
                      span.style.fontWeight = '700';
                      span.style.color = '#FFFFFF';
                      span.style.lineHeight = '1';
                      parent.appendChild(span);
                    }
                  }}
                />
              ) : (
                // Ingen brand-slug = vis initialer direkte (f.eks. for norske
                // tjenester som Tripletex/Fiken/Holte som ikke har simple-icons-
                // brand-svg)
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: '#FFFFFF',
                    pointerEvents: 'none',
                  }}
                >
                  {(() => {
                    const src = (app.label || '').replace(/^www\./, '');
                    const words = src.split(/[\s\-_.]+/).filter(Boolean);
                    return words.length >= 2
                      ? (words[0][0] + words[1][0]).toUpperCase()
                      : src.slice(0, 2).toUpperCase() || '?';
                  })()}
                </span>
              )}
            </button>
          </div>
        );
        })}

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
                onMouseEnter={(e) => showTooltip(e, 'site-' + s.id, s.label)}
                onMouseLeave={hideTooltip}
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
            <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 16 }}>
              Velg om snarveien skal åpne en webside eller et lokalt program på PC-en.
            </p>

            {/* Tabs: Webside vs Lokal app */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: '#F1F3F7', padding: 4, borderRadius: 10 }}>
              {(['web', 'local'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setNewKind(k)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: newKind === k ? 'white' : 'transparent',
                    color: newKind === k ? tokens.color.navy : tokens.color.textMuted,
                    border: 'none',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: newKind === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {k === 'web' ? '🌐 Webside' : '🖥️ Lokalt program'}
                </button>
              ))}
            </div>

            {/* Emoji-input fjernet — for web-snarveier hentes ikonet automatisk
                fra favicon (DuckDuckGo/Google), for lokale .exe brukes default
                ⚙️ fallback. Holder formen enkel. */}

            <div style={{ marginBottom: 14 }}>
              <label style={modalLabel}>Navn</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={newKind === 'local' ? 'F.eks. Cyberduck' : 'F.eks. Notion'}
                style={modalInput}
                autoFocus
              />
            </div>

            {newKind === 'web' ? (
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
            ) : (
              <div style={{ marginBottom: 20 }}>
                <label style={modalLabel}>Sti til program</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={newExePath}
                    onChange={(e) => setNewExePath(e.target.value)}
                    placeholder="C:\Program Files\Cyberduck\Cyberduck.exe"
                    style={{ ...modalInput, fontFamily: tokens.font.mono, fontSize: 12 }}
                  />
                  <button
                    onClick={pickExe}
                    style={{
                      padding: '10px 14px',
                      background: tokens.color.navy,
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Velg fil…
                  </button>
                </div>
                <div style={{ fontSize: 11, color: tokens.color.textSubtle, marginTop: 6, lineHeight: 1.4 }}>
                  Aksepterer .exe, .lnk, .bat, .cmd. Krever Sakspilot Desktop (.exe-versjonen) for å fungere.
                </div>
              </div>
            )}

            {/* Ikon-opplasting (valgfritt) — vises som launcher-ikonet */}
            <div style={{ marginBottom: 20 }}>
              <label style={modalLabel}>Eget ikon (valgfritt)</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {/* Forhåndsvisning */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: '#F1F3F7',
                    border: `1px dashed ${tokens.color.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {newIconDataUrl ? (
                    <img
                      src={newIconDataUrl}
                      alt="forhåndsvisning"
                      width={44}
                      height={44}
                      style={{ display: 'block', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 20, opacity: 0.4 }}>?</span>
                  )}
                </div>
                <label
                  style={{
                    padding: '8px 14px',
                    background: 'white',
                    color: tokens.color.navy,
                    border: `1px solid ${tokens.color.border}`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {newIconDataUrl ? 'Bytt ikon' : 'Last opp ikon'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                    onChange={onIconFile}
                    style={{ display: 'none' }}
                  />
                </label>
                {newIconDataUrl && (
                  <button
                    onClick={() => setNewIconDataUrl(null)}
                    style={{
                      padding: '8px 12px',
                      background: 'transparent',
                      color: tokens.color.red,
                      border: 'none',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Fjern
                  </button>
                )}
              </div>
              {iconErr && (
                <div style={{ fontSize: 11, color: tokens.color.red, marginTop: 6 }}>
                  {iconErr}
                </div>
              )}
              <div style={{ fontSize: 11, color: tokens.color.textSubtle, marginTop: 6, lineHeight: 1.4 }}>
                PNG, JPG, SVG eller WebP. Maks 200 KB. Hvis ikke lastet opp, brukes automatisk
                brand-ikon eller initialer fra navnet.
              </div>
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

      {/* Fixed-position tooltip — rendres utenfor scroll-container så den
          ikke clippes av overflow:auto i app-listen */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.top,
            left: tooltip.left,
            transform: 'translateY(-50%)',
            background: '#1A1A1A',
            color: '#FFFFFF',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            zIndex: 99999,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          }}
        >
          {tooltip.label}
        </div>
      )}
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
    const source = (label || hostname).replace(/^www\./, '');
    const words = source.split(/[\s\-_.]+/).filter(Boolean);
    const initials = words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : source.slice(0, 2).toUpperCase();
    return (
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: bg,
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: '26px',  // matcher height for perfekt sentrering
          letterSpacing: 0,
          display: 'block',
          textAlign: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {initials}
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
