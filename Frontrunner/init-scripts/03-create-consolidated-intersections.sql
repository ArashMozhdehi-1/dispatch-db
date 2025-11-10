-- Create consolidated_intersections table if it doesn't exist
-- This table will be populated by the import-intersections API

CREATE TABLE IF NOT EXISTS consolidated_intersections (
    id SERIAL PRIMARY KEY,
    intersection_name TEXT NOT NULL,
    category TEXT DEFAULT 'intersection',
    total_points INTEGER,
    center_latitude DOUBLE PRECISION,
    center_longitude DOUBLE PRECISION,
    avg_altitude DOUBLE PRECISION,
    center_point GEOMETRY(POINT, 4326),
    intersection_polygon GEOMETRY(POLYGON, 4326),
    intersection_boundary GEOMETRY(LINESTRING, 4326),
    area_sqm DOUBLE PRECISION,
    all_intersection_ids TEXT[],
    all_coordinate_ids TEXT[],
    source_tables TEXT[],
    first_recorded TIMESTAMP,
    last_recorded TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_name ON consolidated_intersections (intersection_name);
CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_category ON consolidated_intersections (category);
CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_polygon ON consolidated_intersections USING GIST (intersection_polygon);
CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_center ON consolidated_intersections USING GIST (center_point);

