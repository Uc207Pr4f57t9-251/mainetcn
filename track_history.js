/**
 * 游玩记录历史跟踪器 - 持续获取最新记录并存储到数据库
 * 功能：
 * - 定期获取最近游玩记录
 * - 使用 SQLite 数据库存储
 * - 自动去重（基于时间戳和曲目 ID）
 * - 保存到 data/ 目录
 */

const mainetcn = require('./index.js')
const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')

// 配置
const CONFIG = {
  dataDir: path.join(__dirname, 'data'),
  dbFile: path.join(__dirname, 'data', 'play_history.db'),
  tokenFile: path.join(__dirname, 'token.json'),
  fetchInterval: 5 * 60 * 1000, // 5分钟获取一次
  autoRun: true // 是否自动持续运行
}

// 创建数据目录
function ensureDataDir() {
  if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir)
    console.log(`✅ 创建数据目录: ${CONFIG.dataDir}`)
  }
}

// 初始化数据库
function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(CONFIG.dbFile, (err) => {
      if (err) {
        reject(err)
        return
      }
      console.log(`✅ 连接到数据库: ${CONFIG.dbFile}`)
    })

    // 创建游玩记录表
    db.run(`
      CREATE TABLE IF NOT EXISTS play_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL,
        title TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        level TEXT,
        dx_score INTEGER,
        achievement REAL,
        fc_status TEXT,
        fs_status TEXT,
        play_time DATETIME,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_data TEXT,
        UNIQUE(track_id, play_time, difficulty)
      )
    `, (err) => {
      if (err) {
        reject(err)
        return
      }
      console.log('✅ 数据表初始化完成')
      resolve(db)
    })

    // 创建索引以加速查询
    db.run(`CREATE INDEX IF NOT EXISTS idx_play_time ON play_records(play_time DESC)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_track_id ON play_records(track_id)`)
  })
}

// 读取 Token
function loadToken() {
  try {
    if (!fs.existsSync(CONFIG.tokenFile)) {
      throw new Error(`Token 文件不存在: ${CONFIG.tokenFile}`)
    }
    const tokenData = JSON.parse(fs.readFileSync(CONFIG.tokenFile, 'utf-8'))
    console.log(`✅ 加载 Token: userId=${tokenData.userId}`)
    return tokenData
  } catch (error) {
    console.error(`❌ 读取 Token 失败: ${error.message}`)
    throw error
  }
}

// 保存更新后的 Token
function saveToken(token) {
  try {
    fs.writeFileSync(CONFIG.tokenFile, JSON.stringify(token, null, 2), 'utf-8')
    console.log(`✅ Token 已更新`)
  } catch (error) {
    console.error(`❌ 保存 Token 失败: ${error.message}`)
  }
}

// 插入记录到数据库（自动去重）
function insertRecords(db, records) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO play_records (
        track_id, title, difficulty, level, dx_score, achievement,
        fc_status, fs_status, play_time, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let insertCount = 0
    let duplicateCount = 0

    db.serialize(() => {
      db.run('BEGIN TRANSACTION')

      records.forEach(record => {
        // 提取关键字段
        const trackId = record.id || ''
        const title = record.title || '未知曲目'
        const difficulty = record.level_index || 0
        const level = record.level_label || ''
        const dxScore = record.dxScore || 0
        const achievement = record.achievements ? parseFloat(record.achievements) : 0
        const fcStatus = record.fc || ''
        const fsStatus = record.fs || ''

        // 使用当前时间作为游玩时间（因为 API 不提供精确时间）
        // 实际应该从 record 中提取，但 mainetcn API 没有提供时间戳
        const playTime = new Date().toISOString()

        const rawData = JSON.stringify(record)

        stmt.run([
          trackId, title, difficulty, level, dxScore, achievement,
          fcStatus, fsStatus, playTime, rawData
        ], function(err) {
          if (err) {
            // 如果是重复记录，忽略错误
            if (err.code === 'SQLITE_CONSTRAINT') {
              duplicateCount++
            } else {
              console.error(`插入记录失败: ${err.message}`)
            }
          } else if (this.changes > 0) {
            insertCount++
          } else {
            duplicateCount++
          }
        })
      })

      db.run('COMMIT', (err) => {
        stmt.finalize()
        if (err) {
          reject(err)
        } else {
          resolve({ insertCount, duplicateCount })
        }
      })
    })
  })
}

// 获取数据库统计信息
function getStats(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as total FROM play_records', (err, row) => {
      if (err) {
        reject(err)
      } else {
        resolve(row.total)
      }
    })
  })
}

// 获取最新记录
async function fetchAndStore(db, token) {
  console.log('\n' + '='.repeat(70))
  console.log(`⏰ ${new Date().toLocaleString('zh-CN')} - 开始获取游玩记录`)
  console.log('='.repeat(70))

  try {
    // 获取最近游玩记录
    const result = await mainetcn.recent(token)

    // 更新 Token
    token = result.token
    saveToken(token)

    const records = result.result
    console.log(`📥 获取到 ${records.length} 条记录`)

    // 插入数据库
    const { insertCount, duplicateCount } = await insertRecords(db, records)

    console.log(`✅ 新增记录: ${insertCount} 条`)
    console.log(`⚠️  重复记录（已忽略）: ${duplicateCount} 条`)

    // 显示数据库统计
    const totalRecords = await getStats(db)
    console.log(`📊 数据库总记录数: ${totalRecords} 条`)

    return token

  } catch (error) {
    console.error(`❌ 获取失败: ${error.message}`)
    throw error
  }
}

// 导出数据到 JSON
function exportToJSON(db, outputFile) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM play_records
      ORDER BY play_time DESC
    `, (err, rows) => {
      if (err) {
        reject(err)
        return
      }

      const data = {
        exportTime: new Date().toISOString(),
        totalRecords: rows.length,
        records: rows.map(row => ({
          ...row,
          raw_data: JSON.parse(row.raw_data)
        }))
      }

      fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8')
      console.log(`✅ 数据已导出到: ${outputFile}`)
      resolve(data)
    })
  })
}

// 主函数
async function main() {
  console.log('='.repeat(70))
  console.log('舞萌 DX 游玩记录历史跟踪器')
  console.log('='.repeat(70))
  console.log()

  try {
    // 初始化
    ensureDataDir()
    const db = await initDatabase()
    let token = loadToken()

    console.log()
    console.log('📋 配置信息:')
    console.log(`   数据目录: ${CONFIG.dataDir}`)
    console.log(`   数据库文件: ${CONFIG.dbFile}`)
    console.log(`   获取间隔: ${CONFIG.fetchInterval / 1000 / 60} 分钟`)
    console.log()

    // 首次获取
    token = await fetchAndStore(db, token)

    if (CONFIG.autoRun) {
      console.log()
      console.log('🔄 持续监控模式已启动')
      console.log(`   下次获取时间: ${new Date(Date.now() + CONFIG.fetchInterval).toLocaleString('zh-CN')}`)
      console.log('   按 Ctrl+C 停止')
      console.log()

      // 定期获取
      const intervalId = setInterval(async () => {
        try {
          token = await fetchAndStore(db, token)
          console.log(`   下次获取时间: ${new Date(Date.now() + CONFIG.fetchInterval).toLocaleString('zh-CN')}`)
        } catch (error) {
          console.error('定期获取失败，将在下次间隔重试')
        }
      }, CONFIG.fetchInterval)

      // 优雅退出
      process.on('SIGINT', async () => {
        console.log('\n\n⏹️  正在停止...')
        clearInterval(intervalId)

        // 导出数据
        const exportFile = path.join(CONFIG.dataDir, `export_${new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]}.json`)
        await exportToJSON(db, exportFile)

        db.close((err) => {
          if (err) {
            console.error('关闭数据库失败:', err.message)
          } else {
            console.log('✅ 数据库已关闭')
          }
          console.log('👋 再见！')
          process.exit(0)
        })
      })

    } else {
      // 单次运行模式
      const exportFile = path.join(CONFIG.dataDir, `export_${new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]}.json`)
      await exportToJSON(db, exportFile)

      db.close()
      console.log()
      console.log('✅ 完成！')
    }

  } catch (error) {
    console.error()
    console.error('❌ 发生错误:', error.message)
    console.error()
    console.error('完整错误信息:')
    console.error(error)
    process.exit(1)
  }
}

// 命令行参数处理
const args = process.argv.slice(2)
if (args.includes('--once')) {
  CONFIG.autoRun = false
  console.log('🔧 单次运行模式')
}

if (args.includes('--export')) {
  // 仅导出模式
  ensureDataDir()
  initDatabase().then(db => {
    const exportFile = path.join(CONFIG.dataDir, `export_${new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]}.json`)
    return exportToJSON(db, exportFile).then(() => {
      db.close()
      console.log('✅ 导出完成！')
      process.exit(0)
    })
  }).catch(err => {
    console.error('导出失败:', err.message)
    process.exit(1)
  })
} else {
  // 运行主程序
  main()
}
