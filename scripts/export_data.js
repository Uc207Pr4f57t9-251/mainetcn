/**
 * 舞萌DX 数据导出工具
 *
 * 功能：
 * - 导出历史游玩记录为 JSON/CSV 格式
 * - 生成统计报告
 * - 支持按日期范围过滤
 *
 * 使用方法：
 *   node export_data.js                    # 导出全部数据为JSON
 *   node export_data.js --csv              # 导出为CSV
 *   node export_data.js --stats            # 显示统计信息
 *   node export_data.js --days 7           # 仅导出最近7天
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  historyFile: path.join(__dirname, 'data', 'play_history.json'),
  exportDir: path.join(__dirname, 'exports'),
};

// 读取历史记录
function loadHistory() {
  try {
    if (fs.existsSync(CONFIG.historyFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
    }
    console.error('[ERROR] 历史记录文件不存在，请先运行 continuous_fetch.js 获取数据');
    process.exit(1);
  } catch (err) {
    console.error('[ERROR] 读取历史记录失败:', err.message);
    process.exit(1);
  }
}

// 确保导出目录存在
function ensureExportDir() {
  if (!fs.existsSync(CONFIG.exportDir)) {
    fs.mkdirSync(CONFIG.exportDir, { recursive: true });
  }
}

// 按日期过滤记录
function filterByDays(records, days) {
  if (!days) return records;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return records.filter(r => {
    const recordDate = new Date(r.fetchedAt || r.date);
    return recordDate >= cutoff;
  });
}

// 导出为JSON
function exportJSON(records, filename) {
  ensureExportDir();
  const filepath = path.join(CONFIG.exportDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(records, null, 2));
  console.log(`[INFO] 已导出 ${records.length} 条记录到: ${filepath}`);
  return filepath;
}

// 导出为CSV
function exportCSV(records, filename) {
  ensureExportDir();
  const filepath = path.join(CONFIG.exportDir, filename);

  // CSV头
  const headers = ['日期', '曲目', '难度', '达成率', 'DX分数', '评级', 'FC', 'FS', '类型', '获取时间'];
  const rows = [headers.join(',')];

  // 数据行
  for (const r of records) {
    const row = [
      r.date || '',
      `"${(r.title || '').replace(/"/g, '""')}"`,
      r.diff || '',
      r.percentage || '',
      r.dxscore || '',
      r.rate || '',
      r.fc || '',
      r.fs || '',
      r.dx ? 'DX' : 'Standard',
      r.fetchedAt || ''
    ];
    rows.push(row.join(','));
  }

  fs.writeFileSync(filepath, '\uFEFF' + rows.join('\n')); // 添加BOM支持中文
  console.log(`[INFO] 已导出 ${records.length} 条记录到: ${filepath}`);
  return filepath;
}

// 生成统计信息
function generateStats(records) {
  const stats = {
    totalRecords: records.length,
    difficulties: {},
    ratings: {},
    fcTypes: {},
    fsTypes: {},
    dateRange: { earliest: null, latest: null },
    achievements: {
      avgPercentage: 0,
      maxPercentage: 0,
      minPercentage: 100
    }
  };

  let totalPercentage = 0;

  for (const r of records) {
    // 难度统计
    const diff = r.diff || 'Unknown';
    stats.difficulties[diff] = (stats.difficulties[diff] || 0) + 1;

    // 评级统计
    const rate = r.rate || 'Unknown';
    stats.ratings[rate] = (stats.ratings[rate] || 0) + 1;

    // FC统计
    if (r.fc) {
      stats.fcTypes[r.fc] = (stats.fcTypes[r.fc] || 0) + 1;
    }

    // FS统计
    if (r.fs) {
      stats.fsTypes[r.fs] = (stats.fsTypes[r.fs] || 0) + 1;
    }

    // 达成率统计
    const pct = parseFloat(r.percentage) || 0;
    totalPercentage += pct;
    if (pct > stats.achievements.maxPercentage) {
      stats.achievements.maxPercentage = pct;
    }
    if (pct < stats.achievements.minPercentage && pct > 0) {
      stats.achievements.minPercentage = pct;
    }

    // 日期范围
    const date = r.date || r.fetchedAt;
    if (date) {
      if (!stats.dateRange.earliest || date < stats.dateRange.earliest) {
        stats.dateRange.earliest = date;
      }
      if (!stats.dateRange.latest || date > stats.dateRange.latest) {
        stats.dateRange.latest = date;
      }
    }
  }

  stats.achievements.avgPercentage = records.length > 0
    ? (totalPercentage / records.length).toFixed(2)
    : 0;

  return stats;
}

// 打印统计信息
function printStats(stats) {
  console.log('\n' + '='.repeat(50));
  console.log('游玩记录统计');
  console.log('='.repeat(50));

  console.log(`\n总记录数: ${stats.totalRecords}`);
  console.log(`日期范围: ${stats.dateRange.earliest || 'N/A'} ~ ${stats.dateRange.latest || 'N/A'}`);

  console.log('\n--- 难度分布 ---');
  for (const [diff, count] of Object.entries(stats.difficulties).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / stats.totalRecords) * 100).toFixed(1);
    console.log(`  ${diff}: ${count} (${pct}%)`);
  }

  console.log('\n--- 评级分布 ---');
  const ratingOrder = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C', 'D'];
  for (const rate of ratingOrder) {
    if (stats.ratings[rate]) {
      const pct = ((stats.ratings[rate] / stats.totalRecords) * 100).toFixed(1);
      console.log(`  ${rate}: ${stats.ratings[rate]} (${pct}%)`);
    }
  }

  console.log('\n--- FC分布 ---');
  const fcOrder = ['AP+', 'AP', 'FC+', 'FC'];
  for (const fc of fcOrder) {
    if (stats.fcTypes[fc]) {
      console.log(`  ${fc}: ${stats.fcTypes[fc]}`);
    }
  }

  console.log('\n--- FS分布 ---');
  const fsOrder = ['FDX+', 'FDX', 'FS+', 'FS'];
  for (const fs of fsOrder) {
    if (stats.fsTypes[fs]) {
      console.log(`  ${fs}: ${stats.fsTypes[fs]}`);
    }
  }

  console.log('\n--- 达成率 ---');
  console.log(`  平均: ${stats.achievements.avgPercentage}%`);
  console.log(`  最高: ${stats.achievements.maxPercentage}%`);
  console.log(`  最低: ${stats.achievements.minPercentage}%`);

  console.log('\n' + '='.repeat(50));
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    csv: false,
    stats: false,
    days: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv') {
      options.csv = true;
    } else if (args[i] === '--stats') {
      options.stats = true;
    } else if (args[i] === '--days' && args[i + 1]) {
      options.days = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// 主函数
function main() {
  const options = parseArgs();
  const history = loadHistory();

  console.log(`[INFO] 加载历史记录: ${history.records.length} 条`);
  console.log(`[INFO] 累计获取次数: ${history.totalFetches}`);
  console.log(`[INFO] 最后获取时间: ${history.lastFetch}`);

  // 过滤记录
  let records = history.records;
  if (options.days) {
    records = filterByDays(records, options.days);
    console.log(`[INFO] 过滤最近 ${options.days} 天: ${records.length} 条`);
  }

  // 显示统计
  if (options.stats) {
    const stats = generateStats(records);
    printStats(stats);
  }

  // 导出文件
  if (!options.stats || options.csv) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (options.csv) {
      exportCSV(records, `maimai_records_${timestamp}.csv`);
    } else {
      exportJSON(records, `maimai_records_${timestamp}.json`);
    }
  }
}

main();
