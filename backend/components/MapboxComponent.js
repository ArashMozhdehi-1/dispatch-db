import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const HILLSHADE_CONFIG = {
  tileUrl: '/hillshades/tiles/{z}/{x}/{y}.png',
  opacity: 0.7,
  brightnessMin: 0.0,
  brightnessMax: 1.0,
  saturation: -0.5,
  contrast: 0.6,
  minZoom: 8,
  maxZoom: 20,
  tileSize: 512
};

export default function MapboxComponent() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locations, setLocations] = useState([]);
  const [segments, setSegments] = useState([]);
  
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

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    if (!mapboxgl || !mapboxgl.Map) {
      console.error('Mapbox GL JS not loaded');
      return;
    }

    mapboxgl.accessToken = 'pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw';
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [148.980202, -23.847083],
      zoom: 11,
      attributionControl: false
    });

    map.current.on('load', () => {
      console.log('✅ Mapbox map loaded successfully');
      
      setTimeout(() => {
        const mapboxLogo = document.querySelector('.mapboxgl-ctrl-logo');
        if (mapboxLogo) {
          mapboxLogo.style.display = 'none';
        }
      }, 100);
      
      map.current.addControl(new mapboxgl.NavigationControl());
      
      addHillshadeLayer();
      
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
      console.error('❌ Map error:', error);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);


  const loadData = async () => {
    try {
      const locationsResponse = await fetch('/api/locations');
      const locationsData = await locationsResponse.json();
      setLocations(locationsData);
      console.log('✅ Loaded locations:', locationsData.length);

      const segmentsResponse = await fetch('/api/segments');
      const segmentsData = await segmentsResponse.json();
      setSegments(segmentsData);
      console.log('✅ Loaded segments:', segmentsData.length);
      console.log('✅ Segments data sample:', segmentsData.slice(0, 3));
      
      const segmentsWithGeometry = segmentsData.filter(seg => seg.geometry);
      console.log('✅ Segments with geometry:', segmentsWithGeometry.length);
      
      if (segmentsWithGeometry.length > 0) {
        console.log('✅ First segment geometry:', segmentsWithGeometry[0].geometry);
        console.log('✅ First segment data:', {
          lane_id: segmentsWithGeometry[0].lane_id,
          is_closed: segmentsWithGeometry[0].is_closed,
          road_id: segmentsWithGeometry[0].road_id
        });
      }
      const openCount = segmentsData.filter(s => !s.is_closed).length;
      const closedCount = segmentsData.filter(s => s.is_closed).length;
      console.log('🔍 Road counts from API:', { total: segmentsData.length, open: openCount, closed: closedCount });

      addDataToMap(locationsData, segmentsData);
    } catch (error) {
      console.error('❌ Error loading data:', error);
    }
  };

  const addHillshadeLayer = () => {
    if (!map.current || !map.current.isStyleLoaded()) {
      setTimeout(() => addHillshadeLayer(), 100);
      return;
    }

    try {
      if (map.current.getSource('hillshade') && map.current.getLayer('hillshade')) {
        console.log('✅ Hillshade already exists, skipping...');
        return;
      }

      if (map.current.getLayer('hillshade')) {
        map.current.removeLayer('hillshade');
      }
      if (map.current.getSource('hillshade')) {
        map.current.removeSource('hillshade');
      }
      map.current.addSource('hillshade', {
        type: 'raster',
        tiles: [HILLSHADE_CONFIG.tileUrl],
        tileSize: HILLSHADE_CONFIG.tileSize,
        minzoom: HILLSHADE_CONFIG.minZoom,
        maxzoom: HILLSHADE_CONFIG.maxZoom
      });

      map.current.addLayer({
        id: 'hillshade',
        type: 'raster',
        source: 'hillshade',
        paint: {
          'raster-opacity': HILLSHADE_CONFIG.opacity,
          'raster-hue-rotate': 0,
          'raster-brightness-min': HILLSHADE_CONFIG.brightnessMin,
          'raster-brightness-max': HILLSHADE_CONFIG.brightnessMax,
          'raster-saturation': HILLSHADE_CONFIG.saturation,
          'raster-contrast': HILLSHADE_CONFIG.contrast
        }
      });

      console.log('✅ Hillshade layer added successfully');
      console.log('🗺️ Hillshade settings:');
      console.log(`   - Tile URL: ${HILLSHADE_CONFIG.tileUrl}`);
      console.log(`   - Opacity: ${HILLSHADE_CONFIG.opacity}`);
      console.log(`   - Contrast: ${HILLSHADE_CONFIG.contrast}`);
      console.log('💡 Using generated hillshade tiles:');
      console.log('   backend/public/hillshades/tiles/{z}/{x}/{y}.png');
    } catch (error) {
      console.error('❌ Error adding hillshade layer:', error);
    }
  };

  const addDataToMap = (locationsData, segmentsData) => {
    if (!map.current || !map.current.isStyleLoaded()) {
      setTimeout(() => addDataToMap(locationsData, segmentsData), 100);
      return;
    }

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

      console.log('✅ Segments GeoJSON:', segmentsGeoJSON);
      console.log('✅ Valid segments features:', segmentsGeoJSON.features.length);

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

      map.current.addLayer({
        id: 'segments',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 8,
            15, 25,
            20, 50
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
            20, 10
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
            20, -25
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
            20, 10
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
            20, 25
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
            20, 6
          ],
          'line-color': [
            'case',
            ['get', 'is_closed'], '#FF6B6B',
            '#FFFFFF'
          ],
          'line-opacity': 0.95,
          'line-blur': 0,
          'line-dasharray': [8, 8]
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
            20, 40
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
            20, -6
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
            20, 30
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
            20, -12
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
            20, 20
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
            20, -18
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
          'text-size': 12,
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
          'text-halo-width': 2,
          'text-halo-blur': 1
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
      
      console.log('✅ Segments layer added successfully');
    } else {
      console.log('❌ No segments data to add');
    }

    if (locationsData.length > 0) {
      const locationsGeoJSON = {
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
      };

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
      
      console.log('✅ Locations layer added on top of roads');
    }

    findRoadConnections(segmentsData);
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

    const clickableLayers = ['segments', 'segments-shadow', 'segments-shadow-2', 'segments-shadow-3', 'segments-edge-lines', 'segments-edge-lines-2', 'segments-center-line', 'segments-highlight', 'segments-top-highlight', 'segments-ultra-highlight', 'segments-hover'];
    clickableLayers.forEach(layerId => {
      map.current.on('click', layerId, (e) => {
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
              <div style="font-weight: 700; color: ${properties.is_closed ? '#E74C3C' : '#2ECC71'}; margin-bottom: 12px; font-size: 16px; border-bottom: 2px solid ${properties.is_closed ? '#E74C3C' : '#2ECC71'}; padding-bottom: 6px;">
                ${properties.id || 'Unknown Lane'}
              </div>
              <div style="margin-bottom: 8px;">
                <span style="color: #bdc3c7; font-weight: 500;">Road ID:</span>
                <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.road_id || 'N/A'}</span>
              </div>
              <div style="margin-bottom: 8px;">
                <span style="color: #bdc3c7; font-weight: 500;">Direction:</span>
                <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.direction || 'Unknown'}</span>
              </div>
              <div style="margin-bottom: 8px;">
                <span style="color: #bdc3c7; font-weight: 500;">Length:</span>
                <span style="color: white; font-weight: 600; margin-left: 8px;">${properties.length_m ? properties.length_m.toFixed(1) + 'm' : 'N/A'}</span>
              </div>
              <div style="margin-bottom: 8px;">
                <span style="color: #bdc3c7; font-weight: 500;">Status:</span>
                <span style="color: ${properties.is_closed ? '#E74C3C' : '#2ECC71'}; font-weight: 600; margin-left: 8px;">${properties.is_closed ? 'Closed' : 'Open'}</span>
              </div>
              <div style="color: #95a5a6; font-size: 11px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #7f8c8d; font-style: italic;">
                Coordinates: ${coordinates.lng.toFixed(6)}, ${coordinates.lat.toFixed(6)}
              </div>
            </div>
          `)
          .addTo(map.current);
          
          setTimeout(() => {
            const popupElement = document.querySelector('.mapboxgl-popup-content');
            if (popupElement) {
              popupElement.style.border = 'none';
              popupElement.style.outline = 'none';
            }
          }, 10);
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
        map.current.setLayoutProperty('locations', 'visibility', enabled ? 'visible' : 'none');
        console.log(`📍 ${type} locations ${enabled ? 'enabled' : 'disabled'}`);
      }
    };

    window.toggleIntersections = (enabled) => {
      if (map.current && map.current.getLayer('road-connections')) {
        map.current.setLayoutProperty('road-connections', 'visibility', enabled ? 'visible' : 'none');
        console.log(`🔗 Intersections ${enabled ? 'enabled' : 'disabled'}`);
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
            <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>Mine Map</span>
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
                        defaultChecked={true}
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

          <div style={{ borderLeft: '3px solid #9b59b6', margin: '8px 0' }}>
            <div 
              id="raster-header"
              style={{
                backgroundColor: 'rgba(155, 89, 182, 0.1)',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
              onClick={() => toggleSection('raster-content', 'raster-arrow')}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: '#9b59b6',
                  borderRadius: '3px',
                  marginRight: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ color: 'white', fontSize: '10px' }}>🗺️</span>
                </div>
                <span style={{ color: '#9b59b6', fontWeight: '600', fontSize: '13px' }}>Raster Layers</span>
                <div style={{
                  backgroundColor: '#9b59b6',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  marginLeft: '8px',
                  fontSize: '10px'
                }}>
                  1
                </div>
              </div>
              <div 
                id="raster-arrow"
                style={{ color: '#9b59b6', fontSize: '14px' }}
              >
                ▼
              </div>
            </div>
            <div 
              id="raster-content"
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
                    onChange={(e) => toggleHillshade(e.target.checked)}
                    style={{ 
                      marginRight: '8px',
                      accentColor: '#9b59b6'
                    }}
                  />
                  <span style={{ color: 'white', fontWeight: '500' }}>Hillshade</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
