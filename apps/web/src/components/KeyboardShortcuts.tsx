'use client';

/**
 * Globale tastatursnarveier for Sakspilot.
 *
 * Snarveier (alle blokkeres når input/textarea er fokusert):
 *
 *   Ctrl+K      , Åpne "Hopp til..."-paletten (navigér mellom sider)
 *   Shift+?     , Vis cheatsheet med alle snarveier
 *   g h         , Hjem
 *   g f         , Forespørsler
 *   g p         , Prosjekter
 *   g k         , Klienter
 *   g i         , Fakturaer (Invoices)
 *   g r         , Regnskap
 *   g s         , Statistikk
 *   g m         , MVA-rapport
 *
 * G-prefiks fungerer som Gmail-stil "go to"-shortcuts: trykk G, deretter
 * destination-bokstav innen 1.5 sek.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tokens } from '@/lib/tokens';

interface Destination {
  key: string;
  label: string;
  path: string;
}

const G_DESTINATIONS: Destination[] = [
  { key: 'h', label: 'Hjem',          path: '/hjem' },
  { key: 'f', label: 'Forespørsler',  path: '/foresporsler' },
  { key: 'p', label: 'Prosjekter',    path: '/saker' },
  { key: 'k', label: 'Klienter',      path: '/klienter' },
  { key: 'i', label: 'Fakturaer',     path: '/fakturaer' },
  { key: 'r', label: 'Regnskap',      path: '/regnskap' },
  { key: 's', label: 'Statistikk',    path: '/statistikk' },
  { key: 'm', label: 'MVA-rapport',   path: '/mva-rapport' },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const gPrefixTimer = useRef<NodeJS.Timeout | null>(null);
  const waitingForG = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // Ikke kapre tastetrykk i input/textarea, la bruker skrive normalt
      const isTyping = target.matches('input, textarea, [contenteditable="true"]');
      if (isTyping) return;

      // Ctrl/Cmd+K → palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Shift+? → cheatsheet
      if (e.shiftKey && e.key === '?') {
        e.preventDefault();
        setCheatsheetOpen(true);
        return;
      }

      // Ingen modifiers fra her, alle vanlige enkelttaster
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // G-prefiks: vent på destination-tast
      if (e.key.toLowerCase() === 'g' && !waitingForG.current) {
        waitingForG.current = true;
        if (gPrefixTimer.current) clearTimeout(gPrefixTimer.current);
        gPrefixTimer.current = setTimeout(() => { waitingForG.current = false; }, 1500);
        return;
      }
      if (waitingForG.current) {
        const dest = G_DESTINATIONS.find((d) => d.key === e.key.toLowerCase());
        waitingForG.current = false;
        if (gPrefixTimer.current) clearTimeout(gPrefixTimer.current);
        if (dest) {
          e.preventDefault();
          router.push(dest.path);
        }
        return;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <>
      {paletteOpen && <PalettePopup onClose={() => setPaletteOpen(false)} onNavigate={(p) => { router.push(p); setPaletteOpen(false); }} />}
      {cheatsheetOpen && <Cheatsheet onClose={() => setCheatsheetOpen(false)} />}
    </>
  );
}

/**
 * Ctrl+K palette, søke-input som filtrerer destinasjoner.
 * Enter eller klikk navigerer.
 */
function PalettePopup({ onClose, onNavigate }: { onClose: () => void; onNavigate: (path: string) => void }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = G_DESTINATIONS.filter((d) =>
    d.label.toLowerCase().includes(query.toLowerCase()) ||
    d.path.toLowerCase().includes(query.toLowerCase())
  );

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const dest = filtered[selectedIdx];
      if (dest) onNavigate(dest.path);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, width: '92%', maxWidth: 520,
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
          onKeyDown={onKey}
          placeholder="Hopp til side… (Esc for å lukke)"
          style={{
            width: '100%', padding: '14px 18px', border: 'none', outline: 'none',
            fontSize: 15, borderBottom: '1px solid #e2e8f0', boxSizing: 'border-box',
          }}
        />
        <ul style={{ listStyle: 'none', margin: 0, padding: 4, maxHeight: 320, overflowY: 'auto' }}>
          {filtered.map((d, i) => (
            <li
              key={d.path}
              onClick={() => onNavigate(d.path)}
              onMouseEnter={() => setSelectedIdx(i)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                borderRadius: 6,
                background: i === selectedIdx ? tokens.color.bgAlt : 'transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 14, color: '#0f172a' }}>{d.label}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>g {d.key}</span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li style={{ padding: 14, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
              Ingen treff på &quot;{query}&quot;
            </li>
          )}
        </ul>
        <div style={{ padding: '8px 14px', background: '#f8fafc', fontSize: 11, color: '#64748b', borderTop: '1px solid #e2e8f0' }}>
          ↑↓ velg · Enter åpne · Esc lukk · Shift+? for alle snarveier
        </div>
      </div>
    </div>
  );
}

/**
 * Cheatsheet, viser alle snarveier i en oversiktlig modal.
 */
function Cheatsheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: 24,
          maxWidth: 480, width: '100%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0, color: tokens.color.navy }}>Tastatursnarveier</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22, color: '#64748b' }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, fontSize: 13 }}>
          <Section title="Generelt">
            <Row keys={['Ctrl', 'K']} desc="Åpne 'Hopp til...'-paletten" />
            <Row keys={['Shift', '?']} desc="Vis denne oversikten" />
            <Row keys={['Esc']} desc="Lukk modaler" />
          </Section>
          <Section title="Naviger (Gmail-stil)">
            <Row keys={['g', 'h']} desc="Hjem" />
            <Row keys={['g', 'f']} desc="Forespørsler" />
            <Row keys={['g', 'p']} desc="Prosjekter" />
            <Row keys={['g', 'k']} desc="Klienter" />
            <Row keys={['g', 'i']} desc="Fakturaer" />
            <Row keys={['g', 'r']} desc="Regnskap" />
            <Row keys={['g', 's']} desc="Statistikk" />
            <Row keys={['g', 'm']} desc="MVA-rapport" />
          </Section>
        </div>
        <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8' }}>
          Snarveier blokkeres når du skriver i input-felter, så de forstyrrer ikke vanlig tasting.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function Row({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div style={{ display: 'flex', gap: 4, minWidth: 90 }}>
        {keys.map((k, i) => (
          <kbd
            key={i}
            style={{
              padding: '2px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: 4, fontSize: 11, fontFamily: 'ui-monospace, monospace',
              color: '#334155', minWidth: 16, textAlign: 'center',
            }}
          >{k}</kbd>
        ))}
      </div>
      <span style={{ fontSize: 13, color: '#334155' }}>{desc}</span>
    </div>
  );
}
