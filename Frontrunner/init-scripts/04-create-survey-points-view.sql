DROP VIEW IF EXISTS survey_points;

CREATE VIEW survey_points AS
SELECT 
    coordinate_id,
    latitude,
    longitude,
    altitude,
    coord_x,
    coord_y,
    coord_z,
    coord_heading,
    coord_incl,
    coord_status,
    location_name,
    location_type,
    the_geom
FROM (
    SELECT *,
           ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
    FROM all_survey_points
) ranked
WHERE rn <= 50000
ORDER BY rn;

SELECT 'survey_points view created (sampled 50,000 points from all_survey_points table)' AS status;

