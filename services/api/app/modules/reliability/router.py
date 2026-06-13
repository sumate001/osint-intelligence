from fastapi import APIRouter
from .service import SOURCE_CODE_LABELS, INFO_CODE_LABELS

router = APIRouter()


@router.get("/codes")
async def get_codes():
    return {
        "source_codes": SOURCE_CODE_LABELS,
        "info_codes": INFO_CODE_LABELS,
    }
