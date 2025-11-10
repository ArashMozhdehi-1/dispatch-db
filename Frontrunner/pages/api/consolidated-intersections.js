export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🛣️ Fetching consolidated intersections from GeoServer...');
    
    const { getGeoServerConfig } = require('../../lib/config');
    const geoserverConfig = getGeoServerConfig();
    const geoserverUrl = geoserverConfig.url;
    const workspace = geoserverConfig.workspace;
    const layerName = 'consolidated_intersections';
    
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
      console.log('⚠️ No intersection features found in GeoServer');
      return res.status(200).json({
        consolidated_intersections: [],
        total_intersections: 0,
        total_points: 0,
        total_area_sqm: 0,
        summary: {
          intersections: 0,
          points: 0,
          area_sqm: 0
        }
      });
    }
    
    console.log(`📊 GeoServer returned ${wfsData.features.length} intersection features`);
    
    // Transform GeoServer WFS features to our API format
    const consolidatedIntersections = wfsData.features.map(feature => {
      const props = feature.properties;
      const geometry = feature.geometry;
      
      let polygon = null;
      if (geometry && geometry.type === 'Polygon') {
        polygon = geometry;
      } else if (props.intersection_polygon) {
        if (typeof props.intersection_polygon === 'string') {
          try {
            polygon = JSON.parse(props.intersection_polygon);
          } catch (e) {
            console.warn('Failed to parse intersection_polygon:', e);
          }
        } else if (props.intersection_polygon.type === 'Polygon') {
          polygon = props.intersection_polygon;
          if (polygon.coordinates && polygon.coordinates[0] && typeof polygon.coordinates[0][0] === 'string') {
            polygon.coordinates[0] = polygon.coordinates[0].map(coord => {
              if (typeof coord === 'string') {
                const parts = coord.trim().split(/\s+/);
                return [parseFloat(parts[0]), parseFloat(parts[1])];
              }
              return coord;
            });
          }
        }
      }
      
      let boundary = null;
      if (props.intersection_boundary) {
        if (typeof props.intersection_boundary === 'string') {
          try {
            boundary = JSON.parse(props.intersection_boundary);
          } catch (e) {
            // Ignore parse errors for boundary
          }
        } else if (props.intersection_boundary.type === 'LineString') {
          boundary = props.intersection_boundary;
        }
      }
      
      return {
        location_name: props.intersection_name || props.intersectionName || props.location_name || 'Unknown',
        category: props.category || 'intersection',
        intersection_type: props.intersection_type || props.intersectionType || null,
        total_points: props.total_points || props.totalPoints || 0,
        center_latitude: props.center_latitude || props.centerLatitude || null,
        center_longitude: props.center_longitude || props.centerLongitude || null,
        area_sqm: props.area_sqm || props.areaSqm ? parseFloat(props.area_sqm || props.areaSqm) : null,
        all_coordinate_ids: props.all_coordinate_ids || props.allCoordinateIds || null,
        all_intersection_ids: props.all_intersection_ids || props.allIntersectionIds || null,
        polygon: polygon,
        boundary: boundary,
        center_point: geometry && geometry.type === 'Point' ? geometry : null
      };
    });
    
    // Calculate summary statistics
    const totalIntersections = consolidatedIntersections.length;
    const totalPoints = consolidatedIntersections.reduce((sum, intersection) => sum + (intersection.total_points || 0), 0);
    const totalArea = consolidatedIntersections.reduce((sum, intersection) => sum + (intersection.area_sqm || 0), 0);

    console.log(`✅ Found ${totalIntersections} consolidated intersections`);
    console.log(`📊 Total points: ${totalPoints}, Total area: ${Math.round(totalArea)} sqm`);

    res.status(200).json({
      consolidated_intersections: consolidatedIntersections,
      total_intersections: totalIntersections,
      total_points: totalPoints,
      total_area_sqm: totalArea,
      summary: {
        intersections: totalIntersections,
        points: totalPoints,
        area_sqm: Math.round(totalArea)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching consolidated intersections from GeoServer:', error);
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