"""The teen data testing page's own routes (docs/plans/teen-data-testing.md).

Signed in as the teen, never as a clinician: `get_patient_context` refuses anyone without a
patient profile, and everything here reads and writes only that teen's own records. Recording an
exposure by hand uses the teen app's ordinary routes; these two are what it adds.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.patients import get_my_ladder, get_patient_context
from app.core.database import get_db
from app.core.teen_testing import require_testing, testing_on
from app.services.teen_testing_service import fill_three_weeks

router = APIRouter(prefix="/patient/testing", tags=["teen-testing"])


@router.get("")
async def testing_status(context: tuple = Depends(get_patient_context)):
    """Whether the test switch is on, so the page can say when it is off."""
    return {"switched_on": testing_on()}


@router.post("/fill-three-weeks", status_code=status.HTTP_201_CREATED)
async def fill_in_three_weeks(
    context: tuple = Depends(get_patient_context),
    db: AsyncSession = Depends(get_db),
):
    require_testing()
    user, patient = context
    # The rungs the teen app itself gets, so the history lands only on what this child can see —
    # their own ladder, and only once their clinician has made it visible to them.
    ladder = await get_my_ladder(context=context, db=db)
    if ladder["plan"] is None or not ladder["plan"]["ladder_active"]:
        raise HTTPException(status_code=400, detail="The ladder is not visible to this teen yet")
    rungs = ladder["rungs"]
    if not rungs:
        raise HTTPException(status_code=400, detail="There are no rungs on this teen's ladder")
    return await fill_three_weeks(db, user, patient, rungs)
