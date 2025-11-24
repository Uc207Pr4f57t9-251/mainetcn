/**
 * 测试脚本 - 验证 Token 并获取游玩记录
 */

const mainetcn = require('./index.js')

// 你的 Token
let token = {
  ult: '12c4b77a644b9e88a14ab3957aea7703',
  userId: '4151343763005950'
}

async function testAPI() {
  console.log('='.repeat(60))
  console.log('舞萌 DX 国服数据查询测试')
  console.log('='.repeat(60))
  console.log()

  try {
    // 测试 1: 获取玩家资料
    console.log('📊 测试 1: 获取玩家资料...')
    const profileData = await mainetcn.gamedata(token)
    token = profileData.token // 更新 token

    console.log('✅ 玩家资料获取成功！')
    console.log(`   用户名: ${profileData.result.username || '未知'}`)
    console.log(`   Rating: ${profileData.result.rating || '未知'}`)
    console.log()

    // 测试 2: 获取最近游玩记录
    console.log('🎮 测试 2: 获取最近游玩记录...')
    const recentData = await mainetcn.recent(token)
    token = recentData.token // 更新 token

    console.log(`✅ 成功获取 ${recentData.result.length} 条游玩记录！`)
    console.log()
    console.log('最近 5 次游玩:')
    console.log('-'.repeat(60))

    recentData.result.slice(0, 5).forEach((play, index) => {
      console.log(`${index + 1}. ${play.track.title}`)
      console.log(`   难度: ${play.track.difficulty} | 类型: ${play.track.dx ? 'DX' : 'Standard'}`)
      console.log(`   达成率: ${play.grade.achivement}% | 评级: ${play.grade.rank}`)
      console.log(`   DX分数: ${play.grade.dxscore}`)
      console.log(`   FC: ${play.grade.fullcombo ? '✓' : '✗'} | FS: ${play.grade.fullsync ? '✓' : '✗'}`)
      console.log(`   游玩日期: ${play.date}`)
      console.log()
    })

    // 测试 3: 获取 Master 难度记录
    console.log('🎯 测试 3: 获取 Master 难度记录...')
    const masterRecords = await mainetcn.record(token, 'master')
    token = masterRecords.token // 更新 token

    console.log(`✅ 成功获取 ${masterRecords.records.length} 条 Master 记录！`)
    console.log()
    console.log('前 5 条 Master 记录:')
    console.log('-'.repeat(60))

    masterRecords.records.slice(0, 5).forEach((record, index) => {
      console.log(`${index + 1}. ${record.title}`)
      console.log(`   等级: ${record.level} | 类型: ${record.type}`)
      console.log(`   达成率: ${record.achievements}% | 评级: ${record.rate}`)
      console.log(`   DX分数: ${record.dxScore}`)
      console.log(`   FC: ${record.fc} | FS: ${record.fs}`)
      console.log()
    })

    console.log('='.repeat(60))
    console.log('✅ 所有测试完成！')
    console.log('='.repeat(60))
    console.log()
    console.log('📌 更新后的 Token (请保存):')
    console.log(`   ult: ${token.ult}`)
    console.log(`   userId: ${token.userId}`)
    console.log()

  } catch (error) {
    console.error('❌ 错误:', error.message)
    console.error()
    console.error('可能的原因:')
    console.error('1. Token 已过期 (在微信中访问过数据后需要重新抓包)')
    console.error('2. 网络连接问题')
    console.error('3. 服务器返回了错误')
    console.error()
    console.error('完整错误信息:')
    console.error(error)
  }
}

// 运行测试
testAPI()
