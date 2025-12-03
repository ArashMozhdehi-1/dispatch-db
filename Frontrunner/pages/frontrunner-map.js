import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

const ConsolidatedPolygonMap = dynamic(() => import('../components/ConsolidatedPolygonMap'), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading Frontrunner Map...</div>
});

export default function FrontrunnerMapPage() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Frontrunner Map</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      {/* Switch to Dispatch Button */}
      <button 
        onClick={() => router.push('/dispatch-map')}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          border: '2px solid rgba(59, 130, 246, 0.5)',
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          color: '#3B82F6',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '20px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 16px rgba(59, 130, 246, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
          e.target.style.transform = 'scale(1.05) rotate(180deg)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
          e.target.style.transform = 'scale(1) rotate(0deg)';
        }}
        title="Switch to Dispatch Map"
      >
        🔄
      </button>

      <ConsolidatedPolygonMap 
        showDispatchData={true}
        showFrontrunnerData={true}
        centerOn="frontrunner"
      />

      <style jsx global>{`
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      `}</style>
    </>
  );
}

