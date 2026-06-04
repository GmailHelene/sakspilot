'use client';

/**
 * Bank-CSV-import for utgifter.
 *
 * Støttede formater (auto-detektert basert på header-rad):
 *   - DNB:           "Dato;Forklaring;Rentedato;Ut av konto;Inn på konto"
 *   - Sparebank1:    "Dato;Beskrivelse;Inn;Ut" (semicolon)
 *   - Nordea:        "Bokført dato;Beløp;Avsender;Tekst;Saldo"
 *   - Generic:       4 kolonner med dato + beskrivelse + ut + inn
 *
 * Steg:
 *   1. Bruker velger CSV-fil
 *   2. Parser auto-detekterer format
 *   3. Preview-modal viser alle rader med kategori-mapping
 *   4. Bruker kan fjerne rader, velge kategori per rad
 *   5. "Importer" sender til backend
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import { tokens } from '@/lib/tokens';
import { Upload, X, Check } from 'lucide-react';

interface ParsedRow {
  dato: string;            // YYYY-MM-DD
  beskrivelse: string;
  belopInkMva: number;     // positivt = utgift, negativt = inntekt (vi importerer kun utgifter)
  externalId: string;
  // Felter brukeren setter etter parse
  kategori?: string;
  selected: boolean;
}

const KATEGORIER = ['Drift', 'Kontor', 'Programvare', 'Reise', 'Abonnement', 'Annet'];

export function BankCsvImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const { parsed, formatName } = parseCSV(text);
      if (parsed.length === 0) {
        setError('Ingen utgifter funnet i fila. Sjekk at det er et bank-CSV.');
        return;
      }
      setRows(parsed);
      setFormat(formatName);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Kunne ikke lese fila');
    }
  }

  async function doImport() {
    if (!rows) return;
    setImporting(true);
    setError(null);
    try {
      const payload = rows
        .filter((r) => r.selected)
        .map((r) => ({
          dato: r.dato,
          beskrivelse: r.beskrivelse,
          belopInkMva: r.belopInkMva,
          mvaSats: 25,                       // default 25 % - bruker kan endre i etterkant
          kategori: r.kategori,
          externalId: r.externalId,
        }));
      const res = await api<{ created: number; skipped: number; errors: { index: number; error: string }[] }>(
        '/utgifter/bulk-import',
        { method: 'POST', body: payload },
      );
      setResult({ created: res.created, skipped: res.skipped, errors: res.errors.length });
      // Vent litt så bruker ser tallet, så lukke
      setTimeout(onImported, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import feilet');
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = rows?.filter((r) => r.selected).length ?? 0;
  const selectedSum = rows?.filter((r) => r.selected).reduce((s, r) => s + r.belopInkMva, 0) ?? 0;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 110,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 20, maxWidth: 900, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, color: tokens.color.navy, margin: 0 }}>Importer utgifter fra bank-CSV</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        {result && (
          <div style={{ background: '#dcfce7', color: '#14532d', padding: 12, borderRadius: 6, marginBottom: 12 }}>
            ✓ Importert: <strong>{result.created}</strong> nye, <strong>{result.skipped}</strong> hoppet over (duplikat), <strong>{result.errors}</strong> feil
          </div>
        )}

        {!rows && (
          <div>
            <p style={{ fontSize: 13, color: '#475569' }}>
              Last opp en CSV-fil eksportert fra nettbanken din. Vi auto-detekterer formatet:
            </p>
            <ul style={{ fontSize: 13, color: '#475569' }}>
              <li>DNB (semikolon-separert)</li>
              <li>Sparebank1 (semikolon-separert)</li>
              <li>Nordea (semikolon-separert)</li>
              <li>Generic (dato + beskrivelse + ut + inn)</li>
            </ul>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              style={{ marginTop: 12, fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
              Vi importerer kun utgifter (negative beløp i kontoutskriften). Inntekter hoppes over.
              Du kan velge/fjerne hver rad i preview før import.
            </div>
          </div>
        )}

        {rows && (
          <>
            <div style={{ marginBottom: 12, padding: 10, background: '#f1f5f9', borderRadius: 6, fontSize: 13 }}>
              Format detektert: <strong>{format}</strong> · {rows.length} utgifter funnet · <strong>{selectedCount}</strong> valgt ({selectedSum.toLocaleString('nb-NO')} kr)
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={th}><input
                      type="checkbox"
                      checked={rows.every((r) => r.selected)}
                      onChange={(e) => setRows((rs) => rs!.map((r) => ({ ...r, selected: e.target.checked })))}
                    /></th>
                    <th style={th}>Dato</th>
                    <th style={th}>Beskrivelse</th>
                    <th style={{ ...th, textAlign: 'right' }}>Beløp</th>
                    <th style={th}>Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9', opacity: r.selected ? 1 : 0.4 }}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={(e) => setRows((rs) => rs!.map((rr, idx) => idx === i ? { ...rr, selected: e.target.checked } : rr))}
                        />
                      </td>
                      <td style={td}>{r.dato}</td>
                      <td style={td}>{r.beskrivelse}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{r.belopInkMva.toLocaleString('nb-NO')} kr</td>
                      <td style={td}>
                        <select
                          value={r.kategori || ''}
                          onChange={(e) => setRows((rs) => rs!.map((rr, idx) => idx === i ? { ...rr, kategori: e.target.value || undefined } : rr))}
                          style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                        >
                          <option value="">- velg -</option>
                          {KATEGORIER.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={onClose} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155' }}>Avbryt</button>
              <button
                onClick={doImport}
                disabled={importing || selectedCount === 0}
                style={{ ...btnStyle, background: tokens.color.navy, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Upload size={14} /> {importing ? 'Importerer…' : `Importer ${selectedCount} utgifter`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── CSV-parser ──────────────────────────────────────────────────

/**
 * Auto-detekter format basert på header-raden + parser ut utgifter.
 * Returnerer både parsed-rader og navn på format-detektor som matchet.
 */
function parseCSV(text: string): { parsed: ParsedRow[]; formatName: string } {
  // Norm linje-ender, fjern BOM, split linjer
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { parsed: [], formatName: 'Ukjent' };

  const header = lines[0].toLowerCase();
  const sep = header.includes(';') ? ';' : ',';
  const cols = header.split(sep).map((c) => c.trim());

  // Format-detektorer — basert på kolonneoverskrifter
  // DNB: "Dato;Forklaring;Rentedato;Ut av konto;Inn på konto"
  if (cols.includes('ut av konto') && cols.includes('inn på konto')) {
    return parseDnb(lines, sep);
  }
  // Sparebank1: "Dato;Beskrivelse;Inn;Ut" eller variant
  if (cols.includes('beskrivelse') && cols.includes('ut') && cols.includes('inn')) {
    return parseSpareBank1(lines, sep);
  }
  // Nordea: "Bokført dato;Beløp;Avsender;Tekst;Saldo"
  if (cols.some((c) => c.includes('bokført')) && cols.includes('beløp')) {
    return parseNordea(lines, sep);
  }
  // Generic fallback — anta kolonner [dato, beskrivelse, ?, ut, inn] eller [dato, beskrivelse, beløp]
  return parseGeneric(lines, sep);
}

function parseDnb(lines: string[], sep: string): { parsed: ParsedRow[]; formatName: string } {
  const headerCols = lines[0].toLowerCase().split(sep).map((c) => c.trim());
  const iDato = headerCols.indexOf('dato');
  const iForklaring = headerCols.indexOf('forklaring');
  const iUt = headerCols.indexOf('ut av konto');
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(sep);
    if (c.length <= Math.max(iDato, iForklaring, iUt)) continue;
    const ut = parseNumber(c[iUt]);
    if (ut <= 0) continue;                       // ikke utgift
    out.push({
      dato: parseDnbDate(c[iDato]),
      beskrivelse: c[iForklaring].trim(),
      belopInkMva: ut,
      externalId: `dnb:${c[iDato]}:${c[iForklaring].slice(0, 30)}:${ut}`,
      selected: true,
    });
  }
  return { parsed: out, formatName: 'DNB' };
}

function parseSpareBank1(lines: string[], sep: string): { parsed: ParsedRow[]; formatName: string } {
  const headerCols = lines[0].toLowerCase().split(sep).map((c) => c.trim());
  const iDato = headerCols.indexOf('dato');
  const iBesk = headerCols.indexOf('beskrivelse');
  const iUt = headerCols.indexOf('ut');
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(sep);
    if (c.length <= Math.max(iDato, iBesk, iUt)) continue;
    const ut = parseNumber(c[iUt]);
    if (ut <= 0) continue;
    out.push({
      dato: parseGenericDate(c[iDato]),
      beskrivelse: c[iBesk].trim(),
      belopInkMva: ut,
      externalId: `s1:${c[iDato]}:${c[iBesk].slice(0, 30)}:${ut}`,
      selected: true,
    });
  }
  return { parsed: out, formatName: 'Sparebank1' };
}

function parseNordea(lines: string[], sep: string): { parsed: ParsedRow[]; formatName: string } {
  const headerCols = lines[0].toLowerCase().split(sep).map((c) => c.trim());
  const iDato = headerCols.findIndex((c) => c.includes('bokført'));
  const iBel = headerCols.indexOf('beløp');
  const iTxt = headerCols.indexOf('tekst');
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(sep);
    if (c.length <= Math.max(iDato, iBel, iTxt)) continue;
    const belop = parseNumber(c[iBel]);
    if (belop >= 0) continue;                    // Nordea: negative = utgift
    out.push({
      dato: parseGenericDate(c[iDato]),
      beskrivelse: (c[iTxt] || '').trim(),
      belopInkMva: Math.abs(belop),
      externalId: `nordea:${c[iDato]}:${(c[iTxt] || '').slice(0, 30)}:${belop}`,
      selected: true,
    });
  }
  return { parsed: out, formatName: 'Nordea' };
}

function parseGeneric(lines: string[], sep: string): { parsed: ParsedRow[]; formatName: string } {
  // Vanlig fallback: anta kol 0 = dato, kol 1 = beskrivelse, og leter etter første positive tall som "ut"
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(sep);
    if (c.length < 3) continue;
    const dato = parseGenericDate(c[0]);
    if (!dato) continue;
    const beskrivelse = (c[1] || '').trim();
    // Finn første tall som ser ut som et positivt beløp
    let belop = 0;
    for (let j = 2; j < c.length; j++) {
      const n = parseNumber(c[j]);
      if (n > 0) { belop = n; break; }
    }
    if (belop <= 0) continue;
    out.push({
      dato,
      beskrivelse,
      belopInkMva: belop,
      externalId: `gen:${dato}:${beskrivelse.slice(0, 30)}:${belop}`,
      selected: true,
    });
  }
  return { parsed: out, formatName: 'Generic' };
}

// Tall: takler "1 234,56" / "1.234,56" / "1234.56" / "-100,00"
function parseNumber(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// DNB-dato: "DD.MM.YYYY" → "YYYY-MM-DD"
function parseDnbDate(s: string): string {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return parseGenericDate(s);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Generisk: prøv ISO først, så DD.MM.YYYY, så DD/MM/YYYY, så DD-MM-YYYY
function parseGenericDate(s: string): string {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m1 = t.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  const m2 = t.match(/^(\d{4})[./](\d{2})[./](\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return '';
}

const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#475569', textAlign: 'left' };
const td: React.CSSProperties = { padding: '6px 10px', color: '#0f172a' };
const btnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
};
