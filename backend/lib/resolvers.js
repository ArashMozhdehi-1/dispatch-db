const { query } = require('./database');

const resolvers = {
  Query: {
    locations: async (_, { limit = 1000 }) => {
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
          LIMIT $1
        `, [limit]);

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

    segments: async (_, { limit = null }) => {
      try {
        console.log(`🔍 Fetching segments with limit: ${limit || 'unlimited'}`);
        const limitClause = limit ? 'LIMIT $1' : '';
        const params = limit ? [limit] : [];

        const result = await query(`
          SELECT 
            ls.lane_id,
            ls.road_id,
            ls.lane_name,
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
            ST_X(ST_EndPoint(ls.geometry)) as end_longitude,
            CASE WHEN ls.lane_id LIKE 'trolley_%' THEN true ELSE false END as is_trolley
          FROM lane_segments ls
          WHERE ST_Y(ST_StartPoint(ls.geometry)) BETWEEN -60 AND -20  -- Filter out bad coordinates
            AND ST_X(ST_StartPoint(ls.geometry)) BETWEEN 140 AND 155  -- Filter out bad coordinates
            AND ST_Y(ST_EndPoint(ls.geometry)) BETWEEN -60 AND -20    -- Filter out bad coordinates
            AND ST_X(ST_EndPoint(ls.geometry)) BETWEEN 140 AND 155    -- Filter out bad coordinates
          ORDER BY ls.road_id, ls.lane_id
          ${limitClause}
        `, params);

        console.log(`✅ Fetched ${result.rows.length} segments`);

        try {
          const mappedSegments = result.rows.map((row, index) => {
            try {
              return {
                lane_id: row.lane_id,
                road_id: row.road_id,
                lane_name: row.lane_name,
                lane_width_m: null, // Column doesn't exist in current schema
                weight_limit_tonnes: null, // Column doesn't exist in current schema
                direction: row.direction,
                length_m: parseFloat(row.length_m),
                time_empty_seconds: parseFloat(row.time_empty_seconds),
                time_loaded_seconds: parseFloat(row.time_loaded_seconds),
                is_closed: row.is_closed,
                geometry: row.geometry,
                start_latitude: parseFloat(row.start_latitude),
                start_longitude: parseFloat(row.start_longitude),
                end_latitude: parseFloat(row.end_latitude),
                end_longitude: parseFloat(row.end_longitude),
                is_trolley: row.is_trolley,
                trolley_voltage: null, // Will be populated by field resolver
                trolley_current_limit: null, // Will be populated by field resolver
                trolley_wire_height: null, // Will be populated by field resolver
                trolley_catenary_type: null, // Will be populated by field resolver
                trolley_supports: [], // Will be populated by field resolver
                trolley_conditions: [] // Will be populated by field resolver
              };
            } catch (rowError) {
              console.error(`❌ Error mapping row ${index}:`, rowError);
              console.error(`❌ Row data:`, row);
              throw rowError;
            }
          });

          console.log(`✅ Successfully mapped ${mappedSegments.length} segments`);
          return mappedSegments;
        } catch (mappingError) {
          console.error('❌ Error in mapping function:', mappingError);
          throw mappingError;
        }
      } catch (error) {
        console.error('❌ Error fetching segments:', error);
        console.error('❌ Error details:', error.message);
        console.error('❌ Error stack:', error.stack);
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
    },

    trolleySegments: async () => {
      try {
        console.log('🔍 Fetching trolley segments from lane_segments table');
        const result = await query(`
          SELECT 
            ls.lane_id,
            ls.road_id,
            ls.lane_name,
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
          WHERE ls.lane_id LIKE 'trolley_%'
            AND ST_Y(ST_StartPoint(ls.geometry)) BETWEEN -30 AND -10  -- Western Australia latitude range
            AND ST_X(ST_StartPoint(ls.geometry)) BETWEEN 110 AND 130  -- Western Australia longitude range
            AND ST_Y(ST_EndPoint(ls.geometry)) BETWEEN -30 AND -10    -- Western Australia latitude range
            AND ST_X(ST_EndPoint(ls.geometry)) BETWEEN 110 AND 130    -- Western Australia longitude range
          ORDER BY ls.road_id, ls.lane_id
        `);

        console.log(`✅ Fetched ${result.rows.length} trolley segments`);

        return result.rows.map(row => ({
          lane_id: row.lane_id,
          road_id: row.road_id,
          lane_name: row.lane_name,
          lane_width_m: 4.0, // Default trolley lane width
          weight_limit_tonnes: 80.0, // Default trolley weight limit
          direction: row.direction,
          length_m: parseFloat(row.length_m),
          time_empty_seconds: parseFloat(row.time_empty_seconds),
          time_loaded_seconds: parseFloat(row.time_loaded_seconds),
          is_closed: row.is_closed,
          geometry: row.geometry,
          start_latitude: parseFloat(row.start_latitude),
          start_longitude: parseFloat(row.start_longitude),
          end_latitude: parseFloat(row.end_latitude),
          end_longitude: parseFloat(row.end_longitude),
          is_trolley: true,
          trolley_voltage: 600, // Default trolley voltage
          trolley_current_limit: 200, // Default trolley current
          trolley_wire_height: 5.5, // Default trolley wire height
          trolley_catenary_type: 'simple',
          trolley_supports: [],
          trolley_conditions: []
        }));
      } catch (error) {
        console.error('❌ Error fetching trolley segments:', error);
        console.error('❌ Error details:', error.message);
        // Return empty array instead of throwing error
        return [];
      }
    },

    trolleySupports: async (_, { laneId }) => {
      try {
        let whereClause = "WHERE ST_Y(ts.geometry) BETWEEN -60 AND -20 AND ST_X(ts.geometry) BETWEEN 140 AND 155";
        let params = [];

        if (laneId) {
          whereClause += " AND ts.lane_id = $1";
          params.push(laneId);
        }

        const result = await query(`
          SELECT 
            ts.support_id,
            ts.lane_id,
            ts.measure,
            ST_AsGeoJSON(ts.geometry) as geometry,
            ts.support_type,
            ts.support_material,
            ts.height_m,
            ST_Y(ts.geometry) as latitude,
            ST_X(ts.geometry) as longitude
          FROM trolley_supports ts
          ${whereClause}
          ORDER BY ts.lane_id, ts.measure
        `, params);

        return result.rows.map(row => ({
          support_id: row.support_id,
          lane_id: row.lane_id,
          measure: parseFloat(row.measure),
          geometry: row.geometry,
          support_type: row.support_type,
          support_material: row.support_material,
          height_m: parseFloat(row.height_m),
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        }));
      } catch (error) {
        console.error('Error fetching trolley supports:', error);
        throw new Error('Failed to fetch trolley supports');
      }
    },

    trolleySubstations: async () => {
      try {
        const result = await query(`
          SELECT 
            ts.substation_id,
            ts.substation_name,
            ts.substation_code,
            ST_AsGeoJSON(ts.geometry) as geometry,
            ts.input_voltage_v,
            ts.output_voltage_v,
            ts.capacity_kva,
            ts.status,
            ts.connected_lanes,
            ST_Y(ts.geometry) as latitude,
            ST_X(ts.geometry) as longitude
          FROM trolley_substations ts
          WHERE ST_Y(ts.geometry) BETWEEN -60 AND -20
            AND ST_X(ts.geometry) BETWEEN 140 AND 155
          ORDER BY ts.substation_id
        `);

        return result.rows.map(row => ({
          substation_id: row.substation_id,
          substation_name: row.substation_name,
          substation_code: row.substation_code,
          geometry: row.geometry,
          input_voltage_v: row.input_voltage_v,
          output_voltage_v: row.output_voltage_v,
          capacity_kva: parseFloat(row.capacity_kva),
          status: row.status,
          connected_lanes: row.connected_lanes,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        }));
      } catch (error) {
        console.error('Error fetching trolley substations:', error);
        throw new Error('Failed to fetch trolley substations');
      }
    },

    powerGenerators: async () => {
      try {
        const result = await query(`
          SELECT 
            pg.generator_id,
            pg.generator_name,
            pg.generator_code,
            ST_AsGeoJSON(pg.geometry) as geometry,
            pg.generator_type,
            pg.capacity_kw,
            pg.voltage_output_v,
            pg.frequency_hz,
            pg.fuel_type,
            pg.fuel_capacity_l,
            pg.current_fuel_level_l,
            pg.efficiency_percent,
            pg.status,
            pg.last_maintenance_date,
            pg.next_maintenance_date,
            pg.connected_substations,
            ST_Y(pg.geometry) as latitude,
            ST_X(pg.geometry) as longitude
          FROM power_generators pg
          WHERE ST_Y(pg.geometry) BETWEEN -60 AND -20
            AND ST_X(pg.geometry) BETWEEN 140 AND 155
          ORDER BY pg.generator_id
        `);

        return result.rows.map(row => ({
          generator_id: row.generator_id,
          generator_name: row.generator_name,
          generator_code: row.generator_code,
          geometry: row.geometry,
          generator_type: row.generator_type,
          capacity_kw: parseFloat(row.capacity_kw),
          voltage_output_v: row.voltage_output_v,
          frequency_hz: parseFloat(row.frequency_hz),
          fuel_type: row.fuel_type,
          fuel_capacity_l: row.fuel_capacity_l ? parseFloat(row.fuel_capacity_l) : null,
          current_fuel_level_l: row.current_fuel_level_l ? parseFloat(row.current_fuel_level_l) : null,
          efficiency_percent: parseFloat(row.efficiency_percent),
          status: row.status,
          last_maintenance_date: row.last_maintenance_date,
          next_maintenance_date: row.next_maintenance_date,
          connected_substations: row.connected_substations,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        }));
      } catch (error) {
        console.error('Error fetching power generators:', error);
        throw new Error('Failed to fetch power generators');
      }
    },

    speedLimitsByLane: async (_, { laneId }) => {
      try {
        const result = await query(`
          SELECT 
            sl.speed_limit_id,
            sl.lane_id,
            vs.series_name,
            vs.manufacturer,
            sl.speed_limit_mmps,
            ROUND((sl.speed_limit_mmps * 3.6 / 1000.0)::numeric, 2) as speed_limit_kmh,
            sl.speed_limit_type,
            sl.condition_type,
            sl.condition_value
          FROM speed_limits sl
          JOIN vehicle_series vs ON sl.series_id = vs.series_id
          WHERE sl.lane_id = $1
          ORDER BY vs.series_name
        `, [laneId]);

        return result.rows.map(row => ({
          speed_limit_id: row.speed_limit_id,
          lane_id: row.lane_id,
          series_name: row.series_name,
          manufacturer: row.manufacturer,
          speed_limit_mmps: row.speed_limit_mmps,
          speed_limit_kmh: parseFloat(row.speed_limit_kmh),
          speed_limit_type: row.speed_limit_type,
          condition_type: row.condition_type,
          condition_value: row.condition_value
        }));
      } catch (error) {
        console.error('Error fetching speed limits by lane:', error);
        return [];
      }
    },

    speedLimitsByRoad: async (_, { roadId }) => {
      try {
        const result = await query(`
          SELECT DISTINCT
            sl.speed_limit_id,
            sl.lane_id,
            vs.series_name,
            vs.manufacturer,
            sl.speed_limit_mmps,
            ROUND((sl.speed_limit_mmps * 3.6 / 1000.0)::numeric, 2) as speed_limit_kmh,
            sl.speed_limit_type,
            sl.condition_type,
            sl.condition_value
          FROM speed_limits sl
          JOIN vehicle_series vs ON sl.series_id = vs.series_id
          JOIN lane_segments ls ON sl.lane_id = ls.lane_id
          WHERE ls.road_id = $1
          ORDER BY vs.series_name
        `, [roadId]);

        return result.rows.map(row => ({
          speed_limit_id: row.speed_limit_id,
          lane_id: row.lane_id,
          series_name: row.series_name,
          manufacturer: row.manufacturer,
          speed_limit_mmps: row.speed_limit_mmps,
          speed_limit_kmh: parseFloat(row.speed_limit_kmh),
          speed_limit_type: row.speed_limit_type,
          condition_type: row.condition_type,
          condition_value: row.condition_value
        }));
      } catch (error) {
        console.error('Error fetching speed limits by road:', error);
        return [];
      }
    },

    wateringByLane: async (_, { laneId }) => {
      try {
        const scheduleResult = await query(`
          SELECT 
            lc.lane_id,
            SPLIT_PART(SPLIT_PART(lc.condition_value, 'interval:', 2), ',', 1)::integer / 60000 as interval_minutes,
            SPLIT_PART(SPLIT_PART(lc.condition_value, 'pattern:', 2), ',', 1) as pattern,
            SPLIT_PART(SPLIT_PART(lc.condition_value, 'amount:', 2), ',', 1)::float as amount
          FROM lane_conditions lc
          WHERE lc.lane_id = $1
            AND lc.condition_type = 'watering_schedule'
          LIMIT 1
        `, [laneId]);

        if (scheduleResult.rows.length === 0) return null;

        const eventResult = await query(`
          SELECT 
            SPLIT_PART(SPLIT_PART(lc.condition_value, 'equipment:', 2), ',', 1) as equipment,
            SPLIT_PART(lc.condition_value, 'circuit:', 2) as circuit,
            lc.effective_start as last_watered
          FROM lane_conditions lc
          WHERE lc.lane_id = $1
            AND lc.condition_type = 'watering_event'
          ORDER BY lc.effective_start DESC
          LIMIT 1
        `, [laneId]);

        const schedule = scheduleResult.rows[0];
        const event = eventResult.rows[0] || {};

        return {
          lane_id: schedule.lane_id,
          interval_minutes: parseInt(schedule.interval_minutes),
          pattern: schedule.pattern,
          amount: parseFloat(schedule.amount),
          last_watered: event.last_watered || null,
          equipment: event.equipment || null,
          circuit: event.circuit || null
        };
      } catch (error) {
        console.error('Error fetching watering by lane:', error);
        return null;
      }
    },

    wateringByRoad: async (_, { roadId }) => {
      try {
        const result = await query(`
          SELECT DISTINCT
            lc.lane_id,
            SPLIT_PART(SPLIT_PART(lc.condition_value, 'interval:', 2), ',', 1)::integer / 60000 as interval_minutes,
            SPLIT_PART(SPLIT_PART(lc.condition_value, 'pattern:', 2), ',', 1) as pattern,
            SPLIT_PART(SPLIT_PART(lc.condition_value, 'amount:', 2), ',', 1)::float as amount
          FROM lane_conditions lc
          JOIN lane_segments ls ON lc.lane_id = ls.lane_id
          WHERE ls.road_id = $1
            AND lc.condition_type = 'watering_schedule'
        `, [roadId]);

        return result.rows.map(row => ({
          lane_id: row.lane_id,
          interval_minutes: parseInt(row.interval_minutes),
          pattern: row.pattern,
          amount: parseFloat(row.amount),
          last_watered: null,
          equipment: null,
          circuit: null
        }));
      } catch (error) {
        console.error('Error fetching watering by road:', error);
        return [];
      }
    },

    electricalTrucks: async () => {
      try {
        const result = await query(`
          SELECT 
            et.truck_id,
            et.unit_type_id,
            et.vehicle_class_id,
            et.truck_name,
            et.truck_model,
            ST_AsGeoJSON(et.geometry) as geometry,
            et.drive_system,
            et.max_voltage_v,
            et.max_current_a,
            et.battery_capacity_kwh,
            et.current_battery_level_percent,
            et.power_consumption_kw,
            et.trolley_connection_type,
            et.status,
            et.current_route,
            et.last_charge_time,
            et.next_maintenance_date,
            ST_Y(et.geometry) as latitude,
            ST_X(et.geometry) as longitude
          FROM electrical_trucks et
          WHERE ST_Y(et.geometry) BETWEEN -60 AND -20
            AND ST_X(et.geometry) BETWEEN 140 AND 155
          ORDER BY et.truck_id
        `);

        return result.rows.map(row => ({
          truck_id: row.truck_id,
          unit_type_id: row.unit_type_id,
          vehicle_class_id: row.vehicle_class_id,
          truck_name: row.truck_name,
          truck_model: row.truck_model,
          geometry: row.geometry,
          drive_system: row.drive_system,
          max_voltage_v: row.max_voltage_v,
          max_current_a: row.max_current_a,
          battery_capacity_kwh: parseFloat(row.battery_capacity_kwh),
          current_battery_level_percent: parseFloat(row.current_battery_level_percent),
          power_consumption_kw: parseFloat(row.power_consumption_kw),
          trolley_connection_type: row.trolley_connection_type,
          status: row.status,
          current_route: row.current_route,
          last_charge_time: row.last_charge_time,
          next_maintenance_date: row.next_maintenance_date,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        }));
      } catch (error) {
        console.error('Error fetching electrical trucks:', error);
        throw new Error('Failed to fetch electrical trucks');
      }
    },

    laneConditions: async (_, { laneId }) => {
      try {
        let whereClause = "WHERE lc.effective_start <= NOW() AND lc.effective_end >= NOW()";
        let params = [];

        if (laneId) {
          whereClause += " AND lc.lane_id = $1";
          params.push(laneId);
        }

        const result = await query(`
          SELECT 
            lc.condition_id,
            lc.lane_id,
            lc.start_measure,
            lc.end_measure,
            lc.condition_type,
            lc.condition_value,
            lc.effective_start,
            lc.effective_end
          FROM lane_conditions lc
          ${whereClause}
          ORDER BY lc.lane_id, lc.start_measure
        `, params);

        return result.rows.map(row => ({
          condition_id: row.condition_id,
          lane_id: row.lane_id,
          start_measure: parseFloat(row.start_measure),
          end_measure: parseFloat(row.end_measure),
          condition_type: row.condition_type,
          condition_value: row.condition_value,
          effective_start: row.effective_start,
          effective_end: row.effective_end
        }));
      } catch (error) {
        console.error('Error fetching lane conditions:', error);
        throw new Error('Failed to fetch lane conditions');
      }
    },

    wateringStations: async () => {
      try {
        console.log('🔍 Fetching watering stations');
        const result = await query(`
          SELECT 
            ws.station_id,
            ws.station_name,
            ws.station_code,
            ws.station_type,
            ST_AsGeoJSON(ws.geometry) as geometry,
            ws.capacity_liters,
            ws.current_level_percent,
            ws.status,
            ws.connected_circuits,
            ST_Y(ws.geometry) as latitude,
            ST_X(ws.geometry) as longitude
          FROM watering_stations ws
          WHERE ST_Y(ws.geometry) BETWEEN -30 AND -10
            AND ST_X(ws.geometry) BETWEEN 110 AND 130
          ORDER BY ws.station_id
        `);

        console.log(`✅ Fetched ${result.rows.length} watering stations`);

        return result.rows.map(row => ({
          station_id: row.station_id,
          station_name: row.station_name,
          station_code: row.station_code,
          station_type: row.station_type,
          geometry: row.geometry,
          capacity_liters: parseFloat(row.capacity_liters),
          current_level_percent: parseFloat(row.current_level_percent),
          status: row.status,
          connected_circuits: row.connected_circuits || [],
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        }));
      } catch (error) {
        console.error('❌ Error fetching watering stations:', error);
        return [];
      }
    },

    speedMonitoring: async () => {
      try {
        console.log('🔍 Fetching speed monitoring data');
        const result = await query(`
          SELECT 
            sm.monitoring_id,
            sm.unit_type_id,
            sm.series_id,
            sm.lane_id,
            sm.measure,
            sm.recorded_speed_mmps,
            ROUND((sm.recorded_speed_mmps * 3.6 / 1000.0)::numeric, 2) as speed_kmh,
            sm.violation_type,
            sm.operational_mode,
            sm.measurement_timestamp,
            ST_Y(ls.geometry) as latitude,
            ST_X(ls.geometry) as longitude
          FROM speed_monitoring sm
          JOIN lane_segments ls ON sm.lane_id = ls.lane_id
          WHERE ST_Y(ls.geometry) BETWEEN -30 AND -10
            AND ST_X(ls.geometry) BETWEEN 110 AND 130
          ORDER BY sm.measurement_timestamp DESC
          LIMIT 100
        `);

        console.log(`✅ Fetched ${result.rows.length} speed monitoring records`);

        return result.rows.map(row => ({
          monitoring_id: row.monitoring_id,
          unit_type_id: row.unit_type_id,
          series_id: row.series_id,
          lane_id: row.lane_id,
          measure: parseFloat(row.measure),
          speed_mmps: row.recorded_speed_mmps,
          speed_kmh: parseFloat(row.speed_kmh),
          violation_type: row.violation_type,
          operational_mode: row.operational_mode,
          timestamp: row.measurement_timestamp,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        }));
      } catch (error) {
        console.error('❌ Error fetching speed monitoring:', error);
        return [];
      }
    },

    intersections: async () => {
      try {
        console.log('🔍 Fetching intersections');
        const result = await query(`
          SELECT 
            intersection_id,
            intersection_name,
            intersection_type,
            ST_AsGeoJSON(geometry) as geometry,
            safety_buffer_m,
            r_min_m,
            connected_roads,
            created_at
          FROM intersections
          ORDER BY intersection_name
        `);

        console.log(`✅ Fetched ${result.rows.length} intersections`);
        return result.rows.map(row => ({
          intersection_id: row.intersection_id,
          intersection_name: row.intersection_name,
          intersection_type: row.intersection_type,
          geometry: row.geometry,
          safety_buffer_m: parseFloat(row.safety_buffer_m),
          r_min_m: parseFloat(row.r_min_m),
          connected_roads: row.connected_roads,
          created_at: row.created_at
        }));
      } catch (error) {
        console.error('❌ Error fetching intersections:', error);
        return [];
      }
    }
  },

  LaneSegment: {
    trolley_voltage: async (parent) => {
      if (!parent.is_trolley) return null;
      try {
        const result = await query(`
          SELECT condition_value 
          FROM lane_conditions 
          WHERE lane_id = $1 
            AND condition_type = 'trolley_voltage'
            AND effective_start <= NOW() 
            AND effective_end >= NOW()
          LIMIT 1
        `, [parent.lane_id]);
        return result.rows.length > 0 ? parseFloat(result.rows[0].condition_value) : null;
      } catch (error) {
        return null;
      }
    },

    trolley_current_limit: async (parent) => {
      if (!parent.is_trolley) return null;
      try {
        const result = await query(`
          SELECT condition_value 
          FROM lane_conditions 
          WHERE lane_id = $1 
            AND condition_type = 'trolley_current_limit'
            AND effective_start <= NOW() 
            AND effective_end >= NOW()
          LIMIT 1
        `, [parent.lane_id]);
        return result.rows.length > 0 ? parseFloat(result.rows[0].condition_value) : null;
      } catch (error) {
        return null;
      }
    },

    trolley_wire_height: async (parent) => {
      if (!parent.is_trolley) return null;
      try {
        const result = await query(`
          SELECT condition_value 
          FROM lane_conditions 
          WHERE lane_id = $1 
            AND condition_type = 'trolley_wire_height'
            AND effective_start <= NOW() 
            AND effective_end >= NOW()
          LIMIT 1
        `, [parent.lane_id]);
        return result.rows.length > 0 ? parseFloat(result.rows[0].condition_value) : null;
      } catch (error) {
        return null;
      }
    },

    trolley_catenary_type: async (parent) => {
      if (!parent.is_trolley) return null;
      try {
        const result = await query(`
          SELECT condition_value 
          FROM lane_conditions 
          WHERE lane_id = $1 
            AND condition_type = 'trolley_catenary_type'
            AND effective_start <= NOW() 
            AND effective_end >= NOW()
          LIMIT 1
        `, [parent.lane_id]);
        return result.rows.length > 0 ? result.rows[0].condition_value : null;
      } catch (error) {
        return null;
      }
    },

    trolley_supports: async (parent) => {
      if (!parent.is_trolley) return [];
      try {
        const result = await query(`
          SELECT 
            ts.support_id,
            ts.lane_id,
            ts.measure,
            ST_AsGeoJSON(ts.geometry) as geometry,
            ts.support_type,
            ts.support_material,
            ts.height_m,
            ST_Y(ts.geometry) as latitude,
            ST_X(ts.geometry) as longitude
          FROM trolley_supports ts
          WHERE ts.lane_id = $1
          ORDER BY ts.measure
        `, [parent.lane_id]);

        return result.rows.map(row => ({
          support_id: row.support_id,
          lane_id: row.lane_id,
          measure: parseFloat(row.measure),
          geometry: row.geometry,
          support_type: row.support_type,
          support_material: row.support_material,
          height_m: parseFloat(row.height_m),
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude)
        }));
      } catch (error) {
        return [];
      }
    },

    trolley_conditions: async (parent) => {
      if (!parent.is_trolley) return [];
      try {
        const result = await query(`
          SELECT 
            lc.condition_id,
            lc.lane_id,
            lc.start_measure,
            lc.end_measure,
            lc.condition_type,
            lc.condition_value,
            lc.effective_start,
            lc.effective_end
          FROM lane_conditions lc
          WHERE lc.lane_id = $1
            AND lc.effective_start <= NOW() 
            AND lc.effective_end >= NOW()
          ORDER BY lc.start_measure
        `, [parent.lane_id]);

        return result.rows.map(row => ({
          condition_id: row.condition_id,
          lane_id: row.lane_id,
          start_measure: parseFloat(row.start_measure),
          end_measure: parseFloat(row.end_measure),
          condition_type: row.condition_type,
          condition_value: row.condition_value,
          effective_start: row.effective_start,
          effective_end: row.effective_end
        }));
      } catch (error) {
        return [];
      }
    }
  }
};

module.exports = { resolvers };

