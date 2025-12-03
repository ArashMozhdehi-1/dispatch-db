import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

const ConsolidatedPolygonMap = dynamic(() => import('../components/ConsolidatedPolygonMap'), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading Dispatch Map...</div>
});

export default function DispatchMapPage() {
  const router = useRouter();

  return (
    <>

      {/* Switch to Frontrunner Button */}
      <button
        onClick={() => router.push('/frontrunner-map')}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          border: '2px solid rgba(16, 185, 129, 0.5)',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#10B981',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '20px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.3)';
          e.target.style.transform = 'scale(1.05) rotate(180deg)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
          e.target.style.transform = 'scale(1) rotate(0deg)';
        }}
        title="Switch to Frontrunner Map"
      >
        🔄
      </button>

      <ConsolidatedPolygonMap
        showDispatchData={true}
        showFrontrunnerData={true}
        centerOn="dispatch"
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

