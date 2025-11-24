// 测试解析rec.zip中的HTML
const fs = require('fs');
const path = require('path');

// 读取HTML
const html = fs.readFileSync('/home/user/mainetcn/rec/response_body.html', 'utf8');

console.log(`HTML长度: ${html.length} 字符\n`);

// 匹配记录块
const recordBlockRegex = /<div class="p_10 t_l f_0 v_b">([\s\S]*?)(?=<div class="p_10 t_l f_0 v_b">|<div class="f_0">[\s\S]*?<\/footer>)/g;

let match;
let count = 0;
while ((match = recordBlockRegex.exec(html)) !== null) {
  count++;
  const block = match[1];

  // 测试各个字段提取
  console.log(`\n=== 记录 ${count} ===`);

  // 难度
  const diffMatch = block.match(/diff_(\w+)\.png/);
  console.log(`难度: ${diffMatch ? diffMatch[1] : 'N/A'}`);

  // 日期
  const dateMatch = block.match(/<span class="v_b">(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2})<\/span>/);
  console.log(`日期: ${dateMatch ? dateMatch[1] : 'N/A'}`);

  // 曲目名
  const titleMatch = block.match(/clear\.png"[^>]*\/>([\s\S]*?)<\/div>/);
  let title = '';
  if (titleMatch) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/&#039;/g, "'").trim();
  }
  console.log(`曲目: ${title || 'N/A'}`);

  // 达成率
  const achieveMatch = block.match(/playlog_achievement_txt[^>]*>(\d+)<span[^>]*>\.([\d]+)%<\/span>/);
  console.log(`达成率: ${achieveMatch ? `${achieveMatch[1]}.${achieveMatch[2]}%` : 'N/A'}`);

  // 评级
  const rateMatch = block.match(/playlog\/(\w+)\.png[^>]*class="playlog_scorerank"/);
  console.log(`评级: ${rateMatch ? rateMatch[1] : 'N/A'}`);

  // DX分数
  const dxMatch = block.match(/white p_r_5 f_15 f_r">([\d,]+)\s*\/\s*([\d,]+)<\/div>/);
  console.log(`DX分数: ${dxMatch ? `${dxMatch[1]}/${dxMatch[2]}` : 'N/A'}`);

  // trackId
  const idMatch = block.match(/name="idx" value="([^"]+)"/);
  console.log(`trackId: ${idMatch ? idMatch[1] : 'N/A'}`);

  // 是否DX
  const isDx = block.includes('music_dx.png');
  console.log(`DX谱面: ${isDx ? '是' : '否'}`);

  if (count >= 3) break; // 只测试前3条
}

console.log(`\n总共找到: ${count} 条记录`);
