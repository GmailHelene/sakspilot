import { tokens } from '@/lib/tokens';

/**
 * Visuell forhandsvisning av appen på landingssiden. Tilbakemelding fra
 * Helene 4. juni: forsiden manglet figurer som viser hva man faktisk får.
 *
 * Vi bygger fire stiliserte "browser-frame"-mockups som speiler den ekte
 * appen (sett via prod 4. juni): kanban, faktura-liste, MVA-rapport,
 * hjem-dashboard. Mockup-tilnærming er valgt over ekte JPEG fordi:
 *   1. Vi unngår å pushe potensielt sensitive klient-data inn i offentlig
 *      kildekode (selv sladdet)
 *   2. Skalerbart vektor-bilde gir skarpe figurer på alle skjermer
 *   3. Tema-konsistent med resten av landingssiden (samme tokens-farger)
 *
 * Når vi vil ha ekte JPEG senere: legg dem i public/screenshots/, og
 * erstatt SVG-mockup-fanene under med <Image src="/screenshots/...">.
 */

const BROWSER_BAR_BG = '#F1F3F5';
const SCREEN_BG = '#FFFFFF';
const DARK_BAR = '#0F1419';
const ACCENT = tokens.color.pink ?? '#D81B60';

function BrowserFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: SCREEN_BG,
        border: `1px solid ${tokens.color.border}`,
        boxShadow: '0 12px 32px rgba(15,20,25,0.12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          background: BROWSER_BAR_BG,
          borderBottom: '1px solid #E4E7EB',
          gap: 8,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 5, background: '#FF5F57' }} />
        <span style={{ width: 10, height: 10, borderRadius: 5, background: '#FEBC2E' }} />
        <span style={{ width: 10, height: 10, borderRadius: 5, background: '#28C840' }} />
        <span style={{ marginLeft: 14, fontSize: 11, color: '#6B7682', fontFamily: 'monospace' }}>
          sakspilot.no{title}
        </span>
      </div>
      <div style={{ height: 280, position: 'relative' }}>{children}</div>
    </div>
  );
}

function SidebarMini() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 56,
        background: DARK_BAR,
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ width: 24, height: 24, borderRadius: 6, background: ACCENT }} />
      {[0.5, 0.3, 0.3, 0.3, 0.3, 0.3].map((o, i) => (
        <div
          key={i}
          style={{
            height: 8,
            borderRadius: 2,
            background: `rgba(255,255,255,${o})`,
            margin: '0 2px',
          }}
        />
      ))}
    </div>
  );
}

function KanbanMock() {
  const cols = [
    { name: 'Ikke pågynt', count: 0, color: '#9CA3AF', cards: [] },
    { name: 'Pågår', count: 5, color: ACCENT, cards: [1, 2, 3] },
    { name: 'Venter', count: 1, color: '#FBBF24', cards: [1] },
    { name: 'Ferdig', count: 3, color: '#10B981', cards: [1, 2] },
  ];
  return (
    <>
      <SidebarMini />
      <div style={{ position: 'absolute', left: 64, right: 0, top: 0, bottom: 0, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: tokens.color.navy }}>Prosjekter</span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>19 aktive</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {cols.map((c) => (
            <div key={c.name}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: c.color,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  paddingBottom: 6,
                  borderBottom: `2px solid ${c.color}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span>{c.name}</span>
                <span>{c.count}</span>
              </div>
              {c.cards.map((i) => (
                <div
                  key={i}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E4E7EB',
                    borderRadius: 6,
                    padding: 8,
                    marginBottom: 6,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ height: 8, background: '#374151', borderRadius: 2, marginBottom: 6, width: '70%' }} />
                  <div style={{ height: 6, background: '#D1D5DB', borderRadius: 2, width: '50%' }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function InvoiceMock() {
  const rows = [
    { nr: '3003', sum: '900,00', status: 'SENDT', sc: '#FCD34D' },
    { nr: '3002', sum: '1 500,00', status: 'BETALT', sc: '#10B981' },
    { nr: '3001', sum: '3 600,00', status: 'BETALT', sc: '#10B981' },
  ];
  return (
    <>
      <SidebarMini />
      <div style={{ position: 'absolute', left: 64, right: 0, top: 0, bottom: 0, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: tokens.color.navy, marginBottom: 12 }}>Fakturaer</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'EKSPORTERT', value: '6 000', unit: 'kr' },
            { label: 'UTKAST', value: '0', unit: 'kr' },
            { label: 'ANTALL', value: '3', unit: '' },
            { label: 'ANNULLERT', value: '0', unit: '' },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: '#F9FAFB', borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#6B7682' }}>{kpi.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>{kpi.value}</span>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>{kpi.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ border: '1px solid #E4E7EB', borderRadius: 6 }}>
          {rows.map((r, i) => (
            <div
              key={r.nr}
              style={{
                display: 'grid',
                gridTemplateColumns: '50px 1fr auto auto',
                gap: 8,
                padding: '8px 10px',
                borderTop: i === 0 ? 'none' : '1px solid #F0F2F5',
                alignItems: 'center',
                fontSize: 11,
              }}
            >
              <span style={{ color: '#9CA3AF' }}>{r.nr}</span>
              <div style={{ height: 6, background: '#E4E7EB', borderRadius: 2, width: '60%' }} />
              <span style={{ fontWeight: 700 }}>{r.sum} kr</span>
              <span
                style={{
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 100,
                  background: `${r.sc}22`,
                  color: r.sc,
                  fontWeight: 700,
                }}
              >
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MvaMock() {
  return (
    <>
      <SidebarMini />
      <div style={{ position: 'absolute', left: 64, right: 0, top: 0, bottom: 0, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: tokens.color.navy, marginBottom: 4 }}>MVA-rapport</div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 14 }}>Q1 2026 · for innlevering i Altinn</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'UTGÅENDE MVA', value: '12 500', col: '#10B981' },
            { label: 'INNGÅENDE MVA', value: '4 200', col: '#3B82F6' },
            { label: 'TIL SKATTEETATEN', value: '8 300', col: ACCENT },
          ].map((c) => (
            <div key={c.label} style={{ border: '1px solid #E4E7EB', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#6B7682' }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.col, marginTop: 4 }}>
                {c.value} <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>kr</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {['Utgående MVA (salg)', 'Inngående MVA (kjøp)'].map((title) => (
            <div key={title} style={{ border: '1px solid #E4E7EB', borderRadius: 6, padding: 10, height: 90 }}>
              <div style={{ fontSize: 10, color: '#6B7682', marginBottom: 8 }}>{title}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 50 }}>
                {[40, 60, 30, 50, 70, 45].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, background: `${ACCENT}88`, borderRadius: '2px 2px 0 0' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function HomeMock() {
  return (
    <>
      <SidebarMini />
      <div style={{ position: 'absolute', left: 64, right: 0, top: 0, bottom: 0, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: tokens.color.navy }}>God kveld, Helene!</div>
        <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 12 }}>Grønberg Tech Solutions · torsdag 4. juni</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { l: 'PROSJEKTER', v: '12', c: '#3B82F6' },
            { l: 'TIMER DENNE UKA', v: '14 t', c: '#10B981' },
            { l: 'FRISTER I DAG', v: '0', c: '#9CA3AF' },
            { l: 'FORSINKET', v: '0', c: '#9CA3AF' },
          ].map((kpi) => (
            <div key={kpi.l} style={{ background: '#F9FAFB', borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#6B7682' }}>{kpi.l}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: kpi.c, marginTop: 2 }}>{kpi.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {['Kommende frister', 'Nylige prosjekter', 'Hurtighandlinger'].map((title, i) => (
            <div key={title} style={{ border: '1px solid #E4E7EB', borderRadius: 6, padding: 10, height: 130 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: tokens.color.navy, marginBottom: 8 }}>{title}</div>
              {[1, 2, 3].map((j) => (
                <div
                  key={j}
                  style={{
                    height: 6,
                    background: i === 2 && j === 1 ? ACCENT : '#E4E7EB',
                    borderRadius: 2,
                    marginBottom: 8,
                    width: `${90 - j * 15}%`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const PANELS = [
  { title: '/saker', name: 'Prosjekter med kanban', desc: 'Drag-and-drop mellom statuser. Filtrer på klient eller frist.', Mock: KanbanMock },
  { title: '/fakturaer', name: 'Fakturaer med automatisk MVA', desc: 'Send PDF på e-post. Purring etter 14/30/60 dager.', Mock: InvoiceMock },
  { title: '/mva-rapport', name: 'MVA-rapport klar til Altinn', desc: 'Velg periode. Eksporter PDF som vedlegg.', Mock: MvaMock },
  { title: '/hjem', name: 'Hjem-dashboard', desc: 'Ukens nøkkeltall, frister og hurtighandlinger i ett blikk.', Mock: HomeMock },
];

export default function AppPreview() {
  return (
    <section
      style={{
        padding: '60px 24px',
        maxWidth: 1180,
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h2 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 8 }}>
          Slik ser appen ut
        </h2>
        <p style={{ color: tokens.color.textMuted, fontSize: 15, maxWidth: 580, margin: '0 auto' }}>
          Fire skjermer fra ekte bruk. Logg inn for å se det fulle bildet.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
        }}
      >
        {PANELS.map(({ title, name, desc, Mock }) => (
          <figure key={title} style={{ margin: 0 }}>
            <BrowserFrame title={title}>
              <Mock />
            </BrowserFrame>
            <figcaption style={{ marginTop: 14, paddingLeft: 4 }}>
              <div style={{ fontWeight: 700, color: tokens.color.navy, fontSize: 15 }}>{name}</div>
              <div style={{ fontSize: 13, color: tokens.color.textMuted, marginTop: 2 }}>{desc}</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
