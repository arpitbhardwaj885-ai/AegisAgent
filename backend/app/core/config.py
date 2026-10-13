import os
from typing import List

# API Metadata
API_TITLE = "AegisAgent Trust Evaluation API"
API_VERSION = "1.0.0"
API_DESCRIPTION = (
    "AegisAgent Trust Evaluation API exposes verifiable blockchain evidence, "
    "an authoritative deterministic trust engine, and an explanatory AI reasoning layer."
)

# CORS Configuration
# Environment-configurable, defaults to local frontend development origins
raw_cors = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
CORS_ORIGINS: List[str] = [origin.strip() for origin in raw_cors.split(",") if origin.strip()]

# Compare Limits
MAX_COMPARE_AGENTS = int(os.getenv("MAX_COMPARE_AGENTS", "10"))

# Request Limits
MAX_TASK_DESCRIPTION_LENGTH = 2000
MAX_CAPABILITIES_COUNT = 20
MAX_CAPABILITY_LENGTH = 100
MAX_DOMAIN_LENGTH = 100
