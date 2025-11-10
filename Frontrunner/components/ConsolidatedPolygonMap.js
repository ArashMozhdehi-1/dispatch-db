import React, { useState, useEffect, useRef } from 'react';

const ConsolidatedPolygonMap = () => {
  const mapContainer = useRef(null);
  const cesiumViewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const currentTooltip = useRef(null);
  const hoveredEntityRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [consolidatedData, setConsolidatedData] = useState(null);
  const [intersectionsData, setIntersectionsData] = useState(null);
  const [surveyPointsData, setSurveyPointsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleCategories, setVisibleCategories] = useState(new Set());
  const [showSurveyPolylines, setShowSurveyPolylines] = useState(true);
  const [baseLayer, setBaseLayer] = useState('night');
  const [viewMode, setViewMode] = useState('3D');
  const getConsolidatedCategory = (category) => {
    if (!category) return 'default';
    const categoryStr = String(category);
    const normalized = categoryStr.toLowerCase().trim();
    
    if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
      return 'pit';
    }
    if (normalized.includes('parking')) {
      return 'parking';
    }
    if (normalized.includes('crusher')) {
      return 'crusher';
    }
    if (normalized.includes('fuel')) {
      return 'fuel';
    }
    
    return normalized;
  };

  const getCategoryDisplayName = (consolidatedCategory) => {
    const displayNames = {
      'pit': 'Pit Locations',
      'parking': 'Parking Bay',
      'crusher': 'Crusher Operations',
      'fuel': 'Fuel Station',
      'intersection': 'Road Networks',
      'dump': 'Dump Site',
      'blast': 'Blast Area',
      'stockpile': 'Stockpile',
      'workshop': 'Workshop',
      'gate': 'Gate',
      'access': 'Access Point',
      'default': 'Other'
    };
    
    if (displayNames[consolidatedCategory]) {
      return displayNames[consolidatedCategory];
    }
    
    const categoryStr = String(consolidatedCategory || 'Other');
    return categoryStr.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const generateColorForCategory = (category) => {
    if (!category) return '#95A5A6';
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
  };

  const getCategoryColor = (category) => {
    const consolidated = getConsolidatedCategory(category);
    const normalized = consolidated.toLowerCase().trim();
    
    const colorMap = {
      pit: '#FF6B35',
      parking: '#FFD23F',
      crusher: '#9B59B6',
      fuel: '#FFA500',
      intersection: '#FF0000',
      dump: '#FF8C00',
      blast: '#FF6347',
      stockpile: '#FFD700',
      workshop: '#DA70D6',
      gate: '#FFB347',
      access: '#FFC107',
      default: '#FFD23F'
    };
    
    return colorMap[normalized] || generateColorForCategory(category);
  };

  useEffect(() => {
    setIsClient(true);
    
    return () => {
      closeCurrentTooltip();
      const existingTooltip = document.getElementById('map-tooltip');
      if (existingTooltip) {
        existingTooltip.remove();
      }
      
      if (cesiumViewerRef.current) {
        try {
          const viewer = cesiumViewerRef.current;
          if (viewer.entities) {
            viewer.entities.removeAll();
          }
          if (viewer.imageryLayers) {
            viewer.imageryLayers.removeAll();
          }
          if (typeof viewer.destroy === 'function') {
            viewer.destroy();
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Consolidated Map] Error during cleanup:', error.message);
          }
        } finally {
          cesiumViewerRef.current = null;
        }
      }
    };
  }, []);

  useEffect(() => {
    if (isClient && !mapLoaded && !mapError) {
      fetchData();
    }
  }, [isClient]);

  useEffect(() => {
    if (consolidatedData && !mapLoaded && !mapError) {
      loadMap();
    }
  }, [consolidatedData]);

  useEffect(() => {
    if (mapLoaded && intersectionsData && cesiumViewerRef.current) {
      console.log('[Consolidated Map] 🛣️ Adding intersections to existing map...');
      addIntersectionsToCesium(cesiumViewerRef.current);
    }
  }, [intersectionsData, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && surveyPointsData && cesiumViewerRef.current) {
      console.log('[Consolidated Map] 📍 useEffect triggered - Adding survey points to map...');
      console.log('[Consolidated Map] 📍 mapLoaded:', mapLoaded);
      console.log('[Consolidated Map] 📍 surveyPointsData:', surveyPointsData);
      console.log('[Consolidated Map] 📍 cesiumViewerRef.current:', !!cesiumViewerRef.current);
      addSurveyPointsToCesium(cesiumViewerRef.current);
    } else {
      console.log('[Consolidated Map] ⏳ Waiting for conditions:', {
        mapLoaded,
        hasSurveyData: !!surveyPointsData,
        hasViewer: !!cesiumViewerRef.current
      });
    }
  }, [surveyPointsData, mapLoaded]);

  useEffect(() => {
    if ((consolidatedData?.consolidated_locations || intersectionsData?.consolidated_intersections) && visibleCategories.size === 0) {
      const uniqueCategories = new Set();
      
      if (consolidatedData?.consolidated_locations) {
        consolidatedData.consolidated_locations.forEach(location => {
          let category = location.category || 'default';
          if (typeof category === 'string') {
            const normalized = category.toLowerCase().trim();
            if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
              category = 'pit';
            }
          } else {
            category = String(category || 'default');
          }
          uniqueCategories.add(category);
        });
      }
      
      if (intersectionsData?.consolidated_intersections && intersectionsData.consolidated_intersections.length > 0) {
        uniqueCategories.add('intersection');
        console.log('[Consolidated Map] ✅ Added intersection category with', intersectionsData.consolidated_intersections.length, 'intersections');
      }
      
      setVisibleCategories(uniqueCategories);
      console.log('[Consolidated Map] 📊 All categories initialized:', Array.from(uniqueCategories));
    }
  }, [consolidatedData, intersectionsData]);

  useEffect(() => {
    if (cesiumViewerRef.current && entitiesRef.current.length > 0) {
      console.log('[Consolidated Map] 🔄 Updating entity visibility, visibleCategories:', Array.from(visibleCategories));
      let intersectionCount = 0;
      let visibleIntersectionCount = 0;
      let locationCount = 0;
      let visibleLocationCount = 0;
      
      entitiesRef.current.forEach((entity, entityIndex) => {
        if (entity && entity.properties) {
          let category = entity.properties.category;
          
          if (category === 'intersection') {
            intersectionCount++;
            const isVisible = visibleCategories.size === 0 || visibleCategories.has('intersection');
            entity.show = isVisible;
            if (isVisible) visibleIntersectionCount++;
            return;
          }
          
          if (category === 'survey_point') {
            entity.show = showSurveyPolylines;
            return;
          }
          
          if (category) {
            locationCount++;
            if (typeof category === 'string') {
              const normalized = category.toLowerCase().trim();
              if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
                category = 'pit';
              }
            } else {
              category = String(category || 'default');
            }
            
            const entityConsolidated = getConsolidatedCategory(category);
            const isVisible = visibleCategories.size === 0 || 
              visibleCategories.has(category) || 
              visibleCategories.has(entityConsolidated);
            entity.show = isVisible;
            if (isVisible) visibleLocationCount++;
          }
        }
      });
      
      console.log(`[Consolidated Map] 📊 Visibility: ${visibleIntersectionCount}/${intersectionCount} intersections, ${visibleLocationCount}/${locationCount} locations visible`);
      
      if (cesiumViewerRef.current.scene) {
        cesiumViewerRef.current.scene.requestRender();
      }
    }
  }, [visibleCategories]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/consolidated-locations');
      if (!response.ok) {
        let errorData;
        const responseText = await response.text();
        console.error('❌ API Error Response (raw):', responseText);
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          errorData = { message: responseText || `HTTP ${response.status} error` };
        }
        console.error('❌ API Error (parsed):', errorData);
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('📊 Consolidated locations loaded:', result.total_locations);
      setConsolidatedData(result);
      
      const intersectionsResponse = await fetch('/api/consolidated-intersections');
      if (intersectionsResponse.ok) {
        const intersectionsResult = await intersectionsResponse.json();
        console.log('🛣️ Consolidated intersections API response:', intersectionsResult);
        console.log('🛣️ Total intersections:', intersectionsResult.total_intersections);
        console.log('🛣️ Intersections array length:', intersectionsResult.consolidated_intersections?.length);
        if (intersectionsResult.consolidated_intersections && intersectionsResult.consolidated_intersections.length > 0) {
          console.log('🛣️ Sample intersection:', intersectionsResult.consolidated_intersections[0]);
        }
        setIntersectionsData(intersectionsResult);
      } else {
        console.error('❌ Could not fetch intersections:', intersectionsResponse.status, await intersectionsResponse.text());
      }
      
      const surveyResponse = await fetch('/api/grouped-locations');
      console.log('📍 Survey points API response status:', surveyResponse.status);
      if (surveyResponse.ok) {
        const surveyResult = await surveyResponse.json();
        console.log('📍 Survey points API result:', JSON.stringify(surveyResult, null, 2));
        const surveyGroup = surveyResult.groups?.find(g => g.group_name === 'General Survey Points');
        if (surveyGroup) {
          console.log('📍 Found survey group:', surveyGroup);
          const maxPoints = 50000;
          if (surveyGroup.coordinates && surveyGroup.coordinates.length > maxPoints) {
            console.log(`📍 Limiting survey points from ${surveyGroup.coordinates.length} to ${maxPoints}`);
            surveyGroup.coordinates = surveyGroup.coordinates.slice(0, maxPoints);
            surveyGroup.total_points = maxPoints;
          }
          console.log(`📍 Loaded ${surveyGroup.coordinates.length} survey points from GeoServer`);
          console.log('📍 Survey points sample:', surveyGroup.coordinates.slice(0, 3));
          setSurveyPointsData(surveyGroup);
        } else {
          console.warn('⚠️ No survey group found in response. Groups:', surveyResult.groups);
        }
      } else {
        const errorText = await surveyResponse.text();
        console.error('❌ Could not fetch survey points:', surveyResponse.status, errorText);
      }
      
      if (!result.consolidated_locations || result.consolidated_locations.length === 0) {
        console.warn('⚠️ No consolidated locations found in response');
        setMapError('No locations data available');
        return;
      }
      
    } catch (error) {
      console.error('Error fetching consolidated data:', error);
      setMapError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const closeCurrentTooltip = () => {
    if (currentTooltip.current) {
      currentTooltip.current.style.display = 'none';
      currentTooltip.current = null;
    }
    hoveredEntityRef.current = null;
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
    currentTooltip.current = tooltip;
  };

  const formatTooltipContent = (entity) => {
    if (!entity || !entity.properties) return '';
    const props = entity.properties;
    
    if (props.isOutline || props.isTopOutline) {
      return '';
    }
    
    const category = props.category || 'N/A';
    const displayName = getCategoryDisplayName(category);
    const color = props.color || getCategoryColor(category);
    
    return `
      <div style="font-weight: 600; color: ${color}; margin-bottom: 8px; font-size: 14px; border-bottom: 2px solid ${color}; padding-bottom: 4px;">
        ${props.name || 'Location'}
      </div>
      <div style="margin-bottom: 4px;">
        <span style="color: #bdc3c7;">Category:</span>
        <span style="color: white; margin-left: 8px; font-weight: 500;">${displayName}</span>
      </div>
      ${props.total_points ? `
      <div style="margin-bottom: 4px;">
        <span style="color: #bdc3c7;">Points:</span>
        <span style="color: white; margin-left: 8px; font-weight: 500;">${props.total_points}</span>
      </div>
      ` : ''}
      ${props.area_sqm ? `
      <div style="margin-bottom: 4px;">
        <span style="color: #bdc3c7;">Area:</span>
        <span style="color: white; margin-left: 8px; font-weight: 500;">${Math.round(props.area_sqm).toLocaleString()} m²</span>
      </div>
      ` : ''}
    `;
  };

  const loadMap = async () => {
    if (!mapContainer.current || cesiumViewerRef.current) return;

    try {
      if (!document.querySelector('link[href*="Widgets.css"]')) {
        const cesiumCSS = document.createElement('link');
        cesiumCSS.rel = 'stylesheet';
        cesiumCSS.type = 'text/css';
        cesiumCSS.href = 'https://cesium.com/downloads/cesiumjs/releases/1.126/Build/Cesium/Widgets/widgets.css';
        document.head.appendChild(cesiumCSS);
      }

      if (!window.Cesium) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.126/Build/Cesium/Cesium.js';
          script.onload = () => {
            console.log('[Consolidated Map] Cesium loaded');
            resolve();
          };
          script.onerror = () => reject(new Error('Failed to load Cesium'));
          document.head.appendChild(script);
        });
      }

      initializeMap();
    } catch (error) {
      console.error('[Consolidated Map] Error loading libraries:', error);
      setMapError(error.message);
    }
  };

  const initializeMap = async () => {
    if (!mapContainer.current || !window.Cesium) {
      console.error('[Consolidated Map] Required libraries not loaded');
      return;
    }

    try {
      if (window.Cesium.Ion) {
        window.Cesium.Ion.defaultAccessToken = undefined;
        window.Cesium.Ion.defaultServer = undefined;
      }

      const getImageryProvider = (layerType) => {
        switch (layerType) {
          case 'night':
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              credit: '© OpenStreetMap contributors, © CARTO'
            });
          case 'day':
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              credit: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
            });
          case 'topographic':
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
              credit: '© OpenTopoMap contributors',
              subdomains: ['a', 'b', 'c']
            });
          case 'terrain':
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png',
              credit: '© Stadia Maps © Stamen Design © OpenMapTiles © OpenStreetMap contributors'
            });
          default:
            return new window.Cesium.UrlTemplateImageryProvider({
              url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              credit: '© OpenStreetMap contributors, © CARTO'
            });
        }
      };

      const initialProvider = getImageryProvider(baseLayer);

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

      cesiumViewer.imageryLayers.removeAll();
      cesiumViewer.imageryLayers.addImageryProvider(initialProvider);
      
      cesiumViewer.scene.globe.depthTestAgainstTerrain = false;
      
      cesiumViewer.scene.requestRender();

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
        const allLinks = mapContainer.current.querySelectorAll('a[href*="cesium.com"]');
        allLinks.forEach(link => link.style.display = 'none');
        
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
      setupTooltips();
      
      const setupTooltipHandlers = () => {
        if (!cesiumViewer || !cesiumViewer.scene || !cesiumViewer.cesiumWidget) {
          setTimeout(setupTooltipHandlers, 100);
          return;
        }
        
        const tooltipHandler = cesiumViewer.cesiumWidget.screenSpaceEventHandler;
        
        tooltipHandler.setInputAction((movement) => {
          if (!cesiumViewer || !cesiumViewer.scene) return;
          const pickedObject = cesiumViewer.scene.pick(movement.endPosition);
          const tooltip = document.getElementById('map-tooltip');
          if (!tooltip) return;
          
          const rect = cesiumViewer.canvas ? cesiumViewer.canvas.getBoundingClientRect() : null;
          const mouseX = rect ? movement.endPosition.x + rect.left : movement.endPosition.x;
          const mouseY = rect ? movement.endPosition.y + rect.top : movement.endPosition.y;
          
          if (window.Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
            let entity = pickedObject.id;
            
            if (hoveredEntityRef.current !== entity) {
              hoveredEntityRef.current = entity;
              closeCurrentTooltip();
              const content = formatTooltipContent(entity);
              if (content) {
                tooltip.innerHTML = content;
                tooltip.style.display = 'block';
                currentTooltip.current = tooltip;
                if (cesiumViewer.canvas) {
                  cesiumViewer.canvas.style.cursor = 'pointer';
                }
              }
            }
            
            if (tooltip.style.display === 'block') {
              tooltip.style.left = (mouseX + 10) + 'px';
              tooltip.style.top = (mouseY - 10) + 'px';
              const tooltipRect = tooltip.getBoundingClientRect();
              const viewportWidth = window.innerWidth;
              const viewportHeight = window.innerHeight;
              if (tooltipRect.right > viewportWidth) {
                tooltip.style.left = (mouseX - tooltipRect.width - 10) + 'px';
              }
              if (tooltipRect.bottom > viewportHeight) {
                tooltip.style.top = (mouseY - tooltipRect.height - 10) + 'px';
              }
              if (tooltipRect.left < 0) {
                tooltip.style.left = '10px';
              }
              if (tooltipRect.top < 0) {
                tooltip.style.top = '10px';
              }
            }
          } else {
            hoveredEntityRef.current = null;
            closeCurrentTooltip();
            if (cesiumViewer.canvas) {
              cesiumViewer.canvas.style.cursor = '';
            }
          }
        }, window.Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      };
      
      setTimeout(setupTooltipHandlers, 100);

      addPolygonsToCesium(cesiumViewer);
      
      setTimeout(() => {
        console.log('[Consolidated Map] Entities added, centering camera...');
        console.log('[Consolidated Map] Total entities:', entitiesRef.current.length);
        centerCameraOnData(cesiumViewer);
      }, 1000);

      setMapLoaded(true);
      console.log('[Consolidated Map] Cesium 3D Globe initialized');
    } catch (error) {
      console.error('[Consolidated Map] Error initializing map:', error);
      setMapError(error.message);
    }
  };

  const addSurveyPointsToCesium = (cesiumViewer) => {
    console.log('[Consolidated Map] 🔧 addSurveyPointsToCesium called');
    console.log('[Consolidated Map] 📊 surveyPointsData:', surveyPointsData);
    console.log('[Consolidated Map] 📊 showSurveyPolylines:', showSurveyPolylines);
    
    if (!surveyPointsData || !surveyPointsData.coordinates) {
      console.warn('[Consolidated Map] ❌ No survey points data available');
      return;
    }
    
    if (!surveyPointsData.coordinates || surveyPointsData.coordinates.length === 0) {
      console.warn('[Consolidated Map] ❌ Survey points array is empty');
      return;
    }
    
    console.log(`[Consolidated Map] 📍 Adding ${surveyPointsData.coordinates.length} survey points`);
    console.log('[Consolidated Map] 📍 First point sample:', surveyPointsData.coordinates[0]);
    
    let addedCount = 0;
    let errorCount = 0;
    
    surveyPointsData.coordinates.forEach((point, index) => {
      try {
        if (!point.longitude || !point.latitude || isNaN(point.longitude) || isNaN(point.latitude)) {
          console.warn(`[Consolidated Map] ⚠️ Invalid coordinates for point ${index}:`, point);
          errorCount++;
          return;
        }
        
        // Use z/altitude value if available, if it's 0 use 3 meters instead (same as locations)
        // Divide z values by factor to convert units (e.g., 1000 for mm to m, 100 for cm to m)
        const Z_FACTOR = 1000; // Adjust this factor as needed
        const pointAltitude = point.altitude || point.mine_coords?.z || null;
        const hasAltitude = pointAltitude !== null && pointAltitude !== undefined && !isNaN(pointAltitude);
        
        // If altitude exists and is not 0, divide by factor and use it; otherwise use 3 meters
        const pointHeight = (hasAltitude && pointAltitude !== 0) ? (pointAltitude / Z_FACTOR) : 3;
        
        // Set position with height - RELATIVE_TO_GROUND will add this above terrain
        const position = window.Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, pointHeight);
        
        const pointEntity = cesiumViewer.entities.add({
          position: position,
          point: {
            pixelSize: 3,
            color: window.Cesium.Color.WHITE.withAlpha(1.0),
            outlineColor: window.Cesium.Color.WHITE.withAlpha(0.5),
            outlineWidth: 1,
            heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          name: `Survey Point: ${point.location_name || point.coordinate_id}`,
          properties: {
            category: 'survey_point',
            coordinate_id: point.coordinate_id,
            location_name: point.location_name,
            latitude: point.latitude,
            longitude: point.longitude
          },
          show: showSurveyPolylines
        });
        
        entitiesRef.current.push(pointEntity);
        addedCount++;
        
        if (index < 5) {
          console.log(`[Consolidated Map] ✅ Added point ${index}: lat=${point.latitude}, lon=${point.longitude}`);
        }
      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] ❌ Error adding survey point ${index}:`, err, point);
      }
    });
    
    console.log(`[Consolidated Map] ✅ Added ${addedCount} survey points (${errorCount} errors)`);
    console.log(`[Consolidated Map] 📊 Points visibility: ${showSurveyPolylines ? 'VISIBLE' : 'HIDDEN'}`);
    
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
      console.log('[Consolidated Map] 🔄 Scene render requested');
    }
  };

  const addIntersectionsToCesium = (cesiumViewer) => {
    if (!intersectionsData?.consolidated_intersections) {
      console.warn('[Consolidated Map] No intersections data available');
      return;
    }
    
    console.log(`[Consolidated Map] 🛣️ Adding ${intersectionsData.consolidated_intersections.length} intersections to Cesium`);
    
    intersectionsData.consolidated_intersections.forEach((intersection, index) => {
      try {
        let geometry = intersection.polygon;
        if (!geometry) {
          console.warn(`[Consolidated Map] No polygon for intersection ${index}: ${intersection.location_name}`);
          return;
        }
        
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            console.warn(`[Consolidated Map] Failed to parse polygon for intersection ${index}:`, e);
            return;
          }
        }
        
        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          console.warn(`[Consolidated Map] Invalid geometry for intersection ${index}:`, geometry);
          return;
        }
        
        const positions = [];
        if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates[0]) {
          geometry.coordinates[0].forEach(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2 && !isNaN(coord[0]) && !isNaN(coord[1])) {
              const lon = parseFloat(coord[0]);
              const lat = parseFloat(coord[1]);
              if (!isNaN(lon) && !isNaN(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
                positions.push(window.Cesium.Cartesian3.fromDegrees(lon, lat, 0));
              }
            }
          });
        }
        
        if (positions.length === 0) {
          console.warn(`[Consolidated Map] No valid positions for intersection ${index}: ${intersection.location_name}`);
          return;
        }
        
        const redColor = window.Cesium.Color.RED.withAlpha(0.6);
        
        const entity = cesiumViewer.entities.add({
          polygon: {
            hierarchy: positions,
            material: redColor,
            outline: true,
            outlineColor: window.Cesium.Color.RED,
            outlineWidth: 2,
            perPositionHeight: false,
            heightReference: window.Cesium.HeightReference.CLAMP_TO_GROUND,
            extrudedHeight: 0
          },
          name: intersection.location_name || `Intersection ${index}`,
          properties: {
            name: intersection.location_name,
            category: 'intersection',
            total_points: intersection.total_points,
            area_sqm: intersection.area_sqm,
            color: '#FF0000'
          },
          show: true
        });
        
        entitiesRef.current.push(entity);
        
        if (index < 3) {
          console.log(`[Consolidated Map] ✅ Added intersection ${index}: ${intersection.location_name}`);
        }
        
      } catch (err) {
        console.error(`[Consolidated Map] Error adding intersection ${index}:`, err);
      }
    });
    
    console.log(`[Consolidated Map] ✅ Added ${intersectionsData.consolidated_intersections.length} intersections, total entities now: ${entitiesRef.current.length}`);
    
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
    
    setVisibleCategories(prev => {
      const newSet = new Set(prev);
      newSet.add('intersection');
      return newSet;
    });
  };

  const addPolygonsToCesium = (cesiumViewer) => {
    if (!consolidatedData?.consolidated_locations) {
      console.warn('[Consolidated Map] No consolidated data available');
      return;
    }
    
    const locationCount = consolidatedData?.consolidated_locations?.length || 0;
    console.log(`[Consolidated Map] Adding ${locationCount} locations to Cesium`);
    entitiesRef.current = [];
    
    if (consolidatedData?.consolidated_locations) {
      consolidatedData.consolidated_locations.forEach((location, index) => {
      try {
        if (!location.polygon) {
          console.log(`[Consolidated Map] Location ${index} (${location.location_name}) has no polygon`);
          return;
        }
        
        let geometry = location.polygon;
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            console.warn(`[Consolidated Map] Failed to parse polygon for location ${index}:`, e);
            return;
          }
        }
        
        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          console.warn(`[Consolidated Map] Invalid geometry for location ${index}:`, geometry);
          return;
        }
        
        console.log(`[Consolidated Map] Processing location ${index}: ${location.location_name}, type: ${geometry.type}, coords: ${geometry.coordinates?.[0]?.length || 0} points`);

        const positions = [];
        if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
          geometry.coordinates[0].forEach(coord => {
            // Always use z=0 for base positions, height will be set via heightReference
            positions.push(window.Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0));
          });
        }
        if (positions.length === 0) {
          console.warn(`[Consolidated Map] No positions for location ${index}: ${location.location_name}`);
          return;
        }

        let category = location.category || 'default';
        if (typeof category === 'string') {
          const normalized = category.toLowerCase().trim();
          if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
            category = 'pit';
          }
        } else {
          category = String(category || 'default');
        }
        
        const categoryColor = getCategoryColor(category);
        const cesiumColor = window.Cesium.Color.fromCssColorString(categoryColor);
        
        const topColor = window.Cesium.Color.multiplyByScalar(cesiumColor, 1.2, new window.Cesium.Color());
        const topMaterial = topColor.withAlpha(0.9);
        
        const wallMaterial = cesiumColor.withAlpha(0.9);
        
        // Use z/altitude value if available, if it's 0 use 3 meters instead
        // Divide z values by factor to convert units (e.g., 1000 for mm to m, 100 for cm to m)
        const Z_FACTOR = 1000; // Adjust this factor as needed
        const locationAltitude = location.avg_altitude || location.altitude || null;
        const hasAltitude = locationAltitude !== null && locationAltitude !== undefined && !isNaN(locationAltitude);
        
        // If altitude exists and is not 0, divide by factor and use it; otherwise use 3 meters
        const buildingHeight = (hasAltitude && locationAltitude !== 0) ? (locationAltitude / Z_FACTOR) : 3;
        
        const entity = cesiumViewer.entities.add({
          polygon: {
            hierarchy: positions,
            material: wallMaterial,
            outline: true,
            outlineColor: cesiumColor,
            outlineWidth: 2,
            height: 0,
            extrudedHeight: buildingHeight,
            heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
          },
          name: location.location_name || `Location ${index}`,
          properties: {
            name: location.location_name,
            category: category,
            total_points: location.total_points,
            area_sqm: location.area_sqm,
            color: categoryColor
          },
          show: visibleCategories.size === 0 || visibleCategories.has(category)
        });
        
        entitiesRef.current.push(entity);
        
        const topPositions = positions.map(pos => {
          const cartographic = window.Cesium.Cartographic.fromCartesian(pos);
          cartographic.height = buildingHeight;
          return window.Cesium.Cartesian3.fromRadians(
            cartographic.longitude,
            cartographic.latitude,
            cartographic.height
          );
        });
        
        const topEntity = cesiumViewer.entities.add({
          polygon: {
            hierarchy: topPositions,
            material: topMaterial,
            outline: true,
            outlineColor: topColor,
            outlineWidth: 1,
            height: buildingHeight,
            heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
          },
          name: `${location.location_name || `Location ${index}`} - Top`,
          properties: {
            name: location.location_name,
            category: category,
            isTop: true
          },
          show: visibleCategories.size === 0 || visibleCategories.has(category)
        });
        
        entitiesRef.current.push(topEntity);
        
        if (index % 10 === 0) {
          cesiumViewer.scene.requestRender();
        }
        
        if (index < 5 || index % 20 === 0) {
          const areaKm2 = (location.area_sqm || 0) / 1000000;
          console.log(`[Consolidated Map] Added entity ${index}: ${location.location_name}, category: ${category}, area: ${areaKm2.toFixed(2)} km², color: ${categoryColor}, visible: ${entity.show}`);
        }
      } catch (err) {
        console.warn(`[Consolidated Map] Error adding polygon ${index}:`, err);
      }
      });
      console.log(`[Consolidated Map] Added ${consolidatedData.consolidated_locations.length} locations`);
    }
    
    console.log(`[Consolidated Map] Added ${entitiesRef.current.length} location entities`);
    
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
      console.log('[Consolidated Map] Forced scene render');
    }
  };

  const centerCameraOnData = (cesiumViewer) => {
    try {
      const positions = [];
      entitiesRef.current.forEach(entity => {
        if (entity.polygon && entity.polygon.hierarchy) {
          try {
            const hierarchy = entity.polygon.hierarchy.getValue ? 
              entity.polygon.hierarchy.getValue(window.Cesium.JulianDate.now()) : 
              entity.polygon.hierarchy;
            if (hierarchy && hierarchy.positions) {
              positions.push(...hierarchy.positions);
            }
          } catch (e) {}
        }
        if (entity.position) {
          try {
            const pos = entity.position.getValue ? 
              entity.position.getValue(window.Cesium.JulianDate.now()) : 
              entity.position;
            if (window.Cesium.defined(pos)) {
              positions.push(pos);
            }
          } catch (e) {}
        }
      });
      
      if (positions.length === 0) {
        console.warn('[Consolidated Map] No positions found, using default center');
        const center = window.Cesium.Cartesian3.fromDegrees(119.5, -23.5, 5000);
        cesiumViewer.camera.flyTo({
          destination: center,
          orientation: {
            heading: window.Cesium.Math.toRadians(0),
            pitch: window.Cesium.Math.toRadians(-60),
            roll: 0.0
          },
          duration: 2.0
        });
        return;
      }
      
      console.log('[Consolidated Map] Found positions:', positions.length);
      
      const boundingSphere = window.Cesium.BoundingSphere.fromPoints(positions);
      if (!window.Cesium.defined(boundingSphere)) {
        const center = window.Cesium.Cartesian3.fromDegrees(119.5, -23.5, 8000);
        cesiumViewer.camera.flyTo({
          destination: center,
          orientation: {
            heading: window.Cesium.Math.toRadians(0),
            pitch: window.Cesium.Math.toRadians(-45),
            roll: 0.0
          },
          duration: 2.0
        });
        return;
      }
      
      setTimeout(() => {
        console.log('[Consolidated Map] Flying to bounding sphere:', {
          center: window.Cesium.Cartographic.fromCartesian(boundingSphere.center),
          radius: boundingSphere.radius
        });
        cesiumViewer.camera.flyToBoundingSphere(boundingSphere, {
          offset: new window.Cesium.HeadingPitchRange(
            window.Cesium.Math.toRadians(0),
            window.Cesium.Math.toRadians(-60),
            boundingSphere.radius * 1.5
          ),
          duration: 2.0
        });
      }, 1000);
    } catch (error) {
      console.error('[Consolidated Map] Error centering camera:', error);
      const center = window.Cesium.Cartesian3.fromDegrees(119.5, -23.5, 8000);
      cesiumViewer.camera.flyTo({
        destination: center,
        orientation: {
          heading: window.Cesium.Math.toRadians(0),
          pitch: window.Cesium.Math.toRadians(-45),
          roll: 0.0
        },
        duration: 2.0
      });
    }
  };

  const getCategoryCounts = () => {
    const counts = {};
    
    if (consolidatedData?.consolidated_locations) {
        consolidatedData.consolidated_locations.forEach(location => {
          let category = location.category || 'default';
          if (typeof category === 'string') {
          const normalized = category.toLowerCase().trim();
          if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
            category = 'pit';
          }
          } else {
            category = String(category || 'default');
          }
          const consolidated = getConsolidatedCategory(category);
        counts[consolidated] = (counts[consolidated] || 0) + 1;
      });
    }
    
    return counts;
  };

  const toggleCategory = (consolidatedCategory, enabled) => {
    const newSet = new Set(visibleCategories);
    
    const categoriesToToggle = [];
    
    if (consolidatedData?.consolidated_locations) {
      consolidatedData.consolidated_locations.forEach(location => {
        let category = location.category || 'default';
        if (typeof category === 'string') {
          const normalized = category.toLowerCase().trim();
          if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
            category = 'pit';
          }
        } else {
          category = String(category || 'default');
        }
        
        const consolidated = getConsolidatedCategory(category);
        if (consolidated === consolidatedCategory && !categoriesToToggle.includes(category)) {
          categoriesToToggle.push(category);
        }
      });
    }
    
    if (consolidatedCategory === 'intersection') {
      if (!categoriesToToggle.includes('intersection')) {
        categoriesToToggle.push('intersection');
      }
    }
    
    categoriesToToggle.forEach(cat => {
      if (enabled) {
        newSet.add(cat);
      } else {
        newSet.delete(cat);
      }
    });
    
    setVisibleCategories(newSet);
    console.log(`[Consolidated Map] Toggled ${consolidatedCategory} to ${enabled}, new visibleCategories:`, Array.from(newSet));
    
    if (cesiumViewerRef.current) {
      let toggledCount = 0;
      console.log(`[Consolidated Map] Toggling ${consolidatedCategory}, total entities: ${entitiesRef.current.length}`);
      
      entitiesRef.current.forEach((entity, entityIndex) => {
        if (entity && entity.properties) {
          let entityCategory = entity.properties.category;
          
          if (consolidatedCategory === 'intersection') {
            if (entityCategory === 'intersection') {
              entity.show = enabled;
              toggledCount++;
              if (entityIndex < 3) {
                console.log(`[Consolidated Map] Toggling intersection entity ${entityIndex}: ${entity.properties.name || 'unnamed'}, show=${enabled}`);
              }
            }
            return;
          }
          
          if (entityCategory) {
            if (typeof entityCategory === 'string') {
              const normalized = entityCategory.toLowerCase().trim();
              if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
                entityCategory = 'pit';
              }
            } else {
              entityCategory = String(entityCategory || 'default');
            }
            
            const entityConsolidated = getConsolidatedCategory(entityCategory);
            if (entityConsolidated === consolidatedCategory) {
              entity.show = enabled;
              toggledCount++;
            }
          }
        }
      });
      
      console.log(`[Consolidated Map] Toggled ${toggledCount} entities for ${consolidatedCategory} (enabled=${enabled})`);
      
      if (cesiumViewerRef.current.scene) {
        cesiumViewerRef.current.scene.requestRender();
      }
    }
  };

  const toggleViewMode = () => {
    if (!cesiumViewerRef.current) return;
    
    const newMode = viewMode === '2D' ? '3D' : '2D';
    setViewMode(newMode);
    
    if (newMode === '2D') {
      cesiumViewerRef.current.scene.mode = window.Cesium.SceneMode.SCENE2D;
      cesiumViewerRef.current.scene.morphTo2D(0);
      console.log('[Consolidated Map] 🗺️ Switched to 2D view');
    } else {
      cesiumViewerRef.current.scene.mode = window.Cesium.SceneMode.SCENE3D;
      cesiumViewerRef.current.scene.morphTo3D(0);
      console.log('[Consolidated Map] 🌍 Switched to 3D view');
    }
    
    setTimeout(() => {
      if (cesiumViewerRef.current) {
        cesiumViewerRef.current.scene.requestRender();
      }
    }, 100);
    setTimeout(() => {
      if (cesiumViewerRef.current) {
        cesiumViewerRef.current.scene.requestRender();
      }
    }, 500);
  };

  const changeBaseLayer = (newLayer) => {
    if (!cesiumViewerRef.current) return;
    
    setBaseLayer(newLayer);
    
    const getImageryProvider = (layerType) => {
      switch (layerType) {
        case 'night':
          return new window.Cesium.UrlTemplateImageryProvider({
            url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            credit: '© OpenStreetMap contributors, © CARTO'
          });
        case 'day':
          return new window.Cesium.UrlTemplateImageryProvider({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            credit: '© Esri'
          });
        case 'topographic':
          return new window.Cesium.UrlTemplateImageryProvider({
            url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            credit: '© OpenTopoMap contributors',
            subdomains: ['a', 'b', 'c']
          });
        case 'terrain':
          return new window.Cesium.UrlTemplateImageryProvider({
            url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png',
            credit: '© Stadia Maps © Stamen Design © OpenMapTiles © OpenStreetMap contributors'
          });
        default:
          return new window.Cesium.UrlTemplateImageryProvider({
            url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            credit: '© OpenStreetMap contributors, © CARTO'
          });
      }
    };
    
    const newProvider = getImageryProvider(newLayer);
    cesiumViewerRef.current.imageryLayers.removeAll();
    cesiumViewerRef.current.imageryLayers.addImageryProvider(newProvider);
    cesiumViewerRef.current.scene.requestRender();
    
    console.log(`[Consolidated Map] 🗺️ Changed base layer to: ${newLayer}`);
  };

  const toggleSection = (contentId, arrowId) => {
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    if (content && arrow) {
      const isVisible = content.style.display !== 'none';
      content.style.display = isVisible ? 'none' : 'block';
      arrow.style.transform = isVisible ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
  };

  const toggleLegend = () => {
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

  if (!isClient) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        margin: 0,
        padding: 0
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
            Loading 3D Map...
          </div>
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        flexDirection: 'column',
        margin: 0,
        padding: 0
      }}>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '24px', fontWeight: '600', marginBottom: '12px', color: '#dc2626' }}>
            Map Loading Error
          </div>
          <div style={{ color: '#6b7280', marginBottom: '16px' }}>
            {mapError}
          </div>
          <button
            onClick={() => {
              setMapError(null);
              setMapLoaded(false);
              setTimeout(() => {
                loadMap();
              }, 100);
            }}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <div
        ref={mapContainer}
        style={{ 
          width: '100%', 
          height: '100%',
          margin: 0,
          padding: 0
        }}
      />
      {mapLoaded && (
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
              <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>Map Elements</span>
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
            <div style={{
              padding: '12px', 
              borderBottom: '1px solid rgba(120, 120, 120, 0.3)',
              backgroundColor: 'rgba(52, 152, 219, 0.1)'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '6px', 
                fontSize: '11px', 
                color: '#bdc3c7',
                fontWeight: '600'
              }}>
                🗺️ BASE LAYER
              </label>
              <select
                value={baseLayer}
                onChange={(e) => changeBaseLayer(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: 'rgba(40, 40, 40, 0.9)',
                  color: 'white',
                  border: '1px solid rgba(120, 120, 120, 0.4)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="night">🌙 Night Mode (Dark)</option>
                <option value="day">☀️ Day Mode (Satellite)</option>
                <option value="topographic">🗺️ Topographic</option>
                <option value="terrain">🏔️ Terrain (Colorful)</option>
              </select>
              
              <div style={{ marginTop: '10px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '6px', 
                  fontSize: '11px', 
                  color: '#bdc3c7',
                  fontWeight: '600'
                }}>
                  📐 VIEW MODE
                </label>
                <button
                  onClick={toggleViewMode}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: viewMode === '2D' ? 'rgba(46, 204, 113, 0.3)' : 'rgba(52, 152, 219, 0.3)',
                    color: 'white',
                    border: `2px solid ${viewMode === '2D' ? '#2ecc71' : '#3498db'}`,
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {viewMode === '2D' ? '🗺️ 2D Map View' : '🌍 3D Globe View'}
                </button>
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
                  </div>
                  <span style={{ color: '#e74c3c', fontWeight: '600', fontSize: '13px' }}>Location Categories</span>
                  <div style={{
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    borderRadius: '10px',
                    padding: '2px 8px',
                    marginLeft: '8px',
                    fontSize: '10px'
                  }}>
                    {Object.keys(getCategoryCounts()).length}
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
                {Object.entries(getCategoryCounts())
                  .filter(([consolidatedCategory]) => consolidatedCategory !== 'intersection')
                  .sort((a, b) => b[1] - a[1])
                  .map(([consolidatedCategory, count]) => {
                    let isVisible = false;
                    
                    if (consolidatedData?.consolidated_locations) {
                      isVisible = consolidatedData.consolidated_locations.some(location => {
                        let category = location.category || 'default';
                        if (typeof category === 'string') {
                          const normalized = category.toLowerCase().trim();
                          if (normalized === 'pot' || (normalized.includes('pit') && !normalized.includes('parking'))) {
                            category = 'pit';
                          }
                        } else {
                          category = String(category || 'default');
                        }
                        const consolidated = getConsolidatedCategory(category);
                        return consolidated === consolidatedCategory && visibleCategories.has(category);
                      });
                    }
                    
                    return (
                      <div key={consolidatedCategory} style={{ marginBottom: '6px' }}>
                        <label style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          cursor: 'pointer',
                          color: '#bdc3c7',
                          fontSize: '12px'
                        }}>
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={(e) => toggleCategory(consolidatedCategory, e.target.checked)}
                            style={{ 
                              marginRight: '8px',
                              accentColor: getCategoryColor(consolidatedCategory)
                            }}
                          />
                          <div style={{
                            width: '8px',
                            height: '8px',
                            backgroundColor: getCategoryColor(consolidatedCategory),
                            marginRight: '10px',
                            borderRadius: '50%'
                          }}></div>
                          <span style={{ color: 'white', fontWeight: '500' }}>
                            {getCategoryDisplayName(consolidatedCategory)} ({count})
                          </span>
                        </label>
                      </div>
                    );
                  })}
              </div>
            </div>
            
            {intersectionsData?.consolidated_intersections && intersectionsData.consolidated_intersections.length > 0 && (
              <div style={{ borderLeft: '3px solid #9B59B6', margin: '8px 0' }}>
                <div 
                  id="road-networks-header"
                  style={{
                    backgroundColor: 'rgba(155, 89, 182, 0.1)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onClick={() => toggleSection('road-networks-content', 'road-networks-arrow')}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: '#9B59B6',
                      borderRadius: '3px',
                      marginRight: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                    </div>
                    <span style={{ color: '#FF0000', fontWeight: '600', fontSize: '13px' }}>Road Networks</span>
                    <div style={{
                      backgroundColor: '#FF0000',
                      color: 'white',
                      borderRadius: '10px',
                      padding: '2px 8px',
                      marginLeft: '8px',
                      fontSize: '10px'
                    }}>
                      {intersectionsData.consolidated_intersections.length}
                    </div>
                  </div>
                  <div 
                    id="road-networks-arrow"
                    style={{ color: '#9B59B6', fontSize: '14px' }}
                  >
                    ▼
                  </div>
                </div>
                <div 
                  id="road-networks-content"
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
                   checked={visibleCategories.size === 0 || visibleCategories.has('intersection')}
                   onChange={(e) => toggleCategory('intersection', e.target.checked)}
                   style={{
                     marginRight: '8px',
                     cursor: 'pointer'
                   }}
                 />
                      <div style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: '#FF0000',
                        borderRadius: '2px',
                        marginRight: '8px'
                      }}></div>
                      <span>Intersections ({intersectionsData.consolidated_intersections.length})</span>
                    </label>
                  </div>
                  
                  {surveyPointsData && (
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
                          checked={showSurveyPolylines}
                          onChange={(e) => {
                            setShowSurveyPolylines(e.target.checked);
                            entitiesRef.current.forEach(entity => {
                              if (entity.properties && entity.properties.category === 'survey_point') {
                                entity.show = e.target.checked;
                              }
                            });
                            if (cesiumViewerRef.current?.scene) {
                              cesiumViewerRef.current.scene.requestRender();
                            }
                          }}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer'
                          }}
                        />
                        <div style={{
                          width: '12px',
                          height: '2px',
                          backgroundColor: '#808080',
                          marginRight: '8px'
                        }}></div>
                        <span>Survey Roads ({surveyPointsData.total_points} pts)</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
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
      `}</style>
    </div>
  );
};

export default ConsolidatedPolygonMap;