# MaimaiData项目代理和公众号数据获取功能详细分析

## 项目概述

**MaimaiData** 是一款为舞萌DX玩家开发的Android应用，主要功能包括歌曲信息检索、谱面查看、rating计算和**自动传分**。其中最核心的技术亮点是**通过VPN代理捕获微信公众号OAuth认证流程并自动抓取游戏成绩数据上传到水鱼查分器**。

---

## 一、整体架构设计

### 1.1 核心技术栈
- **Android VPN Service** - 实现本地VPN拦截网络流量
- **本地HTTP服务器** (NanoHTTPD) - 提供认证入口
- **OkHttp** - HTTP客户端，用于爬取和上传数据
- **微信OAuth认证** - 通过公众号登录华立wahlap平台
- **协程(Coroutines)** - 异步处理爬虫和上传任务

### 1.2 关键组件关系图

```
用户操作 (RatingFragment)
    ↓
启动VPN服务 + HTTP服务器
    ↓
生成本地链接 → 复制到剪贴板 → 在微信中打开
    ↓
微信访问本地HTTP服务器 (127.0.0.1:8284)
    ↓
重定向到微信OAuth认证页面 (tgk-wcaime.wahlap.com)
    ↓
VPN拦截所有 wahlap.com 的流量
    ↓
捕获OAuth回调URL (HttpCapturerTunnel)
    ↓
使用认证信息爬取maimai成绩数据 (WechatCrawler)
    ↓
上传到diving-fish.com查分器
```

---

## 二、VPN代理服务核心实现

### 2.1 LocalVpnService - VPN服务主类

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/vpn/core/LocalVpnService.java`

#### 核心功能:
1. **创建虚拟网络接口** (TUN设备)
2. **拦截所有IP数据包**
3. **实现NAT转发**
4. **启动TCP代理服务器和DNS代理**

#### 关键代码逻辑:

```java
// LocalVpnService.java:322
private ParcelFileDescriptor establishVPN() throws Exception {
    Builder builder = new Builder();
    builder.setMtu(ProxyConfig.Instance.getMTU());

    // 设置虚拟IP地址 26.26.26.2/32
    ProxyConfig.IPAddress ipAddress = ProxyConfig.Instance.getDefaultLocalIP();
    LOCAL_IP = CommonMethods.ipStringToInt(ipAddress.Address);
    builder.addAddress(ipAddress.Address, ipAddress.PrefixLength);

    // 添加路由规则 - 绕过私有地址
    for (String routeAddress : getResources().getStringArray(R.array.bypass_private_route)) {
        String[] addr = routeAddress.split("/");
        builder.addRoute(addr[0], Integer.parseInt(addr[1]));
    }

    // 建立VPN连接
    ParcelFileDescriptor pfdDescriptor = builder.establish();
    return pfdDescriptor;
}
```

#### IP数据包处理流程 (LocalVpnService.java:241):

```java
void onIPPacketReceived(IPHeader ipHeader, int size) throws IOException {
    switch (ipHeader.getProtocol()) {
        case IPHeader.TCP:
            // 处理TCP数据包
            TCPHeader tcpHeader = m_TCPHeader;

            // 解析HTTP Host头，识别目标域名
            if (session.BytesSent == 0 && tcpDataSize > 10) {
                String host = HttpHostHeaderParser.parseHost(
                    tcpHeader.m_Data, dataOffset, tcpDataSize);
                if (host != null) {
                    session.RemoteHost = host;
                }
            }

            // 将目标地址改为本地TCP代理服务器
            ipHeader.setDestinationIP(LOCAL_IP);
            tcpHeader.setDestinationPort(m_TcpProxyServer.Port);

            // 重新计算校验和并写回VPN接口
            CommonMethods.ComputeTCPChecksum(ipHeader, tcpHeader);
            m_VPNOutputStream.write(ipHeader.m_Data, ipHeader.m_Offset, size);
            break;

        case IPHeader.UDP:
            // 处理DNS查询 (端口53)
            if (udpHeader.getDestinationPort() == 53) {
                DnsPacket dnsPacket = DnsPacket.FromBytes(m_DNSBuffer);
                m_DnsProxy.onDnsRequestReceived(ipHeader, udpHeader, dnsPacket);
            }
            break;
    }
}
```

### 2.2 TcpProxyServer - TCP代理服务器

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/vpn/core/TcpProxyServer.java`

#### 功能:
- 监听本地端口接收来自VPN的TCP连接
- 根据NAT会话表查找真实目标地址
- 建立到真实服务器的连接并转发数据

#### 关键逻辑 (TcpProxyServer.java:116):

```java
void onAccepted(SelectionKey key) {
    SocketChannel localChannel = m_ServerSocketChannel.accept();
    Tunnel localTunnel = TunnelFactory.wrap(localChannel, m_Selector);

    // 从NAT会话表获取真实目标地址
    InetSocketAddress destAddress = getDestAddress(localChannel);

    if (destAddress != null) {
        // 根据目标地址创建合适的Tunnel
        Tunnel remoteTunnel = TunnelFactory.createTunnelByConfig(destAddress, m_Selector);
        remoteTunnel.setBrotherTunnel(localTunnel);
        localTunnel.setBrotherTunnel(remoteTunnel);

        // ⚠️ 关键: wahlap.com的流量重定向到本地服务器
        if (destAddress.getPort() == 80 && destAddress.getHostName().endsWith("wahlap.com")) {
            destAddress = new InetSocketAddress("192.168.1.3", 3000);
            remoteTunnel.connect(destAddress);
        } else {
            remoteTunnel.connect(destAddress);
        }
    }
}
```

### 2.3 TunnelFactory - Tunnel创建工厂

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/vpn/core/TunnelFactory.java`

#### 核心逻辑 (TunnelFactory.java:21):

```java
public static Tunnel createTunnelByConfig(InetSocketAddress destAddress, Selector selector) {
    // ⚠️ 识别wahlap.com的HTTP流量，创建HttpCapturerTunnel
    if (destAddress.getHostName().endsWith("wahlap.com") && destAddress.getPort() == 80) {
        Log.d(TAG, "Request for wahlap.com caught");
        // 重定向到本地HttpRedirectServer (127.0.0.1:9457)
        return new HttpCapturerTunnel(
            new InetSocketAddress("127.0.0.1", HttpRedirectServer.Port), selector);
    } else {
        // 普通流量使用RawTunnel直接转发
        return new RawTunnel(destAddress, selector);
    }
}
```

### 2.4 HttpCapturerTunnel - HTTP流量捕获

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/vpn/tunnel/HttpCapturerTunnel.java`

#### 功能: 捕获OAuth回调URL

```java
@Override
protected void beforeSend(ByteBuffer buffer) throws Exception {
    String body = new String(buffer.array());
    if (!body.contains("HTTP")) return;

    // 解析HTTP请求，提取URL
    String[] lines = body.split("\r\n");
    String path = lines[0].split(" ")[1];
    String host = extractHost(lines);
    String url = "http://" + host + path;

    // ⚠️ 捕获OAuth回调URL
    if (url.startsWith("http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx")) {
        Log.d(TAG, "Auth request caught!");
        CrawlerCaller.INSTANCE.fetchData(url); // 触发数据爬取
    }
}
```

---

## 三、本地HTTP服务器实现

### 3.1 HttpServer - 认证入口服务器

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/server/HttpServer.java`

#### 端口: 8284
#### 功能: 提供微信访问入口并重定向到OAuth认证页面

```java
@Override
public Response serve(IHTTPSession session) {
    switch (session.getUri()) {
        case "/auth":
            return redirectToWechatAuthUrl(session);
        default:
            // 避免微信WebView缓存
            return redirectToAuthUrlWithRandomParm(session);
    }
}

private Response redirectToWechatAuthUrl(IHTTPSession session) {
    // 调用爬虫获取OAuth认证URL
    String url = CrawlerCaller.INSTANCE.getWechatAuthUrl();

    Response r = newFixedLengthResponse(Response.Status.REDIRECT, MIME_HTML, "");
    r.addHeader("Location", url);
    r.addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return r;
}
```

### 3.2 HttpRedirectServer - OAuth回调处理服务器

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/server/HttpRedirectServer.java`

#### 端口: 9457
#### 功能: 接收wahlap.com的HTTP请求并显示提示页面

```java
@Override
public Response serve(IHTTPSession session) {
    return newFixedLengthResponse(
        Response.Status.ACCEPTED,
        MIME_HTML,
        "<html><body><h1>登录信息已获取,可关闭该窗口并请切回到更新器等待分数上传!</h1></body></html>" +
        "<script>alert('登录信息已获取,请切回到更新器等待分数上传!');</script>");
}
```

---

## 四、微信公众号爬虫实现

### 4.1 WechatCrawler - 核心爬虫类

**位置**: `app/src/main/java/com/paperpig/maimaidata/crawler/WechatCrawler.java`

#### 4.1.1 获取OAuth认证URL

```java
protected String getWechatAuthUrl() throws IOException {
    this.buildHttpClient(true); // followRedirect=true

    Request request = new Request.Builder()
        .addHeader("User-Agent", "Mozilla/5.0 (Linux; Android 12; ...) MicroMessenger/8.0.28.2240")
        .url("https://tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx")
        .build();

    Response response = client.newCall(request).execute();

    // 获取重定向后的微信OAuth URL
    String url = response.request().url().toString()
        .replace("redirect_uri=https", "redirect_uri=http");

    return url;
}
```

#### 4.1.2 模拟微信登录

```java
private void loginWechat(String wechatAuthUrl) throws Exception {
    Request request = new Request.Builder()
        .addHeader("User-Agent", "Mozilla/5.0 ... MicroMessenger/8.0.28.2240 ...")
        .url(wechatAuthUrl)
        .build();

    Response response = client.newCall(request).execute();

    // 检查登录状态
    if (response.code() >= 400) {
        throw new Exception("登陆时出现错误，请重试！");
    }

    // 手动处理重定向 (followRedirect=true时会自动设置Cookie)
    String location = response.headers().get("Location");
    if (response.code() >= 300 && response.code() < 400 && location != null) {
        request = new Request.Builder().url(location).build();
        client.newCall(request).execute().close();
    }
}
```

#### 4.1.3 抓取maimai成绩数据

```java
private static void fetchAndUploadData(String username, String password, Integer diff, Integer retryCount) {
    // 抓取指定难度的所有歌曲成绩
    Request request = new Request.Builder()
        .url("https://maimai.wahlap.com/maimai-mobile/record/musicGenre/search/?genre=99&diff=" + diff)
        .build();

    Response response = client.newCall(request).execute();
    String data = response.body().string(); // HTML页面包含成绩数据

    // 立即上传到水鱼查分器
    uploadData(diff, "<login><u>" + username + "</u><p>" + password + "</p></login>" + data, 1);
}
```

#### 4.1.4 上传数据到水鱼查分器

```java
private static void uploadData(Integer diff, String data, Integer retryCount) {
    Request request = new Request.Builder()
        .url("https://www.diving-fish.com/api/pageparser/page")
        .addHeader("content-type", "text/plain")
        .post(RequestBody.create(data, TEXT))
        .build();

    Response response = client.newCall(request).execute();
    String result = response.body().string();
    writeLog(diffMap.get(diff) + " 难度数据上传状态：" + result);
}
```

### 4.2 CrawlerCaller - 爬虫调用协调器

**位置**: `app/src/main/java/com/paperpig/maimaidata/crawler/CrawlerCaller.kt`

```kotlin
fun fetchData(authUrl: String) {
    CoroutineScope(Dispatchers.IO).launch {
        try {
            // 等待3秒后停止VPN
            Thread.sleep(3000)
            LocalVpnService.IsRunning = false
            Thread.sleep(3000)
        } catch (e: InterruptedException) {
            onError(e)
        }

        val crawler = WechatCrawler()
        crawler.fetchAndUploadData(
            SpUtil.getUserName(),
            SpUtil.getPassword(),
            getDifficulties(), // 从设置获取要更新的难度
            authUrl
        )
    }
}
```

---

## 五、完整工作流程

### 5.1 用户操作流程

```
1. 用户在RatingFragment点击"开始代理"按钮
   ↓
2. 请求VPN权限并启动LocalVpnService
   ↓
3. 启动HttpServerService (端口8284和9457)
   ↓
4. 生成随机URL并复制到剪贴板: http://127.0.0.2:8284/randomString
   ↓
5. 自动打开微信应用
   ↓
6. 用户在微信中粘贴链接并打开
```

### 5.2 技术流程详解

#### 阶段1: 初始化

```
RatingFragment.startProxyServices()
    ↓
├─ startVPNService()
│   └─ LocalVpnService启动
│       ├─ 创建TcpProxyServer (监听随机端口)
│       ├─ 创建DnsProxy
│       └─ 建立VPN接口 (26.26.26.2/32)
│
└─ startHttpService()
    └─ HttpServerService启动
        ├─ HttpServer (端口8284)
        └─ HttpRedirectServer (端口9457)
```

#### 阶段2: OAuth认证

```
微信访问: http://127.0.0.2:8284/xxx
    ↓
HttpServer收到请求
    ↓
调用WechatCrawler.getWechatAuthUrl()
    ↓
返回重定向到:
https://open.weixin.qq.com/connect/oauth2/authorize?
  appid=xxx&
  redirect_uri=http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx&
  response_type=code&scope=snsapi_base&state=xxx
    ↓
微信WebView自动跳转到微信授权页面
    ↓
用户授权后，微信重定向到:
http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx?code=xxx&state=xxx
```

#### 阶段3: VPN流量拦截

```
微信发起HTTP请求到 tgk-wcaime.wahlap.com
    ↓
LocalVpnService拦截TCP数据包
    ↓
TcpProxyServer.onAccepted()
    ↓
TunnelFactory识别wahlap.com域名
    ↓
创建HttpCapturerTunnel并重定向到127.0.0.1:9457
    ↓
HttpCapturerTunnel.beforeSend()解析HTTP请求
    ↓
识别OAuth回调URL:
http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx?code=xxx
    ↓
调用CrawlerCaller.fetchData(url)
```

#### 阶段4: 数据爬取与上传

```
CrawlerCaller.fetchData(authUrl)
    ↓
停止VPN服务 (LocalVpnService.IsRunning = false)
    ↓
WechatCrawler.fetchAndUploadData()
    ↓
├─ loginWechat(authUrl)
│   └─ 模拟微信浏览器访问OAuth回调URL，获取登录Cookie
│
└─ fetchMaimaiData()
    └─ 并发抓取5个难度的成绩数据
        ├─ 请求: https://maimai.wahlap.com/maimai-mobile/record/musicGenre/search/?genre=99&diff=0
        ├─ 请求: diff=1 (Advanced)
        ├─ 请求: diff=2 (Expert)
        ├─ 请求: diff=3 (Master)
        └─ 请求: diff=4 (Re:Master)
            ↓
        每个难度的数据立即上传到:
        https://www.diving-fish.com/api/pageparser/page
        POST: <login><u>username</u><p>password</p></login> + HTML数据
```

---

## 六、关键技术细节

### 6.1 NAT会话管理

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/vpn/core/NatSessionManager.java`

```java
// NAT会话存储真实的目标地址
public class NatSession {
    public int RemoteIP;        // 真实目标IP
    public short RemotePort;    // 真实目标端口
    public String RemoteHost;   // 真实目标域名
    public long LastNanoTime;   // 最后活动时间
    public int PacketSent;      // 已发送数据包数
    public long BytesSent;      // 已发送字节数
}

// 根据本地端口查找NAT会话
public static NatSession getSession(short portKey) {
    return m_Sessions.get(portKey);
}
```

### 6.2 HTTP Host头解析

**位置**: `app/src/main/java/com/paperpig/maimaidata/network/vpn/core/HttpHostHeaderParser.java`

从TCP数据包中提取HTTP Host头，用于识别目标域名:

```java
public static String parseHost(byte[] buffer, int offset, int count) {
    String header = new String(buffer, offset, count);
    String[] lines = header.split("\r\n");
    for (String line : lines) {
        if (line.toLowerCase().startsWith("host:")) {
            return line.substring(5).trim();
        }
    }
    return null;
}
```

### 6.3 Cookie管理

**位置**: `app/src/main/java/com/paperpig/maimaidata/crawler/SimpleCookieJar.java`

使用OkHttp的CookieJar接口自动管理Cookie:

```java
public class SimpleCookieJar implements CookieJar {
    private final HashMap<String, List<Cookie>> cookieStore = new HashMap<>();

    @Override
    public void saveFromResponse(HttpUrl url, List<Cookie> cookies) {
        cookieStore.put(url.host(), cookies);
    }

    @Override
    public List<Cookie> loadForRequest(HttpUrl url) {
        List<Cookie> cookies = cookieStore.get(url.host());
        return cookies != null ? cookies : new ArrayList<>();
    }
}
```

### 6.4 User-Agent模拟

爬虫使用完整的微信内置浏览器User-Agent:

```
Mozilla/5.0 (Linux; Android 12; IN2010 Build/RKQ1.211119.001; wv)
AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0
Chrome/86.0.4240.99 XWEB/4317 MMWEBSDK/20220903
Mobile Safari/537.36 MMWEBID/363
MicroMessenger/8.0.28.2240(0x28001C57)
WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64
```

---

## 七、迁移和修改建议

### 7.1 如果要迁移到其他平台

#### 7.1.1 核心难点:
1. **VPN服务** - Android特有，其他平台需使用不同技术:
   - iOS: Network Extension (NEVPNManager)
   - Windows/Linux: TUN/TAP虚拟网卡
   - Web: 无法实现系统级VPN

2. **本地HTTP服务器** - 可移植性好:
   - 任何语言都有HTTP服务器库
   - 核心逻辑是重定向到OAuth URL

3. **OAuth流量拦截** - 平台相关:
   - 桌面端可用代理服务器 (如mitmproxy)
   - Web端无法拦截系统流量

#### 7.1.2 推荐迁移方案:

**方案A: 后端服务器方案**
```
用户 → 后端服务器 → 华立OAuth
     ← 重定向    ←
```
- 优点: 跨平台，无需VPN
- 缺点: 需要维护服务器，用户隐私问题

**方案B: 浏览器扩展方案**
```
用户 → 浏览器扩展 → 拦截请求 → 提取认证信息
```
- 优点: 无需服务器
- 缺点: 仅限桌面浏览器

**方案C: 移动端代理方案 (类似现有方案)**
```
iOS: Network Extension
Android: VpnService (现有方案)
```

### 7.2 修改建议

#### 7.2.1 安全性改进

1. **移除硬编码的默认代理地址** (ProxyConfig.java:51):
```java
// 当前代码
return "http://user1:pass1@192.168.2.10:1082";

// 建议修改为
return ""; // 移除默认值，强制用户配置
```

2. **添加HTTPS支持**:
   - 当前仅支持HTTP (wahlap.com:80)
   - 建议添加HTTPS流量的MITM (中间人)支持

3. **Cookie加密存储**:
   - 当前Cookie存储在内存中
   - 建议使用Android Keystore加密持久化

#### 7.2.2 功能增强

1. **重试机制改进** (WechatCrawler.java:44):
```java
private static final int MAX_RETRY_COUNT = 4;

// 建议添加指数退避
private static void retryWithBackoff(int attempt) {
    long delay = (long) Math.pow(2, attempt) * 1000; // 2秒, 4秒, 8秒, 16秒
    Thread.sleep(delay);
}
```

2. **日志系统**:
```java
// 添加结构化日志
public class CrawlerLogger {
    public static void logRequest(String url, int statusCode) {
        Log.d(TAG, String.format("[%s] %s - %d",
            new Date(), url, statusCode));
    }
}
```

3. **错误处理**:
```java
// 当前错误处理较简单
catch (Exception e) {
    writeLog("上传失败: " + e);
}

// 建议细化错误类型
catch (SocketTimeoutException e) {
    writeLog("网络超时，请检查网络连接");
} catch (SSLException e) {
    writeLog("SSL证书错误");
} catch (IOException e) {
    writeLog("网络错误: " + e.getMessage());
}
```

#### 7.2.3 性能优化

1. **使用协程替代CompletableFuture** (WechatCrawler.java:92):
```kotlin
// 当前Java代码
List<CompletableFuture<Object>> tasks = new ArrayList<>();
for (Integer diff : difficulties) {
    tasks.add(CompletableFuture.supplyAsync(() -> {
        fetchAndUploadData(username, password, diff, 1);
        return null;
    }));
}

// 建议改为Kotlin协程
coroutineScope {
    difficulties.map { diff ->
        async(Dispatchers.IO) {
            fetchAndUploadData(username, password, diff, 1)
        }
    }.awaitAll()
}
```

2. **连接池复用**:
```java
// 当前每次都重建OkHttpClient
private void buildHttpClient(boolean followRedirect) {
    client = builder.build(); // 每次新建
}

// 建议复用连接池
private static OkHttpClient sharedClient;
private OkHttpClient getClient(boolean followRedirect) {
    if (sharedClient == null) {
        sharedClient = builder.build();
    }
    return sharedClient;
}
```

#### 7.2.4 代码质量

1. **移除注释掉的代码** (LocalVpnService.java:384-388):
```java
// 删除这些无用注释
//        try {
//            Lantern.RemoveOverrides();
//        } catch (Exception e) {
//            // Ignore
//        }
```

2. **常量提取**:
```java
// 当前魔法数字
if (url.startsWith("http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx")) {

// 建议提取常量
private static final String WAHLAP_OAUTH_CALLBACK =
    "http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx";

if (url.startsWith(WAHLAP_OAUTH_CALLBACK)) {
```

---

## 八、关键文件清单

### 8.1 VPN代理相关

| 文件路径 | 功能 | 行数 |
|---------|------|------|
| `network/vpn/core/LocalVpnService.java` | VPN服务主类 | 436 |
| `network/vpn/core/TcpProxyServer.java` | TCP代理服务器 | 151 |
| `network/vpn/core/TunnelFactory.java` | Tunnel创建工厂 | 40 |
| `network/vpn/core/ProxyConfig.java` | 代理配置 | 185 |
| `network/vpn/core/NatSessionManager.java` | NAT会话管理 | ~100 |
| `network/vpn/core/DnsProxy.java` | DNS代理 | ~200 |
| `network/vpn/tunnel/HttpCapturerTunnel.java` | HTTP流量捕获 | 75 |
| `network/vpn/tunnel/RawTunnel.java` | 普通流量转发 | ~200 |
| `network/vpn/tcpip/IPHeader.java` | IP头解析 | ~150 |
| `network/vpn/tcpip/TCPHeader.java` | TCP头解析 | ~150 |

### 8.2 HTTP服务器相关

| 文件路径 | 功能 | 行数 |
|---------|------|------|
| `network/server/HttpServer.java` | 认证入口服务器 | 58 |
| `network/server/HttpRedirectServer.java` | OAuth回调处理 | 31 |
| `network/server/HttpServerService.java` | HTTP服务管理 | ~50 |

### 8.3 爬虫相关

| 文件路径 | 功能 | 行数 |
|---------|------|------|
| `crawler/WechatCrawler.java` | 核心爬虫类 | 283 |
| `crawler/CrawlerCaller.kt` | 爬虫调用协调 | 87 |
| `crawler/WechatCrawlerListener.kt` | 爬虫事件监听 | ~30 |
| `crawler/SimpleCookieJar.java` | Cookie管理 | ~50 |

### 8.4 UI相关

| 文件路径 | 功能 | 行数 |
|---------|------|------|
| `ui/rating/RatingFragment.kt` | 主界面和流程控制 | 440 |

---

## 九、数据流向图

```
┌─────────────────────────────────────────────────────────────────┐
│                          用户设备                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [微信App]                                                        │
│     │                                                             │
│     │ 1. 访问 http://127.0.0.2:8284/xxx                          │
│     │                                                             │
│     ↓                                                             │
│  [HttpServer:8284]                                               │
│     │                                                             │
│     │ 2. 重定向到微信OAuth                                        │
│     │                                                             │
│     ↓                                                             │
│  [微信OAuth授权]                                                 │
│     │                                                             │
│     │ 3. 回调 http://tgk-wcaime.wahlap.com/...?code=xxx         │
│     │                                                             │
│     ↓                                                             │
│  [LocalVpnService] ←─────┐                                      │
│     │                     │ 拦截                                  │
│     │ 4. IP包拦截         │                                      │
│     ↓                     │                                      │
│  [TcpProxyServer]         │                                      │
│     │                     │                                      │
│     │ 5. 创建Tunnel       │                                      │
│     ↓                     │                                      │
│  [TunnelFactory]          │                                      │
│     │                     │                                      │
│     │ 6. 识别wahlap.com ──┘                                      │
│     ↓                                                             │
│  [HttpCapturerTunnel]                                            │
│     │                                                             │
│     │ 7. 解析HTTP请求，提取OAuth URL                             │
│     │                                                             │
│     ↓                                                             │
│  [HttpRedirectServer:9457]                                       │
│     │                                                             │
│     │ 8. 返回提示页面给微信                                       │
│     │                                                             │
│     ↓                                                             │
│  [CrawlerCaller]                                                 │
│     │                                                             │
│     │ 9. 停止VPN，启动爬虫                                        │
│     │                                                             │
│     ↓                                                             │
│  [WechatCrawler]                                                 │
│     │                                                             │
│     │ 10. 使用OAuth URL登录                                      │
│     │                                                             │
└─────┼─────────────────────────────────────────────────────────────┘
      │
      │ 11. HTTPS请求 (带Cookie)
      ↓
┌─────────────────────────────────────────────────────────────────┐
│                      华立服务器                                    │
│  https://maimai.wahlap.com/maimai-mobile/record/...             │
│     │                                                             │
│     │ 12. 返回HTML成绩数据                                        │
│     ↓                                                             │
└─────┼─────────────────────────────────────────────────────────────┘
      │
      │ 13. 上传数据
      ↓
┌─────────────────────────────────────────────────────────────────┐
│                    水鱼查分器                                      │
│  https://www.diving-fish.com/api/pageparser/page                │
│     │                                                             │
│     │ 14. 解析并存储成绩                                          │
│     ↓                                                             │
│  [完成]                                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 十、总结

### 10.1 技术亮点

1. **巧妙的OAuth劫持方案**: 通过VPN拦截而非中间人攻击，无需破解HTTPS
2. **完整的TCP/IP栈实现**: 自己解析和构造IP/TCP/UDP数据包
3. **NAT转发机制**: 实现完整的端口映射和会话管理
4. **异步并发爬取**: 使用协程和CompletableFuture并发处理多个难度
5. **本地服务器巧用**: 通过127.0.0.2绕过回环地址限制

### 10.2 局限性

1. **仅支持Android平台**: 依赖Android VpnService API
2. **仅支持HTTP**: 无法拦截HTTPS流量 (wahlap.com用的是HTTP)
3. **依赖微信环境**: 需要模拟微信浏览器User-Agent
4. **硬编码域名**: wahlap.com域名写死在代码中
5. **无离线支持**: 必须实时联网爬取和上传

### 10.3 安全性分析

**风险点**:
- 用户账号密码明文传输给水鱼查分器
- Cookie存储在内存，应用关闭后丢失
- 无请求频率限制，可能被封禁

**优点**:
- 不保存用户华立账号密码 (仅保存查分器密码)
- 所有流量本地处理，不经过第三方服务器
- 源码开放，可审计

---

## 附录: 快速定位关键代码

如果需要修改特定功能，可以直接查看以下位置:

| 功能 | 文件:行号 |
|-----|----------|
| 启动VPN | `RatingFragment.kt:289` |
| 生成本地链接 | `RatingFragment.kt:255` |
| VPN拦截逻辑 | `LocalVpnService.java:241` |
| wahlap.com识别 | `TunnelFactory.java:27` |
| OAuth URL捕获 | `HttpCapturerTunnel.java:55` |
| 微信登录模拟 | `WechatCrawler.java:177` |
| 成绩数据抓取 | `WechatCrawler.java:104` |
| 上传到查分器 | `WechatCrawler.java:67` |

---

*本文档生成于 2025-11-22*
*分析工具: Claude Code*
