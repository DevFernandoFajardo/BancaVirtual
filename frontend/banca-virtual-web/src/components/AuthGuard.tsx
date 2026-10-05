'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getToken } from '@/lib/session';
import { PageLoader } from './ui/Spinner';

/** Solo deja ver las páginas privadas si hay sesión; si no, manda al login. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return <PageLoader />;
  return <>{children}</>;
}
