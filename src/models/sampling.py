from typing import List, Tuple
from dataclasses import dataclass
import numpy as np

@dataclass
class SamplingConfig:
    min_points: int = 2
    max_points: int = 100
    adaptive: bool = True

class SamplingStrategy:
    def __init__(self, config: SamplingConfig):
        self.config = config
    
    def calculate_points(self, segment_length: float, curvature: float = 0.0) -> int:
        raise NotImplementedError

class AdaptiveSampling(SamplingStrategy):
    def calculate_points(self, segment_length: float, curvature: float = 0.0) -> int:
        base_points = max(2, int(segment_length / 10.0))
        if curvature > 0.001:
            curvature_factor = min(3.0, 1.0 + curvature * 1000)
            base_points = int(base_points * curvature_factor)
        return max(self.config.min_points, min(self.config.max_points, base_points))

class FixedSampling(SamplingStrategy):
    def __init__(self, config: SamplingConfig, fixed_points: int = 10):
        super().__init__(config)
        self.fixed_points = fixed_points
    
    def calculate_points(self, segment_length: float, curvature: float = 0.0) -> int:
        return max(self.config.min_points, min(self.config.max_points, self.fixed_points))

class LengthBasedSampling(SamplingStrategy):
    def calculate_points(self, segment_length: float, curvature: float = 0.0) -> int:
        points = max(2, int(segment_length / 5.0))
        return max(self.config.min_points, min(self.config.max_points, points))

class SamplingManager:
    def __init__(self, config: SamplingConfig):
        self.config = config
        self.strategy = self._create_strategy()
    
    def _create_strategy(self) -> SamplingStrategy:
        if self.config.adaptive:
            return AdaptiveSampling(self.config)
        else:
            return LengthBasedSampling(self.config)
    
    def get_points_for_segment(self, segment_length: float, curvature: float = 0.0) -> int:
        return self.strategy.calculate_points(segment_length, curvature)
    
    def set_strategy(self, strategy: SamplingStrategy):
        self.strategy = strategy
    
    def create_linestring_points(self, start_point: Tuple[float, float], 
                                end_point: Tuple[float, float], 
                                num_points: int) -> List[Tuple[float, float]]:
        if num_points < 2:
            return [start_point, end_point]
        
        start = np.array(start_point)
        end = np.array(end_point)
        t_values = np.linspace(0, 1, num_points)
        points = []
        
        for t in t_values:
            point = start + t * (end - start)
            points.append((float(point[0]), float(point[1])))
        
        return points
