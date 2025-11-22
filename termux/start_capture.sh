#!/bin/bash
#
# 舞萌DX Token 自动抓取脚本
# 在已root的Android设备的Termux中运行
#
# 功能：
# 1. 启动mitmproxy透明代理
# 2. 配置iptables流量重定向
# 3. 打开微信舞萌公众号链接
# 4. 自动捕获并保存token
#

set -e

# ==================== 配置 ====================
PROXY_PORT=8080
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADDON_SCRIPT="$SCRIPT_DIR/maimai_capture.py"
TOKEN_FILE="$HOME/maimai_token.json"
LOG_FILE="$HOME/maimai_capture.log"

# 舞萌公众号入口链接
MAIMAI_URL="https://tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ==================== 检查环境 ====================
check_root() {
    if [ "$(id -u)" != "0" ]; then
        log_error "需要root权限运行此脚本"
        log_info "请使用: sudo $0 或 tsu"
        exit 1
    fi
    log_success "Root权限检查通过"
}

check_dependencies() {
    log_info "检查依赖..."

    # 检查mitmproxy
    if ! command -v mitmdump &> /dev/null; then
        log_error "未安装 mitmproxy"
        log_info "请运行: pip install mitmproxy"
        exit 1
    fi
    log_success "mitmproxy 已安装"

    # 检查iptables
    if ! command -v iptables &> /dev/null; then
        log_error "未安装 iptables"
        log_info "请运行: pkg install iptables"
        exit 1
    fi
    log_success "iptables 已安装"

    # 检查addon脚本
    if [ ! -f "$ADDON_SCRIPT" ]; then
        log_error "找不到addon脚本: $ADDON_SCRIPT"
        exit 1
    fi
    log_success "Addon脚本已找到"
}

# ==================== iptables 配置 ====================
setup_iptables() {
    log_info "配置iptables透明代理..."

    # 清理旧规则
    iptables -t nat -D OUTPUT -p tcp --dport 80 -j REDIRECT --to-port $PROXY_PORT 2>/dev/null || true
    iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-port $PROXY_PORT 2>/dev/null || true

    # 添加新规则 - 重定向HTTP/HTTPS流量到mitmproxy
    # 排除本地流量
    iptables -t nat -A OUTPUT -p tcp -d 127.0.0.0/8 -j RETURN
    iptables -t nat -A OUTPUT -p tcp --dport 80 -j REDIRECT --to-port $PROXY_PORT
    iptables -t nat -A OUTPUT -p tcp --dport 443 -j REDIRECT --to-port $PROXY_PORT

    log_success "iptables规则已配置"
}

cleanup_iptables() {
    log_info "清理iptables规则..."
    iptables -t nat -D OUTPUT -p tcp --dport 80 -j REDIRECT --to-port $PROXY_PORT 2>/dev/null || true
    iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-port $PROXY_PORT 2>/dev/null || true
    iptables -t nat -D OUTPUT -p tcp -d 127.0.0.0/8 -j RETURN 2>/dev/null || true
    log_success "iptables规则已清理"
}

# ==================== 代理启动 ====================
start_proxy() {
    log_info "启动mitmproxy透明代理 (端口: $PROXY_PORT)..."

    # 在后台启动mitmdump
    mitmdump \
        --mode transparent \
        --listen-port $PROXY_PORT \
        --set block_global=false \
        --set ssl_insecure=true \
        -s "$ADDON_SCRIPT" \
        > "$LOG_FILE" 2>&1 &

    PROXY_PID=$!
    echo $PROXY_PID > /tmp/maimai_proxy.pid

    sleep 2

    if kill -0 $PROXY_PID 2>/dev/null; then
        log_success "mitmproxy已启动 (PID: $PROXY_PID)"
    else
        log_error "mitmproxy启动失败，查看日志: $LOG_FILE"
        exit 1
    fi
}

stop_proxy() {
    if [ -f /tmp/maimai_proxy.pid ]; then
        PID=$(cat /tmp/maimai_proxy.pid)
        if kill -0 $PID 2>/dev/null; then
            log_info "停止mitmproxy (PID: $PID)..."
            kill $PID 2>/dev/null || true
            rm /tmp/maimai_proxy.pid
            log_success "mitmproxy已停止"
        fi
    fi
}

# ==================== 打开微信链接 ====================
open_wechat_link() {
    log_info "正在打开微信舞萌公众号..."

    # 使用am命令打开链接（会自动在微信中打开）
    am start -a android.intent.action.VIEW -d "$MAIMAI_URL" 2>/dev/null || {
        log_warn "无法自动打开链接"
        log_info "请手动打开微信 -> 舞萌DX公众号 -> 我的记录"
    }

    log_info "请在微信中完成操作..."
}

# ==================== 等待Token ====================
wait_for_token() {
    log_info "等待Token捕获... (按 Ctrl+C 退出)"

    local timeout=120  # 2分钟超时
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if [ -f "$TOKEN_FILE" ]; then
            # 检查文件是否在最近10秒内修改
            local file_age=$(( $(date +%s) - $(stat -c %Y "$TOKEN_FILE" 2>/dev/null || echo 0) ))
            if [ $file_age -lt 10 ]; then
                echo ""
                log_success "Token已捕获!"
                echo ""
                echo "=========================================="
                cat "$TOKEN_FILE"
                echo ""
                echo "=========================================="
                echo ""
                log_info "Token已保存到: $TOKEN_FILE"
                return 0
            fi
        fi

        printf "\r[等待中] 已等待 %d 秒..." $elapsed
        sleep 1
        ((elapsed++))
    done

    echo ""
    log_warn "等待超时，未能捕获Token"
    return 1
}

# ==================== 清理函数 ====================
cleanup() {
    echo ""
    log_info "正在清理..."
    stop_proxy
    cleanup_iptables
    log_success "清理完成"
}

# ==================== 主流程 ====================
main() {
    echo "=========================================="
    echo "  舞萌DX Token 自动抓取工具"
    echo "=========================================="
    echo ""

    # 设置退出清理
    trap cleanup EXIT

    # 检查环境
    check_root
    check_dependencies

    echo ""
    log_info "开始抓取流程..."
    echo ""

    # 配置并启动
    setup_iptables
    start_proxy

    echo ""
    log_info "代理已就绪，准备打开微信..."
    sleep 2

    # 打开微信链接
    open_wechat_link

    # 等待Token
    wait_for_token

    echo ""
    log_success "抓取完成!"
}

# 运行
main "$@"
