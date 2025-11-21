/**
 * 完整数据获取脚本 - 获取所有游玩记录并保存为 JSON
 */

const mainetcn = require('./index.js')
const fs = require('fs')
const path = require('path')

// 你的 Token
let token = {
  ult: '12c4b77a644b9e88a14ab3957aea7703',
  userId: '2005990419238350'
}

// 保存数据到 JSON 文件
function saveToJSON(data, filename) {
  const outputDir = path.join(__dirname, 'output')

  // 创建 output 目录（如果不存在）
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir)
  }

  const filepath = path.join(outputDir, filename)
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`✅ 数据已保存到: ${filepath}`)
  return filepath
}

async function getAllData() {
  console.log('='.repeat(70))
  console.log('舞萌 DX 国服 - 完整数据获取')
  console.log('='.repeat(70))
  console.log()

  const allData = {
    fetchTime: new Date().toISOString(),
    profile: null,
    recentPlays: null,
    records: {
      basic: null,
      advanced: null,
      expert: null,
      master: null,
      remaster: null,
      all: null
    },
    updatedToken: null
  }

  try {
    // 1. 获取玩家资料
    console.log('📊 [1/7] 正在获取玩家资料...')
    const profileData = await mainetcn.gamedata(token)
    token = profileData.token
    allData.profile = profileData.result
    console.log(`   ✓ 用户名: ${profileData.result.username || '未知'}`)
    console.log(`   ✓ Rating: ${profileData.result.rating || '未知'}`)
    console.log()

    // 2. 获取最近游玩记录
    console.log('🎮 [2/7] 正在获取最近 50 次游玩记录...')
    const recentData = await mainetcn.recent(token)
    token = recentData.token
    allData.recentPlays = recentData.result
    console.log(`   ✓ 获取了 ${recentData.result.length} 条记录`)
    console.log()

    // 3-7. 获取各难度记录
    const difficulties = [
      { name: 'basic', display: 'Basic (绿谱)', index: 0 },
      { name: 'advanced', display: 'Advanced (黄谱)', index: 1 },
      { name: 'expert', display: 'Expert (红谱)', index: 2 },
      { name: 'master', display: 'Master (紫谱)', index: 3 },
      { name: 'remaster', display: 'Re:Master (白谱)', index: 4 }
    ]

    for (let i = 0; i < difficulties.length; i++) {
      const diff = difficulties[i]
      console.log(`🎯 [${i + 3}/7] 正在获取 ${diff.display} 记录...`)

      try {
        const recordData = await mainetcn.record(token, diff.index)
        token = recordData.token
        allData.records[diff.name] = recordData.records
        console.log(`   ✓ 获取了 ${recordData.records.length} 条记录`)
      } catch (error) {
        console.log(`   ⚠ 获取失败: ${error.message}`)
        allData.records[diff.name] = []
      }

      console.log()

      // 添加延迟避免请求过快
      if (i < difficulties.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // 保存更新后的 token
    allData.updatedToken = token

    console.log('='.repeat(70))
    console.log('✅ 数据获取完成！')
    console.log('='.repeat(70))
    console.log()

    // 统计信息
    console.log('📈 数据统计:')
    console.log(`   - 玩家资料: ✓`)
    console.log(`   - 最近游玩: ${allData.recentPlays.length} 条`)
    console.log(`   - Basic 记录: ${allData.records.basic.length} 条`)
    console.log(`   - Advanced 记录: ${allData.records.advanced.length} 条`)
    console.log(`   - Expert 记录: ${allData.records.expert.length} 条`)
    console.log(`   - Master 记录: ${allData.records.master.length} 条`)
    console.log(`   - Re:Master 记录: ${allData.records.remaster.length} 条`)
    console.log()

    // 保存数据
    console.log('💾 正在保存数据...')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
    const filename = `maimai_data_${timestamp}.json`
    saveToJSON(allData, filename)
    console.log()

    // 保存更新后的 token
    console.log('🔑 更新后的 Token:')
    console.log(`   ult: ${token.ult}`)
    console.log(`   userId: ${token.userId}`)
    console.log()

    saveToJSON(token, 'latest_token.json')
    console.log()

    console.log('='.repeat(70))
    console.log('✨ 全部完成！')
    console.log('='.repeat(70))

    return allData

  } catch (error) {
    console.error()
    console.error('❌ 发生错误:', error.message)
    console.error()
    console.error('可能的原因:')
    console.error('  1. Token 已过期 (需要重新抓包获取)')
    console.error('  2. 网络连接问题')
    console.error('  3. 服务器维护或更新')
    console.error()
    console.error('已获取的数据:')
    console.error(`  - 玩家资料: ${allData.profile ? '✓' : '✗'}`)
    console.error(`  - 最近游玩: ${allData.recentPlays ? '✓' : '✗'}`)
    console.error()

    // 即使出错也尝试保存已获取的数据
    if (allData.profile || allData.recentPlays) {
      console.error('💾 尝试保存已获取的数据...')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
      saveToJSON(allData, `maimai_data_partial_${timestamp}.json`)
    }

    console.error()
    console.error('完整错误信息:')
    console.error(error)

    throw error
  }
}

// 运行
getAllData().catch(() => process.exit(1))
