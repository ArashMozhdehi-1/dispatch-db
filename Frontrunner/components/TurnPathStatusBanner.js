import React from 'react';

/**
 * Status banner shown on map during road selection
 */
export default function TurnPathStatusBanner({ 
  currentStep,
  selectedSourceRoad,
  selectedDestinationRoad,
  onCancel 
}) {
  if (currentStep !== 'selecting_source' && currentStep !== 'selecting_destination') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '60px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1001,
      backgroundColor: '#2c3e50',
      border: '2px solid #3498db',
      borderRadius: '8px',
      padding: '16px 24px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      minWidth: '400px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px'
    }}>
      {/* Icon */}
      <div style={{ fontSize: '32px' }}>
        {currentStep === 'selecting_source' ? '🟢' : '🔴'}
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ 
          color: 'white',
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '4px'
        }}>
          {currentStep === 'selecting_source' 
            ? 'Step 1: Select Source Road' 
            : 'Step 2: Select Destination Road'
          }
        </div>
        <div style={{ 
          color: '#95a5a6',
          fontSize: '13px'
        }}>
          {currentStep === 'selecting_source'
            ? 'Click on the road where the vehicle starts'
            : `From: ${selectedSourceRoad?.name || 'Unknown'} → Click destination road`
          }
        </div>
      </div>

      {/* Cancel Button */}
      <button
        onClick={onCancel}
        style={{
          padding: '8px 16px',
          backgroundColor: '#e74c3c',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '500',
          whiteSpace: 'nowrap'
        }}
      >
        Cancel (ESC)
      </button>
    </div>
  );
}

