import React, { useState, useEffect, useRef } from 'react';

const ConsolidatedPolygonMap = () => {
  const mapContainer = useRef(null);
  const cesiumViewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const currentTooltip = useRef(null);
  const currentPopup = useRef(null);
  const hoveredEntityRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [consolidatedData, setConsolidatedData] = useState(null);
  const [intersectionsData, setIntersectionsData] = useState(null);
  const [surveyPathsData, setSurveyPathsData] = useState(null);
  const [coursesData, setCoursesData] = useState(null);
  const [travelsData, setTravelsData] = useState(null);
  const [roadMarkingsData, setRoadMarkingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleCategories, setVisibleCategories] = useState(new Set());
  const [showSurveyPaths, setShowSurveyPaths] = useState(true);
  const [showCourses, setShowCourses] = useState(true);
  const [showTravels, setShowTravels] = useState(true);
  const [baseLayer, setBaseLayer] = useState('night');
  const [viewMode, setViewMode] = useState('3D');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState(null);
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
    if (mapLoaded && surveyPathsData && cesiumViewerRef.current) {
      console.log('[Consolidated Map] 🛤️ useEffect triggered - Adding survey paths to map...');
      console.log('[Consolidated Map] 🛤️ mapLoaded:', mapLoaded);
      console.log('[Consolidated Map] 🛤️ surveyPathsData:', surveyPathsData);
      console.log('[Consolidated Map] 🛤️ cesiumViewerRef.current:', !!cesiumViewerRef.current);
      addSurveyPathsToCesium(cesiumViewerRef.current);
    } else {
      console.log('[Consolidated Map] ⏳ Waiting for survey paths conditions:', {
        mapLoaded,
        hasSurveyPathsData: !!surveyPathsData,
        hasViewer: !!cesiumViewerRef.current
      });
    }
  }, [surveyPathsData, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && coursesData && cesiumViewerRef.current) {
      console.log('[Consolidated Map] 🛤️ useEffect triggered - Adding courses to map...');
      console.log('[Consolidated Map] 🛤️ mapLoaded:', mapLoaded);
      console.log('[Consolidated Map] 🛤️ coursesData:', coursesData);
      console.log('[Consolidated Map] 🛤️ cesiumViewerRef.current:', !!cesiumViewerRef.current);
      addCoursesToCesium(cesiumViewerRef.current);
    } else {
      console.log('[Consolidated Map] ⏳ Waiting for courses conditions:', {
        mapLoaded,
        hasCoursesData: !!coursesData,
        hasViewer: !!cesiumViewerRef.current
      });
    }
  }, [coursesData, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && travelsData && cesiumViewerRef.current) {
      console.log('[Consolidated Map] 🚗 useEffect triggered - Adding travels to map...');
      console.log('[Consolidated Map] 🚗 mapLoaded:', mapLoaded);
      console.log('[Consolidated Map] 🚗 travelsData:', travelsData);
      console.log('[Consolidated Map] 🚗 cesiumViewerRef.current:', !!cesiumViewerRef.current);
      addTravelsToCesium(cesiumViewerRef.current);
    } else {
      console.log('[Consolidated Map] ⏳ Waiting for travels conditions:', {
        mapLoaded,
        hasTravelsData: !!travelsData,
        hasViewer: !!cesiumViewerRef.current
      });
    }
  }, [travelsData, mapLoaded]);

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
      console.log('[Consolidated Map] 🔄 Updating entity visibility');
      console.log('[Consolidated Map] 📊 visibleCategories:', Array.from(visibleCategories));
      console.log('[Consolidated Map] 🛤️ showCourses:', showCourses);
      console.log('[Consolidated Map] 🛤️ showSurveyPaths:', showSurveyPaths);
      let intersectionCount = 0;
      let visibleIntersectionCount = 0;
      let locationCount = 0;
      let visibleLocationCount = 0;
      let courseCount = 0;
      let visibleCourseCount = 0;
      let surveyPathCount = 0;
      let visibleSurveyPathCount = 0;
      
      entitiesRef.current.forEach((entity, entityIndex) => {
        if (entity && entity.properties) {
          // Cesium properties might need getValue()
          let category = entity.properties.category?.getValue ? entity.properties.category.getValue() : entity.properties.category;
          
          // Debug first 5 and last 5 entities to see courses
          if (entityIndex < 5 || entityIndex >= entitiesRef.current.length - 5) {
            console.log(`[Consolidated Map] Entity ${entityIndex}: category=${category}, hasProperties=${!!entity.properties}, needsGetValue=${!!entity.properties.category?.getValue}`);
          }
          
          if (category === 'intersection') {
            intersectionCount++;
            const isVisible = visibleCategories.size === 0 || visibleCategories.has('intersection');
            entity.show = isVisible;
            if (isVisible) visibleIntersectionCount++;
            return;
          }
          
          if (category === 'survey_path') {
            surveyPathCount++;
            entity.show = showSurveyPaths;
            if (showSurveyPaths) visibleSurveyPathCount++;
            return;
          }
          
          if (category === 'course') {
            courseCount++;
            entity.show = showCourses;
            if (showCourses) visibleCourseCount++;
            if (entityIndex >= entitiesRef.current.length - 5) {
              console.log(`[Consolidated Map] 🛤️ Course entity ${entityIndex}: show=${entity.show}, showCourses=${showCourses}`);
            }
            return;
          }
          
          if (category === 'travel') {
            // Travels are handled separately below, but count here for consistency
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
      
      // Update travel visibility
      let travelCount = 0;
      let visibleTravelCount = 0;
      cesiumViewerRef.current.entities.values.forEach(entity => {
        const category = entity.properties?.category?.getValue?.() || entity.properties?.category;
        if (category === 'travel') {
          travelCount++;
          entity.show = showTravels; // Travels have their own toggle
          if (showTravels) visibleTravelCount++;
        }
      });
      
      console.log(`[Consolidated Map] 📊 Visibility: ${visibleIntersectionCount}/${intersectionCount} intersections, ${visibleLocationCount}/${locationCount} locations, ${visibleCourseCount}/${courseCount} courses, ${visibleTravelCount}/${travelCount} travels, ${visibleSurveyPathCount}/${surveyPathCount} survey paths visible`);
      
      if (cesiumViewerRef.current.scene) {
        cesiumViewerRef.current.scene.requestRender();
      }
    }
  }, [visibleCategories, showCourses, showTravels, showSurveyPaths]);

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
      
      const surveyPathsResponse = await fetch('/api/survey-paths');
      console.log('🛤️ Survey paths API response status:', surveyPathsResponse.status);
      if (surveyPathsResponse.ok) {
        const surveyPathsResult = await surveyPathsResponse.json();
        console.log(`🛤️ Loaded ${surveyPathsResult.total_paths} survey paths`);
        if (surveyPathsResult.paths && surveyPathsResult.paths.length > 0) {
          console.log('🛤️ Sample survey path:', surveyPathsResult.paths[0]);
        }
        setSurveyPathsData(surveyPathsResult);
      } else {
        const errorText = await surveyPathsResponse.text();
        console.error('❌ Could not fetch survey paths:', surveyPathsResponse.status, errorText);
      }
      
      const coursesResponse = await fetch('/api/courses');
      console.log('🛤️ Courses API response status:', coursesResponse.status);
      if (coursesResponse.ok) {
        const coursesResult = await coursesResponse.json();
        console.log(`🛤️ Loaded ${coursesResult.total_courses} courses`);
        if (coursesResult.courses && coursesResult.courses.length > 0) {
          console.log('🛤️ Sample course:', coursesResult.courses[0]);
        }
        setCoursesData(coursesResult);
      } else {
        const errorText = await coursesResponse.text();
        console.error('❌ Could not fetch courses:', coursesResponse.status, errorText);
      }
      
      // Fetch travels (filtered courses based on travel from/to locations)
      const travelsResponse = await fetch('/api/travels');
      console.log('🚗 Travels API response status:', travelsResponse.status);
      if (travelsResponse.ok) {
        const travelsResult = await travelsResponse.json();
        console.log(`🚗 Loaded ${travelsResult.total_travels} travels`);
        if (travelsResult.travels && travelsResult.travels.length > 0) {
          console.log('🚗 Sample travel:', travelsResult.travels[0]);
        }
        setTravelsData(travelsResult);
      } else {
        const errorText = await travelsResponse.text();
        console.error('❌ Could not fetch travels:', travelsResponse.status, errorText);
      }
      
      // Fetch geospatially-clipped road markings (excludes intersection zones)
      const roadMarkingsResponse = await fetch('/api/road-markings');
      console.log('🎨 Road markings API response status:', roadMarkingsResponse.status);
      if (roadMarkingsResponse.ok) {
        const roadMarkingsResult = await roadMarkingsResponse.json();
        console.log(`🎨 Loaded ${roadMarkingsResult.total_markings} clipped road markings`);
        setRoadMarkingsData(roadMarkingsResult);
      } else {
        const errorText = await roadMarkingsResponse.text();
        console.error('❌ Could not fetch road markings:', roadMarkingsResponse.status, errorText);
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
      setupTooltips();
      
      const setupTooltipHandlers = () => {
        if (!cesiumViewer || !cesiumViewer.scene || !cesiumViewer.cesiumWidget) {
          setTimeout(setupTooltipHandlers, 100);
          return;
        }
        
        const tooltipHandler = cesiumViewer.cesiumWidget.screenSpaceEventHandler;
        
        // Add click handler for all entities
        tooltipHandler.setInputAction((movement) => {
          if (!cesiumViewer || !cesiumViewer.scene) return;
          const pickedObject = cesiumViewer.scene.pick(movement.position);
          
          if (window.Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
            const entity = pickedObject.id;
            
            // Extract ALL properties from the entity - iterate through EVERY property
            const allProperties = {};
            if (entity.properties) {
              // Method 1: Try to get propertyNames if available
              try {
                const propertyNames = entity.properties.propertyNames;
                if (propertyNames && propertyNames.length > 0) {
                  propertyNames.forEach(propName => {
                    try {
                      const prop = entity.properties[propName];
                      if (prop !== undefined && prop !== null) {
                        if (prop && typeof prop.getValue === 'function') {
                          allProperties[propName] = prop.getValue();
                        } else {
                          allProperties[propName] = prop;
                        }
                      }
                    } catch (e) {
                      console.warn(`[Consolidated Map] Failed to get property ${propName}:`, e);
                    }
                  });
                }
              } catch (e) {
                console.warn('[Consolidated Map] propertyNames not available, using direct iteration');
              }
              
              // Method 2: Use propertyNames array (Cesium's official way to get all property names)
              try {
                if (entity.properties && entity.properties.propertyNames) {
                  const propertyNames = entity.properties.propertyNames;
                  for (let i = 0; i < propertyNames.length; i++) {
                    const propName = propertyNames[i];
                    
                    // Skip if already added
                    if (allProperties.hasOwnProperty(propName)) {
                      continue;
                    }
                    
                    try {
                      const prop = entity.properties[propName];
                      // Skip functions - only get actual data values
                      if (prop !== undefined && prop !== null && typeof prop !== 'function') {
                        if (prop && typeof prop.getValue === 'function') {
                          try {
                            const value = prop.getValue();
                            // Only store if it's not a function
                            if (typeof value !== 'function') {
                              allProperties[propName] = value;
                            }
                          } catch (e) {
                            // If getValue fails, skip
                          }
                        } else {
                          // Direct value, not a function
                          allProperties[propName] = prop;
                        }
                      }
                    } catch (e) {
                      // Skip errors silently
                    }
                  }
                }
              } catch (e) {
                console.warn('[Consolidated Map] Failed to iterate propertyNames:', e);
              }
              
              // Method 3: Also try known property names as fallback
              const knownProperties = [
                'name', 'category', 'course_name', 'path_oid', 'location_name', 'intersection_name',
                'road_type', 'haul_profile_name', 'cid', 'is_valid', 'is_changeable', 'is_external',
                'total_points', 'course_length_m', 'path_length_m', 'length_m', 'width_m',
                'start_latitude', 'start_longitude', 'end_latitude', 'end_longitude',
                'inflections', 'is_spline', 'all_coordinate_oids', 'created_at',
                'area_sqm', 'center_latitude', 'center_longitude',
                'intersection_type', 'all_coordinate_ids',
                'course_id', 'path_id', 'course_oid_original', 'course_attributes_value',
                'course_attributes_oid', 'coursegeometry_oid', 'inclination_factor',
                'start_direction', 'assigned_watering_path', 'required_gnss_base_id',
                'version_ver', 'version_ver2', 'replica_version', 'replica_age',
                'path_oid_original', 'shapepath_oid', 'shapepath_is_path',
                'color', 'intersection_name', 'total_points', 'avg_altitude'
              ];
              
              knownProperties.forEach(propName => {
                if (!allProperties.hasOwnProperty(propName)) {
                  try {
                    const prop = entity.properties[propName];
                    // Only get non-function values
                    if (prop !== undefined && prop !== null && typeof prop !== 'function') {
                      if (prop && typeof prop.getValue === 'function') {
                        try {
                          const value = prop.getValue();
                          if (typeof value !== 'function') {
                            allProperties[propName] = value;
                          }
                        } catch (e) {
                          // Skip
                        }
                      } else {
                        allProperties[propName] = prop;
                      }
                    }
                  } catch (e) {
                    // Skip
                  }
                }
              });
            }
            
            // Also get entity name if available
            if (entity.name && !allProperties.name) {
              allProperties.name = entity.name;
            }
            
            console.log(`[Consolidated Map] Extracted ${Object.keys(allProperties).length} properties:`, Object.keys(allProperties));
            
            // Get category
            const category = allProperties.category || entity.properties?.category?.getValue?.() || entity.properties?.category;
            
            // FIRST: Clear all previous highlights - restore all entities to original colors
            if (cesiumViewerRef.current && cesiumViewerRef.current.entities) {
              cesiumViewerRef.current.entities.values.forEach(prevEntity => {
                if (prevEntity._originalMaterial) {
                  if (prevEntity.corridor) {
                    prevEntity.corridor.material = prevEntity._originalMaterial;
                    prevEntity.corridor.outline = false;
                  } else if (prevEntity.polygon) {
                    prevEntity.polygon.material = prevEntity._originalMaterial;
                    prevEntity.polygon.outline = false;
                  }
                }
              });
            }
            
            // NOW: Highlight ONLY the clicked entity - make it very visible
            if (entity.corridor) {
              // Store original material for restoration
              if (!entity._originalMaterial) {
                entity._originalMaterial = entity.corridor.material;
              }
              entity.corridor.material = window.Cesium.Color.CYAN.withAlpha(1.0);
              entity.corridor.outline = true;
              entity.corridor.outlineColor = window.Cesium.Color.YELLOW;
              entity.corridor.outlineWidth = 3;
            } else if (entity.polygon) {
              // Store original material for restoration
              if (!entity._originalMaterial) {
                entity._originalMaterial = entity.polygon.material;
              }
              entity.polygon.material = window.Cesium.Color.CYAN.withAlpha(0.9);
              entity.polygon.outline = true;
              entity.polygon.outlineColor = window.Cesium.Color.YELLOW;
              entity.polygon.outlineWidth = 3;
            }
            
            // Show dialog with ALL information
            setDialogData({
              category: category,
              name: allProperties.name || allProperties.course_name || allProperties.location_name || allProperties.intersection_name || 'Unknown',
              allProperties: allProperties
            });
            setDialogOpen(true);
            
            console.log(`[Consolidated Map] Clicked entity:`, allProperties);
          } else {
            // Clicked on empty space - close dialog and reset highlights
            setDialogOpen(false);
            setDialogData(null);
            
            if (currentPopup.current) {
              currentPopup.current.remove();
              currentPopup.current = null;
            }
            
            // Reset all entity colors
            entitiesRef.current.forEach(entity => {
              if (entity.corridor && entity.properties) {
                const category = entity.properties.category?.getValue ? entity.properties.category.getValue() : entity.properties.category;
                if (category === 'course' || category === 'survey_path') {
                  // Restore original material if stored, otherwise use default
                  if (entity._originalMaterial) {
                    entity.corridor.material = entity._originalMaterial;
                    delete entity._originalMaterial;
                  } else {
                    const roadColor = window.Cesium.Color.fromCssColorString('#2C2C2C');
                    entity.corridor.material = new window.Cesium.ColorMaterialProperty(roadColor.withAlpha(0.98));
                  }
                  entity.corridor.outline = false;
                }
              } else if (entity.polygon && entity.properties) {
                const category = entity.properties.category?.getValue ? entity.properties.category.getValue() : entity.properties.category;
                // Restore original material if stored, otherwise use default
                if (entity._originalMaterial) {
                  entity.polygon.material = entity._originalMaterial;
                  delete entity._originalMaterial;
                } else {
                  const originalColor = entity.properties.color?.getValue ? entity.properties.color.getValue() : entity.properties.color || '#FF0000';
                  if (category === 'intersection') {
                    entity.polygon.material = window.Cesium.Color.RED.withAlpha(0.6);
                  } else {
                    const cesiumColor = window.Cesium.Color.fromCssColorString(originalColor);
                    entity.polygon.material = cesiumColor.withAlpha(0.8);
                  }
                }
                entity.polygon.outline = true; // Keep outline but reset color
                if (category === 'intersection') {
                  entity.polygon.outlineColor = window.Cesium.Color.RED;
                } else {
                  entity.polygon.outlineColor = window.Cesium.Color.YELLOW;
                }
                entity.polygon.outlineWidth = 2;
              }
            });
          }
        }, window.Cesium.ScreenSpaceEventType.LEFT_CLICK);
        
        // Mouse move handler for tooltips
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

  const addSurveyPathsToCesium = (cesiumViewer) => {
    if (!surveyPathsData?.paths) {
      console.warn('[Consolidated Map] No survey paths data available');
      return;
    }
    
    console.log(`[Consolidated Map] 🛤️ Adding ${surveyPathsData.paths.length} survey paths to Cesium`);
    
    let addedCount = 0;
    let errorCount = 0;
    
    surveyPathsData.paths.forEach((path, index) => {
      try {
        let geometry = path.linestring;
        if (!geometry) {
          console.warn(`[Consolidated Map] No linestring for survey path ${index}: ${path.path_oid}`);
          errorCount++;
          return;
        }
        
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            console.warn(`[Consolidated Map] Failed to parse linestring for survey path ${index}:`, e);
            errorCount++;
            return;
          }
        }
        
        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          console.warn(`[Consolidated Map] Invalid geometry for survey path ${index}:`, geometry);
          errorCount++;
          return;
        }
        
        const positions = [];
        if (geometry.type === 'LineString' && geometry.coordinates) {
          geometry.coordinates.forEach(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2 && !isNaN(coord[0]) && !isNaN(coord[1])) {
              const lon = parseFloat(coord[0]);
              const lat = parseFloat(coord[1]);
              if (!isNaN(lon) && !isNaN(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
                positions.push(window.Cesium.Cartesian3.fromDegrees(lon, lat, 2));
              }
            }
          });
        }
        
        if (positions.length < 2) {
          console.warn(`[Consolidated Map] Not enough valid positions for survey path ${index}: ${path.path_oid}`);
          errorCount++;
          return;
        }
        
        // ULTRA HD survey path - 3 METERS WIDE - MAXIMUM QUALITY
        const surveyWidthMeters = 3.0; // Fixed 3 meter width
        const surveyAsphalt = window.Cesium.Color.fromCssColorString('#2C2C2C'); // Dark asphalt
        
        // ULTRA HD asphalt road surface - MAXIMUM DETAIL
        const surveySurface = cesiumViewer.entities.add({
          corridor: {
            positions: positions,
            width: surveyWidthMeters,
            material: new window.Cesium.ColorMaterialProperty(surveyAsphalt.withAlpha(1.0)),
            height: -0.05, // Negative height to ensure roads are always below location polygons
            extrudedHeight: 0.25, // Reduced to keep roads below locations
            cornerType: window.Cesium.CornerType.ROUNDED,
            granularity: 0.000001 // ULTRA HD - 10x more detail than before
          },
          name: `Survey Path ${path.path_oid}`,
          properties: {
            name: `Survey Path ${path.path_oid}`,
            category: 'survey_path',
            path_id: path.path_id,
            path_oid: path.path_oid,
            cid: path.cid,
            is_valid: path.is_valid,
            is_changeable: path.is_changeable,
            is_external: path.is_external,
            total_points: path.total_points,
            path_length_m: path.path_length_m,
            length_m: path.path_length_m,
            start_latitude: path.start_latitude,
            start_longitude: path.start_longitude,
            end_latitude: path.end_latitude,
            end_longitude: path.end_longitude,
            all_coordinate_oids: path.all_coordinate_oids,
            created_at: path.created_at,
            width_m: surveyWidthMeters,
            color: surveyAsphalt.toCssColorString()
          },
          show: showSurveyPaths
        });
        entitiesRef.current.push(surveySurface);
        
        // Lane markings will be added separately from clipped geometries
        // (Skip adding center line here - will be added from roadMarkingsData)
        
        // Edge lines will be added separately frommed near intersections
        const surveyOffsetDistance = surveyWidthMeters / 2 - 0.2;
        const surveyTrimmedEdge = trimPositionsNearIntersections(positions);
        const surveyLeftEdge = [];
        const surveyRightEdge = [];
        
        for (let i = 0; i < surveyTrimmedEdge.length - 1; i++) {
          const p1 = surveyTrimmedEdge[i];
          const p2 = surveyTrimmedEdge[i + 1];
          
          const cart1 = window.Cesium.Cartographic.fromCartesian(p1);
          const cart2 = window.Cesium.Cartographic.fromCartesian(p2);
          
          const bearing = window.Cesium.Math.toDegrees(
            Math.atan2(cart2.longitude - cart1.longitude, cart2.latitude - cart1.latitude)
          );
          
          const leftBearing = (bearing + 90) % 360;
          const rightBearing = (bearing - 90) % 360;
          const offsetDegrees = surveyOffsetDistance / 111000;
          
          surveyLeftEdge.push(
            window.Cesium.Cartesian3.fromDegrees(
              window.Cesium.Math.toDegrees(cart1.longitude) + offsetDegrees * Math.sin(window.Cesium.Math.toRadians(leftBearing)),
              window.Cesium.Math.toDegrees(cart1.latitude) + offsetDegrees * Math.cos(window.Cesium.Math.toRadians(leftBearing)),
              0.15
            )
          );
          
          surveyRightEdge.push(
            window.Cesium.Cartesian3.fromDegrees(
              window.Cesium.Math.toDegrees(cart1.longitude) + offsetDegrees * Math.sin(window.Cesium.Math.toRadians(rightBearing)),
              window.Cesium.Math.toDegrees(cart1.latitude) + offsetDegrees * Math.cos(window.Cesium.Math.toRadians(rightBearing)),
              0.15
            )
          );
        }
        
        if (surveyTrimmedEdge.length > 0) {
          surveyLeftEdge.push(surveyTrimmedEdge[surveyTrimmedEdge.length - 1]);
          surveyRightEdge.push(surveyTrimmedEdge[surveyTrimmedEdge.length - 1]);
        }
        
        // HD white edge lines with glow for survey paths
        if (surveyLeftEdge.length > 1) {
          const leftEdge = cesiumViewer.entities.add({
            polyline: {
              positions: surveyLeftEdge,
              width: 3,
              material: new window.Cesium.PolylineOutlineMaterialProperty({
                color: window.Cesium.Color.WHITE.withAlpha(1.0),
                outlineWidth: 1,
                outlineColor: window.Cesium.Color.WHITE.withAlpha(0.3)
              }),
              clampToGround: false,
              zIndex: 3
            },
            properties: {
              category: 'survey_path',
              isRoadMarking: true
            },
            show: showSurveyPaths
          });
          entitiesRef.current.push(leftEdge);
        }
        
        if (surveyRightEdge.length > 1) {
          const rightEdge = cesiumViewer.entities.add({
            polyline: {
              positions: surveyRightEdge,
              width: 3,
              material: new window.Cesium.PolylineOutlineMaterialProperty({
                color: window.Cesium.Color.WHITE.withAlpha(1.0),
                outlineWidth: 1,
                outlineColor: window.Cesium.Color.WHITE.withAlpha(0.3)
              }),
              clampToGround: false,
              zIndex: 3
            },
            properties: {
              category: 'survey_path',
              isRoadMarking: true
            },
            show: showSurveyPaths
          });
          entitiesRef.current.push(rightEdge);
        }
        
        addedCount++;
        
        if (index < 5) {
          console.log(`[Consolidated Map] ✅ Added survey path ${index}: ${path.path_oid}`);
        }
        
      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding survey path ${index}:`, err);
      }
    });
    
    console.log(`[Consolidated Map] ✅ Added ${addedCount} survey paths (${errorCount} errors), total entities now: ${entitiesRef.current.length}`);
    
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
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
            height: 0.3, // Above roads (-0.05 to 0.20) but below locations (0.01 to 3.01+)
            heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
            extrudedHeight: 0.5 // Extends to 0.8m, clearly above roads
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

  // Helper function to trim positions near intersections for cleaner connections
  const trimPositionsNearIntersections = (positions, trimDistanceMeters = 10) => {
    if (positions.length < 3) return positions;
    
    // Trim first and last few points to avoid intersection overlap
    const trimCount = Math.min(2, Math.floor(positions.length * 0.05)); // Trim 5% or 2 points max
    
    return positions.slice(trimCount, positions.length - trimCount);
  };

  const addCoursesToCesium = (cesiumViewer) => {
    if (!coursesData?.courses) {
      console.warn('[Consolidated Map] No courses data available');
      return;
    }
    
    console.log(`[Consolidated Map] 🛤️ Adding ${coursesData.courses.length} courses to Cesium`);
    
    let addedCount = 0;
    let errorCount = 0;
    
    coursesData.courses.forEach((course, index) => {
      try {
        let geometry = course.linestring;
        if (!geometry) {
          console.warn(`[Consolidated Map] No linestring for course ${index}: ${course.course_name}`);
          errorCount++;
          return;
        }
        
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            console.warn(`[Consolidated Map] Failed to parse linestring for course ${index}:`, e);
            errorCount++;
            return;
          }
        }
        
        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          console.warn(`[Consolidated Map] Invalid geometry for course ${index}:`, geometry);
          errorCount++;
          return;
        }
        
        const positions = [];
        if (geometry.type === 'LineString' && geometry.coordinates) {
          geometry.coordinates.forEach(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2 && !isNaN(coord[0]) && !isNaN(coord[1])) {
              const lon = parseFloat(coord[0]);
              const lat = parseFloat(coord[1]);
              if (!isNaN(lon) && !isNaN(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
                positions.push(window.Cesium.Cartesian3.fromDegrees(lon, lat, 2));
              }
            }
          });
        }
        
        if (positions.length < 2) {
          console.warn(`[Consolidated Map] Not enough valid positions for course ${index}: ${course.course_name}`);
          errorCount++;
          return;
        }
        
        // ULTRA HD road with asphalt - ALL ROADS 3 METERS WIDE - MAXIMUM QUALITY
        const roadWidthMeters = 3.0; // Fixed 3 meter width for all roads
        const roadColor = window.Cesium.Color.fromCssColorString('#2C2C2C'); // Dark asphalt
        
        // ULTRA HD asphalt road surface - MAXIMUM DETAIL
        const roadSurface = cesiumViewer.entities.add({
          corridor: {
            positions: positions,
            width: roadWidthMeters,
            material: new window.Cesium.ColorMaterialProperty(roadColor.withAlpha(1.0)),
            height: -0.05, // Negative height to ensure roads are always below location polygons
            extrudedHeight: 0.25, // Reduced to keep roads below locations
            cornerType: window.Cesium.CornerType.ROUNDED,
            granularity: 0.000001 // ULTRA HD - 10x more detail than before
          },
          name: course.course_name || `Course ${course.cid}`,
          properties: {
            name: course.course_name,
            category: 'course',
            course_id: course.course_id,
            cid: course.cid,
            course_name: course.course_name,
            haul_profile_name: course.haul_profile_name,
            road_type: course.road_type,
            inflections: course.inflections,
            is_spline: course.is_spline,
            total_points: course.total_points,
            course_length_m: course.course_length_m,
            length_m: course.course_length_m,
            start_latitude: course.start_latitude,
            start_longitude: course.start_longitude,
            end_latitude: course.end_latitude,
            end_longitude: course.end_longitude,
            all_coordinate_oids: course.all_coordinate_oids,
            created_at: course.created_at,
            width_m: roadWidthMeters,
            color: roadColor.toCssColorString()
          },
          show: showCourses
        });
        entitiesRef.current.push(roadSurface);
        
        // Lane markings will be added separately from clipped geometries
        // (Skip adding center line here - will be added from roadMarkingsData)
        
        // Edge lines will be added separately from clipped geometries
        // (Skip adding edge lines here - will be added from roadMarkingsData)
        
        addedCount++;
        
        if (index < 5) {
          console.log(`[Consolidated Map] ✅ Added course ${index}: ${course.course_name} (${course.road_type})`);
        }
        
      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding course ${index}:`, err);
      }
    });
    
    console.log(`[Consolidated Map] ✅ Added ${addedCount} courses (${errorCount} errors), total entities now: ${entitiesRef.current.length}`);
    
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };

  const addTravelsToCesium = (cesiumViewer) => {
    if (!travelsData?.travels) {
      console.warn('[Consolidated Map] No travels data available');
      return;
    }
    
    console.log(`[Consolidated Map] 🚗 Adding ${travelsData.travels.length} travels to Cesium`);
    
    let addedCount = 0;
    let errorCount = 0;
    
    travelsData.travels.forEach((travel, index) => {
      try {
        let geometry = travel.linestring;
        if (!geometry) {
          console.warn(`[Consolidated Map] No linestring for travel ${index}: ${travel.travel_oid}`);
          errorCount++;
          return;
        }
        
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            console.warn(`[Consolidated Map] Failed to parse linestring for travel ${index}:`, e);
            errorCount++;
            return;
          }
        }
        
        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          console.warn(`[Consolidated Map] Invalid geometry for travel ${index}:`, geometry);
          errorCount++;
          return;
        }
        
        const positions = [];
        if (geometry.type === 'LineString' && geometry.coordinates) {
          geometry.coordinates.forEach(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2 && !isNaN(coord[0]) && !isNaN(coord[1])) {
              const lon = parseFloat(coord[0]);
              const lat = parseFloat(coord[1]);
              if (!isNaN(lon) && !isNaN(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
                positions.push(window.Cesium.Cartesian3.fromDegrees(lon, lat, 2));
              }
            }
          });
        }
        
        if (positions.length < 2) {
          console.warn(`[Consolidated Map] Not enough valid positions for travel ${index}: ${travel.travel_oid}`);
          errorCount++;
          return;
        }
        
        // Travel roads - 3 meters wide, distinct color to differentiate from regular courses
        const roadWidthMeters = 3.0;
        const travelColor = window.Cesium.Color.fromCssColorString('#4A90E2'); // Blue color for travels
        
        // Create travel road surface
        const travelName = travel.from_location_name && travel.to_location_name 
          ? `${travel.from_location_name} → ${travel.to_location_name}`
          : `Travel ${travel.travel_oid}`;
        
        const roadSurface = cesiumViewer.entities.add({
          corridor: {
            positions: positions,
            width: roadWidthMeters,
            material: new window.Cesium.ColorMaterialProperty(travelColor.withAlpha(1.0)),
            height: -0.05, // Same as courses - below locations
            extrudedHeight: 0.25,
            cornerType: window.Cesium.CornerType.ROUNDED,
            granularity: 0.000001
          },
          name: travelName,
          properties: {
            name: travelName,
            category: 'travel',
            travel_id: travel.travel_id,
            travel_oid: travel.travel_oid,
            travel_cid: travel.travel_cid,
            course_oid: travel.course_oid,
            course_cid: travel.course_cid,
            from_location_name: travel.from_location_name,
            to_location_name: travel.to_location_name,
            from_location_cid: travel.from_location_cid,
            to_location_cid: travel.to_location_cid,
            road_type: travel.road_type,
            aht_profile_name: travel.aht_profile_name,
            course_attributes_value: travel.course_attributes_value,
            inflections: travel.inflections,
            spline_oid: travel.spline_oid,
            inclination_factor: travel.inclination_factor,
            start_direction: travel.start_direction,
            active: travel.active,
            closed: travel.closed,
            segment_start: travel.segment_start,
            segment_end: travel.segment_end,
            total_points: travel.total_points,
            travel_length_m: travel.travel_length_m,
            length_m: travel.travel_length_m,
            start_latitude: travel.start_latitude,
            start_longitude: travel.start_longitude,
            end_latitude: travel.end_latitude,
            end_longitude: travel.end_longitude,
            all_coordinate_oids: travel.all_coordinate_oids,
            width_m: roadWidthMeters,
            color: travelColor.toCssColorString()
          },
          show: showTravels // Travels have their own toggle
        });
        entitiesRef.current.push(roadSurface);
        
        addedCount++;
        
        if (index < 5) {
          console.log(`[Consolidated Map] ✅ Added travel ${index}: ${travelName} (${travel.road_type})`);
        }
        
      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding travel ${index}:`, err);
      }
    });
    
    console.log(`[Consolidated Map] ✅ Added ${addedCount} travels (${errorCount} errors), total entities now: ${entitiesRef.current.length}`);
    
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
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
            height: 0.01, // Small positive height to ensure locations are always above roads
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
                {/* <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>⛏</span> */}
              </div>
              <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>Main Map</span>
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
                Base Layer
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
                <option value="night">Night Mode (Dark)</option>
                <option value="day">Day Mode (Satellite)</option>
                <option value="topographic">Topographic</option>
                <option value="terrain">Terrain (Colorful)</option>
              </select>
              
              <div style={{ marginTop: '10px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '6px', 
                  fontSize: '11px', 
                  color: '#bdc3c7',
                  fontWeight: '600'
                }}>
                 View Mode
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
                  {viewMode === '2D' ? '2D Map View' : '3D Globe View'}
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
            
            {((intersectionsData?.consolidated_intersections && intersectionsData.consolidated_intersections.length > 0) || 
              (coursesData?.courses && coursesData.courses.length > 0) ||
              (travelsData?.travels && travelsData.travels.length > 0) ||
              (surveyPathsData?.paths && surveyPathsData.paths.length > 0)) && (
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
                      {(intersectionsData?.consolidated_intersections?.length || 0) + 
                       (coursesData?.courses?.length || 0) + 
                       (travelsData?.travels?.length || 0) +
                       (surveyPathsData?.paths?.length || 0)}
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
                      <span style={{ color: 'white', fontWeight: '500' }}>Intersections ({intersectionsData.consolidated_intersections.length})</span>
                    </label>
                  </div>
                  
                  {coursesData && coursesData.courses && coursesData.courses.length > 0 && (
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
                          checked={showCourses}
                          onChange={(e) => setShowCourses(e.target.checked)}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer'
                          }}
                        />
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#FFD700',
                          borderRadius: '2px',
                          marginRight: '8px'
                        }}></div>
                        <span style={{ color: 'white', fontWeight: '500' }}>Courses (Roads) ({coursesData.courses.length})</span>
                      </label>
                    </div>
                  )}
                  
                  {travelsData && travelsData.travels && travelsData.travels.length > 0 && (
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
                          checked={showTravels}
                          onChange={(e) => setShowTravels(e.target.checked)}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer'
                          }}
                        />
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#4A90E2',
                          borderRadius: '2px',
                          marginRight: '8px'
                        }}></div>
                        <span style={{ color: 'white', fontWeight: '500' }}>Travels ({travelsData.travels.length})</span>
                      </label>
                    </div>
                  )}
                  
                  {surveyPathsData && surveyPathsData.paths && surveyPathsData.paths.length > 0 && (
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
                          checked={showSurveyPaths}
                          onChange={(e) => setShowSurveyPaths(e.target.checked)}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer'
                          }}
                        />
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#00FF00',
                          borderRadius: '2px',
                          marginRight: '8px'
                        }}></div>
                        <span style={{ color: 'white', fontWeight: '500' }}>Survey Paths ({surveyPathsData.paths.length})</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
            

          </div>
        </div>
      )}

      {/* Entity Information Dialog */}
      {dialogOpen && dialogData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(5px)'
          }}
          onClick={() => {
            setDialogOpen(false);
            setDialogData(null);
          }}
        >
          <div
            style={{
              backgroundColor: '#1e1e1e',
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '600px',
              maxHeight: '70vh',
              width: '85%',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              paddingBottom: '10px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div>
                <h2 style={{
                  color: '#fff',
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600'
                }}>
                  {dialogData.category === 'course' ? '🛣️' : 
                   dialogData.category === 'survey_path' ? '🛤️' :
                   dialogData.category === 'intersection' ? '🚦' : '📍'} {dialogData.name}
                </h2>
                <p style={{
                  color: '#bdc3c7',
                  margin: '2px 0 0 0',
                  fontSize: '11px',
                  textTransform: 'capitalize'
                }}>
                  {dialogData.category || 'Entity'} Information
                </p>
              </div>
              <button
                onClick={() => {
                  setDialogOpen(false);
                  setDialogData(null);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{
              overflowY: 'auto',
              flex: 1,
              paddingRight: '6px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '8px'
              }}>
                {Object.entries(dialogData.allProperties)
                  .filter(([key]) => {
                    // Only filter out huge geometry objects that would break the display
                    return key !== 'linestring' && key !== 'polygon' && key !== 'geometry';
                  })
                  .sort(([a], [b]) => {
                    // Sort: important fields first, then alphabetically
                    const important = ['name', 'category', 'course_name', 'path_oid', 'location_name', 'intersection_name'];
                    const aImportant = important.indexOf(a);
                    const bImportant = important.indexOf(b);
                    if (aImportant !== -1 && bImportant !== -1) return aImportant - bImportant;
                    if (aImportant !== -1) return -1;
                    if (bImportant !== -1) return 1;
                    return a.localeCompare(b);
                  })
                  .map(([key, value]) => {
                    // Format value for display
                    let displayValue = value;
                    if (value === null || value === undefined) {
                      displayValue = 'N/A';
                    } else if (typeof value === 'boolean') {
                      displayValue = value ? 'Yes' : 'No';
                    } else if (typeof value === 'number') {
                      if (key.includes('length') || key.includes('distance')) {
                        displayValue = value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${value.toFixed(2)} m`;
                      } else if (key.includes('area')) {
                        displayValue = value >= 1000000 ? `${(value / 1000000).toFixed(2)} km²` : `${value.toFixed(2)} m²`;
                      } else if (key.includes('latitude') || key.includes('longitude')) {
                        displayValue = value.toFixed(6);
                      } else {
                        displayValue = value.toString();
                      }
                    } else if (typeof value === 'object') {
                      displayValue = JSON.stringify(value, null, 2);
                    } else {
                      displayValue = String(value);
                    }

                    return (
                      <div
                        key={key}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      >
                        <div style={{
                          color: '#bdc3c7',
                          fontSize: '10px',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px',
                          marginBottom: '4px'
                        }}>
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div style={{
                          color: '#fff',
                          fontSize: '12px',
                          wordBreak: 'break-word',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {displayValue}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
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