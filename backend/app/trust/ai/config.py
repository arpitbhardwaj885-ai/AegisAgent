import os

AI_API_KEY = os.getenv("AI_API_KEY")
AI_PROVIDER_NAME = os.getenv("AI_PROVIDER_NAME", "mock")

# Constraints to prevent token exhaustion and control cost
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "8000"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "1024"))
MAX_RISKS_IN_PROMPT = int(os.getenv("MAX_RISKS_IN_PROMPT", "10"))
