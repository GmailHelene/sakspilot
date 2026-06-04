'use client';

/**
 * SearchBar — gjenbrukbar søke-input med debounce.
 * Brukes på /foresporsler, /fakturaer, /regnskap, /klienter, /saker.
 *
 *   <SearchBar value={q} onChange={setQ} placeholder="Søk fakturaer..." />
 *
 * onChange fyrer med debounce (300 ms default) så vi ikke spammer API
 * mens brukeren skriver. value oppdaterer umiddelbart for visuell feedback.
 */
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Debounce-millisekunder. Default 300. */
  debounceMs?: number;
  /** Innstilt bredde - default 240px */
  width?: number;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Søk…',
  debounceMs = 300,
  width = 240,
}: SearchBarProps) {
  // Lokal state for umiddelbar oppdatering av input-feltet
  const [local, setLocal] = useState(value);

  // Hvis prop endrer seg fra utsiden (f.eks. clear-knapp), sync lokal
  useEffect(() => { setLocal(value); }, [value]);

  // Debounce: vent debounceMs etter siste tastetrykk før onChange fyres
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs]);

  return (
    <div style={{
      position: 'relative',
      width,
      display: 'inline-flex',
      alignItems: 'center',
    }}>
      <Search
        size={14}
        style={{
          position: 'absolute',
          left: 10,
          color: '#94a3b8',
          pointerEvents: 'none',
        }}
      />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '7px 32px 7px 32px',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          fontSize: 13,
          background: 'white',
          outline: 'none',
        }}
      />
      {local && (
        <button
          onClick={() => { setLocal(''); onChange(''); }}
          title="Tøm søk"
          style={{
            position: 'absolute',
            right: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
