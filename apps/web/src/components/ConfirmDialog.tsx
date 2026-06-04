'use client';

/**
 * ConfirmDialog — pen erstatter for window.confirm().
 *
 * Brukes via useConfirm-hooken:
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Slette utgift?',
 *     body: 'Utgiften slettes permanent.',
 *     confirmLabel: 'Slett',
 *     danger: true,
 *   });
 *   if (!ok) return;
 *
 * Hook returnerer en async funksjon som viser modal og returnerer
 * Promise<boolean>. UI-en lever via Portal rotmappa via et globalt
 * <ConfirmProvider>-wrapper.
 *
 * Plassert i AppLayout og portal/layout slik at alle innloggede sider
 * får hooken tilgjengelig.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { tokens } from '@/lib/tokens';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rød knapp + tonet topp-stripe for destruktive handlinger. */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * useConfirm — returnerer en async-funksjon som viser modal og venter på svar.
 *
 * Returnerer alltid en gyldig funksjon — hvis provider ikke er montert
 * (testing, isolerte komponenter), faller den tilbake til window.confirm.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return ctx || ((opts) => Promise.resolve(window.confirm(`${opts.title}\n\n${opts.body ?? ''}`)));
}

/**
 * Wrapper-komponent som monteres én gang i layoutet. Holder kø av
 * pending confirm-requests + rendrer modal når en er aktiv.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<(ConfirmOptions & { id: number }) | null>(null);
  // Resolver for current open dialog (kalles ved OK/avbryt)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const idCounter = useRef(0);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      idCounter.current += 1;
      setActive({ ...opts, id: idCounter.current });
    });
  }, []);

  function close(result: boolean) {
    if (resolverRef.current) resolverRef.current(result);
    resolverRef.current = null;
    setActive(null);
  }

  // Esc lukker = avbryt, Enter = bekreft
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {active && (
        <div
          onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
            zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 12,
              maxWidth: 440, width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            {/* Farget topp-stripe - rød for destruktiv, navy ellers */}
            <div style={{
              height: 4,
              background: active.danger ? '#dc2626' : tokens.color.navy,
            }} />
            <div style={{ padding: 24 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                {active.title}
              </h2>
              {active.body && (
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                  {active.body}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  onClick={() => close(false)}
                  style={{
                    padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1',
                    background: 'white', color: '#475569', fontSize: 14, fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {active.cancelLabel || 'Avbryt'}
                </button>
                <button
                  onClick={() => close(true)}
                  autoFocus
                  style={{
                    padding: '8px 18px', borderRadius: 6, border: 'none',
                    background: active.danger ? '#dc2626' : tokens.color.navy,
                    color: 'white', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {active.confirmLabel || 'OK'}
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
                Esc = avbryt · Enter = {active.confirmLabel || 'OK'}
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
