'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, LayoutGrid, Users, Calendar, CalendarClock, GanttChartSquare, Plus, X,
  ExternalLink, Trash2, StickyNote, FolderOpen, Folder, Shield, Zap, BarChart3, Plug, Palette,
  MessageSquare, UserCog, Globe, Inbox, FileText, Wallet, PieChart, Receipt,
  ChevronDown, ChevronRight, Pencil, Check,
  type LucideIcon,
} from 'lucide-react';
import { tokens } from '@/lib/tokens';
import { api, isTokenValid } from '@/lib/api';
import { useNotifications, markVisited, type NotificationArea } from '@/lib/notifications';
import { NavBadge } from '@/components/NavBadge';

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
const SITES_STORAGE = 'sakspilot_my_sites';

interface MySite {
  id: string;
  label: string;
  url: string;
}

// Sjekk om vi kjører i Sakspilot Desktop (Electron), gir tilgang til
// shell.openFolder og openInWindow via preload-bridge
function getDesktopAPI(): {
  isDesktop: boolean;
  openFolder?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  openInWindow?: (url: string, label: string) => Promise<{ ok: boolean }>;
  // Returnerer en unsubscribe-funksjon
  onShortcutAutoBadge?: (cb: (payload: { url: string; count: number }) => void) => () => void;
} {
  if (typeof window === 'undefined') return { isDesktop: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).sakspilot;
  return api && api.isDesktop ? api : { isDesktop: false };
}

/**
 * Normaliser bruker-input til en URL som <a href> forstår.
 * Aksepterer:
 *   - https?://, ftp://, mailto: osv (allerede gyldig)
 *   - file:///C:/... (eksplisitt file)
 *   - Windows-sti: C:\Users\... eller D:\... (kovenertes til file:///)
 *   - Unix-sti: /home/... eller /Users/... (file://)
 *   - Domener uten protokoll: luxushair.com (kvinner https://)
 *
 * Returnerer { url, kind } slik at kallsiden kan vise advarsel ved
 * file:// i nettleser (kun Electron kan åpne lokale filer).
 */
function normalizeUrl(raw: string): { url: string; kind: 'web' | 'file' } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: '', kind: 'web' };

  // Allerede gyldig URL med protokoll
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return {
      url: trimmed,
      kind: trimmed.startsWith('file:') ? 'file' : 'web',
    };
  }

  // Windows-sti: "C:\..." eller "C:/..."
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    // Konverter backslash til forward, prefix file:///
    const slashed = trimmed.replace(/\\/g, '/');
    return { url: `file:///${slashed}`, kind: 'file' };
  }

  // Unix-sti: "/home/...", "/Users/...", "/var/..."
  if (trimmed.startsWith('/')) {
    return { url: `file://${trimmed}`, kind: 'file' };
  }

  // Domene uten protokoll
  return { url: `https://${trimmed}`, kind: 'web' };
}

// Tomme defaults, brukeren legger til sine egne via + knappen.
// Apper/snarveier styres nå av Launcher (bransje-spesifikke ved onboarding).
const DEFAULT_SHORTCUTS: Shortcut[] = [];

const STORAGE_KEY = 'sakspilot_shortcuts';

// Pilot-fokus (2026-06): skjul features utenfor kjernen
// (tidsregistrering -> faktura/MVA -> eksport). Routene og koden beholdes;
// vi tar dem bare ut av nav. Reverser ved aa tomme dette settet.
const PILOT_DISABLED_NAV = new Set<string>([
  'statistikk',
  'tidslinje',      // Gantt
  'klistrelapper',
  'agenter',
  'kalender-feed',  // iCal/Outlook-feed
  'team',
  'domener',        // white-label / egne domener
  'forespørsler',   // leads-pipeline - skjult til den faktisk brukes
  'integrasjoner',  // siden er Outlook-only (skjult). CSV/Fiken/Tripletex-
                    // eksport bor uansett paa /regnskap, /rapport, /fakturaer.
]);

/**
 * AddForm - memoized sub-komponent med EGEN intern state.
 *
 * Bakgrunn: Sidebar re-rendrer ofte (cloud-sync polling, notifications-poll
 * hvert 5. sek, autoBadges-events fra Electron). Tidligere bodde state for
 * add-form-feltene paa Sidebar-nivaa, sa hver tastetrykk trigget setState
 * paa Sidebar -> re-render av HELE Sidebar inkl. tunge nav-lister, favicons
 * og notifications-badges. Det ga den karakteristiske "kan ikke klikke
 * forst, sa plutselig gar det"-folelsen i Mine snarveier/Mine sites.
 *
 * Nytt design: AddForm er en memo'd komponent som holder sin egen state
 * (label/url/icon/path). Typing inn i feltet trigger BARE re-render av
 * AddForm selv, ikke Sidebar. Og naar Sidebar re-rendrer fra eksterne
 * arsaker, blir AddForm hoppet over av React.memo siden propsene er
 * stabile (fields-array er konstant, onSave wrappes med useCallback i
 * parent som leser fra ref for aa unnga avhengigheter).
 */
interface AddFormFieldConfig {
  key: string;
  placeholder: string;
  mono?: boolean;
}

interface AddFormProps {
  fields: AddFormFieldConfig[];
  saveLabel: string;
  onSave: (values: Record<string, string>) => void;
  footer?: React.ReactNode; // f.eks. info-tekst om Desktop-krav for mapper
}

const AddForm = memo(function AddForm({ fields, saveLabel, onSave, footer }: AddFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  function submit() {
    onSave(values);
    setValues({});
  }

  return (
    <div style={addFormStyle}>
      {fields.map((f, i) => (
        <input
          key={f.key}
          type="text"
          value={values[f.key] ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setValues((prev) => ({ ...prev, [f.key]: v }));
          }}
          placeholder={f.placeholder}
          autoFocus={i === 0}
          style={{
            ...inputStyle,
            ...(i > 0 ? { marginTop: 6 } : {}),
            ...(f.mono ? { fontFamily: tokens.font.mono, fontSize: 11 } : {}),
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      ))}
      {footer}
      <button onClick={submit} style={saveButtonStyle}>{saveLabel}</button>
    </div>
  );
});

export default function Sidebar() {
  const pathname = usePathname();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS);
  const [folders, setFolders] = useState<FolderShortcut[]>([]);
  const [mySites, setMySites] = useState<MySite[]>([]);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  // Felt-state for add-formene bor inni <AddForm> (memoized) - ikke her.
  // Se kommentar over AddForm-komponenten oppe i filen.
  const [mounted, setMounted] = useState(false);
  const desktop = getDesktopAPI();

  const [navTick, setNavTick] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);
  // Vis/skjul "Mer…"-gruppen i sidebar. Lagres i localStorage.
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    try {
      const s = localStorage.getItem('sakspilot_sidebar_show_more');
      if (s === 'true') setShowMore(true);
    } catch {}
  }, []);
  function toggleShowMore() {
    setShowMore((prev) => {
      const next = !prev;
      try { localStorage.setItem('sakspilot_sidebar_show_more', String(next)); } catch {}
      return next;
    });
  }
  // Auto-badges fra Electron-main, indeksert på URL.
  // BARE i .exe-en, plukker opp tall fra fanetittel: "Inbox (3) - Gmail" → 3.
  // Tjenester uten count i tittel (ChatGPT/Notion/Vercel) får ingen badge , 
  // det er bevisst. Brukeren går selv inn på dem når de vil sjekke.
  const [autoBadges, setAutoBadges] = useState<Record<string, number>>({});
  const { counts } = useNotifications();

  // Subscribe på auto-badges fra Electron-main (kun i .exe-en).
  useEffect(() => {
    if (!desktop.isDesktop || !desktop.onShortcutAutoBadge) return;
    const unsubscribe = desktop.onShortcutAutoBadge(({ url, count }) => {
      setAutoBadges((prev) => {
        if (prev[url] === count) return prev;
        const next = { ...prev };
        if (count > 0) next[url] = count;
        else delete next[url];
        return next;
      });
    });
    return unsubscribe;
  }, [desktop]);
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setShortcuts(JSON.parse(stored));
      const storedFolders = localStorage.getItem(FOLDER_STORAGE);
      if (storedFolders) setFolders(JSON.parse(storedFolders));
      const storedSites = localStorage.getItem(SITES_STORAGE);
      if (storedSites) setMySites(JSON.parse(storedSites));
    } catch {}
    // Hent brukerens rolle for å vise Team-link KUN for owners.
    // Failer stille, sidebar fungerer uten dette.
    if (isTokenValid()) {
      api<{ role: string }>('/auth/me')
        .then((me) => setUserRole(me.role))
        .catch(() => {});
    }
    // Lytt på nav-toggle fra /innstillinger/utseende
    function navHandler() {
      setNavTick((t) => t + 1);
    }
    // Lytt pa cloud-sync som har restaurert prefs fra DB.
    // Uten dette har Sidebar mountet med tom state (fersk .exe-install
    // har tom localStorage) og brukeren tror snarveier/sites/mapper er borte
    // selv om de er restaurert i bakgrunnen.
    function prefsRestoredHandler() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setShortcuts(JSON.parse(stored));
        const storedFolders = localStorage.getItem(FOLDER_STORAGE);
        if (storedFolders) setFolders(JSON.parse(storedFolders));
        const storedSites = localStorage.getItem(SITES_STORAGE);
        if (storedSites) setMySites(JSON.parse(storedSites));
      } catch {}
    }
    window.addEventListener('sakspilot:nav-updated', navHandler);
    window.addEventListener('sakspilot:prefs-restored', prefsRestoredHandler);
    return () => {
      window.removeEventListener('sakspilot:nav-updated', navHandler);
      window.removeEventListener('sakspilot:prefs-restored', prefsRestoredHandler);
    };
  }, []);

  function persistSites(next: MySite[]) {
    setMySites(next);
    try {
      localStorage.setItem(SITES_STORAGE, JSON.stringify(next));
      window.dispatchEvent(new Event('sakspilot:sites-updated'));
    } catch {}
  }
  // Edit-state for Mine sites (id => label/url under redigering)
  const [editSiteId, setEditSiteId] = useState<string | null>(null);
  const [editSiteLabel, setEditSiteLabel] = useState('');
  const [editSiteUrl, setEditSiteUrl] = useState('');

  // Stable callbacks for AddForm - bruker ref-pattern slik at memo'd AddForm
  // ikke re-rendrer naar Sidebar-state endrer seg. Refen oppdateres hver render
  // (synkront), men funksjonsreferansen sendt til AddForm er stabil.
  const addSiteRef = useRef<(values: Record<string, string>) => void>(() => {});
  addSiteRef.current = (values) => {
    const rawUrl = (values.url || '').trim();
    if (!rawUrl) return;
    const { url, kind } = normalizeUrl(rawUrl);
    let label = (values.label || '').trim();
    if (!label) {
      if (kind === 'file') {
        label = url.split(/[\\/]/).pop() || 'Lokal fil';
      } else {
        try {
          label = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          label = url;
        }
      }
    }
    persistSites([...mySites, { id: 's-' + Date.now(), label, url }]);
    setAddSiteOpen(false);
  };
  const handleAddSite = useCallback((values: Record<string, string>) => {
    addSiteRef.current(values);
  }, []);
  function removeSite(id: string) {
    persistSites(mySites.filter((s) => s.id !== id));
  }
  function startEditSite(s: MySite) {
    setEditSiteId(s.id);
    setEditSiteLabel(s.label);
    setEditSiteUrl(s.url);
  }
  function saveEditSite() {
    if (!editSiteId) return;
    const { url } = normalizeUrl(editSiteUrl);
    if (!url || !editSiteLabel.trim()) return;
    persistSites(mySites.map((s) => s.id === editSiteId ? { ...s, label: editSiteLabel.trim(), url } : s));
    setEditSiteId(null);
  }
  function cancelEditSite() {
    setEditSiteId(null);
  }
  async function openSite(e: React.MouseEvent, s: MySite) {
    // file:// URL er lokal fil. I Electron lastes den INLINE i samme
    // BrowserView som vanlige sites. I nettleser er det blokkert (file://
    // fra https-side gar imot browser sikkerhets-policy).
    if (s.url.startsWith('file:')) {
      e.preventDefault();
      if (desktop.isDesktop && desktop.openInWindow) {
        await desktop.openInWindow(s.url, s.label);
      } else {
        alert('Lokale filer kan kun apnes via Sakspilot Desktop (.exe-versjonen). I nettleser blokkerer browser sikkerhets-policy at vi laster file:// fra en https-side.');
      }
      return;
    }
    if (desktop.isDesktop && desktop.openInWindow) {
      e.preventDefault();
      await desktop.openInWindow(s.url, s.label);
    }
  }

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

  // Edit-state for mapper
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [editFolderLabel, setEditFolderLabel] = useState('');
  const [editFolderPath, setEditFolderPath] = useState('');

  // Stable callback - se kommentar over addSiteRef.
  const addFolderRef = useRef<(values: Record<string, string>) => void>(() => {});
  addFolderRef.current = (values) => {
    const rawPath = (values.path || '').trim();
    if (!rawPath) return;
    persistFolders([
      ...folders,
      {
        id: 'f-' + Date.now(),
        label: (values.label || '').trim() || rawPath.split(/[\\/]/).pop() || 'Mappe',
        path: rawPath,
      },
    ]);
    setAddFolderOpen(false);
  };
  const handleAddFolder = useCallback((values: Record<string, string>) => {
    addFolderRef.current(values);
  }, []);

  function deleteFolder(id: string) {
    persistFolders(folders.filter((f) => f.id !== id));
  }

  function startEditFolder(f: FolderShortcut) {
    setEditFolderId(f.id);
    setEditFolderLabel(f.label);
    setEditFolderPath(f.path);
  }
  function saveEditFolder() {
    if (!editFolderId || !editFolderPath.trim()) return;
    persistFolders(folders.map((f) => f.id === editFolderId ? {
      ...f,
      label: editFolderLabel.trim() || editFolderPath.split(/[\\/]/).pop() || 'Mappe',
      path: editFolderPath.trim(),
    } : f));
    setEditFolderId(null);
  }
  function cancelEditFolder() { setEditFolderId(null); }

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

  // Edit-state for snarveier
  const [editShortcutId, setEditShortcutId] = useState<string | null>(null);
  const [editShortcutLabel, setEditShortcutLabel] = useState('');
  const [editShortcutUrl, setEditShortcutUrl] = useState('');

  // Drag-state for re-ordering. Holder kun id av elementet som dras,
  // selve sorteringen skjer paa drop. Native HTML5 drag-API - ingen lib.
  const [dragShortcutId, setDragShortcutId] = useState<string | null>(null);
  const [dragSiteId, setDragSiteId] = useState<string | null>(null);
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);

  function reorderShortcuts(fromId: string, toId: string) {
    if (fromId === toId) return;
    const fromIdx = shortcuts.findIndex((s) => s.id === fromId);
    const toIdx = shortcuts.findIndex((s) => s.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...shortcuts];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persist(next);
  }

  function reorderSites(fromId: string, toId: string) {
    if (fromId === toId) return;
    const fromIdx = mySites.findIndex((s) => s.id === fromId);
    const toIdx = mySites.findIndex((s) => s.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...mySites];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistSites(next);
  }

  function reorderFolders(fromId: string, toId: string) {
    if (fromId === toId) return;
    const fromIdx = folders.findIndex((f) => f.id === fromId);
    const toIdx = folders.findIndex((f) => f.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...folders];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistFolders(next);
  }

  async function openShortcut(e: React.MouseEvent, s: Shortcut) {
    // Lokal fil-URL: i Electron, last den INLINE i samme BrowserView som
    // Gmail/Notion-snarveier (loadURL stotter file:// helt fint). I nettleser
    // er det blokkert av browser-sikkerhet - vi viser klar advarsel.
    if (s.url.startsWith('file:')) {
      e.preventDefault();
      if (desktop.isDesktop && desktop.openInWindow) {
        await desktop.openInWindow(s.url, s.label);
      } else {
        alert('Lokale filer kan kun apnes via Sakspilot Desktop (.exe-versjonen). I nettleser blokkerer browser-sikkerhet at vi laster file:// fra en https-side.');
      }
      return;
    }
    if (desktop.isDesktop && desktop.openInWindow) {
      e.preventDefault();
      await desktop.openInWindow(s.url, s.label);
    }
    // I browser: la default-oppførsel (target="_blank") fungere
  }

  // Stable callback - se kommentar over addSiteRef.
  const addShortcutRef = useRef<(values: Record<string, string>) => void>(() => {});
  addShortcutRef.current = (values) => {
    const label = (values.label || '').trim();
    const rawUrl = (values.url || '').trim();
    if (!label || !rawUrl) return;
    const { url } = normalizeUrl(rawUrl);
    persist([
      ...shortcuts,
      { id: 'u-' + Date.now(), label, url, icon: '🔗' },
    ]);
    setAddOpen(false);
  };
  const handleAddShortcut = useCallback((values: Record<string, string>) => {
    addShortcutRef.current(values);
  }, []);

  function deleteShortcut(id: string) {
    persist(shortcuts.filter((s) => s.id !== id));
  }

  function startEditShortcut(s: Shortcut) {
    setEditShortcutId(s.id);
    setEditShortcutLabel(s.label);
    setEditShortcutUrl(s.url);
  }
  function saveEditShortcut() {
    if (!editShortcutId || !editShortcutLabel.trim() || !editShortcutUrl.trim()) return;
    const { url } = normalizeUrl(editShortcutUrl);
    persist(shortcuts.map((s) => s.id === editShortcutId ? { ...s, label: editShortcutLabel.trim(), url } : s));
    setEditShortcutId(null);
  }
  function cancelEditShortcut() { setEditShortcutId(null); }

  // Nav-elementer kan skjules per bruker via localStorage.
  // Default: alle synlige. Hver bruker kan toggle via Sidebar-settings (kommer).
  // notif: hvilket NotificationArea-key et nav-element mapper til.
  // primary: vises alltid. !primary: under "Mer…"-collapse.
  // Dette er for å redusere scroll i sidebaren (18+ items → ~9 alltid synlige).
  const ALL_NAV: { id: string; href: string; label: string; Icon: LucideIcon; notif?: NotificationArea; primary?: boolean }[] = [
    { id: 'hjem', href: '/hjem', label: 'Hjem', Icon: Home, primary: true },
    { id: 'forespørsler', href: '/foresporsler', label: 'Forespørsler', Icon: Inbox, notif: 'foresporsler', primary: true },
    { id: 'prosjekter', href: '/saker', label: 'Prosjekter', Icon: LayoutGrid, notif: 'saker', primary: true },
    { id: 'klienter', href: '/klienter', label: 'Klienter', Icon: Users, primary: true },
    { id: 'fakturaer', href: '/fakturaer', label: 'Fakturaer', Icon: FileText, notif: 'fakturaer', primary: true },
    { id: 'regnskap', href: '/regnskap', label: 'Regnskap', Icon: Wallet, primary: true },
    { id: 'mva-rapport', href: '/mva-rapport', label: 'MVA-rapport', Icon: Receipt, primary: true },
    { id: 'statistikk', href: '/statistikk', label: 'Statistikk', Icon: PieChart, primary: true },
    { id: 'kalender', href: '/kalender', label: 'Kalender', Icon: Calendar, notif: 'kalender', primary: true },
    // Under "Mer…", sjeldnere brukte funksjoner
    { id: 'tidslinje', href: '/gantt', label: 'Tidslinje', Icon: GanttChartSquare },
    { id: 'rapport', href: '/rapport', label: 'Rapport', Icon: BarChart3 },
    { id: 'klistrelapper', href: '/klistrelapper', label: 'Klistrelapper', Icon: StickyNote, notif: 'klistrelapper' },
    { id: 'agenter', href: '/agenter', label: 'Agenter', Icon: Zap },
    { id: 'integrasjoner', href: '/innstillinger/integrasjoner', label: 'Integrasjoner', Icon: Plug },
    { id: 'kalender-feed', href: '/innstillinger/kalender', label: 'Kalender-feed', Icon: CalendarClock },
    { id: 'sikkerhet', href: '/innstillinger/sikkerhet', label: 'Sikkerhet', Icon: Shield },
    { id: 'utseende', href: '/innstillinger/utseende', label: 'Utseende', Icon: Palette },
    ...(userRole === 'owner'
      ? [{ id: 'team', href: '/innstillinger/team', label: 'Team', Icon: UserCog, notif: 'team' as NotificationArea }]
      : []),
    ...(userRole === 'owner'
      ? [{ id: 'domener', href: '/innstillinger/domener', label: 'Egne domener', Icon: Globe }]
      : []),
    { id: 'feedback', href: '/feedback', label: 'Tilbakemelding', Icon: MessageSquare },
  ];
  const HIDDEN_NAV_KEY = 'sakspilot_hidden_nav';
  // Pilot-fokus: fjern de deaktiverte features fra basen for ALLE brukere.
  const PILOT_NAV = ALL_NAV.filter((n) => !PILOT_DISABLED_NAV.has(n.id));
  // navTick i deps tvinger re-eval når toggling skjer
  const navLinks = mounted
    ? (() => {
        // void navTick, bare for å lytte
        void navTick;
        try {
          const hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_NAV_KEY) || '[]') as string[]);
          return PILOT_NAV.filter((n) => !hidden.has(n.id));
        } catch {
          return PILOT_NAV;
        }
      })()
    : PILOT_NAV;

  return (
    <aside style={sidebarStyle}>
      {/* Seksjon: Sakspilot - primær nav alltid synlig + "Mer..."-collapse */}
      <SidebarSection title="Sakspilot">
        {(() => {
          const primaryItems = navLinks.filter((n) => n.primary);
          const moreItems = navLinks.filter((n) => !n.primary);
          // Auto-vis "Mer…" hvis brukeren er på en av de skjulte sidene
          // (ellers ville aktiv-state forsvunnet)
          const activeIsInMore = moreItems.some((n) => pathname.startsWith(n.href));
          const showMoreEffective = showMore || activeIsInMore;

          function renderItem(item: typeof navLinks[number]) {
            const { href, label, Icon, notif } = item;
            const active = pathname.startsWith(href);
            const areaCount = notif && counts ? counts[notif] : null;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => { if (notif) markVisited(notif); }}
                style={{
                  ...itemStyle,
                  background: active ? tokens.gradient.navy : 'transparent',
                  color: active ? tokens.color.white : tokens.color.text,
                  fontWeight: active ? 600 : 500,
                  boxShadow: active ? tokens.shadow.colored(tokens.color.navy) : 'none',
                  transform: active ? 'translateX(2px)' : 'none',
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = tokens.color.bgAlt; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                <span>{label}</span>
                {areaCount && (
                  <NavBadge count={areaCount.unread} total={areaCount.total} activeMode={active} />
                )}
              </Link>
            );
          }
          return (
            <>
              {primaryItems.map(renderItem)}
              {moreItems.length > 0 && (
                <>
                  <button
                    onClick={toggleShowMore}
                    style={{
                      ...itemStyle,
                      background: 'transparent',
                      color: tokens.color.textMuted,
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left' as const,
                      fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                    title={showMoreEffective ? 'Skjul mindre brukte fane' : 'Vis flere fane'}
                  >
                    {showMoreEffective ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{showMoreEffective ? 'Skjul' : `Mer (${moreItems.length})`}</span>
                  </button>
                  {showMoreEffective && moreItems.map(renderItem)}
                </>
              )}
            </>
          );
        })()}
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
          <AddForm
            fields={[
              { key: 'label', placeholder: 'Navn (f.eks. Slack)' },
              { key: 'url', placeholder: 'URL eller domene' },
            ]}
            saveLabel="Lagre snarvei"
            onSave={handleAddShortcut}
          />
        )}

        {mounted &&
          shortcuts.map((s) => {
            const badge = autoBadges[s.url] || 0;
            if (editShortcutId === s.id) {
              return (
                <div key={s.id} style={addFormStyle}>
                  <input
                    type="text"
                    value={editShortcutLabel}
                    onChange={(e) => setEditShortcutLabel(e.target.value)}
                    placeholder="Navn"
                    style={inputStyle}
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editShortcutUrl}
                    onChange={(e) => setEditShortcutUrl(e.target.value)}
                    placeholder="URL eller C:\\Users\\..."
                    style={{ ...inputStyle, marginTop: 6 }}
                    onKeyDown={(e) => e.key === 'Enter' && saveEditShortcut()}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={saveEditShortcut} style={{ ...saveButtonStyle, flex: 1 }}>Lagre</button>
                    <button onClick={cancelEditShortcut} style={{ ...saveButtonStyle, flex: 1, background: 'transparent', color: tokens.color.textMuted, border: `1px solid ${tokens.color.border}` }}>Avbryt</button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={s.id}
                style={{
                  position: 'relative',
                  opacity: dragShortcutId === s.id ? 0.4 : 1,
                  cursor: 'grab',
                }}
                className="shortcut-row"
                draggable
                onDragStart={(e) => {
                  setDragShortcutId(s.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (dragShortcutId && dragShortcutId !== s.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragShortcutId) reorderShortcuts(dragShortcutId, s.id);
                  setDragShortcutId(null);
                }}
                onDragEnd={() => setDragShortcutId(null)}
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    openShortcut(e, s);
                    // Klikk = nullstill auto-badge (siden brukeren nå "leser")
                    if (autoBadges[s.url]) {
                      setAutoBadges((prev) => {
                        const next = { ...prev };
                        delete next[s.url];
                        return next;
                      });
                    }
                  }}
                  title={s.url.startsWith('file:') ? `Lokal fil: ${s.url}` : s.label}
                  style={{ ...itemStyle, paddingRight: badge > 0 ? 80 : 54 }}
                >
                  {s.url.startsWith('file:')
                    ? <FileText size={14} strokeWidth={2} style={{ color: '#D4A017', flexShrink: 0 }} />
                    : <ExternalLink size={14} strokeWidth={2} style={{ color: tokens.color.textMuted, flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                  {badge > 0 && <NavBadge count={badge} />}
                </a>
                <button
                  onClick={() => startEditShortcut(s)}
                  style={{ ...deleteButtonStyle, right: 28 }}
                  title="Rediger snarvei"
                >
                  <Pencil size={11} strokeWidth={2} />
                </button>
                <button
                  onClick={() => deleteShortcut(s.id)}
                  style={deleteButtonStyle}
                  title="Slett snarvei"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            );
          })}
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
          <AddForm
            fields={[
              { key: 'label', placeholder: 'Navn (valgfritt)' },
              { key: 'path', placeholder: 'C:\\Jobb\\Sakspilot', mono: true },
            ]}
            saveLabel="Lagre"
            onSave={handleAddFolder}
            footer={!desktop.isDesktop ? (
              <div style={{ fontSize: 10, color: tokens.color.textSubtle, marginTop: 6, lineHeight: 1.3 }}>
                ⓘ Krever Sakspilot Desktop for å åpne mappa.
              </div>
            ) : null}
          />
        )}

        {mounted && folders.length === 0 && !addFolderOpen && (
          <div style={{ padding: '4px 12px', fontSize: 11, color: tokens.color.textSubtle }}>
            Legg til mappe-snarveier
          </div>
        )}

        {mounted && folders.map((f) => {
          if (editFolderId === f.id) {
            return (
              <div key={f.id} style={addFormStyle}>
                <input
                  type="text"
                  value={editFolderLabel}
                  onChange={(e) => setEditFolderLabel(e.target.value)}
                  placeholder="Navn"
                  style={inputStyle}
                  autoFocus
                />
                <input
                  type="text"
                  value={editFolderPath}
                  onChange={(e) => setEditFolderPath(e.target.value)}
                  placeholder={'C:\\Jobb\\Sakspilot'}
                  style={{ ...inputStyle, marginTop: 6, fontFamily: tokens.font.mono, fontSize: 11 }}
                  onKeyDown={(e) => e.key === 'Enter' && saveEditFolder()}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={saveEditFolder} style={{ ...saveButtonStyle, flex: 1 }}>Lagre</button>
                  <button onClick={cancelEditFolder} style={{ ...saveButtonStyle, flex: 1, background: 'transparent', color: tokens.color.textMuted, border: `1px solid ${tokens.color.border}` }}>Avbryt</button>
                </div>
              </div>
            );
          }
          return (
            <div
              key={f.id}
              style={{
                position: 'relative',
                opacity: dragFolderId === f.id ? 0.4 : 1,
                cursor: 'grab',
              }}
              className="shortcut-row"
              draggable
              onDragStart={(e) => {
                setDragFolderId(f.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (dragFolderId && dragFolderId !== f.id) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFolderId) reorderFolders(dragFolderId, f.id);
                setDragFolderId(null);
              }}
              onDragEnd={() => setDragFolderId(null)}
            >
              <button
                onClick={() => openFolder(f.path)}
                style={{ ...itemStyle, paddingRight: 54, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
                title={f.path}
              >
                <FolderOpen size={14} strokeWidth={2} style={{ color: '#D4A017', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.color.text }}>
                  {f.label}
                </span>
              </button>
              <button
                onClick={() => startEditFolder(f)}
                style={{ ...deleteButtonStyle, right: 28 }}
                title="Rediger mappe-snarvei"
              >
                <Pencil size={11} strokeWidth={2} />
              </button>
              <button
                onClick={() => deleteFolder(f.id)}
                style={deleteButtonStyle}
                title="Slett mappe-snarvei"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </SidebarSection>

      {/* My Sites - egne live-prosjekter/nettsider som PWA-ikoner-grid */}
      <SidebarSection
        title="Mine sites"
        action={
          mounted && (
            <button
              onClick={() => setAddSiteOpen(!addSiteOpen)}
              style={addButtonStyle}
              title="Legg til site"
            >
              {addSiteOpen ? <X size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
            </button>
          )
        }
      >
        {addSiteOpen && (
          <AddForm
            fields={[
              { key: 'label', placeholder: 'Navn (valgfritt)' },
              { key: 'url', placeholder: 'luxushair.com eller C:\\Users\\...' },
            ]}
            saveLabel="Lagre site"
            onSave={handleAddSite}
          />
        )}

        {mounted && mySites.length === 0 && !addSiteOpen && (
          <div style={{ padding: '4px 12px', fontSize: 11, color: tokens.color.textSubtle }}>
            Klikk + for å legge til
          </div>
        )}

        {mounted && mySites.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6,
              padding: '4px 8px',
            }}
          >
            {mySites.map((s) => {
              const badge = autoBadges[s.url] || 0;
              return (
              <div
                key={s.id}
                style={{
                  position: 'relative',
                  opacity: dragSiteId === s.id ? 0.4 : 1,
                  cursor: 'grab',
                }}
                className="my-site-tile"
                draggable
                onDragStart={(e) => {
                  setDragSiteId(s.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (dragSiteId && dragSiteId !== s.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragSiteId) reorderSites(dragSiteId, s.id);
                  setDragSiteId(null);
                }}
                onDragEnd={() => setDragSiteId(null)}
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    openSite(e, s);
                    if (autoBadges[s.url]) {
                      setAutoBadges((prev) => { const n = { ...prev }; delete n[s.url]; return n; });
                    }
                  }}
                  title={s.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 10,
                    background: tokens.color.surface,
                    border: `1px solid ${tokens.color.border}`,
                    boxShadow: tokens.shadow.sm,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    position: 'relative',
                  }}
                >
                  <SiteFavicon url={s.url} label={s.label} />
                  {badge > 0 && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4,
                      minWidth: 18, height: 18, padding: '0 5px',
                      background: '#dc2626', color: 'white',
                      fontSize: 10, fontWeight: 700,
                      borderRadius: 999, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: '2px solid white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}>{badge > 99 ? '99+' : badge}</span>
                  )}
                </a>
                <button
                  onClick={(e) => { e.preventDefault(); startEditSite(s); }}
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: -4,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: tokens.color.navy,
                    color: 'white',
                    border: 'none',
                    fontSize: 9,
                    cursor: 'pointer',
                    opacity: 0,
                    transition: 'opacity 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  className="site-edit-btn"
                  title="Rediger"
                >
                  ✎
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); removeSite(s.id); }}
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: tokens.color.red,
                    color: 'white',
                    border: 'none',
                    fontSize: 10,
                    cursor: 'pointer',
                    opacity: 0,
                    transition: 'opacity 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  className="site-delete-btn"
                  title="Fjern"
                >
                  ✕
                </button>
              </div>
              );
            })}
          </div>
        )}
        {/* Inline edit-form for Mine sites */}
        {mounted && editSiteId && (
          <div style={addFormStyle}>
            <div style={{ fontSize: 10, color: tokens.color.textMuted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>
              Rediger site
            </div>
            <input
              type="text"
              value={editSiteUrl}
              onChange={(e) => setEditSiteUrl(e.target.value)}
              placeholder="luxushair.com eller C:\\..."
              style={inputStyle}
              autoFocus
            />
            <input
              type="text"
              value={editSiteLabel}
              onChange={(e) => setEditSiteLabel(e.target.value)}
              placeholder="Navn"
              style={{ ...inputStyle, marginTop: 6 }}
              onKeyDown={(e) => e.key === 'Enter' && saveEditSite()}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={saveEditSite} style={{ ...saveButtonStyle, flex: 1 }}>Lagre</button>
              <button onClick={cancelEditSite} style={{ ...saveButtonStyle, flex: 1, background: 'transparent', color: tokens.color.textMuted, border: `1px solid ${tokens.color.border}` }}>Avbryt</button>
            </div>
          </div>
        )}
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

// (Manuell badge-popover er fjernet 2026-06-03, det var en dårlig UX.
// Auto-badges fra Electron fanetittel-parsing er det vi beholder, siden
// de speiler ekte varsel-tilstand i tjenester som Gmail/Outlook/Slack.)

/**
 * SiteFavicon, viser favicon for et site med graceful fallback.
 * Prioritet: DuckDuckGo (mest pålitelig) → Google s2 → monogram (første bokstav i farget sirkel).
 */
function SiteFavicon({ url, label }: { url: string; label: string }) {
  const [tier, setTier] = useState<0 | 1 | 2>(0);
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {}
  if (tier === 2) {
    // Monogram-fallback, viser 2 initialer (LH, GM osv) i farget sirkel
    const palette = ['#1E3A5F', '#C2185B', '#2C5F2D', '#0086CC', '#A358DF', '#FF7A45', '#00B884', '#E2445C'];
    let hash = 0;
    for (let i = 0; i < hostname.length; i++) hash = (hash * 31 + hostname.charCodeAt(i)) | 0;
    const bg = palette[Math.abs(hash) % palette.length];
    // Initialer: hvis label har flere ord (mellomrom/bindestrek/punktum), ta første
    // bokstav i de to første ordene. Ellers ta de to første bokstavene.
    const source = (label || hostname).replace(/^www\./, '');
    const words = source.split(/[\s\-_.]+/).filter(Boolean);
    const initials = words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : source.slice(0, 2).toUpperCase();
    return (
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: bg,
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: '28px',       // matcher height = perfekt vertikal-sentrering
          letterSpacing: 0,
          textAlign: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif',
          // Bruker block + line-height i stedet for flex, mer pålitelig
          // sentrering med uppercase tekst på tvers av nettlesere
          display: 'block',
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
      style={{ display: 'block' }}
      onError={() => setTier((t) => (t + 1) as 0 | 1 | 2)}
    />
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
  background: tokens.color.surface,
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
