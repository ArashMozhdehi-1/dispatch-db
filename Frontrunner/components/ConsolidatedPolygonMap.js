import React, { useState, useEffect, useRef, useMemo } from 'react';
import TopMenuBar from './TopMenuBar';
import TurnPathDialog from './TurnPathDialog';
import TurnPathStatusBanner from './TurnPathStatusBanner';
import useTurnPathManager from './useTurnPathManager';
import { useMeasurementTool } from './useMeasurementTool';
import MeasurementStatusBanner from './MeasurementStatusBanner';

// Curated color palette inspired by ColorBrewer + Google Maps for softer, HD visuals
const DISPATCH_LOCATION_COLOR_MAP = {
  'call point': '#FF6B6B',
  'dump': '#FF8E72',
  'blast': '#FFB347',
  'stockpile': '#FFD166',
  'workshop': '#F4A261',
  'shiftchange': '#06D6A0',
  'region': '#118AB2',
  'crusher': '#9B5DE5',
  'pit': '#EF476F',
  'parking': '#FFE066',
  'fuel': '#FE5F55',
  'tipping area': '#FF924C',
  'infrastructure': '#5C677D',
  'infrastructure_table': '#5C677D',
  'default': '#9FA4B0'
};

const lightenColor = (hex, percent = 0) => {
  if (!hex) return '#FFFFFF';
  const sanitized = hex.replace('#', '');
  const num = parseInt(sanitized, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.min(255, Math.round(r + (255 - r) * percent / 100));
  g = Math.min(255, Math.round(g + (255 - g) * percent / 100));
  b = Math.min(255, Math.round(b + (255 - b) * percent / 100));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
};

const resolveDispatchLocationType = (location) => {
  if (!location) return 'Infrastructure';
  const rawValue = location.unit_type || location.location_category || location.category || location.source || 'Infrastructure';
  if (typeof rawValue !== 'string') {
    return 'Infrastructure';
  }
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : 'Infrastructure';
};

const getDispatchLocationColor = (locationType) => {
  if (!locationType || typeof locationType !== 'string') {
    return DISPATCH_LOCATION_COLOR_MAP.default;
  }
  const key = locationType.trim().toLowerCase();
  return DISPATCH_LOCATION_COLOR_MAP[key] || DISPATCH_LOCATION_COLOR_MAP.default;
};

const isDispatchSegmentClosed = (segment) => {
  if (!segment) return false;
  const value = segment.is_closed;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', 't', '1', 'closed', 'yes', 'y'].includes(normalized);
  }
  return false;
};

const HD_CATEGORY_COLORS = {
  pit: '#E63946',
  parking: '#FFD166',
  crusher: '#9B5DE5',
  fuel: '#F3722C',
  intersection: '#F94144',
  dump: '#FF6F59',
  blast: '#FFB347',
  stockpile: '#06D6A0',
  workshop: '#118AB2',
  gate: '#4ECDC4',
  'high dump': '#EF476F',
  load: '#F77F00',
  tiedown: '#83C5BE',
  'paddock dump': '#FC8EAC',
  access: '#F4A261',
  parking_bay: '#FFE066',
  default: '#BFC6D0'
};

const MAP_THEME_PRESETS = {
  night: {
    id: 'night',
    roadSurfaceColor: '#3C3F58',
    roadSurfaceAlpha: 0.98,
    roadShoulderColor: '#F2D492',
    roadShoulderAlpha: 0.35,
    roadShoulderPaddingMeters: 3.2,
    roadWidthMeters: 7.5,
    roadElevation: 0.18,
    roadExtrudedHeight: 0.45,
    roadCenterlineColor: '#FFD369',
    roadCenterlineAlpha: 0.95,
    roadCenterlineWidthMeters: 1.25,
    roadCenterlineGlowPower: 0.3,
    roadGlowColor: '#FFF3B0',
    roadGlowAlpha: 0.55,
    polygonOutlineColor: '#F8C537',
    polygonOutlineAlpha: 0.95,
    polygonOutlineWidth: 2.2,
    locationFillAlpha: 0.94,
    locationTopAlpha: 0.97,
    locationOutlineLighten: 32,
    locationTopLighten: 42,
    intersectionFillColor: '#FF5F6D',
    intersectionFillAlpha: 0.92,
    intersectionOutlineColor: '#FFE066',
    intersectionOutlineAlpha: 0.95,
    intersectionLabelBg: '#2B2D42'
  },
  day: {
    id: 'day',
    roadSurfaceColor: '#FFFFFF',
    roadSurfaceAlpha: 0.98,
    roadShoulderColor: '#D7DDE5',
    roadShoulderAlpha: 0.9,
    roadShoulderPaddingMeters: 2.4,
    roadWidthMeters: 8,
    roadElevation: 0.22,
    roadExtrudedHeight: 0.5,
    roadCenterlineColor: '#F4B400',
    roadCenterlineAlpha: 0.95,
    roadCenterlineWidthMeters: 1.1,
    roadCenterlineGlowPower: 0.35,
    roadGlowColor: '#E0E7FF',
    roadGlowAlpha: 0.45,
    polygonOutlineColor: '#90A4AE',
    polygonOutlineAlpha: 0.95,
    polygonOutlineWidth: 2.4,
    locationFillAlpha: 0.86,
    locationTopAlpha: 0.92,
    locationOutlineLighten: 15,
    locationTopLighten: 22,
    intersectionFillColor: '#15616D',
    intersectionFillAlpha: 0.88,
    intersectionOutlineColor: '#FFECD1',
    intersectionOutlineAlpha: 0.95,
    intersectionLabelBg: '#0D1B2A'
  },
  topographic: {
    id: 'topographic',
    roadSurfaceColor: '#F7F2EC',
    roadSurfaceAlpha: 0.95,
    roadShoulderColor: '#C9ADA7',
    roadShoulderAlpha: 0.85,
    roadShoulderPaddingMeters: 2.1,
    roadWidthMeters: 7,
    roadElevation: 0.18,
    roadExtrudedHeight: 0.4,
    roadCenterlineColor: '#7B2CBF',
    roadCenterlineAlpha: 0.92,
    roadCenterlineWidthMeters: 1.05,
    roadCenterlineGlowPower: 0.32,
    roadGlowColor: '#FAD643',
    roadGlowAlpha: 0.5,
    polygonOutlineColor: '#B58392',
    polygonOutlineAlpha: 0.95,
    polygonOutlineWidth: 2.3,
    locationFillAlpha: 0.9,
    locationTopAlpha: 0.95,
    locationOutlineLighten: 20,
    locationTopLighten: 30,
    intersectionFillColor: '#FF6F59',
    intersectionFillAlpha: 0.9,
    intersectionOutlineColor: '#FFE066',
    intersectionOutlineAlpha: 0.9,
    intersectionLabelBg: '#2E1F27'
  },
  terrain: {
    id: 'terrain',
    roadSurfaceColor: '#F5F1E3',
    roadSurfaceAlpha: 0.94,
    roadShoulderColor: '#B08968',
    roadShoulderAlpha: 0.85,
    roadShoulderPaddingMeters: 2.6,
    roadWidthMeters: 7.5,
    roadElevation: 0.2,
    roadExtrudedHeight: 0.42,
    roadCenterlineColor: '#F6C177',
    roadCenterlineAlpha: 0.92,
    roadCenterlineWidthMeters: 1.15,
    roadCenterlineGlowPower: 0.28,
    roadGlowColor: '#FFE6A7',
    roadGlowAlpha: 0.48,
    polygonOutlineColor: '#A47551',
    polygonOutlineAlpha: 0.94,
    polygonOutlineWidth: 2.5,
    locationFillAlpha: 0.88,
    locationTopAlpha: 0.94,
    locationOutlineLighten: 18,
    locationTopLighten: 28,
    intersectionFillColor: '#247BA0',
    intersectionFillAlpha: 0.9,
    intersectionOutlineColor: '#FFE066',
    intersectionOutlineAlpha: 0.94,
    intersectionLabelBg: '#1B4332'
  }
};

const generateColorForCategory = (category) => {
  if (!category) return HD_CATEGORY_COLORS.default;
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  // Softer pastel style
  return `hsl(${hue}, 65%, 65%)`;
};

const ConsolidatedPolygonMap = ({ showDispatchData = false, showFrontrunnerData = true, centerOn = 'frontrunner' }) => {
  const mapContainer = useRef(null);
  const cesiumViewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const currentTooltip = useRef(null);
  const currentPopup = useRef(null);
  const hoveredEntityRef = useRef(null);
  const isInitializing = useRef(false);
  const dispatchSegmentWidthHandlerRef = useRef(null);
  const turnPathOverlayRef = useRef({ pathEntity: null, intersectionEntity: null });

  // Turn Path Manager
  const turnPathManager = useTurnPathManager(cesiumViewerRef);

  // Measurement Tool
  const measurementTool = useMeasurementTool(cesiumViewerRef);

  // ESC key handler for measurement mode - always listen, even after measurement completes
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Always clear measurements on ESC - remove everything including final line
        if (measurementTool.measurementMode || measurementTool.measurementPoints.length > 0) {
          console.log('[Measurement] ESC pressed - clearing all measurements');
          measurementTool.cancelMeasurement();
        }
      }
    };

    // Always listen for ESC, not just when measurement mode is active
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [measurementTool.measurementMode, measurementTool.measurementPoints.length, measurementTool.cancelMeasurement]);

  // Set up Cesium click handlers for measurement tool
  useEffect(() => {
    const viewer = cesiumViewerRef.current;
    if (!viewer || !window?.Cesium) return;

    const handler = new window.Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // LEFT CLICK: add measurement point (distance or area)
    handler.setInputAction((click) => {
      if (!measurementTool.measurementMode) return;

      const pickedPosition = viewer.scene.pickPosition(click.position);
      if (window.Cesium.defined(pickedPosition)) {
        measurementTool.addMeasurementPoint(pickedPosition);
      }
    }, window.Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // RIGHT CLICK: finalize area measurement
    handler.setInputAction(() => {
      measurementTool.finalizeAreaMeasurement();
    }, window.Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    // MOUSE_MOVE: update preview line for distance mode
    handler.setInputAction((movement) => {
      if (!measurementTool.measurementMode) return;

      const pickedPosition = viewer.scene.pickPosition(movement.endPosition);
      if (window.Cesium.defined(pickedPosition)) {
        measurementTool.updatePreviewLine(pickedPosition);
      } else {
        measurementTool.updatePreviewLine(null);
      }
    }, window.Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      if (handler && !handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [measurementTool.measurementMode, measurementTool.addMeasurementPoint, measurementTool.finalizeAreaMeasurement, measurementTool.updatePreviewLine]);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [consolidatedData, setConsolidatedData] = useState(null);
  const [intersectionsData, setIntersectionsData] = useState(null);
  const [roadsData, setRoadsData] = useState(null);
  const [surveyPathsData, setSurveyPathsData] = useState(null);
  const [coursesData, setCoursesData] = useState(null);
  const [travelsData, setTravelsData] = useState(null);
  const [roadMarkingsData, setRoadMarkingsData] = useState(null);
  const [roadMarkersData, setRoadMarkersData] = useState(null);
  const [dispatchLocations, setDispatchLocations] = useState(null);
  const [dispatchSegments, setDispatchSegments] = useState(null);
  const [dispatchTrolley, setDispatchTrolley] = useState(null);
  const [dispatchWatering, setDispatchWatering] = useState(null);
  const [dispatchSpeed, setDispatchSpeed] = useState(null);
  const [dispatchIntersections, setDispatchIntersections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleCategories, setVisibleCategories] = useState(new Set());
  const [showSurveyPaths, setShowSurveyPaths] = useState(true);
  const [showCourses, setShowCourses] = useState(true);
  const [showTravels, setShowTravels] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showClosedRoads, setShowClosedRoads] = useState(true);
  const [showGeometry3D, setShowGeometry3D] = useState(false);
  const [showCenterPoints, setShowCenterPoints] = useState(false); // Hidden by default - user must enable
  const [showCornerPoints, setShowCornerPoints] = useState(true); // Not used (corners disabled)

  // Dispatch data visibility states
  const [showDispatchLocations, setShowDispatchLocations] = useState(true);
  const [showDispatchSegments, setShowDispatchSegments] = useState(true);
  const [showDispatchIntersections, setShowDispatchIntersections] = useState(true);
  const [showDispatchTrolley, setShowDispatchTrolley] = useState(true);
  const [showDispatchWatering, setShowDispatchWatering] = useState(true);
  const [showDispatchSpeed, setShowDispatchSpeed] = useState(true);

  // Map dump feature visibility states

  // UI states (always expanded)
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [locationTypesExpanded, setLocationTypesExpanded] = useState(true);
  const [roadNetworksExpanded, setRoadNetworksExpanded] = useState(true);
  const [coreLayersExpanded, setCoreLayersExpanded] = useState(true);

  const [baseLayer, setBaseLayer] = useState('night');
  const activeTheme = useMemo(() => {
    return MAP_THEME_PRESETS[baseLayer] || MAP_THEME_PRESETS.night;
  }, [baseLayer]);
  const [viewMode, setViewMode] = useState('2D'); // Start in 2D top-down view
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

  const getCategoryColor = (category) => {
    const consolidated = getConsolidatedCategory(category);
    const normalized = consolidated.toLowerCase().trim();
    const predefinedColor = HD_CATEGORY_COLORS[normalized];
    if (predefinedColor) {
      return predefinedColor;
    }
    return generateColorForCategory(category);
  };

  const updateDispatchSegmentWidths = (viewer) => {
    if (!viewer || !viewer.camera || !viewer.scene) return;

    const cameraHeight = viewer.camera.positionCartographic?.height || 1;
    const dynamicWidth = Math.min(30, Math.max(2, 300000 / cameraHeight));

    entitiesRef.current.forEach(entity => {
      if (!entity || !entity.polyline) return;
      const category = entity.properties?.category?._value || entity.properties?.category;
      if (category === 'dispatch_segment') {
        entity.polyline.width = dynamicWidth;
      }
    });
  };

  const setupDispatchSegmentWidthScaling = (viewer) => {
    if (!viewer || !viewer.scene) return;

    if (dispatchSegmentWidthHandlerRef.current) {
      viewer.scene.preRender.removeEventListener(dispatchSegmentWidthHandlerRef.current);
      dispatchSegmentWidthHandlerRef.current = null;
    }

    updateDispatchSegmentWidths(viewer);

    const handler = () => updateDispatchSegmentWidths(viewer);
    viewer.scene.preRender.addEventListener(handler);
    dispatchSegmentWidthHandlerRef.current = handler;
  };

  useEffect(() => {
    setIsClient(true);

    return () => {
      closeCurrentTooltip();
      const existingTooltip = document.getElementById('map-tooltip');
      if (existingTooltip) {
        try {
          existingTooltip.remove();
        } catch (e) {
          // Tooltip already removed
        }
      }

      if (cesiumViewerRef.current) {
        try {
          const viewer = cesiumViewerRef.current;

          if (dispatchSegmentWidthHandlerRef.current && viewer?.scene?.preRender) {
            viewer.scene.preRender.removeEventListener(dispatchSegmentWidthHandlerRef.current);
            dispatchSegmentWidthHandlerRef.current = null;
          }

          // AGGRESSIVE CLEANUP: Override requestAnimationFrame to prevent any further calls
          const originalRAF = window.requestAnimationFrame;
          window.requestAnimationFrame = () => -1; // Return dummy ID

          // Stop all animations and rendering before destroying
          if (viewer.scene) {
            viewer.scene.requestRenderMode = false;

            // Stop all animation frame requests
            if (viewer.clock) {
              viewer.clock.shouldAnimate = false;
            }

            // Stop the resize observer
            if (viewer._cesiumWidget && viewer._cesiumWidget._canvasClientWidth) {
              viewer._cesiumWidget._canvasClientWidth = 0;
              viewer._cesiumWidget._canvasClientHeight = 0;
            }

            // Remove ALL event listeners that might trigger render
            if (viewer.scene._postRender) {
              try {
                viewer.scene._postRender._listeners = [];
              } catch (e) { }
            }
            if (viewer.scene._preRender) {
              try {
                viewer.scene._preRender._listeners = [];
              } catch (e) { }
            }
            if (viewer.scene._postUpdate) {
              try {
                viewer.scene._postUpdate._listeners = [];
              } catch (e) { }
            }
            if (viewer.scene._preUpdate) {
              try {
                viewer.scene._preUpdate._listeners = [];
              } catch (e) { }
            }
          }

          // Remove all entities safely
          if (viewer.entities) {
            try {
              viewer.entities.removeAll();
            } catch (e) {
              // Already removed
            }
          }

          // Remove all imagery layers safely
          if (viewer.imageryLayers) {
            try {
              viewer.imageryLayers.removeAll();
            } catch (e) {
              // Already removed
            }
          }

          // Check if viewer is not already destroyed
          if (viewer.isDestroyed && !viewer.isDestroyed()) {
            // Final stop of animation
            viewer._shouldAnimate = false;

            try {
              viewer.destroy();
            } catch (e) {
              // Viewer destruction failed, but we've stopped all animations
            }
          }

          // Restore requestAnimationFrame after a delay
          setTimeout(() => {
            window.requestAnimationFrame = originalRAF;
          }, 100);

        } catch (error) {
          // Silently handle cleanup errors
          // console.debug('[Consolidated Map] Cleanup completed');
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
      // console.log('[Consolidated Map] 🛣️ Adding intersections to existing map...');
      addIntersectionsToCesium(cesiumViewerRef.current);
    }
  }, [intersectionsData, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && roadsData && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🛣️ Adding roads to existing map...');
      addRoadsToCesium(cesiumViewerRef.current);
    }
  }, [roadsData, mapLoaded, intersectionsData]);

  // Set up coordinate tracking box at bottom right
  useEffect(() => {
    const viewer = cesiumViewerRef.current;
    if (!viewer || !window?.Cesium || !mapLoaded) return;

    console.log('[Coordinate Tracker] Setting up coordinate display box');

    // Create coordinate display box
    const coordDisplay = document.createElement('div');
    coordDisplay.id = 'mouse-coordinates';
    coordDisplay.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
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
      display: block;
      line-height: 1.3;
    `;
    document.body.appendChild(coordDisplay);
    console.log('[Coordinate Tracker] Coordinate box created and added to DOM');

    const handler = new window.Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // MOUSE_MOVE: update coordinates
    handler.setInputAction((movement) => {
      const cartesian = viewer.scene.pickPosition(movement.endPosition);
      if (window.Cesium.defined(cartesian)) {
        const cartographic = window.Cesium.Cartographic.fromCartesian(cartesian);
        const lng = window.Cesium.Math.toDegrees(cartographic.longitude);
        const lat = window.Cesium.Math.toDegrees(cartographic.latitude);

        coordDisplay.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #a0a0a0; font-weight: 400;">Lat:</span>
            <span style="color: white; font-weight: 500; font-variant-numeric: tabular-nums;">
              ${lat.toFixed(6)}°
            </span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #a0a0a0; font-weight: 400;">Lng:</span>
            <span style="color: white; font-weight: 500; font-variant-numeric: tabular-nums;">
              ${lng.toFixed(6)}°
            </span>
          </div>
        `;
        coordDisplay.style.display = 'block';
      }
    }, window.Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    console.log('[Coordinate Tracker] Mouse move handler registered');

    return () => {
      console.log('[Coordinate Tracker] Cleaning up');
      if (handler && !handler.isDestroyed()) {
        handler.destroy();
      }
      if (coordDisplay && coordDisplay.parentNode) {
        coordDisplay.remove();
      }
    };
  }, [mapLoaded]);

  // Update marker visibility when toggles change (without recreating entities)
  useEffect(() => {
    if (!cesiumViewerRef.current || !entitiesRef.current) return;

    let updatedCount = 0;
    entitiesRef.current.forEach(entity => {
      const styleRole = getStyleRole(entity);

      if (isCornerMarker(styleRole)) {
        entity.show = !!showCornerPoints;
        updatedCount++;
      } else if (isCenterMarker(styleRole)) {
        entity.show = !!showCenterPoints;
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      console.log(
        `[Road Markers Visibility] Updated ${updatedCount} markers: corners=${showCornerPoints}, centers=${showCenterPoints}`
      );
      cesiumViewerRef.current.scene?.requestRender();
    }
  }, [showCornerPoints, showCenterPoints]);

  // Add markers when data is loaded
  useEffect(() => {
    console.log('[Road Markers useEffect] ⚠️ TRIGGERED:', {
      mapLoaded,
      hasConsolidatedData: !!consolidatedData,
      hasViewer: !!cesiumViewerRef.current,
      cornerCount: 'DISABLED',
      sideCount: consolidatedData?.road_side_markers?.length || 0,
      consolidatedDataKeys: consolidatedData ? Object.keys(consolidatedData) : []
    });

    if (mapLoaded && consolidatedData && cesiumViewerRef.current) {
      console.log('[Road Markers useEffect] ✅ All conditions met - Calling addRoadMarkersToCesium');
      console.log('[Road Markers useEffect] Corner markers: DISABLED');
      console.log('[Road Markers useEffect] Side markers:', consolidatedData.road_side_markers?.length);
      addRoadMarkersToCesium(cesiumViewerRef.current);
    } else {
      console.error('[Road Markers useEffect] ❌ Conditions NOT met:', {
        mapLoaded,
        hasConsolidatedData: !!consolidatedData,
        hasViewer: !!cesiumViewerRef.current,
        consolidatedDataType: typeof consolidatedData
      });
    }
  }, [consolidatedData, mapLoaded]);


  useEffect(() => {
    if (mapLoaded && consolidatedData && cesiumViewerRef.current && centerOn !== 'dispatch') {
      // Re-render polygons when 3D geometry toggle changes
      addPolygonsToCesium(cesiumViewerRef.current);
    }
  }, [showGeometry3D, mapLoaded, consolidatedData, centerOn]);

  useEffect(() => {
    if (mapLoaded && surveyPathsData && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🛤️ useEffect triggered - Adding survey paths to map...');
      // console.log('[Consolidated Map] 🛤️ mapLoaded:', mapLoaded);
      // console.log('[Consolidated Map] 🛤️ surveyPathsData:', surveyPathsData);
      // console.log('[Consolidated Map] 🛤️ cesiumViewerRef.current:', !!cesiumViewerRef.current);
      addSurveyPathsToCesium(cesiumViewerRef.current);
    } else {
      // console.log('[Consolidated Map] ⏳ Waiting for survey paths conditions:', {
      //   mapLoaded,
      //   hasSurveyPathsData: !!surveyPathsData,
      //   hasViewer: !!cesiumViewerRef.current
      // });
    }
  }, [surveyPathsData, mapLoaded]);

  // Courses are now used as roads only - no separate courses layer
  // useEffect(() => {
  //   if (mapLoaded && coursesData && cesiumViewerRef.current) {
  //     addCoursesToCesium(cesiumViewerRef.current);
  //   }
  // }, [coursesData, mapLoaded, showCourses, intersectionsData]);

  useEffect(() => {
    if (mapLoaded && travelsData && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🚗 useEffect triggered - Adding travels to map...');
      // console.log('[Consolidated Map] 🚗 mapLoaded:', mapLoaded);
      // console.log('[Consolidated Map] 🚗 travelsData:', travelsData);
      // console.log('[Consolidated Map] 🚗 cesiumViewerRef.current:', !!cesiumViewerRef.current);
      addTravelsToCesium(cesiumViewerRef.current);
    } else {
      // console.log('[Consolidated Map] ⏳ Waiting for travels conditions:', {
      //   mapLoaded,
      //   hasTravelsData: !!travelsData,
      //   hasViewer: !!cesiumViewerRef.current
      // });
    }
  }, [travelsData, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && dispatchLocations && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 📍 Adding dispatch locations to map...');
      addDispatchLocationsToCesium(cesiumViewerRef.current);
    }
  }, [dispatchLocations, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && dispatchSegments && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🛣️ Adding dispatch segments to map...');
      addDispatchSegmentsToCesium(cesiumViewerRef.current);
    }
  }, [dispatchSegments, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && dispatchTrolley && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🔌 Adding trolley lines to map...');
      addDispatchTrolleyToCesium(cesiumViewerRef.current);
    }
  }, [dispatchTrolley, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && dispatchWatering && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 💧 Adding watering stations to map...');
      addDispatchWateringToCesium(cesiumViewerRef.current);
    }
  }, [dispatchWatering, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && dispatchSpeed && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🚦 Adding speed monitoring to map...');
      addDispatchSpeedToCesium(cesiumViewerRef.current);
    }
  }, [dispatchSpeed, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && dispatchIntersections && cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🚧 Adding dispatch intersections to map...');
      addDispatchIntersectionsToCesium(cesiumViewerRef.current);
    }
  }, [dispatchIntersections, mapLoaded]);


  // Force all Dispatch entities visible after all data is loaded
  useEffect(() => {
    if (mapLoaded && centerOn === 'dispatch' && cesiumViewerRef.current && entitiesRef.current.length > 0) {
      // Wait a bit for all entities to be added
      setTimeout(() => {
        // console.log('[Consolidated Map] 🔄 Final check: Forcing all Dispatch entities visible...');
        // console.log(`[Consolidated Map] 📊 entitiesRef.current.length: ${entitiesRef.current.length}`);
        // console.log(`[Consolidated Map] 📊 Cesium viewer entities: ${cesiumViewerRef.current.entities.values.length}`);

        let forcedCount = 0;
        let hiddenCount = 0;
        let dispatchFound = 0;
        let frontrunnerFound = 0;
        let noCategory = 0;

        // Check entitiesRef
        entitiesRef.current.forEach((entity, idx) => {
          if (!entity) {
            // console.warn(`[Consolidated Map] ⚠️ Entity at index ${idx} is null/undefined`);
            return;
          }

          if (!entity.properties) {
            // console.warn(`[Consolidated Map] ⚠️ Entity at index ${idx} has no properties`);
            noCategory++;
            return;
          }

          const styleRole = getEntityProperty(entity, 'style_role');
          if (styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center') {
            // Do not hide precomputed road markers when switching to dispatch view
            return;
          }

          // Try multiple ways to get category
          let category = null;
          if (entity.properties.category) {
            if (typeof entity.properties.category === 'object' && entity.properties.category._value !== undefined) {
              category = entity.properties.category._value;
            } else if (typeof entity.properties.category === 'string') {
              category = entity.properties.category;
            } else if (entity.properties.category.getValue) {
              category = entity.properties.category.getValue();
            }
          }

          // if (idx < 5) {
          //   // console.log(`[Consolidated Map] 📊 Entity ${idx}: category=${category}, show=${entity.show}, name=${entity.name}`);
          // }

          if (category && category.startsWith('dispatch_')) {
            dispatchFound++;
            if (!entity.show) {
              entity.show = true;
              forcedCount++;
            }
          } else if (category) {
            frontrunnerFound++;
            // Hide Frontrunner entities
            if (entity.show) {
              entity.show = false;
              hiddenCount++;
            }
          } else {
            noCategory++;
          }
        });

        // Also check Cesium viewer entities directly
        let cesiumDispatchCount = 0;
        cesiumViewerRef.current.entities.values.forEach((entity, idx) => {
          if (entity && entity.properties) {
            const styleRole = getEntityProperty(entity, 'style_role');
            if (styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center') {
              return;
            }
            let cat = null;
            if (entity.properties.category) {
              if (typeof entity.properties.category === 'object' && entity.properties.category._value !== undefined) {
                cat = entity.properties.category._value;
              } else if (typeof entity.properties.category === 'string') {
                cat = entity.properties.category;
              } else if (entity.properties.category.getValue) {
                cat = entity.properties.category.getValue();
              }
            }
            if (cat && cat.startsWith('dispatch_')) {
              cesiumDispatchCount++;
              if (!entity.show) {
                entity.show = true;
              }
            }
          }
        });

        console.log(`[Consolidated Map] ✅ Final visibility:`, {
          entitiesRefLength: entitiesRef.current.length,
          cesiumViewerEntities: cesiumViewerRef.current.entities.values.length,
          dispatchFound,
          frontrunnerFound,
          noCategory,
          cesiumDispatchCount,
          forcedCount,
          hiddenCount
        });

        if (cesiumViewerRef.current.scene) {
          cesiumViewerRef.current.scene.requestRender();
        }
      }, 2000);
    }
  }, [mapLoaded, centerOn, dispatchLocations, dispatchSegments, dispatchIntersections]);

  // Ensure Dispatch entities are visible when centerOn === 'dispatch'
  // and hide Frontrunner entities when centerOn === 'dispatch'
  useEffect(() => {
    if (centerOn === 'dispatch') {
      setShowDispatchLocations(true);
      setShowDispatchSegments(true);
      setShowDispatchIntersections(true);
      setShowDispatchTrolley(true);
      setShowDispatchWatering(true);
      setShowDispatchSpeed(true);
      // Hide Frontrunner entities
      setShowSurveyPaths(false);
      setShowCourses(false);
      setShowTravels(false);
      setShowRoads(false);
      setShowCenterPoints(false); // Hidden by default - user must enable
      setShowCornerPoints(false); // Corners disabled

      // Force all Dispatch entities visible immediately (check both entitiesRef and Cesium viewer)
      if (cesiumViewerRef.current) {
        // console.log('[Consolidated Map] 🔄 Forcing all Dispatch entities visible...');
        let forcedCount = 0;

        // Check entitiesRef
        if (entitiesRef.current && entitiesRef.current.length > 0) {
          entitiesRef.current.forEach(entity => {
            if (entity && entity.properties) {
              let category = null;
              if (entity.properties.category) {
                if (typeof entity.properties.category === 'object' && entity.properties.category._value !== undefined) {
                  category = entity.properties.category._value;
                } else if (typeof entity.properties.category === 'string') {
                  category = entity.properties.category;
                } else if (entity.properties.category.getValue) {
                  category = entity.properties.category.getValue();
                }
              }
              if (category && category.startsWith('dispatch_')) {
                entity.show = true;
                forcedCount++;
              }
            }
          });
        }

        // Also check Cesium viewer entities directly
        if (cesiumViewerRef.current.entities && cesiumViewerRef.current.entities.values) {
          cesiumViewerRef.current.entities.values.forEach(entity => {
            if (entity && entity.properties) {
              let category = null;
              if (entity.properties.category) {
                if (typeof entity.properties.category === 'object' && entity.properties.category._value !== undefined) {
                  category = entity.properties.category._value;
                } else if (typeof entity.properties.category === 'string') {
                  category = entity.properties.category;
                } else if (entity.properties.category.getValue) {
                  category = entity.properties.category.getValue();
                }
              }
              if (category && category.startsWith('dispatch_')) {
                if (!entity.show) {
                  entity.show = true;
                  forcedCount++;
                }
              }
            }
          });
        }

        // console.log(`[Consolidated Map] ✅ Forced ${forcedCount} Dispatch entities visible`);
        if (cesiumViewerRef.current.scene) {
          cesiumViewerRef.current.scene.requestRender();
        }
      }
    } else if (centerOn === 'frontrunner') {
      // Show Frontrunner entities
      setShowSurveyPaths(true);
      setShowCourses(true);
      setShowTravels(true);
      setShowRoads(true);
      setShowCenterPoints(false); // Hidden by default - user must enable
      setShowCornerPoints(false); // Corners disabled
    }
  }, [centerOn]);

  // Update Frontrunner entity visibility based on centerOn
  useEffect(() => {
    if (!cesiumViewerRef.current || !entitiesRef.current || entitiesRef.current.length === 0) return;

    const shouldShowFrontrunner = centerOn === 'frontrunner';

    entitiesRef.current.forEach(entity => {
      if (!entity || !entity.properties) return;

      const styleRole = getStyleRole(entity);
      if (isAnyRoadMarker(styleRole)) {
        // All markers (corner + center + short side) are controlled only
        // by the Corner Points / Center Points toggles.
        return;
      }

      const category = getEntityProperty(entity, 'category');

      // Hide/show Frontrunner entities based on centerOn
      if (category && !String(category).startsWith('dispatch_')) {
        if (category === 'survey_path') {
          entity.show = shouldShowFrontrunner && showSurveyPaths;
        } else if (category === 'course' || category === 'course_connection') {
          entity.show = shouldShowFrontrunner && showCourses;
        } else if (category === 'travel') {
          entity.show = shouldShowFrontrunner && showTravels;
        } else if (category === 'intersection') {
          entity.show = shouldShowFrontrunner;
        } else {
          // Other Frontrunner entities (locations, etc.)
          entity.show = shouldShowFrontrunner;
        }
      }
    });

    if (cesiumViewerRef.current.scene) {
      cesiumViewerRef.current.scene.requestRender();
    }
  }, [centerOn, showSurveyPaths, showCourses, showTravels, showRoads, showClosedRoads, showGeometry3D]);

  // Update Dispatch entity visibility when toggles change
  useEffect(() => {
    if (!cesiumViewerRef.current || !entitiesRef.current || entitiesRef.current.length === 0) return;

    // If centerOn is dispatch, force all Dispatch entities visible regardless of toggle states
    const forceVisible = centerOn === 'dispatch';

    let dispatchLocationCount = 0;
    let dispatchSegmentCount = 0;
    let dispatchIntersectionCount = 0;
    let visibleLocationCount = 0;
    let visibleSegmentCount = 0;
    let visibleIntersectionCount = 0;

    // Check both entitiesRef and Cesium viewer entities
    const allEntities = [
      ...(entitiesRef.current || []),
      ...(cesiumViewerRef.current?.entities?.values || [])
    ];

    // Use Set to avoid duplicates
    const uniqueEntities = new Set(allEntities);

    uniqueEntities.forEach(entity => {
      if (!entity || !entity.properties) return;

      const styleRole = getStyleRole(entity);
      if (isAnyRoadMarker(styleRole)) {
        // Leave marker visibility entirely to the marker toggles
        return;
      }

      // Robust category extraction
      let category = null;
      if (entity.properties.category) {
        if (typeof entity.properties.category === 'object' && entity.properties.category._value !== undefined) {
          category = entity.properties.category._value;
        } else if (typeof entity.properties.category === 'string') {
          category = entity.properties.category;
        } else if (entity.properties.category.getValue) {
          category = entity.properties.category.getValue();
        }
      }

      if (category === 'dispatch_location') {
        dispatchLocationCount++;
        entity.show = forceVisible || showDispatchLocations;
        if (entity.show) visibleLocationCount++;
      } else if (category === 'dispatch_segment') {
        dispatchSegmentCount++;
        entity.show = forceVisible || showDispatchSegments;
        if (entity.show) visibleSegmentCount++;
      } else if (category === 'dispatch_intersection') {
        dispatchIntersectionCount++;
        entity.show = forceVisible || showDispatchIntersections;
        if (entity.show) visibleIntersectionCount++;
      } else if (category === 'dispatch_trolley') {
        entity.show = forceVisible || showDispatchTrolley;
      } else if (category === 'dispatch_watering') {
        entity.show = forceVisible || showDispatchWatering;
      } else if (category === 'dispatch_speed') {
        entity.show = forceVisible || showDispatchSpeed;
      }
    });

    // console.log(`[Consolidated Map] 📊 Dispatch visibility update:`, {
    // centerOn,
    // forceVisible,
    // showDispatchLocations,
    // showDispatchSegments,
    // showDispatchIntersections,
    // dispatchLocationCount,
    // dispatchSegmentCount,
    // dispatchIntersectionCount,
    // visibleLocationCount,
    // visibleSegmentCount,
    // visibleIntersectionCount
    // });

    if (cesiumViewerRef.current.scene) {
      cesiumViewerRef.current.scene.requestRender();
    }
  }, [showDispatchLocations, showDispatchSegments, showDispatchIntersections, showDispatchTrolley, showDispatchWatering, showDispatchSpeed, centerOn]);

  // Center camera when centerOn changes or when dispatch data loads
  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current && entitiesRef.current.length > 0) {
      // Add a small delay to ensure all entities are rendered
      setTimeout(() => {
        // console.log(`[Consolidated Map] 📹 Centering camera on: ${centerOn} (${entitiesRef.current.length} entities)`);
        centerCameraOnData(cesiumViewerRef.current, centerOn);
      }, 500);
    }
  }, [centerOn, mapLoaded, dispatchLocations, dispatchSegments, dispatchIntersections]);

  useEffect(() => {
    if (consolidatedData?.consolidated_locations || intersectionsData?.consolidated_intersections) {
      // Always update categories when data changes, not just when visibleCategories is empty
      const uniqueCategories = new Set();

      if (consolidatedData?.consolidated_locations) {
        consolidatedData.consolidated_locations.forEach(location => {
          // Add ALL individual categories, PRESERVE ORIGINAL CASE
          let category = location.category;
          // Handle null, undefined, empty string
          if (!category || category === '' || String(category).toLowerCase() === 'null' || String(category).toLowerCase() === 'undefined') {
            category = 'default';
          }
          // Preserve original case - only normalize whitespace
          if (typeof category === 'string') {
            category = category.trim();
          } else {
            category = String(category || 'default').trim();
          }
          // Skip empty categories, intersections, and gates after normalization
          // Intersections belong in Road Networks, gates should be hidden
          const normalizedCat = category.toLowerCase();
          if (category && category !== '' && normalizedCat !== 'intersection' && normalizedCat !== 'gate') {
            uniqueCategories.add(category);
          }
        });
      }

      // Don't add intersections to location categories - they belong in Road Networks section only
      // But add 'intersection' to visibleCategories by default so intersections are shown
      if (intersectionsData?.consolidated_intersections && intersectionsData.consolidated_intersections.length > 0) {
        // Filter out gates when checking
        const intersectionsOnly = intersectionsData.consolidated_intersections.filter(intersection => {
          const category = intersection.category || 'intersection';
          const normalizedCategory = typeof category === 'string' ? category.toLowerCase().trim() : String(category || '').toLowerCase().trim();
          return normalizedCategory !== 'gate';
        });
        if (intersectionsOnly.length > 0) {
          uniqueCategories.add('intersection'); // Add intersection to visibleCategories by default
        }
      }

      // Merge with existing visibleCategories to preserve user selections
      const mergedCategories = new Set(visibleCategories);
      uniqueCategories.forEach(cat => mergedCategories.add(cat));

      setVisibleCategories(mergedCategories);
      console.log('[Consolidated Map] 📊 Categories updated:', Array.from(mergedCategories).sort());
    }
  }, [consolidatedData, intersectionsData]);

  useEffect(() => {
    if (cesiumViewerRef.current) {
      // console.log('[Consolidated Map] 🔄 Updating entity visibility');
      // console.log('[Consolidated Map] 📊 visibleCategories:', Array.from(visibleCategories));
      // console.log('[Consolidated Map] 🛤️ showCourses:', showCourses);
      // console.log('[Consolidated Map] 🛤️ showTravels:', showTravels);
      // console.log('[Consolidated Map] 🛤️ showSurveyPaths:', showSurveyPaths);
      // console.log('[Consolidated Map] 📊 entitiesRef.current.length:', entitiesRef.current.length);

      let intersectionCount = 0;
      let visibleIntersectionCount = 0;
      let locationCount = 0;
      let visibleLocationCount = 0;
      let courseCount = 0;
      let visibleCourseCount = 0;
      let surveyPathCount = 0;
      let visibleSurveyPathCount = 0;
      let travelCount = 0;
      let visibleTravelCount = 0;
      let roadCount = 0;
      let visibleRoadCount = 0;

      // Check if categories have been initialized (if data exists but categories are empty, show everything initially)
      const categoriesInitialized = visibleCategories.size > 0 ||
        (!consolidatedData?.consolidated_locations && !intersectionsData?.consolidated_intersections);

      // Update ALL entities in the viewer, not just entitiesRef
      const allEntities = Array.from(cesiumViewerRef.current.entities.values);
      // console.log('[Consolidated Map] 📊 Total entities in viewer:', allEntities.length);

      allEntities.forEach((entity, entityIndex) => {
        // Hide all labels
        if (entity.label) {
          entity.label.show = false;
        }
        if (entity && entity.properties) {
          // Cesium properties might need getValue()
          let category = null;
          if (entity.properties.category) {
            if (entity.properties.category.getValue && typeof window !== 'undefined' && window.Cesium?.JulianDate) {
              try {
                category = entity.properties.category.getValue(window.Cesium.JulianDate.now());
              } catch (e) {
                category = entity.properties.category._value || entity.properties.category;
              }
            } else {
              category = entity.properties.category._value || entity.properties.category;
            }
          }

          // Normalize category for comparison
          const normalizedCategory = typeof category === 'string' ? category.toLowerCase().trim() : String(category || '').toLowerCase().trim();

          // Debug first few entities to see what categories we have
          if (entityIndex < 20 && (normalizedCategory.includes('road') || entity.name?.includes('Road'))) {
            console.log(`[Visibility Debug] Entity ${entityIndex}: name=${entity.name}, category=${category}, normalized=${normalizedCategory}, type=${typeof category}`);
          }

          if (normalizedCategory === 'intersection') {
            intersectionCount++;
            // Only show intersections (not gates)
            // Show everything initially if categories haven't been initialized yet
            const isVisible = !categoriesInitialized ||
              visibleCategories.has('intersection');
            entity.show = isVisible;
            if (isVisible) visibleIntersectionCount++;
            return;
          }

          // Always hide gates
          if (normalizedCategory === 'gate') {
            entity.show = false;
            return;
          }

          if (category === 'turn_path' || getStyleRole(entity) === 'turn_path') {
            entity.show = true;
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
            return;
          }

          if (category === 'travel') {
            travelCount++;
            entity.show = showTravels;
            if (showTravels) visibleTravelCount++;
            return;
          }

          // CRITICAL: Check for road markers FIRST, before road category check
          // Road markers have category='road' but should be handled separately
          const styleRole = getStyleRole(entity);

          // Log first few entities to debug styleRole extraction
          if (entityIndex < 10 && (category === 'road' || normalizedCategory === 'road')) {
            console.log(`[Visibility Debug] Entity ${entityIndex}: category=${category}, styleRole=${styleRole}, name=${entity.name}`);
          }

          // Corner markers - only respond to Corner Points toggle
          if (isCornerMarker(styleRole)) {
            const shouldShow = !!showCornerPoints;
            entity.show = shouldShow;

            // Debug logging
            if (entityIndex < 20 || entitiesRef.current.indexOf(entity) < 20) {
              console.log(`[Visibility] ✅ Corner marker ${entityIndex}: style_role=${styleRole}, show=${entity.show}, showCornerPoints=${showCornerPoints}, name=${entity.name?.getValue?.() || entity.name}`);
            }
            return; // 🔥 Do not let road/category logic touch this
          }

          // Center-ish markers (incl. short-side & road-intersection centers) - only respond to Center Points toggle
          if (isCenterMarker(styleRole)) {
            const shouldShow = !!showCenterPoints;
            entity.show = shouldShow;

            // Debug logging
            if (entityIndex < 20 || entitiesRef.current.indexOf(entity) < 20) {
              console.log(`[Visibility] ✅ Center marker ${entityIndex}: style_role=${styleRole}, show=${entity.show}, showCenterPoints=${showCenterPoints}, name=${entity.name?.getValue?.() || entity.name}`);
            }
            return; // 🔥 Do not let road/category logic touch this
          }

          // Check for road categories - handle both string and Property objects
          // NOTE: road_corner_marker and road_corner_side_center are handled above, NOT here
          const categoryStr = typeof category === 'string' ? category : String(category || '');
          const isRoadCategory = categoryStr === 'road' || categoryStr === 'road_centerline' ||
            categoryStr === 'road_polygon' || categoryStr === 'road_polygon_outline' ||
            categoryStr === 'road_shoulder' || categoryStr === 'road_surface' ||
            categoryStr === 'road_connection' || categoryStr === 'road_short_side_marker';
          // DO NOT include road_corner_marker or road_corner_side_center here - they're handled above

          if (isRoadCategory) {
            if (categoryStr === 'road' || categoryStr === 'road_polygon') {
              roadCount++;
            }
            // Check if this is a closed road
            const props = entity.properties;
            let isOpen = null;
            if (props?.is_open) {
              if (props.is_open.getValue && typeof window !== 'undefined' && window.Cesium?.JulianDate) {
                try {
                  isOpen = props.is_open.getValue(window.Cesium.JulianDate.now());
                } catch (e) {
                  isOpen = props.is_open._value || props.is_open;
                }
              } else {
                isOpen = props.is_open._value || props.is_open;
              }
            }
            // Handle null/undefined as open (default)
            const isClosed = isOpen === false || isOpen === 0 || isOpen === 'false' || isOpen === 'False';

            // Apply visibility based on road status (open/closed)
            // This applies to ALL road-related entities: polygon, outline, shoulder, surface, centerline, connection points, short side markers
            if (isClosed) {
              entity.show = showClosedRoads;
            } else {
              // Default to showing if is_open is null/undefined (assume open)
              entity.show = showRoads;
            }

            // Debug first few roads
            if (roadCount <= 5) {
              console.log(`[Visibility] Road entity: category=${categoryStr}, is_open=${isOpen}, isClosed=${isClosed}, show=${entity.show}, showRoads=${showRoads}, showClosedRoads=${showClosedRoads}, entity.name=${entity.name}`);
            }

            if (entity.show && (categoryStr === 'road' || categoryStr === 'road_polygon')) {
              visibleRoadCount++;
            }
            return;
          }

          if (category) {
            locationCount++;
            // Get category as string and normalize for comparison
            const categoryStr = typeof category === 'string' ? category.trim() : String(category || 'default').trim();
            const normalizedCategory = categoryStr.toLowerCase();

            // Show everything initially if categories haven't been initialized yet
            // Otherwise, check if any category in visibleCategories matches (case-insensitive)
            let isVisible = !categoriesInitialized;
            if (categoriesInitialized) {
              // Check case-insensitive match
              for (const visibleCat of visibleCategories) {
                if (String(visibleCat).toLowerCase() === normalizedCategory) {
                  isVisible = true;
                  break;
                }
              }
            }

            entity.show = isVisible;
            if (isVisible) visibleLocationCount++;
          }
        }
      });

      console.log(`[Consolidated Map] 📊 Visibility: ${visibleIntersectionCount}/${intersectionCount} intersections, ${visibleLocationCount}/${locationCount} locations, ${visibleCourseCount}/${courseCount} courses, ${visibleTravelCount}/${travelCount} travels, ${visibleSurveyPathCount}/${surveyPathCount} survey paths, ${visibleRoadCount}/${roadCount} roads visible`);
      console.log(`[Consolidated Map] 📊 Toggle states: showRoads=${showRoads}, showClosedRoads=${showClosedRoads}`);

      if (cesiumViewerRef.current.scene) {
        cesiumViewerRef.current.scene.requestRender();
      }
    }
  }, [visibleCategories, showCourses, showTravels, showSurveyPaths, showRoads, showClosedRoads, showGeometry3D, showCenterPoints, showCornerPoints, consolidatedData, intersectionsData]);

  const getPropertyValue = (prop) => {
    if (prop === undefined || prop === null) return prop;
    if (typeof prop === 'object') {
      if (prop.getValue && typeof window !== 'undefined' && window.Cesium?.JulianDate) {
        try {
          return prop.getValue(window.Cesium.JulianDate.now());
        } catch (e) {
          return prop._value !== undefined ? prop._value : null;
        }
      }
      if (prop._value !== undefined) {
        return prop._value;
      }
    }
    return prop;
  };

  const getEntityProperty = (entity, key) => {
    if (!entity?.properties) return null;
    return getPropertyValue(entity.properties[key]);
  };

  const clearTurnPathOverlay = (viewer) => {
    const overlay = turnPathOverlayRef.current;
    if (!overlay) return;

    if (overlay.pathEntity && viewer) {
      try {
        viewer.entities.remove(overlay.pathEntity);
      } catch (err) {
        console.warn('[Turn Path Overlay] Failed to remove path entity', err);
      }
    }

    const intersectionEntity = overlay.intersectionEntity;
    if (intersectionEntity?.polygon) {
      if (intersectionEntity._turnPathOriginalMaterial) {
        intersectionEntity.polygon.material = intersectionEntity._turnPathOriginalMaterial;
        delete intersectionEntity._turnPathOriginalMaterial;
      }
      if (intersectionEntity._turnPathOriginalOutline) {
        intersectionEntity.polygon.outlineColor = intersectionEntity._turnPathOriginalOutline;
        delete intersectionEntity._turnPathOriginalOutline;
      }
    }

    turnPathOverlayRef.current = { pathEntity: null, intersectionEntity: null };
  };

  const highlightIntersectionEntity = (viewer, intersectionName) => {
    if (!viewer || !intersectionName || !window?.Cesium) return null;
    const normalizedTarget = intersectionName.toLowerCase().trim();
    const entities = viewer.entities.values;

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const category = (getEntityProperty(entity, 'category') || '').toString().toLowerCase().trim();
      if (category !== 'intersection') continue;

      const entityName = (getEntityProperty(entity, 'name') || entity.name || '')
        .toString()
        .toLowerCase()
        .trim();

      if (!entityName || entityName !== normalizedTarget) continue;

      if (entity.polygon) {
        if (!entity._turnPathOriginalMaterial) {
          entity._turnPathOriginalMaterial = entity.polygon.material;
        }
        if (!entity._turnPathOriginalOutline) {
          entity._turnPathOriginalOutline = entity.polygon.outlineColor;
        }

        const fillHighlight = window.Cesium.Color.fromCssColorString('#FFD166').withAlpha(0.6);
        const outlineHighlight = window.Cesium.Color.fromCssColorString('#EF476F').withAlpha(0.95);
        entity.polygon.material = new window.Cesium.ColorMaterialProperty(fillHighlight);
        entity.polygon.outlineColor = outlineHighlight;
      }

      return entity;
    }

    return null;
  };

  // Marker type helpers - centralized logic for all marker visibility
  const getStyleRole = (entity) => getEntityProperty(entity, 'style_role');

  const isCornerMarker = (styleRole) => styleRole === 'road_corner_marker';

  const isCenterMarker = (styleRole) =>
    styleRole === 'road_corner_side_center' ||
    styleRole === 'road_intersection_center' ||
    styleRole === 'location_center_point' ||
    styleRole === 'intersection_center_point' ||
    styleRole === 'road_short_side_marker'; // Include short-side markers

  const isAnyRoadMarker = (styleRole) =>
    isCornerMarker(styleRole) || isCenterMarker(styleRole);

  const applyRoadThemeToEntity = (entity) => {
    if (!window.Cesium) return;
    const styleRole = getEntityProperty(entity, 'style_role');
    const category = getEntityProperty(entity, 'category');
    const shoulderColor = window.Cesium.Color.fromCssColorString(activeTheme.roadShoulderColor || '#D7DDE5')
      .withAlpha(activeTheme.roadShoulderAlpha ?? 0.85);
    const surfaceColor = window.Cesium.Color.fromCssColorString(activeTheme.roadSurfaceColor || '#3C3F58')
      .withAlpha(activeTheme.roadSurfaceAlpha ?? 0.95);
    const centerlineColor = window.Cesium.Color.fromCssColorString(activeTheme.roadCenterlineColor || '#F4B400')
      .withAlpha(activeTheme.roadCenterlineAlpha ?? 0.95);
    const outlineColor = window.Cesium.Color.fromCssColorString(activeTheme.polygonOutlineColor || activeTheme.roadShoulderColor || '#F2D492')
      .withAlpha(activeTheme.polygonOutlineAlpha ?? 0.95);

    if (entity.corridor) {
      const materialColor = styleRole === 'road_shoulder' ? shoulderColor : surfaceColor;
      entity.corridor.material = new window.Cesium.ColorMaterialProperty(materialColor);
    } else if (entity.polygon) {
      entity.polygon.material = new window.Cesium.ColorMaterialProperty(surfaceColor);
      entity.polygon.outlineColor = outlineColor;
    } else if (entity.polyline) {
      const isCenterline = styleRole === 'road_centerline' || category === 'road_centerline';
      entity.polyline.material = new window.Cesium.PolylineGlowMaterialProperty({
        color: isCenterline ? centerlineColor : outlineColor,
        glowPower: isCenterline ? (activeTheme.roadCenterlineGlowPower ?? 0.25) : 0.18
      });
    }
  };

  const applyLocationThemeToEntity = (entity) => {
    if (!window.Cesium || !entity?.polygon) return;
    const baseColor = getEntityProperty(entity, 'color') || '#FFFFFF';
    const isTop = getEntityProperty(entity, 'isTop') || getEntityProperty(entity, 'style_role') === 'location_top';
    const fillAlpha = isTop ? (activeTheme.locationTopAlpha ?? 0.97) : (activeTheme.locationFillAlpha ?? 0.94);
    const fillHex = isTop ? lightenColor(baseColor, activeTheme.locationTopLighten ?? 35) : baseColor;
    const outlineHex = lightenColor(baseColor, activeTheme.locationOutlineLighten ?? 25);
    const fillColor = window.Cesium.Color.fromCssColorString(fillHex).withAlpha(fillAlpha);
    const outlineColor = window.Cesium.Color.fromCssColorString(outlineHex).withAlpha(1.0);
    entity.polygon.material = new window.Cesium.ColorMaterialProperty(fillColor);
    entity.polygon.outlineColor = outlineColor;
  };

  useEffect(() => {
    const viewer = cesiumViewerRef.current;
    if (!viewer || !window?.Cesium) return;

    const cleanup = () => clearTurnPathOverlay(viewer);
    const pathResult = turnPathManager.computedPath;
    const coords =
      pathResult?.path?.smooth_geojson?.coordinates ||
      pathResult?.path?.geojson?.coordinates;

    if (!pathResult || !coords || coords.length < 2) {
      cleanup();
      return;
    }

    cleanup();

    // Get vehicle width (default to 7.3m for Komatsu 830E)
    const vehicleWidth = pathResult.vehicle?.vehicle_width_m || 7.3;
    const halfWidth = vehicleWidth / 2.0;

    // Create corridor positions (elevated above ground)
    const centerPositions = coords.map(coord =>
      window.Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 5) // 5m above ground
    );

    // Build corridor polygon by offsetting perpendicular to path
    const corridorPositions = [];

    for (let i = 0; i < centerPositions.length; i++) {
      const current = centerPositions[i];
      let forward;

      if (i < centerPositions.length - 1) {
        forward = window.Cesium.Cartesian3.subtract(
          centerPositions[i + 1],
          current,
          new window.Cesium.Cartesian3()
        );
      } else {
        forward = window.Cesium.Cartesian3.subtract(
          current,
          centerPositions[i - 1],
          new window.Cesium.Cartesian3()
        );
      }

      window.Cesium.Cartesian3.normalize(forward, forward);

      // Get perpendicular (right) vector
      const up = window.Cesium.Cartesian3.normalize(current, new window.Cesium.Cartesian3());
      const right = window.Cesium.Cartesian3.cross(forward, up, new window.Cesium.Cartesian3());
      window.Cesium.Cartesian3.normalize(right, right);

      // Offset left and right by half vehicle width
      const leftOffset = window.Cesium.Cartesian3.multiplyByScalar(right, -halfWidth, new window.Cesium.Cartesian3());
      const rightOffset = window.Cesium.Cartesian3.multiplyByScalar(right, halfWidth, new window.Cesium.Cartesian3());

      const leftPoint = window.Cesium.Cartesian3.add(current, leftOffset, new window.Cesium.Cartesian3());
      const rightPoint = window.Cesium.Cartesian3.add(current, rightOffset, new window.Cesium.Cartesian3());

      // Store for building polygon
      if (i === 0) {
        corridorPositions.push(leftPoint);
      } else {
        corridorPositions.unshift(rightPoint);
        corridorPositions.push(leftPoint);
      }
    }

    // Close the polygon
    if (corridorPositions.length > 0) {
      corridorPositions.push(corridorPositions[0]);
    }

    // Use green color for the corridor
    const color = window.Cesium.Color.LIME;

    const pathEntity = viewer.entities.add({
      name: `Turn Path: ${pathResult.from_road_id} → ${pathResult.to_road_id}`,
      polygon: {
        hierarchy: new window.Cesium.PolygonHierarchy(corridorPositions),
        material: color.withAlpha(0.7),
        outline: true,
        outlineColor: window.Cesium.Color.DARKGREEN,
        outlineWidth: 2,
        height: 5, // 5m above ground
        heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
      },
      properties: {
        category: 'turn_path',
        style_role: 'turn_path',
        intersection_name: pathResult.intersection_name,
        clearance_ok: pathResult.clearance?.vehicle_envelope_ok ?? null,
        outside_area_sqm: pathResult.clearance?.outside_area_sqm ?? null,
        path_length_m: pathResult.path?.length_m ?? null,
        vehicle_width_m: vehicleWidth
      }
    });

    const intersectionEntity = highlightIntersectionEntity(viewer, pathResult.intersection_name);
    turnPathOverlayRef.current = { pathEntity, intersectionEntity };

    if (centerPositions.length > 1) {
      const boundingSphere = window.Cesium.BoundingSphere.fromPoints(centerPositions);
      viewer.camera.flyToBoundingSphere(boundingSphere, {
        duration: 1.6,
        offset: new window.Cesium.HeadingPitchRange(0, -0.6, Math.max(boundingSphere.radius * 2.2, 150))
      });
    }

    return () => {
      cleanup();
    };
  }, [turnPathManager.computedPath]);

  const applyIntersectionThemeToEntity = (entity) => {
    if (!window.Cesium) return;
    const fillColor = window.Cesium.Color.fromCssColorString(activeTheme.intersectionFillColor || '#FF5F6D')
      .withAlpha(activeTheme.intersectionFillAlpha ?? 0.9);
    const outlineColor = window.Cesium.Color.fromCssColorString(activeTheme.intersectionOutlineColor || '#FFE066')
      .withAlpha(activeTheme.intersectionOutlineAlpha ?? 0.95);
    const labelBg = window.Cesium.Color.fromCssColorString(activeTheme.intersectionLabelBg || '#2B2D42')
      .withAlpha(0.85);

    if (entity.polygon) {
      entity.polygon.material = new window.Cesium.ColorMaterialProperty(fillColor);
      entity.polygon.outlineColor = outlineColor;
    }
    if (entity.point) {
      entity.point.color = fillColor;
      entity.point.outlineColor = outlineColor;
    }
    if (entity.label) {
      entity.label.show = false;
    }
  };

  const restyleEntitiesForTheme = () => {
    if (!cesiumViewerRef.current || !window.Cesium) return;
    const viewer = cesiumViewerRef.current;
    viewer.entities.values.forEach(entity => {
      if (!entity?.properties) return;
      const category = getEntityProperty(entity, 'category');
      if (!category) return;
      if (category === 'road' || category === 'road_centerline') {
        applyRoadThemeToEntity(entity);
      } else if (category === 'intersection') {
        applyIntersectionThemeToEntity(entity);
      } else if (typeof category === 'string' && !category.startsWith('dispatch_')) {
        applyLocationThemeToEntity(entity);
      }
    });
    viewer.scene?.requestRender();
  };

  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current) {
      restyleEntitiesForTheme();
    }
  }, [activeTheme, mapLoaded]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // ONLY use map dump data - no fallback
      // console.log('🗄️  Loading ONLY map dump data from SQL dump database...');

      const response = await fetch('/api/map-locations-from-dump');

      if (!response.ok) {
        let errorData;
        const responseText = await response.text();
        console.error('❌ Map dump API Error Response (raw):', responseText);
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          errorData = { message: responseText || `HTTP ${response.status} error` };
        }
        console.error('❌ Map dump API Error (parsed):', errorData);
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ Map dump locations loaded: ${result.total_locations}`);
      console.log(`🗄️  Source: ${result.source || 'map_location table'}`);

      // DEBUG: Log road markers data - CRITICAL FOR DEBUGGING
      console.log(`[Road Markers API] ⚠️ Received data from API:`, {
        total_locations: result.total_locations,
        corner_markers: 'DISABLED',
        has_road_side_markers: !!result.road_side_markers,
        side_markers_count: result.road_side_markers?.length || 0,
        all_keys: Object.keys(result),
        sample_side: result.road_side_markers?.[0]
      });

      if (!result.road_side_markers || result.road_side_markers.length === 0) {
        console.error(`[Road Markers API] ❌ NO SIDE MARKERS IN API RESPONSE!`);
      }

      setConsolidatedData(result);

      // ONLY use map dump intersections - no fallback
      const intersectionsResponse = await fetch('/api/map-intersections-from-dump');
      if (intersectionsResponse.ok) {
        const intersectionsResult = await intersectionsResponse.json();
        // console.log('🛣️ Map dump intersections loaded:', intersectionsResult.total_intersections);
        // console.log(`🗄️  Source: ${intersectionsResult.source || 'map_intersection table'}`);
        setIntersectionsData(intersectionsResult);
      } else {
        console.error('❌ Could not fetch map dump intersections:', intersectionsResponse.status, await intersectionsResponse.text());
      }

      // Fetch roads (prefer GeoServer, fallback to DB)
      // console.log('🛣️ Fetching roads (preferring GeoServer WFS)...');
      let roadsResponse = await fetch('/api/map-roads-from-dump?source=geoserver').catch(() => null);
      let roadsSourceLabel = 'geoserver';

      if (!roadsResponse || !roadsResponse.ok) {
        if (roadsResponse && !roadsResponse.ok) {
          const errorText = await roadsResponse.text();
          // console.warn('⚠️ GeoServer roads fetch failed:', roadsResponse.status, errorText);
        } else {
          // console.warn('⚠️ GeoServer roads request failed, falling back to database');
        }
        roadsSourceLabel = 'database';
        roadsResponse = await fetch('/api/map-roads-from-dump');
      }

      if (roadsResponse && roadsResponse.ok) {
        const roadsResult = await roadsResponse.json();
        // console.log(`🛣️ Roads loaded (${roadsSourceLabel}):`, roadsResult.total_roads);
        // console.log(`🗄️  Source: ${roadsResult.source || roadsSourceLabel}`);
        if (roadsResult.roads && roadsResult.roads.length > 0) {
          // console.log('🛣️ Sample road:', roadsResult.roads[0]);
        }
        setRoadsData(roadsResult);
      } else if (roadsResponse) {
        const errorText = await roadsResponse.text();
        console.error('❌ Could not fetch roads from fallback:', roadsResponse.status, errorText);
      } else {
        console.error('❌ Could not fetch roads from any source');
      }


      // SKIP all other data - ONLY show map dump data
      // console.log('⏭️  Skipping survey paths, courses, travels, road markings, and dispatch data - showing ONLY map dump data');

      // Fetch courses data for tooltip information only (not rendered)
      const coursesResponse = await fetch('/api/courses');
      if (coursesResponse.ok) {
        const coursesResult = await coursesResponse.json();
        console.log(`🛤️ Loaded ${coursesResult.total_courses} courses for tooltip data`);
        setCoursesData(coursesResult);
      }

      // Fetch road markers (pre-calculated corners and side centers)
      const markersResponse = await fetch('/api/road-markers');
      if (markersResponse.ok) {
        const markersResult = await markersResponse.json();
        console.log(`📍 Loaded ${markersResult.total_markers} road markers (${markersResult.total_corners} corners, ${markersResult.total_side_centers} side centers)`);
        setRoadMarkersData(markersResult);
      } else {
        const errorText = await markersResponse.text();
        console.error('❌ Could not fetch road markers:', markersResponse.status, errorText);
      }


      /* COMMENTED OUT - Only showing map dump data
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
      
      // Fetch Dispatch data (always load for proper centering)
      console.log('📦 Fetching ALL Dispatch data...');
      
      // Locations
      const dispatchLocationsResponse = await fetch('/api/dispatch-locations');
      if (dispatchLocationsResponse.ok) {
        const dispatchLocationsResult = await dispatchLocationsResponse.json();
        console.log(`📍 Loaded ${dispatchLocationsResult.length} dispatch locations`);
        setDispatchLocations(dispatchLocationsResult);
      }
      
      // Lane Segments
      const dispatchSegmentsResponse = await fetch('/api/dispatch-segments');
      if (dispatchSegmentsResponse.ok) {
        const dispatchSegmentsResult = await dispatchSegmentsResponse.json();
        console.log(`🛣️ Loaded ${dispatchSegmentsResult.length} dispatch segments`);
        setDispatchSegments(dispatchSegmentsResult);
      }
      
      // Trolley Lines
      const dispatchTrolleyResponse = await fetch('/api/dispatch-trolley');
      if (dispatchTrolleyResponse.ok) {
        const dispatchTrolleyResult = await dispatchTrolleyResponse.json();
        console.log(`🔌 Loaded ${dispatchTrolleyResult.total_segments} trolley segments`);
        setDispatchTrolley(dispatchTrolleyResult.segments);
      }
      
      // Watering Stations
      const dispatchWateringResponse = await fetch('/api/dispatch-watering');
      if (dispatchWateringResponse.ok) {
        const dispatchWateringResult = await dispatchWateringResponse.json();
        console.log(`💧 Loaded ${dispatchWateringResult.total_stations} watering stations`);
        setDispatchWatering(dispatchWateringResult.stations);
      }
      
      // Speed Monitoring
      const dispatchSpeedResponse = await fetch('/api/dispatch-speed');
      if (dispatchSpeedResponse.ok) {
        const dispatchSpeedResult = await dispatchSpeedResponse.json();
        console.log(`🚦 Loaded ${dispatchSpeedResult.total_points} speed monitoring points`);
        setDispatchSpeed(dispatchSpeedResult.points);
      }
      
      // Dispatch Intersections
      const dispatchIntersectionsResponse = await fetch('/api/dispatch-intersections');
      if (dispatchIntersectionsResponse.ok) {
        const dispatchIntersectionsResult = await dispatchIntersectionsResponse.json();
        console.log(`🚧 Loaded ${dispatchIntersectionsResult.total_intersections} dispatch intersections`);
        setDispatchIntersections(dispatchIntersectionsResult.intersections);
      }
      */

      // Check if we have map dump locations
      if (!result.consolidated_locations || result.consolidated_locations.length === 0) {
        // console.warn('⚠️ No map dump locations found in response');
        setMapError('No map dump locations data available');
      } else {
        // console.log(`✅ Map dump data loaded: ${result.total_locations} locations`);
      }

    } catch (error) {
      console.error('Error fetching map dump data:', error);
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

  // Helper to create a colored dot image for billboards
  const createColoredDot = (color, size = 20) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();
    return canvas.toDataURL();
  };

  const addRoadMarkersToCesium = (cesiumViewer) => {
    console.log('[Road Markers] ⚠️ FUNCTION CALLED - addRoadMarkersToCesium');
    console.log('[Road Markers] consolidatedData:', consolidatedData);

    if (!consolidatedData) {
      console.error('[Road Markers] ❌ No consolidatedData available - markers cannot be added!');
      return;
    }

    console.log('[Road Markers] ✅ consolidatedData exists');
    console.log('[Road Markers] consolidatedData keys:', Object.keys(consolidatedData));
    console.log('[Road Markers] consolidatedData.road_corner_markers:', consolidatedData.road_corner_markers);
    console.log('[Road Markers] consolidatedData.road_side_markers:', consolidatedData.road_side_markers);

    const corners = consolidatedData.road_corner_markers || [];
    const sideCenters = consolidatedData.road_side_markers || [];

    console.log(`[Road Markers] Extracted: ${corners.length} corners, ${sideCenters.length} side centers`);

    if (corners.length === 0 && sideCenters.length === 0) {
      console.warn('[Road Markers] ⚠️ No road markers available in data!');
      console.warn('[Road Markers] Full consolidatedData:', consolidatedData);
      return;
    }

    // CRITICAL: Remove existing road markers before adding new ones to prevent duplicates
    const markersToRemove = [];
    entitiesRef.current = entitiesRef.current.filter(entity => {
      const styleRole = entity.properties?.style_role?.getValue ?
        entity.properties.style_role.getValue() :
        entity.properties?.style_role;

      if (styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center') {
        markersToRemove.push(entity);
        return false; // Remove from entitiesRef
      }
      return true; // Keep other entities
    });

    // Remove entities from Cesium viewer
    markersToRemove.forEach(entity => {
      try {
        cesiumViewer.entities.remove(entity);
      } catch (error) {
        console.warn('[Road Markers] Error removing existing marker:', error);
      }
    });

    if (markersToRemove.length > 0) {
      console.log(`[Road Markers] Removed ${markersToRemove.length} existing markers`);
    }

    console.log(`[Road Markers] Adding ${sideCenters.length} side centers (corner markers disabled)`);

    let addedCount = 0;

    // Corner markers rendering DISABLED per user request
    // User does not want to see corner markers in sidebar or on map

    // Render side center markers
    sideCenters.forEach((marker, index) => {
      if (!marker.lat || !marker.lon) {
        console.warn(`[Road Markers] Skipping side center ${index} (${marker.name}): missing lat/lon`, marker);
        return;
      }

      // DEBUG: Log first few marker names
      if (index < 5) {
        console.log(`[Road Markers] Adding side center ${index}: ${marker.name} at (${marker.lat}, ${marker.lon}), showCenterPoints=${showCenterPoints}`);
      }

      try {
        // Add significant height offset to ensure markers are visible above terrain
        const position = window.Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat, 50);

        const entity = cesiumViewer.entities.add({
          id: `road_side_center_${marker.name}_${index}`, // Unique ID for debugging
          position: position,
          point: {
            pixelSize: 6,
            color: window.Cesium.Color.LIME,
            outlineColor: window.Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.05)
          },
          distanceDisplayCondition: new window.Cesium.DistanceDisplayCondition(0.0, 2000.0),
          properties: {
            name: marker.name,
            category: 'road',
            style_role: 'road_corner_side_center',
            marker_type: 'side_center',
            metadata: marker.road_marker_metadata
          },
          show: showCenterPoints // Ensure visibility is set correctly
        });

        // Verify entity was added to viewer
        const entityInViewer = cesiumViewer.entities.getById(entity.id);
        if (!entityInViewer) {
          console.error(`[Road Markers] Failed to add side center entity ${entity.id} to viewer!`);
        }

        entitiesRef.current.push(entity);
        addedCount++;

        // Verify entity was created
        if (index < 3) {
          console.log(`[Road Markers] ✅ Created side center entity: ${entity.id}, show=${entity.show}, position=${entity.position}`);
        }
      } catch (error) {
        console.error(`[Road Markers] Error adding side center ${index} (${marker.name}):`, error, marker);
      }
    });

    console.log(`[Road Markers] ✅ Added ${addedCount} side center markers (corner markers disabled)`);
    console.log(`[Road Markers] Total entities in viewer: ${cesiumViewer.entities.values.length}`);
    console.log(`[Road Markers] Total entities in ref: ${entitiesRef.current.length}`);

    // CRITICAL: Force all markers to be visible based on toggle states
    const allMarkers = entitiesRef.current.filter(e => {
      const styleRole = getStyleRole(e);
      return isAnyRoadMarker(styleRole);
    });

    console.log(`[Road Markers] Verification: Found ${allMarkers.length} marker entities in ref`);

    // Force visibility on all markers
    allMarkers.forEach((entity, idx) => {
      const styleRole = getStyleRole(entity);

      if (isCornerMarker(styleRole)) {
        entity.show = !!showCornerPoints;
      } else if (isCenterMarker(styleRole)) {
        entity.show = !!showCenterPoints;
      }

      if (idx < 5) {
        console.log(`[Road Markers] Marker ${idx}: ${entity.properties?.name?.getValue?.() || entity.properties?.name}, style_role=${styleRole}, show=${entity.show}, toggle=${isCornerMarker(styleRole) ? showCornerPoints : showCenterPoints}`);
      }
    });

    console.log(`[Road Markers] ✅ Forced visibility: ${allMarkers.filter(e => e.show).length}/${allMarkers.length} markers visible`);

    // CRITICAL: Verify markers are actually in Cesium viewer and queryable
    const viewerMarkers = Array.from(cesiumViewer.entities.values).filter(e => {
      const styleRole = getStyleRole(e);
      return isAnyRoadMarker(styleRole);
    });
    console.log(`[Road Markers] 🔍 Verification: Found ${viewerMarkers.length} markers in Cesium viewer entities`);

    // Check first few markers in viewer
    viewerMarkers.slice(0, 5).forEach((entity, idx) => {
      const styleRole = entity.properties?.style_role?.getValue ?
        entity.properties.style_role.getValue() :
        entity.properties?.style_role;
      const name = entity.properties?.name?.getValue?.() || entity.properties?.name;
      console.log(`[Road Markers] Viewer marker ${idx}: ${name}, style_role=${styleRole}, show=${entity.show}, position=${entity.position?.getValue?.() || entity.position}`);
    });

    // Force render multiple times to ensure visibility
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
      // Also force a camera update to trigger rendering
      setTimeout(() => {
        if (cesiumViewer.scene) {
          cesiumViewer.scene.requestRender();
          console.log(`[Road Markers] ✅ Second render requested after timeout`);
        }
      }, 100);
      console.log(`[Road Markers] ✅ Requested scene render`);
    }
  };


  const formatTooltipContent = (entity, isHover = false) => {
    if (!entity || !entity.properties) return '';
    const props = entity.properties;

    // Helper to get property value (handles Cesium Property objects)
    const getProp = (key) => {
      const prop = props[key];
      if (prop === undefined || prop === null) return undefined;
      if (typeof prop === 'object' && prop.getValue && typeof prop.getValue === 'function') {
        try {
          return prop.getValue();
        } catch (e) {
          return prop._value !== undefined ? prop._value : prop;
        }
      }
      return prop;
    };

    if (getProp('isOutline') || getProp('isTopOutline')) {
      return '';
    }

    const category = getProp('category') || 'N/A';
    const displayName = getCategoryDisplayName(category);

    // Simple list format - no card, single column
    const items = [];

    // Name
    items.push(`NAME: ${getProp('name') || 'N/A'}`);

    // Category
    items.push(`CATEGORY: ${displayName || category}`);

    // For hover tooltips, only show basic info
    if (isHover) {
      const styleRole = getProp('style_role');

      // Road corner/side-center markers: show marker type, width, and length
      if (styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center') {
        const metadata = getProp('metadata');
        if (styleRole === 'road_corner_marker') {
          items.push(`TYPE: Corner Marker`);
          if (metadata?.corner_index) items.push(`CORNER: ${metadata.corner_index}`);
        } else {
          items.push(`TYPE: Side Center Marker`);
          if (metadata?.pair_rank) items.push(`SIDE: ${metadata.pair_rank}`);
        }
        // Show dimensions
        if (metadata?.road_width_m !== undefined && metadata?.road_width_m !== null) {
          items.push(`WIDTH: ${Math.round(metadata.road_width_m)} m`);
        }
        if (metadata?.road_length_m !== undefined && metadata?.road_length_m !== null) {
          items.push(`LENGTH: ${Math.round(metadata.road_length_m)} m`);
        }
        return items.join('<br>');
      }

      // Roads: show width, length and open status
      if (category === 'road' || category === 'road_centerline' || category === 'road_connection') {
        const roadWidth = getProp('width_m');
        if (roadWidth !== undefined && roadWidth !== null) {
          items.push(`WIDTH: ${Math.round(roadWidth)} m`);
        }
        const roadLen = getProp('length_m');
        if (roadLen !== undefined) {
          items.push(`LENGTH: ${Math.round(roadLen)} m`);
        }
        const isOpen = getProp('is_open');
        if (isOpen !== undefined) items.push(`IS OPEN: ${isOpen ? 'Yes' : 'No'}`);
      }
      // Locations/Intersections: show area, perimeter and open status
      else if (category === 'intersection' || category === 'gate' || category) {
        const areaSqm = getProp('area_sqm');
        if (areaSqm) items.push(`AREA: ${Math.round(areaSqm).toLocaleString()} m²`);
        const perimeterM = getProp('perimeter_m');
        if (perimeterM) items.push(`PERIMETER: ${(perimeterM / 1000).toFixed(2)} km`);
        const isOpen = getProp('is_open');
        if (isOpen !== undefined) items.push(`IS OPEN: ${isOpen ? 'Yes' : 'No'}`);
      }
      // Return early for hover - don't show extended info
      return items.join('<br>');
    }

    // Travel-specific fields
    if (category === 'travel') {
      if (getProp('active') !== undefined) items.push(`ACTIVE: ${getProp('active') ? 'Yes' : 'No'}`);
      if (getProp('closed') !== undefined) items.push(`CLOSED: ${getProp('closed') ? 'Yes' : 'No'}`);
      if (getProp('aht_profile_name')) items.push(`AHT PROFILE NAME: ${getProp('aht_profile_name')}`);
      if (getProp('color')) items.push(`COLOR: ${getProp('color')}`);
      const courseAttrsVal = getProp('course_attributes_value');
      if (courseAttrsVal !== undefined && courseAttrsVal !== null) {
        items.push(`COURSE ATTRIBUTES VALUE: ${courseAttrsVal}`);
      }
      if (getProp('course_cid')) items.push(`COURSE CID: ${getProp('course_cid')}`);
      if (getProp('course_oid')) items.push(`COURSE OID: ${getProp('course_oid')}`);
      const endLat = getProp('end_latitude');
      if (endLat !== undefined) items.push(`END LATITUDE: ${endLat}`);
      const endLon = getProp('end_longitude');
      if (endLon !== undefined) items.push(`END LONGITUDE: ${endLon}`);
      if (getProp('from_location_cid')) items.push(`FROM LOCATION CID: ${getProp('from_location_cid')}`);
      if (getProp('from_location_name')) items.push(`FROM: ${getProp('from_location_name')}`);
      const inclFactor = getProp('inclination_factor');
      if (inclFactor !== undefined && inclFactor !== null) {
        items.push(`INCLINATION FACTOR: ${inclFactor}`);
      }
      if (getProp('inflections')) items.push(`INFLECTIONS: ${getProp('inflections')}`);
      if (getProp('road_type')) items.push(`ROAD TYPE: ${getProp('road_type')}`);
      const segEnd = getProp('segment_end');
      if (segEnd !== undefined && segEnd !== null) {
        items.push(`SEGMENT END: ${Math.round(segEnd)} m`);
      }
      const segStart = getProp('segment_start');
      if (segStart !== undefined && segStart !== null) {
        items.push(`SEGMENT START: ${Math.round(segStart)} m`);
      }
      if (getProp('spline_oid')) items.push(`SPLINE OID: ${getProp('spline_oid')}`);
      const startDir = getProp('start_direction');
      if (startDir !== undefined && startDir !== null) {
        items.push(`START DIRECTION: ${startDir}`);
      }
      const startLat = getProp('start_latitude');
      if (startLat !== undefined) items.push(`START LATITUDE: ${startLat}`);
      const startLon = getProp('start_longitude');
      if (startLon !== undefined) items.push(`START LONGITUDE: ${startLon}`);
      if (getProp('to_location_cid')) items.push(`TO LOCATION CID: ${getProp('to_location_cid')}`);
      if (getProp('to_location_name')) items.push(`TO: ${getProp('to_location_name')}`);
      if (getProp('total_points')) items.push(`TOTAL POINTS: ${getProp('total_points')}`);
      if (getProp('travel_cid')) items.push(`TRAVEL CID: ${getProp('travel_cid')}`);
      if (getProp('travel_id')) items.push(`TRAVEL ID: ${getProp('travel_id')}`);
      const travelLen = getProp('travel_length_m');
      if (travelLen !== undefined) {
        items.push(`TRAVEL LENGTH: ${Math.round(travelLen)} m (${(travelLen / 1000).toFixed(2)} km)`);
      }
      if (getProp('travel_oid')) items.push(`TRAVEL OID: ${getProp('travel_oid')}`);
    }
    // Course-specific fields
    else if (category === 'course') {
      if (getProp('total_points')) items.push(`POINTS: ${getProp('total_points')}`);
      const courseLen = getProp('length_m');
      if (courseLen !== undefined) {
        items.push(`LENGTH: ${Math.round(courseLen)} m (${(courseLen / 1000).toFixed(2)} km)`);
      }
      if (getProp('road_type')) items.push(`ROAD TYPE: ${getProp('road_type')}`);
      if (getProp('course_cid')) items.push(`COURSE CID: ${getProp('course_cid')}`);
      if (getProp('course_oid')) items.push(`COURSE OID: ${getProp('course_oid')}`);
    }
    // Survey path-specific fields
    else if (category === 'survey_path') {
      if (getProp('total_points')) items.push(`POINTS: ${getProp('total_points')}`);
      const pathLen = getProp('length_m');
      if (pathLen !== undefined) {
        items.push(`LENGTH: ${Math.round(pathLen)} m (${(pathLen / 1000).toFixed(2)} km)`);
      }
      if (getProp('path_oid')) items.push(`PATH OID: ${getProp('path_oid')}`);
    }
    // Dispatch location fields
    else if (category === 'dispatch_location') {
      if (getProp('location_id')) items.push(`LOCATION ID: ${getProp('location_id')}`);
      if (getProp('unit_type')) items.push(`UNIT TYPE: ${getProp('unit_type')}`);
      if (getProp('location_category')) items.push(`CATEGORY: ${getProp('location_category')}`);
      if (getProp('pit_name')) items.push(`PIT: ${getProp('pit_name')}`);
      if (getProp('region_name')) items.push(`REGION: ${getProp('region_name')}`);
      const elev = getProp('elevation_m');
      if (elev) items.push(`ELEVATION: ${Math.round(elev)} m`);
      if (getProp('source')) items.push(`SOURCE: ${getProp('source')}`);
    }
    // Dispatch segment fields
    else if (category === 'dispatch_segment') {
      if (getProp('lane_id')) items.push(`LANE ID: ${getProp('lane_id')}`);
      if (getProp('road_id')) items.push(`ROAD ID: ${getProp('road_id')}`);
      if (getProp('direction')) items.push(`DIRECTION: ${getProp('direction')}`);
      const segLen = getProp('length_m');
      if (segLen) items.push(`LENGTH: ${Math.round(segLen)} m (${(segLen / 1000).toFixed(2)} km)`);
      const timeEmpty = getProp('time_empty_seconds');
      if (timeEmpty) items.push(`TIME EMPTY: ${Math.round(timeEmpty)} s`);
      const timeLoaded = getProp('time_loaded_seconds');
      if (timeLoaded) items.push(`TIME LOADED: ${Math.round(timeLoaded)} s`);
      const isClosed = getProp('is_closed');
      if (isClosed !== undefined) items.push(`CLOSED: ${isClosed ? 'Yes' : 'No'}`);
    }
    // Short side marker fields
    if (category === 'road_short_side_marker') {
      const markerType = getProp('marker_type');
      const length = getProp('length_m');
      const centerLon = getProp('center_lon');
      const centerLat = getProp('center_lat');

      items.push(`SHORT SIDE MARKER: ${markerType === 'short_side_1' ? 'Side 1' : 'Side 2'}`);
      if (length !== undefined && length !== null && !isNaN(length)) {
        items.push(`LENGTH: ${typeof length === 'number' ? length.toFixed(2) : length} m`);
      }
      if (centerLon !== undefined && centerLon !== null && centerLat !== undefined && centerLat !== null) {
        const lon = typeof centerLon === 'number' ? centerLon.toFixed(6) : centerLon;
        const lat = typeof centerLat === 'number' ? centerLat.toFixed(6) : centerLat;
        items.push(`CENTER: (${lon}, ${lat})`);
      }
      if (getProp('road_id')) items.push(`ROAD ID: ${getProp('road_id')}`);
      if (getProp('name')) items.push(`ROAD: ${getProp('name')}`);
    }

    // Road corner and side-center marker fields
    const styleRole = getProp('style_role');
    if (styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center') {
      const metadata = getProp('metadata');
      const markerType = getProp('marker_type');

      if (styleRole === 'road_corner_marker') {
        items.push(`--- CORNER MARKER ---`);
        if (metadata) {
          if (metadata.corner_index) items.push(`CORNER: ${metadata.corner_index}`);
          if (metadata.angle_deg !== undefined) {
            items.push(`ANGLE: ${Math.round(metadata.angle_deg)}°`);
          }
          if (metadata.angle_diff_deg !== undefined) {
            items.push(`ANGLE DIFF (90°/270°): ${metadata.angle_diff_deg.toFixed(1)}°`);
          }
        }
      } else if (styleRole === 'road_corner_side_center') {
        items.push(`--- SIDE CENTER MARKER ---`);
        if (metadata) {
          if (metadata.pair_rank) items.push(`SIDE: ${metadata.pair_rank}`);
          if (metadata.segment_length_m !== undefined) {
            items.push(`SEGMENT LENGTH: ${metadata.segment_length_m.toFixed(2)} m`);
          }
          if (metadata.overlap_length_m !== undefined && metadata.overlap_length_m > 0) {
            items.push(`OVERLAP WITH INTERSECTION: ${metadata.overlap_length_m.toFixed(2)} m`);
          }
          if (metadata.overlapping_entity_name) {
            items.push(`OVERLAPPING: ${metadata.overlapping_entity_name}`);
          }
        }
      }

      // Common fields for both marker types
      if (metadata) {
        if (metadata.road_name) items.push(`ROAD: ${metadata.road_name}`);

        // Road dimensions - show prominently
        items.push(`--- ROAD DIMENSIONS ---`);
        if (metadata.road_width_m !== undefined && metadata.road_width_m !== null) {
          items.push(`WIDTH: ${Math.round(metadata.road_width_m)} m`);
        } else {
          items.push(`WIDTH: N/A`);
        }
        if (metadata.road_length_m !== undefined && metadata.road_length_m !== null) {
          items.push(`LENGTH: ${Math.round(metadata.road_length_m)} m`);
        } else {
          items.push(`LENGTH: N/A`);
        }

        // Other metadata
        if (metadata.proximity_m !== undefined && metadata.proximity_m !== null) {
          items.push(`PROXIMITY TO INTERSECTION: ${metadata.proximity_m.toFixed(2)} m`);
        }
        if (metadata.nearest_entity) {
          items.push(`NEAREST: ${metadata.nearest_entity}`);
        }
      }
    }
    // Road-specific fields (from courses)
    else if (category === 'road' || category === 'road_centerline' || category === 'road_connection') {
      const roadLen = getProp('length_m');
      if (roadLen !== undefined) {
        items.push(`LENGTH: ${Math.round(roadLen)} m (${(roadLen / 1000).toFixed(2)} km)`);
      }
      const isOpen = getProp('is_open');
      if (isOpen !== undefined) items.push(`IS OPEN: ${isOpen ? 'Yes' : 'No'}`);
      if (getProp('from_location')) items.push(`FROM: ${getProp('from_location')}`);
      if (getProp('to_location')) items.push(`TO: ${getProp('to_location')}`);

      // Short sides information (for polygon roads)
      const shortSidesInfo = getProp('short_sides_info');
      if (shortSidesInfo) {
        try {
          const ssi = typeof shortSidesInfo === 'string' ? JSON.parse(shortSidesInfo) : shortSidesInfo;
          if (ssi.short_side_1 && ssi.short_side_2) {
            items.push(`--- SHORT SIDES (Polygon Roads) ---`);
            items.push(`SHORT SIDE 1: ${ssi.short_side_1.length_m?.toFixed(2) || 'N/A'} m`);
            items.push(`  Center: (${ssi.short_side_1.center_lon?.toFixed(6) || 'N/A'}, ${ssi.short_side_1.center_lat?.toFixed(6) || 'N/A'})`);
            items.push(`SHORT SIDE 2: ${ssi.short_side_2.length_m?.toFixed(2) || 'N/A'} m`);
            items.push(`  Center: (${ssi.short_side_2.center_lon?.toFixed(6) || 'N/A'}, ${ssi.short_side_2.center_lat?.toFixed(6) || 'N/A'})`);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      // Width and Road ID after short sides
      const roadWidth = getProp('width_m');
      if (roadWidth !== undefined && roadWidth !== null) {
        items.push(`WIDTH M: ${roadWidth.toFixed(2)} m`);
      }
      if (getProp('road_id')) items.push(`ROAD ID: ${getProp('road_id')}`);


      // Extended course information from course_data (from MySQL)
      const courseData = getProp('course_data');
      if (courseData) {
        const cd = courseData;
        items.push(`--- COURSE INFORMATION (MySQL) ---`);
        if (cd.course_oid) items.push(`COURSE OID: ${cd.course_oid}`);
        if (cd.course_cid) items.push(`COURSE CID: ${cd.course_cid}`);
        if (cd.aht_profile_name) items.push(`AHT PROFILE: ${cd.aht_profile_name}`);
        if (cd.road_type) items.push(`ROAD TYPE: ${cd.road_type}`);
        if (cd.inclination_factor !== undefined && cd.inclination_factor !== null) {
          items.push(`INCLINATION FACTOR: ${cd.inclination_factor}`);
        }
        if (cd.start_direction !== undefined && cd.start_direction !== null) {
          items.push(`START DIRECTION: ${cd.start_direction}`);
        }
        if (cd.inflections) items.push(`INFLECTIONS: ${cd.inflections}`);
        if (cd.course_attributes_value !== undefined && cd.course_attributes_value !== null) {
          items.push(`COURSE ATTRIBUTES VALUE: ${cd.course_attributes_value}`);
        }
        if (cd.spline_oid) items.push(`SPLINE OID: ${cd.spline_oid}`);
        if (cd.coursegeometry_oid) items.push(`COURSE GEOMETRY OID: ${cd.coursegeometry_oid}`);
        if (cd.course_attributes_oid) items.push(`COURSE ATTRIBUTES OID: ${cd.course_attributes_oid}`);
      }
    }
    // Location/Intersection fields with extended info
    else {
      const totalPoints = getProp('total_points');
      if (totalPoints) items.push(`POINTS: ${totalPoints}`);
      const areaSqm = getProp('area_sqm');
      if (areaSqm) items.push(`AREA: ${Math.round(areaSqm).toLocaleString()} m²`);
      const perimeterM = getProp('perimeter_m');
      if (perimeterM) items.push(`PERIMETER: ${Math.round(perimeterM)} m (${(perimeterM / 1000).toFixed(2)} km)`);

      // Basic location status fields
      const isOpen = getProp('is_open');
      if (isOpen !== undefined) items.push(`IS OPEN: ${isOpen ? 'Yes' : 'No'}`);
      const onHoldDispatcher = getProp('on_hold_by_dispatcher');
      if (onHoldDispatcher !== undefined) items.push(`ON HOLD BY DISPATCHER: ${onHoldDispatcher ? 'Yes' : 'No'}`);
      const onHoldOperator = getProp('on_hold_by_operator');
      if (onHoldOperator !== undefined) items.push(`ON HOLD BY OPERATOR: ${onHoldOperator ? 'Yes' : 'No'}`);

      // Extended pit_loc information
      if (getProp('pit_loc_oid')) items.push(`PIT_LOC OID: ${getProp('pit_loc_oid')}`);
      if (getProp('pit_loc_cid')) items.push(`PIT_LOC CID: ${getProp('pit_loc_cid')}`);
      if (getProp('location_survey')) items.push(`LOCATION SURVEY: ${getProp('location_survey')}`);
      if (getProp('def_dump_prof')) items.push(`DEF DUMP PROF: ${getProp('def_dump_prof')}`);
      if (getProp('cur_dump_prof')) items.push(`CUR DUMP PROF: ${getProp('cur_dump_prof')}`);
      if (getProp('inclination')) items.push(`INCLINATION: ${getProp('inclination')}`);
      if (getProp('mixed_location_current_type')) items.push(`MIXED LOCATION CURRENT TYPE: ${getProp('mixed_location_current_type')}`);
      const crusherInterface = getProp('crusher_interface_enabled');
      if (crusherInterface !== undefined) items.push(`CRUSHER INTERFACE: ${crusherInterface ? 'Yes' : 'No'}`);
      const autoPause = getProp('auto_pause_enabled');
      if (autoPause !== undefined) items.push(`AUTO PAUSE: ${autoPause ? 'Yes' : 'No'}`);
      const minSteering = getProp('min_steering_radius');
      if (minSteering !== undefined && minSteering !== null) items.push(`MIN STEERING RADIUS: ${minSteering} mm`);
      const maxAccel = getProp('max_acceleration');
      if (maxAccel !== undefined && maxAccel !== -1) items.push(`MAX ACCELERATION: ${maxAccel}`);
      const maxDecel = getProp('max_deceleration');
      if (maxDecel !== undefined && maxDecel !== -1) items.push(`MAX DECELERATION: ${maxDecel}`);
      const maxForward = getProp('max_forward_speed');
      if (maxForward !== undefined && maxForward !== -1) items.push(`MAX FORWARD SPEED: ${maxForward} mm/s`);
      const maxReverse = getProp('max_reverse_speed');
      if (maxReverse !== undefined && maxReverse !== -1) items.push(`MAX REVERSE SPEED: ${maxReverse} mm/s`);
      const crushBedHold = getProp('crush_bed_hold_time');
      if (crushBedHold !== undefined && crushBedHold !== null) items.push(`CRUSH BED HOLD TIME: ${crushBedHold} s`);
      const highdumpNode = getProp('highdump__node_threshold');
      if (highdumpNode !== undefined && highdumpNode !== null) items.push(`HIGHDUMP NODE THRESHOLD: ${highdumpNode}`);
      const highdumpRow = getProp('highdump__row_spacing');
      if (highdumpRow !== undefined && highdumpRow !== null) items.push(`HIGHDUMP ROW SPACING: ${highdumpRow} mm`);
      const highdumpDump = getProp('highdump__dump_spacing');
      if (highdumpDump !== undefined && highdumpDump !== null) items.push(`HIGHDUMP DUMP SPACING: ${highdumpDump} mm`);
      const highdumpBed = getProp('highdump__bed_hold_time');
      if (highdumpBed !== undefined && highdumpBed !== null) items.push(`HIGHDUMP BED HOLD TIME: ${highdumpBed} s`);
      const highdumpTip = getProp('highdump__tip_area_depth');
      if (highdumpTip !== undefined && highdumpTip !== null) items.push(`HIGHDUMP TIP AREA DEPTH: ${highdumpTip} mm`);

      // Extended loc_info information
      if (getProp('loc_info_oid')) items.push(`LOC_INFO OID: ${getProp('loc_info_oid')}`);
      if (getProp('status')) items.push(`STATUS: ${getProp('status')}`);
      const embeddedHold = getProp('embedded_hold');
      if (embeddedHold !== undefined) items.push(`EMBEDDED HOLD: ${embeddedHold ? 'Yes' : 'No'}`);
      const centralHold = getProp('central_hold');
      if (centralHold !== undefined) items.push(`CENTRAL HOLD: ${centralHold ? 'Yes' : 'No'}`);
      const dumpSmn = getProp('dump_info__smn_enabled');
      if (dumpSmn !== undefined) items.push(`DUMP SMN ENABLED: ${dumpSmn ? 'Yes' : 'No'}`);
      const dumpAuto = getProp('dump_info__auto_only');
      if (dumpAuto !== undefined) items.push(`DUMP AUTO ONLY: ${dumpAuto ? 'Yes' : 'No'}`);
      if (getProp('dump_info__spot__type')) items.push(`DUMP SPOT TYPE: ${getProp('dump_info__spot__type')}`);
      const dumpSpotActive = getProp('dump_info__spot__spoint__active');
      if (dumpSpotActive !== undefined) items.push(`DUMP SPOT ACTIVE: ${dumpSpotActive ? 'Yes' : 'No'}`);
      if (getProp('load_info__load_level')) items.push(`LOAD LEVEL: ${getProp('load_info__load_level')}`);
      if (getProp('load_info__spot_mode')) items.push(`LOAD SPOT MODE: ${getProp('load_info__spot_mode')}`);
      if (getProp('load_info__spot1__type')) items.push(`LOAD SPOT1 TYPE: ${getProp('load_info__spot1__type')}`);
      const loadSpot1Used = getProp('load_info__spot1__is_used');
      if (loadSpot1Used !== undefined) items.push(`LOAD SPOT1 USED: ${loadSpot1Used ? 'Yes' : 'No'}`);
      if (getProp('load_info__spot2__type')) items.push(`LOAD SPOT2 TYPE: ${getProp('load_info__spot2__type')}`);
      const loadSpot2Used = getProp('load_info__spot2__is_used');
      if (loadSpot2Used !== undefined) items.push(`LOAD SPOT2 USED: ${loadSpot2Used ? 'Yes' : 'No'}`);

      // Show JSONB attributes if available
      const pitLocAttrs = getProp('pit_loc_attributes');
      if (pitLocAttrs) {
        try {
          const attrs = typeof pitLocAttrs === 'string' ? JSON.parse(pitLocAttrs) : pitLocAttrs;
          Object.entries(attrs).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '' && value !== 0 && value !== -1) {
              items.push(`${key.toUpperCase()}: ${value}`);
            }
          });
        } catch (e) { }
      }
      const locInfoAttrs = getProp('loc_info_attributes');
      if (locInfoAttrs) {
        try {
          const attrs = typeof locInfoAttrs === 'string' ? JSON.parse(locInfoAttrs) : locInfoAttrs;
          Object.entries(attrs).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '' && value !== 0 && value !== -1) {
              items.push(`${key.toUpperCase()}: ${value}`);
            }
          });
        } catch (e) { }
      }
    }

    return items.map(item => `<div style="margin-bottom: 2px; color: white; font-size: 12px;">${item}</div>`).join('');
  };

  const loadMap = async () => {
    // Guard against re-initialization (e.g., during hot reload)
    if (!mapContainer.current || cesiumViewerRef.current || isInitializing.current) {
      console.log('[Consolidated Map] Skipping initialization - already initialized or initializing');
      return;
    }

    isInitializing.current = true;

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
            // console.log('[Consolidated Map] Cesium loaded');
            resolve();
          };
          script.onerror = () => reject(new Error('Failed to load Cesium'));
          document.head.appendChild(script);
        });
      }

      initializeMap();
    } catch (error) {
      console.error('[Consolidated Map] Error loading libraries:', error);
      isInitializing.current = false;
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
        sceneMode: window.Cesium.SceneMode.SCENE2D, // Start in 2D top-down view
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity
      });

      cesiumViewer.imageryLayers.removeAll();
      cesiumViewer.imageryLayers.addImageryProvider(initialProvider);

      cesiumViewer.scene.globe.depthTestAgainstTerrain = false;

      // Set camera to top-down view (parallel to equator) for 2D mode
      if (viewMode === '2D') {
        cesiumViewer.scene.mode = window.Cesium.SceneMode.SCENE2D;
        // Set camera to look straight down
        setTimeout(() => {
          const camera = cesiumViewer.camera;
          if (camera) {
            camera.setView({
              orientation: {
                heading: 0.0,
                pitch: window.Cesium.Math.toRadians(-90), // -90 = straight down (top-down)
                roll: 0.0
              }
            });
          }
        }, 100);
      }

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
        } catch (e) { }
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
      isInitializing.current = false;
      setMapLoaded(true);
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

          // Measurement Mode - intercept clicks for measurement FIRST
          const currentMeasurementMode = measurementTool.getMeasurementMode();
          console.log('[ConsolidatedMap] Click detected, measurement mode:', currentMeasurementMode);

          if (currentMeasurementMode) {
            console.log('[ConsolidatedMap] Measurement mode active, getting cartesian position');
            // Try multiple methods to get the cartesian position
            let cartesian = cesiumViewer.scene.pickPosition(movement.position);

            if (!cartesian) {
              // Fallback: pick from ellipsoid
              cartesian = cesiumViewer.camera.pickEllipsoid(
                movement.position,
                cesiumViewer.scene.globe.ellipsoid
              );
            }

            if (!cartesian) {
              // Last resort: use camera position + ray intersection
              const ray = cesiumViewer.camera.getPickRay(movement.position);
              if (ray) {
                cartesian = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
              }
            }

            if (cartesian) {
              console.log('[ConsolidatedMap] Adding measurement point at:', cartesian);
              measurementTool.addMeasurementPoint(cartesian);
            } else {
              console.warn('[ConsolidatedMap] Failed to get cartesian position for measurement');
            }
            return; // Don't process normal click handling
          }

          const pickedObject = cesiumViewer.scene.pick(movement.position);

          if (window.Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
            const entity = pickedObject.id;

            const turnPathStep = turnPathManager.getCurrentStep ? turnPathManager.getCurrentStep() : turnPathManager.currentStep;
            console.log('[ConsolidatedMap] Click detected, turnPath step:', turnPathStep);

            // Turn Path Selection Mode - intercept clicks for road selection
            if (turnPathStep === 'selecting_source' ||
              turnPathStep === 'selecting_destination') {
              console.log('[ConsolidatedMap] Turn path mode active, calling handleMapClick');
              turnPathManager.handleMapClick(entity);
              return; // Don't process normal click handling
            }

            // Extract ALL properties from the entity - iterate through EVERY property
            const allProperties = {};

            // List of internal Cesium properties to skip
            const skipProperties = new Set([
              'propertyNames',
              'definitionChanged',
              '_listeners',
              '_scopes',
              '_toRemove',
              '_insideRaiseEvent',
              'color' // User doesn't want color displayed
            ]);

            // Helper to check if property should be skipped
            const shouldSkip = (propName) => {
              // Skip internal Cesium properties
              if (skipProperties.has(propName)) return true;
              // Skip properties starting with underscore (internal)
              if (propName.startsWith('_')) return true;
              // Skip methods/events
              if (propName === 'getValue' || propName === 'setValue' || propName === 'addEventListener' || propName === 'removeEventListener') return true;
              return false;
            };

            if (entity.properties) {
              // Method 1: Try to get propertyNames if available
              try {
                const propertyNames = entity.properties.propertyNames;
                if (propertyNames && propertyNames.length > 0) {
                  propertyNames.forEach(propName => {
                    // Skip internal Cesium properties
                    if (shouldSkip(propName)) return;

                    try {
                      const prop = entity.properties[propName];
                      if (prop !== undefined && prop !== null) {
                        if (prop && typeof prop.getValue === 'function') {
                          try {
                            const value = prop.getValue();
                            // Only store simple values, not complex objects with circular refs
                            if (typeof value !== 'function' &&
                              value !== undefined &&
                              value !== null &&
                              (typeof value === 'string' ||
                                typeof value === 'number' ||
                                typeof value === 'boolean' ||
                                (typeof value === 'object' && !(value instanceof window.Cesium?.Entity) && !(value instanceof window.Cesium?.Property)))) {
                              allProperties[propName] = value;
                            }
                          } catch (e) {
                            // Skip errors
                          }
                        } else if (typeof prop !== 'function' &&
                          !(prop instanceof window.Cesium?.Entity) &&
                          !(prop instanceof window.Cesium?.Property)) {
                          // Only store if it's a simple value, not a Cesium object
                          allProperties[propName] = prop;
                        }
                      }
                    } catch (e) {
                      // console.warn(`[Consolidated Map] Failed to get property ${propName}:`, e);
                    }
                  });
                }
              } catch (e) {
                // console.warn('[Consolidated Map] propertyNames not available, using direct iteration');
              }

              // Method 2: Use propertyNames array (Cesium's official way to get all property names)
              try {
                if (entity.properties && entity.properties.propertyNames) {
                  const propertyNames = entity.properties.propertyNames;
                  for (let i = 0; i < propertyNames.length; i++) {
                    const propName = propertyNames[i];

                    // Skip internal Cesium properties
                    if (shouldSkip(propName)) continue;

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
                            // Only store simple values, not complex objects with circular refs
                            if (typeof value !== 'function' &&
                              value !== undefined &&
                              value !== null &&
                              (typeof value === 'string' ||
                                typeof value === 'number' ||
                                typeof value === 'boolean' ||
                                (typeof value === 'object' && !(value instanceof window.Cesium?.Entity) && !(value instanceof window.Cesium?.Property)))) {
                              allProperties[propName] = value;
                            }
                          } catch (e) {
                            // If getValue fails, skip
                          }
                        } else if (!(prop instanceof window.Cesium?.Entity) &&
                          !(prop instanceof window.Cesium?.Property)) {
                          // Direct value, not a function or Cesium object
                          allProperties[propName] = prop;
                        }
                      }
                    } catch (e) {
                      // Skip errors silently
                    }
                  }
                }
              } catch (e) {
                // console.warn('[Consolidated Map] Failed to iterate propertyNames:', e);
              }

              // Method 3: Also try known property names as fallback (including extended fields)
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
                'color', 'intersection_name', 'total_points', 'avg_altitude',
                // Extended pit_loc fields
                'pit_loc_oid', 'pit_loc_cid', 'location_survey', 'def_dump_prof', 'cur_dump_prof',
                'inclination', 'mixed_location_current_type', 'crusher_interface_enabled',
                'auto_pause_enabled', 'min_steering_radius', 'max_acceleration', 'max_deceleration',
                'max_forward_speed', 'max_reverse_speed', 'crush_bed_hold_time',
                'highdump__node_threshold', 'highdump__row_spacing', 'highdump__dump_spacing',
                'highdump__bed_hold_time', 'highdump__tip_area_depth',
                // Extended loc_info fields
                'loc_info_oid', 'loc_info_cid', 'status', 'embedded_hold', 'central_hold',
                'dump_info__smn_enabled', 'dump_info__auto_only', 'dump_info__spot__type',
                'dump_info__spot__spoint__active', 'load_info__load_level', 'load_info__spot_mode',
                'load_info__spot1__type', 'load_info__spot1__is_used', 'load_info__spot2__type',
                'load_info__spot2__is_used',
                // Extended attributes (JSONB)
                'pit_loc_attributes', 'loc_info_attributes',
                // Other extended fields
                'is_open', 'on_hold_by_dispatcher', 'on_hold_by_operator', 'intersection_id'
              ];

              knownProperties.forEach(propName => {
                // Skip internal Cesium properties
                if (shouldSkip(propName)) return;

                if (!allProperties.hasOwnProperty(propName)) {
                  try {
                    const prop = entity.properties[propName];
                    // Only get non-function values
                    if (prop !== undefined && prop !== null && typeof prop !== 'function') {
                      if (prop && typeof prop.getValue === 'function') {
                        try {
                          const value = prop.getValue();
                          // Only store simple values, not complex objects with circular refs
                          if (typeof value !== 'function' &&
                            value !== undefined &&
                            value !== null &&
                            (typeof value === 'string' ||
                              typeof value === 'number' ||
                              typeof value === 'boolean' ||
                              (typeof value === 'object' && !(value instanceof window.Cesium?.Entity) && !(value instanceof window.Cesium?.Property)))) {
                            allProperties[propName] = value;
                          }
                        } catch (e) {
                          // Skip
                        }
                      } else if (typeof prop !== 'function' &&
                        prop !== undefined &&
                        prop !== null &&
                        !(prop instanceof window.Cesium?.Entity) &&
                        !(prop instanceof window.Cesium?.Property)) {
                        // Only store if it's a simple value, not a Cesium object
                        allProperties[propName] = prop;
                      }
                    }
                  } catch (e) {
                    // Skip
                  }
                }
              });

              // Method 4: Try to iterate through ALL properties dynamically (for extended fields)
              try {
                // Try to get all property names from the entity properties object
                for (const propName in entity.properties) {
                  if (!allProperties.hasOwnProperty(propName) && propName !== 'propertyNames') {
                    try {
                      const prop = entity.properties[propName];
                      if (prop !== undefined && prop !== null && typeof prop !== 'function') {
                        if (prop && typeof prop.getValue === 'function') {
                          try {
                            const value = prop.getValue();
                            // Only store simple values, not complex objects with circular refs
                            if (typeof value !== 'function' &&
                              value !== undefined &&
                              value !== null &&
                              (typeof value === 'string' ||
                                typeof value === 'number' ||
                                typeof value === 'boolean' ||
                                (typeof value === 'object' && !(value instanceof window.Cesium?.Entity) && !(value instanceof window.Cesium?.Property)))) {
                              allProperties[propName] = value;
                            }
                          } catch (e) {
                            // Skip errors
                          }
                        } else if (typeof prop !== 'function' &&
                          prop !== undefined &&
                          prop !== null &&
                          !(prop instanceof window.Cesium?.Entity) &&
                          !(prop instanceof window.Cesium?.Property)) {
                          // Only store if it's a simple value, not a Cesium object
                          allProperties[propName] = prop;
                        }
                      }
                    } catch (e) {
                      // Skip errors
                    }
                  }
                }
              } catch (e) {
                // Skip if iteration fails
              }
            }

            // Also get entity name if available
            if (entity.name && !allProperties.name) {
              allProperties.name = entity.name;
            }

            console.log(`[Consolidated Map] Extracted ${Object.keys(allProperties).length} properties:`, Object.keys(allProperties).slice(0, 20));

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

            // console.log(`[Consolidated Map] Clicked entity:`, allProperties);
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

        // Mouse move handler for tooltips and measurement preview
        tooltipHandler.setInputAction((movement) => {
          if (!cesiumViewer || !cesiumViewer.scene) return;

          // Measurement Mode - update preview line from first point to cursor
          // Always check and update preview, even if mode is null (for cleanup)
          const currentMeasurementMode = measurementTool.getMeasurementMode();
          if (currentMeasurementMode === 'distance') {
            const cartesian =
              cesiumViewer.scene.pickPosition(movement.endPosition) ||
              cesiumViewer.camera.pickEllipsoid(
                movement.endPosition,
                cesiumViewer.scene.globe.ellipsoid
              );

            if (cartesian) {
              measurementTool.updatePreviewLine(cartesian);
            }
          } else {
            // If not in distance mode, make sure preview is cleared
            measurementTool.updatePreviewLine(null);
          }

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
              const content = formatTooltipContent(entity, true); // true = isHover, show limited info
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

      // Only add Frontrunner polygons if we're not on dispatch page
      if (centerOn !== 'dispatch') {
        addPolygonsToCesium(cesiumViewer);
      } else {
        // console.log('[Consolidated Map] Skipping Frontrunner polygons - on dispatch page');
      }

      setTimeout(() => {
        // console.log('[Consolidated Map] Entities added, centering camera...');
        // console.log('[Consolidated Map] Total entities:', entitiesRef.current.length);
        centerCameraOnData(cesiumViewer, centerOn);
      }, 1000);

      setMapLoaded(true);
      // console.log('[Consolidated Map] Cesium 3D Globe initialized');
    } catch (error) {
      console.error('[Consolidated Map] Error initializing map:', error);
      setMapError(error.message);
    }
  };

  const addSurveyPathsToCesium = (cesiumViewer) => {
    if (!surveyPathsData?.paths) {
      // console.warn('[Consolidated Map] No survey paths data available');
      return;
    }

    // console.log(`[Consolidated Map] 🛤️ Adding ${surveyPathsData.paths.length} survey paths to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    surveyPathsData.paths.forEach((path, index) => {
      try {
        let geometry = path.linestring;
        if (!geometry) {
          // console.warn(`[Consolidated Map] No linestring for survey path ${index}: ${path.path_oid}`);
          errorCount++;
          return;
        }

        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            // console.warn(`[Consolidated Map] Failed to parse linestring for survey path ${index}:`, e);
            errorCount++;
            return;
          }
        }

        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          // console.warn(`[Consolidated Map] Invalid geometry for survey path ${index}:`, geometry);
          errorCount++;
          return;
        }

        // Don't simplify - keep all points for smooth curves
        const simplifiedCoords = geometry.coordinates;

        const positions = [];
        if (geometry.type === 'LineString' && simplifiedCoords) {
          simplifiedCoords.forEach(coord => {
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
          // console.warn(`[Consolidated Map] Not enough valid positions for survey path ${index}: ${path.path_oid}`);
          errorCount++;
          return;
        }

        // Survey path - 3 METERS WIDE - GREEN
        const surveyWidthMeters = 3.0; // Fixed 3 meter width
        const surveyAsphalt = window.Cesium.Color.fromCssColorString('#00FF00'); // Green to match legend

        // Green road surface
        const surveySurface = cesiumViewer.entities.add({
          corridor: {
            positions: positions,
            width: surveyWidthMeters,
            material: surveyAsphalt,
            height: 0.0, // Same level as all other entities
            extrudedHeight: 0.3, // Same height as all other entities
            cornerType: window.Cesium.CornerType.ROUNDED,
            granularity: 0.01 // Reduced to prevent excessive vertices
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

        // White edge lines for survey paths
        if (surveyLeftEdge.length > 1) {
          const leftEdge = cesiumViewer.entities.add({
            polyline: {
              positions: surveyLeftEdge,
              width: 2,
              material: window.Cesium.Color.WHITE.withAlpha(0.8),
              clampToGround: false
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
              width: 2,
              material: window.Cesium.Color.WHITE.withAlpha(0.8),
              clampToGround: false
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
          // console.log(`[Consolidated Map] ✅ Added survey path ${index}: ${path.path_oid}`);
        }

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding survey path ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} survey paths (${errorCount} errors), total entities now: ${entitiesRef.current.length}`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };

  const addIntersectionsToCesium = (cesiumViewer) => {
    if (!intersectionsData?.consolidated_intersections) {
      // console.warn('[Consolidated Map] No intersections data available');
      return;
    }

    // Filter out gates - only show intersections
    const intersectionsOnly = intersectionsData.consolidated_intersections.filter(intersection => {
      const category = intersection.category || 'intersection';
      const normalizedCategory = typeof category === 'string' ? category.toLowerCase().trim() : String(category || '').toLowerCase().trim();
      return normalizedCategory !== 'gate';
    });

    // console.log(`[Consolidated Map] 🛣️ Adding ${intersectionsOnly.length} intersections to Cesium (filtered out ${intersectionsData.consolidated_intersections.length - intersectionsOnly.length} gates)`);

    let addedCount = 0;
    let errorCount = 0;

    const intersectionFillColor = window.Cesium.Color.fromCssColorString(activeTheme.intersectionFillColor || '#FF5F6D')
      .withAlpha(activeTheme.intersectionFillAlpha ?? 0.9);
    const intersectionOutlineColor = window.Cesium.Color.fromCssColorString(activeTheme.intersectionOutlineColor || '#FFE066')
      .withAlpha(activeTheme.intersectionOutlineAlpha ?? 0.95);
    const intersectionLabelBg = window.Cesium.Color.fromCssColorString(activeTheme.intersectionLabelBg || '#2B2D42')
      .withAlpha(0.85);

    intersectionsOnly.forEach((intersection, index) => {
      try {
        // Try polygon first, then center_point, then use lat/lon directly
        let geometry = intersection.polygon || intersection.center_point;
        let centerLon = intersection.center_longitude;
        let centerLat = intersection.center_latitude;

        // If we have center_point, use it
        if (!geometry && intersection.center_point) {
          geometry = intersection.center_point;
        }

        // Parse string geometry if needed
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            // console.warn(`[Consolidated Map] Failed to parse geometry for intersection ${index}:`, e);
          }
        }

        // Extract coordinates from geometry
        let lon, lat;
        if (geometry) {
          if (geometry.type === 'Point' && geometry.coordinates) {
            lon = geometry.coordinates[0];
            lat = geometry.coordinates[1];
          } else if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates[0]) {
            // Use first coordinate of polygon as center
            const firstCoord = geometry.coordinates[0][0];
            lon = firstCoord[0];
            lat = firstCoord[1];
          }
        }

        // Fallback to direct lat/lon if available
        if (!lon || !lat) {
          lon = centerLon || intersection.longitude;
          lat = centerLat || intersection.latitude;
        }

        // Validate coordinates
        if (!lon || !lat || isNaN(lon) || isNaN(lat)) {
          // console.warn(`[Consolidated Map] No valid coordinates for intersection ${index}: ${intersection.location_name}`);
          errorCount++;
          return;
        }

        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          // console.warn(`[Consolidated Map] Invalid coordinate range for intersection ${index}: ${lon}, ${lat}`);
          errorCount++;
          return;
        }

        const position = window.Cesium.Cartesian3.fromDegrees(lon, lat, 0.0); // Same level as all other entities
        const fillColor = intersectionFillColor;
        const outlineColor = intersectionOutlineColor;

        // Create entity - use point if no polygon, otherwise use polygon
        let entity;

        if (geometry && geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates[0] && geometry.coordinates[0].length > 2) {
          // Has polygon - create polygon entity
          const positions = [];
          const polygonCoords = []; // Store coordinates for center calculation
          geometry.coordinates[0].forEach(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2) {
              const coordLon = parseFloat(coord[0]);
              const coordLat = parseFloat(coord[1]);
              // Ignore Z coordinate if present - always use 0.0 for consistent elevation
              if (!isNaN(coordLon) && !isNaN(coordLat)) {
                positions.push(window.Cesium.Cartesian3.fromDegrees(coordLon, coordLat, 0.0)); // Always 0.0 - same level as all other entities
                polygonCoords.push({ lon: coordLon, lat: coordLat });
              }
            }
          });

          // Calculate center from polygon if not provided
          if ((!centerLon || !centerLat) && polygonCoords.length > 0) {
            const sumLon = polygonCoords.reduce((sum, c) => sum + c.lon, 0);
            const sumLat = polygonCoords.reduce((sum, c) => sum + c.lat, 0);
            centerLon = sumLon / polygonCoords.length;
            centerLat = sumLat / polygonCoords.length;
          }

          if (positions.length >= 3) {
            entity = cesiumViewer.entities.add({
              polygon: {
                hierarchy: positions,
                material: new window.Cesium.ColorMaterialProperty(fillColor),
                outline: true,
                outlineColor,
                outlineWidth: 2,
                perPositionHeight: false, // Don't use per-position heights - use uniform height
                height: 0.0, // Always 0.0 - same level as all other entities
                heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
                extrudedHeight: 0.3 // Always 0.3 - same height as all other entities
              },
              name: intersection.location_name || `Intersection ${index}`,
              properties: {
                name: intersection.location_name,
                category: 'intersection', // Always set to 'intersection', never 'gate'
                style_role: 'intersection_polygon',
                total_points: intersection.total_points,
                area_sqm: intersection.area_sqm,
                color: activeTheme.intersectionFillColor || '#FF5F6D',
                is_open: intersection.is_open,
                intersection_id: intersection.intersection_id,
                // Extended pit_loc fields
                pit_loc_oid: intersection.pit_loc_oid,
                pit_loc_cid: intersection.pit_loc_cid,
                location_survey: intersection.location_survey,
                def_dump_prof: intersection.def_dump_prof,
                cur_dump_prof: intersection.cur_dump_prof,
                inclination: intersection.inclination,
                mixed_location_current_type: intersection.mixed_location_current_type,
                // Extended loc_info fields
                loc_info_oid: intersection.loc_info_oid,
                loc_info_cid: intersection.loc_info_cid,
                status: intersection.status,
                embedded_hold: intersection.embedded_hold,
                central_hold: intersection.central_hold,
                // Extended attributes (JSONB)
                pit_loc_attributes: intersection.pit_loc_attributes,
                loc_info_attributes: intersection.loc_info_attributes,
                // All other extended fields from intersection object
                ...intersection
              },
              show: true
            });
          }
        }

        // If no polygon entity created, create a point entity
        if (!entity) {
          entity = cesiumViewer.entities.add({
            position: position,
            point: {
              pixelSize: 13,
              color: fillColor,
              outlineColor,
              outlineWidth: 2,
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            name: intersection.location_name || `Intersection ${index}`,
            properties: {
              name: intersection.location_name,
              category: intersection.category || 'intersection', // Use category from API (may be 'gate' if it's a gate)
              style_role: 'intersection_point',
              total_points: intersection.total_points,
              area_sqm: intersection.area_sqm,
              color: activeTheme.intersectionFillColor || '#FF5F6D',
              is_open: intersection.is_open,
              intersection_id: intersection.intersection_id,
              center_longitude: lon,
              center_latitude: lat,
              // Extended pit_loc fields
              pit_loc_oid: intersection.pit_loc_oid,
              pit_loc_cid: intersection.pit_loc_cid,
              location_survey: intersection.location_survey,
              def_dump_prof: intersection.def_dump_prof,
              cur_dump_prof: intersection.cur_dump_prof,
              inclination: intersection.inclination,
              mixed_location_current_type: intersection.mixed_location_current_type,
              // Extended loc_info fields
              loc_info_oid: intersection.loc_info_oid,
              loc_info_cid: intersection.loc_info_cid,
              status: intersection.status,
              embedded_hold: intersection.embedded_hold,
              central_hold: intersection.central_hold,
              // Extended attributes (JSONB)
              pit_loc_attributes: intersection.pit_loc_attributes,
              loc_info_attributes: intersection.loc_info_attributes,
              // All other extended fields from intersection object
              ...intersection
            },
            show: true
          });
        }

        entitiesRef.current.push(entity);

        // Intersection center points removed - user only wants road-intersection center points

        addedCount++;

        if (index < 5) {
          // console.log(`[Consolidated Map] ✅ Added intersection ${index}: ${intersection.location_name} at (${lon.toFixed(6)}, ${lat.toFixed(6)})`);
        }

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding intersection ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} intersections (${errorCount} errors), total entities now: ${entitiesRef.current.length}`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };


  // Helper function to trim positions near intersections for cleaner connections
  const trimPositionsNearIntersections = (positions, trimDistanceMeters = 10) => {
    if (positions.length < 3) return positions;

    // Trim first and last few points to avoid intersection overlap
    const trimCount = Math.min(2, Math.floor(positions.length * 0.05)); // Trim 5% or 2 points max

    return positions.slice(trimCount, positions.length - trimCount);
  };

  // Simplify coordinates to prevent "invalid array length" errors in Cesium
  // Cesium has limits on geometry complexity, so we limit to maxPoints per geometry
  const simplifyCoordinates = (coords, maxPoints = 50) => {
    if (!coords || coords.length <= maxPoints) {
      return coords;
    }

    // Keep first and last point, then sample evenly
    const simplified = [coords[0]]; // Always keep first point
    const step = Math.ceil((coords.length - 2) / (maxPoints - 2));

    for (let i = step; i < coords.length - 1; i += step) {
      simplified.push(coords[i]);
    }

    // Always keep last point
    if (simplified[simplified.length - 1] !== coords[coords.length - 1]) {
      simplified.push(coords[coords.length - 1]);
    }

    return simplified;
  };

  // Haversine distance calculation (in meters)
  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };


  // Road length calculation is now done in the backend ETL (calculate_road_lengths.py)
  // The length_m value from the API is already correctly calculated

  const addRoadsToCesium = (cesiumViewer) => {
    if (!roadsData?.roads) {
      console.warn('[Consolidated Map] ❌ No roads data available');
      console.warn('[Consolidated Map] roadsData:', roadsData);
      return;
    }

    const normalizeName = (name) => {
      if (!name || typeof name !== 'string') return '';
      return name.trim().toLowerCase();
    };

    const shouldRenderShortSideMarkers = false;
    const showRoadCornerMarkers = true;  // Show 4 corners per road with angles closest to 90°
    const showRoadCenterMidpoints = false;

    // Filter out roads that are actually intersections
    const intersectionNames = new Set();
    const intersectionLookup = new Map();
    if (intersectionsData?.consolidated_intersections) {
      intersectionsData.consolidated_intersections.forEach(intersection => {
        if (intersection.location_name) {
          intersectionNames.add(intersection.location_name);
          const key = normalizeName(intersection.location_name);
          if (key) {
            const centerLon = intersection.center_longitude ?? intersection.longitude ?? null;
            const centerLat = intersection.center_latitude ?? intersection.latitude ?? null;
            if (centerLon !== null && centerLat !== null) {
              intersectionLookup.set(key, {
                name: intersection.location_name,
                center: {
                  lon: Number(centerLon),
                  lat: Number(centerLat)
                }
              });
            }
          }
        }
      });
    }

    const roadsFiltered = roadsData.roads.filter(road => {
      // Only filter out roads where the road NAME itself matches an intersection name
      // Don't filter based on from/to location names - roads can connect to intersections
      const roadName = road.name || `${road.from_location_name} -> ${road.to_location_name}`;
      if (intersectionNames.has(roadName)) {
        console.log(`[Consolidated Map] 🚫 Filtering out road "${roadName}" - it's an intersection`);
        return false; // Skip this road - it's an intersection
      }
      return true; // Keep this road
    });

    console.log(`[Consolidated Map] 🛣️ STARTING: Adding ${roadsFiltered.length} roads to Cesium (filtered out ${roadsData.roads.length - roadsFiltered.length} intersections)`);
    console.log(`[Consolidated Map] 🛣️ First road sample:`, roadsFiltered[0]);
    console.log(`[Consolidated Map] 🛣️ showRoads: ${showRoads}, showClosedRoads: ${showClosedRoads}`);

    // Count open vs closed roads for debugging
    const openRoads = roadsFiltered.filter(r => r.is_open !== false && r.is_open !== 0 && r.is_open !== 'false' && r.is_open !== 'False');
    const closedRoads = roadsFiltered.filter(r => r.is_open === false || r.is_open === 0 || r.is_open === 'false' || r.is_open === 'False');
    console.log(`[Consolidated Map] 🛣️ Road counts: ${openRoads.length} open, ${closedRoads.length} closed`);

    let addedCount = 0;
    let errorCount = 0;

    const buildColor = (hex, alpha = 1) => {
      const safeHex = hex || '#FFFFFF';
      return window.Cesium.Color.fromCssColorString(safeHex).withAlpha(alpha);
    };

    // Colors for open roads
    const roadSurfaceColor = buildColor(activeTheme.roadSurfaceColor, activeTheme.roadSurfaceAlpha ?? 0.98);
    const roadShoulderColor = buildColor(activeTheme.roadShoulderColor, activeTheme.roadShoulderAlpha ?? 0.85);
    const roadCenterlineColor = buildColor(activeTheme.roadCenterlineColor, activeTheme.roadCenterlineAlpha ?? 0.95);

    // Colors for closed roads (darker/muted)
    const closedRoadSurfaceColor = buildColor('#666666', 0.7); // Dark gray
    const closedRoadShoulderColor = buildColor('#555555', 0.6); // Darker gray
    const closedRoadCenterlineColor = buildColor('#FF4444', 0.8); // Red centerline for closed roads
    const polygonOutlineColor = buildColor(
      activeTheme.polygonOutlineColor || activeTheme.roadShoulderColor,
      activeTheme.polygonOutlineAlpha ?? 0.95
    );
    const roadWidthMeters = activeTheme.roadWidthMeters || 7;
    const shoulderWidth = roadWidthMeters + (activeTheme.roadShoulderPaddingMeters || 2);
    const centerlineWidth = activeTheme.roadCenterlineWidthMeters || Math.max(1, roadWidthMeters * 0.15);
    // Roads should always be at the lowest layer - set to ground level or slightly below
    const roadElevation = 0.0; // Always at ground level
    const roadExtrudedHeight = 0.3; // Same height as all other entities

    roadsFiltered.forEach((road, index) => {
      try {
        let geometry = road.geometry;
        let parsedShortSides = null;

        if (road.short_sides_info) {
          try {
            parsedShortSides = typeof road.short_sides_info === 'string'
              ? JSON.parse(road.short_sides_info)
              : road.short_sides_info;
          } catch (e) {
            console.warn(`[Consolidated Map] Failed to parse short_sides_info for ${road.name}:`, e);
          }
        }

        if (!geometry) {
          // console.warn(`[Consolidated Map] No geometry for road ${index}: ${road.name}`);
          errorCount++;
          return;
        }

        // Check if road is closed
        // Handle null/undefined as open (default)
        const isClosed = road.is_open === false || road.is_open === 0 || road.is_open === 'false' || road.is_open === 'False';

        // Debug logging for first few roads
        if (index < 5) {
          console.log(`[Consolidated Map] Road ${index} (${road.name}): is_open=${road.is_open}, isClosed=${isClosed}, showRoads=${showRoads}, showClosedRoads=${showClosedRoads}`);
        }

        // Use different colors for closed roads
        const currentRoadSurfaceColor = isClosed ? closedRoadSurfaceColor : roadSurfaceColor;
        const currentRoadShoulderColor = isClosed ? closedRoadShoulderColor : roadShoulderColor;
        const currentRoadCenterlineColor = isClosed ? closedRoadCenterlineColor : roadCenterlineColor;

        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            // console.warn(`[Consolidated Map] Failed to parse geometry for road ${index}:`, e);
            errorCount++;
            return;
          }
        }

        if (index < 3) {
          console.log(`[Consolidated Map] Road ${index} geometry type: ${geometry?.type} (geometry_type field: ${road.geometry_type})`);
        }

        const isPolygonGeometry = geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
        let positions = [];

        if (isPolygonGeometry) {
          let rings = [];
          if (geometry.type === 'Polygon') {
            rings = geometry.coordinates?.[0] || [];
          } else if (geometry.type === 'MultiPolygon') {
            rings = geometry.coordinates?.[0]?.[0] || [];
          }
          if (!rings || rings.length < 3) {
            // console.warn(`[Consolidated Map] Invalid polygon geometry for road ${index}: ${road.name}`);
            errorCount++;
            return;
          }
          positions = rings.map(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2) {
              const lon = parseFloat(coord[0]);
              const lat = parseFloat(coord[1]);
              if (!isNaN(lon) && !isNaN(lat)) {
                return window.Cesium.Cartesian3.fromDegrees(lon, lat, roadElevation);
              }
            }
            return null;
          }).filter(Boolean);

          if (positions.length < 3) {
            // console.warn(`[Consolidated Map] Not enough polygon points for road ${index}: ${road.name}`);
            errorCount++;
            return;
          }

          // Road length is calculated in backend ETL, use value from API
          const roadLength = road.length_m || 0;

          const polygonEntity = cesiumViewer.entities.add({
            polygon: {
              hierarchy: positions,
              material: new window.Cesium.ColorMaterialProperty(currentRoadSurfaceColor),
              outline: true,
              outlineColor: isClosed ? closedRoadCenterlineColor : polygonOutlineColor,
              outlineWidth: activeTheme.polygonOutlineWidth || 2,
              height: roadElevation, // Same level as all other entities (0.0)
              extrudedHeight: roadExtrudedHeight, // Same height as all other entities (0.3)
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
            },
            name: road.name || `Road ${index}`,
            properties: {
              name: road.name,
              category: 'road',
              style_role: 'road_polygon',
              road_id: road.road_id,
              length_m: roadLength,
              width_m: road.width_m,
              short_sides_info: road.short_sides_info,
              is_open: road.is_open,
              from_location: road.from_location_name,
              to_location: road.to_location_name,
              color: activeTheme.roadSurfaceColor
            },
            show: (isClosed ? showClosedRoads : showRoads)
          });
          entitiesRef.current.push(polygonEntity);

          const outlinePositions = [...positions];
          if (positions.length > 0 && positions[0] !== positions[positions.length - 1]) {
            outlinePositions.push(positions[0]);
          }

          const polygonOutlineEntity = cesiumViewer.entities.add({
            polyline: {
              positions: outlinePositions,
              width: Math.max(1.5, centerlineWidth),
              material: new window.Cesium.PolylineGlowMaterialProperty({
                color: isClosed ? closedRoadCenterlineColor : polygonOutlineColor,
                glowPower: isClosed ? 0.3 : 0.18
              }),
              clampToGround: true, // Clamp to ground to ensure it's at the lowest level
              height: roadElevation // Same level as all other entities (0.0)
            },
            name: `${road.name || `Road ${index}`} outline`,
            properties: {
              name: road.name,
              category: 'road_polygon_outline', // Use specific category so visibility function can find it
              style_role: 'road_polygon_outline',
              road_id: road.road_id,
              length_m: roadLength,
              width_m: road.width_m,
              short_sides_info: road.short_sides_info,
              is_open: road.is_open // Add is_open so visibility function can determine if closed
            },
            show: (isClosed ? showClosedRoads : showRoads)
          });
          entitiesRef.current.push(polygonOutlineEntity);

          // Add corner markers near intersection polygons
          // DISABLED: Using server-side pre-calculated markers instead (see addRoadMarkersToCesium)
          if (false && showRoadCornerMarkers && isPolygonGeometry) {
            if (index < 3) {
              console.log(`[Corner Marker] Processing road ${index} (${road.name}): showRoadCornerMarkers=${showRoadCornerMarkers}, isPolygonGeometry=${isPolygonGeometry}`);
            }

            // Calculate interior angles for all polygon vertices
            const calculateInteriorAngle = (p1, p2, p3) => {
              // Calculate vectors
              const v1 = { x: p1[0] - p2[0], y: p1[1] - p2[1] };
              const v2 = { x: p3[0] - p2[0], y: p3[1] - p2[1] };

              // Calculate dot product and magnitudes
              const dot = v1.x * v2.x + v1.y * v2.y;
              const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
              const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

              if (mag1 === 0 || mag2 === 0) return null;

              // Calculate angle in degrees
              const cosAngle = dot / (mag1 * mag2);
              const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
              const angleDeg = angleRad * (180 / Math.PI);

              return angleDeg;
            };

            // Get all polygon corners with their angles
            const corners = [];
            const polyCoords = geometry.coordinates[0]; // First ring of polygon

            if (index === 0) {
              console.log(`[Corner Debug] Road ${road.name}: polygon has ${polyCoords.length} vertices`);
            }

            for (let i = 0; i < polyCoords.length - 1; i++) {
              const prev = polyCoords[i === 0 ? polyCoords.length - 2 : i - 1];
              const curr = polyCoords[i];
              const next = polyCoords[i + 1];

              const angle = calculateInteriorAngle(prev, curr, next);
              if (angle !== null) {
                const angleDiff = Math.abs(angle - 90);
                corners.push({
                  lon: curr[0],
                  lat: curr[1],
                  angle: angle,
                  angleDiff: angleDiff,
                  index: i
                });
              }
            }

            if (index === 0) {
              console.log(`[Corner Debug] Road ${road.name}: found ${corners.length} valid corners`);
            }

            // Find nearby intersections/locations for proximity filtering
            const proximity = 100; // meters - increased to catch more corners
            const neighborEntities = [];

            // Check all intersections
            if (intersectionsData?.consolidated_intersections) {
              intersectionsData.consolidated_intersections.forEach(intersection => {
                if (intersection.geometry?.type === 'Polygon') {
                  const intCoords = intersection.geometry.coordinates[0];
                  const intCenter = {
                    lon: intCoords.reduce((sum, c) => sum + c[0], 0) / intCoords.length,
                    lat: intCoords.reduce((sum, c) => sum + c[1], 0) / intCoords.length
                  };
                  neighborEntities.push({
                    ...intersection,
                    center: intCenter,
                    type: 'intersection'
                  });
                }
              });
            }

            // Check all locations
            if (consolidatedData?.consolidated_locations) {
              consolidatedData.consolidated_locations.forEach(location => {
                if (location.geometry?.type === 'Polygon') {
                  const locCoords = location.geometry.coordinates[0];
                  const locCenter = {
                    lon: locCoords.reduce((sum, c) => sum + c[0], 0) / locCoords.length,
                    lat: locCoords.reduce((sum, c) => sum + c[1], 0) / locCoords.length
                  };
                  neighborEntities.push({
                    ...location,
                    center: locCenter,
                    type: 'location'
                  });
                }
              });
            }

            // Filter corners that are close to intersections/locations
            const cornersNearNeighbors = corners.map(corner => {
              let minDist = Infinity;
              let nearestEntity = null;

              neighborEntities.forEach(entity => {
                const dist = haversineDistance(
                  corner.lat,
                  corner.lon,
                  entity.center.lat,
                  entity.center.lon
                );
                if (dist < minDist) {
                  minDist = dist;
                  nearestEntity = entity;
                }
              });

              return {
                ...corner,
                proximity: minDist,
                nearestEntity: nearestEntity
              };
            }).filter(corner => corner.proximity < proximity);

            if (index === 0) {
              console.log(`[Corner Debug] Road ${road.name}: ${cornersNearNeighbors.length} corners within ${proximity}m of neighbors`);
              if (cornersNearNeighbors.length > 0) {
                console.log(`[Corner Debug] Top corner angles:`, cornersNearNeighbors.slice(0, 4).map(c => ({
                  angle: c.angle.toFixed(1),
                  angleDiff: c.angleDiff.toFixed(1),
                  proximity: c.proximity.toFixed(1)
                })));
              }
            }

            // Sort by angle difference from 90° first, then by proximity
            cornersNearNeighbors.sort((a, b) => {
              if (Math.abs(a.angleDiff - b.angleDiff) < 1) {
                return a.proximity - b.proximity;
              }
              return a.angleDiff - b.angleDiff;
            });

            // Take top 4 corners - if we don't have 4 near neighbors, fall back to best angles from all corners
            let selectedCorners = cornersNearNeighbors.slice(0, 4);

            if (selectedCorners.length < 4) {
              // Not enough corners near neighbors, so just take the 4 best 90-degree angles from all corners
              const sortedByAngle = [...corners].sort((a, b) => a.angleDiff - b.angleDiff);
              selectedCorners = sortedByAngle.slice(0, 4);
              if (index === 0) {
                console.log(`[Corner Debug] Road ${road.name}: fallback to best angles (no proximity filter)`);
              }
            }

            if (index === 0) {
              console.log(`[Corner Debug] Road ${road.name}: rendering ${selectedCorners.length} corner markers`);
            }

            // Render the 4 corner markers
            const cornerMarkerHeight = Math.max(roadElevation + 2, 2); // Raise markers above polygon surfaces
            const cornerMarkerEntities = [];

            selectedCorners.forEach((corner, idx) => {
              const cornerMarker = cesiumViewer.entities.add({
                position: window.Cesium.Cartesian3.fromDegrees(
                  corner.lon,
                  corner.lat,
                  cornerMarkerHeight
                ),
                point: {
                  pixelSize: 14,
                  color: window.Cesium.Color.CYAN.withAlpha(0.98),
                  outlineColor: window.Cesium.Color.WHITE,
                  outlineWidth: 3,
                  heightReference: window.Cesium.HeightReference.NONE,
                  scaleByDistance: new window.Cesium.NearFarScalar(1e2, 1.0, 5e5, 0.2),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                name: `${road.name || `Road ${index}`} corner ${idx + 1}`,
                properties: {
                  name: road.name,
                  category: 'road_corner_marker',
                  style_role: 'road_corner_marker',
                  road_id: road.road_id,
                  corner_index: idx,
                  angle: corner.angle,
                  angle_diff_from_90: corner.angleDiff,
                  proximity_m: corner.proximity,
                  nearest_entity: corner.nearestEntity?.name || 'unknown'
                },
                show: (isClosed ? showClosedRoads : showRoads)
              });
              entitiesRef.current.push(cornerMarker);
              cornerMarkerEntities.push({ corner, entity: cornerMarker });
              if (index === 0 && idx === 0) {
                console.log('[Corner Debug] Added corner marker entity:', {
                  name: cornerMarker.name,
                  lon: corner.lon,
                  lat: corner.lat,
                  angle: corner.angle,
                  angleDiff: corner.angleDiff,
                  proximity: corner.proximity,
                  show: cornerMarker.show
                });
              }
            });

            // Determine the side (pair of corners) with the shortest combined distance to intersections/locations
            if (cornerMarkerEntities.length >= 2) {
              const sortedCornersByIndex = [...cornerMarkerEntities].sort((a, b) => a.corner.index - b.corner.index);
              const cornerPairs = [];

              for (let i = 0; i < sortedCornersByIndex.length; i++) {
                const current = sortedCornersByIndex[i].corner;
                const next = sortedCornersByIndex[(i + 1) % sortedCornersByIndex.length].corner;
                const proximitySum = (current.proximity ?? Number.POSITIVE_INFINITY) + (next.proximity ?? Number.POSITIVE_INFINITY);
                const sharedEntity = current.nearestEntity && next.nearestEntity && current.nearestEntity.name === next.nearestEntity.name;
                const segmentLength = haversineDistance(current.lat, current.lon, next.lat, next.lon);

                cornerPairs.push({
                  cornerA: current,
                  cornerB: next,
                  proximitySum,
                  sharedEntity,
                  segmentLength
                });
              }

              const sortCornerPairs = (a, b) => {
                if (a.proximitySum === b.proximitySum) {
                  if (a.sharedEntity !== b.sharedEntity) {
                    return a.sharedEntity ? -1 : 1;
                  }
                  return a.segmentLength - b.segmentLength;
                }
                return a.proximitySum - b.proximitySum;
              };

              const topPairs = cornerPairs.sort(sortCornerPairs).slice(0, 2);

              topPairs.forEach((pair, pairIndex) => {
                if (!pair) return;
                const centerLon = (pair.cornerA.lon + pair.cornerB.lon) / 2;
                const centerLat = (pair.cornerA.lat + pair.cornerB.lat) / 2;
                const sideCenterHeight = cornerMarkerHeight + 1.5;

                const sideCenterMarker = cesiumViewer.entities.add({
                  position: window.Cesium.Cartesian3.fromDegrees(centerLon, centerLat, sideCenterHeight),
                  point: {
                    pixelSize: 16,
                    color: window.Cesium.Color.MAGENTA.withAlpha(0.98),
                    outlineColor: window.Cesium.Color.WHITE,
                    outlineWidth: 3,
                    heightReference: window.Cesium.HeightReference.NONE,
                    scaleByDistance: new window.Cesium.NearFarScalar(5e2, 1.1, 3e6, 0.5),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                  },
                  name: `${road.name || `Road ${index}`} side center ${pairIndex + 1}`,
                  properties: {
                    name: road.name,
                    category: 'road_corner_side_center',
                    style_role: 'road_corner_side_center',
                    road_id: road.road_id,
                    pair_rank: pairIndex + 1,
                    paired_corner_indices: [pair.cornerA.index, pair.cornerB.index],
                    proximity_sum_m: pair.proximitySum,
                    segment_length_m: pair.segmentLength,
                    shared_entity: pair.sharedEntity ? (pair.cornerA.nearestEntity?.name || '') : null
                  },
                  show: (isClosed ? showClosedRoads : showRoads)
                });
                entitiesRef.current.push(sideCenterMarker);

                if (index === 0) {
                  console.log('[Corner Debug] Added side center marker:', {
                    name: sideCenterMarker.name,
                    centerLon,
                    centerLat,
                    proximitySum: pair.proximitySum,
                    sharedEntity: pair.sharedEntity ? pair.cornerA.nearestEntity?.name : null,
                    segmentLength: pair.segmentLength
                  });
                }
              });
            }
          }

          if (parsedShortSides && shouldRenderShortSideMarkers) {
            const ssi = parsedShortSides;

            if (ssi?.short_side_1?.center_lon && ssi?.short_side_1?.center_lat) {
              const shortSide1Point = cesiumViewer.entities.add({
                position: window.Cesium.Cartesian3.fromDegrees(
                  ssi.short_side_1.center_lon,
                  ssi.short_side_1.center_lat,
                  roadElevation
                ),
                point: {
                  pixelSize: 6,
                  color: window.Cesium.Color.MAGENTA.withAlpha(0.9),
                  outlineColor: window.Cesium.Color.WHITE,
                  outlineWidth: 1,
                  heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
                  scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.05),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                cylinder: {
                  length: roadExtrudedHeight,
                  topRadius: 0.1,
                  bottomRadius: 0.1,
                  material: window.Cesium.Color.MAGENTA.withAlpha(0.8),
                  outline: true,
                  outlineColor: window.Cesium.Color.WHITE,
                  heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
                },
                distanceDisplayCondition: new window.Cesium.DistanceDisplayCondition(0.0, 2000.0),
                name: `${road.name || `Road ${index}`} short side 1 center`,
                properties: {
                  name: road.name,
                  category: 'road_short_side_marker',
                  style_role: 'road_short_side_marker',
                  road_id: road.road_id,
                  marker_type: 'short_side_1',
                  length_m: ssi.short_side_1.length_m,
                  center_lon: ssi.short_side_1.center_lon,
                  center_lat: ssi.short_side_1.center_lat
                },
                show: !!showCenterPoints
              });
              entitiesRef.current.push(shortSide1Point);
            }

            if (ssi?.short_side_2?.center_lon && ssi?.short_side_2?.center_lat) {
              const shortSide2Point = cesiumViewer.entities.add({
                position: window.Cesium.Cartesian3.fromDegrees(
                  ssi.short_side_2.center_lon,
                  ssi.short_side_2.center_lat,
                  roadElevation
                ),
                point: {
                  pixelSize: 6,
                  color: window.Cesium.Color.CYAN.withAlpha(0.9),
                  outlineColor: window.Cesium.Color.WHITE,
                  outlineWidth: 1,
                  heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
                  scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.05),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                cylinder: {
                  length: roadExtrudedHeight,
                  topRadius: 0.1,
                  bottomRadius: 0.1,
                  material: window.Cesium.Color.CYAN.withAlpha(0.8),
                  outline: true,
                  outlineColor: window.Cesium.Color.WHITE,
                  heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
                },
                distanceDisplayCondition: new window.Cesium.DistanceDisplayCondition(0.0, 2000.0),
                name: `${road.name || `Road ${index}`} short side 2 center`,
                properties: {
                  name: road.name,
                  category: 'road_short_side_marker',
                  style_role: 'road_short_side_marker',
                  road_id: road.road_id,
                  marker_type: 'short_side_2',
                  length_m: ssi.short_side_2.length_m,
                  center_lon: ssi.short_side_2.center_lon,
                  center_lat: ssi.short_side_2.center_lat
                },
                show: !!showCenterPoints
              });
              entitiesRef.current.push(shortSide2Point);
            }
          }

          addedCount++;
          return;
        }

        let coordinates = [];
        if (geometry.type === 'LineString') {
          coordinates = geometry.coordinates;
        } else if (geometry.type === 'MultiLineString') {
          coordinates = geometry.coordinates.flat();
        } else {
          // console.warn(`[Consolidated Map] Unsupported geometry type for road ${index}: ${geometry.type}`);
          errorCount++;
          return;
        }

        if (!coordinates || coordinates.length < 2) {
          // console.warn(`[Consolidated Map] Invalid coordinates for road ${index}: ${road.name}`);
          errorCount++;
          return;
        }

        const corridorPositions = coordinates.map(coord => {
          if (coord && Array.isArray(coord) && coord.length >= 2) {
            const lon = parseFloat(coord[0]);
            const lat = parseFloat(coord[1]);
            if (!isNaN(lon) && !isNaN(lat)) {
              return window.Cesium.Cartesian3.fromDegrees(lon, lat, roadElevation); // Same level as all other entities (0.0)
            }
          }
          return null;
        }).filter(Boolean);

        if (corridorPositions.length < 2) {
          // console.warn(`[Consolidated Map] Not enough valid positions for road ${index}: ${road.name}`);
          errorCount++;
          return;
        }

        const addRoadEntity = (options = {}) => {
          // Determine the correct category based on style_role
          let entityCategory = options.category || 'road';
          if (options.style_role === 'road_shoulder') {
            entityCategory = 'road_shoulder';
          } else if (options.style_role === 'road_surface') {
            entityCategory = 'road_surface';
          }

          const entity = cesiumViewer.entities.add({
            corridor: {
              positions: corridorPositions,
              width: options.width,
              material: options.material,
              height: options.height,
              extrudedHeight: options.extrudedHeight,
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
              cornerType: window.Cesium.CornerType.ROUNDED,
              granularity: 0.003
            },
            name: road.name || `Road ${index}`,
            properties: {
              name: road.name,
              category: entityCategory, // Use specific category for visibility function
              style_role: options.style_role,
              road_id: road.road_id,
              length_m: road.length_m,
              width_m: road.width_m,
              short_sides_info: road.short_sides_info,
              is_open: road.is_open, // Include is_open for visibility function
              from_location: road.from_location_name,
              to_location: road.to_location_name,
              color: options.colorHex || activeTheme.roadSurfaceColor,
              // Add course information if available (for tooltip)
              course_data: road.course_data || null
            },
            show: (isClosed ? showClosedRoads : showRoads)
          });
          entitiesRef.current.push(entity);
          return entity;
        };

        addRoadEntity({
          width: shoulderWidth,
          material: new window.Cesium.ColorMaterialProperty(currentRoadShoulderColor),
          height: roadElevation, // Ground level - always below other layers
          extrudedHeight: roadExtrudedHeight, // Low height to keep roads below everything
          colorHex: isClosed ? '#555555' : activeTheme.roadShoulderColor,
          style_role: 'road_shoulder'
        });

        addRoadEntity({
          width: roadWidthMeters,
          material: new window.Cesium.ColorMaterialProperty(currentRoadSurfaceColor),
          height: roadElevation, // Ground level - always below other layers
          extrudedHeight: roadExtrudedHeight, // Low height to keep roads below everything
          colorHex: isClosed ? '#666666' : activeTheme.roadSurfaceColor,
          style_role: 'road_surface'
        });

        const centerlineEntity = cesiumViewer.entities.add({
          polyline: {
            positions: corridorPositions,
            width: centerlineWidth,
            material: new window.Cesium.PolylineGlowMaterialProperty({
              glowPower: isClosed ? 0.4 : (activeTheme.roadCenterlineGlowPower ?? 0.25),
              color: currentRoadCenterlineColor
            }),
            clampToGround: true,
            height: roadElevation // Same level as all other entities (0.0)
          },
          name: `${road.name || `Road ${index}`} centerline`,
          properties: {
            name: road.name,
            category: 'road_centerline',
            style_role: 'road_centerline',
            road_id: road.road_id,
            length_m: road.length_m,
            width_m: road.width_m,
            short_sides_info: road.short_sides_info,
            is_open: road.is_open, // Include is_open for visibility function
            color: activeTheme.roadCenterlineColor
          },
          show: (isClosed ? showClosedRoads : showRoads)
        });
        entitiesRef.current.push(centerlineEntity);

        // Add center points at start and end of road
        if (coordinates.length >= 2) {
          const firstCoord = coordinates[0];
          const lastCoord = coordinates[coordinates.length - 1];

          let startLon = null;
          let startLat = null;
          let endLon = null;
          let endLat = null;

          if (firstCoord && Array.isArray(firstCoord) && firstCoord.length >= 2) {
            startLon = parseFloat(firstCoord[0]);
            startLat = parseFloat(firstCoord[1]);
          }

          if (lastCoord && Array.isArray(lastCoord) && lastCoord.length >= 2) {
            endLon = parseFloat(lastCoord[0]);
            endLat = parseFloat(lastCoord[1]);
          }

          // Check if start/end points are near intersections (within 50m)
          const checkNearIntersection = (lon, lat) => {
            if (!intersectionsData?.intersections || !lon || !lat) return false;

            for (const intersection of intersectionsData.intersections) {
              if (!intersection.geometry || !intersection.geometry.coordinates) continue;

              const [ixLon, ixLat] = intersection.geometry.coordinates;
              const distance = haversineDistance(lat, lon, ixLat, ixLon);
              if (distance <= 50) return true;
            }
            return false;
          };

          // Add start point
          if (startLon && startLat && !isNaN(startLon) && !isNaN(startLat)) {
            const isConnected = checkNearIntersection(startLon, startLat);
            const pointColor = isConnected
              ? window.Cesium.Color.CYAN.withAlpha(0.9)
              : window.Cesium.Color.YELLOW.withAlpha(0.9);

            const startPoint = cesiumViewer.entities.add({
              position: window.Cesium.Cartesian3.fromDegrees(startLon, startLat, roadElevation), // Same level as roads
              point: {
                pixelSize: 15,
                color: pointColor,
                outlineColor: window.Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
                scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              },
              cylinder: {
                length: roadExtrudedHeight, // Same height as roads
                topRadius: 0.15,
                bottomRadius: 0.15,
                material: pointColor,
                outline: true,
                outlineColor: window.Cesium.Color.WHITE,
                heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
              },
              name: `${road.name || `Road ${index}`} start`,
              properties: {
                name: road.name,
                category: 'road_connection',
                style_role: 'road_connection',
                road_id: road.road_id,
                point_type: 'start',
                is_connected: isConnected,
                is_open: road.is_open // Include is_open for visibility function
              },
              show: (isClosed ? showClosedRoads : showRoads)
            });
            entitiesRef.current.push(startPoint);

            if (index < 3) {
              console.log(`[Consolidated Map] ✅ Adding START point for road ${index}: ${road.name}`, {
                lon: startLon,
                lat: startLat,
                isConnected
              });
            }
          }

          // Add end point
          if (endLon && endLat && !isNaN(endLon) && !isNaN(endLat)) {
            const isConnected = checkNearIntersection(endLon, endLat);
            const pointColor = isConnected
              ? window.Cesium.Color.CYAN.withAlpha(0.9)
              : window.Cesium.Color.YELLOW.withAlpha(0.9);

            const endPoint = cesiumViewer.entities.add({
              position: window.Cesium.Cartesian3.fromDegrees(endLon, endLat, roadElevation), // Same level as roads
              point: {
                pixelSize: 15,
                color: pointColor,
                outlineColor: window.Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
                scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              },
              cylinder: {
                length: roadExtrudedHeight, // Same height as roads
                topRadius: 0.15,
                bottomRadius: 0.15,
                material: pointColor,
                outline: true,
                outlineColor: window.Cesium.Color.WHITE,
                heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
              },
              name: `${road.name || `Road ${index}`} end`,
              properties: {
                name: road.name,
                category: 'road_connection',
                style_role: 'road_connection',
                road_id: road.road_id,
                point_type: 'end',
                is_connected: isConnected,
                is_open: road.is_open // Include is_open for visibility function
              },
              show: (isClosed ? showClosedRoads : showRoads)
            });
            entitiesRef.current.push(endPoint);

            if (index < 3) {
              console.log(`[Consolidated Map] ✅ Adding END point for road ${index}: ${road.name}`, {
                lon: endLon,
                lat: endLat,
                isConnected
              });
            }
          }
        }

        addedCount++;

        if (index < 5) {
          console.log(`[Consolidated Map] ✅ Added road ${index}: ${road.name} (${coordinates.length} points), is_open: ${road.is_open}, show: ${isClosed ? showClosedRoads : showRoads}`);
        }

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding road ${index}:`, err);
      }
    });

    const cornerMarkerCount = entitiesRef.current.filter(entity => {
      const styleRoleProp = entity?.properties?.style_role;
      const value = styleRoleProp?.getValue ? styleRoleProp.getValue(window.Cesium.JulianDate.now())
        : (styleRoleProp?._value ?? styleRoleProp);
      return value === 'road_corner_marker';
    }).length;
    console.log(`[Consolidated Map] ✅ FINISHED: Added ${addedCount} roads (${errorCount} errors), total entities now: ${entitiesRef.current.length}, corner markers: DISABLED`);
    console.log(`[Consolidated Map] 🛣️ Road visibility: showRoads=${showRoads}, showClosedRoads=${showClosedRoads}`);

    // Add center point logic disabled (legacy)
    if (showRoadCenterMidpoints && intersectionsData?.consolidated_intersections && roadsFiltered.length > 0) {
      try {
        console.log('[Consolidated Map] ⚠️ showRoadCenterMidpoints is disabled in this build');

        // Build all entities with their full geometry: intersections, gates, and locations
        const allEntities = []; // {geometry, name, type: 'intersection'|'gate'|'location', center: {lon, lat}}
        const entityLookup = new Map(); // normalizedName -> entity data

        const registerEntity = (entityData) => {
          allEntities.push(entityData);
          const key = normalizeName(entityData.name);
          if (key && !entityLookup.has(key)) {
            entityLookup.set(key, entityData);
          }
        };

        const resolveEntityByNames = (names = []) => {
          if (!Array.isArray(names)) return null;
          for (const rawName of names) {
            const key = normalizeName(rawName);
            if (!key) continue;
            if (entityLookup.has(key)) {
              return entityLookup.get(key);
            }
          }
          return null;
        };

        // Add intersections (excluding gates)
        intersectionsData.consolidated_intersections.forEach((intersection) => {
          try {
            // Skip gates - we'll add them separately
            if (intersection.category && intersection.category.toLowerCase() === 'gate') {
              return;
            }

            // Get intersection geometry
            let intersectionGeometry = intersection.polygon || intersection.center_point;
            if (typeof intersectionGeometry === 'string') {
              try {
                intersectionGeometry = JSON.parse(intersectionGeometry);
              } catch (e) {
                return;
              }
            }

            if (!intersectionGeometry || !intersectionGeometry.coordinates) return;

            // Get intersection center for distance calculation
            let intersectionCenterLon, intersectionCenterLat;
            if (intersectionGeometry.type === 'Point' && intersectionGeometry.coordinates) {
              intersectionCenterLon = intersectionGeometry.coordinates[0];
              intersectionCenterLat = intersectionGeometry.coordinates[1];
            } else if (intersectionGeometry.type === 'Polygon' && intersectionGeometry.coordinates && intersectionGeometry.coordinates[0]) {
              // Calculate centroid from polygon
              const coords = intersectionGeometry.coordinates[0];
              let sumLon = 0, sumLat = 0, validCoords = 0;
              coords.forEach(coord => {
                if (coord && Array.isArray(coord) && coord.length >= 2) {
                  const lon = parseFloat(coord[0]);
                  const lat = parseFloat(coord[1]);
                  if (!isNaN(lon) && !isNaN(lat)) {
                    sumLon += lon;
                    sumLat += lat;
                    validCoords++;
                  }
                }
              });
              if (validCoords > 0) {
                intersectionCenterLon = sumLon / validCoords;
                intersectionCenterLat = sumLat / validCoords;
              }
            } else {
              intersectionCenterLon = intersection.center_longitude || intersection.longitude;
              intersectionCenterLat = intersection.center_latitude || intersection.latitude;
            }

            if (intersectionCenterLon && intersectionCenterLat) {
              registerEntity({
                geometry: intersectionGeometry,
                name: intersection.location_name,
                type: 'intersection',
                center: { lon: intersectionCenterLon, lat: intersectionCenterLat }
              });
            }
          } catch (e) {
            // Skip invalid intersections
          }
        });

        // Add gates
        intersectionsData.consolidated_intersections.forEach((intersection) => {
          // Only process gates
          if (!intersection.category || intersection.category.toLowerCase() !== 'gate') {
            return;
          }

          try {
            // Get intersection geometry
            let intersectionGeometry = intersection.polygon || intersection.center_point;
            if (typeof intersectionGeometry === 'string') {
              try {
                intersectionGeometry = JSON.parse(intersectionGeometry);
              } catch (e) {
                return;
              }
            }

            if (!intersectionGeometry || !intersectionGeometry.coordinates) return;

            // Get intersection center
            let intersectionCenterLon, intersectionCenterLat;
            if (intersectionGeometry.type === 'Point' && intersectionGeometry.coordinates) {
              intersectionCenterLon = intersectionGeometry.coordinates[0];
              intersectionCenterLat = intersectionGeometry.coordinates[1];
            } else if (intersectionGeometry.type === 'Polygon' && intersectionGeometry.coordinates && intersectionGeometry.coordinates[0]) {
              // Calculate centroid from polygon
              const coords = intersectionGeometry.coordinates[0];
              let sumLon = 0, sumLat = 0, validCoords = 0;
              coords.forEach(coord => {
                if (coord && Array.isArray(coord) && coord.length >= 2) {
                  const lon = parseFloat(coord[0]);
                  const lat = parseFloat(coord[1]);
                  if (!isNaN(lon) && !isNaN(lat)) {
                    sumLon += lon;
                    sumLat += lat;
                    validCoords++;
                  }
                }
              });
              if (validCoords > 0) {
                intersectionCenterLon = sumLon / validCoords;
                intersectionCenterLat = sumLat / validCoords;
              }
            } else {
              intersectionCenterLon = intersection.center_longitude || intersection.longitude;
              intersectionCenterLat = intersection.center_latitude || intersection.latitude;
            }

            if (intersectionCenterLon && intersectionCenterLat) {
              registerEntity({
                geometry: intersectionGeometry,
                name: intersection.location_name,
                type: 'gate',
                center: { lon: intersectionCenterLon, lat: intersectionCenterLat }
              });
            }
          } catch (e) {
            // Skip invalid gates
          }
        });

        // Add locations
        if (consolidatedData?.consolidated_locations) {
          consolidatedData.consolidated_locations.forEach(location => {
            try {
              if (!location.polygon && !location.center_point) return;

              let locationGeometry = location.polygon || location.center_point;
              if (typeof locationGeometry === 'string') {
                try {
                  locationGeometry = JSON.parse(locationGeometry);
                } catch (e) {
                  return;
                }
              }

              if (!locationGeometry || !locationGeometry.coordinates) return;

              // Get location center
              let locationCenterLon, locationCenterLat;
              if (locationGeometry.type === 'Point' && locationGeometry.coordinates) {
                locationCenterLon = locationGeometry.coordinates[0];
                locationCenterLat = locationGeometry.coordinates[1];
              } else if (locationGeometry.type === 'Polygon' && locationGeometry.coordinates && locationGeometry.coordinates[0]) {
                // Calculate centroid from polygon
                const coords = locationGeometry.coordinates[0];
                let sumLon = 0, sumLat = 0, validCoords = 0;
                coords.forEach(coord => {
                  if (coord && Array.isArray(coord) && coord.length >= 2) {
                    const lon = parseFloat(coord[0]);
                    const lat = parseFloat(coord[1]);
                    if (!isNaN(lon) && !isNaN(lat)) {
                      sumLon += lon;
                      sumLat += lat;
                      validCoords++;
                    }
                  }
                });
                if (validCoords > 0) {
                  locationCenterLon = sumLon / validCoords;
                  locationCenterLat = sumLat / validCoords;
                }
              } else {
                locationCenterLon = location.center_longitude || location.longitude;
                locationCenterLat = location.center_latitude || location.latitude;
              }

              if (locationCenterLon && locationCenterLat) {
                registerEntity({
                  geometry: locationGeometry,
                  name: location.location_name,
                  type: 'location',
                  center: { lon: locationCenterLon, lat: locationCenterLat }
                });
              }
            } catch (e) {
              // Skip invalid locations
            }
          });
        }

        let centerPointsAdded = 0;

        // Check ALL roads - find best overlapping segment at START and END
        roadsFiltered.forEach((road, roadIndex) => {
          if (!road.geometry) return;

          try {
            let roadGeometry = road.geometry;
            if (typeof roadGeometry === 'string') {
              try {
                roadGeometry = JSON.parse(roadGeometry);
              } catch (e) {
                return;
              }
            }

            let parsedShortSides = null;
            const shortSideCenters = [];
            const usedShortSideIndices = new Set();

            if (road.short_sides_info) {
              try {
                parsedShortSides = typeof road.short_sides_info === 'string'
                  ? JSON.parse(road.short_sides_info)
                  : road.short_sides_info;

                if (parsedShortSides?.short_side_1?.center_lon && parsedShortSides?.short_side_1?.center_lat) {
                  shortSideCenters.push({
                    lon: parsedShortSides.short_side_1.center_lon,
                    lat: parsedShortSides.short_side_1.center_lat,
                    index: 0,
                    label: 'short_side_1'
                  });
                }
                if (parsedShortSides?.short_side_2?.center_lon && parsedShortSides?.short_side_2?.center_lat) {
                  shortSideCenters.push({
                    lon: parsedShortSides.short_side_2.center_lon,
                    lat: parsedShortSides.short_side_2.center_lat,
                    index: 1,
                    label: 'short_side_2'
                  });
                }
              } catch (e) {
                console.warn(`[Consolidated Map] Failed to parse short_sides_info for ${road.name}:`, e);
              }
            }

            // Get road coordinates
            let roadCoords = [];
            if (roadGeometry.type === 'LineString' && roadGeometry.coordinates) {
              roadCoords = roadGeometry.coordinates;
            } else if (roadGeometry.type === 'Polygon' && roadGeometry.coordinates && roadGeometry.coordinates[0]) {
              roadCoords = roadGeometry.coordinates[0];
            }

            if (roadCoords.length < 2) return;

            // Find EXACTLY 2 points per road: one at START (first 30% of segments) and one at END (last 30% of segments)
            // Each point should be on the segment with HIGHEST overlap (closest distance) to an intersection/gate/location
            // START and END must be from DIFFERENT intersections/locations/gates
            const totalSegments = roadCoords.length - 1;
            const startThreshold = Math.max(1, Math.floor(totalSegments * 0.3)); // First 30%
            const endThreshold = Math.max(1, Math.floor(totalSegments * 0.3)); // Last 30%
            const startEndIndex = totalSegments - endThreshold; // Start of "end" region

            let startSegment = null; // {lon, lat, segmentIndex, distance, center}
            let endSegment = null;

            const findShortSideCenterForEntity = (entity) => {
              if (!entity || shortSideCenters.length === 0) return null;
              let best = null;
              shortSideCenters.forEach((side) => {
                if (usedShortSideIndices.has(side.index)) return;
                let isInsidePolygon = false;
                if (entity.geometry?.type === 'Polygon') {
                  isInsidePolygon = pointInPolygon([side.lon, side.lat], entity.geometry);
                }
                const distance = haversineDistance(
                  entity.center.lat,
                  entity.center.lon,
                  side.lat,
                  side.lon
                );

                if (
                  !best ||
                  (isInsidePolygon && !best.isInsidePolygon) ||
                  (isInsidePolygon === best.isInsidePolygon && distance < best.distance)
                ) {
                  best = {
                    lon: side.lon,
                    lat: side.lat,
                    index: side.index,
                    distance,
                    isInsidePolygon
                  };
                }
              });

              if (best) {
                usedShortSideIndices.add(best.index);
                return best;
              }
              return null;
            };

            const tryCreateSegmentFromEntity = (entity, positionLabel) => {
              if (!entity) return null;

              const intersectionPoint = findRoadEntityIntersectionPoint(roadCoords, entity.geometry);
              if (intersectionPoint) {
                const distanceToCenter = haversineDistance(
                  entity.center.lat,
                  entity.center.lon,
                  intersectionPoint.lat,
                  intersectionPoint.lon
                );
                return {
                  lon: intersectionPoint.lon,
                  lat: intersectionPoint.lat,
                  segmentIndex: positionLabel === 'START' ? 0 : Math.max(0, totalSegments - 1),
                  distance: distanceToCenter,
                  center: { name: entity.name, type: entity.type },
                  source: 'overlap_segment'
                };
              }

              const shortSideCenter = findShortSideCenterForEntity(entity);
              if (shortSideCenter) {
                return {
                  lon: shortSideCenter.lon,
                  lat: shortSideCenter.lat,
                  segmentIndex: positionLabel === 'START' ? 0 : Math.max(0, totalSegments - 1),
                  distance: shortSideCenter.distance,
                  center: { name: entity.name, type: entity.type },
                  source: 'short_side_center'
                };
              }

              return null;
            };

            const startEntity = resolveEntityByNames([
              road.from_location_name,
              road.from_location,
              road.start_location_name,
              road.from_name
            ]);
            if (startEntity) {
              const startFromEntity = tryCreateSegmentFromEntity(startEntity, 'START');
              if (startFromEntity) {
                startSegment = startFromEntity;
              }
            }

            const endEntity = resolveEntityByNames([
              road.to_location_name,
              road.to_location,
              road.end_location_name,
              road.to_name
            ]);
            if (endEntity) {
              if (!startSegment || startSegment.center.name !== endEntity.name) {
                const endFromEntity = tryCreateSegmentFromEntity(endEntity, 'END');
                if (endFromEntity) {
                  endSegment = endFromEntity;
                }
              }
            }

            // Check segments in START region (first 30%) - find the one with HIGHEST overlap (closest distance)
            if (!startSegment) {
              for (let i = 0; i < startThreshold; i++) {
                const coord1 = roadCoords[i];
                const coord2 = roadCoords[i + 1];

                if (!coord1 || !coord2 || !Array.isArray(coord1) || !Array.isArray(coord2)) continue;

                const lon1 = parseFloat(coord1[0]);
                const lat1 = parseFloat(coord1[1]);
                const lon2 = parseFloat(coord2[0]);
                const lat2 = parseFloat(coord2[1]);

                if (isNaN(lon1) || isNaN(lat1) || isNaN(lon2) || isNaN(lat2)) continue;

                // Calculate segment midpoint
                const midLon = (lon1 + lon2) / 2;
                const midLat = (lat1 + lat2) / 2;

                // Check this segment against ALL entities (intersections, gates, locations) for geometric overlap
                for (const entity of allEntities) {
                  // Check if segment overlaps with entity's polygon geometry
                  const segStart = [lon1, lat1];
                  const segEnd = [lon2, lat2];

                  let overlaps = false;
                  if (entity.geometry.type === 'Polygon') {
                    overlaps = segmentOverlapsPolygon(segStart, segEnd, entity.geometry);
                  } else if (entity.geometry.type === 'Point') {
                    // For points, check if segment is close to the point
                    const pointCoords = entity.geometry.coordinates;
                    const distance = haversineDistance(pointCoords[1], pointCoords[0], midLat, midLon);
                    overlaps = distance < 50; // Within 50m of point
                  }

                  if (overlaps) {
                    // Calculate distance to center for comparison (closer = higher overlap)
                    const distance = haversineDistance(
                      entity.center.lat, entity.center.lon,
                      midLat, midLon
                    );

                    // If we don't have a start segment yet, or this one is closer (higher overlap), use it
                    if (!startSegment || distance < startSegment.distance) {
                      startSegment = {
                        lon: midLon,
                        lat: midLat,
                        segmentIndex: i,
                        distance: distance,
                        center: { name: entity.name, type: entity.type }
                      };
                    }
                  }
                }
              }
            }

            // Check segments in END region (last 30%) - find the one with HIGHEST overlap (closest distance)
            // BUT make sure it's from a DIFFERENT entity than START
            if (!endSegment) {
              for (let i = startEndIndex; i < totalSegments; i++) {
                const coord1 = roadCoords[i];
                const coord2 = roadCoords[i + 1];

                if (!coord1 || !coord2 || !Array.isArray(coord1) || !Array.isArray(coord2)) continue;

                const lon1 = parseFloat(coord1[0]);
                const lat1 = parseFloat(coord1[1]);
                const lon2 = parseFloat(coord2[0]);
                const lat2 = parseFloat(coord2[1]);

                if (isNaN(lon1) || isNaN(lat1) || isNaN(lon2) || isNaN(lat2)) continue;

                // Calculate segment midpoint
                const midLon = (lon1 + lon2) / 2;
                const midLat = (lat1 + lat2) / 2;

                // Check this segment against ALL entities (intersections, gates, locations) for geometric overlap
                for (const entity of allEntities) {
                  // IMPORTANT: Skip if this is the same entity as START (must be different)
                  if (startSegment && entity.name === startSegment.center.name) {
                    continue;
                  }

                  // Check if segment overlaps with entity's polygon geometry
                  const segStart = [lon1, lat1];
                  const segEnd = [lon2, lat2];

                  let overlaps = false;
                  if (entity.geometry.type === 'Polygon') {
                    overlaps = segmentOverlapsPolygon(segStart, segEnd, entity.geometry);
                  } else if (entity.geometry.type === 'Point') {
                    // For points, check if segment is close to the point
                    const pointCoords = entity.geometry.coordinates;
                    const distance = haversineDistance(pointCoords[1], pointCoords[0], midLat, midLon);
                    overlaps = distance < 50; // Within 50m of point
                  }

                  if (overlaps) {
                    // Calculate distance to center for comparison (closer = higher overlap)
                    const distance = haversineDistance(
                      entity.center.lat, entity.center.lon,
                      midLat, midLon
                    );

                    // If we don't have an end segment yet, or this one is closer (higher overlap), use it
                    if (!endSegment || distance < endSegment.distance) {
                      endSegment = {
                        lon: midLon,
                        lat: midLat,
                        segmentIndex: i,
                        distance: distance,
                        center: { name: entity.name, type: entity.type }
                      };
                    }
                  }
                }
              }
            }

            // Add center points for START and END - EXACTLY 2 points
            const segmentsToAdd = [];
            if (startSegment) segmentsToAdd.push({ ...startSegment, position: 'START' });
            if (endSegment) segmentsToAdd.push({ ...endSegment, position: 'END' });

            // Only add if we have BOTH START and END (exactly 2 points) AND they're from different entities
            if (segmentsToAdd.length !== 2 || segmentsToAdd[0].center.name === segmentsToAdd[1].center.name) {
              // Skip this road if we don't have exactly 2 points or they're from the same entity
              if (roadIndex < 5) {
                if (segmentsToAdd.length !== 2) {
                  console.log(`[Consolidated Map] ⚠️ Road ${road.name}: Found ${segmentsToAdd.length} points (need exactly 2: START and END from different entities) - skipping`);
                } else {
                  console.log(`[Consolidated Map] ⚠️ Road ${road.name}: Both points from same entity "${segmentsToAdd[0].center.name}" - skipping`);
                }
              }
              return; // Skip this road
            }

            // Add center points for the 2 segments found (START and END) - EXACTLY 2 points
            // We already verified segmentsToAdd.length === 2 above
            for (let pointIndex = 0; pointIndex < 2; pointIndex++) {
              const segment = segmentsToAdd[pointIndex];

              const centerPosition = window.Cesium.Cartesian3.fromDegrees(
                segment.lon,
                segment.lat,
                2.0
              );

              const roadSegmentCenterEntity = cesiumViewer.entities.add({
                position: centerPosition,
                point: {
                  pixelSize: 25,
                  color: window.Cesium.Color.MAGENTA,
                  outlineColor: window.Cesium.Color.WHITE,
                  outlineWidth: 6,
                  heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 3.0, 1.5e7, 1.5)
                },
                cylinder: {
                  length: 2.0,
                  topRadius: 0.8,
                  bottomRadius: 0.8,
                  material: window.Cesium.Color.MAGENTA.withAlpha(0.9),
                  outline: true,
                  outlineColor: window.Cesium.Color.WHITE,
                  outlineWidth: 2,
                  heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
                },
                name: `Road Center ${segment.position}: ${road.name || `Road ${roadIndex}`} -> ${segment.center.name} (${segment.center.type})`,
                properties: {
                  name: road.name,
                  road_name: road.name,
                  category: 'road_intersection_center',
                  style_role: 'road_intersection_center',
                  center_name: segment.center.name,
                  center_type: segment.center.type,
                  road_id: road.road_id,
                  overlap_distance_m: segment.distance,
                  point_position: segment.position,
                  segment_index: segment.segmentIndex
                },
                show: true
              });

              entitiesRef.current.push(roadSegmentCenterEntity);
              centerPointsAdded++;
            }

            // Log success - we have exactly 2 points
            if (roadIndex < 5) {
              const pointsInfo = segmentsToAdd.map(s => `${s.position}->${s.center.name}(${s.distance.toFixed(1)}m)`).join(', ');
              console.log(`[Consolidated Map] ✅ Added EXACTLY 2 center points for ${road.name}: ${pointsInfo}`);
            }
          } catch (err) {
            console.warn(`[Consolidated Map] Error processing road ${roadIndex}:`, err);
          }
        });

        console.log(`[Consolidated Map] ✅ Added ${centerPointsAdded} road center points (2 per road: START and END, overlapping with intersections/gates/locations)`);
      } catch (err) {
        console.error(`[Consolidated Map] ❌ Error adding road center points:`, err);
      }
    }

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
      // console.log(`[Consolidated Map] 🛣️ Requested scene render for roads`);
    }

    setVisibleCategories(prev => {
      const newSet = new Set(prev);
      newSet.add('road');
      // console.log(`[Consolidated Map] 🛣️ Added 'road' to visible categories:`, Array.from(newSet));
      return newSet;
    });
  };

  // Courses are now used as roads only - no separate courses layer
  // Entire function commented out - courses are not rendered, only used for tooltip data
  /*
  const addCoursesToCesium = (cesiumViewer) => {
    console.log('[Consolidated Map] 🛤️ addCoursesToCesium called', { 
      hasCoursesData: !!coursesData, 
      coursesCount: coursesData?.courses?.length || 0,
      showCourses 
    });
    
    if (!coursesData?.courses) {
      console.warn('[Consolidated Map] ⚠️ No courses data available');
      return;
    }

    if (!showCourses) {
      console.log('[Consolidated Map] ⚠️ Courses are toggled OFF, skipping rendering');
      return;
    }

    // Remove existing course entities to prevent duplicates
    entitiesRef.current = entitiesRef.current.filter(entity => {
      if (entity && entity.properties && entity.properties.category === 'course') {
        cesiumViewer.entities.remove(entity);
        return false;
      }
      if (entity && entity.properties && entity.properties.category === 'course_connection') {
        cesiumViewer.entities.remove(entity);
        return false;
      }
      return true;
    });
    
    console.log(`[Consolidated Map] 🛤️ Adding ${coursesData.courses.length} courses to Cesium`);
    
    let addedCount = 0;
    let errorCount = 0;
    let connectionPointCount = 0;
    
    // Build intersection lookup map for connection detection
    const intersectionMap = new Map();
    if (intersectionsData?.consolidated_intersections) {
      intersectionsData.consolidated_intersections.forEach(intersection => {
        const lon = intersection.center_longitude || intersection.longitude;
        const lat = intersection.center_latitude || intersection.latitude;
        if (lon && lat) {
          intersectionMap.set(`${lon.toFixed(6)},${lat.toFixed(6)}`, intersection);
        }
      });
    }
    
    coursesData.courses.forEach((course, index) => {
      try {
        let geometry = course.linestring;
        if (!geometry) {
          errorCount++;
          return;
        }
        
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
        } catch (e) {
            errorCount++;
          return;
          }
        }
        
        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          errorCount++;
          return;
        }
        
        const simplifiedCoords = geometry.coordinates;
        const positions = [];
        let startLon = null;
        let startLat = null;
        let endLon = null;
        let endLat = null;
        
        if (geometry.type === 'LineString' && simplifiedCoords && simplifiedCoords.length > 0) {
          const firstCoord = simplifiedCoords[0];
          if (firstCoord && Array.isArray(firstCoord) && firstCoord.length >= 2) {
            startLon = parseFloat(firstCoord[0]);
            startLat = parseFloat(firstCoord[1]);
          }
          
          const lastCoord = simplifiedCoords[simplifiedCoords.length - 1];
          if (lastCoord && Array.isArray(lastCoord) && lastCoord.length >= 2) {
            endLon = parseFloat(lastCoord[0]);
            endLat = parseFloat(lastCoord[1]);
          }
          
          simplifiedCoords.forEach(coord => {
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
          errorCount++;
          return;
        }
        
        const roadWidthMeters = 3.0;
        const roadColor = window.Cesium.Color.fromCssColorString('#FFD700');
        
        const roadSurface = cesiumViewer.entities.add({
          corridor: {
            positions: positions,
            width: roadWidthMeters,
            material: roadColor,
            height: 0.0, // Same level as all other entities
            extrudedHeight: 0.3, // Same height as all other entities
            cornerType: window.Cesium.CornerType.ROUNDED,
            granularity: 0.01
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
        
        const findNearbyIntersection = (lon, lat, thresholdMeters = 50) => {
          if (!lon || !lat || isNaN(lon) || isNaN(lat)) return null;
          
          for (const [key, intersection] of intersectionMap.entries()) {
            const [intLon, intLat] = key.split(',').map(Number);
            const R = 6371000;
            const dLat = (lat - intLat) * Math.PI / 180;
            const dLon = (lon - intLon) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(intLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;
            
            if (distance <= thresholdMeters) {
              return intersection;
            }
          }
          return null;
        };
        
        if (startLon !== null && startLat !== null && !isNaN(startLon) && !isNaN(startLat)) {
          const startIntersection = findNearbyIntersection(startLon, startLat);
          const connectionColor = startIntersection ? window.Cesium.Color.CYAN : window.Cesium.Color.YELLOW;
          
          const startPoint = cesiumViewer.entities.add({
            position: window.Cesium.Cartesian3.fromDegrees(startLon, startLat, 0.0), // Same level as all other entities
            point: {
              pixelSize: 15,
              color: connectionColor,
              outlineColor: window.Cesium.Color.WHITE,
              outlineWidth: 3,
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.5)
            },
            cylinder: {
              length: 2.0,
              topRadius: 0.15,
              bottomRadius: 0.15,
              material: connectionColor,
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
              outline: true,
              outlineColor: window.Cesium.Color.WHITE,
              outlineWidth: 1
            },
            name: startIntersection 
              ? `Connection: ${course.course_name} → ${startIntersection.location_name || 'Intersection'}` 
              : `Start: ${course.course_name}`,
            properties: {
              category: 'course_connection',
              course_name: course.course_name,
              intersection_name: startIntersection?.location_name || null,
              connection_type: 'start',
              course_id: course.course_id,
              is_connected: !!startIntersection
            },
            show: showCourses
          });
          entitiesRef.current.push(startPoint);
          connectionPointCount++;
        }
        
        if (endLon !== null && endLat !== null && !isNaN(endLon) && !isNaN(endLat)) {
          const endIntersection = findNearbyIntersection(endLon, endLat);
          const connectionColor = endIntersection ? window.Cesium.Color.CYAN : window.Cesium.Color.YELLOW;
          
          const endPoint = cesiumViewer.entities.add({
            position: window.Cesium.Cartesian3.fromDegrees(endLon, endLat, 0.0), // Same level as all other entities
            point: {
              pixelSize: 15,
              color: connectionColor,
              outlineColor: window.Cesium.Color.WHITE,
              outlineWidth: 3,
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.5)
            },
            cylinder: {
              length: 2.0,
              topRadius: 0.15,
              bottomRadius: 0.15,
              material: connectionColor,
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
              outline: true,
              outlineColor: window.Cesium.Color.WHITE,
              outlineWidth: 1
            },
            name: endIntersection 
              ? `Connection: ${course.course_name} → ${endIntersection.location_name || 'Intersection'}` 
              : `End: ${course.course_name}`,
            properties: {
              category: 'course_connection',
              course_name: course.course_name,
              intersection_name: endIntersection?.location_name || null,
              connection_type: 'end',
              course_id: course.course_id,
              is_connected: !!endIntersection
            },
            show: showCourses
          });
          entitiesRef.current.push(endPoint);
          connectionPointCount++;
        }
        
        addedCount++;
      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding course ${index}:`, err);
      }
    });
    
    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };
  */

  const addTravelsToCesium = (cesiumViewer) => {
    if (!travelsData?.travels) {
      // console.warn('[Consolidated Map] No travels data available');
      return;
    }

    // console.log(`[Consolidated Map] 🚗 Adding ${travelsData.travels.length} travels to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    travelsData.travels.forEach((travel, index) => {
      try {
        let geometry = travel.linestring;
        if (!geometry) {
          // console.warn(`[Consolidated Map] No linestring for travel ${index}: ${travel.travel_oid}`);
          errorCount++;
          return;
        }

        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            // console.warn(`[Consolidated Map] Failed to parse linestring for travel ${index}:`, e);
            errorCount++;
            return;
          }
        }

        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          // console.warn(`[Consolidated Map] Invalid geometry for travel ${index}:`, geometry);
          errorCount++;
          return;
        }

        // Don't simplify - keep all points for smooth curves
        const simplifiedCoords = geometry.coordinates;

        const positions = [];
        if (geometry.type === 'LineString' && simplifiedCoords) {
          simplifiedCoords.forEach(coord => {
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
          // console.warn(`[Consolidated Map] Not enough valid positions for travel ${index}: ${travel.travel_oid}`);
          errorCount++;
          return;
        }

        // Travel roads - 3 meters wide - BLUE
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
            material: travelColor,
            height: 0.0, // Same level as all other entities
            extrudedHeight: 0.3, // Same height as all other entities
            cornerType: window.Cesium.CornerType.ROUNDED,
            granularity: 0.01 // Reduced to prevent excessive vertices
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

        // if (index < 5) {
        //   console.log(`[Consolidated Map] ✅ Added travel ${index}: ${travelName} (${travel.road_type})`);
        // }

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding travel ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} travels (${errorCount} errors), total entities now: ${entitiesRef.current.length}`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };

  const addDispatchLocationsToCesium = (cesiumViewer) => {
    if (!dispatchLocations || dispatchLocations.length === 0) {
      // console.warn('[Consolidated Map] No dispatch locations available');
      return;
    }

    // console.log(`[Consolidated Map] 📍 Adding ${dispatchLocations.length} dispatch locations to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    dispatchLocations.forEach((location, index) => {
      try {
        if (!location.latitude || !location.longitude) {
          errorCount++;
          return;
        }

        const lat = parseFloat(location.latitude);
        const lon = parseFloat(location.longitude);

        if (isNaN(lat) || isNaN(lon)) {
          errorCount++;
          return;
        }

        // Debug first few locations
        if (index < 5) {
          // console.log(`[Dispatch Location ${index}] lat: ${lat}, lon: ${lon}, name: ${location.location_name}, type: ${location.location_category || location.unit_type}`);
        }

        const locationType = resolveDispatchLocationType(location);
        const locationColor = window.Cesium.Color.fromCssColorString(
          getDispatchLocationColor(locationType)
        );

        // Create location as MUCH BIGGER 3D box
        const baseSize = 100.0; // meters - MUCH BIGGER
        const height = 150.0; // meters - MUCH TALLER

        const box = cesiumViewer.entities.add({
          position: window.Cesium.Cartesian3.fromDegrees(lon, lat, height / 2), // Center at half height
          box: {
            dimensions: new window.Cesium.Cartesian3(baseSize, baseSize, height), // 100x100x150 meters - MUCH BIGGER
            material: locationColor.withAlpha(0.9), // Matching Mapbox opacity
            outline: true,
            outlineColor: window.Cesium.Color.BLACK,
            outlineWidth: 2,
            heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
          },
          name: location.location_name || `Dispatch Location ${location.location_id}`,
          properties: {
            name: location.location_name || `Location ${location.location_id}`,
            category: 'dispatch_location',
            location_id: location.location_id,
            unit_type: location.unit_type,
            location_type: locationType,
            location_category: location.location_category,
            pit_name: location.pit_name,
            region_name: location.region_name,
            elevation_m: location.elevation_m,
            source: location.source
          },
          show: centerOn === 'dispatch' // Always show when on dispatch page
        });
        entitiesRef.current.push(box);
        addedCount++;

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding dispatch location ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} dispatch locations (${errorCount} errors), centerOn: ${centerOn}, visible: ${centerOn === 'dispatch'}`);

    // Force visibility update and verify
    if (centerOn === 'dispatch') {
      let visibleCount = 0;
      let hiddenCount = 0;
      entitiesRef.current.forEach(entity => {
        if (entity && entity.properties) {
          const category = entity.properties.category?._value || entity.properties.category;
          if (category === 'dispatch_location') {
            entity.show = true;
            if (entity.show) visibleCount++;
            else hiddenCount++;
          }
        }
      });
      // console.log(`[Consolidated Map] 📊 Dispatch locations visibility: ${visibleCount} visible, ${hiddenCount} hidden`);

      // Verify entities are in viewer
      const viewerEntityCount = cesiumViewer.entities.values.length;
      // console.log(`[Consolidated Map] 📊 Total entities in Cesium viewer: ${viewerEntityCount}`);

      // Check first few entities
      if (addedCount > 0) {
        const firstEntity = entitiesRef.current.find(e => {
          if (e && e.properties) {
            const cat = e.properties.category?._value || e.properties.category;
            return cat === 'dispatch_location';
          }
          return false;
        });
        if (firstEntity) {
          // console.log(`[Consolidated Map] 📊 Sample entity: show=${firstEntity.show}, position=${firstEntity.position?._value || 'N/A'}`);
        }
      }
    }

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
      // console.log(`[Consolidated Map] 🔄 Requested scene render`);
    }
  };

  const addDispatchSegmentsToCesium = (cesiumViewer) => {
    if (!dispatchSegments || dispatchSegments.length === 0) {
      // console.warn('[Consolidated Map] No dispatch segments available');
      return;
    }

    // console.log(`[Consolidated Map] 🛣️ Adding ${dispatchSegments.length} dispatch segments to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    dispatchSegments.forEach((segment, index) => {
      try {
        let geometry = segment.geometry;
        if (!geometry) {
          errorCount++;
          return;
        }

        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            errorCount++;
            return;
          }
        }

        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          errorCount++;
          return;
        }

        const positions = [];
        if (geometry.type === 'LineString' && geometry.coordinates) {
          geometry.coordinates.forEach(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2) {
              const lon = parseFloat(coord[0]);
              const lat = parseFloat(coord[1]);
              if (!isNaN(lon) && !isNaN(lat)) {
                positions.push(window.Cesium.Cartesian3.fromDegrees(lon, lat, 0.3));
              }
            }
          });
        }

        if (positions.length < 2) {
          errorCount++;
          return;
        }

        // Color based on road status (matching Mapbox Dispatch styling)
        // Closed roads: Red (#FF6B6B), Open roads: Gold (#FFD700)
        const isClosed = isDispatchSegmentClosed(segment);
        const segmentColor = window.Cesium.Color.fromCssColorString(isClosed ? '#FF6B6B' : '#FFD700');

        // Add shadow/base layer (MUCH WIDER) - matching Mapbox
        const shadowPolyline = cesiumViewer.entities.add({
          polyline: {
            positions: positions,
            width: 30, // MUCH WIDER shadow
            material: window.Cesium.Color.fromCssColorString('rgba(5, 5, 5, 0.95)'), // Dark shadow
            clampToGround: true
          },
          name: `Lane ${segment.lane_id} Shadow`,
          properties: {
            category: 'dispatch_segment_shadow',
            lane_id: segment.lane_id
          },
          show: centerOn === 'dispatch'
        });
        entitiesRef.current.push(shadowPolyline);

        // Add center line (colored, MUCH THICKER) - matching Mapbox
        const polyline = cesiumViewer.entities.add({
          polyline: {
            positions: positions,
            width: 20, // MUCH THICKER center line - VERY VISIBLE
            material: segmentColor,
            clampToGround: true
          },
          name: `Lane ${segment.lane_id} (Road ${segment.road_id})${isClosed ? ' [CLOSED]' : ''}`,
          properties: {
            name: `Lane ${segment.lane_id}${isClosed ? ' [CLOSED]' : ''}`,
            category: 'dispatch_segment',
            lane_id: segment.lane_id,
            road_id: segment.road_id,
            direction: segment.direction,
            length_m: segment.length_m,
            time_empty_seconds: segment.time_empty_seconds,
            time_loaded_seconds: segment.time_loaded_seconds,
            is_closed: segment.is_closed,
            status: isClosed ? 'Closed' : 'Open'
          },
          show: centerOn === 'dispatch' // Always show when on dispatch page
        });
        entitiesRef.current.push(polyline);
        addedCount++;

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding dispatch segment ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} dispatch segments (${errorCount} errors), centerOn: ${centerOn}, visible: ${centerOn === 'dispatch'}`);

    // Force visibility update
    if (centerOn === 'dispatch') {
      entitiesRef.current.forEach(entity => {
        if (entity && entity.properties) {
          const category = entity.properties.category?._value || entity.properties.category;
          if (category === 'dispatch_segment') {
            entity.show = true;
          }
        }
      });
    }

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }

    setupDispatchSegmentWidthScaling(cesiumViewer);
  };

  const addDispatchTrolleyToCesium = (cesiumViewer) => {
    if (!dispatchTrolley || dispatchTrolley.length === 0) {
      // console.warn('[Consolidated Map] No trolley segments available');
      return;
    }

    // console.log(`[Consolidated Map] 🔌 Adding ${dispatchTrolley.length} trolley segments to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    dispatchTrolley.forEach((trolley, index) => {
      try {
        let geometry = trolley.geometry;
        if (!geometry) {
          errorCount++;
          return;
        }

        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            errorCount++;
            return;
          }
        }

        if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
          errorCount++;
          return;
        }

        const positions = [];
        if (geometry.type === 'LineString' && geometry.coordinates) {
          geometry.coordinates.forEach(coord => {
            if (coord && Array.isArray(coord) && coord.length >= 2) {
              const lon = parseFloat(coord[0]);
              const lat = parseFloat(coord[1]);
              if (!isNaN(lon) && !isNaN(lat)) {
                positions.push(window.Cesium.Cartesian3.fromDegrees(lon, lat, 0.5));
              }
            }
          });
        }

        if (positions.length < 2) {
          errorCount++;
          return;
        }

        // Green color for trolley lines (matching Mapbox Dispatch styling)
        const trolleyColor = window.Cesium.Color.fromCssColorString('#00FF00');

        const polyline = cesiumViewer.entities.add({
          polyline: {
            positions: positions,
            width: 6,
            material: trolleyColor,
            clampToGround: true
          },
          name: trolley.lane_name || `Trolley Lane ${trolley.lane_id}`,
          properties: {
            name: trolley.lane_name || `Trolley ${trolley.lane_id}`,
            category: 'dispatch_trolley',
            lane_id: trolley.lane_id,
            lane_name: trolley.lane_name,
            direction: trolley.direction,
            length_m: trolley.length_m,
            trolley_voltage: trolley.trolley_voltage,
            trolley_current_limit: trolley.trolley_current_limit,
            trolley_wire_height: trolley.trolley_wire_height
          },
          show: centerOn === 'dispatch' // Always show when on dispatch page
        });
        entitiesRef.current.push(polyline);
        addedCount++;

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding trolley ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} trolley segments (${errorCount} errors)`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };

  const addDispatchWateringToCesium = (cesiumViewer) => {
    if (!dispatchWatering || dispatchWatering.length === 0) {
      // console.warn('[Consolidated Map] No watering stations available');
      return;
    }

    // console.log(`[Consolidated Map] 💧 Adding ${dispatchWatering.length} watering stations to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    dispatchWatering.forEach((station, index) => {
      try {
        if (!station.latitude || !station.longitude) {
          errorCount++;
          return;
        }

        const lat = parseFloat(station.latitude);
        const lon = parseFloat(station.longitude);

        if (isNaN(lat) || isNaN(lon)) {
          errorCount++;
          return;
        }

        // Blue color for watering stations
        const wateringColor = window.Cesium.Color.fromCssColorString('#1E90FF');

        const point = cesiumViewer.entities.add({
          position: window.Cesium.Cartesian3.fromDegrees(lon, lat, 1),
          point: {
            pixelSize: 10,
            color: wateringColor,
            outlineColor: window.Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
          },
          name: station.station_name || `Station ${station.station_id}`,
          properties: {
            name: station.station_name || `Station ${station.station_id}`,
            category: 'dispatch_watering',
            station_id: station.station_id,
            station_name: station.station_name,
            station_code: station.station_code,
            station_type: station.station_type,
            capacity_liters: station.capacity_liters,
            current_level_percent: station.current_level_percent,
            status: station.status
          },
          show: centerOn === 'dispatch' // Always show when on dispatch page
        });
        entitiesRef.current.push(point);
        addedCount++;

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding watering station ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} watering stations (${errorCount} errors)`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };

  const addDispatchSpeedToCesium = (cesiumViewer) => {
    if (!dispatchSpeed || dispatchSpeed.length === 0) {
      // console.warn('[Consolidated Map] No speed monitoring points available');
      return;
    }

    // console.log(`[Consolidated Map] 🚦 Adding ${dispatchSpeed.length} speed monitoring points to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    dispatchSpeed.forEach((point, index) => {
      try {
        if (!point.latitude || !point.longitude) {
          errorCount++;
          return;
        }

        const lat = parseFloat(point.latitude);
        const lon = parseFloat(point.longitude);

        if (isNaN(lat) || isNaN(lon)) {
          errorCount++;
          return;
        }

        // Red color for speed monitoring
        const speedColor = window.Cesium.Color.fromCssColorString('#DC143C');

        const marker = cesiumViewer.entities.add({
          position: window.Cesium.Cartesian3.fromDegrees(lon, lat, 1),
          point: {
            pixelSize: 8,
            color: speedColor,
            outlineColor: window.Cesium.Color.YELLOW,
            outlineWidth: 1,
            heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
          },
          name: `Speed Monitor ${point.monitoring_id}`,
          properties: {
            name: `Speed Monitor ${point.monitoring_id}`,
            category: 'dispatch_speed',
            monitoring_id: point.monitoring_id,
            lane_id: point.lane_id,
            measure: point.measure,
            speed_kmh: point.speed_kmh,
            violation_type: point.violation_type,
            operational_mode: point.operational_mode
          },
          show: centerOn === 'dispatch' // Always show when on dispatch page
        });
        entitiesRef.current.push(marker);
        addedCount++;

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding speed monitor ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} speed monitoring points (${errorCount} errors)`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };

  const addDispatchIntersectionsToCesium = (cesiumViewer) => {
    if (!dispatchIntersections || dispatchIntersections.length === 0) {
      // console.warn('[Consolidated Map] No dispatch intersections available');
      return;
    }

    // console.log(`[Consolidated Map] 🚧 Adding ${dispatchIntersections.length} dispatch intersections to Cesium`);

    let addedCount = 0;
    let errorCount = 0;

    dispatchIntersections.forEach((intersection, index) => {
      try {
        let geometry = intersection.geometry;
        if (!geometry) {
          // if (index < 3) // console.warn(`[Intersection ${index}] No geometry field`);
          errorCount++;
          return;
        }

        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            // if (index < 3) // console.warn(`[Intersection ${index}] Failed to parse geometry:`, e);
            errorCount++;
            return;
          }
        }

        if (!geometry || !geometry.coordinates) {
          // if (index < 3) // console.warn(`[Intersection ${index}] No coordinates. Geometry:`, geometry);
          errorCount++;
          return;
        }

        // if (index < 3) // console.log(`[Intersection ${index}] Geometry type: ${geometry.type}, has coordinates:`, !!geometry.coordinates);

        // RED transparent color for dispatch intersections (2D flat)
        const intersectionColor = window.Cesium.Color.fromCssColorString('#FF0000').withAlpha(0.5); // RED, transparent

        if (geometry.type === 'Point' && geometry.coordinates && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
          // Handle Point geometry - create a 2D flat red transparent circle
          const lon = parseFloat(geometry.coordinates[0]);
          const lat = parseFloat(geometry.coordinates[1]);

          if (!isNaN(lon) && !isNaN(lat)) {
            // Create a circular buffer around the point (use safety_buffer or r_min, default to 30m for visibility)
            const radius = intersection.safety_buffer_m || intersection.r_min_m || 30;
            const radiusRadians = radius / 6378137; // Convert meters to radians

            const positions = [];
            for (let i = 0; i <= 64; i++) { // More points for smoother circle
              const angle = (i / 64) * Math.PI * 2;
              const latOffset = radiusRadians * Math.cos(angle);
              const lonOffset = radiusRadians * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
              positions.push(window.Cesium.Cartesian3.fromDegrees(lon + lonOffset * 180 / Math.PI, lat + latOffset * 180 / Math.PI, 0));
            }

            const polygon = cesiumViewer.entities.add({
              polygon: {
                hierarchy: positions,
                material: intersectionColor, // RED transparent
                outline: true,
                outlineColor: window.Cesium.Color.RED,
                outlineWidth: 2,
                height: 0, // 2D FLAT - no height
                heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
              },
              name: intersection.intersection_name || `Intersection ${intersection.intersection_id}`,
              properties: {
                name: intersection.intersection_name || `Intersection ${intersection.intersection_id}`,
                category: 'dispatch_intersection',
                intersection_id: intersection.intersection_id,
                intersection_name: intersection.intersection_name,
                intersection_type: intersection.intersection_type,
                safety_buffer_m: intersection.safety_buffer_m,
                r_min_m: intersection.r_min_m
              },
              show: centerOn === 'dispatch' // Always show when on dispatch page
            });
            entitiesRef.current.push(polygon);
            addedCount++;
          }
        } else if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates[0]) {
          const positions = geometry.coordinates[0].map(coord =>
            window.Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0) // 2D FLAT
          );

          const polygon = cesiumViewer.entities.add({
            polygon: {
              hierarchy: positions,
              material: intersectionColor, // RED transparent
              outline: true,
              outlineColor: window.Cesium.Color.RED,
              outlineWidth: 2,
              height: 0, // 2D FLAT - no height
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
            },
            name: intersection.intersection_name || `Intersection ${intersection.intersection_id}`,
            properties: {
              name: intersection.intersection_name || `Intersection ${intersection.intersection_id}`,
              category: 'dispatch_intersection',
              intersection_id: intersection.intersection_id,
              intersection_name: intersection.intersection_name,
              intersection_type: intersection.intersection_type,
              safety_buffer_m: intersection.safety_buffer_m,
              r_min_m: intersection.r_min_m
            },
            show: centerOn === 'dispatch' ? showDispatchIntersections : false
          });
          entitiesRef.current.push(polygon);
          addedCount++;
        }

      } catch (err) {
        errorCount++;
        console.error(`[Consolidated Map] Error adding dispatch intersection ${index}:`, err);
      }
    });

    // console.log(`[Consolidated Map] ✅ Added ${addedCount} dispatch intersections (${errorCount} errors)`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
    }
  };

  const addPolygonsToCesium = (cesiumViewer) => {
    if (!consolidatedData?.consolidated_locations) {
      // console.warn('[Consolidated Map] No consolidated data available');
      return;
    }

    const locationCount = consolidatedData?.consolidated_locations?.length || 0;
    // console.log(`[Consolidated Map] Adding ${locationCount} locations to Cesium`);

    // Only clear Frontrunner location/intersection entities.
    // Preserve Dispatch entities and pre-computed road markers.
    if (cesiumViewer && cesiumViewer.entities) {
      const entitiesToRemove = [];
      entitiesRef.current.forEach((entity, idx) => {
        if (entity && entity.properties) {
          const category = entity.properties.category?._value || entity.properties.category;
          const styleRole = entity.properties.style_role?._value || entity.properties.style_role;
          const isDispatchEntity = category && category.startsWith('dispatch_');
          const isRoadMarker = styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center';
          // Remove only Frontrunner location/intersection entities (non-dispatch, non-road-marker)
          if (!isDispatchEntity && !isRoadMarker) {
            entitiesToRemove.push(entity);
          }
        }
      });
      entitiesToRemove.forEach(entity => {
        try {
          cesiumViewer.entities.remove(entity);
        } catch (e) {
          // console.warn('Error removing entity:', e);
        }
      });
      entitiesRef.current = entitiesRef.current.filter(entity => {
        if (entity && entity.properties) {
          const category = entity.properties.category?._value || entity.properties.category;
          const styleRole = entity.properties.style_role?._value || entity.properties.style_role;
          const isDispatchEntity = category && category.startsWith('dispatch_');
          const isRoadMarker = styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center';
          return isDispatchEntity || isRoadMarker;
        }
        return false;
      });
    } else {
      // Fallback: if viewer not available, keep road markers (if any)
      entitiesRef.current = entitiesRef.current.filter(entity => {
        const styleRole = entity?.properties?.style_role?._value || entity?.properties?.style_role;
        return styleRole === 'road_corner_marker' || styleRole === 'road_corner_side_center';
      });
    }

    if (consolidatedData?.consolidated_locations) {
      const categoryStats = {};
      let skippedNoPolygon = 0;
      let skippedInvalidGeometry = 0;
      let processedCount = 0;

      consolidatedData.consolidated_locations.forEach((location, index) => {
        try {
          if (!location.polygon) {
            skippedNoPolygon++;
            return;
          }

          let geometry = location.polygon;
          if (typeof geometry === 'string') {
            try {
              geometry = JSON.parse(geometry);
            } catch (e) {
              // console.warn(`[Consolidated Map] Failed to parse polygon for location ${index}:`, e);
              return;
            }
          }

          if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
            skippedInvalidGeometry++;
            return;
          }

          // console.log(`[Consolidated Map] Processing location ${index}: ${location.location_name}, type: ${geometry.type}, coords: ${geometry.coordinates?.[0]?.length || 0} points`);

          const positions = [];
          if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
            geometry.coordinates[0].forEach(coord => {
              // Always use z=0 for base positions, height will be set via heightReference
              positions.push(window.Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0));
            });
          }
          if (positions.length === 0) {
            // console.warn(`[Consolidated Map] No positions for location ${index}: ${location.location_name}`);
            return;
          }

          // Use the actual category name, PRESERVE ORIGINAL CASE - show all individual categories
          let category = location.category || 'default';
          // Preserve original case, only trim whitespace
          if (typeof category === 'string') {
            category = category.trim();
          } else {
            category = String(category || 'default').trim();
          }

          // Track category statistics
          categoryStats[category] = (categoryStats[category] || 0) + 1;
          processedCount++;

          // Check if location is closed
          const isClosed = location.is_open === false || location.is_open === 0 || location.is_open === 'false';

          // Debug logging for first few locations
          if (index < 3) {
            console.log(`[Consolidated Map] Location ${index} (${location.location_name}): is_open=${location.is_open}, isClosed=${isClosed}`);
          }

          const categoryColor = getCategoryColor(category);
          const fillAlpha = activeTheme.locationFillAlpha ?? 0.94;
          const outlineLighten = activeTheme.locationOutlineLighten ?? 25;
          const topLighten = activeTheme.locationTopLighten ?? 35;
          const topAlpha = activeTheme.locationTopAlpha ?? 0.97;

          // Use darker/muted colors for closed locations
          const baseColor = isClosed ? lightenColor(categoryColor, -30) : categoryColor;
          const baseFill = window.Cesium.Color.fromCssColorString(baseColor).withAlpha(isClosed ? fillAlpha * 0.6 : fillAlpha);
          const outlineColor = window.Cesium.Color.fromCssColorString(lightenColor(baseColor, outlineLighten)).withAlpha(1.0);
          const topMaterial = window.Cesium.Color.fromCssColorString(lightenColor(baseColor, topLighten)).withAlpha(topAlpha);

          // Create hatching material for closed locations
          let locationMaterial = baseFill;
          if (isClosed) {
            // Use StripeMaterialProperty for hatching pattern
            // Make the pattern more visible with higher contrast
            const evenColor = baseFill;
            const oddColor = window.Cesium.Color.fromCssColorString('#FF0000').withAlpha(0.5); // Red stripes for visibility
            locationMaterial = new window.Cesium.StripeMaterialProperty({
              evenColor: evenColor,
              oddColor: oddColor,
              repeat: 12, // More stripes for better visibility
              orientation: window.Cesium.StripeOrientation.HORIZONTAL
            });
            if (index < 3) {
              console.log(`[Consolidated Map] ✅ Applied hatching to closed location ${index}: ${location.location_name}`);
            }
          }

          // Use z/altitude value if available, if it's 0 use 3 meters instead
          // Divide z values by factor to convert units (e.g., 1000 for mm to m, 100 for cm to m)
          const Z_FACTOR = 1000; // Adjust this factor as needed
          const locationAltitude = location.avg_altitude || location.altitude || null;
          const hasAltitude = locationAltitude !== null && locationAltitude !== undefined && !isNaN(locationAltitude);

          // Standardized height for all entities
          const standardHeight = 0.3; // Same height as all other entities

          const entity = cesiumViewer.entities.add({
            polygon: {
              hierarchy: positions,
              material: locationMaterial,
              outline: true,
              outlineColor: isClosed ? window.Cesium.Color.RED.withAlpha(0.8) : outlineColor,
              outlineWidth: isClosed ? 2.0 : 1.5,
              height: 0.0, // Same level as all other entities
              extrudedHeight: standardHeight, // Same height as all other entities
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
            },
            name: location.location_name || `Location ${index}`,
            properties: {
              name: location.location_name,
              category: category,
              style_role: 'location_base',
              total_points: location.total_points,
              area_sqm: location.area_sqm,
              perimeter_m: location.perimeter_m,
              is_open: location.is_open,
              on_hold_by_dispatcher: location.on_hold_by_dispatcher,
              on_hold_by_operator: location.on_hold_by_operator,
              // Extended pit_loc fields
              pit_loc_cid: location.pit_loc_cid,
              location_survey: location.location_survey,
              def_dump_prof: location.def_dump_prof,
              cur_dump_prof: location.cur_dump_prof,
              inclination: location.inclination,
              mixed_location_current_type: location.mixed_location_current_type,
              pit_loc_attributes: location.pit_loc_attributes,
              loc_info_attributes: location.loc_info_attributes,
              color: baseColor
            },
            show: visibleCategories.size === 0 || visibleCategories.has(category)
          });

          entitiesRef.current.push(entity);

          const topPositions = positions.map(pos => {
            const cartographic = window.Cesium.Cartographic.fromCartesian(pos);
            cartographic.height = standardHeight; // Same height as all other entities
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
              outlineColor: outlineColor.withAlpha(0.8),
              outlineWidth: 1.2,
              height: standardHeight, // Same height as all other entities
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
            },
            name: `${location.location_name || `Location ${index}`} - Top`,
            properties: {
              name: location.location_name,
              category: category,
              style_role: 'location_top',
              isTop: true
            },
            show: visibleCategories.size === 0 || visibleCategories.has(category)
          });

          entitiesRef.current.push(topEntity);

          // Location center points removed - user only wants road-intersection center points

          if (index % 10 === 0) {
            cesiumViewer.scene.requestRender();
          }

          if (index < 5 || index % 20 === 0) {
            const areaKm2 = (location.area_sqm || 0) / 1000000;
            // console.log(`[Consolidated Map] Added entity ${index}: ${location.location_name}, category: ${category}, area: ${areaKm2.toFixed(2)} km², color: ${categoryColor}, visible: ${entity.show}`);
          }
        } catch (err) {
          // console.warn(`[Consolidated Map] Error adding polygon ${index}:`, err);
        }
      });

      // Log category statistics
      console.log(`[Consolidated Map] ✅ Processed ${processedCount} locations, skipped ${skippedNoPolygon} (no polygon), ${skippedInvalidGeometry} (invalid geometry)`);
      console.log(`[Consolidated Map] 📊 Categories found (${Object.keys(categoryStats).length}):`, Object.keys(categoryStats).sort());
      console.log(`[Consolidated Map] 📊 Category counts:`, Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).map(([cat, count]) => `${cat}: ${count}`).join(', '));
    }

    // Add 3D geometry layer (geometry_wkt_3d) if enabled
    // First, remove any existing 3D geometry entities
    entitiesRef.current = entitiesRef.current.filter(entity => {
      const props = entity.properties;
      const is3d = props?.is_3d_geometry?.getValue ? props.is_3d_geometry.getValue() : props?.is_3d_geometry;
      if (is3d) {
        cesiumViewer.entities.remove(entity);
        return false;
      }
      return true;
    });

    if (showGeometry3D && consolidatedData?.consolidated_locations) {
      consolidatedData.consolidated_locations.forEach((location, index) => {
        try {
          if (!location.geometry_3d) {
            return;
          }

          let geometry3d = location.geometry_3d;
          if (typeof geometry3d === 'string') {
            try {
              geometry3d = JSON.parse(geometry3d);
            } catch (e) {
              return;
            }
          }

          if (!geometry3d || !geometry3d.coordinates || geometry3d.coordinates.length === 0) {
            return;
          }

          const positions3d = [];
          if (geometry3d.type === 'Polygon' && geometry3d.coordinates[0]) {
            geometry3d.coordinates[0].forEach(coord => {
              positions3d.push(window.Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0));
            });
          }

          if (positions3d.length === 0) {
            return;
          }

          // Render 3D geometry with semi-transparent overlay to compare with original
          const entity3d = cesiumViewer.entities.add({
            polygon: {
              hierarchy: positions3d,
              material: window.Cesium.Color.CYAN.withAlpha(0.4),
              outline: true,
              outlineColor: window.Cesium.Color.CYAN.withAlpha(0.9),
              outlineWidth: 2.5,
              height: 0.0, // Same level as all other entities
              heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND
            },
            name: `${location.location_name || `Location ${index}`} - 3D Geometry`,
            properties: {
              name: location.location_name,
              category: 'geometry_3d',
              style_role: 'geometry_3d_overlay',
              is_3d_geometry: true
            },
            show: showGeometry3D
          });

          entitiesRef.current.push(entity3d);
        } catch (err) {
          // Silently skip errors
        }
      });
    }

    // console.log(`[Consolidated Map] Added ${entitiesRef.current.length} location entities`);

    if (cesiumViewer.scene) {
      cesiumViewer.scene.requestRender();
      // console.log('[Consolidated Map] Forced scene render');
    }
  };

  const centerCameraOnData = (cesiumViewer, dataType = 'all') => {
    if (!cesiumViewer || !cesiumViewer.scene || !cesiumViewer.camera) {
      console.warn('[Consolidated Map] ⚠️ centerCameraOnData skipped: Cesium viewer not ready', {
        hasViewer: !!cesiumViewer,
        hasScene: !!cesiumViewer?.scene,
        hasCamera: !!cesiumViewer?.camera
      });
      return;
    }

    try {
      const positions = [];
      entitiesRef.current.forEach(entity => {
        // Filter by data type if specified
        if (dataType === 'frontrunner') {
          const category = entity.properties?.category?.getValue ?
            entity.properties.category.getValue() :
            entity.properties?.category;
          // Only include Frontrunner entities
          if (category !== 'course' && category !== 'travel' && category !== 'survey_path' &&
            category !== 'intersection' && !category?.includes('pit') && !category?.includes('parking') &&
            !category?.includes('crusher') && !category?.includes('fuel')) {
            return; // Skip non-Frontrunner entities
          }
        } else if (dataType === 'dispatch') {
          const category = entity.properties?.category?.getValue ?
            entity.properties.category.getValue() :
            entity.properties?.category;
          // Only include Dispatch entities
          if (category !== 'dispatch_location' &&
            category !== 'dispatch_segment' &&
            category !== 'dispatch_intersection' &&
            category !== 'dispatch_trolley' &&
            category !== 'dispatch_watering' &&
            category !== 'dispatch_speed') {
            return; // Skip non-Dispatch entities
          }
        }

        if (entity.polygon && entity.polygon.hierarchy) {
          try {
            const hierarchy = entity.polygon.hierarchy.getValue ?
              entity.polygon.hierarchy.getValue(window.Cesium.JulianDate.now()) :
              entity.polygon.hierarchy;
            if (hierarchy && hierarchy.positions) {
              positions.push(...hierarchy.positions);
            }
          } catch (e) { }
        }
        if (entity.position) {
          try {
            const pos = entity.position.getValue ?
              entity.position.getValue(window.Cesium.JulianDate.now()) :
              entity.position;
            if (window.Cesium.defined(pos)) {
              positions.push(pos);
            }
          } catch (e) { }
        }
        if (entity.corridor && entity.corridor.positions) {
          try {
            const corridorPositions = entity.corridor.positions.getValue ?
              entity.corridor.positions.getValue(window.Cesium.JulianDate.now()) :
              entity.corridor.positions;
            if (corridorPositions) {
              positions.push(...corridorPositions);
            }
          } catch (e) { }
        }
        if (entity.polyline && entity.polyline.positions) {
          try {
            const polylinePositions = entity.polyline.positions.getValue ?
              entity.polyline.positions.getValue(window.Cesium.JulianDate.now()) :
              entity.polyline.positions;
            if (polylinePositions) {
              positions.push(...polylinePositions);
            }
          } catch (e) { }
        }
      });

      if (positions.length === 0) {
        // console.warn(`[Consolidated Map] No positions found for ${dataType}, using default center`);
        const center = window.Cesium.Cartesian3.fromDegrees(119.5, -23.5, 5000);
        if (cesiumViewer?.camera) {
          cesiumViewer.camera.flyTo({
            destination: center,
            orientation: {
              heading: window.Cesium.Math.toRadians(0),
              pitch: window.Cesium.Math.toRadians(-60),
              roll: 0.0
            },
            duration: 2.0
          });
        }
        return;
      }

      // console.log('[Consolidated Map] Found positions:', positions.length);

      const boundingSphere = window.Cesium.BoundingSphere.fromPoints(positions);
      if (!window.Cesium.defined(boundingSphere)) {
        const center = window.Cesium.Cartesian3.fromDegrees(119.5, -23.5, 8000);
        if (cesiumViewer?.camera) {
          cesiumViewer.camera.flyTo({
            destination: center,
            orientation: {
              heading: window.Cesium.Math.toRadians(0),
              pitch: window.Cesium.Math.toRadians(-90), // -90 degrees = straight down (top-down view, parallel to equator)
              roll: 0.0
            },
            duration: 2.0
          });
        }
        return;
      }

      setTimeout(() => {
        // console.log('[Consolidated Map] Flying to bounding sphere:', {
        //   center: window.Cesium.Cartographic.fromCartesian(boundingSphere.center),
        //   radius: boundingSphere.radius
        // });
        if (cesiumViewer?.camera) {
          cesiumViewer.camera.flyToBoundingSphere(boundingSphere, {
            offset: new window.Cesium.HeadingPitchRange(
              window.Cesium.Math.toRadians(0),
              window.Cesium.Math.toRadians(-90), // -90 degrees = straight down (top-down view, parallel to equator)
              boundingSphere.radius * 1.5
            ),
            duration: 2.0
          });
        }
      }, 1000);
    } catch (error) {
      console.error('[Consolidated Map] Error centering camera:', error);
      if (cesiumViewer?.camera) {
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
    }
  };

  const getCategoryCounts = () => {
    const counts = {};
    const allCategoriesFound = new Set();

    if (consolidatedData?.consolidated_locations) {
      consolidatedData.consolidated_locations.forEach(location => {
        // Use the actual category, PRESERVE ORIGINAL CASE - show all individual categories
        let category = location.category;
        // Handle null, undefined, empty string
        if (!category || category === '' || String(category).toLowerCase() === 'null' || String(category).toLowerCase() === 'undefined') {
          category = 'default';
        }
        // Preserve original case - only normalize whitespace
        if (typeof category === 'string') {
          category = category.trim();
        } else {
          category = String(category || 'default').trim();
        }

        // Track ALL categories found (for debugging)
        allCategoriesFound.add(category);

        // Count by individual category, not consolidated (skip empty, intersection, and gate - intersections belong in Road Networks, gates should be hidden)
        const normalizedCat = category.toLowerCase();
        if (category && category !== '' && normalizedCat !== 'intersection' && normalizedCat !== 'gate') {
          counts[category] = (counts[category] || 0) + 1;
        }
      });
    }

    // Debug logging
    console.log('[Consolidated Map] 📊 getCategoryCounts - All categories found:', Array.from(allCategoriesFound).sort());
    console.log('[Consolidated Map] 📊 getCategoryCounts - Categories after filtering:', Object.keys(counts).sort());
    console.log('[Consolidated Map] 📊 Looking for: Dump Site, Parking Bay, Fuel Station');
    console.log('[Consolidated Map] 📊 Found "Dump Site":', allCategoriesFound.has('Dump Site'));
    console.log('[Consolidated Map] 📊 Found "Parking Bay":', allCategoriesFound.has('Parking Bay'));
    console.log('[Consolidated Map] 📊 Found "Fuel Station":', allCategoriesFound.has('Fuel Station'));

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
      // Don't handle 'gate' - gates should always be hidden
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
      // Check ALL entities in the viewer, not just entitiesRef
      const allEntities = Array.from(cesiumViewerRef.current.entities.values);
      console.log(`[Consolidated Map] Toggling ${consolidatedCategory}, total entities: ${allEntities.length}`);

      allEntities.forEach((entity, entityIndex) => {
        if (entity && entity.properties) {
          // Cesium properties might need getValue()
          let entityCategory = entity.properties.category?.getValue ? entity.properties.category.getValue() : entity.properties.category;

          if (consolidatedCategory === 'intersection') {
            // Only toggle 'intersection' category, not 'gate'
            // Normalize category for comparison
            const normalizedCategory = typeof entityCategory === 'string' ? entityCategory.toLowerCase().trim() : String(entityCategory || '').toLowerCase().trim();
            if (normalizedCategory === 'intersection') {
              entity.show = enabled;
              toggledCount++;
              if (entityIndex < 5) {
                console.log(`[Consolidated Map] Toggling intersection entity ${entityIndex}: ${entity.properties.name?.getValue ? entity.properties.name.getValue() : entity.properties.name || 'unnamed'}, category=${normalizedCategory}, show=${enabled}`);
              }
            }
            // Always hide gates
            if (normalizedCategory === 'gate') {
              entity.show = false;
            }
            // Don't return - continue checking other entities if needed
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

      // console.log(`[Consolidated Map] Toggled ${toggledCount} entities for ${consolidatedCategory} (enabled=${enabled})`);

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
      // Set camera to look straight down (top-down, parallel to equator)
      setTimeout(() => {
        const camera = cesiumViewerRef.current.camera;
        if (camera) {
          camera.setView({
            orientation: {
              heading: 0.0,
              pitch: window.Cesium.Math.toRadians(-90), // -90 = straight down (top-down)
              roll: 0.0
            }
          });
        }
      }, 100);
      // console.log('[Consolidated Map] 🗺️ Switched to 2D view');
    } else {
      cesiumViewerRef.current.scene.mode = window.Cesium.SceneMode.SCENE3D;
      cesiumViewerRef.current.scene.morphTo3D(0);
      // console.log('[Consolidated Map] 🌍 Switched to 3D view');
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

    // console.log(`[Consolidated Map] 🗺️ Changed base layer to: ${newLayer}`);
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
      {/* Top Menu Bar */}
      <TopMenuBar
        onComputePath={turnPathManager.openDialog}
        onMeasureDistance={() => measurementTool.startMeasurement('distance')}
        onMeasureArea={() => measurementTool.startMeasurement('area')}
        onShowIntersectionCurves={() => {
          console.log('[Turn Path] Show intersection curves - Coming soon');
        }}
        onManageProfiles={() => {
          console.log('[Turn Path] Manage profiles - Coming soon');
        }}
        onToggleCornerPoints={() => setShowCornerPoints(!showCornerPoints)}
        onToggleCenterPoints={() => setShowCenterPoints(!showCenterPoints)}
        showCornerPoints={showCornerPoints}
        showCenterPoints={showCenterPoints}
      />

      {/* Measurement Status Banner - shown whenever measurementMode is not null */}
      <MeasurementStatusBanner
        measurementMode={measurementTool.measurementMode}
        measurementPoints={measurementTool.measurementPoints}
        onCancel={measurementTool.cancelMeasurement}
      />

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
            top: '60px',
            right: '20px',
            backgroundColor: 'rgba(40, 40, 40, 0.75)',
            border: '1px solid rgba(120, 120, 120, 0.6)',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(15px)',
            zIndex: 1000,
            minWidth: '280px',
            maxWidth: '350px',
            maxHeight: sidebarExpanded ? '80vh' : 'auto',
            overflow: 'hidden',
            transition: 'max-height 0.3s ease',
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
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '20px',
                height: '20px',
                backgroundColor: centerOn === 'dispatch' ? '#FF6B35' : '#3498db',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
              </div>
              <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>
                {centerOn === 'dispatch' ? 'Dispatch' : 'Frontrunner'} Map
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Recenter Button */}
              <button
                onClick={() => {
                  if (cesiumViewerRef.current && entitiesRef.current.length > 0) {
                    centerCameraOnData(cesiumViewerRef.current, centerOn);
                  }
                }}
                style={{
                  backgroundColor: 'rgba(52, 152, 219, 0.3)',
                  border: '1px solid rgba(52, 152, 219, 0.5)',
                  borderRadius: '4px',
                  color: '#3498db',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(52, 152, 219, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(52, 152, 219, 0.3)';
                }}
                title="Recenter map on current data"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  style={{ display: 'inline-block', verticalAlign: 'middle' }}
                >
                  {/* Background circle */}
                  <circle cx="8" cy="8" r="7.5" fill="#000" />
                  {/* Outer ring */}
                  <circle cx="8" cy="8" r="6" fill="none" stroke="#CC5500" strokeWidth="1.5" />
                  {/* Inner solid circle */}
                  <circle cx="8" cy="8" r="3" fill="#CC5500" />
                  {/* Top crosshair line */}
                  <rect x="7" y="0" width="2" height="3" fill="#CC5500" />
                  {/* Bottom crosshair line */}
                  <rect x="7" y="13" width="2" height="3" fill="#CC5500" />
                  {/* Left crosshair line */}
                  <rect x="0" y="7" width="3" height="2" fill="#CC5500" />
                  {/* Right crosshair line */}
                  <rect x="13" y="7" width="3" height="2" fill="#CC5500" />
                </svg>
              </button>
              {/* Collapse/Expand Button */}
              <div
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                style={{
                  color: 'white',
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: '4px',
                  transition: 'transform 0.2s'
                }}
                title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {sidebarExpanded ? '▼' : '▶'}
              </div>
            </div>
          </div>

          {sidebarExpanded && (
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

                {/* <div style={{ marginTop: '10px' }}>
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
              </div> */}
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
                  onClick={() => setLocationTypesExpanded(!locationTypesExpanded)}
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
                    <span style={{ color: '#e74c3c', fontWeight: '600', fontSize: '13px' }}>
                      {centerOn === 'dispatch' ? 'Location Types' : 'Location Categories'}
                    </span>
                    <div style={{
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      borderRadius: '10px',
                      padding: '2px 8px',
                      marginLeft: '8px',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>
                      {centerOn === 'dispatch' ?
                        (dispatchLocations ? dispatchLocations.length : 0) :
                        (consolidatedData?.consolidated_locations ? consolidatedData.consolidated_locations.length : 0)
                      }
                    </div>
                  </div>
                  <div
                    id="location-types-arrow"
                    style={{ color: '#e74c3c', fontSize: '14px' }}
                  >
                    {locationTypesExpanded ? '▼' : '▶'}
                  </div>
                </div>
                <div
                  id="location-types-content"
                  style={{ padding: '8px 12px 8px 32px', display: locationTypesExpanded ? 'block' : 'none' }}
                >
                  {/* Dispatch Location Types */}
                  {centerOn === 'dispatch' && dispatchLocations && (() => {
                    const types = {};
                    dispatchLocations.forEach(loc => {
                      const type = resolveDispatchLocationType(loc);
                      types[type] = (types[type] || 0) + 1;
                    });
                    return Object.entries(types)
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
                              checked={showDispatchLocations}
                              onChange={(e) => setShowDispatchLocations(e.target.checked)}
                              style={{
                                marginRight: '8px'
                              }}
                            />
                            <div style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: getDispatchLocationColor(type),
                              marginRight: '8px',
                              borderRadius: '2px'
                            }}></div>
                            <span style={{ color: 'white', fontWeight: '500' }}>
                              {type} ({count})
                            </span>
                          </label>
                        </div>
                      ));
                  })()}

                  {/* Frontrunner Location Types */}
                  {centerOn === 'frontrunner' && Object.entries(getCategoryCounts())
                    .filter(([category]) => {
                      const normalized = category.toLowerCase();
                      // Filter out intersection (belongs in Road Networks) and gate (should be hidden)
                      return normalized !== 'intersection' && normalized !== 'gate';
                    })
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, count]) => {
                      // Check if this individual category is visible (case-insensitive)
                      const normalizedCategory = category.toLowerCase();
                      let isVisible = false;
                      for (const visibleCat of visibleCategories) {
                        if (String(visibleCat).toLowerCase() === normalizedCategory) {
                          isVisible = true;
                          break;
                        }
                      }

                      return (
                        <div key={category} style={{ marginBottom: '6px' }}>
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
                              onChange={(e) => {
                                // Toggle the individual category directly (case-insensitive)
                                const newSet = new Set(visibleCategories);
                                const normalizedCategory = category.toLowerCase();
                                // Remove any case-insensitive match first
                                for (const cat of Array.from(newSet)) {
                                  if (String(cat).toLowerCase() === normalizedCategory) {
                                    newSet.delete(cat);
                                    break;
                                  }
                                }
                                if (e.target.checked) {
                                  newSet.add(category); // Add with original case
                                }
                                setVisibleCategories(newSet);

                                // Update entity visibility
                                if (cesiumViewerRef.current) {
                                  const allEntities = Array.from(cesiumViewerRef.current.entities.values);
                                  allEntities.forEach((entity) => {
                                    if (entity && entity.properties) {
                                      let entityCategory = entity.properties.category?.getValue ? entity.properties.category.getValue() : entity.properties.category;
                                      if (entityCategory) {
                                        const normalized = typeof entityCategory === 'string' ? entityCategory.toLowerCase().trim() : String(entityCategory || '').toLowerCase().trim();
                                        if (normalized === category) {
                                          entity.show = e.target.checked;
                                        }
                                      }
                                    }
                                  });
                                  if (cesiumViewerRef.current.scene) {
                                    cesiumViewerRef.current.scene.requestRender();
                                  }
                                }
                              }}
                              style={{
                                marginRight: '8px',
                                accentColor: getCategoryColor(category)
                              }}
                            />
                            <div style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: getCategoryColor(category),
                              marginRight: '8px',
                              borderRadius: '2px'
                            }}></div>
                            <span style={{ color: 'white', fontWeight: '500' }}>
                              {getCategoryDisplayName(category)} ({count})
                            </span>
                          </label>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Road Networks - Frontrunner */}
              {centerOn === 'frontrunner' && ((intersectionsData?.consolidated_intersections && intersectionsData.consolidated_intersections.length > 0) ||
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
                      onClick={() => setRoadNetworksExpanded(!roadNetworksExpanded)}
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
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}>
                          {(intersectionsData?.consolidated_intersections?.length || 0) +
                            (coursesData?.courses?.length || 0) +
                            (travelsData?.travels?.length || 0) +
                            (roadsData?.roads?.length || 0) +
                            (surveyPathsData?.paths?.length || 0)}
                        </div>
                      </div>
                      <div
                        id="road-networks-arrow"
                        style={{ color: '#9B59B6', fontSize: '14px' }}
                      >
                        {roadNetworksExpanded ? '▼' : '▶'}
                      </div>
                    </div>
                    <div
                      id="road-networks-content"
                      style={{ padding: '8px 12px 8px 32px', display: roadNetworksExpanded ? 'block' : 'none' }}
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
                            checked={visibleCategories.has('intersection')}
                            onChange={(e) => {
                              toggleCategory('intersection', e.target.checked);
                            }}
                            style={{
                              marginRight: '8px',
                              cursor: 'pointer',
                              accentColor: '#FF0000'
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

                      {/* Courses removed - now shown as extended info in road tooltips only */}

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
                                cursor: 'pointer',
                                accentColor: '#4A90E2'
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

                      {/* Open Roads */}
                      {roadsData && roadsData.roads && roadsData.roads.length > 0 && (
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
                              checked={showRoads}
                              onChange={(e) => setShowRoads(e.target.checked)}
                              style={{
                                marginRight: '8px',
                                cursor: 'pointer',
                                accentColor: '#FFFF00'
                              }}
                            />
                            <div style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: '#FFFF00',
                              borderRadius: '2px',
                              marginRight: '8px'
                            }}></div>
                            <span style={{ color: 'white', fontWeight: '500' }}>
                              Open Roads ({roadsData.roads.filter(r => r.is_open !== false && r.is_open !== 0 && r.is_open !== 'false').length})
                            </span>
                          </label>
                        </div>
                      )}

                      {/* Closed Roads */}
                      {roadsData && roadsData.roads && roadsData.roads.length > 0 && (
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
                              checked={showClosedRoads}
                              onChange={(e) => setShowClosedRoads(e.target.checked)}
                              style={{
                                marginRight: '8px',
                                cursor: 'pointer',
                                accentColor: '#666666'
                              }}
                            />
                            <div style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: '#666666',
                              borderRadius: '2px',
                              marginRight: '8px'
                            }}></div>
                            <span style={{ color: 'white', fontWeight: '500' }}>
                              Closed Roads ({roadsData.roads.filter(r => r.is_open === false || r.is_open === 0 || r.is_open === 'false').length})
                            </span>
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
                                cursor: 'pointer',
                                accentColor: '#00FF00'
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

                      {/* Center Points Toggle */}
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
                            checked={showCenterPoints}
                            onChange={(e) => setShowCenterPoints(e.target.checked)}
                            style={{
                              marginRight: '8px',
                              cursor: 'pointer',
                              accentColor: '#FF6B6B'
                            }}
                          />
                          <div style={{
                            width: '12px',
                            height: '12px',
                            backgroundColor: '#FF6B6B',
                            borderRadius: '2px',
                            marginRight: '8px'
                          }}></div>
                          <span style={{ color: 'white', fontWeight: '500' }}>
                            Center Points ({consolidatedData?.road_side_markers?.length || 0})
                          </span>
                        </label>
                      </div>

                      {/* Corner Points Toggle - REMOVED per user request */}
                    </div>
                  </div>
                )}

              {/* Core Layers - Dispatch */}
              {centerOn === 'dispatch' && dispatchSegments && dispatchSegments.length > 0 && (
                <div style={{ borderLeft: '3px solid #3498db', margin: '8px 0' }}>
                  <div
                    id="dispatch-road-networks-header"
                    style={{
                      backgroundColor: 'rgba(52, 152, 219, 0.1)',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onClick={() => setRoadNetworksExpanded(!roadNetworksExpanded)}
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
                      </div>
                      <span style={{ color: '#3498db', fontWeight: '600', fontSize: '13px' }}>Core Layers</span>
                      <div style={{
                        backgroundColor: '#3498db',
                        color: 'white',
                        borderRadius: '10px',
                        padding: '2px 8px',
                        marginLeft: '8px',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}>
                        {(dispatchIntersections?.length || 0) +
                          (dispatchSegments?.length || 0) +
                          (dispatchTrolley?.length || 0)}
                      </div>
                    </div>
                    <div
                      id="dispatch-road-networks-arrow"
                      style={{ color: '#3498db', fontSize: '14px' }}
                    >
                      {roadNetworksExpanded ? '▼' : '▶'}
                    </div>
                  </div>
                  <div
                    id="dispatch-road-networks-content"
                    style={{ padding: '8px 12px 8px 32px', display: roadNetworksExpanded ? 'block' : 'none' }}
                  >
                    {/* Open Roads (not closed) */}
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
                          checked={showDispatchSegments}
                          onChange={(e) => setShowDispatchSegments(e.target.checked)}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer',
                            accentColor: '#FFD700'
                          }}
                        />
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#FFD700',
                          borderRadius: '2px',
                          marginRight: '8px'
                        }}></div>
                        <span style={{ color: 'white', fontWeight: '500' }}>
                          Open Roads ({dispatchSegments ? dispatchSegments.filter(s => !isDispatchSegmentClosed(s)).length : 0})
                        </span>
                      </label>
                    </div>

                    {/* Closed Roads */}
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
                          checked={showDispatchSegments}
                          onChange={(e) => setShowDispatchSegments(e.target.checked)}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer',
                            accentColor: '#FF6B6B'
                          }}
                        />
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#FF6B6B',
                          borderRadius: '2px',
                          marginRight: '8px'
                        }}></div>
                        <span style={{ color: 'white', fontWeight: '500' }}>
                          Closed Roads ({dispatchSegments ? dispatchSegments.filter(s => isDispatchSegmentClosed(s)).length : 0})
                        </span>
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
                          checked={showDispatchIntersections}
                          onChange={(e) => setShowDispatchIntersections(e.target.checked)}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer',
                            accentColor: '#FF6347'
                          }}
                        />
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#FF6347',
                          borderRadius: '2px',
                          marginRight: '8px'
                        }}></div>
                        <span style={{ color: 'white', fontWeight: '500' }}>Intersections ({dispatchIntersections?.length || 0})</span>
                      </label>
                    </div>

                    {dispatchTrolley && dispatchTrolley.length > 0 && (
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
                            checked={showDispatchTrolley}
                            onChange={(e) => setShowDispatchTrolley(e.target.checked)}
                            style={{
                              marginRight: '8px',
                              cursor: 'pointer',
                              accentColor: '#00FF00'
                            }}
                          />
                          <div style={{
                            width: '12px',
                            height: '12px',
                            backgroundColor: '#00FF00',
                            borderRadius: '2px',
                            marginRight: '8px'
                          }}></div>
                          <span style={{ color: 'white', fontWeight: '500' }}>Trolley Lines ({dispatchTrolley.length})</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
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
                    // Filter out internal Cesium properties and geometry objects
                    const skipKeys = [
                      'linestring', 'polygon', 'geometry', 'geometry_3d',
                      'propertyNames', 'definitionChanged', '_listeners', '_scopes', '_toRemove', '_insideRaiseEvent',
                      'color', 'style_role' // User doesn't want these displayed
                    ];
                    // Also skip keys starting with underscore (internal)
                    if (key.startsWith('_')) return false;
                    return !skipKeys.includes(key);
                  })
                  .sort(([a], [b]) => {
                    // Sort: important fields first, then alphabetically
                    const important = ['name', 'category', 'course_name', 'path_oid', 'location_name', 'intersection_name', 'width_m', 'length_m', 'is_open', 'from_location_name', 'to_location_name', 'road_id'];
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
                      if (key.includes('length') || key.includes('distance') || key.includes('width') || key.includes('perimeter')) {
                        displayValue = value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${value.toFixed(2)} m`;
                      } else if (key.includes('area')) {
                        displayValue = value >= 1000000 ? `${(value / 1000000).toFixed(2)} km²` : `${value.toFixed(2)} m²`;
                      } else if (key.includes('latitude') || key.includes('longitude')) {
                        displayValue = value.toFixed(6);
                      } else {
                        displayValue = value.toString();
                      }
                    } else if (typeof value === 'object') {
                      // Handle circular references and complex objects
                      try {
                        // Try to stringify with a replacer that handles circular refs
                        const seen = new WeakSet();
                        displayValue = JSON.stringify(value, (key, val) => {
                          if (val !== null && typeof val === 'object') {
                            if (seen.has(val)) {
                              return '[Circular]';
                            }
                            seen.add(val);
                          }
                          // Skip functions and undefined
                          if (typeof val === 'function') {
                            return '[Function]';
                          }
                          if (val === undefined) {
                            return '[Undefined]';
                          }
                          return val;
                        }, 2);
                      } catch (e) {
                        // If stringify still fails, show a simple representation
                        if (value && typeof value === 'object') {
                          if (Array.isArray(value)) {
                            displayValue = `[Array with ${value.length} items]`;
                          } else {
                            const keys = Object.keys(value).slice(0, 5);
                            displayValue = `{${keys.join(', ')}${Object.keys(value).length > 5 ? '...' : ''}}`;
                          }
                        } else {
                          displayValue = String(value);
                        }
                      }
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

      {/* Turn Path UI Components */}
      {turnPathManager.isDialogOpen && (
        <>
          {/* Status Banner (shown during road selection) */}
          <TurnPathStatusBanner
            currentStep={turnPathManager.currentStep}
            selectedSourceRoad={turnPathManager.selectedSourceRoad}
            selectedDestinationRoad={turnPathManager.selectedDestinationRoad}
            onCancel={turnPathManager.closeDialog}
          />

          {/* Dialog (shown during profile selection and computing) */}
          <TurnPathDialog
            isOpen={turnPathManager.isDialogOpen}
            onClose={turnPathManager.closeDialog}
            onStartSelection={turnPathManager.startSelection}
            vehicleProfiles={turnPathManager.vehicleProfiles}
            currentStep={turnPathManager.currentStep}
          />
        </>
      )}
    </div>
  );
};

export default ConsolidatedPolygonMap;
