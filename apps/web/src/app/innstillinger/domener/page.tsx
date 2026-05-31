'use client';

/**
 * Egne domener (whitelabel) — owner-only.
 *
 * Lar frilanseren koble sitt eget domene (f.eks. klienter.helenetech.no) til
 * sin klient-portal med egen branding. Flow:
 *
 *   1. Legg til hostname → få DNS-instruksjoner (TXT + CNAME)
 *   2. Legg inn TXT-recorden hos sin DNS-leverandør
 *   3. Trykk "Verifiser nå" → backend gjør DNS-oppslag
 *   4. Sett branding (navn, tagline, farge, logo)
 *   5. Kontakt support@sakspilot.no for å aktivere domenet på Vercel
 *      (manuell steg inntil vi har Vercel API-integrasjon)
 */
import { useEffect, useState } from 'react';
import { Globe, Plus, Trash2, CheckCircle2, AlertTriangle, RefreshCw, Palette, Copy, ExternalLink } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

interface DnsInstructions {
  txt: { record: string; value: string; description: string };
  cname: { record: string; value: string; description: string };
}

interface CustomDomain {
  id: string;
  hostname: string;
  verified: boolean;
  verificationToken: string;
  verifiedAt: string | null;
  brandName: string | null;
  brandTagline: string | null;
  brandPrimaryColor: string | null;
  brandLogoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  dnsInstructions: DnsInstructions;
  portalUrl: string | null;
}

export default function CustomDomainsPage() {
  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, color: tokens.color.navy, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={26} strokeWidth={2} />
            Egne domener
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Koble ditt eget domene (f.eks. <code>klienter.dittfirma.no</code>) til klient-portalen din,
            og overstyr Sakspilot-brandingen med ditt eget navn, farge og logo.
          </p>
        </div>
        <DomainsContent />
      </div>
    </AppLayout>
  );
}

function DomainsContent() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [domains, setDomains] = useState<CustomDomain[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = me?.role === 'owner';

  useEffect(() => {
    loadMe();
    loadDomains();
  }, []);

  async function loadMe() {
    try {
      const meRes = await api<{ role: string }>('/auth/me');
      setMe(meRes);
    } catch {
      setMe(null);
    }
  }

  async function loadDomains() {
    try {
      const { domains } = await api<{ domains: CustomDomain[] }>('/custom-domains');
      setDomains(domains);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke hente domener');
      setDomains([]);
    }
  }

  async function handleAdd(hostname: string) {
    setError(null);
    try {
      await api<{ domain: CustomDomain }>('/custom-domains', {
        method: 'POST',
        body: { hostname },
      });
      await loadDomains();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke legge til domene');
      return false;
    }
  }

  async function handleVerify(id: string) {
    setError(null);
    try {
      await api(`/custom-domains/${id}/verify`, { method: 'POST' });
      await loadDomains();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Verifisering feilet';
      return { ok: false, msg };
    }
  }

  async function handleDelete(id: string, hostname: string) {
    if (!confirm(`Fjerne domenet ${hostname}? Branding og verifisering blir borte. Klient-portalen vil ikke lenger lastes på dette domenet.`)) {
      return;
    }
    try {
      await api(`/custom-domains/${id}`, { method: 'DELETE' });
      await loadDomains();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Kunne ikke slette domene');
    }
  }

  async function handleBrandingSave(
    id: string,
    branding: { brandName: string; brandTagline: string; brandPrimaryColor: string; brandLogoUrl: string }
  ) {
    try {
      await api(`/custom-domains/${id}/branding`, {
        method: 'PATCH',
        body: {
          brandName: branding.brandName,
          brandTagline: branding.brandTagline,
          brandPrimaryColor: branding.brandPrimaryColor,
          brandLogoUrl: branding.brandLogoUrl,
        },
      });
      await loadDomains();
      return true;
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Kunne ikke lagre branding');
      return false;
    }
  }

  return (
    <>
      {error && (
        <div style={errorBoxStyle}>
          <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {error}
        </div>
      )}

      <Section
        icon={<AlertTriangle size={18} strokeWidth={2} />}
        title="Slik fungerer det"
        description="Tre steg for å aktivere ditt eget domene."
      >
        <ol style={{ fontSize: 13, color: tokens.color.text, lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
          <li>Legg til domenet under. Du får tre DNS-instruksjoner du må sette opp hos din DNS-leverandør (Domeneshop, Cloudflare, GoDaddy etc.).</li>
          <li>Trykk &quot;Verifiser nå&quot; når DNS er propagert (5–60 min). Vi sjekker at TXT-recorden er satt riktig.</li>
          <li>Send en e-post til <a href="mailto:support@sakspilot.no" style={{ color: tokens.color.navy }}>support@sakspilot.no</a> så aktiverer vi domenet på Vercel-serveren (manuell oppskrift inntil videre).</li>
        </ol>
      </Section>

      {isOwner && <AddDomainForm onAdd={handleAdd} />}

      <Section
        icon={<Globe size={18} strokeWidth={2} />}
        title={`Mine domener (${domains?.length ?? 0})`}
        description="Hvert domene kan ha sin egen branding."
      >
        {!domains ? (
          <div style={{ color: tokens.color.textMuted, fontSize: 13 }}>Henter…</div>
        ) : domains.length === 0 ? (
          <div style={{ color: tokens.color.textSubtle, fontSize: 13 }}>
            Ingen domener lagt til ennå. Bruk skjemaet ovenfor for å legge til ditt første.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {domains.map((d) => (
              <DomainCard
                key={d.id}
                domain={d}
                isOwner={!!isOwner}
                onVerify={() => handleVerify(d.id)}
                onDelete={() => handleDelete(d.id, d.hostname)}
                onSaveBranding={(b) => handleBrandingSave(d.id, b)}
              />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ── Add-form ────────────────────────────────────────────────────

function AddDomainForm({ onAdd }: { onAdd: (hostname: string) => Promise<boolean> }) {
  const [hostname, setHostname] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const ok = await onAdd(hostname.trim().toLowerCase());
    if (ok) {
      setStatus('success');
      setHostname('');
      setTimeout(() => setStatus('idle'), 3000);
    } else {
      setStatus('idle');
    }
  }

  return (
    <Section
      icon={<Plus size={18} strokeWidth={2} />}
      title="Legg til domene"
      description="Et subdomain anbefales (f.eks. klienter.dittfirma.no). Du må allerede eie domenet."
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
        <Field label="Hostname">
          <input
            type="text"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="klienter.dittfirma.no"
            required
            style={{ ...inputStyle, width: 320 }}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <button type="submit" disabled={status === 'sending'} style={primaryBtn}>
          {status === 'sending' ? 'Legger til…' : status === 'success' ? (
            <><CheckCircle2 size={14} strokeWidth={2} /> Lagt til</>
          ) : (
            <><Plus size={14} strokeWidth={2} /> Legg til</>
          )}
        </button>
      </form>
    </Section>
  );
}

// ── Domain-card ─────────────────────────────────────────────────

function DomainCard({
  domain,
  isOwner,
  onVerify,
  onDelete,
  onSaveBranding,
}: {
  domain: CustomDomain;
  isOwner: boolean;
  onVerify: () => Promise<{ ok: boolean; msg?: string }>;
  onDelete: () => void;
  onSaveBranding: (b: { brandName: string; brandTagline: string; brandPrimaryColor: string; brandLogoUrl: string }) => Promise<boolean>;
}) {
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(null);
    const res = await onVerify();
    setVerifying(false);
    if (!res.ok) setVerifyError(res.msg || 'Verifisering feilet');
  }

  return (
    <div
      style={{
        background: tokens.color.bg,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: tokens.color.navy, display: 'flex', alignItems: 'center', gap: 8 }}>
            {domain.hostname}
            <StatusBadge verified={domain.verified} />
          </div>
          {domain.verified && domain.portalUrl && (
            <a
              href={domain.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: tokens.color.blue, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {domain.portalUrl} <ExternalLink size={11} />
            </a>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!domain.verified && (
            <button onClick={handleVerify} disabled={verifying} style={primaryBtn}>
              <RefreshCw
                size={12}
                strokeWidth={2}
                style={verifying ? { animation: 'spin 1s linear infinite' } : undefined}
              />
              {verifying ? 'Sjekker DNS…' : 'Verifiser nå'}
            </button>
          )}
          {isOwner && (
            <button onClick={onDelete} style={dangerBtn} title="Fjern domene">
              <Trash2 size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {verifyError && (
        <div style={{ ...errorBoxStyle, marginTop: 12, marginBottom: 0 }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {verifyError}
        </div>
      )}

      {!domain.verified && (
        <div style={{ marginTop: 12 }}>
          <DnsInstructionsBlock dns={domain.dnsInstructions} />
        </div>
      )}

      {domain.verified && isOwner && (
        <div style={{ marginTop: 16 }}>
          <BrandingForm domain={domain} onSave={onSaveBranding} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: tokens.color.greenSoft,
          color: '#0F5638',
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        <CheckCircle2 size={10} strokeWidth={2.5} /> Verifisert
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: tokens.color.yellowSoft,
        color: '#7A5C00',
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      <AlertTriangle size={10} strokeWidth={2.5} /> Venter på DNS
    </span>
  );
}

function DnsInstructionsBlock({ dns }: { dns: DnsInstructions }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <DnsRecord type="TXT" record={dns.txt.record} value={dns.txt.value} description={dns.txt.description} />
      <DnsRecord type="CNAME" record={dns.cname.record} value={dns.cname.value} description={dns.cname.description} />
    </div>
  );
}

function DnsRecord({ type, record, value, description }: { type: string; record: string; value: string; description: string }) {
  return (
    <div style={{ background: tokens.color.surface, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.sm, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: tokens.font.mono, fontSize: 11, fontWeight: 700, background: tokens.color.navy, color: tokens.color.white, padding: '2px 8px', borderRadius: 4 }}>
          {type}
        </span>
        <span style={{ fontSize: 12, color: tokens.color.textMuted }}>DNS-record</span>
      </div>
      <CopyField label="Navn" value={record} />
      <CopyField label="Verdi" value={value} />
      <p style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 6, marginBottom: 0 }}>{description}</p>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{ fontSize: 11, color: tokens.color.textMuted, minWidth: 40 }}>{label}:</span>
      <code style={{ flex: 1, fontFamily: tokens.font.mono, fontSize: 12, background: tokens.color.bgAlt, padding: '4px 8px', borderRadius: 4, color: tokens.color.text, overflow: 'auto' }}>
        {value}
      </code>
      <button onClick={copy} style={copyBtn} title="Kopier">
        <Copy size={11} strokeWidth={2} /> {copied ? 'Kopiert' : 'Kopier'}
      </button>
    </div>
  );
}

// ── Branding-form ───────────────────────────────────────────────

function BrandingForm({
  domain,
  onSave,
}: {
  domain: CustomDomain;
  onSave: (b: { brandName: string; brandTagline: string; brandPrimaryColor: string; brandLogoUrl: string }) => Promise<boolean>;
}) {
  const [brandName, setBrandName] = useState(domain.brandName || '');
  const [brandTagline, setBrandTagline] = useState(domain.brandTagline || '');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(domain.brandPrimaryColor || '#1E3A5F');
  const [brandLogoUrl, setBrandLogoUrl] = useState(domain.brandLogoUrl || '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const ok = await onSave({ brandName, brandTagline, brandPrimaryColor, brandLogoUrl });
    setStatus(ok ? 'saved' : 'idle');
    if (ok) setTimeout(() => setStatus('idle'), 2000);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: tokens.color.navy }}>
        <Palette size={14} strokeWidth={2} /> Branding for {domain.hostname}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <Field label="Navn (vises i topp-bar)">
          <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Helene Tech Solutions" style={inputStyle} maxLength={80} />
        </Field>
        <Field label="Tagline">
          <input value={brandTagline} onChange={(e) => setBrandTagline(e.target.value)} placeholder="Klient-portal" style={inputStyle} maxLength={120} />
        </Field>
        <Field label="Primær-farge">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} style={{ width: 40, height: 38, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.sm, cursor: 'pointer', padding: 2 }} />
            <input value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} placeholder="#1E3A5F" style={{ ...inputStyle, flex: 1, fontFamily: tokens.font.mono }} maxLength={7} />
          </div>
        </Field>
        <Field label="Logo URL (valgfri)">
          <input value={brandLogoUrl} onChange={(e) => setBrandLogoUrl(e.target.value)} placeholder="https://..." style={inputStyle} maxLength={1000} />
        </Field>
      </div>
      <div>
        <button type="submit" disabled={status === 'saving'} style={primaryBtn}>
          {status === 'saving' ? 'Lagrer…' : status === 'saved' ? (
            <><CheckCircle2 size={14} strokeWidth={2} /> Lagret</>
          ) : 'Lagre branding'}
        </button>
      </div>
    </form>
  );
}

// ── Reusable ────────────────────────────────────────────────────

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{ background: tokens.color.white, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.lg, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${tokens.color.border}`, background: tokens.color.white }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: tokens.color.navy }}>
          {icon}
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        </div>
        <p style={{ fontSize: 13, color: tokens.color.textMuted, marginTop: 4 }}>{description}</p>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: tokens.color.text }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  fontFamily: 'inherit',
  background: tokens.color.surface,
  color: tokens.color.text,
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: tokens.color.red,
  color: tokens.color.white,
  padding: '6px 10px',
  borderRadius: tokens.radius.sm,
  border: 'none',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const copyBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: `1px solid ${tokens.color.border}`,
  color: tokens.color.textMuted,
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  fontWeight: 600,
};

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: '#FEE2E2',
  color: '#7F1D1D',
  border: '1px solid #FCA5A5',
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  marginBottom: 16,
};
