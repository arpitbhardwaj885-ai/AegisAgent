from enum import Enum

# Policy constants (configurable)
STALE_EVIDENCE_DAYS_AGING = 30
STALE_EVIDENCE_DAYS_STALE = 90
SUDDEN_GROWTH_MULTIPLIER = 5.0 # e.g. 500%

# Weighting (must sum to 1.0 ideally, or used relative to each other)
WEIGHT_REPUTATION = 0.30
WEIGHT_VALIDATION = 0.25
WEIGHT_IDENTITY = 0.15
WEIGHT_RELIABILITY = 0.15
WEIGHT_BEHAVIORAL_RISK = 0.15

# Trust Recommendation Thresholds
HIRE_MIN_TRUST = 75
HIRE_MIN_TASK_FIT = 70

REVIEW_MIN_TRUST = 50
REVIEW_MIN_TASK_FIT = 50

# Maximums
MAX_SCORE = 100.0
MIN_SCORE = 0.0

class EvidenceStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    PARTIAL = "PARTIAL"
    MISSING = "MISSING"
    INVALID = "INVALID"

class Recommendation(str, Enum):
    HIRE = "HIRE"
    REVIEW = "REVIEW"
    DO_NOT_HIRE = "DO_NOT_HIRE"
