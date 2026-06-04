'use client';

import { useEffect, useState, useRef } from 'react';
import { Pin, PinOff, Trash2, Plus, Palette, Bell, BellOff, Mic } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import VoiceNoteRecorder, { type VoiceNoteValue } from '@/components/VoiceNoteRecorder';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface StickyNote {
  id: string;
  content: string;
  color: string;
  pinned: boolean;
  updatedAt: string;
  sakId: string | null;
  remindAt: string | null;
  audioBase64: string | null;
  audioDurationSec: number | null;
  audioMimeType: string | null;
  audioRecordedAt: string | null;
}

const COLORS = [
  { id: 'yellow', bg: '#FEF3C7', edge: '#F59E0B' },
  { id: 'pink', bg: '#FCE7F3', edge: '#EC4899' },
  { id: 'blue', bg: '#DBEAFE', edge: '#3B82F6' },
  { id: 'green', bg: '#D1FAE5', edge: '#10B981' },
  { id: 'purple', bg: '#EDE9FE', edge: '#8B5CF6' },
  { id: 'orange', bg: '#FED7AA', edge: '#F97316' },
];

export default function KlistrelapperPage() {
  const [notes, setNotes] = useState<StickyNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { notes } = await api<{ notes: StickyNote[] }>('/stickies');
      setNotes(notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    }
  }

  async function addNote() {
    const colors = COLORS.map((c) => c.id);
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const note = await api<StickyNote>('/stickies', {
      method: 'POST',
      body: { content: '', color: randomColor },
    });
    setNotes((prev) => prev ? [note, ...prev] : [note]);
  }

  async function updateNote(id: string, patch: Partial<StickyNote>) {
    setNotes((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, ...patch } : n)) : prev
    );
    try {
      await api(`/stickies/${id}`, { method: 'PATCH', body: patch });
    } catch (err) {
      console.error('Lagring feilet:', err);
    }
  }

  async function deleteNote(id: string) {
    if (!confirm('Slette denne klistrelappen?')) return;
    await api(`/stickies/${id}`, { method: 'DELETE' });
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? null);
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy }}>Klistrelapper</h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
              {notes ? `${notes.length} ${notes.length === 1 ? 'notat' : 'notater'}` : 'Henter…'} ·
              Klikk for å skrive · Lagres automatisk
            </p>
          </div>
          <button onClick={addNote} style={primaryBtn}>
            <Plus size={16} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Ny klistrelapp
          </button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {!notes ? (
          <div style={{ color: tokens.color.textMuted, padding: 40, textAlign: 'center' }}>
            Henter klistrelapper…
          </div>
        ) : notes.length === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📌</div>
            <h2 style={{ color: tokens.color.navy, marginBottom: 8 }}>Ingen klistrelapper enda</h2>
            <p style={{ color: tokens.color.textMuted, marginBottom: 20 }}>
              Bruk dem til raske notater, idéer, oppgaver - alt du vil huske.
            </p>
            <button onClick={addNote} style={primaryBtn}>+ Lag din første</button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {notes.map((note) => (
              <StickyCard
                key={note.id}
                note={note}
                onUpdate={(patch) => updateNote(note.id, patch)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function StickyCard({
  note,
  onUpdate,
  onDelete,
}: {
  note: StickyNote;
  onUpdate: (patch: Partial<StickyNote>) => void;
  onDelete: () => void;
}) {
  const [showColors, setShowColors] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setDraft(note.content); }, [note.content]);

  // Pakk audio-feltene fra notatet til format VoiceNoteRecorder forventer.
  const audioValue: VoiceNoteValue | null =
    note.audioBase64 && note.audioMimeType && note.audioDurationSec != null
      ? {
          audioBase64: note.audioBase64,
          audioDurationSec: note.audioDurationSec,
          audioMimeType: note.audioMimeType,
        }
      : null;

  function handleAudioChange(v: VoiceNoteValue | null) {
    if (v) {
      // Nytt opptak — send alle 3 feltene; backend stempler recordedAt.
      onUpdate({
        audioBase64: v.audioBase64,
        audioDurationSec: v.audioDurationSec,
        audioMimeType: v.audioMimeType,
      } as Partial<StickyNote>);
    } else {
      // Slett — null på audioBase64 trigger nullstilling av alle 4 felter
      // i backend-handleren (se apps/api/src/routes/stickies.ts).
      onUpdate({
        audioBase64: null,
        audioDurationSec: null,
        audioMimeType: null,
      } as Partial<StickyNote>);
    }
  }

  function handleReminderChange(localValue: string) {
    // localValue er fra <input type="datetime-local"> i lokal tid (uten tz).
    // Konverter til ISO (UTC) før vi sender til backend.
    if (!localValue) {
      onUpdate({ remindAt: null });
      return;
    }
    const iso = new Date(localValue).toISOString();
    onUpdate({ remindAt: iso });
  }

  // Backend lagrer UTC. <input type="datetime-local"> trenger lokal-format
  // "YYYY-MM-DDTHH:mm" (uten tz). Vi konverterer her.
  const reminderLocalValue = note.remindAt
    ? toLocalDatetimeInputValue(new Date(note.remindAt))
    : '';
  const hasReminder = !!note.remindAt;

  function handleChange(value: string) {
    setDraft(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate({ content: value });
    }, 600);
  }

  const color = COLORS.find((c) => c.id === note.color) || COLORS[0];

  return (
    <div
      style={{
        position: 'relative',
        background: color.bg,
        borderRadius: tokens.radius.md,
        boxShadow: '0 4px 8px rgba(0,0,0,0.08)',
        borderTop: `4px solid ${color.edge}`,
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.1s',
      }}
    >
      {/* Verktøyrad - synlig på hover */}
      <div
        style={{
          padding: '8px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => onUpdate({ pinned: !note.pinned })}
          style={iconBtn}
          title={note.pinned ? 'Løsne' : 'Fest'}
        >
          {note.pinned
            ? <Pin size={14} strokeWidth={2.5} style={{ color: color.edge }} fill={color.edge} />
            : <PinOff size={14} strokeWidth={2} style={{ color: '#888' }} />}
        </button>
        <div style={{ position: 'relative', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowReminder((v) => !v)}
            style={iconBtn}
            title={hasReminder ? `Påminnelse: ${new Date(note.remindAt!).toLocaleString('nb-NO')}` : 'Sett påminnelse'}
          >
            {hasReminder
              ? <Bell size={14} strokeWidth={2.5} style={{ color: color.edge }} fill={color.edge} />
              : <BellOff size={14} strokeWidth={2} style={{ color: '#888' }} />}
          </button>
          {showReminder && (
            <div
              style={{
                position: 'absolute',
                top: 28,
                right: 0,
                background: 'white',
                padding: 10,
                borderRadius: tokens.radius.sm,
                boxShadow: tokens.shadow.md,
                zIndex: 10,
                minWidth: 200,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <label style={{ fontSize: 11, color: tokens.color.textMuted }}>
                Påminn meg når
              </label>
              <input
                type="datetime-local"
                value={reminderLocalValue}
                onChange={(e) => handleReminderChange(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: '6px 8px',
                  borderRadius: tokens.radius.sm,
                  border: `1px solid ${tokens.color.border}`,
                  fontFamily: 'inherit',
                }}
              />
              {hasReminder && (
                <button
                  onClick={() => { handleReminderChange(''); setShowReminder(false); }}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    background: 'transparent',
                    border: `1px solid ${tokens.color.border}`,
                    borderRadius: tokens.radius.sm,
                    cursor: 'pointer',
                    color: tokens.color.textMuted,
                  }}
                >
                  Fjern påminnelse
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => setShowRecorder((v) => !v)}
            style={iconBtn}
            title={audioValue ? 'Stemmenotat' : 'Spill inn stemmenotat'}
          >
            <Mic
              size={14}
              strokeWidth={2.5}
              style={{ color: audioValue ? color.edge : '#888' }}
              fill={audioValue ? color.edge : 'none'}
            />
          </button>
          <button onClick={() => setShowColors(!showColors)} style={iconBtn} title="Farge">
            <Palette size={14} strokeWidth={2} style={{ color: '#888' }} />
          </button>
          {showColors && (
            <div
              style={{
                position: 'absolute',
                top: 28,
                right: 0,
                background: 'white',
                padding: 8,
                borderRadius: tokens.radius.sm,
                boxShadow: tokens.shadow.md,
                display: 'flex',
                gap: 4,
                zIndex: 10,
              }}
            >
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { onUpdate({ color: c.id }); setShowColors(false); }}
                  style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: c.bg, border: `2px solid ${c.edge}`,
                    cursor: 'pointer',
                  }}
                  title={c.id}
                />
              ))}
            </div>
          )}
        </div>
        <button onClick={onDelete} style={iconBtn} title="Slett">
          <Trash2 size={14} strokeWidth={2} style={{ color: '#888' }} />
        </button>
      </div>

      {/* Innhold - alltid redigerbart */}
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Skriv her..."
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: '4px 14px 14px',
          fontSize: 14,
          fontFamily: 'inherit',
          color: tokens.color.text,
          resize: 'none',
          minHeight: 120,
        }}
      />

      {/* Stemmenotat - inline recorder, åpnes via mikrofon-knappen.
          Auto-åpnes også når det allerede finnes audio så bruker kan
          spille av uten ekstra klikk. */}
      {(showRecorder || audioValue) && (
        <div style={{ padding: '0 12px 8px' }}>
          <VoiceNoteRecorder value={audioValue} onChange={handleAudioChange} />
        </div>
      )}

      {/* Tidsstempel nederst - viser også påminnelse hvis satt */}
      <div
        style={{
          padding: '6px 12px',
          fontSize: 10,
          color: '#999',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {hasReminder ? (
          <span style={{ color: color.edge, fontWeight: 600 }}>
            <Bell size={10} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 3 }} />
            {formatReminder(note.remindAt!)}
          </span>
        ) : <span />}
        <span>{formatRelative(note.updatedAt)}</span>
      </div>
    </div>
  );
}

function toLocalDatetimeInputValue(d: Date): string {
  // <input type="datetime-local"> trenger "YYYY-MM-DDTHH:mm" i lokal tid.
  // d.toISOString() gir UTC — vi må skifte til lokal og strippe sekunder/tz.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) +
    ':' + pad(d.getMinutes())
  );
}

function formatReminder(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `i dag ${time}`;
  if (isTomorrow) return `i morgen ${time}`;
  return d.toLocaleString('nb-NO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'nå';
  if (min < 60) return `${min} min siden`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} t siden`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} d siden`;
  return new Date(iso).toLocaleDateString('nb-NO');
}

const primaryBtn: React.CSSProperties = {
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 4,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const errorStyle: React.CSSProperties = {
  padding: 16,
  background: '#FEE2E2',
  color: '#7F1D1D',
  borderRadius: tokens.radius.sm,
  marginBottom: 16,
};

const emptyStyle: React.CSSProperties = {
  padding: 48,
  textAlign: 'center',
  background: tokens.color.white,
  borderRadius: tokens.radius.lg,
  border: `1px dashed ${tokens.color.border}`,
};
