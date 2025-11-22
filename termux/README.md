# 舞萌DX Token 自动抓取工具 (Termux版)

在已root的Android设备上自动抓取舞萌DX的认证Token。

## 功能

- 自动启动HTTPS代理服务器
- 捕获舞萌相关请求的认证信息
- 自动保存Token到本地文件
- 可选：自动上传Token到服务器

## 前置要求

1. **已Root的Android设备**
2. **已安装Termux** - [下载地址](https://f-droid.org/packages/com.termux/)
3. **Python 3.x**

## 安装

### 方式1：一键安装

```bash
# 在Termux中运行
cd ~/mainetcn/termux
bash install.sh
```

### 方式2：手动安装

```bash
# 更新包管理器
pkg update

# 安装Python
pkg install python

# 安装mitmproxy
pip install mitmproxy requests

# 安装iptables（可选，用于透明代理模式）
pkg install iptables
```

## 安装CA证书（重要！）

首次使用需要安装mitmproxy的CA证书：

1. 在Termux中运行：`mitmdump`
2. 在手机浏览器访问：`http://mitm.it`
3. 点击 **Android** 下载证书
4. 在 **设置 -> 安全 -> 加密与凭据 -> 安装证书** 中安装
5. 按 Ctrl+C 停止mitmdump

## 使用方法

### 方式1：简易模式（推荐）

不需要root权限，但需要手动配置WiFi代理。

```bash
bash simple_capture.sh
```

然后：
1. 打开手机 **设置 -> WLAN -> 当前网络 -> 代理**
2. 选择 **手动**
3. 服务器填：`127.0.0.1`
4. 端口填：`8888`
5. 保存后打开 **微信 -> 舞萌DX公众号 -> 我的记录**
6. 脚本会自动捕获Token

### 方式2：透明代理模式

需要root权限，但无需配置系统代理。

```bash
# 获取root权限
tsu
# 或
sudo su

# 运行脚本
bash start_capture.sh
```

脚本会：
1. 自动配置iptables重定向流量
2. 启动透明代理
3. 打开微信舞萌链接
4. 自动捕获Token

## 输出

Token会保存到：`~/maimai_token.json`

格式：
```json
{
  "ult": "xxx...",
  "userId": "12345678",
  "authToken": "xxx...",
  "captureTime": "2025-11-23T01:00:00"
}
```

## 上传到服务器（可选）

编辑 `maimai_capture.py`，设置上传地址：

```python
CONFIG = {
    "upload_url": "https://your-server.com/api/token",
    # ...
}
```

## 故障排除

### 证书问题

如果微信提示"网络不安全"：
- 确保已正确安装CA证书
- 在设置中将证书设为"受信任"
- 部分系统需要在 **开发者选项** 中启用用户CA证书

### 无法捕获到Token

- 检查代理是否正常运行
- 确认手机流量通过代理
- 查看日志：`cat ~/maimai_capture.log`

### iptables报错

- 确保有root权限
- 尝试使用简易模式（不需要iptables）

## 文件说明

| 文件 | 说明 |
|------|------|
| `install.sh` | 安装脚本 |
| `simple_capture.sh` | 简易模式启动脚本 |
| `start_capture.sh` | 透明代理模式启动脚本 |
| `maimai_capture.py` | mitmproxy addon，核心抓包逻辑 |

## 安全提示

- Token等同于账号密码，请勿泄露
- 建议使用完毕后清除代理设置
- 定期更新Token
