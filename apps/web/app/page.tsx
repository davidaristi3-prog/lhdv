'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

// Landing: lleva a cada rol a su pantalla de inicio (el domiciliario a su ruta).
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else router.replace(user.role === 'DELIVERY' ? '/mi-ruta' : '/pedidos');
  }, [user, loading, router]);
  return <div className="p-10 text-center text-neutral-500">Cargando…</div>;
}
