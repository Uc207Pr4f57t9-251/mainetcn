#!/bin/bash
#
# 舞萌DX Token 简易抓取脚本
# 使用HTTP代理模式（不需要iptables/透明代理）
#
# 使用方法：
# 1. 运行此脚本启动代理
# 2. 在手机设置中配置WiFi代理为 127.0.0.1:8888
# 3. 打开微信舞萌公众号
# 4. 脚本会自动捕获token
#

PROXY_PORT=8888
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADDON_SCRIPT="$SCRIPT_DIR/maimai_capture.py"
TOKEN_FILE="$HOME/maimai_token.json"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "=========================================="
echo "  舞萌DX Token 简易抓取工具"
echo "=========================================="
echo ""

# 检查mitmproxy
if ! command -v mitmproxy &> /dev/null; then
    echo -e "${YELLOW}[提示]${NC} 未安装mitmproxy，正在安装..."
    pip install mitmproxy
fi

echo -e "${BLUE}[INFO]${NC} 启动代理服务器 (端口: $PROXY_PORT)"
echo ""
echo -e "${YELLOW}>>> 请按以下步骤操作 <<<${NC}"
echo ""
echo "  1. 打开手机 设置 -> WLAN -> 当前网络 -> 代理"
echo "  2. 选择 '手动'"
echo "  3. 服务器: 127.0.0.1"
echo "  4. 端口: $PROXY_PORT"
echo "  5. 保存后打开微信 -> 舞萌DX公众号 -> 我的记录"
echo ""
echo -e "${GREEN}[等待]${NC} 代理已启动，等待连接..."
echo "       按 Ctrl+C 退出"
echo ""

# 启动mitmproxy
mitmproxy \
    --listen-port $PROXY_PORT \
    --set ssl_insecure=true \
    -s "$ADDON_SCRIPT"

echo ""
echo -e "${BLUE}[INFO]${NC} 代理已停止"

# 检查是否捕获到token
if [ -f "$TOKEN_FILE" ]; then
    echo ""
    echo -e "${GREEN}[SUCCESS]${NC} Token已捕获:"
    echo "=========================================="
    cat "$TOKEN_FILE"
    echo ""
    echo "=========================================="
fi
