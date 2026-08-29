from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers.patients import patient_router
from app.api.routers.parent import parent_router

from app.core.config import settings
from app.api.routers import (
    review,
    auth, patients, treatment_plans,
    trigger_situations, avoidance_behaviors,
    ladders, experiments, progress,
    downward_arrows, messages, monitoring,
    session_notes, action_plans, admin, waitlist,
    formulation, checklist, accommodations, situation_tags, library
)

app = FastAPI(
    title="Float API",
    version="0.1.0",
    description="Float clinical platform API"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(review.router)
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(treatment_plans.router)
app.include_router(trigger_situations.router)
app.include_router(accommodations.router)
app.include_router(situation_tags.router)
app.include_router(library.router)
app.include_router(avoidance_behaviors.router)
app.include_router(avoidance_behaviors.plan_rungs_router)
app.include_router(ladders.router)
app.include_router(experiments.router)
app.include_router(progress.router)
app.include_router(downward_arrows.router)
app.include_router(messages.router)
# NOTE: patients.router is already registered above — patients_router was the same
# object under a second name, so every patients route was registered twice.
app.include_router(patient_router)
app.include_router(parent_router)
app.include_router(monitoring.practitioner_router)
app.include_router(monitoring.public_router)
app.include_router(session_notes.router)
app.include_router(formulation.router)
app.include_router(checklist.router)
app.include_router(action_plans.router)
app.include_router(admin.router)
app.include_router(waitlist.router, prefix="/waitlist", tags=["waitlist"])

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
