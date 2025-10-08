import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';

// GraphQL queries
const GET_LOCATIONS = gql`
  query GetLocations {
    locations {
      location_id
      location_name
      latitude
      longitude
      elevation_m
      unit_type
      location_category
      pit_name
      region_name
    }
  }
`;

const GET_SEGMENTS = gql`
  query GetSegments($limit: Int) {
    segments(limit: $limit) {
      lane_id
      road_id
      direction
      length_m
      time_empty_seconds
      time_loaded_seconds
      is_closed
      geometry
      start_latitude
      start_longitude
      end_latitude
      end_longitude
    }
  }
`;

export default function MapComponent() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapInitializedRef = useRef(false);
  
  const { data: locationsData, loading: locationsLoading, error: locationsError } = useQuery(GET_LOCATIONS, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  const { data: segmentsData, loading: segmentsLoading, error: segmentsError } = useQuery(GET_SEGMENTS, {
    variables: { limit: 100000 }, 
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  const loading = locationsLoading || segmentsLoading;
  const error = locationsError || segmentsError;

  const resetComponentState = () => {
    mapInitializedRef.current = false;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  };

  useEffect(() => {
    resetComponentState();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    mapInitializedRef.current = false;

    const loadMap = async () => {
      const L = (await import('leaflet')).default;
      
      let mapContainer = null;
      let retries = 0;
      const maxRetries = 10;
      
      while (!mapContainer && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 200));
        mapContainer = document.getElementById('map');
        if (!mapContainer) {
          console.log(`Map container not found, retrying... (${retries + 1}/${maxRetries})`);
          retries++;
        }
      }
      
      if (!mapContainer) {
        console.error('Map container not found after all retries');
        return;
      }
      
      console.log('✅ Map container found, initializing map...');

      if (mapInstanceRef.current) {
        console.log('Removing existing map...');
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      
      if (mapContainer && mapContainer._leaflet_id) {
        console.log('Clearing existing leaflet ID...');
        delete mapContainer._leaflet_id;
      }

      const map = L.map('map', {
        center: [-23.5, 148.5],
        crs: L.CRS.EPSG3857,
        zoom: 12,
        zoomControl: true,
        preferCanvas: false,
      });
      mapInstanceRef.current = map;
      mapInitializedRef.current = true;
      console.log('✅ Map initialized successfully');
      
      window.map = map;
      window.m_bezier = map;
      
      const tile_layer_86af411fcaa14b2e8914466b52009633 = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v11/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 18,
          maxNativeZoom: 18,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );
      tile_layer_86af411fcaa14b2e8914466b52009633.addTo(map);

      const tile_layer_651c217e91599c788c1d2f4ddcee22ef = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/outdoors-v11/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 18,
          maxNativeZoom: 18,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );

      const tile_layer_1aea0a94978ecf4d7f1ce0096a692741 = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 18,
          maxNativeZoom: 18,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );

      const tile_layer_bdb278bfd7bf45bd3f1b7e3f12a6fdd3 = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 22,
          maxNativeZoom: 22,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );

      const tile_layer_ef915ab92e0ddcb9e840955a9d4420f5 = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/standard/tiles/{z}/{x}/{y}@2x?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 22,
          maxNativeZoom: 22,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );

      const tile_layer_ec0e266dacdd9ae8792153e00204f440 = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 22,
          maxNativeZoom: 22,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );

      const tile_layer_980b7691b39ace86f5bc5a9b1a738389 = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 22,
          maxNativeZoom: 22,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );

      const tile_layer_4378b744272a22f78c14c9e80b830eb8 = L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY291cHN0ZXI3NCIsImEiOiJja2xwdjRwaWYwc2Q2Mm9sYmprbzhueng2In0.p-FbkbBhJWBKW-evWZfmgw",
        {
          minZoom: 0,
          maxZoom: 22,
          maxNativeZoom: 22,
          noWrap: false,
          attribution: "Mapbox",
          subdomains: "abc",
          detectRetina: false,
          tms: false,
          opacity: 1,
        }
      );

      const baseLayers = {
        "Satellite Streets": tile_layer_86af411fcaa14b2e8914466b52009633,
        "Topographic": tile_layer_651c217e91599c788c1d2f4ddcee22ef,
        "Streets": tile_layer_1aea0a94978ecf4d7f1ce0096a692741,
        "Satellite": tile_layer_bdb278bfd7bf45bd3f1b7e3f12a6fdd3,
        "Standard": tile_layer_ef915ab92e0ddcb9e840955a9d4420f5,
        "Dark": tile_layer_ec0e266dacdd9ae8792153e00204f440,
        "Topographic Dark": tile_layer_980b7691b39ace86f5bc5a9b1a738389,
        "Streets Dark": tile_layer_4378b744272a22f78c14c9e80b830eb8
      };

      const layerControl = L.control.layers(baseLayers, {}, {
        position: 'topleft',
        collapsed: true
      }).addTo(map);
      
      setTimeout(() => {
        const layerControlElement = document.querySelector('.leaflet-control-layers');
        if (layerControlElement) {
          let isDragging = false;
          let currentX;
          let currentY;
          let initialX;
          let initialY;
          let xOffset = 0;
          let yOffset = 0;
          
          layerControlElement.addEventListener('mousedown', dragStart);
          document.addEventListener('mousemove', drag);
          document.addEventListener('mouseup', dragEnd);
          
          function dragStart(e) {
            if (e.target.closest('.leaflet-control-layers-expanded')) return; // Don't drag when dropdown is open
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            
            if (e.target === layerControlElement || layerControlElement.contains(e.target)) {
              isDragging = true;
              layerControlElement.style.cursor = 'grabbing';
            }
          }
          
          function drag(e) {
            if (isDragging) {
              e.preventDefault();
              currentX = e.clientX - initialX;
              currentY = e.clientY - initialY;
              
              xOffset = currentX;
              yOffset = currentY;
              
              layerControlElement.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
          }
          
          function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            layerControlElement.style.cursor = 'move';
          }
        }
      }, 100);
      
      setTimeout(() => {
        const style = document.createElement('style');
        style.textContent = `
          .leaflet-control-zoom {
            background-color: rgba(60, 60, 60, 0.9) !important;
            border: 1px solid rgba(120, 120, 120, 0.5) !important;
            border-radius: 6px !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          }

          .leaflet-control-zoom a {
            background-color: rgba(60, 60, 60, 0.9) !important;
            color: white !important;
            border: none !important;
            font-weight: bold !important;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
          }

          .leaflet-control-zoom a:hover {
            background-color: rgba(80, 80, 80, 0.9) !important;
            color: #bdc3c7 !important;
          }

          .leaflet-control-layers {
            position: fixed !important;
            top: 20px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background-color: rgba(60, 60, 60, 0.9) !important;
            border: 1px solid rgba(120, 120, 120, 0.5) !important;
            border-radius: 6px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
            backdrop-filter: blur(10px) !important;
            z-index: 1000 !important;
            cursor: move !important;
            min-width: 120px !important;
            max-width: 200px !important;
          }

          .leaflet-control-layers-toggle {
            background-color: rgba(60, 60, 60, 0.9) !important;
            border: 1px solid rgba(120, 120, 120, 0.5) !important;
            border-radius: 6px !important;
            color: white !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
            font-size: 10px !important;
            padding: 6px 8px !important;
            min-width: 100px !important;
            text-align: center !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            cursor: move !important;
          }

          .leaflet-control-layers-toggle::before {
            content: "🗺️" !important;
            margin-right: 4px !important;
            font-size: 12px !important;
          }

          .leaflet-control-layers-toggle::after {
            content: "▼" !important;
            margin-left: 4px !important;
            font-size: 8px !important;
            transition: transform 0.3s ease !important;
          }

          .leaflet-control-layers-expanded {
            background-color: rgba(255, 255, 255, 0.95) !important;
            color: #333 !important;
            border: 1px solid rgba(200, 200, 200, 0.8) !important;
            border-radius: 6px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
            backdrop-filter: blur(10px) !important;
            margin-top: 4px !important;
            padding: 6px 0 !important;
            min-width: 120px !important;
            max-width: 200px !important;
          }

          .leaflet-control-layers label {
            color: #333 !important;
            padding: 4px 8px !important;
            margin: 0 !important;
            font-size: 11px !important;
            cursor: pointer !important;
            transition: background-color 0.2s ease !important;
          }

          .leaflet-control-layers label:hover {
            background-color: rgba(60, 60, 60, 0.1) !important;
          }

          .leaflet-control-layers input[type="radio"] {
            accent-color: #3498db !important;
            margin-right: 8px !important;
          }

          .leaflet-control-attribution {
            background-color: rgba(60, 60, 60, 0.8) !important;
            color: #bdc3c7 !important;
            border: 1px solid rgba(120, 120, 120, 0.3) !important;
            border-radius: 4px !important;
            font-size: 11px !important;
          }
        `;
        document.head.appendChild(style);
      }, 100);

      let isRightClicking = false;
      let startX, startY;
      
      map.getContainer().addEventListener('contextmenu', function(e) {
        e.preventDefault();
        isRightClicking = true;
        startX = e.clientX;
        startY = e.clientY;
        
        document.body.style.cursor = 'grabbing';
      });
      
      map.getContainer().addEventListener('mousemove', function(e) {
        if (isRightClicking) {
          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;
          
          const bearingChange = deltaX * 0.5;
          const pitchChange = deltaY * 0.1;
          
          const currentBearing = map.getBearing ? map.getBearing() : 0;
          const newBearing = (currentBearing + bearingChange) % 360;
          
          if (map.setBearing) {
            map.setBearing(newBearing);
          }
          
          if (map.setPitch) {
            const currentPitch = map.getPitch ? map.getPitch() : 0;
            const newPitch = Math.max(0, Math.min(60, currentPitch + pitchChange));
            map.setPitch(newPitch);
          }
          
          startX = e.clientX;
          startY = e.clientY;
        }
      });
      
      map.getContainer().addEventListener('mouseup', function(e) {
        if (isRightClicking) {
          isRightClicking = false;
          document.body.style.cursor = '';
        }
      });
      
      map.getContainer().addEventListener('dblclick', function(e) {
        e.preventDefault();
        if (map.setBearing) {
          map.setBearing(0);
        }
        if (map.setPitch) {
          map.setPitch(0);
        }
      });
    };

    loadMap();
  }, []);



  useEffect(() => {
    console.log('Data check:', {
      mapReady: !!mapInstanceRef.current,
      locationsData: locationsData?.locations?.length || 0,
      segmentsData: segmentsData?.segments?.length || 0,
      loading,
      error: !!error
    });
    
    if (!mapInstanceRef.current) {
      console.log('❌ Map not ready yet');
      return;
    }
    
    if (loading) {
      console.log('⏳ Data still loading...');
      return;
    }
    
    if (error) {
      console.error('❌ GraphQL error:', error);
      return;
    }
    
    if (!locationsData?.locations) {
      console.log('❌ No locations data');
      return;
    }
    
    if (!segmentsData?.segments) {
      console.log('❌ No segments data');
      return;
    }
    
    console.log('✅ All data ready, processing...');
    console.log('📍 Locations data:', locationsData.locations.length, 'locations');
    console.log('🛣️ Segments data:', segmentsData.segments.length, 'segments');

    const map = mapInstanceRef.current;
    const L = window.L;

    map.eachLayer((layer) => {
      if (layer.options && (layer.options.isDataLayer || layer.options.isLocationLayer)) {
        console.log('Removing layer:', layer);
        map.removeLayer(layer);
      }
    });
    console.log('🗑️ Cleared existing data layers');

    let segmentsAdded = 0;
    let segmentsWithGeometry = 0;
    let segmentsWithoutGeometry = 0;
    let openSegmentCount = 0;
    let closedSegmentCount = 0;
    
    console.log('🛣️ Starting to process segments:', segmentsData.segments.length);
    
    segmentsData.segments.forEach((segment, index) => {
      if (index < 10) { // Log first 10 for debugging
        console.log('Processing segment:', segment.lane_id, 'Direction:', segment.direction, 'Is closed:', segment.is_closed);
        if (typeof segment.geometry === 'string') {
          try {
            const geoJson = JSON.parse(segment.geometry);
            console.log('Coordinates sample:', geoJson.coordinates?.slice(0, 2));
          } catch (e) {
            console.log('Failed to parse geometry:', segment.geometry);
          }
        }
      }
      
      let coordinates = null;
      if (typeof segment.geometry === 'string') {
        try {
          const geoJson = JSON.parse(segment.geometry);
          coordinates = geoJson.coordinates;
          segmentsWithGeometry++;
        } catch (e) {
          console.error('Failed to parse geometry for segment:', segment.lane_id, e);
          segmentsWithoutGeometry++;
        }
      } else if (segment.geometry && segment.geometry.coordinates) {
        coordinates = segment.geometry.coordinates;
        segmentsWithGeometry++;
      } else {
        segmentsWithoutGeometry++;
      }
      
      if (coordinates && Array.isArray(coordinates)) {
        let color, weight, opacity;
        if (segment.is_closed) {
          color = '#e74c3c';  // Red for closed
          weight = 3;
          opacity = 0.8;
          closedSegmentCount++;
        } else {
          color = '#27ae60';  // Green for open
          weight = 4;
          opacity = 0.8;
          openSegmentCount++;
        }
        
        let leafletCoords = coordinates;
        if (coordinates.length > 0 && Array.isArray(coordinates[0])) {
          if (coordinates[0].length === 2 && coordinates[0][0] > coordinates[0][1]) {
            leafletCoords = coordinates.map(coord => [coord[1], coord[0]]);
          }
        }
        
        const polyline = L.polyline(leafletCoords, {
          color: color,
          weight: weight,
          opacity: opacity,
          fillOpacity: 0.8,
          isDataLayer: true
        }).addTo(map);

        const popup = `
          <div style="font-family: 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; min-width: 200px; padding: 8px; 
                      background-color: rgba(60, 60, 60, 0.9); color: white; border-radius: 6px; 
                      box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div style="font-weight: 700; color: white; margin-bottom: 10px; font-size: 14px; border-bottom: 2px solid ${color}; padding-bottom: 6px;">
              ${segment.lane_id}
            </div>
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Road ID:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${segment.road_id}</span>
            </div>
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Length:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${segment.length_m?.toFixed(1) || 'N/A'}m</span>
            </div>
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Status:</span>
              <span style="color: ${segment.is_closed ? '#ff6b6b' : '#51cf66'}; font-weight: 600; margin-left: 8px;">${segment.is_closed ? 'Closed' : 'Open'}</span>
            </div>
            <div style="color: #bdc3c7; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d; font-style: italic;">
              ${segment.start_latitude?.toFixed(6)}, ${segment.start_longitude?.toFixed(6)} → ${segment.end_latitude?.toFixed(6)}, ${segment.end_longitude?.toFixed(6)}
            </div>
          </div>
        `;
        polyline.bindPopup(popup);
        segmentsAdded++;
      }
    });
    
    console.log(`🛣️ Added ${segmentsAdded} road segments to map`);
    console.log(`📊 Segment processing summary: ${segmentsWithGeometry} with geometry, ${segmentsWithoutGeometry} without geometry`);

    let locationsAdded = 0;
    // Generate random colors for location types
    const generateLocationTypeColors = (locationTypes) => {
      const colorPalette = [
        '#BB8FCE', '#45B7D1', '#2E86AB', '#98D8C8', '#F7DC6F', '#F8C471',
        '#D4AC0D', '#17A2B8', '#E74C3C', '#E67E22', '#8E44AD', '#16A085',
        '#F39C12', '#D35400', '#2980B9', '#C0392B', '#3498DB', '#9B59B6',
        '#1ABC9C', '#95A5A6', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
        '#2196F3', '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
        '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#795548', '#607D8B'
      ];
      
      const colors = {};
      const usedColors = new Set();
      
      locationTypes.forEach((type, index) => {
        // Try to assign a color that hasn't been used yet
        let colorIndex = index % colorPalette.length;
        let attempts = 0;
        
        while (usedColors.has(colorPalette[colorIndex]) && attempts < colorPalette.length) {
          colorIndex = (colorIndex + 1) % colorPalette.length;
          attempts++;
        }
        
        colors[type] = colorPalette[colorIndex];
        usedColors.add(colorPalette[colorIndex]);
      });
      
      return colors;
    };
    
    // Get unique location types and generate colors
    const uniqueLocationTypes = [...new Set(locationsData.locations.map(loc => loc.unit_type).filter(Boolean))];
    const locationTypeColors = generateLocationTypeColors(uniqueLocationTypes);
    
    console.log('📍 Processing locations...');
    locationsData.locations.forEach((location, index) => {
      if (index < 5) { // Log first 5 locations for debugging
        console.log('Location:', location.location_name, 'Coords:', location.latitude, location.longitude, 'Type:', location.unit_type);
      }
      
      if (location.latitude && location.longitude) {
        const markerColor = locationTypeColors[location.unit_type] || '#95a5a6';
        
        const marker = L.circleMarker([location.latitude, location.longitude], {
          radius: 4,
          fillColor: markerColor,
          color: '#fff',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8,
          isLocationLayer: true
        }).addTo(map);

        const popup = `
          <div style="font-family: 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; min-width: 200px; padding: 8px; 
                      background-color: rgba(60, 60, 60, 0.9); color: white; border-radius: 6px; 
                      box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div style="font-weight: 700; color: white; margin-bottom: 10px; font-size: 14px; border-bottom: 2px solid ${markerColor}; padding-bottom: 6px;">
              ${location.location_name}
            </div>
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Type:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${location.unit_type || 'Unknown'}</span>
            </div>
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Category:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${location.location_category}</span>
            </div>
            ${location.elevation_m ? `
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Elevation:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${location.elevation_m.toFixed(1)}m</span>
            </div>` : ''}
            ${location.pit_name ? `
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Pit:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${location.pit_name}</span>
            </div>` : ''}
            ${location.region_name ? `
            <div style="margin-bottom: 6px;">
              <span style="color: #ecf0f1; font-weight: 500;">Region:</span>
              <span style="color: white; font-weight: 600; margin-left: 8px;">${location.region_name}</span>
            </div>` : ''}
            <div style="color: #bdc3c7; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #7f8c8d; font-style: italic;">
              ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
            </div>
          </div>
        `;
        marker.bindPopup(popup);
        locationsAdded++;
      }
    });
    
    console.log(`📍 Added ${locationsAdded} location markers to map`);
    
    if (locationsAdded > 0 || segmentsAdded > 0) {
      const allLatLngs = [];
      
      locationsData.locations.forEach((location) => {
        if (location.latitude && location.longitude) {
          allLatLngs.push([location.latitude, location.longitude]);
        }
      });
      
      segmentsData.segments.forEach((segment) => {
        if (segment.geometry) {
          try {
            const geoJson = JSON.parse(segment.geometry);
            if (geoJson.coordinates && Array.isArray(geoJson.coordinates)) {
              geoJson.coordinates.forEach(coord => {
                allLatLngs.push([coord[1], coord[0]]); 
              });
            }
          } catch (e) {
            // Skip invalid geometry
          }
        }
      });
      
      if (allLatLngs.length > 0) {
        const bounds = L.latLngBounds(allLatLngs);
        
        map.fitBounds(bounds, { 
          padding: [50, 50],
          maxZoom: 16 
        });
        
        const center = bounds.getCenter();
        const zoom = map.getZoom();
        console.log(`🗺️ Map centered at: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)} with zoom: ${zoom}`);
        console.log(`📊 Fitted bounds to ${allLatLngs.length} data points`);
      }
    }
    
    console.log('🎨 Creating legend...');
    addSimpleLegend(locationsData.locations.length, segmentsAdded);
    console.log('🎨 Legend creation completed');

  }, [locationsData, segmentsData, loading, error]);
  
  const addSimpleLegend = (locationCount, segmentCount) => {
    console.log('🎨 addSimpleLegend called with:', { locationCount, segmentCount });
    
    const existingLegend = document.getElementById('simple-legend');
    if (existingLegend) {
      console.log('🎨 Removing existing legend');
      existingLegend.remove();
    }
    
    let openRoads = 0;
    let closedRoads = 0;
    if (segmentsData?.segments) {
      segmentsData.segments.forEach(segment => {
        if (segment.is_closed) {
          closedRoads++;
        } else {
          openRoads++;
        }
      });
    }
    
    const locationTypes = {};
    if (locationsData?.locations) {
      locationsData.locations.forEach(location => {
        const type = location.unit_type || 'Unknown';
        locationTypes[type] = (locationTypes[type] || 0) + 1;
      });
    }
    
    // Generate colors for legend using the same function
    const generateLegendColors = (locationTypes) => {
      const colorPalette = [
        '#BB8FCE', '#45B7D1', '#2E86AB', '#98D8C8', '#F7DC6F', '#F8C471',
        '#D4AC0D', '#17A2B8', '#E74C3C', '#E67E22', '#8E44AD', '#16A085',
        '#F39C12', '#D35400', '#2980B9', '#C0392B', '#3498DB', '#9B59B6',
        '#1ABC9C', '#95A5A6', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
        '#2196F3', '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
        '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#795548', '#607D8B'
      ];
      
      const colors = {};
      const usedColors = new Set();
      
      locationTypes.forEach((type, index) => {
        let colorIndex = index % colorPalette.length;
        let attempts = 0;
        
        while (usedColors.has(colorPalette[colorIndex]) && attempts < colorPalette.length) {
          colorIndex = (colorIndex + 1) % colorPalette.length;
          attempts++;
        }
        
        colors[type] = colorPalette[colorIndex];
        usedColors.add(colorPalette[colorIndex]);
      });
      
      return colors;
    };
    
    const locationTypeColors = generateLegendColors(Object.keys(locationTypes));
    
    const legendHtml = `
      <div id="simple-legend" style="position: fixed; top: 20px; right: 20px; 
              background-color: rgba(60, 60, 60, 0.7); color: white; 
              border-radius: 8px; font-family: 'Segoe UI', sans-serif;
              box-shadow: 0 4px 20px rgba(0,0,0,0.6); z-index: 1000; 
              min-width: 280px; max-height: 400px; overflow-y: auto;
              backdrop-filter: blur(10px); cursor: move;">
        
        <div id="legend-header" style="background-color: rgba(40, 40, 40, 0.9); padding: 12px 16px; 
                    border-radius: 8px 8px 0 0; display: flex; align-items: center; justify-content: space-between; cursor: move;"
             onclick="toggleLegend()">
          <div style="display: flex; align-items: center;">
            <div style="width: 20px; height: 20px; background-color: #3498db; border-radius: 4px; 
                        margin-right: 10px; display: flex; align-items: center; justify-content: center;">
              <span style="color: white; font-size: 12px; font-weight: bold;">⛏</span>
            </div>
            <span style="color: white; font-weight: 600; font-size: 14px;">Mine Map</span>
          </div>
          <div id="legend-toggle-arrow" style="color: white; font-size: 16px; cursor: pointer;">▼</div>
        </div>
        
        <div id="legend-content" style="padding: 0; color: white; font-size: 12px;">
          
          <div style="border-left: 3px solid #3498db; margin: 8px 0;">
            <div id="road-layers-header" style="background-color: rgba(52, 152, 219, 0.1); padding: 8px 12px; cursor: pointer; 
                        display: flex; align-items: center; justify-content: space-between;"
                 onclick="toggleSection('road-layers-content', 'road-layers-arrow')">
              <div style="display: flex; align-items: center;">
                <div style="width: 16px; height: 16px; background-color: #3498db; border-radius: 3px; 
                            margin-right: 8px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 10px;">🛣</span>
                </div>
                <span style="color: #3498db; font-weight: 600; font-size: 13px;">Road Layers</span>
                <div style="background-color: #3498db; color: white; border-radius: 10px; 
                            padding: 2px 8px; margin-left: 8px; font-size: 10px;">2</div>
              </div>
              <div id="road-layers-arrow" style="color: #3498db; font-size: 14px;">▼</div>
            </div>
            <div id="road-layers-content" style="padding: 8px 12px 8px 32px;">
              <div style="display: flex; align-items: center; margin-bottom: 6px;">
                <div style="width: 12px; height: 3px; background-color: #27ae60; margin-right: 10px; border-radius: 2px;"></div>
                <span style="color: #bdc3c7;">Open Roads (${openRoads})</span>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 6px;">
                <div style="width: 12px; height: 3px; background-color: #e74c3c; margin-right: 10px; border-radius: 2px;"></div>
                <span style="color: #bdc3c7;">Closed Roads (${closedRoads})</span>
              </div>
            </div>
          </div>
          
          <div style="border-left: 3px solid #e74c3c; margin: 8px 0;">
            <div id="location-types-header" style="background-color: rgba(231, 76, 60, 0.1); padding: 8px 12px; cursor: pointer; 
                        display: flex; align-items: center; justify-content: space-between;"
                 onclick="toggleSection('location-types-content', 'location-types-arrow')">
              <div style="display: flex; align-items: center;">
                <div style="width: 16px; height: 16px; background-color: #e74c3c; border-radius: 3px; 
                            margin-right: 8px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 10px;">📍</span>
                </div>
                <span style="color: #e74c3c; font-weight: 600; font-size: 13px;">Location Types</span>
                <div style="background-color: #e74c3c; color: white; border-radius: 10px; 
                            padding: 2px 8px; margin-left: 8px; font-size: 10px;">${Object.keys(locationTypes).length}</div>
              </div>
              <div id="location-types-arrow" style="color: #e74c3c; font-size: 14px;">▼</div>
            </div>
            <div id="location-types-content" style="padding: 8px 12px 8px 32px;">
              ${Object.entries(locationTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                const color = locationTypeColors[type] || '#95a5a6';
                return `
                <div style="display: flex; align-items: center; margin-bottom: 6px;">
                  <div style="width: 8px; height: 8px; background-color: ${color}; margin-right: 10px; border-radius: 50%;"></div>
                  <span style="color: #bdc3c7;">${type} (${count})</span>
                </div>`;
              }).join('')}
            </div>
          </div>
          
        </div>
      </div>
    `;
    
    const legendElement = document.createElement('div');
    legendElement.innerHTML = legendHtml;
    document.body.appendChild(legendElement);
    
    window.toggleSection = function(contentId, arrowId) {
      const content = document.getElementById(contentId);
      const arrow = document.getElementById(arrowId);
      
      if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
      } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
      }
    };
    
    window.toggleLegend = function() {
      const content = document.getElementById('legend-content');
      const arrow = document.getElementById('legend-toggle-arrow');
      
      if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
      } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
      }
    };
    
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    const legend = document.getElementById('simple-legend');
    const header = document.getElementById('legend-header');
    
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    function dragStart(e) {
      if (e.target.id === 'legend-toggle-arrow') return;
      
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      
      if (e.target === header || header.contains(e.target)) {
        isDragging = true;
      }
    }
    
    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        
        xOffset = currentX;
        yOffset = currentY;
        
        legend.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      }
    }
    
    function dragEnd(e) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
    }
    
    console.log('🎨 Legend element added to DOM with collapsible functionality');
  };

  if (error) {
    return (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        color: 'red'
      }}>
        <h3>Error Loading Map Data</h3>
        <p>Error: {error}</p>
      </div>
    );
  }
  
  console.log('Render check:', {
    locationsData: locationsData?.locations?.length || 0,
    segmentsData: segmentsData?.segments?.length || 0,
    loading,
    error: !!error
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div 
        className="folium-map" 
        id="map" 
        ref={mapRef}
        style={{ 
          width: '100%', 
          height: '100vh', 
          minHeight: '600px',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1
        }}
      />
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          <h3>Loading Dispatch Database Map...</h3>
          <p>Fetching roads and locations...</p>
        </div>
      )}
    </div>
  );
}


