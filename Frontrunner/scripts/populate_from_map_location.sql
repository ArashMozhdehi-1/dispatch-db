-- Populate consolidated_locations from map_location table
TRUNCATE TABLE consolidated_locations;

INSERT INTO consolidated_locations (
    location_name,
    category,
    total_points,
    center_latitude,
    center_longitude,
    polygon,
    center_point
)
SELECT 
    name as location_name,
    CASE 
        WHEN name ILIKE '%pit%' AND name NOT ILIKE '%parking%' THEN 'pit'
        WHEN name ILIKE '%parking%' OR name ILIKE '%bay%' THEN 'parking'
        WHEN name ILIKE '%crush%' THEN 'crusher'
        WHEN name ILIKE '%fuel%' THEN 'fuel'
        WHEN name ILIKE '%dump%' THEN 'dump'
        WHEN name ILIKE '%blast%' THEN 'blast'
        WHEN name ILIKE '%stock%' THEN 'stockpile'
        WHEN name ILIKE '%workshop%' THEN 'workshop'
        WHEN name ILIKE '%gate%' THEN 'gate'
        WHEN name ILIKE '%access%' OR name ILIKE '%entry%' THEN 'access'
        WHEN type ILIKE '%intersection%' THEN 'intersection'
        ELSE 'default'
    END as category,
    1 as total_points,
    ST_Y(ST_Centroid(geometry_wkt)) as center_latitude,
    ST_X(ST_Centroid(geometry_wkt)) as center_longitude,
    CASE 
        WHEN ST_GeometryType(geometry_wkt) = 'ST_Polygon' THEN geometry_wkt::geometry(Polygon, 4326)
        WHEN ST_GeometryType(geometry_wkt) = 'ST_LineString' THEN 
            ST_MakePolygon(geometry_wkt::geometry(LineString, 4326))
        WHEN ST_GeometryType(geometry_wkt) = 'ST_Point' THEN 
            ST_Buffer(geometry_wkt::geography, 10)::geometry(Polygon, 4326)
        ELSE NULL
    END as polygon,
    ST_Centroid(geometry_wkt)::geometry(Point, 4326) as center_point
FROM map_location
WHERE geometry_wkt IS NOT NULL;

-- Show results
SELECT 
    category,
    COUNT(*) as location_count
FROM consolidated_locations
GROUP BY category
ORDER BY location_count DESC;

SELECT COUNT(*) as total_locations FROM consolidated_locations;
