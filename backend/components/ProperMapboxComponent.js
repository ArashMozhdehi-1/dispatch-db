import { useEffect, useRef, useState } from 'react';

export default function ProperMapboxComponent() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locations, setLocations] = useState([]);
  const [segments, setSegments] = useState([]);
  const [currentStyle, setCurrentStyle] = useState('Satellite Streets');

  const mapStyles = [
    { name: 'Satellite Streets', value: 'mapbox://styles/mapbox/satellite-streets-v11' },
    { name: 'Topographic', value: 'mapbox://styles/mapbox/outdoors-v11' },
    { name: 'Streets', value: 'mapbox://styles/mapbox/streets-v11' },
    { name: 'Satellite', value: 'mapbox://styles/mapbox/satellite-v9' },
    { name: 'Standard', value: 'mapbox://styles/mapbox/standard' },
    { name: 'Dark', value: 'mapbox://styles/mapbox/dark-v10' },
    { name: 'Topographic Dark', value: 'mapbox://styles/mapbox/navigation-night-v1' },
    { name: 'Streets Dark', value: 'mapbox://styles/mapbox/dark-v10' }
  ];

  useEffect(() => {
    const loadLeaflet = () => {
      if (window.L) {
        initializeMap();
        return;
      }

      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.3/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!document.querySelector('script[src*="leaflet.js"]')) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.3/dist/leaflet.js';
        script.onload = () => {
          console.log('Leaflet loaded successfully');
          initializeMap();
        };
        script.onerror = () => {
          console.error('Failed to load Leaflet');
        };
        document.head.appendChild(script);
      }
    };

    loadLeaflet();
  }, []);

  const initializeMap = () => {
    if (!window.L || !mapContainer.current || map.current) return;

    map.current = window.L.map(mapContainer.current, {
      center: [-23.847083, 148.980202],
      zoom: 11,
      zoomControl: true
    });

    const mapboxToken = 'pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw';
    
    const defaultStyle = mapStyles.find(s => s.name === 'Satellite Streets');
    const tileLayer = window.L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`, {
      attribution: '© Mapbox © OpenStreetMap',
      maxZoom: 22
    });

    tileLayer.addTo(map.current);

    map.current._currentTileLayer = tileLayer;

    setMapLoaded(true);
    console.log('✅ Leaflet map loaded successfully');
    
    loadData();
  };

  const loadData = async () => {
    try {
      const locationsResponse = await fetch('/api/locations');
      const locationsData = await locationsResponse.json();
      setLocations(locationsData);
      console.log('Loaded locations:', locationsData.length);

      const segmentsResponse = await fetch('/api/segments');
      const segmentsData = await segmentsResponse.json();
      setSegments(segmentsData);
      console.log('Loaded segments:', segmentsData.length);

      addDataToMap(locationsData, segmentsData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const addDataToMap = (locationsData, segmentsData) => {
    if (!map.current) return;

    if (map.current._locationMarkers) {
      map.current._locationMarkers.clearLayers();
    }
    if (map.current._segmentLines) {
      map.current._segmentLines.clearLayers();
    }

    const locationMarkers = window.L.layerGroup();
    const segmentLines = window.L.layerGroup();

    locationsData.forEach(location => {
      const color = getLocationColor(location.unit_type);
      const marker = window.L.circleMarker([location.latitude, location.longitude], {
        radius: 6,
        fillColor: color,
        color: '#FFFFFF',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      });

      marker.bindPopup(`
        <div>
          <strong>${location.location_name}</strong><br>
          Type: ${location.unit_type}<br>
          Category: ${location.location_category || 'N/A'}
        </div>
      `);

      locationMarkers.addLayer(marker);
    });

    segmentsData.forEach(segment => {
      if (segment.geometry && segment.geometry.coordinates) {
        const color = segment.status === 'open' ? '#2ECC71' : '#E74C3C';
        const polyline = window.L.polyline(segment.geometry.coordinates, {
          color: color,
          weight: 3,
          opacity: 0.8
        });

        polyline.bindPopup(`
          <div>
            <strong>Road Segment</strong><br>
            Status: ${segment.status}<br>
            ID: ${segment.segment_id}
          </div>
        `);

        segmentLines.addLayer(polyline);
      }
    });

    locationMarkers.addTo(map.current);
    segmentLines.addTo(map.current);

    map.current._locationMarkers = locationMarkers;
    map.current._segmentLines = segmentLines;
  };

  const changeMapStyle = (styleName) => {
    if (!map.current) return;

    const style = mapStyles.find(s => s.name === styleName);
    if (!style) return;

    setCurrentStyle(styleName);

    if (map.current._currentTileLayer) {
      map.current.removeLayer(map.current._currentTileLayer);
    }

    const mapboxToken = 'pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw';
    const newTileLayer = window.L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${style.value.split('/').pop()}/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`, {
      attribution: '© Mapbox © OpenStreetMap',
      maxZoom: 22
    });

    newTileLayer.addTo(map.current);
    map.current._currentTileLayer = newTileLayer;
  };

  const getLocationColor = (type) => {
    const colors = {
      'Call Point': '#FF6B6B',
      'Dump': '#4ECDC4',
      'Blast': '#45B7D1',
      'Stockpile': '#96CEB4',
      'Workshop': '#FFEAA7',
      'Shiftchange': '#DDA0DD',
      'Region': '#98D8C8',
      'Crusher': '#F7DC6F',
      'Pit': '#BB8FCE'
    };
    return colors[type] || '#95A5A6';
  };

  const getLocationCounts = () => {
    const counts = {};
    locations.forEach(location => {
      const type = location.unit_type || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  };

  const getRoadCounts = () => {
    const openRoads = segments.filter(s => s.status === 'open').length;
    const closedRoads = segments.filter(s => s.status === 'closed').length;
    return { open: openRoads, closed: closedRoads };
  };

  const locationCounts = getLocationCounts();
  const roadCounts = getRoadCounts();

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {!mapLoaded && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
          zIndex: 10
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
              Loading Leaflet Map...
            </div>
            <div style={{ color: '#6b7280' }}>Please wait while the map loads</div>
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        backgroundColor: 'rgba(60, 60, 60, 0.9)',
        border: '1px solid rgba(120, 120, 120, 0.5)',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(10px)'
      }}>
        <select
          value={currentStyle}
          onChange={(e) => changeMapStyle(e.target.value)}
          style={{
            backgroundColor: 'transparent',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {mapStyles.map(style => (
            <option key={style.name} value={style.name} style={{ backgroundColor: '#3c3c3c', color: 'white' }}>
              {style.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        backgroundColor: 'rgba(60, 60, 60, 0.9)',
        border: '1px solid rgba(120, 120, 120, 0.5)',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(10px)',
        padding: '16px',
        minWidth: '250px'
      }}>
        <h3 style={{ 
          color: 'white', 
          fontWeight: 'bold', 
          fontSize: '16px', 
          marginBottom: '12px',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
        }}>Mine Map</h3>
        
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ 
            color: 'white', 
            fontWeight: '600', 
            marginBottom: '8px',
            fontSize: '14px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
          }}>Road Layers</h4>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '16px', height: '4px', backgroundColor: '#2ECC71', marginRight: '8px' }}></div>
              <span style={{ color: 'white', fontSize: '12px', textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)' }}>Open Roads</span>
            </div>
            <span style={{ color: 'white', fontSize: '12px', fontFamily: 'monospace', textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)' }}>{roadCounts.open}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '16px', height: '4px', backgroundColor: '#E74C3C', marginRight: '8px' }}></div>
              <span style={{ color: 'white', fontSize: '12px', textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)' }}>Closed Roads</span>
            </div>
            <span style={{ color: 'white', fontSize: '12px', fontFamily: 'monospace', textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)' }}>{roadCounts.closed}</span>
          </div>
        </div>

        <div>
          <h4 style={{ 
            color: 'white', 
            fontWeight: '600', 
            marginBottom: '8px',
            fontSize: '14px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
          }}>Location Types</h4>
          {Object.entries(locationCounts).map(([type, count]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div 
                  style={{ 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    marginRight: '8px',
                    backgroundColor: getLocationColor(type)
                  }}
                ></div>
                <span style={{ color: 'white', fontSize: '12px', textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)' }}>{type}</span>
              </div>
              <span style={{ color: 'white', fontSize: '12px', fontFamily: 'monospace', textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {mapLoaded && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          backgroundColor: 'rgba(16, 185, 129, 0.9)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
        }}>
          Map Loaded Successfully!
        </div>
      )}
    </div>
  );
}
