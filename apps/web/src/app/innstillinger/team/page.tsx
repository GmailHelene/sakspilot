'use client';

/**
 * Team-side — owner-only.
 *
 * Lister medlemmer + pending invites. Owner kan:
 *   - Invitere ny (e-post + rolle)
 *   - Avbryte pending invite
 *   - Endre rolle på medlem
 *   - Fjerne medlem
 *
 * Plan-gating: hvis backend returnerer 402 (solo-plan), vises informativ
 * melding med lenke til /priser. Pilot-orgs omgår plan-sjekken automatisk.
 */
import { useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, Check, Crown, ShieldCheck, User as UserIcon, AlertTriangle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

interface Member {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'member' | 'admin';
  lastLoginAt: string | null;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: 'owner' | 'member' | 'admin';
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string; email: string };
}

export default function TeamPage() {
  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, color: tokens.color.navy, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={26} strokeWidth={2} />
            Team
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Inviter team-medlemmer til organisasjonen. Alle medlemmer ser
            samme prosjekter, klienter og kalender — tilgangskontroll skjer på
            organisasjons-nivå.
          </p>
        </div>

        <TeamContent />
      </div>
    </AppLayout>
  );
}

function TeamContent() {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState<string | null>(null);

  const isOwner = me?.role === 'owner';

  useEffect(() => {
    loadMe();
    loadMembers();
    loadInvites();
  }, []);

  async function loadMe() {
    try {
      const meRes = await api<{ id: string; role: string }>('/auth/me');
      setMe(meRes);
    } catch {
      setMe(null);
    }
  }

  async function loadMembers() {
    try {
      const { members } = await api<{ members: Member[] }>('/team/members');
      setMembers(members);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      setMembers([]);
    }
  }

  async function loadInvites() {
    try {
      const { invites } = await api<{ invites: PendingInvite[] }>('/team/invites');
      setInvites(invites);
    } catch {
      setInvites([]);
    }
  }

  async function handleInvite(email: string, role: 'member' | 'admin') {
    setError(null);
    setPlanBlocked(null);
    try {
      await api<{ ok: boolean; message: string }>('/team/invites', {
        method: 'POST',
        body: { email, role },
      });
      await loadInvites();
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 402) {
          setPlanBlocked(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError('Ukjent feil');
      }
      return false;
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!confirm('Avbryte invitasjonen?')) return;
    try {
      await api(`/team/invites/${inviteId}`, { method: 'DELETE' });
      await loadInvites();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Ukjent feil');
    }
  }

  async function handleRemoveMember(member: Member) {
    if (
      !confirm(
        `Fjerne ${member.name} (${member.email}) fra teamet? Brukerens data slettes også (tidsregistreringer, klistrelapper). Prosjekter og klienter beholdes (de tilhører organisasjonen).`
      )
    ) {
      return;
    }
    try {
      await api(`/team/members/${member.id}`, { method: 'DELETE' });
      await loadMembers();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Ukjent feil');
    }
  }

  async function handleChangeRole(member: Member, newRole: Member['role']) {
    if (member.role === newRole) return;
    try {
      await api(`/team/members/${member.id}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      await loadMembers();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Ukjent feil');
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

      {planBlocked && (
        <Section
          icon={<AlertTriangle size={18} strokeWidth={2} />}
          title="Team krever pro- eller team-plan"
          description={planBlocked}
        >
          <a
            href="/priser"
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              background: tokens.color.navy,
              color: tokens.color.white,
              borderRadius: tokens.radius.md,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Se priser og oppgrader
          </a>
        </Section>
      )}

      {isOwner && (
        <InviteForm onInvite={handleInvite} />
      )}

      <Section
        icon={<UserIcon size={18} strokeWidth={2} />}
        title={`Medlemmer (${members?.length ?? 0})`}
        description="Alle brukere som har tilgang til organisasjonen."
      >
        {!members ? (
          <div style={{ color: tokens.color.textMuted, fontSize: 13 }}>Henter…</div>
        ) : members.length === 0 ? (
          <div style={{ color: tokens.color.textSubtle, fontSize: 13 }}>Ingen medlemmer.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isMe={m.id === me?.id}
                isOwnerViewer={!!isOwner}
                onChangeRole={(r) => handleChangeRole(m, r)}
                onRemove={() => handleRemoveMember(m)}
              />
            ))}
          </div>
        )}
      </Section>

      {invites && invites.length > 0 && (
        <Section
          icon={<UserPlus size={18} strokeWidth={2} />}
          title={`Ventende invitasjoner (${invites.length})`}
          description="Invitasjoner som ikke er akseptert ennå."
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {invites.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: tokens.color.bg,
                  borderRadius: tokens.radius.sm,
                  border: `1px solid ${tokens.color.border}`,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {inv.email}{' '}
                    <RoleBadge role={inv.role} />
                  </div>
                  <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>
                    Invitert av {inv.invitedBy.name} · utløper {formatDate(inv.expiresAt)}
                  </div>
                </div>
                {isOwner && (
                  <button onClick={() => handleCancelInvite(inv.id)} style={dangerBtn}>
                    <Trash2 size={12} strokeWidth={2} /> Avbryt
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ── Invite-form ─────────────────────────────────────────────────

function InviteForm({
  onInvite,
}: {
  onInvite: (email: string, role: 'member' | 'admin') => Promise<boolean>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const ok = await onInvite(email, role);
    if (ok) {
      setStatus('success');
      setEmail('');
      setRole('member');
      setTimeout(() => setStatus('idle'), 3000);
    } else {
      setStatus('idle');
    }
  }

  return (
    <Section
      icon={<UserPlus size={18} strokeWidth={2} />}
      title="Inviter nytt medlem"
      description="Inviterer du noen via e-post — de får en lenke for å sette passord og bli med."
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
        <Field label="E-post">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kollega@firma.no"
            required
            style={{ ...inputStyle, width: 280 }}
            autoComplete="email"
          />
        </Field>
        <Field label="Rolle">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            style={{ ...inputStyle, width: 160 }}
          >
            <option value="member">Medlem</option>
            <option value="admin">Administrator</option>
          </select>
        </Field>
        <button type="submit" disabled={status === 'sending'} style={primaryBtn}>
          {status === 'sending' ? 'Sender…' : status === 'success' ? (
            <>
              <Check size={14} strokeWidth={2} /> Sendt
            </>
          ) : (
            <>
              <UserPlus size={14} strokeWidth={2} /> Send invitasjon
            </>
          )}
        </button>
      </form>
    </Section>
  );
}

// ── Medlemsrad ──────────────────────────────────────────────────

function MemberRow({
  member,
  isMe,
  isOwnerViewer,
  onChangeRole,
  onRemove,
}: {
  member: Member;
  isMe: boolean;
  isOwnerViewer: boolean;
  onChangeRole: (r: Member['role']) => void;
  onRemove: () => void;
}) {
  // Owner kan kun endre andre. Kan ikke endre egen rolle (backend håndhever).
  const canManage = isOwnerViewer && !isMe;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        background: tokens.color.bg,
        borderRadius: tokens.radius.sm,
        border: `1px solid ${tokens.color.border}`,
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {member.name}
          {isMe && <span style={meBadgeStyle}>deg</span>}
          <RoleBadge role={member.role} />
        </div>
        <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>
          {member.email} · sist innlogget:{' '}
          {member.lastLoginAt ? formatRelative(member.lastLoginAt) : 'aldri'}
        </div>
      </div>

      {canManage ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={member.role}
            onChange={(e) => onChangeRole(e.target.value as Member['role'])}
            style={{ ...inputStyle, fontSize: 12, padding: '6px 8px' }}
          >
            <option value="member">Medlem</option>
            <option value="admin">Administrator</option>
            <option value="owner">Eier</option>
          </select>
          <button onClick={onRemove} style={dangerBtn} title="Fjern medlem">
            <Trash2 size={12} strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RoleBadge({ role }: { role: 'owner' | 'member' | 'admin' }) {
  const map: Record<typeof role, { label: string; bg: string; color: string; Icon: typeof Crown }> = {
    owner: { label: 'Eier', bg: '#FEF3C7', color: '#92400E', Icon: Crown },
    admin: { label: 'Administrator', bg: '#DBEAFE', color: '#1E40AF', Icon: ShieldCheck },
    member: { label: 'Medlem', bg: '#E5E7EB', color: '#374151', Icon: UserIcon },
  };
  const { label, bg, color, Icon } = map[role];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: bg,
        color,
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      <Icon size={10} strokeWidth={2.5} />
      {label}
    </span>
  );
}

// ── Reusable ────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: tokens.color.white,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${tokens.color.border}`,
          background: tokens.color.white,
        }}
      >
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
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  fontFamily: 'inherit',
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

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: '#FEE2E2',
  color: '#7F1D1D',
  border: '1px solid #FCA5A5',
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  marginBottom: 16,
};

const meBadgeStyle: React.CSSProperties = {
  background: tokens.color.navy,
  color: 'white',
  fontSize: 9,
  fontWeight: 700,
  padding: '1px 5px',
  borderRadius: 3,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};
