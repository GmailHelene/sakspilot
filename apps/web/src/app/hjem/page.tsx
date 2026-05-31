'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckSquare, CalendarClock, Clock, Briefcase, Bookmark,
  Plus, ArrowRight, TrendingUp, Play, Settings2, EyeOff, Eye,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import GoalProgressWidget from '@/components/GoalProgressWidget';
import AiTriageWidget from '@/components/AiTriageWidget';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface Sak {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  hourlyRate: number | null;
  createdAt: string;
  client: { id: string; name: string } | null;
  _count: { timeEntries: number; milestones: number };
}

interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  completedAt: string | null;
}

type MilestoneWithSak = Milestone & { sakId: string; sakTitle: string };

interface Me {
  name: string;
  organizationName: string;
}

interface Stats {
  activeSaker: number;
  upcomingMilestones: MilestoneWithSak[];
  todayMilestones: MilestoneWithSak[];
  overdueMilestones: MilestoneWithSak[];
  recentSaker: Sak[];
  totalHoursThisWeek: number;
  weekRevenue: number;
  activeAutomations: number;
  emailsThisWeek: number;
}

// Hvilke widgets kan brukeren skjule? Lagres i localStorage.
const WIDGET_HIDDEN_KEY = 'sakspilot_hjem_hidden_widgets';
type WidgetId = 'frister' | 'recent' | 'quick' | 'tips' | 'minikpi' | 'tidsmal' | 'aitriage';

export default function HjemPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [hidden, setHidden] = useState<Set<WidgetId>>(new Set());
  const [isDesktop, setIsDesktop] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    loadDashboard();
    try {
      const stored = localStorage.getItem(WIDGET_HIDDEN_KEY);
      if (stored) setHidden(new Set(JSON.parse(stored) as WidgetId[]));
    } catch {}
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setIsDesktop(Boolean((window as any).sakspilot?.isDesktop));
    }
  }, []);

  function toggleWidget(id: WidgetId) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(WIDGET_HIDDEN_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  async function startWorkSession() {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).sakspilot;
    if (!api?.isDesktop || !api.startWorkSession) {
      alert(
        'Tidsregistrering krever Sakspilot Desktop (.exe-versjonen). Last ned fra hjelp-menyen — i nettleseren kan vi ikke se hva du jobber på.'
      );
      return;
    }
    setStarting(true);
    try {
      await api.startWorkSession();
    } finally {
      setStarting(false);
    }
  }

  async function loadDashboard() {
    try {
      // ÉN aggregert API-kall i stedet for 60+ (eliminerer N+1)
      const [meRes, home] = await Promise.all([
        api<Me>('/auth/me'),
        api<{
          activeSaker: number;
          weekHours: number;
          weekRevenue: number;
          todayMilestones: MilestoneWithSak[];
          overdueMilestones: MilestoneWithSak[];
          upcomingMilestones: MilestoneWithSak[];
          recentSaker: Sak[];
          activeAutomations: number;
          emailsThisWeek: number;
        }>('/reports/home'),
      ]);
      setMe(meRes);
      setStats({
        activeSaker: home.activeSaker,
        upcomingMilestones: home.upcomingMilestones,
        todayMilestones: home.todayMilestones,
        overdueMilestones: home.overdueMilestones,
        recentSaker: home.recentSaker,
        totalHoursThisWeek: home.weekHours,
        weekRevenue: home.weekRevenue,
        activeAutomations: home.activeAutomations,
        emailsThisWeek: home.emailsThisWeek,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    }
  }

  const greeting = getGreeting();

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
        {/* Hilsen + handlinger */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 4 }}>
              {greeting}{me?.name ? `, ${me.name.split(' ')[0]}` : ''}!
            </h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14 }}>
              {me?.organizationName || 'Velkommen tilbake'} · {new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={startWorkSession}
              disabled={starting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: tokens.gradient.navy,
                color: 'white',
                border: 'none',
                borderRadius: tokens.radius.md,
                fontSize: 14,
                fontWeight: 600,
                cursor: starting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                opacity: starting ? 0.7 : 1,
              }}
              title={isDesktop ? 'Start passiv tidsregistrering' : 'Krever Sakspilot Desktop'}
            >
              <Play size={16} strokeWidth={2.5} />
              {starting ? 'Starter…' : 'Start arbeidsøkt'}
            </button>
            <button
              onClick={() => setCustomizing((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 12px',
                background: customizing ? tokens.color.navy : 'white',
                color: customizing ? 'white' : tokens.color.navy,
                border: `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Settings2 size={14} strokeWidth={2} />
              {customizing ? 'Ferdig' : 'Tilpass'}
            </button>
          </div>
        </div>

        {customizing && (
          <div
            style={{
              padding: 14,
              background: tokens.color.bgAlt,
              borderRadius: tokens.radius.md,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.navy, marginBottom: 10 }}>
              Hvilke widgets vil du vise?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                ['minikpi', 'Omsetning / Agenter / E-poster'],
                ['tidsmal', 'Tidsmål'],
                ['aitriage', 'AI-kategorisering'],
                ['frister', 'Kommende frister'],
                ['recent', 'Nylige prosjekter'],
                ['quick', 'Hurtighandlinger'],
                ['tips', 'Tips for dagen'],
              ] as Array<[WidgetId, string]>).map(([id, label]) => {
                const isHidden = hidden.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleWidget(id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      background: isHidden ? 'white' : tokens.color.navy,
                      color: isHidden ? tokens.color.textMuted : 'white',
                      border: `1px solid ${isHidden ? tokens.color.border : tokens.color.navy}`,
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: 16, background: '#FEE2E2', color: '#7F1D1D', borderRadius: tokens.radius.sm, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* KPI-kort på toppen */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <KPICard
            icon={<Briefcase size={20} strokeWidth={2} />}
            label="Aktive prosjekter"
            value={stats?.activeSaker ?? '—'}
            href="/saker"
            color={tokens.color.navy}
          />
          <KPICard
            icon={<Clock size={20} strokeWidth={2} />}
            label="Timer denne uka"
            value={stats ? `${stats.totalHoursThisWeek} t` : '—'}
            href="/saker"
            color={tokens.color.green}
          />
          <KPICard
            icon={<CalendarClock size={20} strokeWidth={2} />}
            label="Frister i dag"
            value={stats?.todayMilestones.length ?? '—'}
            href="/kalender"
            color={tokens.color.gold}
          />
          <KPICard
            icon={<TrendingUp size={20} strokeWidth={2} />}
            label="Forsinket"
            value={stats?.overdueMilestones.length ?? '—'}
            href="/kalender"
            color={stats && stats.overdueMilestones.length > 0 ? tokens.color.red : tokens.color.textSubtle}
          />
        </div>

        {/* Sekundære KPIer */}
        {!hidden.has('minikpi') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <MiniKpi
            label="Omsetning denne uka"
            value={stats ? `${stats.weekRevenue.toLocaleString('nb-NO')} kr` : '—'}
            color={tokens.color.gold}
          />
          <MiniKpi
            label="Aktive agenter"
            value={stats?.activeAutomations ?? '—'}
            color={tokens.color.purple}
          />
          <MiniKpi
            label="E-poster denne uka"
            value={stats?.emailsThisWeek ?? '—'}
            color={tokens.color.blue}
          />
        </div>
        )}

        {/* Hoved-widgets */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 16,
          }}
        >
          {/* Frister i dag og denne uka */}
          {!hidden.has('frister') && (
          <Widget
            title="Kommende frister"
            icon={<CalendarClock size={18} strokeWidth={2} />}
            action={<Link href="/kalender" style={linkStyle}>Se kalender →</Link>}
          >
            {!stats ? (
              <Skeleton />
            ) : stats.todayMilestones.length === 0 && stats.upcomingMilestones.length === 0 && stats.overdueMilestones.length === 0 ? (
              <EmptyMessage text="Ingen frister de neste 7 dagene 🌴" />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {stats.overdueMilestones.slice(0, 3).map((m) => (
                  <MilestoneRow key={m.id} milestone={m} status="overdue" />
                ))}
                {stats.todayMilestones.map((m) => (
                  <MilestoneRow key={m.id} milestone={m} status="today" />
                ))}
                {stats.upcomingMilestones.slice(0, 6).map((m) => (
                  <MilestoneRow key={m.id} milestone={m} status="upcoming" />
                ))}
              </div>
            )}
          </Widget>
          )}

          {/* Nylige prosjekter */}
          {!hidden.has('recent') && (
          <Widget
            title="Nylige prosjekter"
            icon={<Briefcase size={18} strokeWidth={2} />}
            action={<Link href="/saker" style={linkStyle}>Se alle →</Link>}
          >
            {!stats ? (
              <Skeleton />
            ) : stats.recentSaker.length === 0 ? (
              <EmptyMessage
                text="Ingen prosjekter enda"
                action={<Link href="/saker/ny" style={primaryLinkStyle}>+ Opprett ditt første prosjekt</Link>}
              />
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {stats.recentSaker.map((s) => (
                  <Link
                    key={s.id}
                    href={`/saker/${s.id}`}
                    style={sakRowStyle}
                  >
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: tokens.color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: 12, color: tokens.color.textMuted, marginTop: 2 }}>
                        {s.client?.name || 'Internt prosjekt'}
                        {s.deadline && ` · Frist ${new Date(s.deadline).toLocaleDateString('nb-NO')}`}
                      </div>
                    </div>
                    <ArrowRight size={14} strokeWidth={2} style={{ color: tokens.color.textSubtle, flexShrink: 0 }} />
                  </Link>
                ))}
              </div>
            )}
          </Widget>
          )}

          {/* Hurtighandlinger */}
          {!hidden.has('quick') && (
          <Widget
            title="Hurtighandlinger"
            icon={<Plus size={18} strokeWidth={2} />}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <QuickAction href="/saker/ny" icon={<Briefcase size={16} strokeWidth={2} />} label="Nytt prosjekt" />
              <QuickAction href="/klienter/ny" icon={<Plus size={16} strokeWidth={2} />} label="Ny klient" />
              <QuickAction href="/kalender" icon={<CalendarClock size={16} strokeWidth={2} />} label="Se kalender" />
              <QuickAction href="/gantt" icon={<TrendingUp size={16} strokeWidth={2} />} label="Tidslinje" />
            </div>
          </Widget>
          )}

          {/* Tidsmål — uke/mnd-progress */}
          {!hidden.has('tidsmal') && <GoalProgressWidget />}

          {/* AI-kategorisering — forslag fra Claude på ukategoriserte entries */}
          {!hidden.has('aitriage') && <AiTriageWidget />}

          {/* Tips for dagen */}
          {!hidden.has('tips') && (
          <Widget
            title="Tips for dagen"
            icon={<Bookmark size={18} strokeWidth={2} />}
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <Tip>
                <strong>Start arbeidsøkten</strong> i Sakspilot Desktop (tray-ikonet) når du setter deg ned for å jobbe — så fanges alt automatisk.
              </Tip>
              <Tip>
                <strong>Bruk launcheren</strong> til venstre for å åpne Tripletex, Outlook, Holte og andre apper med ett klikk.
              </Tip>
              {stats && stats.overdueMilestones.length > 0 && (
                <Tip warning>
                  Du har <strong>{stats.overdueMilestones.length} forsinkede frister</strong>. Sjekk{' '}
                  <Link href="/kalender" style={{ color: tokens.color.red, fontWeight: 600 }}>kalenderen</Link>.
                </Tip>
              )}
            </div>
          </Widget>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Hjelpe-komponenter ──────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'God natt';
  if (h < 10) return 'God morgen';
  if (h < 12) return 'God formiddag';
  if (h < 17) return 'God ettermiddag';
  if (h < 22) return 'God kveld';
  return 'God natt';
}

function KPICard({ icon, label, value, href, color }: {
  icon: React.ReactNode; label: string; value: string | number; href: string; color: string;
}) {
  return (
    <Link
      href={href}
      style={{
        background: tokens.color.surface,
        padding: 16,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${tokens.color.border}`,
        textDecoration: 'none',
        display: 'block',
        transition: 'transform 0.1s, box-shadow 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 12, color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: tokens.color.navy }}>{value}</div>
    </Link>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div
      style={{
        background: tokens.color.surface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        padding: 14,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 11, color: tokens.color.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tokens.color.navy, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

function Widget({ title, icon, action, children }: {
  title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      border: `1px solid ${tokens.color.border}`,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${tokens.color.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tokens.color.navy }}>
          {icon}
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function MilestoneRow({ milestone, status }: {
  milestone: Milestone & { sakId: string; sakTitle: string };
  status: 'overdue' | 'today' | 'upcoming';
}) {
  const colors = {
    overdue: { bg: '#FEE2E2', text: tokens.color.red, label: 'Forsinket' },
    today: { bg: '#FEF3C7', text: tokens.color.gold, label: 'I dag' },
    upcoming: { bg: tokens.color.bgAlt, text: tokens.color.textMuted, label: '' },
  }[status];

  const due = new Date(milestone.dueDate);
  const dateLabel = status === 'today'
    ? 'I dag'
    : status === 'overdue'
      ? `${Math.ceil((Date.now() - due.getTime()) / 86400000)} dager siden`
      : due.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Link
      href={`/saker/${milestone.sakId}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 12px',
        background: colors.bg,
        borderRadius: tokens.radius.sm,
        textDecoration: 'none',
        color: tokens.color.text,
        borderLeft: `3px solid ${colors.text}`,
      }}
    >
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {milestone.title}
        </div>
        <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>
          {milestone.sakTitle}
        </div>
      </div>
      <div style={{ fontSize: 11, color: colors.text, fontWeight: 600, marginLeft: 8, whiteSpace: 'nowrap' }}>
        {dateLabel}
      </div>
    </Link>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: tokens.color.bgAlt,
        borderRadius: tokens.radius.sm,
        color: tokens.color.text,
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ color: tokens.color.navy }}>{icon}</span>
      {label}
    </Link>
  );
}

function Tip({ children, warning = false }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <div style={{
      padding: 12,
      background: warning ? '#FEE2E2' : '#FFF8E1',
      borderRadius: tokens.radius.sm,
      fontSize: 13,
      color: tokens.color.text,
      borderLeft: `3px solid ${warning ? tokens.color.red : tokens.color.gold}`,
      lineHeight: 1.4,
    }}>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: 24, color: tokens.color.textMuted, fontSize: 13, textAlign: 'center' }}>
      Henter…
    </div>
  );
}

function EmptyMessage({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: 16, textAlign: 'center', color: tokens.color.textMuted, fontSize: 13 }}>
      {text}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.color.navy,
  fontWeight: 600,
  textDecoration: 'none',
};

const primaryLinkStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 14px',
  background: tokens.color.navy,
  color: tokens.color.white,
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
};

const sakRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  background: tokens.color.bg,
  borderRadius: tokens.radius.sm,
  textDecoration: 'none',
  color: tokens.color.text,
};
