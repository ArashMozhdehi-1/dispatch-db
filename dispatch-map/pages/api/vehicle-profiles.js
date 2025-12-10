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

const fallbackProfiles = {
    komatsu_830e: {
        name: 'Komatsu 830E',
        vehicle_width_m: 7.3,
        wheelbase_m: 6.35,
        min_turn_radius_m: 10.2,
        max_steering_angle_deg: 32,
    },
};

const respondFallback = (res, stderr = null, message = null) => {
    return res.status(200).json({
        status: 'ok',
        profiles: fallbackProfiles,
        fallback: true,
        stderr,
        message,
    });
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Call Python CLI script to list profiles
        // Ensure the path is correct relative to the Docker container working directory (/app)
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

        python.on('error', (err) => {
            console.error('vehicle-profiles spawn error:', err);
            return respondFallback(res, String(err), 'spawn_error');
        });

        python.on('close', (code) => {
            if (code !== 0) {
                console.error('Python script error:', stderr);
                return respondFallback(res, stderr, 'script_nonzero_exit');
            }

            try {
                const result = JSON.parse(stdout);
                return res.status(200).json(result);
            } catch (e) {
                console.error('Failed to parse Python output:', stdout);
                return respondFallback(res, stdout, 'parse_error');
            }
        });

    } catch (error) {
        console.error('Error listing vehicle profiles:', error);
        return respondFallback(res, error.message, 'exception');
    }
}
