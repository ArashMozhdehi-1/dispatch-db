import pandas as pd
import numpy as np
from typing import Any, Dict, List, Optional, Tuple, Union
from dataclasses import dataclass
from enum import Enum
import re
from datetime import datetime
from pathlib import Path

from config import config
from src.core import get_logger

logger = get_logger(__name__)

class ValidationSeverity(Enum):
    """How bad is the problem?"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

@dataclass
class ValidationResult:
    """What we found when checking the data"""
    is_valid: bool
    severity: ValidationSeverity
    message: str
    field: Optional[str] = None
    value: Any = None
    suggestions: Optional[List[str]] = None

@dataclass
class ValidationReport:
    """Summary of what we found"""
    total_records: int
    valid_records: int
    invalid_records: int
    results: List[ValidationResult]
    summary: Dict[str, int]
    processing_time: float

class DataValidator:
    """Checks if the data is good"""
    
    def __init__(self):
        self.config = config
        self.validation_rules = self._load_validation_rules()
    
    def _load_validation_rules(self) -> Dict[str, Dict[str, Any]]:
        """Generate validation rules from CSV files"""
        rules = {}
        
        try:
            csv_files = {
                'locations': 'Dataset/locations.csv',
                'roads': 'Dataset/roads.csv',
                'roadgraphx': 'Dataset/roadgraphx.csv',
                'roadgraphy': 'Dataset/roadgraphy.csv',
                'gps_types': 'Dataset/enum gpstypes.csv',
                'shop_types': 'Dataset/enum shops.csv',
                'unit_types': 'Dataset/enum units.csv'
            }
            
            for data_type, file_path in csv_files.items():
                if Path(file_path).exists():
                    df = pd.read_csv(file_path, nrows=10)
                    rules[data_type] = self._generate_rules_from_dataframe(df)
                    
        except Exception as e:
            logger.warning(f"Could not load validation rules from CSV: {e}")
            rules = self._get_default_rules()
            
        return rules
    
    def _generate_rules_from_dataframe(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Generate validation rules from DataFrame structure"""
        rules = {}
        
        for column in df.columns:
            sample_values = df[column].dropna().head(5)
            
            if len(sample_values) == 0:
                rules[column] = {'type': 'string', 'required': False}
                continue
                
            data_type = self._infer_data_type(sample_values)
            
            has_nulls = df[column].isna().any()
            
            rules[column] = {
                'type': data_type,
                'required': not has_nulls
            }
            
        return rules
    
    def _infer_data_type(self, sample_values: pd.Series) -> str:
        """Infer data type from sample values"""
        try:
            pd.to_numeric(sample_values, errors='raise').astype(int)
            return 'integer'
        except:
            try:
                pd.to_numeric(sample_values, errors='raise').astype(float)
                return 'float'
            except:
                return 'string'
    
    def _get_default_rules(self) -> Dict[str, Dict[str, Any]]:
        """Fallback rules if CSV loading fails"""
        return {
            'locations': {
                'Id': {'type': 'integer', 'required': True},
                'Name': {'type': 'string', 'required': True},
                'Pit': {'type': 'string', 'required': True},
                'Region': {'type': 'string', 'required': True},
                'Xloc': {'type': 'float', 'required': True},
                'Yloc': {'type': 'float', 'required': True},
                'Zloc': {'type': 'float', 'required': False},
                'UnitId': {'type': 'integer', 'required': True},
                'Signid': {'type': 'integer', 'required': False},
                'Signpost': {'type': 'integer', 'required': False},
                'Shoptype': {'type': 'integer', 'required': True},
                'Radius': {'type': 'float', 'required': False},
                'Gpstype': {'type': 'integer', 'required': True}
            },
            'roads': {
                'Id': {'type': 'integer', 'required': True},
                'FieldLocstart': {'type': 'integer', 'required': True},
                'FieldLocend': {'type': 'integer', 'required': True},
                'FieldDist': {'type': 'float', 'required': True},
                'FieldTimeempty': {'type': 'integer', 'required': True},
                'FieldTimeloaded': {'type': 'integer', 'required': True},
                'FieldClosed': {'type': 'integer', 'required': True}
            },
            'roadgraphx': {
                'Id': {'type': 'integer', 'required': True},
                'Index': {'type': 'integer', 'required': True},
                'Value': {'type': 'float', 'required': True}
            },
            'roadgraphy': {
                'Id': {'type': 'integer', 'required': True},
                'Index': {'type': 'integer', 'required': True},
                'Value': {'type': 'float', 'required': True}
            }
        }
    
    def validate_dataframe(self, df: pd.DataFrame, data_type: str) -> ValidationReport:
        """Validate entire DataFrame"""
        start_time = datetime.now()
        results = []
        
        try:
            if data_type not in self.validation_rules:
                raise ValueError(f"Unknown data type: {data_type}")
            
            rules = self.validation_rules[data_type]
            total_records = len(df)
            valid_records = 0
            
            # Validate each record
            for index, row in df.iterrows():
                record_valid = True
                record_results = []
                
                for field, rule in rules.items():
                    if field in df.columns:
                        field_result = self._validate_field(row[field], field, rule, index)
                        record_results.append(field_result)
                        
                        if field_result.severity in [ValidationSeverity.ERROR, ValidationSeverity.CRITICAL]:
                            record_valid = False
                    elif rule.get('required', False):
                        record_results.append(ValidationResult(
                            is_valid=False,
                            severity=ValidationSeverity.ERROR,
                            message=f"Required field '{field}' is missing",
                            field=field
                        ))
                        record_valid = False
                
                results.extend(record_results)
                
                if record_valid:
                    valid_records += 1
            
            cross_results = self._validate_cross_fields(df, data_type)
            results.extend(cross_results)
            
            summary = self._calculate_summary(results)
            invalid_records = total_records - valid_records
            
            processing_time = (datetime.now() - start_time).total_seconds()
            
            return ValidationReport(
                total_records=total_records,
                valid_records=valid_records,
                invalid_records=invalid_records,
                results=results,
                summary=summary,
                processing_time=processing_time
            )
        
        except Exception as e:
            logger.error(f"DataFrame validation failed: {e}")
            raise
    
    def _validate_field(self, value: Any, field: str, rule: Dict[str, Any], index: int) -> ValidationResult:
        """Validate individual field"""
        try:
            if pd.isna(value):
                if rule.get('required', False):
                    return ValidationResult(
                        is_valid=False,
                        severity=ValidationSeverity.ERROR,
                        message=f"Required field '{field}' is null",
                        field=field,
                        value=value
                    )
                else:
                    return ValidationResult(
                        is_valid=True,
                        severity=ValidationSeverity.INFO,
                        message=f"Optional field '{field}' is null",
                        field=field,
                        value=value
                    )
            
            expected_type = rule.get('type', 'string')
            if not self._validate_type(value, expected_type):
                return ValidationResult(
                    is_valid=False,
                    severity=ValidationSeverity.ERROR,
                    message=f"Field '{field}' has invalid type. Expected {expected_type}, got {type(value).__name__}",
                    field=field,
                    value=value,
                    suggestions=[f"Convert to {expected_type}"]
                )
            
            if 'min' in rule and value < rule['min']:
                return ValidationResult(
                    is_valid=False,
                    severity=ValidationSeverity.ERROR,
                    message=f"Field '{field}' value {value} is below minimum {rule['min']}",
                    field=field,
                    value=value,
                    suggestions=[f"Use value >= {rule['min']}"]
                )
            
            if 'max' in rule and value > rule['max']:
                return ValidationResult(
                    is_valid=False,
                    severity=ValidationSeverity.ERROR,
                    message=f"Field '{field}' value {value} exceeds maximum {rule['max']}",
                    field=field,
                    value=value,
                    suggestions=[f"Use value <= {rule['max']}"]
                )
            
            if expected_type == 'string' and 'max_length' in rule:
                if len(str(value)) > rule['max_length']:
                    return ValidationResult(
                        is_valid=False,
                        severity=ValidationSeverity.ERROR,
                        message=f"Field '{field}' length {len(str(value))} exceeds maximum {rule['max_length']}",
                        field=field,
                        value=value,
                        suggestions=[f"Truncate to {rule['max_length']} characters"]
                    )
            
            if 'pattern' in rule:
                if not re.match(rule['pattern'], str(value)):
                    return ValidationResult(
                        is_valid=False,
                        severity=ValidationSeverity.ERROR,
                        message=f"Field '{field}' does not match required pattern",
                        field=field,
                        value=value,
                        suggestions=[f"Use pattern: {rule['pattern']}"]
                    )
            
            return ValidationResult(
                is_valid=True,
                severity=ValidationSeverity.INFO,
                message=f"Field '{field}' is valid",
                field=field,
                value=value
            )
        
        except Exception as e:
            return ValidationResult(
                is_valid=False,
                severity=ValidationSeverity.CRITICAL,
                message=f"Validation error for field '{field}': {e}",
                field=field,
                value=value
            )
    
    def _validate_type(self, value: Any, expected_type: str) -> bool:
        try:
            if expected_type == 'integer':
                return isinstance(value, (int, np.integer)) or (isinstance(value, str) and value.isdigit())
            elif expected_type == 'float':
                return isinstance(value, (int, float, np.number)) or (isinstance(value, str) and value.replace('.', '').isdigit())
            elif expected_type == 'string':
                return isinstance(value, (str, np.str_))
            elif expected_type == 'boolean':
                return isinstance(value, (bool, np.bool_)) or value in [0, 1, '0', '1', 'true', 'false']
            else:
                return True
        except:
            return False
    
    def _validate_cross_fields(self, df: pd.DataFrame, data_type: str) -> List[ValidationResult]:
        results = []
        
        try:
            if data_type == 'roads':
                same_location_mask = df['FieldLocstart'] == df['FieldLocend']
                if same_location_mask.any():
                    for index in df[same_location_mask].index:
                        results.append(ValidationResult(
                            is_valid=False,
                            severity=ValidationSeverity.WARNING,
                            message="Start and end locations are the same",
                            field="FieldLocstart,FieldLocend",
                            value=(df.loc[index, 'FieldLocstart'], df.loc[index, 'FieldLocend']),
                            suggestions=["Use different start and end locations"]
                        ))
                
                if 'FieldDist' in df.columns and 'FieldTimeempty' in df.columns:
                    zero_distance_mask = df['FieldDist'] == 0
                    if zero_distance_mask.any():
                        for index in df[zero_distance_mask].index:
                            results.append(ValidationResult(
                                is_valid=False,
                                severity=ValidationSeverity.WARNING,
                                message="Road has zero distance",
                                field="FieldDist",
                                value=df.loc[index, 'FieldDist'],
                                suggestions=["Check road distance"]
                            ))
            
            elif data_type == 'locations':
                if 'Xloc' in df.columns and 'Yloc' in df.columns:
                    duplicate_coords = df.duplicated(subset=['Xloc', 'Yloc'], keep=False)
                    if duplicate_coords.any():
                        for index in df[duplicate_coords].index:
                            results.append(ValidationResult(
                                is_valid=False,
                                severity=ValidationSeverity.WARNING,
                                message="Duplicate coordinates found",
                                field="Xloc,Yloc",
                                value=(df.loc[index, 'Xloc'], df.loc[index, 'Yloc']),
                                suggestions=["Check for duplicate locations"]
                            ))
        
        except Exception as e:
            logger.error(f"Cross-field validation failed: {e}")
        
        return results
    
    def _calculate_summary(self, results: List[ValidationResult]) -> Dict[str, int]:
        """Calculate validation summary statistics"""
        summary = {
            'total_validations': len(results),
            'valid': 0,
            'info': 0,
            'warning': 0,
            'error': 0,
            'critical': 0
        }
        
        for result in results:
            if result.is_valid:
                summary['valid'] += 1
            summary[result.severity.value] += 1
        
        return summary
    
    def validate_data_quality(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Perform comprehensive data quality assessment"""
        quality_report = {
            'completeness': self._assess_completeness(df),
            'consistency': self._assess_consistency(df),
            'accuracy': self._assess_accuracy(df),
            'uniqueness': self._assess_uniqueness(df),
            'timeliness': self._assess_timeliness(df)
        }
        
        return quality_report
    
    def _assess_completeness(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Assess data completeness"""
        total_cells = df.size
        null_cells = df.isnull().sum().sum()
        completeness_ratio = (total_cells - null_cells) / total_cells
        
        return {
            'total_cells': total_cells,
            'null_cells': null_cells,
            'completeness_ratio': completeness_ratio,
            'status': 'good' if completeness_ratio > 0.95 else 'needs_attention'
        }
    
    def _assess_consistency(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Assess data consistency"""
        # Check for duplicate rows
        duplicate_count = df.duplicated().sum()
        total_rows = len(df)
        consistency_ratio = (total_rows - duplicate_count) / total_rows
        
        return {
            'total_rows': total_rows,
            'duplicate_rows': duplicate_count,
            'consistency_ratio': consistency_ratio,
            'status': 'good' if consistency_ratio > 0.99 else 'needs_attention'
        }
    
    def _assess_accuracy(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Assess data accuracy (basic checks)"""
        
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        accuracy_issues = 0
        
        for col in numeric_columns:
            if len(df[col].dropna()) > 0:
                mean_val = df[col].mean()
                std_val = df[col].std()
                if std_val > 0:
                    outliers = abs(df[col] - mean_val) > 3 * std_val
                    accuracy_issues += outliers.sum()
        
        return {
            'numeric_columns': len(numeric_columns),
            'potential_outliers': accuracy_issues,
            'status': 'good' if accuracy_issues < len(df) * 0.01 else 'needs_attention'
        }
    
    def _assess_uniqueness(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Assess data uniqueness"""
        key_columns = ['Id'] if 'Id' in df.columns else df.columns[:1]
        uniqueness_issues = 0
        
        for col in key_columns:
            if col in df.columns:
                duplicates = df[col].duplicated().sum()
                uniqueness_issues += duplicates
        
        return {
            'key_columns_checked': len(key_columns),
            'duplicate_values': uniqueness_issues,
            'status': 'good' if uniqueness_issues == 0 else 'needs_attention'
        }
    
    def _assess_timeliness(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Assess data timeliness"""
        return {
            'assessment': 'Data timeliness cannot be assessed without timestamp information',
            'status': 'unknown'
        }

data_validator = DataValidator()
