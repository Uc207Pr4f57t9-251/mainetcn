/**
 * 调试脚本 - 查看服务器实际返回的内容
 */

const axios = require('axios')

const token = {
  ult: '12c4b77a644b9e88a14ab3957aea7703',
  userId: '1646862433816015'
}

async function debugRequest() {
  console.log('🔍 调试 Token 请求...')
  console.log('Token 信息:')
  console.log(`  ult: ${token.ult}`)
  console.log(`  userId: ${token.userId}`)
  console.log()

  try {
    console.log('正在请求: https://maimai.wahlap.com/maimai-mobile/playerData/')
    console.log()

    const response = await axios.get('https://maimai.wahlap.com/maimai-mobile/playerData/', {
      headers: {
        Cookie: `_t=${token.ult}; userId=${token.userId}`
      }
    })

    console.log('✅ 请求成功！')
    console.log()
    console.log('响应状态码:', response.status)
    console.log('响应头 Set-Cookie:', response.headers['set-cookie'])
    console.log()

    // 保存响应内容到文件
    const fs = require('fs')
    fs.writeFileSync('debug_response.html', response.data, 'utf-8')
    console.log('✅ 响应内容已保存到 debug_response.html')
    console.log()

    // 检查响应中是否包含错误信息
    if (response.data.includes('error') || response.data.includes('错误')) {
      console.log('⚠️  响应中可能包含错误信息，请查看 debug_response.html')
    }

    // 检查是否包含玩家数据相关的元素
    if (response.data.includes('playerData') || response.data.includes('rating')) {
      console.log('✅ 响应中包含玩家数据元素，Token 可能有效')
    } else {
      console.log('❌ 响应中未找到玩家数据元素，Token 可能已失效')
    }

    // 显示前 500 个字符
    console.log()
    console.log('响应内容预览（前 500 字符）:')
    console.log('-'.repeat(60))
    console.log(response.data.substring(0, 500))
    console.log('-'.repeat(60))

  } catch (error) {
    console.error('❌ 请求失败:', error.message)

    if (error.response) {
      console.log()
      console.log('服务器响应状态码:', error.response.status)
      console.log('服务器响应内容:')
      console.log(error.response.data)
    }
  }
}

debugRequest()
