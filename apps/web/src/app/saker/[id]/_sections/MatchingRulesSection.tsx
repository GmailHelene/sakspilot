'use client';

/**
 * Matching-regler for desktop-agent, knytter automatisk vinduer/filer/e-poster
 * til denne saken. Inkluderer en stor liste med maler (templates) som
 * pre-utfyller skjemaet med fornuftige regex-mønstre.
 */

import { useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';
import {
  SectionCard,
  inputStyle,
  inlineCodeStyle,
  type Sak,
  type MatchingRuleType,
} from './_shared';

const RULE_TYPE_LABELS: Record<MatchingRuleType, string> = {
  title: 'Vindustittel',
  path: 'Filsti',
  app: 'Applikasjon',
  email: 'E-postavsender',
};

// Maler for matching-regler, klikk for å pre-utfylle skjemaet.
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
    .replace(/[-, -].+$/, '')
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .slice(0, 4)
    .map(prepareWord);

  // FLEKSIBEL pattern (anbefalt): bruker lookahead, alle ord må finnes,
  // i HVILKEN SOM HELST rekkefølge, med hva som helst mellom.
  //   "Bygdøy 12, rammetillatelse" → "(?=.*bygd[øo]y)(?=.*12).*"
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
      label: '⚡ Auto: match prosjektets navn (fleksibel)',
      type: 'title' as const,
      pattern: autoFlexPattern,
      hint: `Matcher uansett rekkefølge - f.eks. "${significantWords.join(' ')}" treffer både "${significantWords.join('-')}.docx", "${[...significantWords].reverse().join(' ')}.dwg" og "Notater om ${significantWords.join(' ')}.pdf"`,
    },
    {
      id: 'auto-title-strict',
      label: '🎯 Auto: streng match (ord i rekkefølge)',
      type: 'title' as const,
      pattern: titleWords,
      hint: 'Krever ordene i samme rekkefølge med kun mellomrom/bindestrek/understrek mellom - færre falske treff',
    },
    {
      id: 'folder',
      label: '📁 Filer i lokal prosjekt-mappe',
      type: 'path' as const,
      pattern: sak.folderPath
        ? sak.folderPath.replace(/[/\\]/g, '[\\\\/]').replace(/\./g, '\\.')
        : 'C:\\\\Jobb\\\\Prosjekt-mappe',
      hint: sak.folderPath ? `Bruker prosjektets mappe-sti` : 'Sett "Lokal mappe" på prosjektet først',
      disabled: !sak.folderPath,
    },
    {
      id: 'word',
      label: '📄 Word-dokumenter (alle .docx)',
      type: 'title' as const,
      pattern: '\\.docx?\\b',
      hint: 'Match enhver Word-fil - bredt, kombineres med spesifikk regel',
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
      hint: 'All tid i Outlook teller - kombiner med e-postregel for prosjekt-spesifikt',
    },
    {
      id: 'email-subject',
      label: '📧 E-post om prosjektet (emne)',
      type: 'title' as const,
      pattern: titleWords.split('[\\s\\-_]*').slice(0, 2).join('.*'),
      hint: 'Outlook-vinduer med prosjektrelaterte emner',
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
      label: '💻 VS Code / Cursor (auto fra prosjektets navn)',
      type: 'title' as const,
      pattern: titleWords + '.*\\b(Visual Studio Code|Cursor)\\b',
      hint: 'Editor-vinduer som har prosjektets navn i tittel - mappenavn eller fil',
    },
    {
      id: 'github',
      label: '🐙 GitHub-repo (browser-tab)',
      type: 'title' as const,
      pattern: titleWords + '.*github',
      hint: 'Chrome-tab på GitHub repo som matcher prosjektets navn',
    },
    {
      id: 'wp-admin',
      label: '🌐 WordPress-admin for klient',
      type: 'title' as const,
      pattern: '(wp-admin|wordpress).*' + titleWords,
      hint: 'For freelance WP-arbeid - Chrome-tab på klientens wp-admin',
    },
    {
      id: 'figma',
      label: '🎨 Figma med prosjektets navn',
      type: 'title' as const,
      pattern: titleWords + '.*figma|figma.*' + titleWords,
      hint: 'Designarbeid i Figma',
    },
    {
      id: 'terminal',
      label: '⌨️  Terminal i prosjekt-mappa',
      type: 'title' as const,
      pattern: '(Windows Terminal|PowerShell|cmd).*' + (sak.folderPath?.split(/[\\/]/).pop()?.toLowerCase() || titleWords),
      hint: sak.folderPath ? 'Terminal med mappenavn i tittel' : 'Sett folderPath for bedre treff',
    },
    {
      id: 'claude-code',
      label: '🤖 Claude Code (i prosjekt-mappa)',
      type: 'title' as const,
      pattern: 'Claude.*' + titleWords,
      hint: 'Claude Code-økt for dette prosjektet',
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

export default function MatchingRulesSection({
  sak,
  onChange,
}: {
  sak: Sak;
  onChange: () => void;
}) {
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
        kobles tiden automatisk til dette prosjektet. Klikk <strong>⚡ Velg mal</strong>{' '}
        for vanlige mønstre (Word, Outlook, prosjektets navn, etc.), eller{' '}
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
            Maler - klikk for å bruke
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
          Ingen regler enda. Desktop-agenten kobler ikke tid til dette prosjektet automatisk
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
