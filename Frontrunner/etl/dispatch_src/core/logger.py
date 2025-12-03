import logging
import logging.handlers
import sys
import time
import functools
from pathlib import Path
from typing import Any, Dict, Optional, Callable
import json
from datetime import datetime
import traceback
import os

class StructuredFormatter(logging.Formatter):
    """Custom formatter for structured logging"""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as structured JSON"""
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "process_id": record.process,
            "thread_id": record.thread
        }
        
        if record.exc_info:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": traceback.format_exception(*record.exc_info)
            }
        
        if hasattr(record, 'extra_fields'):
            log_entry.update(record.extra_fields)
        
        return json.dumps(log_entry, default=str)

class PerformanceLogger:
    """Performance monitoring and logging"""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
        self.metrics: Dict[str, Any] = {}
    
    def log_execution_time(self, operation: str):
        """Decorator to log execution time of functions"""
        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                start_time = time.time()
                try:
                    result = func(*args, **kwargs)
                    execution_time = time.time() - start_time
                    
                    self.logger.info(
                        f"Operation '{operation}' completed successfully",
                        extra={
                            'extra_fields': {
                                'operation': operation,
                                'execution_time_seconds': execution_time,
                                'status': 'success'
                            }
                        }
                    )
                    
                    if operation not in self.metrics:
                        self.metrics[operation] = {
                            'total_calls': 0,
                            'total_time': 0.0,
                            'avg_time': 0.0,
                            'min_time': float('inf'),
                            'max_time': 0.0
                        }
                    
                    metrics = self.metrics[operation]
                    metrics['total_calls'] += 1
                    metrics['total_time'] += execution_time
                    metrics['avg_time'] = metrics['total_time'] / metrics['total_calls']
                    metrics['min_time'] = min(metrics['min_time'], execution_time)
                    metrics['max_time'] = max(metrics['max_time'], execution_time)
                    
                    return result
                    
                except Exception as e:
                    execution_time = time.time() - start_time
                    self.logger.error(
                        f"Operation '{operation}' failed",
                        extra={
                            'extra_fields': {
                                'operation': operation,
                                'execution_time_seconds': execution_time,
                                'status': 'error',
                                'error_type': type(e).__name__,
                                'error_message': str(e)
                            }
                        },
                        exc_info=True
                    )
                    raise
            
            return wrapper
        return decorator
    
    def log_database_operation(self, operation: str, table: str, record_count: int, execution_time: float):
        """Log database operations with metrics"""
        self.logger.info(
            f"Database operation: {operation} on {table}",
            extra={
                'extra_fields': {
                    'operation': operation,
                    'table': table,
                    'record_count': record_count,
                    'execution_time_seconds': execution_time,
                    'records_per_second': record_count / execution_time if execution_time > 0 else 0
                }
            }
        )
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get performance metrics summary"""
        return {
            'timestamp': datetime.now().isoformat(),
            'metrics': self.metrics
        }

class AuditLogger:
    """Audit logging for compliance and security"""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
    
    def log_data_access(self, user: str, operation: str, table: str, record_id: Optional[str] = None):
        """Log data access for audit trail"""
        self.logger.info(
            f"Data access: {user} performed {operation} on {table}",
            extra={
                'extra_fields': {
                    'audit_type': 'data_access',
                    'user': user,
                    'operation': operation,
                    'table': table,
                    'record_id': record_id,
                    'timestamp': datetime.now().isoformat()
                }
            }
        )
    
    def log_system_event(self, event_type: str, description: str, user: Optional[str] = None):
        """Log system events for audit trail"""
        self.logger.info(
            f"System event: {event_type} - {description}",
            extra={
                'extra_fields': {
                    'audit_type': 'system_event',
                    'event_type': event_type,
                    'description': description,
                    'user': user,
                    'timestamp': datetime.now().isoformat()
                }
            }
        )

class LoggerManager:
    """Centralized logger management"""
    
    def __init__(self, config):
        self.config = config
        self.loggers: Dict[str, logging.Logger] = {}
        self._setup_logging()
    
    def _setup_logging(self):
        """Setup logging configuration"""
        logs_dir = Path(self.config.logging['file']).parent
        try:
            logs_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        
        root_logger = logging.getLogger()
        root_logger.setLevel(getattr(logging, self.config.logging['level']))
        
        root_logger.handlers.clear()
        
        if os.getenv("LOG_TO_CONSOLE", "false").lower() == "true":
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(logging.INFO)
            console_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(console_formatter)
            root_logger.addHandler(console_handler)
        
        file_handler = logging.handlers.RotatingFileHandler(
            self.config.logging['file'],
            maxBytes=self.config.logging['max_bytes'],
            backupCount=self.config.logging['backup_count']
        )
        file_handler.setLevel(logging.DEBUG)
        file_formatter = StructuredFormatter()
        file_handler.setFormatter(file_formatter)
        root_logger.addHandler(file_handler)
        
        error_handler = logging.handlers.RotatingFileHandler(
            logs_dir / "errors.log",
            maxBytes=self.config.logging['max_bytes'],
            backupCount=self.config.logging['backup_count']
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(file_formatter)
        root_logger.addHandler(error_handler)
    
    def get_logger(self, name: str) -> logging.Logger:
        """Get or create a logger with performance and audit capabilities"""
        if name not in self.loggers:
            logger = logging.getLogger(name)
            logger.setLevel(getattr(logging, self.config.logging['level']))
            
            logger.performance = PerformanceLogger(logger)
            logger.audit = AuditLogger(logger)
            
            self.loggers[name] = logger
        
        return self.loggers[name]
    
    def get_performance_logger(self, name: str) -> PerformanceLogger:
        """Get performance logger"""
        return self.get_logger(name).performance
    
    def get_audit_logger(self, name: str) -> AuditLogger:
        """Get audit logger"""
        return self.get_logger(name).audit

logger_manager = None

def get_logger(name: str) -> logging.Logger:
    """Get logger instance - DISABLED"""
    # Return a dummy logger that does nothing
    class DummyLogger:
        def info(self, *args, **kwargs): pass
        def error(self, *args, **kwargs): pass
        def warning(self, *args, **kwargs): pass
        def debug(self, *args, **kwargs): pass
        def critical(self, *args, **kwargs): pass
        def performance(self, *args, **kwargs): return self
        def audit(self, *args, **kwargs): return self
        def log_execution_time(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator
        def log_database_operation(self, *args, **kwargs): pass
        def log_data_access(self, *args, **kwargs): pass
        def log_system_event(self, *args, **kwargs): pass
    
    return DummyLogger()

def get_performance_logger(name: str):
    """Get performance logger - DISABLED"""
    class DummyPerformanceLogger:
        def log_execution_time(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator
        def log_database_operation(self, *args, **kwargs): pass
    return DummyPerformanceLogger()

def get_audit_logger(name: str):
    """Get audit logger - DISABLED"""
    class DummyAuditLogger:
        def log_data_access(self, *args, **kwargs): pass
        def log_system_event(self, *args, **kwargs): pass
    return DummyAuditLogger()
