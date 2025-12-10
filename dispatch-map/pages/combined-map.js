import dynamic from 'next/dynamic';

const CombinedMap = dynamic(() => import('../components/CombinedMap'), {
  ssr: false,
});

export default function CombinedMapPage() {
  return <CombinedMap />;
}


