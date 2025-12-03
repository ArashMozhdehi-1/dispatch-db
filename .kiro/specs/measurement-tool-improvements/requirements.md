# Requirements Document

## Introduction

This specification defines improvements to the measurement tool in the Frontrunner mapping application. The measurement tool currently displays distance measurements but lacks visual clarity and proper styling. This feature will enhance the measurement tool to display both metric and imperial units with improved visual presentation including start/end point markers.

## Glossary

- **Measurement Tool**: A Cesium-based interactive tool that allows users to measure distances and areas on the 3D map
- **Distance Mode**: Measurement mode where users click two points to measure the distance between them
- **Area Mode**: Measurement mode where users click multiple points to define a polygon and measure its area
- **Cesium**: The 3D mapping library used for rendering the map
- **useMeasurementTool Hook**: React hook that manages measurement tool state and operations
- **MeasurementStatusBanner**: UI component that displays measurement instructions and status

## Requirements

### Requirement 1

**User Story:** As a user measuring distances on the map, I want to see both meters and feet displayed clearly on the measurement line, so that I can understand the distance in my preferred unit system.

#### Acceptance Criteria

1. WHEN a user completes a distance measurement THEN the system SHALL display the distance in meters above the measurement line
2. WHEN a user completes a distance measurement THEN the system SHALL display the distance in feet below the measurement line
3. WHEN displaying measurement labels THEN the system SHALL align the text parallel to the measurement line for improved readability
4. WHEN displaying measurement labels THEN the system SHALL use contrasting colors with clear outlines to ensure visibility against any background
5. WHEN displaying measurement labels THEN the system SHALL position the meters label 30 pixels above the line center and the feet label 30 pixels below the line center

### Requirement 2

**User Story:** As a user measuring distances, I want to see clear visual markers at the start and end points of my measurement, so that I can easily identify where my measurement begins and ends.

#### Acceptance Criteria

1. WHEN a user clicks the first point for distance measurement THEN the system SHALL display a prominent circular marker at that location
2. WHEN a user clicks the second point for distance measurement THEN the system SHALL display a prominent circular marker at that location
3. WHEN displaying measurement point markers THEN the system SHALL use a white fill color with a cyan outline for high visibility
4. WHEN displaying measurement point markers THEN the system SHALL set the marker size to 14 pixels with a 4-pixel outline width
5. WHEN displaying measurement point markers THEN the system SHALL clamp markers to ground level and disable depth testing for consistent visibility

### Requirement 3

**User Story:** As a user measuring distances, I want the measurement line to have improved visual styling, so that it stands out clearly against the map background.

#### Acceptance Criteria

1. WHEN a distance measurement is displayed THEN the system SHALL render the line with a width of 4 pixels
2. WHEN a distance measurement is displayed THEN the system SHALL use a white color for the measurement line
3. WHEN a distance measurement is displayed THEN the system SHALL clamp the line to the ground surface
4. WHEN a user is previewing a measurement (before clicking the second point) THEN the system SHALL display a yellow semi-transparent preview line
5. WHEN displaying the preview line THEN the system SHALL show a temporary label with the current distance that updates as the cursor moves

### Requirement 4

**User Story:** As a user, I want the measurement tool to clean up properly when I press ESC or cancel, so that no visual artifacts remain on the map.

#### Acceptance Criteria

1. WHEN a user presses the ESC key during measurement THEN the system SHALL remove all measurement entities including points, lines, and labels
2. WHEN a user clicks the cancel button THEN the system SHALL remove all measurement entities including points, lines, and labels
3. WHEN clearing measurements THEN the system SHALL reset the measurement mode to null
4. WHEN clearing measurements THEN the system SHALL reset the measurement points array to empty
5. WHEN clearing measurements THEN the system SHALL request a scene render to update the display immediately
