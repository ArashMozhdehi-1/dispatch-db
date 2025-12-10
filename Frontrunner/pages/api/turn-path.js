/**
 * API endpoint for computing G2-style turning paths between roads at intersections.
 * 
 * This endpoint calculates a curvature-bounded path (Dubins path) from one road's
 * side-center point to another road's side-center point at a shared intersection,
 * respecting vehicle dimensions and ensuring the path stays within the intersection.
 * 
 * Example request:
 * POST /api/turn-path
 * {
 *   "from_road_id": "INT_18 -> 480_RL",
 *   "to_road_id": "480_RL -> INT_18",
 *   "intersection_name": "INT_18",
 *   "vehicle_profile_id": "komatsu_830e",
 *   "sampling_step_m": 1.0
 * }
 */

import { spawn } from 'child_process';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      from_road_id,
      to_road_id,
      intersection_name,
      vehicle_profile_id = 'komatsu_830e',
      custom_vehicle_profile,
      sampling_step_m = 1.0,
      local_srid = 28350,  // Australian GDA2020 / MGA zone 50
      from_marker_oid,
      to_marker_oid,
    } = req.body;

    // Validate required parameters
    if (!from_road_id || !to_road_id || !intersection_name) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['from_road_id', 'to_road_id', 'intersection_name']
      });
    }

    // Prepare input for Python CLI
    const inputData = JSON.stringify({
      from_road_id,
      to_road_id,
      intersection_name,
      vehicle_profile_id,
      custom_vehicle_profile,
      sampling_step_m,
      local_srid,
      from_marker_oid,
      to_marker_oid,
    });

    // Call Python CLI script
    const pythonScript = path.join(process.cwd(), 'etl', 'compute_turn_path_cli.py');
    const python = spawn('python3', [pythonScript, 'compute'], {
      env: {
        ...process.env,
        MAP_DUMP_DB_HOST: process.env.MAP_DUMP_DB_HOST || process.env.POSTGRES_HOST || 'postgres',
        MAP_DUMP_DB_PORT: process.env.MAP_DUMP_DB_PORT || process.env.POSTGRES_PORT || '5432',
        MAP_DUMP_DB_NAME: process.env.MAP_DUMP_DB_NAME || 'mf_geoserver_db',
        MAP_DUMP_DB_USER: process.env.MAP_DUMP_DB_USER || process.env.POSTGRES_USER || 'infra_user',
        MAP_DUMP_DB_PASSWORD: process.env.MAP_DUMP_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'infra_password',
      }
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.stdin.write(inputData);
    python.stdin.end();

    python.on('close', (code) => {
      // Try to parse whatever stdout we got
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (e) {
        // Only return 500 if we absolutely cannot parse JSON
        if (code !== 0) {
          console.error('Python script error (raw):', stderr);
          return res.status(500).json({
            error: 'Python script failed and returned invalid JSON',
            stderr: stderr
          });
        }
      }

      // If we have a valid result object
      if (result) {
        // --- FORCE CLEANUP OF POLYGONS (Safety net) ---
        // Even if Python returns them, we strip them here to satisfy the requirement
        // and handle cases where the Python code might be stale (caching issues).
        // [MODIFIED] We now ALLOW swept_path to pass through, 
        // because we want to render the OUTLINE (traces) as lines.
        // The frontend will ensure it's not a "fat polygon" by using polyline rendering.

        // Log if we have it for debugging
        if (result.swept_path && result.swept_path.geometry_geojson) {
          console.log('[API] Swept path geometry received (will be rendered as outline).');
        }
        if (result.vehicle_envelope && result.vehicle_envelope.geometry_geojson) {
          console.warn('[API] Python returned vehicle_envelope polygon - stripping it.');
          result.vehicle_envelope.geometry_geojson = null;
          result.vehicle_envelope.geometry_wkt = null;
        }
        if (result.path && result.path.envelope_geojson) {
          result.path.envelope_geojson = null;
          result.path.envelope_wkt = null;
        }

        // Ensure the top-level flag matches
        result.centerline_only = true;

        // Log Python stderr for debugging (shows our print statements)
        if (stderr.trim().length > 0) {
          console.log('[API] Python Stderr:', stderr);
        }

        // Domain-specific status check
        // "ok" -> 200
        // "envelope_outside_intersection" -> 200 (handled by frontend logic)
        // "error" -> 400 (bad request parameters etc)
        if (result.status === 'error') {
          return res.status(400).json(result);
        }

        // Ensure "envelope_outside_intersection" or any other non-error status returns 200
        // so the frontend receives the payload cleanly.
        return res.status(200).json(result);
      }

      // Fallback for empty stdout + success code (unlikely)
      return res.status(500).json({ error: 'No output from Python script' });
    });

  } catch (error) {
    console.error('Error computing turn path:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

