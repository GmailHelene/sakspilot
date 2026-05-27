'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import { isTokenValid } from '@/lib/api';
import { tokens } from '@/lib/tokens';

/**
 * Layout for innloggede sider — header på toppen, sidebar til venstre,
 * innhold til høyre. Redirecter til /login hvis ikke autentisert.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isTokenValid()) {
      router.replace('/login');
      return;
    }
    setAuthed(true);
  }, [router]);

  if (authed === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: tokens.color.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tokens.color.textMuted,
        }}
      >
        Laster…
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            background: tokens.color.bg,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
