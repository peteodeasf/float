from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routers import auth, patients, treatment_plans, trigger_situations, avoidance_behaviors

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

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
