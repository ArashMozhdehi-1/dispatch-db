export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Fetching consolidated locations from GeoServer...');
    
    const { getGeoServerConfig } = require('../../lib/config');
    const geoserverConfig = getGeoServerConfig();
    const geoserverUrl = geoserverConfig.url;
    const workspace = geoserverConfig.workspace;
    const layerName = 'consolidated_locations';
    
    // Use GeoServer WFS to fetch data (no direct DB access)
    const wfsUrl = `${geoserverUrl}/${workspace}/wfs?` +
      `service=WFS&` +
      `version=2.0.0&` +
      `request=GetFeature&` +
      `typeName=${workspace}:${layerName}&` +
      `outputFormat=application/json&` +
      `srsName=EPSG:4326`;
    
    console.log(`🌐 Fetching from GeoServer WFS: ${wfsUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    
    const response = await fetch(wfsUrl).catch(err => {
      console.error('❌ GeoServer connection error:', err.message);
      throw new Error(`Cannot connect to GeoServer: ${err.message}`);
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`❌ GeoServer WFS error ${response.status}:`, errorText.substring(0, 200));
      throw new Error(`GeoServer WFS error: ${response.status} ${response.statusText}`);
    }
    
    const wfsData = await response.json().catch(err => {
      console.error('❌ Failed to parse GeoServer response:', err);
      throw new Error('Invalid response from GeoServer');
    });
    
    if (!wfsData.features || wfsData.features.length === 0) {
      console.log('⚠️ No features found in GeoServer');
      return res.status(200).json({
        consolidated_locations: [],
        category_groups: [],
        total_locations: 0,
        summary: []
      });
    }
    
    console.log(`📊 GeoServer returned ${wfsData.features.length} features`);
    
    // Transform GeoServer WFS features to our API format
    const consolidatedLocations = wfsData.features.map(feature => {
      const props = feature.properties;
      const geometry = feature.geometry;
      
      // GeoServer WFS returns geometry as center_point, polygon is in properties
      let polygon = null;
      if (props.location_polygon) {
        // location_polygon might be a string (JSON) or an object
        if (typeof props.location_polygon === 'string') {
          try {
            polygon = JSON.parse(props.location_polygon);
          } catch (e) {
            console.warn('Failed to parse location_polygon:', e);
          }
        } else if (props.location_polygon.type === 'Polygon') {
          polygon = props.location_polygon;
        }
      }
      
      let boundary = null;
      if (props.location_boundary) {
        if (typeof props.location_boundary === 'string') {
          try {
            boundary = JSON.parse(props.location_boundary);
          } catch (e) {
            // Ignore parse errors for boundary
          }
        } else if (props.location_boundary.type === 'LineString') {
          boundary = props.location_boundary;
        }
      }
      
      return {
        location_name: props.location_name || props.locationName || 'Unknown',
        category: props.category || 'default',
        total_points: props.total_points || props.totalPoints || 0,
        center_latitude: props.center_latitude || props.centerLatitude || null,
        center_longitude: props.center_longitude || props.centerLongitude || null,
        avg_altitude: props.avg_altitude || props.avgAltitude ? parseFloat(props.avg_altitude || props.avgAltitude) : null,
        area_sqm: props.area_sqm || props.areaSqm ? parseFloat(props.area_sqm || props.areaSqm) : null,
        all_dump_node_ids: props.all_dump_node_ids || props.allDumpNodeIds || null,
        polygon: polygon,
        boundary: boundary,
        center_point: geometry && geometry.type === 'Point' ? geometry : null
      };
    });
    
    // Group by category for summary
    const categoryGroups = {};
    consolidatedLocations.forEach(location => {
      if (!categoryGroups[location.category]) {
        categoryGroups[location.category] = {
          category: location.category,
          locations: [],
          total_locations: 0,
          total_points: 0,
          total_area_sqm: 0
        };
      }
      
      categoryGroups[location.category].locations.push(location);
      categoryGroups[location.category].total_locations += 1;
      categoryGroups[location.category].total_points += location.total_points;
      categoryGroups[location.category].total_area_sqm += location.area_sqm || 0;
    });

    console.log(`✅ Found ${consolidatedLocations.length} consolidated locations`);
    console.log(`📊 Categories: ${Object.keys(categoryGroups).join(', ')}`);

    res.status(200).json({
      consolidated_locations: consolidatedLocations,
      category_groups: Object.values(categoryGroups),
      total_locations: consolidatedLocations.length,
      summary: Object.values(categoryGroups).map(group => ({
        category: group.category,
        locations: group.total_locations,
        points: group.total_points,
        area_sqm: Math.round(group.total_area_sqm)
      }))
    });

  } catch (error) {
    console.error('❌ Error fetching consolidated locations from GeoServer:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    const errorResponse = { 
      error: 'Internal server error',
      message: error.message,
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
      errorResponse.code = error.code;
      errorResponse.details = error.toString();
    }
    
    res.status(500).json(errorResponse);
  }
}