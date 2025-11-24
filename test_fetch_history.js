/**
 * 舞萌DX 游玩历史记录获取测试脚本 v2
 *
 * 用于测试token是否有效，并获取最近游玩记录
 * 包含完整的测试过程输出
 *
 * 使用方法：node test_fetch_history.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 配置
const CONFIG = {
  tokenFile: path.join(__dirname, 'token.json'),
  dataDir: path.join(__dirname, 'data'),
  databaseFile: path.join(__dirname, 'data', 'play_history_db.json'),
  baseUrl: 'https://maimai.wahlap.com/maimai-mobile',
  userAgent: 'Mozilla/5.0 (Linux; Android 15; PJZ110 Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160117 MMWEBSDK/20250201 MMWEBID/2253 MicroMessenger/8.0.57.2800(0x28003940) WeChat/arm64 Weixin GPVersion/1 NetType/4G Language/zh_CN ABI/arm64',
  // Debug模式：显示详细的网络请求信息
  debugMode: true
};

// 日志函数
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': '\x1b[36m[INFO]\x1b[0m',
    'SUCCESS': '\x1b[32m[SUCCESS]\x1b[0m',
    'ERROR': '\x1b[31m[ERROR]\x1b[0m',
    'WARN': '\x1b[33m[WARN]\x1b[0m',
    'DEBUG': '\x1b[35m[DEBUG]\x1b[0m',
    'STEP': '\x1b[34m[STEP]\x1b[0m'
  };

  console.log(`${timestamp} ${prefix[level] || '[LOG]'} ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function printDivider(title = '') {
  const line = '='.repeat(60);
  if (title) {
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(`${line}`);
  } else {
    console.log(line);
  }
}

function printSubDivider(title = '') {
  const line = '-'.repeat(50);
  if (title) {
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(line);
  } else {
    console.log(line);
  }
}

// 详细的HTTP请求日志
function logHttpRequest(method, url, headers, body = null) {
  if (!CONFIG.debugMode) return;

  console.log('\n' + '┌' + '─'.repeat(58) + '┐');
  console.log('│ \x1b[36mHTTP REQUEST\x1b[0m' + ' '.repeat(45) + '│');
  console.log('├' + '─'.repeat(58) + '┤');
  console.log(`│ \x1b[33mMethod:\x1b[0m ${method.padEnd(50)} │`);
  console.log(`│ \x1b[33mURL:\x1b[0m ${url.substring(0, 53).padEnd(53)} │`);
  if (url.length > 53) {
    console.log(`│      ${url.substring(53).padEnd(53)} │`);
  }
  console.log('├' + '─'.repeat(58) + '┤');
  console.log('│ \x1b[33mHeaders:\x1b[0m' + ' '.repeat(48) + '│');
  for (const [key, value] of Object.entries(headers)) {
    const headerStr = `  ${key}: ${value}`;
    if (headerStr.length <= 56) {
      console.log(`│ ${headerStr.padEnd(57)} │`);
    } else {
      // 分行显示长header
      const parts = [];
      let current = `  ${key}: `;
      const valueStr = String(value);
      for (let i = 0; i < valueStr.length; i++) {
        if (current.length >= 56) {
          parts.push(current);
          current = '    ';
        }
        current += valueStr[i];
      }
      if (current.trim()) parts.push(current);
      parts.forEach(part => console.log(`│ ${part.padEnd(57)} │`));
    }
  }
  if (body) {
    console.log('├' + '─'.repeat(58) + '┤');
    console.log('│ \x1b[33mBody:\x1b[0m' + ' '.repeat(51) + '│');
    console.log(`│ ${String(body).substring(0, 56).padEnd(57)} │`);
  }
  console.log('└' + '─'.repeat(58) + '┘\n');
}

// 详细的HTTP响应日志
function logHttpResponse(statusCode, statusText, headers, bodyLength, duration) {
  if (!CONFIG.debugMode) return;

  const statusColor = statusCode >= 200 && statusCode < 300 ? '\x1b[32m' :
                      statusCode >= 300 && statusCode < 400 ? '\x1b[33m' : '\x1b[31m';

  console.log('\n' + '┌' + '─'.repeat(58) + '┐');
  console.log('│ \x1b[36mHTTP RESPONSE\x1b[0m' + ' '.repeat(44) + '│');
  console.log('├' + '─'.repeat(58) + '┤');
  console.log(`│ \x1b[33mStatus:\x1b[0m ${statusColor}${statusCode} ${statusText}\x1b[0m`.padEnd(67 + statusColor.length + 4) + '│');
  console.log(`│ \x1b[33mDuration:\x1b[0m ${duration}ms`.padEnd(67) + '│');
  console.log(`│ \x1b[33mBody Length:\x1b[0m ${bodyLength} bytes`.padEnd(67) + '│');
  console.log('├' + '─'.repeat(58) + '┤');
  console.log('│ \x1b[33mHeaders:\x1b[0m' + ' '.repeat(48) + '│');

  for (const [key, value] of Object.entries(headers)) {
    let displayValue = String(value);
    // 对于Set-Cookie，显示简化信息
    if (key.toLowerCase() === 'set-cookie') {
      if (Array.isArray(value)) {
        displayValue = `[${value.length} cookies]`;
        console.log(`│   ${key}: ${displayValue}`.padEnd(58) + '│');
        value.forEach((cookie, i) => {
          const cookieMatch = cookie.match(/^([^=]+)=([^;]+)/);
          if (cookieMatch) {
            const cookieName = cookieMatch[1];
            const cookieValue = cookieMatch[2];
            const shortValue = cookieValue.length > 30 ?
              cookieValue.substring(0, 30) + '...' : cookieValue;
            console.log(`│     [${i}] ${cookieName}=${shortValue}`.padEnd(58) + '│');
          }
        });
        continue;
      }
    }

    const headerStr = `  ${key}: ${displayValue}`;
    if (headerStr.length <= 56) {
      console.log(`│ ${headerStr.padEnd(57)} │`);
    } else {
      console.log(`│ ${headerStr.substring(0, 56).padEnd(57)} │`);
      console.log(`│    ${headerStr.substring(56).padEnd(54)} │`);
    }
  }
  console.log('└' + '─'.repeat(58) + '┘\n');
}

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    log('DEBUG', `创建数据目录: ${CONFIG.dataDir}`);
  }
}

// 保存失败的响应数据用于分析
function saveFailedResponse(url, headers, response, reason = 'unknown') {
  ensureDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseFilename = path.join(CONFIG.dataDir, `failed_${reason}_${timestamp}`);

  // 保存响应HTML
  const htmlFile = `${baseFilename}.html`;
  fs.writeFileSync(htmlFile, response.data);
  log('WARN', `失败响应HTML已保存: ${htmlFile}`);

  // 保存完整的请求和响应信息
  const infoFile = `${baseFilename}_info.json`;
  const info = {
    timestamp: new Date().toISOString(),
    reason: reason,
    request: {
      url: url,
      method: 'GET',
      headers: headers
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      dataLength: response.data.length,
      dataPreview: response.data.substring(0, 500) // 前500字符预览
    }
  };
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2));
  log('WARN', `失败响应详情已保存: ${infoFile}`);

  return { htmlFile, infoFile };
}

// 生成记录唯一ID
// 使用 trackId 作为主要标识，如果没有则使用组合键
function generateRecordId(record) {
  if (record.trackId) {
    return `track_${record.trackId}`;
  }
  // 备用方案：使用曲目+难度+日期+达成率组合
  const key = `${record.title}_${record.diff}_${record.date}_${record.percentage}`;
  return `combo_${Buffer.from(key).toString('base64').replace(/[=+/]/g, '')}`;
}

// 加载数据库
function loadDatabase() {
  ensureDataDir();

  try {
    if (fs.existsSync(CONFIG.databaseFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.databaseFile, 'utf8'));
      log('DEBUG', `数据库加载成功，已有 ${data.records.length} 条记录`);
      return data;
    }
  } catch (err) {
    log('WARN', `数据库加载失败: ${err.message}，将创建新数据库`);
  }

  // 返回空数据库结构
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    lastUpdated: null,
    totalFetches: 0,
    records: [],
    recordIndex: {} // 用于快速查找的索引 { recordId: true }
  };
}

// 保存数据库
function saveDatabase(db) {
  ensureDataDir();
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG.databaseFile, JSON.stringify(db, null, 2));
  log('DEBUG', `数据库已保存，共 ${db.records.length} 条记录`);
}

// 将新记录添加到数据库（去重）
function addRecordsToDatabase(db, newRecords) {
  const addedRecords = [];
  const duplicateCount = { total: 0 };

  for (const record of newRecords) {
    const recordId = generateRecordId(record);

    // 检查是否已存在
    if (db.recordIndex[recordId]) {
      duplicateCount.total++;
      continue;
    }

    // 添加元数据
    const enrichedRecord = {
      ...record,
      _id: recordId,
      _fetchedAt: new Date().toISOString()
    };

    // 添加到数据库
    db.records.push(enrichedRecord);
    db.recordIndex[recordId] = true;
    addedRecords.push(enrichedRecord);
  }

  db.totalFetches++;

  return { addedRecords, duplicateCount: duplicateCount.total };
}

// 读取token
function loadToken() {
  log('STEP', '步骤1: 读取Token配置文件');

  try {
    if (!fs.existsSync(CONFIG.tokenFile)) {
      throw new Error(`Token文件不存在: ${CONFIG.tokenFile}`);
    }

    const content = fs.readFileSync(CONFIG.tokenFile, 'utf8');
    log('DEBUG', `Token文件内容长度: ${content.length} 字节`);

    const data = JSON.parse(content);

    if (!data.ult || !data.userId) {
      throw new Error('Token文件缺少必要字段 (ult 或 userId)');
    }

    log('SUCCESS', 'Token读取成功', {
      ult: data.ult.substring(0, 8) + '...' + data.ult.substring(data.ult.length - 4),
      userId: data.userId,
      lastUpdated: data.lastUpdated || 'N/A'
    });

    return { ult: data.ult, userId: data.userId };
  } catch (err) {
    log('ERROR', `读取Token失败: ${err.message}`);
    throw err;
  }
}

// 构建请求头
function buildHeaders(token, options = {}) {
  const headers = {
    'Host': 'maimai.wahlap.com',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': CONFIG.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/wxpic,image/tpg,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'X-Requested-With': 'com.tencent.mm',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': `_t=${token.ult}; userId=${token.userId}`
  };

  // 添加可选的headers
  if (options.referer) {
    headers['Referer'] = options.referer;
    headers['Sec-Fetch-Site'] = 'same-origin';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-User'] = '?1';
    headers['Sec-Fetch-Dest'] = 'document';
  }

  return headers;
}

// 测试连接
async function testConnection(token) {
  // 注意：步骤号由调用方日志输出

  const url = `${CONFIG.baseUrl}/home/`;
  const headers = buildHeaders(token);

  log('DEBUG', `请求URL: ${url}`);

  // 记录请求详情
  logHttpRequest('GET', url, headers);

  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      headers: headers,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true
    });
    const duration = Date.now() - startTime;

    // 记录响应详情
    logHttpResponse(
      response.status,
      response.statusText,
      response.headers,
      response.data.length,
      duration
    );

    log('INFO', `响应状态: ${response.status} ${response.statusText}`);
    log('INFO', `响应时间: ${duration}ms`);

    if (response.status === 200) {
      const html = response.data;
      if (html.includes('error') || html.includes('エラー')) {
        log('WARN', '可能需要重新登录，响应内容包含错误信息');

        // 保存失败的响应用于分析
        const savedFiles = saveFailedResponse(url, headers, response, 'auth_error');
        log('INFO', '提示：请检查保存的HTML文件来确认具体错误信息');

        return { success: false, needReauth: true, savedFiles };
      }

      log('SUCCESS', '连接测试成功！Token有效');

      let newToken = null;
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        for (const cookie of setCookie) {
          const match = cookie.match(/_t=([^;]+)/);
          if (match) {
            newToken = { ...token, ult: match[1] };
            log('INFO', `服务器返回了新的Token: ${match[1].substring(0, 8)}...`);
          }
        }
      }

      return { success: true, newToken };
    } else if (response.status === 302 || response.status === 301) {
      log('WARN', `被重定向到: ${response.headers['location']}`);

      // 保存重定向响应
      const savedFiles = saveFailedResponse(url, headers, response, 'redirect');

      return { success: false, redirect: response.headers['location'], savedFiles };
    } else {
      log('ERROR', `意外的响应状态: ${response.status}`);

      // 保存异常状态码的响应
      const savedFiles = saveFailedResponse(url, headers, response, `status_${response.status}`);

      return { success: false, savedFiles };
    }
  } catch (err) {
    console.log('\n' + '┌' + '─'.repeat(58) + '┐');
    console.log('│ \x1b[31mHTTP ERROR\x1b[0m' + ' '.repeat(46) + '│');
    console.log('├' + '─'.repeat(58) + '┤');
    console.log(`│ \x1b[33mError Message:\x1b[0m ${String(err.message).substring(0, 40).padEnd(40)} │`);
    console.log(`│ \x1b[33mError Code:\x1b[0m ${String(err.code || 'N/A').padEnd(43)} │`);

    if (err.response) {
      console.log('├' + '─'.repeat(58) + '┤');
      console.log('│ \x1b[33mResponse Status:\x1b[0m'.padEnd(58) + '│');
      console.log(`│   ${err.response.status} ${err.response.statusText}`.padEnd(58) + '│');
      console.log(`│ \x1b[33mResponse Headers:\x1b[0m`.padEnd(58) + '│');
      for (const [key, value] of Object.entries(err.response.headers || {})) {
        console.log(`│   ${key}: ${String(value).substring(0, 48)}`.padEnd(58) + '│');
      }

      // 保存错误响应
      saveFailedResponse(url, headers, err.response, `exception_${err.code || 'unknown'}`);
    }

    console.log('└' + '─'.repeat(58) + '┘\n');

    log('ERROR', `连接失败: ${err.message}`);
    if (err.code === 'ENOTFOUND') {
      log('ERROR', '无法解析域名，请检查网络连接');
    } else if (err.code === 'ETIMEDOUT') {
      log('ERROR', '连接超时，请检查网络或使用VPN');
    } else if (err.code === 'ECONNREFUSED') {
      log('ERROR', '连接被拒绝');
    } else if (err.code === 'ECONNRESET') {
      log('ERROR', '连接被重置');
    }
    throw err;
  }
}

// 使用正则表达式解析游玩记录HTML
function parseRecordsHtml(html) {
  log('DEBUG', `解析HTML，长度: ${html.length} 字符`);

  const records = [];

  // 匹配每个游玩记录块 - 从 <div class="p_10 t_l f_0 v_b"> 开始
  const recordBlockRegex = /<div class="p_10 t_l f_0 v_b">([\s\S]*?)(?=<div class="p_10 t_l f_0 v_b">|<div class="f_0">[\s\S]*?<\/footer>)/g;

  let match;
  while ((match = recordBlockRegex.exec(html)) !== null) {
    const block = match[1];

    try {
      // 提取难度
      const diffMatch = block.match(/diff_(\w+)\.png/);
      const diffMap = { 'basic': 'Basic', 'advanced': 'Advanced', 'expert': 'Expert', 'master': 'Master', 'remaster': 'Re:Master' };
      const diff = diffMatch ? (diffMap[diffMatch[1]] || diffMatch[1]) : 'Unknown';

      // 提取日期时间
      const dateMatch = block.match(/<span class="v_b">(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2})<\/span>/);
      const date = dateMatch ? dateMatch[1] : '';

      // 提取曲目名称 - 在 basic_block 中，clear.png 之后
      const titleMatch = block.match(/clear\.png"[^>]*\/>([\s\S]*?)<\/div>/);
      let title = '';
      if (titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      // 提取达成率
      const achieveMatch = block.match(/playlog_achievement_txt[^>]*>(\d+)<span[^>]*>\.([\d]+)%<\/span>/);
      let percentage = '';
      if (achieveMatch) {
        percentage = `${achieveMatch[1]}.${achieveMatch[2]}`;
      }

      // 提取评级 (scorerank)
      const rateMatch = block.match(/playlog\/(\w+)\.png[^>]*class="playlog_scorerank"/);
      let rate = '';
      if (rateMatch) {
        const rateMap = {
          'sssp': 'SSS+', 'sss': 'SSS', 'ssp': 'SS+', 'ss': 'SS',
          'sp': 'S+', 's': 'S', 'aaa': 'AAA', 'aa': 'AA', 'a': 'A',
          'bbb': 'BBB', 'bb': 'BB', 'b': 'B', 'c': 'C', 'd': 'D'
        };
        rate = rateMap[rateMatch[1].toLowerCase()] || rateMatch[1].toUpperCase();
      }

      // 提取DX分数
      const dxMatch = block.match(/white p_r_5 f_15 f_r">([\d,]+)\s*\/\s*([\d,]+)<\/div>/);
      let dxscore = '', dxmax = '';
      if (dxMatch) {
        dxscore = dxMatch[1].replace(/,/g, '');
        dxmax = dxMatch[2].replace(/,/g, '');
      }

      // 提取FC状态 (排除dummy)
      let fc = null;
      const fcMatch = block.match(/playlog\/(fc_|ap)(\w*)\.png/);
      if (fcMatch && !fcMatch[0].includes('dummy')) {
        const fcType = fcMatch[1] + fcMatch[2];
        const fcMap = { 'ap': 'AP', 'app': 'AP+', 'fc': 'FC', 'fcp': 'FC+' };
        fc = fcMap[fcType.toLowerCase()] || fcType.toUpperCase();
      }

      // 提取FS状态 (排除dummy)
      let fs = null;
      const fsMatch = block.match(/playlog\/(sync_|fs|fsd)(\w*)\.png/);
      if (fsMatch && !fsMatch[0].includes('dummy')) {
        const fsType = fsMatch[1] + fsMatch[2];
        const fsMap = { 'sync': 'SYNC', 'fs': 'FS', 'fsp': 'FS+', 'fsd': 'FDX', 'fsdp': 'FDX+' };
        fs = fsMap[fsType.toLowerCase()] || fsType.toUpperCase();
      }

      // 提取记录ID
      const idMatch = block.match(/name="idx" value="([^"]+)"/);
      const trackId = idMatch ? idMatch[1] : '';

      // 是否是DX谱面
      const isDx = block.includes('music_dx.png');

      // 是否New Record
      const isNewRecord = block.includes('newrecord.png');

      if (title) {
        records.push({
          title,
          diff,
          percentage,
          rate,
          date,
          fc,
          fs,
          dxscore,
          dxmax,
          trackId,
          isDx,
          isNewRecord
        });
      }
    } catch (e) {
      log('DEBUG', `解析单条记录失败: ${e.message}`);
    }
  }

  log('DEBUG', `正则匹配完成，找到 ${records.length} 条记录`);
  return records;
}

// 获取游玩记录
async function fetchPlayHistory(token) {
  const url = `${CONFIG.baseUrl}/record/`;
  // 添加Referer（模拟从首页跳转过来）
  const headers = buildHeaders(token, {
    referer: `${CONFIG.baseUrl}/home/`
  });

  log('DEBUG', `请求URL: ${url}`);

  // 记录请求详情
  logHttpRequest('GET', url, headers);

  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      headers: headers,
      timeout: 30000,
      validateStatus: () => true
    });
    const duration = Date.now() - startTime;

    // 记录响应详情
    logHttpResponse(
      response.status,
      response.statusText,
      response.headers,
      response.data.length,
      duration
    );

    log('INFO', `响应状态: ${response.status}`);
    log('INFO', `响应时间: ${duration}ms`);
    log('DEBUG', `响应大小: ${response.data.length} 字符`);

    if (response.status !== 200) {
      // 保存非200状态码的响应
      saveFailedResponse(url, headers, response, `fetch_status_${response.status}`);
      throw new Error(`请求失败，状态码: ${response.status}`);
    }

    // 保存原始HTML用于调试
    ensureDataDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const debugFile = path.join(CONFIG.dataDir, `response_${timestamp}.html`);
    fs.writeFileSync(debugFile, response.data);
    log('DEBUG', `原始HTML已保存到: ${debugFile}`);

    // 解析记录
    const records = parseRecordsHtml(response.data);
    log('SUCCESS', `成功解析 ${records.length} 条游玩记录`);

    // 如果解析出0条记录，或响应包含错误信息，额外保存为失败响应
    const html = response.data;
    if (records.length === 0 || html.includes('error') || html.includes('エラー')) {
      if (records.length === 0) {
        log('WARN', '警告：未解析出任何游玩记录');
      }
      if (html.includes('error') || html.includes('エラー')) {
        log('WARN', '警告：响应内容包含错误信息');
      }
      // 保存为失败响应以便分析
      saveFailedResponse(url, headers, response, 'parse_issue_or_error');
    }

    // 提取新token
    let newToken = null;
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      for (const cookie of setCookie) {
        const match = cookie.match(/_t=([^;]+)/);
        if (match) {
          newToken = { ...token, ult: match[1] };
        }
      }
    }

    return { records, newToken, html: response.data };
  } catch (err) {
    console.log('\n' + '┌' + '─'.repeat(58) + '┐');
    console.log('│ \x1b[31mHTTP ERROR (获取游玩记录)\x1b[0m' + ' '.repeat(28) + '│');
    console.log('├' + '─'.repeat(58) + '┤');
    console.log(`│ \x1b[33mError Message:\x1b[0m ${String(err.message).substring(0, 40).padEnd(40)} │`);
    console.log(`│ \x1b[33mError Code:\x1b[0m ${String(err.code || 'N/A').padEnd(43)} │`);

    if (err.response) {
      console.log('├' + '─'.repeat(58) + '┤');
      console.log('│ \x1b[33mResponse Status:\x1b[0m'.padEnd(58) + '│');
      console.log(`│   ${err.response.status} ${err.response.statusText}`.padEnd(58) + '│');
      if (err.response.data) {
        const preview = String(err.response.data).substring(0, 200);
        console.log(`│ \x1b[33mResponse Preview:\x1b[0m`.padEnd(58) + '│');
        console.log(`│   ${preview.substring(0, 54)}`.padEnd(58) + '│');
      }

      // 保存错误响应
      saveFailedResponse(url, headers, err.response, `fetch_exception_${err.code || 'unknown'}`);
    }

    console.log('└' + '─'.repeat(58) + '┘\n');

    log('ERROR', `获取记录失败: ${err.message}`);
    throw err;
  }
}

// 打印记录
function printRecords(records) {
  printSubDivider('游玩记录列表');

  if (records.length === 0) {
    console.log('  没有找到游玩记录');
    console.log('  提示: 请检查 data/last_response.html 文件确认返回内容');
    return;
  }

  console.log(`  共 ${records.length} 条记录\n`);

  // 打印前10条
  const displayCount = Math.min(10, records.length);
  for (let i = 0; i < displayCount; i++) {
    const r = records[i];
    const fc = r.fc ? ` [\x1b[33m${r.fc}\x1b[0m]` : '';
    const fs = r.fs ? ` [\x1b[36m${r.fs}\x1b[0m]` : '';
    const rate = r.rate ? `\x1b[32m${r.rate}\x1b[0m` : '-';
    const newRec = r.isNewRecord ? ' \x1b[31mNEW!\x1b[0m' : '';
    const dxTag = r.isDx ? '\x1b[35m[DX]\x1b[0m ' : '';

    console.log(`  ${(i + 1).toString().padStart(2)}. ${dxTag}${r.title}${newRec}`);
    console.log(`      难度: ${r.diff} | 达成率: ${r.percentage}% | 评级: ${rate}${fc}${fs}`);
    console.log(`      DX分数: ${r.dxscore || '-'}/${r.dxmax || '-'} | 日期: ${r.date || '-'}`);
    console.log('');
  }

  if (records.length > displayCount) {
    console.log(`  ... 还有 ${records.length - displayCount} 条记录\n`);
  }
}

// 统计信息
function printStats(records) {
  printSubDivider('统计信息');

  if (records.length === 0) {
    console.log('  无数据');
    return;
  }

  const stats = {
    total: records.length,
    difficulties: {},
    ratings: {},
    fcCount: 0,
    fsCount: 0,
    newRecords: 0,
    dxCount: 0
  };

  for (const r of records) {
    stats.difficulties[r.diff] = (stats.difficulties[r.diff] || 0) + 1;
    if (r.rate) stats.ratings[r.rate] = (stats.ratings[r.rate] || 0) + 1;
    if (r.fc) stats.fcCount++;
    if (r.fs) stats.fsCount++;
    if (r.isNewRecord) stats.newRecords++;
    if (r.isDx) stats.dxCount++;
  }

  console.log(`  总记录数: ${stats.total}`);
  console.log(`  DX谱面: ${stats.dxCount}`);
  console.log(`  新纪录: ${stats.newRecords}`);
  console.log(`  FC数量: ${stats.fcCount}`);
  console.log(`  FS数量: ${stats.fsCount}`);

  console.log('\n  难度分布:');
  const diffOrder = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:Master'];
  for (const diff of diffOrder) {
    if (stats.difficulties[diff]) {
      console.log(`    ${diff}: ${stats.difficulties[diff]}`);
    }
  }

  console.log('\n  评级分布:');
  const ratingOrder = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C', 'D'];
  for (const rate of ratingOrder) {
    if (stats.ratings[rate]) {
      console.log(`    ${rate}: ${stats.ratings[rate]}`);
    }
  }
}

// 保存测试结果
function saveTestResult(records, token) {
  const outputDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = path.join(outputDir, `test_result_${timestamp}.json`);

  const result = {
    fetchTime: new Date().toISOString(),
    recordCount: records.length,
    records: records
  };

  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  log('INFO', `测试结果已保存到: ${filename}`);

  // 保存更新的token
  if (token) {
    const tokenFile = path.join(outputDir, 'latest_token.json');
    fs.writeFileSync(tokenFile, JSON.stringify({
      ult: token.ult,
      userId: token.userId,
      lastUpdated: new Date().toISOString()
    }, null, 2));
    log('INFO', `Token已更新保存到: ${tokenFile}`);
  }
}

// 打印新增记录
function printNewRecords(addedRecords) {
  printSubDivider('新增记录');

  if (addedRecords.length === 0) {
    console.log('  \x1b[33m没有新增记录（全部为已存在的重复记录）\x1b[0m');
    return;
  }

  console.log(`  \x1b[32m本次新增 ${addedRecords.length} 条记录\x1b[0m\n`);

  // 打印所有新增记录
  const displayCount = Math.min(10, addedRecords.length);
  for (let i = 0; i < displayCount; i++) {
    const r = addedRecords[i];
    const fc = r.fc ? ` [\x1b[33m${r.fc}\x1b[0m]` : '';
    const fs = r.fs ? ` [\x1b[36m${r.fs}\x1b[0m]` : '';
    const rate = r.rate ? `\x1b[32m${r.rate}\x1b[0m` : '-';
    const dxTag = r.isDx ? '\x1b[35m[DX]\x1b[0m ' : '';

    console.log(`  \x1b[32m+\x1b[0m ${dxTag}${r.title}`);
    console.log(`      ${r.diff} | ${r.percentage}% | ${rate}${fc}${fs} | ${r.date}`);
  }

  if (addedRecords.length > displayCount) {
    console.log(`\n  ... 还有 ${addedRecords.length - displayCount} 条新记录`);
  }
}

// 主函数
async function main() {
  printDivider('舞萌DX 游玩记录获取测试 v3 (带去重)');
  console.log(`  测试时间: ${new Date().toLocaleString()}`);
  console.log(`  Node版本: ${process.version}`);
  printDivider();

  let token = null;
  let latestToken = null;

  try {
    // 步骤1: 读取Token
    token = loadToken();

    // 步骤2: 加载数据库
    console.log('');
    log('STEP', '步骤2: 加载历史数据库');
    const db = loadDatabase();
    log('INFO', `数据库状态: ${db.records.length} 条历史记录, ${db.totalFetches} 次获取`);

    // 步骤3: 测试连接
    console.log('');
    log('STEP', '步骤3: 测试与舞萌服务器的连接');
    const connResult = await testConnection(token);

    if (!connResult.success) {
      if (connResult.needReauth) {
        log('ERROR', 'Token已失效，需要重新抓包获取');
      }
      printDivider('测试失败');
      process.exit(1);
    }

    if (connResult.newToken) {
      latestToken = connResult.newToken;
    }

    // 步骤4: 获取游玩记录
    console.log('');
    log('STEP', '步骤4: 获取最近游玩记录');
    const { records, newToken } = await fetchPlayHistory(latestToken || token);

    if (newToken) {
      latestToken = newToken;
    }

    // 步骤5: 去重并添加到数据库
    console.log('');
    log('STEP', '步骤5: 去重并更新数据库');
    const { addedRecords, duplicateCount } = addRecordsToDatabase(db, records);

    log('INFO', `本次获取: ${records.length} 条`);
    log('INFO', `新增记录: \x1b[32m${addedRecords.length}\x1b[0m 条`);
    log('INFO', `重复记录: \x1b[33m${duplicateCount}\x1b[0m 条（已跳过）`);
    log('INFO', `数据库总计: ${db.records.length} 条`);

    // 显示本次获取的全部记录
    printRecords(records);

    // 显示新增记录
    printNewRecords(addedRecords);

    // 显示统计
    printStats(records);

    // 保存数据库
    console.log('');
    log('STEP', '步骤6: 保存数据');
    saveDatabase(db);
    saveTestResult(records, latestToken);

    // 完成
    printDivider('测试完成');
    log('SUCCESS', '所有测试通过！');
    console.log('\n  Token状态: \x1b[32m有效\x1b[0m');
    console.log(`  本次获取: ${records.length} 条`);
    console.log(`  新增记录: \x1b[32m${addedRecords.length}\x1b[0m 条`);
    console.log(`  重复跳过: \x1b[33m${duplicateCount}\x1b[0m 条`);
    console.log(`  数据库总计: \x1b[36m${db.records.length}\x1b[0m 条`);
    console.log(`  数据文件: ${CONFIG.databaseFile}\n`);

  } catch (err) {
    printDivider('测试失败');
    log('ERROR', `测试过程中发生错误: ${err.message}`);
    console.log('\n  可能的原因:');
    console.log('  1. 网络连接问题（可能需要VPN）');
    console.log('  2. Token已失效（需要重新抓包）');
    console.log('  3. 舞萌服务器维护中\n');
    process.exit(1);
  }
}

// 运行
main();
