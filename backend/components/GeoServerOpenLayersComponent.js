import { useEffect, useRef, useState } from 'react';

export default function GeoServerOpenLayersComponent() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [segments, setSegments] = useState([]);
  const [trolleySegments, setTrolleySegments] = useState([]);
  const [wateringStations, setWateringStations] = useState([]);
  const [speedMonitoring, setSpeedMonitoring] = useState([]);
  const [intersections, setIntersections] = useState([]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const loadOpenLayers = async () => {
      try {
        // Load OpenLayers CSS
        if (!document.querySelector('link[href*="ol.css"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://cdn.jsdelivr.net/npm/ol@8.2.0/ol.css';
          document.head.appendChild(link);
        }

        // Load OpenLayers JS
        if (!window.ol) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/ol@8.2.0/dist/ol.js';
            script.onload = () => {
              console.log('[GeoServer OpenLayers] OpenLayers loaded');
              resolve();
            };
            script.onerror = () => reject(new Error('Failed to load OpenLayers'));
            document.head.appendChild(script);
          });
        }

        initializeMap();
      } catch (error) {
        console.error('[GeoServer OpenLayers] Error loading libraries:', error);
        setMapError(error.message);
      }
    };

    loadOpenLayers();

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
        mapRef.current = null;
      }
    };
  }, []);

  const initializeMap = () => {
    if (!mapContainer.current || !window.ol) {
      console.error('[GeoServer OpenLayers] Required libraries not loaded');
      return;
    }

    try {
      const ol = window.ol;

      // Create map
      const map = new ol.Map({
        target: mapContainer.current,
        layers: [
          new ol.layer.Tile({
            source: new ol.source.XYZ({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              attributions: '© Esri'
            })
          })
        ],
        view: new ol.View({
          center: ol.proj.fromLonLat([148.980202, -23.847083]),
          zoom: 11,
          maxZoom: 24
        }),
        controls: ol.control.defaults({
          attribution: false
        })
      });

      mapRef.current = map;

      map.once('rendercomplete', () => {
        console.log('✅ GeoServer OpenLayers map loaded successfully');
        setMapLoaded(true);
        loadData();
      });
    } catch (error) {
      console.error('[GeoServer OpenLayers] Error initializing map:', error);
      setMapError(error.message);
    }
  };

  const loadData = async () => {
    try {
      const [locationsResponse, segmentsResponse, trolleyResponse, wateringResponse, speedResponse, intersectionsResponse] = await Promise.all([
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query {
                locations {
                  location_id
                  location_name
                  latitude
                  longitude
                  unit_type
                  location_category
                }
              }
            `
          })
        }),
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query {
                segments {
                  lane_id
                  road_id
                  geometry
                  is_closed
                  direction
                  length_m
                }
              }
            `
          })
        }),
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query {
                trolleySegments {
                  lane_id
                  lane_name
                  direction
                  length_m
                  trolley_voltage
                  trolley_current_limit
                  trolley_wire_height
                  start_latitude
                  start_longitude
                  end_latitude
                  end_longitude
                }
              }
            `
          })
        }),
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query {
                wateringStations {
                  station_id
                  station_name
                  station_code
                  station_type
                  capacity_liters
                  current_level_percent
                  status
                  latitude
                  longitude
                }
              }
            `
          })
        }),
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query {
                speedMonitoring {
                  monitoring_id
                  lane_id
                  measure
                  speed_kmh
                  violation_type
                  operational_mode
                  latitude
                  longitude
                }
              }
            `
          })
        }),
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query {
                intersections {
                  intersection_id
                  intersection_name
                  intersection_type
                  geometry
                  safety_buffer_m
                  r_min_m
                  created_at
                }
              }
            `
          })
        })
      ]);

      const [locationsData, segmentsData, trolleyData, wateringData, speedData, intersectionsData] = await Promise.all([
        locationsResponse.json(),
        segmentsResponse.json(),
        trolleyResponse.json(),
        wateringResponse.json(),
        speedResponse.json(),
        intersectionsResponse.json()
      ]);

      const locations = locationsData.data?.locations || [];
      const segments = segmentsData.data?.segments || [];
      const trolleySegments = trolleyData.data?.trolleySegments || [];
      const wateringStations = wateringData.data?.wateringStations || [];
      const speedMonitoring = speedData.data?.speedMonitoring || [];
      const intersections = intersectionsData.data?.intersections || [];

      setLocations(locations);
      setSegments(segments);
      setTrolleySegments(trolleySegments);
      setWateringStations(wateringStations);
      setSpeedMonitoring(speedMonitoring);
      setIntersections(intersections);

      console.log('✅ Loaded via GraphQL:', {
        locations: locations.length,
        segments: segments.length,
        trolleySegments: trolleySegments.length,
        wateringStations: wateringStations.length,
        speedMonitoring: speedMonitoring.length,
        intersections: intersections.length
      });

      addDataToMap(locations, segments, wateringStations, speedMonitoring);
      
      setTimeout(() => {
        addTrolleyDataToMap(trolleySegments);
      }, 1500);

      setTimeout(() => {
        addIntersectionsToMap(intersections);
      }, 2000);
    } catch (error) {
      console.error('❌ Error loading data via GraphQL:', error);
      setLocations([]);
      setSegments([]);
      setTrolleySegments([]);
    }
  };

  const addDataToMap = (locationsData, segmentsData, wateringStationsData = [], speedMonitoringData = []) => {
    if (!mapRef.current || !mapLoaded) {
      setTimeout(() => addDataToMap(locationsData, segmentsData, wateringStationsData, speedMonitoringData), 100);
      return;
    }

    const ol = window.ol;
    if (!ol) return;

    setWateringStations(wateringStationsData);
    setSpeedMonitoring(speedMonitoringData);

    // Remove existing layers
    const layersToRemove = [];
    mapRef.current.getLayers().forEach(layer => {
      const layerId = layer.get('id');
      if (layerId && ['segments', 'segments-shadow', 'segments-center', 'locations'].includes(layerId)) {
        layersToRemove.push(layer);
      }
    });
    layersToRemove.forEach(layer => mapRef.current.removeLayer(layer));

    // Add segments
    if (segmentsData.length > 0) {
      console.log('✅ Adding segments to map:', segmentsData.length);
      
      const segmentFeatures = segmentsData.map(segment => {
        let geometry;
        try {
          geometry = typeof segment.geometry === 'string' 
            ? JSON.parse(segment.geometry) 
            : segment.geometry;
        } catch (e) {
          return null;
        }

        if (!geometry || !geometry.coordinates) return null;

        const coordinates = geometry.coordinates.map(coord => ol.proj.fromLonLat(coord));

        return new ol.Feature({
          geometry: new ol.geom.LineString(coordinates),
          id: segment.lane_id,
          road_id: segment.road_id,
          direction: segment.direction,
          is_closed: segment.is_closed,
          length_m: segment.length_m
        });
      }).filter(feature => feature !== null);

      const segmentSource = new ol.source.Vector({
        features: segmentFeatures
      });

      // Shadow layer
      const shadowLayer = new ol.layer.Vector({
        source: segmentSource,
        style: new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: 'rgba(5, 5, 5, 0.95)',
            width: 4
          })
        })
      });
      shadowLayer.set('id', 'segments-shadow');
      mapRef.current.addLayer(shadowLayer);

      // Center line layer
      const centerLayer = new ol.layer.Vector({
        source: segmentSource,
        style: (feature) => {
          const isClosed = feature.get('is_closed');
          return new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: isClosed ? '#FF6B6B' : '#FFD700',
              width: 1.5
            })
          });
        }
      });
      centerLayer.set('id', 'segments-center');
      mapRef.current.addLayer(centerLayer);

      console.log('✅ Segments layer added successfully');
    }

    // Add locations
    if (locationsData.length > 0) {
      const locationFeatures = locationsData.map(location => {
        const size = 0.00025;
        const coordinates = [
          [location.longitude - size, location.latitude - size],
          [location.longitude + size, location.latitude - size],
          [location.longitude + size, location.latitude + size],
          [location.longitude - size, location.latitude + size],
          [location.longitude - size, location.latitude - size]
        ].map(coord => ol.proj.fromLonLat(coord));

        const colorMap = {
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

        return new ol.Feature({
          geometry: new ol.geom.Polygon([coordinates]),
          id: location.location_id,
          name: location.location_name,
          type: location.unit_type,
          category: location.location_category,
          color: colorMap[location.unit_type] || '#95A5A6'
        });
      });

      const locationSource = new ol.source.Vector({
        features: locationFeatures
      });

      const locationLayer = new ol.layer.Vector({
        source: locationSource,
        style: (feature) => {
          const color = feature.get('color') || '#95A5A6';
          return new ol.style.Style({
            fill: new ol.style.Fill({
              color: color + 'E6' // Add opacity
            }),
            stroke: new ol.style.Stroke({
              color: color,
              width: 1
            })
          });
        }
      });
      locationLayer.set('id', 'locations');
      mapRef.current.addLayer(locationLayer);

      console.log('✅ Locations layer added');
    }
  };

  const addTrolleyDataToMap = (trolleyData) => {
    if (!mapRef.current || !mapLoaded || !trolleyData || trolleyData.length === 0) {
      console.log('Skipping trolley data - map not ready or no data');
      return;
    }

    const ol = window.ol;
    if (!ol) return;

    // Remove existing trolley layer
    mapRef.current.getLayers().forEach(layer => {
      if (layer.get('id') === 'trolley-segments') {
        mapRef.current.removeLayer(layer);
      }
    });

    const trolleyFeatures = trolleyData.map(trolley => {
      const coordinates = [
        ol.proj.fromLonLat([trolley.start_longitude, trolley.start_latitude]),
        ol.proj.fromLonLat([trolley.end_longitude, trolley.end_latitude])
      ];

      return new ol.Feature({
        geometry: new ol.geom.LineString(coordinates),
        lane_id: trolley.lane_id,
        lane_name: trolley.lane_name,
        direction: trolley.direction,
        voltage: trolley.trolley_voltage
      });
    });

    const trolleySource = new ol.source.Vector({
      features: trolleyFeatures
    });

    const trolleyLayer = new ol.layer.Vector({
      source: trolleySource,
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: '#00FF00',
          width: 3
        })
      })
    });
    trolleyLayer.set('id', 'trolley-segments');
    mapRef.current.addLayer(trolleyLayer);

    console.log('✅ Trolley segments added');
  };

  const addIntersectionsToMap = (intersectionsData) => {
    if (!mapRef.current || !mapLoaded || !intersectionsData || intersectionsData.length === 0) {
      console.log('Skipping intersections - map not ready or no data');
      return;
    }

    const ol = window.ol;
    if (!ol) return;

    // Remove existing intersection layers
    mapRef.current.getLayers().forEach(layer => {
      const layerId = layer.get('id');
      if (layerId && ['intersections', 'intersections-outline'].includes(layerId)) {
        mapRef.current.removeLayer(layer);
      }
    });

    const intersectionFeatures = intersectionsData.map(intersection => {
      let geometry;
      try {
        geometry = typeof intersection.geometry === 'string' 
          ? JSON.parse(intersection.geometry) 
          : intersection.geometry;
      } catch (e) {
        return null;
      }

      if (!geometry || !geometry.coordinates) return null;

      // Convert coordinates to OpenLayers format
      const convertCoordinates = (coords) => {
        if (geometry.type === 'Polygon') {
          return coords.map(ring => ring.map(coord => ol.proj.fromLonLat(coord)));
        } else if (geometry.type === 'Point') {
          return ol.proj.fromLonLat(coords);
        }
        return coords;
      };

      let olGeometry;
      if (geometry.type === 'Polygon') {
        olGeometry = new ol.geom.Polygon(convertCoordinates(geometry.coordinates));
      } else if (geometry.type === 'Point') {
        olGeometry = new ol.geom.Point(convertCoordinates(geometry.coordinates));
      } else {
        return null;
      }

      return new ol.Feature({
        geometry: olGeometry,
        id: intersection.intersection_id,
        name: intersection.intersection_name,
        type: intersection.intersection_type
      });
    }).filter(feature => feature !== null);

    if (intersectionFeatures.length > 0) {
      const intersectionSource = new ol.source.Vector({
        features: intersectionFeatures
      });

      // Fill layer
      const fillLayer = new ol.layer.Vector({
        source: intersectionSource,
        style: new ol.style.Style({
          fill: new ol.style.Fill({
            color: 'rgba(255, 0, 0, 0.3)'
          })
        })
      });
      fillLayer.set('id', 'intersections');
      mapRef.current.addLayer(fillLayer);

      // Outline layer
      const outlineLayer = new ol.layer.Vector({
        source: intersectionSource,
        style: new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: '#FF0000',
            width: 2
          })
        })
      });
      outlineLayer.set('id', 'intersections-outline');
      mapRef.current.addLayer(outlineLayer);

      console.log('✅ Intersections added');
    }
  };

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
        <h2 style={{ color: '#dc2626', marginBottom: '12px' }}>Error Loading Map</h2>
        <p style={{ color: '#9ca3af', marginBottom: '20px' }}>{mapError}</p>
        <button
          onClick={() => {
            setMapError(null);
            window.location.reload();
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
          height: '100%'
        }}
      />
      {!mapLoaded && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          fontSize: '18px',
          textAlign: 'center',
          zIndex: 1000
        }}>
          Loading OpenLayers Map...
        </div>
      )}
    </div>
  );
}
