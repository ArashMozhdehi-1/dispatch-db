#!/usr/bin/env python3

import sys
import os
from pathlib import Path
import curses
import time
from typing import List, Dict, Any

sys.path.append(str(Path(__file__).parent.parent.parent))

from src.models import DatabaseManager
from config import config


class DatabaseQueryGUI:
    def __init__(self, stdscr):
        self.stdscr = stdscr
        self.db_manager = DatabaseManager()
        self.current_query = 0
        self.queries = [
            {
                "name": "Show all locations",
                "sql": "SELECT location_id, location_name, p.pit_name, r.region_name, x_coord, y_coord FROM locations l LEFT JOIN pits p ON l.pit_id = p.pit_id LEFT JOIN regions r ON l.region_id = r.region_id ORDER BY p.pit_name, r.region_name LIMIT 50",
            },
            {
                "name": "Show all roads",
                "sql": "WITH unique_roads AS (SELECT r.road_id, r.road_name, r.start_location_id, r.end_location_id FROM roads r WHERE NOT EXISTS (SELECT 1 FROM roads r2 WHERE r2.start_location_id = r.end_location_id AND r2.end_location_id = r.start_location_id AND r2.road_id < r.road_id)) SELECT ur.road_id, ur.road_name, ur.start_location_id, ur.end_location_id, COALESCE(SUM(ST_Length(ls.geometry) * 111000), 0) as calculated_distance_m, COALESCE(SUM(ls.time_empty_seconds), 0) as total_time_empty, COALESCE(SUM(ls.time_loaded_seconds), 0) as total_time_loaded FROM unique_roads ur LEFT JOIN lane_segments ls ON ur.road_id = ls.road_id GROUP BY ur.road_id, ur.road_name, ur.start_location_id, ur.end_location_id ORDER BY calculated_distance_m DESC LIMIT 50",
            },
            {
                "name": "Show lane segments",
                "sql": "SELECT lane_id, road_id, length_m, time_empty_seconds, time_loaded_seconds, is_closed FROM lane_segments ORDER BY road_id LIMIT 50",
            },
            {
                "name": "Show lane geometry (WKT)",
                "sql": "SELECT lane_id, road_id, ST_AsText(geometry) as geometry_wkt FROM lane_segments ORDER BY road_id, lane_id LIMIT 20",
            },
            {
                "name": "Lane segment travel times",
                "sql": "SELECT lane_id, road_id, length_m, time_empty_seconds, time_loaded_seconds, ROUND(time_empty_seconds::numeric / NULLIF(length_m, 0), 2) as empty_sec_per_meter, ROUND(time_loaded_seconds::numeric / NULLIF(length_m, 0), 2) as loaded_sec_per_meter, is_closed FROM lane_segments WHERE time_empty_seconds > 0 OR time_loaded_seconds > 0 ORDER BY time_loaded_seconds DESC LIMIT 50",
            },
            {
                "name": "Show infrastructure geometry (WKT)",
                "sql": "SELECT location_id, location_name, ST_AsText(center_point) as center_point_wkt, ST_AsText(geometry) as geometry_wkt, radius_m FROM infrastructure ORDER BY location_id LIMIT 20",
            },

            {
                "name": "Count by pit",
                "sql": "SELECT p.pit_name, COUNT(l.location_id) as location_count FROM pits p LEFT JOIN locations l ON p.pit_id = l.pit_id GROUP BY p.pit_id, p.pit_name ORDER BY location_count DESC",
            },
            {
                "name": "Count by region",
                "sql": "SELECT r.region_name, p.pit_name, COUNT(l.location_id) as location_count FROM regions r LEFT JOIN pits p ON r.pit_id = p.pit_id LEFT JOIN locations l ON r.region_id = l.region_id GROUP BY r.region_id, r.region_name, p.pit_name ORDER BY location_count DESC",
            },
            {
                "name": "GPS types",
                "sql": "SELECT gt.description, COUNT(l.location_id) as count FROM gps_types gt LEFT JOIN locations l ON gt.gps_type_id = l.gps_type_id GROUP BY gt.gps_type_id, gt.description ORDER BY count DESC",
            },
            {
                "name": "Shop types",
                "sql": "SELECT st.description, COUNT(l.location_id) as count FROM shop_types st LEFT JOIN locations l ON st.shop_type_id = l.shop_type_id GROUP BY st.shop_type_id, st.description ORDER BY count DESC",
            },
            {
                "name": "Unit types",
                "sql": "SELECT ut.description, COUNT(l.location_id) as count FROM unit_types ut LEFT JOIN locations l ON ut.unit_type_id = l.unit_type_id GROUP BY ut.unit_type_id, ut.description ORDER BY count DESC",
            },
            {
                "name": "Infrastructure (with WKT)",
                "sql": "SELECT location_id, location_name, ST_AsText(center_point) as center_point_wkt, ST_AsText(geometry) as geometry_wkt, radius_m, elevation_m FROM infrastructure ORDER BY location_id LIMIT 20",
            },

            {
                "name": "Lane Connectors",
                "sql": "SELECT lc.connector_id, lc.from_lane_id, lc.to_lane_id, STRING_AGG(lcm.movement_type, ', ') as movement_types, lc.is_active FROM lane_connectors lc LEFT JOIN lane_connector_movements lcm ON lc.connector_id = lcm.connector_id GROUP BY lc.connector_id, lc.from_lane_id, lc.to_lane_id, lc.is_active ORDER BY lc.connector_id LIMIT 50",
            },
            {
                "name": "Infrastructure Access Lanes",
                "sql": "SELECT ial.assignment_id, ial.lane_id, i.location_name, STRING_AGG(iaf.access_function, ', ') as access_functions, ial.is_active FROM infrastructure_access_lanes ial LEFT JOIN infrastructure i ON ial.infra_id = i.location_id LEFT JOIN infrastructure_access_functions iaf ON ial.assignment_id = iaf.assignment_id GROUP BY ial.assignment_id, ial.lane_id, i.location_name, ial.is_active ORDER BY ial.assignment_id LIMIT 50",
            },
            {
                "name": "Safety Zones (with WKT)",
                "sql": "SELECT zone_id, zone_name, zone_type, ST_AsText(geometry) as geometry_wkt, is_active, effective_start, effective_end FROM safety_zones ORDER BY zone_id LIMIT 20",
            },
            {
                "name": "ALL Geometries Summary",
                "sql": "SELECT 'lane_segments' as table_name, lane_id as id, 'LINESTRING' as geom_type, ST_AsText(geometry) as geometry_wkt FROM lane_segments LIMIT 5 UNION ALL SELECT 'infrastructure' as table_name, location_id::text as id, 'POLYGONZ' as geom_type, ST_AsText(geometry) as geometry_wkt FROM infrastructure LIMIT 5 UNION ALL SELECT 'safety_zones' as table_name, zone_id::text as id, 'POLYGON' as geom_type, ST_AsText(geometry) as geometry_wkt FROM safety_zones LIMIT 5",
            },
            {
                "name": "Vehicle Classes",
                "sql": "SELECT vc.class_id, vc.class_name, vc.abbreviation, vc.flags FROM vehicle_classes vc ORDER BY vc.class_name",
            },
            {
                "name": "Lane Conditions",
                "sql": "SELECT lc.condition_id, lc.lane_id, lc.start_measure, lc.end_measure, lc.condition_type, lc.condition_value, lc.effective_start, lc.effective_end FROM lane_conditions lc ORDER BY lc.lane_id, lc.start_measure LIMIT 50",
            },
        ]
        self.results = []
        self.error_message = ""

    def init_screen(self):
        curses.curs_set(0)
        self.stdscr.clear()
        self.stdscr.refresh()

    def draw_header(self):
        height, width = self.stdscr.getmaxyx()
        header = "Dispatch Database Query Tool"
        self.stdscr.addstr(0, (width - len(header)) // 2, header, curses.A_BOLD)
        self.stdscr.addstr(1, 0, "=" * width)

    def draw_query_menu(self):
        height, width = self.stdscr.getmaxyx()
        y = 3

        self.stdscr.addstr(y, 2, "Available Queries:", curses.A_BOLD)
        y += 1

        for i, query in enumerate(self.queries):
            marker = "▶" if i == self.current_query else " "
            color = curses.A_REVERSE if i == self.current_query else curses.A_NORMAL
            self.stdscr.addstr(y + i, 4, f"{marker} {query['name']}", color)

    def draw_results(self):
        if not self.results:
            return

        height, width = self.stdscr.getmaxyx()
        y = 3 + len(self.queries) + 2

        self.stdscr.addstr(y, 2, "Query Results:", curses.A_BOLD)
        y += 1

        if self.error_message:
            self.stdscr.addstr(y, 4, f"Error: {self.error_message}", curses.A_RED)
            return

        if not self.results:
            self.stdscr.addstr(y, 4, "No results found")
            return

        max_rows = height - y - 5
        display_results = self.results[:max_rows]

        for i, row in enumerate(display_results):
            if y + i >= height - 2:
                break
            row_str = " | ".join(str(cell) for cell in row)
            if len(row_str) > width - 6:
                row_str = row_str[: width - 9] + "..."
            self.stdscr.addstr(y + i, 4, row_str)

        if len(self.results) > max_rows:
            self.stdscr.addstr(
                height - 2,
                4,
                f"... and {len(self.results) - max_rows} more rows",
                curses.A_DIM,
            )

    def draw_instructions(self):
        height, width = self.stdscr.getmaxyx()
        instructions = ["↑↓ Navigate queries", "Enter Execute query", "Q Quit"]

        y = height - len(instructions) - 1
        for i, instruction in enumerate(instructions):
            self.stdscr.addstr(y + i, 2, instruction, curses.A_DIM)

    def execute_query(self):
        try:
            query = self.queries[self.current_query]
            self.results = []
            self.error_message = ""

            results = self.db_manager.fetch_all(query["sql"])
            if results:
                self.results = [list(row) for row in results]
            else:
                self.results = []

        except Exception as e:
            self.error_message = str(e)
            self.results = []

    def run(self):
        self.init_screen()

        while True:
            self.stdscr.clear()
            self.draw_header()
            self.draw_query_menu()
            self.draw_results()
            self.draw_instructions()

            key = self.stdscr.getch()

            if key == ord("q") or key == ord("Q"):
                break
            elif key == curses.KEY_UP:
                self.current_query = (self.current_query - 1) % len(self.queries)
            elif key == curses.KEY_DOWN:
                self.current_query = (self.current_query + 1) % len(self.queries)
            elif key == ord("\n") or key == ord("\r"):
                self.execute_query()

            self.stdscr.refresh()


def main(stdscr):
    query_tool = DatabaseQueryGUI(stdscr)
    query_tool.run()


if __name__ == "__main__":
    curses.wrapper(main)
