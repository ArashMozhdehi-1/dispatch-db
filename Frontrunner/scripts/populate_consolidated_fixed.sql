-- Populate consolidated_locations with proper subquery
TRUNCATE TABLE consolidated_locations;

WITH location_data AS (
    SELECT 
        location_name as loc_name,
        CASE 
            WHEN location_name ILIKE '%pit%' AND location_name NOT ILIKE '%parking%' THEN 'pit'
            WHEN location_name ILIKE '%parking%' OR location_name ILIKE '%bay%' THEN 'parking'
            WHEN location_name ILIKE '%crush%' THEN 'crusher'
            WHEN location_name ILIKE '%fuel%' THEN 'fuel'
            WHEN location_name ILIKE '%dump%' THEN 'dump'
            WHEN location_name ILIKE '%blast%' THEN 'blast'
            WHEN location_name ILIKE '%stock%' THEN 'stockpile'
            WHEN location_name ILIKE '%workshop%' THEN 'workshop'
            WHEN location_name ILIKE '%gate%' THEN 'gate'
            WHEN location_name ILIKE '%access%' OR location_name ILIKE '%entry%' THEN 'access'
            ELSE 'default'
        END as cat,
        COUNT(*)::integer as point_count,
        AVG(latitude) as avg_lat,
        AVG(longitude) as avg_lon,
        AVG(altitude) as avg_alt,
        (MAX(latitude) - MIN(latitude)) * 111000 * (MAX(longitude) - MIN(longitude)) * 111000 * COS(RADIANS(AVG(latitude))) as area,
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
        ) as poly,
        ST_SetSRID(ST_MakePoint(AVG(longitude), AVG(latitude)), 4326) as center_pt
    FROM coordinate
    WHERE 
        location_name IS NOT NULL 
        AND location_name != ''
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
    GROUP BY location_name
    HAVING COUNT(*) >= 3
)
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
    loc_name,
    cat,
    point_count,
    avg_lat,
    avg_lon,
    avg_alt,
    area,
    poly,
    center_pt
FROM location_data
ORDER BY point_count DESC;

-- Show results
SELECT 
    category,
    COUNT(*) as location_count,
    SUM(total_points) as total_points
FROM consolidated_locations
GROUP BY category
ORDER BY location_count DESC;

SELECT COUNT(*) as total_locations FROM consolidated_locations;
