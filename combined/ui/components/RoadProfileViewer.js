import { useState, useEffect } from 'react';

const REFERENCE_ELEVATION = 711; // meters

export default function RoadProfileViewer({ roadId, onClose }) {
  const [conditions, setConditions] = useState([]);
  const [totalRoadLength, setTotalRoadLength] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [splittingId, setSplittingId] = useState(null);
  const [splitPoint, setSplitPoint] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newSegment, setNewSegment] = useState({ lane_id: '', start_measure: '', end_measure: '', condition_value: '' });

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
      // Handle both old format (array) and new format (object with conditions and total_road_length)
      if (Array.isArray(data)) {
        setConditions(data);
        setTotalRoadLength(0); // Will calculate from conditions
      } else {
        setConditions(data.conditions || []);
        setTotalRoadLength(Number(data.total_road_length || 0));
      }
    } catch (error) {
      console.error('Error fetching conditions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to calculate elevation at a given cumulative road distance
  // This properly maps lane segment conditions to cumulative road distance
  const calculateElevationAtDistance = (cumulativeDistance, allConditions) => {
    let elevation = REFERENCE_ELEVATION;
    let currentDistance = 0;

    // Use adjusted conditions (already normalized, gap-free)
    const laneGroups = {};
    allConditions.forEach(cond => {
      if (!laneGroups[cond.lane_id]) laneGroups[cond.lane_id] = [];
      laneGroups[cond.lane_id].push(cond);
    });

    const laneEntries = Object.entries(laneGroups).map(([laneId, conds]) => {
      const match = (laneId || '').match(/road_\d+_(\d+)_/);
      const segNum = match ? parseInt(match[1], 10) : 999;
      const laneLength = Math.max(...conds.map(c => Number(c.adj_end) || 0), 0);
      return { laneId, conds, segNum, laneLength };
    }).sort((a, b) => a.segNum - b.segNum);

    for (const { conds, laneLength } of laneEntries) {
      const sortedConds = conds.sort((a, b) => a.adj_start - b.adj_start);
      const laneStartDistance = currentDistance;

      for (const cond of sortedConds) {
        const condStartDist = laneStartDistance + (Number(cond.adj_start) || 0);
        const condEndDist = laneStartDistance + (Number(cond.adj_end) || 0);
        const slope = Number(cond.condition_value) || 0;

        if (cumulativeDistance >= condStartDist && cumulativeDistance <= condEndDist) {
          const distInCondition = cumulativeDistance - condStartDist;
          elevation = elevation + (distInCondition * slope / 100);
          return elevation;
        } else if (cumulativeDistance > condEndDist) {
          const condLength = condEndDist - condStartDist;
          elevation = elevation + (condLength * slope / 100);
        }
      }

      currentDistance += laneLength;
      if (currentDistance >= cumulativeDistance) break;
    }

    return elevation;
  };

  const normalizeConditions = (conds) => {
    if (!conds.length) return [];
    const laneGroups = {};
    conds.forEach(c => {
      const start = Number(c.start_measure) || 0;
      const end = Number(c.end_measure) || 0;
      const slope = Number(c.condition_value) || 0;
      const len = Number(c.lane_length) || 0;
      const normalized = { ...c, start_measure: start, end_measure: end, condition_value: slope, lane_length: len };
      if (!laneGroups[c.lane_id]) laneGroups[c.lane_id] = [];
      laneGroups[c.lane_id].push(normalized);
    });

    // lane order
    const laneEntries = Object.entries(laneGroups).map(([laneId, list]) => {
      const match = (laneId || '').match(/road_\d+_(\d+)_/);
      const segNum = match ? parseInt(match[1], 10) : 999;
      return { laneId, list, segNum };
    }).sort((a, b) => a.segNum - b.segNum);

    const laneStarts = new Map();
    let cumulativeLane = 0;
    const adjusted = [];

    laneEntries.forEach(({ laneId, list }) => {
      laneStarts.set(laneId, cumulativeLane);
      const sorted = list.sort((a, b) => a.start_measure - b.start_measure);
      let cur = 0;
      sorted.forEach(cond => {
        const length = Math.max(0, cond.end_measure - cond.start_measure);
        const adjStart = cur;
        const adjEnd = adjStart + length;
        adjusted.push({
          ...cond,
          adj_start: adjStart,
          adj_end: adjEnd,
          road_start: cumulativeLane + adjStart,
          road_end: cumulativeLane + adjEnd,
        });
        cur = adjEnd;
      });
      const laneLen = Number(list[0]?.lane_length) || cur;
      cumulativeLane += laneLen;
    });

    return { adjusted, totalLength: cumulativeLane };
  };

  const normalized = normalizeConditions(conditions);
  const adjustedConds = normalized?.adjusted || [];
  const effectiveTotalLength = totalRoadLength > 0 ? totalRoadLength : (normalized?.totalLength || 0);

  const generateProfileData = () => {
    if (!adjustedConds.length && effectiveTotalLength === 0) return [];

    const distancePoints = new Set([0, effectiveTotalLength]);
    adjustedConds.forEach(c => {
      distancePoints.add(c.road_start);
      distancePoints.add(c.road_end);
    });

    const sortedDistances = Array.from(distancePoints).sort((a, b) => a - b);
    const result = [];
    sortedDistances.forEach(distance => {
      const match = adjustedConds.find(c => distance >= c.road_start && distance <= c.road_end);
      const elevation = calculateElevationAtDistance(distance, adjustedConds);
      result.push({
        distance,
        elevation,
        lane_id: match?.lane_id || null,
        condition_id: match?.condition_id || null,
      });
    });

    return result;
  };

  const handleEdit = (condition) => {
    setEditingId(condition.condition_id);
    setEditValue(condition.condition_value);
  };

  const handleSave = async (conditionId) => {
    try {
      setSaving(true);
      
      // Validate the input
      const value = parseFloat(editValue);
      if (isNaN(value)) {
        alert('Please enter a valid number for the slope');
        return;
      }

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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update');
      }
      
      const result = await response.json();
      console.log('Successfully updated condition:', result);
      
      // Refresh conditions to get updated data
      await fetchConditions();
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving condition:', error);
      alert(`Failed to save slope value: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue('');
    setSplittingId(null);
    setSplitPoint('');
    setAddingNew(false);
    setNewSegment({ lane_id: '', start_measure: '', end_measure: '', condition_value: '' });
  };

  const handleSplit = async (condition) => {
    const splitValue = parseFloat(splitPoint);
    if (isNaN(splitValue) || splitValue <= condition.start_measure || splitValue >= condition.end_measure) {
      alert('Please enter a valid split point between start and end measures');
      return;
    }

    try {
      setSaving(true);
      
      // Create first segment: start to split point
      const response1 = await fetch('/api/lane-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lane_id: condition.lane_id,
          start_measure: condition.start_measure,
          end_measure: splitValue,
          condition_value: condition.condition_value
        })
      });

      // Create second segment: split point to end
      const response2 = await fetch('/api/lane-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lane_id: condition.lane_id,
          start_measure: splitValue,
          end_measure: condition.end_measure,
          condition_value: condition.condition_value
        })
      });

      if (!response1.ok || !response2.ok) {
        throw new Error('Failed to create split segments');
      }

      // Delete original segment
      await fetch('/api/lane-conditions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition_id: condition.condition_id })
      });

      await fetchConditions();
      setSplittingId(null);
      setSplitPoint('');
    } catch (error) {
      console.error('Error splitting condition:', error);
      alert(`Failed to split segment: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (conditionId) => {
    if (!confirm('Are you sure you want to delete this slope segment?')) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/lane-conditions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition_id: conditionId })
      });

      if (!response.ok) throw new Error('Failed to delete');
      
      await fetchConditions();
    } catch (error) {
      console.error('Error deleting condition:', error);
      alert(`Failed to delete segment: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const { lane_id, start_measure, end_measure, condition_value } = newSegment;
    
    if (!lane_id || !start_measure || !end_measure || !condition_value) {
      alert('Please fill in all fields');
      return;
    }

    const start = parseFloat(start_measure);
    const end = parseFloat(end_measure);
    const value = parseFloat(condition_value);

    if (isNaN(start) || isNaN(end) || isNaN(value)) {
      alert('Please enter valid numbers');
      return;
    }

    if (start >= end) {
      alert('Start measure must be less than end measure');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/lane-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lane_id,
          start_measure: start,
          end_measure: end,
          condition_value: value
        })
      });

      if (!response.ok) throw new Error('Failed to create');
      
      await fetchConditions();
      setAddingNew(false);
      setNewSegment({ lane_id: '', start_measure: '', end_measure: '', condition_value: '' });
    } catch (error) {
      console.error('Error adding condition:', error);
      alert(`Failed to add segment: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const profileData = generateProfileData();

  // Distance domain: from lowest road start to highest road end
  const minDistance = profileData.length
    ? Math.min(...profileData.map(p => p.distance))
    : 0;
  const maxDistance = profileData.length
    ? Math.max(...profileData.map(p => p.distance))
    : 0;

  // Elevation range based on actual profile, with a fallback band
  const minElevation = profileData.length
    ? Math.min(...profileData.map(p => p.elevation))
    : REFERENCE_ELEVATION - 50;

  const maxElevation = profileData.length
    ? Math.max(...profileData.map(p => p.elevation))
    : REFERENCE_ELEVATION + 50;

  // Simple SVG chart
  const chartWidth = 800;
  const chartHeight = 400;
  const padding = 60;
  const plotWidth = chartWidth - 2 * padding;
  const plotHeight = chartHeight - 2 * padding;

  const elevationRange = maxElevation - minElevation || 1; // avoid divide by zero
  const distanceRange = maxDistance - minDistance || 1;

  const scaleX = (distance) =>
    padding +
    ((distance - minDistance) / distanceRange) * plotWidth;

  const scaleY = (elevation) =>
    padding +
    plotHeight -
    ((elevation - minElevation) / elevationRange) * plotHeight;

  // Generate path data for the profile line
  const pathData = profileData.length > 0
    ? `M ${profileData.map(p => `${scaleX(p.distance)},${scaleY(p.elevation)}`).join(' L ')}`
    : null;

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
        <div>Loading road profile...</div>
      </div>
    );
  }

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
        <h2 style={{ margin: 0, color: '#4ECDC4' }}>Road Profile - Road ID: {roadId}</h2>
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

      {conditions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#95a5a6' }}>
          No slope conditions found for this road.
          <div style={{ marginTop: '16px', display: 'inline-block', textAlign: 'left', background: 'rgba(30,30,30,0.8)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ marginBottom: '8px', color: '#fff' }}>Add first segment</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="lane_id"
                value={newSegment.lane_id || `road_${roadId}_0_forward`}
                onChange={(e) => setNewSegment({ ...newSegment, lane_id: e.target.value })}
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: '#fff' }}
              />
              <input
                type="number"
                placeholder="Start (m)"
                value={newSegment.start_measure}
                onChange={(e) => setNewSegment({ ...newSegment, start_measure: e.target.value })}
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: '#fff', width: '110px' }}
              />
              <input
                type="number"
                placeholder="End (m)"
                value={newSegment.end_measure}
                onChange={(e) => setNewSegment({ ...newSegment, end_measure: e.target.value })}
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: '#fff', width: '110px' }}
              />
              <input
                type="number"
                placeholder="Slope %"
                value={newSegment.condition_value}
                onChange={(e) => setNewSegment({ ...newSegment, condition_value: e.target.value })}
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: '#fff', width: '110px' }}
              />
              <button
                onClick={() => {
                  const laneDefault = newSegment.lane_id || `road_${roadId}_0_forward`;
                  setNewSegment({ ...newSegment, lane_id: laneDefault });
                  handleAdd();
                }}
                disabled={saving}
                style={{ padding: '8px 12px', background: '#2ECC71', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {saving ? 'Saving...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Elevation Profile Chart */}
          <div style={{ marginBottom: '30px', backgroundColor: 'rgba(30, 30, 30, 0.8)', padding: '20px', borderRadius: '8px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#4ECDC4' }}>Elevation Profile</h3>
            <svg width={chartWidth} height={chartHeight} style={{ border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px' }}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const elevation = minElevation + t * (maxElevation - minElevation);
                return (
                  <line
                    key={`grid-h-${t}`}
                    x1={padding}
                    y1={scaleY(elevation)}
                    x2={chartWidth - padding}
                    y2={scaleY(elevation)}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="1"
                  />
                );
              })}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const distance = minDistance + t * distanceRange;
                return (
                  <line
                    key={`grid-v-${t}`}
                    x1={scaleX(distance)}
                    y1={padding}
                    x2={scaleX(distance)}
                    y2={chartHeight - padding}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Axes */}
              <line
                x1={padding}
                y1={padding}
                x2={padding}
                y2={chartHeight - padding}
                stroke="white"
                strokeWidth="2"
              />
              <line
                x1={padding}
                y1={chartHeight - padding}
                x2={chartWidth - padding}
                y2={chartHeight - padding}
                stroke="white"
                strokeWidth="2"
              />

              {/* Elevation labels */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const elevation = minElevation + t * (maxElevation - minElevation);
                return (
                  <text
                    key={`elev-${t}`}
                    x={padding - 10}
                    y={scaleY(elevation)}
                    fill="white"
                    textAnchor="end"
                    fontSize="10"
                    style={{ dominantBaseline: 'middle' }}
                  >
                    {elevation.toFixed(0)}
                  </text>
                );
              })}

              {/* Distance labels */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const distance = minDistance + t * distanceRange;
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

              {/* Axis labels */}
              <text 
                x={15} 
                y={padding + plotHeight / 2} 
                fill="white" 
                textAnchor="middle" 
                fontSize="12"
                transform={`rotate(-90, 15, ${padding + plotHeight / 2})`}
                style={{ dominantBaseline: 'middle' }}
              >
                Elevation (m)
              </text>
              <text x={padding + plotWidth / 2} y={chartHeight - 10} fill="white" textAnchor="middle" fontSize="12">
                Distance (m)
              </text>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#4ECDC4' }}>Slope Segments</h3>
              <button
                onClick={() => {
                  const firstLane = conditions.length > 0 ? conditions[0].lane_id : `road_${roadId}_0_forward`;
                  setNewSegment({ 
                    lane_id: firstLane, 
                    start_measure: '', 
                    end_measure: '', 
                    condition_value: '' 
                  });
                  setAddingNew(true);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#2ECC71',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                + Add Segment
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(52, 152, 219, 0.2)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Road Start (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Road End (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Slope (%)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Elevation at Start (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Elevation at End (m)</th>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid rgba(255, 255, 255, 0.2)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Sort by lane segment number first, then by start_measure within each lane
                    const sortedConditions = [...conditions].sort((a, b) => {
                      const matchA = (a.lane_id || '').match(/road_\d+_(\d+)_/);
                      const matchB = (b.lane_id || '').match(/road_\d+_(\d+)_/);
                      const segNumA = matchA ? parseInt(matchA[1], 10) : 999;
                      const segNumB = matchB ? parseInt(matchB[1], 10) : 999;
                      if (segNumA !== segNumB) return segNumA - segNumB;
                      if (a.start_measure !== b.start_measure) return a.start_measure - b.start_measure;
                      return a.end_measure - b.end_measure;
                    });
                    
                    const laneCumulativeDistances = new Map();
                    let cumulativeDist = 0;
                    const laneGroups = {};
                    
                    sortedConditions.forEach(cond => {
                      if (!laneGroups[cond.lane_id]) laneGroups[cond.lane_id] = [];
                      laneGroups[cond.lane_id].push(cond);
                    });
                    
                    Object.keys(laneGroups).sort((a, b) => {
                      const matchA = (a || '').match(/road_\d+_(\d+)_/);
                      const matchB = (b || '').match(/road_\d+_(\d+)_/);
                      const segNumA = matchA ? parseInt(matchA[1], 10) : 999;
                      const segNumB = matchB ? parseInt(matchB[1], 10) : 999;
                      return segNumA - segNumB;
                    }).forEach(laneId => {
                      if (!laneCumulativeDistances.has(laneId)) {
                        laneCumulativeDistances.set(laneId, cumulativeDist);
                        const laneLength = Number(laneGroups[laneId][0]?.lane_length) || Math.max(...laneGroups[laneId].map(c => c.end_measure), 0);
                        cumulativeDist += laneLength;
                      }
                    });
                    
                    return sortedConditions.map((cond) => {
                      // Get cumulative road distance for this lane segment
                      const laneStartDist = Number(laneCumulativeDistances.get(cond.lane_id)) || 0;
                      const roadStartDist = laneStartDist + (Number(cond.start_measure) || 0);
                      const roadEndDist = laneStartDist + (Number(cond.end_measure) || 0);
                      
                      // Calculate elevation at these cumulative road distances
                      const startElevation = calculateElevationAtDistance(roadStartDist, adjustedConds);
                      const endElevation = calculateElevationAtDistance(roadEndDist, adjustedConds);

                    return (
                      <tr key={cond.condition_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>{Number(roadStartDist).toFixed(2)}</td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>{Number(roadEndDist).toFixed(2)}</td>
                        <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                            <span style={{ color: '#95a5a6', fontSize: '11px' }}>{cond.lane_id}</span>
                          </div>
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
                          ) : splittingId === cond.condition_id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <input
                                type="number"
                                value={splitPoint}
                                onChange={(e) => setSplitPoint(e.target.value)}
                                placeholder="Split point"
                                step="0.1"
                                style={{
                                  width: '100px',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  border: '1px solid #555',
                                  backgroundColor: '#2c2c2c',
                                  color: 'white',
                                  fontSize: '11px'
                                }}
                              />
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  onClick={() => handleSplit(cond)}
                                  disabled={saving}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#E67E22',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    fontSize: '11px'
                                  }}
                                >
                                  {saving ? 'Splitting...' : 'Split'}
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
                                    fontSize: '11px'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => handleEdit(cond)}
                                style={{
                                  padding: '4px 8px',
                                  background: '#3498db',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px'
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setSplittingId(cond.condition_id)}
                                style={{
                                  padding: '4px 8px',
                                  background: '#E67E22',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px'
                                }}
                              >
                                Split
                              </button>
                              <button
                                onClick={() => handleDelete(cond.condition_id)}
                                disabled={saving}
                                style={{
                                  padding: '4px 8px',
                                  background: '#E74C3C',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: saving ? 'not-allowed' : 'pointer',
                                  fontSize: '11px'
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  });
                  })()}
                  {/* Add new segment row */}
                  {addingNew && (
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(46, 204, 113, 0.1)' }}>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <input
                          type="text"
                          value={newSegment.lane_id}
                          onChange={(e) => setNewSegment({ ...newSegment, lane_id: e.target.value })}
                          placeholder="lane_id"
                          style={{
                            width: '150px',
                            padding: '4px',
                            borderRadius: '4px',
                            border: '1px solid #555',
                            backgroundColor: '#2c2c2c',
                            color: 'white',
                            fontSize: '11px'
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>-</td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>-</td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <input
                          type="number"
                          value={newSegment.start_measure}
                          onChange={(e) => setNewSegment({ ...newSegment, start_measure: e.target.value })}
                          placeholder="Start"
                          step="0.1"
                          style={{
                            width: '80px',
                            padding: '4px',
                            borderRadius: '4px',
                            border: '1px solid #555',
                            backgroundColor: '#2c2c2c',
                            color: 'white',
                            fontSize: '11px'
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <input
                          type="number"
                          value={newSegment.end_measure}
                          onChange={(e) => setNewSegment({ ...newSegment, end_measure: e.target.value })}
                          placeholder="End"
                          step="0.1"
                          style={{
                            width: '80px',
                            padding: '4px',
                            borderRadius: '4px',
                            border: '1px solid #555',
                            backgroundColor: '#2c2c2c',
                            color: 'white',
                            fontSize: '11px'
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <input
                          type="number"
                          value={newSegment.condition_value}
                          onChange={(e) => setNewSegment({ ...newSegment, condition_value: e.target.value })}
                          placeholder="Slope %"
                          step="0.1"
                          style={{
                            width: '80px',
                            padding: '4px',
                            borderRadius: '4px',
                            border: '1px solid #555',
                            backgroundColor: '#2c2c2c',
                            color: 'white',
                            fontSize: '11px'
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>-</td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>-</td>
                      <td style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={handleAdd}
                            disabled={saving}
                            style={{
                              padding: '4px 8px',
                              background: '#2ECC71',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: saving ? 'not-allowed' : 'pointer',
                              fontSize: '11px'
                            }}
                          >
                            {saving ? 'Adding...' : 'Add'}
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
                              fontSize: '11px'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}





