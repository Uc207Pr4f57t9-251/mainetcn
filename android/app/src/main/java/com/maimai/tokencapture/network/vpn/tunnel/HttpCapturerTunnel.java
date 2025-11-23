package com.maimai.tokencapture.network.vpn.tunnel;

import android.util.Log;

import com.maimai.tokencapture.network.crawler.HttpRequestParser;
import com.maimai.tokencapture.network.crawler.HttpResponseParser;
import com.maimai.tokencapture.network.crawler.HttpRequest;
import com.maimai.tokencapture.network.crawler.HttpResponse;
import com.maimai.tokencapture.network.crawler.TokenExtractor;

import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.Selector;
import java.nio.channels.SocketChannel;

/**
 * HTTP 流量捕获 Tunnel
 * 拦截 HTTP 请求和响应，提取 Token
 */
public class HttpCapturerTunnel extends Tunnel {
    private static final String TAG = "HttpCapturerTunnel";

    private String currentRequestUrl = "";

    public HttpCapturerTunnel(InetSocketAddress serverAddress, Selector selector) throws Exception {
        super(serverAddress, selector);
    }

    public HttpCapturerTunnel(SocketChannel innerChannel, Selector selector) throws Exception {
        super(innerChannel, selector);
    }

    @Override
    protected void onConnected(ByteBuffer buffer) throws Exception {
        onTunnelEstablished();
    }

    /**
     * 拦截发送的数据（HTTP 请求）
     */
    @Override
    protected void beforeSend(ByteBuffer buffer) throws Exception {
        try {
            // 解析 HTTP 请求
            HttpRequest request = HttpRequestParser.parse(buffer.array(), buffer.position());

            if (request != null && request.isValid()) {
                currentRequestUrl = request.getFullUrl();
                Log.d(TAG, "=".repeat(60));
                Log.d(TAG, "HTTP Request: " + request.getMethod() + " " + currentRequestUrl);
                Log.d(TAG, "=".repeat(60));

                // 使用 TokenExtractor 处理请求
                TokenExtractor.INSTANCE.handleHttpRequest(request);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing HTTP request", e);
        }
    }

    /**
     * 拦截接收的数据（HTTP 响应）- 最关键的部分
     */
    @Override
    protected void afterReceived(ByteBuffer buffer) {
        try {
            // 解析 HTTP 响应
            HttpResponse response = HttpResponseParser.parse(buffer.array(), buffer.position());

            if (response != null && response.isValid()) {
                Log.d(TAG, "=".repeat(60));
                Log.d(TAG, "HTTP Response: " + response.getStatusCode() + " " + response.getStatusMessage());
                if (!currentRequestUrl.isEmpty()) {
                    Log.d(TAG, "For request: " + currentRequestUrl);
                }
                Log.d(TAG, "=".repeat(60));

                // 使用 TokenExtractor 处理响应（提取 Set-Cookie）
                TokenExtractor.INSTANCE.handleHttpResponse(response, currentRequestUrl);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing HTTP response", e);
        }
    }

    @Override
    protected boolean isTunnelEstablished() {
        return true;
    }

    @Override
    protected void onDispose() {
        currentRequestUrl = "";
    }
}
