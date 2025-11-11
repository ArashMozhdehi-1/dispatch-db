-- Populate consolidated_locations from REAL data in dump_node table
-- This uses actual mine data, not sample data

TRUNCATE TABLE consolidated_locations;
TRUNCATE TABLE consolidated_intersections;

-- Create consolidated dump locations by clustering nearby dump nodes
-- Using ST_ClusterDBSCAN to group dump nodes within 50 meters of each other
WITH clustered_dumps AS (
    SELECT 
        _oid_,
        latitude,
        longitude,
        altitude,
        geom,
        ST_ClusterDBSCAN(geom, eps := 0.0005, minpoints := 3) OVER () as cluster_id
    FROM dump_node
    WHERE 
        latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
),
dump_clusters AS (
    SELECT 
        cluster_id,
        COUNT(*) as point_count,
        AVG(latitude) as avg_lat,
        AVG(longitude) as avg_lon,
        AVG(altitude) as avg_alt,
        ST_ConvexHull(ST_Collect(geom)) as hull_geom,
        ST_Centroid(ST_Collect(geom)) as center_geom,
        ARRAY_AGG(_oid_) as dump_node_ids
    FROM clustered_dumps
    WHERE cluster_id IS NOT NULL
    GROUP BY cluster_id
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
    center_point,
    all_dump_node_ids
)
SELECT 
    'Dump Area ' || cluster_id as location_name,
    'dump' as category,
    point_count::integer,
    avg_lat,
    avg_lon,
    avg_alt,
    ST_Area(hull_geom::geography) as area_sqm,
    CASE 
        WHEN ST_GeometryType(hull_geom) = 'ST_Polygon' THEN hull_geom::geometry(Polygon, 4326)
        WHEN ST_GeometryType(hull_geom) = 'ST_LineString' THEN ST_MakePolygon(hull_geom::geometry(LineString, 4326))
        ELSE ST_Buffer(center_geom::geography, 10)::geometry(Polygon, 4326)
    END as polygon,
    center_geom::geometry(Point, 4326) as center_point,
    dump_node_ids::text[]
FROM dump_clusters
ORDER BY point_count DESC;

-- Now create some pit locations from coordinate table by grouping coordinates
-- that are far from dump nodes (likely pit locations)
WITH pit_candidates AS (
    SELECT 
        c.latitude,
        c.longitude,
        c.altitude,
        ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326) as geom,
        ST_ClusterDBSCAN(ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326), eps := 0.001, minpoints := 10) OVER () as cluster_id
    FROM coordinate c
    WHERE 
        c.latitude IS NOT NULL 
        AND c.longitude IS NOT NULL
        AND c.latitude BETWEEN -90 AND 90
        AND c.longitude BETWEEN -180 AND 180
        -- Exclude points that are near dump nodes
        AND NOT EXISTS (
            SELECT 1 FROM dump_node d
            WHERE ST_DWithin(
                ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
                d.geom::geography,
                100  -- 100 meters
            )
        )
    LIMIT 50000  -- Limit to avoid processing too many points
),
pit_clusters AS (
    SELECT 
        cluster_id,
        COUNT(*) as point_count,
        AVG(latitude) as avg_lat,
        AVG(longitude) as avg_lon,
        AVG(altitude) as avg_alt,
        ST_ConvexHull(ST_Collect(geom)) as hull_geom,
        ST_Centroid(ST_Collect(geom)) as center_geom
    FROM pit_candidates
    WHERE cluster_id IS NOT NULL
    GROUP BY cluster_id
    HAVING COUNT(*) >= 20  -- Require at least 20 points for a pit
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
    'Pit Area ' || cluster_id as location_name,
    'pit' as category,
    point_count::integer,
    avg_lat,
    avg_lon,
    avg_alt,
    ST_Area(hull_geom::geography) as area_sqm,
    CASE 
        WHEN ST_GeometryType(hull_geom) = 'ST_Polygon' THEN hull_geom::geometry(Polygon, 4326)
        WHEN ST_GeometryType(hull_geom) = 'ST_LineString' THEN ST_MakePolygon(hull_geom::geometry(LineString, 4326))
        ELSE ST_Buffer(center_geom::geography, 20)::geometry(Polygon, 4326)
    END as polygon,
    center_geom::geometry(Point, 4326) as center_point
FROM pit_clusters
ORDER BY point_count DESC
LIMIT 20;  -- Limit to top 20 pit areas

-- Show results
SELECT 
    category,
    COUNT(*) as location_count,
    SUM(total_points) as total_points,
    ROUND(SUM(area_sqm)::numeric, 2) as total_area_sqm
FROM consolidated_locations
GROUP BY category
ORDER BY location_count DESC;

SELECT COUNT(*) as total_locations FROM consolidated_locations;
