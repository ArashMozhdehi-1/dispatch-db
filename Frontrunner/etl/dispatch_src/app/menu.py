#!/usr/bin/env python3
import curses
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.app.etl import DispatchETL
from src.app.database_query import DatabaseQueryGUI


class DispatchMenu:
    def __init__(self):
        self.stdscr = None
        self.current_option = 0
        self.options = ["View Data Loading Status", "Query Database", "Exit"]

    def init_curses(self):
        self.stdscr = curses.initscr()
        curses.noecho()
        curses.cbreak()
        self.stdscr.keypad(True)
        curses.curs_set(0)

        if curses.has_colors():
            curses.start_color()
            curses.init_pair(1, curses.COLOR_CYAN, curses.COLOR_BLACK)
            curses.init_pair(2, curses.COLOR_YELLOW, curses.COLOR_BLACK)
            curses.init_pair(3, curses.COLOR_GREEN, curses.COLOR_BLACK)
            curses.init_pair(4, curses.COLOR_RED, curses.COLOR_BLACK)

    def cleanup_curses(self):
        if self.stdscr:
            curses.nocbreak()
            self.stdscr.keypad(False)
            curses.echo()
            curses.endwin()

    def draw_menu(self):
        self.stdscr.clear()

        height, width = self.stdscr.getmaxyx()

        title = "Dispatch Database System"
        title_x = (width - len(title)) // 2
        self.stdscr.addstr(2, title_x, title, curses.color_pair(1) | curses.A_BOLD)

        subtitle = "Select an option:"
        subtitle_x = (width - len(subtitle)) // 2
        self.stdscr.addstr(4, subtitle_x, subtitle, curses.color_pair(2))

        start_y = 7
        for i, option in enumerate(self.options):
            x = (width - len(option)) // 2
            if i == self.current_option:
                self.stdscr.addstr(
                    start_y + i,
                    x,
                    f"> {option} <",
                    curses.color_pair(3) | curses.A_BOLD,
                )
            else:
                self.stdscr.addstr(start_y + i, x, option, curses.color_pair(1))

        instructions = [
            "Use UP/DOWN arrows to navigate",
            "Press ENTER to select",
            "Press 'q' to quit",
        ]

        for i, instruction in enumerate(instructions):
            self.stdscr.addstr(height - 4 + i, 2, instruction, curses.color_pair(2))

        self.stdscr.refresh()

    def handle_input(self):
        key = self.stdscr.getch()

        if key == curses.KEY_UP:
            self.current_option = (self.current_option - 1) % len(self.options)
        elif key == curses.KEY_DOWN:
            self.current_option = (self.current_option + 1) % len(self.options)
        elif key == ord("\n") or key == ord("\r"):
            return self.current_option
        elif key == ord("q") or key == ord("Q"):
            return len(self.options) - 1

        return None

    def show_loading_screen(self, message="Loading..."):
        self.stdscr.clear()
        height, width = self.stdscr.getmaxyx()

        msg_x = (width - len(message)) // 2
        msg_y = height // 2

        self.stdscr.addstr(msg_y, msg_x, message, curses.color_pair(3) | curses.A_BOLD)
        self.stdscr.addstr(
            msg_y + 2, msg_x - 10, "Please wait...", curses.color_pair(2)
        )

        self.stdscr.refresh()

    def show_progress(self, message, progress=None):
        self.stdscr.clear()
        height, width = self.stdscr.getmaxyx()

        msg_x = (width - len(message)) // 2
        msg_y = height // 2

        self.stdscr.addstr(msg_y, msg_x, message, curses.color_pair(3) | curses.A_BOLD)

        if progress is not None:
            progress_msg = f"Progress: {progress}%"
            progress_x = (width - len(progress_msg)) // 2
            self.stdscr.addstr(
                msg_y + 2, progress_x, progress_msg, curses.color_pair(2)
            )

        self.stdscr.refresh()

    def show_result(self, success, message, details=None):
        self.stdscr.clear()
        height, width = self.stdscr.getmaxyx()

        status = "SUCCESS" if success else "ERROR"
        color = curses.color_pair(3) if success else curses.color_pair(4)

        status_x = (width - len(status)) // 2
        self.stdscr.addstr(height // 2 - 2, status_x, status, color | curses.A_BOLD)

        msg_x = (width - len(message)) // 2
        self.stdscr.addstr(height // 2, msg_x, message, curses.color_pair(1))

        if details:
            details_lines = details.split("\n")
            for i, line in enumerate(details_lines[:5]):
                line_x = (width - len(line)) // 2
                self.stdscr.addstr(
                    height // 2 + 2 + i, line_x, line, curses.color_pair(2)
                )

        press_key_msg = "Press any key to continue..."
        press_key_x = (width - len(press_key_msg)) // 2
        self.stdscr.addstr(height - 2, press_key_x, press_key_msg, curses.color_pair(2))

        self.stdscr.refresh()
        self.stdscr.getch()

    def show_data_loading_status(self):
        try:
            self.show_loading_screen("Checking data loading status...")
            
            # Import database manager to check data
            from src.models import DatabaseManager
            
            db = DatabaseManager()
            
            # Check infrastructure count
            infra_result = db.fetch_one("SELECT COUNT(*) as count FROM infrastructure")
            infra_count = infra_result['count'] if infra_result else 0
            
            # Check lane segments count
            segments_result = db.fetch_one("SELECT COUNT(*) as count FROM lane_segments")
            segments_count = segments_result['count'] if segments_result else 0
            
            # Check unit types count
            units_result = db.fetch_one("SELECT COUNT(*) as count FROM unit_types")
            units_count = units_result['count'] if units_result else 0
            
            details = [
                f"Infrastructure Locations: {infra_count}",
                f"Lane Segments: {segments_count}",
                f"Unit Types: {units_count}",
                "",
                "Services Running:",
                "• Flask UI: http://localhost:5000",
                "• GraphQL Backend: http://localhost:3000",
                "• Database Admin: http://localhost:8080"
            ]
            
            details_str = "\n".join(details)
            
            success = infra_count > 0 and segments_count > 0
            status_msg = "Data loaded successfully!" if success else "Data loading incomplete"
            
            self.show_result(success, status_msg, details_str)

        except Exception as e:
            self.show_result(False, f"Failed to check data status: {str(e)}")

    def run_query_tool(self):
        try:
            self.show_loading_screen("Starting database query tool...")

            self.cleanup_curses()

            curses.wrapper(self._run_query_wrapper)

            self.init_curses()

        except Exception as e:
            self.show_result(False, f"Query tool failed: {str(e)}")

    def _run_query_wrapper(self, stdscr):
        query_tool = DatabaseQueryGUI(stdscr)
        query_tool.run()

    def run(self):
        try:
            self.init_curses()

            while True:
                self.draw_menu()
                selected = self.handle_input()

                if selected is not None:
                    if selected == 0:
                        self.show_data_loading_status()
                    elif selected == 1:
                        self.run_query_tool()
                    elif selected == 2:
                        break

        except KeyboardInterrupt:
            pass
        finally:
            self.cleanup_curses()


def main():
    menu = DispatchMenu()
    menu.run()


if __name__ == "__main__":
    main()
