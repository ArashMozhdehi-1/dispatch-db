import { useState, useEffect } from 'react';

const REFERENCE_ELEVATION = 711; // meters

export default function RoadProfileViewer({ roadId, onClose }) {
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (roadId) {
      fetchConditions();
    }
  }, [roadId]);

  const fetchConditions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/lane-conditions?roadId=${roadId}`);
      if (!response.ok) throw new Error('Failed to fetch conditions');
      const data = await response.json();
      setConditions(data);
    } catch (error) {
      console.error('Error fetching conditions:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateElevation = (distance, slope) => {
    // Elevation = reference + (distance * slope / 100)
    // slope is in percentage, so divide by 100
    return REFERENCE_ELEVATION + (distance * parseFloat(slope) / 100);
  };

  const generateProfileData = () => {
    if (!conditions.length) return [];

    // Group by lane_id and sort by start_measure
    const laneGroups = {};
    conditions.forEach(cond => {
      if (!laneGroups[cond.lane_id]) {
        laneGroups[cond.lane_id] = [];
      }
      laneGroups[cond.lane_id].push(cond);
    });

    // Generate points for each lane
    const profileData = [];
    Object.keys(laneGroups).forEach(laneId => {
      const laneConditions = laneGroups[laneId].sort((a, b) => a.start_measure - b.start_measure);
      let currentDistance = 0;
      let currentElevation = REFERENCE_ELEVATION;

      laneConditions.forEach((cond, idx) => {
        const startDist = cond.start_measure;
        const endDist = cond.end_measure;
        const slope = parseFloat(cond.condition_value);

        // Calculate elevation at start
        if (idx === 0) {
          currentElevation = REFERENCE_ELEVATION;
        } else {
          // Calculate elevation based on previous segment
          const prevCond = laneConditions[idx - 1];
          const prevSlope = parseFloat(prevCond.condition_value);
          const prevDist = prevCond.end_measure - prevCond.start_measure;
          currentElevation = calculateElevation(prevDist, prevSlope);
        }

        // Add start point
        profileData.push({
          distance: startDist,
          elevation: currentElevation,
          lane_id: laneId,
          condition_id: cond.condition_id
        });

        // Calculate elevation at end
        const segmentDist = endDist - startDist;
        const endElevation = currentElevation + (segmentDist * slope / 100);

        // Add end point
        profileData.push({
          distance: endDist,
          elevation: endElevation,
          lane_id: laneId,
          condition_id: cond.condition_id
        });

        currentElevation = endElevation;
      });
    });

    return profileData.sort((a, b) => a.distance - b.distance);
  };

  const handleEdit = (condition) => {
    setEditingId(condition.condition_id);
    setEditValue(condition.condition_value);
  };

  const handleSave = async (conditionId) => {
    try {
      setSaving(true);
      const response = await fetch('/api/lane-conditions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          condition_id: conditionId,
          condition_value: editValue
        })
      });

      if (!response.ok) throw new Error('Failed to update');
      
      // Refresh conditions
      await fetchConditions();
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving condition:', error);
      alert('Failed to save slope value');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  const profileData = generateProfileData();
  const maxDistance = Math.max(...conditions.map(c => c.end_measure), 0);
  const minElevation = Math.min(...profileData.map(p => p.elevation), REFERENCE_ELEVATION - 50);
  const maxElevation = Math.max(...profileData.map(p => p.elevation), REFERENCE_ELEVATION + 50);

  // Simple SVG chart
  const chartWidth = 800;
  const chartHeight = 400;
  const padding = 60;
  const plotWidth = chartWidth - 2 * padding;
  const plotHeight = chartHeight - 2 * padding;

  const scaleX = (distance) => padding + (distance / maxDistance) * plotWidth;
  const scaleY = (elevation) => padding + plotHeight - ((elevation - minElevation) / (maxElevation - minElevation)) * plotHeight;

  // Generate path for elevation profile
  const pathData = profileData.length > 0
    ? profileData.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.distance)} ${scaleY(p.elevation)}`).join(' ')
    : '';

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 10003,
      backgroundColor: 'rgba(30, 30, 30, 0.98)',
      border: '2px solid rgba(120, 120, 120, 0.6)',
      borderRadius: '8px',
      padding: '24px',
      color: 'white',
      fontSize: '14px',
      minWidth: '900px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      overflow: 'auto',
      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#4ECDC4' }}>Road Profile for Road {roadId}</h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#bdc3c7',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '0 8px'
          }}
        >
          ×
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#bdc3c7' }}>Loading profile data...</div>
      ) : conditions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#bdc3c7' }}>
          No slope data found for this road.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'rgba(52, 152, 219, 0.1)', borderRadius: '4px' }}>
            <div style={{ color: '#bdc3c7', fontSize: '12px' }}>Reference Elevation:</div>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{REFERENCE_ELEVATION} m</div>
          </div>

          {/* Elevation Profile Chart */}
          <div style={{ marginBottom: '24px', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', padding: '16px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#4ECDC4' }}>Elevation Profile</h3>
            <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => (
                <g key={`grid-${t}`}>
                  <line
                    x1={padding}
                    y1={padding + t * plotHeight}
                    x2={padding + plotWidth}
                    y2={padding + t * plotHeight}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="1"
                  />
                  <line
                    x1={padding + t * plotWidth}
                    y1={padding}
                    x2={padding + t * plotWidth}
                    y2={padding + plotHeight}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="1"
                  />
                </g>
              ))}

              {/* Axes */}
              <line
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + plotHeight}
                stroke="white"
                strokeWidth="2"
              />
              <line
                x1={padding}
                y1={padding + plotHeight}
                x2={padding + plotWidth}
                y2={padding + plotHeight}
                stroke="white"
                strokeWidth="2"
              />

              {/* Axis labels */}
              <text x={padding - 10} y={padding + plotHeight / 2} fill="white" textAnchor="end" fontSize="12">
                Elevation (m)
              </text>
              <text x={padding + plotWidth / 2} y={chartHeight - 10} fill="white" textAnchor="middle" fontSize="12">
                Distance (m)
              </text>

              {/* Elevation labels */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const elevation = minElevation + (1 - t) * (maxElevation - minElevation);
                return (
                  <text
                    key={`elev-${t}`}
                    x={padding - 15}
                    y={padding + t * plotHeight + 4}
                    fill="white"
                    textAnchor="end"
                    fontSize="10"
                  >
                    {elevation.toFixed(1)}
                  </text>
                );
              })}

              {/* Distance labels */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const distance = t * maxDistance;
                return (
                  <text
                    key={`dist-${t}`}
                    x={padding + t * plotWidth}
                    y={chartHeight - 20}
                    fill="white"
                    textAnchor="middle"
                    fontSize="10"
                  >
                    {distance.toFixed(0)}
                  </text>
                );
              })}

              {/* Profile line */}
              {pathData && (
                <path
                  d={pathData}
                  fill="none"
                  stroke="#4ECDC4"
                  strokeWidth="3"
                />
              )}

              {/* Data points */}
              {profileData.map((point, idx) => (
                <circle
                  key={`point-${idx}`}
                  cx={scaleX(point.distance)}
                  cy={scaleY(point.elevation)}
                  r="4"
                  fill="#FFD700"
                  stroke="#FFA500"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>

          {/* Slope Segments Table */}
          <div>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#4ECDC4' }}>Slope Segments</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(52, 152, 219, 0.2)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Lane ID</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Start (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>End (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Slope (%)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Elevation at Start (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Elevation at End (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.map((cond, idx) => {
                    const startElevation = idx === 0 
                      ? REFERENCE_ELEVATION 
                      : calculateElevation(conditions[idx - 1].end_measure - conditions[idx - 1].start_measure, conditions[idx - 1].condition_value);
                    const endElevation = calculateElevation(cond.end_measure - cond.start_measure, cond.condition_value);

                    return (
                      <tr key={cond.condition_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>{cond.lane_id}</td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>{cond.start_measure.toFixed(2)}</td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>{cond.end_measure.toFixed(2)}</td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          {editingId === cond.condition_id ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              step="0.1"
                              style={{
                                width: '80px',
                                padding: '4px',
                                borderRadius: '4px',
                                border: '1px solid #555',
                                backgroundColor: '#2c2c2c',
                                color: 'white'
                              }}
                            />
                          ) : (
                            <span style={{ color: parseFloat(cond.condition_value) >= 0 ? '#2ECC71' : '#E74C3C' }}>
                              {parseFloat(cond.condition_value).toFixed(2)}%
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          {startElevation.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          {endElevation.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          {editingId === cond.condition_id ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => handleSave(cond.condition_id)}
                                disabled={saving}
                                style={{
                                  padding: '4px 8px',
                                  background: '#2ECC71',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: saving ? 'not-allowed' : 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={handleCancel}
                                style={{
                                  padding: '4px 8px',
                                  background: '#95a5a6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEdit(cond)}
                              style={{
                                padding: '4px 8px',
                                background: '#3498db',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}





