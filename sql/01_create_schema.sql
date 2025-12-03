CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE unit_types (
    unit_type_id INTEGER PRIMARY KEY,
    enum_type_id INTEGER,
    description VARCHAR(100) NOT NULL,
    abbreviation VARCHAR(20),
    flags INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shop_types (
    shop_type_id INTEGER PRIMARY KEY,
    enum_type_id INTEGER,
    idx INTEGER,
    description VARCHAR(100),
    abbreviation VARCHAR(20),
    flags INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gps_types (
    gps_type_id INTEGER PRIMARY KEY,
    enum_type_id INTEGER,
    idx INTEGER,
    description VARCHAR(100) NOT NULL,
    abbreviation VARCHAR(20),
    flags INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pits (
    pit_id SERIAL PRIMARY KEY,
    pit_name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE regions (
    region_id SERIAL PRIMARY KEY,
    region_name VARCHAR(50) UNIQUE NOT NULL,
    pit_id INTEGER REFERENCES pits(pit_id),
    description VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roads (
    road_id BIGINT PRIMARY KEY,
    road_name VARCHAR(200),
    start_location_id INTEGER,
    end_location_id INTEGER,
    from_location_name VARCHAR(120),
    to_location_name VARCHAR(120),
    source_system VARCHAR(32) DEFAULT 'dispatch',
    geometry GEOMETRY(POLYGON, 4326),
    centerline GEOMETRY(LINESTRING, 4326),
    road_length_m DECIMAL(10,2),
    is_open BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lane_segments (
    lane_id VARCHAR(80) PRIMARY KEY,
    road_id BIGINT REFERENCES roads(road_id),
    lane_name VARCHAR(120),
    lane_direction CHAR(1) CHECK (lane_direction IN ('F','B')),
    geometry GEOMETRY(LINESTRING, 4326),
    lane_width_m DECIMAL(5,2),
    weight_limit_tonnes INTEGER,
    length_m DECIMAL(10,2),
    source_system VARCHAR(32) DEFAULT 'dispatch',
    from_location_id INTEGER,
    to_location_id INTEGER,
    from_location_name VARCHAR(120),
    to_location_name VARCHAR(120),
    time_empty_seconds DECIMAL(10,4),
    time_loaded_seconds DECIMAL(10,4),
    is_closed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infrastructure (
    location_id INTEGER PRIMARY KEY,
    location_name VARCHAR(100),
    pit_id INTEGER REFERENCES pits(pit_id),
    region_id INTEGER REFERENCES regions(region_id),
    unit_id INTEGER REFERENCES unit_types(unit_type_id),
    sign_id INTEGER,
    signpost INTEGER,
    shoptype INTEGER REFERENCES shop_types(shop_type_id),
    gpstype INTEGER REFERENCES gps_types(gps_type_id),
    geometry GEOMETRY(POLYGON, 4326),
    center_point GEOMETRY(POINT, 4326),
    radius_m DECIMAL(10,2),
    elevation_m DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE lane_unit_permissions (
    lane_id VARCHAR(50) REFERENCES lane_segments(lane_id),
    unit_type_id INTEGER REFERENCES unit_types(unit_type_id),
    is_allowed BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (lane_id, unit_type_id)
);

CREATE TABLE lane_conditions (
    condition_id SERIAL PRIMARY KEY,
    lane_id VARCHAR(50) REFERENCES lane_segments(lane_id),
    start_measure DECIMAL(10,2),
    end_measure DECIMAL(10,2),
    condition_type VARCHAR(50),
    condition_value VARCHAR(100),
    effective_start TIMESTAMP,
    effective_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lane_connectors (
    connector_id SERIAL PRIMARY KEY,
    from_lane_id VARCHAR(80) REFERENCES lane_segments(lane_id),
    to_lane_id VARCHAR(80) REFERENCES lane_segments(lane_id),
    from_location_id INTEGER,
    to_location_id INTEGER,
    geometry GEOMETRY(LINESTRING, 4326),
    is_active BOOLEAN DEFAULT TRUE,
    effective_start TIMESTAMP DEFAULT '1900-01-01 00:00:00',
    effective_end TIMESTAMP DEFAULT '2099-12-31 23:59:59',
    penalty_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lane_connector_movements (
    connector_id INTEGER REFERENCES lane_connectors(connector_id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL,
    PRIMARY KEY (connector_id, movement_type)
);

-- Penalties
CREATE TABLE penalties (
    penalty_id SERIAL PRIMARY KEY,
    unit_type_id INTEGER REFERENCES unit_types(unit_type_id),
    penalty_type VARCHAR(20),
    seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE connector_unit_permissions (
    connector_id INTEGER REFERENCES lane_connectors(connector_id),
    unit_type_id INTEGER REFERENCES unit_types(unit_type_id),
    is_allowed BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (connector_id, unit_type_id)
);

CREATE TABLE safety_zones (
    zone_id SERIAL PRIMARY KEY,
    zone_name VARCHAR(100),
    zone_type VARCHAR(20) CHECK (zone_type IN ('restricted', 'blast')),
    geometry GEOMETRY(POLYGON, 4326),
    is_active BOOLEAN DEFAULT TRUE,
    effective_start TIMESTAMP,
    effective_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE vehicle_classes (
    class_id INTEGER PRIMARY KEY,
    class_name VARCHAR(50) NOT NULL,
    abbreviation VARCHAR(20),
    flags INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infrastructure_access_lanes (
    assignment_id SERIAL PRIMARY KEY,
    lane_id VARCHAR(50) REFERENCES lane_segments(lane_id),
    infra_id INTEGER REFERENCES infrastructure(location_id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infrastructure_access_functions (
    assignment_id INTEGER REFERENCES infrastructure_access_lanes(assignment_id) ON DELETE CASCADE,
    access_function VARCHAR(20) NOT NULL,
    PRIMARY KEY (assignment_id, access_function)
);



CREATE TABLE infrastructure_unit_permissions (
    infra_id INTEGER REFERENCES infrastructure(location_id),
    unit_type_id INTEGER REFERENCES unit_types(unit_type_id),
    is_allowed BOOLEAN DEFAULT TRUE,
    capacity_factor DECIMAL(3,2) DEFAULT 1.0,
    PRIMARY KEY (infra_id, unit_type_id)
);



CREATE TABLE gps_lane_intersections (
    intersection_id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES infrastructure(location_id),
    lane_id VARCHAR(80) REFERENCES lane_segments(lane_id),
    intersection_length_m DECIMAL(10,2),
    coverage_ratio DECIMAL(5,4),
    is_primary_access BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE road_markers (
    marker_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    road_id BIGINT REFERENCES roads(road_id),
    lane_group_id UUID REFERENCES lane_groups(lane_group_id),
    marker_type VARCHAR(32) CHECK (marker_type IN ('corner','side_center','centerline')),
    marker_index INTEGER,
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    angle_deg DECIMAL(8,4),
    proximity_m DECIMAL(10,3),
    nearest_location_id INTEGER REFERENCES infrastructure(location_id),
    nearest_location_name VARCHAR(120),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_roads_geometry ON roads USING GIST (geometry);
CREATE INDEX idx_roads_centerline ON roads USING GIST (centerline);
CREATE INDEX idx_roads_start_location ON roads (start_location_id);
CREATE INDEX idx_roads_end_location ON roads (end_location_id);
CREATE INDEX idx_roads_source_system ON roads (source_system);

CREATE INDEX idx_lane_segments_geometry ON lane_segments USING GIST (geometry);
CREATE INDEX idx_lane_segments_road_id ON lane_segments (road_id);
CREATE INDEX idx_lane_segments_direction ON lane_segments (lane_direction);
CREATE INDEX idx_lane_segments_length ON lane_segments (length_m);

CREATE INDEX idx_infrastructure_geometry ON infrastructure USING GIST (geometry);
CREATE INDEX idx_infrastructure_gps_type ON infrastructure (gpstype);
CREATE INDEX idx_infrastructure_pit ON infrastructure (pit_id);
CREATE INDEX idx_infrastructure_region ON infrastructure (region_id);
CREATE INDEX idx_regions_pit ON regions (pit_id);
CREATE INDEX idx_infrastructure_shop_type ON infrastructure (shoptype);
CREATE INDEX idx_infrastructure_unit_type ON infrastructure (unit_id);

CREATE INDEX idx_safety_zones_geometry ON safety_zones USING GIST (geometry);
CREATE INDEX idx_infrastructure_access_lanes_lane ON infrastructure_access_lanes (lane_id);
CREATE INDEX idx_infrastructure_access_lanes_infra ON infrastructure_access_lanes (infra_id);
CREATE INDEX idx_infrastructure_access_functions_type ON infrastructure_access_functions (access_function);
CREATE INDEX idx_vehicle_classes_name ON vehicle_classes (class_name);
CREATE INDEX idx_lane_conditions_lane_id ON lane_conditions (lane_id);

CREATE INDEX idx_lane_connectors_from_lane ON lane_connectors (from_lane_id);
CREATE INDEX idx_lane_connectors_to_lane ON lane_connectors (to_lane_id);
CREATE INDEX idx_lane_connector_movements_type ON lane_connector_movements (movement_type);

CREATE MATERIALIZED VIEW active_lane_network AS
SELECT 
    ls.lane_id,
    ls.road_id,
    ls.lane_name,
    ls.geometry,
    ls.lane_width_m,
    ls.weight_limit_tonnes,
    ls.length_m
FROM lane_segments ls
JOIN roads r ON ls.road_id = r.road_id
WHERE ls.lane_id IN (
    SELECT DISTINCT lane_id 
    FROM lane_conditions 
    WHERE (effective_start IS NULL OR effective_start <= CURRENT_TIMESTAMP)
    AND (effective_end IS NULL OR effective_end >= CURRENT_TIMESTAMP)
    AND condition_type != 'closed'
);

CREATE OR REPLACE FUNCTION refresh_active_lane_network()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW active_lane_network;
END;
$$ LANGUAGE plpgsql;
CREATE INDEX idx_regions_pit ON regions (pit_id);
CREATE INDEX idx_infrastructure_shop_type ON infrastructure (shoptype);
CREATE INDEX idx_infrastructure_unit_type ON infrastructure (unit_id);

CREATE INDEX idx_safety_zones_geometry ON safety_zones USING GIST (geometry);
CREATE INDEX idx_infrastructure_access_lanes_lane ON infrastructure_access_lanes (lane_id);
CREATE INDEX idx_infrastructure_access_lanes_infra ON infrastructure_access_lanes (infra_id);
CREATE INDEX idx_infrastructure_access_functions_type ON infrastructure_access_functions (access_function);
CREATE INDEX idx_vehicle_classes_name ON vehicle_classes (class_name);
CREATE INDEX idx_lane_conditions_lane_id ON lane_conditions (lane_id);

CREATE INDEX idx_lane_connectors_from_lane ON lane_connectors (from_lane_id);
CREATE INDEX idx_lane_connectors_to_lane ON lane_connectors (to_lane_id);
CREATE INDEX idx_lane_connector_movements_type ON lane_connector_movements (movement_type);

CREATE MATERIALIZED VIEW active_lane_network AS
SELECT 
    ls.lane_id,
    ls.road_id,
    ls.lane_name,
    ls.geometry,
    ls.lane_width_m,
    ls.weight_limit_tonnes,
    ls.length_m
FROM lane_segments ls
JOIN roads r ON ls.road_id = r.road_id
WHERE ls.lane_id IN (
    SELECT DISTINCT lane_id 
    FROM lane_conditions 
    WHERE (effective_start IS NULL OR effective_start <= CURRENT_TIMESTAMP)
    AND (effective_end IS NULL OR effective_end >= CURRENT_TIMESTAMP)
    AND condition_type != 'closed'
);

CREATE OR REPLACE FUNCTION refresh_active_lane_network()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW active_lane_network;
END;
$$ LANGUAGE plpgsql;
CREATE INDEX idx_regions_pit ON regions (pit_id);
CREATE INDEX idx_infrastructure_shop_type ON infrastructure (shoptype);
CREATE INDEX idx_infrastructure_unit_type ON infrastructure (unit_id);

CREATE INDEX idx_safety_zones_geometry ON safety_zones USING GIST (geometry);
CREATE INDEX idx_infrastructure_access_lanes_lane ON infrastructure_access_lanes (lane_id);
CREATE INDEX idx_infrastructure_access_lanes_infra ON infrastructure_access_lanes (infra_id);
CREATE INDEX idx_infrastructure_access_functions_type ON infrastructure_access_functions (access_function);
CREATE INDEX idx_vehicle_classes_name ON vehicle_classes (class_name);
CREATE INDEX idx_lane_conditions_lane_id ON lane_conditions (lane_id);

CREATE INDEX idx_lane_connectors_from_lane ON lane_connectors (from_lane_id);
CREATE INDEX idx_lane_connectors_to_lane ON lane_connectors (to_lane_id);
CREATE INDEX idx_lane_connector_movements_type ON lane_connector_movements (movement_type);

CREATE MATERIALIZED VIEW active_lane_network AS
SELECT 
    ls.lane_id,
    ls.road_id,
    ls.lane_name,
    ls.geometry,
    ls.lane_width_m,
    ls.weight_limit_tonnes,
    ls.length_m
FROM lane_segments ls
JOIN roads r ON ls.road_id = r.road_id
WHERE ls.lane_id IN (
    SELECT DISTINCT lane_id 
    FROM lane_conditions 
    WHERE (effective_start IS NULL OR effective_start <= CURRENT_TIMESTAMP)
    AND (effective_end IS NULL OR effective_end >= CURRENT_TIMESTAMP)
    AND condition_type != 'closed'
);

CREATE OR REPLACE FUNCTION refresh_active_lane_network()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW active_lane_network;
END;
$$ LANGUAGE plpgsql;