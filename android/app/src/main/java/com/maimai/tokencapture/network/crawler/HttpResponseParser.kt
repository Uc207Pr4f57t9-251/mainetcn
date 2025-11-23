package com.maimai.tokencapture.network.crawler

import android.util.Log

/**
 * HTTP 响应数据模型
 */
data class HttpResponse(
    val version: String,
    val statusCode: Int,
    val statusMessage: String,
    val headers: Map<String, List<String>>,
    val body: String = ""
) {
    /**
     * 提取所有 Set-Cookie 头中的 Cookie
     * 返回 Map<cookieName, cookieValue>
     */
    fun extractSetCookies(): Map<String, String> {
        val setCookies = headers["Set-Cookie"] ?: headers["set-cookie"] ?: return emptyMap()

        return setCookies.mapNotNull { cookieHeader ->
            // 格式: "_t=value; expires=...; path=/"
            val parts = cookieHeader.split(";")
            if (parts.isEmpty()) return@mapNotNull null

            // 提取第一部分 "name=value"
            val cookiePair = parts[0].split("=", limit = 2)
            if (cookiePair.size == 2) {
                cookiePair[0].trim() to cookiePair[1].trim()
            } else null
        }.toMap()
    }

    /**
     * 获取特定的头值
     */
    fun getHeader(name: String): String? {
        val values = headers[name] ?: headers[name.toLowerCase()] ?: return null
        return if (values.isNotEmpty()) values[0] else null
    }

    /**
     * 检查是否是重定向响应
     */
    fun isRedirect(): Boolean {
        return statusCode in 300..399
    }

    /**
     * 获取重定向位置
     */
    fun getLocation(): String? {
        return getHeader("Location") ?: getHeader("location")
    }

    /**
     * 检查响应是否有效
     */
    fun isValid(): Boolean {
        return statusCode in 100..599
    }

    fun isSuccess(): Boolean {
        return statusCode in 200..299
    }

    companion object {
        private const val TAG = "HttpResponseParser"

        /**
         * 解析原始 HTTP 响应数据
         */
        fun parse(rawData: ByteArray, length: Int): HttpResponse? {
            return try {
                val data = String(rawData, 0, length, Charsets.UTF_8)
                parse(data)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse HTTP response", e)
                null
            }
        }

        fun parse(rawData: String): HttpResponse? {
            if (!rawData.startsWith("HTTP/")) return null

            try {
                val lines = rawData.split("\r\n")
                if (lines.isEmpty()) return null

                // 解析状态行: HTTP/1.1 200 OK
                val statusLine = lines[0].split(" ", limit = 3)
                if (statusLine.size < 2) return null

                val version = statusLine[0]
                val statusCode = statusLine[1].toIntOrNull() ?: return null
                val statusMessage = if (statusLine.size >= 3) statusLine[2] else ""

                // 解析响应头（支持多个同名头）
                val headers = mutableMapOf<String, MutableList<String>>()
                var bodyStartIndex = -1

                for (i in 1 until lines.size) {
                    val line = lines[i]

                    // 空行表示响应头结束
                    if (line.isEmpty()) {
                        bodyStartIndex = i + 1
                        break
                    }

                    // 解析响应头
                    val colonIndex = line.indexOf(":")
                    if (colonIndex > 0) {
                        val key = line.substring(0, colonIndex).trim()
                        val value = line.substring(colonIndex + 1).trim()

                        headers.getOrPut(key) { mutableListOf() }.add(value)
                    }
                }

                // 解析响应体
                val body = if (bodyStartIndex > 0 && bodyStartIndex < lines.size) {
                    lines.subList(bodyStartIndex, lines.size).joinToString("\r\n")
                } else {
                    ""
                }

                Log.d(TAG, "Parsed HTTP response: $statusCode $statusMessage")
                if (headers.containsKey("Set-Cookie") || headers.containsKey("set-cookie")) {
                    val cookies = headers["Set-Cookie"] ?: headers["set-cookie"]
                    Log.d(TAG, "Found Set-Cookie headers: ${cookies?.size ?: 0}")
                    cookies?.forEach { cookie ->
                        Log.d(TAG, "  Set-Cookie: ${cookie.take(50)}...")
                    }
                }

                return HttpResponse(version, statusCode, statusMessage, headers, body)

            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse HTTP response string", e)
                return null
            }
        }
    }
}
