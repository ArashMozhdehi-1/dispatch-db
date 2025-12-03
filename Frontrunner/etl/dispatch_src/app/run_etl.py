#!/usr/bin/env python3
"""
ETL runner script for Docker service
"""
import sys

sys.path.append('/app')

def main():
    """Run the complete ETL process"""
    try:
        print("🚀 Starting Komatsu Dispatch ETL Service...")
        
        # Import and run the main ETL function
        from src.app.etl import main as etl_main
        
        # Run the ETL process
        etl_main()
        
        print("🎉 ETL Service completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ ETL Service failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)