# Turn Path UI Integration Guide

## Overview

This guide shows how to integrate the Turn Path UI components into your Cesium map application.

## Components Created

1. **`TurnPathMenu.js`** - Dropdown menu for the top menu bar
2. **`TurnPathDialog.js`** - Dialog for configuring and computing paths
3. **`useTurnPathManager.js`** - React hook for managing turn path workflow

---

## Integration Steps

### 1. Import Components

Add to your `ConsolidatedPolygonMap.js`:

```javascript
import TurnPathMenu from './TurnPathMenu';
import TurnPathDialog from './TurnPathDialog';
import useTurnPathManager from './useTurnPathManager';
```

### 2. Initialize Hook

Inside your component:

```javascript
const ConsolidatedPolygonMap = () => {
  const cesiumViewerRef = useRef(null);
  const entitiesRef = useRef([]);
  
  // Initialize turn path manager
  const turnPathManager = useTurnPathManager(cesiumViewerRef, entitiesRef);
  
  // ... rest of your component
};
```

### 3. Add Menu to Top Bar

Find your top menu bar and add the Turn Path menu:

```jsx
<div style={{ 
  display: 'flex', 
  gap: '12px',
  padding: '12px',
  backgroundColor: '#1a252f',
  borderBottom: '1px solid #34495e'
}}>
  {/* Your existing menu items */}
  
  {/* Add Turn Path menu */}
  <TurnPathMenu
    onComputePath={turnPathManager.openDialog}
    onShowIntersectionCurves={() => {
      // TODO: Implement intersection curve visualization
      console.log('Show intersection curves');
    }}
    onManageProfiles={() => {
      // TODO: Implement profile management
      console.log('Manage profiles');
    }}
  />
</div>
```

### 4. Add Dialog Component

Add the dialog component before your closing component tag:

```jsx
return (
  <div>
    {/* Your existing Cesium container and UI */}
    
    {/* Turn Path Dialog */}
    <TurnPathDialog
      isOpen={turnPathManager.isDialogOpen}
      onClose={turnPathManager.closeDialog}
      onStartSelection={turnPathManager.startSelection}
      vehicleProfiles={turnPathManager.vehicleProfiles}
      currentStep={turnPathManager.currentStep}
    />
  </div>
);
```

### 5. Handle Map Clicks During Selection

Add click handler to your Cesium viewer setup:

```javascript
// In your useEffect where you initialize the Cesium viewer
const handler = new window.Cesium.ScreenSpaceEventHandler(
  cesiumViewer.scene.canvas
);

handler.setInputAction((click) => {
  const pickedObject = cesiumViewer.scene.pick(click.position);
  
  if (window.Cesium.defined(pickedObject) && pickedObject.id) {
    const entity = pickedObject.id;
    
    // Check if we're in turn path selection mode
    if (
      turnPathManager.currentStep === 'selecting_source' ||
      turnPathManager.currentStep === 'selecting_destination'
    ) {
      // Handle turn path road selection
      turnPathManager.handleMapClick(entity);
    } else {
      // Handle your normal entity clicks
      handleEntityClick(entity);
    }
  }
}, window.Cesium.ScreenSpaceEventType.LEFT_CLICK);
```

---

## Complete Integration Example

```javascript
import React, { useRef, useEffect } from 'react';
import TurnPathMenu from './TurnPathMenu';
import TurnPathDialog from './TurnPathDialog';
import useTurnPathManager from './useTurnPathManager';

export default function ConsolidatedPolygonMap() {
  const cesiumViewerRef = useRef(null);
  const entitiesRef = useRef([]);
  
  // Initialize turn path manager
  const turnPathManager = useTurnPathManager(cesiumViewerRef, entitiesRef);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!window.Cesium) return;

    const cesiumViewer = new window.Cesium.Viewer('cesiumContainer', {
      // ... your Cesium options
    });

    cesiumViewerRef.current = cesiumViewer;

    // Set up click handler
    const handler = new window.Cesium.ScreenSpaceEventHandler(
      cesiumViewer.scene.canvas
    );

    handler.setInputAction((click) => {
      const pickedObject = cesiumViewer.scene.pick(click.position);
      
      if (window.Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        
        // Turn path selection mode
        if (
          turnPathManager.currentStep === 'selecting_source' ||
          turnPathManager.currentStep === 'selecting_destination'
        ) {
          turnPathManager.handleMapClick(entity);
        } else {
          // Normal mode - your existing click handling
          handleNormalEntityClick(entity);
        }
      }
    }, window.Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      cesiumViewer.destroy();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Top Menu Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        gap: '12px',
        padding: '12px',
        backgroundColor: '#1a252f',
        borderBottom: '1px solid #34495e'
      }}>
        {/* Your existing menu items */}
        
        {/* Turn Path Menu */}
        <TurnPathMenu
          onComputePath={turnPathManager.openDialog}
          onShowIntersectionCurves={() => {
            console.log('Show intersection curves');
          }}
          onManageProfiles={() => {
            console.log('Manage profiles');
          }}
        />
      </div>

      {/* Cesium Container */}
      <div id="cesiumContainer" style={{ width: '100%', height: '100%' }} />

      {/* Turn Path Dialog */}
      <TurnPathDialog
        isOpen={turnPathManager.isDialogOpen}
        onClose={turnPathManager.closeDialog}
        onStartSelection={turnPathManager.startSelection}
        vehicleProfiles={turnPathManager.vehicleProfiles}
        currentStep={turnPathManager.currentStep}
      />
    </div>
  );
}
```

---

## User Workflow

### Step 1: Open Dialog
1. User clicks "Turn Path" in menu bar
2. Dropdown shows:
   - 🛣️ Compute Turn Path
   - 📊 Show Intersection Curves  
   - 🚛 Vehicle Profiles

3. User clicks "Compute Turn Path"

### Step 2: Configure Vehicle
Dialog shows two tabs:
- **Predefined Profile**: Select Komatsu 830E, 930E, or CAT 797F
- **Custom Values**: Enter custom dimensions

User can adjust:
- Vehicle name
- Width (m)
- Wheelbase (m)
- Max steering angle (degrees)
- Side safety buffer (m)
- Path resolution slider (0.5-5.0m)

Calculated turn radius shown in real-time.

### Step 3: Select Source Road
1. User clicks "Select Roads on Map" button
2. Dialog changes to selection mode
3. User clicks on a road polygon on map
4. Selected road highlights in **green**

### Step 4: Select Destination Road
1. Dialog prompts for destination
2. User clicks another road polygon
3. Selected road highlights in **red**
4. Path computation starts automatically

### Step 5: View Results
- Path renders on map as colored polyline:
  - **Green**: Vehicle clearance OK
  - **Orange**: Vehicle extends outside intersection
  
- Dialog shows result:
  - Path length
  - Path type (LSL, RSR, etc.)
  - Clearance status
  - Outside area (if any)

### Step 6: Exit
- Press **ESC** key anytime to close
- Dialog cleans up highlights and path

---

## Customization

### Styling

All components use inline styles with a dark theme. To customize:

```javascript
// Change primary color
const primaryColor = '#3498db'; // Blue (default)
// Or: '#27ae60' for green, '#e74c3c' for red

// Update in TurnPathDialog.js:
style={{ backgroundColor: primaryColor }}
```

### Vehicle Profiles

To add more profiles, update the backend:

```python
# In lib/vehicle_profiles.py
HITACHI_EH5000 = VehicleProfile(
    name="Hitachi EH5000",
    vehicle_width_m=8.2,
    wheelbase_m=6.8,
    max_steering_angle_deg=31.0,
    side_buffer_m=0.5
)

VEHICLE_PROFILES = {
    "komatsu_830e": KOMATSU_830E,
    "komatsu_930e": KOMATSU_930E,
    "cat_797f": CAT_797F,
    "hitachi_eh5000": HITACHI_EH5000,  # NEW
}
```

### Path Visualization

Customize path appearance in `useTurnPathManager.js`:

```javascript
const entity = cesiumViewerRef.current.entities.add({
  polyline: {
    positions: positions,
    width: 5,  // Line width
    material: pathColor.withAlpha(0.8),  // Color & transparency
    clampToGround: true,  // Follow terrain
    
    // Add animation (optional)
    material: new window.Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: pathColor
    })
  }
});
```

---

## Troubleshooting

### "No shared intersection found"
**Problem**: Selected roads don't connect at the same intersection.

**Solution**: 
- Ensure both roads have side-center markers at the same intersection
- Check database: `SELECT * FROM map_location WHERE type = 'road_corner_side_center'`

### Path not rendering
**Problem**: Path computes but doesn't show on map.

**Solution**:
```javascript
// Check console logs:
console.log('[Turn Path] Path result:', pathResult);

// Verify coordinates are valid:
console.log('GeoJSON:', pathResult.path.geojson);
```

### Dialog doesn't close
**Problem**: ESC key doesn't work.

**Solution**: Check event listener in `TurnPathDialog.js`:
```javascript
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && isOpen) {
      onClose?.();
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isOpen, onClose]);
```

---

## Next Steps

1. **Test the integration** - Click through the full workflow
2. **Add intersection curve visualization** - Implement the second menu item
3. **Add profile management** - Create CRUD UI for custom profiles
4. **Add path comparison** - Compare multiple vehicle profiles
5. **Add path export** - Export paths as KML/GeoJSON files

---

## Related Documentation

- **API Reference**: `docs/TURN_PATH_API.md`
- **Implementation Guide**: `TURN_PATH_IMPLEMENTATION.md`
- **Test Results**: `API_TEST_RESULTS.md`

🎉 **Your turn path UI is ready to integrate!**

