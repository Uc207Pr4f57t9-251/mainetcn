package com.maimai.tokencapture.ui

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.maimai.tokencapture.R
import com.maimai.tokencapture.network.crawler.MaimaiToken
import com.maimai.tokencapture.network.crawler.TokenExtractor
import com.maimai.tokencapture.network.vpn.core.LocalVpnService
import com.maimai.tokencapture.utils.TokenStorage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private var vpnServiceStarted = false

    companion object {
        private const val REQUEST_VPN_PERMISSION = 100
        private const val TAG = "MainActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 初始化 TokenStorage
        TokenStorage.init(this)

        // TODO: 在实际应用中，这里应该使用 ViewBinding
        // 由于当前是概念验证，暂时先创建基础 UI

        setupTokenListener()
    }

    private fun setupTokenListener() {
        TokenExtractor.setListener(object : TokenExtractor.TokenExtractionListener {
            override fun onTokenExtracted(token: MaimaiToken) {
                runOnUiThread {
                    // 保存 Token
                    TokenStorage.saveToken(token)

                    // 显示成功提示
                    Toast.makeText(
                        this@MainActivity,
                        "✅ Token 已成功捕获！",
                        Toast.LENGTH_LONG
                    ).show()

                    // 更新 UI 显示 Token
                    displayCurrentToken(token)

                    // 停止 VPN 服务
                    stopVpnService()
                }
            }

            override fun onExtractionFailed(reason: String) {
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "⚠️ Token 提取失败: $reason",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onOAuthCallbackDetected(url: String) {
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "🔑 检测到 OAuth 回调",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        })
    }

    private fun displayCurrentToken(token: MaimaiToken) {
        // TODO: 实际应用中应该更新 TextView
        android.util.Log.i(TAG, "Token captured:")
        android.util.Log.i(TAG, "  ult: ${token.ult}")
        android.util.Log.i(TAG, "  userId: ${token.userId}")
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
        if (requestCode == REQUEST_VPN_PERMISSION && resultCode == Activity.RESULT_OK) {
            startVpnService()
        } else {
            Toast.makeText(this, "需要 VPN 权限才能捕获 Token", Toast.LENGTH_LONG).show()
        }
    }

    private fun startVpnService() {
        try {
            startService(Intent(this, LocalVpnService::class.java))
            vpnServiceStarted = true

            Toast.makeText(this, "✅ VPN 代理已启动\n请打开微信「舞萌 DX」公众号", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "启动 VPN 失败: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun stopVpnService() {
        try {
            LocalVpnService.IsRunning = false
            stopService(Intent(this, LocalVpnService::class.java))
            vpnServiceStarted = false

            Toast.makeText(this, "VPN 代理已停止", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Error stopping VPN", e)
        }
    }

    private fun copyToClipboard(label: String, text: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard.setPrimaryClip(clip)

        Toast.makeText(this, "$label 已复制到剪贴板", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (vpnServiceStarted) {
            stopVpnService()
        }
    }
}
