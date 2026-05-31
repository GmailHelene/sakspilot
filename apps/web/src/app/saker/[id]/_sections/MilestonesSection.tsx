'use client';

/**
 * Frister / milepæler på en sak. Viser dato-status (forsinket, snart, fremover),
 * og lar bruker huke av som fullført eller slette.
 */

import { useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';
import { SectionCard, inputStyle, type Sak } from './_shared';

export default function MilestonesSection({
  sak,
  onChange,
}: {
  sak: Sak;
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(`/saker/${sak.id}/milestones`, {
        method: 'POST',
        body: { title: title.trim(), dueDate: new Date(dueDate).toISOString() },
      });
      setTitle('');
      setDueDate('');
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(id: string) {
    await api(`/saker/${sak.id}/milestones/${id}/complete`, { method: 'PATCH' });
    onChange();
  }

  async function deleteMilestone(id: string) {
    if (!confirm('Sletter fristen?')) return;
    await api(`/saker/${sak.id}/milestones/${id}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <SectionCard
      title={`Frister (${sak.milestones.length})`}
      action={
        !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              color: tokens.color.navy,
              fontWeight: 600,
              fontSize: 13,
              padding: '6px 10px',
              borderRadius: tokens.radius.sm,
              background: tokens.color.bgAlt,
            }}
          >
            + Legg til frist
          </button>
        )
      }
    >
      {showForm && (
        <form
          onSubmit={addMilestone}
          style={{
            background: tokens.color.bg,
            padding: 16,
            borderRadius: tokens.radius.md,
            marginBottom: 12,
            display: 'grid',
            gap: 10,
          }}
        >
          {error && (
            <div style={{ color: tokens.color.red, fontSize: 13 }}>{error}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10 }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='F.eks. "Innsendt rammesøknad"'
              style={inputStyle}
              required
              autoFocus
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: tokens.color.navy,
                color: tokens.color.white,
                padding: '8px 16px',
                borderRadius: tokens.radius.sm,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {saving ? 'Lagrer…' : 'Lagre frist'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setTitle('');
                setDueDate('');
                setError(null);
              }}
              style={{
                padding: '8px 16px',
                color: tokens.color.textMuted,
                fontSize: 13,
              }}
            >
              Avbryt
            </button>
          </div>
        </form>
      )}

      {sak.milestones.length === 0 && !showForm ? (
        <div style={{ color: tokens.color.textSubtle, fontSize: 13 }}>
          Ingen frister enda.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {sak.milestones.map((m) => {
            const due = new Date(m.dueDate);
            const daysUntil = Math.ceil((due.getTime() - Date.now()) / 86400000);
            const isOverdue = !m.completedAt && daysUntil < 0;
            const isSoon = !m.completedAt && daysUntil >= 0 && daysUntil <= 7;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: tokens.color.bg,
                  borderRadius: tokens.radius.sm,
                  border: `1px solid ${isOverdue ? tokens.color.red : tokens.color.border}`,
                  opacity: m.completedAt ? 0.6 : 1,
                }}
              >
                <button
                  onClick={() => toggleComplete(m.id)}
                  title={m.completedAt ? 'Marker ugjort' : 'Marker fullført'}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    border: `2px solid ${m.completedAt ? tokens.color.green : tokens.color.border}`,
                    background: m.completedAt ? tokens.color.green : 'transparent',
                    color: tokens.color.white,
                    fontSize: 14,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {m.completedAt ? '✓' : ''}
                </button>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      textDecoration: m.completedAt ? 'line-through' : 'none',
                    }}
                  >
                    {m.title}
                  </div>
                  <div style={{ fontSize: 12, color: tokens.color.textMuted }}>
                    {due.toLocaleDateString('nb-NO', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {m.completedAt ? (
                      <span style={{ color: tokens.color.green }}>
                        {' '}
                        · ✓ fullført{' '}
                        {new Date(m.completedAt).toLocaleDateString('nb-NO')}
                      </span>
                    ) : isOverdue ? (
                      <span style={{ color: tokens.color.red, fontWeight: 600 }}>
                        {' '}
                        · {Math.abs(daysUntil)} dager forsinket
                      </span>
                    ) : isSoon ? (
                      <span style={{ color: '#D4A017', fontWeight: 600 }}>
                        {' '}
                        · om {daysUntil} dager
                      </span>
                    ) : (
                      <span> · om {daysUntil} dager</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteMilestone(m.id)}
                  style={{ fontSize: 12, color: tokens.color.red, padding: '4px 8px' }}
                >
                  Slett
                </button>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
