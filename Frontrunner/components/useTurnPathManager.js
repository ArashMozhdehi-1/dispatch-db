import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for managing turn path computation workflow
 * Handles state, road selection, API calls, and path rendering
 */
export default function useTurnPathManager(cesiumViewerRef) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState('profile'); // profile, selecting_source, selecting_destination, computing, showing_path
  const [vehicleProfiles, setVehicleProfiles] = useState({});
  const [pathConfig, setPathConfig] = useState(null);
  const [selectedSourceRoad, setSelectedSourceRoad] = useState(null);
  const [selectedDestinationRoad, setSelectedDestinationRoad] = useState(null);
  const [computedPath, setComputedPath] = useState(null);
  const [warning, setWarning] = useState(null);

  // Refs to expose latest state to Cesium event handlers
  const currentStepRef = useRef(currentStep);
  const selectedSourceRoadRef = useRef(selectedSourceRoad);
  const pathConfigRef = useRef(pathConfig);

  const getEntityProperty = (entity, key) => {
    if (!entity?.properties) return null;
    const prop = entity.properties[key];
    if (prop === undefined || prop === null) return null;
    return typeof prop.getValue === 'function' ? prop.getValue() : prop;
  };

  const extractRoadConnections = (entity) => {
    if (!entity?.properties) return [];

    const possibleKeys = [
      'from_location_name',
      'to_location_name',
      'from_location',
      'to_location',
      'from_intersection',
      'to_intersection',
      'start_location_name',
      'end_location_name',
    ];

    const values = possibleKeys
      .map((key) => getEntityProperty(entity, key))
      .filter((val) => typeof val === 'string' && val.trim().length > 0);

    return Array.from(new Set(values.map((v) => v.trim())));
  };

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    selectedSourceRoadRef.current = selectedSourceRoad;
  }, [selectedSourceRoad]);

  useEffect(() => {
    pathConfigRef.current = pathConfig;
  }, [pathConfig]);

  const getCurrentStep = () => currentStepRef.current;
  const getSelectedSourceRoad = () => selectedSourceRoadRef.current;

  // Reset selection state (Fixed: Initialized before use)
  const resetSelection = useCallback(() => {
    const restoreEntityMaterial = (entity) => {
      if (!entity) return;
      if (entity.polygon) {
        if (entity._originalMaterial) {
          entity.polygon.material = entity._originalMaterial;
          delete entity._originalMaterial;
        }
      } else if (entity.polyline) {
        if (entity._originalMaterial) {
          entity.polyline.material = entity._originalMaterial;
          delete entity._originalMaterial;
        }
      }
    };

    restoreEntityMaterial(selectedSourceRoad?.entity);
    restoreEntityMaterial(selectedDestinationRoad?.entity);

    selectedSourceRoadRef.current = null;
    setSelectedSourceRoad(null);
    setSelectedDestinationRoad(null);
    setComputedPath(null);
    setWarning(null);
    setCurrentStep('profile');
  }, [selectedSourceRoad, selectedDestinationRoad]);

  // Load vehicle profiles on mount
  useEffect(() => {
    fetch('/api/vehicle-profiles')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setVehicleProfiles(data.profiles);
        }
      })
      .catch((err) => console.error('Failed to load vehicle profiles:', err));
  }, []);

  // Handle ESC key globally during turn path workflow
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // If dialog is open, close it
        if (isDialogOpen) {
          closeDialog();
        }
        // If a path is computed (even after dialog closed), clear it
        else if (computedPath) {
          resetSelection();
        }
      }
    };

    if (isDialogOpen || computedPath) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isDialogOpen, computedPath]); // resetSelection is closed over, safe because definition is above

  // Find shared intersection between two roads (using side-center markers)
  const findSharedIntersection = async (roadId1, roadId2) => {
    try {
      const response = await fetch('/api/map-locations-from-dump');
      const data = await response.json();

      // Find side-center markers for both roads
      // Only use road_corner_side_center markers that have metadata
      const centers =
        data.consolidated_locations?.filter(
          (loc) => loc.type === 'road_corner_side_center' && loc.road_marker_metadata
        ) || [];

      const idsEqual = (a, b) => String(a) === String(b);
      const r1 = String(roadId1);
      const r2 = String(roadId2);

      const fromMarkers = centers.filter(
        (m) => m.road_marker_metadata && idsEqual(m.road_marker_metadata.road_id, r1)
      );
      const toMarkers = centers.filter(
        (m) => m.road_marker_metadata && idsEqual(m.road_marker_metadata.road_id, r2)
      );

      console.log('[Turn Path] findSharedIntersection markers:', {
        roadId1,
        roadId2,
        road1Markers: fromMarkers.length,
        road2Markers: toMarkers.length,
      });

      // Find common intersection
      // Loop through markers strictly belonging to road 1
      for (const m1 of fromMarkers) {
        const int1 =
          m1.road_marker_metadata.overlapping_entity_name ||
          m1.road_marker_metadata.best_overlap_entity;
        if (!int1) continue;

        // Loop through markers strictly belonging to road 2
        for (const m2 of toMarkers) {
          const int2 =
            m2.road_marker_metadata.overlapping_entity_name ||
            m2.road_marker_metadata.best_overlap_entity;
          if (!int2) continue;

          if (int1 === int2) {
            // ✅ Guaranteed: m1 is on fromRoadId, m2 is on toRoadId
            return {
              name: int1,
              from_marker_oid: m1._oid_,
              to_marker_oid: m2._oid_,
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[Turn Path] Error finding intersection:', error);
      return null;
    }
  };

  const findSharedEndpointFromSelections = (source, destination) => {
    const sourceConnections = source?.connections?.length
      ? source.connections
      : extractRoadConnections(source?.entity);

    const destinationConnections = destination?.connections?.length
      ? destination.connections
      : extractRoadConnections(destination?.entity);

    if (!sourceConnections || !destinationConnections) return null;

    return sourceConnections.find((conn) => destinationConnections.includes(conn)) || null;
  };

  // Compute turn path via API
  const computeTurnPath = useCallback(
    async (source, destination) => {
      const config = pathConfigRef.current;

      if (!config || !source || !destination) {
        console.error('[Turn Path] Missing required data for computation', {
          config,
          source,
          destination,
        });

        if (!source) {
          alert('Please select the starting road first.');
          setCurrentStep('selecting_source');
        } else if (!destination) {
          alert('Please select the destination road.');
          setCurrentStep('selecting_destination');
        } else if (!config) {
          alert('Vehicle settings not ready yet. Please wait a moment and try again.');
          setCurrentStep('profile');
          setIsDialogOpen(true);
        }
        return;
      }

      setCurrentStep('computing');

      try {
        // Find shared intersection
        let intersection = await findSharedIntersection(source.road_id, destination.road_id);

        if (!intersection) {
          const sharedEndpoint = findSharedEndpointFromSelections(source, destination);
          if (sharedEndpoint) {
            intersection = { name: sharedEndpoint };
          }
        }

        if (!intersection) {
          alert(
            'No shared intersection found between these roads. Please select roads that connect at an intersection.'
          );
          resetSelection();
          return;
        }

        console.log('[Turn Path] Computing path:', {
          from: source.road_id,
          to: destination.road_id,
          intersection: intersection.name,
        });

        const payload = {
          from_road_id: source.road_id,
          to_road_id: destination.road_id,
          intersection_name: intersection.name,
          ...config,
        };

        if (intersection.from_marker_oid && intersection.to_marker_oid) {
          payload.from_marker_oid = intersection.from_marker_oid;
          payload.to_marker_oid = intersection.to_marker_oid;
        }

        const response = await fetch('/api/turn-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (result.status === 'ok') {
          console.log('[Turn Path] Path computed successfully:', result);

          setComputedPath(result);
          setWarning(null);

          const clearanceMsg = result.clearance.vehicle_envelope_ok
            ? '✅ Vehicle clearance OK'
            : `⚠️ Vehicle extends ${result.clearance.outside_area_sqm.toFixed(
              1
            )} m² outside intersection`;

          console.log(
            `[Turn Path] length=${result.path.length_m.toFixed(
              1
            )}m, type=${result.path.path_type}, ${clearanceMsg}`
          );

          setCurrentStep('showing_path');
          setIsDialogOpen(false);
        } else if (result.status === 'envelope_outside_intersection') {
          console.warn('[Turn Path] Envelope leaks outside intersection:', result.clearance);
          const leak = result.clearance?.outside_area_sqm;

          const msg =
            leak != null
              ? `No valid turn path can be drawn: vehicle envelope would leave the intersection (outside area ≈ ${leak.toFixed(
                1
              )} m²).`
              : 'No valid turn path can be drawn: vehicle envelope would leave the intersection.';

          alert(msg);

          // HARD FAIL: clear any path and selection so nothing is rendered
          resetSelection();
          setIsDialogOpen(false);
        } else {
          console.error('[Turn Path] Path computation failed:', result.error);
          alert(`Failed to compute path: ${result.error || result.status}`);
          resetSelection();
          setIsDialogOpen(false);
        }
      } catch (error) {
        console.error('[Turn Path] Error computing path:', error);
        alert(`Error: ${error.message}`);
        resetSelection();
        setIsDialogOpen(false);
      }
    },
    [resetSelection]
  );

  // Handle road click during selection
  const handleMapClick = useCallback(
    (clickedEntity) => {
      const step = currentStepRef.current;
      console.log('[Turn Path] handleMapClick called:', {
        currentStep: step,
        hasEntity: !!clickedEntity,
        hasViewer: !!cesiumViewerRef.current,
      });

      if (!cesiumViewerRef.current || !clickedEntity) {
        console.log('[Turn Path] Missing viewer or entity');
        return;
      }

      const category =
        clickedEntity.properties?.category?.getValue?.() || clickedEntity.properties?.category;
      const roadName =
        clickedEntity.properties?.name?.getValue?.() || clickedEntity.properties?.name;
      const roadId =
        clickedEntity.properties?.road_id?.getValue?.() || clickedEntity.properties?.road_id;

      console.log('[Turn Path] Entity properties:', {
        category,
        roadName,
        roadId,
        hasPolygon: !!clickedEntity.polygon,
      });

      if (!category || !category.toString().toLowerCase().includes('road')) {
        console.log('[Turn Path] Clicked entity is not a road, ignoring');
        return;
      }

      if (step === 'selecting_source') {
        console.log('[Turn Path] Selected source road:', roadName, roadId);

        const connections = extractRoadConnections(clickedEntity);
        const newSource = { name: roadName, road_id: roadId, entity: clickedEntity, connections };

        selectedSourceRoadRef.current = newSource;
        setSelectedSourceRoad(newSource);

        if (clickedEntity.polygon) {
          clickedEntity._originalMaterial =
            clickedEntity._originalMaterial || clickedEntity.polygon.material;
          clickedEntity.polygon.material = window.Cesium.Color.GREEN.withAlpha(0.5);
        } else if (clickedEntity.polyline) {
          clickedEntity._originalMaterial =
            clickedEntity._originalMaterial || clickedEntity.polyline.material;
          clickedEntity.polyline.material = window.Cesium.Color.GREEN;
        }

        setCurrentStep('selecting_destination');
      } else if (step === 'selecting_destination') {
        const sourceRoad = selectedSourceRoadRef.current;
        if (sourceRoad && sourceRoad.road_id === roadId) {
          console.log('[Turn Path] Cannot select same road as source and destination');
          return;
        }

        console.log('[Turn Path] Selected destination road:', roadName, roadId);

        const connections = extractRoadConnections(clickedEntity);
        const newDestination = {
          name: roadName,
          road_id: roadId,
          entity: clickedEntity,
          connections,
        };

        setSelectedDestinationRoad(newDestination);

        if (clickedEntity.polygon) {
          clickedEntity._originalMaterial =
            clickedEntity._originalMaterial || clickedEntity.polygon.material;
          clickedEntity.polygon.material = window.Cesium.Color.RED.withAlpha(0.5);
        } else if (clickedEntity.polyline) {
          clickedEntity._originalMaterial =
            clickedEntity._originalMaterial || clickedEntity.polyline.material;
          clickedEntity.polyline.material = window.Cesium.Color.RED;
        }

        computeTurnPath(sourceRoad, newDestination);
      }
    },
    [cesiumViewerRef, computeTurnPath]
  );

  // Open dialog and start workflow
  const openDialog = () => {
    setIsDialogOpen(true);
    setCurrentStep('profile');
  };

  // Close dialog and clean up
  const closeDialog = () => {
    resetSelection();
    setIsDialogOpen(false);
    setCurrentStep('profile');
  };

  // Start road selection process
  const startSelection = (config) => {
    console.log('[Turn Path] startSelection called with config:', config);

    pathConfigRef.current = config;
    setPathConfig(config);

    console.log('[Turn Path] Setting currentStep to: selecting_source');
    currentStepRef.current = 'selecting_source';
    setCurrentStep('selecting_source');
    console.log('[Turn Path] currentStep should now be: selecting_source');
  };

  const pathEntitiesRef = useRef([]);

  // ----------- VALIDATION HELPERS -----------

  const isFiniteNumber = (v) => {
    return typeof v === 'number' && Number.isFinite(v);
  };

  const positionsAreFinite = (positions, label) => {
    if (!positions || positions.length === 0) {
      console.warn(`[Turn Path] ${label}: empty positions, skipping.`);
      return false;
    }

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (
        !p ||
        !isFiniteNumber(p.x) ||
        !isFiniteNumber(p.y) ||
        !isFiniteNumber(p.z)
      ) {
        console.warn(
          `[Turn Path] ${label}: invalid position at index ${i}, skipping polygon.`,
          p
        );
        return false;
      }
    }
    return true;
  };

  const safeAddPolygon = (viewer, positions, label, style = {}) => {
    if (!positionsAreFinite(positions, label)) {
      return null;
    }

    try {
      return viewer.entities.add({
        polygon: {
          hierarchy: new window.Cesium.PolygonHierarchy(positions),
          material: window.Cesium.Color.YELLOW.withAlpha(0.3),
          outline: true,
          outlineColor: window.Cesium.Color.YELLOW,
          heightReference: window.Cesium.HeightReference.RELATIVE_TO_GROUND,
        },
        ...style,
      });
    } catch (e) {
      console.error(`[Turn Path] Error adding polygon for ${label}:`, e);
      return null;
    }
  };

  const safeDegreesArrayToPositions = (degrees, label) => {
    if (!Array.isArray(degrees) || degrees.length < 6) {
      console.warn(
        `[Turn Path] ${label}: not enough coords for polygon (need at least 3 points).`,
        degrees
      );
      return undefined;
    }

    for (let i = 0; i < degrees.length; i++) {
      if (!isFiniteNumber(degrees[i])) {
        console.warn(
          `[Turn Path] ${label}: non-finite degree value at index ${i}:`,
          degrees[i]
        );
        return undefined;
      }
    }

    try {
      const positions = window.Cesium.Cartesian3.fromDegreesArray(degrees);
      if (!positionsAreFinite(positions, `${label} (after fromDegreesArray)`)) {
        return undefined;
      }
      return positions;
    } catch (e) {
      console.warn(`[Turn Path] ${label}: fromDegreesArray failed:`, e);
      return undefined;
    }
  };

  // Clear existing path entities
  const clearPathEntities = () => {
    const viewer = cesiumViewerRef.current;
    if (!viewer) return;

    console.log('[Turn Path] clearPathEntities called - FORCE REMOVING ALL turn path entities');

    // 1. Remove entities we tracked
    if (pathEntitiesRef.current.length > 0) {
    pathEntitiesRef.current.forEach((entity) => {
      try {
          viewer.entities.remove(entity);
      } catch (e) {
        console.warn('[Turn Path] Error removing entity:', e);
      }
    });
    pathEntitiesRef.current = [];
    }

    // 2. SAFETY NET: Scan ALL entities for our categories and remove them
    // This handles cases where hot-reload lost the ref but entities remain on map
    const toRemove = [];
    const knownCategories = ['turn_path_swept', 'turn_path_envelope', 'turn_path_centreline', 'swept_path', 'vehicle_envelope'];

    try {
      viewer.entities.values.forEach((entity) => {
        const cat = entity.properties?.category?.getValue?.() || entity.properties?.category;
        const layer = entity.properties?.turn_layer?.getValue?.() || entity.properties?.turn_layer;

        if (knownCategories.includes(cat) || knownCategories.includes(layer)) {
          toRemove.push(entity);
        }
      });

      if (toRemove.length > 0) {
        console.log(`[Turn Path] Found ${toRemove.length} stranded entities to remove.`);
        toRemove.forEach(e => viewer.entities.remove(e));
      }
    } catch (e) {
      console.warn('[Turn Path] Error scanning entities for cleanup:', e);
    }

    if (viewer.scene) {
      viewer.scene.requestRender();
    }
  };

  // Helper to simplify positions to prevent Cesium tessellation issues
  // (We'll keep this as an extra optimization step before rendering centerlines)
  const simplifyPositions = (positions, tolerance = 1.0) => {
    if (!positions || positions.length < 2) return positions;

    const simplified = [positions[0]];

    for (let i = 1; i < positions.length; i++) {
      const prev = simplified[simplified.length - 1];
      const curr = positions[i];

      // Check for strictly identical points (prevent degenerate segments)
      if (window.Cesium.Cartesian3.equalsEpsilon(prev, curr, window.Cesium.Math.EPSILON7)) {
        continue;
      }

      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dz = curr.z - prev.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > tolerance) {
        simplified.push(curr);
      }
    }

    if (simplified.length < 2 && positions.length >= 2) {
      // Fallback: at least return start and end if invalid
      return [positions[0], positions[positions.length - 1]];
    }
    return simplified;
  };

  // Pick the best available centreline WKT
  const chooseCenterlineWkt = (path) => {
    if (!path) return '';
    return path.wkt || path.smooth_wkt || path.raw_wkt || '';
  };

  // --- small helper: unwrap {geometry_geojson} or raw geometry ---
  const toPolygonGeom = (wrapper, label) => {
    if (!wrapper) return null;

    // If it's already a geometry (from some other path), just use it
    if (wrapper.type === 'Polygon' && Array.isArray(wrapper.coordinates)) {
      return wrapper;
    }

    const geom =
      wrapper.geometry_geojson ||
      wrapper.geometry || // just in case you change the backend later
      null;

    if (!geom || geom.type !== 'Polygon' || !Array.isArray(geom.coordinates)) {
      console.warn(`[Turn Path] ${label}: invalid polygon geom`, wrapper);
      return null;
    }
    return geom;
  };

  // Helper to get vehicle details for label
  const getVehicleMetadata = (config) => {
    if (!config) return null;
    if (config.custom_vehicle_profile) {
      return {
        width: config.custom_vehicle_profile.vehicle_width_m,
        buffer: config.custom_vehicle_profile.side_buffer_m,
        name: config.custom_vehicle_profile.name || 'Custom Vehicle'
      };
    }
    // For predefined, we might need to look up in vehicleProfiles if we had the ID, 
    // but pathConfig usually has the flattened parameters if it was constructed properly.
    if (config.vehicle_profile_id && vehicleProfiles[config.vehicle_profile_id]) {
      const p = vehicleProfiles[config.vehicle_profile_id];
      return {
        width: p.vehicle_width_m,
        buffer: p.side_buffer_m || 0.5,
        name: p.name
      };
    }
    return {
      width: '?',
      buffer: '?',
      name: 'Vehicle'
    };
  };

  // Centerline-only rendering; no backend polygons available, so we derive a corridor locally.
  const drawVehicleCorridorFromCenterline = (viewer, path, clearance, entities) => {
    if (!path) return;
    const lineWkt = chooseCenterlineWkt(path);
    if (!lineWkt) return;

    const match = lineWkt.match(/LINESTRING\s*\((.+)\)/i);
    if (!match) return;

    const coordsDeg = [];
    for (const pair of match[1].split(',')) {
      const parts = pair.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) continue;
      coordsDeg.push(lon, lat);
    }
    if (coordsDeg.length < 4) return; // need at least 2 points

    // Convert to Cartesian for offsetting
    const positions = window.Cesium.Cartesian3.fromDegreesArray(coordsDeg);
    if (!positionsAreFinite(positions, 'corridor_positions')) return;

    // Determine half width (vehicle width + buffers) / 2
    const widthMeters = Math.max(2.0, clearance?.vehicle_width_with_buffer_m || 8.0);
    const half = widthMeters / 2.0;

    // Build left/right offsets using simple 2D perpendicular in ENU at each vertex
    const ellipsoid = window.Cesium.Ellipsoid.WGS84;
    const leftPts = [];
    const rightPts = [];

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      // Determine forward vector
      const pNext = positions[Math.min(i + 1, positions.length - 1)];
      const pPrev = positions[Math.max(i - 1, 0)];
      const dir = new window.Cesium.Cartesian3();
      window.Cesium.Cartesian3.subtract(pNext, pPrev, dir);
      if (window.Cesium.Cartesian3.magnitude(dir) < 1e-3) continue;
      window.Cesium.Cartesian3.normalize(dir, dir);

      // Up vector at this point
      const up = ellipsoid.geodeticSurfaceNormal(p, new window.Cesium.Cartesian3());
      // Left = up x dir
      const left = new window.Cesium.Cartesian3();
      window.Cesium.Cartesian3.cross(up, dir, left);
      window.Cesium.Cartesian3.normalize(left, left);

      const leftOffset = window.Cesium.Cartesian3.multiplyByScalar(left, half, new window.Cesium.Cartesian3());
      const rightOffset = window.Cesium.Cartesian3.multiplyByScalar(left, -half, new window.Cesium.Cartesian3());

      const leftPoint = window.Cesium.Cartesian3.add(p, leftOffset, new window.Cesium.Cartesian3());
      const rightPoint = window.Cesium.Cartesian3.add(p, rightOffset, new window.Cesium.Cartesian3());

      leftPts.push(leftPoint);
      rightPts.push(rightPoint);
    }

    if (leftPts.length < 2 || rightPts.length < 2) return;

    // Build polygon: left side forward, right side backward to close
    const polygonPositions = [...leftPts, ...rightPts.reverse()];
    if (!positionsAreFinite(polygonPositions, 'corridor_polygon')) return;

    try {
      // Raise slightly above ground and disable depth test so it always draws on top
      const raisedPositions = polygonPositions.map(p => {
        const carto = window.Cesium.Cartographic.fromCartesian(p);
        return window.Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, (carto.height || 0) + 3.0);
      });

      const entity = viewer.entities.add({
      polygon: {
          hierarchy: new window.Cesium.PolygonHierarchy(raisedPositions),
          material: window.Cesium.Color.fromBytes(0, 255, 0, 255), // max-bright green, fully opaque
          outline: true,
          outlineColor: window.Cesium.Color.fromBytes(255, 255, 255, 255), // solid white outline
          outlineWidth: 3.5,
          heightReference: window.Cesium.HeightReference.NONE,
          perPositionHeight: true,
          classificationType: window.Cesium.ClassificationType.BOTH,
          zIndex: 999999,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
        name: 'Turn Path Envelope (derived polygon)',
      properties: {
        category: 'turn_path_envelope',
        turn_layer: 'vehicle_envelope',
      },
    });
      entities.push(entity);
    } catch (e) {
      console.warn('[Turn Path] Failed to create derived polygon envelope:', e);
    }
  };

  const drawSafePathPolyline = (viewer, path, entities) => {
    if (!path) return;

    const lineWkt = chooseCenterlineWkt(path);
    if (!lineWkt || typeof lineWkt !== 'string') {
      console.warn('[Turn Path] no centreline WKT to draw', path);
      return;
    }

    const match = lineWkt.match(/LINESTRING\s*\((.+)\)/i);
    if (!match) {
      console.warn('[Turn Path] centreline WKT is not a LINESTRING:', lineWkt.slice(0, 120));
      return;
    }

    const coords = [];
    for (const pair of match[1].split(',')) {
      const parts = pair.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) continue;
      coords.push(lon, lat);
    }

    if (coords.length < 2) {
      console.warn('[Turn Path] centreline coords too short');
      return;
    }

    const positions = safeDegreesArrayToPositions(coords, 'path_polyline');
    if (!positionsAreFinite(positions, 'path_polyline')) return;
    const simplified = simplifyPositions(positions, 0.1);
    if (!simplified || simplified.length < 2) return;

    try {
      const entity = viewer.entities.add({
        polyline: {
          positions: simplified,
          width: 3,
          material: window.Cesium.Color.CYAN.withAlpha(0.9),
          clampToGround: true,
          zIndex: 400,
        },
        name: 'Turn Path Centreline',
        properties: {
          category: 'turn_path_centreline',
          turn_layer: 'path',
        },
      });
      entities.push(entity);
    } catch (e) {
      console.error('[Turn Path] Failed to create centreline entity:', e);
    }
  };


  // Render the computed path
  const renderPath = (pathData) => {
    if (!cesiumViewerRef.current || !pathData) return;

    // Aggressively clear old entities first
    clearPathEntities();

    const viewer = cesiumViewerRef.current;
    const entities = [];
    pathEntitiesRef.current = entities;

    const { status, path, clearance } = pathData;
    if (status !== 'ok') return;

    // Skip centreline; only draw derived envelope polygon
    drawVehicleCorridorFromCenterline(viewer, path, clearance, entities);

    if (entities.length > 0) {
      try {
        viewer.flyTo(entities, {
          duration: 1.5,
          offset: new window.Cesium.HeadingPitchRange(
            window.Cesium.Math.toRadians(0),
            window.Cesium.Math.toRadians(-90),
            0
          ),
        });
      } catch (e) {
        console.warn('[Turn Path] Error flying to entities:', e);
      }
    }
  };

  // Effect to render computed path
  useEffect(() => {
    if (computedPath) {
      renderPath(computedPath);
    } else {
      clearPathEntities();
    }
  }, [computedPath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPathEntities();
    };
  }, []);

  return {
    isDialogOpen,
    currentStep,
    getCurrentStep,
    getSelectedSourceRoad,
    vehicleProfiles,
    selectedSourceRoad,
    selectedDestinationRoad,
    computedPath,
    warning,
    openDialog,
    closeDialog,
    startSelection,
    handleMapClick,
    resetSelection,
  };
}
