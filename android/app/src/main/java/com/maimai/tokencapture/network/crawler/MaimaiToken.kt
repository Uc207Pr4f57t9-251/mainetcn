package com.maimai.tokencapture.network.crawler

/**
 * 舞萌 DX Token 数据模型
 */
data class MaimaiToken(
    val ult: String,              // _t cookie 值
    val userId: String,           // userId cookie 值
    val capturedAt: Long = System.currentTimeMillis(),  // 捕获时间戳
    val source: String = "unknown"  // 来源 (oauth_callback, maimai_home, maimai_playerData, etc.)
) {
    /**
     * 转换为 JSON 格式（用于剪贴板复制）
     */
    fun toJsonString(): String {
        return """
            {
              "ult": "$ult",
              "userId": "$userId"
            }
        """.trimIndent()
    }

    /**
     * 转换为 Node.js token.json 格式
     */
    fun toNodeJsFormat(): String {
        return """
            {
              "ult": "$ult",
              "userId": "$userId"
            }
        """.trimIndent()
    }

    /**
     * 获取简短描述
     */
    fun getDescription(): String {
        val timestamp = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault())
            .format(java.util.Date(capturedAt))
        return "捕获时间: $timestamp\n来源: $source"
    }

    /**
     * 验证 Token 是否有效（基本格式检查）
     */
    fun isValid(): Boolean {
        return ult.isNotEmpty() && userId.isNotEmpty() &&
                ult.length > 10 && userId.matches(Regex("\\d+"))
    }
}
