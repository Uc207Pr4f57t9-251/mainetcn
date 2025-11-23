package com.maimai.tokencapture.network.crawler

import android.util.Log

/**
 * HTTP 请求数据模型
 */
data class HttpRequest(
    val method: String,
    val path: String,
    val version: String,
    val headers: Map<String, String>,
    val body: String = ""
) {
    fun getHost(): String {
        return headers["Host"] ?: headers["host"] ?: ""
    }

    fun getFullUrl(): String {
        val host = getHost()
        return if (host.isNotEmpty()) {
            "http://$host$path"
        } else {
            path
        }
    }

    fun getCookies(): Map<String, String> {
        val cookieHeader = headers["Cookie"] ?: headers["cookie"] ?: return emptyMap()
        return parseCookies(cookieHeader)
    }

    fun isValid(): Boolean {
        return method.isNotEmpty() && path.isNotEmpty() && getHost().isNotEmpty()
    }

    companion object {
        private const val TAG = "HttpRequestParser"

        /**
         * 解析原始 HTTP 请求数据
         */
        fun parse(rawData: ByteArray, length: Int): HttpRequest? {
            return try {
                val data = String(rawData, 0, length, Charsets.UTF_8)
                parse(data)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse HTTP request", e)
                null
            }
        }

        fun parse(rawData: String): HttpRequest? {
            if (!rawData.contains("HTTP/")) return null

            try {
                val lines = rawData.split("\r\n")
                if (lines.isEmpty()) return null

                // 解析请求行: GET /path HTTP/1.1
                val requestLine = lines[0].split(" ", limit = 3)
                if (requestLine.size < 3) return null

                val method = requestLine[0]
                val path = requestLine[1]
                val version = requestLine[2]

                // 解析请求头
                val headers = mutableMapOf<String, String>()
                var bodyStartIndex = -1

                for (i in 1 until lines.size) {
                    val line = lines[i]

                    // 空行表示请求头结束
                    if (line.isEmpty()) {
                        bodyStartIndex = i + 1
                        break
                    }

                    // 解析请求头
                    val colonIndex = line.indexOf(":")
                    if (colonIndex > 0) {
                        val key = line.substring(0, colonIndex).trim()
                        val value = line.substring(colonIndex + 1).trim()
                        headers[key] = value
                    }
                }

                // 解析请求体
                val body = if (bodyStartIndex > 0 && bodyStartIndex < lines.size) {
                    lines.subList(bodyStartIndex, lines.size).joinToString("\r\n")
                } else {
                    ""
                }

                return HttpRequest(method, path, version, headers, body)

            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse HTTP request string", e)
                return null
            }
        }

        /**
         * 解析 Cookie 头
         * 格式: "_t=value1; userId=value2; other=value3"
         */
        private fun parseCookies(cookieHeader: String): Map<String, String> {
            return cookieHeader.split("; ").mapNotNull { cookie ->
                val parts = cookie.split("=", limit = 2)
                if (parts.size == 2) {
                    parts[0].trim() to parts[1].trim()
                } else null
            }.toMap()
        }
    }
}
