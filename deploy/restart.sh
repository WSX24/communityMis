#!/usr/bin/env bash
# ============================================================================
# 邻帮 (community-mis) 一键重启脚本
# 用法: sudo bash deploy/restart.sh
# ============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------
# 1. 检查是否为 root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  log_error "请使用 sudo 运行此脚本: sudo bash deploy/restart.sh"
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. 服务列表（按启动顺序排列）
# ---------------------------------------------------------------------------
SERVICES=(
  "community-mis-backend.service"
  "community-mis-frontend.service"
  "community-mis-maintenance.timer"
  "community-mis-backup.timer"
)
NGINX_SERVICE="nginx"

# 可选：如需一并重载 nginx，设置 RESTART_NGINX=true
RESTART_NGINX="${RESTART_NGINX:-false}"
# 可选：重启后是否执行健康检查
RUN_HEALTH_CHECK="${RUN_HEALTH_CHECK:-true}"
# 健康检查重试参数
MAX_RETRIES=10
RETRY_DELAY=2

# ---------------------------------------------------------------------------
# 3. 重启所有服务
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "  邻帮 (community-mis) 服务重启"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

for svc in "${SERVICES[@]}"; do
  log_info "正在重启 ${svc} ..."
  if systemctl restart "${svc}"; then
    log_ok "${svc} 已重启"
  else
    log_error "${svc} 重启失败！"
    exit 1
  fi
done

if [[ "${RESTART_NGINX}" == "true" ]]; then
  log_info "正在重载 nginx ..."
  if nginx -t > /dev/null 2>&1; then
    systemctl reload nginx
    log_ok "nginx 已重载"
  else
    log_error "nginx 配置语法错误，请先修复！"
    nginx -t
    exit 1
  fi
else
  log_warn "已跳过 nginx 重载 (RESTART_NGINX=false)"
fi

echo ""

# ---------------------------------------------------------------------------
# 4. 检查所有服务状态
# ---------------------------------------------------------------------------
log_info "检查服务状态..."

ALL_SERVICES=("${SERVICES[@]}")
[[ "${RESTART_NGINX}" == "true" ]] && ALL_SERVICES+=("${NGINX_SERVICE}")

FAILED=()
for svc in "${ALL_SERVICES[@]}"; do
  state=$(systemctl is-active "${svc}" 2>/dev/null || echo "unknown")
  case "${state}" in
    active)
      log_ok "${svc} → ${state}"
      ;;
    *)
      log_error "${svc} → ${state}"
      FAILED+=("${svc}")
      ;;
  esac
done

echo ""

if [[ ${#FAILED[@]} -gt 0 ]]; then
  log_error "以下服务状态异常: ${FAILED[*]}"
  echo ""
  log_warn "查看失败服务的日志："
  for svc in "${FAILED[@]}"; do
    echo "  journalctl -u ${svc} -n 30 --no-pager"
  done
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. 健康检查
# ---------------------------------------------------------------------------
if [[ "${RUN_HEALTH_CHECK}" != "true" ]]; then
  log_warn "已跳过健康检查 (RUN_HEALTH_CHECK=false)"
  echo ""
  log_info "全部服务已重启，可手动验证:"
  echo "  curl -fsS http://127.0.0.1:3001/api/health"
  echo "  curl -fsS http://127.0.0.1:3001/api/ready"
  echo "  curl -fsS http://127.0.0.1:5173/frontend-health"
  exit 0
fi

log_info "执行健康检查..."

# 加载环境变量以获取端口号（如果 env 文件存在则加载，不存在则使用默认值）
ENV_FILE="/etc/community-mis/community-mis.env"
BACKEND_PORT=3001
FRONTEND_PORT=5173

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a && . "${ENV_FILE}" && set +a
  BACKEND_PORT="${BACKEND_PORT:-3001}"
  FRONTEND_PORT="${FRONTEND_PORT:-5173}"
fi

# 5a. 后端健康检查 (轻量)
retry=0
while [[ $retry -lt $MAX_RETRIES ]]; do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" > /dev/null 2>&1; then
    log_ok "后端健康检查通过 (端口 ${BACKEND_PORT})"
    break
  fi
  retry=$((retry + 1))
  if [[ $retry -lt $MAX_RETRIES ]]; then
    log_warn "后端尚未就绪，${RETRY_DELAY}s 后重试 (${retry}/${MAX_RETRIES})..."
    sleep "${RETRY_DELAY}"
  else
    log_error "后端健康检查失败，请查看日志: journalctl -u community-mis-backend.service -n 50 --no-pager"
    exit 1
  fi
done

# 5b. 后端就绪检查 (完整)
retry=0
while [[ $retry -lt $MAX_RETRIES ]]; do
  READY_JSON=$(curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/ready" 2>/dev/null || echo "")
  READY_STATUS=$(echo "${READY_JSON}" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "unknown")
  if [[ "${READY_STATUS}" == "ready" ]]; then
    log_ok "后端就绪检查通过 (status=ready)"
    break
  fi
  retry=$((retry + 1))
  if [[ $retry -lt $MAX_RETRIES ]]; then
    if [[ "${READY_STATUS}" == "not_ready" ]]; then
      log_warn "后端返回 not_ready，详细信息:"
      echo "${READY_JSON}" | python3 -m json.tool 2>/dev/null || echo "${READY_JSON}"
    fi
    log_warn "后端尚未就绪 (${READY_STATUS})，${RETRY_DELAY}s 后重试 (${retry}/${MAX_RETRIES})..."
    sleep "${RETRY_DELAY}"
  else
    log_error "后端就绪检查失败 (status=${READY_STATUS})"
    echo "${READY_JSON}" | python3 -m json.tool 2>/dev/null || echo "${READY_JSON}"
    exit 1
  fi
done

# 5c. 前端健康检查
retry=0
while [[ $retry -lt $MAX_RETRIES ]]; do
  if curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/frontend-health" > /dev/null 2>&1; then
    log_ok "前端健康检查通过 (端口 ${FRONTEND_PORT})"
    break
  fi
  retry=$((retry + 1))
  if [[ $retry -lt $MAX_RETRIES ]]; then
    log_warn "前端尚未就绪，${RETRY_DELAY}s 后重试 (${retry}/${MAX_RETRIES})..."
    sleep "${RETRY_DELAY}"
  else
    log_error "前端健康检查失败，请查看日志: journalctl -u community-mis-frontend.service -n 50 --no-pager"
    exit 1
  fi
done

echo ""
log_info "=============================================="
log_ok  "全部服务重启成功，健康检查通过！"
log_info "=============================================="
echo ""
log_info "验证信息:"
echo "  后端健康: http://127.0.0.1:${BACKEND_PORT}/api/health"
echo "  后端就绪: http://127.0.0.1:${BACKEND_PORT}/api/ready"
echo "  前端健康: http://127.0.0.1:${FRONTEND_PORT}/frontend-health"
echo ""
