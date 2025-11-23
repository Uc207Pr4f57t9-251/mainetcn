package com.maimai.tokencapture.network.crawler

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Token 提取器 - 核心组件
 * 负责从 HTTP 流量中提取舞萌 DX 的认证 Token
 */
object TokenExtractor {
    private const val TAG = "TokenExtractor"

    private var listener: TokenExtractionListener? = null
    private val capturedTokens = mutableListOf<MaimaiToken>()

    /**
     * Token 提取监听器接口
     */
    interface TokenExtractionListener {
        fun onTokenExtracted(token: MaimaiToken)
        fun onExtractionFailed(reason: String)
        fun onOAuthCallbackDetected(url: String)
    }

    fun setListener(listener: TokenExtractionListener) {
        this.listener = listener
    }

    /**
     * 从 HTTP 响应的 Set-Cookie 头中提取 Token（最重要的方法）
     *
     * @param cookies Map<cookieName, cookieValue>
     * @param source Token 来源（用于记录）
     */
    fun extractTokensFromResponse(cookies: Map<String, String>, source: String = "http_response") {
        val ult = cookies["_t"]
        val userId = cookies["userId"]

        Log.d(TAG, "=".repeat(60))
        Log.d(TAG, "Attempting to extract tokens from HTTP response")
        Log.d(TAG, "Source: $source")
        Log.d(TAG, "Cookies found: ${cookies.keys}")
        Log.d(TAG, "_t present: ${ult != null}")
        Log.d(TAG, "userId present: ${userId != null}")
        Log.d(TAG, "=".repeat(60))

        if (ult != null && userId != null) {
            val token = MaimaiToken(
                ult = ult,
                userId = userId,
                source = source
            )

            if (token.isValid()) {
                capturedTokens.add(token)

                Log.i(TAG, "✅ Token successfully extracted!")
                Log.i(TAG, "   _t: ${ult.take(30)}...")
                Log.i(TAG, "   userId: $userId")
                Log.i(TAG, "   source: $source")

                // 通知监听器（在主线程）
                CoroutineScope(Dispatchers.Main).launch {
                    listener?.onTokenExtracted(token)
                }
            } else {
                val reason = "Token format invalid"
                Log.w(TAG, "⚠️ $reason")
                CoroutineScope(Dispatchers.Main).launch {
                    listener?.onExtractionFailed(reason)
                }
            }
        } else {
            val reason = when {
                ult == null && userId == null -> "Both _t and userId missing from cookies"
                ult == null -> "_t cookie missing"
                else -> "userId cookie missing"
            }

            Log.w(TAG, "⚠️ Token extraction incomplete: $reason")
            Log.d(TAG, "Available cookies: $cookies")

            CoroutineScope(Dispatchers.Main).launch {
                listener?.onExtractionFailed(reason)
            }
        }
    }

    /**
     * 从 HTTP 请求的 Cookie 头中提取 Token
     * 用于捕获已存在的 Token（用户已登录的情况）
     */
    fun extractTokensFromRequest(cookies: Map<String, String>, source: String = "http_request") {
        val ult = cookies["_t"]
        val userId = cookies["userId"]

        if (ult != null && userId != null) {
            Log.d(TAG, "Found existing tokens in request Cookie header")
            extractTokensFromResponse(cookies, source)
        }
    }

    /**
     * 处理 HTTP 请求
     */
    fun handleHttpRequest(request: HttpRequest) {
        val url = request.getFullUrl()
        Log.d(TAG, "HTTP Request: ${request.method} $url")

        // 检查是否是 OAuth 回调 URL
        if (isOAuthCallback(url)) {
            Log.i(TAG, "🔑 OAuth callback URL detected!")
            CoroutineScope(Dispatchers.Main).launch {
                listener?.onOAuthCallbackDetected(url)
            }

            // 尝试从请求 Cookie 中提取 Token
            val cookies = request.getCookies()
            if (cookies.isNotEmpty()) {
                extractTokensFromRequest(cookies, "oauth_callback_request")
            }
        }

        // 检查是否是 maimai 相关页面
        if (isMaimaiPage(url)) {
            Log.d(TAG, "Maimai page detected: $url")

            // 尝试从请求 Cookie 中提取 Token
            val cookies = request.getCookies()
            if (cookies.isNotEmpty()) {
                extractTokensFromRequest(cookies, getPageSource(url))
            }
        }
    }

    /**
     * 处理 HTTP 响应（最关键的方法）
     */
    fun handleHttpResponse(response: HttpResponse, requestUrl: String = "") {
        Log.d(TAG, "HTTP Response: ${response.statusCode} ${response.statusMessage}")

        // 提取 Set-Cookie
        val cookies = response.extractSetCookies()

        if (cookies.isNotEmpty()) {
            Log.d(TAG, "Set-Cookie headers found in response!")
            Log.d(TAG, "Cookies: ${cookies.keys}")

            val source = if (requestUrl.isNotEmpty()) {
                getPageSource(requestUrl)
            } else {
                "http_response"
            }

            extractTokensFromResponse(cookies, source)
        } else {
            Log.d(TAG, "No Set-Cookie headers in response")
        }

        // 处理重定向
        if (response.isRedirect()) {
            val location = response.getLocation()
            Log.d(TAG, "Redirect detected: $location")
        }
    }

    /**
     * 判断是否是 OAuth 回调 URL
     */
    private fun isOAuthCallback(url: String): Boolean {
        return url.contains("tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx")
    }

    /**
     * 判断是否是 maimai 页面
     */
    private fun isMaimaiPage(url: String): Boolean {
        return url.contains("maimai.wahlap.com/maimai-mobile")
    }

    /**
     * 根据 URL 获取页面来源标识
     */
    private fun getPageSource(url: String): String {
        return when {
            url.contains("/home") -> "maimai_home"
            url.contains("/playerData") -> "maimai_playerData"
            url.contains("/record") -> "maimai_record"
            url.contains("oauth/callback") -> "oauth_callback"
            else -> "maimai_page"
        }
    }

    /**
     * 获取最新捕获的 Token
     */
    fun getLatestToken(): MaimaiToken? {
        return capturedTokens.lastOrNull()
    }

    /**
     * 获取所有捕获的 Token
     */
    fun getAllTokens(): List<MaimaiToken> {
        return capturedTokens.toList()
    }

    /**
     * 清除所有 Token
     */
    fun clearTokens() {
        capturedTokens.clear()
    }

    /**
     * 获取 Token 数量
     */
    fun getTokenCount(): Int {
        return capturedTokens.size
    }
}
