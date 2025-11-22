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
  baseUrl: 'https://maimai.wahlap.com/maimai-mobile',
  userAgent: 'Mozilla/5.0 (Linux; Android 15; PJZ110 Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160117 MMWEBSDK/20250201 MMWEBID/2253 MicroMessenger/8.0.57.2800(0x28003940) WeChat/arm64 Weixin GPVersion/1 NetType/4G Language/zh_CN ABI/arm64'
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
function buildHeaders(token) {
  return {
    'Host': 'maimai.wahlap.com',
    'Connection': 'keep-alive',
    'User-Agent': CONFIG.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/wxpic,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate',
    'Cookie': `_t=${token.ult}; userId=${token.userId}`
  };
}

// 测试连接
async function testConnection(token) {
  log('STEP', '步骤2: 测试与舞萌服务器的连接');

  const url = `${CONFIG.baseUrl}/home/`;
  log('DEBUG', `请求URL: ${url}`);

  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      headers: buildHeaders(token),
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true
    });
    const duration = Date.now() - startTime;

    log('INFO', `响应状态: ${response.status} ${response.statusText}`);
    log('INFO', `响应时间: ${duration}ms`);
    log('DEBUG', `响应头:`, {
      'content-type': response.headers['content-type'],
      'set-cookie': response.headers['set-cookie'] ? '已返回' : '无'
    });

    if (response.status === 200) {
      const html = response.data;
      if (html.includes('error') || html.includes('エラー')) {
        log('WARN', '可能需要重新登录，响应内容包含错误信息');
        return { success: false, needReauth: true };
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
      return { success: false, redirect: response.headers['location'] };
    } else {
      log('ERROR', `意外的响应状态: ${response.status}`);
      return { success: false };
    }
  } catch (err) {
    log('ERROR', `连接失败: ${err.message}`);
    if (err.code === 'ENOTFOUND') {
      log('ERROR', '无法解析域名，请检查网络连接');
    } else if (err.code === 'ETIMEDOUT') {
      log('ERROR', '连接超时，请检查网络或使用VPN');
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
  log('STEP', '步骤3: 获取最近游玩记录');

  const url = `${CONFIG.baseUrl}/record/`;
  log('DEBUG', `请求URL: ${url}`);

  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      headers: buildHeaders(token),
      timeout: 30000,
      validateStatus: () => true
    });
    const duration = Date.now() - startTime;

    log('INFO', `响应状态: ${response.status}`);
    log('INFO', `响应时间: ${duration}ms`);
    log('DEBUG', `响应大小: ${response.data.length} 字符`);

    if (response.status !== 200) {
      throw new Error(`请求失败，状态码: ${response.status}`);
    }

    // 保存原始HTML用于调试
    const debugDir = path.join(__dirname, 'data');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    fs.writeFileSync(path.join(debugDir, 'last_response.html'), response.data);
    log('DEBUG', '原始HTML已保存到 data/last_response.html');

    // 解析记录
    const records = parseRecordsHtml(response.data);
    log('SUCCESS', `成功解析 ${records.length} 条游玩记录`);

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

// 主函数
async function main() {
  printDivider('舞萌DX 游玩记录获取测试 v2');
  console.log(`  测试时间: ${new Date().toLocaleString()}`);
  console.log(`  Node版本: ${process.version}`);
  printDivider();

  let token = null;
  let latestToken = null;

  try {
    // 步骤1: 读取Token
    token = loadToken();

    // 步骤2: 测试连接
    console.log('');
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

    // 步骤3: 获取游玩记录
    console.log('');
    const { records, newToken } = await fetchPlayHistory(latestToken || token);

    if (newToken) {
      latestToken = newToken;
    }

    // 显示结果
    printRecords(records);
    printStats(records);

    // 保存结果
    console.log('');
    log('STEP', '步骤4: 保存测试结果');
    saveTestResult(records, latestToken);

    // 完成
    printDivider('测试完成');
    log('SUCCESS', '所有测试通过！');
    console.log('\n  Token状态: \x1b[32m有效\x1b[0m');
    console.log(`  获取记录: ${records.length} 条`);
    console.log(`  数据已保存到 data/ 目录\n`);

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
