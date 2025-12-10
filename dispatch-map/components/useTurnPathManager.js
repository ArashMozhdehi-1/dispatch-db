import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for managing turn path computation workflow
 * Handles state, road selection, API calls, and path rendering
 */
export default function useTurnPathManager(cesiumViewerRef, centerPoints = []) {
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
  const selectedDestinationRoadRef = useRef(selectedDestinationRoad);
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
    selectedDestinationRoadRef.current = selectedDestinationRoad;
  }, [selectedDestinationRoad]);

  useEffect(() => {
    pathConfigRef.current = pathConfig;
  }, [pathConfig]);

  const getCurrentStep = () => currentStepRef.current;
  const getSelectedSourceRoad = () => selectedSourceRoadRef.current;
  const getSelectedDestinationRoad = () => selectedDestinationRoadRef.current;

  // Reset selection state (Fixed: Initialized before use)
  // Reset selection state (use refs so Cesium handlers always see latest selection)
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
        if (entity._originalWidth) {
          entity.polyline.width = entity._originalWidth;
          delete entity._originalWidth;
        }
      } else if (entity.corridor) {
        if (entity._originalMaterial) {
          entity.corridor.material = entity._originalMaterial;
          delete entity._originalMaterial;
        }
      }
    };

    const restoreAll = (selection) => {
      if (!selection) return;
      if (Array.isArray(selection.entities)) {
        selection.entities.forEach(restoreEntityMaterial);
      } else if (selection.entity) {
        restoreEntityMaterial(selection.entity);
      }
    };

    // Use refs to ensure we restore whatever is currently selected
    restoreAll(selectedSourceRoadRef.current);
    restoreAll(selectedDestinationRoadRef.current);

    selectedSourceRoadRef.current = null;
    setSelectedSourceRoad(null);
    setSelectedDestinationRoad(null);
    setComputedPath(null);
    setWarning(null);
    setCurrentStep('profile');
  }, []);

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
  const findSharedIntersection = async (roadId1, roadId2, segId1, segId2) => {
    const idsEqual = (a, b) => String(a) === String(b);
    const r1 = String(roadId1);
    const r2 = String(roadId2);

    // Use intersection_center_points only (map_locations table missing)
    const tryCenterPoints = async () => {
      const res = await fetch('/api/intersection_center_points');
      if (!res.ok) return null;
      const rows = await res.json();
      const byRoad = rows.reduce((acc, row) => {
        const key = String(row.road_id);
        acc[key] = acc[key] || [];
        acc[key].push(row);
        return acc;
      }, {});
      const list1 = byRoad[r1] || [];
      const list2 = byRoad[r2] || [];

      // Prefer exact shared intersection_id, bias to matching segment_id
      let best = null;
      let bestScore = -1;
      const score = (row, selSeg) =>
        row.segment_id && selSeg && idsEqual(row.segment_id, selSeg) ? 2 : 1;
      for (const a of list1) {
        for (const b of list2) {
          if (a.intersection_id !== b.intersection_id) continue;
          const s = score(a, segId1) + score(b, segId2);
          if (s > bestScore) {
            bestScore = s;
            best = {
              name: a.intersection_name || `intersection_${a.intersection_id}`,
              intersection_id: a.intersection_id,
            };
          }
        }
      }
      if (best) return best;

      // Fallback: most common intersection from either list
      const pickFallback = (list) => {
        if (!list.length) return null;
        const counts = list.reduce((acc, row) => {
          acc[row.intersection_id] = (acc[row.intersection_id] || 0) + 1;
          return acc;
        }, {});
        const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const row = list.find((r) => String(r.intersection_id) === String(topId));
        return row
          ? { name: row.intersection_name || `intersection_${row.intersection_id}`, intersection_id: row.intersection_id }
          : null;
      };
      return pickFallback(list1) || pickFallback(list2) || null;
    };

    try {
      return await tryCenterPoints();
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

  // Helper: find nearest center point for a given road_id
  const getNearestCenterPoint = useCallback(
    (roadId) => {
      if (!centerPoints || centerPoints.length === 0) return null;
      if (roadId != null) {
        const matches = centerPoints.filter((p) => String(p.road_id) === String(roadId));
        if (matches.length > 0) return matches[0];
      }
      // Fallback: return first available center point to avoid nulls
      return centerPoints[0];
    },
    [centerPoints]
  );

  // Helper: simple haversine distance in meters
  const haversineMeters = (lon1, lat1, lon2, lat2) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
        let intersection = await findSharedIntersection(
          source.road_id,
          destination.road_id,
          source.segment_id,
          destination.segment_id
        );

        if (!intersection) {
          const sharedEndpoint = findSharedEndpointFromSelections(source, destination);
          if (sharedEndpoint) {
            intersection = { name: sharedEndpoint };
          }
        }

        if (!intersection) {
          console.warn('[Turn Path] No shared intersection; proceeding without intersection name');
          intersection = { name: null };
        }

        console.log('[Turn Path] Computing path:', {
          from: source.road_id,
          to: destination.road_id,
          intersection: intersection.name,
        });

        const payload = {
          from_road_id: source.road_id,
          to_road_id: destination.road_id,
          intersection_name: intersection.name || 'unknown_intersection',
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
    [resetSelection, centerPoints, getNearestCenterPoint]
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

      // If we already have a source and we're still in selecting_source, block double-click
      if (step === 'selecting_source' && selectedSourceRoadRef.current) {
        console.log('[Turn Path] Source already selected, waiting for destination');
        setCurrentStep('selecting_destination');
        return;
      }

      const getProp = (key) =>
        clickedEntity.properties?.[key]?.getValue?.() ?? clickedEntity.properties?.[key];

      const category = getProp('category');
      const roadNameRaw =
        getProp('name') ||
        getProp('road_name') ||
        getProp('display_name') ||
        getProp('roadName');
      const rawRoadId =
        getProp('road_id') ??
        getProp('roadId') ??
        getProp('road_oid') ??
        getProp('road_oid_int') ??
        getProp('roadOid');
      const laneId =
        getProp('lane_id') ??
        getProp('laneId');
      const parentLaneId =
        getProp('parent_lane_id') ??
        getProp('parentLaneId');
      let derivedRoadId = null;
      if (!rawRoadId && laneId && typeof laneId === 'string') {
        const m = laneId.match(/road[_-]?(\d+)/i);
        if (m && m[1]) derivedRoadId = m[1];
      }
      const logicalRoadId = rawRoadId ?? parentLaneId ?? laneId ?? derivedRoadId;
      const segmentId =
        getProp('segment_id') ??
        getProp('segmentId') ??
        getProp('_oid_') ??
        getProp('oid') ??
        getProp('id');

      console.log('[Turn Path] Entity properties:', {
        category,
        roadName: roadNameRaw,
        rawRoadId,
        laneId,
        parentLaneId,
        logicalRoadId,
        hasPolygon: !!clickedEntity.polygon,
        hasPolyline: !!clickedEntity.polyline,
        hasCorridor: !!clickedEntity.corridor,
      });

      const categoryLower = category ? category.toString().toLowerCase() : '';
      const isRoadLike =
        categoryLower.includes('road') || categoryLower.includes('dispatch_segment') || categoryLower.includes('segment');

      if (!isRoadLike || !logicalRoadId) {
        console.log('[Turn Path] Clicked entity is not a road or missing logicalRoadId, ignoring');
        return;
      }

      const viewer = cesiumViewerRef.current;
      const allEntities = viewer?.entities?.values || [];
      const getEntityGroupId = (ent) => {
        const props = ent.properties;
        if (!props) return null;
        const getVal = (key) => {
          const v = props[key];
          return v && typeof v.getValue === 'function' ? v.getValue() : v;
        };
        const entRawRoadId =
          getVal('road_id') ??
          getVal('roadId') ??
          getVal('road_oid') ??
          getVal('road_oid_int') ??
          getVal('roadOid') ??
          getVal('rawRoadId') ??
          getVal('rawRoadID');
        const entParentLaneId =
          getVal('parent_lane_id') ??
          getVal('parentLaneId');
        const entLaneId =
          getVal('lane_id') ??
          getVal('laneId');
        return entRawRoadId ?? entParentLaneId ?? entLaneId ?? null;
      };

      const matchingEntities = allEntities.filter((ent) => {
        const matchId = getEntityGroupId(ent);
        return matchId && logicalRoadId && String(matchId) === String(logicalRoadId);
      });
      console.log('[Turn Path] Matching entities count:', matchingEntities.length);

      const highlightEntities = (entities, color) => {
        entities.forEach((ent) => {
          if (ent.polygon) {
            ent._originalMaterial = ent._originalMaterial || ent.polygon.material;
            ent.polygon.material = color.withAlpha(0.5);
            ent.polygon.outline = true;
            ent.polygon.outlineColor = window.Cesium.Color.WHITE.withAlpha(0.8);
            ent.polygon.outlineWidth = 1.5;
          } else if (ent.corridor) {
            ent._originalMaterial = ent._originalMaterial || ent.corridor.material;
            ent.corridor.material = color.withAlpha(0.5);
            ent.corridor.outline = true;
            ent.corridor.outlineColor = window.Cesium.Color.WHITE.withAlpha(0.8);
            ent.corridor.outlineWidth = 1.5;
          } else if (ent.polyline) {
            ent._originalMaterial = ent._originalMaterial || ent.polyline.material;
            ent._originalWidth = ent._originalWidth || ent.polyline.width;
            ent.polyline.material = color.withAlpha(0.9);
            ent.polyline.width = Math.max(ent.polyline.width || 1, 8);
          }
        });
      };

      if (step === 'selecting_source') {
        console.log('[Turn Path] Selected source road:', roadNameRaw, logicalRoadId);

        const connections = extractRoadConnections(clickedEntity);
        const newSource = {
          name: roadNameRaw || `Road ${logicalRoadId}`,
          road_id: logicalRoadId,
          raw_road_id: rawRoadId || null,
          lane_id: laneId || null,
          parent_lane_id: parentLaneId || null,
          segment_id: segmentId,
          entity: clickedEntity,
          entities: matchingEntities.length ? matchingEntities : [clickedEntity],
          connections,
          center_point: getNearestCenterPoint(logicalRoadId),
        };

        selectedSourceRoadRef.current = newSource;
        setSelectedSourceRoad(newSource);

        highlightEntities(newSource.entities, window.Cesium.Color.GREEN);

        setCurrentStep('selecting_destination');
      } else if (step === 'selecting_destination') {
        const sourceRoad = selectedSourceRoadRef.current;
        if (sourceRoad && String(sourceRoad.road_id) === String(logicalRoadId)) {
          console.log('[Turn Path] Cannot select same road as source and destination');
          return;
        }

        console.log('[Turn Path] Selected destination road:', roadNameRaw, logicalRoadId);

        const connections = extractRoadConnections(clickedEntity);
        const newDestination = {
          name: roadNameRaw || `Road ${logicalRoadId}`,
          road_id: logicalRoadId,
          raw_road_id: rawRoadId || null,
          lane_id: laneId || null,
          parent_lane_id: parentLaneId || null,
          segment_id: segmentId,
          entity: clickedEntity,
          entities: matchingEntities.length ? matchingEntities : [clickedEntity],
          connections,
          center_point: getNearestCenterPoint(logicalRoadId),
        };

        setSelectedDestinationRoad(newDestination);

        highlightEntities(newDestination.entities, window.Cesium.Color.RED);

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
    const widthMeters = Math.max(2.0, (clearance?.vehicle_width_with_buffer_m || 8.0) * 0.6); // tighter to keep inside road
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
          material: window.Cesium.Color.GREEN.withAlpha(0.65),
          outline: true,
          outlineColor: window.Cesium.Color.WHITE.withAlpha(0.9),
          outlineWidth: 2.5,
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
