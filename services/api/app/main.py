from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .core.config import get_settings
from .core.db import engine, Base
from .core import llm


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tables managed by Alembic — run `alembic upgrade head` separately
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://frontend:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    from .routers.auth import router as auth_router
    from .modules.triage.router import router as triage_router
    from .modules.reliability.router import router as reliability_router
    from .routers.sources import router as sources_router
    from .modules.investigation.router import router as investigation_router
    from .modules.verify.router import router as verify_router
    from .routers.research import router as research_router
    from .modules.brief.router import router as brief_router
    from .modules.confidence.router import router as confidence_router
    from .modules.requirements.router import router as requirements_router
    from .modules.collaboration.router import router as collaboration_router
    from .modules.deception.router import router as deception_router
    from .modules.knowledge.router import router as knowledge_router
    from .modules.simulation.router import router as simulation_router
    from .modules.darkweb.router import router as darkweb_router
    from .modules.admin.router import router as admin_router

    app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(triage_router, prefix="/api/v1/triage", tags=["triage"])
    app.include_router(reliability_router, prefix="/api/v1/reliability", tags=["reliability"])
    app.include_router(sources_router, prefix="/api/v1/sources", tags=["sources"])
    app.include_router(investigation_router, prefix="/api/v1/investigation", tags=["investigation"])
    app.include_router(verify_router, prefix="/api/v1/verify", tags=["verify"])
    app.include_router(research_router, prefix="/api/v1/research", tags=["research"])
    app.include_router(brief_router, prefix="/api/v1/briefs", tags=["brief"])
    app.include_router(confidence_router, prefix="/api/v1/briefs", tags=["confidence"])
    app.include_router(requirements_router, prefix="/api/v1/pirs", tags=["requirements"])
    app.include_router(collaboration_router, prefix="/api/v1/collaboration", tags=["collaboration"])
    app.include_router(deception_router, prefix="/api/v1/deception", tags=["deception"])
    app.include_router(knowledge_router, prefix="/api/v1/knowledge", tags=["knowledge"])
    app.include_router(simulation_router, prefix="/api/v1/simulation", tags=["simulation"])
    app.include_router(darkweb_router, prefix="/api/v1/darkweb", tags=["darkweb"])
    app.include_router(admin_router)

    @app.get("/health", tags=["system"])
    async def health():
        ollama_ok = await llm.health_check()
        return {
            "status": "ok",
            "services": {
                "api": True,
                "ollama": ollama_ok,
            },
        }

    return app


app = create_app()
