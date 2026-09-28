# 数据模型

## cutout_cache

| 字段 | 类型 | 说明 |
|------|------|------|
| openid | string | 服务端上下文 |
| hash | string | 源图 SHA-256 |
| sourceFileID | string | 源文件 |
| resultFileID | string | 透明 PNG |
| status | string | `pending` / `ready` / `failed` |
| createdAt / updatedAt / expireAt | number | 时间戳 |
| errorCode | string | 失败时安全错误码 |

唯一索引：`openid` + `hash`（并发幂等）

## uv_logs

| 字段 | 类型 | 说明 |
|------|------|------|
| openid | string | 服务端 |
| date | string | `YYYY-MM-DD` |
| openidDate | string | `openid_date` 唯一键 |
| firstVisitAt | number | 首次访问 |

## sizes

兼容一期硬编码与三期云端：`name, category, aliases, keywords, mmWidth, mmHeight, pxWidth, pxHeight, dpi, type, sort, enabled, note, version, createdAt, updatedAt, createdBy, updatedBy`

## configs（文档 ID: public）

公开白名单：`sizesVersion, enablePrintLayout, enableAiWatermark, gradientStart, gradientRange, version`  
**不得**存放密钥。

## admin_users

```json
{ "openids": ["oXXXX"] }
```

仅云函数可读写。

## layout_presets / layout_jobs（二期可选）

本地 Canvas 优先；若改云端渲染再启用 `layout_jobs`。
