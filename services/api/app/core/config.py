from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "OSINT//DESK API"
    debug: bool = False

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
    perplexica_url: str = "http://localhost:3001"
    searxng_url: str = "http://localhost:8080"

    # Ingestion
    rss_poll_interval_seconds: int = 300  # 5 minutes

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
