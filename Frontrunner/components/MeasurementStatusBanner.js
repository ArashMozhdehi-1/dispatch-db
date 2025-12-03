import React from 'react';

/**
 * Status banner displayed during measurement operations
 * Shows current mode, progress, and cancel button
 */
export default function MeasurementStatusBanner({ 
  measurementMode, 
  measurementPoints, 
  onCancel 
}) {
  if (!measurementMode) return null;

  const pointCount = measurementPoints.length;
  let message = '';
  let icon = '';

  if (measurementMode === 'distance') {
    icon = '📏';
    if (pointCount === 0) {
      message = 'Click first point to measure distance';
    } else if (pointCount === 1) {
      message = 'Click second point to complete measurement';
    } else if (pointCount === 2) {
      message = 'Distance measured. Press ESC to clear.';
    }
  } else if (measurementMode === 'area') {
    icon = '📐';
    if (pointCount < 3) {
      message = `Click at least ${3 - pointCount} more points to measure area`;
    } else {
      message = `Click points to define area (Points: ${pointCount})`;
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: '60px', // Below the TopMenuBar
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(30, 30, 30, 0.9)',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.4)',
      zIndex: 1999, // Below TopMenuBar (2000) but above map
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      backdropFilter: 'blur(5px)',
      border: '1px solid rgba(120, 120, 120, 0.6)',
    }}>
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <span style={{ fontSize: '14px', fontWeight: '500' }}>
        {message}
        {measurementMode === 'distance' && pointCount < 2 && ` (Point ${pointCount + 1}/2)`}
        {measurementMode === 'area' && pointCount >= 3 && ` (Points: ${pointCount})`}
      </span>
      <button
        onClick={onCancel}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.3)',
          color: 'white',
          padding: '5px 10px',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          transition: 'background-color 0.2s ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
      >
        Cancel (ESC)
      </button>
    </div>
  );
}

