import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import ErrorBoundary from '../components/ErrorBoundary';

const MapboxComponent = dynamic(() => import('../components/MapboxComponent'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading Mapbox Map...
    </div>
  )
});

const GeoServerMapboxComponent = dynamic(() => import('../components/GeoServerMapboxComponent'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading GeoServer Mapbox Map...
    </div>
  )
});

const GeoServerOpenLayersComponent = dynamic(() => import('../components/GeoServerOpenLayersComponent'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading GeoServer OpenLayers Map...
    </div>
  )
});

const OpenLayers3DCesiumComponent = dynamic(() => import('../components/OpenLayers3DCesiumComponent'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666',
      backgroundColor: '#000'
    }}>
      Loading 3D Globe (OpenLayers + Cesium)...
    </div>
  )
});



export default function Home() {
  const [mapType, setMapType] = useState('mapbox'); // Mapbox is default
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Global WebGL context loss prevention
  useEffect(() => {
    const preventWebGLContextLoss = (event) => {
      console.warn('⚠️ Global WebGL context lost, preventing default');
      event.preventDefault();
      return false;
    };

    const handleWebGLContextRestored = (event) => {
      console.log('✅ Global WebGL context restored');
      event.preventDefault();
      return false;
    };

    // Add global WebGL context loss prevention
    document.addEventListener('webglcontextlost', preventWebGLContextLoss, true);
    document.addEventListener('webglcontextrestored', handleWebGLContextRestored, true);

    return () => {
      document.removeEventListener('webglcontextlost', preventWebGLContextLoss, true);
      document.removeEventListener('webglcontextrestored', handleWebGLContextRestored, true);
    };
  }, []);

  const handleMapTypeChange = (newMapType) => {
    if (newMapType === mapType) return;
    
    setIsTransitioning(true);
    
    // Add a longer delay to allow proper cleanup of WebGL contexts
    // and prevent context conflicts between different map libraries
    setTimeout(() => {
      setMapType(newMapType);
      setIsTransitioning(false);
    }, 300);
  };

  return (
    <>
      <Head>
        <title>Dispatch Database - Interactive Map</title>
        <meta httpEquiv="content-type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      {/* Map Type Toggle */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        border: '2px solid rgba(120, 120, 120, 0.6)',
        borderRadius: '8px',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(10px)',
        padding: '8px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
      }}>
        <button
          onClick={() => handleMapTypeChange('mapbox')}
          disabled={isTransitioning}
          style={{
            backgroundColor: mapType === 'mapbox' ? '#10B981' : 'transparent',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: isTransitioning ? 'not-allowed' : 'pointer',
            opacity: isTransitioning ? 0.6 : 1,
            transition: 'all 0.3s ease',
            boxShadow: mapType === 'mapbox' ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none'
          }}
        >
          Mapbox
        </button>
        <button
          onClick={() => handleMapTypeChange('geoserver-mapbox')}
          disabled={isTransitioning}
          style={{
            backgroundColor: mapType === 'geoserver-mapbox' ? '#3B82F6' : 'transparent',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: isTransitioning ? 'not-allowed' : 'pointer',
            opacity: isTransitioning ? 0.6 : 1,
            transition: 'all 0.3s ease',
            boxShadow: mapType === 'geoserver-mapbox' ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none'
          }}
        >
          GeoServer
        </button>
        <button
          onClick={() => handleMapTypeChange('geoserver-openlayers')}
          disabled={isTransitioning}
          style={{
            backgroundColor: mapType === 'geoserver-openlayers' ? '#8B5CF6' : 'transparent',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: isTransitioning ? 'not-allowed' : 'pointer',
            opacity: isTransitioning ? 0.6 : 1,
            transition: 'all 0.3s ease',
            boxShadow: mapType === 'geoserver-openlayers' ? '0 2px 8px rgba(139, 92, 246, 0.4)' : 'none'
          }}
        >
          OpenLayers
        </button>
        <button
          onClick={() => handleMapTypeChange('openlayers-3d-cesium')}
          disabled={isTransitioning}
          style={{
            backgroundColor: mapType === 'openlayers-3d-cesium' ? '#EC4899' : 'transparent',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: isTransitioning ? 'not-allowed' : 'pointer',
            opacity: isTransitioning ? 0.6 : 1,
            transition: 'all 0.3s ease',
            boxShadow: mapType === 'openlayers-3d-cesium' ? '0 2px 8px rgba(30, 32, 128, 0.4)' : 'none'
          }}
        >
          Open Layers 3D
        </button>
      </div>

      {isTransitioning && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10001,
          backgroundColor: 'rgba(30, 30, 30, 0.95)',
          border: '2px solid rgba(120, 120, 120, 0.6)',
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          color: 'white',
          fontSize: '16px',
          fontWeight: '600'
        }}>
          Switching map components...
        </div>
      )}

      {mapType === 'mapbox' && (
        <ErrorBoundary>
          <MapboxComponent />
        </ErrorBoundary>
      )}
      {mapType === 'geoserver-mapbox' && (
        <ErrorBoundary>
          <GeoServerMapboxComponent />
        </ErrorBoundary>
      )}
      {mapType === 'geoserver-openlayers' && (
        <ErrorBoundary>
          <GeoServerOpenLayersComponent />
        </ErrorBoundary>
      )}
      {mapType === 'openlayers-3d-cesium' && (
        <ErrorBoundary>
          <OpenLayers3DCesiumComponent />
        </ErrorBoundary>
      )}

      <style jsx global>{`
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
        }
      `}</style>
    </>
  );
}

