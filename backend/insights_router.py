from fastapi import APIRouter, Depends

from deps import get_current_user_id
from insights_service import build_insights_response

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/insights")
async def get_insights(user_id: str = Depends(get_current_user_id)):
    return await build_insights_response(user_id)
