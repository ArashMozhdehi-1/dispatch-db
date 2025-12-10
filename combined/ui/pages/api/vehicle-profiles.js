export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    profiles: {
      komatsu_830e: {
        name: 'Komatsu 830E',
        vehicle_width_m: 7.3,
        wheelbase_m: 6.35,
        min_turn_radius_m: 10.2,
        max_steering_angle_deg: 32,
        side_buffer_m: 0.5,
        front_buffer_m: 1.0,
        rear_buffer_m: 1.0,
      },
    },
  });
}


