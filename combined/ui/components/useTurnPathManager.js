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
        if (isDialogOpen) {
          closeDialog();
        } else if (computedPath) {
          resetSelection();
        }
      }
    };

    if (isDialogOpen || computedPath) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isDialogOpen, computedPath]); // resetSelection closed over safely

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
        console.log('[Turn Path] Source already selected');
        return;
      }

      const Cesium = window.Cesium;

      // Extract road/segment IDs
      const roadId =
        getEntityProperty(clickedEntity, 'road_oid') ||
        getEntityProperty(clickedEntity, 'road_id') ||
        getEntityProperty(clickedEntity, 'roadId') ||
        getEntityProperty(clickedEntity, 'road_oid_int') ||
        getEntityProperty(clickedEntity, 'roadOid');

      const segmentId =
        getEntityProperty(clickedEntity, 'segment_id') ||
        getEntityProperty(clickedEntity, 'lane_id') ||
        getEntityProperty(clickedEntity, 'parent_lane_id');

      const name =
        getEntityProperty(clickedEntity, 'road_name') ||
        getEntityProperty(clickedEntity, 'name') ||
        `road_${roadId}`;

      if (!roadId) {
        console.log('[Turn Path] Clicked entity has no road_id');
        return;
      }

      // If selecting source
      if (step === 'selecting_source') {
        highlightEntities(clickedEntity, Cesium.Color.GREEN);
        selectedSourceRoadRef.current = {
          road_id: roadId,
          segment_id: segmentId,
          name,
          entity: clickedEntity,
          connections: extractRoadConnections(clickedEntity),
        };
        setSelectedSourceRoad(selectedSourceRoadRef.current);
        setCurrentStep('selecting_destination');
        return;
      }

      // If selecting destination
      if (step === 'selecting_destination') {
        // prevent same road
        if (String(roadId) === String(selectedSourceRoadRef.current?.road_id)) {
          alert('Please pick a different road as destination.');
          return;
        }

        highlightEntities(clickedEntity, Cesium.Color.RED);
        selectedDestinationRoadRef.current = {
          road_id: roadId,
          segment_id: segmentId,
          name,
          entity: clickedEntity,
          connections: extractRoadConnections(clickedEntity),
        };
        setSelectedDestinationRoad(selectedDestinationRoadRef.current);

        // Compute
        computeTurnPath(selectedSourceRoadRef.current, selectedDestinationRoadRef.current);
      }
    },
    [computeTurnPath]
  );

  const highlightEntities = (entity, color) => {
    const Cesium = window.Cesium;
    const apply = (ent) => {
      if (ent.polygon) {
        if (!ent._originalMaterial) ent._originalMaterial = ent.polygon.material;
        ent.polygon.material = color.withAlpha(0.25);
        ent.polygon.outline = true;
        ent.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.9);
      }
      if (ent.polyline) {
        if (!ent._originalMaterial) ent._originalMaterial = ent.polyline.material;
        if (!ent._originalWidth) ent._originalWidth = ent.polyline.width;
        ent.polyline.material = color.withAlpha(0.9);
        ent.polyline.width = (ent.polyline.width || 2) * 1.6;
      }
      if (ent.corridor) {
        if (!ent._originalMaterial) ent._originalMaterial = ent.corridor.material;
        ent.corridor.material = color.withAlpha(0.35);
        ent.corridor.outlineColor = Cesium.Color.WHITE.withAlpha(0.8);
      }
    };

    if (entity._sourceForTurnPath) {
      // already processed
      apply(entity);
      return;
    }

    apply(entity);
    entity._sourceForTurnPath = true;
  };

  const openDialog = () => {
    setIsDialogOpen(true);
    setCurrentStep('profile');
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    if (currentStep !== 'showing_path') {
      resetSelection();
    }
  };

  const startSelection = (config) => {
    console.log('[Turn Path] startSelection called with config:', config);
    setPathConfig(config);
    setIsDialogOpen(false);
    setCurrentStep('selecting_source');
  };

  return {
    // dialog
    isDialogOpen,
    openDialog,
    closeDialog,
    startSelection,
    currentStep,
    getCurrentStep,
    // selection
    selectedSourceRoad,
    selectedDestinationRoad,
    getSelectedSourceRoad,
    getSelectedDestinationRoad,
    handleMapClick,
    // data
    vehicleProfiles,
    // path
    computedPath,
    warning,
    resetSelection,
  };
}


