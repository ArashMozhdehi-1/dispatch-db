-- Returns a POINT on the cubic Bézier at parameter t ∈ [0,1]
CREATE OR REPLACE FUNCTION bezier_cubic_point(
    p0 geometry, p1 geometry, p2 geometry, p3 geometry, t double precision
) RETURNS geometry LANGUAGE sql IMMUTABLE AS $$
SELECT ST_SetSRID(
  ST_MakePoint(
    /* x(t) */
    (1-t)^3 * ST_X(p0) +
    3*(1-t)^2*t * ST_X(p1) +
    3*(1-t)*t^2 * ST_X(p2) +
    t^3 * ST_X(p3),
    /* y(t) */
    (1-t)^3 * ST_Y(p0) +
    3*(1-t)^2*t * ST_Y(p1) +
    3*(1-t)*t^2 * ST_Y(p2) +
    t^3 * ST_Y(p3)
  ),
  ST_SRID(p0)
);
$$;

-- n_samples controls smoothness (>=2). More = smoother.
CREATE OR REPLACE FUNCTION bezier_cubic_line(
    p0 geometry, p1 geometry, p2 geometry, p3 geometry, n_samples integer
) RETURNS geometry LANGUAGE sql IMMUTABLE AS $$
WITH params AS (
  SELECT g AS i, g::double precision/(n_samples::double precision) AS t
  FROM generate_series(0, n_samples) AS g
),
pts AS (
  SELECT bezier_cubic_point(p0,p1,p2,p3,t) AS pt
  FROM params
  ORDER BY i
)
SELECT ST_MakeLine(pt ORDER BY 1) FROM pts;
$$;

