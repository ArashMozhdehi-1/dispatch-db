#!/usr/bin/env python3
import curses
import sys
import time
import logging
from pathlib import Path
from typing import List, Dict, Optional
import io
import sys



sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.models import DatabaseManager


def suppress_logging():
    logging.getLogger().setLevel(logging.CRITICAL)

    for logger_name in [
        "__main__",
        "src.models.database",
        "src.app.etl",
        "src.models.spatial",
    ]:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.CRITICAL)
        for handler in logger.handlers[:]:
            if isinstance(handler, logging.StreamHandler):
                logger.removeHandler(handler)

    class NullWriter:
        def write(self, txt):
            pass

        def flush(self):
            pass

    return NullWriter()


suppress_logging()


class Panel:
    def __init__(self, x: int, y: int, width: int, height: int, title: str):
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.title = title
        self.items = []
        self.selected = 0
        self.scroll_offset = 0
        self.is_active = False

    def set_items(self, items: List[str]):
        self.items = items
        self.selected = min(self.selected, len(items) - 1) if items else 0
        self.scroll_offset = 0

    def move_up(self):
        if self.selected > 0:
            self.selected -= 1
            if self.selected < self.scroll_offset:
                self.scroll_offset = self.selected

    def move_down(self):
        if self.selected < len(self.items) - 1:
            self.selected += 1
            content_height = self.height - 3
            if self.selected >= self.scroll_offset + content_height:
                self.scroll_offset = self.selected - content_height + 1

    def get_selected_item(self) -> Optional[str]:
        if 0 <= self.selected < len(self.items):
            return self.items[self.selected]
        return None

    def draw(self, stdscr):
        stdscr.addstr(
            self.y, self.x, "┌" + "─" * (self.width - 2) + "┐", curses.color_pair(1)
        )

        title_text = f" {self.title} "
        title_x = self.x + (self.width - len(title_text)) // 2
        stdscr.addstr(
            self.y,
            title_x,
            title_text,
            curses.color_pair(3) if self.is_active else curses.color_pair(1),
        )

        content_height = self.height - 3
        visible_items = self.items[
            self.scroll_offset : self.scroll_offset + content_height
        ]

        for i in range(content_height):
            line_y = self.y + 1 + i

            stdscr.addstr(line_y, self.x, "│", curses.color_pair(1))

            if i < len(visible_items):
                item = visible_items[i]
                actual_index = self.scroll_offset + i

                item_text = item[: self.width - 4]

                if actual_index == self.selected and self.is_active:
                    stdscr.addstr(
                        line_y,
                        self.x + 1,
                        f" {item_text:<{self.width-3}}",
                        curses.color_pair(2),
                    )
                else:
                    stdscr.addstr(
                        line_y,
                        self.x + 1,
                        f" {item_text:<{self.width-3}}",
                        curses.color_pair(1),
                    )
            else:
                stdscr.addstr(
                    line_y, self.x + 1, " " * (self.width - 2), curses.color_pair(1)
                )

            stdscr.addstr(line_y, self.x + self.width - 1, "│", curses.color_pair(1))

        stdscr.addstr(
            self.y + self.height - 1,
            self.x,
            "└" + "─" * (self.width - 2) + "┘",
            curses.color_pair(1),
        )


class DatabaseCommander:
    def __init__(self, stdscr):
        self.stdscr = stdscr
        self.db_manager = DatabaseManager()

        curses.start_color()
        curses.init_pair(1, curses.COLOR_WHITE, curses.COLOR_BLUE)  # Normal
        curses.init_pair(2, curses.COLOR_BLACK, curses.COLOR_CYAN)  # Selected
        curses.init_pair(3, curses.COLOR_YELLOW, curses.COLOR_BLUE)  # Active panel
        curses.init_pair(4, curses.COLOR_GREEN, curses.COLOR_BLUE)  # Success
        curses.init_pair(5, curses.COLOR_RED, curses.COLOR_BLUE)  # Error

        curses.curs_set(0)
        stdscr.keypad(True)

        self.height, self.width = stdscr.getmaxyx()

        panel_width = (self.width - 3) // 2
        panel_height = self.height - 4

        self.left_panel = Panel(1, 2, panel_width, panel_height, "DATABASE STATISTICS")
        self.right_panel = Panel(
            panel_width + 2, 2, panel_width, panel_height, "OPERATIONS"
        )

        self.active_panel = self.right_panel
        self.right_panel.is_active = True

        self.setup_panels()

    def setup_panels(self):
        operations = [
            "Load Data (ETL)",
            "Browse Tables",
            "Verify Segments",
            "Purge All Data",
            "Database Status",
            "Exit",
        ]
        self.right_panel.set_items(operations)

        self.refresh_statistics()

    def refresh_statistics(self):
        stats = []

        try:
            key_tables = [
                "infrastructure",
                "roads",
                "lane_segments",
            ]
            total_records = 0

            for table in key_tables:
                try:
                    with self.db_manager.get_cursor() as conn:
                        with conn.cursor() as cursor:
                            cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
                            result = cursor.fetchone()
                            count = result["count"] if result else 0
                            total_records += count
                            stats.append(f"{table:<20} {count:>8,}")
                except Exception:
                    stats.append(f"{table:<20} {'ERROR':>8}")

            stats.insert(0, "=== KEY TABLES ===")
            stats.append("")
            stats.append(f"{'TOTAL RECORDS':<20} {total_records:>8,}")
            stats.append("")

            try:
                with self.db_manager.get_cursor() as conn:
                    with conn.cursor() as cursor:
                        cursor.execute("SELECT COUNT(*) as count FROM lane_conditions")
                        lane_cond = cursor.fetchone()["count"]

                stats.append("=== GPS SYSTEM ===")
                stats.append(f"{'lane_conditions':<20} {lane_cond:>8,}")
                stats.append("")

            except Exception:
                pass

            try:
                with self.db_manager.get_cursor() as conn:
                    with conn.cursor() as cursor:
                        cursor.execute("SELECT COUNT(*) as count FROM lane_connectors")
                        connectors = cursor.fetchone()["count"]

                stats.append("=== CONNECTIONS ===")
                stats.append(f"{'lane_connectors':<20} {connectors:>8,}")

            except Exception:
                pass

        except Exception as e:
            stats = ["ERROR getting statistics", str(e)]

        self.left_panel.set_items(stats)

    def fill_screen(self):
        for y in range(self.height):
            try:
                self.stdscr.addstr(y, 0, " " * self.width, curses.color_pair(1))
            except curses.error:
                pass

    def draw_header(self):
        title = " DISPATCH DATABASE "
        try:
            self.stdscr.addstr(
                0,
                (self.width - len(title)) // 2,
                title,
                curses.color_pair(1) | curses.A_BOLD,
            )
        except curses.error:
            pass

    def draw_footer(self):
        footer_y = self.height - 1
        nav_text = "Tab: Switch Panel | Enter: Select | Q: Exit"
        try:
            self.stdscr.addstr(
                footer_y,
                (self.width - len(nav_text)) // 2,
                nav_text,
                curses.color_pair(1),
            )
        except curses.error:
            pass

    def show_dialog(self, title: str, message: str, is_error: bool = False):
        lines = message.split("\n")
        dialog_width = max(len(title) + 4, max(len(line) for line in lines), 40)
        dialog_height = len(lines) + 4

        x = max(0, (self.width - dialog_width) // 2)
        y = max(0, (self.height - dialog_height) // 2)

        color = curses.color_pair(5) if is_error else curses.color_pair(4)

        try:
            for i in range(dialog_height):
                self.stdscr.addstr(y + i, x, " " * dialog_width, color)

            self.stdscr.addstr(y, x, "┌" + "─" * (dialog_width - 2) + "┐", color)
            self.stdscr.addstr(y + 1, x, f"│{title.center(dialog_width - 2)}│", color)
            self.stdscr.addstr(y + 2, x, "├" + "─" * (dialog_width - 2) + "┤", color)

            for i, line in enumerate(lines):
                self.stdscr.addstr(y + 3 + i, x, f"│{line:<{dialog_width - 2}}│", color)

            self.stdscr.addstr(
                y + dialog_height - 1, x, "└" + "─" * (dialog_width - 2) + "┘", color
            )

            self.stdscr.refresh()
            self.stdscr.getch()
        except curses.error:
            pass

    def show_loading(self, message: str):
        try:
            dialog_width = len(message) + 10
            x = max(0, (self.width - dialog_width) // 2)
            y = self.height // 2

            spinner = "|/-\\"

            for i in range(20):
                self.stdscr.addstr(
                    y, x, f"{message} {spinner[i % len(spinner)]}", curses.color_pair(3)
                )
                self.stdscr.refresh()
                time.sleep(0.1)
        except curses.error:
            pass

    def get_all_tables(self):
        tables = [
            "unit_types",
            "shop_types",
            "gps_types",
            "pits",
            "regions",
            "infrastructure",
            "roads",
            "lane_segments",
            "vehicle_classes",
            "lane_connectors",
            "lane_conditions",
        ]

        table_list = []
        for table in tables:
            try:
                with self.db_manager.get_cursor() as conn:
                    with conn.cursor() as cursor:
                        cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
                        result = cursor.fetchone()
                        count = result["count"] if result else 0
                        table_list.append(f"{table:<25} {count:>10,}")
            except Exception:
                table_list.append(f"{table:<25} {'ERROR':>10}")

        return table_list

    def view_table(self, table_info: str):
        table_name = table_info.split()[0]

        try:
            with self.db_manager.get_cursor() as conn:
                with conn.cursor() as cursor:
                    if table_name == "infrastructure":
                        cursor.execute(
                            """
                            SELECT location_id, location_name, pit_id, region_id, unit_id, 
                                   sign_id, signpost, shoptype, gpstype, radius_m, elevation_m,
                                   ST_AsText(center_point) as center_point,
                                   ST_AsText(geometry) as geometry
                            FROM infrastructure
                        """
                        )
                    elif table_name == "lane_segments":
                        cursor.execute(
                            """
                            SELECT lane_id, road_id, lane_name, lane_width_m, 
                                   weight_limit_tonnes, length_m,
                                   time_empty_seconds, time_loaded_seconds, is_closed,
                                   ST_AsText(geometry) as geometry,
                                   ST_AsText(ST_StartPoint(geometry)) as start_point,
                                   ST_AsText(ST_EndPoint(geometry)) as end_point,
                                   created_at, last_modified
                            FROM lane_segments
                        """
                        )

                    elif table_name == "safety_zones":
                        cursor.execute(
                            """
                            SELECT zone_id, zone_name, zone_type, is_active,
                                   effective_start, effective_end,
                                   ST_AsText(geometry) as geometry,
                                   created_at, last_modified
                            FROM safety_zones
                        """
                        )
                    elif table_name == "roads":
                        cursor.execute(
                            """
                            SELECT r.road_id, r.road_name, r.start_location_id, r.end_location_id,
                                   COALESCE(SUM(ls.time_empty_seconds), 0) as total_time_empty,
                                   COALESCE(SUM(ls.time_loaded_seconds), 0) as total_time_loaded,
                                   COALESCE(SUM(ST_Length(ls.geometry) * 111000), 0) as total_distance_m,
                                   COUNT(ls.lane_id) as lane_count,
                                   r.created_at, r.last_modified
                            FROM roads r
                            LEFT JOIN lane_segments ls ON r.road_id = ls.road_id
                            GROUP BY r.road_id, r.road_name, r.start_location_id, r.end_location_id, r.created_at, r.last_modified
                            ORDER BY r.road_id
                        """
                        )
                    elif table_name == "lane_connectors":
                        cursor.execute(
                            """
                            SELECT lc.connector_id, lc.from_lane_id, lc.to_lane_id, 
                                   STRING_AGG(lcm.movement_type, ', ') as movement_types, 
                                   lc.is_active,
                                   ls_from.road_id as from_road_id,
                                   ls_to.road_id as to_road_id,
                                   lc.effective_start, lc.effective_end
                            FROM lane_connectors lc 
                            LEFT JOIN lane_connector_movements lcm ON lc.connector_id = lcm.connector_id 
                            LEFT JOIN lane_segments ls_from ON lc.from_lane_id = ls_from.lane_id
                            LEFT JOIN lane_segments ls_to ON lc.to_lane_id = ls_to.lane_id
                            GROUP BY lc.connector_id, lc.from_lane_id, lc.to_lane_id, lc.is_active,
                                     ls_from.road_id, ls_to.road_id, lc.effective_start, lc.effective_end
                            ORDER BY lc.connector_id
                        """
                        )
                    else:
                        cursor.execute(f"SELECT * FROM {table_name}")
                    rows = cursor.fetchall()

            if not rows:
                self.show_dialog("TABLE INFO", f"Table '{table_name}' is empty")
                return

            self.show_table_data(table_name, rows)

        except Exception as e:
            self.show_dialog("ERROR", f"Error viewing table:\n{str(e)}", is_error=True)

    def show_table_data(self, table_name: str, rows: List[Dict]):
        if not rows:
            return

        all_columns = list(rows[0].keys()) if hasattr(rows[0], "keys") else []
        columns = [
            col for col in all_columns if col not in ["created_at", "last_modified"]
        ]
        row_cursor = 0
        row_scroll = 0
        col_scroll = 0

        while True:
            self.fill_screen()

            title = f" TABLE: {table_name.upper()} "
            try:
                self.stdscr.addstr(
                    0,
                    (self.width - len(title)) // 2,
                    title,
                    curses.color_pair(1) | curses.A_BOLD,
                )
            except curses.error:
                pass

            max_cols = min(len(columns), 8)
            col_width = max(12, (self.width - 6) // max(max_cols, 1))
            header_line = ""
            visible_columns = columns[col_scroll : col_scroll + max_cols]
            for col in visible_columns:
                header_line += f"{col[:col_width-1]:<{col_width}}"

            try:
                self.stdscr.addstr(2, 3, header_line, curses.color_pair(3))
                self.stdscr.addstr(3, 3, "─" * len(header_line), curses.color_pair(3))
            except curses.error:
                pass

            visible_height = self.height - 7
            visible_rows = rows[row_scroll : row_scroll + visible_height]

            for i, row in enumerate(visible_rows):
                y = 4 + i
                row_data = ""

                if hasattr(row, "keys"):
                    values = []
                    for col in visible_columns:
                        val = str(row[col])
                        if col in ["geometry", "center_point"] and len(val) > 100:
                            val = val[:97] + "..."
                        values.append(val[: col_width - 1])
                else:
                    values = [
                        str(val)[: col_width - 1]
                        for val in row[col_scroll : col_scroll + max_cols]
                    ]

                for val in values:
                    row_data += f"{val:<{col_width}}"

                try:
                    if row_scroll + i == row_cursor:
                        self.stdscr.addstr(y, 3, row_data, curses.color_pair(2))
                    else:
                        self.stdscr.addstr(y, 3, row_data, curses.color_pair(1))
                except curses.error:
                    pass

            try:
                status = f"Row {row_cursor + 1}/{len(rows)}"
                if col_scroll > 0:
                    status += f" | Col {col_scroll + 1}/{len(columns)}"
                self.stdscr.addstr(self.height - 1, 2, status, curses.color_pair(1))

                nav = "UP/DOWN: Navigate | LEFT/RIGHT: Columns | ESC: Back"
                self.stdscr.addstr(
                    self.height - 1,
                    self.width - len(nav) - 2,
                    nav,
                    curses.color_pair(1),
                )
            except curses.error:
                pass

            self.stdscr.refresh()

            key = self.stdscr.getch()

            if key == curses.KEY_UP and row_cursor > 0:
                row_cursor -= 1
                if row_cursor < row_scroll:
                    row_scroll = row_cursor
            elif key == curses.KEY_DOWN and row_cursor < len(rows) - 1:
                row_cursor += 1
                if row_cursor >= row_scroll + visible_height:
                    row_scroll = row_cursor - visible_height + 1
            elif key == curses.KEY_LEFT and col_scroll > 0:
                col_scroll -= 1
            elif key == curses.KEY_RIGHT and col_scroll < len(columns) - max_cols:
                col_scroll += 1
            elif key == 27 or key in [curses.KEY_BACKSPACE, 8, 127]:
                break

    def run_etl(self):
        try:
            old_stdout = sys.stdout
            old_stderr = sys.stderr

            try:
                import logging
                import os
                os.environ["LOG_TO_CONSOLE"] = "true"
                os.environ["LOG_LEVEL"] = "DEBUG"
                logging.getLogger().setLevel(logging.DEBUG)
                
                sys.stdout = io.StringIO()
                sys.stderr = io.StringIO()

                self.show_loading("Running ETL Process")
                
                # Use the new ETL system
                from src.app.run_etl import run_full_etl
                
                # Run the complete ETL process
                success = run_full_etl()

            finally:
                sys.stdout = old_stdout
                sys.stderr = old_stderr

            if success:
                # Show ETL success and map viewer info
                self.show_dialog(
                    "ETL SUCCESS", 
                    "✅ ETL Process Completed Successfully!\n\n"
                    "🗺️  Map Viewer is now available at:\n"
                    "http://localhost:5000\n\n"
                    "📊 Database populated with:\n"
                    "• Unit Types\n"
                    "• Pits & Regions\n" 
                    "• Infrastructure Locations\n"
                    "• Lane Segments (Bézier curves)\n\n"
                    "Press any key to continue..."
                )
                
                # Start map viewer in background
                self.start_map_viewer()
            else:
                self.show_dialog("ETL ERROR", "ETL process failed. Check logs for details.", is_error=True)

            self.refresh_statistics()

        except Exception as e:
            try:
                sys.stdout = old_stdout
                sys.stderr = old_stderr
            except:
                pass
            self.show_dialog("ETL ERROR", f"ETL failed:\n{str(e)}", is_error=True)

    def start_map_viewer(self):
        """Start the map viewer in background"""
        try:
            import subprocess
            import threading
            
            def run_map_viewer():
                try:
                    # Start the map viewer
                    from src.app.map_viewer import app
                    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
                except Exception as e:
                    print(f"Map viewer error: {e}")
            
            # Start map viewer in background thread
            map_thread = threading.Thread(target=run_map_viewer, daemon=True)
            map_thread.start()
            
        except Exception as e:
            self.show_dialog("MAP VIEWER ERROR", f"Failed to start map viewer:\n{str(e)}", is_error=True)

    def verify_segments(self):
        """Verify lane segments table is properly populated"""
        try:
            self.show_loading("Verifying lane segments")
            
            with self.db_manager.get_cursor() as conn:
                with conn.cursor() as cursor:
                    # Check total count
                    cursor.execute("SELECT COUNT(*) as count FROM lane_segments")
                    total_count = cursor.fetchone()['count']
                    
                    # Check by direction
                    cursor.execute("""
                        SELECT direction, COUNT(*) as count 
                        FROM lane_segments 
                        GROUP BY direction
                    """)
                    direction_counts = cursor.fetchall()
                    
                    # Check segment lengths
                    cursor.execute("""
                        SELECT 
                            MIN(length_m) as min_length,
                            MAX(length_m) as max_length,
                            AVG(length_m) as avg_length
                        FROM lane_segments
                    """)
                    length_stats = cursor.fetchone()
                    
                    # Verify segments are in 50-100m range
                    cursor.execute("""
                        SELECT COUNT(*) as count 
                        FROM lane_segments 
                        WHERE length_m BETWEEN 50 AND 100
                    """)
                    proper_length_count = cursor.fetchone()['count']
                    proper_length_pct = (proper_length_count / total_count * 100) if total_count > 0 else 0
                    
                    # Build verification report
                    report = f"🔍 Lane Segments Verification:\n\n"
                    report += f"📊 Total Segments: {total_count:,}\n\n"
                    
                    report += "📈 By Direction:\n"
                    for row in direction_counts:
                        direction = row['direction']
                        count = row['count']
                        report += f"  • {direction.title()}: {count:,}\n"
                    
                    report += f"\n📏 Segment Lengths:\n"
                    report += f"  • Min: {length_stats['min_length']:.1f}m\n"
                    report += f"  • Max: {length_stats['max_length']:.1f}m\n"
                    report += f"  • Avg: {length_stats['avg_length']:.1f}m\n\n"
                    
                    report += f"✅ Segments in 50-100m range: {proper_length_count:,} ({proper_length_pct:.1f}%)\n\n"
                    
                    if proper_length_pct >= 80:
                        report += "🎉 Lane segments table is properly populated!"
                        is_error = False
                    else:
                        report += "⚠️ Some segments are outside the 50-100m range"
                        is_error = True
                    
                    self.show_dialog("SEGMENT VERIFICATION", report, is_error=is_error)
                    
        except Exception as e:
            self.show_dialog("VERIFICATION ERROR", f"Error verifying segments:\n{str(e)}", is_error=True)

    def purge_data(self):
        try:
            self.show_loading("Purging all data")

            # Use the new database manager to purge data
            from src.models import DatabaseManager
            db_manager = DatabaseManager()
            
            with db_manager.get_cursor() as conn:
                with conn.cursor() as cursor:
                    # Purge all tables in correct order
                    tables_to_purge = [
                        'lane_segments',
                        'roads', 
                        'infrastructure',
                        'locations',
                        'pits',
                        'regions',
                        'unit_types'
                    ]
                    
                    for table in tables_to_purge:
                        cursor.execute(f"DELETE FROM {table}")
                    
                    conn.commit()

            self.show_dialog(
                "PURGE SUCCESS", "All data purged successfully\nDatabase is now empty"
            )

            self.refresh_statistics()

        except Exception as e:
            self.show_dialog(
                "PURGE ERROR", f"Error purging data:\n{str(e)}", is_error=True
            )

    def show_tables(self):
        table_cursor = 0
        table_scroll = 0

        while True:
            tables = self.get_all_tables()

            self.fill_screen()

            title = " DATABASE TABLES "
            try:
                self.stdscr.addstr(
                    0,
                    (self.width - len(title)) // 2,
                    title,
                    curses.color_pair(1) | curses.A_BOLD,
                )
            except curses.error:
                pass

            start_y = 3
            visible_height = self.height - 6
            visible_tables = tables[table_scroll : table_scroll + visible_height]

            for i, table in enumerate(visible_tables):
                y = start_y + i
                actual_index = table_scroll + i

                try:
                    if actual_index == table_cursor:
                        self.stdscr.addstr(y, 4, f"> {table}", curses.color_pair(2))
                    else:
                        self.stdscr.addstr(y, 6, table, curses.color_pair(1))
                except curses.error:
                    pass

            try:
                nav = "UP/DOWN: Navigate | Enter: View | ESC: Back"
                self.stdscr.addstr(
                    self.height - 1,
                    (self.width - len(nav)) // 2,
                    nav,
                    curses.color_pair(1),
                )
            except curses.error:
                pass

            self.stdscr.refresh()

            key = self.stdscr.getch()

            if key == curses.KEY_UP and table_cursor > 0:
                table_cursor -= 1
                if table_cursor < table_scroll:
                    table_scroll = table_cursor
            elif key == curses.KEY_DOWN and table_cursor < len(tables) - 1:
                table_cursor += 1
                if table_cursor >= table_scroll + visible_height:
                    table_scroll = table_cursor - visible_height + 1
            elif key in [ord("\n"), ord("\r")]:
                if tables:
                    self.view_table(tables[table_cursor])
            elif key == 27 or key in [curses.KEY_BACKSPACE, 8, 127]:
                break

    def show_db_status(self):
        try:
            with self.db_manager.get_cursor() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT version() as version")
                    version_result = cursor.fetchone()
                    version = (
                        version_result["version"][:50] + "..."
                        if version_result
                        else "Unknown"
                    )

            total_records = 0
            table_count = 0

            key_tables = [
                "infrastructure",
                "roads",
                "lane_segments",
            ]
            for table in key_tables:
                try:
                    with self.db_manager.get_cursor() as conn:
                        with conn.cursor() as cursor:
                            cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
                            result = cursor.fetchone()
                            count = result["count"] if result else 0
                            total_records += count
                            if count > 0:
                                table_count += 1
                except:
                    pass

            status = "Database: ONLINE\n"
            status += f"PostgreSQL: {version}\n"
            status += f"Active Tables: {table_count}\n"
            status += f"Total Records: {total_records:,}"

            self.show_dialog("DATABASE STATUS", status)

        except Exception as e:
            self.show_dialog("ERROR", f"Error getting status:\n{str(e)}", is_error=True)

    def run(self):
        while True:
            self.fill_screen()

            self.draw_header()
            self.left_panel.draw(self.stdscr)
            self.right_panel.draw(self.stdscr)
            self.draw_footer()

            self.stdscr.refresh()

            key = self.stdscr.getch()

            if key == curses.KEY_UP:
                self.active_panel.move_up()
            elif key == curses.KEY_DOWN:
                self.active_panel.move_down()
            elif key == ord("\t"):
                self.active_panel.is_active = False
                if self.active_panel == self.left_panel:
                    self.active_panel = self.right_panel
                else:
                    self.active_panel = self.left_panel
                self.active_panel.is_active = True
            elif key in [ord("\n"), ord("\r")]:
                selected = self.active_panel.get_selected_item()
                if selected and self.active_panel == self.right_panel:
                    if "Load Data" in selected:
                        self.run_etl()
                    elif "Browse Tables" in selected:
                        self.show_tables()
                    elif "Verify Segments" in selected:
                        self.verify_segments()
                    elif "Purge All Data" in selected:
                        self.purge_data()
                    elif "Database Status" in selected:
                        self.show_db_status()
                    elif "Exit" in selected:
                        break
            elif key in [ord("q"), ord("Q")]:
                break


def main(stdscr):
    commander = DatabaseCommander(stdscr)
    commander.run()


if __name__ == "__main__":
    curses.wrapper(main)
