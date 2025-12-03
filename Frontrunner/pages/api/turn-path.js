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
      if (code !== 0) {
        console.error('Python script error:', stderr);
        try {
          const errorData = JSON.parse(stdout);
          return res.status(500).json(errorData);
        } catch {
          return res.status(500).json({
            error: 'Python script failed',
            stderr: stderr,
            stdout: stdout
          });
        }
      }

      try {
        const result = JSON.parse(stdout);
        return res.status(200).json(result);
      } catch (e) {
        console.error('Failed to parse Python output:', stdout);
        return res.status(500).json({
          error: 'Invalid response from Python script',
          message: e.message
        });
      }
    });

  } catch (error) {
    console.error('Error computing turn path:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

