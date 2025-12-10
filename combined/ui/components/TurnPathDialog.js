import React, { useState, useEffect } from 'react';

export default function TurnPathDialog({
  isOpen,
  onClose,
  onStartSelection,
  vehicleProfiles = {},
  currentStep = 'profile',
}) {
  const defaultVehicleProfiles = {
    komatsu_830e: {
      name: 'Komatsu 830E',
      vehicle_width_m: 7.3,
      wheelbase_m: 6.35,
      min_turn_radius_m: 10.2,
      max_steering_angle_deg: 32,
    },
  };

  const [selectedProfile, setSelectedProfile] = useState('komatsu_830e');
  const [useCustom, setUseCustom] = useState(false);
  const [customValues, setCustomValues] = useState({
    name: 'Custom Vehicle',
    vehicle_width_m: 7.3,
    wheelbase_m: 6.35,
    max_steering_angle_deg: 32.0,
    side_buffer_m: 0.5,
    front_buffer_m: 1.0,
    rear_buffer_m: 1.0,
  });
  const [samplingStep, setSamplingStep] = useState(1.0);

  useEffect(() => {
    if (!isOpen) return;
    const profiles =
      Object.keys(vehicleProfiles).length > 0 ? vehicleProfiles : defaultVehicleProfiles;
    if (!profiles[selectedProfile]) {
      const first = Object.keys(profiles)[0];
      setSelectedProfile(first);
    }
  }, [isOpen, vehicleProfiles, selectedProfile]);

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === 'Escape' && isOpen) onClose?.();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  const shouldShow = currentStep === 'profile' || currentStep === 'computing';
  if (!isOpen || !shouldShow) return null;

  const profilesToShow =
    Object.keys(vehicleProfiles).length > 0 ? vehicleProfiles : defaultVehicleProfiles;

  const handleStartSelection = () => {
    const config = {
      vehicle_profile_id: useCustom ? null : selectedProfile,
      custom_vehicle_profile: useCustom ? customValues : null,
      sampling_step_m: samplingStep,
    };
    onStartSelection?.(config);
  };

  const renderProfileStep = () => (
    <>
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

      <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '12px',
            }}
          >
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
                transition: 'all 0.2s',
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
                transition: 'all 0.2s',
              }}
            >
              Custom Values
            </button>
          </div>

          {!useCustom && (
            <div>
              {Object.entries(profilesToShow).map(([key, profile]) => (
                <div
                  key={key}
                  onClick={() => setSelectedProfile(key)}
                  style={{
                    padding: '16px',
                    marginBottom: '8px',
                    backgroundColor: selectedProfile === key ? '#2c3e50' : '#34495e',
                    border:
                      selectedProfile === key ? '2px solid #3498db' : '2px solid transparent',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {profile.name}
                    </span>
                    {selectedProfile === key && (
                      <span style={{ color: '#3498db', fontSize: '18px' }}>✓</span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontSize: '13px',
                      color: '#95a5a6',
                    }}
                  >
                    <div>Width: {profile.vehicle_width_m}m</div>
                    <div>Wheelbase: {profile.wheelbase_m}m</div>
                    <div>Turn Radius: {profile.min_turn_radius_m.toFixed(1)}m</div>
                    <div>Max Steer: {profile.max_steering_angle_deg}°</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {useCustom && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#95a5a6', fontSize: '13px' }}>
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
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#95a5a6', fontSize: '13px' }}>
                  Vehicle Width (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={customValues.vehicle_width_m}
                  onChange={(e) =>
                    setCustomValues({ ...customValues, vehicle_width_m: parseFloat(e.target.value) })
                  }
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#95a5a6', fontSize: '13px' }}>
                  Wheelbase (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={customValues.wheelbase_m}
                  onChange={(e) =>
                    setCustomValues({ ...customValues, wheelbase_m: parseFloat(e.target.value) })
                  }
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#95a5a6', fontSize: '13px' }}>
                  Max Steering Angle (degrees)
                </label>
                <input
                  type="number"
                  step="1"
                  value={customValues.max_steering_angle_deg}
                  onChange={(e) =>
                    setCustomValues({
                      ...customValues,
                      max_steering_angle_deg: parseFloat(e.target.value),
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#95a5a6', fontSize: '13px' }}>
                  Side Safety Buffer (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={customValues.side_buffer_m}
                  onChange={(e) =>
                    setCustomValues({ ...customValues, side_buffer_m: parseFloat(e.target.value) })
                  }
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#34495e',
                    border: '1px solid #2c3e50',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#2c3e50',
                  borderRadius: '6px',
                  border: '1px solid #3498db',
                }}
              >
                <div style={{ color: '#95a5a6', fontSize: '13px', marginBottom: '4px' }}>
                  Calculated Min Turn Radius
                </div>
                <div style={{ color: '#3498db', fontSize: '18px', fontWeight: '600' }}>
                  {(
                    customValues.wheelbase_m /
                    Math.tan((customValues.max_steering_angle_deg * Math.PI) / 180)
                  ).toFixed(2)}{' '}
                  m
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label
            style={{
              display: 'block',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '12px',
            }}
          >
            Path Resolution
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={samplingStep}
              onChange={(e) => setSamplingStep(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ color: 'white', fontSize: '14px', fontWeight: '600' }}>
              {samplingStep.toFixed(1)} m
            </span>
          </div>
          <div style={{ color: '#95a5a6', fontSize: '12px', marginTop: '6px' }}>
            Distance between path points (lower = more detailed)
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #34495e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#1f2b38',
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: '10px 16px',
            backgroundColor: '#34495e',
            color: 'white',
            border: '1px solid #2c3e50',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleStartSelection}
          style={{
            padding: '10px 16px',
            backgroundColor: '#1abc9c',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            minWidth: '200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          Select Roads on Map →
        </button>
      </div>
    </>
  );

  const renderComputingStep = () => (
    <div style={{ padding: '32px', textAlign: 'center' }}>
      <div
        style={{
          marginBottom: '12px',
          fontSize: '18px',
          color: 'white',
          fontWeight: '600',
        }}
      >
        Computing turn path...
      </div>
      <div style={{ color: '#95a5a6', fontSize: '14px' }}>
        This usually takes a few seconds. Please wait.
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          width: '640px',
          backgroundColor: '#1f2b38',
          borderRadius: '10px',
          boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          border: '1px solid #2c3e50',
        }}
      >
        {currentStep === 'computing' ? renderComputingStep() : renderProfileStep()}
      </div>
    </div>
  );
}

