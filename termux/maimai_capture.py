#!/usr/bin/env python3
"""
舞萌DX Token 抓取 - mitmproxy addon

此脚本作为mitmproxy的addon运行，自动捕获舞萌相关请求的认证信息
"""

import json
import os
import re
import time
import requests
from mitmproxy import http, ctx
from datetime import datetime

# 配置
CONFIG = {
    # Token保存路径
    "token_file": os.path.expanduser("~/maimai_token.json"),
    # 服务器上传地址（可选）
    "upload_url": None,  # 例如: "https://your-server.com/api/token"
    # 目标域名
    "target_domains": [
        "maimai.wahlap.com",
        "tgk-wcaime.wahlap.com"
    ]
}

class MaimaiTokenCapture:
    def __init__(self):
        self.captured_token = None
        self.capture_time = None
        ctx.log.info("舞萌DX Token抓取插件已加载")

    def response(self, flow: http.HTTPFlow) -> None:
        """处理响应，提取token"""

        # 检查是否是目标域名
        host = flow.request.host
        if not any(domain in host for domain in CONFIG["target_domains"]):
            return

        url = flow.request.pretty_url
        ctx.log.info(f"[舞萌] 捕获请求: {url[:80]}...")

        token_data = {
            "ult": None,
            "userId": None,
            "authToken": None,
            "captureTime": datetime.now().isoformat(),
            "captureUrl": url
        }

        # 从请求Cookie中提取
        req_cookies = flow.request.cookies
        if "_t" in req_cookies:
            token_data["ult"] = req_cookies["_t"]
            ctx.log.info(f"[舞萌] 从请求中提取 _t: {token_data['ult'][:16]}...")
        if "userId" in req_cookies:
            token_data["userId"] = req_cookies["userId"]
            ctx.log.info(f"[舞萌] 从请求中提取 userId: {token_data['userId']}")

        # 从响应Set-Cookie中提取
        if flow.response:
            for cookie in flow.response.cookies.fields:
                name = cookie[0]
                value = cookie[1]
                if name == "_t":
                    token_data["ult"] = value
                    ctx.log.info(f"[舞萌] 从响应中提取 _t: {value[:16]}...")
                elif name == "userId":
                    token_data["userId"] = value
                    ctx.log.info(f"[舞萌] 从响应中提取 userId: {value}")

        # 从URL中提取authToken
        if "?t=" in url or "&t=" in url:
            match = re.search(r'[?&]t=([A-Fa-f0-9]+)', url)
            if match:
                token_data["authToken"] = match.group(1)
                ctx.log.info(f"[舞萌] 从URL中提取 authToken: {token_data['authToken'][:16]}...")

        # 从重定向Location中提取
        if flow.response and flow.response.status_code in [301, 302]:
            location = flow.response.headers.get("Location", "")
            if "?t=" in location:
                match = re.search(r'[?&]t=([A-Fa-f0-9]+)', location)
                if match:
                    token_data["authToken"] = match.group(1)
                    ctx.log.info(f"[舞萌] 从重定向中提取 authToken: {token_data['authToken'][:16]}...")

        # 检查是否获取到有效token
        if token_data["ult"] and token_data["userId"]:
            # 验证userId格式（应该是数字）
            if token_data["userId"].isdigit():
                self.captured_token = token_data
                self.capture_time = time.time()
                self.save_token(token_data)
                self.upload_token(token_data)
                ctx.log.info("=" * 50)
                ctx.log.info("[舞萌] Token 捕获成功!")
                ctx.log.info(f"  _t: {token_data['ult'][:20]}...")
                ctx.log.info(f"  userId: {token_data['userId']}")
                if token_data["authToken"]:
                    ctx.log.info(f"  authToken: {token_data['authToken'][:20]}...")
                ctx.log.info("=" * 50)

    def save_token(self, token_data):
        """保存token到本地文件"""
        try:
            with open(CONFIG["token_file"], "w") as f:
                json.dump(token_data, f, indent=2, ensure_ascii=False)
            ctx.log.info(f"[舞萌] Token已保存到: {CONFIG['token_file']}")
        except Exception as e:
            ctx.log.error(f"[舞萌] 保存Token失败: {e}")

    def upload_token(self, token_data):
        """上传token到服务器（如果配置了上传地址）"""
        if not CONFIG["upload_url"]:
            return

        try:
            response = requests.post(
                CONFIG["upload_url"],
                json=token_data,
                timeout=10,
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 200:
                ctx.log.info(f"[舞萌] Token已上传到服务器")
            else:
                ctx.log.warn(f"[舞萌] 上传失败: {response.status_code}")
        except Exception as e:
            ctx.log.error(f"[舞萌] 上传Token失败: {e}")


# mitmproxy addon 入口
addons = [MaimaiTokenCapture()]
