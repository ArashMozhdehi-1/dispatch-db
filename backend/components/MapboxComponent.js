import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import RoadProfileViewer from './RoadProfileViewer';


export default function MapboxComponent() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [segments, setSegments] = useState([]);
  const [trolleySegments, setTrolleySegments] = useState([]);
  const [trolleyLinesVisible, setTrolleyLinesVisible] = useState(true);
  const [trolleyLinesInitialized, setTrolleyLinesInitialized] = useState(false);
    const [wateringStations, setWateringStations] = useState([]);
    const [speedMonitoring, setSpeedMonitoring] = useState([]);
    const [intersections, setIntersections] = useState([]);
    const [showTrajectoryConfig, setShowTrajectoryConfig] = useState(false);
    const [selectedSegment, setSelectedSegment] = useState(null);
    const [showRoadDialog, setShowRoadDialog] = useState(false);
    const [showProfileViewer, setShowProfileViewer] = useState(false);
    const [trajectoryConfig, setTrajectoryConfig] = useState({
      value1: 0,
      value2: 0
    });
    const [trajectoryLines, setTrajectoryLines] = useState([]);
  const [visibleLocationTypes, setVisibleLocationTypes] = useState(new Set([
    'Call Point', 'Dump', 'Blast', 'Stockpile', 'Workshop', 'Shiftchange', 'Region', 'Crusher', 'Pit'
  ]));
  
  const currentTooltip = useRef(null);
  const currentPopup = useRef(null);
  
  const closeCurrentTooltip = () => {
    if (currentTooltip.current) {
      currentTooltip.current.style.display = 'none';
      currentTooltip.current = null;
    }
    if (currentPopup.current) {
      currentPopup.current.remove();
      currentPopup.current = null;
    }
  };


  // Toggle section visibility in legend
  const toggleSection = (contentId, arrowId) => {
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    
    if (content && arrow) {
      const isVisible = content.style.display !== 'none';
      content.style.display = isVisible ? 'none' : 'block';
      arrow.style.transform = isVisible ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
  };



  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    if (!mapboxgl || !mapboxgl.Map) {
      console.error('Mapbox GL JS not loaded');
      return;
    }

    // Guard against environments where WebGL is unavailable to avoid hard crash
    try {
      const webglSupported = typeof mapboxgl.supported === 'function'
        ? mapboxgl.supported({ failIfMajorPerformanceCaveat: false })
        : true;

      if (!webglSupported) {
        console.warn('WebGL is not supported, showing fallback message');
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
        throw mapError; // Re-throw if it's not a WebGL error
      }
    } catch (err) {
      console.warn('Failed to create Mapbox map:', err);
      setMapError('webgl');
      return;
    }

    map.current.on('load', () => {
      console.log('✅ Mapbox map loaded successfully');
      
      setTimeout(() => {
        const mapboxLogo = document.querySelector('.mapboxgl-ctrl-logo');
        if (mapboxLogo) {
          mapboxLogo.style.display = 'none';
        }
      }, 100);
      
      map.current.addControl(new mapboxgl.NavigationControl());
      
      setMapLoaded(true);
      loadData();
      setupLegendInteractions();
      setupTooltips();
      setupMapTracking();
      setupMeasurementTool();
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

    // Add WebGL context loss handling
    const canvas = map.current.getCanvas();
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (event) => {
        console.warn('⚠️ WebGL context lost, preventing default');
        event.preventDefault();
        // Don't show error to user, just prevent the default behavior
        return false;
      });

      canvas.addEventListener('webglcontextrestored', (event) => {
        console.log('✅ WebGL context restored');
        event.preventDefault();
        // Re-render the map
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
          // Remove all event listeners
          map.current.off();
          
          // Remove the map
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
          // Load all data via GraphQL for consistency
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

      console.log('🔍 GraphQL Response Debug:', {
        locationsResponse: locationsResponse.status,
        segmentsResponse: segmentsResponse.status,
        trolleyResponse: trolleyResponse.status,
        wateringResponse: wateringResponse.status,
        speedResponse: speedResponse.status
      });

      console.log('🔍 Watering Response:', wateringResponse.status, wateringData);
      console.log('🔍 Speed Response:', speedResponse.status, speedData);
      if (speedData.errors) {
        console.error('❌ Speed monitoring errors:', speedData.errors);
      }

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
        speedMonitoring: speedMonitoring.length
      });

        addDataToMap(locations, segments, wateringStations, speedMonitoring);
        
        // Add trolley lines after a delay to ensure map is ready
      setTimeout(() => {
          addTrolleyDataToMap(trolleySegments);
        }, 1500);

        // Add intersections after a delay
        setTimeout(() => {
          addIntersectionsToMap(intersections);
        }, 2000);
    } catch (error) {
      console.error('❌ Error loading data via GraphQL:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack
      });
      
      // Set empty arrays to prevent further errors
      setLocations([]);
      setSegments([]);
      setTrolleySegments([]);
    }
  };

    // Calculate safety buffer and R-min based on actual coordinates
    const calculateCurveParametersFromCoords = (fromLon, fromLat, toLon, toLat, vehicleWidth = 3.5, vehicleLength = 12.0) => {
      // Calculate distance between points
      const R = 6371000; // Earth's radius in meters
      const dLat = (toLat - fromLat) * Math.PI / 180;
      const dLon = (toLon - fromLon) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c; // Distance in meters
      
      // Calculate bearing angle
      const y = Math.sin(dLon) * Math.cos(toLat * Math.PI / 180);
      const x = Math.cos(fromLat * Math.PI / 180) * Math.sin(toLat * Math.PI / 180) -
                Math.sin(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) * Math.cos(dLon);
      const bearing = Math.atan2(y, x) * 180 / Math.PI;
      const angle = Math.abs(bearing);
      
      // Calculate curve parameters based on distance and angle
      let safetyBuffer, rMin, color;
      
      if (distance < 50) {
        // Very short distance - sharp turn
        safetyBuffer = 8.0;
        rMin = 12.0;
        color = '#FF0000'; // Red
      } else if (distance < 100) {
        // Short distance - medium turn
        safetyBuffer = 6.0;
        rMin = 18.0;
        color = '#FFA500'; // Orange
      } else if (distance < 200) {
        // Medium distance - gentle turn
        safetyBuffer = 4.0;
        rMin = 25.0;
        color = '#FFFF00'; // Yellow
      } else {
        // Long distance - straight
        safetyBuffer = 2.5;
        rMin = 40.0;
        color = '#00FF00'; // Green
      }
      
      // Adjust based on angle
      if (angle > 90) {
        safetyBuffer *= 1.5; // Increase safety for sharp turns
        rMin *= 0.8; // Decrease radius for sharp turns
      } else if (angle < 30) {
        safetyBuffer *= 0.8; // Decrease safety for gentle turns
        rMin *= 1.2; // Increase radius for gentle turns
      }
      
      // Add vehicle-specific adjustments
      safetyBuffer += vehicleWidth / 2; // Add half vehicle width
      rMin = Math.max(rMin, vehicleLength * 1.5); // Minimum radius based on vehicle length
      
      return {
        safetyBuffer: Math.round(safetyBuffer * 10) / 10, // Round to 1 decimal
        rMin: Math.round(rMin * 10) / 10, // Round to 1 decimal
        color: color,
        distance: Math.round(distance * 10) / 10,
        angle: Math.round(angle * 10) / 10
      };
    };

    // Calculate safety buffer and R-min for different curve types
    const calculateCurveParameters = (curveType, vehicleWidth = 3.5, vehicleLength = 12.0) => {
      const curveParams = {
        // Sharp turns (90+ degrees)
        'sharp_left': { safetyBuffer: 6.0, rMin: 15.0, color: '#FF0000' },
        'sharp_right': { safetyBuffer: 6.0, rMin: 15.0, color: '#FF0000' },
        
        // Medium turns (45-90 degrees)
        'medium_left': { safetyBuffer: 4.5, rMin: 20.0, color: '#FFA500' },
        'medium_right': { safetyBuffer: 4.5, rMin: 20.0, color: '#FFA500' },
        
        // Gentle turns (15-45 degrees)
        'gentle_left': { safetyBuffer: 3.0, rMin: 30.0, color: '#FFFF00' },
        'gentle_right': { safetyBuffer: 3.0, rMin: 30.0, color: '#FFFF00' },
        
        // Straight through
        'straight': { safetyBuffer: 2.0, rMin: 50.0, color: '#00FF00' },
        
        // U-turn
        'u_turn': { safetyBuffer: 8.0, rMin: 12.0, color: '#800080' }
      };
      
      return curveParams[curveType] || { safetyBuffer: 4.0, rMin: 18.0, color: '#FF00FF' };
    };

    // Draw 8 different intersection curves with computed safety and R-min values
    const drawIntersectionCurves = () => {
      try {
        // Find both road segments
        const road1003 = segments.find(s => s.road_id === 1003 && s.lane_id.includes('forward'));
        const road1004 = segments.find(s => s.road_id === 1004 && s.lane_id.includes('forward'));
        
        if (!road1003 || !road1004) {
          console.error('Could not find roads 1003 or 1004');
          return;
        }

        // Parse geometries
        const geom1003 = typeof road1003.geometry === 'string' ? JSON.parse(road1003.geometry) : road1003.geometry;
        const geom1004 = typeof road1004.geometry === 'string' ? JSON.parse(road1004.geometry) : road1004.geometry;
        
        if (!geom1003.coordinates || !geom1004.coordinates) return;

        // Get road endpoints
        const road1003Start = geom1003.coordinates[0];
        const road1003End = geom1003.coordinates[geom1003.coordinates.length - 1];
        const road1004Start = geom1004.coordinates[0];
        const road1004End = geom1004.coordinates[geom1004.coordinates.length - 1];
        
        // Calculate intersection point
        const intersectionPoint = [
          (road1003End[0] + road1004Start[0]) / 2,
          (road1003End[1] + road1004Start[1]) / 2
        ];

        // Define 8 curve types with actual coordinates from your popup
        const curveTypes = [
          // Using the coordinates from your popup: FROM: 149.007183, -23.850619 TO: 149.007421, -23.850368
          { type: 'curve_1', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #1 (RED)' },
          { type: 'curve_2', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #2 (ORANGE)' },
          { type: 'curve_3', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #3 (YELLOW)' },
          { type: 'curve_4', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #4 (GREEN)' },
          { type: 'curve_5', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #5 (BLUE)' },
          { type: 'curve_6', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #6 (PURPLE)' },
          { type: 'curve_7', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #7 (PINK)' },
          { type: 'curve_8', start: [149.007183, -23.850619], end: [149.007421, -23.850368], name: 'CURVE #8 (CYAN)' }
        ];

        const allCurves = [];

        curveTypes.forEach((curveDef, index) => {
          const params = calculateCurveParameters(curveDef.type);
          const curvePoints = [];
          const steps = 20;
          
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            
            // Calculate curve based on angle and R-min
            const angle = (curveDef.angle * Math.PI) / 180;
            const radius = params.rMin * 0.00001; // Convert to degrees
            
            const x = curveDef.start[0] + Math.cos(angle) * radius * t;
            const y = curveDef.start[1] + Math.sin(angle) * radius * t;
            
            curvePoints.push([x, y]);
          }

          allCurves.push({
            type: 'Feature',
            properties: {
              curve_type: curveDef.type,
              safety_buffer: params.safetyBuffer,
              r_min: params.rMin,
              color: params.color,
              index: index + 1
            },
            geometry: {
              type: 'LineString',
              coordinates: curvePoints
            }
          });
        });

        // Add all curves to map
        if (map.current && map.current.isStyleLoaded()) {
          // Remove existing curve layers
          if (map.current.getSource('intersection-curves')) {
            if (map.current.getLayer('intersection-curves')) map.current.removeLayer('intersection-curves');
            if (map.current.getLayer('intersection-curves-outline')) map.current.removeLayer('intersection-curves-outline');
            map.current.removeSource('intersection-curves');
          }

          const curvesGeoJSON = {
            type: 'FeatureCollection',
            features: allCurves
          };

          map.current.addSource('intersection-curves', {
            type: 'geojson',
            data: curvesGeoJSON
          });

          map.current.addLayer({
            id: 'intersection-curves',
            type: 'line',
            source: 'intersection-curves',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 6,
              'line-opacity': 0.9
            }
          });

          map.current.addLayer({
            id: 'intersection-curves-outline',
            type: 'line',
            source: 'intersection-curves',
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 8,
              'line-opacity': 0.7
            }
          });

          // Add click handlers for each curve
          map.current.on('click', 'intersection-curves', (e) => {
            const feature = e.features[0];
            const props = feature.properties;
            
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-weight: 600; color: ${props.color}; margin-bottom: 8px; font-size: 14px;">
                  🎯 Curve ${props.index}: ${props.curve_type.replace('_', ' ').toUpperCase()}
                </div>
                <div style="margin-bottom: 4px;">
                  <span style="color: #bdc3c7;">Safety Buffer:</span>
                  <span style="color: white; margin-left: 8px; font-weight: 500;">${props.safety_buffer}m</span>
                </div>
                <div style="margin-bottom: 4px;">
                  <span style="color: #bdc3c7;">R-Min:</span>
                  <span style="color: white; margin-left: 8px; font-weight: 500;">${props.r_min}m</span>
                </div>
                <div style="margin-bottom: 4px;">
                  <span style="color: #bdc3c7;">Color:</span>
                  <span style="color: ${props.color}; margin-left: 8px; font-weight: 500;">${props.color}</span>
                </div>
              `)
              .addTo(map.current);
          });
        }

        console.log('✅ Drew 8 intersection curves with computed safety and R-min values');
        console.log('Curve parameters:', curveTypes.map(c => ({
          type: c.type,
          ...calculateCurveParameters(c.type)
        })));

      } catch (error) {
        console.error('Error drawing intersection curves:', error);
      }
    };

    // Draw intersection curve between roads 1003 and 1004
    const drawIntersectionCurve = (value1, value2) => {
      try {
        // Find both road segments
        const road1003 = segments.find(s => s.road_id === 1003 && s.lane_id.includes('forward'));
        const road1004 = segments.find(s => s.road_id === 1004 && s.lane_id.includes('forward'));
        
        if (!road1003 || !road1004) {
          console.error('Could not find roads 1003 or 1004');
          return;
        }

        // Parse geometries
        const geom1003 = typeof road1003.geometry === 'string' ? JSON.parse(road1003.geometry) : road1003.geometry;
        const geom1004 = typeof road1004.geometry === 'string' ? JSON.parse(road1004.geometry) : road1004.geometry;
        
        if (!geom1003.coordinates || !geom1004.coordinates) return;

        // Get intersection point (where roads meet)
        const road1003End = geom1003.coordinates[geom1003.coordinates.length - 1];
        const road1004Start = geom1004.coordinates[0];
        
        // Calculate the intersection point (midpoint for simplicity)
        const intersectionPoint = [
          (road1003End[0] + road1004Start[0]) / 2,
          (road1003End[1] + road1004Start[1]) / 2
        ];

        // Create curve from road1003 end to road1004 start
        const curvePoints = [];
        const steps = Math.max(2, Math.floor(value2) || 20);
        
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          
          // Use cubic bezier curve for smooth intersection
          const p0 = road1003End;
          const p1 = [
            road1003End[0] + (value1 || 0) * 0.00001,
            road1003End[1] + (value1 || 0) * 0.00001
          ];
          const p2 = [
            road1004Start[0] - (value1 || 0) * 0.00001,
            road1004Start[1] - (value1 || 0) * 0.00001
          ];
          const p3 = road1004Start;
          
          // Cubic bezier formula
          const x = Math.pow(1-t, 3) * p0[0] + 3 * Math.pow(1-t, 2) * t * p1[0] + 
                   3 * (1-t) * Math.pow(t, 2) * p2[0] + Math.pow(t, 3) * p3[0];
          const y = Math.pow(1-t, 3) * p0[1] + 3 * Math.pow(1-t, 2) * t * p1[1] + 
                   3 * (1-t) * Math.pow(t, 2) * p2[1] + Math.pow(t, 3) * p3[1];
          
          curvePoints.push([x, y]);
        }

        // Add curve to map
        if (map.current && map.current.isStyleLoaded()) {
          // Remove existing intersection curve layers
          if (map.current.getSource('intersection-curve')) {
            if (map.current.getLayer('intersection-curve')) map.current.removeLayer('intersection-curve');
            if (map.current.getLayer('intersection-curve-outline')) map.current.removeLayer('intersection-curve-outline');
            map.current.removeSource('intersection-curve');
          }

          const curveGeoJSON = {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {
                type: 'intersection_curve',
                value1: value1,
                value2: value2
              },
              geometry: {
                type: 'LineString',
                coordinates: curvePoints
              }
            }]
          };

          map.current.addSource('intersection-curve', {
            type: 'geojson',
            data: curveGeoJSON
          });

          map.current.addLayer({
            id: 'intersection-curve',
            type: 'line',
            source: 'intersection-curve',
            paint: {
              'line-color': '#FF00FF',
              'line-width': 8,
              'line-opacity': 0.9
            }
          });

          map.current.addLayer({
            id: 'intersection-curve-outline',
            type: 'line',
            source: 'intersection-curve',
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 10,
              'line-opacity': 0.7
            }
          });
        }

        // Store curve in state
        setTrajectoryLines(prev => [...prev, {
          type: 'intersection_curve',
          value1: value1,
          value2: value2,
          geometry: curvePoints
        }]);

      } catch (error) {
        console.error('Error drawing intersection curve:', error);
      }
    };

    // Draw trajectory based on configuration values
    const drawTrajectory = (segment, value1, value2) => {
      try {
        // Parse segment geometry
        const geom = typeof segment.geometry === 'string' ? JSON.parse(segment.geometry) : segment.geometry;
        if (!geom.coordinates || geom.coordinates.length < 2) return;

        const startPoint = geom.coordinates[0];
        const endPoint = geom.coordinates[geom.coordinates.length - 1];
        
        // Calculate trajectory points based on the two values
        // Value1: offset distance perpendicular to the road
        // Value2: number of intermediate points for smooth curve
        const trajectoryPoints = [];
        const steps = Math.max(2, Math.floor(value2) || 10);
        
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = startPoint[0] + (endPoint[0] - startPoint[0]) * t;
          const y = startPoint[1] + (endPoint[1] - startPoint[1]) * t;
          
          // Apply perpendicular offset based on value1
          const offset = (value1 || 0) * 0.00001; // Convert to degrees
          const angle = Math.atan2(endPoint[1] - startPoint[1], endPoint[0] - startPoint[0]) + Math.PI/2;
          
          trajectoryPoints.push([
            x + Math.cos(angle) * offset,
            y + Math.sin(angle) * offset
          ]);
        }

        // Add trajectory to map
        if (map.current && map.current.isStyleLoaded()) {
          // Remove existing trajectory layers
          if (map.current.getSource('trajectory-lines')) {
            if (map.current.getLayer('trajectory-lines')) map.current.removeLayer('trajectory-lines');
            if (map.current.getLayer('trajectory-lines-outline')) map.current.removeLayer('trajectory-lines-outline');
            map.current.removeSource('trajectory-lines');
          }

          const trajectoryGeoJSON = {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {
                segment_id: segment.lane_id,
                value1: value1,
                value2: value2
              },
              geometry: {
                type: 'LineString',
                coordinates: trajectoryPoints
              }
            }]
          };

          map.current.addSource('trajectory-lines', {
            type: 'geojson',
            data: trajectoryGeoJSON
          });

          map.current.addLayer({
            id: 'trajectory-lines',
            type: 'line',
            source: 'trajectory-lines',
            paint: {
              'line-color': '#FF00FF',
              'line-width': 6,
              'line-opacity': 0.9
            }
          });

          map.current.addLayer({
            id: 'trajectory-lines-outline',
            type: 'line',
            source: 'trajectory-lines',
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 8,
              'line-opacity': 0.7
            }
          });
        }

        // Store trajectory in state
        setTrajectoryLines(prev => [...prev, {
          segment_id: segment.lane_id,
          value1: value1,
          value2: value2,
          geometry: trajectoryPoints
        }]);

      } catch (error) {
        console.error('Error drawing trajectory:', error);
      }
    };

    const addIntersectionsToMap = (intersectionsData) => {
      console.log('addIntersectionsToMap called with:', intersectionsData);
      
      if (!map.current || !map.current.isStyleLoaded() || intersectionsData.length === 0) {
        console.log('Skipping intersections - map not ready or no data');
        return;
      }

      // Remove existing intersection layers
      if (map.current.getSource('intersections')) {
        const intersectionLayers = ['intersections', 'intersections-outline'];
        intersectionLayers.forEach(layerId => {
          if (map.current.getLayer(layerId)) {
            map.current.removeLayer(layerId);
          }
        });
        map.current.removeSource('intersections');
      }

      // Create intersection GeoJSON
      const intersectionsGeoJSON = {
        type: 'FeatureCollection',
        features: intersectionsData.map(intersection => {
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
              type: intersection.intersection_type,
              safety_buffer: intersection.safety_buffer_m,
              r_min: intersection.r_min_m
            },
            geometry: geometry
          };
        }).filter(Boolean)
      };

      // Add intersection source
      map.current.addSource('intersections', {
        type: 'geojson',
        data: intersectionsGeoJSON
      });

      // Add intersection layers
      map.current.addLayer({
        id: 'intersections',
        type: 'fill',
        source: 'intersections',
        paint: {
          'fill-color': '#FF6B6B',
          'fill-opacity': 0.3
        }
      });

      map.current.addLayer({
        id: 'intersections-outline',
        type: 'line',
        source: 'intersections',
        paint: {
          'line-color': '#FF6B6B',
          'line-width': 3,
          'line-opacity': 0.8
        }
      });

      // Add click handlers for intersections
      map.current.on('click', 'intersections', (e) => {
        const feature = e.features[0];
        const properties = feature.properties;
        
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-weight: 600; color: #FF6B6B; margin-bottom: 8px; font-size: 14px;">
              🚦 ${properties.name}
            </div>
            <div style="margin-bottom: 4px;">
              <span style="color: #bdc3c7;">Type:</span>
              <span style="color: white; margin-left: 8px;">${properties.type}</span>
            </div>
            <div style="margin-bottom: 4px;">
              <span style="color: #bdc3c7;">Safety Buffer:</span>
              <span style="color: white; margin-left: 8px;">${properties.safety_buffer}m</span>
            </div>
            <div style="margin-bottom: 4px;">
              <span style="color: #bdc3c7;">R-Min:</span>
              <span style="color: white; margin-left: 8px;">${properties.r_min}m</span>
            </div>
          `)
          .addTo(map.current);
      });

      // Add hover effects
      map.current.on('mouseenter', 'intersections', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'intersections', () => {
        map.current.getCanvas().style.cursor = '';
      });
    };

    const addTrolleyDataToMap = (trolleyData) => {
      console.log('addTrolleyDataToMap called with:', trolleyData);
      console.log('Map current:', !!map.current);
      console.log('Map style loaded:', map.current?.isStyleLoaded());
      
      if (!map.current || !map.current.isStyleLoaded() || trolleyData.length === 0) {
        console.log('Skipping trolley data - map not ready or no data');
        return;
      }

    // Remove existing trolley layers
    if (map.current.getSource('trolley-segments')) {
      const trolleyLayers = [
        'trolley-segments-shadow', 'trolley-segments-shadow-2', 'trolley-segments-shadow-3',
        'trolley-segments', 'trolley-segments-edge-lines', 'trolley-segments-edge-lines-2',
        'trolley-segments-center-line', 'trolley-segments-highlight', 'trolley-segments-top-highlight',
        'trolley-segments-ultra-highlight', 'trolley-segments-hover'
      ];
      trolleyLayers.forEach(layerId => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      map.current.removeSource('trolley-segments');
    }

    // Create GeoJSON for trolley segments with proper geometry like road segments
    const trolleyGeoJSON = {
      type: 'FeatureCollection',
      features: trolleyData.map(segment => {
        // Determine color based on route
        let color = '#FF6B6B'; // Default red
        if (segment.lane_id.includes('trolley_1')) color = '#FF6B6B'; // Red
        else if (segment.lane_id.includes('trolley_2')) color = '#4ECDC4'; // Blue
        else if (segment.lane_id.includes('trolley_3')) color = '#45B7D1'; // Green

        // Create proper LineString geometry with multiple points for better rendering
        const startLon = segment.start_longitude;
        const startLat = segment.start_latitude;
        const endLon = segment.end_longitude;
        const endLat = segment.end_latitude;
        
        // Create intermediate points for smoother line rendering
        const coordinates = [
          [startLon, startLat],
          [startLon + (endLon - startLon) * 0.25, startLat + (endLat - startLat) * 0.25],
          [startLon + (endLon - startLon) * 0.5, startLat + (endLat - startLat) * 0.5],
          [startLon + (endLon - startLon) * 0.75, startLat + (endLat - startLat) * 0.75],
          [endLon, endLat]
        ];

        return {
          type: 'Feature',
          properties: {
            id: segment.lane_id,
            name: segment.lane_name,
            direction: segment.direction,
            length_m: segment.length_m,
            voltage: segment.trolley_voltage,
            current: segment.trolley_current_limit,
            wire_height: segment.trolley_wire_height,
            color: color,
            is_closed: false, // Trolley lines are always active
            road_id: segment.lane_id.split('_')[1] // Extract route number
          },
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        };
      })
    };

    // Add trolley source
    map.current.addSource('trolley-segments', {
      type: 'geojson',
      data: trolleyGeoJSON
    });

    // Add trolley shadow layers (same styling as road segments)
    map.current.addLayer({
      id: 'trolley-segments-shadow',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 15,
          15, 50,
          20, 100
        ],
        'line-color': 'rgba(5, 5, 5, 0.95)',
        'line-opacity': 0.95,
        'line-blur': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 5,
          15, 15,
          20, 30
        ],
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 4,
          15, 12,
          20, 25
        ]
      }
    });

    map.current.addLayer({
      id: 'trolley-segments-shadow-2',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 12,
          15, 40,
          20, 80
        ],
        'line-color': 'rgba(15, 15, 15, 0.8)',
        'line-opacity': 0.85,
        'line-blur': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 3,
          15, 10,
          20, 20
        ],
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 2,
          15, 8,
          20, 16
        ]
      }
    });

    map.current.addLayer({
      id: 'trolley-segments-shadow-3',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 8,
          15, 30,
          20, 60
        ],
        'line-color': 'rgba(25, 25, 25, 0.6)',
        'line-opacity': 0.75,
        'line-blur': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 2,
          15, 6,
          20, 12
        ],
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 1,
          15, 4,
          20, 8
        ]
      }
    });

    // Add main trolley layer
    map.current.addLayer({
      id: 'trolley-segments',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 8,
          15, 25,
          20, 50
        ],
        'line-color': ['get', 'color'],
        'line-opacity': 1.0,
        'line-blur': 0
      }
    });

    // Add trolley edge lines
    map.current.addLayer({
      id: 'trolley-segments-edge-lines',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 1.5,
          15, 5,
          20, 10
        ],
        'line-color': '#FFD700',
        'line-opacity': 1.0,
        'line-blur': 0,
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, -4,
          15, -12,
          20, -25
        ]
      }
    });

    map.current.addLayer({
      id: 'trolley-segments-edge-lines-2',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 1.5,
          15, 5,
          20, 10
        ],
        'line-color': '#FFD700',
        'line-opacity': 1.0,
        'line-blur': 0,
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 4,
          15, 12,
          20, 25
        ]
      }
    });

    // Add trolley center line
    map.current.addLayer({
      id: 'trolley-segments-center-line',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 1,
          15, 3,
          20, 6
        ],
        'line-color': '#FFFFFF',
        'line-opacity': 0.95,
        'line-blur': 0,
        'line-dasharray': [8, 8]
      }
    });

    // Add trolley highlight layers
    map.current.addLayer({
      id: 'trolley-segments-highlight',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 6,
          15, 20,
          20, 40
        ],
        'line-color': ['get', 'color'],
        'line-opacity': 0.9,
        'line-blur': 0,
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, -1,
          15, -3,
          20, -6
        ]
      }
    });

    map.current.addLayer({
      id: 'trolley-segments-top-highlight',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 4,
          15, 15,
          20, 30
        ],
        'line-color': ['get', 'color'],
        'line-opacity': 0.7,
        'line-blur': 0,
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, -2,
          15, -6,
          20, -12
        ]
      }
    });

    map.current.addLayer({
      id: 'trolley-segments-ultra-highlight',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 2,
          15, 10,
          20, 20
        ],
        'line-color': ['get', 'color'],
        'line-opacity': 0.5,
        'line-blur': 0,
        'line-offset': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, -3,
          15, -9,
          20, -18
        ]
      }
    });

    // Add hover layer
    map.current.addLayer({
      id: 'trolley-segments-hover',
      type: 'line',
      source: 'trolley-segments',
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 6,
          15, 18,
          20, 36
        ],
        'line-color': ['get', 'color'],
        'line-opacity': 0
      }
    });

    // Add trolley tooltips
    setupTrolleyTooltips();
  };

  const setupTrolleyTooltips = () => {
    const trolleyLayers = [
      'trolley-segments', 'trolley-segments-shadow', 'trolley-segments-shadow-2', 'trolley-segments-shadow-3',
      'trolley-segments-edge-lines', 'trolley-segments-edge-lines-2', 'trolley-segments-center-line',
      'trolley-segments-highlight', 'trolley-segments-top-highlight', 'trolley-segments-ultra-highlight', 'trolley-segments-hover'
    ];
    
    trolleyLayers.forEach(layerId => {
      map.current.on('mouseenter', layerId, (e) => {
        closeCurrentTooltip();
        map.current.getCanvas().style.cursor = 'pointer';
        
        const feature = e.features[0];
        const properties = feature.properties;
        
        const tooltipContent = `
          <div style="font-weight: 600; color: ${properties.color}; margin-bottom: 8px; font-size: 14px; border-bottom: 2px solid ${properties.color}; padding-bottom: 4px;">
            ⚡ ${properties.name}
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Lane ID:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.id}</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Direction:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.direction}</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Length:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.length_m ? properties.length_m.toFixed(1) + 'm' : 'N/A'}</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Voltage:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.voltage || 'N/A'}V</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Current:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.current || 'N/A'}A</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Wire Height:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.wire_height || 'N/A'}m</span>
          </div>
          <div style="color: #95a5a6; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d; font-style: italic;">
            Click for more details
          </div>
        `;
        
        const tooltip = document.getElementById('map-tooltip');
        if (tooltip) {
          tooltip.innerHTML = tooltipContent;
          tooltip.style.display = 'block';
          currentTooltip.current = tooltip;
        }
      });

      map.current.on('mousemove', layerId, (e) => {
        const tooltip = document.getElementById('map-tooltip');
        if (tooltip) {
          tooltip.style.left = e.point.x + 10 + 'px';
          tooltip.style.top = e.point.y - 10 + 'px';
        }
      });

      map.current.on('mouseleave', layerId, () => {
        map.current.getCanvas().style.cursor = '';
        const tooltip = document.getElementById('map-tooltip');
        if (tooltip) {
          tooltip.style.display = 'none';
        }
      });
    });
  };

  const addTrolleyLinesForRoad5861372 = async () => {
    try {
      // Fetch road 5861372 segments
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query {
              segmentsByRoad(roadId: 5861372) {
                lane_id
                road_id
                geometry
                start_latitude
                start_longitude
                end_latitude
                end_longitude
                length_m
              }
            }
          `
        })
      });

      const data = await response.json();
      console.log('🚋 GraphQL response:', data);
      
      const roadSegments = data.data?.segmentsByRoad || [];
      
      if (roadSegments.length === 0) {
        console.log('❌ No segments found for road 5861372');
        console.log('❌ Full response:', data);
        return;
      }

      console.log('🚋 Found road 5861372 segments:', roadSegments.length);
      console.log('🚋 First segment:', roadSegments[0]);

        // Create trolley lines offset by 3 meters perpendicular to the road
        const trolleyGeoJSON = {
          type: 'FeatureCollection',
          features: roadSegments.map((segment, index) => {
            const geometry = JSON.parse(segment.geometry);
            const coordinates = geometry.coordinates;
            
            // Calculate perpendicular offset for each coordinate
            const offsetCoordinates = coordinates.map((coord, i) => {
              const [lon, lat] = coord;
              
              // Calculate direction vector to next point
              let dx = 0, dy = 0;
              if (i < coordinates.length - 1) {
                const [nextLon, nextLat] = coordinates[i + 1];
                dx = nextLon - lon;
                dy = nextLat - lat;
              } else if (i > 0) {
                const [prevLon, prevLat] = coordinates[i - 1];
                dx = lon - prevLon;
                dy = lat - prevLat;
              }
              
              // Calculate perpendicular vector (rotate 90 degrees)
              const perpX = -dy;
              const perpY = dx;
              
              // Normalize perpendicular vector
              const length = Math.sqrt(perpX * perpX + perpY * perpY);
              if (length > 0) {
                const normX = perpX / length;
                const normY = perpY / length;
                
                // Offset by 20 meters (convert to degrees) - visible separation from road
                const offsetMeters = 20;
                const offsetDegrees = offsetMeters / 111320; // Approximate conversion
                
                return [
                  lon + normX * offsetDegrees,
                  lat + normY * offsetDegrees
                ];
              }
              
              return [lon, lat];
            });

            return {
              type: 'Feature',
              properties: {
                lane_id: `trolley_5861372_${index}`,
                road_id: 5861372,
                length_m: segment.length_m,
                is_trolley: true,
                color: '#FF6B6B',
                name: `Trolley Line ${index + 1} - Road 5861372 (20m offset)`
              },
              geometry: {
                type: 'LineString',
                coordinates: offsetCoordinates
              }
            };
          })
        };

            // Add trolley source to map (cleanup already handled by toggle function)

      console.log('🚋 Adding trolley source to map:', trolleyGeoJSON);
      map.current.addSource('trolley-lines', {
        type: 'geojson',
        data: trolleyGeoJSON
      });

             // Add HD trolley line layers with proper styling
             // Insert before segments layers so trolley lines appear underneath roads
             const beforeLayer = 'segments-shadow';
             
             // Trolley shadow for depth (widest layer)
             map.current.addLayer({
               id: 'trolley-lines-shadow',
               type: 'line',
               source: 'trolley-lines',
               paint: {
                 'line-width': [
                   'interpolate',
                   ['linear'],
                   ['zoom'],
                   5, 3,
                   8, 6,
                   12, 12,
                   16, 30,
                   20, 80,
                   22, 240,
                   24, 480
                 ],
                 'line-color': 'rgba(255, 107, 107, 0.4)',
                 'line-opacity': 0.4,
                 'line-blur': [
                   'interpolate',
                   ['linear'],
                   ['zoom'],
                   5, 2,
                   8, 4,
                   12, 8,
                   16, 16,
                   20, 32,
                   22, 48
                 ]
               }
             }, beforeLayer);

             // Trolley base surface (medium layer)
             map.current.addLayer({
               id: 'trolley-lines-base',
               type: 'line',
               source: 'trolley-lines',
               paint: {
                 'line-width': [
                   'interpolate',
                   ['linear'],
                   ['zoom'],
                   5, 2,
                   8, 4,
                   12, 8,
                   16, 20,
                   20, 50,
                   22, 150,
                   24, 300
                 ],
                 'line-color': '#8B0000',
                 'line-opacity': 0.8
               }
             }, beforeLayer);

             // Trolley center line (thin, bright)
             map.current.addLayer({
               id: 'trolley-lines',
               type: 'line',
               source: 'trolley-lines',
               paint: {
                 'line-width': [
                   'interpolate',
                   ['linear'],
                   ['zoom'],
                   5, 1,
                   8, 2,
                   12, 4,
                   16, 12,
                   20, 30,
                   22, 90,
                   24, 180
                 ],
                 'line-color': '#FF6B6B',
                 'line-opacity': 1.0
               }
             }, beforeLayer);

             // Trolley hover layer (for highlighting on hover - extra wide)
             map.current.addLayer({
               id: 'trolley-lines-hover',
               type: 'line',
               source: 'trolley-lines',
               paint: {
                 'line-width': [
                   'interpolate',
                   ['linear'],
                   ['zoom'],
                   5, 8,
                   8, 16,
                   12, 32,
                   16, 80,
                   20, 200,
                   22, 600,
                   24, 1200
                 ],
                 'line-color': 'rgba(100, 100, 100, 0.5)',
                 'line-opacity': 0
               }
             }, beforeLayer);

             // Add hover tooltip functionality
             const trolleyLayers = ['trolley-lines', 'trolley-lines-base', 'trolley-lines-hover'];
             trolleyLayers.forEach(layerId => {
               map.current.on('mouseenter', layerId, (e) => {
                 map.current.getCanvas().style.cursor = 'pointer';
                 
                 // Show hover effect
                 map.current.setPaintProperty('trolley-lines-hover', 'line-opacity', 0.5);
                 
                 const feature = e.features[0];
                 const properties = feature.properties;
                 
                 // Create tooltip with detailed infrastructure info
                 const tooltip = document.getElementById('map-tooltip');
                 if (tooltip) {
                   tooltip.innerHTML = `
                     <div style="font-size: 12px; line-height: 1.5;">
                       <strong style="color: #FF6B6B;">⚡ ${properties.name}</strong><br/>
                       <strong>Lane ID:</strong> ${properties.lane_id}<br/>
                       <strong>Road ID:</strong> ${properties.road_id}<br/>
                       <strong>Length:</strong> ${properties.length_m}m<br/>
                       <hr style="margin: 6px 0; border: none; border-top: 1px solid #555;">
                       <strong style="color: #FFD700;">Power System:</strong><br/>
                       <strong>Voltage:</strong> 600V DC<br/>
                       <strong>Current:</strong> 200A<br/>
                       <strong>Power:</strong> 120kW<br/>
                       <strong>Wire Height:</strong> 5.5m<br/>
                       <hr style="margin: 6px 0; border: none; border-top: 1px solid #555;">
                       <strong style="color: #FFD700;">Infrastructure:</strong><br/>
                       <strong>Support Spacing:</strong> 50m<br/>
                       <strong>Catenary Type:</strong> Simple<br/>
                       <strong>Contact Wire:</strong> Copper 120mm²<br/>
                       <strong>Protection:</strong> Overcurrent + GF<br/>
                       <hr style="margin: 6px 0; border: none; border-top: 1px solid #555;">
                       <strong style="color: #FFD700;">Charging:</strong><br/>
                       <strong>Charger Type:</strong> Pantograph Contact<br/>
                       <strong>Max Vehicles:</strong> 4 concurrent<br/>
                       <strong>Charge Rate:</strong> 120kW per vehicle<br/>
                       <strong>Status:</strong> <span style="color: #2ECC71;">● Active</span>
                     </div>
                   `;
                   tooltip.style.display = 'block';
                 }
               });

               map.current.on('mousemove', layerId, (e) => {
                 const tooltip = document.getElementById('map-tooltip');
                 if (tooltip) {
                   tooltip.style.left = e.point.x + 10 + 'px';
                   tooltip.style.top = e.point.y - 10 + 'px';
                 }
               });

               map.current.on('mouseleave', layerId, () => {
                 map.current.getCanvas().style.cursor = '';
                 
                 // Hide hover effect
                 map.current.setPaintProperty('trolley-lines-hover', 'line-opacity', 0);
                 
                 const tooltip = document.getElementById('map-tooltip');
                 if (tooltip) {
                   tooltip.style.display = 'none';
                 }
               });
             });

      console.log('🚋 Trolley lines added for road 5861372');

    } catch (error) {
      console.error('❌ Error adding trolley lines:', error);
    }
  };


  // Geometric helper: find line-line intersection
  const getLineIntersection = (p1, p2, p3, p4) => {
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null; // parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1)
      ];
    }
    return null;
  };

  // Find intersection polygon from road edge lines
  const findRoadEdgeIntersections = (segmentsData, targetRoadIds) => {
    const roadSegments = [];
    
    segmentsData.forEach(segment => {
      if (!targetRoadIds.includes(segment.road_id)) return;
      if (!segment.geometry) return;
      
      let geometry;
      try {
        geometry = typeof segment.geometry === 'string' 
          ? JSON.parse(segment.geometry) 
          : segment.geometry;
      } catch (e) {
        return;
      }
      
      if (!geometry?.coordinates?.length) return;
      
      roadSegments.push({
        roadId: segment.road_id,
        coords: geometry.coordinates
      });
    });
    
    // Find all intersection points between road edges
    const intersectionPoints = [];
    for (let i = 0; i < roadSegments.length; i++) {
      for (let j = i + 1; j < roadSegments.length; j++) {
        const road1 = roadSegments[i];
        const road2 = roadSegments[j];
        
        // Check each segment of road1 against each segment of road2
        for (let k = 0; k < road1.coords.length - 1; k++) {
          for (let l = 0; l < road2.coords.length - 1; l++) {
            const intersection = getLineIntersection(
              road1.coords[k], road1.coords[k + 1],
              road2.coords[l], road2.coords[l + 1]
            );
            
            if (intersection) {
              intersectionPoints.push({
                point: intersection,
                roads: [road1.roadId, road2.roadId]
              });
            }
          }
        }
      }
    }
    
    console.log(`🎯 Found ${intersectionPoints.length} geometric intersection points for roads ${targetRoadIds.join(', ')}`);
    intersectionPoints.forEach(ip => {
      console.log(`  • Roads ${ip.roads[0]} ↔ ${ip.roads[1]}: [${ip.point[0].toFixed(6)}, ${ip.point[1].toFixed(6)}]`);
    });
    
    return intersectionPoints;
  };

  // Generate curve pairs from intersection points
  const generateCurvesFromIntersections = (intersectionPoints) => {
    if (intersectionPoints.length === 0) return [];
    
    // Group intersection points by proximity to form intersection clusters
    const clusters = [];
    const clusterThreshold = 0.0005; // Group points within ~50m
    
    intersectionPoints.forEach(ip => {
      let addedToCluster = false;
      
      for (let cluster of clusters) {
        const centerLng = cluster.points.reduce((s, p) => s + p.point[0], 0) / cluster.points.length;
        const centerLat = cluster.points.reduce((s, p) => s + p.point[1], 0) / cluster.points.length;
        const dist = Math.hypot(ip.point[0] - centerLng, ip.point[1] - centerLat);
        
        if (dist < clusterThreshold) {
          cluster.points.push(ip);
          addedToCluster = true;
          break;
        }
      }
      
      if (!addedToCluster) {
        clusters.push({ points: [ip] });
      }
    });
    
    console.log(`📍 Grouped into ${clusters.length} intersection cluster(s)`);
    
    // For each cluster, create curve pairs between nearby intersection points
    const curvePairs = [];
    clusters.forEach((cluster, clusterIdx) => {
      console.log(`  Cluster ${clusterIdx + 1}: ${cluster.points.length} intersection points`);
      
      // Sort points by angle around cluster center for logical ordering
      const centerLng = cluster.points.reduce((s, p) => s + p.point[0], 0) / cluster.points.length;
      const centerLat = cluster.points.reduce((s, p) => s + p.point[1], 0) / cluster.points.length;
      
      cluster.points.forEach(p => {
        p.angle = Math.atan2(p.point[1] - centerLat, p.point[0] - centerLng);
      });
      
      cluster.points.sort((a, b) => a.angle - b.angle);
      
      // Connect each point to the next (creating a ring)
      for (let i = 0; i < cluster.points.length; i++) {
        const nextIdx = (i + 1) % cluster.points.length;
        curvePairs.push([
          cluster.points[i].point,
          cluster.points[nextIdx].point
        ]);
      }
    });
    
    console.log(`✅ Generated ${curvePairs.length} curve pairs from intersections`);
    return curvePairs;
  };

  // Visualize intersection points on the map
  const visualizeIntersectionPoints = (intersectionPoints, sourceId = 'intersection-points') => {
    if (!map.current || intersectionPoints.length === 0) return;

    // Remove old markers
    if (map.current.getSource(sourceId)) {
      if (map.current.getLayer(`${sourceId}-circles`)) {
        map.current.removeLayer(`${sourceId}-circles`);
      }
      if (map.current.getLayer(`${sourceId}-labels`)) {
        map.current.removeLayer(`${sourceId}-labels`);
      }
      map.current.removeSource(sourceId);
    }

    // Create point features
    const pointFeatures = intersectionPoints.map((ip, index) => ({
      type: 'Feature',
      properties: {
        id: index + 1,
        road1: ip.roads[0],
        road2: ip.roads[1],
        label: `${ip.roads[0]}↔${ip.roads[1]}`
      },
      geometry: {
        type: 'Point',
        coordinates: ip.point
      }
    }));

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pointFeatures
      }
    });

    // Add HUGE circles at intersection points
    map.current.addLayer({
      id: `${sourceId}-circles`,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 15,
          12, 20,
          16, 30,
          20, 50,
          22, 80,
          24, 120
        ],
        'circle-color': '#FF0000', // BRIGHT RED - IMPOSSIBLE TO MISS
        'circle-opacity': 1.0,
        'circle-stroke-width': 4,
        'circle-stroke-color': '#FFFF00', // YELLOW STROKE
        'circle-stroke-opacity': 1
      }
    });

    // Add labels
    map.current.addLayer({
      id: `${sourceId}-labels`,
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 10,
        'text-offset': [0, 1.5],
        'text-anchor': 'top'
      },
      paint: {
        'text-color': '#FFFFFF',
        'text-halo-color': '#FF1493',
        'text-halo-width': 2,
        'text-halo-blur': 1
      }
    });

    console.log(`🔴🔴🔴 VISUALIZED ${intersectionPoints.length} INTERSECTION POINTS WITH HUGE RED CIRCLES 🔴🔴🔴`);
    console.log(`Location: ${sourceId}`);
    pointFeatures.forEach((pf, idx) => {
      console.log(`  ${idx + 1}. [${pf.geometry.coordinates[0].toFixed(6)}, ${pf.geometry.coordinates[1].toFixed(6)}] - ${pf.properties.label}`);
    });
  };

  // Helper function to find watering stations and speed monitoring data for a specific road segment
  const findRelatedData = (laneId, roadId, wateringStations, speedMonitoring) => {
    const relatedWatering = wateringStations.filter(station => 
      station.lane_id === laneId || station.road_id === roadId
    );
    
    const relatedSpeed = speedMonitoring.filter(monitoring => 
      monitoring.lane_id === laneId || monitoring.road_id === roadId
    );
    
    return { relatedWatering, relatedSpeed };
  };

  const addDataToMap = (locationsData, segmentsData, wateringStationsData = [], speedMonitoringData = []) => {
    if (!map.current || !map.current.isStyleLoaded()) {
      setTimeout(() => addDataToMap(locationsData, segmentsData, wateringStationsData, speedMonitoringData), 100);
      return;
    }

    // Store watering and speed data in component state for use in tooltips
    setWateringStations(wateringStationsData);
    setSpeedMonitoring(speedMonitoringData);

    if (map.current.getSource('locations')) {
      map.current.removeLayer('locations');
      map.current.removeSource('locations');
    }
    if (map.current.getSource('segments')) {
      const segmentLayers = ['segments', 'segments-shadow', 'segments-shadow-2', 'segments-shadow-3', 'segments-edge-lines', 'segments-edge-lines-2', 'segments-center-line', 'segments-highlight', 'segments-top-highlight', 'segments-ultra-highlight', 'segments-hover', 'road-labels'];
      segmentLayers.forEach(layerId => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      map.current.removeSource('segments');
    }


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
            console.error('❌ Failed to parse geometry for segment:', segment.lane_id, e);
            return null;
          }
          
          let offsetGeometry = geometry;
          if (geometry && geometry.coordinates && geometry.coordinates.length > 1) {
            offsetGeometry = applyLaneOffset(geometry, segment.direction, segment.road_id);
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
            geometry: offsetGeometry
          };
        }).filter(feature => feature !== null)
      };

      console.log(' Segments GeoJSON:', segmentsGeoJSON);
      console.log(' Valid segments features:', segmentsGeoJSON.features.length);

      map.current.addSource('segments', {
        type: 'geojson',
        data: segmentsGeoJSON
      });

      map.current.addLayer({
        id: 'segments-shadow',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 1,
            8, 2,
            12, 4,
            16, 16,
            20, 50,
            22, 150,
            24, 300
          ],
          'line-color': 'rgba(5, 5, 5, 0.95)',
          'line-opacity': 0.95,
          'line-blur': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 5,
            15, 15,
            20, 30
          ],
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 4,
            15, 12,
            20, 25,
            22, 50,
            24, 100
          ]
        }
      });

      map.current.addLayer({
        id: 'segments-shadow-2',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 12,
            15, 40,
            20, 120,
            22, 350,
            24, 700
          ],
          'line-color': 'rgba(15, 15, 15, 0.8)',
          'line-opacity': 0.85,
          'line-blur': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 3,
            15, 10,
            20, 20
          ],
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 2,
            15, 8,
            20, 16,
            22, 32,
            24, 64
          ]
        }
      });

      map.current.addLayer({
        id: 'segments-shadow-3',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 8,
            15, 30,
            20, 90,
            22, 260,
            24, 520
          ],
          'line-color': 'rgba(25, 25, 25, 0.6)',
          'line-opacity': 0.75,
          'line-blur': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 2,
            15, 6,
            20, 12
          ],
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1,
            15, 4,
            20, 8,
            22, 16,
            24, 32
          ]
        }
      });

      map.current.addLayer({
        id: 'segments',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 0.5,
            8, 1,
            12, 3,
            16, 12,
            20, 40,
            22, 120,
            24, 240
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#8B0000',
            '#1A1A1A'
          ],
          'line-opacity': 1.0,
          'line-blur': 0
        }
      });

      map.current.addLayer({
        id: 'segments-edge-lines',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1.5,
            15, 5,
            20, 15,
            22, 40,
            24, 80
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#FF6B6B',
            '#FFD700'
          ],
          'line-opacity': 1.0,
          'line-blur': 0,
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, -4,
            15, -12,
            20, -40,
            22, -120,
            24, -240
          ]
        }
      });

      map.current.addLayer({
        id: 'segments-edge-lines-2',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1.5,
            15, 5,
            20, 15,
            22, 40,
            24, 80
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#FF6B6B',
            '#FFD700'
          ],
          'line-opacity': 1.0,
          'line-blur': 0,
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 4,
            15, 12,
            20, 40,
            22, 120,
            24, 240
          ]
        }
      });

      map.current.addLayer({
        id: 'segments-center-line',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1,
            15, 3,
            20, 10,
            22, 30,
            24, 60
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#FF6B6B',
            '#FFFFFF'
          ],
          'line-opacity': 0.95,
          'line-blur': 0
        }
      });

      map.current.addLayer({
        id: 'segments-highlight',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 6,
            15, 20,
            20, 40,
            22, 80,
            24, 160
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#A00000',
            '#2A2A2A'
          ],
          'line-opacity': 0.9,
          'line-blur': 0,
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, -1,
            15, -3,
            20, -6,
            22, -12,
            24, -24
          ]
        }
      });

      map.current.addLayer({
        id: 'segments-top-highlight',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 4,
            15, 15,
            20, 30,
            22, 60,
            24, 120
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#B00000',
            '#3A3A3A'
          ],
          'line-opacity': 0.7,
          'line-blur': 0,
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, -2,
            15, -6,
            20, -12,
            22, -24,
            24, -48
          ]
        }
      });

      map.current.addLayer({
        id: 'segments-ultra-highlight',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 2,
            15, 10,
            20, 20,
            22, 40,
            24, 80
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#C00000',
            '#4A4A4A'
          ],
          'line-opacity': 0.5,
          'line-blur': 0,
          'line-offset': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, -3,
            15, -9,
            20, -18,
            22, -36,
            24, -72
          ]
        }
      });

      map.current.addLayer({
        id: 'road-labels',
        type: 'symbol',
        source: 'segments',
        layout: {
          'text-field': ['concat', 'Road ', ['get', 'road_id']],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 12,
            15, 18,
            20, 36,
            22, 72,
            24, 120
          ],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-optional': true,
          'symbol-placement': 'line-center',
          'text-rotation-alignment': 'map'
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': 'rgba(0, 0, 0, 0.8)',
          'text-halo-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 2,
            15, 3,
            20, 6,
            22, 12,
            24, 20
          ],
          'text-halo-blur': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1,
            15, 2,
            20, 4,
            22, 8,
            24, 12
          ]
        }
      });


      map.current.addLayer({
        id: 'segments-hover',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': 6,
          'line-color': [
            'case',
            ['get', 'is_closed'], '#E74C3C',
            '#2ECC71'
          ],
          'line-opacity': 0
        }
      });

      // Add click handler for roads
      map.current.on('click', 'segments', (e) => {
        const feature = e.features[0];
        const properties = feature.properties;
        
        // Check if this is one of our target roads (1003 or 1004) for trajectory config
        if (properties.road_id === 1003 || properties.road_id === 1004) {
          setSelectedSegment(properties);
          setShowTrajectoryConfig(true);
        } else {
          // For all other roads, show the road dialog
          setSelectedSegment(properties);
          setShowRoadDialog(true);
        }
      });
      
      console.log('✅ Segments layer added successfully');
    } else {
      console.log('❌ No segments data to add');
    }

    // Store locations data for later - will add locations layer AFTER all road layers
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

    findRoadConnections(segmentsData);
    
    // Add locations layer LAST so it renders on top of all road layers
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
      
      console.log('✅ Locations layer added on top of all road layers');
    }
    
    // Find geometric intersections for multiple intersection areas
    console.log('🔍 Analyzing intersection areas...');
    
    // Intersection 1: Original intersection
    const intersection1Roads = [5857830, 5857984, 5858138, 5858292, 5863066, 5857214, 5858446];
    const intersection1Points = findRoadEdgeIntersections(segmentsData, intersection1Roads);
    
    // Intersection 2: New intersection from the image
    const intersection2Roads = [5856752, 5857214, 5857368, 5857984, 5857676, 5863374, 5857522, 5863836];
    const intersection2Points = findRoadEdgeIntersections(segmentsData, intersection2Roads);
    
    // VISUALIZE THE INTERSECTION POINTS WITH HUGE RED MARKERS
    console.log('🔴🔴🔴 ADDING HUGE RED CIRCLES AT ALL INTERSECTION POINTS! 🔴🔴🔴');
    console.log(`Intersection 1 has ${intersection1Points.length} points`);
    console.log(`Intersection 2 has ${intersection2Points.length} points`);
    
    visualizeIntersectionPoints(intersection1Points, 'intersection-1-points');
    visualizeIntersectionPoints(intersection2Points, 'intersection-2-points');
    
    // Generate curves from geometric intersections
    const autoCurves1 = generateCurvesFromIntersections(intersection1Points);
    const autoCurves2 = generateCurvesFromIntersections(intersection2Points);
    
    addAutoCurves(autoCurves2, 'intersection-2'); // Add second intersection curves
  };


  const findRoadConnections = (segmentsData) => {
    if (!segmentsData || segmentsData.length === 0) return;

    if (map.current.getSource('road-connections')) {
      map.current.removeLayer('road-connections');
      map.current.removeSource('road-connections');
    }

    const roads = new Map();
    
    segmentsData.forEach(segment => {
      if (!segment.geometry) return;
      
      let geometry;
      try {
        geometry = typeof segment.geometry === 'string' 
          ? JSON.parse(segment.geometry) 
          : segment.geometry;
      } catch (e) {
        return;
      }

      if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) return;

      const roadId = segment.road_id;
      const coords = geometry.coordinates;
      
      if (!roads.has(roadId)) {
        roads.set(roadId, {
          start: coords[0],
          end: coords[coords.length - 1]
        });
      }
    });

    const connections = [];
    const roadIds = Array.from(roads.keys());
    const connectionDistance = 0.0005;

    for (let i = 0; i < roadIds.length; i++) {
      for (let j = i + 1; j < roadIds.length; j++) {
        const road1Id = roadIds[i];
        const road2Id = roadIds[j];
        const road1 = roads.get(road1Id);
        const road2 = roads.get(road2Id);

        const points1 = [road1.start, road1.end];
        const points2 = [road2.start, road2.end];

        for (let point1 of points1) {
          for (let point2 of points2) {
            const distance = Math.sqrt(
              Math.pow(point1[0] - point2[0], 2) + 
              Math.pow(point1[1] - point2[1], 2)
            );
            
            if (distance < connectionDistance) {
              connections.push({
                coordinates: [(point1[0] + point2[0]) / 2, (point1[1] + point2[1]) / 2],
                roads: [road1Id, road2Id]
              });
            }
          }
        }
      }
    }

    const clusteredConnections = [];
    const clusterDistance = 0.002;

    connections.forEach(connection => {
      let foundCluster = false;

      for (let cluster of clusteredConnections) {
        const distance = Math.sqrt(
          Math.pow(connection.coordinates[0] - cluster.coordinates[0], 2) +
          Math.pow(connection.coordinates[1] - cluster.coordinates[1], 2)
        );

        if (distance < clusterDistance) {
          connection.roads.forEach(roadId => {
            if (!cluster.roads.includes(roadId)) {
              cluster.roads.push(roadId);
            }
          });
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        clusteredConnections.push({
          coordinates: connection.coordinates,
          roads: [...connection.roads]
        });
      }
    });

    const connectionFeatures = clusteredConnections.map((point, index) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: point.coordinates
      },
      properties: {
        id: `road_connection_${index}`,
        road_count: point.roads.length,
        roads: point.roads,
        connection_type: 'road_connection'
      }
    }));

    console.log(`🛣️ Found ${connections.length} raw connections, clustered to ${connectionFeatures.length} intersections:`, connectionFeatures);
    if (connectionFeatures.length > 0) {
      map.current.addSource('road-connections', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: connectionFeatures
        }
      });

      map.current.addLayer({
        id: 'road-connections',
        type: 'circle',
        source: 'road-connections',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 3,
            15, 2,
            20, 2
          ],
          'circle-color': '#FF8C00',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.9
        }
      });

      let connectionPopup = null;

      map.current.on('mouseenter', 'road-connections', (e) => {
        closeCurrentTooltip(); // Close any existing tooltip
        map.current.getCanvas().style.cursor = 'pointer';
        const properties = e.features[0].properties;
        
        console.log('🔍 Tooltip properties:', properties);

        if (connectionPopup) {
          connectionPopup.remove();
        }

        connectionPopup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'road-connection-popup'
        })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="
              background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
              color: white; 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              font-size: 13px;
              padding: 12px 16px;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              min-width: 200px;
            ">
              <div style="
                display: flex; 
                align-items: center; 
                margin-bottom: 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid #FF8C00;
              ">
                <div style="
                  width: 8px; 
                  height: 8px; 
                  background: #FF8C00; 
                  border-radius: 50%; 
                  margin-right: 8px;
                "></div>
                <span style="
                  font-weight: 600; 
                  color: #FF8C00; 
                  font-size: 14px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                ">Road Connection</span>
              </div>
              
              <div style="margin-bottom: 6px;">
                <span style="
                  color: #34495e; 
                  font-size: 11px;
                  text-transform: uppercase;
                  letter-spacing: 0.3px;
                ">Connecting Roads:</span>
              </div>
              
              <div style="
                background: rgba(255, 140, 0, 0.1);
                border-left: 3px solid #FF8C00;
                padding: 8px 12px;
                border-radius: 4px;
                margin-top: 4px;
              ">
                <div style="
                  color: #ecf0f1; 
                  font-weight: 500; 
                  font-size: 12px;
                  line-height: 1.4;
                ">
                  ${(() => {
                    let roads = properties.roads;
                    console.log('🔍 Roads data:', roads, 'Type:', typeof roads, 'Is Array:', Array.isArray(roads));
                    
                    if (typeof roads === 'string' && roads.startsWith('[') && roads.endsWith(']')) {
                      try {
                        roads = JSON.parse(roads);
                        console.log('🔍 Parsed roads:', roads);
                      } catch (e) {
                        console.log('🔍 Failed to parse roads string:', e);
                      }
                    }
                    
                    if (Array.isArray(roads) && roads.length > 0) {
                      return roads.map(roadId => `
                        <div style="
                          display: inline-block;
                          background: #FF8C00;
                          color: #2c3e50;
                          padding: 2px 6px;
                          border-radius: 3px;
                          font-weight: 600;
                          font-size: 11px;
                          margin: 1px 2px;
                        ">Road ${roadId}</div>
                      `).join('');
                    } else if (roads && typeof roads === 'string') {
                      return `
                        <div style="
                          display: inline-block;
                          background: #FF8C00;
                          color: #2c3e50;
                          padding: 2px 6px;
                          border-radius: 3px;
                          font-weight: 600;
                          font-size: 11px;
                          margin: 1px 2px;
                        ">Road ${roads}</div>
                      `;
                    } else {
                      return '<span style="color: #e74c3c; font-style: italic;">No roads data</span>';
                    }
                  })()}
                </div>
              </div>
              
              <div style="
                margin-top: 8px;
                text-align: center;
                font-size: 10px;
                color: #95a5a6;
                font-style: italic;
              ">
                ${properties.road_count || 0} roads connected
              </div>
            </div>
          `)
          .addTo(map.current);
          
          currentPopup.current = connectionPopup;
          
          setTimeout(() => {
            const popupElement = document.querySelector('.mapboxgl-popup-content');
            if (popupElement) {
              popupElement.style.border = 'none';
              popupElement.style.outline = 'none';
            }
          }, 10);
      });

      map.current.on('mouseleave', 'road-connections', () => {
        map.current.getCanvas().style.cursor = '';
        if (connectionPopup) {
          connectionPopup.remove();
          connectionPopup = null;
        }
      });
    }
  };

  // Function to generate quadratic Bezier curve points
  const generateBezierCurve = (start, end, controlOffset = 0.0003, numPoints = 30) => {
    const midX = (start[0] + end[0]) / 2;
    const midY = (start[1] + end[1]) / 2;
    
    // Calculate perpendicular offset for control point
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const perpX = -dy;
    const perpY = dx;
    const len = Math.sqrt(perpX * perpX + perpY * perpY);
    
    const controlPoint = [
      midX + (perpX / len) * controlOffset,
      midY + (perpY / len) * controlOffset
    ];
    
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const t2 = t * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      
      const x = mt2 * start[0] + 2 * mt * t * controlPoint[0] + t2 * end[0];
      const y = mt2 * start[1] + 2 * mt * t * controlPoint[1] + t2 * end[1];
      points.push([x, y]);
    }
    
    return points;
  };

  // Function to add curved intersections
  // const addCurvedIntersections = (segmentsData) => {
  //   if (!segmentsData || segmentsData.length === 0 || !map.current) return;

  //   console.log('Starting curve generation for intersection...');

  //   // Remove existing intersection curves if they exist
  //   if (map.current.getSource('intersection-curves')) {
  //     const layers = [
  //       'intersection-curves-glow',
  //       'intersection-curves',          // white base
  //       'intersection-curves-blue'      // 🔵 new top layer
  //     ];
  //     layers.forEach(id => map.current.getLayer(id) && map.current.removeLayer(id));
  //     map.current.removeSource('intersection-curves');
  //   }

  //   // Build a map of road endpoints
  //   const roadEndpoints = new Map();
    
  //   segmentsData.forEach(segment => {
  //     if (!segment.geometry) return;
      
  //     let geometry;
  //     try {
  //       geometry = typeof segment.geometry === 'string' 
  //         ? JSON.parse(segment.geometry) 
  //         : segment.geometry;
  //     } catch (e) {
  //       return;
  //     }

  //     if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) return;

  //     const roadId = segment.road_id;
  //     const coords = geometry.coordinates;
  //     const direction = segment.direction;
      
  //     if (!roadEndpoints.has(roadId)) {
  //       roadEndpoints.set(roadId, {
  //         start: coords[0],
  //         end: coords[coords.length - 1],
  //         allCoords: coords,
  //         direction: direction
  //       });
  //     }
  //   });

  //   console.log('🔵 Auto-detecting intersections to add curves...');

  //   // --- replace the auto-detect block with closest-vertices search ---
  //   const curveFeatures = [];
  //   const allowedRoadIds = new Set([5857830, 5857984, 5858138, 5858292]);
  //   let roadIds = Array.from(roadEndpoints.keys()).filter(id => allowedRoadIds.has(id));

  //   // compute approximate intersection center from selected roads
  //   const center = (() => {
  //     let sumLng = 0, sumLat = 0, count = 0;
  //     roadIds.forEach(id => {
  //       const r = roadEndpoints.get(id);
  //       if (!r) return;
  //       [r.start, r.end].forEach(p => { if (p) { sumLng += p[0]; sumLat += p[1]; count++; } });
  //     });
  //     return count ? [sumLng / count, sumLat / count] : null;
  //   })();

  //   const limitRadiusDeg = 0.001; // ~100m radius around intersection center

  //   // helper: closest pair of vertices between two lines
  //   const closestPair = (coordsA, coordsB) => {
  //     let best = { d2: Infinity, a: null, b: null };
  //     for (let i = 0; i < coordsA.length; i++) {
  //       for (let j = 0; j < coordsB.length; j++) {
  //         const ax = coordsA[i][0], ay = coordsA[i][1];
  //         const bx = coordsB[j][0], by = coordsB[j][1];
  //         const d2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  //         if (d2 < best.d2) best = { d2, a: coordsA[i], b: coordsB[j] };
  //       }
  //     }
  //     return best;
  //   };

  //   const maxConnectDistDeg = 0.002; // ~200 m
  //   for (let i = 0; i < roadIds.length; i++) {
  //     for (let j = i + 1; j < roadIds.length; j++) {
  //       const r1 = roadEndpoints.get(roadIds[i]);
  //       const r2 = roadEndpoints.get(roadIds[j]);
  //       if (!r1?.allCoords?.length || !r2?.allCoords?.length) continue;

  //       const { d2, a: pA, b: pB } = closestPair(r1.allCoords, r2.allCoords);
  //       if (!pA || !pB) continue;

  //       const d = Math.sqrt(d2);
  //       // keep only points near the chosen intersection center
  //       if (center) {
  //         const distToCenter = (p) => Math.sqrt(Math.pow(p[0]-center[0],2)+Math.pow(p[1]-center[1],2));
  //         if (distToCenter(pA) > limitRadiusDeg || distToCenter(pB) > limitRadiusDeg) continue;
  //       }
  //       if (d > maxConnectDistDeg) continue; // too far to connect

  //       // shorten towards the middle so the curve only lives at the junction
  //       const shorten = 0.35;
  //       const dx = pB[0] - pA[0];
  //       const dy = pB[1] - pA[1];
  //       const startPoint = [pA[0] + dx * shorten, pA[1] + dy * shorten];
  //       const endPoint   = [pB[0] - dx * shorten, pB[1] - dy * shorten];

  //       // control offset proportional to pair distance so tiny joins still visible
  //       const controlOffset = Math.max(0.00006, d * 0.4); // ~6m min
  //       const coords = generateBezierCurve(startPoint, endPoint, controlOffset, 24);

  //       // skip degenerate (identical) curves
  //       if (coords.length < 2 || (coords[0][0] === coords[coords.length-1][0] && coords[0][1] === coords[coords.length-1][1])) continue;

  //       curveFeatures.push({
  //         type: 'Feature',
  //         properties: {
  //           from_road: roadIds[i],
  //           to_road: roadIds[j],
  //           connection_type: 'curve',
  //           distance: d
  //         },
  //         geometry: { type: 'LineString', coordinates: coords }
  //       });
  //     }
  //   }

  //   console.log(`🔵 Total curves created: ${curveFeatures.length}`);

  //   if (curveFeatures.length > 0) {
  //     console.log(`🔵 Adding ${curveFeatures.length} small blue curves to intersection...`);

  //     map.current.addSource('intersection-curves', {
  //       type: 'geojson',
  //       data: {
  //         type: 'FeatureCollection',
  //         features: curveFeatures
  //       }
  //     });

  //     // 1) subtle shadow for depth
  //     map.current.addLayer({
  //       id: 'intersection-curves-glow',
  //       type: 'line',
  //       source: 'intersection-curves',
  //       layout: { 'line-cap': 'round', 'line-join': 'round' },
  //       paint: {
  //         'line-width': ['interpolate',['linear'],['zoom'],5,1.5,10,4,16,8,20,20,24,60],
  //         'line-color': '#000',
  //         'line-opacity': 0.35,
  //         'line-blur': ['interpolate',['linear'],['zoom'],5,0.5,10,1,16,2,20,5]
  //       }
  //     });

  //     // 2) WHITE base curve (thicker)
  //     map.current.addLayer({
  //       id: 'intersection-curves',
  //       type: 'line',
  //       source: 'intersection-curves',
  //       layout: { 'line-cap': 'round', 'line-join': 'round' },
  //       paint: {
  //         'line-width': ['interpolate',['linear'],['zoom'],5,2,10,4,16,8,20,16,24,40],
  //         'line-color': '#FFFFFF',
  //         'line-opacity': 1
  //       }
  //     });

  //     // 3) BLUE top curve (slightly thinner so it sits "on" the white)
  //     map.current.addLayer({
  //       id: 'intersection-curves-blue',
  //       type: 'line',
  //       source: 'intersection-curves',
  //       layout: { 'line-cap': 'round', 'line-join': 'round' },
  //       paint: {
  //         'line-width': ['interpolate',['linear'],['zoom'],5,1.2,10,3,16,5,20,12,24,30],
  //         'line-color': '#2D6BFF',
  //         'line-opacity': 1
  //       }
  //     });

  //     console.log('✅ BLUE-ON-WHITE CURVES ADDED TO INTERSECTIONS!');
  //   } else {
  //     console.error('❌ NO CURVES CREATED - check console for detected roads');
  //   }
  // };

  // Add auto-generated curves from geometric intersections
  const addAutoCurves = (curvePairs, sourceId = 'auto-curves') => {
    if (!map.current || curvePairs.length === 0) return;

    console.log(`🎨 Adding ${curvePairs.length} auto-generated curves for ${sourceId}...`);

    // Remove old layers/sources
    const layerIds = [`${sourceId}-glow`, `${sourceId}-white`, `${sourceId}-blue`];
    layerIds.forEach(id => map.current.getLayer(id) && map.current.removeLayer(id));
    map.current.getSource(sourceId) && map.current.removeSource(sourceId);

    // Build features with curves
    const feats = curvePairs.map(([a, b], index) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const dist = Math.hypot(dx, dy);
      const control = Math.min(0.00018, dist * 0.35);
      
      return {
        type: 'Feature',
        properties: {
          curve_id: index + 1,
          from_lng: a[0].toFixed(6),
          from_lat: a[1].toFixed(6),
          to_lng: b[0].toFixed(6),
          to_lat: b[1].toFixed(6),
          color_group: 'green' // Different color for auto curves
        },
        geometry: { type: 'LineString', coordinates: generateBezierCurve(a, b, control, 18) }
      };
    });

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: feats }
    });

    // Add glow layer
    map.current.addLayer({
      id: `${sourceId}-glow`,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 10, 20, 24, 22, 60, 24, 120],
        'line-color': '#000000',
        'line-opacity': 0.15,
        'line-blur': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 4, 20, 8, 24, 16]
      }
    });

    // Add white base
    map.current.addLayer({
      id: `${sourceId}-white`,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 10, 20, 20, 22, 45, 24, 90],
        'line-color': '#FFFFFF',
        'line-opacity': 0.7
      }
    });

    // Add colored top layer
    map.current.addLayer({
      id: `${sourceId}-blue`,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 6, 20, 14, 22, 32, 24, 64],
        'line-color': '#32CD32', // Lime green for second intersection
        'line-opacity': 0.6
      }
    });

    console.log(`✅ Added ${feats.length} auto-generated curves`);
  };

  const addTestGLTFPin = () => {
    console.log('🧪 Testing 3D cube...');
    map.current.addSource('test-cube-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [148.905917, -23.851589], // Bottom-left
              [148.906117, -23.851589], // Bottom-right
              [148.906117, -23.851789], // Top-right
              [148.905917, -23.851789], // Top-left
              [148.905917, -23.851589]  // Close polygon
            ]]
          },
          properties: {
            id: 'test-cube'
          }
        }]
      }
    });
    
    map.current.addLayer({
      id: 'test-cube-layer',
      type: 'fill-extrusion',
      source: 'test-cube-source',
      paint: {
        'fill-extrusion-color': '#FF0000',
        'fill-extrusion-height': 200,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9
      }
    });
    
    console.log('✅ HUGE 3D red cube added at your coordinates!');
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

  const applyLaneOffset = (geometry, direction, roadId) => {
    if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
      return geometry;
    }

    const coordinates = geometry.coordinates;
    const offsetDistance = 0.0001;
    const offsetCoordinates = coordinates.map((coord, index) => {
      if (index === 0 || index === coordinates.length - 1) {
        let dx, dy;
        if (index === 0) {
          dx = coordinates[1][0] - coord[0];
          dy = coordinates[1][1] - coord[1];
        } else {
          dx = coord[0] - coordinates[index - 1][0];
          dy = coord[1] - coordinates[index - 1][1];
        }
        
        const perpX = -dy;
        const perpY = dx;
        
        const length = Math.sqrt(perpX * perpX + perpY * perpY);
        if (length > 0) {
          const normalizedX = perpX / length;
          const normalizedY = perpY / length;
          
          const offset = direction === 'forward' ? offsetDistance : -offsetDistance;
          
          return [
            coord[0] + normalizedX * offset,
            coord[1] + normalizedY * offset
          ];
        }
      } else {
        const dx1 = coordinates[index + 1][0] - coordinates[index - 1][0];
        const dy1 = coordinates[index + 1][1] - coordinates[index - 1][1];
        
        const perpX = -dy1;
        const perpY = dx1;
        
        const length = Math.sqrt(perpX * perpX + perpY * perpY);
        if (length > 0) {
          const normalizedX = perpX / length;
          const normalizedY = perpY / length;
          
          const offset = direction === 'forward' ? offsetDistance : -offsetDistance;
          
          return [
            coord[0] + normalizedX * offset,
            coord[1] + normalizedY * offset
          ];
        }
      }
      
      return coord;
    });

    return {
      ...geometry,
      coordinates: offsetCoordinates
    };
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
    const openRoads = segments.filter(s => !s.is_closed).length;
    const closedRoads = segments.filter(s => s.is_closed).length;
    return { open: openRoads, closed: closedRoads };
  };

  const locationCounts = getLocationCounts();
  const roadCounts = getRoadCounts();

  const [currentStyle, setCurrentStyle] = useState('Satellite Streets');

  const mapStyles = [
    { name: 'Satellite Streets', value: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { name: 'Topographic', value: 'mapbox://styles/mapbox/outdoors-v12' },
    { name: 'Streets', value: 'mapbox://styles/mapbox/streets-v12' },
    { name: 'Satellite', value: 'mapbox://styles/mapbox/satellite-v12' },
    { name: 'Light', value: 'mapbox://styles/mapbox/light-v11' },
    { name: 'Dark', value: 'mapbox://styles/mapbox/dark-v11' },
    { name: 'Navigation Day', value: 'mapbox://styles/mapbox/navigation-day-v1' },
    { name: 'Navigation Night', value: 'mapbox://styles/mapbox/navigation-night-v1' }
  ];

  const changeMapStyle = (newStyle) => {
    if (map.current) {
      const styleInfo = mapStyles.find(style => style.value === newStyle);
      setCurrentStyle(styleInfo ? styleInfo.name : 'Satellite Streets');
      
      map.current.off('style.load');
      
      map.current.on('style.load', () => {
        setTimeout(() => {
          addHillshadeLayer();
          addDataToMap(locations, segments);
        }, 100);
      });
      
      const styleTimeout = setTimeout(() => {
        console.log('⏰ Style loading timeout, reverting to Satellite Streets');
        map.current.off('error');
        map.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
      }, 10000);
      
      map.current.on('style.load', () => {
        clearTimeout(styleTimeout);
      });
      
      map.current.on('error', (e) => {
        const errorMessage = e?.error?.message || e?.message || '';
        if (errorMessage.includes('WEBGL_debug_renderer_info') || 
            errorMessage.includes('texSubImage') ||
            errorMessage.includes('Alpha-premult')) {
          return;
        }
        
        console.error('❌ Style loading error:', e?.error || e);
        if (newStyle !== 'mapbox://styles/mapbox/satellite-streets-v12') {
          console.log('🔄 Reverting to Satellite Streets style');
          map.current.off('error');
          map.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
        }
      });
      
      map.current.setStyle(newStyle);
    }
  };

  const setupTooltips = () => {
    
    const tooltip = document.createElement('div');
    tooltip.id = 'map-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      background: rgba(40, 40, 40, 0.75);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-family: 'Segoe UI', sans-serif;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(120, 120, 120, 0.4);
      pointer-events: none;
      z-index: 1000;
      max-width: 300px;
      line-height: 1.4;
      display: none;
    `;
    document.body.appendChild(tooltip);

    map.current.on('mouseenter', 'locations', (e) => {
      closeCurrentTooltip(); // Close any existing tooltip
      map.current.getCanvas().style.cursor = 'pointer';
      
      const feature = e.features[0];
      const properties = feature.properties;
      
      const tooltipContent = `
        <div style="font-weight: 600; color: #3498db; margin-bottom: 8px; font-size: 14px; border-bottom: 2px solid #3498db; padding-bottom: 4px;">
          ${properties.name || 'Unknown Location'}
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Type:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.type || 'Unknown'}</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Category:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.category || 'N/A'}</span>
        </div>
        <div style="color: #95a5a6; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d; font-style: italic;">
          Click for more details
        </div>
      `;
      
      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = 'block';
      currentTooltip.current = tooltip; 
    });

    map.current.on('mousemove', 'locations', (e) => {
      tooltip.style.left = e.point.x + 10 + 'px';
      tooltip.style.top = e.point.y - 10 + 'px';
    });

    map.current.on('mouseleave', 'locations', () => {
      map.current.getCanvas().style.cursor = '';
      tooltip.style.display = 'none';
    });

    const segmentLayers = ['segments', 'segments-shadow', 'segments-shadow-2', 'segments-shadow-3', 'segments-edge-lines', 'segments-edge-lines-2', 'segments-center-line', 'segments-highlight', 'segments-top-highlight', 'segments-ultra-highlight', 'segments-hover'];
    segmentLayers.forEach(layerId => {
      map.current.on('mouseenter', layerId, (e) => {
        closeCurrentTooltip();
        map.current.getCanvas().style.cursor = 'pointer';
        
        const feature = e.features[0];
        const properties = feature.properties;
        
        // Find related watering stations and speed monitoring data
        const { relatedWatering, relatedSpeed } = findRelatedData(properties.id, properties.road_id, wateringStations, speedMonitoring);
        
        // Check if this is road 5861372 - show only watering info
        const isRoad5861372 = properties.road_id === 5861372;
        
        const tooltipContent = `
          <div style="font-weight: 600; color: ${properties.is_closed ? '#E74C3C' : '#2ECC71'}; margin-bottom: 8px; font-size: 14px; border-bottom: 2px solid ${properties.is_closed ? '#E74C3C' : '#2ECC71'}; padding-bottom: 4px;">
            ${properties.id || 'Unknown Lane'}
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Road ID:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.road_id || 'N/A'}</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Direction:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.direction || 'Unknown'}</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Length:</span>
            <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.length_m ? properties.length_m.toFixed(1) + 'm' : 'N/A'}</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #bdc3c7;">Status:</span>
            <span style="color: ${properties.is_closed ? '#E74C3C' : '#2ECC71'}; margin-left: 8px; font-weight: 600;">${properties.is_closed ? 'Closed' : 'Open'}</span>
          </div>
          ${isRoad5861372 ? `
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d;">
              <div style="color: #3498db; font-weight: 600; margin-bottom: 4px; font-size: 12px;">💧 Watering Information</div>
              <div style="margin-left: 8px; margin-bottom: 2px; font-size: 11px;">
                <span style="color: #bdc3c7;">Watering Status:</span>
                <span style="color: #2ECC71; margin-left: 4px;">Active</span>
              </div>
              <div style="margin-left: 8px; margin-bottom: 2px; font-size: 11px;">
                <span style="color: #bdc3c7;">Watering Zones:</span>
                <span style="color: white; margin-left: 4px;">3 zones (High Priority)</span>
              </div>
              <div style="margin-left: 8px; margin-bottom: 2px; font-size: 11px;">
                <span style="color: #bdc3c7;">Watering Ratio:</span>
                <span style="color: white; margin-left: 4px;">0.8 (80%)</span>
              </div>
              <div style="margin-left: 8px; margin-bottom: 2px; font-size: 11px;">
                <span style="color: #bdc3c7;">Last Watered:</span>
                <span style="color: white; margin-left: 4px;">2 hours ago</span>
              </div>
              <div style="margin-left: 8px; margin-bottom: 2px; font-size: 11px;">
                <span style="color: #bdc3c7;">Next Watering:</span>
                <span style="color: #f39c12; margin-left: 4px;">Scheduled in 1 hour</span>
              </div>
            </div>
          ` : ''}
          ${!isRoad5861372 && relatedWatering.length > 0 ? `
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d;">
              <div style="color: #3498db; font-weight: 600; margin-bottom: 4px; font-size: 12px;">💧 Watering Stations (${relatedWatering.length})</div>
              ${relatedWatering.map(station => `
                <div style="margin-left: 8px; margin-bottom: 2px; font-size: 11px;">
                  <span style="color: #bdc3c7;">${station.station_name}:</span>
                  <span style="color: white; margin-left: 4px;">${station.station_type} (${station.capacity_liters}L)</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${!isRoad5861372 && relatedSpeed.length > 0 ? `
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d;">
              <div style="color: #f39c12; font-weight: 600; margin-bottom: 4px; font-size: 12px;">🚗 Speed Monitoring (${relatedSpeed.length})</div>
              ${relatedSpeed.map(monitoring => `
                <div style="margin-left: 8px; margin-bottom: 2px; font-size: 11px;">
                  <span style="color: #bdc3c7;">${monitoring.speed_kmh} km/h:</span>
                  <span style="color: white; margin-left: 4px;">${monitoring.violation_type} (${monitoring.operational_mode})</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="color: #95a5a6; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d; font-style: italic;">
            Click for more details
          </div>
        `;
        
        tooltip.innerHTML = tooltipContent;
        tooltip.style.display = 'block';
        currentTooltip.current = tooltip;
      });

      map.current.on('mousemove', layerId, (e) => {
        tooltip.style.left = e.point.x + 10 + 'px';
        tooltip.style.top = e.point.y - 10 + 'px';
      });

      map.current.on('mouseleave', layerId, () => {
        map.current.getCanvas().style.cursor = '';
        tooltip.style.display = 'none';
      });
    });

    map.current.on('click', 'locations', (e) => {
      const feature = e.features[0];
      const properties = feature.properties;
      const coordinates = e.lngLat;
      
      new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: 'transparent-popup'
      })
        .setLngLat(coordinates)
        .setHTML(`
          <div style="font-family: 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; min-width: 250px; padding: 12px; background: rgba(40, 40, 40, 0.9); border-radius: 8px; backdrop-filter: blur(15px);">
            <div style="font-weight: 700; color: #3498db; margin-bottom: 12px; font-size: 16px; border-bottom: 2px solid #3498db; padding-bottom: 6px;">
              ${properties.name || 'Unknown Location'}
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">Type:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.type || 'Unknown'}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">Category:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.category || 'N/A'}</span>
            </div>
            <div style="color: #95a5a6; font-size: 11px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #7f8c8d; font-style: italic;">
              Coordinates: ${coordinates.lng.toFixed(6)}, ${coordinates.lat.toFixed(6)}
            </div>
          </div>
        `)
        .addTo(map.current);
    });

    // Click handler for decrypted positions
    map.current.on('click', 'decrypted-positions', (e) => {
      const feature = e.features[0];
      const properties = feature.properties;
      const coordinates = e.lngLat;
      
      new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: 'transparent-popup'
      })
        .setLngLat(coordinates)
        .setHTML(`
          <div style="font-family: 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; min-width: 300px; padding: 12px; background: rgba(40, 40, 40, 0.9); border-radius: 8px; backdrop-filter: blur(15px);">
            <div style="font-weight: 700; color: ${properties.isMock ? '#FF6B6B' : '#4ECDC4'}; margin-bottom: 12px; font-size: 16px; border-bottom: 2px solid ${properties.isMock ? '#FF6B6B' : '#4ECDC4'}; padding-bottom: 6px;">
              ${properties.isMock ? '🔴 Mock Decrypted Position' : '🔓 Decrypted Position'}
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">UTM Easting:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.easting?.toFixed(3) || 'N/A'}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">UTM Northing:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.northing?.toFixed(3) || 'N/A'}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">Z (Elevation):</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.z?.toFixed(2) || 'N/A'}m</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">Heading:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.heading?.toFixed(1) || 'N/A'}°</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">Inclination:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.inclination?.toFixed(1) || 'N/A'}°</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #bdc3c7; font-weight: 500;">Status:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.status || 'N/A'}</span>
            </div>
            <div style="color: #95a5a6; font-size: 11px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #7f8c8d; font-style: italic;">
              Lat/Lng: ${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}<br/>
              Timestamp: ${new Date(properties.timestamp).toLocaleString()}
            </div>
            ${properties.rawData ? `
              <div style="color: #95a5a6; font-size: 10px; margin-top: 8px; padding: 6px; background: rgba(0,0,0,0.3); border-radius: 4px; font-family: monospace;">
                Raw: ${properties.rawData}
              </div>
            ` : ''}
          </div>
        `)
        .addTo(map.current);
    });

    const clickableLayers = ['segments', 'segments-shadow', 'segments-shadow-2', 'segments-shadow-3', 'segments-edge-lines', 'segments-edge-lines-2', 'segments-center-line', 'segments-highlight', 'segments-top-highlight', 'segments-ultra-highlight', 'segments-hover'];
    clickableLayers.forEach(layerId => {
      map.current.on('click', layerId, async (e) => {
        const feature = e.features[0];
        const properties = feature.properties;
        const coordinates = e.lngLat;
        
        // Fetch speed limits and watering data
        let speedLimitsHTML = '';
        let wateringHTML = '';
        
        try {
          // Fetch speed limits for this road
          const speedResponse = await fetch('/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `
                query {
                  speedLimitsByRoad(roadId: ${properties.road_id}) {
                    series_name
                    manufacturer
                    speed_limit_kmh
                    condition_type
                  }
                }
              `
            })
          });
          
          const speedData = await speedResponse.json();
          const speedLimits = speedData.data?.speedLimitsByRoad || [];
          
          if (speedLimits.length > 0) {
            // Group speed limits by vehicle series to remove duplicates
            const uniqueLimits = [];
            const seen = new Set();
            
            speedLimits.forEach(limit => {
              const key = `${limit.manufacturer}_${limit.series_name}_${limit.condition_type}`;
              if (!seen.has(key)) {
                seen.add(key);
                uniqueLimits.push(limit);
              }
            });
            
            speedLimitsHTML = `
              <div style="
                margin-top: 16px;
                padding: 16px;
                background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.05) 100%);
                border-radius: 8px;
                border-left: 4px solid #FFD700;
              ">
                <div style="
                  display: flex;
                  align-items: center;
                  margin-bottom: 12px;
                  font-size: 16px;
                  font-weight: 600;
                  color: #FFD700;
                ">
                  <span style="font-size: 20px; margin-right: 8px;"> </span>
                  Speed Limits
                </div>
                <div style="display: grid; gap: 8px;">
            `;
            
            uniqueLimits.forEach(limit => {
              const conditionColor = limit.condition_type === 'loaded' ? '#FF6B6B' : 
                                    limit.condition_type === 'watering' ? '#4ECDC4' : '#95a5a6';
              speedLimitsHTML += `
                <div style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 10px 12px;
                  background: rgba(255, 255, 255, 0.05);
                  border-radius: 6px;
                  transition: all 0.2s;
                ">
                  <div style="flex: 1;">
                    <div style="color: white; font-weight: 600; font-size: 13px; margin-bottom: 2px;">
                      ${limit.manufacturer} ${limit.series_name}
                    </div>
                    <div style="color: ${conditionColor}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${limit.condition_type}
                    </div>
                  </div>
                  <div style="
                    background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
                    color: #000;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-weight: 700;
                    font-size: 15px;
                    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
                  ">
                    ${limit.speed_limit_kmh} km/h
                  </div>
                </div>
              `;
            });
            
            speedLimitsHTML += `
                </div>
              </div>
            `;
          }
          
          // Fetch watering data for this road
          const wateringResponse = await fetch('/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `
                query {
                  wateringByRoad(roadId: ${properties.road_id}) {
                    interval_minutes
                    pattern
                    amount
                    equipment
                    circuit
                  }
                }
              `
            })
          });
          
          const wateringData = await wateringResponse.json();
          const watering = wateringData.data?.wateringByRoad?.[0];
          
          if (watering) {
            wateringHTML = `
              <div style="
                margin-top: 16px;
                padding: 16px;
                background: linear-gradient(135deg, rgba(78, 205, 196, 0.1) 0%, rgba(78, 205, 196, 0.05) 100%);
                border-radius: 8px;
                border-left: 4px solid #4ECDC4;
              ">
                <div style="
                  display: flex;
                  align-items: center;
                  margin-bottom: 12px;
                  font-size: 16px;
                  font-weight: 600;
                  color: #4ECDC4;
                ">
                  <span style="font-size: 20px; margin-right: 8px;">💧</span>
                  Watering Schedule
                </div>
                <div style="display: grid; gap: 10px;">
                  <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 6px;
                  ">
                    <span style="color: #bdc3c7; font-size: 12px;">Interval</span>
                    <span style="color: white; font-weight: 600; font-size: 14px;">${watering.interval_minutes} min</span>
                  </div>
                  <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 6px;
                  ">
                    <span style="color: #bdc3c7; font-size: 12px;">Pattern</span>
                    <span style="
                      color: #4ECDC4;
                      font-weight: 600;
                      font-size: 12px;
                      text-transform: uppercase;
                      letter-spacing: 0.5px;
                      background: rgba(78, 205, 196, 0.2);
                      padding: 4px 10px;
                      border-radius: 12px;
                    ">${watering.pattern}</span>
                  </div>
                  <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 6px;
                  ">
                    <span style="color: #bdc3c7; font-size: 12px;">Amount</span>
                    <span style="color: white; font-weight: 600; font-size: 14px;">${watering.amount} L/m²</span>
                  </div>
                  ${watering.equipment ? `
                    <div style="
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                      padding: 8px 12px;
                      background: rgba(255, 255, 255, 0.03);
                      border-radius: 6px;
                    ">
                      <span style="color: #bdc3c7; font-size: 12px;">Equipment</span>
                      <span style="color: white; font-weight: 600; font-size: 14px;">${watering.equipment}</span>
                    </div>
                  ` : ''}
                  ${watering.circuit ? `
                    <div style="
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                      padding: 8px 12px;
                      background: rgba(255, 255, 255, 0.03);
                      border-radius: 6px;
                    ">
                      <span style="color: #bdc3c7; font-size: 12px;">Circuit</span>
                      <span style="color: white; font-weight: 600; font-size: 14px;">${watering.circuit}</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }
        } catch (error) {
          console.error('Error fetching road data:', error);
        }
        
        // Create a centered popup using a custom div instead of Mapbox popup
        const popupDiv = document.createElement('div');
        popupDiv.className = 'road-info-popup';
        popupDiv.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10000;
          background: rgba(30, 30, 30, 0.95);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(120, 120, 120, 0.4);
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
        `;
        
        popupDiv.innerHTML = `
          <div style="position: relative; padding: 24px;">
            <button id="closePopupBtn" style="
              position: absolute;
              top: 16px;
              right: 16px;
              background: rgba(255, 255, 255, 0.1);
              border: none;
              color: white;
              font-size: 24px;
              cursor: pointer;
              border-radius: 50%;
              width: 36px;
              height: 36px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
            " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">×</button>
            
            <div style="font-family: 'Segoe UI', sans-serif; color: white;">
              <!-- Header -->
              <div style="
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 2px solid ${properties.is_closed ? '#E74C3C' : '#2ECC71'};
              ">
                <div style="
                  font-weight: 700;
                  color: ${properties.is_closed ? '#E74C3C' : '#2ECC71'};
                  font-size: 20px;
                  margin-bottom: 4px;
                  letter-spacing: 0.3px;
                ">
                  ${properties.id || 'Unknown Lane'}
                </div>
                <div style="
                  display: inline-block;
                  background: ${properties.is_closed ? 'rgba(231, 76, 60, 0.2)' : 'rgba(46, 204, 113, 0.2)'};
                  color: ${properties.is_closed ? '#E74C3C' : '#2ECC71'};
                  padding: 4px 12px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: 600;
                  text-transform: uppercase;
                  letter-spacing: 0.8px;
                ">
                  ${properties.is_closed ? '🚫 Closed' : '✓ Open'}
                </div>
              </div>
              
              <!-- Basic Info Grid -->
              <div style="
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-bottom: 16px;
              ">
                <div style="
                  padding: 12px;
                  background: rgba(255, 255, 255, 0.03);
                  border-radius: 8px;
                  border-left: 3px solid #3498db;
                ">
                  <div style="color: #95a5a6; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Road ID
                  </div>
                  <div style="color: white; font-weight: 700; font-size: 16px;">
                    ${properties.road_id || 'N/A'}
                  </div>
                </div>
                <div style="
                  padding: 12px;
                  background: rgba(255, 255, 255, 0.03);
                  border-radius: 8px;
                  border-left: 3px solid #9b59b6;
                ">
                  <div style="color: #95a5a6; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Direction
                  </div>
                  <div style="color: white; font-weight: 700; font-size: 16px; text-transform: capitalize;">
                    ${properties.direction || 'Unknown'}
                  </div>
                </div>
              </div>
              
              <div style="
                padding: 12px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
                border-left: 3px solid #e67e22;
                margin-bottom: 16px;
              ">
                <div style="color: #95a5a6; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Length
                </div>
                <div style="color: white; font-weight: 700; font-size: 16px;">
                  ${properties.length_m ? properties.length_m.toFixed(1) + ' meters' : 'N/A'}
                </div>
              </div>
              
              ${speedLimitsHTML}
              ${wateringHTML}
              
              <!-- Footer -->
              <div style="
                margin-top: 20px;
                padding-top: 16px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                align-items: center;
                justify-content: space-between;
              ">
                <div style="color: #7f8c8d; font-size: 11px; font-style: italic;">
                  📍 ${coordinates.lng.toFixed(6)}, ${coordinates.lat.toFixed(6)}
                </div>
                <div style="
                  background: rgba(52, 152, 219, 0.2);
                  color: #3498db;
                  padding: 4px 10px;
                  border-radius: 8px;
                  font-size: 10px;
                  font-weight: 600;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                ">
                  LRS Data
                </div>
              </div>
            </div>
          </div>
        `;
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'road-info-backdrop';
        backdrop.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 9999;
        `;
        
        const closePopup = (event) => {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          
          // Find and remove all popups and backdrops
          const allBackdrops = document.querySelectorAll('.road-info-backdrop');
          const allPopups = document.querySelectorAll('.road-info-popup');
          
          allBackdrops.forEach(b => b.remove());
          allPopups.forEach(p => p.remove());
        };
        
        backdrop.addEventListener('click', closePopup);
        
        document.body.appendChild(backdrop);
        document.body.appendChild(popupDiv);
        
        // Add click handler to close button immediately
        const closeBtn = popupDiv.querySelector('#closePopupBtn');
        if (closeBtn) {
          closeBtn.addEventListener('click', closePopup);
        }
      });
    });

  };

  const setupMapTracking = () => {
    const coordDisplay = document.createElement('div');
    coordDisplay.id = 'mouse-coordinates';
    coordDisplay.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(50, 50, 50, 0.92);
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      font-weight: 400;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(12px);
      border: none;
      z-index: 1000;
      min-width: 140px;
      text-align: left;
      display: none;
      line-height: 1.3;
    `;
    document.body.appendChild(coordDisplay);

    map.current.on('mousemove', (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      const zoom = map.current.getZoom();
      
      const approximateAltitude = Math.round(1000 / Math.pow(2, zoom - 10));
      
      coordDisplay.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="color: #a0a0a0; font-weight: 400;">Lat:</span>
          <span style="color: white; font-weight: 500; font-variant-numeric: tabular-nums;">${lat.toFixed(6)}°</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #a0a0a0; font-weight: 400;">Lng:</span>
          <span style="color: white; font-weight: 500; font-variant-numeric: tabular-nums;">${lng.toFixed(6)}°</span>
        </div>
      `;
      coordDisplay.style.display = 'block';
    });

    map.current.on('mouseleave', () => {
      coordDisplay.style.display = 'none';
    });

    map.current.on('mouseenter', () => {
      coordDisplay.style.display = 'block';
    });

  };


  const setupMeasurementTool = () => {
    const measurementContainer = document.createElement('div');
    measurementContainer.id = 'measurement-tools';
    measurementContainer.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 1000;
    `;

    const distanceBtn = document.createElement('button');
    distanceBtn.innerHTML = '📏';
    distanceBtn.title = 'Distance Measurement';
    distanceBtn.style.cssText = `
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, rgba(52, 152, 219, 0.9) 0%, rgba(41, 128, 185, 0.9) 100%);
      border: 2px solid rgba(52, 152, 219, 0.3);
      border-radius: 12px;
      color: white;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(15px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
    `;
    distanceBtn.onmouseover = () => {
      distanceBtn.style.background = 'linear-gradient(135deg, rgba(52, 152, 219, 1) 0%, rgba(41, 128, 185, 1) 100%)';
      distanceBtn.style.transform = 'scale(1.08) translateY(-2px)';
      distanceBtn.style.boxShadow = '0 8px 20px rgba(52, 152, 219, 0.4)';
    };
    distanceBtn.onmouseout = () => {
      distanceBtn.style.background = 'linear-gradient(135deg, rgba(52, 152, 219, 0.9) 0%, rgba(41, 128, 185, 0.9) 100%)';
      distanceBtn.style.transform = 'scale(1) translateY(0)';
      distanceBtn.style.boxShadow = '0 4px 12px rgba(52, 152, 219, 0.3)';
    };


    measurementContainer.appendChild(distanceBtn);

    document.body.appendChild(measurementContainer);

    let isMeasuring = false;
    let measurementPoints = [];
    let measurementLine = null;
    let currentPopup = null;
    distanceBtn.onclick = () => {
      if (isMeasuring) {
        isMeasuring = false;
        measurementPoints = [];
        if (measurementLine) {
          map.current.removeLayer('measurement-line');
          map.current.removeSource('measurement-line');
          measurementLine = null;
        }
        if (currentPopup) {
          currentPopup.remove();
          currentPopup = null;
        }
        distanceBtn.style.background = 'linear-gradient(135deg, rgba(52, 152, 219, 0.9) 0%, rgba(41, 128, 185, 0.9) 100%)';
        map.current.getCanvas().style.cursor = '';
        map.current.off('click', handleMeasurementClick);
      } else {
        isMeasuring = true;
        if (currentPopup) {
          currentPopup.remove();
          currentPopup = null;
        }
        distanceBtn.style.background = 'linear-gradient(135deg, rgba(52, 152, 219, 1) 0%, rgba(41, 128, 185, 1) 100%)';
        map.current.getCanvas().style.cursor = 'crosshair';
        map.current.on('click', handleMeasurementClick);
      }
    };


    const handleMeasurementClick = (e) => {
      measurementPoints.push([e.lngLat.lng, e.lngLat.lat]);
      
      if (measurementPoints.length === 1) {
        console.log('📍 First measurement point:', measurementPoints[0]);
      } else if (measurementPoints.length === 2) {
        createMeasurementLine();
        calculateDistance();
        measurementPoints = [];
        console.log('📏 Measurement complete. Click to measure again or click the ruler button to stop.');
      }
    };

    const createMeasurementLine = () => {
      if (map.current.getSource('measurement-line')) {
        map.current.removeLayer('measurement-line');
        map.current.removeSource('measurement-line');
      }

      map.current.addSource('measurement-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: measurementPoints
          }
        }
      });

      map.current.addLayer({
        id: 'measurement-line',
        type: 'line',
        source: 'measurement-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff6b6b',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      });
    };

    const calculateDistance = () => {
      const [lng1, lat1] = measurementPoints[0];
      const [lng2, lat2] = measurementPoints[1];
      
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      console.log(`📏 Distance: ${distance.toFixed(2)} meters (${(distance/1000).toFixed(3)} km)`);
      
      showDistanceTooltip(distance, measurementPoints);
    };

    const showDistanceTooltip = (distance, points) => {
      closeCurrentTooltip();
      
      const tooltip = document.createElement('div');
      tooltip.id = 'measurement-tooltip';
      tooltip.style.cssText = `
        position: absolute;
        background: rgba(40, 40, 40, 0.95);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-family: 'Open Sans', sans-serif;
        pointer-events: none;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(120, 120, 120, 0.3);
        max-width: 200px;
        line-height: 1.3;
      `;
      
      tooltip.innerHTML = `
        <div style="
          font-weight: 600; 
          color: #3498db; 
          margin-bottom: 4px; 
          font-size: 11px; 
          border-bottom: 1px solid #3498db; 
          padding-bottom: 2px;
        ">
          📏 Distance
        </div>
        <div style="margin-bottom: 2px;">
          <span style="color: #bdc3c7; font-size: 10px;">Meters:</span>
          <div style="color: white; font-family: monospace; font-size: 11px; font-weight: 500;">
            ${distance.toFixed(2)} m
          </div>
        </div>
        <div style="margin-bottom: 2px;">
          <span style="color: #bdc3c7; font-size: 10px;">Kilometers:</span>
          <div style="color: white; font-family: monospace; font-size: 11px; font-weight: 500;">
            ${(distance/1000).toFixed(3)} km
          </div>
        </div>
        <div style="
          color: #95a5a6; 
          font-size: 9px; 
          margin-top: 4px; 
          padding-top: 2px; 
          border-top: 1px solid #7f8c8d; 
          font-style: italic;
        ">
          Click map to measure again
        </div>
      `;
      
      document.body.appendChild(tooltip);
      
      const point = map.current.project(points[0]);
      tooltip.style.left = point.x + 'px';
      tooltip.style.top = (point.y - tooltip.offsetHeight - 10) + 'px';
      
      currentTooltip.current = tooltip;
      setTimeout(() => {
        if (currentTooltip.current === tooltip) {
          closeCurrentTooltip();
        }
      }, 8000);
    };

  };

  const setupLegendInteractions = () => {
    window.toggleLegend = () => {
      const content = document.getElementById('legend-content');
      const arrow = document.getElementById('legend-toggle-arrow');
      
      if (content && arrow) {
        if (content.style.display === 'none') {
          content.style.display = 'block';
          arrow.textContent = '▼';
        } else {
          content.style.display = 'none';
          arrow.textContent = '▶';
        }
      }
    };

    window.toggleSection = (contentId, arrowId) => {
      const content = document.getElementById(contentId);
      const arrow = document.getElementById(arrowId);
      
      if (content && arrow) {
        if (content.style.display === 'none') {
          content.style.display = 'block';
          arrow.textContent = '▼';
        } else {
          content.style.display = 'none';
          arrow.textContent = '▶';
        }
      }
    };

    window.toggleHillshade = (enabled) => {
      if (map.current && map.current.getLayer('hillshade')) {
        map.current.setLayoutProperty('hillshade', 'visibility', enabled ? 'visible' : 'none');
        console.log(`🗺️ Hillshade layer ${enabled ? 'enabled' : 'disabled'}`);
      }
    };

    window.toggleRoadLayer = (type, enabled) => {
      if (map.current) {
        const layerIds = type === 'open' 
          ? ['segments', 'segments-shadow', 'segments-shadow-2', 'segments-shadow-3', 'segments-edge-lines', 'segments-edge-lines-2', 'segments-center-line', 'road-labels']
          : ['segments-highlight', 'segments-top-highlight', 'segments-ultra-highlight'];
        
        layerIds.forEach(layerId => {
          if (map.current.getLayer(layerId)) {
            map.current.setLayoutProperty(layerId, 'visibility', enabled ? 'visible' : 'none');
          }
        });
        console.log(`🛣️ ${type} roads ${enabled ? 'enabled' : 'disabled'}`);
      }
    };

    window.toggleLocationType = (type, enabled) => {
      if (map.current && map.current.getLayer('locations')) {
        setVisibleLocationTypes(prevTypes => {
          const newTypes = new Set(prevTypes);
          if (enabled) {
            newTypes.add(type);
          } else {
            newTypes.delete(type);
          }
          
          // Update the layer filter based on visible types
          const typesArray = Array.from(newTypes);
          if (typesArray.length === 0) {
            // Hide all locations
            map.current.setLayoutProperty('locations', 'visibility', 'none');
          } else {
            // Show layer and filter by visible types
            map.current.setLayoutProperty('locations', 'visibility', 'visible');
            map.current.setFilter('locations', ['in', ['get', 'type'], ['literal', typesArray]]);
          }
          
          console.log(`📍 ${type} locations ${enabled ? 'enabled' : 'disabled'}`);
          return newTypes;
        });
      }
    };

    window.toggleIntersections = (enabled) => {
      if (map.current && map.current.getLayer('road-connections')) {
        map.current.setLayoutProperty('road-connections', 'visibility', enabled ? 'visible' : 'none');
        console.log(`🔗 Intersections ${enabled ? 'enabled' : 'disabled'}`);
      }
    };

        window.toggleTrolleyLines = async (enabled) => {
          if (!map.current) {
            console.log('❌ Map not ready yet');
            return;
          }

            const trolleyLayers = ['trolley-lines-shadow', 'trolley-lines-base', 'trolley-lines', 'trolley-lines-hover'];
            const trolleySources = ['trolley-lines'];

          if (enabled) {
            // If enabling, remove any existing layers first, then add fresh ones
            console.log('🚋 Enabling trolley lines - cleaning up and fetching data...');
            
            // Remove existing layers and sources
            trolleyLayers.forEach(layerId => {
              if (map.current.getLayer(layerId)) {
                map.current.removeLayer(layerId);
              }
            });
            trolleySources.forEach(sourceId => {
              if (map.current.getSource(sourceId)) {
                map.current.removeSource(sourceId);
              }
            });

            // Add fresh trolley lines
            await addTrolleyLinesForRoad5861372();
            setTrolleyLinesInitialized(true);
          } else {
            // If disabling, remove layers and sources completely
            console.log('🚋 Disabling trolley lines - removing layers and sources...');
            
            trolleyLayers.forEach(layerId => {
              if (map.current.getLayer(layerId)) {
                map.current.removeLayer(layerId);
              }
            });
            trolleySources.forEach(sourceId => {
              if (map.current.getSource(sourceId)) {
                map.current.removeSource(sourceId);
              }
            });
            
            console.log('🚋 Trolley lines completely removed');
          }
        };

    const style = document.createElement('style');
    style.textContent = `
      #legend-content::-webkit-scrollbar {
        width: 6px;
      }
      #legend-content::-webkit-scrollbar-track {
        background: rgba(40, 40, 40, 0.3);
        border-radius: 3px;
      }
      #legend-content::-webkit-scrollbar-thumb {
        background: rgba(120, 120, 120, 0.6);
        border-radius: 3px;
      }
      #legend-content::-webkit-scrollbar-thumb:hover {
        background: rgba(140, 140, 140, 0.8);
      }
      
      .mapboxgl-popup.transparent-popup .mapboxgl-popup-content {
        background: rgba(40, 40, 40, 0.85) !important;
        border: 1px solid rgba(120, 120, 120, 0.4) !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
        backdrop-filter: blur(15px) !important;
        padding: 0 !important;
      }
      
      .mapboxgl-popup.transparent-popup .mapboxgl-popup-tip {
        border-top-color: rgba(40, 40, 40, 0.85) !important;
      }
      
      .mapboxgl-popup.transparent-popup .mapboxgl-popup-close-button {
        color: #bdc3c7 !important;
        font-size: 18px !important;
        padding: 8px !important;
      }
      
      .mapboxgl-popup.transparent-popup .mapboxgl-popup-close-button:hover {
        color: white !important;
        background: rgba(120, 120, 120, 0.3) !important;
        border-radius: 4px !important;
      }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
      const legend = document.getElementById('floating-legend');
      const header = document.getElementById('legend-header');
      
      if (legend && header) {
        let isDragging = false;
        let currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;

        const dragStart = (e) => {
          if (e.target.id === 'legend-toggle-arrow') return;
          
          initialX = e.clientX - xOffset;
          initialY = e.clientY - yOffset;
          
          if (e.target === header || header.contains(e.target)) {
            isDragging = true;
            legend.style.cursor = 'grabbing';
          }
        };

        const drag = (e) => {
          if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            xOffset = currentX;
            yOffset = currentY;
            
            legend.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
          }
        };

        const dragEnd = () => {
          initialX = currentX;
          initialY = currentY;
          isDragging = false;
          legend.style.cursor = 'move';
        };

        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
      }
    }, 100);
  };

  const addWateringStationsToMap = (stations) => {
    console.log('🔍 addWateringStationsToMap called:', {
      mapExists: !!map.current,
      styleLoaded: map.current?.isStyleLoaded(),
      stationsCount: stations.length
    });
    
    if (!map.current || stations.length === 0) {
      console.log('Skipping watering stations - map not ready or no data');
      return;
    }
    
    if (!map.current.isStyleLoaded()) {
      console.log('Map style not loaded, retrying in 500ms...');
      setTimeout(() => addWateringStationsToMap(stations), 500);
      return;
    }

    // Remove existing watering station layers
    if (map.current.getSource('watering-stations')) {
      ['watering-stations', 'watering-stations-labels'].forEach(layerId => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      map.current.removeSource('watering-stations');
    }

    // Create GeoJSON for watering stations
    const stationsGeoJSON = {
      type: 'FeatureCollection',
      features: stations.map(station => ({
        type: 'Feature',
        properties: {
          id: station.station_id,
          name: station.station_name,
          code: station.station_code,
          type: station.station_type,
          capacity: station.capacity_liters,
          level: station.current_level_percent,
          status: station.status
        },
        geometry: {
          type: 'Point',
          coordinates: [station.longitude, station.latitude]
        }
      }))
    };

    // Add watering stations source
    map.current.addSource('watering-stations', {
      type: 'geojson',
      data: stationsGeoJSON
    });

    // Add watering stations layer
    map.current.addLayer({
      id: 'watering-stations',
      type: 'circle',
      source: 'watering-stations',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 8,
          15, 12,
          20, 20
        ],
        'circle-color': [
          'match',
          ['get', 'type'],
          'water', '#3498db',
          'fuel', '#e74c3c',
          'combined', '#9b59b6',
          '#95a5a6'
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-opacity': 1
      }
    });

    // Add labels
    map.current.addLayer({
      id: 'watering-stations-labels',
      type: 'symbol',
      source: 'watering-stations',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 10,
          15, 14,
          20, 18
        ],
        'text-anchor': 'top',
        'text-offset': [0, 1.5],
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#FFFFFF',
        'text-halo-color': 'rgba(0, 0, 0, 0.8)',
        'text-halo-width': 2
      }
    });

    // Add tooltips
    map.current.on('mouseenter', 'watering-stations', (e) => {
      closeCurrentTooltip();
      map.current.getCanvas().style.cursor = 'pointer';
      
      const feature = e.features[0];
      const properties = feature.properties;
      
      const tooltipContent = `
        <div style="font-weight: 600; color: #3498db; margin-bottom: 8px; font-size: 14px; border-bottom: 2px solid #3498db; padding-bottom: 4px;">
          💧 ${properties.name}
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Code:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.code}</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Type:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.type}</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Capacity:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.capacity?.toFixed(0) || 'N/A'}L</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Level:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.level?.toFixed(1) || 'N/A'}%</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Status:</span>
          <span style="color: ${properties.status === 'active' ? '#2ECC71' : '#E74C3C'}; margin-left: 8px; font-weight: 500;">${properties.status}</span>
        </div>
      `;
      
      const tooltip = document.getElementById('map-tooltip');
      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = 'block';
      currentTooltip.current = tooltip;
    });

    map.current.on('mousemove', 'watering-stations', (e) => {
      const tooltip = document.getElementById('map-tooltip');
      tooltip.style.left = e.point.x + 10 + 'px';
      tooltip.style.top = e.point.y - 10 + 'px';
    });

    map.current.on('mouseleave', 'watering-stations', () => {
      map.current.getCanvas().style.cursor = '';
      const tooltip = document.getElementById('map-tooltip');
      tooltip.style.display = 'none';
    });
  };

  const addSpeedMonitoringToMap = (monitoring) => {
    console.log('🔍 addSpeedMonitoringToMap called:', {
      mapExists: !!map.current,
      styleLoaded: map.current?.isStyleLoaded(),
      monitoringCount: monitoring.length
    });
    
    if (!map.current || monitoring.length === 0) {
      console.log('Skipping speed monitoring - map not ready or no data');
      return;
    }
    
    if (!map.current.isStyleLoaded()) {
      console.log('Map style not loaded, retrying in 500ms...');
      setTimeout(() => addSpeedMonitoringToMap(monitoring), 500);
      return;
    }

    // Remove existing speed monitoring layers
    if (map.current.getSource('speed-monitoring')) {
      ['speed-monitoring', 'speed-monitoring-labels'].forEach(layerId => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      map.current.removeSource('speed-monitoring');
    }

    // Create GeoJSON for speed monitoring points
    const monitoringGeoJSON = {
      type: 'FeatureCollection',
      features: monitoring.map(record => ({
        type: 'Feature',
        properties: {
          id: record.monitoring_id,
          lane_id: record.lane_id,
          speed: record.speed_kmh,
          violation: record.violation_type,
          mode: record.operational_mode,
          measure: record.measure
        },
        geometry: {
          type: 'Point',
          coordinates: [record.longitude, record.latitude]
        }
      }))
    };

    // Add speed monitoring source
    map.current.addSource('speed-monitoring', {
      type: 'geojson',
      data: monitoringGeoJSON
    });

    // Add speed monitoring layer
    map.current.addLayer({
      id: 'speed-monitoring',
      type: 'circle',
      source: 'speed-monitoring',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 6,
          15, 8,
          20, 12
        ],
        'circle-color': [
          'match',
          ['get', 'violation'],
          'critical', '#e74c3c',
          'warning', '#f39c12',
          'none', '#2ecc71',
          '#95a5a6'
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-opacity': 1
      }
    });

    // Add labels
    map.current.addLayer({
      id: 'speed-monitoring-labels',
      type: 'symbol',
      source: 'speed-monitoring',
      layout: {
        'text-field': ['concat', ['get', 'speed'], ' km/h'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 8,
          15, 10,
          20, 12
        ],
        'text-anchor': 'top',
        'text-offset': [0, 1.5],
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#FFFFFF',
        'text-halo-color': 'rgba(0, 0, 0, 0.8)',
        'text-halo-width': 1
      }
    });

    // Add tooltips
    map.current.on('mouseenter', 'speed-monitoring', (e) => {
      closeCurrentTooltip();
      map.current.getCanvas().style.cursor = 'pointer';
      
      const feature = e.features[0];
      const properties = feature.properties;
      
      const tooltipContent = `
        <div style="font-weight: 600; color: #f39c12; margin-bottom: 8px; font-size: 14px; border-bottom: 2px solid #f39c12; padding-bottom: 4px;">
           Speed Monitoring
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Speed:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.speed?.toFixed(1) || 'N/A'} km/h</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Lane:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.lane_id}</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Violation:</span>
          <span style="color: ${properties.violation === 'none' ? '#2ECC71' : '#E74C3C'}; margin-left: 8px; font-weight: 500;">${properties.violation}</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #bdc3c7;">Mode:</span>
          <span style="color: white; margin-left: 8px; font-weight: 500;">${properties.mode}</span>
        </div>
      `;
      
      const tooltip = document.getElementById('map-tooltip');
      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = 'block';
      currentTooltip.current = tooltip;
    });

    map.current.on('mousemove', 'speed-monitoring', (e) => {
      const tooltip = document.getElementById('map-tooltip');
      tooltip.style.left = e.point.x + 10 + 'px';
      tooltip.style.top = e.point.y - 10 + 'px';
    });

    map.current.on('mouseleave', 'speed-monitoring', () => {
      map.current.getCanvas().style.cursor = '';
      const tooltip = document.getElementById('map-tooltip');
      tooltip.style.display = 'none';
    });
  };


  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {mapError === 'webgl' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(30, 30, 30, 0.95)',
          color: 'white',
          fontSize: '18px',
          fontWeight: '600',
          zIndex: 1000,
          textAlign: 'center',
          padding: '20px'
        }}>
          <div style={{ marginBottom: '20px', fontSize: '24px' }}>⚠️ WebGL Not Supported</div>
          <div style={{ marginBottom: '20px', fontSize: '16px', color: '#bdc3c7' }}>
            Your browser or graphics driver doesn't support WebGL, which is required for the Mapbox map.
          </div>
          <div style={{ fontSize: '14px', color: '#95a5a6', marginBottom: '20px' }}>
            Please try:
          </div>
          <div style={{ fontSize: '14px', color: '#bdc3c7', textAlign: 'left' }}>
            • Updating your graphics drivers<br/>
            • Using a different browser (Chrome, Firefox, Edge)<br/>
            • Enabling hardware acceleration in your browser<br/>
            • Checking if WebGL is disabled in your browser settings
          </div>
        </div>
      )}
      {!mapLoaded && !mapError && (
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
              Loading Mapbox Map...
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
        backgroundColor: 'rgba(40, 40, 40, 0.75)',
        border: '1px solid rgba(120, 120, 120, 0.6)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(15px)',
        overflow: 'hidden'
      }}>
        <select
          value={currentStyle}
          onChange={(e) => {
            const selectedStyle = mapStyles.find(style => style.name === e.target.value);
            if (selectedStyle) {
              changeMapStyle(selectedStyle.value);
            }
          }}
          style={{
            backgroundColor: 'transparent',
            color: '#e0e0e0',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            outline: 'none',
            minWidth: '160px',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e0e0e0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '14px',
            paddingRight: '40px'
          }}
        >
          {mapStyles.map(style => (
            <option 
              key={style.name} 
              value={style.name} 
              style={{ 
                backgroundColor: 'rgba(40, 40, 40, 0.9)', 
                color: '#e0e0e0',
                padding: '8px 12px',
                fontSize: '13px'
              }}
            >
              {style.name}
            </option>
          ))}
        </select>
      </div>


      <div 
        id="floating-legend"
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          backgroundColor: 'rgba(40, 40, 40, 0.75)',
          border: '1px solid rgba(120, 120, 120, 0.6)',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(15px)',
          zIndex: 1000,
          minWidth: '280px',
          maxHeight: '400px',
          overflow: 'hidden',
          cursor: 'move'
        }}
      >
        <div 
          id="legend-header"
          style={{
            backgroundColor: 'rgba(30, 30, 30, 0.8)',
            padding: '12px 16px',
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'move'
          }}
          onClick={() => toggleLegend()}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: '20px',
              height: '20px',
              backgroundColor: '#3498db',
              borderRadius: '4px',
              marginRight: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>⛏</span>
            </div>
            <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>Frontrunner - Mine Map</span>
          </div>
          <div 
            id="legend-toggle-arrow"
            style={{ color: 'white', fontSize: '16px', cursor: 'pointer' }}
          >
            ▼
          </div>
        </div>

        <div 
          id="legend-content"
          style={{
            padding: '0',
            color: 'white',
            fontSize: '12px',
            maxHeight: '320px',
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(120, 120, 120, 0.6) rgba(40, 40, 40, 0.3)'
          }}
        >
          <div style={{ borderLeft: '3px solid #3498db', margin: '8px 0' }}>
            <div 
              id="road-layers-header"
              style={{
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
              onClick={() => toggleSection('road-layers-content', 'road-layers-arrow')}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: '#3498db',
                  borderRadius: '3px',
                  marginRight: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ color: 'white', fontSize: '10px' }}>🗺️</span>
                </div>
                <span style={{ color: '#3498db', fontWeight: '600', fontSize: '13px' }}>Core Layers</span>
                <div style={{
                  backgroundColor: '#3498db',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  marginLeft: '8px',
                  fontSize: '10px'
                }}>
                  3
                </div>
              </div>
              <div 
                id="road-layers-arrow"
                style={{ color: '#3498db', fontSize: '14px' }}
              >
                ▼
              </div>
            </div>
            <div 
              id="road-layers-content"
              style={{ padding: '8px 12px 8px 32px' }}
            >
              <div style={{ marginBottom: '6px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  color: '#bdc3c7',
                  fontSize: '12px'
                }}>
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    onChange={(e) => toggleRoadLayer('open', e.target.checked)}
                    style={{ 
                      marginRight: '8px',
                      accentColor: '#27ae60'
                    }}
                  />
                  <div style={{
                    width: '12px',
                    height: '3px',
                    backgroundColor: '#27ae60',
                    marginRight: '10px',
                    borderRadius: '2px'
                  }}></div>
                  <span style={{ color: 'white', fontWeight: '500' }}>Open Roads ({roadCounts.open})</span>
                </label>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  color: '#bdc3c7',
                  fontSize: '12px'
                }}>
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    onChange={(e) => toggleRoadLayer('closed', e.target.checked)}
                    style={{ 
                      marginRight: '8px',
                      accentColor: '#e74c3c'
                    }}
                  />
                  <div style={{
                    width: '12px',
                    height: '3px',
                    backgroundColor: '#e74c3c',
                    marginRight: '10px',
                    borderRadius: '2px'
                  }}></div>
                  <span style={{ color: 'white', fontWeight: '500' }}>Closed Roads ({roadCounts.closed})</span>
                </label>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  color: '#bdc3c7',
                  fontSize: '12px'
                }}>
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    onChange={(e) => toggleIntersections(e.target.checked)}
                    style={{ 
                      marginRight: '8px',
                      accentColor: '#FF8C00'
                    }}
                  />
                  <div style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: '#FF8C00',
                    marginRight: '10px',
                    borderRadius: '50%'
                  }}></div>
                  <span style={{ color: 'white', fontWeight: '500' }}>Intersections</span>
                </label>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  color: '#bdc3c7',
                  fontSize: '12px'
                }}>
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    onChange={(e) => toggleTrolleyLines(e.target.checked)}
                    style={{ 
                      marginRight: '8px',
                      accentColor: '#FF6B6B'
                    }}
                  />
                  <div style={{
                    width: '12px',
                    height: '3px',
                    backgroundColor: '#FF6B6B',
                    marginRight: '10px',
                    borderRadius: '2px'
                  }}></div>
                  <span style={{ color: 'white', fontWeight: '500' }}>Trolley Lines</span>
                </label>
              </div>
            </div>
          </div>

          <div style={{ borderLeft: '3px solid #e74c3c', margin: '8px 0' }}>
            <div 
              id="location-types-header"
              style={{
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
              onClick={() => toggleSection('location-types-content', 'location-types-arrow')}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: '#e74c3c',
                  borderRadius: '3px',
                  marginRight: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ color: 'white', fontSize: '10px' }}>📍</span>
                </div>
                <span style={{ color: '#e74c3c', fontWeight: '600', fontSize: '13px' }}>Location Types</span>
                <div style={{
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  marginLeft: '8px',
                  fontSize: '10px'
                }}>
                  {Object.keys(locationCounts).length}
                </div>
              </div>
              <div 
                id="location-types-arrow"
                style={{ color: '#e74c3c', fontSize: '14px' }}
              >
                ▼
              </div>
            </div>
            <div 
              id="location-types-content"
              style={{ padding: '8px 12px 8px 32px' }}
            >
              {Object.entries(locationCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} style={{ marginBottom: '6px' }}>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      color: '#bdc3c7',
                      fontSize: '12px'
                    }}>
                      <input
                        type="checkbox"
                        checked={visibleLocationTypes.has(type)}
                        onChange={(e) => toggleLocationType(type, e.target.checked)}
                        style={{ 
                          marginRight: '8px',
                          accentColor: getLocationColor(type)
                        }}
                      />
                      <div style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: getLocationColor(type),
                        marginRight: '10px',
                        borderRadius: '50%'
                      }}></div>
                      <span style={{ color: 'white', fontWeight: '500' }}>{type} ({count})</span>
                    </label>
                  </div>
                ))}
            </div>
          </div>


                </div>
      </div>

      {/* Trajectory Configuration Dialog */}
      {showTrajectoryConfig && selectedSegment && (
                <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10002,
          backgroundColor: 'rgba(30, 30, 30, 0.95)',
          border: '2px solid rgba(120, 120, 120, 0.6)',
          borderRadius: '8px',
          padding: '20px',
                  color: 'white',
          fontSize: '14px',
          minWidth: '350px',
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#FF00FF' }}>🎯 Intersection Curve Configuration</h3>
            <button 
              onClick={() => setShowTrajectoryConfig(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#bdc3c7',
                fontSize: '18px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
              </div>
          
          <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: 'rgba(52, 152, 219, 0.1)', borderRadius: '4px' }}>
            <div style={{ color: '#bdc3c7', fontSize: '12px' }}>Selected Segment:</div>
            <div style={{ color: 'white', fontWeight: 'bold' }}>{selectedSegment.id}</div>
            <div style={{ color: '#bdc3c7', fontSize: '12px' }}>Road ID: {selectedSegment.road_id}</div>
            <div style={{ color: '#FF00FF', fontSize: '12px', marginTop: '4px' }}>Will create 8 different curves with computed safety and R-min values</div>
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#bdc3c7' }}>
              Value 1 - Curve Radius (meters):
            </label>
            <input
              type="number"
              value={trajectoryConfig.value1}
              onChange={(e) => setTrajectoryConfig(prev => ({ ...prev, value1: parseFloat(e.target.value) || 0 }))}
                style={{
                width: '100%',
                padding: '6px',
                borderRadius: '4px',
                border: '1px solid #555',
                backgroundColor: '#2c2c2c',
                color: 'white'
              }}
              step="1"
              min="0"
              max="1000"
              placeholder="Enter curve radius"
            />
            </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#bdc3c7' }}>
              Value 2 - Curve Smoothness (2-100):
            </label>
            <input
              type="number"
              value={trajectoryConfig.value2}
              onChange={(e) => setTrajectoryConfig(prev => ({ ...prev, value2: parseFloat(e.target.value) || 20 }))}
              style={{ 
                width: '100%',
                padding: '6px',
                borderRadius: '4px',
                border: '1px solid #555',
                backgroundColor: '#2c2c2c',
                color: 'white'
              }}
              step="1"
              min="2"
              max="100"
              placeholder="Enter smoothness points"
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
                <button
              onClick={() => {
                // Draw all 8 intersection curves with computed safety and R-min values
                drawIntersectionCurves();
                setShowTrajectoryConfig(false);
              }}
                  style={{
                flex: 1,
                background: '#FF00FF',
                    color: 'white',
                    border: 'none',
                padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                fontWeight: 'bold'
                  }}
                >
              🎯 Draw All 8 Curves
                </button>
                <button
              onClick={() => setShowTrajectoryConfig(false)}
                  style={{
                flex: 1,
                background: '#95a5a6',
                    color: 'white',
                    border: 'none',
                padding: '8px',
                    borderRadius: '4px',
                cursor: 'pointer'
                  }}
                >
              Cancel
                </button>
              </div>
        </div>
      )}

      {/* Road Information Dialog */}
      {showRoadDialog && selectedSegment && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10002,
          backgroundColor: 'rgba(30, 30, 30, 0.95)',
          border: '2px solid rgba(120, 120, 120, 0.6)',
          borderRadius: '8px',
          padding: '20px',
          color: 'white',
          fontSize: '14px',
          minWidth: '350px',
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#4ECDC4' }}>🛣️ Road Information</h3>
            <button 
              onClick={() => {
                setShowRoadDialog(false);
                setSelectedSegment(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#bdc3c7',
                fontSize: '18px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
          
          <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: 'rgba(52, 152, 219, 0.1)', borderRadius: '4px' }}>
            <div style={{ color: '#bdc3c7', fontSize: '12px' }}>Road ID:</div>
            <div style={{ color: 'white', fontWeight: 'bold' }}>{selectedSegment.road_id}</div>
            {selectedSegment.id && (
              <>
                <div style={{ color: '#bdc3c7', fontSize: '12px', marginTop: '4px' }}>Segment ID:</div>
                <div style={{ color: 'white' }}>{selectedSegment.id}</div>
              </>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                setShowRoadDialog(false);
                setShowProfileViewer(true);
              }}
              style={{
                flex: 1,
                background: '#4ECDC4',
                color: 'white',
                border: 'none',
                padding: '10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              📊 View Profile
            </button>
            <button
              onClick={() => {
                setShowRoadDialog(false);
                setSelectedSegment(null);
              }}
              style={{
                flex: 1,
                background: '#95a5a6',
                color: 'white',
                border: 'none',
                padding: '10px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Road Profile Viewer */}
      {showProfileViewer && selectedSegment && (
        <RoadProfileViewer
          roadId={selectedSegment.road_id}
          onClose={() => {
            setShowProfileViewer(false);
            setSelectedSegment(null);
          }}
        />
      )}
    </div>
  );
}
