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

        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'lane_segments'
            ORDER BY column_name
        """)
        rows = cur.fetchall()
        print("--- Columns in lane_segments ---")
        for row in rows:
            print(f"{row[0]} ({row[1]})")
        print("--------------------------------")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
