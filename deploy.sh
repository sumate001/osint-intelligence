#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  OSINT//DESK — One-command deploy
#  ใช้งาน:
#    ./deploy.sh              # ติดตั้ง + ตั้งค่าครั้งแรก (interactive)
#    ./deploy.sh --update     # อัปเดต code โดยไม่ถามรหัสผ่านซ้ำ
#    ./deploy.sh --down       # หยุดทุก service
#    ./deploy.sh --restart    # restart api + worker
#    ./deploy.sh --logs       # ดู live logs
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

COMPOSE_FILE="docker-compose.dev.yml"
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
    info "Restart api + worker + beat..."
    docker compose -f "$COMPOSE_FILE" restart api worker beat
    ok "restart แล้ว"
    exit 0 ;;
  --logs)
    docker compose -f "$COMPOSE_FILE" logs -f api worker beat
    exit 0 ;;
  --status)
    docker compose -f "$COMPOSE_FILE" ps
    exit 0 ;;
  --update|--fresh|"")
    : ;;  # ดำเนินการหลักต่อ
  *)
    echo "ใช้งาน: $0 [--update|--down|--restart|--logs|--status]"
    exit 1 ;;
esac

UPDATE_MODE=false
[ "${1:-}" = "--update" ] && UPDATE_MODE=true

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
ok "docker $(docker --version | grep -oP '[\d.]+' | head -1) + compose $(docker compose version --short 2>/dev/null || echo "ok")"

# ── 2. ตรวจ / ตั้งค่า .env ──────────────────────────────────────────
echo ""
info "ตั้งค่า environment..."

if [ ! -f "$ENV_FILE" ] && [ ! -f "$ENV_EXAMPLE" ]; then
  err "ไม่พบ .env.example — รันจากภายใน repo root"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  # generate SECRET_KEY อัตโนมัติ
  SECRET=$(openssl rand -hex 32)
  sed -i "s/change_this_to_a_random_secret_key/$SECRET/" "$ENV_FILE"
  ok "สร้าง .env พร้อม SECRET_KEY"
else
  ok ".env มีอยู่แล้ว"
fi

# โหลด .env เพื่ออ่านค่า
set -a; source "$ENV_FILE"; set +a

# ── 3. Interactive setup (ครั้งแรกเท่านั้น) ─────────────────────────
if [ "$UPDATE_MODE" = false ]; then
  echo ""
  bold "── ตั้งค่าระบบ ──────────────────────────────────────"
  echo ""

  # ── Ollama URL ──
  CURRENT_OLLAMA="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
  echo -e "  Ollama URL ${CYAN}[${CURRENT_OLLAMA}]${NC}: \c"
  read -r INPUT_OLLAMA
  OLLAMA_URL="${INPUT_OLLAMA:-$CURRENT_OLLAMA}"

  # ทดสอบ Ollama
  if curl -sf --max-time 3 "${OLLAMA_URL/host.docker.internal/localhost}/api/tags" &>/dev/null; then
    ok "Ollama ตอบสนองที่ $OLLAMA_URL"
    # แสดง models ที่มี
    MODELS=$(curl -s --max-time 3 "${OLLAMA_URL/host.docker.internal/localhost}/api/tags" \
      | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//' | tr '\n' ' ' 2>/dev/null || echo "")
    if [ -n "$MODELS" ]; then
      echo "    models: $MODELS"
    fi
  else
    warn "ไม่สามารถเชื่อมต่อ Ollama ที่ $OLLAMA_URL"
    warn "ระบบจะยังขึ้นได้ แต่ AI features จะไม่ทำงานจนกว่า Ollama จะพร้อม"
  fi
  sed -i "s|OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=$OLLAMA_URL|" "$ENV_FILE"

  echo ""

  # ── Passwords ──
  echo -e "  Postgres password ${CYAN}[${POSTGRES_PASSWORD:-changeme}]${NC}: \c"
  read -rs INPUT_PG; echo ""
  PG_PASS="${INPUT_PG:-${POSTGRES_PASSWORD:-changeme}}"

  echo -e "  Neo4j password    ${CYAN}[${NEO4J_PASSWORD:-changeme123}]${NC}: \c"
  read -rs INPUT_NEO4J; echo ""
  NEO4J_PASS="${INPUT_NEO4J:-${NEO4J_PASSWORD:-changeme123}}"

  echo -e "  MinIO password    ${CYAN}[${MINIO_PASSWORD:-changeme123}]${NC}: \c"
  read -rs INPUT_MINIO; echo ""
  MINIO_PASS="${INPUT_MINIO:-${MINIO_PASSWORD:-changeme123}}"

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

  # โหลดค่าใหม่
  set -a; source "$ENV_FILE"; set +a
else
  ADMIN_EMAIL=""
  ADMIN_PASS=""
  ADMIN_NAME=""
fi

# ── 4. Build images ──────────────────────────────────────────────────
echo ""
info "Build Docker images..."
docker compose -f "$COMPOSE_FILE" build --parallel 2>&1 \
  | grep -E "^(#[0-9]+ |Step|Successfully|ERROR|error)" || true
ok "Build เสร็จ"

# ── 5. Start services ────────────────────────────────────────────────
echo ""
info "เริ่ม services ทั้งหมด..."
docker compose -f "$COMPOSE_FILE" up -d
echo ""

# ── 6. Health checks ─────────────────────────────────────────────────
info "รอ services พร้อมใช้งาน..."
echo ""

wait_for() {
  local name="$1"
  local check_cmd="$2"
  local timeout="${3:-60}"
  local elapsed=0
  local spinner=('⣾' '⣽' '⣻' '⢿' '⡿' '⣟' '⣯' '⣷')
  local i=0

  printf "  %-20s " "$name"
  while ! eval "$check_cmd" &>/dev/null; do
    printf "\r  %-20s %s " "$name" "${spinner[$i]}"
    i=$(( (i+1) % 8 ))
    sleep 1
    elapsed=$((elapsed+1))
    if [ $elapsed -ge $timeout ]; then
      printf "\r  %-20s ${RED}timeout${NC}\n" "$name"
      return 1
    fi
  done
  printf "\r  %-20s ${GREEN}✓ พร้อม${NC}\n" "$name"
}

wait_for "PostgreSQL" \
  "docker exec osint-postgres pg_isready -U osint -q" 60

wait_for "Redis" \
  "docker exec osint-redis redis-cli ping | grep -q PONG" 30

wait_for "API" \
  "curl -sf http://localhost:8000/health" 90

wait_for "Frontend" \
  "curl -sf http://localhost:3000 -o /dev/null" 120

# Neo4j optional (ใช้เวลานาน)
wait_for "Neo4j" \
  "docker exec osint-neo4j wget -qO- http://localhost:7474 -q" 90 || \
  warn "Neo4j ยังไม่พร้อม — graph features อาจใช้งานไม่ได้ชั่วคราว"

echo ""

# ── 7. Database migrations ───────────────────────────────────────────
info "รัน database migrations..."
docker exec osint-api alembic -c /app/alembic.ini upgrade head 2>&1 \
  | grep -E "(Running upgrade|No migration)" || true
ok "Migrations เสร็จ"

# ── 8. Seed admin user ───────────────────────────────────────────────
echo ""
info "ตั้งค่า admin user..."
if [ -n "${ADMIN_EMAIL:-}" ]; then
  docker exec osint-api python -m app.seed "$ADMIN_EMAIL" "$ADMIN_PASS"
  ok "Admin user พร้อม"
else
  docker exec osint-api python -m app.seed 2>&1 | grep -E "(✓|มีอยู่)" || true
  ok "Admin user ตรวจสอบแล้ว"
fi

# ── 9. แสดงสถานะ ─────────────────────────────────────────────────────
echo ""
hr
bold "  ✓ OSINT//DESK พร้อมใช้งาน"
hr
echo ""
echo -e "  ${BOLD}URL หลัก:${NC}"
echo -e "  ${CYAN}Frontend${NC}        →  http://localhost:3000"
echo -e "  ${CYAN}API (Swagger)${NC}   →  http://localhost:8000/docs"
echo ""
echo -e "  ${BOLD}เครื่องมือ:${NC}"
echo -e "  Neo4j UI        →  http://localhost:7474"
echo -e "  MinIO Console   →  http://localhost:9001"
echo -e "  SearXNG         →  http://localhost:8080"
echo -e "  Grafana         →  http://localhost:3030"
echo ""
if [ -n "${ADMIN_EMAIL:-}" ]; then
  echo -e "  ${BOLD}Login:${NC}"
  echo -e "  Email:    ${CYAN}${ADMIN_EMAIL}${NC}"
  echo -e "  Password: ${CYAN}${ADMIN_PASS}${NC}"
  echo ""
fi
echo -e "  ${BOLD}Commands:${NC}"
echo -e "  ./deploy.sh --update    อัปเดต code (ไม่ถามรหัสผ่าน)"
echo -e "  ./deploy.sh --restart   restart api + worker"
echo -e "  ./deploy.sh --logs      ดู live logs"
echo -e "  ./deploy.sh --down      หยุดทุก service"
echo ""
hr
