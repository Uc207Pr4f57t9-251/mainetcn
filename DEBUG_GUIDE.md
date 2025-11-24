# 调试指南 - 失败响应保存功能

## 功能说明

当请求失败或出现错误时，脚本会自动保存失败的响应数据到 `data/` 目录，便于分析问题。

## 保存的文件

每次失败会保存两个文件：

1. **failed_[原因]_[时间戳].html** - 完整的响应HTML内容
2. **failed_[原因]_[时间戳]_info.json** - 详细的请求和响应信息

### 失败原因分类

| 原因标识 | 说明 | 触发条件 |
|---------|------|----------|
| `auth_error` | 认证错误 | testConnection()返回200但HTML包含"error"或"エラー" |
| `redirect` | 重定向 | 返回301或302状态码 |
| `status_XXX` | 异常状态码 | testConnection()返回非200/301/302状态码 |
| `exception_XXX` | 请求异常 | 网络错误或其他异常（如ETIMEDOUT） |
| `fetch_status_XXX` | 获取记录失败 | fetchPlayHistory()返回非200状态码 |
| `fetch_exception_XXX` | 获取记录异常 | fetchPlayHistory()网络错误 |
| `parse_issue_or_error` | 解析问题 | 解析出0条记录，或HTML包含错误信息 |

## 使用示例

### 1. 认证失败 (auth_error)

当Token失效时，服务器返回200状态码，但HTML包含错误信息：

```bash
2025-11-24T18:16:00.784Z [WARN] 可能需要重新登录，响应内容包含错误信息
2025-11-24T18:16:00.784Z [WARN] 失败响应HTML已保存: data/failed_auth_error_2025-11-24T18-16-00.html
2025-11-24T18:16:00.784Z [WARN] 失败响应详情已保存: data/failed_auth_error_2025-11-24T18-16-00_info.json
2025-11-24T18:16:00.784Z [INFO] 提示：请检查保存的HTML文件来确认具体错误信息
```

**查看保存的文件：**

```bash
# 查看HTML内容
cat data/failed_auth_error_2025-11-24T18-16-00.html

# 查看请求响应详情
cat data/failed_auth_error_2025-11-24T18-16-00_info.json
```

### 2. 解析问题 (parse_issue_or_error)

当响应正常但解析出0条记录，或包含错误信息时：

```bash
2025-11-24T18:16:00.784Z [SUCCESS] 成功解析 0 条游玩记录
2025-11-24T18:16:00.784Z [WARN] 警告：未解析出任何游玩记录
2025-11-24T18:16:00.784Z [WARN] 警告：响应内容包含错误信息
2025-11-24T18:16:00.784Z [WARN] 失败响应HTML已保存: data/failed_parse_issue_or_error_2025-11-24T18-16-00.html
```

## 查看失败详情 (info.json)

`info.json` 文件包含完整的请求和响应信息：

```json
{
  "timestamp": "2025-11-24T18:16:00.784Z",
  "reason": "auth_error",
  "request": {
    "url": "https://maimai.wahlap.com/maimai-mobile/home/",
    "method": "GET",
    "headers": {
      "Host": "maimai.wahlap.com",
      "Connection": "keep-alive",
      "User-Agent": "Mozilla/5.0 ...",
      "Cookie": "_t=31e1769d740ae3b07e44e7c0e7971d2c; userId=3728444103626179"
    }
  },
  "response": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "server": "nginx",
      "content-type": "text/html; charset=UTF-8",
      "set-cookie": ["_t=..."]
    },
    "dataLength": 7508,
    "dataPreview": "<!DOCTYPE html>\n<html>\n<head>..."
  }
}
```

## 分析流程

### Token失效问题

1. **检查HTML文件**：打开 `failed_auth_error_*.html` 查看具体错误信息
2. **检查Cookie**：在 `info.json` 中查看发送的Cookie是否正确
3. **对比抓包数据**：将请求头与最新的抓包数据对比，看是否有差异

### 解析失败问题

1. **检查HTML结构**：打开 `failed_parse_issue_or_error_*.html`
2. **确认是否有记录**：搜索 `<div class="p_10 t_l f_0 v_b">` 标签
3. **检查错误信息**：搜索 "error" 或 "エラー" 关键词
4. **对比正常响应**：与 `rec/response_body.html` 对比结构差异

### 网络问题

1. **检查错误码**：在 `info.json` 中查看 `reason` 字段
2. **网络超时** (`exception_ETIMEDOUT`)：检查网络连接，可能需要VPN
3. **连接被拒绝** (`exception_ECONNREFUSED`)：检查防火墙或服务器状态
4. **域名解析失败** (`exception_ENOTFOUND`)：检查DNS设置

## 清理旧文件

失败响应文件会累积，定期清理：

```bash
# 列出所有失败响应文件
ls -lh data/failed_*

# 删除7天前的失败响应文件
find data/ -name "failed_*" -mtime +7 -delete

# 只保留最近10个失败响应
ls -t data/failed_*.html | tail -n +11 | xargs rm -f
ls -t data/failed_*_info.json | tail -n +11 | xargs rm -f
```

## 调试技巧

### 1. 对比请求头

```bash
# 提取实际发送的请求头
jq '.request.headers' data/failed_auth_error_*_info.json

# 对比抓包数据
jq '.headers' rec/request.json
```

### 2. 查找错误关键词

```bash
# 在HTML中搜索错误信息
grep -i "error\|エラー" data/failed_auth_error_*.html
```

### 3. 查看响应预览

```bash
# 快速查看响应内容预览（前500字符）
jq '.response.dataPreview' data/failed_*_info.json
```

### 4. 统计失败类型

```bash
# 统计各类失败原因的数量
ls data/failed_* | sed 's/.*failed_//' | sed 's/_[0-9].*//' | sort | uniq -c
```

## 常见问题和解决方案

### 问题1: Token已失效 (auth_error)

**症状**：testConnection()返回200但HTML包含"error"或"エラー"

**解决方案**：
1. 重新使用HttpCanary抓包获取最新的 `_t` 和 `userId`
2. 更新 `token.json` 文件
3. 重新运行测试脚本

### 问题2: 解析出0条记录 (parse_issue_or_error)

**症状**：响应200但parseRecordsHtml()返回空数组

**可能原因**：
1. Token失效，服务器返回错误页面
2. HTML结构发生变化，正则表达式不匹配
3. 真的没有游玩记录（新账号）

**解决方案**：
1. 检查 `failed_parse_issue_or_error_*.html` 确认内容
2. 如果包含"error"，重新获取Token
3. 如果是结构变化，需要更新正则表达式

### 问题3: 网络超时 (exception_ETIMEDOUT)

**症状**：请求超时30秒后失败

**解决方案**：
1. 检查网络连接
2. 尝试使用VPN
3. 增加超时时间（在代码中修改timeout参数）

## 自动化分析脚本

可以创建一个简单的分析脚本：

```bash
#!/bin/bash
# analyze_failures.sh - 分析失败响应

echo "=== 失败响应统计 ==="
echo "总失败次数: $(ls data/failed_*.html 2>/dev/null | wc -l)"
echo ""

echo "=== 失败类型分布 ==="
ls data/failed_* 2>/dev/null | sed 's/.*failed_//' | sed 's/_[0-9].*//' | sort | uniq -c
echo ""

echo "=== 最近5次失败 ==="
ls -t data/failed_*_info.json 2>/dev/null | head -5 | while read file; do
  echo "文件: $file"
  echo "时间: $(jq -r '.timestamp' "$file")"
  echo "原因: $(jq -r '.reason' "$file")"
  echo "状态: $(jq -r '.response.status' "$file")"
  echo "---"
done
```

使用方法：

```bash
chmod +x analyze_failures.sh
./analyze_failures.sh
```
