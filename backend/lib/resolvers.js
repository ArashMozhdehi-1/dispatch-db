const { query } = require('./database');

const resolvers = {
  Query: {
    locations: async () => {
      try {
        const result = await query(`
          SELECT 
            i.location_id,
            i.location_name,
            ST_Y(i.center_point) as latitude,
            ST_X(i.center_point) as longitude,
            i.elevation_m,
            ut.description as unit_type,
            ut.unit_type_id,
            CASE 
              WHEN ut.description IN ('Workshop', 'Fuelbay', 'Crusher', 'Stockpile', 'Blast', 'Pit', 'Region', 'Call Point', 'Shiftchange') 
              THEN 'infrastructure'
              WHEN ut.description IN ('Truck', 'Shovel', 'Dump', 'Dozer', 'Grader', 'Wheel Dozer', 'Aux Crusher', 'Foreman', 'Water Truck', 'Utility Vehicle', 'Man Bus', 'Generic Auxil', 'Drill')
              THEN 'vehicle'
              ELSE 'infrastructure'
            END as location_category,
            p.pit_name,
            r.region_name
          FROM infrastructure i
          LEFT JOIN unit_types ut ON i.unit_id = ut.unit_type_id
          LEFT JOIN pits p ON i.pit_id = p.pit_id
          LEFT JOIN regions r ON i.region_id = r.region_id
          WHERE i.center_point IS NOT NULL
          ORDER BY i.location_id
        `);
        
        const locations = result.rows.map(row => ({
          location_id: row.location_id,
          location_name: row.location_name,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
          unit_type: row.unit_type,
          unit_type_id: row.unit_type_id,
          location_category: row.location_category,
          pit_name: row.pit_name,
          region_name: row.region_name
        }));
        
        // Debug: Log coordinate ranges
        if (locations.length > 0) {
          const lats = locations.map(l => l.latitude).filter(lat => lat !== null);
          const lngs = locations.map(l => l.longitude).filter(lng => lng !== null);
          console.log('📍 Location coordinate ranges:');
          console.log('  Latitude range:', Math.min(...lats), 'to', Math.max(...lats));
          console.log('  Longitude range:', Math.min(...lngs), 'to', Math.max(...lngs));
        }
        
        return locations;
      } catch (error) {
        console.error('Error fetching locations:', error);
        throw new Error('Failed to fetch locations');
      }
    },

    segments: async (_, { limit = 1000 }) => {
      try {
        const result = await query(`
          SELECT 
            ls.lane_id,
            ls.road_id,
            CASE 
              WHEN ls.lane_id LIKE '%_forward' THEN 'forward'
              WHEN ls.lane_id LIKE '%_reverse' THEN 'reverse'
              ELSE 'unknown'
            END as direction,
            ls.length_m,
            ls.time_empty_seconds,
            ls.time_loaded_seconds,
            ls.is_closed,
            ST_AsGeoJSON(ls.geometry) as geometry,
            ST_Y(ST_StartPoint(ls.geometry)) as start_latitude,
            ST_X(ST_StartPoint(ls.geometry)) as start_longitude,
            ST_Y(ST_EndPoint(ls.geometry)) as end_latitude,
            ST_X(ST_EndPoint(ls.geometry)) as end_longitude
          FROM lane_segments ls
          WHERE ST_Y(ST_StartPoint(ls.geometry)) BETWEEN -60 AND -20  -- Filter out bad coordinates
            AND ST_X(ST_StartPoint(ls.geometry)) BETWEEN 140 AND 155  -- Filter out bad coordinates
            AND ST_Y(ST_EndPoint(ls.geometry)) BETWEEN -60 AND -20    -- Filter out bad coordinates
            AND ST_X(ST_EndPoint(ls.geometry)) BETWEEN 140 AND 155    -- Filter out bad coordinates
          ORDER BY ls.road_id, ls.lane_id
          LIMIT $1
        `, [limit]);
        
        return result.rows.map(row => ({
          lane_id: row.lane_id,
          road_id: row.road_id,
          direction: row.direction,
          length_m: parseFloat(row.length_m),
          time_empty_seconds: parseFloat(row.time_empty_seconds),
          time_loaded_seconds: parseFloat(row.time_loaded_seconds),
          is_closed: row.is_closed,
          geometry: row.geometry,
          start_latitude: parseFloat(row.start_latitude),
          start_longitude: parseFloat(row.start_longitude),
          end_latitude: parseFloat(row.end_latitude),
          end_longitude: parseFloat(row.end_longitude)
        }));
      } catch (error) {
        console.error('Error fetching segments:', error);
        throw new Error('Failed to fetch segments');
      }
    },

    location: async (_, { id }) => {
      try {
        const result = await query(`
          SELECT 
            i.location_id,
            i.location_name,
            ST_Y(i.center_point) as latitude,
            ST_X(i.center_point) as longitude,
            i.elevation_m,
            ut.description as unit_type,
            ut.unit_type_id,
            CASE 
              WHEN ut.description IN ('Workshop', 'Fuelbay', 'Crusher', 'Stockpile', 'Blast', 'Pit', 'Region', 'Call Point', 'Shiftchange') 
              THEN 'infrastructure'
              WHEN ut.description IN ('Truck', 'Shovel', 'Dump', 'Dozer', 'Grader', 'Wheel Dozer', 'Aux Crusher', 'Foreman', 'Water Truck', 'Utility Vehicle', 'Man Bus', 'Generic Auxil', 'Drill')
              THEN 'vehicle'
              ELSE 'infrastructure'
            END as location_category,
            p.pit_name,
            r.region_name
          FROM infrastructure i
          LEFT JOIN unit_types ut ON i.unit_id = ut.unit_type_id
          LEFT JOIN pits p ON i.pit_id = p.pit_id
          LEFT JOIN regions r ON i.region_id = r.region_id
          WHERE i.location_id = $1
            AND i.center_point IS NOT NULL
        `, [id]);
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const row = result.rows[0];
        return {
          location_id: row.location_id,
          location_name: row.location_name,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
          unit_type: row.unit_type,
          unit_type_id: row.unit_type_id,
          location_category: row.location_category,
          pit_name: row.pit_name,
          region_name: row.region_name
        };
      } catch (error) {
        console.error('Error fetching location:', error);
        throw new Error('Failed to fetch location');
      }
    },

    segment: async (_, { id }) => {
      try {
        const result = await query(`
          SELECT 
            ls.lane_id,
            ls.road_id,
            CASE 
              WHEN ls.lane_id LIKE '%_forward' THEN 'forward'
              WHEN ls.lane_id LIKE '%_reverse' THEN 'reverse'
              ELSE 'unknown'
            END as direction,
            ls.length_m,
            ls.time_empty_seconds,
            ls.time_loaded_seconds,
            ls.is_closed,
            ST_AsGeoJSON(ls.geometry) as geometry,
            ST_Y(ST_StartPoint(ls.geometry)) as start_latitude,
            ST_X(ST_StartPoint(ls.geometry)) as start_longitude,
            ST_Y(ST_EndPoint(ls.geometry)) as end_latitude,
            ST_X(ST_EndPoint(ls.geometry)) as end_longitude
          FROM lane_segments ls
          WHERE ls.lane_id = $1
            AND ST_Y(ST_StartPoint(ls.geometry)) BETWEEN -30 AND -10  -- Queensland latitude range (filter out South Pole coordinates like -85)
            AND ST_X(ST_StartPoint(ls.geometry)) BETWEEN 140 AND 155  -- Queensland longitude range (filter out Indian Ocean coordinates like 56)
            AND ST_Y(ST_EndPoint(ls.geometry)) BETWEEN -30 AND -10    -- Queensland latitude range (filter out South Pole coordinates like -85)
            AND ST_X(ST_EndPoint(ls.geometry)) BETWEEN 140 AND 155    -- Queensland longitude range (filter out Indian Ocean coordinates like 56)
        `, [id]);
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const row = result.rows[0];
        return {
          lane_id: row.lane_id,
          road_id: row.road_id,
          direction: row.direction,
          length_m: parseFloat(row.length_m),
          time_empty_seconds: parseFloat(row.time_empty_seconds),
          time_loaded_seconds: parseFloat(row.time_loaded_seconds),
          is_closed: row.is_closed,
          geometry: row.geometry,
          start_latitude: parseFloat(row.start_latitude),
          start_longitude: parseFloat(row.start_longitude),
          end_latitude: parseFloat(row.end_latitude),
          end_longitude: parseFloat(row.end_longitude)
        };
      } catch (error) {
        console.error('Error fetching segment:', error);
        throw new Error('Failed to fetch segment');
      }
    },

    segmentsByRoad: async (_, { roadId }) => {
      try {
        const result = await query(`
          SELECT 
            ls.lane_id,
            ls.road_id,
            CASE 
              WHEN ls.lane_id LIKE '%_forward' THEN 'forward'
              WHEN ls.lane_id LIKE '%_reverse' THEN 'reverse'
              ELSE 'unknown'
            END as direction,
            ls.length_m,
            ls.time_empty_seconds,
            ls.time_loaded_seconds,
            ls.is_closed,
            ST_AsGeoJSON(ls.geometry) as geometry,
            ST_Y(ST_StartPoint(ls.geometry)) as start_latitude,
            ST_X(ST_StartPoint(ls.geometry)) as start_longitude,
            ST_Y(ST_EndPoint(ls.geometry)) as end_latitude,
            ST_X(ST_EndPoint(ls.geometry)) as end_longitude
          FROM lane_segments ls
          WHERE ls.road_id = $1
            AND ST_Y(ST_StartPoint(ls.geometry)) BETWEEN -30 AND -10  -- Queensland latitude range (filter out South Pole coordinates like -85)
            AND ST_X(ST_StartPoint(ls.geometry)) BETWEEN 140 AND 155  -- Queensland longitude range (filter out Indian Ocean coordinates like 56)
            AND ST_Y(ST_EndPoint(ls.geometry)) BETWEEN -30 AND -10    -- Queensland latitude range (filter out South Pole coordinates like -85)
            AND ST_X(ST_EndPoint(ls.geometry)) BETWEEN 140 AND 155    -- Queensland longitude range (filter out Indian Ocean coordinates like 56)
          ORDER BY ls.lane_id
        `, [roadId]);
        
        return result.rows.map(row => ({
          lane_id: row.lane_id,
          road_id: row.road_id,
          direction: row.direction,
          length_m: parseFloat(row.length_m),
          time_empty_seconds: parseFloat(row.time_empty_seconds),
          time_loaded_seconds: parseFloat(row.time_loaded_seconds),
          is_closed: row.is_closed,
          geometry: row.geometry,
          start_latitude: parseFloat(row.start_latitude),
          start_longitude: parseFloat(row.start_longitude),
          end_latitude: parseFloat(row.end_latitude),
          end_longitude: parseFloat(row.end_longitude)
        }));
      } catch (error) {
        console.error('Error fetching segments by road:', error);
        throw new Error('Failed to fetch segments by road');
      }
    },

    locationsByCategory: async (_, { category }) => {
      try {
        const result = await query(`
          SELECT 
            i.location_id,
            i.location_name,
            ST_Y(i.center_point) as latitude,
            ST_X(i.center_point) as longitude,
            i.elevation_m,
            ut.description as unit_type,
            ut.unit_type_id,
            CASE 
              WHEN ut.description IN ('Workshop', 'Fuelbay', 'Crusher', 'Stockpile', 'Blast', 'Pit', 'Region', 'Call Point', 'Shiftchange') 
              THEN 'infrastructure'
              WHEN ut.description IN ('Truck', 'Shovel', 'Dump', 'Dozer', 'Grader', 'Wheel Dozer', 'Aux Crusher', 'Foreman', 'Water Truck', 'Utility Vehicle', 'Man Bus', 'Generic Auxil', 'Drill')
              THEN 'vehicle'
              ELSE 'infrastructure'
            END as location_category,
            p.pit_name,
            r.region_name
          FROM infrastructure i
          LEFT JOIN unit_types ut ON i.unit_id = ut.unit_type_id
          LEFT JOIN pits p ON i.pit_id = p.pit_id
          LEFT JOIN regions r ON i.region_id = r.region_id
          WHERE i.center_point IS NOT NULL
            AND CASE 
              WHEN ut.description IN ('Workshop', 'Fuelbay', 'Crusher', 'Stockpile', 'Blast', 'Pit', 'Region', 'Call Point', 'Shiftchange') 
              THEN 'infrastructure'
              WHEN ut.description IN ('Truck', 'Shovel', 'Dump', 'Dozer', 'Grader', 'Wheel Dozer', 'Aux Crusher', 'Foreman', 'Water Truck', 'Utility Vehicle', 'Man Bus', 'Generic Auxil', 'Drill')
              THEN 'vehicle'
              ELSE 'infrastructure'
            END = $1
          ORDER BY i.location_id
        `, [category]);
        
        return result.rows.map(row => ({
          location_id: row.location_id,
          location_name: row.location_name,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
          unit_type: row.unit_type,
          unit_type_id: row.unit_type_id,
          location_category: row.location_category,
          pit_name: row.pit_name,
          region_name: row.region_name
        }));
      } catch (error) {
        console.error('Error fetching locations by category:', error);
        throw new Error('Failed to fetch locations by category');
      }
    }
  }
};

module.exports = { resolvers };

