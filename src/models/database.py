import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor, execute_values
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple, Generator
import time
from dataclasses import dataclass
import threading
from queue import Queue, Empty
import json

from config import config
from src.core import get_logger, get_performance_logger, get_audit_logger

logger = get_logger(__name__)
perf_logger = get_performance_logger(__name__)
audit_logger = get_audit_logger(__name__)

@dataclass
class QueryResult:
    """Structured query result"""
    data: List[Dict[str, Any]]
    row_count: int
    execution_time: float
    query: str
    success: bool
    error: Optional[str] = None

class ConnectionPool:
    """Advanced connection pool with monitoring and health checks"""
    
    def __init__(self, db_config):
        self.config = db_config
        self.pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None
        self._lock = threading.Lock()
        self._stats = {
            'total_connections': 0,
            'active_connections': 0,
            'failed_connections': 0,
            'queries_executed': 0,
            'total_query_time': 0.0
        }
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize connection pool"""
        try:
            self.pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=self.config.pool_size,
                host=self.config.host,
                port=self.config.port,
                database=self.config.database,
                user=self.config.user,
                password=self.config.password,
                cursor_factory=RealDictCursor
            )
            
        except Exception as e:
            
            raise
    
    @contextmanager
    def get_connection(self):
        """Get connection from pool with automatic cleanup"""
        connection = None
        try:
            connection = self.pool.getconn()
            if connection:
                # Test connection
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                yield connection
            else:
                raise Exception("Failed to get connection from pool")
        except Exception as e:
            
            raise
        finally:
            if connection:
                self.pool.putconn(connection)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection pool statistics"""
        with self._lock:
            return self._stats.copy()
    
    def close(self):
        """Close connection pool"""
        if self.pool:
            self.pool.closeall()
            

class DatabaseManager:
    """Advanced database manager with enterprise features"""
    
    def __init__(self):
        self.pool = ConnectionPool(config.database)
        self._transaction_depth = 0
        self._transaction_connections = {}
    
    @contextmanager
    def transaction(self, isolation_level: str = "READ_COMMITTED"):
        """Transaction context manager with automatic rollback on error"""
        thread_id = threading.get_ident()
        
        try:
            with self.pool.get_connection() as conn:
                conn.set_isolation_level(getattr(psycopg2.extensions, f"ISOLATION_LEVEL_{isolation_level}"))
                
                conn.autocommit = False
                self._transaction_depth += 1
                self._transaction_connections[thread_id] = conn
                

                
                try:
                    yield conn
                    conn.commit()

                except Exception as e:
                    conn.rollback()

                    raise
                finally:
                    self._transaction_depth -= 1
                    if thread_id in self._transaction_connections:
                        del self._transaction_connections[thread_id]
        except Exception as e:
            
            raise
    
    def fetch_one(self, query: str, params: Optional[Tuple] = None) -> Optional[Tuple]:
        """Execute a query and return a single row"""
        with self.pool.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.fetchone()
    
    def fetch_all(self, query: str, params: Optional[Tuple] = None) -> List[Tuple]:
        """Execute a query and return all rows"""
        with self.pool.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.fetchall()
    
    def get_cursor(self):
        """Get a database connection"""
        return self.pool.get_connection()
    
    def commit(self):
        """Commit current transaction"""
        thread_id = threading.get_ident()
        if thread_id in self._transaction_connections:
            conn = self._transaction_connections[thread_id]
            conn.commit()
            
    
    def rollback(self):
        """Rollback current transaction"""
        thread_id = threading.get_ident()
        if thread_id in self._transaction_connections:
            conn = self._transaction_connections[thread_id]
            conn.rollback()
            
    
    def execute_query(self, query: str, params: Optional[Tuple] = None, 
                     fetch: bool = True, commit: bool = True) -> QueryResult:
        """Execute query with performance monitoring"""
        start_time = time.time()
        
        try:
            with self.pool.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(query, params)
                    
                    if fetch:
                        data = cursor.fetchall()
                        row_count = len(data)
                    else:
                        data = []
                        row_count = cursor.rowcount
                    
                    if commit and not conn.autocommit:
                        conn.commit()
                    
                    execution_time = time.time() - start_time
                    

                    
                    return QueryResult(
                        data=data,
                        row_count=row_count,
                        execution_time=execution_time,
                        query=query,
                        success=True
                    )
        
        except Exception as e:
            execution_time = time.time() - start_time
            
            
            return QueryResult(
                data=[],
                row_count=0,
                execution_time=execution_time,
                query=query,
                success=False,
                error=str(e)
            )
    
    def execute_batch(self, query: str, data: List[Tuple], batch_size: int = 1000, template: Optional[str] = None) -> QueryResult:
        """Execute batch insert/update with progress monitoring"""
        start_time = time.time()
        total_rows = len(data)
        
        try:
            with self.pool.get_connection() as conn:
                with conn.cursor() as cursor:
                    for i in range(0, total_rows, batch_size):
                        batch = data[i:i + batch_size]
                        execute_values(
                            cursor, query, batch, template=template, page_size=batch_size
                        )
                        
                        progress = (i + len(batch)) / total_rows * 100
                        
                    
                    conn.commit()
                    execution_time = time.time() - start_time
                    

                    
                    return QueryResult(
                        data=[],
                        row_count=total_rows,
                        execution_time=execution_time,
                        query=query,
                        success=True
                    )
        
        except Exception as e:
            execution_time = time.time() - start_time
            
            
            return QueryResult(
                data=[],
                row_count=0,
                execution_time=execution_time,
                query=query,
                success=False,
                error=str(e)
            )
    
    def get_table_info(self, table_name: str) -> Dict[str, Any]:
        query = """
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = %s
        ORDER BY ordinal_position
        """
        
        result = self.execute_query(query, (table_name,))
        
        if result.success:
            return {
                'table_name': table_name,
                'columns': result.data,
                'column_count': result.row_count
            }
        else:
            raise Exception(f"Failed to get table info: {result.error}")
    
    def get_table_stats(self, table_name: str) -> Dict[str, Any]:
        query = f"""
        SELECT 
            schemaname,
            tablename,
            attname,
            n_distinct,
            correlation,
            most_common_vals,
            most_common_freqs
        FROM pg_stats 
        WHERE tablename = %s
        """
        
        result = self.execute_query(query, (table_name,))
        
        if result.success:
            return {
                'table_name': table_name,
                'statistics': result.data,
                'stat_count': result.row_count
            }
        else:
            raise Exception(f"Failed to get table stats: {result.error}")
    
    def optimize_table(self, table_name: str) -> bool:
        try:
            with self.pool.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(f"VACUUM ANALYZE {table_name}")
                    conn.commit()
                    
                    
                    return True
        except Exception as e:
            
            return False
    
    def _extract_table_name(self, query: str) -> str:
        query_upper = query.upper().strip()
        if query_upper.startswith('INSERT INTO'):
            return query_upper.split()[2]
        elif query_upper.startswith('UPDATE'):
            return query_upper.split()[1]
        elif query_upper.startswith('DELETE FROM'):
            return query_upper.split()[2]
        elif query_upper.startswith('SELECT'):
            return "unknown"
        return "unknown"
    
    def get_connection_stats(self) -> Dict[str, Any]:
        return self.pool.get_stats()
    
    def health_check(self) -> Dict[str, Any]:
        try:
            result = self.execute_query("SELECT 1 as health_check")
            
            return {
                'status': 'healthy' if result.success else 'unhealthy',
                'response_time': result.execution_time,
                'timestamp': time.time(),
                'connection_stats': self.get_connection_stats()
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': time.time()
            }
    
    def close(self):
        self.pool.close()
        
