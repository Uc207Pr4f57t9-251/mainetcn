/**
 * 增强调试脚本 - 详细检查 Token 和服务器响应
 */

const axios = require('axios')
const fs = require('fs')

const token = {
  ult: '12c4b77a644b9e88a14ab3957aea7703',
  userId: '1646862433816015'
}

async function comprehensiveDebug() {
  console.log('🔍 舞萌 DX Token 完整诊断')
  console.log('='.repeat(70))
  console.log()

  console.log('📋 当前 Token 信息:')
  console.log(`   _t (ult):  ${token.ult}`)
  console.log(`   userId:    ${token.userId}`)
  console.log()

  // 测试多个端点
  const endpoints = [
    {
      name: '玩家数据页面',
      url: 'https://maimai.wahlap.com/maimai-mobile/playerData/',
      critical: true
    },
    {
      name: '首页',
      url: 'https://maimai.wahlap.com/maimai-mobile/home/',
      critical: false
    },
    {
      name: '最近游玩记录',
      url: 'https://maimai.wahlap.com/maimai-mobile/record/',
      critical: false
    }
  ]

  for (const endpoint of endpoints) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`📍 测试: ${endpoint.name}`)
    console.log(`🔗 URL: ${endpoint.url}`)
    console.log('-'.repeat(70))

    try {
      const response = await axios.get(endpoint.url, {
        headers: {
          'Cookie': `_t=${token.ult}; userId=${token.userId}`,
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12; IN2010) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.99 Mobile Safari/537.36 MicroMessenger/8.0.28.2240'
        },
        maxRedirects: 5,
        validateStatus: () => true // 接受所有状态码
      })

      console.log(`✅ 响应状态: ${response.status} ${response.statusText}`)
      console.log()

      // 检查 Set-Cookie
      const setCookie = response.headers['set-cookie']
      if (setCookie) {
        console.log('🍪 服务器返回的新 Cookie:')
        setCookie.forEach(cookie => {
          const match = cookie.match(/^([^=]+)=([^;]+)/)
          if (match) {
            console.log(`   ${match[1]}: ${match[2]}`)
          }
        })
        console.log()
      } else {
        console.log('⚠️  服务器未返回新 Cookie')
        console.log()
      }

      // 分析响应内容
      const html = response.data
      const analysis = analyzeResponse(html)

      console.log('📊 响应内容分析:')
      console.log(`   类型: ${analysis.type}`)
      console.log(`   Token 状态: ${analysis.tokenStatus}`)
      console.log(`   包含玩家数据: ${analysis.hasPlayerData ? '✅' : '❌'}`)
      console.log(`   需要登录: ${analysis.needsAuth ? '⚠️ 是' : '✅ 否'}`)
      console.log()

      if (analysis.errorMessage) {
        console.log(`❌ 错误信息: ${analysis.errorMessage}`)
        console.log()
      }

      if (analysis.foundData.length > 0) {
        console.log('✅ 发现的数据元素:')
        analysis.foundData.forEach(item => {
          console.log(`   - ${item}`)
        })
        console.log()
      }

      // 保存响应
      const filename = `debug_${endpoint.name.replace(/\s+/g, '_')}.html`
      fs.writeFileSync(filename, html, 'utf-8')
      console.log(`💾 完整响应已保存到: ${filename}`)

      // 保存前 1000 字符的预览
      console.log()
      console.log('📄 响应内容预览 (前 1000 字符):')
      console.log('-'.repeat(70))
      console.log(html.substring(0, 1000).replace(/\s+/g, ' '))
      console.log('-'.repeat(70))

    } catch (error) {
      console.log(`❌ 请求失败: ${error.message}`)
      if (error.response) {
        console.log(`   状态码: ${error.response.status}`)
        console.log(`   状态信息: ${error.response.statusText}`)
      }
    }
  }

  console.log()
  console.log('='.repeat(70))
  console.log('📋 诊断总结')
  console.log('='.repeat(70))
  console.log()
  console.log('请检查以上输出，特别注意:')
  console.log('1. 响应状态码是否为 200')
  console.log('2. 是否显示"需要登录"')
  console.log('3. 是否包含玩家数据元素')
  console.log('4. 查看保存的 HTML 文件内容')
  console.log()
  console.log('💡 如果显示需要登录或 Token 无效，请:')
  console.log('   1. 在微信中重新打开「舞萌 DX」公众号')
  console.log('   2. 点击「我的记录」')
  console.log('   3. 使用 HttpCanary 抓取 OAuth 回调请求')
  console.log('   4. 提取 OAuth 认证后的 Cookie')
  console.log()
}

// 分析 HTML 响应内容
function analyzeResponse(html) {
  const analysis = {
    type: 'unknown',
    tokenStatus: 'unknown',
    hasPlayerData: false,
    needsAuth: false,
    errorMessage: null,
    foundData: []
  }

  // 检查是否是错误页面
  if (html.includes('error') || html.includes('错误')) {
    analysis.type = 'error_page'

    // 尝试提取错误信息
    const errorMatch = html.match(/<div[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)<\/div>/i)
    if (errorMatch) {
      analysis.errorMessage = errorMatch[1].trim()
    }
  }

  // 检查是否需要登录
  if (html.includes('login') || html.includes('登录') || html.includes('auth')) {
    analysis.needsAuth = true
    analysis.tokenStatus = 'invalid_or_expired'
  }

  // 检查玩家数据元素
  const playerDataIndicators = [
    'playerData',
    'rating',
    'userName',
    'player_name',
    'player_rating',
    'achievement'
  ]

  playerDataIndicators.forEach(indicator => {
    if (html.includes(indicator)) {
      analysis.hasPlayerData = true
      analysis.foundData.push(indicator)
    }
  })

  // 检查是否是成功的数据页面
  if (analysis.hasPlayerData && !analysis.needsAuth) {
    analysis.type = 'success_page'
    analysis.tokenStatus = 'valid'
  } else if (analysis.needsAuth) {
    analysis.type = 'auth_required'
    analysis.tokenStatus = 'invalid'
  } else {
    analysis.type = 'unknown_page'
  }

  return analysis
}

// 运行诊断
comprehensiveDebug().catch(error => {
  console.error('诊断过程出错:', error)
  process.exit(1)
})
