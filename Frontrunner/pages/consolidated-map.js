import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ConsolidatedMapPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
