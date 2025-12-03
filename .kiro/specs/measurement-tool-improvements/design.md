# Design Document

## Overview

This design document outlines the improvements to the measurement tool in the Frontrunner mapping application. The measurement tool allows users to measure distances and areas on a 3D Cesium map. The improvements focus on enhancing visual clarity by displaying measurements in both metric and imperial units, adding prominent start/end point markers, and improving the overall styling of measurement visualizations.

The measurement tool is implemented as a React hook (`useMeasurementTool`) that manages state and Cesium entity creation. The improvements will modify how measurement entities (points, lines, labels) are created and styled.

## Architecture

The measurement tool follows a React hooks-based architecture:

```
┌─────────────────────────────────────┐
│   ConsolidatedPolygonMap.js         │
│   (Main Map Component)              │
└──────────────┬──────────────────────┘
               │
               │ uses
               ▼
┌─────────────────────────────────────┐
│   useMeasurementTool.js             │
│   (Measurement Logic Hook)          │
│   - State management                │
│   - Entity creation                 │
│   - Distance calculations           │
└──────────────┬──────────────────────┘
               │
               │ creates/manages
               ▼
┌─────────────────────────────────────┐
│   Cesium Entities                   │
│   - Point markers                   │
│   - Polyline (measurement line)     │
│   - Labels (meters & feet)          │
└─────────────────────────────────────┘
```

The measurement tool interacts with:
- **Cesium Viewer**: The 3D map rendering engine
- **ScreenSpaceEventHandler**: Captures user clicks and mouse movements
- **Entity API**: Creates and manages visual elements on the map

## Components and Interfaces

### useMeasurementTool Hook

**Purpose**: Manages measurement tool state and creates Cesium entities for visualizing measurements.

**Key Functions**:

1. `addMeasurementPoint(cartesian)`: Adds a measurement point and creates visual entities
   - Creates point marker entity
   - If two points exist (distance mode), creates final measurement line and labels
   - If multiple points exist (area mode), updates polygon

2. `updatePreviewLine(cursorCartesian)`: Updates preview line during distance measurement
   - Creates/updates temporary preview line entity
   - Creates/updates temporary preview label
   - Calculates and displays current distance

3. `clearMeasurements()`: Removes all measurement entities
   - Removes all point markers
   - Removes measurement lines
   - Removes labels
   - Resets state

4. `cancelMeasurement()`: Cancels current measurement and cleans up
   - Calls `clearMeasurements()`
   - Resets measurement mode
   - Requests scene render

**State**:
- `measurementMode`: Current mode ('distance', 'area', or null)
- `measurementPoints`: Array of clicked points with cartesian coordinates
- `measurementEntitiesRef`: Array of Cesium entities to track for cleanup
- `overlayEntitiesRef`: Array of overlay entities (lines, labels)
- `previewLineEntityRef`: Reference to preview line entity
- `previewLabelEntityRef`: Reference to preview label entity

### Entity Creation

**Point Markers**:
```javascript
{
  position: cartesian,
  point: {
    pixelSize: 14,
    color: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.CYAN,
    outlineWidth: 4,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY
  }
}
```

**Measurement Line**:
```javascript
{
  polyline: {
    positions: [point1, point2],
    width: 4,
    material: Cesium.Color.WHITE,
    clampToGround: true
  }
}
```

**Measurement Labels** (Meters and Feet):
```javascript
// Meters label (above line)
{
  position: midpoint,
  label: {
    text: "123.45 m",
    font: '22px bold "Arial", sans-serif',
    fillColor: Cesium.Color.YELLOW,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 5,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    pixelOffset: new Cesium.Cartesian2(0, -30),
    rotation: rotationRadians,
    disableDepthTestDistance: Number.POSITIVE_INFINITY
  }
}

// Feet label (below line)
{
  position: midpoint,
  label: {
    text: "405.02 ft",
    font: '22px bold "Arial", sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 5,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    pixelOffset: new Cesium.Cartesian2(0, 30),
    rotation: rotationRadians,
    disableDepthTestDistance: Number.POSITIVE_INFINITY
  }
}
```

## Data Models

### MeasurementPoint
```typescript
interface MeasurementPoint {
  cartesian: Cesium.Cartesian3;  // 3D position
  longitude: number;              // Degrees
  latitude: number;               // Degrees
}
```

### Distance Calculation
```typescript
interface DistanceResult {
  meters: number;      // Distance in meters
  feet: number;        // Distance in feet (meters * 3.28084)
  bearing: number;     // Bearing in degrees (0-360)
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Most of the acceptance criteria for this feature are specific examples of correct behavior rather than universal properties. The implementation will be validated primarily through example-based unit tests that verify specific styling and positioning values.

However, there is one universal property that should hold:

**Property 1: Label rotation alignment**
*For any* two measurement points, the rotation angle of the measurement labels should be calculated such that the text aligns parallel to the line connecting the points, with the text reading direction adjusted to avoid upside-down text (angles between 90° and 270° are flipped by 180°).
**Validates: Requirements 1.3**

## Error Handling

### Invalid Input Handling

1. **Missing Cesium Viewer**: If `cesiumViewerRef.current` is null, all measurement functions should return early without throwing errors.

2. **Invalid Cartesian Coordinates**: If `pickPosition` returns undefined (user clicked on sky), the click should be ignored.

3. **Missing Cesium Library**: If `window.Cesium` is undefined, measurement functions should return early.

### Cleanup Errors

1. **Entity Removal Failures**: Wrap entity removal in try-catch blocks to handle cases where entities are already removed or viewer is destroyed.

2. **Ref Cleanup**: Always set refs to null after removing entities to prevent double-removal attempts.

### State Consistency

1. **Mode Synchronization**: Use refs (`measurementModeRef`, `measurementPointsRef`) to ensure event handlers always have access to current state.

2. **Lock Mechanism**: Use `areaLockedRef` to prevent additional clicks after area measurement is finalized.

## Testing Strategy

### Unit Testing

The measurement tool improvements will be tested using Jest and React Testing Library. Tests will focus on:

1. **Entity Creation Tests**:
   - Verify point markers are created with correct styling (size, colors, outline)
   - Verify measurement line is created with correct width and color
   - Verify labels are created with correct text, positioning, and rotation

2. **Distance Calculation Tests**:
   - Test distance calculation accuracy for known coordinate pairs
   - Test meters to feet conversion (1m = 3.28084ft)
   - Test bearing calculation for various point configurations

3. **Cleanup Tests**:
   - Verify all entities are removed when ESC is pressed
   - Verify all entities are removed when cancel is clicked
   - Verify state is reset after cleanup

4. **Preview Tests**:
   - Verify preview line appears after first click
   - Verify preview label updates during mouse movement
   - Verify preview entities are removed after second click

### Property-Based Testing

We will use **fast-check** for property-based testing in JavaScript/TypeScript. Each property-based test will run a minimum of 100 iterations.

**Property Test 1: Label Rotation Alignment**
- Generate random pairs of geographic coordinates
- Calculate the bearing between them
- Verify the rotation angle is correctly normalized (no upside-down text)
- Verify the rotation matches the line direction

### Integration Testing

1. **End-to-End Measurement Flow**:
   - Simulate complete measurement workflow (start → click point 1 → click point 2 → verify display)
   - Test ESC key cancellation at various stages
   - Test switching between distance and area modes

2. **Visual Regression Testing**:
   - Capture screenshots of measurements at various angles
   - Compare against baseline images to detect styling regressions

### Manual Testing

1. **Visual Verification**:
   - Verify labels are readable against various map backgrounds
   - Verify point markers are visible at different zoom levels
   - Verify line styling is clear and prominent

2. **Usability Testing**:
   - Test measurement workflow with real users
   - Verify dual-unit display is helpful
   - Verify cleanup behavior meets user expectations

## Implementation Notes

### Label Rotation Calculation

The label rotation must account for the bearing of the line to keep text parallel:

```javascript
const bearing = Cesium.Math.toDegrees(geodesic.startHeading);
const normalizedBearing = bearing < 0 ? bearing + 360 : bearing;

// Flip text if it would be upside down (90° to 270°)
const rotationAngle = 
  normalizedBearing > 90 && normalizedBearing < 270
    ? normalizedBearing - 180
    : normalizedBearing;

const rotationRadians = Cesium.Math.toRadians(rotationAngle);
```

### Distance Conversion

Meters to feet conversion uses the standard factor:
```javascript
const distanceFeet = distanceMeters * 3.28084;
```

### Entity Tracking

All created entities must be tracked in `measurementEntitiesRef` and `overlayEntitiesRef` for proper cleanup:

```javascript
measurementEntitiesRef.current.push(pointEntity);
overlayEntitiesRef.current.push(lineEntity, metersLabel, feetLabel);
```

### Render Requests

After creating or removing entities, always request a scene render:

```javascript
if (viewer.scene) {
  viewer.scene.requestRender();
}
```

## Future Enhancements

1. **Customizable Units**: Allow users to choose which units to display (meters only, feet only, or both)

2. **Measurement History**: Save previous measurements and allow users to toggle their visibility

3. **Export Measurements**: Allow users to export measurement data as GeoJSON or CSV

4. **Measurement Editing**: Allow users to adjust measurement points after creation

5. **3D Measurements**: Support vertical distance measurements for elevation changes
