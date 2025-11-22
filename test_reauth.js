/**
 * 舞萌DX 自动重新认证测试
 *
 * 尝试使用 authToken 重新获取有效的 session
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG = {
  tokenFile: path.join(__dirname, 'token.json'),
  userAgent: 'Mozilla/5.0 (Linux; Android 15; PJZ110 Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160117 MMWEBSDK/20250201 MMWEBID/2253 MicroMessenger/8.0.57.2800(0x28003940) WeChat/arm64 Weixin GPVersion/1 NetType/4G Language/zh_CN ABI/arm64'
};

function log(level, msg) {
  const colors = {
    INFO: '\x1b[36m',
    SUCCESS: '\x1b[32m',
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m',
    DEBUG: '\x1b[35m'
  };
  console.log(`${colors[level] || ''}[${level}]\x1b[0m ${msg}`);
}

// 尝试使用 authToken 重新认证
async function tryReauthWithToken(authToken) {
  log('INFO', '尝试使用 authToken 重新认证...');
  log('DEBUG', `authToken: ${authToken.substring(0, 16)}...`);

  const url = `https://maimai.wahlap.com/maimai-mobile/?t=${authToken}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      maxRedirects: 5,
      timeout: 30000,
      validateStatus: () => true
    });

    log('INFO', `响应状态: ${response.status}`);

    // 检查 Set-Cookie
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      log('SUCCESS', '服务器返回了 Cookie!');

      let newUlt = null;
      let newUserId = null;

      for (const cookie of setCookie) {
        console.log(`  Cookie: ${cookie.substring(0, 60)}...`);

        const tMatch = cookie.match(/_t=([^;]+)/);
        if (tMatch) {
          newUlt = tMatch[1];
          log('SUCCESS', `提取到 _t: ${newUlt.substring(0, 16)}...`);
        }

        const userIdMatch = cookie.match(/userId=([^;]+)/);
        if (userIdMatch) {
          newUserId = userIdMatch[1];
          log('SUCCESS', `提取到 userId: ${newUserId}`);
        }
      }

      if (newUlt && newUserId) {
        return { success: true, ult: newUlt, userId: newUserId };
      }
    }

    // 检查是否被重定向
    if (response.status === 302 || response.status === 301) {
      log('WARN', `重定向到: ${response.headers['location']}`);
    }

    // 检查响应内容
    const html = response.data;
    if (html.includes('error') || html.includes('エラー') || html.includes('登录')) {
      log('ERROR', 'authToken 已失效或无效');
    }

    return { success: false };

  } catch (err) {
    log('ERROR', `请求失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// 测试现有token是否有效
async function testExistingToken(ult, userId) {
  log('INFO', '测试现有 Token 是否有效...');

  try {
    const response = await axios.get('https://maimai.wahlap.com/maimai-mobile/home/', {
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Cookie': `_t=${ult}; userId=${userId}`
      },
      timeout: 30000,
      validateStatus: () => true
    });

    log('INFO', `响应状态: ${response.status}`);

    if (response.status === 200) {
      const html = response.data;

      // 检查是否是正常的首页（包含玩家信息）
      if (html.includes('player_name') || html.includes('home_name')) {
        log('SUCCESS', 'Token 有效！');
        return { valid: true };
      }

      // 检查是否是错误页面
      if (html.includes('エラー') || html.includes('error')) {
        log('WARN', '返回了错误页面');
        return { valid: false, reason: 'error_page' };
      }

      // 可能是需要重新登录
      log('WARN', '无法确定Token状态，保存响应用于分析');
      fs.writeFileSync(path.join(__dirname, 'data', 'debug_response.html'), html);
      return { valid: false, reason: 'unknown' };
    }

    return { valid: false, reason: `status_${response.status}` };

  } catch (err) {
    log('ERROR', `测试失败: ${err.message}`);
    return { valid: false, reason: err.message };
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('  舞萌DX 自动重新认证测试');
  console.log('='.repeat(50));

  // 读取 token.json
  let tokenData;
  try {
    tokenData = JSON.parse(fs.readFileSync(CONFIG.tokenFile, 'utf8'));
    log('INFO', `已加载 token.json`);
  } catch (err) {
    log('ERROR', `无法读取 token.json: ${err.message}`);
    return;
  }

  const { ult, userId, authToken } = tokenData;

  // 步骤1: 测试现有token
  console.log('\n--- 步骤1: 测试现有Token ---');
  const testResult = await testExistingToken(ult, userId);

  if (testResult.valid) {
    log('SUCCESS', '现有 Token 仍然有效，无需重新认证');
    return;
  }

  log('WARN', `现有 Token 无效: ${testResult.reason}`);

  // 步骤2: 尝试使用 authToken 重新认证
  if (!authToken) {
    log('ERROR', 'token.json 中没有 authToken，无法自动重新认证');
    log('INFO', '请重新抓包获取新的 token');
    return;
  }

  console.log('\n--- 步骤2: 尝试使用 authToken 重新认证 ---');
  const reauthResult = await tryReauthWithToken(authToken);

  if (reauthResult.success) {
    log('SUCCESS', '重新认证成功！');
    log('INFO', `新的 ult: ${reauthResult.ult.substring(0, 16)}...`);
    log('INFO', `新的 userId: ${reauthResult.userId}`);

    // 更新 token.json
    const newTokenData = {
      ...tokenData,
      ult: reauthResult.ult,
      userId: reauthResult.userId,
      lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync(CONFIG.tokenFile, JSON.stringify(newTokenData, null, 2));
    log('SUCCESS', 'token.json 已更新');

    // 验证新token
    console.log('\n--- 步骤3: 验证新Token ---');
    const verifyResult = await testExistingToken(reauthResult.ult, reauthResult.userId);
    if (verifyResult.valid) {
      log('SUCCESS', '新 Token 验证成功！可以正常使用了');
    } else {
      log('WARN', '新 Token 验证失败，可能需要重新抓包');
    }

  } else {
    log('ERROR', 'authToken 重新认证失败');
    log('INFO', '这个 authToken 可能已经失效');
    log('INFO', '请重新抓包获取新的认证数据');
  }

  console.log('\n' + '='.repeat(50));
}

main().catch(console.error);
