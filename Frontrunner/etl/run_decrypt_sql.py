#!/usr/bin/env python3
"""
Run the decrypt SQL script directly
"""

import mysql.connector
import os

MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', 'rootpassword'),
    'database': os.getenv('MYSQL_DATABASE', 'kmtsdb'),
    'charset': 'utf8mb4'
}

def run_sql_file():
    """Run the SQL file"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor()
    
    try:
        # Read and execute the SQL file
        with open('/app/etl/decrypt_coordinates_sql.sql', 'r') as f:
            sql_content = f.read()
        
        # Split by semicolon and execute each statement
        statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip() and not stmt.strip().startswith('/*')]
        
        for stmt in statements:
            if stmt:
                try:
                    mysql_cursor.execute(stmt)
                    mysql_conn.commit()
                    print(f"✅ Executed: {stmt[:50]}...")
                except mysql.connector.Error as e:
                    print(f"⚠️  Error: {e}")
                    print(f"   Statement: {stmt[:100]}...")
                    continue
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        mysql_cursor.close()
        mysql_conn.close()

if __name__ == "__main__":
    run_sql_file()


