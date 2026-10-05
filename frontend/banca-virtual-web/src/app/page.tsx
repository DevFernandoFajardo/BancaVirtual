'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoader } from '@/components/ui/Spinner';
import { getToken } from '@/lib/session';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getToken() ? '/dashboard' : '/login');
  }, [router]);

  return <PageLoader />;
}
