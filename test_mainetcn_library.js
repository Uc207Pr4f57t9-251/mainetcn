/**
 * 测试 mainetcn 库的原生 API
 *
 * 尝试使用库自带的record()函数获取数据
 */

const mainetcn = require('./index');
const fs = require('fs');
const path = require('path');

async function testLibrary() {
  console.log('='.repeat(60));
  console.log('测试 mainetcn 库原生 API');
  console.log('='.repeat(60));

  try {
    // 读取token
    const tokenData = JSON.parse(fs.readFileSync('token.json', 'utf8'));
    const token = {
      ult: tokenData.ult,
      userId: tokenData.userId
    };

    console.log(`\nToken信息:`);
    console.log(`  ult: ${token.ult.substring(0, 8)}...`);
    console.log(`  userId: ${token.userId}`);

    // 测试获取Expert难度的所有记录
    console.log('\n正在获取 Expert 难度的所有最佳成绩...');
    const result = await mainetcn.record(token, 'expert');

    console.log(`\n✅ 成功！获取了 ${result.records.length} 条记录\n`);

    // 显示前5条记录
    console.log('前5条记录：');
    for (let i = 0; i < Math.min(5, result.records.length); i++) {
      const r = result.records[i];
      console.log(`\n  ${i + 1}. ${r.title}`);
      console.log(`     类型: ${r.type} | 难度: ${r.diff} | 等级: ${r.level}`);
      console.log(`     达成率: ${r.achievements}% | 评级: ${r.rate}`);
      console.log(`     DX分数: ${r.dxScore} | FC: ${r.fc || 'None'} | FS: ${r.fs || 'None'}`);
    }

    // 保存结果
    const outputDir = path.join(__dirname, 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'mainetcn_library_result.json');
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n结果已保存到: ${outputFile}`);

    // 检查返回的新token
    if (result.token) {
      console.log(`\n新Token: ${result.token.ult.substring(0, 8)}...`);
    }

    return true;
  } catch (err) {
    console.error('\n❌ 错误:', err.message);
    console.error('详细信息:', err);
    return false;
  }
}

testLibrary().then(success => {
  process.exit(success ? 0 : 1);
});
