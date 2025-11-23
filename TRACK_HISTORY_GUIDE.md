# 游玩记录历史跟踪器使用指南

## 📋 功能介绍

`track_history.js` 是一个自动化的游玩记录跟踪工具，可以：

- ✅ **持续获取**最新的游玩记录
- ✅ **SQLite 数据库**存储，高效可靠
- ✅ **自动去重**，避免重复记录
- ✅ **定期更新**，默认每 5 分钟获取一次
- ✅ **导出功能**，支持导出为 JSON 格式
- ✅ **本地存储**，所有数据保存在 `data/` 目录

## 🚀 快速开始

### 1. 安装依赖

首次使用需要安装 SQLite3 依赖：

```bash
npm install sqlite3
```

### 2. 准备 Token

确保项目根目录有 `token.json` 文件：

```json
{
  "ult": "你的_t值",
  "userId": "你的userId"
}
```

### 3. 运行脚本

**持续监控模式**（推荐）：

```bash
node track_history.js
```

这将：
- 立即获取一次最新记录
- 每 5 分钟自动获取一次
- 持续运行直到手动停止（Ctrl+C）
- 停止时自动导出数据到 JSON

**单次运行模式**：

```bash
node track_history.js --once
```

这将：
- 只获取一次记录
- 保存到数据库
- 导出为 JSON 文件
- 立即退出

**仅导出模式**：

```bash
node track_history.js --export
```

这将从现有数据库导出数据到 JSON 文件，不进行新的获取。

## 📊 数据结构

### 数据库表结构

```sql
CREATE TABLE play_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id TEXT NOT NULL,           -- 曲目 ID
  title TEXT NOT NULL,               -- 曲目名称
  difficulty INTEGER NOT NULL,       -- 难度等级（0-4）
  level TEXT,                        -- 难度标签（如 "13+"）
  dx_score INTEGER,                  -- DX 分数
  achievement REAL,                  -- 达成率（百分比）
  fc_status TEXT,                    -- FC 状态
  fs_status TEXT,                    -- FS 状态
  play_time DATETIME,                -- 游玩时间
  fetched_at DATETIME,               -- 获取时间
  raw_data TEXT,                     -- 原始 JSON 数据
  UNIQUE(track_id, play_time, difficulty)  -- 去重约束
)
```

### 自动去重逻辑

记录唯一性由以下三个字段决定：
- `track_id` - 曲目 ID
- `play_time` - 游玩时间
- `difficulty` - 难度等级

相同曲目、相同时间、相同难度的记录会被自动忽略。

## 📁 文件和目录

运行后会生成以下文件：

```
mainetcn/
├── data/                          # 数据目录（自动创建）
│   ├── play_history.db            # SQLite 数据库
│   └── export_2025-11-23.json     # 导出的 JSON 文件
├── token.json                     # Token 配置（需手动创建）
└── track_history.js               # 主脚本
```

## 💡 使用示例

### 示例 1: 首次使用

```bash
# 1. 准备 Token
echo '{"ult":"你的token","userId":"你的userId"}' > token.json

# 2. 安装依赖
npm install sqlite3

# 3. 启动持续监控
node track_history.js
```

输出：
```
======================================================================
舞萌 DX 游玩记录历史跟踪器
======================================================================

✅ 创建数据目录: /home/user/mainetcn/data
✅ 连接到数据库: /home/user/mainetcn/data/play_history.db
✅ 数据表初始化完成
✅ 加载 Token: userId=1646862433816015

📋 配置信息:
   数据目录: /home/user/mainetcn/data
   数据库文件: /home/user/mainetcn/data/play_history.db
   获取间隔: 5 分钟

======================================================================
⏰ 2025-11-23 20:00:00 - 开始获取游玩记录
======================================================================
📥 获取到 50 条记录
✅ Token 已更新
✅ 新增记录: 50 条
⚠️  重复记录（已忽略）: 0 条
📊 数据库总记录数: 50 条

🔄 持续监控模式已启动
   下次获取时间: 2025-11-23 20:05:00
   按 Ctrl+C 停止
```

### 示例 2: 查看累积数据

等待几个小时后：

```
======================================================================
⏰ 2025-11-23 22:30:00 - 开始获取游玩记录
======================================================================
📥 获取到 50 条记录
✅ Token 已更新
✅ 新增记录: 5 条
⚠️  重复记录（已忽略）: 45 条
📊 数据库总记录数: 127 条
```

只有新增的 5 条记录被保存，其他 45 条已存在的记录被自动忽略。

### 示例 3: 导出数据

停止程序（Ctrl+C）时：

```
^C
⏹️  正在停止...
✅ 数据已导出到: /home/user/mainetcn/data/export_2025-11-23.json
✅ 数据库已关闭
👋 再见！
```

导出的 JSON 格式：

```json
{
  "exportTime": "2025-11-23T14:30:00.000Z",
  "totalRecords": 127,
  "records": [
    {
      "id": 1,
      "track_id": "12345",
      "title": "example song",
      "difficulty": 3,
      "level": "13+",
      "dx_score": 2500,
      "achievement": 98.5,
      "fc_status": "fc",
      "fs_status": "fsd",
      "play_time": "2025-11-23T14:00:00.000Z",
      "fetched_at": "2025-11-23T14:00:00.000Z",
      "raw_data": { ... }
    },
    ...
  ]
}
```

## ⚙️ 配置选项

可以在脚本顶部修改配置：

```javascript
const CONFIG = {
  dataDir: path.join(__dirname, 'data'),       // 数据目录
  dbFile: path.join(__dirname, 'data', 'play_history.db'), // 数据库文件
  tokenFile: path.join(__dirname, 'token.json'), // Token 文件
  fetchInterval: 5 * 60 * 1000,                // 获取间隔（毫秒）
  autoRun: true                                 // 自动持续运行
}
```

### 修改获取间隔

例如，改为每 10 分钟获取一次：

```javascript
fetchInterval: 10 * 60 * 1000,  // 10 分钟
```

## 🔍 查询数据库

可以使用任何 SQLite 客户端查询数据：

### 使用 sqlite3 命令行

```bash
sqlite3 data/play_history.db

# 查看总记录数
SELECT COUNT(*) FROM play_records;

# 查看最近 10 条记录
SELECT title, achievement, fc_status, play_time
FROM play_records
ORDER BY play_time DESC
LIMIT 10;

# 查看某首歌的所有记录
SELECT title, difficulty, achievement, play_time
FROM play_records
WHERE title LIKE '%曲目名%'
ORDER BY play_time DESC;

# 查看 FC 统计
SELECT fc_status, COUNT(*) as count
FROM play_records
GROUP BY fc_status;
```

### 使用 DB Browser for SQLite

推荐使用 [DB Browser for SQLite](https://sqlitebrowser.org/)，提供图形界面：

1. 下载并安装 DB Browser
2. 打开 `data/play_history.db`
3. 可视化查看和查询数据

## 📈 应用场景

### 1. 长期数据分析

持续运行几周或几个月，积累完整的游玩历史：

```bash
# 后台运行（Linux/macOS）
nohup node track_history.js > track_history.log 2>&1 &

# 使用 pm2 管理（推荐）
npm install -g pm2
pm2 start track_history.js --name "maimai-tracker"
pm2 logs maimai-tracker
pm2 stop maimai-tracker
```

### 2. 成绩进步追踪

查询同一首歌不同时间的成绩：

```sql
SELECT title, achievement, play_time
FROM play_records
WHERE track_id = '某曲目ID'
ORDER BY play_time ASC;
```

### 3. 统计分析

```sql
-- 平均达成率
SELECT AVG(achievement) as avg_achievement FROM play_records;

-- FC 率
SELECT
  fc_status,
  COUNT(*) * 100.0 / (SELECT COUNT(*) FROM play_records) as percentage
FROM play_records
GROUP BY fc_status;

-- 每日游玩次数
SELECT
  DATE(play_time) as date,
  COUNT(*) as play_count
FROM play_records
GROUP BY DATE(play_time)
ORDER BY date DESC;
```

## ⚠️ 注意事项

### Token 有效性

- Token 可能会过期，导致获取失败
- 每次成功获取后会自动更新 `token.json`
- 如果持续失败，请重新抓包获取新 Token

### 性能考虑

- 数据库会随时间增长，但 SQLite 可以轻松处理数百万条记录
- 建议定期导出并备份数据
- 可以定期清理旧数据：
  ```sql
  DELETE FROM play_records WHERE play_time < '2024-01-01';
  VACUUM;
  ```

### 重复记录

- 目前使用当前时间作为 `play_time`（因为 mainetcn API 不提供精确时间戳）
- 这意味着同一次获取的所有记录会有相同时间
- 去重主要依赖 `track_id` 和 `difficulty`
- 如果同一首歌的相同难度在同一次获取中出现多次，可能只保存一条

### 数据准确性

- 依赖 mainetcn API，数据与官方 maimai 网站一致
- API 只返回最近 50 条记录，所以需要持续运行以捕获所有游玩

## 🛠️ 故障排查

### 问题：数据库被锁定

```
Error: SQLITE_BUSY: database is locked
```

**解决方案**：
- 关闭其他访问数据库的程序
- 确保只有一个 track_history.js 实例在运行

### 问题：Token 过期

```
❌ 获取失败: Expired or incorrect token pair
```

**解决方案**：
1. 使用抓包工具重新获取 Token
2. 更新 `token.json`
3. 重启脚本

### 问题：没有新记录

```
✅ 新增记录: 0 条
⚠️  重复记录（已忽略）: 50 条
```

**这是正常的**：
- 说明自上次获取以来没有新的游玩
- 数据库正确地忽略了重复记录

## 📝 与其他脚本的对比

| 脚本 | 功能 | 数据存储 | 去重 | 持续运行 |
|------|------|----------|------|----------|
| `test_token.js` | 测试 Token | 不保存 | - | ❌ |
| `quick_start.js` | 快速查询 | 控制台输出 | - | ❌ |
| `get_all_data.js` | 完整数据获取 | JSON 文件 | ❌ | ❌ |
| `track_history.js` | 历史记录跟踪 | **SQLite 数据库** | **✅** | **✅** |

**推荐使用场景**：
- **一次性查询**：使用 `quick_start.js`
- **完整备份**：使用 `get_all_data.js`
- **长期追踪**：使用 `track_history.js` ⭐

## 📚 进阶用法

### 自定义查询脚本

创建 `query_stats.js`：

```javascript
const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('./data/play_history.db')

db.all(`
  SELECT
    title,
    MAX(achievement) as best_achievement,
    COUNT(*) as play_count
  FROM play_records
  GROUP BY track_id, difficulty
  ORDER BY best_achievement DESC
  LIMIT 10
`, (err, rows) => {
  if (err) throw err
  console.log('Top 10 Best Performances:')
  rows.forEach((row, i) => {
    console.log(`${i+1}. ${row.title} - ${row.best_achievement}% (${row.play_count} plays)`)
  })
  db.close()
})
```

运行：
```bash
node query_stats.js
```

### 数据可视化

导出 JSON 后，可以使用 Python/R 等工具进行可视化分析：

```python
import json
import matplotlib.pyplot as plt

with open('data/export_2025-11-23.json') as f:
    data = json.load(f)

achievements = [r['achievement'] for r in data['records']]
plt.hist(achievements, bins=20)
plt.xlabel('Achievement (%)')
plt.ylabel('Frequency')
plt.title('Achievement Distribution')
plt.show()
```

## 🤝 贡献和反馈

如有问题或建议，欢迎提交 Issue！

---

**祝你游玩愉快，成绩越来越好！** 🎮✨
