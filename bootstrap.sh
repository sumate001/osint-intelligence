#!/usr/bin/env bash
# OSINT//DESK — Phase 0 bootstrap
# รันครั้งเดียวบนเครื่อง Ubuntu เพื่อตั้งค่าเริ่มต้น
set -euo pipefail

echo "═══════════════════════════════════════"
echo "  OSINT//DESK — Phase 0 Bootstrap"
echo "═══════════════════════════════════════"

# 1. ตรวจ prerequisites
echo "→ ตรวจสอบ prerequisites..."
command -v docker >/dev/null || { echo "✗ ไม่พบ docker — ติดตั้งก่อน: https://docs.docker.com/engine/install/ubuntu/"; exit 1; }
docker compose version >/dev/null || { echo "✗ ไม่พบ docker compose plugin"; exit 1; }
echo "✓ docker + compose พร้อม"

# 2. ตรวจ Ollama บน host
echo "→ ตรวจสอบ Ollama..."
if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "✓ Ollama ทำงานอยู่บน host"
  echo "  models ที่มี:"
  curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | sed 's/"name":"/    - /;s/"//' || true
else
  echo "⚠ ไม่พบ Ollama ที่ localhost:11434"
  echo "  ถ้า Ollama อยู่คนละเครื่อง แก้ OLLAMA_BASE_URL ใน .env"
fi

# 3. สร้าง .env ถ้ายังไม่มี
if [ ! -f .env ]; then
  cp .env.example .env
  # generate secret key
  SECRET=$(openssl rand -hex 32)
  sed -i "s/change_this_to_a_random_secret_key/$SECRET/" .env
  echo "✓ สร้าง .env แล้ว (generate SECRET_KEY ให้อัตโนมัติ)"
  echo "  ⚠ แก้ password ต่างๆ ใน .env ก่อนขึ้น production"
else
  echo "✓ .env มีอยู่แล้ว — ข้าม"
fi

# 4. pull base images
echo "→ ดึง Docker images..."
docker compose -f docker-compose.dev.yml pull postgres redis neo4j meilisearch minio searxng

# 5. ขึ้น infrastructure services ก่อน (ยังไม่รวม api/frontend ที่ต้อง build)
echo "→ เริ่ม infrastructure services..."
docker compose -f docker-compose.dev.yml up -d postgres redis neo4j meilisearch minio searxng

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ Infrastructure พร้อมแล้ว"
echo "═══════════════════════════════════════"
echo ""
echo "ตรวจสอบ:"
echo "  Postgres    → localhost:5432"
echo "  Neo4j UI    → http://localhost:7474"
echo "  Meilisearch → http://localhost:7700"
echo "  MinIO UI    → http://localhost:9001"
echo "  SearXNG     → http://localhost:8080"
echo ""
echo "ขั้นต่อไป — ให้ Claude Code ทำ Phase 1:"
echo "  1. ติดตั้ง Claude Code:  npm install -g @anthropic-ai/claude-code"
echo "  2. cd เข้า repo นี้"
echo "  3. รัน:  claude"
echo "  4. พิมพ์:  อ่าน CLAUDE.md แล้วเริ่ม implement Phase 1 ตาม docs/roadmap.md"
echo ""
echo "(api + frontend จะถูกสร้างโดย Claude Code ใน Phase 1)"
