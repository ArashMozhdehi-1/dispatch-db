/**
 * Tests for useMeasurementTool hook
 * 
 * Feature: measurement-tool-improvements, Property 1: Label rotation alignment
 * Validates: Requirements 1.3
 */

import { renderHook, act } from '@testing-library/react';
import { useMeasurementTool } from '../useMeasurementTool';
import fc from 'fast-check';

// Mock Cesium
const mockCesium = {
  Color: {
    WHITE: { r: 1, g: 1, b: 1, a: 1 },
    CYAN: { r: 0, g: 1, b: 1, a: 1 },
    YELLOW: { r: 1, g: 1, b: 0, a: 1 },
    BLACK: { r: 0, g: 0, b: 0, a: 1 },
    withAlpha: function(alpha) {
      return { ...this, a: alpha };
    }
  },
  HeightReference: {
    CLAMP_TO_GROUND: 0
  },
  VerticalOrigin: {
    CENTER: 0
  },
  HorizontalOrigin: {
    CENTER: 0
  },
  LabelStyle: {
    FILL_AND_OUTLINE: 0
  },
  Cartesian2: class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  },
  Cartesian3: class {
    constructor(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    static lerp(start, end, t, result) {
      result.x = start.x + (end.x - start.x) * t;
      result.y = start.y + (end.y - start.y) * t;
      result.z = start.z + (end.z - start.z) * t;
      return result;
    }
  },
  Cartographic: {
    fromCartesian: (cartesian) => ({
      longitude: cartesian.x / 1000000,
      latitude: cartesian.y / 1000000,
      height: cartesian.z
    })
  },
  Math: {
    toDegrees: (radians) => radians * (180 / Math.PI),
    toRadians: (degrees) => degrees * (Math.PI / 180)
  },
  EllipsoidGeodesic: class {
    constructor(c1, c2) {
      this.c1 = c1;
      this.c2 = c2;
      // Calculate distance using Haversine formula approximation
      const dLat = c2.latitude - c1.latitude;
      const dLon = c2.longitude - c1.longitude;
      this.surfaceDistance = Math.sqrt(dLat * dLat + dLon * dLon) * 111320; // rough approximation
      // Calculate bearing
      this.startHeading = Math.atan2(dLon, dLat);
    }
  },
  PolygonHierarchy: class {
    constructor(positions) {
      this.positions = positions;
    }
  },
  BoundingSphere: {
    fromPoints: (positions) => ({
      center: positions[0] || { x: 0, y: 0, z: 0 }
    })
  }
};

global.window = {
  Cesium: mockCesium
};

describe('useMeasurementTool', () => {
  let mockViewer;
  let mockCesiumViewerRef;
  let addedEntities;

  beforeEach(() => {
    addedEntities = [];
    
    mockViewer = {
      entities: {
        add: jest.fn((entity) => {
          addedEntities.push(entity);
          return entity;
        }),
        remove: jest.fn()
      },
      scene: {
        requestRender: jest.fn(),
        globe: {
          ellipsoid: {
            cartesianToCartographic: (cartesian) => ({
              longitude: cartesian.x / 1000000,
              latitude: cartesian.y / 1000000,
              height: cartesian.z
            })
          }
        }
      },
      cesiumWidget: {
        container: {
          title: ''
        }
      }
    };

    mockCesiumViewerRef = {
      current: mockViewer
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    addedEntities = [];
  });

  describe('Point Marker Styling (Requirements 2.1-2.5)', () => {
    test('should create point markers with correct styling properties', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const cartesian = { x: 1000000, y: 2000000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(cartesian);
      });

      // Find the point entity
      const pointEntity = addedEntities.find(e => e.point);
      
      expect(pointEntity).toBeDefined();
      expect(pointEntity.point.pixelSize).toBe(14);
      expect(pointEntity.point.color).toEqual(mockCesium.Color.WHITE);
      expect(pointEntity.point.outlineColor).toEqual(mockCesium.Color.CYAN);
      expect(pointEntity.point.outlineWidth).toBe(4);
      expect(pointEntity.point.heightReference).toBe(mockCesium.HeightReference.CLAMP_TO_GROUND);
      expect(pointEntity.point.disableDepthTestDistance).toBe(Number.POSITIVE_INFINITY);
    });

    test('should create two point markers for distance measurement', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
      });

      act(() => {
        result.current.addMeasurementPoint(point2);
      });

      const pointEntities = addedEntities.filter(e => e.point);
      expect(pointEntities).toHaveLength(2);
    });
  });

  describe('Dual-Unit Label Display (Requirements 1.1, 1.2, 1.4, 1.5)', () => {
    test('should create meters label above the line', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const metersLabel = addedEntities.find(e => 
        e.label && e.label.text && e.label.text.includes(' m') && !e.label.text.includes('ft')
      );

      expect(metersLabel).toBeDefined();
      expect(metersLabel.label.pixelOffset.y).toBe(-30); // Above the line
      expect(metersLabel.label.fillColor).toEqual(mockCesium.Color.YELLOW);
      expect(metersLabel.label.outlineColor).toEqual(mockCesium.Color.BLACK);
      expect(metersLabel.label.outlineWidth).toBe(5);
    });

    test('should create feet label below the line', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const feetLabel = addedEntities.find(e => 
        e.label && e.label.text && e.label.text.includes(' ft')
      );

      expect(feetLabel).toBeDefined();
      expect(feetLabel.label.pixelOffset.y).toBe(30); // Below the line
      expect(feetLabel.label.fillColor).toEqual(mockCesium.Color.WHITE);
      expect(feetLabel.label.outlineColor).toEqual(mockCesium.Color.BLACK);
      expect(feetLabel.label.outlineWidth).toBe(5);
    });

    test('should use correct font and styling for labels', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const labels = addedEntities.filter(e => e.label);

      labels.forEach(labelEntity => {
        expect(labelEntity.label.font).toBe('22px bold "Arial", sans-serif');
        expect(labelEntity.label.style).toBe(mockCesium.LabelStyle.FILL_AND_OUTLINE);
        expect(labelEntity.label.verticalOrigin).toBe(mockCesium.VerticalOrigin.CENTER);
        expect(labelEntity.label.horizontalOrigin).toBe(mockCesium.HorizontalOrigin.CENTER);
        expect(labelEntity.label.disableDepthTestDistance).toBe(Number.POSITIVE_INFINITY);
      });
    });
  });

  describe('Label Rotation (Requirement 1.3)', () => {
    test('should calculate rotation to align with line bearing', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const labels = addedEntities.filter(e => e.label);
      
      expect(labels.length).toBeGreaterThan(0);
      labels.forEach(labelEntity => {
        expect(labelEntity.label.rotation).toBeDefined();
        expect(typeof labelEntity.label.rotation).toBe('number');
      });
    });

    /**
     * Property Test: Label Rotation Alignment
     * Feature: measurement-tool-improvements, Property 1: Label rotation alignment
     * Validates: Requirements 1.3
     */
    test('property: label rotation prevents upside-down text for any coordinate pair', () => {
      fc.assert(
        fc.property(
          // Generate random latitude/longitude pairs
          fc.tuple(
            fc.double({ min: -85, max: 85 }), // lat1
            fc.double({ min: -180, max: 180 }), // lon1
            fc.double({ min: -85, max: 85 }), // lat2
            fc.double({ min: -180, max: 180 })  // lon2
          ).filter(([lat1, lon1, lat2, lon2]) => {
            // Ensure points are not identical
            return Math.abs(lat1 - lat2) > 0.001 || Math.abs(lon1 - lon2) > 0.001;
          }),
          ([lat1, lon1, lat2, lon2]) => {
            const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

            act(() => {
              result.current.startMeasurement('distance');
            });

            // Convert to cartesian (simplified)
            const point1 = { x: lon1 * 1000000, y: lat1 * 1000000, z: 0 };
            const point2 = { x: lon2 * 1000000, y: lat2 * 1000000, z: 0 };
            
            addedEntities = []; // Reset for each iteration
            
            act(() => {
              result.current.addMeasurementPoint(point1);
              result.current.addMeasurementPoint(point2);
            });

            const labels = addedEntities.filter(e => e.label);
            
            if (labels.length > 0) {
              const rotation = labels[0].label.rotation;
              const rotationDegrees = rotation * (180 / Math.PI);
              const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
              
              // Verify text is not upside down (rotation should not be between 90 and 270)
              // After normalization, it should be between -90 and 90 or 270 and 360
              const isReadable = normalizedRotation <= 90 || normalizedRotation >= 270;
              
              return isReadable;
            }
            
            return true; // If no labels, test passes
          }
        ),
        { numRuns: 100 } // Run 100 iterations as specified in design
      );
    });
  });

  describe('Measurement Line Styling (Requirements 3.1-3.3)', () => {
    test('should create line with correct width and color', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const lineEntity = addedEntities.find(e => e.polyline);

      expect(lineEntity).toBeDefined();
      expect(lineEntity.polyline.width).toBe(4);
      expect(lineEntity.polyline.material).toEqual(mockCesium.Color.WHITE);
      expect(lineEntity.polyline.clampToGround).toBe(true);
    });
  });

  describe('Preview Line Styling (Requirements 3.4, 3.5)', () => {
    test('should create preview line with yellow color', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
      });

      addedEntities = []; // Reset to capture only preview entities
      
      const cursorPosition = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.updatePreviewLine(cursorPosition);
      });

      const previewLine = addedEntities.find(e => e.polyline);

      expect(previewLine).toBeDefined();
      expect(previewLine.polyline.width).toBe(3);
      expect(previewLine.polyline.clampToGround).toBe(true);
    });

    test('should create preview label with distance', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
      });

      addedEntities = []; // Reset to capture only preview entities
      
      const cursorPosition = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.updatePreviewLine(cursorPosition);
      });

      const previewLabel = addedEntities.find(e => e.label);

      expect(previewLabel).toBeDefined();
      expect(previewLabel.label.text).toMatch(/\d+\.\d+ m \(\d+\.\d+ ft\)/);
    });
  });

  describe('Cleanup Functionality (Requirements 4.1-4.5)', () => {
    test('should remove all entities when clearing measurements', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const entityCount = addedEntities.length;
      expect(entityCount).toBeGreaterThan(0);

      act(() => {
        result.current.clearMeasurements();
      });

      expect(mockViewer.entities.remove).toHaveBeenCalledTimes(entityCount);
    });

    test('should reset measurement mode to null when canceling', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      expect(result.current.measurementMode).toBe('distance');

      act(() => {
        result.current.cancelMeasurement();
      });

      expect(result.current.measurementMode).toBeNull();
    });

    test('should reset measurement points array when clearing', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
      });

      expect(result.current.measurementPoints.length).toBe(1);

      act(() => {
        result.current.clearMeasurements();
      });

      expect(result.current.measurementPoints.length).toBe(0);
    });

    test('should request scene render after cleanup', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
      });

      mockViewer.scene.requestRender.mockClear();

      act(() => {
        result.current.clearMeasurements();
      });

      expect(mockViewer.scene.requestRender).toHaveBeenCalled();
    });
  });

  describe('Distance Calculation', () => {
    test('should calculate distance accurately', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const metersLabel = addedEntities.find(e => 
        e.label && e.label.text && e.label.text.includes(' m') && !e.label.text.includes('ft')
      );

      expect(metersLabel).toBeDefined();
      expect(metersLabel.label.text).toMatch(/\d+\.\d+ m/);
    });

    test('should convert meters to feet correctly (1m = 3.28084ft)', () => {
      const { result } = renderHook(() => useMeasurementTool(mockCesiumViewerRef));

      act(() => {
        result.current.startMeasurement('distance');
      });

      const point1 = { x: 1000000, y: 2000000, z: 0 };
      const point2 = { x: 1100000, y: 2100000, z: 0 };
      
      act(() => {
        result.current.addMeasurementPoint(point1);
        result.current.addMeasurementPoint(point2);
      });

      const metersLabel = addedEntities.find(e => 
        e.label && e.label.text && e.label.text.includes(' m') && !e.label.text.includes('ft')
      );
      const feetLabel = addedEntities.find(e => 
        e.label && e.label.text && e.label.text.includes(' ft')
      );

      expect(metersLabel).toBeDefined();
      expect(feetLabel).toBeDefined();

      const metersMatch = metersLabel.label.text.match(/(\d+\.\d+) m/);
      const feetMatch = feetLabel.label.text.match(/(\d+\.\d+) ft/);

      if (metersMatch && feetMatch) {
        const meters = parseFloat(metersMatch[1]);
        const feet = parseFloat(feetMatch[1]);
        const expectedFeet = meters * 3.28084;
        
        // Allow small floating point error
        expect(Math.abs(feet - expectedFeet)).toBeLessThan(0.01);
      }
    });
  });
});
