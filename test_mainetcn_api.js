/**
 * 测试 mainetcn 库的 API
 */

const mainetcn = require('./index');
const fs = require('fs');
const path = require('path');

async function testMainetcnAPI() {
  console.log('='.repeat(60));
  console.log('测试 mainetcn 库的 API');
  console.log('='.repeat(60));

  // 读取 token
  const tokenData = JSON.parse(fs.readFileSync('token.json', 'utf8'));
  const token = {
    ult: tokenData.ult,
    userId: tokenData.userId
  };

  console.log('\n1. 测试 record() - 获取 Expert 难度的所有最佳成绩');
  try {
    const result = await mainetcn.record(token, 'expert');
    console.log(`✅ 成功获取 ${result.records.length} 条记录`);
    console.log('\n前3条记录示例：');
    for (let i = 0; i < Math.min(3, result.records.length); i++) {
      const r = result.records[i];
      console.log(`  ${i + 1}. ${r.title}`);
      console.log(`     难度: ${r.diff} | 达成率: ${r.achievements}% | 评级: ${r.rate}`);
    }

    // 保存结果
    fs.writeFileSync('data/mainetcn_api_result.json', JSON.stringify(result, null, 2));
    console.log('\n结果已保存到: data/mainetcn_api_result.json');
  } catch (err) {
    console.error('❌ 错误:', err.message);
    console.error('详细信息:', err);
  }
}

testMainetcnAPI();
