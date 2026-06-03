'use client';

/**
 * /foresporsler — Lead/inquiry-pipeline.
 *
 * Visning: kanban-style med 5 kolonner (ny, i_dialog, vunnet, tapt, arkivert).
 * Hver kolonne har telling i header. Klikk på kort → detalj-modal.
 *
 * Aksjoner:
 *   - "Ny forespørsel" topp-knapp → opprett-modal
 *   - Drag-and-drop mellom kolonner endrer status (klikk-meny som fallback)
 *   - "Konverter til klient" knapp på vunnet-kort → POST /:id/convert
 */
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { SearchBar } from '@/components/SearchBar';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';
import { Plus, ArrowRight, X } from 'lucide-react';

type Status = 'ny' | 'i_dialog' | 'vunnet' | 'tapt' | 'arkivert';

interface Foresporsel {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  message: string | null;
  status: Status;
  estimatedValue: number | null;
  expectedCloseDate: string | null;
  closedAt: string | null;
  convertedToClientId: string | null;
  convertedToSakId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse {
  foresporsler: Foresporsel[];
  total: number;
  countsByStatus: Partial<Record<Status, number>>;
}

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  ny:        { label: 'Nye',         color: '#1e3a8a', bg: '#dbeafe' },
  i_dialog:  { label: 'I dialog',    color: '#92400e', bg: '#fef3c7' },
  vunnet:    { label: 'Vunnet',      color: '#14532d', bg: '#dcfce7' },
  tapt:      { label: 'Tapt',        color: '#7f1d1d', bg: '#fee2e2' },
  arkivert:  { label: 'Arkivert',    color: '#374151', bg: '#f3f4f6' },
};

const STATUS_ORDER: Status[] = ['ny', 'i_dialog', 'vunnet', 'tapt', 'arkivert'];

export default function ForesporslerPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Foresporsel | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [q, setQ] = useState('');
  // DnD-state: hvilken kolonne kortet hovrer over (for visuell feedback).
  // dragOverStatus settes på dragEnter + tømmes på dragLeave/drop.
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);

  async function load() {
    try {
      const qs = new URLSearchParams();
      if (includeArchived) qs.set('includeArchived', 'true');
      if (q) qs.set('q', q);
      const url = `/foresporsler${qs.toString() ? `?${qs}` : ''}`;
      const res = await api<ApiResponse>(url);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ukjent feil');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [includeArchived, q]);

  async function changeStatus(id: string, newStatus: Status) {
    await api(`/foresporsler/${id}`, { method: 'PATCH', body: { status: newStatus } });
    load();
    setSelected(null);
  }

  // ── Drag-and-drop ────────────────────────────────────────
  // Optimistisk oppdatering: vi flytter kortet visuelt umiddelbart,
  // sender PATCH i bakgrunn, og rull tilbake hvis API feiler.
  function onDragStart(e: React.DragEvent, foresporsel: Foresporsel) {
    e.dataTransfer.setData('text/plain', foresporsel.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: React.DragEvent, status: Status) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }

  function onDragLeave() {
    setDragOverStatus(null);
  }

  async function onDrop(e: React.DragEvent, newStatus: Status) {
    e.preventDefault();
    setDragOverStatus(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id || !data) return;

    const f = data.foresporsler.find((x) => x.id === id);
    if (!f || f.status === newStatus) return;

    // Optimistisk: oppdater UI nå
    const oldStatus = f.status;
    setData({
      ...data,
      foresporsler: data.foresporsler.map((x) => (x.id === id ? { ...x, status: newStatus } : x)),
    });

    try {
      await api(`/foresporsler/${id}`, { method: 'PATCH', body: { status: newStatus } });
      load(); // re-fetch for å få oppdatert closedAt og countsByStatus
    } catch (err) {
      // Roll-back ved feil
      setData((d) =>
        d ? { ...d, foresporsler: d.foresporsler.map((x) => (x.id === id ? { ...x, status: oldStatus } : x)) } : d
      );
      setError(err instanceof Error ? err.message : 'Kunne ikke endre status');
    }
  }

  async function convertToClient(f: Foresporsel) {
    if (!confirm(`Konverter "${f.name}" til klient + opprette ny sak?`)) return;
    await api(`/foresporsler/${f.id}/convert`, { method: 'POST', body: { createSak: true } });
    load();
    setSelected(null);
  }

  const byStatus = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = (data?.foresporsler ?? []).filter((f) => f.status === s);
    return acc;
  }, {} as Record<Status, Foresporsel[]>);

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0 }}>Forespørsler</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
              Lead-pipeline. Konverter "vunnet" til klient + sak når oppdraget bekreftes.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <SearchBar value={q} onChange={setQ} placeholder="Søk forespørsler…" />
            <label style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              Vis arkiverte
            </label>
            <button
              onClick={() => setCreating(true)}
              style={{
                background: tokens.color.navy, color: 'white', border: 'none',
                padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              }}
            >
              <Plus size={16} /> Ny forespørsel
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!data && !error && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Laster…</div>}

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'start' }}>
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const items = byStatus[s];
              if (s === 'arkivert' && !includeArchived) return null;
              const isDropTarget = dragOverStatus === s;
              return (
                <div
                  key={s}
                  onDragOver={(e) => onDragOver(e, s)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, s)}
                  style={{
                    background: isDropTarget ? '#dbeafe' : '#f8fafc',
                    borderRadius: 12,
                    padding: 12,
                    minHeight: 200,
                    border: isDropTarget ? '2px dashed #3b82f6' : '2px dashed transparent',
                    transition: 'background 0.15s, border 0.15s',
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 10, padding: '4px 6px',
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: meta.color, background: meta.bg,
                      padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4,
                    }}>{meta.label}</span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{items.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.length === 0 && (
                      <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 16 }}>
                        {isDropTarget ? 'Slipp her' : 'Ingen'}
                      </div>
                    )}
                    {items.map((f) => (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, f)}
                        onClick={() => setSelected(f)}
                        title="Dra til en annen kolonne for å endre status, eller klikk for detaljer"
                        style={{
                          background: 'white', border: '1px solid #e2e8f0',
                          borderRadius: 8, padding: 10, textAlign: 'left', cursor: 'grab',
                          display: 'flex', flexDirection: 'column', gap: 4,
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{f.name}</div>
                        {f.message && (
                          <div style={{
                            fontSize: 11, color: '#64748b', overflow: 'hidden',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}>{f.message}</div>
                        )}
                        {f.estimatedValue != null && (
                          <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 600 }}>
                            {f.estimatedValue.toLocaleString('nb-NO')} kr
                          </div>
                        )}
                        {f.source && (
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>Kilde: {f.source}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {selected && (
        <DetailModal
          foresporsel={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(s) => changeStatus(selected.id, s)}
          onConvert={() => convertToClient(selected)}
        />
      )}
    </AppLayout>
  );
}

// ── Opprett-modal ──────────────────────────────────────────────────
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [message, setMessage] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api('/foresporsler', {
        method: 'POST',
        body: {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          source: source.trim() || undefined,
          message: message.trim() || undefined,
          estimatedValue: estimatedValue ? parseInt(estimatedValue, 10) : undefined,
        },
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Ny forespørsel" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Kontakt-navn (eller firma)" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="E-post"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
          <Field label="Telefon"><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Kilde (hvor leaden kom fra)">
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="f.eks. Facebook-gruppe, anbefaling" style={inputStyle} />
        </Field>
        <Field label="Hva de spør om">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: 'inherit' }} />
        </Field>
        <Field label="Estimert verdi (kr) — valgfritt">
          <input type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} style={inputStyle} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155' }}>Avbryt</button>
          <button type="submit" disabled={saving} style={{ ...btnStyle, background: tokens.color.navy, color: 'white' }}>
            {saving ? 'Lagrer…' : 'Opprett'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Detalj-modal ──────────────────────────────────────────────────
function DetailModal({
  foresporsel: f, onClose, onStatusChange, onConvert,
}: {
  foresporsel: Foresporsel;
  onClose: () => void;
  onStatusChange: (s: Status) => void;
  onConvert: () => void;
}) {
  const meta = STATUS_META[f.status];
  return (
    <Modal title={f.name} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg,
            padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase',
          }}>{meta.label}</span>
          {f.source && <span style={{ fontSize: 12, color: '#64748b' }}>Kilde: {f.source}</span>}
        </div>

        {(f.email || f.phone) && (
          <div style={{ fontSize: 13, color: '#334155' }}>
            {f.email && <div>📧 <a href={`mailto:${f.email}`} style={{ color: tokens.color.navy }}>{f.email}</a></div>}
            {f.phone && <div>📱 <a href={`tel:${f.phone}`} style={{ color: tokens.color.navy }}>{f.phone}</a></div>}
          </div>
        )}

        {f.message && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Forespørsel</div>
            <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{f.message}</div>
          </div>
        )}

        {f.notes && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Notater</div>
            <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap' }}>{f.notes}</div>
          </div>
        )}

        {f.estimatedValue != null && (
          <div style={{ fontSize: 13 }}>
            <strong>Estimert verdi:</strong> {f.estimatedValue.toLocaleString('nb-NO')} kr
          </div>
        )}

        {f.convertedToClientId && (
          <div style={{ background: '#dcfce7', color: '#14532d', padding: 10, borderRadius: 6, fontSize: 12 }}>
            ✓ Konvertert til klient. Se den under <a href="/klienter" style={{ color: '#14532d', fontWeight: 600 }}>Klienter</a>.
          </div>
        )}

        {/* Status-endring */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Endre status</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_ORDER.filter((s) => s !== f.status).map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                style={{
                  fontSize: 12, padding: '6px 12px', border: '1px solid #e2e8f0',
                  background: 'white', borderRadius: 6, cursor: 'pointer',
                }}
              >{STATUS_META[s].label}</button>
            ))}
          </div>
        </div>

        {f.status !== 'vunnet' && !f.convertedToClientId && (
          <button
            onClick={onConvert}
            style={{
              background: '#14532d', color: 'white', border: 'none', padding: '10px 16px',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
            }}
          >
            <ArrowRight size={16} /> Konverter til klient + sak
          </button>
        )}
      </div>
    </Modal>
  );
}

// ── Felles UI ──────────────────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: 20, maxWidth: 560, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0, color: tokens.color.navy }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
  fontSize: 13, width: '100%', boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  border: 'none', cursor: 'pointer',
};
