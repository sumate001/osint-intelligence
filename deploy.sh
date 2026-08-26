#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  OSINT//DESK — One-command deploy (production)
#  ใช้งาน:
#    ./deploy.sh              # ติดตั้งครั้งแรก — ถามค่าที่ยังไม่มี
#    ./deploy.sh --yes        # ติดตั้งโดยไม่ถามอะไรเลย (คำสั่งเดียวจบ)
#    ./deploy.sh --update     # git pull + rebuild + migrate
#    ./deploy.sh --down       # หยุดทุก service
#    ./deploy.sh --restart    # โหลด .env ใหม่แล้วเริ่ม service ที่ทำงานจริง
#    ./deploy.sh --logs       # ดู live logs
#    ./deploy.sh --status     # ดูสถานะ containers
#    ./deploy.sh --ssl        # ตั้งค่า SSL (Let's Encrypt)
#
#  --yes ไม่ถามอะไรเลย: ค่าที่ขาดจะถูกสร้างให้ (SECRET_KEY, รหัสผ่าน, API key)
#  แล้วพิมพ์ออกมาตอนจบ เหมาะกับการติดตั้งซ้ำ เครื่องใหม่ หรือ CI
#  ค่าที่ *มีอยู่แล้ว* ใน .env จะไม่ถูกแตะ — รันซ้ำได้เสมอ
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# ── service ที่มีงานทำจริง ───────────────────────────────────────────
# `worker` (คิว triage) กับ `beat` ยังอยู่ใน compose แต่ไม่มีงานแล้ว: การดึงข่าว
# ย้ายไป Horizon และ beat_schedule ว่างเปล่า (ดู app/worker.py) การ restart หรือ
# tail log ตัวที่ไม่ทำอะไรทำให้เข้าใจผิดว่าระบบยุ่งกว่าที่เป็น
LIVE_SERVICES="api worker-intel frontend"
BUILD_SERVICES="api worker-intel frontend"

# ตอบ prompt ทั้งหมดด้วยค่าที่มีอยู่หรือค่าที่สร้างให้ ไม่รอ input
ASSUME_YES=false

# ── สี ───────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; NC=''
fi

ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}→${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }
bold() { echo -e "${BOLD}$*${NC}"; }
hr()   { echo -e "${CYAN}══════════════════════════════════════════════${NC}"; }

# ── subcommand shortcuts ─────────────────────────────────────────────
if [ "${1:-}" = "--yes" ] || [ "${1:-}" = "-y" ]; then
  ASSUME_YES=true
  shift || true
fi

case "${1:-}" in
  --down)
    info "หยุด OSINT//DESK..."
    docker compose -f "$COMPOSE_FILE" down
    ok "หยุดทุก service แล้ว"
    exit 0 ;;

  --restart)
    # `restart` keeps the old process environment, and get_settings() is
    # lru_cached — so a plain restart after editing .env looks like it worked and
    # runs on the old values. Recreating is the only way the change takes.
    info "โหลด .env ใหม่แล้วเริ่ม $LIVE_SERVICES..."
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate $LIVE_SERVICES
    ok "restart แล้ว"
    exit 0 ;;

  --logs)
    docker compose -f "$COMPOSE_FILE" logs -f $LIVE_SERVICES
    exit 0 ;;

  --status)
    docker compose -f "$COMPOSE_FILE" ps
    exit 0 ;;

  --ssl)
    if [ -z "${DOMAIN:-}" ]; then
      echo -e "  Domain (เช่น osintdesk.example.com): \c"
      read -r DOMAIN
    fi
    if [ -z "${ADMIN_EMAIL:-}" ]; then
      echo -e "  Email สำหรับ Let's Encrypt: \c"
      read -r CERT_EMAIL
    else
      CERT_EMAIL="$ADMIN_EMAIL"
    fi
    info "ขอ SSL certificate สำหรับ $DOMAIN..."
    docker compose -f "$COMPOSE_FILE" run --rm certbot certonly \
      --webroot -w /var/www/certbot \
      -d "$DOMAIN" \
      --email "$CERT_EMAIL" \
      --agree-tos --non-interactive
    # เปิด HTTPS ใน nginx config
    sed -i "s|# server {|server {|g; s|# yourdomain.com|$DOMAIN|g" \
      infra/nginx/nginx.conf 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" restart nginx
    ok "SSL ตั้งค่าแล้ว — https://$DOMAIN"
    exit 0 ;;

  --update)
    hr
    bold "  OSINT//DESK — Update"
    hr
    echo ""
    # Pull latest code
    info "ดึง code ล่าสุดจาก git..."
    git pull --ff-only
    ok "git pull เสร็จ"
    echo ""
    # Ensure new env vars exist
    set -a; source "$ENV_FILE" 2>/dev/null || true; set +a
    _ensure_var() { grep -q "^${1}=" "$ENV_FILE" || echo "${1}=${2}" >> "$ENV_FILE"; }
    _ensure_var "WHISPER_MODEL"      "whisper"
    _ensure_var "PERPLEXICA_URL"     "http://perplexica:3000"
    _ensure_var "SPIDERFOOT_URL"     "http://spiderfoot:5001"
    _ensure_var "REQUIREMENTS_MODEL" "gemma4:12b"
    _ensure_var "DECEPTION_MODEL"    "gemma4:12b"
    _ensure_var "DARKWEB_MODEL"      "gemma4:12b"
    sed -i 's|^MINIO_ENDPOINT=http://|MINIO_ENDPOINT=|' "$ENV_FILE"
    # Rebuild and restart (rolling: workers first, then api, then frontend)
    info "Rebuild images..."
    DOCKER_BUILDKIT=1 docker compose -f "$COMPOSE_FILE" build --parallel $BUILD_SERVICES 2>&1 \
      | grep -E "^(#[0-9]+ |Step|Successfully built|ERROR|error)" || true
    ok "Build เสร็จ"
    echo ""
    info "Restart services..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate worker-intel
    docker compose -f "$COMPOSE_FILE" up -d --no-deps api
    docker compose -f "$COMPOSE_FILE" up -d --no-deps frontend nginx
    echo ""
    info "รัน database migrations..."
    sleep 5
    docker exec osint-api alembic -c /app/alembic.ini upgrade head 2>&1 \
      | grep -vE "^(INFO  \[alembic\]|$)" | head -10 || true
    ok "Migrations เสร็จ"
    echo ""
    _pull_whisper
    echo ""
    ok "Update เสร็จสมบูรณ์"
    hr
    exit 0 ;;

  --fresh|"")
    : ;;
  *)
    echo "ใช้งาน: $0 [--update|--down|--restart|--logs|--status|--ssl]"
    exit 1 ;;
esac

# ── helper: pull whisper model ────────────────────────────────────────
_pull_whisper() {
  local ollama_local="${OLLAMA_BASE_URL:-http://localhost:11434}"
  ollama_local="${ollama_local/host.docker.internal/localhost}"
  if curl -sf --max-time 3 "${ollama_local}/api/tags" &>/dev/null; then
    if curl -s "${ollama_local}/api/tags" | grep -q '"whisper"'; then
      ok "Whisper model พร้อมใช้งาน"
    else
      info "กำลัง pull Whisper model (ใช้เวลาสักครู่)..."
      if curl -sf -X POST "${ollama_local}/api/pull" \
           -d '{"name":"whisper"}' --max-time 600 -o /dev/null; then
        ok "Whisper model ติดตั้งแล้ว"
      else
        warn "pull Whisper ไม่สำเร็จ — รันเองด้วย: ollama pull whisper"
      fi
    fi
  else
    warn "Ollama ไม่พร้อม — pull Whisper หลัง Ollama start: ollama pull whisper"
  fi
}

# ══════════════════════════════════════════════════════════════════════
hr
bold "  OSINT//DESK — Deploy"
hr
echo ""

# ── 1. ตรวจ prerequisites ────────────────────────────────────────────
info "ตรวจสอบ prerequisites..."

if ! command -v docker &>/dev/null; then
  err "ไม่พบ docker — ติดตั้งก่อน: https://docs.docker.com/engine/install/"
  exit 1
fi
if ! docker compose version &>/dev/null; then
  err "ไม่พบ docker compose plugin — รัน: sudo apt install docker-compose-plugin"
  exit 1
fi
if ! command -v openssl &>/dev/null; then
  err "ไม่พบ openssl — รัน: sudo apt install openssl"
  exit 1
fi
ok "docker $(docker --version | grep -oP '[\d.]+' | head -1) + compose $(docker compose version --short 2>/dev/null || echo ok)"

# ── 2. ตรวจ / ตั้งค่า .env ──────────────────────────────────────────
echo ""
info "ตั้งค่า environment..."

if [ ! -f "$ENV_FILE" ] && [ ! -f "$ENV_EXAMPLE" ]; then
  err "ไม่พบ .env.example — รันจากภายใน repo root"
  exit 1
fi

# Whether this is a first install decides whether a placeholder password may be
# replaced. On an existing deployment it may not: Postgres bakes its password
# into the data volume at init, so rotating it in .env does not change the
# database — it only stops the app being able to reach it.
FIRST_INSTALL=false
if [ ! -f "$ENV_FILE" ]; then
  FIRST_INSTALL=true
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  SECRET=$(openssl rand -hex 32)
  sed -i "s/change_this_to_a_random_secret_key/$SECRET/" "$ENV_FILE"
  ok "สร้าง .env พร้อม SECRET_KEY"
else
  ok ".env มีอยู่แล้ว"
fi

# เพิ่ม vars ใหม่ที่อาจขาดใน .env เก่า (idempotent)
_ensure_var() {
  local key="$1" val="$2"
  grep -q "^${key}=" "$ENV_FILE" || echo "${key}=${val}" >> "$ENV_FILE"
}
_ensure_var "SPIDERFOOT_URL"      "http://spiderfoot:5001"
_ensure_var "PERPLEXICA_URL"      "http://perplexica:3000"
_ensure_var "WHISPER_MODEL"       "whisper"
_ensure_var "ZEP_API_KEY"         ""
_ensure_var "MINIO_ENDPOINT"      "minio:9000"
_ensure_var "REQUIREMENTS_MODEL"  "gemma4:12b"
_ensure_var "DECEPTION_MODEL"     "gemma4:12b"
_ensure_var "DARKWEB_MODEL"       "gemma4:12b"
# Horizon integration. Without an inbound key the endpoint refuses everything —
# which is the right default for something reachable from outside, but a fresh
# install then looks broken rather than unconfigured, so one is generated.
_ensure_var "HORIZON_INBOUND_API_KEY" "$(openssl rand -hex 16)"
_ensure_var "HORIZON_BASE_URL"        ""
_ensure_var "HORIZON_API_KEY"         ""
# Off puts a live model on the path of every inbound signal. On is correct in
# production; the test suite turns it off.
_ensure_var "SIGNAL_PROFILE_MATCHING" "true"

# แก้ MINIO_ENDPOINT ถ้ายังมี http:// นำหน้า
sed -i 's|^MINIO_ENDPOINT=http://|MINIO_ENDPOINT=|' "$ENV_FILE"

# SECRET_KEY ที่ยังเป็นค่าจาก .env.example ไม่ใช่ความลับ — มันอยู่ใน repo ให้ใคร
# ก็อ่านได้ และมันคือกุญแจเซ็น JWT ใครที่อ่านเจอก็ปลอม token เข้าระบบได้
if grep -q '^SECRET_KEY=change_this_to_a_random_secret_key' "$ENV_FILE"; then
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" "$ENV_FILE"
  warn "SECRET_KEY ยังเป็นค่าตัวอย่างจาก repo — เปลี่ยนให้แล้ว (token ที่ค้างอยู่จะใช้ไม่ได้ ต้องล็อกอินใหม่)"
fi

set -a; source "$ENV_FILE"; set +a

# ── 3. ตั้งค่าระบบ ───────────────────────────────────────────────────
echo ""
bold "── ตั้งค่าระบบ ──────────────────────────────────────"
echo ""

GENERATED=()

# Prompt, or take the default without asking when --yes is set. Values already
# in .env are the defaults, so a re-run never overwrites a working install.
_ask() {
  local prompt="$1" current="$2" answer
  if [ "$ASSUME_YES" = true ]; then
    printf '%s' "$current"
    return
  fi
  echo -e "  ${prompt} ${CYAN}[${current}]${NC}: \c" >&2
  read -r answer
  printf '%s' "${answer:-$current}"
}

# A password that is still the shipped placeholder is not a password — it is in
# the repo for anyone to read. Under --yes a real one is generated and reported
# at the end.
#
# Only on a first install, though. Postgres, Neo4j and MinIO each bake their
# password into the data volume the first time they start, so changing it in
# .env afterwards does not change theirs: it only stops the app reaching them.
# A deploy script that takes a working system offline to improve its passwords
# has not improved anything.
_secret_or_generate() {
  local current="$1"
  if [ "$FIRST_INSTALL" != true ]; then
    printf '%s' "$current"
    return
  fi
  case "$current" in
    ""|changeme|changeme123|change_this_to_a_random_secret_key|changeme_master_key)
      openssl rand -hex 16 ;;
    *) printf '%s' "$current" ;;
  esac
}

# ── Ollama URL ──
CURRENT_OLLAMA="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
OLLAMA_URL=$(_ask "Ollama URL" "$CURRENT_OLLAMA")
sed -i "s|OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=$OLLAMA_URL|" "$ENV_FILE"
# Checked later from inside a container, not from here. Testing it on the host
# with host.docker.internal rewritten to localhost answers a different question
# than the one that matters, and it answered "fine" for a URL no container could
# reach — every AI feature was silently dead until that was noticed by hand.
echo ""

# ── Passwords ──
# Runs inside $( ), so it cannot record anything for the caller: an array
# appended to in a subshell is discarded when it exits. The caller compares the
# answer against what it passed in instead — see _note_if_generated.
_read_password() {
  local prompt="$1" current="$2" minlen="${3:-1}" result
  if [ "$ASSUME_YES" = true ]; then
    _secret_or_generate "$current"
    return
  fi
  while true; do
    echo -e "  ${prompt} ${CYAN}[${current}]${NC}: \c" >&2
    read -rs result; echo "" >&2
    result="${result:-$current}"
    if [ ${#result} -lt "$minlen" ]; then
      warn "รหัสผ่านต้องมีอย่างน้อย ${minlen} ตัวอักษร"
    else
      printf '%s' "$result"
      return
    fi
  done
}

# Recorded here, in the parent shell, for the reason above.
_note_if_generated() {
  [ "$2" != "$3" ] && GENERATED+=("$1")
  return 0
}

PG_PASS=$(_read_password    "Postgres password" "${POSTGRES_PASSWORD:-changeme}" 1)
_note_if_generated "Postgres password" "$PG_PASS" "${POSTGRES_PASSWORD:-changeme}"
NEO4J_PASS=$(_read_password "Neo4j password   (≥8 chars)" "${NEO4J_PASSWORD:-changeme123}" 8)
_note_if_generated "Neo4j password" "$NEO4J_PASS" "${NEO4J_PASSWORD:-changeme123}"
MINIO_PASS=$(_read_password "MinIO password   (≥8 chars)" "${MINIO_PASSWORD:-changeme123}" 8)
_note_if_generated "MinIO password" "$MINIO_PASS" "${MINIO_PASSWORD:-changeme123}"
echo ""

# ── Zep API key (optional) ──
ZEP_KEY=$(_ask "Zep API key (optional)" "${ZEP_API_KEY:-}")
[ -n "$ZEP_KEY" ] && ok "Zep key set → MiroFish agent memory เปิดใช้งาน" \
                  || warn "ไม่มี Zep key → MiroFish LLM fallback"
echo ""

# ── Admin account ──
ADMIN_EMAIL=$(_ask "Admin email" "${ADMIN_EMAIL:-admin@osintdesk.local}")
ADMIN_PASS=$(_read_password "Admin password" "${ADMIN_PASSWORD:-changeme}" 1)
_note_if_generated "Admin password" "$ADMIN_PASS" "${ADMIN_PASSWORD:-changeme}"
ADMIN_NAME=$(_ask "Admin name" "${ADMIN_NAME:-System Admin}")

# บันทึกลง .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PASS|" "$ENV_FILE"
sed -i "s|POSTGRES_URL=.*|POSTGRES_URL=postgresql+asyncpg://osint:$PG_PASS@postgres:5432/osintdesk|" "$ENV_FILE"
sed -i "s|NEO4J_PASSWORD=.*|NEO4J_PASSWORD=$NEO4J_PASS|" "$ENV_FILE"
sed -i "s|MINIO_PASSWORD=.*|MINIO_PASSWORD=$MINIO_PASS|" "$ENV_FILE"
sed -i "s|ZEP_API_KEY=.*|ZEP_API_KEY=$ZEP_KEY|" "$ENV_FILE"
set -a; source "$ENV_FILE"; set +a

# ── 4. Build images ──────────────────────────────────────────────────
echo ""
info "Build Docker images..."
DOCKER_BUILDKIT=1 docker compose -f "$COMPOSE_FILE" build --parallel $BUILD_SERVICES 2>&1 \
  | grep -E "^(#[0-9]+ |Step|Successfully built|ERROR|error)" || true
ok "Build เสร็จ"

# ── 5. Start services ─────────────────────────────────────────────────
echo ""
info "เริ่ม services ทั้งหมด..."
docker compose -f "$COMPOSE_FILE" up -d
echo ""

# ── 6. Health checks ─────────────────────────────────────────────────
info "รอ core services พร้อมใช้งาน..."
echo ""

wait_for() {
  local name="$1" check_cmd="$2" timeout="${3:-60}" optional="${4:-false}"
  local elapsed=0 spinner=('⣾' '⣽' '⣻' '⢿' '⡿' '⣟' '⣯' '⣷') i=0
  printf "  %-24s " "$name"
  while ! eval "$check_cmd" &>/dev/null 2>&1; do
    printf "\r  %-24s %s " "$name" "${spinner[$i]}"
    i=$(( (i+1) % 8 ))
    sleep 1
    elapsed=$((elapsed+1))
    if [ "$elapsed" -ge "$timeout" ]; then
      if [ "$optional" = "true" ]; then
        printf "\r  %-24s ${YELLOW}⏭  กำลัง build ในพื้นหลัง${NC}\n" "$name"
      else
        printf "\r  %-24s ${RED}✗  timeout${NC}\n" "$name"
        return 1
      fi
      return 0
    fi
  done
  printf "\r  %-24s ${GREEN}✓  พร้อม${NC}\n" "$name"
}

# Core
wait_for "PostgreSQL"   "docker exec osint-postgres pg_isready -U ${POSTGRES_USER:-osint} -q" 60
wait_for "Redis"        "docker exec osint-redis redis-cli ping | grep -q PONG" 30
wait_for "API"          "curl -sf http://localhost:8000/health" 120
wait_for "nginx"        "curl -sf http://localhost/ -o /dev/null" 60
wait_for "Frontend"     "curl -sf http://localhost/ -o /dev/null" 180
wait_for "Neo4j"        "curl -sf http://localhost:7474 -o /dev/null" 120 true
wait_for "Meilisearch"  "curl -sf http://localhost:7700/health | grep -q available" 60

echo ""
info "รอ OSINT tool services..."
echo ""

wait_for "SpiderFoot"   "curl -sf http://localhost:5001/ -o /dev/null" 300 true
wait_for "n8n"          "curl -sf http://localhost:5678/healthz -o /dev/null" 120 true
wait_for "MiroFish"     "curl -sf http://localhost:5002/health | grep -q ok" 120 true
wait_for "Perplexica"   "curl -sf http://localhost:3002/ -o /dev/null" 120 true

echo ""

# ── 6b. Ollama — ตรวจจากในคอนเทนเนอร์ ────────────────────────────────
# ตรวจจากโฮสต์ตอบคนละคำถามกับที่ต้องการรู้: โฮสต์เข้าถึงอะไรได้ไม่ได้แปลว่า
# คอนเทนเนอร์เข้าถึงได้ ค่าที่ตั้งไว้เคยเป็น host.docker.internal ในขณะที่ Ollama
# อยู่คนละเครื่อง — โฮสต์ทดสอบผ่าน คอนเทนเนอร์ต่อไม่ติด และทุกฟีเจอร์ที่ใช้
# โมเดลตายเงียบอยู่หลายวันกว่าจะมีคนสังเกต
echo ""
info "ตรวจ Ollama จากในคอนเทนเนอร์..."
OLLAMA_IN_CONTAINER=$(docker exec osint-api sh -c \
  'curl -sf --max-time 5 "$OLLAMA_BASE_URL/api/tags" | grep -c "\"name\"" || echo 0' 2>/dev/null || echo 0)
if [ "${OLLAMA_IN_CONTAINER:-0}" -gt 0 ]; then
  ok "Ollama ตอบสนองจากในคอนเทนเนอร์ ($OLLAMA_IN_CONTAINER models)"
else
  warn "คอนเทนเนอร์ต่อ Ollama ไม่ได้ที่ $OLLAMA_URL"
  warn "ทุกฟีเจอร์ที่ใช้โมเดลจะไม่ทำงาน (brief, verify, จับคู่ประเด็น, simulation)"
  warn "ถ้า Ollama อยู่คนละเครื่อง ให้ใส่ IP ที่คอนเทนเนอร์เข้าถึงได้ ไม่ใช่ localhost"
fi

# ── 7. Database migrations ───────────────────────────────────────────
info "รัน database migrations..."
docker exec osint-api alembic -c /app/alembic.ini upgrade head 2>&1 \
  | grep -vE "^(INFO  \[alembic\]|$)" | head -10 || true
ok "Migrations เสร็จ"

# ── 8. Seed admin user ───────────────────────────────────────────────
echo ""
info "ตั้งค่า admin user..."
docker exec osint-api python -m app.seed "$ADMIN_EMAIL" "$ADMIN_PASS" 2>&1 \
  | grep -v "^$" | head -5 || true
ok "Admin: $ADMIN_EMAIL"

# ── 9. Pull Whisper model ────────────────────────────────────────────
echo ""
info "ตรวจสอบ Whisper model..."
_pull_whisper

# ── 10. Quick integration check ──────────────────────────────────────
echo ""
info "ตรวจสอบ service integration..."

TOKEN=$(curl -sf -X POST http://localhost:8000/api/v1/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_EMAIL}&password=${ADMIN_PASS}" 2>/dev/null \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -n "$TOKEN" ]; then
  HEALTH=$(curl -sf http://localhost:8000/api/v1/admin/health \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "[]")
  OK_COUNT=$(echo "$HEALTH" | grep -o '"status":"ok"' | wc -l)
  ALL_COUNT=$(echo "$HEALTH" | grep -o '"status"' | wc -l)
  echo -e "  Services: ${GREEN}${OK_COUNT}/${ALL_COUNT}${NC} green"
  echo "$HEALTH" | python3 -c "
import json, sys
try:
    for s in json.load(sys.stdin):
        if s['status'] != 'ok':
            print(f\"  \033[33m⚠\033[0m  {s['name']}: {s.get('detail','error')}\")
except: pass
" 2>/dev/null || true
else
  warn "ไม่สามารถ login เพื่อตรวจสอบได้ — ดู logs: ./deploy.sh --logs"
fi

# ── 11. แสดงสถานะสุดท้าย ─────────────────────────────────────────────
echo ""
hr
bold "  ✓ OSINT//DESK พร้อมใช้งาน"
hr
echo ""
echo -e "  ${BOLD}แอปหลัก (ผ่าน nginx):${NC}"
echo -e "  ${CYAN}OSINT//DESK UI${NC}     →  http://localhost"
echo -e "  ${CYAN}API (Swagger)${NC}      →  http://localhost:8000/docs"
echo ""
echo -e "  ${BOLD}OSINT Tools:${NC}"
echo -e "  SpiderFoot         →  http://localhost:5001"
echo -e "  MiroFish UI        →  http://localhost:5003"
echo -e "  Perplexica (AI)    →  http://localhost:3002"
echo -e "  n8n (Automation)   →  http://localhost:5678"
echo ""
echo -e "  ${BOLD}Infrastructure:${NC}"
echo -e "  Neo4j Browser      →  http://localhost:7474"
echo -e "  MinIO Console      →  http://localhost:9001"
echo ""
echo -e "  ${BOLD}Login:${NC}"
echo -e "  Email:    ${CYAN}${ADMIN_EMAIL}${NC}"
echo -e "  Password: ${CYAN}${ADMIN_PASS}${NC}"
echo ""

# Anything generated is printed once, here. A password nobody was told is the
# same as a locked door — and under --yes nobody was asked.
if [ ${#GENERATED[@]} -gt 0 ]; then
  warn "สร้างค่าลับใหม่ให้ (จดไว้ — อยู่ใน .env ด้วย):"
  for item in "${GENERATED[@]}"; do echo -e "    ${CYAN}${item}${NC}"; done
  echo ""
fi

if [ "$FIRST_INSTALL" != true ]; then
  WEAK=$(grep -cE '^(POSTGRES_PASSWORD|NEO4J_PASSWORD|MINIO_PASSWORD|MEILI_MASTER_KEY)=(changeme|changeme123|changeme_master_key)$' "$ENV_FILE" || true)
  if [ "${WEAK:-0}" -gt 0 ]; then
    warn "$WEAK รหัสผ่านยังเป็นค่าตัวอย่างจาก repo"
    warn "เปลี่ยนไม่ได้อัตโนมัติ — Postgres/Neo4j/MinIO ฝังรหัสไว้ใน volume ตอน init"
    warn "ถ้าจะเปลี่ยนต้องแก้ใน service นั้นเองก่อน แล้วค่อยแก้ .env ให้ตรงกัน"
    echo ""
  fi
fi

echo -e "  ${BOLD}ที่ทำงานจริง:${NC}"
echo -e "  api · worker-intel · frontend · nginx"
echo -e "  ${YELLOW}worker (คิว triage) และ beat ไม่มีงานแล้ว${NC} — การดึงข่าวย้ายไป Horizon"
echo ""
echo -e "  ${BOLD}Commands:${NC}"
echo -e "  ./deploy.sh --yes       ติดตั้งซ้ำโดยไม่ถามอะไร"
echo -e "  ./deploy.sh --update    git pull + rebuild + migrate"
echo -e "  ./deploy.sh --restart   โหลด .env ใหม่แล้วเริ่ม api + worker-intel + frontend"
echo -e "  ./deploy.sh --ssl       ตั้งค่า SSL (Let's Encrypt)"
echo -e "  ./deploy.sh --logs      live logs"
echo -e "  ./deploy.sh --status    สถานะ containers"
echo -e "  ./deploy.sh --down      หยุดทุก service"
echo ""
hr
