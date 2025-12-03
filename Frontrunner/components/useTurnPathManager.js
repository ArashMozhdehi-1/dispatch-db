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
      'end_location_name'
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

  // Load vehicle profiles on mount
  useEffect(() => {
    fetch('/api/vehicle-profiles')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok') {
          setVehicleProfiles(data.profiles);
        }
      })
      .catch(err => console.error('Failed to load vehicle profiles:', err));
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
  }, [isDialogOpen, computedPath]);

  // Handle road click during selection
  const handleMapClick = useCallback((clickedEntity) => {
    const step = currentStepRef.current;
    console.log('[Turn Path] handleMapClick called:', {
      currentStep: step,
      hasEntity: !!clickedEntity,
      hasViewer: !!cesiumViewerRef.current
    });

    if (!cesiumViewerRef.current || !clickedEntity) {
      console.log('[Turn Path] Missing viewer or entity');
      return;
    }

    const category = clickedEntity.properties?.category?.getValue?.() || clickedEntity.properties?.category;
    const roadName = clickedEntity.properties?.name?.getValue?.() || clickedEntity.properties?.name;
    const roadId = clickedEntity.properties?.road_id?.getValue?.() || clickedEntity.properties?.road_id;

    console.log('[Turn Path] Entity properties:', {
      category,
      roadName,
      roadId,
      hasPolygon: !!clickedEntity.polygon
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
        clickedEntity._originalMaterial = clickedEntity._originalMaterial || clickedEntity.polygon.material;
        clickedEntity.polygon.material = window.Cesium.Color.GREEN.withAlpha(0.5);
      } else if (clickedEntity.polyline) {
        clickedEntity._originalMaterial = clickedEntity._originalMaterial || clickedEntity.polyline.material;
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
      const newDestination = { name: roadName, road_id: roadId, entity: clickedEntity, connections };
      setSelectedDestinationRoad(newDestination);

      if (clickedEntity.polygon) {
        clickedEntity._originalMaterial = clickedEntity._originalMaterial || clickedEntity.polygon.material;
        clickedEntity.polygon.material = window.Cesium.Color.RED.withAlpha(0.5);
      } else if (clickedEntity.polyline) {
        clickedEntity._originalMaterial = clickedEntity._originalMaterial || clickedEntity.polyline.material;
        clickedEntity.polyline.material = window.Cesium.Color.RED;
      }

      computeTurnPath(sourceRoad, newDestination);
    }
  }, [cesiumViewerRef]);

  // Compute turn path via API
  const computeTurnPath = async (source, destination) => {
    const config = pathConfigRef.current;
    if (!config || !source || !destination) {
      console.error('[Turn Path] Missing required data for computation', { config, source, destination });
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
        alert('No shared intersection found between these roads. Please select roads that connect at an intersection.');
        resetSelection();
        return;
      }

      console.log('[Turn Path] Computing path:', {
        from: source.road_id,
        to: destination.road_id,
        intersection: intersection.name
      });

      const payload = {
        from_road_id: source.road_id,
        to_road_id: destination.road_id,
        intersection_name: intersection.name,
        ...config
      };

      if (intersection.from_marker_oid && intersection.to_marker_oid) {
        payload.from_marker_oid = intersection.from_marker_oid;
        payload.to_marker_oid = intersection.to_marker_oid;
      }

      const response = await fetch('/api/turn-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.status === 'ok') {
        console.log('[Turn Path] Path computed successfully:', result);
        setComputedPath(result);

        const clearanceMsg = result.clearance.vehicle_envelope_ok
          ? '✅ Vehicle clearance OK'
          : `⚠️ Vehicle extends ${result.clearance.outside_area_sqm.toFixed(1)} m² outside intersection`;
        console.log(`[Turn Path] length=${result.path.length_m.toFixed(1)}m, type=${result.path.path_type}, ${clearanceMsg}`);

        setCurrentStep('showing_path');
        setIsDialogOpen(false);
      } else {
        console.error('[Turn Path] Path computation failed:', result.error);
        alert(`Failed to compute path: ${result.error}`);
        resetSelection();
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error('[Turn Path] Error computing path:', error);
      alert(`Error: ${error.message}`);
      resetSelection();
      setIsDialogOpen(false);
    }
  };

  // Find shared intersection between two roads
  const findSharedIntersection = async (roadId1, roadId2) => {
    try {
      const response = await fetch('/api/map-locations-from-dump');
      const data = await response.json();
      
      // Find side-center markers for both roads
      const markers = data.consolidated_locations?.filter(loc => 
        loc.type === 'road_corner_side_center' &&
        loc.road_marker_metadata
      ) || [];

      const idsEqual = (a, b) => String(a) === String(b);

      const road1Markers = markers.filter(m => 
        m.road_marker_metadata && idsEqual(m.road_marker_metadata.road_id, roadId1)
      );
      const road2Markers = markers.filter(m => 
        m.road_marker_metadata && idsEqual(m.road_marker_metadata.road_id, roadId2)
      );

      console.log('[Turn Path] findSharedIntersection markers:', {
        roadId1,
        roadId2,
        road1Markers: road1Markers.length,
        road2Markers: road2Markers.length
      });

      // Find common intersection
      for (const m1 of road1Markers) {
        for (const m2 of road2Markers) {
          const int1 = m1.road_marker_metadata.overlapping_entity_name || m1.road_marker_metadata.best_overlap_entity;
          const int2 = m2.road_marker_metadata.overlapping_entity_name || m2.road_marker_metadata.best_overlap_entity;
          
          if (int1 && int2 && int1 === int2) {
            return { 
              name: int1,
              from_marker_oid: m1._oid_,
              to_marker_oid: m2._oid_
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

  // Render computed path on Cesium map
  // Reset selection state
  const resetSelection = () => {
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
    setCurrentStep('profile');
  };

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
    // Keep dialog state as open, but dialog won't render during selection steps
    // (it checks currentStep internally)
  };

  return {
    isDialogOpen,
    currentStep,
    getCurrentStep,
    getSelectedSourceRoad,
    vehicleProfiles,
    selectedSourceRoad,
    selectedDestinationRoad,
    computedPath,
    openDialog,
    closeDialog,
    startSelection,
    handleMapClick,
    resetSelection
  };
}

