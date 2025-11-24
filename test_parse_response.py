#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试解析 data/response_body.html
包含完整的去重、数据库保存功能
"""

import os
import json
import re
import html
from datetime import datetime
from pathlib import Path
import base64

# 配置
class Config:
    BASE_DIR = Path(__file__).parent
    DATA_DIR = BASE_DIR / 'data'
    DATABASE_FILE = DATA_DIR / 'play_history_db.json'

# 确保数据目录存在
def ensure_data_dir():
    Config.DATA_DIR.mkdir(parents=True, exist_ok=True)

# 生成记录唯一ID
def generate_record_id(record):
    if record.get('trackId'):
        return f"track_{record['trackId']}"

    # 备用方案：使用曲目+难度+日期+达成率组合
    key = f"{record['title']}_{record['diff']}_{record['date']}_{record['percentage']}"
    # 使用base64编码并移除特殊字符
    encoded = base64.b64encode(key.encode('utf-8')).decode('utf-8')
    encoded = encoded.replace('=', '').replace('+', '').replace('/', '')
    return f"combo_{encoded}"

# 加载数据库
def load_database():
    ensure_data_dir()

    try:
        if Config.DATABASE_FILE.exists():
            with open(Config.DATABASE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print(f"✅ 数据库加载成功，已有 {len(data['records'])} 条记录\n")
            return data
    except Exception as e:
        print(f"⚠️  数据库加载失败: {e}，将创建新数据库\n")

    # 返回空数据库结构
    return {
        'version': 1,
        'createdAt': datetime.now().isoformat(),
        'lastUpdated': None,
        'totalFetches': 0,
        'records': [],
        'recordIndex': {}  # 用于快速查找的索引
    }

# 保存数据库
def save_database(db):
    ensure_data_dir()
    db['lastUpdated'] = datetime.now().isoformat()

    with open(Config.DATABASE_FILE, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    print(f"✅ 数据库已保存，共 {len(db['records'])} 条记录")

# 将新记录添加到数据库（去重）
def add_records_to_database(db, new_records):
    added_records = []
    duplicate_count = 0

    for record in new_records:
        record_id = generate_record_id(record)

        # 检查是否已存在
        if record_id in db['recordIndex']:
            duplicate_count += 1
            continue

        # 添加元数据
        enriched_record = {
            **record,
            '_id': record_id,
            '_fetchedAt': datetime.now().isoformat()
        }

        # 添加到数据库
        db['records'].append(enriched_record)
        db['recordIndex'][record_id] = True
        added_records.append(enriched_record)

    db['totalFetches'] += 1

    return {
        'addedRecords': added_records,
        'duplicateCount': duplicate_count
    }

# 解析HTML
def parse_records_html(html_content):
    print(f"HTML长度: {len(html_content)} 字符\n")

    records = []

    # 匹配每个游玩记录块
    record_block_pattern = r'<div class="p_10 t_l f_0 v_b">([\s\S]*?)(?=<div class="p_10 t_l f_0 v_b">|<div class="f_0">[\s\S]*?</footer>)'

    for match in re.finditer(record_block_pattern, html_content):
        block = match.group(1)

        try:
            # 提取难度
            diff_match = re.search(r'diff_(\w+)\.png', block)
            diff_map = {
                'basic': 'Basic',
                'advanced': 'Advanced',
                'expert': 'Expert',
                'master': 'Master',
                'remaster': 'Re:Master'
            }
            diff = diff_map.get(diff_match.group(1), diff_match.group(1)) if diff_match else 'Unknown'

            # 提取日期时间
            date_match = re.search(r'<span class="v_b">(\d{4}/\d{2}/\d{2} \d{2}:\d{2})</span>', block)
            date = date_match.group(1) if date_match else ''

            # 提取曲目名称
            title_match = re.search(r'clear\.png"[^>]*/>([\s\S]*?)</div>', block)
            title = ''
            if title_match:
                title = re.sub(r'<[^>]+>', '', title_match.group(1)).strip()
                # 解码HTML实体
                title = html.unescape(title)

            # 提取达成率
            achieve_match = re.search(r'playlog_achievement_txt[^>]*>(\d+)<span[^>]*>\.([\d]+)%</span>', block)
            percentage = f"{achieve_match.group(1)}.{achieve_match.group(2)}" if achieve_match else ''

            # 提取评级
            rate_match = re.search(r'playlog/(\w+)\.png[^>]*class="playlog_scorerank"', block)
            rate = ''
            if rate_match:
                rate_map = {
                    'sssp': 'SSS+', 'sss': 'SSS', 'ssp': 'SS+', 'ss': 'SS',
                    'sp': 'S+', 's': 'S', 'aaa': 'AAA', 'aa': 'AA', 'a': 'A',
                    'bbb': 'BBB', 'bb': 'BB', 'b': 'B', 'c': 'C', 'd': 'D'
                }
                rate = rate_map.get(rate_match.group(1).lower(), rate_match.group(1).upper())

            # 提取DX分数
            dx_match = re.search(r'white p_r_5 f_15 f_r">([\d,]+)\s*/\s*([\d,]+)</div>', block)
            dxscore = dx_match.group(1).replace(',', '') if dx_match else ''
            dxmax = dx_match.group(2).replace(',', '') if dx_match else ''

            # 提取FC状态
            fc = None
            fc_match = re.search(r'playlog/(fc_|ap)(\w*)\.png', block)
            if fc_match and 'dummy' not in fc_match.group(0):
                fc_type = fc_match.group(1) + fc_match.group(2)
                fc_map = {'ap': 'AP', 'app': 'AP+', 'fc': 'FC', 'fcp': 'FC+'}
                fc = fc_map.get(fc_type.lower(), fc_type.upper())

            # 提取FS状态
            fs = None
            fs_match = re.search(r'playlog/(sync_|fs|fsd)(\w*)\.png', block)
            if fs_match and 'dummy' not in fs_match.group(0):
                fs_type = fs_match.group(1) + fs_match.group(2)
                fs_map = {'sync': 'SYNC', 'fs': 'FS', 'fsp': 'FS+', 'fsd': 'FDX', 'fsdp': 'FDX+'}
                fs = fs_map.get(fs_type.lower(), fs_type.upper())

            # 提取记录ID
            id_match = re.search(r'name="idx" value="([^"]+)"', block)
            track_id = id_match.group(1) if id_match else ''

            # 是否是DX谱面
            is_dx = 'music_dx.png' in block

            # 是否New Record
            is_new_record = 'newrecord.png' in block

            if title:
                records.append({
                    'title': title,
                    'diff': diff,
                    'percentage': percentage,
                    'rate': rate,
                    'date': date,
                    'fc': fc,
                    'fs': fs,
                    'dxscore': dxscore,
                    'dxmax': dxmax,
                    'trackId': track_id,
                    'isDx': is_dx,
                    'isNewRecord': is_new_record
                })

        except Exception as e:
            print(f"⚠️  解析单条记录失败: {e}")

    return records

# 主函数
def main():
    print('=' * 60)
    print('测试解析 data/response_body.html（带去重功能）')
    print('=' * 60)
    print()

    html_file = Config.DATA_DIR / 'response_body.html'

    if not html_file.exists():
        print(f"❌ 文件不存在: {html_file}")
        return

    # 步骤1：加载数据库
    print('步骤1: 加载历史数据库')
    db = load_database()

    # 步骤2：读取和解析HTML
    print('步骤2: 读取和解析HTML')
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()

    records = parse_records_html(html_content)

    if not records:
        print('⚠️  未找到任何记录')
        return

    print(f"✅ 成功解析 {len(records)} 条游玩记录\n")

    # 步骤3：去重并添加到数据库
    print('步骤3: 去重并更新数据库')
    result = add_records_to_database(db, records)
    added_records = result['addedRecords']
    duplicate_count = result['duplicateCount']

    print(f"本次解析: {len(records)} 条")
    print(f"新增记录: {len(added_records)} 条")
    print(f"重复记录: {duplicate_count} 条（已跳过）")
    print(f"数据库总计: {len(db['records'])} 条\n")

    # 显示新增记录
    if added_records:
        print('=' * 60)
        print('新增记录（前10条）')
        print('=' * 60)
        print()

        display_count = min(10, len(added_records))
        for i in range(display_count):
            r = added_records[i]
            print(f"{i + 1}. {r['title']}")
            print(f"   难度: {r['diff']} | 日期: {r['date']}")
            print(f"   达成率: {r['percentage']}% | 评级: {r['rate']}")
            print(f"   DX分数: {r['dxscore']}/{r['dxmax']}")
            print()

        if len(added_records) > display_count:
            print(f"... 还有 {len(added_records) - display_count} 条新记录\n")
    else:
        print('ℹ️  所有记录都已存在，没有新增记录\n')

    # 统计信息
    print('=' * 60)
    print('统计信息（数据库总计）')
    print('=' * 60)

    stats = {
        'total': len(db['records']),
        'difficulties': {},
        'ratings': {},
        'fcCount': 0,
        'fsCount': 0,
        'newRecords': 0,
        'dxCount': 0
    }

    for r in db['records']:
        # 难度分布
        diff = r['diff']
        stats['difficulties'][diff] = stats['difficulties'].get(diff, 0) + 1

        # 评级分布
        if r['rate']:
            rate = r['rate']
            stats['ratings'][rate] = stats['ratings'].get(rate, 0) + 1

        # 计数
        if r['fc']:
            stats['fcCount'] += 1
        if r['fs']:
            stats['fsCount'] += 1
        if r['isNewRecord']:
            stats['newRecords'] += 1
        if r['isDx']:
            stats['dxCount'] += 1

    print(f"总记录数: {stats['total']}")
    print(f"DX谱面: {stats['dxCount']}")
    print(f"新纪录: {stats['newRecords']}")
    print(f"FC数量: {stats['fcCount']}")
    print(f"FS数量: {stats['fsCount']}")

    print('\n难度分布:')
    diff_order = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:Master']
    for diff in diff_order:
        if diff in stats['difficulties']:
            print(f"  {diff}: {stats['difficulties'][diff]}")

    print('\n评级分布:')
    rating_order = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA', 'AA', 'A']
    for rate in rating_order:
        if rate in stats['ratings']:
            print(f"  {rate}: {stats['ratings'][rate]}")

    # 步骤4：保存数据库
    print('\n步骤4: 保存数据库')
    save_database(db)

    print('\n' + '=' * 60)
    print('完成！')
    print('=' * 60)
    print(f"数据库文件: {Config.DATABASE_FILE}")

if __name__ == '__main__':
    main()
