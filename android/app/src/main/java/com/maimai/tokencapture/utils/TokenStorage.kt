package com.maimai.tokencapture.utils

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.maimai.tokencapture.network.crawler.MaimaiToken

/**
 * Token 存储管理器
 * 使用 SharedPreferences 持久化存储 Token
 */
object TokenStorage {
    private const val PREF_NAME = "maimai_tokens"
    private const val KEY_CURRENT_TOKEN = "current_token"
    private const val KEY_TOKEN_HISTORY = "token_history"
    private const val MAX_HISTORY_SIZE = 20  // 最多保留 20 个历史记录

    private lateinit var prefs: SharedPreferences
    private val gson = Gson()

    /**
     * 初始化（在 Application 或 MainActivity 中调用）
     */
    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    /**
     * 保存 Token
     */
    fun saveToken(token: MaimaiToken) {
        // 保存为当前 Token
        prefs.edit()
            .putString(KEY_CURRENT_TOKEN, gson.toJson(token))
            .apply()

        // 添加到历史记录
        val history = getTokenHistory().toMutableList()

        // 避免重复（相同的 ult 和 userId）
        history.removeAll { it.ult == token.ult && it.userId == token.userId }

        history.add(token)

        // 只保留最近的记录
        val recentHistory = history.takeLast(MAX_HISTORY_SIZE)

        prefs.edit()
            .putString(KEY_TOKEN_HISTORY, gson.toJson(recentHistory))
            .apply()
    }

    /**
     * 获取当前 Token
     */
    fun getCurrentToken(): MaimaiToken? {
        val json = prefs.getString(KEY_CURRENT_TOKEN, null) ?: return null
        return try {
            gson.fromJson(json, MaimaiToken::class.java)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 获取 Token 历史记录
     */
    fun getTokenHistory(): List<MaimaiToken> {
        val json = prefs.getString(KEY_TOKEN_HISTORY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<MaimaiToken>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * 清除所有 Token
     */
    fun clearTokens() {
        prefs.edit()
            .remove(KEY_CURRENT_TOKEN)
            .remove(KEY_TOKEN_HISTORY)
            .apply()
    }

    /**
     * 删除当前 Token
     */
    fun clearCurrentToken() {
        prefs.edit()
            .remove(KEY_CURRENT_TOKEN)
            .apply()
    }

    /**
     * 检查是否有 Token
     */
    fun hasToken(): Boolean {
        return getCurrentToken() != null
    }

    /**
     * 获取历史记录数量
     */
    fun getHistoryCount(): Int {
        return getTokenHistory().size
    }
}
