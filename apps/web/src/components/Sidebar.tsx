'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, LayoutGrid, Users, Calendar, GanttChartSquare, Plus, X,
  ExternalLink, Trash2,
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
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newIcon, setNewIcon] = useState('🔗');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setShortcuts(JSON.parse(stored));
    } catch {}
  }, []);

  function persist(next: Shortcut[]) {
    setShortcuts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
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
                background: active ? tokens.color.navy : 'transparent',
                color: active ? tokens.color.white : tokens.color.text,
                fontWeight: active ? 600 : 500,
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
