#!/usr/bin/env python3
"""
Verify that lane segments table is properly populated
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.models import DatabaseManager

def verify_lane_segments():
    """Verify lane segments table has proper data"""
    try:
        db_manager = DatabaseManager()
        
        with db_manager.get_cursor() as conn:
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
                
                # Check by road status
                cursor.execute("""
                    SELECT is_closed, COUNT(*) as count 
                    FROM lane_segments 
                    GROUP BY is_closed
                """)
                status_counts = cursor.fetchall()
                
                # Check segment lengths
                cursor.execute("""
                    SELECT 
                        MIN(length_m) as min_length,
                        MAX(length_m) as max_length,
                        AVG(length_m) as avg_length
                    FROM lane_segments
                """)
                length_stats = cursor.fetchone()
                
                print("🔍 Lane Segments Verification Results:")
                print(f"📊 Total Segments: {total_count:,}")
                print("\n📈 By Direction:")
                for row in direction_counts:
                    direction = row['direction']
                    count = row['count']
                    print(f"  • {direction.title()}: {count:,}")
                
                print("\n🚦 By Status:")
                for row in status_counts:
                    status = "Closed" if row['is_closed'] else "Open"
                    count = row['count']
                    print(f"  • {status}: {count:,}")
                
                print(f"\n📏 Segment Lengths:")
                print(f"  • Min: {length_stats['min_length']:.1f}m")
                print(f"  • Max: {length_stats['max_length']:.1f}m")
                print(f"  • Avg: {length_stats['avg_length']:.1f}m")
                
                # Verify segments are in 50-100m range
                cursor.execute("""
                    SELECT COUNT(*) as count 
                    FROM lane_segments 
                    WHERE length_m BETWEEN 50 AND 100
                """)
                proper_length_count = cursor.fetchone()['count']
                proper_length_pct = (proper_length_count / total_count * 100) if total_count > 0 else 0
                
                print(f"\n✅ Segments in 50-100m range: {proper_length_count:,} ({proper_length_pct:.1f}%)")
                
                if proper_length_pct >= 80:
                    print("🎉 Lane segments table is properly populated!")
                    return True
                else:
                    print("⚠️ Some segments are outside the 50-100m range")
                    return False
                    
    except Exception as e:
        print(f"❌ Error verifying lane segments: {e}")
        return False

if __name__ == "__main__":
    verify_lane_segments()
