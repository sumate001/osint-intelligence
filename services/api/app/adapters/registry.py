from .base import BaseAdapter
from .rss import RSSAdapter

ADAPTER_REGISTRY: dict[str, type[BaseAdapter]] = {
    "rss": RSSAdapter,
}


def register_adapter(name: str, cls: type[BaseAdapter]) -> None:
    """Register a third-party adapter at runtime."""
    ADAPTER_REGISTRY[name] = cls


def load_adapter(config: dict) -> BaseAdapter:
    adapter_type = config.get("adapter_type") or config.get("source_type")
    if not adapter_type:
        raise ValueError("config must include 'adapter_type'")
    cls = ADAPTER_REGISTRY.get(adapter_type)
    if not cls:
        raise ValueError(f"Unknown adapter type: {adapter_type!r}. Registered: {list(ADAPTER_REGISTRY)}")
    return cls(config)
