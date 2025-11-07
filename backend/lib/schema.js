const { gql } = require('apollo-server-micro');

const typeDefs = gql`
  type Location {
    location_id: Int!
    location_name: String
    latitude: Float!
    longitude: Float!
    elevation_m: Float
    unit_type: String
    unit_type_id: Int
    location_category: String!
    pit_name: String
    region_name: String
  }

  type LaneSegment {
    lane_id: String!
    road_id: Int!
    direction: String!
    length_m: Float!
    time_empty_seconds: Float!
    time_loaded_seconds: Float!
    is_closed: Boolean!
    geometry: String!
    start_latitude: Float!
    start_longitude: Float!
    end_latitude: Float!
    end_longitude: Float!
    lane_name: String
    lane_width_m: Float
    weight_limit_tonnes: Float
    is_trolley: Boolean!
    trolley_voltage: Float
    trolley_current_limit: Float
    trolley_wire_height: Float
    trolley_catenary_type: String
    trolley_supports: [TrolleySupport!]!
    trolley_conditions: [LaneCondition!]!
  }

  type TrolleySupport {
    support_id: Int!
    lane_id: String!
    measure: Float!
    geometry: String!
    support_type: String!
    support_material: String!
    height_m: Float!
    latitude: Float!
    longitude: Float!
  }

  type LaneCondition {
    condition_id: Int!
    lane_id: String!
    start_measure: Float!
    end_measure: Float!
    condition_type: String!
    condition_value: String
    effective_start: String!
    effective_end: String!
  }

  type SpeedLimit {
    speed_limit_id: Int!
    lane_id: String!
    series_name: String!
    manufacturer: String!
    speed_limit_mmps: Int!
    speed_limit_kmh: Float!
    speed_limit_type: String!
    condition_type: String
    condition_value: String
  }

  type WateringSchedule {
    lane_id: String!
    interval_minutes: Int!
    pattern: String!
    amount: Float!
    last_watered: String
    equipment: String
    circuit: String
  }

  type WateringStation {
    station_id: Int!
    station_name: String!
    station_code: String!
    station_type: String!
    geometry: String!
    capacity_liters: Float!
    current_level_percent: Float!
    status: String!
    connected_circuits: [Int!]!
    latitude: Float!
    longitude: Float!
  }

  type SpeedMonitoring {
    monitoring_id: Int!
    unit_type_id: Int!
    series_id: Int!
    lane_id: String!
    measure: Float!
    speed_mmps: Int!
    speed_kmh: Float!
    violation_type: String
    operational_mode: String
    timestamp: String!
    latitude: Float!
    longitude: Float!
  }

  type TrolleySubstation {
    substation_id: Int!
    substation_name: String!
    substation_code: String!
    geometry: String!
    input_voltage_v: Int!
    output_voltage_v: Int!
    capacity_kva: Float!
    status: String!
    connected_lanes: [String!]!
    latitude: Float!
    longitude: Float!
  }

  type PowerGenerator {
    generator_id: Int!
    generator_name: String!
    generator_code: String!
    geometry: String!
    generator_type: String!
    capacity_kw: Float!
    voltage_output_v: Int!
    frequency_hz: Float!
    fuel_type: String
    fuel_capacity_l: Float
    current_fuel_level_l: Float
    efficiency_percent: Float!
    status: String!
    last_maintenance_date: String
    next_maintenance_date: String
    connected_substations: [Int!]!
    latitude: Float!
    longitude: Float!
  }

  type ElectricalTruck {
    truck_id: Int!
    unit_type_id: Int
    vehicle_class_id: Int
    truck_name: String!
    truck_model: String!
    geometry: String!
    drive_system: String!
    max_voltage_v: Int!
    max_current_a: Int!
    battery_capacity_kwh: Float!
    current_battery_level_percent: Float!
    power_consumption_kw: Float!
    trolley_connection_type: String!
    status: String!
    current_route: String
    last_charge_time: String
    next_maintenance_date: String
    latitude: Float!
    longitude: Float!
  }

  type Intersection {
    intersection_id: Int!
    intersection_name: String!
    intersection_type: String
    geometry: String!
    safety_buffer_m: Float!
    r_min_m: Float!
    created_at: String!
  }

  type Query {
    locations(limit: Int): [Location!]!
    segments(limit: Int): [LaneSegment!]!
    location(id: Int!): Location
    segment(id: String!): LaneSegment
    segmentsByRoad(roadId: Int!): [LaneSegment!]!
    speedLimitsByLane(laneId: String!): [SpeedLimit!]!
    speedLimitsByRoad(roadId: Int!): [SpeedLimit!]!
    wateringByLane(laneId: String!): WateringSchedule
    wateringByRoad(roadId: Int!): [WateringSchedule!]!
    locationsByCategory(category: String!): [Location!]!
    trolleySegments: [LaneSegment!]!
    trolleySupports(laneId: String): [TrolleySupport!]!
    trolleySubstations: [TrolleySubstation!]!
    powerGenerators: [PowerGenerator!]!
    electricalTrucks: [ElectricalTruck!]!
    laneConditions(laneId: String): [LaneCondition!]!
    wateringStations: [WateringStation!]!
    speedMonitoring: [SpeedMonitoring!]!
    intersections: [Intersection!]!
  }
`;

module.exports = { typeDefs };

