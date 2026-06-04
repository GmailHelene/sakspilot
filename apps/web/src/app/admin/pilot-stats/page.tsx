'use client';

/**
 * /admin/pilot-stats - cross-tenant pilot-statistikk.
 *
 * Bare for Helene som operator. Backend gater pa email-whitelist
 * (helene721@gmail.com + helene@helene.cloud). Andre brukere far 403.
 *
 * Viser:
 *   - 4 KPI-kort: brukere registrert, aktive brukere, desktop-nedlastinger, totale saker
 *   - Tabell over siste 10 registreringer (anonymisert email)
 *   - GitHub-nedlastinger per plattform + siste 5 releases
 *   - Snarveier til Umami (web-trafikk) og GitHub-releases
 */
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { tokens } from '@/lib/tokens';
import {
  Users, UserCheck, Download, BarChart3, ExternalLink,
  Briefcase, FileText, MessageSquare, RefreshCw,
} from 'lucide-react';

interface PilotStats {
  asOf: string;
  users: {
    total: number;
    registeredLast7d: number;
    registeredLast30d: number;
    activeLast7d: number;
    activeLast30d: number;
  };
  organizations: {
    total: number;
    byPlan: Array<{ plan: string; count: number }>;
  };
  workload: {
    sakerTotal: number;
    invoicesTotal: number;
    foresporslerTotal: number;
  };
  desktopDownloads: {
    win: number;
    mac: number;
    linux: number;
    total: number;
    perRelease: Array<{ tag: string; downloads: number }>;
  };
  recentRegistrations: Array<{
    emailShort: string;
    name: string;
    orgName: string | null;
    plan: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  }>;
  links: { umamiDashboard: string; githubReleases: string };
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PilotStatsPage() {
  const [stats, setStats] = useState<PilotStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<PilotStats>('/admin/pilot-stats');
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0 }}>Pilot-statistikk</h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, margin: '4px 0 0' }}>
              Hvor mange tester Sakspilot pa tvers av alle tenants. Bare synlig for deg.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '8px 14px', borderRadius: 8, border: `1px solid ${tokens.color.border}`,
              background: 'white', color: tokens.color.navy, fontSize: 13, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <RefreshCw size={14} className={loading ? 'sp-spin' : ''} />
            Oppdater
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading && !stats && (
          <div style={{ padding: 40, textAlign: 'center', color: tokens.color.textMuted }}>Laster...</div>
        )}

        {stats && (
          <>
            <p style={{ fontSize: 11, color: tokens.color.textSubtle, marginBottom: 16 }}>
              Snapshot: {formatDate(stats.asOf)}. Desktop-nedlastinger cachet i 10 min.
            </p>

            {/* 4 hoved-KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
              <Kpi
                Icon={Users}
                label="Registrerte brukere totalt"
                value={stats.users.total}
                sub={`+${stats.users.registeredLast7d} siste 7d / +${stats.users.registeredLast30d} siste 30d`}
                color={tokens.color.navy}
              />
              <Kpi
                Icon={UserCheck}
                label="Aktive brukere"
                value={stats.users.activeLast7d}
                sub={`${stats.users.activeLast30d} siste 30d (login)`}
                color="#10B981"
              />
              <Kpi
                Icon={Download}
                label="Desktop-nedlastinger"
                value={stats.desktopDownloads.total}
                sub={`Win ${stats.desktopDownloads.win} / Mac ${stats.desktopDownloads.mac} / Linux ${stats.desktopDownloads.linux}`}
                color="#7C3AED"
              />
              <Kpi
                Icon={Briefcase}
                label="Organisasjoner"
                value={stats.organizations.total}
                sub={stats.organizations.byPlan.map(p => `${p.count}x ${p.plan}`).join(', ') || '-'}
                color="#F59E0B"
              />
            </div>

            {/* Workload-KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <Kpi Icon={Briefcase} label="Saker opprettet" value={stats.workload.sakerTotal} small />
              <Kpi Icon={FileText} label="Fakturaer opprettet" value={stats.workload.invoicesTotal} small />
              <Kpi Icon={MessageSquare} label="Forespørsler" value={stats.workload.foresporslerTotal} small />
            </div>

            {/* Siste registreringer */}
            <Section title="Siste 10 registreringer" subtitle="Anonymisert email (forste 3 tegn + domene)">
              <div style={{ background: 'white', border: `1px solid ${tokens.color.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: tokens.color.bg }}>
                      <th style={th}>Email</th>
                      <th style={th}>Navn</th>
                      <th style={th}>Organisasjon</th>
                      <th style={th}>Registrert</th>
                      <th style={th}>Sist innlogget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentRegistrations.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: tokens.color.textMuted }}>
                        Ingen registreringer ennaa
                      </td></tr>
                    ) : stats.recentRegistrations.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${tokens.color.border}` }}>
                        <td style={td}><code style={{ fontSize: 12 }}>{r.emailShort}</code></td>
                        <td style={td}>{r.name}</td>
                        <td style={td}>{r.orgName ?? '-'} {r.plan && <span style={{ fontSize: 10, color: tokens.color.textMuted }}>({r.plan})</span>}</td>
                        <td style={td}>{formatDate(r.createdAt)}</td>
                        <td style={td}>{formatDate(r.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* Desktop per release */}
            {stats.desktopDownloads.perRelease.length > 0 && (
              <Section title="Siste 5 desktop-releases">
                <div style={{ background: 'white', border: `1px solid ${tokens.color.border}`, borderRadius: 8, padding: 16 }}>
                  {stats.desktopDownloads.perRelease.map((r) => (
                    <div key={r.tag} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${tokens.color.bg}`, fontSize: 13 }}>
                      <span style={{ fontFamily: 'monospace', color: tokens.color.navy }}>{r.tag}</span>
                      <span style={{ fontWeight: 700, color: r.downloads > 0 ? '#7C3AED' : tokens.color.textSubtle }}>
                        {r.downloads} nedlastinger
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Snarveier */}
            <Section title="Detaljerte rapporter">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <ExternalCard
                  Icon={BarChart3}
                  title="Web-trafikk (Umami)"
                  body="Sidevisninger, unike besokende, kilde, geografi. GDPR-vennlig, anonymisert."
                  href={stats.links.umamiDashboard}
                />
                <ExternalCard
                  Icon={Download}
                  title="Alle GitHub-releases"
                  body="Per-release-nedlastinger, full-historikk pa tvers av desktop-versjoner."
                  href={stats.links.githubReleases}
                />
              </div>
            </Section>
          </>
        )}
      </div>
      <style jsx global>{`
        .sp-spin { animation: sp-spin 1s linear infinite; }
        @keyframes sp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </AppLayout>
  );
}

function Kpi({
  Icon, label, value, sub, color, small,
}: {
  Icon: React.ElementType; label: string; value: number; sub?: string; color?: string; small?: boolean;
}) {
  return (
    <div style={{
      background: 'white', border: `1px solid ${tokens.color.border}`,
      borderRadius: 10, padding: small ? 14 : 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: tokens.color.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        <Icon size={12} />
        {label}
      </div>
      <div style={{ fontSize: small ? 22 : 28, fontWeight: 800, color: color ?? tokens.color.navy, lineHeight: 1.1 }}>
        {value.toLocaleString('nb-NO')}
      </div>
      {sub && <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, color: '#475569', margin: '0 0 4px', fontWeight: 600 }}>{title}</h2>
      {subtitle && <p style={{ color: tokens.color.textSubtle, fontSize: 12, margin: '0 0 10px' }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function ExternalCard({ Icon, title, body, href }: { Icon: React.ElementType; title: string; body: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block', padding: 16, background: 'white',
        border: `1px solid ${tokens.color.border}`, borderRadius: 10,
        textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={16} color={tokens.color.navy} />
        <strong style={{ color: tokens.color.navy, fontSize: 14 }}>{title}</strong>
        <ExternalLink size={12} color={tokens.color.textMuted} style={{ marginLeft: 'auto' }} />
      </div>
      <p style={{ fontSize: 13, color: tokens.color.textMuted, margin: 0, lineHeight: 1.5 }}>{body}</p>
    </a>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: tokens.color.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' };
