from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers.patients import router as patients_router, patient_router

from app.core.config import settings
from app.api.routers import (
    auth, patients, treatment_plans,
    trigger_situations, avoidance_behaviors,
    ladders, experiments, progress,
    downward_arrows, messages, monitoring
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

app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(treatment_plans.router)
app.include_router(trigger_situations.router)
app.include_router(avoidance_behaviors.router)
app.include_router(ladders.router)
app.include_router(experiments.router)
app.include_router(progress.router)
app.include_router(downward_arrows.router)
app.include_router(messages.router)
app.include_router(patients_router)
app.include_router(patient_router)
app.include_router(monitoring.practitioner_router)
app.include_router(monitoring.public_router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}

@app.get("/debug/security")
async def debug_security():
    import bcrypt
    test = bcrypt.hashpw(b"test", bcrypt.gensalt()).decode()
    return {"bcrypt_working": True, "hash_sample": test[:20]}
