#!/bin/bash
#
# Termux 环境安装脚本
# 安装舞萌DX Token抓取工具所需的依赖
#

echo "=========================================="
echo "  舞萌DX Token抓取工具 - 安装脚本"
echo "=========================================="
echo ""

# 更新包管理器
echo "[1/5] 更新包管理器..."
pkg update -y

# 安装Python
echo "[2/5] 安装Python..."
pkg install python -y

# 安装依赖
echo "[3/5] 安装Python依赖..."
pip install mitmproxy requests

# 安装iptables（可选，用于透明代理模式）
echo "[4/5] 安装iptables（可选）..."
pkg install iptables -y || echo "iptables安装失败，将只能使用简易模式"

# 安装mitmproxy CA证书
echo "[5/5] 生成mitmproxy证书..."
mitmdump --version > /dev/null 2>&1

# 设置脚本权限
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$SCRIPT_DIR"/*.sh
chmod +x "$SCRIPT_DIR"/*.py

echo ""
echo "=========================================="
echo "  安装完成!"
echo "=========================================="
echo ""
echo "接下来需要安装mitmproxy的CA证书到手机："
echo ""
echo "  1. 运行: mitmdump"
echo "  2. 在手机浏览器访问: http://mitm.it"
echo "  3. 下载并安装Android证书"
echo "  4. 在设置中信任该证书"
echo ""
echo "然后运行以下命令开始抓包："
echo ""
echo "  简易模式（推荐）: bash $SCRIPT_DIR/simple_capture.sh"
echo "  透明代理模式:     sudo bash $SCRIPT_DIR/start_capture.sh"
echo ""
