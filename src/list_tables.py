import psycopg2
import os

# Use environment variables or default to the known config
DB_HOST = os.environ.get("DB_HOST", "host.docker.internal")
DB_PORT = os.environ.get("DB_PORT", "5433")
DB_NAME = os.environ.get("DB_NAME", "dispatch_db")
DB_USER = os.environ.get("DB_USER", "dispatch_user")
DB_PASS = os.environ.get("DB_PASS", "dispatch_password")

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)
    
    tables = cursor.fetchall()
    print(f"Tables in {DB_NAME}:")
    for table in tables:
        print(f"- {table[0]}")
        
    cursor.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
