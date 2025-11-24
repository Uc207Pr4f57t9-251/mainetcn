/**
 * 测试解析 data/response_body.html
 * 包含完整的去重、数据库保存功能
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  dataDir: path.join(__dirname, 'data'),
  databaseFile: path.join(__dirname, 'data', 'play_history_db.json')
};

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
  }
}

// 生成记录唯一ID
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
      console.log(`✅ 数据库加载成功，已有 ${data.records.length} 条记录\n`);
      return data;
    }
  } catch (err) {
    console.log(`⚠️  数据库加载失败: ${err.message}，将创建新数据库\n`);
  }

  // 返回空数据库结构
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    lastUpdated: null,
    totalFetches: 0,
    records: [],
    recordIndex: {} // 用于快速查找的索引
  };
}

// 保存数据库
function saveDatabase(db) {
  ensureDataDir();
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG.databaseFile, JSON.stringify(db, null, 2));
  console.log(`✅ 数据库已保存，共 ${db.records.length} 条记录`);
}

// 将新记录添加到数据库（去重）
function addRecordsToDatabase(db, newRecords) {
  const addedRecords = [];
  let duplicateCount = 0;

  for (const record of newRecords) {
    const recordId = generateRecordId(record);

    // 检查是否已存在
    if (db.recordIndex[recordId]) {
      duplicateCount++;
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

  return { addedRecords, duplicateCount };
}

// 解析HTML
function parseRecordsHtml(html) {
  console.log(`HTML长度: ${html.length} 字符\n`);

  const records = [];

  // 匹配每个游玩记录块
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

      // 提取曲目名称
      const titleMatch = block.match(/clear\.png"[^>]*\/>([\s\S]*?)<\/div>/);
      let title = '';
      if (titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        // 解码HTML实体
        title = title.replace(/&#039;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>');
      }

      // 提取达成率
      const achieveMatch = block.match(/playlog_achievement_txt[^>]*>(\d+)<span[^>]*>\.([\d]+)%<\/span>/);
      let percentage = '';
      if (achieveMatch) {
        percentage = `${achieveMatch[1]}.${achieveMatch[2]}`;
      }

      // 提取评级
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

      // 提取FC状态
      let fc = null;
      const fcMatch = block.match(/playlog\/(fc_|ap)(\w*)\.png/);
      if (fcMatch && !fcMatch[0].includes('dummy')) {
        const fcType = fcMatch[1] + fcMatch[2];
        const fcMap = { 'ap': 'AP', 'app': 'AP+', 'fc': 'FC', 'fcp': 'FC+' };
        fc = fcMap[fcType.toLowerCase()] || fcType.toUpperCase();
      }

      // 提取FS状态
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
      console.log(`⚠️  解析单条记录失败: ${e.message}`);
    }
  }

  return records;
}

// 主函数
function main() {
  console.log('='.repeat(60));
  console.log('测试解析 data/response_body.html（带去重功能）');
  console.log('='.repeat(60));
  console.log();

  const htmlFile = path.join(__dirname, 'data', 'response_body.html');

  if (!fs.existsSync(htmlFile)) {
    console.error(`❌ 文件不存在: ${htmlFile}`);
    process.exit(1);
  }

  // 步骤1：加载数据库
  console.log('步骤1: 加载历史数据库');
  const db = loadDatabase();

  // 步骤2：读取和解析HTML
  console.log('步骤2: 读取和解析HTML');
  const html = fs.readFileSync(htmlFile, 'utf8');
  const records = parseRecordsHtml(html);

  if (records.length === 0) {
    console.log('⚠️  未找到任何记录');
    process.exit(1);
  }

  console.log(`✅ 成功解析 ${records.length} 条游玩记录\n`);

  // 步骤3：去重并添加到数据库
  console.log('步骤3: 去重并更新数据库');
  const { addedRecords, duplicateCount } = addRecordsToDatabase(db, records);

  console.log(`本次解析: ${records.length} 条`);
  console.log(`新增记录: ${addedRecords.length} 条`);
  console.log(`重复记录: ${duplicateCount} 条（已跳过）`);
  console.log(`数据库总计: ${db.records.length} 条\n`);

  // 显示新增记录
  if (addedRecords.length > 0) {
    console.log('='.repeat(60));
    console.log('新增记录（前10条）');
    console.log('='.repeat(60));
    console.log();

    const displayCount = Math.min(10, addedRecords.length);
    for (let i = 0; i < displayCount; i++) {
      const r = addedRecords[i];
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   难度: ${r.diff} | 日期: ${r.date}`);
      console.log(`   达成率: ${r.percentage}% | 评级: ${r.rate}`);
      console.log(`   DX分数: ${r.dxscore}/${r.dxmax}`);
      console.log();
    }

    if (addedRecords.length > displayCount) {
      console.log(`... 还有 ${addedRecords.length - displayCount} 条新记录\n`);
    }
  } else {
    console.log('ℹ️  所有记录都已存在，没有新增记录\n');
  }

  // 统计信息
  console.log('='.repeat(60));
  console.log('统计信息（数据库总计）');
  console.log('='.repeat(60));

  const stats = {
    total: db.records.length,
    difficulties: {},
    ratings: {},
    fcCount: 0,
    fsCount: 0,
    newRecords: 0,
    dxCount: 0
  };

  for (const r of db.records) {
    stats.difficulties[r.diff] = (stats.difficulties[r.diff] || 0) + 1;
    if (r.rate) stats.ratings[r.rate] = (stats.ratings[r.rate] || 0) + 1;
    if (r.fc) stats.fcCount++;
    if (r.fs) stats.fsCount++;
    if (r.isNewRecord) stats.newRecords++;
    if (r.isDx) stats.dxCount++;
  }

  console.log(`总记录数: ${stats.total}`);
  console.log(`DX谱面: ${stats.dxCount}`);
  console.log(`新纪录: ${stats.newRecords}`);
  console.log(`FC数量: ${stats.fcCount}`);
  console.log(`FS数量: ${stats.fsCount}`);

  console.log('\n难度分布:');
  const diffOrder = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:Master'];
  for (const diff of diffOrder) {
    if (stats.difficulties[diff]) {
      console.log(`  ${diff}: ${stats.difficulties[diff]}`);
    }
  }

  console.log('\n评级分布:');
  const ratingOrder = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA', 'AA', 'A'];
  for (const rate of ratingOrder) {
    if (stats.ratings[rate]) {
      console.log(`  ${rate}: ${stats.ratings[rate]}`);
    }
  }

  // 步骤4：保存数据库
  console.log('\n步骤4: 保存数据库');
  saveDatabase(db);

  console.log('\n='.repeat(60));
  console.log('完成！');
  console.log('='.repeat(60));
  console.log(`数据库文件: ${CONFIG.databaseFile}`);
}

main();
