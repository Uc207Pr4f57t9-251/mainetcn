# 舞萌 DX OAuth 自动抓包应用开发计划

## 📋 项目概述

**目标**：开发一个 Android 应用，通过 VPN 代理自动捕获微信公众号 OAuth 认证流程，获取舞萌 DX 的有效 Token（`_t` 和 `userId`），并提供数据查询功能。

**参考项目**：
- MaimaiData (技术文档分析)
- maiObserver (现有代码库)

**核心需求**：
1. ✅ 实现本地 VPN 服务拦截网络流量
2. ✅ 捕获微信 OAuth 认证流程
3. ✅ 自动提取 `_t` 和 `userId` Token
4. ✅ 提供友好的用户界面
5. ✅ 支持数据查询和展示

---

## 🔍 技术调查总结

### 现有 maiObserver 代码库分析

**优势**：
- ✅ **完整的 VPN 实现**：已有 LocalVpnService、TcpProxyServer、DNS 代理
- ✅ **HTTP 流量捕获**：HttpCapturerTunnel 可以拦截 HTTP 请求
- ✅ **OAuth 集成**：WechatCrawler 已实现微信认证流程
- ✅ **本地 HTTP 服务器**：HttpServer (8284) 和 HttpRedirectServer (9457)
- ✅ **成熟的架构**：Repository 模式、Room 数据库、Retrofit API 客户端

**需要修改/增强**：
- ⚠️ **硬编码问题**：`wahlap.com` 重定向到 `192.168.1.3:3000`（需要修改为本地服务器）
- ⚠️ **Token 提取逻辑**：需要增强 HTTP 响应头的 Set-Cookie 提取
- ⚠️ **用户界面**：需要简化为专门的 Token 获取界面
- ⚠️ **安全性**：禁用了 SSL 验证（需要评估是否保留）

---

## 🎯 实施计划

### 阶段 1：基础架构搭建（1-2 天）

#### 1.1 创建新项目或 Fork maiObserver

**选项 A**：基于 maiObserver Fork（推荐）
```
优势：
- 可以复用完整的 VPN 实现
- 可以复用 HTTP 服务器
- 可以复用 OAuth 流程

缺点：
- 需要清理不需要的代码（歌曲数据库、查分器等）
```

**选项 B**：创建全新项目
```
优势：
- 代码更简洁
- 专注于核心功能

缺点：
- 需要重写 VPN 实现（2000+ 行代码）
- 需要重写 TCP/IP 栈
```

**推荐方案**：Fork maiObserver 并简化

#### 1.2 项目结构调整

保留的模块：
```
app/src/main/java/com/yourpackage/
├── network/
│   ├── vpn/              ← 保留完整 VPN 实现
│   │   ├── core/         (LocalVpnService, TcpProxyServer, DnsProxy)
│   │   ├── tcpip/        (IPHeader, TCPHeader, UDPHeader)
│   │   ├── tunnel/       (HttpCapturerTunnel, RawTunnel)
│   │   └── socket/       (NatSession, NatSessionManager)
│   ├── server/           ← 保留 HTTP 服务器
│   │   ├── HttpServer.java
│   │   └── HttpRedirectServer.java
│   └── crawler/          ← 保留并修改
│       ├── WechatCrawler.java
│       └── TokenExtractor.kt (新增)
├── ui/                   ← 简化 UI
│   ├── MainActivity.kt
│   └── TokenDisplayActivity.kt (新增)
├── db/                   ← 简化数据库（仅存储 Token 历史）
│   ├── TokenEntity.kt
│   └── TokenDao.kt
└── utils/
    ├── TokenStorage.kt   (新增)
    └── ClipboardUtil.kt  (新增)
```

移除的模块：
```
❌ 歌曲数据库相关代码（SongDataEntity, ChartEntity 等）
❌ diving-fish.com API 集成
❌ 成绩上传功能
❌ 查分器相关 UI
```

---

### 阶段 2：核心功能实现（3-5 天）

#### 2.1 修改 VPN 流量拦截逻辑

**文件**：`network/vpn/core/TcpProxyServer.java`

**当前代码**（第 143 行）：
```java
if (destAddress.getPort() == 80 && destAddress.getHostName().endsWith("wahlap.com")) {
    destAddress = new InetSocketAddress("192.168.1.3", 3000);
    remoteTunnel.connect(destAddress);
}
```

**修改为**：
```java
if (destAddress.getPort() == 80 &&
    (destAddress.getHostName().endsWith("wahlap.com") ||
     destAddress.getHostName().endsWith("tgk-wcaime.wahlap.com"))) {
    // 重定向到本地 HttpRedirectServer (9457端口)
    destAddress = new InetSocketAddress("127.0.0.1", 9457);
    remoteTunnel.connect(destAddress);
}
```

**原因**：将流量重定向到本地服务器，而不是依赖外部地址。

---

#### 2.2 增强 HTTP 流量捕获

**文件**：`network/vpn/tunnel/HttpCapturerTunnel.java`

**当前代码**（第 55-75 行）：
```java
@Override
protected void beforeSend(ByteBuffer buffer) throws Exception {
    String body = new String(buffer.array());
    if (!body.contains("HTTP")) return;

    String[] lines = body.split("\r\n");
    String path = lines[0].split(" ")[1];
    String host = extractHost(lines);
    String url = "http://" + host + path;

    // 捕获 OAuth 回调
    if (url.startsWith("http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx")) {
        Log.d(TAG, "Auth request caught!");
        CrawlerCaller.INSTANCE.fetchData(url);
    }
}
```

**增强为**：
```java
@Override
protected void beforeSend(ByteBuffer buffer) throws Exception {
    String requestData = new String(buffer.array(), 0, buffer.position());

    // 解析 HTTP 请求
    HttpRequest httpRequest = HttpRequestParser.parse(requestData);

    if (httpRequest == null || !httpRequest.isValid()) return;

    String url = httpRequest.getFullUrl();
    Log.d(TAG, "HTTP Request captured: " + url);

    // 捕获关键 URL
    if (url.contains("tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx")) {
        Log.d(TAG, "OAuth callback detected!");
        TokenExtractor.INSTANCE.captureOAuthCallback(url, httpRequest.getHeaders());
    } else if (url.contains("maimai.wahlap.com/maimai-mobile/home") ||
               url.contains("maimai.wahlap.com/maimai-mobile/playerData")) {
        Log.d(TAG, "Maimai page detected!");
        TokenExtractor.INSTANCE.captureMaimaiPage(url, httpRequest.getHeaders());
    }
}

@Override
protected void afterReceive(ByteBuffer buffer) throws Exception {
    String responseData = new String(buffer.array(), 0, buffer.position());

    // 解析 HTTP 响应
    HttpResponse httpResponse = HttpResponseParser.parse(responseData);

    if (httpResponse == null || !httpResponse.isValid()) return;

    // ⭐ 关键：提取响应头中的 Set-Cookie
    Map<String, String> cookies = httpResponse.extractSetCookies();

    if (cookies.containsKey("_t") || cookies.containsKey("userId")) {
        Log.d(TAG, "Token cookies detected in response!");
        TokenExtractor.INSTANCE.extractTokens(cookies);
    }
}
```

---

#### 2.3 创建 Token 提取器

**新文件**：`network/crawler/TokenExtractor.kt`

```kotlin
package com.yourpackage.network.crawler

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object TokenExtractor {
    private const val TAG = "TokenExtractor"

    data class MaimaiToken(
        val ult: String,      // _t cookie
        val userId: String,   // userId cookie
        val capturedAt: Long = System.currentTimeMillis()
    )

    private var listener: TokenExtractionListener? = null
    private val capturedTokens = mutableListOf<MaimaiToken>()

    interface TokenExtractionListener {
        fun onTokenExtracted(token: MaimaiToken)
        fun onExtractionFailed(reason: String)
    }

    fun setListener(listener: TokenExtractionListener) {
        this.listener = listener
    }

    /**
     * 从 HTTP 响应的 Set-Cookie 头中提取 Token
     */
    fun extractTokens(cookies: Map<String, String>) {
        val ult = cookies["_t"]
        val userId = cookies["userId"]

        Log.d(TAG, "Extracting tokens from cookies...")
        Log.d(TAG, "_t found: ${ult != null}")
        Log.d(TAG, "userId found: ${userId != null}")

        if (ult != null && userId != null) {
            val token = MaimaiToken(ult, userId)
            capturedTokens.add(token)

            CoroutineScope(Dispatchers.Main).launch {
                listener?.onTokenExtracted(token)
            }

            // 保存到本地存储
            TokenStorage.saveToken(token)

            Log.i(TAG, "✅ Token successfully extracted!")
            Log.i(TAG, "   _t: ${ult.take(20)}...")
            Log.i(TAG, "   userId: $userId")
        } else {
            val reason = when {
                ult == null && userId == null -> "Both _t and userId missing"
                ult == null -> "_t cookie missing"
                else -> "userId cookie missing"
            }

            Log.w(TAG, "⚠️ Token extraction incomplete: $reason")

            CoroutineScope(Dispatchers.Main).launch {
                listener?.onExtractionFailed(reason)
            }
        }
    }

    /**
     * 捕获 OAuth 回调 URL
     */
    fun captureOAuthCallback(url: String, headers: Map<String, String>) {
        Log.d(TAG, "OAuth callback URL captured: $url")

        // 提取请求中的 Cookie（可能已包含 Token）
        val cookieHeader = headers["Cookie"] ?: headers["cookie"]
        if (cookieHeader != null) {
            val cookies = parseCookieHeader(cookieHeader)
            extractTokens(cookies)
        }
    }

    /**
     * 捕获 maimai 页面访问
     */
    fun captureMaimaiPage(url: String, headers: Map<String, String>) {
        Log.d(TAG, "Maimai page accessed: $url")

        val cookieHeader = headers["Cookie"] ?: headers["cookie"]
        if (cookieHeader != null) {
            val cookies = parseCookieHeader(cookieHeader)
            extractTokens(cookies)
        }
    }

    /**
     * 解析 Cookie 头
     * 格式: "_t=value1; userId=value2; other=value3"
     */
    private fun parseCookieHeader(cookieHeader: String): Map<String, String> {
        return cookieHeader.split("; ").mapNotNull { cookie ->
            val parts = cookie.split("=", limit = 2)
            if (parts.size == 2) {
                parts[0] to parts[1]
            } else null
        }.toMap()
    }

    fun getLatestToken(): MaimaiToken? {
        return capturedTokens.lastOrNull()
    }

    fun getAllTokens(): List<MaimaiToken> {
        return capturedTokens.toList()
    }
}
```

---

#### 2.4 创建 HTTP 请求/响应解析器

**新文件**：`network/vpn/tunnel/HttpRequestParser.kt`

```kotlin
package com.yourpackage.network.vpn.tunnel

data class HttpRequest(
    val method: String,
    val path: String,
    val version: String,
    val headers: Map<String, String>,
    val host: String
) {
    fun getFullUrl(): String {
        return "http://$host$path"
    }

    fun isValid(): Boolean {
        return method.isNotEmpty() && host.isNotEmpty()
    }
}

object HttpRequestParser {
    fun parse(rawData: String): HttpRequest? {
        if (!rawData.contains("HTTP/")) return null

        val lines = rawData.split("\r\n")
        if (lines.isEmpty()) return null

        // 解析请求行: GET /path HTTP/1.1
        val requestLine = lines[0].split(" ")
        if (requestLine.size < 3) return null

        val method = requestLine[0]
        val path = requestLine[1]
        val version = requestLine[2]

        // 解析请求头
        val headers = mutableMapOf<String, String>()
        for (i in 1 until lines.size) {
            val line = lines[i]
            if (line.isEmpty()) break

            val colonIndex = line.indexOf(":")
            if (colonIndex > 0) {
                val key = line.substring(0, colonIndex).trim()
                val value = line.substring(colonIndex + 1).trim()
                headers[key] = value
            }
        }

        val host = headers["Host"] ?: headers["host"] ?: ""

        return HttpRequest(method, path, version, headers, host)
    }
}
```

**新文件**：`network/vpn/tunnel/HttpResponseParser.kt`

```kotlin
package com.yourpackage.network.vpn.tunnel

data class HttpResponse(
    val version: String,
    val statusCode: Int,
    val statusMessage: String,
    val headers: Map<String, List<String>>
) {
    fun extractSetCookies(): Map<String, String> {
        val setCookies = headers["Set-Cookie"] ?: headers["set-cookie"] ?: return emptyMap()

        return setCookies.mapNotNull { cookieHeader ->
            // 格式: "_t=value; expires=...; path=/"
            val parts = cookieHeader.split(";")
            if (parts.isEmpty()) return@mapNotNull null

            val cookiePair = parts[0].split("=", limit = 2)
            if (cookiePair.size == 2) {
                cookiePair[0].trim() to cookiePair[1].trim()
            } else null
        }.toMap()
    }

    fun isValid(): Boolean {
        return statusCode in 100..599
    }
}

object HttpResponseParser {
    fun parse(rawData: String): HttpResponse? {
        if (!rawData.startsWith("HTTP/")) return null

        val lines = rawData.split("\r\n")
        if (lines.isEmpty()) return null

        // 解析状态行: HTTP/1.1 200 OK
        val statusLine = lines[0].split(" ", limit = 3)
        if (statusLine.size < 3) return null

        val version = statusLine[0]
        val statusCode = statusLine[1].toIntOrNull() ?: return null
        val statusMessage = statusLine[2]

        // 解析响应头（支持多个同名头）
        val headers = mutableMapOf<String, MutableList<String>>()
        for (i in 1 until lines.size) {
            val line = lines[i]
            if (line.isEmpty()) break

            val colonIndex = line.indexOf(":")
            if (colonIndex > 0) {
                val key = line.substring(0, colonIndex).trim()
                val value = line.substring(colonIndex + 1).trim()

                headers.getOrPut(key) { mutableListOf() }.add(value)
            }
        }

        return HttpResponse(version, statusCode, statusMessage, headers)
    }
}
```

---

#### 2.5 创建 Token 存储管理器

**新文件**：`utils/TokenStorage.kt`

```kotlin
package com.yourpackage.utils

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.yourpackage.network.crawler.TokenExtractor

object TokenStorage {
    private const val PREF_NAME = "maimai_tokens"
    private const val KEY_CURRENT_TOKEN = "current_token"
    private const val KEY_TOKEN_HISTORY = "token_history"

    private lateinit var prefs: SharedPreferences
    private val gson = Gson()

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    fun saveToken(token: TokenExtractor.MaimaiToken) {
        // 保存为当前 Token
        prefs.edit()
            .putString(KEY_CURRENT_TOKEN, gson.toJson(token))
            .apply()

        // 添加到历史记录
        val history = getTokenHistory().toMutableList()
        history.add(token)

        // 只保留最近 10 个
        val recentHistory = history.takeLast(10)

        prefs.edit()
            .putString(KEY_TOKEN_HISTORY, gson.toJson(recentHistory))
            .apply()
    }

    fun getCurrentToken(): TokenExtractor.MaimaiToken? {
        val json = prefs.getString(KEY_CURRENT_TOKEN, null) ?: return null
        return try {
            gson.fromJson(json, TokenExtractor.MaimaiToken::class.java)
        } catch (e: Exception) {
            null
        }
    }

    fun getTokenHistory(): List<TokenExtractor.MaimaiToken> {
        val json = prefs.getString(KEY_TOKEN_HISTORY, null) ?: return emptyList()
        return try {
            gson.fromJson(json, Array<TokenExtractor.MaimaiToken>::class.java).toList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun clearTokens() {
        prefs.edit()
            .remove(KEY_CURRENT_TOKEN)
            .remove(KEY_TOKEN_HISTORY)
            .apply()
    }
}
```

---

### 阶段 3：用户界面实现（2-3 天）

#### 3.1 主界面设计

**文件**：`ui/MainActivity.kt`

**功能**：
1. ✅ 显示 VPN 状态（已启动/未启动）
2. ✅ 启动/停止 VPN 按钮
3. ✅ 显示使用说明
4. ✅ 显示最新捕获的 Token
5. ✅ 复制 Token 到剪贴板
6. ✅ 查看 Token 历史记录

**界面布局**：
```xml
activity_main.xml:

┌─────────────────────────────────────┐
│  舞萌 DX Token 自动获取器            │
├─────────────────────────────────────┤
│                                     │
│  [VPN 状态]                          │
│  ● 未启动                            │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  [启动代理]                     │ │
│  └───────────────────────────────┘ │
│                                     │
│  使用说明:                           │
│  1. 点击「启动代理」授权 VPN          │
│  2. 打开微信「舞萌 DX」公众号         │
│  3. 点击「我的记录」                  │
│  4. 等待自动捕获 Token               │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 当前 Token:                    │ │
│  │ _t: (点击复制)                 │ │
│  │ userId: (点击复制)             │ │
│  │                                │ │
│  │ [复制全部] [查看历史] [清除]    │ │
│  └───────────────────────────────┘ │
│                                     │
│  日志:                              │
│  ┌───────────────────────────────┐ │
│  │ > VPN 服务已启动                │ │
│  │ > HTTP 服务器监听 8284...       │ │
│  │ > 等待 OAuth 流量...            │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

**代码框架**：
```kotlin
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var vpnServiceStarted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        TokenStorage.init(this)
        setupUI()
        setupTokenListener()
    }

    private fun setupUI() {
        // 启动代理按钮
        binding.btnStartProxy.setOnClickListener {
            if (vpnServiceStarted) {
                stopVpnService()
            } else {
                requestVpnPermission()
            }
        }

        // 复制按钮
        binding.btnCopyUlt.setOnClickListener {
            TokenStorage.getCurrentToken()?.let { token ->
                copyToClipboard("_t", token.ult)
            }
        }

        binding.btnCopyUserId.setOnClickListener {
            TokenStorage.getCurrentToken()?.let { token ->
                copyToClipboard("userId", token.userId)
            }
        }

        binding.btnCopyAll.setOnClickListener {
            TokenStorage.getCurrentToken()?.let { token ->
                val fullToken = """
                    {
                      "ult": "${token.ult}",
                      "userId": "${token.userId}"
                    }
                """.trimIndent()
                copyToClipboard("Token JSON", fullToken)
            }
        }

        // 查看历史
        binding.btnHistory.setOnClickListener {
            startActivity(Intent(this, TokenHistoryActivity::class.java))
        }

        // 显示当前 Token
        displayCurrentToken()
    }

    private fun setupTokenListener() {
        TokenExtractor.setListener(object : TokenExtractor.TokenExtractionListener {
            override fun onTokenExtracted(token: TokenExtractor.MaimaiToken) {
                runOnUiThread {
                    displayCurrentToken()
                    showSuccessNotification()
                    addLog("✅ Token 已成功捕获！")

                    // 停止 VPN 服务
                    stopVpnService()
                }
            }

            override fun onExtractionFailed(reason: String) {
                runOnUiThread {
                    addLog("⚠️ Token 提取失败: $reason")
                }
            }
        })
    }

    private fun requestVpnPermission() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            startActivityForResult(intent, REQUEST_VPN_PERMISSION)
        } else {
            startVpnService()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_VPN_PERMISSION && resultCode == RESULT_OK) {
            startVpnService()
        }
    }

    private fun startVpnService() {
        startService(Intent(this, LocalVpnService::class.java))
        startService(Intent(this, HttpServerService::class.java))

        vpnServiceStarted = true
        updateVpnStatus(true)
        addLog("✅ VPN 代理已启动")
        addLog("✅ HTTP 服务器已启动")
        addLog("📱 请打开微信「舞萌 DX」公众号")
    }

    private fun stopVpnService() {
        LocalVpnService.IsRunning = false
        stopService(Intent(this, LocalVpnService::class.java))
        stopService(Intent(this, HttpServerService::class.java))

        vpnServiceStarted = false
        updateVpnStatus(false)
        addLog("⏹️ VPN 代理已停止")
    }

    private fun displayCurrentToken() {
        val token = TokenStorage.getCurrentToken()
        if (token != null) {
            binding.tvUlt.text = token.ult
            binding.tvUserId.text = token.userId
            binding.tokenContainer.visibility = View.VISIBLE
        } else {
            binding.tokenContainer.visibility = View.GONE
        }
    }

    private fun copyToClipboard(label: String, text: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard.setPrimaryClip(clip)

        Toast.makeText(this, "$label 已复制到剪贴板", Toast.LENGTH_SHORT).show()
    }

    private fun addLog(message: String) {
        val timestamp = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val logMessage = "[$timestamp] $message"

        binding.tvLogs.append(logMessage + "\n")

        // 自动滚动到底部
        binding.scrollViewLogs.post {
            binding.scrollViewLogs.fullScroll(View.FOCUS_DOWN)
        }
    }

    private fun updateVpnStatus(isRunning: Boolean) {
        if (isRunning) {
            binding.tvVpnStatus.text = "● 已启动"
            binding.tvVpnStatus.setTextColor(Color.GREEN)
            binding.btnStartProxy.text = "停止代理"
        } else {
            binding.tvVpnStatus.text = "● 未启动"
            binding.tvVpnStatus.setTextColor(Color.GRAY)
            binding.btnStartProxy.text = "启动代理"
        }
    }

    companion object {
        private const val REQUEST_VPN_PERMISSION = 100
    }
}
```

---

#### 3.2 Token 历史界面

**文件**：`ui/TokenHistoryActivity.kt`

```kotlin
class TokenHistoryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val history = TokenStorage.getTokenHistory()

        // 使用 RecyclerView 显示历史记录
        // 每条记录显示时间、Token 预览、复制按钮
    }
}
```

---

### 阶段 4：测试与优化（2-3 天）

#### 4.1 功能测试

**测试清单**：
- [ ] VPN 服务启动/停止
- [ ] HTTP 服务器正常监听
- [ ] DNS 代理正常工作
- [ ] HTTP 流量正确拦截
- [ ] OAuth 回调捕获
- [ ] Token 提取（响应头 Set-Cookie）
- [ ] Token 存储和读取
- [ ] 剪贴板复制功能
- [ ] UI 更新和日志显示

#### 4.2 调试工具

**增加详细日志**：
```kotlin
object DebugLogger {
    private const val TAG = "MaimaiTokenCapture"

    fun logHttpRequest(method: String, url: String, headers: Map<String, String>) {
        Log.d(TAG, "════════ HTTP REQUEST ════════")
        Log.d(TAG, "$method $url")
        Log.d(TAG, "Headers:")
        headers.forEach { (k, v) ->
            Log.d(TAG, "  $k: ${v.take(50)}${if (v.length > 50) "..." else ""}")
        }
        Log.d(TAG, "═══════════════════════════════")
    }

    fun logHttpResponse(statusCode: Int, headers: Map<String, List<String>>) {
        Log.d(TAG, "════════ HTTP RESPONSE ════════")
        Log.d(TAG, "Status: $statusCode")
        Log.d(TAG, "Headers:")
        headers.forEach { (k, values) ->
            values.forEach { v ->
                Log.d(TAG, "  $k: $v")
            }
        }
        Log.d(TAG, "═══════════════════════════════")
    }
}
```

#### 4.3 错误处理

**常见问题及处理**：

1. **VPN 权限被拒绝**：
   ```kotlin
   if (resultCode != RESULT_OK) {
       AlertDialog.Builder(this)
           .setTitle("需要 VPN 权限")
           .setMessage("此应用需要 VPN 权限来拦截网络流量以捕获 Token")
           .setPositiveButton("重试") { _, _ -> requestVpnPermission() }
           .setNegativeButton("取消", null)
           .show()
   }
   ```

2. **Token 未捕获**：
   ```kotlin
   // 设置超时提醒（2 分钟）
   Handler(Looper.getMainLooper()).postDelayed({
       if (TokenStorage.getCurrentToken() == null) {
           addLog("⚠️ 超过 2 分钟未捕获到 Token")
           addLog("请确保:")
           addLog("  1. 已在微信中打开公众号")
           addLog("  2. 点击了「我的记录」")
           addLog("  3. 页面已完全加载")
       }
   }, 120_000)
   ```

3. **Set-Cookie 未出现在响应头**：
   ```kotlin
   // 如果响应头中没有 Set-Cookie，尝试从请求头中提取
   if (!responseCookies.containsKey("_t")) {
       val requestCookies = extractCookiesFromRequest()
       if (requestCookies.containsKey("_t")) {
           addLog("ℹ️ 从请求头中找到 Token（可能已存在）")
           TokenExtractor.extractTokens(requestCookies)
       }
   }
   ```

---

### 阶段 5：打包与部署（1 天）

#### 5.1 应用签名

```bash
# 生成签名密钥
keytool -genkey -v -keystore maimai-token-capture.jks \
  -alias maimai_key -keyalg RSA -keysize 2048 -validity 10000

# 在 build.gradle 中配置
android {
    signingConfigs {
        release {
            storeFile file("maimai-token-capture.jks")
            storePassword "your_password"
            keyAlias "maimai_key"
            keyPassword "your_password"
        }
    }
}
```

#### 5.2 构建 APK

```bash
./gradlew assembleRelease
```

#### 5.3 使用说明文档

创建 `USER_GUIDE.md`：
```markdown
# 舞萌 DX Token 自动获取器 - 使用指南

## 安装
1. 下载 APK 文件
2. 允许安装未知来源应用
3. 安装并打开应用

## 使用步骤
1. 点击「启动代理」按钮
2. 授权 VPN 权限
3. 打开微信
4. 进入「舞萌 DX」公众号
5. 点击底部「我的记录」
6. 等待页面加载
7. 应用会自动捕获 Token 并显示
8. 点击复制按钮保存 Token

## 常见问题
...
```

---

## 📊 时间估算

| 阶段 | 任务 | 预估时间 |
|------|------|---------|
| 1 | 基础架构搭建 | 1-2 天 |
| 2 | 核心功能实现 | 3-5 天 |
| 3 | 用户界面实现 | 2-3 天 |
| 4 | 测试与优化 | 2-3 天 |
| 5 | 打包与部署 | 1 天 |
| **总计** | | **9-14 天** |

---

## 🎯 关键成功因素

### 1. HTTP 响应头捕获

**最关键的部分**：确保能够捕获 HTTP 响应中的 `Set-Cookie` 头。

**实现要点**：
- ✅ 在 `HttpCapturerTunnel` 中增加 `afterReceive()` 方法
- ✅ 解析完整的 HTTP 响应（包括状态行、响应头、响应体）
- ✅ 提取所有 `Set-Cookie` 头（可能有多个）
- ✅ 正确解析 Cookie 格式（包括过期时间、路径等）

### 2. VPN 流量路由

**挑战**：确保所有 `wahlap.com` 的流量都经过本地服务器。

**解决方案**：
- ✅ 修改 `TcpProxyServer` 的重定向逻辑
- ✅ 确保 DNS 解析正确（可能需要 DNS 欺骗）
- ✅ 测试不同的 URL 路径（`/home/`, `/playerData/`, `/record/` 等）

### 3. Cookie 时效性

**注意**：OAuth 回调可能使用 HTTPS 而非 HTTP。

**应对方案**：
- ✅ 如果回调是 HTTPS，VPN 无法直接解密（除非实现 MITM）
- ✅ 可以尝试捕获**后续的 HTTP 请求**（maimai 服务器使用 HTTP）
- ✅ 在用户访问 maimai 页面时捕获请求头中的 Cookie

---

## 🔒 安全与隐私考虑

### 1. 权限声明

**AndroidManifest.xml**：
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- 不需要存储权限 -->
```

### 2. 数据隔离

- ✅ Token 仅存储在应用私有目录
- ✅ 使用 SharedPreferences 的 MODE_PRIVATE
- ✅ 不上传任何数据到远程服务器
- ✅ 所有处理都在本地完成

### 3. 用户告知

**首次启动提示**：
```
本应用会创建 VPN 连接以拦截网络流量。

用途：
- 仅用于捕获舞萌 DX 公众号的认证 Token
- 不会记录其他应用的数据
- 不会上传任何信息到服务器

您的隐私完全受保护。
```

---

## 🚀 后续增强功能（可选）

1. **自动测试 Token**
   - 捕获后自动调用 maimai API 验证 Token 有效性

2. **Token 过期提醒**
   - 检测 Token 是否过期
   - 提醒用户重新捕获

3. **数据查询功能**
   - 集成 mainetcn 的查询功能
   - 直接在应用内查看成绩

4. **导出功能**
   - 导出 Token 为 JSON 文件
   - 支持分享到其他应用

5. **多账号支持**
   - 管理多个玩家的 Token
   - 快速切换账号

---

## 📝 总结

这个实施计划基于：
1. ✅ **maiObserver 的成熟 VPN 实现**（可直接复用）
2. ✅ **技术文档的详细流程分析**（理解原理）
3. ✅ **简化的功能范围**（专注 Token 捕获）

**关键优势**：
- 不需要从零开始实现 VPN
- 有完整的代码参考
- 技术方案已验证可行

**主要工作**：
- 修改流量拦截逻辑
- 增强 HTTP 响应解析
- 简化用户界面
- 完善 Token 提取和存储

**预期成果**：
一个简洁、易用、可靠的舞萌 DX Token 自动获取工具。
