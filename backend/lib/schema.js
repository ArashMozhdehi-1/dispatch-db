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
  }

  type Query {
    locations: [Location!]!
    segments(limit: Int): [LaneSegment!]!
    location(id: Int!): Location
    segment(id: String!): LaneSegment
    segmentsByRoad(roadId: Int!): [LaneSegment!]!
    locationsByCategory(category: String!): [Location!]!
  }
`;

module.exports = { typeDefs };

