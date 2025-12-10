import React, { useState, useEffect, useRef, useMemo } from 'react';
import Script from 'next/script';
import { randomUUID as uuidv4 } from 'crypto';
import TopMenuBar from './TopMenuBar';
import TurnPathDialog from './TurnPathDialog';
import TurnPathStatusBanner from './TurnPathStatusBanner';
import useTurnPathManager from './useTurnPathManager';
import useMeasurementTool from './useMeasurementTool';
import RoadProfileViewer from './RoadProfileViewer';
import SpeedManagementViewer from './SpeedManagementViewer';

// Color palette and helpers
const DISPATCH_LOCATION_COLOR_MAP = {
    'call point': '#FF6B6B', 'dump': '#FF8E72', 'blast': '#FFB347', 'stockpile': '#FFD166',
    'workshop': '#F4A261', 'shiftchange': '#06D6A0', 'region': '#118AB2', 'crusher': '#9B5DE5',
    'high dump': '#FF6B6B', 'load': '#FFD166', 'paddock dump': '#FF8E72', 'tiedown': '#06D6A0',
    'pit': '#EF476F', 'parking': '#FFE066', 'fuel': '#FE5F55', 'tipping area': '#FF924C',
    'infrastructure': '#5C677D', 'infrastructure_table': '#5C677D', 'default': '#9FA4B0'
};

// Location types that render as squares
const SQUARE_TYPES = new Set([
    "blast",
    "dump",
    "stockpile",
    "workshop",
    "crusher",
    "high dump",
    "load",
    "paddock dump",
    "tiedown"
]);

const DEFAULT_HIDDEN_LOCATION_TYPES = [
    'call point',
    'shiftchange',
    'region',
    'pit',
];

const resolveDispatchLocationType = (location) => {
    if (!location) return 'Infrastructure';
    const rawValue = location.unit_type || location.location_category || location.unit_type_id || location.category || location.source || 'Infrastructure';
    if (typeof rawValue !== 'string') return 'Infrastructure';
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : 'Infrastructure';
};

const getDispatchLocationColor = (locationType) => {
    if (!locationType || typeof locationType !== 'string') return DISPATCH_LOCATION_COLOR_MAP.default;
    return DISPATCH_LOCATION_COLOR_MAP[locationType.trim().toLowerCase()] || DISPATCH_LOCATION_COLOR_MAP.default;
};

// Helpers to guard polygons
const ringArea2D = (coords) => {
    if (!Array.isArray(coords) || coords.length < 3) return 0;
    let area = 0;
    const n = coords.length;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = coords[i];
        const [x2, y2] = coords[(i + 1) % n];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) * 0.5;
};

const parsePolygonHierarchy = (geojson) => {
    if (!geojson || !window?.Cesium) return null;
    const Cesium = window.Cesium;
    let gj;
    try {
        gj = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
    } catch {
        return null;
    }
    if (!gj || !gj.coordinates) return null;

    let rings = null;
    if (gj.type === 'Polygon') {
        rings = gj.coordinates;
    } else if (gj.type === 'MultiPolygon' && Array.isArray(gj.coordinates) && gj.coordinates.length > 0) {
        rings = gj.coordinates[0];
    } else {
        return null;
    }
    if (!Array.isArray(rings) || rings.length === 0) return null;

    let outer = rings[0];
    if (!Array.isArray(outer) || outer.length < 3) return null;

    outer = outer.filter(
        (c) =>
            Array.isArray(c) &&
            c.length >= 2 &&
            Number.isFinite(c[0]) &&
            Number.isFinite(c[1])
    );
    if (outer.length < 3) return null;

    if (outer.length >= 2) {
        const [fx, fy] = outer[0];
        const [lx, ly] = outer[outer.length - 1];
        if (fx === lx && fy === ly) {
            outer = outer.slice(0, -1);
        }
    }

    const cleaned = [];
    for (let i = 0; i < outer.length; i++) {
        const cur = outer[i];
        if (i === 0 || cur[0] !== outer[i - 1][0] || cur[1] !== outer[i - 1][1]) {
            cleaned.push(cur);
        }
    }
    if (cleaned.length < 3) return null;

    const area2D = ringArea2D(cleaned);
    if (!Number.isFinite(area2D) || area2D < 1e-10) return null;

    const positions = Cesium.Cartesian3.fromDegreesArray(cleaned.flat());
    if (!positions || positions.length < 3) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    if (!Number.isFinite(span) || span < 0.1) return null;

    return new Cesium.PolygonHierarchy(positions);
};

// Guard for arbitrary Cartesian3 position arrays (for polygons)
const arePositionsValid = (positions) => {
    if (!Array.isArray(positions) || positions.length < 3) return false;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
            return false;
        }
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    return Number.isFinite(span) && span >= 0.1;
};

const isDispatchSegmentClosed = (segment) => {
    if (!segment) return false;
    const value = segment.is_closed;
    if (typeof value === 'boolean') return value;
};

// Render tooltip lines in the same label/value layout as the Lat/Lng box
const renderTooltipItems = (items, { compact = false } = {}) => {
    return items
        .filter(Boolean)
        .map((raw) => {
            let item = typeof raw === 'string' ? raw : String(raw).trim();
            if (!item) return '';

            // SECTION HEADERS, e.g. "--- ROAD DIMENSIONS ---"
            if (!item.includes(':')) {
                const label = item.replace(/^[-\s]+|[-\s]+$/g, '');
                return `
          <div
            style="
              margin: ${compact ? '4px' : '6px'} 0 2px;
              font-weight: 600;
              color: #f5f5f5;
              border-top: 1px solid rgba(255,255,255,0.08);
              padding-top: 4px;
            "
          >
            ${label}
          </div>
        `;
            }

            // NORMAL "LABEL: value" LINES
            const [rawLabel, ...rest] = item.split(':');
            const label = rawLabel.trim();
            const value = rest.join(':').trim();

            return `
        <div
          style="
            display: flex;
            justify-content: space-between;
            margin-bottom: ${compact ? '1px' : '3px'};
          "
        >
          <span style="color: #a0a0a0; font-weight: 400;">
            ${label}
          </span>
          <span style="
            color: white;
            font-weight: 500;
            font-variant-numeric: tabular-nums;
            text-align: right;
            white-space: nowrap;
          ">
            ${value}
          </span>
        </div>
      `;
        })
        .join('');
};

const formatTooltipContent = (entity) => {
    if (!entity || !entity.properties) return '';
    // Handle both Cesium Property objects and direct values
    const getProp = (key) => {
        const prop = entity.properties[key];
        if (prop === undefined || prop === null) return undefined;
        if (prop && typeof prop.getValue === 'function') {
            return prop.getValue(window.Cesium.JulianDate.now());
        }
        return prop;
    };

    const items = [];
    const category = getProp('category');

    if (category === 'dispatch_segment') {
        const source = (getProp('source') || 'Segment').toString().toUpperCase();
        items.push(`--- ${source} SEGMENT ---`);
        if (getProp('road_id')) items.push(`ROAD ID: ${getProp('road_id')}`);
        if (getProp('lane_id')) items.push(`LANE ID: ${getProp('lane_id')}`);
        if (getProp('length_m')) items.push(`LENGTH: ${Math.round(getProp('length_m'))} m`);
        if (getProp('direction')) items.push(`DIRECTION: ${getProp('direction')}`);
        const closed = getProp('is_closed');
        items.push(`STATUS: ${closed ? 'Closed' : 'Open'}`);
    } else if (category === 'dispatch_location') {
        items.push(`--- LOCATION ---`);
        items.push(`NAME: ${getProp('location_name')}`);
        items.push(`TYPE: ${getProp('unit_type') || getProp('location_category')}`);
    } else if (category === 'dispatch_intersection') {
        items.push(`--- INTERSECTION ---`);
        items.push(`NAME: ${getProp('intersection_name')}`);
        if (getProp('intersection_type')) items.push(`TYPE: ${getProp('intersection_type')}`);
        if (getProp('safety_buffer_m')) items.push(`SAFETY BUFFER: ${getProp('safety_buffer_m')} m`);
        if (getProp('r_min_m')) items.push(`R-MIN: ${getProp('r_min_m')} m`);
        const roads = getProp('connected_roads');
        if (roads && Array.isArray(roads) && roads.length > 0) {
            items.push(`CONNECTED ROADS: ${roads.join(', ')}`);
        }
    } else if (category === 'dispatch_trolley') {
        items.push(`--- TROLLEY ---`);
        items.push(`TYPE: Trolley Line`);
    }

    return renderTooltipItems(items, { compact: true });
};

export default function DispatchCesiumMap() {
    const mapContainer = useRef(null);
    const cesiumViewerRef = useRef(null);
    const measurementHandlerRef = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [cesiumLoaded, setCesiumLoaded] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogData, setDialogData] = useState(null);
    const [showProfileViewer, setShowProfileViewer] = useState(false);
    const [showSpeedManagement, setShowSpeedManagement] = useState(false);
    const [selectedRoadId, setSelectedRoadId] = useState(null);
    // Data
    const [locations, setLocations] = useState([]);
    const [segments, setSegments] = useState([]);
    const [trolleySegments, setTrolleySegments] = useState([]);
    const [wateringStations, setWateringStations] = useState([]);
    const [speedMonitoring, setSpeedMonitoring] = useState([]);
    const [intersections, setIntersections] = useState([]);
    const [centerPoints, setCenterPoints] = useState([]);
    const centerPointEntitiesRef = useRef([]);

    const {
        isDialogOpen: turnDialogOpen,
        currentStep: turnCurrentStep,           // for UI
        getCurrentStep: getTurnCurrentStep,     // ref-backed for Cesium handlers
        selectedSourceRoad: turnSourceRoad,
        selectedDestinationRoad: turnDestRoad,
        openDialog: openTurnDialog,
        closeDialog: closeTurnDialog,
        startSelection: startTurnSelection,
        handleMapClick: handleTurnPathClick,
    } = useTurnPathManager(cesiumViewerRef, centerPoints);

    // UI State
    const [roadNetworksExpanded, setRoadNetworksExpanded] = useState(true);
    const [locationTypesExpanded, setLocationTypesExpanded] = useState(true);
    const [baseLayer, setBaseLayer] = useState('night'); // 'night' or 'day'
    const [sceneMode, setSceneMode] = useState('3d'); // '3d' or '2d'
    const [measurementMode, setMeasurementMode] = useState('none'); // none | distance | area

    // Visibility
    const [showOpenRoads, setShowOpenRoads] = useState(true);
    const [showClosedRoads, setShowClosedRoads] = useState(true);
    const [showIntersections, setShowIntersections] = useState(true);
    const [showCenterPoints, setShowCenterPoints] = useState(false);
    const [showTrolley, setShowTrolley] = useState(true);
    const [showWatering, setShowWatering] = useState(true);
    const [showSpeed, setShowSpeed] = useState(true);
    const [visibleLocationTypes, setVisibleLocationTypes] = useState(new Set());

    // Frontrunner-style measurement hook
    const {
        measurementMode: frMeasurementMode,
        startMeasurement: frStartMeasurement,
        cancelMeasurement: frCancelMeasurement,
        addMeasurementPoint: frAddPoint,
        clearMeasurements: frClearMeasurements,
        updatePreviewLine: frUpdatePreview,
        finalizeAreaMeasurement: frFinalizeArea,
        getMeasurementMode: frGetMode,
    } = useMeasurementTool(cesiumViewerRef);

    const recenterView = () => {
        const viewer = cesiumViewerRef.current;
        if (!viewer || !window?.Cesium) return;
        const Cesium = window.Cesium;
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(148.980202, -23.847083, 5000),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
            duration: 0.8,
        });
    };

    // Computed

    // ---------------------------------------------------------------------
    // Hide info/tooltip overlays while turn-path selection is active
    useEffect(() => {
        const selecting =
            turnCurrentStep === 'selecting_source' ||
            turnCurrentStep === 'selecting_destination';
        if (selecting) {
            setDialogOpen(false);
            setDialogData(null);
            const tooltip = document.getElementById('map-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        }
    }, [turnCurrentStep]);
    // ---------------------------------------------------------------------
    const locationCounts = useMemo(() => {
        const counts = {};
        locations.forEach(l => counts[resolveDispatchLocationType(l)] = (counts[resolveDispatchLocationType(l)] || 0) + 1);
        return counts;
    }, [locations]);

    const roadCounts = useMemo(() => ({
        open: segments.filter(s => !isDispatchSegmentClosed(s)).length,
        closed: segments.filter(s => isDispatchSegmentClosed(s)).length
    }), [segments]);

    const centerPointCount = centerPoints.length;

    const toggleLocationType = (type, checked) => {
        const newSet = new Set(visibleLocationTypes);
        checked ? newSet.add(type) : newSet.delete(type);
        setVisibleLocationTypes(newSet);
    };

    // Initialize Cesium
    useEffect(() => {
        if (!cesiumLoaded || !mapContainer.current || cesiumViewerRef.current) return;
        try {
            const Cesium = window.Cesium;
            Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkN2JiMWMyMS05YmU0LTQ2MzktODk5Yy0xZjJjMDkyOGJkMzkiLCJpZCI6MTg0NzYsImlhdCI6MTYzOTQzOTU4Mn0.6GMOP-Y9nPwqGPZ0fLCuO-YXK1xVHK0HxxMz4EBqhJk';

            let coordHandler = null;
            let coordDisplay = null;

            const viewer = new Cesium.Viewer(mapContainer.current, {
                baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
                navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
                vrButton: false, imageryProvider: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
                selectionIndicator: false, infoBox: false
            });

            viewer.cesiumWidget.creditContainer.style.display = 'none';
            viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(148.980202, -23.847083, 5000),
                orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 }
            });

            cesiumViewerRef.current = viewer;
            window.cesiumViewer = viewer;
            setMapLoaded(true);

            // Load center points from backend (intersection_center_points)
            fetch('/api/intersection_center_points')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setCenterPoints(data);
                    }
                })
                .catch(err => {
                    console.warn('Failed to load center points', err?.message || err);
                });

            // Measurement handlers
            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            measurementHandlerRef.current = handler;

            handler.setInputAction((movement) => {
                // Turn path selection takes priority if in selecting mode
                const step = getTurnCurrentStep?.();
                if (step === 'selecting_source' || step === 'selecting_destination') {
                    const drill = viewer.scene.drillPick(movement.position);
                    const picked = (drill && drill[0]) || viewer.scene.pick(movement.position);
                    if (picked && picked.id) {
                        handleTurnPathClick(picked.id);
                        return;
                    }
                }

                const mode = frGetMode();
                if (!mode) return;
                const ellipsoid = viewer.scene.globe.ellipsoid;
                let cartesian =
                    viewer.camera.pickEllipsoid(movement.position, ellipsoid) ||
                    viewer.scene.pickPosition(movement.position);
                if (!cartesian) {
                    const ray = viewer.camera.getPickRay(movement.position);
                    if (ray) cartesian = viewer.scene.globe.pick(ray, viewer.scene);
                }
                if (!cartesian) return;
                const carto = ellipsoid.cartesianToCartographic(cartesian);
                const clamped = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0.0);
                frAddPoint(clamped);
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

            handler.setInputAction((movement) => {
                const mode = frGetMode();
                if (mode !== 'distance') return;
                const ellipsoid = viewer.scene.globe.ellipsoid;
                let cartesian =
                    viewer.camera.pickEllipsoid(movement.endPosition, ellipsoid) ||
                    viewer.scene.pickPosition(movement.endPosition);
                if (!cartesian) {
                    frUpdatePreview(null);
                    return;
                }
                const carto = ellipsoid.cartesianToCartographic(cartesian);
                const clamped = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0.0);
                frUpdatePreview(clamped);
            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

            handler.setInputAction(() => {
                frFinalizeArea();
            }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

            // Coordinates (exact Frontrunner style)
            coordDisplay = document.createElement('div');
            coordDisplay.id = 'mouse-coordinates';
            coordDisplay.style.cssText = `
              position: absolute;
              bottom: 20px;
              right: 20px;
              background: rgba(50, 50, 50, 0.92);
              color: white;
              padding: 12px 16px;
              border-radius: 9px;
              font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
              font-size: 12px;
              font-weight: 400;
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
              backdrop-filter: blur(12px);
              border: none;
              z-index: 1000;
              min-width: 160px;
              text-align: left;
              display: block;
              line-height: 1.35;
            `;
            document.body.appendChild(coordDisplay);

            coordHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            coordHandler.setInputAction((movement) => {
                const cartesian = viewer.scene.pickPosition(movement.endPosition);
                if (Cesium.defined(cartesian)) {
                    const cart = Cesium.Cartographic.fromCartesian(cartesian);
                    const lng = Cesium.Math.toDegrees(cart.longitude).toFixed(6);
                    const lat = Cesium.Math.toDegrees(cart.latitude).toFixed(6);
                    coordDisplay.innerHTML = `
                      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #a0a0a0; font-weight: 400;">Lat:</span>
                        <span style="color: white; font-weight: 500; font-variant-numeric: tabular-nums;">${lat}°</span>
                      </div>
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: #a0a0a0; font-weight: 400;">Lng:</span>
                        <span style="color: white; font-weight: 500; font-variant-numeric: tabular-nums;">${lng}°</span>
                      </div>
                    `;
                    coordDisplay.style.display = 'block';
                }
            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        } catch (e) { setMapError(e.message); }

        return () => {
            if (measurementHandlerRef.current) {
                measurementHandlerRef.current.destroy();
                measurementHandlerRef.current = null;
            }
            if (coordHandler && !coordHandler.isDestroyed()) {
                coordHandler.destroy();
            }
            if (coordDisplay && coordDisplay.parentNode) {
                coordDisplay.remove();
            }
            cesiumViewerRef.current?.destroy();
        };
    }, [cesiumLoaded]);

    // Tooltip Handler
    useEffect(() => {
        if (!mapLoaded || !cesiumViewerRef.current) return;
        const viewer = cesiumViewerRef.current;
        const Cesium = window.Cesium;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            position: absolute; display: none; pointer-events: none;
            background: rgba(20, 20, 30, 0.95); color: white;
            padding: 8px 12px; border-radius: 6px;
            font-family: 'Inter', sans-serif; font-size: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.15);
            z-index: 10000; max-width: 300px;
        `;
        viewer.container.appendChild(tooltip);

        handler.setInputAction((movement) => {
            const step = getTurnCurrentStep?.();
            if (step === 'selecting_source' || step === 'selecting_destination') {
                tooltip.style.display = 'none';
                viewer.container.style.cursor = 'default';
                return;
            }

            const pickedObject = viewer.scene.pick(movement.endPosition);
            if (pickedObject && pickedObject.id && pickedObject.id.properties) {
                const content = formatTooltipContent(pickedObject.id);
                if (content) {
                    tooltip.style.display = 'block';
                    tooltip.innerHTML = content;
                    // Position tooltip near mouse but not under it
                    const x = movement.endPosition.x + 15;
                    const y = movement.endPosition.y + 15;
                    tooltip.style.left = `${x}px`;
                    tooltip.style.top = `${y}px`;

                    // Keep within bounds
                    const containerRect = viewer.container.getBoundingClientRect();
                    if (x + tooltip.offsetWidth > containerRect.width) {
                        tooltip.style.left = `${movement.endPosition.x - tooltip.offsetWidth - 10}px`;
                    }
                    if (y + tooltip.offsetHeight > containerRect.height) {
                        tooltip.style.top = `${movement.endPosition.y - tooltip.offsetHeight - 10}px`;
                    }

                    viewer.container.style.cursor = 'pointer';
                    return;
                }
            }
            tooltip.style.display = 'none';
            viewer.container.style.cursor = 'default';
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        return () => {
            handler.destroy();
            if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
        };
    }, [mapLoaded]);

    // Click Handler for Dialog
    useEffect(() => {
        if (!mapLoaded || !cesiumViewerRef.current) return;
        const viewer = cesiumViewerRef.current;
        const Cesium = window.Cesium;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click) => {
            // Short-circuit to turn-path selection: no info dialog while selecting
            const step = getTurnCurrentStep?.();
            if (step === 'selecting_source' || step === 'selecting_destination') {
                const drill = viewer.scene.drillPick(click.position);
                const picked = (drill && drill[0]) || viewer.scene.pick(click.position);
                if (picked && picked.id) {
                    handleTurnPathClick(picked.id);
                }
                return; // always suppress info dialog while selecting
            }

            // Look at *all* primitives under the cursor
            const picked = viewer.scene.drillPick(click.position) || [];

            // Prefer locations / intersections over roads when overlapping
            let pickedObject =
                picked.find(o => {
                    if (!o.id || !o.id.properties || !o.id.properties.category) return false;
                    const catProp = o.id.properties.category;
                    const cat = catProp.getValue
                        ? catProp.getValue(window.Cesium.JulianDate.now())
                        : catProp;
                    return cat === 'dispatch_location' || cat === 'dispatch_intersection';
                }) || picked[0];

            if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
                const entity = pickedObject.id;
                const allProperties = {};

                // Extract properties
                const propertyNames = entity.properties.propertyNames || Object.keys(entity.properties);
                propertyNames.forEach(propName => {
                    // Skip internal Cesium properties
                    if (propName.startsWith('_') || propName === 'propertyNames' || propName === 'definitionChanged' || propName === 'color' || propName === 'style_role') return;

                    try {
                        const prop = entity.properties[propName];
                        if (prop && typeof prop.getValue === 'function') {
                            const val = prop.getValue(Cesium.JulianDate.now());
                            if (val !== undefined && val !== null) allProperties[propName] = val;
                        } else if (prop !== undefined && prop !== null) {
                            allProperties[propName] = prop;
                        }
                    } catch (e) { }
                });

                // Also try direct properties if not found above
                if (entity.properties.category && !allProperties.category) {
                    allProperties.category = entity.properties.category.getValue ? entity.properties.category.getValue() : entity.properties.category;
                }
                if (entity.properties.name && !allProperties.name) {
                    allProperties.name = entity.properties.name.getValue ? entity.properties.name.getValue() : entity.properties.name;
                }

                // Clear previous highlights
                viewer.entities.values.forEach(prevEntity => {
                    if (prevEntity._originalMaterial) {
                        if (prevEntity.corridor) {
                            prevEntity.corridor.material = prevEntity._originalMaterial;
                            prevEntity.corridor.outline = false;
                        } else if (prevEntity.polygon) {
                            prevEntity.polygon.material = prevEntity._originalMaterial;
                            prevEntity.polygon.outline = false;
                        }
                        delete prevEntity._originalMaterial;
                    }
                });

                // Highlight clicked entity
                if (entity.corridor) {
                    if (!entity._originalMaterial) entity._originalMaterial = entity.corridor.material;
                    entity.corridor.material = Cesium.Color.CYAN.withAlpha(1.0);
                    entity.corridor.outline = true;
                    entity.corridor.outlineColor = Cesium.Color.YELLOW;
                    entity.corridor.outlineWidth = 3;
                } else if (entity.polygon) {
                    if (!entity._originalMaterial) entity._originalMaterial = entity.polygon.material;
                    entity.polygon.material = Cesium.Color.CYAN.withAlpha(0.9);
                    entity.polygon.outline = true;
                    entity.polygon.outlineColor = Cesium.Color.YELLOW;
                    entity.polygon.outlineWidth = 3;
                }

                setDialogData({
                    category: allProperties.category,
                    name: allProperties.name || 'Unknown',
                    allProperties: allProperties
                });
                setDialogOpen(true);

            } else {
                // Clicked empty space
                setDialogOpen(false);
                setDialogData(null);

                // Reset highlights
                viewer.entities.values.forEach(prevEntity => {
                    if (prevEntity._originalMaterial) {
                        if (prevEntity.corridor) {
                            prevEntity.corridor.material = prevEntity._originalMaterial;
                            prevEntity.corridor.outline = false;
                        } else if (prevEntity.polygon) {
                            prevEntity.polygon.material = prevEntity._originalMaterial;
                            prevEntity.polygon.outline = false;
                        }
                        delete prevEntity._originalMaterial;
                    }
                });
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => {
            handler.destroy();
        };
    }, [mapLoaded]);

    // Center points renderer (magenta markers, like Frontrunner)
    useEffect(() => {
        const viewer = cesiumViewerRef.current;
        if (!viewer || !viewer.entities) return;

        // clear old
        if (centerPointEntitiesRef.current.length) {
            centerPointEntitiesRef.current.forEach(e => {
                try { viewer.entities.remove(e); } catch (_) { }
            });
            centerPointEntitiesRef.current = [];
        }

        if (!showCenterPoints || !Array.isArray(centerPoints)) {
            viewer.scene?.requestRender();
            return;
        }

        const Cesium = window.Cesium;
        centerPoints.forEach((cp) => {
            if (cp.lon == null || cp.lat == null) return;
            const pos = Cesium.Cartesian3.fromDegrees(cp.lon, cp.lat, 2.0);
            const ent = viewer.entities.add({
                position: pos,
                point: {
                    pixelSize: 25,
                    color: Cesium.Color.MAGENTA,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 6,
                    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    scaleByDistance: new Cesium.NearFarScalar(1.5e2, 3.0, 1.5e7, 1.5),
                },
                cylinder: {
                    length: 2.0,
                    topRadius: 0.8,
                    bottomRadius: 0.8,
                    material: Cesium.Color.MAGENTA.withAlpha(0.9),
                    outline: true,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                },
                properties: {
                    category: 'road_intersection_center',
                    road_id: cp.road_id,
                    intersection_id: cp.intersection_id,
                    intersection_name: cp.intersection_name,
                },
                name: `Center Point ${cp.intersection_name || ''} (${cp.road_id || ''})`,
            });
            centerPointEntitiesRef.current.push(ent);
        });

        viewer.scene?.requestRender();
    }, [centerPoints, showCenterPoints]);

    // Base Layer Logic
    useEffect(() => {
        if (!cesiumViewerRef.current || !window.Cesium) return;
        const viewer = cesiumViewerRef.current;
        const Cesium = window.Cesium;
        let cancelled = false;

        const updateBaseLayer = async () => {
            viewer.imageryLayers.removeAll();

            let provider;
            switch (baseLayer) {
                case 'night':
                    provider = new Cesium.UrlTemplateImageryProvider({
                        url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        credit: '© OpenStreetMap contributors, © CARTO'
                    });
                    break;
                case 'day':
                    provider = new Cesium.UrlTemplateImageryProvider({
                        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                        credit: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
                    });
                    break;
                case 'topographic':
                    provider = new Cesium.UrlTemplateImageryProvider({
                        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                        credit: '© OpenTopoMap contributors',
                        subdomains: ['a', 'b', 'c']
                    });
                    break;
                case 'terrain':
                    provider = new Cesium.UrlTemplateImageryProvider({
                        url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png',
                        credit: '© Stadia Maps © Stamen Design © OpenMapTiles © OpenStreetMap contributors'
                    });
                    break;
                default:
                    provider = new Cesium.UrlTemplateImageryProvider({
                        url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        credit: '© OpenStreetMap contributors, © CARTO'
                    });
            }

            if (!cancelled) {
                viewer.imageryLayers.addImageryProvider(provider);
                // Ensure base color is dark for night mode or general consistency
                viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a1a2e');
            }
        };

        updateBaseLayer();
        return () => { cancelled = true; };
    }, [baseLayer, mapLoaded]);

    // Scene mode toggle (2D vs 3D)
    useEffect(() => {
        if (!mapLoaded || !cesiumViewerRef.current || !window.Cesium) return;
        const viewer = cesiumViewerRef.current;
        const Cesium = window.Cesium;
        if (sceneMode === '2d') {
            viewer.scene.morphTo2D(0);
        } else {
            viewer.scene.morphTo3D(0);
        }
    }, [sceneMode, mapLoaded]);

    // Load Data (combined API)
    useEffect(() => {
        if (!mapLoaded) return;
        const load = async () => {
            try {
                const res = await fetch('/api/combined-map-data');
                const data = await res.json();

                // Show everything from the combined API (both dispatch and frontrunner)
                const roads = data?.roads || [];
                const intersections = data?.intersections || [];
                const infrastructure = data?.infrastructure || [];
                const apiSegments = data?.segments || [];

                const mappedSegments = (apiSegments.length ? apiSegments : roads).map((s) => ({
                    lane_id: s.lane_id || s.road_id,
                    road_id: s.road_id || s.lane_id,
                    geometry: s.geometry_geojson || s.geometry || s.centerline_geojson,
                    is_closed: s.is_closed,
                    direction: s.direction ?? null,
                    length_m: s.length_m ?? null,
                }));

                const mappedLocations = infrastructure
                    .map((p) => {
                        let lat = null, lon = null;
                        try {
                            const gj = p.point_geojson ? JSON.parse(p.point_geojson) : null;
                            if (gj && gj.type === 'Point' && Array.isArray(gj.coordinates)) {
                                [lon, lat] = gj.coordinates;
                            }
                        } catch (_) { }
                        return {
                            location_id: p.location_id,
                            location_name: p.location_name || '',
                            latitude: lat,
                            longitude: lon,
                            geometry: p.geom_geojson || p.geometry || null,
                            unit_type: p.unit_type || p.location_category || p.unit_type_id || p.unit_id || p.source || 'infrastructure',
                            location_category: p.location_category || p.unit_type || p.unit_type_id || p.unit_id || p.source || 'infrastructure',
                            unit_type_id: p.unit_type_id || p.unit_id || null,
                            source: p.source || '',
                        };
                    })
                    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

                const mappedIntersections = intersections.map((i) => ({
                    ...i,
                    geometry: i.geom_geojson || i.geometry,
                }));

                // Debug: log counts and top types
                const typeCounts = {};
                mappedLocations.forEach((loc) => {
                    const t = resolveDispatchLocationType(loc);
                    typeCounts[t] = (typeCounts[t] || 0) + 1;
                });
                // Log a few sample locations with resolved type
                console.log('[CombinedMap][Data]', {
                    roads: roads.length,
                    segments: mappedSegments.length,
                    intersections: mappedIntersections.length,
                    infrastructure: mappedLocations.length,
                    typeCounts,
                    samples: mappedLocations.slice(0, 5).map((loc) => ({
                        location_id: loc.location_id,
                        source: loc.source,
                        unit_type: loc.unit_type,
                        unit_type_id: loc.unit_type_id,
                        resolved_type: resolveDispatchLocationType(loc),
                    })),
                });

                setLocations(mappedLocations);
                setSegments(mappedSegments);
                setTrolleySegments(data?.trolleySegments || []);
                setWateringStations(data?.wateringStations || []);
                setSpeedMonitoring(data?.speedMonitoring || []);
                setIntersections(mappedIntersections);

                // Build visible types from the resolved types present in the payload
                const resolvedTypes = Array.from(new Set(mappedLocations.map((loc) => resolveDispatchLocationType(loc))));

                const visibleSet = new Set();
                resolvedTypes.forEach(t => {
                    const key = String(t).trim().toLowerCase();
                    const isNumeric = /^[0-9]+$/.test(key);
                    if (SQUARE_TYPES.has(key) || isNumeric) {
                        visibleSet.add(t);
                    }
                });
                SQUARE_TYPES.forEach(t => visibleSet.add(t));
                setVisibleLocationTypes(visibleSet);

                console.log(`[CombinedMap] Loaded data:
                  - Locations: ${mappedLocations.length}
                  - Segments: ${mappedSegments.length}
                  - Intersections: ${mappedIntersections.length}`);
            } catch (e) { console.error(e); }
        };
        load();
    }, [mapLoaded]);

    // Render
    useEffect(() => {
        if (!cesiumViewerRef.current || !window.Cesium) return;
        const viewer = cesiumViewerRef.current;
        const Cesium = window.Cesium;

        // Clear existing entities
        viewer.entities.removeAll();

        // Helper function to compute an offset polyline (for road edges)
        const computeOffsetLine = (positions, offsetMeters) => {
            const Cesium = window.Cesium;
            const ellipsoid = Cesium.Ellipsoid.WGS84;

            const offsetPositions = [];
            const direction = new Cesium.Cartesian3();
            const up = new Cesium.Cartesian3();
            const right = new Cesium.Cartesian3();

            const n = positions.length;
            if (n === 0) return offsetPositions;
            if (n === 1) {
                offsetPositions.push(positions[0]);
                return offsetPositions;
            }

            for (let i = 0; i < n; i++) {
                const cur = positions[i];

                // ---- choose a forward vector with CONSISTENT orientation ----
                if (i === 0) {
                    // first: use next - current
                    Cesium.Cartesian3.subtract(positions[1], cur, direction);
                } else if (i === n - 1) {
                    // last: use current - previous
                    Cesium.Cartesian3.subtract(cur, positions[n - 2], direction);
                } else {
                    // middle: average prev and next directions for smoother corners
                    const d1 = new Cesium.Cartesian3();
                    const d2 = new Cesium.Cartesian3();
                    Cesium.Cartesian3.subtract(cur, positions[i - 1], d1);
                    Cesium.Cartesian3.subtract(positions[i + 1], cur, d2);
                    if (Cesium.Cartesian3.magnitudeSquared(d1) > Cesium.Math.EPSILON10) Cesium.Cartesian3.normalize(d1, d1);
                    if (Cesium.Cartesian3.magnitudeSquared(d2) > Cesium.Math.EPSILON10) Cesium.Cartesian3.normalize(d2, d2);
                    Cesium.Cartesian3.add(d1, d2, direction);
                }

                // zero-length safety
                if (Cesium.Cartesian3.magnitudeSquared(direction) < Cesium.Math.EPSILON10) {
                    offsetPositions.push(cur);
                    continue;
                }

                Cesium.Cartesian3.normalize(direction, direction);
                if (isNaN(direction.x) || isNaN(direction.y) || isNaN(direction.z)) {
                    offsetPositions.push(cur);
                    continue;
                }

                // local "up" (normal to ellipsoid at this point)
                ellipsoid.geodeticSurfaceNormal(cur, up);

                // right = direction x up  (perpendicular to road, tangent to ground)
                Cesium.Cartesian3.cross(direction, up, right);
                if (Cesium.Cartesian3.magnitudeSquared(right) < Cesium.Math.EPSILON10) {
                    offsetPositions.push(cur);
                    continue;
                }
                Cesium.Cartesian3.normalize(right, right);
                if (isNaN(right.x) || isNaN(right.y) || isNaN(right.z)) {
                    offsetPositions.push(cur);
                    continue;
                }

                const offset = Cesium.Cartesian3.multiplyByScalar(
                    right,
                    offsetMeters,
                    new Cesium.Cartesian3()
                );

                const finalPos = Cesium.Cartesian3.add(cur, offset, new Cesium.Cartesian3());
                if (isNaN(finalPos.x) || isNaN(finalPos.y) || isNaN(finalPos.z)) {
                    offsetPositions.push(cur);
                } else {
                    offsetPositions.push(finalPos);
                }
            }

            return offsetPositions;
        };

        // Helper: Filter unique positions to prevent zero-length segments
        const filterUniquePositions = (positions) => {
            if (!positions || positions.length < 2) return positions;
            return positions.filter((p, idx) => {
                if (idx === 0) return true;
                const prev = positions[idx - 1];
                return Cesium.Cartesian3.distanceSquared(p, prev) > 0.0001; // 1cm^2 threshold
            });
        };

        // Helper: bearing (heading) of the nearest road segment to a location.
        // Returns heading in radians, measured clockwise from NORTH.
        const getNearestRoadBearing = (location, segments) => {
            const locCart = Cesium.Cartesian3.fromDegrees(
                location.longitude,
                location.latitude
            );

            let minDistance = Infinity;
            let bestBearing = 0;

            segments.forEach((s) => {
                const g =
                    typeof s.geometry === "string" ? JSON.parse(s.geometry) : s.geometry;
                if (!g?.coordinates || g.coordinates.length < 2) return;

                const coords = g.coordinates;

                for (let i = 0; i < coords.length - 1; i++) {
                    const c1Raw = coords[i];
                    const c2Raw = coords[i + 1];

                    if (!Number.isFinite(c1Raw[0]) || !Number.isFinite(c1Raw[1]) ||
                        !Number.isFinite(c2Raw[0]) || !Number.isFinite(c2Raw[1])) {
                        continue;
                    }

                    const p1 = Cesium.Cartesian3.fromDegrees(c1Raw[0], c1Raw[1]);
                    const p2 = Cesium.Cartesian3.fromDegrees(c2Raw[0], c2Raw[1]);

                    // use segment midpoint as "position" to compare distance
                    const mid = Cesium.Cartesian3.multiplyByScalar(
                        Cesium.Cartesian3.add(p1, p2, new Cesium.Cartesian3()),
                        0.5,
                        new Cesium.Cartesian3()
                    );

                    const distSq = Cesium.Cartesian3.distanceSquared(locCart, mid);
                    if (distSq >= minDistance) continue;

                    // closer -> update bearing
                    minDistance = distSq;

                    const c1 = Cesium.Cartographic.fromDegrees(c1Raw[0], c1Raw[1]);
                    const c2 = Cesium.Cartographic.fromDegrees(c2Raw[0], c2Raw[1]);

                    const dLon = c2.longitude - c1.longitude;
                    const y = Math.sin(dLon) * Math.cos(c2.latitude);
                    const x =
                        Math.cos(c1.latitude) * Math.sin(c2.latitude) -
                        Math.sin(c1.latitude) *
                        Math.cos(c2.latitude) *
                        Math.cos(dLon);

                    // heading from NORTH, clockwise, in radians
                    bestBearing = Math.atan2(y, x);
                }
            });

            return isNaN(bestBearing) ? 0 : bestBearing;
        };

        // Helper: 50m x 50m square polygon, rotated by angleFromEast (radians), in ENU frame
        const computeSquarePolygon = (centerCartesian, sizeMeters, angleFromEast) => {
            if (isNaN(angleFromEast) || !centerCartesian) return null;

            const half = sizeMeters / 2.0;

            // ENU (East-North-Up) local frame at the center
            const transform = Cesium.Transforms.eastNorthUpToFixedFrame(
                centerCartesian
            );

            const cos = Math.cos(angleFromEast);
            const sin = Math.sin(angleFromEast);

            // square corners in local ENU before rotation (meters)
            const baseCorners = [
                { x: -half, y: -half },
                { x: half, y: -half },
                { x: half, y: half },
                { x: -half, y: half }
            ];

            const result = baseCorners.map((c) => {
                // rotate in ENU
                const rx = c.x * cos - c.y * sin;
                const ry = c.x * sin + c.y * cos;

                const localPos = new Cesium.Cartesian3(rx, ry, 0.0);
                return Cesium.Matrix4.multiplyByPoint(
                    transform,
                    localPos,
                    new Cesium.Cartesian3()
                );
            });

            // Validate result for NaNs
            for (const p of result) {
                if (isNaN(p.x) || isNaN(p.y) || isNaN(p.z)) return null;
            }
            return result;
        };

        // Exact theme (only using the colors now)
        const NIGHT_THEME = {
            // Dark asphalt surfaces; edge color carries status
            roadSurfaceColorOpen: '#2C2F3A',
            roadSurfaceColorClosed: '#2C2F3A',
            roadSurfaceAlpha: 0.98,
            roadShoulderColorOpen: '#2C2F3A',
            roadShoulderColorClosed: '#2C2F3A',
            roadShoulderAlpha: 0.98,
            polygonOutlineColor: '#A0A0A0',
            polygonOutlineAlpha: 0.95,
            polygonOutlineWidth: 2.2,
            // Intersection styling: red fill, white outline
            intersectionFillColor: '#E74C3C',
            intersectionFillAlpha: 1.0,
            intersectionOutlineColor: '#FFFFFF',
            intersectionOutlineAlpha: 1.0,
        };

        // ----- cross-section constants -----
        // total width (forward + backward + centre white line)
        const TOTAL_ROAD_WIDTH = 40.0;      // metres
        const CENTERLINE_WIDTH = 1.0;       // metres

        // each direction (incl. its shoulder) gets half of the remaining width
        const LANE_TOTAL_WIDTH = (TOTAL_ROAD_WIDTH - CENTERLINE_WIDTH) / 2.0; // 19.5 m
        const HALF_LANE_TOTAL_WIDTH = LANE_TOTAL_WIDTH / 2.0;                 // 9.75 m

        // make the asphalt slightly narrower than the lane (so there is a subtle shoulder)
        const LANE_SHOULDER_PADDING = 1.0;                                    // m each side
        const LANE_SURFACE_WIDTH = LANE_TOTAL_WIDTH - 2 * LANE_SHOULDER_PADDING; // 17.5 m

        // distance from the global centreline to the centre of each carriageway
        // = half centreline + half lane width
        const LANE_CENTER_OFFSET_MAG =
            CENTERLINE_WIDTH / 2.0 + HALF_LANE_TOTAL_WIDTH;  // 0.5 + 9.75 = 10.25 m

        // ROAD SEGMENTS
        segments.forEach((s) => {
            const closed = isDispatchSegmentClosed(s);
            if (!((closed && showClosedRoads) || (!closed && showOpenRoads))) return;

            try {
                const surfaceColor = Cesium.Color
                    .fromCssColorString(closed ? NIGHT_THEME.roadSurfaceColorClosed : NIGHT_THEME.roadSurfaceColorOpen)
                    .withAlpha(NIGHT_THEME.roadSurfaceAlpha);

                const shoulderColor = Cesium.Color
                    .fromCssColorString(closed ? NIGHT_THEME.roadShoulderColorClosed : NIGHT_THEME.roadShoulderColorOpen)
                    .withAlpha(NIGHT_THEME.roadShoulderAlpha);

                const edgeColor = closed
                    ? Cesium.Color.fromCssColorString('#E74C3C')
                    : Cesium.Color.fromCssColorString('#FFD600');

                const centerlineColor = Cesium.Color.WHITE;

                const g = typeof s.geometry === 'string' ? JSON.parse(s.geometry) : s.geometry;
                if (!g?.coordinates) return;

                // If Frontrunner road geometries arrive as polygons, render them as filled polygons.
                if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
                    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
                    polys.forEach((coords) => {
                        const hierarchy = parsePolygonHierarchy({ type: 'Polygon', coordinates: coords });
                        if (
                            hierarchy &&
                            hierarchy.positions &&
                            hierarchy.positions.length >= 3 &&
                            arePositionsValid(hierarchy.positions)
                        ) {
                            viewer.entities.add({
                                polygon: {
                                    hierarchy,
                                    material: surfaceColor,
                                    outline: true,
                                    outlineColor: edgeColor,
                                    height: 0.0,
                                },
                                properties: {
                                    category: 'frontrunner_road_polygon',
                                    ...s,
                                },
                            });
                        }
                    });
                    return; // handled polygon case; skip corridor rendering
                }

                let allLineStrings = [];
                if (g.type === 'MultiLineString') {
                    allLineStrings = g.coordinates;
                } else if (g.type === 'LineString') {
                    allLineStrings = [g.coordinates];
                } else {
                    return;
                }

                allLineStrings.forEach((coordinates) => {
                    // Validate coordinates structure
                    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) return;

                    // Filter invalid coordinates (NaN, etc)
                    const validCoords = coordinates.filter(c =>
                        Array.isArray(c) && c.length >= 2 &&
                        Number.isFinite(c[0]) && Number.isFinite(c[1])
                    );

                    if (validCoords.length < 2) return;

                    const rawPositions = validCoords.map((c) =>
                        Cesium.Cartesian3.fromDegrees(c[0], c[1])
                    );

                    // Filter duplicates and points that are too close (within 1cm)
                    const positions = filterUniquePositions(rawPositions);

                    if (positions.length < 2) return;
                    // Extra guard for NaNs/degeneracy
                    const spanOk = positions.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
                    if (!spanOk) return;
                    const bbox = positions.reduce((acc, p) => {
                        acc.minX = Math.min(acc.minX, p.x); acc.maxX = Math.max(acc.maxX, p.x);
                        acc.minY = Math.min(acc.minY, p.y); acc.maxY = Math.max(acc.maxY, p.y);
                        acc.minZ = Math.min(acc.minZ, p.z); acc.maxZ = Math.max(acc.maxZ, p.z);
                        return acc;
                    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
                    const span = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ);
                    if (!Number.isFinite(span) || span < 0.1) return;

                    // ----- decide which side this lane sits on -----
                    const dir = (s.direction || '').toString().toLowerCase();
                    let dirSign = 0; // 0 = centred (if no direction), +1 = one side, -1 = opposite
                    if (dir.includes('forward')) dirSign = 1;
                    else if (dir.includes('backward')) dirSign = -1;

                    const laneCenterOffset = dirSign * LANE_CENTER_OFFSET_MAG;

                    // centreline of this *lane* (shifted left/right from global centreline)
                    let lanePositions =
                        laneCenterOffset === 0
                            ? positions
                            : computeOffsetLine(positions, laneCenterOffset);

                    // Final filter to ensure no duplicates after offset calculation
                    lanePositions = filterUniquePositions(lanePositions);

                    // Verify lanePositions after offset calculation
                    if (!lanePositions || lanePositions.length < 2) return;

                    // Colours: dark fill, edges indicate status (open yellow, closed red)
                    // 1. Lane shoulder (full lane width, shifted to its side)
                    viewer.entities.add({
                        corridor: {
                            positions: lanePositions,
                            width: LANE_TOTAL_WIDTH,
                            material: shoulderColor,
                            height: 0.0,
                            cornerType: Cesium.CornerType.MITERED,
                            outline: false,
                        },
                        properties: {
                            category: 'dispatch_segment',
                            style_role: 'road_shoulder',
                            ...s,
                        },
                    });

                    // 2. Lane asphalt surface (slightly narrower)
                    viewer.entities.add({
                        corridor: {
                            positions: lanePositions,
                            width: LANE_SURFACE_WIDTH,
                            material: surfaceColor,
                            height: 0.18,
                            cornerType: Cesium.CornerType.MITERED,
                            outline: false,
                        },
                        properties: {
                            category: 'dispatch_segment',
                            style_role: 'road_surface',
                            ...s,
                        },
                    });

                    // 3. Centerline (dashed line)
                    viewer.entities.add({
                        polyline: {
                            positions: lanePositions,
                            width: CENTERLINE_WIDTH,
                            material: new Cesium.PolylineDashMaterialProperty({
                                color: centerlineColor,
                                dashLength: 16.0,
                            }),
                            arcType: Cesium.ArcType.GEODESIC,
                        },
                        properties: {
                            category: 'dispatch_segment',
                            style_role: 'road_centerline',
                            ...s,
                        },
                    });

                    // 4. Edges (solid lines)
                    // Left edge
                    const leftEdgeOffset = -HALF_LANE_TOTAL_WIDTH;
                    let leftEdgePositions = computeOffsetLine(lanePositions, leftEdgeOffset);
                    leftEdgePositions = filterUniquePositions(leftEdgePositions);

                    if (leftEdgePositions && leftEdgePositions.length >= 2) {
                        viewer.entities.add({
                            polyline: {
                                positions: leftEdgePositions,
                                width: 2.0,
                                material: edgeColor,
                                arcType: Cesium.ArcType.GEODESIC,
                            },
                            properties: {
                                category: 'dispatch_segment',
                                style_role: 'road_edge_left',
                                ...s,
                            },
                        });
                    }

                    // Right edge
                    const rightEdgeOffset = HALF_LANE_TOTAL_WIDTH;
                    let rightEdgePositions = computeOffsetLine(lanePositions, rightEdgeOffset);
                    rightEdgePositions = filterUniquePositions(rightEdgePositions);

                    if (rightEdgePositions && rightEdgePositions.length >= 2) {
                        viewer.entities.add({
                            polyline: {
                                positions: rightEdgePositions,
                                width: 2.0,
                                material: edgeColor,
                                arcType: Cesium.ArcType.GEODESIC,
                            },
                            properties: {
                                category: 'dispatch_segment',
                                style_role: 'road_edge_right',
                                ...s,
                            },
                        });
                    }
                });
            } catch (e) { console.error('Error rendering segment', s, e); }
        });

        // OTHER LAYERS (trolley, intersections, etc.)
        if (showTrolley) {
            trolleySegments.forEach((t) => {
                try {
                    if (!Number.isFinite(t.start_longitude) || !Number.isFinite(t.start_latitude) ||
                        !Number.isFinite(t.end_longitude) || !Number.isFinite(t.end_latitude)) {
                        return;
                    }

                    viewer.entities.add({
                        polyline: {
                            positions: Cesium.Cartesian3.fromDegreesArray([
                                t.start_longitude,
                                t.start_latitude,
                                t.end_longitude,
                                t.end_latitude
                            ]),
                            width: 5,
                            material: Cesium.Color.fromCssColorString("#FF6B6B").withAlpha(
                                0.9
                            )
                        },
                        properties: { category: "dispatch_trolley", ...t }
                    });
                } catch (e) {
                    console.error("Error rendering trolley segment", t, e);
                }
            });
        }

        if (showIntersections) {
            console.log(`Rendering ${intersections.length} intersections`);
            intersections.forEach((i) => {
                try {
                    const raw = i.geom_geojson || i.geometry;
                    const hierarchy = parsePolygonHierarchy(raw);
                    if (
                        !hierarchy ||
                        !hierarchy.positions ||
                        hierarchy.positions.length < 3 ||
                        !arePositionsValid(hierarchy.positions)
                    ) {
                        return;
                    }

                    viewer.entities.add({
                        polygon: {
                            hierarchy,
                            material: Cesium.Color.fromCssColorString(NIGHT_THEME.intersectionFillColor).withAlpha(NIGHT_THEME.intersectionFillAlpha),
                            height: 0.6, // Lift slightly above roads
                            outline: true,
                            outlineColor: Cesium.Color.fromCssColorString(NIGHT_THEME.intersectionOutlineColor).withAlpha(NIGHT_THEME.intersectionOutlineAlpha),
                            outlineWidth: NIGHT_THEME.polygonOutlineWidth,
                        },
                        properties: {
                            category: "dispatch_intersection",
                            ...i,
                            part_index: 0
                        }
                    });
                } catch (e) {
                    console.error("Bad intersection geometry", i, e);
                }
            });
        }

        locations.forEach((l) => {
            try {
                if (!Number.isFinite(l.latitude) || !Number.isFinite(l.longitude)) return;

                const type = resolveDispatchLocationType(l);

                const typeLower = (type || '').toLowerCase();
                const sourceLower = (l.source || '').toLowerCase();
                const isNumericType = /^[0-9]+$/.test(typeLower);

                if (!visibleLocationTypes.has(type)) {
                    // console.log('[CombinedMap][Locations] Skip type not visible', {
                    //     type,
                    //     location_id: l.location_id,
                    //     unit_type: l.unit_type,
                    //     unit_type_id: l.unit_type_id,
                    //     location_category: l.location_category,
                    //     source: l.source,
                    // });
                    return;
                }

                const color = Cesium.Color.fromCssColorString(
                    getDispatchLocationColor(type)
                );

                const position = Cesium.Cartesian3.fromDegrees(
                    l.longitude,
                    l.latitude,
                    2.0    // 2m above ground so locations sit clearly above the road surface
                );

                // If geometry is a polygon, render it; otherwise render square/point.
                const rawGeom = l.geometry ? (typeof l.geometry === 'string' ? l.geometry : JSON.stringify(l.geometry)) : null;
                if (rawGeom) {
                    const hierarchy = parsePolygonHierarchy(rawGeom);
                    if (hierarchy && hierarchy.positions && hierarchy.positions.length >= 3 && arePositionsValid(hierarchy.positions)) {
                        viewer.entities.add({
                            polygon: {
                                hierarchy,
                                material: color.withAlpha(0.9),
                                outline: true,
                                outlineColor: Cesium.Color.WHITE,
                                perPositionHeight: true
                            },
                            properties: {
                                category: "frontrunner_location",
                                ...l
                            }
                        });
                        return;
                    }
                }

                const showSquare = SQUARE_TYPES.has(typeLower) || isNumericType;
                if (!showSquare) {
                    return; // skip all non-target types
                }

                // Render square pad for allowed types
                const bearingFromNorth = getNearestRoadBearing(l, segments);
                const angleFromEast = -bearingFromNorth; // perpendicular to road

                const squarePositions = computeSquarePolygon(
                    position,
                    40.0,          // size in meters
                    angleFromEast
                );

                if (squarePositions && arePositionsValid(squarePositions)) {
                    const hierarchy = new Cesium.PolygonHierarchy(squarePositions);
                    viewer.entities.add({
                        polygon: {
                            hierarchy,
                            material: color.withAlpha(1.0),   // opaque: fully hide roads underneath
                            outline: true,
                            outlineColor: Cesium.Color.WHITE,
                            perPositionHeight: true           // use the actual heights in hierarchy (≈2m)
                        },
                        properties: {
                            category: "dispatch_location",
                            ...l
                        }
                    });
                } else {
                    // console.log('[CombinedMap][Locations] Invalid square geometry, skipping', {
                    //     type,
                    //     location_id: l.location_id,
                    //     unit_type: l.unit_type,
                    //     unit_type_id: l.unit_type_id,
                    //     location_category: l.location_category,
                    //     source: l.source,
                    // });
                }
                // If invalid square, skip (no point fallback)
            } catch (e) {
                console.error("Error rendering location", l, e);
            }
        });
    }, [
        locations,
        segments,
        trolleySegments,
        wateringStations,
        speedMonitoring,
        intersections,
        showOpenRoads,
        showClosedRoads,
        showIntersections,
        showTrolley,
        showWatering,
        showSpeed,
        visibleLocationTypes
    ]);

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

    // --- Measurement helpers (mirror Frontrunner behavior) ---
    const removePreviewEntities = (viewer) => {
        if (!viewer) return;
        const refs = [previewLineEntityRef, previewLabelEntityRef];
        refs.forEach(ref => {
            if (ref.current) {
                try { viewer.entities.remove(ref.current); } catch (_) { }
                ref.current = null;
            }
        });
        viewer.scene?.requestRender();
    };

    const clearMeasurements = (viewer) => {
        if (!viewer) return;
        measurementEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch (_) { } });
        overlayEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch (_) { } });
        removePreviewEntities(viewer);
        measurementEntitiesRef.current = [];
        overlayEntitiesRef.current = [];
        measurementPointsRef.current = [];
        areaLockedRef.current = false;
        measurementModeRef.current = 'none';
        setMeasurementMode('none');
        viewer.scene?.requestRender();
    };

    const drawDistance = (viewer, points) => {
        overlayEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch (_) { } });
        overlayEntitiesRef.current = [];
        const positions = points.map(p => p.cartesian);
        const line = viewer.entities.add({
            polyline: {
                positions,
                width: 4,
                material: Cesium.Color.WHITE,
            }
        });
        measurementEntitiesRef.current.push(line);
        overlayEntitiesRef.current.push(line);

        const ellipsoid = viewer.scene.globe.ellipsoid;
        const c1 = ellipsoid.cartesianToCartographic(positions[0]);
        const c2 = ellipsoid.cartesianToCartographic(positions[1]);
        const geodesic = new Cesium.EllipsoidGeodesic(c1, c2);
        const distanceMeters = geodesic.surfaceDistance;
        const distanceFeet = distanceMeters * 3.28084;

        if (!Number.isFinite(distanceMeters) || distanceMeters < 0.01) {
            // discard second point
            const lastPoint = measurementEntitiesRef.current.pop();
            try { viewer.entities.remove(lastPoint); } catch (_) { }
            measurementPointsRef.current = [points[0]];
            viewer.scene?.requestRender();
            return;
        }

        const metersText = `${distanceMeters.toFixed(2)} m`;
        const feetText = `${distanceFeet.toFixed(2)} ft`;
        const mid = Cesium.Cartesian3.lerp(positions[0], positions[1], 0.5, new Cesium.Cartesian3());

        const label1 = viewer.entities.add({
            position: mid,
            label: {
                text: metersText,
                font: '22px bold "Arial", sans-serif',
                fillColor: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 4,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                pixelOffset: new Cesium.Cartesian2(0, -30),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        });
        const label2 = viewer.entities.add({
            position: mid,
            label: {
                text: feetText,
                font: '20px bold "Arial", sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 4,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                pixelOffset: new Cesium.Cartesian2(0, 30),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        });
        measurementEntitiesRef.current.push(label1, label2);
        overlayEntitiesRef.current.push(label1, label2);

        areaLockedRef.current = true;
        measurementModeRef.current = 'none';
        setMeasurementMode('none');
        viewer.scene?.requestRender();
    };

    const drawAreaPreview = (viewer, points) => {
        overlayEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch (_) { } });
        overlayEntitiesRef.current = [];
        if (points.length < 2) return;
        const positions = points.map(p => p.cartesian);
        const polyline = viewer.entities.add({
            polyline: {
                positions,
                width: 2,
                material: Cesium.Color.CYAN.withAlpha(0.8),
            }
        });
        overlayEntitiesRef.current.push(polyline);
        viewer.scene?.requestRender();
    };

    const computeArea = (positions, ellipsoid) => {
        const origin = positions[0];
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin, ellipsoid);
        const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
        const local = positions.map(p => {
            const diff = Cesium.Cartesian3.subtract(p, origin, new Cesium.Cartesian3());
            return Cesium.Matrix4.multiplyByPointAsVector(inv, diff, new Cesium.Cartesian3());
        });
        let area = 0;
        for (let i = 0, j = local.length - 1; i < local.length; j = i++) {
            area += local[j].x * local[i].y - local[i].x * local[j].y;
        }
        return Math.abs(area) * 0.5;
    };

    const finalizeAreaMeasurement = (viewer) => {
        const pts = measurementPointsRef.current;
        if (!viewer || pts.length < 3 || areaLockedRef.current) return;
        overlayEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch (_) { } });
        overlayEntitiesRef.current = [];
        removePreviewEntities(viewer);

        const positions = pts.map(p => p.cartesian);
        if (!arePositionsValid(positions)) {
            measurementPointsRef.current = pts.slice(0, 1);
            viewer.scene?.requestRender();
            return;
        }
        const poly = viewer.entities.add({
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(positions),
                material: Cesium.Color.YELLOW.withAlpha(0.25),
                outline: true,
                outlineColor: Cesium.Color.YELLOW,
                outlineWidth: 2,
            }
        });
        measurementEntitiesRef.current.push(poly);
        overlayEntitiesRef.current.push(poly);

        const ellipsoid = viewer.scene.globe.ellipsoid;
        const areaSqm = computeArea(positions, ellipsoid);
        const areaSqft = areaSqm * 10.7639;
        const centroid = positions.reduce((acc, cur) => Cesium.Cartesian3.add(acc, cur, acc), new Cesium.Cartesian3());
        Cesium.Cartesian3.multiplyByScalar(centroid, 1 / positions.length, centroid);

        const label = viewer.entities.add({
            position: centroid,
            label: {
                text: `${areaSqm.toFixed(2)} m² / ${areaSqft.toFixed(2)} ft²`,
                font: '20px bold "Arial", sans-serif',
                fillColor: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 4,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                pixelOffset: new Cesium.Cartesian2(0, -20),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        });
        measurementEntitiesRef.current.push(label);
        overlayEntitiesRef.current.push(label);

        areaLockedRef.current = true;
        measurementModeRef.current = 'none';
        setMeasurementMode('none');
        viewer.scene?.requestRender();
    };

    const updatePreviewLine = (viewer, cursorCartesian) => {
        if (!viewer) return;
        if (areaLockedRef.current) {
            removePreviewEntities(viewer);
            return;
        }
        const mode = measurementModeRef.current;
        const pts = measurementPointsRef.current;
        if (mode !== 'distance' || pts.length !== 1) {
            removePreviewEntities(viewer);
            return;
        }
        if (!cursorCartesian) {
            removePreviewEntities(viewer);
            return;
        }

        const first = pts[0].cartesian;
        removePreviewEntities(viewer);

        previewLineEntityRef.current = viewer.entities.add({
            polyline: {
                positions: [first, cursorCartesian],
                width: 3,
                material: Cesium.Color.YELLOW.withAlpha(0.8),
            }
        });

        const ellipsoid = viewer.scene.globe.ellipsoid;
        const c1 = ellipsoid.cartesianToCartographic(first);
        const c2 = ellipsoid.cartesianToCartographic(cursorCartesian);
        const geodesic = new Cesium.EllipsoidGeodesic(c1, c2);
        const distanceMeters = geodesic.surfaceDistance;
        const distanceFeet = distanceMeters * 3.28084;
        const text = `${distanceMeters.toFixed(2)} m / ${distanceFeet.toFixed(2)} ft`;

        const mid = Cesium.Cartesian3.lerp(first, cursorCartesian, 0.5, new Cesium.Cartesian3());
        previewLabelEntityRef.current = viewer.entities.add({
            position: mid,
            label: {
                text,
                font: '20px bold \"Arial\", sans-serif',
                fillColor: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 4,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                pixelOffset: new Cesium.Cartesian2(0, -25),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        });
        viewer.scene?.requestRender();
    };

    const addMeasurementPoint = (viewer, cartesian) => {
        if (!viewer || !cartesian) return;
        if (areaLockedRef.current) return;
        const mode = measurementModeRef.current;
        if (mode === 'none') return;

        const newPoint = { id: uuidv4(), cartesian };
        const newPoints = [...measurementPointsRef.current, newPoint];
        measurementPointsRef.current = newPoints;

        const pointEntity = viewer.entities.add({
            position: cartesian,
            point: {
                pixelSize: 12,
                color: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.CYAN,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        });
        measurementEntitiesRef.current.push(pointEntity);

        if (mode === 'distance' && newPoints.length === 2) {
            removePreviewEntities(viewer);
            drawDistance(viewer, newPoints);
        } else if (mode === 'area' && newPoints.length >= 2) {
            drawAreaPreview(viewer, newPoints);
        }
    };

    const handleMeasureChange = (mode) => {
        if (mode === 'clear') {
            frClearMeasurements();
            setMeasurementMode('none');
            return;
        }
        frStartMeasurement(mode);
        setMeasurementMode(mode);
    };

    if (mapError) return <div style={{ color: 'white', padding: 20 }}>Error: {mapError}</div>;

    return (
        <>
            <Script src="https://cdnjs.cloudflare.com/ajax/libs/cesium/1.126.0/Cesium.js" onLoad={() => setCesiumLoaded(true)} />
            <TopMenuBar
                onComputePath={() => {
                    openTurnDialog();
                }}
                onManageProfiles={() => {
                    const val = window.prompt('Enter Road ID to view profile');
                    if (val && val.trim().length > 0) {
                        setSelectedRoadId(val.trim());
                        setShowProfileViewer(true);
                    }
                }}
                onMeasureDistance={() => handleMeasureChange('distance')}
                onMeasureArea={() => handleMeasureChange('area')}
                currentBaseLayer={baseLayer}
                onChangeBaseLayer={setBaseLayer}
                currentSceneMode={sceneMode}
                onChangeSceneMode={setSceneMode}
            />
            {turnDialogOpen && (
                <>
                    <TurnPathStatusBanner
                        currentStep={turnCurrentStep}
                        selectedSourceRoad={turnSourceRoad}
                        selectedDestinationRoad={turnDestRoad}
                        onCancel={closeTurnDialog}
                    />
                    <TurnPathDialog
                        isOpen={turnDialogOpen}
                        onClose={closeTurnDialog}
                        onStartSelection={(config) => {
                            startTurnSelection(config);
                        }}
                        vehicleProfiles={{}}
                        currentStep={turnCurrentStep}
                    />
                </>
            )}
            <div style={{ position: 'fixed', top: 40, left: 0, right: 0, bottom: 0, overflow: 'hidden', background: '#000' }}>
                <div ref={mapContainer} style={{ position: 'absolute', inset: 0, background: '#1a1a2e' }} />

                {/* Sidebar - Right Side */}
                {/* Sidebar (copy styling from Frontrunner legend) */}
                <div style={{
                    display: 'none',
                    position: 'absolute', top: 20, right: 20, width: 300,
                    backgroundColor: 'rgba(40, 40, 40, 0.75)',
                    border: '1px solid rgba(120, 120, 120, 0.6)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(15px)',
                    zIndex: 1000,
                    fontFamily: `'Inter','Segoe UI',Arial,sans-serif`,
                    overflow: 'hidden'
                }}>
                    <div style={{
                        backgroundColor: 'rgba(30, 30, 30, 0.8)',
                        padding: '12px 16px',
                        borderRadius: '8px 8px 0 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '20px',
                                height: '20px',
                                backgroundColor: '#3498db',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                            </div>
                            <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>
                                Dispatch Map
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
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
                                onClick={recenterView}
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
                                    <circle cx="8" cy="8" r="7.5" fill="#000" />
                                    <circle cx="8" cy="8" r="6" fill="none" stroke="#CC5500" strokeWidth="1.5" />
                                    <circle cx="8" cy="8" r="3" fill="#CC5500" />
                                    <rect x="7" y="0" width="2" height="3" fill="#CC5500" />
                                    <rect x="7" y="13" width="2" height="3" fill="#CC5500" />
                                    <rect x="0" y="7" width="3" height="2" fill="#CC5500" />
                                    <rect x="13" y="7" width="3" height="2" fill="#CC5500" />
                                </svg>
                            </button>
                            <div
                                style={{
                                    color: 'white',
                                    fontSize: '16px',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    transition: 'transform 0.2s'
                                }}
                            >
                                ▼
                            </div>
                        </div>
                    </div>

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
                            onChange={(e) => setBaseLayer(e.target.value)}
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
                            <option value="terrain">Terrain</option>
                        </select>
                    </div>

                    {/* Sections */}
                    <div style={{
                        padding: '12px',
                        color: 'white',
                        fontSize: '12px',
                        maxHeight: '320px',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'rgba(120, 120, 120, 0.6) rgba(40, 40, 40, 0.3)'
                    }}>
                </div>
            </div>
            {/* Close map wrapper */}
            </div>
            {/* Entity Information Dialog */}
            {dialogOpen && dialogData && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', zIndex: 10000,
                        backdropFilter: 'blur(5px)'
                    }}
                    onClick={() => { setDialogOpen(false); setDialogData(null); }}
                >
                    <div
                        style={{
                            backgroundColor: '#1e1e1e', borderRadius: '8px', padding: '16px',
                            maxWidth: '600px', maxHeight: '70vh', width: '85%',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(255, 255, 255, 0.1)', overflow: 'hidden',
                            display: 'flex', flexDirection: 'column'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: '12px', paddingBottom: '10px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                        }}>
                            <div>
                                <h2 style={{ color: '#fff', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                                    {dialogData.category === 'intersection' ? '🚦' : '📍'} {dialogData.name}
                                </h2>
                                <p style={{ color: '#bdc3c7', margin: '2px 0 0 0', fontSize: '11px', textTransform: 'capitalize' }}>
                                    {getCategoryDisplayName(dialogData.category)} Information
                                </p>
                            </div>
                            <button
                                onClick={() => { setDialogOpen(false); setDialogData(null); }}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '4px', color: '#fff', cursor: 'pointer', padding: '6px 12px',
                                    fontSize: '12px', fontWeight: '500'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '6px' }}>
                            {/* Show View Profile and Speed Management buttons for road segments */}
                            {(dialogData.category === 'dispatch_segment' || dialogData.category === 'frontrunner_segment') && dialogData.allProperties.road_id && (
                                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(52, 152, 219, 0.1)', borderRadius: '6px', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            onClick={() => {
                                                setDialogOpen(false);
                                                setSelectedRoadId(dialogData.allProperties.road_id);
                                                setShowProfileViewer(true);
                                            }}
                                            style={{
                                                flex: 1,
                                                background: '#4ECDC4',
                                                color: 'white',
                                                border: 'none',
                                                padding: '12px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            View Profile
                                        </button>
                                        <button
                                            onClick={() => {
                                                setDialogOpen(false);
                                                setSelectedRoadId(dialogData.allProperties.road_id);
                                                setShowSpeedManagement(true);
                                            }}
                                            style={{
                                                flex: 1,
                                                background: '#E67E22',
                                                color: 'white',
                                                border: 'none',
                                                padding: '12px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            Speed Management
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                                {Object.entries(dialogData.allProperties)
                                    .filter(([key]) => !['linestring', 'polygon', 'geometry', 'geometry_3d', 'propertyNames', 'definitionChanged', '_listeners', 'color', 'style_role'].includes(key) && !key.startsWith('_'))
                                    .map(([key, value]) => (
                                        <div key={key} style={{
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '8px',
                                            borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)'
                                        }}>
                                            <div style={{ color: '#bdc3c7', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>
                                                {key.replace(/_/g, ' ')}
                                            </div>
                                            <div style={{ color: '#fff', fontSize: '12px', wordBreak: 'break-word', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                                {String(value)}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showProfileViewer && selectedRoadId && (
                <RoadProfileViewer
                    roadId={selectedRoadId}
                    onClose={() => {
                        setShowProfileViewer(false);
                        setSelectedRoadId(null);
                    }}
                />
            )}
            {showSpeedManagement && selectedRoadId && (
                <SpeedManagementViewer
                    roadId={selectedRoadId}
                    onClose={() => {
                        setShowSpeedManagement(false);
                        setSelectedRoadId(null);
                    }}
                />
            )}
            <style dangerouslySetInnerHTML={{
                __html: `
                .cesium-viewer-bottom, .cesium-viewer-cesiumWidgetContainer .cesium-widget-credits,
                .cesium-viewer-cesiumLogoContainer, .cesium-credit-logoContainer, .cesium-credit-expand-link,
                .cesium-viewer-creditTextContainer { display: none !important; }
                a[href*="cesium.com"], a[href*="cesiumion.com"] { display: none !important; }
                .cesium-widget-credits { display: none !important; }
            `}} />
        </>
    );
}
