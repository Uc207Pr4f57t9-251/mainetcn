# 舞萌 DX Token 自动捕获器

一个通过 VPN 代理自动捕获微信公众号 OAuth Token 的 Android 应用。

## 📋 项目简介

本应用基于 [maiObserver](https://github.com/bakapiano/maimaiDX-android) 的 VPN 实现，专门用于自动捕获舞萌 DX 国服的认证 Token（`_t` 和 `userId`），无需手动抓包。

### 核心功能

- ✅ 系统级 VPN 拦截 HTTP/HTTPS 流量
- ✅ 自动识别 OAuth 认证流程
- ✅ 智能提取响应头中的 Set-Cookie
- ✅ 支持多种捕获来源（OAuth 回调、maimai 主页等）
- ✅ 本地安全存储 Token 历史记录
- ✅ 一键复制 Token 到剪贴板

## 🎯 使用场景

适用于需要使用舞萌 DX 国服 API 的场景：
- 使用 [mainetcn](https://github.com/Astrian/mainetcn) 查询成绩
- 开发自动传分工具
- 数据分析和可视化

## 📱 系统要求

- Android 7.0 (API 24) 或更高版本
- 已安装微信
- 已关注「舞萌 DX」微信公众号

## 🚀 快速开始

### 安装

1. 下载最新的 APK 文件
2. 允许安装未知来源应用
3. 安装并打开应用

### 使用步骤

1. **启动代理**
   - 点击「启动代理」按钮
   - 授权 VPN 权限（Android 系统弹窗）

2. **访问公众号**
   - 打开微信
   - 进入「舞萌 DX」公众号
   - 点击底部菜单「我的记录」

3. **等待捕获**
   - 应用会自动拦截 HTTP 流量
   - 检测到 Token 后会显示通知
   - VPN 自动停止

4. **复制 Token**
   - 点击「复制全部」获取 JSON 格式
   - 或分别复制 `_t` 和 `userId`

### 示例输出

```json
{
  "ult": "12c4b77a644b9e88a14ab3957aea7703",
  "userId": "1646862433816015"
}
```

## 🔧 技术实现

### 架构设计

```
用户操作
  ↓
VPN 服务启动
  ↓
拦截所有 HTTP 流量
  ↓
识别 wahlap.com 请求
  ↓
解析 HTTP 请求/响应
  ↓
提取 Set-Cookie 头
  ↓
保存 Token
```

### 核心组件

#### 1. VPN 服务层
- **LocalVpnService**: Android VPN 服务
- **TcpProxyServer**: TCP 代理服务器
- **DnsProxy**: DNS 代理（域名欺骗）
- **NAT 会话管理**: 端口映射和流量路由

#### 2. HTTP 拦截层
- **HttpCapturerTunnel**: HTTP 流量捕获
- **HttpRequestParser**: HTTP 请求解析
- **HttpResponseParser**: HTTP 响应解析（提取 Set-Cookie）

#### 3. Token 提取层
- **TokenExtractor**: Token 提取核心逻辑
- **TokenStorage**: 本地持久化存储
- **MaimaiToken**: Token 数据模型

#### 4. UI 层
- **MainActivity**: 主界面
- **简洁的用户提示**
- **实时日志显示**

### 技术栈

- **语言**: Kotlin + Java
- **最低 SDK**: 24 (Android 7.0)
- **目标 SDK**: 34 (Android 14)
- **依赖库**:
  - AndroidX (Core, AppCompat, Material)
  - Kotlin Coroutines
  - Gson (JSON 序列化)
  - NanoHTTPD (可选的 HTTP 服务器)

## 🔍 工作原理

### HTTP 响应头捕获

**关键技术点**：拦截 HTTP 响应的 `Set-Cookie` 头

```
微信访问: https://maimai.wahlap.com/maimai-mobile/home/
                  ↓
     VPN 拦截 TCP 数据包
                  ↓
     解析 HTTP 响应
                  ↓
     提取 Set-Cookie 头:
       Set-Cookie: _t=xxx; expires=...; path=/
       Set-Cookie: userId=yyy; path=/; HttpOnly
                  ↓
     保存到 SharedPreferences
```

### OAuth 认证流程

1. 用户打开微信公众号
2. 重定向到微信 OAuth 授权页面
3. 用户授权后回调到:
   ```
   http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx?code=...
   ```
4. 服务器设置 Cookie 并重定向到:
   ```
   https://maimai.wahlap.com/maimai-mobile/home/
   ```
5. 应用在第 4 步的响应中捕获 Token

### 为什么 Set-Cookie 会在响应头中？

- 用户第一次访问需要 OAuth 认证
- 认证成功后，服务器通过 **HTTP 响应头的 Set-Cookie** 设置认证信息
- 这些 Cookie 包含 `_t`（访问令牌）和 `userId`（用户 ID）
- **关键**：即使后续请求使用 HTTPS，OAuth 回调和重定向过程中可能有 HTTP 响应

## ⚠️ 注意事项

### 安全性

- ✅ 所有数据本地处理，不上传服务器
- ✅ Token 加密存储在应用私有目录
- ⚠️  Token 相当于账号密码，请勿泄露
- ⚠️  使用后建议在微信重新登录以刷新 Token

### 隐私保护

- 仅拦截 `wahlap.com` 域名的流量
- 其他应用的流量不受影响
- VPN 服务在捕获成功后自动停止
- 可随时手动停止 VPN

### Token 有效期

- Token 可能在以下情况失效：
  - 在微信中重新访问公众号
  - 长时间未使用（服务器过期）
  - 其他设备登录

- 失效后重新运行本应用即可获取新 Token

## 📖 开发说明

### 构建项目

```bash
# 克隆项目
git clone <repository-url>
cd android

# 使用 Android Studio 打开项目
# 或使用命令行构建
./gradlew assembleDebug

# 生成的 APK 位于
# app/build/outputs/apk/debug/app-debug.apk
```

### 项目结构

```
android/
├── app/
│   ├── src/main/
│   │   ├── java/com/maimai/tokencapture/
│   │   │   ├── network/
│   │   │   │   ├── vpn/           # VPN 核心实现
│   │   │   │   │   ├── core/      # VPN 服务、TCP 代理
│   │   │   │   │   ├── tcpip/     # TCP/IP 栈
│   │   │   │   │   ├── dns/       # DNS 代理
│   │   │   │   │   └── tunnel/    # HTTP 流量捕获
│   │   │   │   ├── crawler/       # Token 提取
│   │   │   │   └── server/        # HTTP 服务器（可选）
│   │   │   ├── ui/                # 用户界面
│   │   │   └── utils/             # 工具类
│   │   ├── res/                   # Android 资源
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
├── build.gradle.kts
└── settings.gradle.kts
```

### 关键代码修改点

如需自定义，重点关注以下文件：

1. **HttpCapturerTunnel.java**
   - 修改 HTTP 拦截逻辑
   - 添加自定义的 URL 匹配规则

2. **TokenExtractor.kt**
   - 修改 Token 提取逻辑
   - 添加额外的验证规则

3. **TcpProxyServer.java**
   - 修改流量重定向规则
   - 添加域名过滤

## 🐛 故障排查

### Token 未捕获

**可能原因**：
1. Token 在请求头而非响应头
2. 使用了 HTTPS 加密（无法解密）
3. Cookie 通过 JavaScript 设置

**解决方案**：
- 查看 Logcat 日志确认流量是否被拦截
- 确保访问了 maimai 主页（不只是公众号首页）
- 尝试多次访问「我的记录」

### VPN 连接失败

**可能原因**：
- 其他 VPN 应用正在运行
- 系统 VPN 设置冲突

**解决方案**：
- 关闭其他 VPN 应用
- 清除应用数据后重试

### 应用崩溃

**可能原因**：
- 权限不足
- VPN 服务异常

**解决方案**：
- 检查 VPN 权限是否授予
- 查看 Logcat 日志获取详细错误信息

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 待改进功能

- [ ] 完整的 UI 界面（当前是基础实现）
- [ ] Token 有效性验证（调用 API 测试）
- [ ] Token 过期提醒
- [ ] 多账号管理
- [ ] 数据导出功能
- [ ] 深色模式适配

## 📄 许可证

MIT License

本项目基于 [maiObserver](https://github.com/bakapiano/maimaiDX-android) 的 VPN 实现。

## ⚖️ 免责声明

- 本应用仅供学习和研究使用
- 不保证 Token 获取成功率
- 使用本应用产生的任何问题由用户自行承担
- 与华立、SEGA 等公司无任何关系
- 请遵守相关服务条款

## 🙏 致谢

- [maiObserver](https://github.com/bakapiano/maimaiDX-android) - VPN 实现参考
- [mainetcn](https://github.com/Astrian/mainetcn) - API 库参考
- [MaimaiData 技术文档](VPN代理和公众号数据获取功能分析.md) - 架构分析

---

**注意**：本项目处于开发阶段，UI 界面为基础实现。建议在 Android Studio 中完善后再编译使用。

## 📞 支持

如有问题，请提交 [Issue](../../issues)。
