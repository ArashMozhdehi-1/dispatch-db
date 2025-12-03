# Implementation Plan

- [x] 1. Update point marker styling in useMeasurementTool.js


  - Modify the point entity creation in `addMeasurementPoint` function
  - Set pixelSize to 14, color to WHITE, outlineColor to CYAN, outlineWidth to 4
  - Ensure heightReference is CLAMP_TO_GROUND and disableDepthTestDistance is POSITIVE_INFINITY
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_



- [ ] 2. Implement dual-unit label display for distance measurements
  - [ ] 2.1 Create meters label entity above the measurement line
    - Position label at line midpoint with pixelOffset (0, -30)
    - Use YELLOW fill color with BLACK outline (width 5)
    - Set font to '22px bold "Arial", sans-serif'
    - Calculate and apply rotation to align with line bearing

    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [ ] 2.2 Create feet label entity below the measurement line
    - Position label at line midpoint with pixelOffset (0, 30)
    - Use WHITE fill color with BLACK outline (width 5)
    - Set font to '22px bold "Arial", sans-serif'

    - Apply same rotation as meters label
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [ ] 2.3 Calculate label rotation to prevent upside-down text
    - Extract bearing from geodesic calculation
    - Normalize bearing to 0-360 range


    - Flip rotation by 180° if bearing is between 90° and 270°
    - Convert to radians for Cesium
    - _Requirements: 1.3_

  - [x] 2.4 Write property test for label rotation alignment

    - **Property 1: Label rotation alignment**
    - **Validates: Requirements 1.3**
    - Generate random coordinate pairs
    - Verify rotation angle prevents upside-down text
    - Verify rotation aligns with line direction
    - Run 100 iterations minimum


- [ ] 3. Update measurement line styling
  - Modify polyline entity creation in `addMeasurementPoint` function
  - Set width to 4 pixels
  - Set material to Cesium.Color.WHITE
  - Ensure clampToGround is true

  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Update preview line styling
  - Modify preview line entity creation in `updatePreviewLine` function
  - Set width to 3 pixels
  - Set material to YELLOW with alpha 0.8
  - Update preview label styling to match final label style


  - _Requirements: 3.4, 3.5_

- [ ] 5. Verify cleanup functionality
  - Review `clearMeasurements` and `cancelMeasurement` functions
  - Ensure all entities (points, lines, labels) are properly tracked in refs
  - Verify all entities are removed during cleanup
  - Ensure state is reset (mode to null, points to empty array)
  - Verify scene.requestRender() is called after cleanup

  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Write unit tests for measurement tool improvements
  - Test point marker creation with correct styling properties
  - Test dual-label creation (meters and feet) with correct positioning
  - Test measurement line styling (width, color, clampToGround)
  - Test preview line and label creation
  - Test cleanup removes all entities and resets state
  - Test distance calculation accuracy
  - Test meters to feet conversion (1m = 3.28084ft)
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
