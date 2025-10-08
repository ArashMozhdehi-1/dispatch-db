import os
import time
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

@dataclass
class DatabaseConfig:
    host: str = os.getenv("DB_HOST", "dispatch_db")
    port: int = int(os.getenv("DB_PORT", "5432"))
    database: str = os.getenv("DB_NAME", "dispatch_db")
    user: str = os.getenv("DB_USER", "dispatch_user")
    password: str = os.getenv("DB_PASSWORD", "dispatch_password")
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: int = 30
    pool_recycle: int = 3600

@dataclass
class SpatialConfig:
    min_segment_length: float = 10.0
    target_segment_length: float = 25.0
    max_segment_length: float = 50.0
    min_points_per_segment: int = 2
    max_points_per_segment: int = 100
    adaptive_sampling: bool = True

@dataclass
class ProcessingConfig:
    batch_size: int = 1000
    max_workers: int = 4
    chunk_size: int = 100
    enable_parallel_processing: bool = True
    cache_size: int = 10000

class Config:
    def __init__(self, environment: str = "development"):
        self.environment = environment
        self.base_dir = Path(__file__).parent.parent
        self.data_dir = self.base_dir / "Dataset"
        self.logs_dir = self.base_dir / "logs"
        try:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
        except (FileExistsError, OSError):
            pass
        self._load_config()
    
    def _load_config(self):
        self.database = DatabaseConfig(
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", "5432")),
            database=os.getenv("DB_NAME", "dispatch_db"),
            user=os.getenv("DB_USER", "dispatch_user"),
            password=os.getenv("DB_PASSWORD", "dispatch_password"),
            pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
            pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "30")),
            pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "3600"))
        )
        
        self.spatial = SpatialConfig(
            min_segment_length=float(os.getenv("MIN_SEGMENT_LENGTH", "10.0")),
            target_segment_length=float(os.getenv("TARGET_SEGMENT_LENGTH", "25.0")),
            max_segment_length=float(os.getenv("MAX_SEGMENT_LENGTH", "50.0")),
            min_points_per_segment=int(os.getenv("MIN_POINTS_PER_SEGMENT", "2")),
            max_points_per_segment=int(os.getenv("MAX_POINTS_PER_SEGMENT", "100")),
            adaptive_sampling=os.getenv("ADAPTIVE_SAMPLING", "true").lower() == "true"
        )
        
        self.processing = ProcessingConfig(
            batch_size=int(os.getenv("BATCH_SIZE", "1000")),
            max_workers=int(os.getenv("MAX_WORKERS", "4")),
            chunk_size=int(os.getenv("CHUNK_SIZE", "100")),
            enable_parallel_processing=os.getenv("ENABLE_PARALLEL", "true").lower() == "true",
            cache_size=int(os.getenv("CACHE_SIZE", "10000"))
        )
        
        self.logging = {
            "level": os.getenv("LOG_LEVEL", "INFO"),
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            "file": self.logs_dir / f"dispatch_db_{int(time.time())}.log",
            "max_bytes": int(os.getenv("LOG_MAX_BYTES", "10485760")),
            "backup_count": int(os.getenv("LOG_BACKUP_COUNT", "5"))
        }
    
    def get_database_url(self) -> str:
        return (f"postgresql://{self.database.user}:{self.database.password}"
                f"@{self.database.host}:{self.database.port}/{self.database.database}")
    
    def validate(self) -> bool:
        try:
            if not self.data_dir.exists():
                raise FileNotFoundError(f"Data directory not found: {self.data_dir}")
            return True
        except Exception as e:
            return False

config = Config(os.getenv("ENVIRONMENT", "development"))
