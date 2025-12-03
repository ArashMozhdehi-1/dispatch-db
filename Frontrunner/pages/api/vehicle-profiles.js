/**
 * API endpoint for listing available vehicle profiles.
 * 
 * GET /api/vehicle-profiles
 * 
 * Returns a list of pre-defined vehicle profiles with their specifications
 * (dimensions, turning radius, etc.) that can be used for turn path planning.
 */

import { spawn } from 'child_process';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Call Python CLI script to list profiles
    const pythonScript = path.join(process.cwd(), 'etl', 'compute_turn_path_cli.py');
    const python = spawn('python3', [pythonScript, 'list-profiles']);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', stderr);
        return res.status(500).json({
          error: 'Failed to list vehicle profiles',
          stderr: stderr
        });
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
    console.error('Error listing vehicle profiles:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

