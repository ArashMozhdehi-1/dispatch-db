export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Fetching survey points from GeoServer...');
    
    const { getGeoServerConfig, getAPIConfig } = require('../../lib/config');
    const geoserverConfig = getGeoServerConfig();
    const apiConfig = getAPIConfig();
    const geoserverUrl = geoserverConfig.url;
    const workspace = geoserverConfig.workspace;
    const layerName = 'survey_points';
    
    const wfsUrl = `${geoserverUrl}/${workspace}/wfs?` +
      `service=WFS&` +
      `version=2.0.0&` +
      `request=GetFeature&` +
      `typeName=${workspace}:${layerName}&` +
      `outputFormat=application/json&` +
      `srsName=EPSG:4326&` +
      `maxFeatures=${apiConfig.maxFeatures}`;
    
    console.log(`🌐 Fetching from GeoServer WFS: ${wfsUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    
    const response = await fetch(wfsUrl).catch(err => {
      console.error('❌ GeoServer connection error:', err.message);
      throw new Error(`Cannot connect to GeoServer: ${err.message}`);
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`❌ GeoServer WFS error ${response.status}:`, errorText.substring(0, 500));
      console.error(`❌ Full error:`, errorText);
      return res.status(200).json({
        groups: [],
        total_groups: 0,
        total_coordinates: 0,
        summary: [],
        error: `GeoServer error ${response.status}: ${errorText.substring(0, 200)}`
      });
    }
    
    const wfsData = await response.json().catch(err => {
      console.error('❌ Failed to parse GeoServer response:', err);
      return res.status(200).json({
        groups: [],
        total_groups: 0,
        total_coordinates: 0,
        summary: []
      });
    });
    
    if (!wfsData.features || wfsData.features.length === 0) {
      console.log('⚠️ No survey points found in GeoServer');
      return res.status(200).json({
        groups: [],
        total_groups: 0,
        total_coordinates: 0,
        summary: []
      });
    }
    
    console.log(`📊 GeoServer returned ${wfsData.features.length} survey point features`);
    
    if (wfsData.features.length > 0) {
      console.log('📊 Sample feature:', JSON.stringify(wfsData.features[0], null, 2));
    }
    
    const coordinates = wfsData.features.map((feature, idx) => {
      const props = feature.properties;
      const geometry = feature.geometry;
      
      let latitude = null;
      let longitude = null;
      
      if (geometry && geometry.type === 'Point' && geometry.coordinates && Array.isArray(geometry.coordinates)) {
        longitude = parseFloat(geometry.coordinates[0]);
        latitude = parseFloat(geometry.coordinates[1]);
      } else if (props.latitude && props.longitude) {
        latitude = parseFloat(props.latitude);
        longitude = parseFloat(props.longitude);
      } else if (props.center_latitude && props.center_longitude) {
        latitude = parseFloat(props.center_latitude);
        longitude = parseFloat(props.center_longitude);
      }
      
      if (idx < 3) {
        console.log(`📊 Feature ${idx}:`, { geometry, props, latitude, longitude });
      }
      
      return {
        coordinate_id: props.coordinate_id || props.coordinateId || props._oid_ || `point_${idx}`,
        latitude: latitude,
        longitude: longitude,
        altitude: props.altitude ? parseFloat(props.altitude) : 0,
        location_name: props.location_name || props.locationName || 'General Survey Points',
        location_type: props.location_type || props.locationType || 'coordinate',
        mine_coords: {
          x: props.coord_x || null,
          y: props.coord_y || null,
          z: props.coord_z || null,
          heading: props.coord_heading || null,
          inclination: props.coord_incl || null,
          status: props.coord_status || null
        }
      };
    }).filter(coord => {
      const valid = coord.latitude && coord.longitude && !isNaN(coord.latitude) && !isNaN(coord.longitude);
      if (!valid && coord.latitude !== null) {
        console.warn('⚠️ Filtered invalid coordinate:', coord);
      }
      return valid;
    });
    
    console.log(`📊 Filtered to ${coordinates.length} valid coordinates`);
    
    const surveyGroup = {
      group_id: 'general_survey_points',
      group_name: 'General Survey Points',
      group_type: 'functional_group',
      total_points: coordinates.length,
      coordinates: coordinates,
      location_count: 1
    };
    
    res.status(200).json({
      groups: [surveyGroup],
      total_groups: 1,
      total_coordinates: coordinates.length,
      summary: [{
        group_id: surveyGroup.group_id,
        group_name: surveyGroup.group_name,
        count: surveyGroup.total_points
      }]
    });

  } catch (error) {
    console.error('Error fetching survey points from GeoServer:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}