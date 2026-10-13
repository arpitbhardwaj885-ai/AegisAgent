from fastapi import APIRouter
from app.api.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Service Health Check")
def get_health() -> HealthResponse:
    """
    Returns immediate status 'ok' without triggering external RPC calls or AI models.
    """
    return HealthResponse(status="ok")
