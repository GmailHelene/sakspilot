'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, LayoutGrid, Users, Calendar, GanttChartSquare, Plus, X,
  ExternalLink, Trash2, StickyNote, FolderOpen, Folder, Shield, Zap, BarChart3, Plug,
  type LucideIcon,
} from 'lucide-react';
import { tokens } from '@/lib/tokens';

/**
 * Persistent venstre-sidebar (Basaas/Linear-stil).
 *
 * To seksjoner:
 *   1. Sakspilot-navigasjon (Saker, Klienter, Kalender, Gantt)
 *   2. Mine snarveier (eksterne nettsider, mapper, brukerlagt)
 *
 * Snarveiene lagres i localStorage så de overlever restart.
 * Drag-and-drop reorder + add/delete kommer i fase B.
 */

interface Shortcut {
  id: string;
  label: string;
  url: string;
  icon: string;
}

interface FolderShortcut {
  id: string;
  label: string;
  path: string;
}

const FOLDER_STORAGE = 'sakspilot_folder_shortcuts';

// Sjekk om vi kjører i Sakspilot Desktop (Electron) — gir tilgang til
// shell.openFolder og openInWindow via preload-bridge
function getDesktopAPI(): {
  isDesktop: boolean;
  openFolder?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  openInWindow?: (url: string, label: string) => Promise<{ ok: boolean }>;
} {
  if (typeof window === 'undefined') return { isDesktop: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).sakspilot;
  return api && api.isDesktop ? api : { isDesktop: false };
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: 'tripletex', label: 'Tripletex', url: 'https://tripletex.no', icon: '💼' },
  { id: 'fiken', label: 'Fiken', url: 'https://fiken.no', icon: '💰' },
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', icon: '📧' },
  { id: 'github', label: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖' },
  { id: 'holte', label: 'Holte', url: 'https://smart.holte.no', icon: '🏢' },
];

const STORAGE_KEY = 'sakspilot_shortcuts';

export default function Sidebar() {
  const pathname = usePathname();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS);
  const [folders, setFolders] = useState<FolderShortcut[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newIcon, setNewIcon] = useState('🔗');
  const [newFolderLabel, setNewFolderLabel] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [mounted, setMounted] = useState(false);
  const desktop = getDesktopAPI();

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setShortcuts(JSON.parse(stored));
      const storedFolders = localStorage.getItem(FOLDER_STORAGE);
      if (storedFolders) setFolders(JSON.parse(storedFolders));
    } catch {}
  }, []);

  function persist(next: Shortcut[]) {
    setShortcuts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function persistFolders(next: FolderShortcut[]) {
    setFolders(next);
    try {
      localStorage.setItem(FOLDER_STORAGE, JSON.stringify(next));
    } catch {}
  }

  function addFolder() {
    if (!newFolderPath.trim()) return;
    persistFolders([
      ...folders,
      {
        id: 'f-' + Date.now(),
        label: newFolderLabel.trim() || newFolderPath.split(/[\\/]/).pop() || 'Mappe',
        path: newFolderPath.trim(),
      },
    ]);
    setNewFolderLabel('');
    setNewFolderPath('');
    setAddFolderOpen(false);
  }

  function deleteFolder(id: string) {
    persistFolders(folders.filter((f) => f.id !== id));
  }

  async function openFolder(folderPath: string) {
    if (desktop.isDesktop && desktop.openFolder) {
      const res = await desktop.openFolder(folderPath);
      if (!res.ok) alert(`Kunne ikke åpne mappa: ${res.error}`);
    } else {
      alert(
        'Mappe-snarveier krever Sakspilot Desktop (.exe-versjonen). I nettleseren kan vi ikke åpne mapper på datamaskinen din pga sikkerhetsbegrensninger.'
      );
    }
  }

  async function openShortcut(e: React.MouseEvent, s: Shortcut) {
    if (desktop.isDesktop && desktop.openInWindow) {
      e.preventDefault();
      await desktop.openInWindow(s.url, s.label);
    }
    // I browser: la default-oppførsel (target="_blank") fungere
  }

  function addShortcut() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    const url = /^https?:\/\//.test(newUrl) ? newUrl : `https://${newUrl}`;
    persist([
      ...shortcuts,
      { id: 'u-' + Date.now(), label: newLabel.trim(), url, icon: newIcon || '🔗' },
    ]);
    setNewLabel('');
    setNewUrl('');
    setNewIcon('🔗');
    setAddOpen(false);
  }

  function deleteShortcut(id: string) {
    persist(shortcuts.filter((s) => s.id !== id));
  }

  const navLinks: { href: string; label: string; Icon: LucideIcon }[] = [
    { href: '/hjem', label: 'Hjem', Icon: Home },
    { href: '/saker', label: 'Saker', Icon: LayoutGrid },
    { href: '/klienter', label: 'Klienter', Icon: Users },
    { href: '/kalender', label: 'Kalender', Icon: Calendar },
    { href: '/gantt', label: 'Tidslinje', Icon: GanttChartSquare },
    { href: '/rapport', label: 'Rapport', Icon: BarChart3 },
    { href: '/klistrelapper', label: 'Klistrelapper', Icon: StickyNote },
    { href: '/agenter', label: 'Agenter', Icon: Zap },
    { href: '/innstillinger/integrasjoner', label: 'Integrasjoner', Icon: Plug },
    { href: '/innstillinger/sikkerhet', label: 'Sikkerhet', Icon: Shield },
  ];

  return (
    <aside style={sidebarStyle}>
      {/* Seksjon: Sakspilot */}
      <SidebarSection title="Sakspilot">
        {navLinks.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                ...itemStyle,
                background: active ? tokens.gradient.navy : 'transparent',
                color: active ? tokens.color.white : tokens.color.text,
                fontWeight: active ? 600 : 500,
                boxShadow: active ? tokens.shadow.colored(tokens.color.navy) : 'none',
                transform: active ? 'translateX(2px)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = tokens.color.bgAlt;
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </SidebarSection>

      {/* Seksjon: Snarveier */}
      <SidebarSection
        title="Mine snarveier"
        action={
          mounted && (
            <button
              onClick={() => setAddOpen(!addOpen)}
              style={addButtonStyle}
              title="Legg til snarvei"
            >
              {addOpen ? <X size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
            </button>
          )
        }
      >
        {addOpen && (
          <div style={addFormStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 6 }}>
              <input
                type="text"
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value.slice(0, 2))}
                placeholder="🔗"
                style={{ ...inputStyle, textAlign: 'center', fontSize: 16 }}
              />
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Navn (f.eks. Slack)"
                style={inputStyle}
              />
            </div>
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="URL eller domene"
              style={{ ...inputStyle, marginTop: 6 }}
              onKeyDown={(e) => e.key === 'Enter' && addShortcut()}
            />
            <button onClick={addShortcut} style={saveButtonStyle}>
              Lagre snarvei
            </button>
          </div>
        )}

        {mounted &&
          shortcuts.map((s) => (
            <div key={s.id} style={{ position: 'relative' }} className="shortcut-row">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => openShortcut(e, s)}
                style={{ ...itemStyle, paddingRight: 30 }}
              >
                <ExternalLink size={14} strokeWidth={2} style={{ color: tokens.color.textMuted, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </a>
              <button
                onClick={() => deleteShortcut(s.id)}
                style={deleteButtonStyle}
                title="Slett snarvei"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
      </SidebarSection>

      {/* Seksjon: Mapper (Electron-only fungerer fullt) */}
      <SidebarSection
        title="Mine mapper"
        action={
          mounted && (
            <button
              onClick={() => setAddFolderOpen(!addFolderOpen)}
              style={addButtonStyle}
              title="Legg til mappe"
            >
              {addFolderOpen ? <X size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
            </button>
          )
        }
      >
        {addFolderOpen && (
          <div style={addFormStyle}>
            <input
              type="text"
              value={newFolderLabel}
              onChange={(e) => setNewFolderLabel(e.target.value)}
              placeholder="Navn (valgfritt)"
              style={inputStyle}
            />
            <input
              type="text"
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              placeholder={'C:\\Jobb\\Sakspilot'}
              style={{ ...inputStyle, marginTop: 6, fontFamily: tokens.font.mono, fontSize: 11 }}
              onKeyDown={(e) => e.key === 'Enter' && addFolder()}
            />
            {!desktop.isDesktop && (
              <div style={{ fontSize: 10, color: tokens.color.textSubtle, marginTop: 6, lineHeight: 1.3 }}>
                ⓘ Krever Sakspilot Desktop for å åpne mappa.
              </div>
            )}
            <button onClick={addFolder} style={saveButtonStyle}>Lagre</button>
          </div>
        )}

        {mounted && folders.length === 0 && !addFolderOpen && (
          <div style={{ padding: '4px 12px', fontSize: 11, color: tokens.color.textSubtle }}>
            Legg til mappe-snarveier
          </div>
        )}

        {mounted && folders.map((f) => (
          <div key={f.id} style={{ position: 'relative' }}>
            <button
              onClick={() => openFolder(f.path)}
              style={{ ...itemStyle, paddingRight: 30, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
              title={f.path}
            >
              <FolderOpen size={14} strokeWidth={2} style={{ color: tokens.color.gold, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.color.text }}>
                {f.label}
              </span>
            </button>
            <button
              onClick={() => deleteFolder(f.id)}
              style={deleteButtonStyle}
              title="Slett mappe-snarvei"
            >
              <Trash2 size={12} strokeWidth={2} />
            </button>
          </div>
        ))}
      </SidebarSection>

      <div style={footerStyle}>
        <a
          href="https://helene.cloud"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: tokens.color.textSubtle, fontSize: 11 }}
        >
          Sakspilot v0.0.1
        </a>
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 12px 6px',
          fontSize: 11,
          fontWeight: 700,
          color: tokens.color.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        <span>{title}</span>
        {action}
      </div>
      <div style={{ display: 'grid', gap: 1 }}>{children}</div>
    </div>
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 220,
  minWidth: 220,
  background: tokens.color.white,
  borderRight: `1px solid ${tokens.color.border}`,
  padding: '20px 8px 12px',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflowY: 'auto',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  color: tokens.color.text,
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'background 0.1s',
};

const addButtonStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 11,
  background: tokens.color.bgAlt,
  color: tokens.color.navy,
  border: 'none',
  fontSize: 16,
  lineHeight: 1,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const addFormStyle: React.CSSProperties = {
  padding: 10,
  background: tokens.color.bgAlt,
  borderRadius: tokens.radius.sm,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  fontFamily: 'inherit',
};

const saveButtonStyle: React.CSSProperties = {
  marginTop: 6,
  width: '100%',
  padding: '7px',
  background: tokens.color.navy,
  color: tokens.color.white,
  border: 'none',
  borderRadius: tokens.radius.sm,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const deleteButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: 4,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 20,
  height: 20,
  borderRadius: 10,
  background: 'transparent',
  color: tokens.color.textSubtle,
  border: 'none',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 0.1s',
};

const footerStyle: React.CSSProperties = {
  marginTop: 'auto',
  padding: 12,
  borderTop: `1px solid ${tokens.color.border}`,
  textAlign: 'center',
};
