'use client';

import { Palette } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import ThemePicker from '@/components/ThemePicker';
import { tokens } from '@/lib/tokens';

export default function UtseendePage() {
  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 26,
              color: tokens.color.navy,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Palette size={26} strokeWidth={2} />
            Utseende
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Tilpass fargedesign og utseende for Sakspilot
          </p>
        </div>

        <section
          style={{
            background: 'white',
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.lg,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 6 }}>Fargetema</h2>
          <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 16 }}>
            Velg fargesett. Endringen lagres lokalt og trer i kraft umiddelbart.
          </p>
          <ThemePicker />
        </section>
      </div>
    </AppLayout>
  );
}
