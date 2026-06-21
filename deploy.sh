#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  OSINT//DESK — One-command deploy (production)
#  ใช้งาน:
#    ./deploy.sh              # ติดตั้ง + ตั้งค่าครั้งแรก (interactive)
#    ./deploy.sh --update     # git pull + rebuild + migrate (zero-downtime)
#    ./deploy.sh --down       # หยุดทุก service
#    ./deploy.sh --restart    # restart api + worker + beat
#    ./deploy.sh --logs       # ดู live logs
#    ./deploy.sh --status     # ดูสถานะ containers
#    ./deploy.sh --ssl        # ตั้งค่า SSL (Let's Encrypt)
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

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
case "${1:-}" in
  --down)
    info "หยุด OSINT//DESK..."
    docker compose -f "$COMPOSE_FILE" down
    ok "หยุดทุก service แล้ว"
    exit 0 ;;

  --restart)
    info "Restart api + worker + worker-intel + beat..."
    docker compose -f "$COMPOSE_FILE" restart api worker worker-intel beat
    ok "restart แล้ว"
    exit 0 ;;

  --logs)
    docker compose -f "$COMPOSE_FILE" logs -f api worker worker-intel beat
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
    DOCKER_BUILDKIT=1 docker compose -f "$COMPOSE_FILE" build --parallel api worker frontend 2>&1 \
      | grep -E "^(#[0-9]+ |Step|Successfully built|ERROR|error)" || true
    ok "Build เสร็จ"
    echo ""
    info "Restart services..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps worker worker-intel beat
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

if [ ! -f "$ENV_FILE" ]; then
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

# แก้ MINIO_ENDPOINT ถ้ายังมี http:// นำหน้า
sed -i 's|^MINIO_ENDPOINT=http://|MINIO_ENDPOINT=|' "$ENV_FILE"

set -a; source "$ENV_FILE"; set +a

# ── 3. Interactive setup ─────────────────────────────────────────────
echo ""
bold "── ตั้งค่าระบบ ──────────────────────────────────────"
echo ""

# ── Ollama URL ──
CURRENT_OLLAMA="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
echo -e "  Ollama URL ${CYAN}[${CURRENT_OLLAMA}]${NC}: \c"
read -r INPUT_OLLAMA
OLLAMA_URL="${INPUT_OLLAMA:-$CURRENT_OLLAMA}"

if curl -sf --max-time 3 "${OLLAMA_URL/host.docker.internal/localhost}/api/tags" &>/dev/null; then
  MODEL_COUNT=$(curl -s "${OLLAMA_URL/host.docker.internal/localhost}/api/tags" \
    | grep -c '"name"' 2>/dev/null || echo 0)
  ok "Ollama ตอบสนอง ($MODEL_COUNT models)"
else
  warn "ไม่สามารถเชื่อมต่อ Ollama — AI features จะไม่ทำงานจนกว่า Ollama จะพร้อม"
fi
sed -i "s|OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=$OLLAMA_URL|" "$ENV_FILE"
echo ""

# ── Passwords ──
_read_password() {
  local prompt="$1" current="$2" minlen="${3:-1}" result
  while true; do
    echo -e "  ${prompt} ${CYAN}[${current}]${NC}: \c"
    read -rs result; echo ""
    result="${result:-$current}"
    if [ ${#result} -lt "$minlen" ]; then
      warn "รหัสผ่านต้องมีอย่างน้อย ${minlen} ตัวอักษร"
    else
      printf '%s' "$result"
      return
    fi
  done
}

PG_PASS=$(_read_password   "Postgres password" "${POSTGRES_PASSWORD:-changeme}" 1)
NEO4J_PASS=$(_read_password "Neo4j password   (≥8 chars)" "${NEO4J_PASSWORD:-changeme123}" 8)
MINIO_PASS=$(_read_password "MinIO password   (≥8 chars)" "${MINIO_PASSWORD:-changeme123}" 8)
echo ""

# ── Zep API key (optional) ──
CURRENT_ZEP="${ZEP_API_KEY:-}"
echo -e "  Zep API key (optional) ${CYAN}[${CURRENT_ZEP:-(ข้าม)}]${NC}: \c"
read -r INPUT_ZEP
ZEP_KEY="${INPUT_ZEP:-$CURRENT_ZEP}"
[ -n "$ZEP_KEY" ] && ok "Zep key set → MiroFish agent memory เปิดใช้งาน" \
                  || warn "ไม่มี Zep key → MiroFish LLM fallback"
echo ""

# ── Admin account ──
echo -e "  Admin email    ${CYAN}[admin@osintdesk.local]${NC}: \c"
read -r INPUT_EMAIL
ADMIN_EMAIL="${INPUT_EMAIL:-admin@osintdesk.local}"

echo -e "  Admin password ${CYAN}[changeme]${NC}: \c"
read -rs INPUT_ADMIN_PASS; echo ""
ADMIN_PASS="${INPUT_ADMIN_PASS:-changeme}"

echo -e "  Admin name     ${CYAN}[System Admin]${NC}: \c"
read -r INPUT_NAME
ADMIN_NAME="${INPUT_NAME:-System Admin}"

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
DOCKER_BUILDKIT=1 docker compose -f "$COMPOSE_FILE" build --parallel api worker frontend 2>&1 \
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
echo -e "  ${BOLD}Commands:${NC}"
echo -e "  ./deploy.sh --update    git pull + rebuild + migrate"
echo -e "  ./deploy.sh --restart   restart api + worker + worker-intel"
echo -e "  ./deploy.sh --ssl       ตั้งค่า SSL (Let's Encrypt)"
echo -e "  ./deploy.sh --logs      live logs"
echo -e "  ./deploy.sh --status    สถานะ containers"
echo -e "  ./deploy.sh --down      หยุดทุก service"
echo ""
hr
