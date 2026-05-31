'use client';

/**
 * Offentlig sak-visning — leverer status til klient uten innlogging.
 *
 * Token i URL identifiserer en aktiv SharedSakLink. Backend filtrerer
 * bort all sensitiv info (matching-regler, time-entries, audit, sticky)
 * og returnerer kun saks-tittel, status, milepæler og evt. tidssammendrag.
 *
 * Ingen sidebar, ingen header — full-bleed klient-portal med Sakspilot-merke.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, Circle, Clock, Calendar, Briefcase, ArrowUpRight, Loader2,
} from 'lucide-react';

interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}

interface PublicSak {
  sak: {
    title: string;
    status: string;
    deadline: string | null;
    description: string | null;
    clientName: string | null;
    createdAt: string;
    closedAt: string | null;
  };
  milestones: Milestone[];
  progressPct: number | null;
  timeStats: { totalHours: number; lastUpdate: string | null } | null;
  sharedAt: string;
  expiresAt: string | null;
}

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  ikke_pabegynt: { label: 'Ikke påbegynt', color: '#94A3B8' },
  pagaaende: { label: 'Pågår', color: '#2D6A4F' },
  venter_kunde: { label: 'Venter på deg', color: '#E9C46A' },
  venter_3part: { label: 'Venter på tredjepart', color: '#D4A017' },
  ferdig: { label: 'Ferdig', color: '#1E3A5F' },
  arkivert: { label: 'Arkivert', color: '#CBD5E1' },
};

export default function DeltSakPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<PublicSak | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public/sak/${params.token}`);
        if (res.status === 404) {
          setError('Denne lenken er ikke lenger gyldig.');
          return;
        }
        if (res.status === 410) {
          setError('Lenken har utløpt. Ta kontakt med avsender for ny lenke.');
          return;
        }
        if (!res.ok) {
          setError('Kunne ikke laste prosjektet.');
          return;
        }
        const d = await res.json();
        setData(d);
      } catch {
        setError('Tilkoblingsfeil. Prøv igjen senere.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.token]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Loader2
            size={32}
            style={{ animation: 'spin 1s linear infinite', color: '#1E3A5F' }}
          />
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 24, color: '#1E3A5F', marginBottom: 8 }}>
            Lenken er ikke tilgjengelig
          </h1>
          <p style={{ color: '#555' }}>{error || 'Ukjent feil.'}</p>
        </div>
      </main>
    );
  }

  const status = STATUS_DISPLAY[data.sak.status] || {
    label: data.sak.status,
    color: '#94A3B8',
  };

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, color: '#B8860B' }}>▲</span>
          <strong style={{ color: '#1E3A5F', fontSize: 14, letterSpacing: 1 }}>
            SAKSPILOT
          </strong>
        </div>
        <a
          href="https://sakspilot.no"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}
        >
          sakspilot.no <ArrowUpRight size={11} style={{ verticalAlign: 'middle' }} />
        </a>
      </header>

      <div style={containerStyle}>
        {/* ── Tittel + status ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              {data.sak.clientName && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: '#555',
                    marginBottom: 8,
                  }}
                >
                  <Briefcase size={14} strokeWidth={2} />
                  {data.sak.clientName}
                </div>
              )}
              <h1
                style={{
                  fontSize: 28,
                  color: '#1E3A5F',
                  marginBottom: 12,
                  lineHeight: 1.2,
                }}
              >
                {data.sak.title}
              </h1>
              <span
                style={{
                  display: 'inline-block',
                  background: status.color,
                  color: 'white',
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {status.label}
              </span>
            </div>
            {data.sak.deadline && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Frist
                </div>
                <div style={{ fontSize: 18, color: '#1E3A5F', fontWeight: 600, marginTop: 4 }}>
                  {new Date(data.sak.deadline).toLocaleDateString('nb-NO', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
            )}
          </div>

          {data.sak.description && (
            <p
              style={{
                marginTop: 20,
                padding: 16,
                background: '#FAFAF7',
                borderRadius: 8,
                color: '#1A1A1A',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {data.sak.description}
            </p>
          )}
        </div>

        {/* ── Fremdrift ── */}
        {data.progressPct !== null && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, color: '#1E3A5F' }}>Fremdrift</h2>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#1E3A5F', fontVariantNumeric: 'tabular-nums' }}>
                {data.progressPct}%
              </span>
            </div>
            <div
              style={{
                height: 12,
                background: '#F4F4F0',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${data.progressPct}%`,
                  background: data.progressPct === 100 ? '#52B788' : '#1E3A5F',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* ── Milepæler ── */}
        {data.milestones.length > 0 && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 18, color: '#1E3A5F', marginBottom: 16 }}>
              Milepæler
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {data.milestones.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    background: m.completed ? '#F0FDF4' : '#FAFAF7',
                    borderRadius: 8,
                    border: '1px solid #E2E2DC',
                  }}
                >
                  {m.completed ? (
                    <CheckCircle2 size={20} strokeWidth={2.5} style={{ color: '#52B788', flexShrink: 0 }} />
                  ) : (
                    <Circle size={20} strokeWidth={2} style={{ color: '#94A3B8', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#1A1A1A',
                        textDecoration: m.completed ? 'line-through' : 'none',
                        opacity: m.completed ? 0.7 : 1,
                      }}
                    >
                      {m.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                      <Calendar size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      {new Date(m.dueDate).toLocaleDateString('nb-NO', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tidsbruk (valgfritt) ── */}
        {data.timeStats && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 18, color: '#1E3A5F', marginBottom: 12 }}>
              Tidsbruk
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Clock size={22} style={{ color: '#B8860B' }} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#1E3A5F', fontVariantNumeric: 'tabular-nums' }}>
                  {data.timeStats.totalHours.toFixed(1)} timer
                </div>
                {data.timeStats.lastUpdate && (
                  <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                    Sist oppdatert{' '}
                    {new Date(data.timeStats.lastUpdate).toLocaleDateString('nb-NO')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={footerStyle}>
          Delt {new Date(data.sharedAt).toLocaleDateString('nb-NO')}
          {data.expiresAt && ` · Utløper ${new Date(data.expiresAt).toLocaleDateString('nb-NO')}`}
          <br />
          <span style={{ fontSize: 11 }}>
            Sakspilot er et workspace for selvstendig næringsdrivende —{' '}
            <a
              href="https://sakspilot.no"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1E3A5F', fontWeight: 500 }}
            >
              les mer
            </a>
          </span>
        </div>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #FAFAF7 0%, #F4F4F0 100%)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 24px',
  borderBottom: '1px solid #E2E2DC',
  background: 'white',
};

const containerStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '32px 16px 64px',
};

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 14,
  padding: 24,
  marginBottom: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  border: '1px solid #E2E2DC',
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 12,
  color: '#8A8A8A',
  marginTop: 24,
  lineHeight: 1.6,
};
