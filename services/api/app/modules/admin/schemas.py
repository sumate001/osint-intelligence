from pydantic import BaseModel
from typing import Any


class AISettings(BaseModel):
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_default_model: str = "qwen3:8b"
    vision_model: str = "gemma3:27b"
    embed_model: str = "nomic-embed-text"
    max_concurrent: int = 4
    cloud_fallback_url: str = ""
    cloud_fallback_key: str = ""


class ModelRoutingSettings(BaseModel):
    triage_model: str = "qwen3:8b"
    brief_model: str = "qwen3:14b"
    vision_model: str = "gemma3:27b"
    simulation_model: str = "qwen3:14b"


class TriageWeightSettings(BaseModel):
    freshness: int = 3
    source_reliability: int = 3
    topic_relevance: int = 3
    virality: int = 3
    geo_priority: int = 2
    exclusivity: int = 2
    sentiment: int = 2
    priority_threshold: int = 15
    investigate_threshold: int = 11
    fast_track_threshold: int = 6


class SearchEngines(BaseModel):
    google: bool = True
    bing: bool = True
    ddg: bool = True
    brave: bool = True
    yandex: bool = False
    startpage: bool = False


class SearxngSettings(BaseModel):
    url: str = "http://localhost:8080"
    max_results: int = 60
    engines: SearchEngines = SearchEngines()
    safe_search: bool = False
    refresh_interval: str = "4h"


class PerplexicaSettings(BaseModel):
    url: str = "http://localhost:3001"


class SpiderFootSettings(BaseModel):
    url: str = "http://localhost:5001"
    api_key: str = ""
    scan_timeout: int = 10
    max_concurrent_scans: int = 3


class MiroFishSettings(BaseModel):
    url: str = "http://localhost:5002"
    default_agents: int = 1000


class DatabaseSettings(BaseModel):
    postgres_host: str = "localhost:5432"
    postgres_db: str = "osintdesk"
    postgres_user: str = "osint"
    postgres_password: str = ""
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""
    meilisearch_url: str = "http://localhost:7700"
    meilisearch_key: str = ""


class StorageSettings(BaseModel):
    minio_endpoint: str = "http://localhost:9000"
    minio_user: str = "osint"
    minio_password: str = ""
    minio_bucket: str = "osintdesk-media"
    redis_url: str = "redis://localhost:6379/0"
    redis_password: str = ""


class N8nSettings(BaseModel):
    url: str = "http://localhost:5678"
    api_key: str = ""
    webhook_base: str = "http://localhost:5678/webhook"


class NotificationAlerts(BaseModel):
    priority: bool = True
    environment_surge: bool = True
    watchlist_hit: bool = True
    daily_digest: bool = False
    brief_approved: bool = False


class NotificationSettings(BaseModel):
    check_interval_minutes: int = 5
    alerts: NotificationAlerts = NotificationAlerts()


class AutomationSteps(BaseModel):
    auto_triage: bool = True       # score incoming feed items
    auto_investigate: bool = True  # open investigation case when score ≥ min_score
    auto_scan: bool = True         # trigger SpiderFoot scan when case is created
    auto_verify: bool = False      # run UGC verify on media attachments
    auto_brief: bool = False       # generate brief draft after scan completes


class AutomationSettings(BaseModel):
    enabled: bool = False                        # master switch — default OFF
    decision_mode: str = "rule"                  # "rule" | "llm" | "workflow"
    n8n_workflow_id: str = ""                    # n8n workflow ID (when decision_mode = "workflow")
    min_score: int = 15                          # minimum triage score to trigger pipeline
    steps: AutomationSteps = AutomationSteps()
    require_human_review_for_brief: bool = True  # human must approve before publishing
    max_cases_per_hour: int = 10                 # rate-limit auto case creation


class AllSettings(BaseModel):
    ai: AISettings = AISettings()
    model_routing: ModelRoutingSettings = ModelRoutingSettings()
    triage: TriageWeightSettings = TriageWeightSettings()
    searxng: SearxngSettings = SearxngSettings()
    perplexica: PerplexicaSettings = PerplexicaSettings()
    spiderfoot: SpiderFootSettings = SpiderFootSettings()
    mirofish: MiroFishSettings = MiroFishSettings()
    databases: DatabaseSettings = DatabaseSettings()
    storage: StorageSettings = StorageSettings()
    n8n: N8nSettings = N8nSettings()
    notifications: NotificationSettings = NotificationSettings()
    automation: AutomationSettings = AutomationSettings()


class SettingsPatch(BaseModel):
    ai: AISettings | None = None
    model_routing: ModelRoutingSettings | None = None
    triage: TriageWeightSettings | None = None
    searxng: SearxngSettings | None = None
    perplexica: PerplexicaSettings | None = None
    spiderfoot: SpiderFootSettings | None = None
    mirofish: MiroFishSettings | None = None
    databases: DatabaseSettings | None = None
    storage: StorageSettings | None = None
    n8n: N8nSettings | None = None
    notifications: NotificationSettings | None = None
    automation: AutomationSettings | None = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str
    full_name: str
    role: str = "analyst"
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None


class ServiceHealth(BaseModel):
    name: str
    status: str   # ok / error / unknown
    latency_ms: float | None = None
    detail: str = ""


class LogEntry(BaseModel):
    id: int
    timestamp: str
    level: str
    service: str
    message: str
    detail: dict[str, Any] | None = None

    model_config = {"from_attributes": True}
