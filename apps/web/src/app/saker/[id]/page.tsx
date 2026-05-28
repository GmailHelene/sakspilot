'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, isTokenValid, ApiError, getToken } from '@/lib/api';

// ── Typer ────────────────────────────────────────────────────────
type SakStatus =
  | 'ikke_pabegynt'
  | 'pagaaende'
  | 'venter_kunde'
  | 'venter_3part'
  | 'ferdig'
  | 'arkivert';

type MatchingRuleType = 'title' | 'path' | 'app' | 'email';

interface MatchingRule {
  id: string;
  type: MatchingRuleType;
  pattern: string;
  priority: number;
  enabled: boolean;
}

interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  completedAt: string | null;
  notifyDaysBefore: number;
}

interface Sak {
  id: string;
  title: string;
  status: SakStatus;
  saksnummer: string | null;
  description: string | null;
  deadline: string | null;
  hourlyRate: number | null;
  folderPath: string | null;
  createdAt: string;
  closedAt: string | null;
  client: { id: string; name: string } | null;
  matchingRules: MatchingRule[];
  milestones: Milestone[];
  _count: { timeEntries: number; emailLinks: number };
}

interface TimeSummary {
  entryCount: number;
  totalHours: number;
  billableHours: number;
  totalAmount: number;
  lastEntryAt: string | null;
}

const STATUS_OPTIONS: { value: SakStatus; label: string; color: string }[] = [
  { value: 'ikke_pabegynt', label: 'Ikke påbegynt', color: '#94A3B8' },
  { value: 'pagaaende', label: 'Pågår', color: '#2D6A4F' },
  { value: 'venter_kunde', label: 'Venter på kunde', color: '#E9C46A' },
  { value: 'venter_3part', label: 'Venter på 3.part', color: '#D4A017' },
  { value: 'ferdig', label: 'Ferdig', color: '#1E3A5F' },
  { value: 'arkivert', label: 'Arkivert', color: '#CBD5E1' },
];

const RULE_TYPE_LABELS: Record<MatchingRuleType, string> = {
  title: 'Vindustittel',
  path: 'Filsti',
  app: 'Applikasjon',
  email: 'E-postavsender',
};

// ── Komponent ────────────────────────────────────────────────────
export default function SakDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sakId = params.id;

  const [sak, setSak] = useState<Sak | null>(null);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, sum] = await Promise.all([
        api<Sak>(`/saker/${sakId}`),
        api<TimeSummary>(`/saker/${sakId}/time-summary`),
      ]);
      setSak(s);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
    }
  }, [sakId]);

  useEffect(() => {
    if (!isTokenValid()) {
      router.replace('/login');
      return;
    }
    refresh();
  }, [router, refresh]);

  async function handleStatusChange(newStatus: SakStatus) {
    await api(`/saker/${sakId}`, { method: 'PATCH', body: { status: newStatus } });
    refresh();
  }

  async function handleDelete() {
    if (
      !confirm(
        'Sletter saken permanent. Time-entries beholdes (frikoblet). Sikker?'
      )
    )
      return;
    await api(`/saker/${sakId}`, { method: 'DELETE' });
    router.push('/saker');
  }

  if (error) {
    return (
      <>
        <Header />
        <main style={pageStyle}>
          <div style={{ padding: 24, color: tokens.color.red }}>Feil: {error}</div>
        </main>
      </>
    );
  }

  if (!sak) {
    return (
      <>
        <Header />
        <main style={pageStyle}>
          <div style={{ padding: 24, color: tokens.color.textMuted }}>Henter sak…</div>
        </main>
      </>
    );
  }

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === sak.status)!;

  return (
    <>
      <Header />
      <main style={pageStyle}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
          <Link
            href="/saker"
            style={{ color: tokens.color.textMuted, fontSize: 14, display: 'inline-block', marginBottom: 12 }}
          >
            ← Tilbake til saker
          </Link>

          {/* ── Hovedheader ── */}
          <div
            style={{
              background: tokens.color.white,
              padding: 24,
              borderRadius: tokens.radius.lg,
              border: `1px solid ${tokens.color.border}`,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 280 }}>
                <h1 style={{ fontSize: 26, color: tokens.color.navy, marginBottom: 8 }}>
                  {sak.title}
                </h1>
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    fontSize: 14,
                    color: tokens.color.textMuted,
                    flexWrap: 'wrap',
                  }}
                >
                  {sak.client && <span>👤 {sak.client.name}</span>}
                  {sak.saksnummer && <span># {sak.saksnummer}</span>}
                  {sak.hourlyRate && (
                    <span>💰 {sak.hourlyRate.toLocaleString('nb-NO')} kr/t</span>
                  )}
                  {sak.deadline && (
                    <span>
                      📅 frist {new Date(sak.deadline).toLocaleDateString('nb-NO')}
                    </span>
                  )}
                </div>
                {sak.folderPath && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: tokens.color.textSubtle,
                      fontFamily: tokens.font.mono,
                    }}
                  >
                    📁 {sak.folderPath}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <select
                  value={sak.status}
                  onChange={(e) => handleStatusChange(e.target.value as SakStatus)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: tokens.radius.sm,
                    border: `2px solid ${statusOpt.color}`,
                    background: tokens.color.white,
                    fontWeight: 600,
                    fontSize: 13,
                    color: statusOpt.color,
                    cursor: 'pointer',
                  }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleDelete}
                  style={{
                    fontSize: 12,
                    color: tokens.color.red,
                    padding: '4px 8px',
                  }}
                >
                  Slett sak
                </button>
              </div>
            </div>

            {sak.description && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: `1px solid ${tokens.color.border}`,
                  whiteSpace: 'pre-wrap',
                  color: tokens.color.text,
                  fontSize: 14,
                }}
              >
                {sak.description}
              </div>
            )}
          </div>

          {/* ── Tidssammendrag ── */}
          <SectionCard title="Tidssammendrag">
            {summary && summary.entryCount > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                <Stat label="Total tid" value={`${summary.totalHours.toFixed(1)} t`} />
                <Stat label="Fakturerbart" value={`${summary.billableHours.toFixed(1)} t`} />
                <Stat
                  label="Estimert beløp"
                  value={
                    summary.totalAmount > 0
                      ? `${summary.totalAmount.toLocaleString('nb-NO')} kr`
                      : '—'
                  }
                />
                <Stat label="Entries" value={String(summary.entryCount)} />
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: 24,
                  color: tokens.color.textMuted,
                  fontSize: 14,
                }}
              >
                Ingen tid logget enda. Installer desktop-agenten — den fyller dette automatisk
                når den oppdager at du jobber på saken (matching-regler avgjør koblingen).
              </div>
            )}
          </SectionCard>

          {/* ── Tidsregistreringer ── */}
          {summary && summary.entryCount > 0 && (
            <TimeEntriesSection sakId={sak.id} sakTitle={sak.title} />
          )}

          {/* ── Matching-regler ── */}
          <MatchingRulesSection sak={sak} onChange={refresh} />

          {/* ── Frister ── */}
          <MilestonesSection sak={sak} onChange={refresh} />

          {/* ── Metadata ── */}
          <div
            style={{
              padding: 12,
              fontSize: 12,
              color: tokens.color.textSubtle,
              textAlign: 'center',
            }}
          >
            Opprettet {new Date(sak.createdAt).toLocaleString('nb-NO')}
            {sak.closedAt &&
              ` · Avsluttet ${new Date(sak.closedAt).toLocaleString('nb-NO')}`}
          </div>
        </div>
      </main>
    </>
  );
}

// ── Underkomponenter ─────────────────────────────────────────────

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: tokens.color.white,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${tokens.color.border}`,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${tokens.color.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ fontSize: 16, color: tokens.color.navy }}>{title}</h2>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tokens.color.navy }}>{value}</div>
    </div>
  );
}

// ── Matching-regler ──────────────────────────────────────────────

// Maler for matching-regler — klikk for å pre-utfylle skjemaet.
// Noen er sak-spesifikke (genereres dynamisk fra sak.title / folderPath),
// andre er generelle (matcher alle dokumenter av en gitt type).
function buildRuleTemplates(sak: Sak) {
  // Stopp-ord vi IKKE bruker som matching-nøkkel (for generiske)
  const STOPWORDS = new Set([
    'sak', 'prosjekt', 'oppdrag', 'jobb', 'kunde', 'klient',
    'for', 'til', 'og', 'i', 'av', 'med', 'fra', 'om', 'på',
    'en', 'et', 'den', 'det', 'de', 'eller',
  ]);

  // Escape regex-spesialtegn og legg til norsk-bokstav-toleranse
  function prepareWord(w: string): string {
    return w
      .toLowerCase()
      .replace(/[.\\+*?^$()|[\]{}]/g, '\\$&') // escape regex-spesialtegn
      .replace(/ø/g, '[øo]')
      .replace(/æ/g, '[æae]')
      .replace(/å/g, '[åa]');
  }

  // Plukk meningsfulle ord fra tittel (før bindestrek), filtrer stopp-ord
  const significantWords = sak.title
    .replace(/[—–-].+$/, '')
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .slice(0, 4)
    .map(prepareWord);

  // FLEKSIBEL pattern (anbefalt): bruker lookahead — alle ord må finnes,
  // i HVILKEN SOM HELST rekkefølge, med hva som helst mellom.
  //   "Bygdøy 12 — rammetillatelse" → "(?=.*bygd[øo]y)(?=.*12).*"
  //   matcher: "Bygdoy-12.docx", "12 Bygdoy.docx", "Tegning Bygdoy nr 12.dwg"
  // Faller tilbake til substring hvis kun ett meningsfullt ord.
  let autoFlexPattern: string;
  if (significantWords.length === 0) {
    autoFlexPattern = sak.title.slice(0, 20).toLowerCase();
  } else if (significantWords.length === 1) {
    autoFlexPattern = significantWords[0];
  } else {
    autoFlexPattern = significantWords.map((w) => `(?=.*${w})`).join('') + '.*';
  }

  // STRENG pattern (gammel): ord i rekkefølge med separator
  // Brukes som "Auto streng"-alternativ + i andre maler som trenger
  // substring (VS Code, GitHub osv.)
  const titleWords = significantWords.join('[\\s\\-_]*') || sak.title.slice(0, 20).toLowerCase();

  return [
    {
      id: 'auto-title-flex',
      label: '⚡ Auto: match sakens navn (fleksibel)',
      type: 'title' as const,
      pattern: autoFlexPattern,
      hint: `Matcher uansett rekkefølge — f.eks. "${significantWords.join(' ')}" treffer både "${significantWords.join('-')}.docx", "${[...significantWords].reverse().join(' ')}.dwg" og "Notater om ${significantWords.join(' ')}.pdf"`,
    },
    {
      id: 'auto-title-strict',
      label: '🎯 Auto: streng match (ord i rekkefølge)',
      type: 'title' as const,
      pattern: titleWords,
      hint: 'Krever ordene i samme rekkefølge med kun mellomrom/bindestrek/understrek mellom — færre falske treff',
    },
    {
      id: 'folder',
      label: '📁 Filer i lokal sak-mappe',
      type: 'path' as const,
      pattern: sak.folderPath
        ? sak.folderPath.replace(/[/\\]/g, '[\\\\/]').replace(/\./g, '\\.')
        : 'C:\\\\Jobb\\\\Sak-mappe',
      hint: sak.folderPath ? `Bruker saken sin mappe-sti` : 'Sett "Lokal mappe" på saken først',
      disabled: !sak.folderPath,
    },
    {
      id: 'word',
      label: '📄 Word-dokumenter (alle .docx)',
      type: 'title' as const,
      pattern: '\\.docx?\\b',
      hint: 'Match enhver Word-fil — bredt, kombineres med spesifikk regel',
    },
    {
      id: 'excel',
      label: '📊 Excel-ark (alle .xlsx)',
      type: 'title' as const,
      pattern: '\\.xlsx?\\b',
      hint: 'Match enhver Excel-fil',
    },
    {
      id: 'pdf',
      label: '📕 PDF-filer',
      type: 'title' as const,
      pattern: '\\.pdf\\b',
      hint: 'Match enhver PDF-visning',
    },
    {
      id: 'autocad',
      label: '📐 AutoCAD-tegning (.dwg)',
      type: 'title' as const,
      pattern: '\\.dwg\\b',
      hint: 'For arkitekter/byggekonsulenter',
    },
    {
      id: 'outlook',
      label: '📧 Outlook (hele appen)',
      type: 'app' as const,
      pattern: '^outlook',
      hint: 'All tid i Outlook teller — kombiner med e-postregel for sak-spesifikt',
    },
    {
      id: 'email-subject',
      label: '📧 E-post om saken (emne)',
      type: 'title' as const,
      pattern: titleWords.split('[\\s\\-_]*').slice(0, 2).join('.*'),
      hint: 'Outlook-vinduer med saksrelaterte emner',
    },
    {
      id: 'holte',
      label: '🏢 Holte (smart.holte.no)',
      type: 'title' as const,
      pattern: 'holte|byggsoek',
      hint: 'Nettleser-tab med Holte-portalen',
    },
    {
      id: 'tripletex',
      label: '💼 Tripletex',
      type: 'title' as const,
      pattern: 'tripletex',
      hint: 'Tid logget i Tripletex',
    },
    {
      id: 'fiken',
      label: '💼 Fiken',
      type: 'title' as const,
      pattern: 'fiken',
      hint: 'Tid logget i Fiken',
    },

    // ─── For utviklere / freelance designere ───
    {
      id: 'vscode',
      label: '💻 VS Code / Cursor (auto fra sakens navn)',
      type: 'title' as const,
      pattern: titleWords + '.*\\b(Visual Studio Code|Cursor)\\b',
      hint: 'Editor-vinduer som har sakens navn i tittel — mappenavn eller fil',
    },
    {
      id: 'github',
      label: '🐙 GitHub-repo (browser-tab)',
      type: 'title' as const,
      pattern: titleWords + '.*github',
      hint: 'Chrome-tab på GitHub repo som matcher sakens navn',
    },
    {
      id: 'wp-admin',
      label: '🌐 WordPress-admin for klient',
      type: 'title' as const,
      pattern: '(wp-admin|wordpress).*' + titleWords,
      hint: 'For freelance WP-arbeid — Chrome-tab på klientens wp-admin',
    },
    {
      id: 'figma',
      label: '🎨 Figma med sakens navn',
      type: 'title' as const,
      pattern: titleWords + '.*figma|figma.*' + titleWords,
      hint: 'Designarbeid i Figma',
    },
    {
      id: 'terminal',
      label: '⌨️  Terminal i sak-mappa',
      type: 'title' as const,
      pattern: '(Windows Terminal|PowerShell|cmd).*' + (sak.folderPath?.split(/[\\/]/).pop()?.toLowerCase() || titleWords),
      hint: sak.folderPath ? 'Terminal med mappenavn i tittel' : 'Sett folderPath for bedre treff',
    },
    {
      id: 'claude-code',
      label: '🤖 Claude Code (i sak-mappa)',
      type: 'title' as const,
      pattern: 'Claude.*' + titleWords,
      hint: 'Claude Code-økt for denne saken',
    },
    {
      id: 'teams-meet',
      label: '📞 Teams-møte med klient',
      type: 'title' as const,
      pattern: titleWords + '.*(Teams|Møte|Meeting)',
      hint: 'Møtevinduer med klient-navn i tittel',
    },
    {
      id: 'browser-domain',
      label: '🌐 Browser på klient-domene',
      type: 'title' as const,
      pattern: '\\b' + titleWords.split('[\\s\\-_]*')[0] + '\\.no\\b',
      hint: 'Chrome-tab på klientens nettside (sett klient-domene manuelt for spesifikk treff)',
    },
  ];
}

function MatchingRulesSection({ sak, onChange }: { sak: Sak; onChange: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<MatchingRuleType>('title');
  const [pattern, setPattern] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const templates = buildRuleTemplates(sak);

  function useTemplate(t: typeof templates[number]) {
    if (t.disabled) return;
    setType(t.type);
    setPattern(t.pattern);
    setShowTemplates(false);
    setShowForm(true);
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(`/saker/${sak.id}/matching-rules`, {
        method: 'POST',
        body: { type, pattern: pattern.trim() },
      });
      setPattern('');
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm('Sletter regelen?')) return;
    await api(`/saker/${sak.id}/matching-rules/${ruleId}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <SectionCard
      title={`Matching-regler for desktop-agent (${sak.matchingRules.length})`}
      action={
        !showForm && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              style={{
                color: tokens.color.navy,
                fontWeight: 600,
                fontSize: 13,
                padding: '6px 10px',
                borderRadius: tokens.radius.sm,
                background: tokens.color.bgAlt,
              }}
            >
              {showTemplates ? '✕ Lukk maler' : '⚡ Velg mal'}
            </button>
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
              + Manuell regel
            </button>
          </div>
        )
      }
    >
      <div
        style={{
          background: tokens.color.bgAlt,
          padding: 12,
          borderRadius: tokens.radius.sm,
          fontSize: 13,
          color: tokens.color.textMuted,
          marginBottom: showForm || showTemplates || sak.matchingRules.length > 0 ? 16 : 0,
        }}
      >
        💡 Når desktop-agenten ser et vindu som matcher en av reglene under,
        kobles tiden automatisk til denne saken. Klikk <strong>⚡ Velg mal</strong>{' '}
        for vanlige mønstre (Word, Outlook, sakens navn, etc.), eller{' '}
        <strong>+ Manuell regel</strong> for full regex-kontroll.
      </div>

      {showTemplates && (
        <div
          style={{
            background: tokens.color.bg,
            padding: 12,
            borderRadius: tokens.radius.md,
            marginBottom: 16,
            border: `1px solid ${tokens.color.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: tokens.color.navy,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 10,
            }}
          >
            Maler — klikk for å bruke
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => useTemplate(t)}
                disabled={t.disabled}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: t.disabled ? tokens.color.bgAlt : tokens.color.white,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.sm,
                  cursor: t.disabled ? 'not-allowed' : 'pointer',
                  opacity: t.disabled ? 0.5 : 1,
                  gap: 2,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: tokens.color.text }}>
                  {t.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: tokens.color.textMuted,
                    fontFamily: tokens.font.mono,
                  }}
                >
                  {t.type} · {t.pattern.length > 60 ? t.pattern.slice(0, 60) + '…' : t.pattern}
                </div>
                <div style={{ fontSize: 11, color: tokens.color.textSubtle }}>{t.hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={addRule}
          style={{
            background: tokens.color.bg,
            padding: 16,
            borderRadius: tokens.radius.md,
            marginBottom: 16,
            display: 'grid',
            gap: 10,
          }}
        >
          {error && (
            <div style={{ color: tokens.color.red, fontSize: 13 }}>{error}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MatchingRuleType)}
              style={inputStyle}
            >
              <option value="title">Vindustittel</option>
              <option value="path">Filsti</option>
              <option value="app">Applikasjon</option>
              <option value="email">E-postavsender</option>
            </select>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Regex-mønster, f.eks. bygd[øo]y[\s\-_]*12"
              style={{ ...inputStyle, fontFamily: tokens.font.mono }}
              required
              autoFocus
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
              {saving ? 'Lagrer…' : 'Lagre regel'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setPattern('');
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

      {sak.matchingRules.length === 0 && !showForm ? (
        <div style={{ color: tokens.color.textSubtle, fontSize: 13, padding: '8px 0' }}>
          Ingen regler enda. Desktop-agenten kobler ikke tid til denne saken automatisk
          før du har lagt til minst én regel.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {sak.matchingRules.map((rule) => (
            <div
              key={rule.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: tokens.color.bg,
                borderRadius: tokens.radius.sm,
                border: `1px solid ${tokens.color.border}`,
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: tokens.color.navy,
                    color: tokens.color.white,
                    minWidth: 90,
                    textAlign: 'center',
                  }}
                >
                  {RULE_TYPE_LABELS[rule.type]}
                </span>
                <code style={{ ...inlineCodeStyle, fontSize: 13 }}>{rule.pattern}</code>
              </div>
              <button
                onClick={() => deleteRule(rule.id)}
                style={{
                  fontSize: 12,
                  color: tokens.color.red,
                  padding: '4px 8px',
                }}
              >
                Slett
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Frister ──────────────────────────────────────────────────────

function MilestonesSection({ sak, onChange }: { sak: Sak; onChange: () => void }) {
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
                      <span style={{ color: tokens.color.gold, fontWeight: 600 }}>
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

// ── TimeEntriesSection ───────────────────────────────────────────

interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  windowTitle: string | null;
  appName: string | null;
  note: string | null;
  billable: boolean;
  hourlyRate: number | null;
  user: { id: string; name: string | null; email: string };
}

function TimeEntriesSection({ sakId, sakTitle }: { sakId: string; sakTitle: string }) {
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sakId]);

  async function loadEntries() {
    try {
      const r = await api<{ entries: TimeEntry[]; total: number }>(
        `/saker/${sakId}/time-entries?limit=20`
      );
      setEntries(r.entries);
      setTotal(r.total);
    } catch {
      // ignorer — vises som tom
    }
  }

  async function downloadCsv() {
    setDownloading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/saker/${sakId}/time-entries.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Eksport feilet (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tid-${sakTitle.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 40)}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (!entries || entries.length === 0) return null;

  const visibleEntries = expanded ? entries : entries.slice(0, 5);

  return (
    <SectionCard
      title={`Tidsregistreringer (${total})`}
      action={
        <button
          onClick={downloadCsv}
          disabled={downloading}
          style={{
            background: 'transparent',
            border: `1px solid ${tokens.color.border}`,
            padding: '6px 12px',
            borderRadius: tokens.radius.sm,
            fontSize: 12,
            cursor: 'pointer',
            color: tokens.color.navy,
            fontWeight: 500,
          }}
        >
          {downloading ? 'Genererer…' : '⬇ Last ned CSV'}
        </button>
      }
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
            <th style={teThStyle}>Dato</th>
            <th style={teThStyle}>Varighet</th>
            <th style={teThStyle}>App / vindu</th>
            <th style={{ ...teThStyle, textAlign: 'right' }}>Beløp</th>
          </tr>
        </thead>
        <tbody>
          {visibleEntries.map((e) => {
            const hours = e.durationSec / 3600;
            const amount =
              e.billable && e.hourlyRate ? Math.round(hours * e.hourlyRate) : 0;
            return (
              <tr key={e.id} style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                <td style={teTdStyle}>
                  <div>{new Date(e.startedAt).toLocaleDateString('nb-NO')}</div>
                  <div style={{ fontSize: 11, color: tokens.color.textSubtle }}>
                    {new Date(e.startedAt).toLocaleTimeString('nb-NO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' – '}
                    {new Date(e.endedAt).toLocaleTimeString('nb-NO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </td>
                <td style={{ ...teTdStyle, fontVariantNumeric: 'tabular-nums' }}>
                  {hours.toFixed(2)} t
                </td>
                <td style={{ ...teTdStyle, color: tokens.color.textMuted, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${e.appName || ''} ${e.windowTitle || ''}`}>
                  {e.appName || '—'}
                  {e.windowTitle && (
                    <div style={{ fontSize: 11, color: tokens.color.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.windowTitle}
                    </div>
                  )}
                </td>
                <td
                  style={{
                    ...teTdStyle,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: amount > 0 ? tokens.color.navy : tokens.color.textSubtle,
                    fontWeight: amount > 0 ? 600 : 400,
                  }}
                >
                  {amount > 0 ? `${amount.toLocaleString('nb-NO')} kr` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {entries.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: 'none',
            color: tokens.color.navy,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            padding: '4px 8px',
          }}
        >
          {expanded ? '↑ Vis færre' : `↓ Vis alle (${entries.length})`}
        </button>
      )}
      {total > entries.length && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: tokens.color.textSubtle,
            textAlign: 'center',
          }}
        >
          Viser de {entries.length} nyeste · last ned CSV for full historikk
        </div>
      )}
    </SectionCard>
  );
}

const teThStyle: React.CSSProperties = {
  padding: '8px 0',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: tokens.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const teTdStyle: React.CSSProperties = {
  padding: '10px 8px 10px 0',
  fontSize: 13,
  verticalAlign: 'top',
};

// ── Felles stiler ────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: 'calc(100vh - 60px)',
  background: tokens.color.bg,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.color.border}`,
  fontSize: 14,
  background: tokens.color.white,
};

const inlineCodeStyle: React.CSSProperties = {
  fontFamily: tokens.font.mono,
  background: tokens.color.white,
  padding: '2px 6px',
  borderRadius: 4,
  border: `1px solid ${tokens.color.border}`,
  fontSize: 12,
  color: tokens.color.text,
};
