'use client';

/**
 * VoiceNoteRecorder, kompakt inline-opptaker for klistrelapper.
 *
 * Bruker native MediaRecorder + getUserMedia (ingen avhengigheter). Lagrer
 * opptaket som base64 webm/opus (eller browser-default som fallback) og
 * leverer det til parent via onChange. Parent er ansvarlig for å sende
 * verdien videre til backend (PATCH /stickies/:id).
 *
 * Designvalg:
 *  - Max 60 sek per opptak: auto-stopp ved grensen. Begrunnelse: holder
 *    DB-størrelse rimelig (~150 KB per notat ved opus@32 kbps) og bruker
 *    bør heller dele lengre tanker opp i flere notater.
 *  - Slipper alltid mikrofon-tracks når opptak er ferdig, viktig på Mac
 *    for å skru av rød LED ved siden av kameraet og i Windows for å
 *    fjerne "i bruk"-ikonet i system-tray.
 *  - Hvis MediaRecorder eller opus ikke støttes, brukes browserens default
 *    container (ofte audio/mp4 på Safari). Vi sender mimeType med base64
 *    til backend så avspilleren senere får riktig <audio>-type.
 */

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Play } from 'lucide-react';
import { tokens } from '@/lib/tokens';

export interface VoiceNoteValue {
  audioBase64: string;
  audioDurationSec: number;
  audioMimeType: string;
}

interface Props {
  value: VoiceNoteValue | null;
  onChange: (value: VoiceNoteValue | null) => void;
  disabled?: boolean;
  /** Max opptaks-tid i sekunder. Default 60. */
  maxSec?: number;
}

const DEFAULT_MAX_SEC = 60;
const PREFERRED_MIME = 'audio/webm;codecs=opus';

/**
 * Velger første støttede mimeType i prioritert rekkefølge. Returnerer
 * tom streng hvis ingen er støttet, da lar vi MediaRecorder velge
 * browser-default (Safari bruker f.eks. audio/mp4).
 */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    PREFERRED_MIME,
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // Eldre browsere kaster på ukjente typer, bare hopp over.
    }
  }
  return '';
}

/**
 * true hvis vi har alt vi trenger for å ta opp lyd i denne browseren.
 * Sjekkes ved mount så vi viser informativ melding i stedet for en knapp
 * som garantert vil feile.
 */
function isRecordingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof MediaRecorder === 'undefined') return false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  return true;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Kunne ikke lese opptak'));
        return;
      }
      // FileReader gir "data:audio/webm;base64,XXXX", vi vil bare ha XXXX.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Lesefeil'));
    reader.readAsDataURL(blob);
  });
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VoiceNoteRecorder({
  value,
  onChange,
  disabled = false,
  maxSec = DEFAULT_MAX_SEC,
}: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef<number>(0);
  const mimeRef = useRef<string>('');

  // Sjekk støtte ved mount. Vi gjør dette i useEffect i stedet for direkte
  // i state-init for å unngå SSR-mismatch (window finnes ikke på serveren).
  useEffect(() => {
    setSupported(isRecordingSupported());
  }, []);

  // Cleanup ved unmount: stopp recorder og slipp mikrofon.
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignorer */ }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // NotAllowedError = bruker sa nei. Andre = ingen mikrofon/krasj.
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Mikrofon-tilgang ble nektet. Tillat mikrofon i nettleser-innstillingene.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('Fant ingen mikrofon på enheten.');
      } else {
        setError('Kunne ikke starte mikrofon: ' + (err instanceof Error ? err.message : 'ukjent feil'));
      }
      return;
    }

    streamRef.current = stream;
    const mime = pickMimeType();
    mimeRef.current = mime;

    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      cleanup();
      setError('Browseren støtter ikke lydopptak: ' + (err instanceof Error ? err.message : 'ukjent feil'));
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const recordedSec = Math.max(1, Math.round((Date.now() - startTsRef.current) / 1000));
      // Bruk faktisk mimeType fra recorder hvis tilgjengelig, kan avvike
      // litt fra det vi ba om (f.eks. Safari kan gi audio/mp4 selv om vi ba
      // om webm).
      const actualMime = recorder.mimeType || mimeRef.current || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: actualMime });
      chunksRef.current = [];

      // Frigi mikrofon før vi gjør base64-konvertering (raskere LED-av).
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecording(false);

      try {
        const base64 = await blobToBase64(blob);
        onChange({
          audioBase64: base64,
          audioDurationSec: recordedSec,
          audioMimeType: actualMime,
        });
      } catch (err) {
        setError('Kunne ikke lagre opptak: ' + (err instanceof Error ? err.message : 'ukjent feil'));
      }
    };

    recorderRef.current = recorder;
    startTsRef.current = Date.now();
    setElapsedSec(0);
    recorder.start();
    setRecording(true);

    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startTsRef.current) / 1000);
      setElapsedSec(sec);
      if (sec >= maxSec) {
        // Auto-stopp, onstop-handleren tar resten.
        stopRecording();
      }
    }, 250);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Hvis stop() feiler, gjør hard cleanup så vi ikke henger i opptaks-state.
        cleanup();
        setRecording(false);
      }
    }
  }

  function deleteAudio() {
    if (!confirm('Slette stemmenotat?')) return;
    onChange(null);
  }

  // SSR-fase eller før første client-render: vis ingenting for å unngå mismatch.
  if (supported === null) return null;

  if (!supported) {
    return (
      <div style={hintStyle}>
        Voice notes støttes ikke i din nettleser.
      </div>
    );
  }

  // Har vi allerede et opptak? Vis avspiller + slett-knapp + ny-opptak-knapp.
  if (value) {
    const dataUrl = `data:${value.audioMimeType};base64,${value.audioBase64}`;
    return (
      <div style={wrapStyle}>
        <audio
          controls
          src={dataUrl}
          preload="metadata"
          style={{ width: '100%', height: 32 }}
          aria-label="Spill av stemmenotat"
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled || recording}
            style={smallBtn}
            title="Spill inn på nytt"
          >
            <Mic size={12} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Spill inn på nytt
          </button>
          <button
            type="button"
            onClick={deleteAudio}
            disabled={disabled}
            style={{ ...smallBtn, color: '#B91C1C', borderColor: '#FCA5A5' }}
            title="Slett stemmenotat"
          >
            <Trash2 size={12} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Slett
          </button>
        </div>
        {error && <div style={errStyle}>{error}</div>}
      </div>
    );
  }

  // Aktivt opptak pågår.
  if (recording) {
    const remaining = Math.max(0, maxSec - elapsedSec);
    return (
      <div style={wrapStyle}>
        <button
          type="button"
          onClick={stopRecording}
          style={{
            ...recordBtn,
            background: '#DC2626',
            color: 'white',
            animation: 'sakspilotPulse 1.2s ease-in-out infinite',
          }}
        >
          <Square size={14} strokeWidth={3} fill="white" style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Stopp ({formatDuration(elapsedSec)} / {formatDuration(maxSec)})
        </button>
        <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 4 }}>
          Stopper automatisk om {remaining} sek
        </div>
        <style jsx>{`
          @keyframes sakspilotPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.75; }
          }
        `}</style>
      </div>
    );
  }

  // Klar til å starte.
  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        style={recordBtn}
        title={`Spill inn stemmenotat (maks ${maxSec} sek)`}
      >
        <Mic size={14} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Spill inn
      </button>
      {error && <div style={errStyle}>{error}</div>}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
};

const recordBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.7)',
  border: `1px solid ${tokens.color.border}`,
  padding: '6px 10px',
  borderRadius: tokens.radius.sm,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  color: tokens.color.text,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const smallBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.7)',
  border: `1px solid ${tokens.color.border}`,
  padding: '4px 8px',
  borderRadius: tokens.radius.sm,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  color: tokens.color.text,
  display: 'inline-flex',
  alignItems: 'center',
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: tokens.color.textMuted,
  fontStyle: 'italic',
  padding: '4px 0',
};

const errStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#B91C1C',
  marginTop: 4,
  background: '#FEE2E2',
  padding: '4px 6px',
  borderRadius: 4,
};

/**
 * Hjelper: kompakt avspillings-pill for visning utenfor edit-modus.
 * Ikke brukt internt, eksportert så andre views kan vise audio uten
 * full recorder-UI.
 */
export function VoiceNoteBadge({ value }: { value: VoiceNoteValue }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(`data:${value.audioMimeType};base64,${value.audioBase64}`);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onpause = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      style={{
        background: 'rgba(255,255,255,0.5)',
        border: `1px solid ${tokens.color.border}`,
        padding: '2px 6px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 10,
        color: tokens.color.text,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
      title={playing ? 'Stopp avspilling' : 'Spill av stemmenotat'}
    >
      {playing
        ? <Square size={9} strokeWidth={3} fill="currentColor" />
        : <Play size={9} strokeWidth={3} fill="currentColor" />}
      {formatDuration(value.audioDurationSec)}
    </button>
  );
}
