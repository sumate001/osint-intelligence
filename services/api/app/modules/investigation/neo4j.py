"""Neo4j operations for investigation graph data."""
import logging
from typing import Any

import httpx

from ...core.config import get_settings

log = logging.getLogger(__name__)


async def get_case_graph(case_id: str) -> dict[str, list]:
    """Query Neo4j for all entities and relationships linked to a case."""
    settings = get_settings()
    if not settings.neo4j_uri:
        return {"nodes": [], "edges": []}

    try:
        auth = (settings.neo4j_user, settings.neo4j_password)
        url = settings.neo4j_uri.replace("bolt://", "http://").replace(":7687", ":7474")
        # Two queries: all nodes for this case + any relationships between them
        statements = [
            {
                "statement": "MATCH (n) WHERE n.case_id = $case_id RETURN n, labels(n) AS labels LIMIT 200",
                "parameters": {"case_id": case_id},
            },
            {
                "statement": (
                    "MATCH (n)-[r]->(m) WHERE n.case_id = $case_id AND m.case_id = $case_id "
                    "RETURN n, r, m LIMIT 200"
                ),
                "parameters": {"case_id": case_id},
            },
        ]
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{url}/db/neo4j/tx/commit",
                json={"statements": statements},
                auth=auth,
            )
            resp.raise_for_status()
            data = resp.json()

        nodes: dict[str, Any] = {}
        edges: list[dict] = []
        seen_edges: set[str] = set()

        results = data.get("results", [])

        # First result: standalone nodes (row = [node, labels_array])
        if results:
            for row in results[0].get("data", []):
                row_data = row.get("row", [])
                meta = row.get("meta", [])
                if not row_data or not meta:
                    continue
                n, n_meta = row_data[0], meta[0]
                # labels() is returned as second column (plain list, no meta)
                node_labels = row_data[1] if len(row_data) > 1 and isinstance(row_data[1], list) else []
                n_id = str(n_meta.get("id", ""))
                if n_id and n_id not in nodes:
                    nodes[n_id] = {
                        "id": n_id,
                        "label": n.get("name", n.get("value", n_id)),
                        "type": node_labels[0].lower() if node_labels else "entity",
                        "properties": {k: v for k, v in n.items() if k != "case_id"},
                    }

        # Second result: relationships
        if len(results) > 1:
            for row in results[1].get("data", []):
                row_data = row.get("row", [])
                meta = row.get("meta", [])
                if len(row_data) < 3 or len(meta) < 3:
                    continue
                n, r, m = row_data[0], row_data[1], row_data[2]
                n_meta, r_meta, m_meta = meta[0], meta[1], meta[2]
                n_id = str(n_meta.get("id", ""))
                m_id = str(m_meta.get("id", ""))
                r_id = str(r_meta.get("id", ""))
                for node_id, node_data, node_meta in [(n_id, n, n_meta), (m_id, m, m_meta)]:
                    if node_id and node_id not in nodes:
                        nodes[node_id] = {
                            "id": node_id,
                            "label": node_data.get("name", node_data.get("value", node_id)),
                            "type": node_meta.get("labels", ["unknown"])[0].lower() if node_meta.get("labels") else "unknown",
                            "properties": {k: v for k, v in node_data.items() if k != "case_id"},
                        }
                edge_key = f"{n_id}-{r_meta.get('type', '')}-{m_id}"
                if r_id and edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    edges.append({
                        "id": r_id,
                        "from_": n_id,
                        "to": m_id,
                        "label": r_meta.get("type", "RELATED_TO"),
                    })

        return {"nodes": list(nodes.values()), "edges": edges}

    except Exception as exc:
        log.warning("Neo4j graph query failed: %s", exc)
        return {"nodes": [], "edges": []}


async def upsert_entities(case_id: str, entities: list[dict]) -> None:
    """Merge SpiderFoot entities as Neo4j nodes tagged with case_id."""
    settings = get_settings()
    if not settings.neo4j_uri or not entities:
        return

    try:
        auth = (settings.neo4j_user, settings.neo4j_password)
        url = settings.neo4j_uri.replace("bolt://", "http://").replace(":7687", ":7474")

        statements = []
        for ent in entities:
            node_type = ent.get("type", "Entity").replace(" ", "_")
            value = str(ent.get("value", ""))[:500]
            if not value:
                continue
            statements.append({
                "statement": f"""
                    MERGE (n:{node_type} {{value: $value}})
                    SET n.case_id = $case_id, n.name = $value, n.source = $source
                """,
                "parameters": {
                    "value": value,
                    "case_id": case_id,
                    "source": ent.get("source", "spiderfoot"),
                },
            })

        if not statements:
            return

        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{url}/db/neo4j/tx/commit",
                json={"statements": statements},
                auth=auth,
            )
    except Exception as exc:
        log.warning("Neo4j upsert failed: %s", exc)
