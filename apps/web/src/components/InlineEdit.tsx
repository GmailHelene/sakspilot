'use client';

/**
 * InlineEdit, klikk-for-å-redigere komponent.
 *
 *   <InlineEdit value={name} onSave={(v) => api.patch(...)} />
 *
 * Brukes på forespørsel-kanban og hvor som helst vi vil støtte rask
 * redigering uten å åpne en modal.
 *
 *   - Klikk visning → blir til input med fokus + selektert tekst
 *   - Enter eller blur lagrer (kaller onSave)
 *   - Esc avbryter (gjenoppretter original verdi)
 *   - onSave kan være async, UI viser små "lagrer..." mens den kjører
 *   - Hvis onSave throws, ruller vi tilbake til original verdi og viser
 *     en kort rød feilmelding
 *
 * NB: stopper event-propagering så klikk i input ikke trigger
 * parent-onClick (f.eks. åpne detalj-modal).
 */
import { useEffect, useRef, useState } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (next: string) => Promise<void>;
  /** Min lengde - default 1. Tom verdi rulles tilbake. */
  minLength?: number;
  /** Max-lengde for input. Default 200. */
  maxLength?: number;
  /** placeholder hvis value er tom */
  placeholder?: string;
  /** Stiles styles på SPAN-en når ikke i edit-modus */
  displayStyle?: React.CSSProperties;
  /** Stil på input-en når i edit-modus */
  inputStyle?: React.CSSProperties;
  /** Multi-linje (textarea) eller single-linje (input). Default: input. */
  multiline?: boolean;
}

export function InlineEdit({
  value,
  onSave,
  minLength = 1,
  maxLength = 200,
  placeholder,
  displayStyle,
  inputStyle,
  multiline,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Når prop endrer seg utenfra, sync lokal state
  useEffect(() => { setLocal(value); }, [value]);

  // Fokus + selektere ALL tekst ved start av redigering
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  async function commit() {
    const trimmed = local.trim();
    if (trimmed === value.trim()) {
      // Ingen endring, bare avslutt
      setEditing(false);
      return;
    }
    if (trimmed.length < minLength) {
      // Avvis tom/for kort, rull tilbake
      setLocal(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      // Rull tilbake + vis feil i 3 sek
      setLocal(value);
      setError(e instanceof Error ? e.message : 'Lagring feilet');
      setTimeout(() => setError(null), 3000);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setLocal(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="Klikk for å redigere"
        style={{
          cursor: 'text',
          display: 'inline-block',
          minWidth: 60,
          ...displayStyle,
          // Feilmelding-state har subtil rød tinting
          ...(error ? { color: '#dc2626' } : {}),
        }}
      >
        {value || (placeholder ? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{placeholder}</span> : null)}
        {error && <span style={{ marginLeft: 6, fontSize: 10, color: '#dc2626' }}>(feil)</span>}
      </span>
    );
  }

  const commonProps = {
    ref: inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>,
    value: local,
    maxLength,
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLocal(e.target.value),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onBlur: () => commit(),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        cancel();
      } else if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Enter' && multiline && e.metaKey) {
        // Cmd+Enter i textarea lagrer
        e.preventDefault();
        commit();
      }
    },
    style: {
      border: '1px solid #3b82f6',
      borderRadius: 4,
      padding: '2px 4px',
      fontSize: 'inherit',
      fontFamily: 'inherit',
      background: 'white',
      color: '#0f172a',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box' as const,
      ...inputStyle,
    },
  };

  return multiline
    ? <textarea {...commonProps} rows={3} />
    : <input {...commonProps} type="text" />;
}
