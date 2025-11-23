/**
 * 游玩历史数据查询工具
 * 用于查询 track_history.js 生成的数据库
 */

const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

const DB_FILE = path.join(__dirname, 'data', 'play_history.db')

// 检查数据库是否存在
if (!fs.existsSync(DB_FILE)) {
  console.error('❌ 数据库文件不存在！')
  console.error(`   请先运行: node track_history.js`)
  process.exit(1)
}

const db = new sqlite3.Database(DB_FILE)

// 查询函数集合
const queries = {
  // 总览统计
  overview: () => {
    console.log('\n📊 数据库总览')
    console.log('='.repeat(60))

    db.get('SELECT COUNT(*) as total FROM play_records', (err, row) => {
      if (err) throw err
      console.log(`总记录数: ${row.total}`)

      db.get('SELECT COUNT(DISTINCT track_id) as unique_tracks FROM play_records', (err, row) => {
        if (err) throw err
        console.log(`不同曲目: ${row.unique_tracks}`)

        db.get('SELECT AVG(achievement) as avg FROM play_records', (err, row) => {
          if (err) throw err
          console.log(`平均达成率: ${row.avg.toFixed(2)}%`)

          db.get('SELECT MAX(achievement) as max FROM play_records', (err, row) => {
            if (err) throw err
            console.log(`最高达成率: ${row.max}%`)
            db.close()
          })
        })
      })
    })
  },

  // 最近游玩记录
  recent: (limit = 10) => {
    console.log(`\n🎮 最近 ${limit} 次游玩`)
    console.log('='.repeat(60))

    db.all(`
      SELECT title, level, achievement, fc_status, fs_status,
             datetime(play_time, 'localtime') as time
      FROM play_records
      ORDER BY id DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) throw err

      rows.forEach((row, i) => {
        const fc = row.fc_status ? `[${row.fc_status.toUpperCase()}]` : ''
        const fs = row.fs_status ? `[${row.fs_status.toUpperCase()}]` : ''
        console.log(`${i + 1}. ${row.title} (${row.level})`)
        console.log(`   ${row.achievement}% ${fc} ${fs} - ${row.time}`)
      })

      db.close()
    })
  },

  // FC/FS 统计
  fcStats: () => {
    console.log('\n🏆 FC/FS 统计')
    console.log('='.repeat(60))

    db.all(`
      SELECT fc_status, COUNT(*) as count
      FROM play_records
      WHERE fc_status != ''
      GROUP BY fc_status
      ORDER BY count DESC
    `, (err, rows) => {
      if (err) throw err

      console.log('FC 状态分布:')
      rows.forEach(row => {
        console.log(`  ${row.fc_status.toUpperCase()}: ${row.count} 次`)
      })

      db.all(`
        SELECT fs_status, COUNT(*) as count
        FROM play_records
        WHERE fs_status != ''
        GROUP BY fs_status
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) throw err

        console.log('\nFS 状态分布:')
        rows.forEach(row => {
          console.log(`  ${row.fs_status.toUpperCase()}: ${row.count} 次`)
        })

        db.close()
      })
    })
  },

  // 最佳成绩
  best: (limit = 10) => {
    console.log(`\n⭐ Top ${limit} 最佳成绩`)
    console.log('='.repeat(60))

    db.all(`
      SELECT title, level, MAX(achievement) as best_achievement,
             fc_status, fs_status
      FROM play_records
      GROUP BY track_id, difficulty
      ORDER BY best_achievement DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) throw err

      rows.forEach((row, i) => {
        const fc = row.fc_status ? `[${row.fc_status.toUpperCase()}]` : ''
        const fs = row.fs_status ? `[${row.fs_status.toUpperCase()}]` : ''
        console.log(`${i + 1}. ${row.title} (${row.level})`)
        console.log(`   ${row.best_achievement}% ${fc} ${fs}`)
      })

      db.close()
    })
  },

  // 搜索曲目
  search: (keyword) => {
    console.log(`\n🔍 搜索: "${keyword}"`)
    console.log('='.repeat(60))

    db.all(`
      SELECT title, level, achievement, fc_status, fs_status,
             datetime(play_time, 'localtime') as time
      FROM play_records
      WHERE title LIKE ?
      ORDER BY play_time DESC
    `, [`%${keyword}%`], (err, rows) => {
      if (err) throw err

      if (rows.length === 0) {
        console.log('未找到匹配的记录')
      } else {
        console.log(`找到 ${rows.length} 条记录:\n`)
        rows.forEach((row, i) => {
          const fc = row.fc_status ? `[${row.fc_status.toUpperCase()}]` : ''
          const fs = row.fs_status ? `[${row.fs_status.toUpperCase()}]` : ''
          console.log(`${i + 1}. ${row.title} (${row.level})`)
          console.log(`   ${row.achievement}% ${fc} ${fs} - ${row.time}`)
        })
      }

      db.close()
    })
  },

  // 难度分布
  difficultyStats: () => {
    console.log('\n📈 难度分布统计')
    console.log('='.repeat(60))

    const diffNames = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:Master']

    db.all(`
      SELECT difficulty, COUNT(*) as count, AVG(achievement) as avg_ach
      FROM play_records
      GROUP BY difficulty
      ORDER BY difficulty
    `, (err, rows) => {
      if (err) throw err

      rows.forEach(row => {
        const diffName = diffNames[row.difficulty] || `Unknown(${row.difficulty})`
        console.log(`${diffName}: ${row.count} 次游玩, 平均达成率 ${row.avg_ach.toFixed(2)}%`)
      })

      db.close()
    })
  },

  // 自定义 SQL
  custom: (sql) => {
    console.log('\n🔧 自定义查询')
    console.log('='.repeat(60))
    console.log(`SQL: ${sql}\n`)

    db.all(sql, (err, rows) => {
      if (err) {
        console.error('❌ 查询失败:', err.message)
        db.close()
        return
      }

      if (rows.length === 0) {
        console.log('无结果')
      } else {
        console.table(rows)
      }

      db.close()
    })
  }
}

// 命令行参数处理
const args = process.argv.slice(2)
const command = args[0] || 'overview'

console.log('='.repeat(60))
console.log('舞萌 DX 游玩历史查询工具')
console.log('='.repeat(60))

switch (command) {
  case 'overview':
  case 'stats':
    queries.overview()
    break

  case 'recent':
    const recentLimit = parseInt(args[1]) || 10
    queries.recent(recentLimit)
    break

  case 'fc':
  case 'fcstats':
    queries.fcStats()
    break

  case 'best':
  case 'top':
    const bestLimit = parseInt(args[1]) || 10
    queries.best(bestLimit)
    break

  case 'search':
  case 'find':
    if (!args[1]) {
      console.error('\n❌ 请提供搜索关键词')
      console.error('用法: node query_history.js search 曲目名')
      process.exit(1)
    }
    queries.search(args[1])
    break

  case 'difficulty':
  case 'diff':
    queries.difficultyStats()
    break

  case 'sql':
    if (!args[1]) {
      console.error('\n❌ 请提供 SQL 语句')
      console.error('用法: node query_history.js sql "SELECT * FROM play_records LIMIT 5"')
      process.exit(1)
    }
    queries.custom(args.slice(1).join(' '))
    break

  case 'help':
  default:
    console.log('\n📖 使用说明:')
    console.log('\n基础命令:')
    console.log('  node query_history.js overview          - 数据库总览（默认）')
    console.log('  node query_history.js recent [数量]     - 最近游玩记录（默认 10）')
    console.log('  node query_history.js fc                - FC/FS 统计')
    console.log('  node query_history.js best [数量]       - 最佳成绩 Top N（默认 10）')
    console.log('  node query_history.js search <关键词>   - 搜索曲目')
    console.log('  node query_history.js difficulty        - 难度分布统计')
    console.log('  node query_history.js sql "<SQL语句>"   - 自定义 SQL 查询')
    console.log('\n示例:')
    console.log('  node query_history.js recent 20')
    console.log('  node query_history.js search "fragrance"')
    console.log('  node query_history.js best 5')
    console.log('  node query_history.js sql "SELECT * FROM play_records WHERE achievement > 99"')
    console.log()
    db.close()
    break
}
