import { useState, useEffect } from 'react';

export default function SpeedManagementViewer({ roadId, onClose }) {
  const [lanes, setLanes] = useState([]);
  const [speedLimits, setSpeedLimits] = useState([]);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newSpeed, setNewSpeed] = useState({ series_id: '', max_speed_kmh: '', from_measure: '0', to_measure: '' });
  const [totalRoadLength, setTotalRoadLength] = useState(0);

  useEffect(() => {
    if (roadId) {
      fetchSpeedData();
    }
  }, [roadId]);

  const fetchSpeedData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/road-speed-limits?road_id=${roadId}`);
      if (!response.ok) throw new Error('Failed to fetch speed data');
      const data = await response.json();
      setLanes(data.lanes || []);
      setVehicleModels(data.vehicleModels || []);
      
      // Calculate total road length
      const totalLength = (data.lanes || []).reduce((sum, lane) => sum + (lane.length_m || 0), 0);
      setTotalRoadLength(totalLength);
      setNewSpeed(prev => ({ ...prev, to_measure: totalLength.toFixed(1) }));
      
      // Group speed limits by road segment (from_measure to to_measure) and vehicle
      // Display at road level, not per lane
      const roadLevelLimits = (data.speedLimits || []).reduce((acc, limit) => {
        const key = `${limit.series_id}_${limit.from_measure}_${limit.to_measure}`;
        if (!acc[key]) {
          acc[key] = { ...limit };
        }
        return acc;
      }, {});
      
      setSpeedLimits(Object.values(roadLevelLimits));
    } catch (error) {
      console.error('Error fetching speed data:', error);
      alert('Failed to load speed data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (speedLimit) => {
    // Validate against lane length
    const lane = lanes.find(l => l.lane_id === speedLimit.lane_id);
    const toMeasure = speedLimit.to_measure ? parseFloat(speedLimit.to_measure) : null;
    
    if (toMeasure && lane && toMeasure > lane.length_m) {
      alert(`To measure (${toMeasure}m) cannot exceed lane length (${lane.length_m.toFixed(1)}m)`);
      return;
    }
    
    try {
      const response = await fetch('/api/road-speed-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speed_limit_id: speedLimit.speed_limit_id,
          max_speed_kmh: parseFloat(speedLimit.max_speed_kmh),
          from_measure: speedLimit.from_measure ? parseFloat(speedLimit.from_measure) : null,
          to_measure: toMeasure
        })
      });
      if (!response.ok) throw new Error('Failed to update speed limit');
      setEditingId(null);
      fetchSpeedData();
    } catch (error) {
      console.error('Error saving speed limit:', error);
      alert('Failed to save: ' + error.message);
    }
  };

  const handleDelete = async (speedLimitId) => {
    if (!confirm('Are you sure you want to delete this speed limit?')) return;
    try {
      const response = await fetch(`/api/road-speed-limits?speed_limit_id=${speedLimitId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete speed limit');
      fetchSpeedData();
    } catch (error) {
      console.error('Error deleting speed limit:', error);
      alert('Failed to delete: ' + error.message);
    }
  };

  const handleAdd = async () => {
    if (!newSpeed.series_id || !newSpeed.max_speed_kmh) {
      alert('Please fill in all required fields');
      return;
    }
    
    const fromMeasure = newSpeed.from_measure ? parseFloat(newSpeed.from_measure) : 0;
    const toMeasure = newSpeed.to_measure ? parseFloat(newSpeed.to_measure) : totalRoadLength;
    
    // Validate against total road length
    if (toMeasure > totalRoadLength) {
      alert(`To measure (${toMeasure}m) cannot exceed total road length (${totalRoadLength.toFixed(1)}m)`);
      return;
    }
    
    if (fromMeasure >= toMeasure) {
      alert('From measure must be less than To measure');
      return;
    }
    
    try {
      // Add speed limit for ALL lanes on this road
      const response = await fetch('/api/road-speed-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          road_id: roadId,
          apply_to_all_lanes: true, // New flag to indicate road-level operation
          series_id: parseInt(newSpeed.series_id),
          max_speed_kmh: parseFloat(newSpeed.max_speed_kmh),
          from_measure: fromMeasure,
          to_measure: toMeasure
        })
      });
      if (!response.ok) throw new Error('Failed to create speed limit');
      
      // Reset form
      setNewSpeed({ series_id: '', max_speed_kmh: '', from_measure: '0', to_measure: totalRoadLength.toFixed(1) });
      fetchSpeedData();
    } catch (error) {
      console.error('Error adding speed limit:', error);
      alert('Failed to add: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        color: 'white'
      }}>
        <div>Loading speed management data...</div>
      </div>
    );
  }

  // Group speed limits by road segment (from/to) and vehicle
  const speedSegments = speedLimits.reduce((acc, sl) => {
    const key = `${sl.from_measure}_${sl.to_measure}_${sl.series_id}`;
    if (!acc[key]) {
      acc[key] = sl;
    }
    return acc;
  }, {});

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px',
      overflow: 'auto',
      color: 'white'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#4ECDC4' }}>Speed Management - Road ID: {roadId}</h2>
        <button
          onClick={onClose}
          style={{
            background: '#E74C3C',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Add new speed limit */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'rgba(52, 152, 219, 0.1)', borderRadius: '6px', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
        <h3 style={{ marginTop: 0, color: '#4ECDC4' }}>Add Speed Limit (Road Level - Total Length: {totalRoadLength.toFixed(1)}m)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          <select
            value={newSpeed.series_id}
            onChange={(e) => setNewSpeed({ ...newSpeed, series_id: e.target.value })}
            style={{ padding: '8px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
          >
            <option value="">Select Vehicle Model</option>
            {vehicleModels.map(vm => (
              <option key={vm.series_id} value={vm.series_id}>
                {vm.manufacturer} {vm.model_name}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Max Speed (km/h)"
            value={newSpeed.max_speed_kmh}
            onChange={(e) => setNewSpeed({ ...newSpeed, max_speed_kmh: e.target.value })}
            style={{ padding: '8px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
          />
          <input
            type="number"
            placeholder="Road Start (m)"
            value={newSpeed.from_measure}
            onChange={(e) => setNewSpeed({ ...newSpeed, from_measure: e.target.value })}
            style={{ padding: '8px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
          />
          <input
            type="number"
            placeholder={`Road End (m, max: ${totalRoadLength.toFixed(1)})`}
            value={newSpeed.to_measure}
            onChange={(e) => setNewSpeed({ ...newSpeed, to_measure: e.target.value })}
            max={totalRoadLength}
            style={{ padding: '8px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
          />
        </div>
        <button
          onClick={handleAdd}
          style={{
            background: '#27AE60',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          + Add Speed Limit
        </button>
      </div>

      {/* Display speed limits by lane */}
      {lanes.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#95a5a6' }}>
          No lane segments found for this road.
        </div>
      ) : (
        lanes.map(lane => {
          const laneSpeeds = speedByLane[lane.lane_id] || [];
          return (
            <div key={lane.lane_id} style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'rgba(44, 62, 80, 0.5)', borderRadius: '6px', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
              <h3 style={{ marginTop: 0, color: '#4ECDC4' }}>
                {lane.lane_id} 
                <span style={{ fontSize: '14px', color: '#95a5a6', marginLeft: '10px' }}>
                  ({lane.length_m?.toFixed(1)}m, {lane.source})
                </span>
              </h3>
                {Object.values(speedSegments).map(sl => (
                  <tr key={sl.speed_limit_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <td style={{ padding: '10px' }}>
                      {editingId === sl.speed_limit_id ? (
                        <input
                          type="number"
                          value={sl.from_measure || 0}
                          onChange={(e) => {
                            const updated = speedLimits.map(s => 
                              s.speed_limit_id === sl.speed_limit_id 
                                ? { ...s, from_measure: e.target.value }
                                : s
                            );
                            setSpeedLimits(updated);
                          }}
                          style={{ width: '80px', padding: '4px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
                        />
                      ) : (
                        (sl.from_measure || 0).toFixed(2)
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {editingId === sl.speed_limit_id ? (
                        <input
                          type="number"
                          value={sl.to_measure || totalRoadLength}
                          onChange={(e) => {
                            const updated = speedLimits.map(s => 
                              s.speed_limit_id === sl.speed_limit_id 
                                ? { ...s, to_measure: e.target.value }
                                : s
                            );
                            setSpeedLimits(updated);
                          }}
                          max={totalRoadLength}
                          style={{ width: '80px', padding: '4px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
                        />
                      ) : (
                        (sl.to_measure || totalRoadLength).toFixed(2)
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 'bold' }}>{sl.manufacturer} {sl.model_name}</div>
                    </td>
                        <td style={{ padding: '10px' }}>
                          {editingId === sl.speed_limit_id ? (
                            <input
                              type="number"
                              value={sl.max_speed_kmh}
                              onChange={(e) => {
                                const updated = speedLimits.map(s => 
                                  s.speed_limit_id === sl.speed_limit_id 
                                    ? { ...s, max_speed_kmh: e.target.value }
                                    : s
                                );
                                setSpeedLimits(updated);
                              }}
                              style={{ width: '80px', padding: '4px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
                            />
                          ) : (
                            sl.max_speed_kmh
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {editingId === sl.speed_limit_id ? (
                            <input
                              type="number"
                              value={sl.from_measure || 0}
                              onChange={(e) => {
                                const updated = speedLimits.map(s => 
                                  s.speed_limit_id === sl.speed_limit_id 
                                    ? { ...s, from_measure: e.target.value }
                                    : s
                                );
                                setSpeedLimits(updated);
                              }}
                              style={{ width: '80px', padding: '4px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
                            />
                          ) : (
                            sl.from_measure || 0
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {editingId === sl.speed_limit_id ? (
                            <input
                              type="number"
                              value={sl.to_measure || ''}
                              onChange={(e) => {
                                const updated = speedLimits.map(s => 
                                  s.speed_limit_id === sl.speed_limit_id 
                                    ? { ...s, to_measure: e.target.value }
                                    : s
                                );
                                setSpeedLimits(updated);
                              }}
                              style={{ width: '80px', padding: '4px', borderRadius: '4px', backgroundColor: '#2c3e50', color: 'white', border: '1px solid #34495e' }}
                            />
                          ) : (
                            sl.to_measure || 'Full length'
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {editingId === sl.speed_limit_id ? (
                            <>
                              <button
                                onClick={() => handleSave(sl)}
                                style={{ marginRight: '5px', padding: '5px 10px', background: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                ✓ Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  fetchSpeedData();
                                }}
                                style={{ padding: '5px 10px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                ✕ Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditingId(sl.speed_limit_id)}
                                style={{ marginRight: '5px', padding: '5px 10px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                ✏ Edit
                              </button>
                              <button
                                onClick={() => handleDelete(sl.speed_limit_id)}
                                style={{ padding: '5px 10px', background: '#E74C3C', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                🗑 Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

