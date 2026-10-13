from typing import Protocol
import json
import requests
from app.trust.ai.config import AI_API_KEY, AI_PROVIDER_NAME

class AIProvider(Protocol):
    def generate_reasoning(self, prompt: str) -> str:
        ...

class MockProvider:
    def __init__(self, forced_response: str = None):
        self.forced_response = forced_response
        
    def generate_reasoning(self, prompt: str) -> str:
        if self.forced_response:
            return self.forced_response
            
        return json.dumps({
            "summary": "Mock summary",
            "strengths": ["Mock strength"],
            "concerns": [],
            "risk_explanation": [],
            "task_fit_explanation": "Mock task fit",
            "recommendation_explanation": "Mock recommendation",
            "confidence_explanation": "Mock confidence",
            "suggested_next_checks": []
        })

class GeminiProvider:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key={self.api_key}"
        
    def generate_reasoning(self, prompt: str) -> str:
        headers = {"Content-Type": "application/json"}
        data = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "response_mime_type": "application/json"
            }
        }
        resp = requests.post(self.endpoint, headers=headers, json=data, timeout=15)
        resp.raise_for_status()
        result = resp.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]

def get_provider() -> AIProvider:
    if AI_PROVIDER_NAME == "gemini" and AI_API_KEY:
        return GeminiProvider(AI_API_KEY)
    return MockProvider()
