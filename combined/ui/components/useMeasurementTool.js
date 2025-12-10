import { useState, useRef, useCallback, useEffect } from 'react';

// Copied from Frontrunner to keep measurement behavior identical
export const useMeasurementTool = (cesiumViewerRef) => {
  const [measurementMode, setMeasurementMode] = useState(null);
  const [measurementPoints, setMeasurementPoints] = useState([]);

  const measurementEntitiesRef = useRef([]);
  const overlayEntitiesRef = useRef([]);

  const previewLineEntityRef = useRef(null);
  const previewLabelEntityRef = useRef(null);

  const measurementModeRef = useRef(measurementMode);
  const measurementPointsRef = useRef(measurementPoints);

  const areaLockedRef = useRef(false);

  useEffect(() => {
    measurementModeRef.current = measurementMode;
  }, [measurementMode]);

  useEffect(() => {
    measurementPointsRef.current = measurementPoints;
  }, [measurementPoints]);

  const setCanvasTooltip = useCallback((text) => {
    const viewer = cesiumViewerRef.current;
    if (!viewer || !viewer.cesiumWidget) return;
    viewer.cesiumWidget.container.title = text || '';
  }, [cesiumViewerRef]);

  const removePreviewEntities = useCallback((viewer) => {
    if (!viewer) return;
    const refs = [previewLineEntityRef, previewLabelEntityRef];
    refs.forEach(ref => {
      if (ref.current) {
        try {
          viewer.entities.remove(ref.current);
        } catch (err) {
          console.warn('[Measurement] Failed to remove preview entity', err);
        }
        ref.current = null;
      }
    });
    setCanvasTooltip('');
    if (viewer.scene) viewer.scene.requestRender();
  }, [setCanvasTooltip]);

  const clearMeasurements = useCallback(() => {
    const viewer = cesiumViewerRef.current;
    if (viewer) {
      removePreviewEntities(viewer);

      overlayEntitiesRef.current.forEach(e => {
        try { viewer.entities.remove(e); } catch (err) {
          console.warn('[Measurement] Failed to remove overlay entity', err);
        }
      });
      overlayEntitiesRef.current = [];

      measurementEntitiesRef.current.forEach(e => {
        try { viewer.entities.remove(e); } catch (err) {
          console.warn('[Measurement] Failed to remove entity', err);
        }
      });
      measurementEntitiesRef.current = [];

      setCanvasTooltip('');
      if (viewer.scene) viewer.scene.requestRender();
    }
    measurementPointsRef.current = [];
    setMeasurementPoints([]);
    areaLockedRef.current = false;
  }, [cesiumViewerRef, removePreviewEntities, setCanvasTooltip]);

  const startMeasurement = useCallback((mode) => {
    clearMeasurements();
    areaLockedRef.current = false;
    measurementModeRef.current = mode;
    setMeasurementMode(mode);
    measurementPointsRef.current = [];
    setMeasurementPoints([]);
  }, [clearMeasurements]);

  const cancelMeasurement = useCallback(() => {
    const viewer = cesiumViewerRef.current;
    if (viewer) {
      removePreviewEntities(viewer);
      setCanvasTooltip('');
    }
    clearMeasurements();
    measurementModeRef.current = null;
    setMeasurementMode(null);
    areaLockedRef.current = false;

    if (viewer && viewer.scene) {
      viewer.scene.requestRender();
      setTimeout(() => {
        if (viewer && viewer.scene) viewer.scene.requestRender();
      }, 50);
    }
  }, [clearMeasurements, removePreviewEntities, setCanvasTooltip]);

  const addMeasurementPoint = useCallback((cartesian) => {
    const viewer = cesiumViewerRef.current;
    if (!viewer || !window?.Cesium || !cartesian) return;

    if (areaLockedRef.current) return;

    const currentMode = measurementModeRef.current;
    if (!currentMode) return;

    const cartographic = window.Cesium.Cartographic.fromCartesian(cartesian);
    const longitude = window.Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = window.Cesium.Math.toDegrees(cartographic.latitude);

    const newPoint = { cartesian, longitude, latitude };

    setMeasurementPoints(prev => {
      const newPoints = [...prev, newPoint];

      if (currentMode === 'distance' && newPoints.length > 2) return prev;

      measurementPointsRef.current = newPoints;

      const pointEntity = viewer.entities.add({
        position: cartesian,
        point: {
          pixelSize: 14,
          color: window.Cesium.Color.WHITE,
          outlineColor: window.Cesium.Color.CYAN,
          outlineWidth: 4,
          heightReference: window.Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      });
      measurementEntitiesRef.current.push(pointEntity);

      if (viewer.scene) viewer.scene.requestRender();

      if (newPoints.length > 1) {
        overlayEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch (err) {
            console.warn('[Measurement] Failed to remove overlay entity', err);
          }
        });
        overlayEntitiesRef.current = [];

        const positions = newPoints.map(p => p.cartesian);

        if (currentMode === 'distance' && newPoints.length === 2) {
          removePreviewEntities(viewer);

          const lineEntity = viewer.entities.add({
            polyline: {
              positions,
              width: 4,
              material: window.Cesium.Color.WHITE,
              clampToGround: true,
            }
          });
          measurementEntitiesRef.current.push(lineEntity);
          overlayEntitiesRef.current.push(lineEntity);

          const ellipsoid = viewer.scene.globe.ellipsoid;
          const c1 = ellipsoid.cartesianToCartographic(positions[0]);
          const c2 = ellipsoid.cartesianToCartographic(positions[1]);
          const geodesic = new window.Cesium.EllipsoidGeodesic(c1, c2);
          const distanceMeters = geodesic.surfaceDistance;
          const distanceFeet = distanceMeters * 3.28084;

          if (!Number.isFinite(distanceMeters) || distanceMeters < 0.01) {
            try { viewer.entities.remove(lineEntity); } catch (_) {}
            measurementEntitiesRef.current.pop();
            overlayEntitiesRef.current.pop();
            const dupPoint = measurementEntitiesRef.current.pop();
            if (dupPoint) {
              try { viewer.entities.remove(dupPoint); } catch (_) {}
            }
            measurementPointsRef.current = [newPoints[0]];
            setMeasurementPoints([newPoints[0]]);
            setCanvasTooltip('Pick a different point');
            if (viewer.scene) viewer.scene.requestRender();
            return [newPoints[0]];
          }

          const metersText = `${distanceMeters.toFixed(2)} m`;
          const feetText = `${distanceFeet.toFixed(2)} ft`;
          const tooltipText = `📏 ${metersText} (${feetText})`;

          const bearing = window.Cesium.Math.toDegrees(geodesic.startHeading);
          const normalizedBearing = bearing < 0 ? bearing + 360 : bearing;
          const rotationAngle =
            normalizedBearing > 90 && normalizedBearing < 270
              ? normalizedBearing - 180
              : normalizedBearing;
          const rotationRadians = window.Cesium.Math.toRadians(rotationAngle);

          const mid = window.Cesium.Cartesian3.lerp(
            positions[0],
            positions[1],
            0.5,
            new window.Cesium.Cartesian3()
          );

          const metersLabelEntity = viewer.entities.add({
            position: mid,
            label: {
              text: metersText,
              font: '22px bold "Arial", sans-serif',
              fillColor: window.Cesium.Color.YELLOW,
              outlineColor: window.Cesium.Color.BLACK,
              outlineWidth: 5,
              style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: window.Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: window.Cesium.HorizontalOrigin.CENTER,
              pixelOffset: new window.Cesium.Cartesian2(0, -30),
              rotation: rotationRadians,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          });

          const feetLabelEntity = viewer.entities.add({
            position: mid,
            label: {
              text: feetText,
              font: '22px bold "Arial", sans-serif',
              fillColor: window.Cesium.Color.WHITE,
              outlineColor: window.Cesium.Color.BLACK,
              outlineWidth: 5,
              style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: window.Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: window.Cesium.HorizontalOrigin.CENTER,
              pixelOffset: new window.Cesium.Cartesian2(0, 30),
              rotation: rotationRadians,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          });

          measurementEntitiesRef.current.push(metersLabelEntity, feetLabelEntity);
          overlayEntitiesRef.current.push(metersLabelEntity, feetLabelEntity);

          setCanvasTooltip(tooltipText);

          areaLockedRef.current = true;
          measurementModeRef.current = null;
          setMeasurementMode(null);

          if (viewer.scene) {
            viewer.scene.requestRender();
            setTimeout(() => {
              if (viewer.scene) viewer.scene.requestRender();
            }, 50);
          }
        }

        else if (currentMode === 'area' && newPoints.length >= 2) {
          const polygonEntity = viewer.entities.add({
            polygon: {
              hierarchy: new window.Cesium.PolygonHierarchy(positions),
              material: window.Cesium.Color.YELLOW.withAlpha(0.3),
              outline: true,
              outlineColor: window.Cesium.Color.YELLOW,
              outlineWidth: 3,
            }
          });
          measurementEntitiesRef.current.push(polygonEntity);
          overlayEntitiesRef.current.push(polygonEntity);

          if (viewer.scene) viewer.scene.requestRender();
        }
      }

      viewer.scene?.requestRender();
      return newPoints;
    });
  }, [cesiumViewerRef, removePreviewEntities, setCanvasTooltip]);

  const updatePreviewLine = useCallback((cursorCartesian) => {
    const viewer = cesiumViewerRef.current;
    if (!viewer || !window?.Cesium) {
      if (viewer) removePreviewEntities(viewer);
      return;
    }

    if (areaLockedRef.current) {
      removePreviewEntities(viewer);
      return;
    }

    if (!cursorCartesian) {
      removePreviewEntities(viewer);
      return;
    }

    const currentMode = measurementModeRef.current;
    const points = measurementPointsRef.current;

    if (currentMode !== 'distance' || points.length !== 1) {
      removePreviewEntities(viewer);
      return;
    }

    const firstPoint = points[0].cartesian;

    removePreviewEntities(viewer);

    previewLineEntityRef.current = viewer.entities.add({
      polyline: {
        positions: [firstPoint, cursorCartesian],
        width: 3,
        material: window.Cesium.Color.YELLOW.withAlpha(0.8),
        clampToGround: true,
      }
    });

    const ellipsoid = viewer.scene.globe.ellipsoid;
    const c1 = ellipsoid.cartesianToCartographic(firstPoint);
    const c2 = ellipsoid.cartesianToCartographic(cursorCartesian);
    const geodesic = new window.Cesium.EllipsoidGeodesic(c1, c2);
    const distanceMeters = geodesic.surfaceDistance;
    const distanceFeet = distanceMeters * 3.28084;

    const text = `${distanceMeters.toFixed(2)} m (${distanceFeet.toFixed(2)} ft)`;

    const mid = window.Cesium.Cartesian3.lerp(
      firstPoint,
      cursorCartesian,
      0.5,
      new window.Cesium.Cartesian3()
    );

    previewLabelEntityRef.current = viewer.entities.add({
      position: mid,
      label: {
        text,
        font: '20px bold "Arial", sans-serif',
        fillColor: window.Cesium.Color.YELLOW,
        outlineColor: window.Cesium.Color.BLACK,
        outlineWidth: 4,
        style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: window.Cesium.VerticalOrigin.CENTER,
        pixelOffset: new window.Cesium.Cartesian2(0, -25),
        backgroundColor: window.Cesium.Color.BLACK.withAlpha(0.9),
        backgroundPadding: new window.Cesium.Cartesian2(10, 6),
        showBackground: true,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }
    });

    setCanvasTooltip(`Distance: ${text}`);
    viewer.scene?.requestRender();
  }, [cesiumViewerRef, removePreviewEntities, setCanvasTooltip]);

  const finalizeAreaMeasurement = useCallback(() => {
    const viewer = cesiumViewerRef.current;
    if (!viewer || !window?.Cesium) return;

    const currentMode = measurementModeRef.current;
    if (currentMode !== 'area') return;

    const points = measurementPointsRef.current;
    if (!points || points.length < 3) return;

    removePreviewEntities(viewer);

    const positions = points.map(p => p.cartesian);

    const coords = points.map(p => [p.longitude, p.latitude]);
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      area += coords[i][0] * coords[j][1];
      area -= coords[j][0] * coords[i][1];
    }
    area = Math.abs(area / 2);
    const metersPerDegree = 111320;
    const areaM2 = area * metersPerDegree * metersPerDegree;
    const areaFt2 = areaM2 * 10.7639;

    const centroid = window.Cesium.BoundingSphere.fromPoints(positions).center;

    const areaLabel = viewer.entities.add({
      position: centroid,
      label: {
        text: `${areaM2.toFixed(2)} m²\n${areaFt2.toFixed(2)} ft²`,
        font: '22px bold "Arial", sans-serif',
        fillColor: window.Cesium.Color.YELLOW,
        outlineColor: window.Cesium.Color.BLACK,
        outlineWidth: 5,
        style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: window.Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: window.Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }
    });
    measurementEntitiesRef.current.push(areaLabel);
    overlayEntitiesRef.current.push(areaLabel);

    setCanvasTooltip(`Area: ${areaM2.toFixed(2)} m² (${areaFt2.toFixed(2)} ft²)`);

    areaLockedRef.current = true;
    measurementModeRef.current = null;
    setMeasurementMode(null);

    viewer.scene?.requestRender();
  }, [cesiumViewerRef, removePreviewEntities, setCanvasTooltip]);

  const getMeasurementMode = useCallback(() => measurementModeRef.current, []);

  return {
    measurementMode,
    measurementPoints,
    startMeasurement,
    cancelMeasurement,
    addMeasurementPoint,
    clearMeasurements,
    getMeasurementMode,
    updatePreviewLine,
    finalizeAreaMeasurement,
  };
};

export default useMeasurementTool;

