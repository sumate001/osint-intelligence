from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "OSINT//DESK API"
    debug: bool = False
    #: Whether an inbound signal with no category match is put to the model to
    #: decide which standing interest it belongs to. On in production; the test
    #: suite turns it off so a live model is not on the path of every ingest —
    #: with two profiles defined that took the signals suite from 5s to 3 minutes.
    signal_profile_matching: bool = True

    # Database
    postgres_url: str = "postgresql+asyncpg://osint:changeme@localhost:5432/osintdesk"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme123"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_user: str = "osint"
    minio_password: str = "changeme123"

    # Meilisearch
    meilisearch_url: str = "http://localhost:7700"
    meili_master_key: str = "changeme_master_key"

    # Ollama
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_default_model: str = "qwen3:8b"

    # Model routing per module
    triage_model: str = "qwen3:8b"
    brief_model: str = "qwen3:14b"
    vision_model: str = "gemma3:27b"
    simulation_model: str = "qwen3:14b"
    requirements_model: str = "qwen3:8b"
    deception_model: str = "qwen3:8b"
    darkweb_model: str = "qwen3:8b"
    whisper_model: str = "whisper"

    # Auth
    secret_key: str = "change_this_to_a_random_secret_key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # Celery (default follows redis_url to avoid mismatch in Docker)
    celery_broker_url: str = ""
    celery_result_backend: str = ""

    @property
    def effective_broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def effective_result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url.replace("/0", "/1")

    # External OSINT tools
    spiderfoot_url: str = ""
    mirofish_url: str = ""   # when set, simulation uses MiroFish; else LLM fallback
    perplexica_url: str = "http://localhost:3001"
    searxng_url: str = "http://localhost:8080"

    # Ingestion
    rss_poll_interval_seconds: int = 300  # 5 minutes

    # Horizon integration (external signal intake)
    # Key Horizon must present on POST /api/v1/signals/inbound. Unset refuses
    # every inbound call rather than accepting unauthenticated ones.
    horizon_inbound_api_key: str = ""
    # Where to send verdicts back. Unset skips the callback silently — that is a
    # deployment choice, not a failure.
    horizon_base_url: str = ""
    horizon_api_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
