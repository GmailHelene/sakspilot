'use client';

import { useState, useEffect, useRef } from 'react';
import { tokens } from '@/lib/tokens';
import { Play, X } from 'lucide-react';

/**
 * Klikk-til-spill demo-thumbnail som åpner modal med faktisk video.
 *
 * Videoen ligger på `/demo-advokat.mp4` i public-folderen. Den serveres
 * direkte fra Vercel og spiller av i nettleseren via HTML <video>-tag.
 *
 * Båndbredde-merknad: videoen er ~65 MB. Vercel-grensa er 100 GB/mnd på
 * free tier. Hvis trafikken vokser betraktelig (>1500 visninger/mnd),
 * vurder å bytte til YouTube unlisted eller Cloudflare Stream for å
 * unngå å spise opp bandwidth-budsjettet.
 */
export default function DemoVideoModal() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pause + reset videoen når modal lukkes så lyden ikke fortsetter
  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [open]);

  // Esc-tast for å lukke
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
            background: 'rgba(15, 23, 42, 0.88)',
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
              background: '#000',
              borderRadius: tokens.radius.lg,
              maxWidth: 1080,
              width: '100%',
              position: 'relative',
              boxShadow: tokens.shadow.xl,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Lukk video"
              title="Lukk (Esc)"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                padding: 8,
                borderRadius: tokens.radius.sm,
                zIndex: 2,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
            <video
              ref={videoRef}
              src="/demo-advokat.mp4"
              controls
              autoPlay
              playsInline
              preload="metadata"
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                maxHeight: '85vh',
                background: '#000',
              }}
            >
              Nettleseren din støtter ikke avspilling av video.
              <a href="/demo-advokat.mp4" style={{ color: tokens.color.gold }}>
                Last ned videoen istedenfor
              </a>
              .
            </video>
          </div>
        </div>
      )}
    </>
  );
}
