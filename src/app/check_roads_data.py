import os
import psycopg2

def get_db_connection():
    return psycopg2.connect(
        host=os.environ.get('DB_HOST', 'postgres'),
        port=os.environ.get('DB_PORT', '5432'),
        database=os.environ.get('DB_NAME', 'dispatch_db'),
        user=os.environ.get('DB_USER', 'dispatch_user'),
        password=os.environ.get('DB_PASSWORD', 'dispatch_password')
    )

def main():
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM lane_segments")
        lane_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM roads")
        road_count = cur.fetchone()[0]

        print(f"Lane Segments Count: {lane_count}")
        print(f"Roads Count: {road_count}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
