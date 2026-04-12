# 数据库设计

## 集合：tasks（任务表）

用于存储星球文章拉取任务

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 自动生成的主键 |
| planetId | string | 是 | 星球ID（从url最后一段提取） |
| planetName | string | 是 | 星球名称 |
| planetUrl | string | 是 | 星球完整URL |
| status | string | 是 | 任务状态：`pending`(未开始) / `completed`(完成) |
| article | string | 否 | 最新文章内容（任务完成后写入） |
| lastUpdateTime | string | 是 | 最近更新时间文案（如"刚刚"、"5分钟前"） |
| createdAt | Date | 是 | 任务创建时间 |
| updatedAt | Date | 是 | 任务更新时间 |

## 集合：config（配置表）

系统配置项

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 配置键名 |
| value | any | 是 | 配置值 |
| updatedAt | Date | 是 | 更新时间 |

### 默认配置项

- `monitorInterval`: 监控间隔时间（毫秒），默认 60000（1分钟）
- `monitorUrls`: 需要监控的星球URL列表，数组类型
