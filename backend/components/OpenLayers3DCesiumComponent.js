import { useEffect, useRef, useState } from 'react';

export default function OpenLayers3DCesiumComponent() {
  const mapContainer = useRef(null);
  const cesiumViewerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [baseLayer, setBaseLayer] = useState('satellite');

  useEffect(() => {
    return () => {
      // Cleanup on unmount - defensive approach
      if (cesiumViewerRef.current) {
        try {
          const viewer = cesiumViewerRef.current;
          // Check if viewer is still valid and not already destroyed
          if (viewer) {
            // Check if already destroyed
            const isDestroyed = viewer.isDestroyed ? viewer.isDestroyed() : false;
            
            if (!isDestroyed) {
              // Stop rendering before destroying
              try {
                if (viewer.scene && viewer.scene.requestRenderMode !== undefined) {
                  viewer.scene.requestRenderMode = false;
                }
              } catch (e) {
                // Scene might already be destroyed
              }
              
              // Try to destroy the viewer
              try {
                viewer.destroy();
              } catch (destroyError) {
                // If destroy fails, the viewer might already be cleaning up
                // Just clear the reference
                console.debug('Cesium viewer cleanup:', destroyError.message);
              }
            }
          }
        } catch (e) {
          // Silently handle cleanup errors - component is unmounting anyway
          console.debug('Cesium cleanup error:', e.message);
        } finally {
          cesiumViewerRef.current = null;
        }
      }
    };
  }, []);

  const loadMap = async () => {
    if (!mapContainer.current || cesiumViewerRef.current) return;

    try {
      // Load Cesium CSS
      if (!document.querySelector('link[href*="Widgets.css"]')) {
        const cesiumCSS = document.createElement('link');
        cesiumCSS.rel = 'stylesheet';
        cesiumCSS.type = 'text/css';
        cesiumCSS.href = 'https://cesium.com/downloads/cesiumjs/releases/1.126/Build/Cesium/Widgets/widgets.css';
        document.head.appendChild(cesiumCSS);
      }

      // Load Cesium JS
      if (!window.Cesium) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.126/Build/Cesium/Cesium.js';
          script.onload = () => {
            console.log('[OpenLayers3D Cesium] Cesium loaded');
            resolve();
          };
          script.onerror = () => reject(new Error('Failed to load Cesium'));
          document.head.appendChild(script);
        });
      }

      initializeMap();
    } catch (error) {
      console.error('[OpenLayers3D Cesium] Error loading libraries:', error);
      setMapError(error.message);
    }
  };

  const initializeMap = async () => {
    if (!mapContainer.current || !window.Cesium) {
      console.error('[OpenLayers3D Cesium] Required libraries not loaded');
      return;
    }

    try {
      // Disable Cesium Ion (we'll use free tile providers)
      if (window.Cesium.Ion) {
        window.Cesium.Ion.defaultAccessToken = undefined;
        window.Cesium.Ion.defaultServer = undefined;
      }

      const getImageryProvider = (layerType) => {
        switch (layerType) {
          case 'satellite':
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              credit: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
            });
          case 'dark':
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              credit: '© OpenStreetMap contributors, © CARTO'
            });
          case 'topographic':
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
              credit: '© OpenTopoMap contributors',
              subdomains: ['a', 'b', 'c']
            });
          default:
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              credit: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
            });
        }
      };

      const initialProvider = getImageryProvider(baseLayer);

      // Create Cesium 3D Viewer
      const cesiumViewer = new window.Cesium.Viewer(mapContainer.current, {
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        selectionIndicator: false,
        terrainProvider: new window.Cesium.EllipsoidTerrainProvider(),
        imageryProvider: initialProvider,
        shouldAnimate: false,
        sceneMode: window.Cesium.SceneMode.SCENE3D,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity
      });

      // Remove default imagery and add our custom one
      cesiumViewer.imageryLayers.removeAll();
      cesiumViewer.imageryLayers.addImageryProvider(initialProvider);
      
      // Configure globe
      cesiumViewer.scene.globe.depthTestAgainstTerrain = false;
      cesiumViewer.scene.globe.enableLighting = true;
      
      // Configure camera controls for smooth interaction
      const scene = cesiumViewer.scene;
      scene.screenSpaceCameraController.inertiaSpin = 0.9;
      scene.screenSpaceCameraController.inertiaTranslate = 0.9;
      scene.screenSpaceCameraController.inertiaZoom = 0.8;
      
      // Set initial camera position (adjust to your area of interest)
      cesiumViewer.camera.setView({
        destination: window.Cesium.Cartesian3.fromDegrees(148.980202, -23.847083, 50000),
        orientation: {
          heading: window.Cesium.Math.toRadians(0),
          pitch: window.Cesium.Math.toRadians(-45),
          roll: 0.0
        }
      });

      // Hide Cesium branding and credits
      setTimeout(() => {
        if (cesiumViewer.creditContainer) {
          cesiumViewer.creditContainer.style.display = 'none';
          cesiumViewer.creditContainer.innerHTML = '';
        }
        if (cesiumViewer.bottomContainer) {
          cesiumViewer.bottomContainer.style.display = 'none';
        }
        try {
          const widget = cesiumViewer._cesiumWidget;
          if (widget && widget._creditContainer) {
            widget._creditContainer.style.display = 'none';
            widget._creditContainer.innerHTML = '';
          }
        } catch (e) {}
        if (mapContainer.current) {
          const allLinks = mapContainer.current.querySelectorAll('a[href*="cesium.com"]');
          allLinks.forEach(link => link.style.display = 'none');
        }
        
        const style = document.createElement('style');
        style.textContent = `
          .cesium-viewer-bottom,
          .cesium-viewer-cesiumWidgetContainer .cesium-widget-credits,
          .cesium-viewer-cesiumLogoContainer,
          .cesium-credit-logoContainer,
          .cesium-credit-expand-link,
          .cesium-viewer-creditTextContainer {
            display: none !important;
          }
          a[href*="cesium.com"],
          a[href*="cesiumion.com"] {
            display: none !important;
          }
          .cesium-widget-credits {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
      }, 100);

      cesiumViewerRef.current = cesiumViewer;
      setMapLoaded(true);
      cesiumViewer.scene.requestRender();
    } catch (error) {
      console.error('[OpenLayers3D Cesium] Error initializing map:', error);
      setMapError(error.message);
    }
  };

  useEffect(() => {
    loadMap();
  }, []);

  // Handle base layer changes
  useEffect(() => {
    if (cesiumViewerRef.current && mapLoaded && window.Cesium) {
      try {
        const viewer = cesiumViewerRef.current;
        // Check if viewer is still valid
        if (!viewer || (viewer.isDestroyed && viewer.isDestroyed())) {
          return;
        }
        
        const provider = (() => {
          switch (baseLayer) {
            case 'satellite':
              return new window.Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                credit: '© Esri'
              });
            case 'dark':
              return new window.Cesium.UrlTemplateImageryProvider({
                url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                credit: '© CARTO'
              });
            case 'topographic':
              return new window.Cesium.UrlTemplateImageryProvider({
                url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                credit: '© OpenTopoMap',
                subdomains: ['a', 'b', 'c']
              });
            default:
              return new window.Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                credit: '© Esri'
              });
          }
        })();
        
        if (viewer.imageryLayers) {
          viewer.imageryLayers.removeAll();
          viewer.imageryLayers.addImageryProvider(provider);
        }
        
        if (viewer.scene && viewer.scene.requestRender) {
          viewer.scene.requestRender();
        }
      } catch (error) {
        console.warn('[OpenLayers3D Cesium] Error changing base layer:', error);
      }
    }
  }, [baseLayer, mapLoaded]);

  if (mapError) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        color: '#fff',
        flexDirection: 'column',
        padding: '20px'
      }}>
        <h2 style={{ color: '#dc2626', marginBottom: '12px' }}>Error Loading 3D Globe</h2>
        <p style={{ color: '#9ca3af', marginBottom: '20px' }}>{mapError}</p>
        <button
          onClick={() => {
            setMapError(null);
            loadMap();
          }}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
      
      {/* Base Layer Selector */}
      {mapLoaded && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          backgroundColor: 'rgba(30, 30, 30, 0.95)',
          border: '2px solid rgba(120, 120, 120, 0.6)',
          borderRadius: '8px',
          padding: '12px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ color: 'white', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
            Base Layer
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {['satellite', 'dark', 'topographic'].map((layer) => (
              <button
                key={layer}
                onClick={() => setBaseLayer(layer)}
                style={{
                  backgroundColor: baseLayer === layer ? '#3b82f6' : 'transparent',
                  color: 'white',
                  border: '1px solid rgba(120, 120, 120, 0.4)',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s ease'
                }}
              >
                {layer}
              </button>
            ))}
          </div>
        </div>
      )}

      {!mapLoaded && !mapError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          color: '#fff',
          fontSize: '18px',
          textAlign: 'center'
        }}>
          Loading 3D Globe...
        </div>
      )}
    </div>
  );
}
