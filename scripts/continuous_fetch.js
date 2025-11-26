/**
 * 舞萌DX 长期持续数据获取脚本
 *
 * 功能：
 * - 定时获取最近游玩记录
 * - 增量保存新记录（去重）
 * - 自动更新和保存token
 * - 支持后台运行
 *
 * 使用方法：
 *   node continuous_fetch.js              # 单次获取
 *   node continuous_fetch.js --daemon     # 后台持续运行
 *   node continuous_fetch.js --interval 30  # 每30分钟获取一次
 */

const fs = require('fs');
const path = require('path');
const mainetcn = require('./index');

// 配置
const CONFIG = {
  tokenFile: path.join(__dirname, 'token.json'),
  dataDir: path.join(__dirname, 'data'),
  historyFile: path.join(__dirname, 'data', 'play_history.json'),
  latestTokenFile: path.join(__dirname, 'data', 'latest_token.json'),
  defaultInterval: 60, // 默认60分钟
};

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    console.log(`[INFO] 创建数据目录: ${CONFIG.dataDir}`);
  }
}

// 读取token
function loadToken() {
  try {
    if (fs.existsSync(CONFIG.latestTokenFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.latestTokenFile, 'utf8'));
      console.log('[INFO] 使用最新保存的token');
      return { ult: data.ult, userId: data.userId };
    }
    if (fs.existsSync(CONFIG.tokenFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.tokenFile, 'utf8'));
      console.log('[INFO] 使用初始token');
      return { ult: data.ult, userId: data.userId };
    }
    throw new Error('Token文件不存在');
  } catch (err) {
    console.error('[ERROR] 读取token失败:', err.message);
    process.exit(1);
  }
}

// 保存token
function saveToken(token) {
  const data = {
    ult: token.ult,
    userId: token.userId,
    lastUpdated: new Date().toISOString()
  };
  fs.writeFileSync(CONFIG.latestTokenFile, JSON.stringify(data, null, 2));
  console.log('[INFO] Token已更新保存');
}

// 读取历史记录
function loadHistory() {
  try {
    if (fs.existsSync(CONFIG.historyFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
    }
  } catch (err) {
    console.error('[WARN] 读取历史记录失败，将创建新文件');
  }
  return {
    records: [],
    lastFetch: null,
    totalFetches: 0,
    createdAt: new Date().toISOString()
  };
}

// 保存历史记录
function saveHistory(history) {
  fs.writeFileSync(CONFIG.historyFile, JSON.stringify(history, null, 2));
}

// 生成记录唯一ID（用于去重）
function getRecordId(record) {
  return `${record.title}_${record.diff}_${record.date}_${record.percentage}`;
}

// 获取最近游玩记录
async function fetchRecentRecords(token) {
  console.log('[INFO] 正在获取最近游玩记录...');

  try {
    const result = await mainetcn.recent(token);

    if (!result || !result.result) {
      throw new Error('获取数据失败，可能token已失效');
    }

    console.log(`[INFO] 获取到 ${result.result.length} 条记录`);
    return {
      records: result.result,
      newToken: result.token
    };
  } catch (err) {
    console.error('[ERROR] 获取记录失败:', err.message);
    throw err;
  }
}

// 合并新记录（去重）
function mergeRecords(history, newRecords) {
  const existingIds = new Set(history.records.map(r => getRecordId(r)));
  const addedRecords = [];

  for (const record of newRecords) {
    const recordId = getRecordId(record);
    if (!existingIds.has(recordId)) {
      // 添加获取时间戳
      record.fetchedAt = new Date().toISOString();
      history.records.unshift(record); // 新记录添加到开头
      existingIds.add(recordId);
      addedRecords.push(record);
    }
  }

  return addedRecords;
}

// 打印记录摘要
function printRecordSummary(records, title = '记录') {
  if (records.length === 0) {
    console.log(`[INFO] 没有新${title}`);
    return;
  }

  console.log(`\n=== 新增 ${records.length} 条${title} ===`);
  records.slice(0, 5).forEach((r, i) => {
    const fc = r.fc ? ` [${r.fc}]` : '';
    const fs = r.fs ? ` [${r.fs}]` : '';
    console.log(`  ${i + 1}. ${r.title} (${r.diff}) - ${r.percentage}% ${r.rate}${fc}${fs}`);
  });
  if (records.length > 5) {
    console.log(`  ... 还有 ${records.length - 5} 条记录`);
  }
  console.log('');
}

// 主获取逻辑
async function doFetch() {
  ensureDataDir();

  let token = loadToken();
  const history = loadHistory();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`[${new Date().toLocaleString()}] 开始获取数据`);
  console.log(`${'='.repeat(50)}`);
  console.log(`[INFO] 历史记录数: ${history.records.length}`);

  try {
    // 获取最近记录
    const { records, newToken } = await fetchRecentRecords(token);

    // 更新token
    if (newToken) {
      token = newToken;
      saveToken(token);
    }

    // 合并去重
    const addedRecords = mergeRecords(history, records);

    // 更新统计
    history.lastFetch = new Date().toISOString();
    history.totalFetches++;

    // 保存
    saveHistory(history);

    // 打印摘要
    printRecordSummary(addedRecords, '游玩记录');
    console.log(`[INFO] 总记录数: ${history.records.length}`);
    console.log(`[INFO] 累计获取次数: ${history.totalFetches}`);

    return { success: true, added: addedRecords.length };
  } catch (err) {
    console.error(`[ERROR] 获取失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// 守护进程模式
async function runDaemon(intervalMinutes) {
  console.log(`\n${'#'.repeat(50)}`);
  console.log(`# 舞萌DX 持续数据获取服务`);
  console.log(`# 获取间隔: ${intervalMinutes} 分钟`);
  console.log(`# 按 Ctrl+C 停止`);
  console.log(`${'#'.repeat(50)}\n`);

  // 立即执行一次
  await doFetch();

  // 设置定时器
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(async () => {
    await doFetch();
  }, intervalMs);

  // 保持进程运行
  process.on('SIGINT', () => {
    console.log('\n[INFO] 收到停止信号，正在退出...');
    process.exit(0);
  });
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    daemon: false,
    interval: CONFIG.defaultInterval
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--daemon' || args[i] === '-d') {
      options.daemon = true;
    } else if ((args[i] === '--interval' || args[i] === '-i') && args[i + 1]) {
      options.interval = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// 入口
async function main() {
  const options = parseArgs();

  if (options.daemon) {
    await runDaemon(options.interval);
  } else {
    const result = await doFetch();
    process.exit(result.success ? 0 : 1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
