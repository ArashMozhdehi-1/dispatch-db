-- Populate consolidated_locations from coordinate table
-- This creates consolidated location polygons from grouped coordinates

-- First, ensure the table exists
CREATE TABLE IF NOT EXISTS consolidated_locations (
    location_id SERIAL PRIMARY KEY,
    location_name VARCHAR(255),
    category VARCHAR(100),
    total_points INTEGER,
    center_latitude DOUBLE PRECISION,
    center_longitude DOUBLE PRECISION,
    avg_altitude DOUBLE PRECISION,
    area_sqm DOUBLE PRECISION,
    all_dump_node_ids TEXT,
    location_polygon JSONB,
    location_boundary JSONB,
    center_point GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clear existing data
TRUNCATE TABLE consolidated_locations;

-- Insert consolidated locations from coordinate table grouped by location_name
INSERT INTO consolidated_locations (
    location_name,
    category,
    total_points,
    center_latitude,
    center_longitude,
    avg_altitude,
    area_sqm,
    polygon,
    center_point
)
SELECT 
    c.location_name,
    CASE 
        WHEN c.location_name ILIKE '%pit%' AND c.location_name NOT ILIKE '%parking%' THEN 'pit'
        WHEN c.location_name ILIKE '%parking%' OR c.location_name ILIKE '%bay%' THEN 'parking'
        WHEN c.location_name ILIKE '%crush%' THEN 'crusher'
        WHEN c.location_name ILIKE '%fuel%' THEN 'fuel'
        WHEN c.location_name ILIKE '%dump%' THEN 'dump'
        WHEN c.location_name ILIKE '%blast%' THEN 'blast'
        WHEN c.location_name ILIKE '%stock%' THEN 'stockpile'
        WHEN c.location_name ILIKE '%workshop%' THEN 'workshop'
        WHEN c.location_name ILIKE '%gate%' THEN 'gate'
        WHEN c.location_name ILIKE '%access%' OR c.location_name ILIKE '%entry%' THEN 'access'
        ELSE 'default'
    END as category,
    COUNT(*) as total_points,
    AVG(latitude) as center_latitude,
    AVG(longitude) as center_longitude,
    AVG(altitude) as avg_altitude,
    -- Calculate approximate area (very rough estimate)
    (
        (MAX(latitude) - MIN(latitude)) * 111000 * 
        (MAX(longitude) - MIN(longitude)) * 111000 * 
        COS(RADIANS(AVG(latitude)))
    ) as area_sqm,
    -- Create a simple polygon from the bounding box using PostGIS
    ST_SetSRID(
        ST_MakePolygon(
            ST_MakeLine(ARRAY[
                ST_MakePoint(MIN(longitude), MIN(latitude)),
                ST_MakePoint(MAX(longitude), MIN(latitude)),
                ST_MakePoint(MAX(longitude), MAX(latitude)),
                ST_MakePoint(MIN(longitude), MAX(latitude)),
                ST_MakePoint(MIN(longitude), MIN(latitude))
            ])
        ),
        4326
    ) as polygon,
    ST_SetSRID(ST_MakePoint(AVG(longitude), AVG(latitude)), 4326) as center_point
FROM coordinate c
WHERE 
    c.location_name IS NOT NULL 
    AND c.location_name != ''
    AND c.latitude IS NOT NULL 
    AND c.longitude IS NOT NULL
    AND c.latitude BETWEEN -90 AND 90
    AND c.longitude BETWEEN -180 AND 180
GROUP BY c.location_name
HAVING COUNT(*) >= 3  -- Only include locations with at least 3 points
ORDER BY COUNT(*) DESC;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_consolidated_locations_name ON consolidated_locations(location_name);
CREATE INDEX IF NOT EXISTS idx_consolidated_locations_category ON consolidated_locations(category);
CREATE INDEX IF NOT EXISTS idx_consolidated_locations_center_point ON consolidated_locations USING GIST(center_point);

-- Show summary
SELECT 
    category,
    COUNT(*) as location_count,
    SUM(total_points) as total_points
FROM consolidated_locations
GROUP BY category
ORDER BY location_count DESC;
