import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function GeoServerMapboxComponent() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [segments, setSegments] = useState([]);
  const [trolleySegments, setTrolleySegments] = useState([]);
  const [wateringStations, setWateringStations] = useState([]);
  const [speedMonitoring, setSpeedMonitoring] = useState([]);
  const [intersections, setIntersections] = useState([]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    if (!mapboxgl || !mapboxgl.Map) {
      console.error('Mapbox GL JS not loaded');
      return;
    }

    try {
      const webglSupported = typeof mapboxgl.supported === 'function'
        ? mapboxgl.supported({ failIfMajorPerformanceCaveat: false })
        : true;

      if (!webglSupported) {
        console.warn('WebGL is not supported');
        setMapError('webgl');
        return;
      }

      mapboxgl.accessToken = 'pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw';
      
      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: [148.980202, -23.847083],
          zoom: 11,
          maxZoom: 24,
          attributionControl: false
        });
      } catch (mapError) {
        console.warn('Failed to create Mapbox map:', mapError);
        if (mapError.message && mapError.message.includes('WebGL')) {
          setMapError('webgl');
          return;
        }
        throw mapError;
      }
    } catch (err) {
      console.warn('Failed to create Mapbox map:', err);
      setMapError('webgl');
      return;
    }

    map.current.on('load', () => {
      console.log('✅ GeoServer Mapbox map loaded successfully');
      
      setTimeout(() => {
        const mapboxLogo = document.querySelector('.mapboxgl-ctrl-logo');
        if (mapboxLogo) {
          mapboxLogo.style.display = 'none';
        }
      }, 100);
      
      map.current.addControl(new mapboxgl.NavigationControl());
      setMapLoaded(true);
      loadData();
    });

    map.current.on('error', (e) => {
      const error = e?.error || e;
      if (error && typeof error === 'string' && error.includes('WEBGL_debug_renderer_info')) {
        return;
      }
      if (error && typeof error === 'string' && error.includes('texSubImage')) {
        return;
      }
      if (error && typeof error === 'string' && error.includes('WebGL context was lost')) {
        console.warn('⚠️ WebGL context lost, attempting recovery...');
        return;
      }
      console.error('❌ Map error:', error);
    });

    const canvas = map.current.getCanvas();
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (event) => {
        console.warn('⚠️ WebGL context lost, preventing default');
        event.preventDefault();
        return false;
      });

      canvas.addEventListener('webglcontextrestored', (event) => {
        console.log('✅ WebGL context restored');
        event.preventDefault();
        if (map.current) {
          try {
            map.current.resize();
            map.current.render();
          } catch (error) {
            console.warn('Error during map restoration:', error);
          }
        }
        return false;
      });
    }

    return () => {
      if (map.current) {
        try {
          map.current.off();
          map.current.remove();
          map.current = null;
        } catch (error) {
          console.warn('Error during map cleanup:', error);
          map.current = null;
        }
      }
    };
  }, []);

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
    if (!map.current || !map.current.isStyleLoaded()) {
      setTimeout(() => addDataToMap(locationsData, segmentsData, wateringStationsData, speedMonitoringData), 100);
      return;
    }

    setWateringStations(wateringStationsData);
    setSpeedMonitoring(speedMonitoringData);

    // Remove existing sources and layers
    if (map.current.getSource('locations')) {
      map.current.removeLayer('locations');
      map.current.removeSource('locations');
    }
    if (map.current.getSource('segments')) {
      const segmentLayers = ['segments', 'segments-shadow', 'segments-center-line'];
      segmentLayers.forEach(layerId => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      map.current.removeSource('segments');
    }

    // Add segments
    if (segmentsData.length > 0) {
      console.log('✅ Adding segments to map:', segmentsData.length);
      
      const segmentsGeoJSON = {
        type: 'FeatureCollection',
        features: segmentsData.map(segment => {
          let geometry;
          try {
            geometry = typeof segment.geometry === 'string' 
              ? JSON.parse(segment.geometry) 
              : segment.geometry;
          } catch (e) {
            return null;
          }
          
          return {
            type: 'Feature',
            properties: {
              id: segment.lane_id,
              road_id: segment.road_id,
              direction: segment.direction,
              is_closed: segment.is_closed,
              length_m: segment.length_m
            },
            geometry: geometry
          };
        }).filter(feature => feature !== null)
      };

      map.current.addSource('segments', {
        type: 'geojson',
        data: segmentsGeoJSON
      });

      // Add shadow layer
      map.current.addLayer({
        id: 'segments-shadow',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 4,
            15, 12,
            20, 40
          ],
          'line-color': 'rgba(5, 5, 5, 0.95)',
          'line-opacity': 0.95
        }
      });

      // Add center line
      map.current.addLayer({
        id: 'segments-center-line',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1.5,
            15, 5,
            20, 15
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#FF6B6B',
            '#FFD700'
          ],
          'line-opacity': 1.0
        }
      });

      console.log('✅ Segments layer added successfully');
    }

    // Add locations
    const locationsGeoJSON = locationsData.length > 0 ? {
      type: 'FeatureCollection',
      features: locationsData.map(location => ({
        type: 'Feature',
        properties: {
          id: location.location_id,
          name: location.location_name,
          type: location.unit_type,
          category: location.location_category
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [location.longitude - 0.00025, location.latitude - 0.00025],
            [location.longitude + 0.00025, location.latitude - 0.00025],
            [location.longitude + 0.00025, location.latitude + 0.00025],
            [location.longitude - 0.00025, location.latitude + 0.00025],
            [location.longitude - 0.00025, location.latitude - 0.00025]
          ]]
        }
      }))
    } : null;

    if (locationsGeoJSON) {
      map.current.addSource('locations', {
        type: 'geojson',
        data: locationsGeoJSON
      });

      map.current.addLayer({
        id: 'locations',
        type: 'fill-extrusion',
        source: 'locations',
        paint: {
          'fill-extrusion-height': 60,
          'fill-extrusion-base': 0,
          'fill-extrusion-color': [
            'match',
            ['get', 'type'],
            'Call Point', '#FF6B6B',
            'Dump', '#4ECDC4',
            'Blast', '#45B7D1',
            'Stockpile', '#96CEB4',
            'Workshop', '#FFEAA7',
            'Shiftchange', '#DDA0DD',
            'Region', '#98D8C8',
            'Crusher', '#F7DC6F',
            'Pit', '#BB8FCE',
            '#95A5A6'
          ],
          'fill-extrusion-opacity': 0.9
        }
      });
      
      console.log('✅ Locations layer added');
    }
  };

  const addTrolleyDataToMap = (trolleyData) => {
    if (!map.current || !map.current.isStyleLoaded() || !trolleyData || trolleyData.length === 0) {
      console.log('Skipping trolley data - map not ready or no data');
      return;
    }

    if (map.current.getSource('trolley-segments')) {
      map.current.removeLayer('trolley-segments');
      map.current.removeSource('trolley-segments');
    }

    const trolleyFeatures = trolleyData.map(trolley => ({
      type: 'Feature',
      properties: {
        lane_id: trolley.lane_id,
        lane_name: trolley.lane_name,
        direction: trolley.direction,
        voltage: trolley.trolley_voltage
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [trolley.start_longitude, trolley.start_latitude],
          [trolley.end_longitude, trolley.end_latitude]
        ]
      }
    }));

    map.current.addSource('trolley-segments', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: trolleyFeatures
      }
    });

    map.current.addLayer({
      id: 'trolley-segments',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': 3,
        'line-color': '#00FF00',
        'line-opacity': 0.8
      }
    });

    console.log('✅ Trolley segments added');
  };

  const addIntersectionsToMap = (intersectionsData) => {
    if (!map.current || !map.current.isStyleLoaded() || !intersectionsData || intersectionsData.length === 0) {
      console.log('Skipping intersections - map not ready or no data');
      return;
    }

    if (map.current.getSource('intersections')) {
      map.current.removeLayer('intersections');
      map.current.removeSource('intersections');
    }

    const intersectionFeatures = intersectionsData.map(intersection => {
      let geometry;
      try {
        geometry = typeof intersection.geometry === 'string' 
          ? JSON.parse(intersection.geometry) 
          : intersection.geometry;
      } catch (e) {
        return null;
      }

      return {
        type: 'Feature',
        properties: {
          id: intersection.intersection_id,
          name: intersection.intersection_name,
          type: intersection.intersection_type
        },
        geometry: geometry
      };
    }).filter(feature => feature !== null);

    if (intersectionFeatures.length > 0) {
      map.current.addSource('intersections', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: intersectionFeatures
        }
      });

      map.current.addLayer({
        id: 'intersections',
        type: 'fill',
        source: 'intersections',
        paint: {
          'fill-color': '#FF0000',
          'fill-opacity': 0.3
        }
      });

      map.current.addLayer({
        id: 'intersections-outline',
        type: 'line',
        source: 'intersections',
        paint: {
          'line-width': 2,
          'line-color': '#FF0000',
          'line-opacity': 0.8
        }
      });

      console.log('✅ Intersections added');
    }
  };

  if (mapError === 'webgl') {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        flexDirection: 'column',
        padding: '20px'
      }}>
        <h2 style={{ color: '#dc2626', marginBottom: '12px' }}>WebGL Not Supported</h2>
        <p style={{ color: '#6b7280' }}>Your browser does not support WebGL, which is required for this map.</p>
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
    </div>
  );
}
