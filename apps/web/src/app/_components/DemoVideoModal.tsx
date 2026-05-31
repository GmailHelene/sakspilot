'use client';

import { useState } from 'react';
import { tokens } from '@/lib/tokens';
import { Play, X } from 'lucide-react';

/**
 * Klikk-til-spill demo-thumbnail.
 *
 * TODO (Helene): Når demo-videoen er ferdig screen-recorded
 * (advokat-flyt: opprett sak → tidsregistrering via desktop-agent →
 *  AI-utkast til e-post → faktura til Fiken), bytt placeholder-modalen
 *  under med <video>-tag eller <iframe> mot YouTube/Vimeo. Bytt også
 *  thumbnail-bakgrunnen til et reelt skjermbilde fra opptaket.
 */
export default function DemoVideoModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Spill av demo-video"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 760,
          aspectRatio: '16 / 9',
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.lg,
          background: tokens.gradient.navy,
          overflow: 'hidden',
          cursor: 'pointer',
          boxShadow: tokens.shadow.lg,
          padding: 0,
          display: 'block',
          margin: '0 auto',
        }}
      >
        {/* Subtilt mønster i bakgrunnen så thumbnailen ikke er flat */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 30% 30%, rgba(212,160,23,0.18) 0%, transparent 50%), radial-gradient(circle at 75% 70%, rgba(0,184,132,0.14) 0%, transparent 55%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            color: tokens.color.white,
          }}
        >
          <span
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: tokens.color.gold,
              color: tokens.color.navy,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            }}
          >
            <Play size={32} strokeWidth={2.5} fill="currentColor" />
          </span>
          <div style={{ fontSize: 18, fontWeight: 600, textAlign: 'center', padding: '0 16px' }}>
            Se Sakspilot på 90 sekunder
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Demo · advokat-flyt</div>
        </div>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Demo-video"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.78)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: tokens.color.surface,
              borderRadius: tokens.radius.lg,
              padding: 32,
              maxWidth: 520,
              width: '100%',
              position: 'relative',
              boxShadow: tokens.shadow.xl,
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Lukk"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'transparent',
                color: tokens.color.textMuted,
                padding: 6,
                borderRadius: tokens.radius.sm,
              }}
            >
              <X size={20} />
            </button>
            <h3 style={{ fontSize: 22, color: tokens.color.navy, marginBottom: 12, paddingRight: 24 }}>
              Demo-video kommer snart
            </h3>
            <p style={{ color: tokens.color.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
              Vi er i ferd med å spille inn en 90-sekunders gjennomgang av Sakspilot —
              fra første sak til ferdig faktura. Registrer deg gratis nå, så får du beskjed
              på e-post når demoen er klar.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a
                href="/registrer"
                style={{
                  background: tokens.color.navy,
                  color: tokens.color.white,
                  padding: '10px 18px',
                  borderRadius: tokens.radius.md,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Registrer meg gratis
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: tokens.color.bgAlt,
                  color: tokens.color.navy,
                  padding: '10px 18px',
                  borderRadius: tokens.radius.md,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Senere
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
