import React, { useState, useEffect } from 'react';

/**
 * Dialog for configuring and computing turn paths between roads
 * 
 * Workflow:
 * 1. Select vehicle profile or enter custom values
 * 2. Click on source road on map
 * 3. Click on destination road on map
 * 4. View computed path
 * 5. Press Escape to exit
 */
export default function TurnPathDialog({ 
  isOpen, 
  onClose, 
  onStartSelection,
  vehicleProfiles = {},
  currentStep = 'profile' // 'profile', 'selecting_source', 'selecting_destination', 'computing', 'showing_path'
}) {
  const [selectedProfile, setSelectedProfile] = useState('komatsu_830e');
  const [useCustom, setUseCustom] = useState(false);
  const [customValues, setCustomValues] = useState({
    name: 'Custom Vehicle',
    vehicle_width_m: 7.3,
    wheelbase_m: 6.35,
    max_steering_angle_deg: 32.0,
    side_buffer_m: 0.5,
    front_buffer_m: 1.0,
    rear_buffer_m: 1.0
  });
  const [samplingStep, setSamplingStep] = useState(1.0);

  // Load profiles on mount
  useEffect(() => {
    if (isOpen && Object.keys(vehicleProfiles).length === 0) {
      // Trigger profile load if needed
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Only show dialog during profile selection and computing steps
  // During road selection, user clicks directly on map (no dialog)
  const shouldShowDialog = currentStep === 'profile' || currentStep === 'computing';
  
  if (!isOpen || !shouldShowDialog) return null;

  const handleStartSelection = () => {
    console.log('[TurnPathDialog] handleStartSelection clicked');
    const profile = useCustom ? customValues : vehicleProfiles[selectedProfile];
    const config = {
      vehicle_profile_id: useCustom ? null : selectedProfile,
      custom_vehicle_profile: useCustom ? customValues : null,
      sampling_step_m: samplingStep
    };
    console.log('[TurnPathDialog] Calling onStartSelection with:', config);
    onStartSelection?.(config);
    console.log('[TurnPathDialog] onStartSelection called');
  };

  const renderProfileStep = () => (
    <>
      {/* Header */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #34495e',
        backgroundColor: '#2c3e50'
      }}>
        <h2 style={{ 
          margin: 0, 
          color: 'white',
          fontSize: '20px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span>🛣️</span>
          <span>Compute Turn Path</span>
        </h2>
        <p style={{ 
          margin: '8px 0 0 0',
          color: '#95a5a6',
          fontSize: '14px'
        }}>
          Configure vehicle parameters and select roads on the map
        </p>
      </div>

      {/* Content */}
      <div style={{ 
        padding: '24px',
        maxHeight: '60vh',
        overflowY: 'auto'
      }}>
        {/* Profile Type Selection */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ 
            display: 'block',
            color: 'white',
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '12px'
          }}>
            Vehicle Profile
          </label>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button
              onClick={() => setUseCustom(false)}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: !useCustom ? '#3498db' : '#34495e',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
            >
              Predefined Profile
            </button>
            <button
              onClick={() => setUseCustom(true)}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: useCustom ? '#3498db' : '#34495e',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
            >
              Custom Values
            </button>
          </div>

          {/* Predefined Profile Selector */}
          {!useCustom && (
            <div>
              {Object.entries(vehicleProfiles).map(([key, profile]) => (
                <div
                  key={key}
                  onClick={() => setSelectedProfile(key)}
                  style={{
                    padding: '16px',
                    marginBottom: '8px',
                    backgroundColor: selectedProfile === key ? '#2c3e50' : '#34495e',
                    border: selectedProfile === key ? '2px solid #3498db' : '2px solid transparent',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <span style={{ 
                      color: 'white',
                      fontSize: '16px',
                      fontWeight: '600'
                    }}>
                      {profile.name}
                    </span>
                    {selectedProfile === key && (
                      <span style={{ color: '#3498db', fontSize: '18px' }}>✓</span>
                    )}
                  </div>
                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    fontSize: '13px',
                    color: '#95a5a6'
                  }}>
                    <div>Width: {profile.vehicle_width_m}m</div>
                    <div>Wheelbase: {profile.wheelbase_m}m</div>
                    <div>Turn Radius: {profile.min_turn_radius_m.toFixed(1)}m</div>
                    <div>Max Steer: {profile.max_steering_angle_deg}°</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Custom Values Form */}
          {useCustom && (
            <div style={{ 
              display: 'grid',
              gap: '16px'
            }}>
              {/* Vehicle Name */}
              <div>
                <label style={{ 
                  display: 'block',
                  color: '#95a5a6',
                  fontSize: '13px',
                  marginBottom: '6px'
                }}>
                  Vehicle Name
                </label>
                <input
                  type="text"
                  value={customValues.name}
                  onChange={(e) => setCustomValues({ ...customValues, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Vehicle Width */}
              <div>
                <label style={{ 
                  display: 'block',
                  color: '#95a5a6',
                  fontSize: '13px',
                  marginBottom: '6px'
                }}>
                  Vehicle Width (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={customValues.vehicle_width_m}
                  onChange={(e) => setCustomValues({ ...customValues, vehicle_width_m: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Wheelbase */}
              <div>
                <label style={{ 
                  display: 'block',
                  color: '#95a5a6',
                  fontSize: '13px',
                  marginBottom: '6px'
                }}>
                  Wheelbase (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={customValues.wheelbase_m}
                  onChange={(e) => setCustomValues({ ...customValues, wheelbase_m: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Max Steering Angle */}
              <div>
                <label style={{ 
                  display: 'block',
                  color: '#95a5a6',
                  fontSize: '13px',
                  marginBottom: '6px'
                }}>
                  Max Steering Angle (degrees)
                </label>
                <input
                  type="number"
                  step="1"
                  value={customValues.max_steering_angle_deg}
                  onChange={(e) => setCustomValues({ ...customValues, max_steering_angle_deg: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Side Buffer */}
              <div>
                <label style={{ 
                  display: 'block',
                  color: '#95a5a6',
                  fontSize: '13px',
                  marginBottom: '6px'
                }}>
                  Side Safety Buffer (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={customValues.side_buffer_m}
                  onChange={(e) => setCustomValues({ ...customValues, side_buffer_m: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Calculated Turn Radius */}
              <div style={{
                padding: '12px',
                backgroundColor: '#2c3e50',
                borderRadius: '6px',
                border: '1px solid #3498db'
              }}>
                <div style={{ 
                  color: '#95a5a6',
                  fontSize: '13px',
                  marginBottom: '4px'
                }}>
                  Calculated Min Turn Radius
                </div>
                <div style={{ 
                  color: '#3498db',
                  fontSize: '18px',
                  fontWeight: '600'
                }}>
                  {(customValues.wheelbase_m / Math.tan(customValues.max_steering_angle_deg * Math.PI / 180)).toFixed(2)} m
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sampling Step */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ 
            display: 'block',
            color: 'white',
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '8px'
          }}>
            Path Resolution
          </label>
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.5"
              value={samplingStep}
              onChange={(e) => setSamplingStep(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: '#3498db'
              }}
            />
            <span style={{ 
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              minWidth: '60px',
              textAlign: 'right'
            }}>
              {samplingStep.toFixed(1)} m
            </span>
          </div>
          <div style={{ 
            color: '#95a5a6',
            fontSize: '12px',
            marginTop: '4px'
          }}>
            Distance between path points (lower = more detailed)
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid #34495e',
        backgroundColor: '#2c3e50',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            backgroundColor: '#34495e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleStartSelection}
          style={{
            padding: '10px 24px',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>Select Roads on Map</span>
          <span>→</span>
        </button>
      </div>
    </>
  );

  // Selection steps don't show dialog - user clicks directly on map
  const renderSelectionStep = () => null;

  const renderComputingStep = () => (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #34495e',
        borderTop: '4px solid #3498db',
        borderRadius: '50%',
        margin: '0 auto 24px',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ color: 'white', fontSize: '18px', fontWeight: '600' }}>
        Computing Turn Path...
      </div>
      <div style={{ color: '#95a5a6', fontSize: '14px', marginTop: '8px' }}>
        Calculating curvature-bounded path
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      />

      {/* Dialog */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#1a252f',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'hidden',
          zIndex: 9999
        }}
      >
        {currentStep === 'profile' && renderProfileStep()}
        {currentStep === 'computing' && renderComputingStep()}
      </div>
    </>
  );
}

