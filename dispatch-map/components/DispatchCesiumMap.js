import React, { useState, useEffect, useRef, useMemo } from 'react';
import Script from 'next/script';

// Color palette and helpers
const DISPATCH_LOCATION_COLOR_MAP = {
    'call point': '#FF6B6B', 'dump': '#FF8E72', 'blast': '#FFB347', 'stockpile': '#FFD166',
    'workshop': '#F4A261', 'shiftchange': '#06D6A0', 'region': '#118AB2', 'crusher': '#9B5DE5',
    'pit': '#EF476F', 'parking': '#FFE066', 'fuel': '#FE5F55', 'tipping area': '#FF924C',
    'infrastructure': '#5C677D', 'infrastructure_table': '#5C677D', 'default': '#9FA4B0'
};

const DEFAULT_HIDDEN_LOCATION_TYPES = [
    'call point',
    'shiftchange',
    'region',
    'pit',
];

const resolveDispatchLocationType = (location) => {
    if (!location) return 'Infrastructure';
    const rawValue = location.unit_type || location.location_category || location.category || location.source || 'Infrastructure';
    if (typeof rawValue !== 'string') return 'Infrastructure';
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : 'Infrastructure';
};

const getDispatchLocationColor = (locationType) => {
    if (!locationType || typeof locationType !== 'string') return DISPATCH_LOCATION_COLOR_MAP.default;
    return DISPATCH_LOCATION_COLOR_MAP[locationType.trim().toLowerCase()] || DISPATCH_LOCATION_COLOR_MAP.default;
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
        items.push(`--- DISPATCH SEGMENT ---`);
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

// Top Menu Bar Component
const TopMenuBar = () => (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '40px',
        backgroundColor: '#1a252f', borderBottom: '1px solid #2c3e50',
        display: 'flex', alignItems: 'center', zIndex: 2000,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
    }}>
        {/* <div style={{ padding: '0 16px', color: '#ecf0f1', fontWeight: 600, fontSize: '14px' }}>Dispatch Map</div> */}
        {['Tools'].map(item => (
            <div key={item} style={{
                padding: '0 16px', height: '100%', display: 'flex', alignItems: 'center',
                color: '#bdc3c7', fontSize: '13px', cursor: 'pointer',
                borderLeft: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s'
            }} onMouseEnter={e => e.target.style.background = '#2c3e50'} onMouseLeave={e => e.target.style.background = 'transparent'}>
                {item}
            </div>
        ))}
    </div>
);

export default function DispatchCesiumMap() {
    const mapContainer = useRef(null);
    const cesiumViewerRef = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [cesiumLoaded, setCesiumLoaded] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogData, setDialogData] = useState(null);

    // Data
    const [locations, setLocations] = useState([]);
    const [segments, setSegments] = useState([]);
    const [trolleySegments, setTrolleySegments] = useState([]);
    const [wateringStations, setWateringStations] = useState([]);
    const [speedMonitoring, setSpeedMonitoring] = useState([]);
    const [intersections, setIntersections] = useState([]);

    // UI State
    const [roadNetworksExpanded, setRoadNetworksExpanded] = useState(true);
    const [locationTypesExpanded, setLocationTypesExpanded] = useState(true);
    const [baseLayer, setBaseLayer] = useState('night'); // 'night' or 'day'

    // Visibility
    const [showOpenRoads, setShowOpenRoads] = useState(true);
    const [showClosedRoads, setShowClosedRoads] = useState(true);
    const [showIntersections, setShowIntersections] = useState(true);
    const [showTrolley, setShowTrolley] = useState(true);
    const [showWatering, setShowWatering] = useState(true);
    const [showSpeed, setShowSpeed] = useState(true);
    const [visibleLocationTypes, setVisibleLocationTypes] = useState(new Set());

    // Computed
    const locationCounts = useMemo(() => {
        const counts = {};
        locations.forEach(l => counts[resolveDispatchLocationType(l)] = (counts[resolveDispatchLocationType(l)] || 0) + 1);
        return counts;
    }, [locations]);

    const roadCounts = useMemo(() => ({
        open: segments.filter(s => !isDispatchSegmentClosed(s)).length,
        closed: segments.filter(s => isDispatchSegmentClosed(s)).length
    }), [segments]);

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

            // Coordinates
            const coordDisplay = document.createElement('div');
            coordDisplay.style.cssText = 'position: absolute; bottom: 20px; right: 20px; background: rgba(50, 50, 50, 0.92); color: white; padding: 10px 14px; border-radius: 8px; font-family: sans-serif; font-size: 12px; z-index: 1000; min-width: 140px;';
            document.body.appendChild(coordDisplay);
            new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas).setInputAction((m) => {
                const c = viewer.scene.pickPosition(m.endPosition);
                if (c) {
                    const cart = Cesium.Cartographic.fromCartesian(c);
                    coordDisplay.innerHTML = `Lat: ${Cesium.Math.toDegrees(cart.latitude).toFixed(6)}°<br>Lng: ${Cesium.Math.toDegrees(cart.longitude).toFixed(6)}°`;
                }
            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        } catch (e) { setMapError(e.message); }

        return () => cesiumViewerRef.current?.destroy();
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

    // Base Layer Logic
    useEffect(() => {
        if (!cesiumViewerRef.current || !window.Cesium) return;
        const viewer = cesiumViewerRef.current;
        const Cesium = window.Cesium;
        let cancelled = false;

        const updateBaseLayer = async () => {
            viewer.imageryLayers.removeAll();

            if (baseLayer === 'day') {
                try {
                    const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
                        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
                    );
                    if (!cancelled) {
                        viewer.imageryLayers.addImageryProvider(provider);
                    }
                } catch (error) {
                    console.error('Failed to load satellite imagery:', error);
                }
            }

            if (!cancelled) {
                viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a1a2e');
            }
        };

        updateBaseLayer();
        return () => { cancelled = true; };
    }, [baseLayer, mapLoaded]);

    // Load Data
    useEffect(() => {
        if (!mapLoaded) return;
        const load = async () => {
            try {
                const res = await Promise.all([
                    'locations { location_id location_name latitude longitude unit_type location_category }',
                    'segments { lane_id road_id geometry is_closed direction length_m }',
                    'trolleySegments { start_latitude start_longitude end_latitude end_longitude }',
                    'wateringStations { station_name latitude longitude }',
                    'speedMonitoring { latitude longitude }',
                    'intersections { intersection_id intersection_name intersection_type geometry safety_buffer_m r_min_m connected_roads created_at }'
                ].map(q => fetch('http://localhost:3000/api/graphql', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: `query { ${q} }` })
                }).then(r => r.json())));

                const [l, s, t, w, sp, i] = res.map(r => r.data?.[Object.keys(r.data)[0]] || []);

                console.log(`[DispatchCesiumMap] Loaded data:
                  - Locations: ${l?.length}
                  - Segments: ${s?.length}
                  - Trolley: ${t?.length}
                  - Watering: ${w?.length}
                  - Speed: ${sp?.length}
                  - Intersections: ${i?.length}`);

                if (!i || i.length === 0) {
                    console.warn("[DispatchCesiumMap] ⚠️ Intersections array is empty. Response:", res[5]);
                }

                setLocations(l);
                setSegments(s);
                setTrolleySegments(t);
                setWateringStations(w);
                setSpeedMonitoring(sp);
                setIntersections(i);

                const resolvedTypes = l.map(loc => resolveDispatchLocationType(loc));
                const visibleSet = new Set();
                resolvedTypes.forEach(t => {
                    const key = String(t).trim().toLowerCase();
                    if (!DEFAULT_HIDDEN_LOCATION_TYPES.includes(key)) {
                        visibleSet.add(t);
                    }
                });
                setVisibleLocationTypes(visibleSet);
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
                    // last: use current - previous  (this was backwards in your code)
                    Cesium.Cartesian3.subtract(cur, positions[n - 2], direction);
                } else {
                    // middle: average prev and next directions for smoother corners
                    const d1 = new Cesium.Cartesian3();
                    const d2 = new Cesium.Cartesian3();
                    Cesium.Cartesian3.subtract(cur, positions[i - 1], d1);
                    Cesium.Cartesian3.subtract(positions[i + 1], cur, d2);
                    Cesium.Cartesian3.normalize(d1, d1);
                    Cesium.Cartesian3.normalize(d2, d2);
                    Cesium.Cartesian3.add(d1, d2, direction);
                }

                // zero-length safety
                if (Cesium.Cartesian3.magnitudeSquared(direction) === 0) {
                    offsetPositions.push(cur);
                    continue;
                }

                Cesium.Cartesian3.normalize(direction, direction);

                // local "up" (normal to ellipsoid at this point)
                ellipsoid.geodeticSurfaceNormal(cur, up);

                // right = direction x up  (perpendicular to road, tangent to ground)
                Cesium.Cartesian3.cross(direction, up, right);
                Cesium.Cartesian3.normalize(right, right);

                const offset = Cesium.Cartesian3.multiplyByScalar(
                    right,
                    offsetMeters,
                    new Cesium.Cartesian3()
                );

                offsetPositions.push(
                    Cesium.Cartesian3.add(cur, offset, new Cesium.Cartesian3())
                );
            }

            return offsetPositions;
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
                    const [lon1, lat1] = coords[i];
                    const [lon2, lat2] = coords[i + 1];

                    const p1 = Cesium.Cartesian3.fromDegrees(lon1, lat1);
                    const p2 = Cesium.Cartesian3.fromDegrees(lon2, lat2);

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

                    const c1 = Cesium.Cartographic.fromDegrees(lon1, lat1);
                    const c2 = Cesium.Cartographic.fromDegrees(lon2, lat2);

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

            return bestBearing;
        };

        // Helper: 50m x 50m square polygon, rotated by angleFromEast (radians), in ENU frame
        const computeSquarePolygon = (centerCartesian, sizeMeters, angleFromEast) => {
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

            return baseCorners.map((c) => {
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
        };

        // Exact theme (only using the colors now)
        const NIGHT_THEME = {
            roadSurfaceColor: '#2C2F3A',    // dark grey
            roadSurfaceAlpha: 0.98,
            roadShoulderColor: '#2C2F3A',
            roadShoulderAlpha: 0.98,
            polygonOutlineColor: '#A0A0A0',
            polygonOutlineAlpha: 0.95,
            polygonOutlineWidth: 2.2,
            // Intersection styling from ConsolidatedPolygonMap
            intersectionFillColor: '#FF8C00', // Dark Orange
            intersectionFillAlpha: 1.0,
            intersectionOutlineColor: '#FFFFFF', // White
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
                const g = typeof s.geometry === 'string' ? JSON.parse(s.geometry) : s.geometry;
                if (!g?.coordinates || g.coordinates.length < 2) return;

                const rawPositions = g.coordinates.map((c) =>
                    Cesium.Cartesian3.fromDegrees(c[0], c[1])
                );

                // Filter duplicates
                const positions = rawPositions.filter((p, idx) => {
                    if (idx === 0) return true;
                    return !Cesium.Cartesian3.equalsEpsilon(
                        p,
                        rawPositions[idx - 1],
                        Cesium.Math.EPSILON7
                    );
                });

                if (positions.length < 2) return;

                // ----- decide which side this lane sits on -----
                const dir = (s.direction || '').toString().toLowerCase();
                let dirSign = 0; // 0 = centred (if no direction), +1 = one side, -1 = opposite
                if (dir.includes('forward')) dirSign = 1;
                else if (dir.includes('backward')) dirSign = -1;

                const laneCenterOffset = dirSign * LANE_CENTER_OFFSET_MAG;

                // centreline of this *lane* (shifted left/right from global centreline)
                const lanePositions =
                    laneCenterOffset === 0
                        ? positions
                        : computeOffsetLine(positions, laneCenterOffset);

                // Colours
                const surfaceColor = Cesium.Color
                    .fromCssColorString(NIGHT_THEME.roadSurfaceColor)
                    .withAlpha(NIGHT_THEME.roadSurfaceAlpha);

                const shoulderColor = Cesium.Color
                    .fromCssColorString(NIGHT_THEME.roadShoulderColor)
                    .withAlpha(NIGHT_THEME.roadShoulderAlpha);

                const edgeColor = closed
                    ? Cesium.Color.fromCssColorString('#FF6B6B')   // red border when closed
                    : Cesium.Color.fromCssColorString('#FFD700');  // yellow border when open

                const centerlineColor = Cesium.Color.WHITE;

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

                // 3. Centre white line ON THE GLOBAL CENTRELINE (only once per geometry is nice,
                // but drawing it for every segment is harmless — they overlap exactly)
                viewer.entities.add({
                    corridor: {
                        positions,
                        width: CENTERLINE_WIDTH,
                        material: centerlineColor.withAlpha(0.95),
                        height: 0.2,
                        cornerType: Cesium.CornerType.MITERED,
                        outline: false,
                    },
                    properties: {
                        category: 'dispatch_segment',
                        style_role: 'road_centerline',
                        ...s,
                    },
                });

                // 4. Edge lines at OUTER edge of each lane
                const leftEdge = computeOffsetLine(lanePositions, -HALF_LANE_TOTAL_WIDTH);
                const rightEdge = computeOffsetLine(lanePositions, HALF_LANE_TOTAL_WIDTH);

                [leftEdge, rightEdge].forEach((edgePositions, idx) => {
                    viewer.entities.add({
                        polyline: {
                            positions: edgePositions,
                            width: NIGHT_THEME.polygonOutlineWidth,
                            material: edgeColor.withAlpha(NIGHT_THEME.polygonOutlineAlpha),
                            clampToGround: false,
                        },
                        properties: {
                            category: 'dispatch_segment',
                            style_role: idx === 0 ? 'road_edge_left' : 'road_edge_right',
                            ...s,
                        },
                    });
                });
            } catch (e) {
                console.error('Failed to render segment', s, e);
            }
        });

        // OTHER LAYERS (trolley, intersections, etc.)
        if (showTrolley) {
            trolleySegments.forEach((t) =>
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
                        ),
                        clampToGround: true
                    },
                    properties: { category: "dispatch_trolley", ...t }
                })
            );
        }

        if (showIntersections) {
            console.log(`Rendering ${intersections.length} intersections`);
            intersections.forEach((i) => {
                try {
                    const raw = i.nice_geometry || i.geometry; // fallback
                    const g = typeof raw === "string" ? JSON.parse(raw) : raw;
                    if (!g || !g.coordinates) return;

                    // Normalize to a list of polygons (each polygon is a list of rings)
                    // Polygon: [ [ [x,y], [x,y], ... ], [hole...] ]
                    // MultiPolygon: [ [ [ [x,y]... ] ], [ [ [x,y]... ] ] ]
                    let polygons = [];
                    if (g.type === 'MultiPolygon') {
                        polygons = g.coordinates;
                    } else if (g.type === 'Polygon') {
                        polygons = [g.coordinates];
                    } else {
                        return;
                    }

                    polygons.forEach((polyRings, idx) => {
                        // polyRings[0] is exterior. We IGNORE holes (polyRings[1..]) 
                        // to avoid "circles" or artifacts inside the intersection.
                        if (!polyRings || !polyRings[0]) return;

                        const hierarchy = new Cesium.PolygonHierarchy(
                            polyRings[0].map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]))
                        );

                        // Holes ignored intentionally.

                        viewer.entities.add({
                            polygon: {
                                hierarchy: hierarchy,
                                material: Cesium.Color.fromCssColorString(NIGHT_THEME.intersectionFillColor).withAlpha(NIGHT_THEME.intersectionFillAlpha),
                                height: 0.6, // Lift slightly above roads
                                outline: true,
                                outlineColor: Cesium.Color.fromCssColorString(NIGHT_THEME.intersectionOutlineColor).withAlpha(NIGHT_THEME.intersectionOutlineAlpha),
                                outlineWidth: NIGHT_THEME.polygonOutlineWidth,
                            },
                            properties: {
                                category: "dispatch_intersection",
                                ...i,
                                part_index: idx
                            }
                        });
                    });
                } catch (e) {
                    console.error("Bad intersection geometry", i, e);
                }
            });
        }

        // LOCATIONS
        const SQUARE_TYPES = new Set([
            "blast",
            "dump",
            "stockpile",
            "workshop",
            "crusher"
        ]);

        locations.forEach((l) => {
            const type = resolveDispatchLocationType(l);
            if (!visibleLocationTypes.has(type)) return;

            const color = Cesium.Color.fromCssColorString(
                getDispatchLocationColor(type)
            );

            const position = Cesium.Cartesian3.fromDegrees(
                l.longitude,
                l.latitude,
                2.0    // 2m above ground so locations sit clearly above the road surface
            );

            if (SQUARE_TYPES.has(type.toLowerCase())) {
                // Find nearest road's bearing
                const bearingFromNorth = getNearestRoadBearing(l, segments);

                // We want the square PERPENDICULAR to the road.
                // Our rotation angle is measured from EAST in ENU.
                // A perpendicular to a heading-from-north `bearing` corresponds to angleFromEast = -bearing.
                const angleFromEast = -bearingFromNorth;

                // 40m x 40m square
                const hierarchy = computeSquarePolygon(
                    position,
                    40.0,          // size in meters
                    angleFromEast
                );

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
                // default point marker, also at height 2m
                viewer.entities.add({
                    position,
                    point: {
                        pixelSize: 8,
                        color,
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 1,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY, // <-- always on top
                    },
                    properties: {
                        category: "dispatch_location",
                        ...l
                    }
                });
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

    if (mapError) return <div style={{ color: 'white', padding: 20 }}>Error: {mapError}</div>;

    return (
        <>
            <Script src="https://cesium.com/downloads/cesiumjs/releases/1.111/Build/Cesium/Cesium.js" onLoad={() => setCesiumLoaded(true)} />
            <TopMenuBar />
            <div style={{ position: 'relative', width: '100%', height: 'calc(100% - 40px)', marginTop: '40px' }}>
                <div ref={mapContainer} style={{ width: '100%', height: '100%', background: '#1a1a2e' }} />

                {/* Sidebar - Right Side */}
                <div style={{
                    position: 'absolute', top: 20, right: 20, width: 300,
                    background: 'rgba(27, 38, 59, 0.95)', color: 'white',
                    borderRadius: 8, backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: '#1a252f', padding: '12px', borderTopLeftRadius: 8, borderTopRightRadius: 8,
                        borderBottom: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: 16, height: 16, background: '#3498db', borderRadius: 3, marginRight: 10 }} />
                            <span style={{ fontWeight: 700, fontSize: 14 }}>Dispatch Map</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button style={{
                                background: 'rgba(52, 152, 219, 0.2)', border: '1px solid #3498db', borderRadius: 4,
                                padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <circle cx="8" cy="8" r="7.5" fill="#000" />
                                    <circle cx="8" cy="8" r="6" fill="none" stroke="#CC5500" strokeWidth="1.5" />
                                    <circle cx="8" cy="8" r="3" fill="#CC5500" />
                                    <rect x="7" y="0" width="2" height="3" fill="#CC5500" />
                                    <rect x="7" y="13" width="2" height="3" fill="#CC5500" />
                                    <rect x="0" y="7" width="3" height="2" fill="#CC5500" />
                                    <rect x="13" y="7" width="3" height="2" fill="#CC5500" />
                                </svg>
                            </button>
                            <span style={{ fontSize: 12, cursor: 'pointer' }}>▼</span>
                        </div>
                    </div>

                    {/* Base Layer Selector */}
                    <div style={{
                        padding: '12px', borderBottom: '1px solid rgba(120, 120, 120, 0.3)',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)'
                    }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', color: '#bdc3c7', fontWeight: '600' }}>
                            Base Layer
                        </label>
                        <select
                            value={baseLayer}
                            onChange={(e) => setBaseLayer(e.target.value)}
                            style={{
                                width: '100%', padding: '6px 8px', backgroundColor: 'rgba(40, 40, 40, 0.9)',
                                color: 'white', border: '1px solid rgba(120, 120, 120, 0.4)', borderRadius: '4px',
                                fontSize: '12px', cursor: 'pointer', outline: 'none'
                            }}
                        >
                            <option value="night">Night Mode (Dark)</option>
                            <option value="day">Day Mode (Satellite)</option>
                        </select>
                    </div>

                    {/* Location Categories (Red) */}
                    <Section
                        title="Location Categories" color="#e74c3c" expanded={locationTypesExpanded}
                        onToggle={() => setLocationTypesExpanded(!locationTypesExpanded)}
                        count={Object.keys(locationCounts).length}
                        textColor="#e74c3c" iconColor="#e74c3c" badgeColor="#e74c3c"
                    >
                        {Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                            <LegendItem
                                key={type} label={`${type} (${count})`} color={getDispatchLocationColor(type)}
                                checked={visibleLocationTypes.has(type)} onChange={(c) => toggleLocationType(type, c)} type="square"
                            />
                        ))}
                    </Section>

                    {/* Road Networks (Purple Border, Red Text) */}
                    <Section
                        title="Road Networks" color="#9B59B6" expanded={roadNetworksExpanded}
                        onToggle={() => setRoadNetworksExpanded(!roadNetworksExpanded)}
                        count={roadCounts.open + roadCounts.closed + intersections.length + trolleySegments.length + wateringStations.length + speedMonitoring.length}
                        textColor="#FF0000" iconColor="#9B59B6" badgeColor="#FF0000"
                    >
                        <LegendItem label={`Open Roads (${roadCounts.open})`} color="#FFFF00" checked={showOpenRoads} onChange={setShowOpenRoads} type="square" />
                        <LegendItem label={`Closed Roads (${roadCounts.closed})`} color="#666666" checked={showClosedRoads} onChange={setShowClosedRoads} type="square" />
                        <LegendItem label={`Intersections (${intersections.length})`} color="#FF8C00" checked={showIntersections} onChange={setShowIntersections} type="square" />
                        <LegendItem label={`Trolley Lines (${trolleySegments.length})`} color="#FF6B6B" checked={showTrolley} onChange={setShowTrolley} type="square" />
                        <LegendItem label={`Watering Stations (${wateringStations.length})`} color="#3498db" checked={showWatering} onChange={setShowWatering} type="square" />
                        <LegendItem label={`Speed Monitoring (${speedMonitoring.length})`} color="#f1c40f" checked={showSpeed} onChange={setShowSpeed} type="square" />
                    </Section>
                </div>
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

const Section = ({ title, color, expanded, onToggle, count, children, textColor, iconColor, badgeColor }) => (
    <div style={{ borderLeft: `3px solid ${color}`, margin: '8px 0' }}>
        <div onClick={onToggle} style={{
            backgroundColor: `${color}1A`, padding: '8px 12px', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 16, height: 16, backgroundColor: iconColor, borderRadius: 3, marginRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                <span style={{ color: textColor, fontWeight: 600, fontSize: 13 }}>{title}</span>
                <div style={{ backgroundColor: badgeColor, color: 'white', borderRadius: 10, padding: '2px 8px', marginLeft: 8, fontSize: 10, fontWeight: 'bold' }}>{count}</div>
            </div>
            <span style={{ color: textColor, fontSize: 14 }}>{expanded ? '▼' : '▶'}</span>
        </div>
        {expanded && <div style={{ padding: '8px 12px 8px 32px' }}>{children}</div>}
    </div>
);

const LegendItem = ({ label, color, checked, onChange, type }) => (
    <div style={{ marginBottom: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 12, color: '#bdc3c7' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginRight: 8, accentColor: color }} />
            <div style={{ width: 12, height: 12, backgroundColor: color, borderRadius: 2, marginRight: 10 }} />
            <span style={{ color: 'white', fontWeight: 500 }}>{label}</span>
        </label>
    </div>
);
