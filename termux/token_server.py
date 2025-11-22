#!/usr/bin/env python3
"""
Token 接收服务器

在你的服务器上运行此脚本，接收从手机上传的Token。

使用方法：
    python3 token_server.py [port]

例如：
    python3 token_server.py 5000
"""

import json
import os
import sys
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

# 配置
TOKEN_FILE = "received_tokens.json"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5000


class TokenHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/api/token":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            try:
                token_data = json.loads(body.decode('utf-8'))
                token_data['receivedAt'] = datetime.now().isoformat()
                token_data['clientIP'] = self.client_address[0]

                # 保存token
                self.save_token(token_data)

                # 打印到控制台
                print("\n" + "=" * 50)
                print("收到新Token!")
                print(f"  时间: {token_data['receivedAt']}")
                print(f"  来源: {token_data['clientIP']}")
                print(f"  _t: {token_data.get('ult', 'N/A')[:20]}...")
                print(f"  userId: {token_data.get('userId', 'N/A')}")
                print("=" * 50 + "\n")

                # 返回成功
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())

            except Exception as e:
                print(f"处理失败: {e}")
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/api/token":
            # 获取最新token
            try:
                with open(TOKEN_FILE, 'r') as f:
                    tokens = json.load(f)
                    if tokens:
                        latest = tokens[-1]
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(latest, indent=2).encode())
                        return
            except:
                pass

            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "No token found"}).encode())
        elif self.path == "/":
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            html = """
            <html>
            <head><title>Token Server</title></head>
            <body>
                <h1>舞萌DX Token Server</h1>
                <p>POST /api/token - 上传token</p>
                <p>GET /api/token - 获取最新token</p>
            </body>
            </html>
            """
            self.wfile.write(html.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def save_token(self, token_data):
        tokens = []
        if os.path.exists(TOKEN_FILE):
            try:
                with open(TOKEN_FILE, 'r') as f:
                    tokens = json.load(f)
            except:
                tokens = []

        tokens.append(token_data)

        # 只保留最近100个
        if len(tokens) > 100:
            tokens = tokens[-100:]

        with open(TOKEN_FILE, 'w') as f:
            json.dump(tokens, f, indent=2, ensure_ascii=False)

    def log_message(self, format, *args):
        pass  # 禁用默认日志


def main():
    print("=" * 50)
    print("  舞萌DX Token 接收服务器")
    print("=" * 50)
    print(f"\n监听端口: {PORT}")
    print(f"接收地址: http://your-server:{PORT}/api/token")
    print(f"Token保存: {TOKEN_FILE}")
    print("\n等待连接...\n")

    server = HTTPServer(('0.0.0.0', PORT), TokenHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")


if __name__ == "__main__":
    main()
