/**
 * 快速开始脚本 - 使用 token.json 配置文件
 * 运行: node quick_start.js
 */

const mainetcn = require('./index.js')
const fs = require('fs')
const path = require('path')

// Token 文件路径
const TOKEN_FILE = path.join(__dirname, 'token.json')

// 读取 Token
function loadToken() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      console.error('❌ 找不到 token.json 文件！')
      console.error('请创建 token.json 文件，格式如下：')
      console.error(JSON.stringify({ ult: '你的_t值', userId: '你的userId' }, null, 2))
      process.exit(1)
    }

    const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))

    if (!token.ult || !token.userId) {
      console.error('❌ token.json 格式错误！必须包含 ult 和 userId')
      process.exit(1)
    }

    return token
  } catch (error) {
    console.error('❌ 读取 token.json 失败:', error.message)
    process.exit(1)
  }
}

// 保存 Token
function saveToken(token) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2), 'utf-8')
    console.log('✅ Token 已更新并保存到 token.json')
  } catch (error) {
    console.error('⚠️  保存 Token 失败:', error.message)
  }
}

// 主菜单
function showMenu() {
  console.log()
  console.log('='.repeat(60))
  console.log('舞萌 DX 国服数据查询')
  console.log('='.repeat(60))
  console.log()
  console.log('请选择操作：')
  console.log('  1. 获取玩家资料')
  console.log('  2. 获取最近游玩记录')
  console.log('  3. 获取 Master 难度记录')
  console.log('  4. 获取所有难度记录')
  console.log('  5. 获取完整数据并保存为 JSON')
  console.log('  0. 退出')
  console.log()
}

// 主程序
async function main() {
  let token = loadToken()
  console.log('✅ Token 加载成功')

  // 检查命令行参数
  const args = process.argv.slice(2)

  if (args.length === 0) {
    // 交互模式
    console.log('💡 提示: 可以使用命令行参数快速运行')
    console.log('   例如: node quick_start.js profile')
    console.log('   可用参数: profile, recent, master, all, full')
    console.log()
    showMenu()
    return
  }

  const command = args[0].toLowerCase()

  try {
    switch (command) {
      case 'profile':
      case '1':
        await getProfile(token)
        break

      case 'recent':
      case '2':
        await getRecent(token)
        break

      case 'master':
      case '3':
        await getMaster(token)
        break

      case 'all':
      case '4':
        await getAllRecords(token)
        break

      case 'full':
      case '5':
        await getFullData(token)
        break

      default:
        console.error(`❌ 未知命令: ${command}`)
        console.error('可用命令: profile, recent, master, all, full')
        process.exit(1)
    }
  } catch (error) {
    console.error()
    console.error('❌ 发生错误:', error.message)
    console.error()
    console.error('可能的原因:')
    console.error('  1. Token 已过期 - 需要重新抓包')
    console.error('  2. 网络连接问题')
    console.error('  3. 服务器维护中')
    process.exit(1)
  }
}

// 获取玩家资料
async function getProfile(token) {
  console.log()
  console.log('📊 正在获取玩家资料...')
  console.log()

  const result = await mainetcn.gamedata(token)
  saveToken(result.token)

  console.log('玩家信息:')
  console.log('-'.repeat(60))
  console.log(`用户名: ${result.result.username || '未知'}`)
  console.log(`Rating: ${result.result.rating || '未知'}`)
  console.log(`最高 Rating: ${result.result.maxRating || '未知'}`)
  console.log()
}

// 获取最近游玩
async function getRecent(token) {
  console.log()
  console.log('🎮 正在获取最近游玩记录...')
  console.log()

  const result = await mainetcn.recent(token)
  saveToken(result.token)

  console.log(`共获取 ${result.result.length} 条记录`)
  console.log()
  console.log('最近 10 次游玩:')
  console.log('='.repeat(60))

  result.result.slice(0, 10).forEach((play, index) => {
    console.log()
    console.log(`${index + 1}. ${play.track.title}`)
    console.log(`   难度: ${play.track.difficulty} | 类型: ${play.track.dx ? 'DX' : 'Standard'}`)
    console.log(`   达成率: ${play.grade.achivement}% | 评级: ${play.grade.rank}`)
    console.log(`   DX分数: ${play.grade.dxscore} | FC: ${play.grade.fullcombo ? '✓' : '✗'} | FS: ${play.grade.fullsync ? '✓' : '✗'}`)
    console.log(`   日期: ${play.date}`)
  })
  console.log()
}

// 获取 Master 记录
async function getMaster(token) {
  console.log()
  console.log('🎯 正在获取 Master 难度记录...')
  console.log()

  const result = await mainetcn.record(token, 'master')
  saveToken(result.token)

  console.log(`共获取 ${result.records.length} 条 Master 记录`)
  console.log()

  // 按达成率排序
  const sorted = result.records.sort((a, b) => b.achievements - a.achievements)

  console.log('Top 10 最高分:')
  console.log('='.repeat(60))

  sorted.slice(0, 10).forEach((record, index) => {
    console.log()
    console.log(`${index + 1}. ${record.title}`)
    console.log(`   等级: ${record.level} | 类型: ${record.type}`)
    console.log(`   达成率: ${record.achievements}% | 评级: ${record.rate}`)
    console.log(`   DX分数: ${record.dxScore} | FC: ${record.fc} | FS: ${record.fs}`)
  })
  console.log()
}

// 获取所有难度记录
async function getAllRecords(token) {
  console.log()
  console.log('📚 正在获取所有难度记录...')
  console.log()

  const difficulties = [
    { name: 'Basic', level: 'basic' },
    { name: 'Advanced', level: 'advanced' },
    { name: 'Expert', level: 'expert' },
    { name: 'Master', level: 'master' },
    { name: "Re:Master", level: 're:master' }
  ]

  const allRecords = {}

  for (const diff of difficulties) {
    console.log(`  获取 ${diff.name} 记录...`)
    const result = await mainetcn.record(token, diff.level)
    token = result.token
    allRecords[diff.level] = result.records
    console.log(`  ✓ ${result.records.length} 条`)

    // 延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  saveToken(token)

  console.log()
  console.log('统计:')
  console.log('-'.repeat(60))
  Object.entries(allRecords).forEach(([level, records]) => {
    console.log(`${level.padEnd(15)}: ${records.length} 条`)
  })
  console.log()
}

// 获取完整数据
async function getFullData(token) {
  console.log()
  console.log('💾 正在获取完整数据并保存...')
  console.log()

  const outputDir = path.join(__dirname, 'output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir)
  }

  const allData = {
    fetchTime: new Date().toISOString(),
    profile: null,
    recentPlays: null,
    records: {}
  }

  // 玩家资料
  console.log('  [1/7] 玩家资料...')
  const profile = await mainetcn.gamedata(token)
  token = profile.token
  allData.profile = profile.result
  console.log('  ✓')

  // 最近游玩
  console.log('  [2/7] 最近游玩...')
  const recent = await mainetcn.recent(token)
  token = recent.token
  allData.recentPlays = recent.result
  console.log('  ✓')

  // 各难度记录
  const difficulties = ['basic', 'advanced', 'expert', 'master', 're:master']
  for (let i = 0; i < difficulties.length; i++) {
    console.log(`  [${i + 3}/7] ${difficulties[i]} 记录...`)
    const result = await mainetcn.record(token, difficulties[i])
    token = result.token
    allData.records[difficulties[i]] = result.records
    console.log('  ✓')
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // 保存数据
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `maimai_data_${timestamp}.json`
  const filepath = path.join(outputDir, filename)

  fs.writeFileSync(filepath, JSON.stringify(allData, null, 2), 'utf-8')
  saveToken(token)

  console.log()
  console.log('✅ 数据已保存到:', filepath)
  console.log()
}

// 运行
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
