-- Create sample data for testing
TRUNCATE TABLE consolidated_locations;
TRUNCATE TABLE consolidated_intersections;

-- Insert sample locations
INSERT INTO consolidated_locations (location_name, category, total_points, center_latitude, center_longitude, avg_altitude, area_sqm, polygon, center_point) VALUES
('Pit 1', 'pit', 150, -23.5, 119.5, 100, 50000, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.49, -23.51), ST_MakePoint(119.51, -23.51), ST_MakePoint(119.51, -23.49), ST_MakePoint(119.49, -23.49), ST_MakePoint(119.49, -23.51)])), 4326), ST_SetSRID(ST_MakePoint(119.5, -23.5), 4326)),
('Parking Bay A', 'parking', 80, -23.52, 119.52, 95, 20000, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.515, -23.525), ST_MakePoint(119.525, -23.525), ST_MakePoint(119.525, -23.515), ST_MakePoint(119.515, -23.515), ST_MakePoint(119.515, -23.525)])), 4326), ST_SetSRID(ST_MakePoint(119.52, -23.52), 4326)),
('Crusher 1', 'crusher', 120, -23.48, 119.48, 105, 30000, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.475, -23.485), ST_MakePoint(119.485, -23.485), ST_MakePoint(119.485, -23.475), ST_MakePoint(119.475, -23.475), ST_MakePoint(119.475, -23.485)])), 4326), ST_SetSRID(ST_MakePoint(119.48, -23.48), 4326)),
('Fuel Station', 'fuel', 50, -23.53, 119.53, 98, 10000, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.525, -23.535), ST_MakePoint(119.535, -23.535), ST_MakePoint(119.535, -23.525), ST_MakePoint(119.525, -23.525), ST_MakePoint(119.525, -23.535)])), 4326), ST_SetSRID(ST_MakePoint(119.53, -23.53), 4326)),
('Dump Site 1', 'dump', 200, -23.47, 119.47, 110, 80000, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.46, -23.48), ST_MakePoint(119.48, -23.48), ST_MakePoint(119.48, -23.46), ST_MakePoint(119.46, -23.46), ST_MakePoint(119.46, -23.48)])), 4326), ST_SetSRID(ST_MakePoint(119.47, -23.47), 4326));

-- Insert sample intersections
INSERT INTO consolidated_intersections (intersection_name, total_points, center_latitude, center_longitude, area_sqm, intersection_polygon, center_point) VALUES
('Intersection 1', 45, -23.505, 119.505, 5000, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.503, -23.507), ST_MakePoint(119.507, -23.507), ST_MakePoint(119.507, -23.503), ST_MakePoint(119.503, -23.503), ST_MakePoint(119.503, -23.507)])), 4326), ST_SetSRID(ST_MakePoint(119.505, -23.505), 4326)),
('Intersection 2', 38, -23.515, 119.515, 4500, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.513, -23.517), ST_MakePoint(119.517, -23.517), ST_MakePoint(119.517, -23.513), ST_MakePoint(119.513, -23.513), ST_MakePoint(119.513, -23.517)])), 4326), ST_SetSRID(ST_MakePoint(119.515, -23.515), 4326)),
('Intersection 3', 52, -23.495, 119.495, 5500, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(119.493, -23.497), ST_MakePoint(119.497, -23.497), ST_MakePoint(119.497, -23.493), ST_MakePoint(119.493, -23.493), ST_MakePoint(119.493, -23.497)])), 4326), ST_SetSRID(ST_MakePoint(119.495, -23.495), 4326));

-- Show results
SELECT 'Locations:' as type, COUNT(*) as count FROM consolidated_locations
UNION ALL
SELECT 'Intersections:', COUNT(*) FROM consolidated_intersections;
