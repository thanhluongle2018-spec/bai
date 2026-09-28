# 手动配置清单

本文件列出必须在微信 / 腾讯云控制台完成的配置（代码无法代替）。

## 微信小程序

1. 注册小程序，获取 AppID，写入 `project.config.json`。
2. 开通微信云开发，创建环境，将环境 ID 写入 `miniprogram/app.js` → `globalData.envId`。
3. 上传并部署全部云函数；`segment-portrait` 确认 **512MB / 60s**。
4. 云存储安全规则：仅允许用户读写自己目录或通过云函数访问；禁止匿名公开写。
5. 配置《小程序用户隐私保护指引》，至少声明：
   - 选图 / 拍摄（相册、相机）
   - 上传云存储
   - 调用腾讯云人体分析 AI 抠图
   - 保存到相册
6. 激励视频广告位 ID 填入 `miniprogram/utils/ad.js` 的 `REWARD_AD_UNIT_ID`。
7. **流量主开通门槛按微信官方最新要求核实，不要在代码或文档中写死具体门槛数字。**

## 腾讯云人体分析

1. 开通「人体分析」产品，选择与 `CUTOUT_REGION` 一致的地域。
2. 创建 API 密钥，**仅**配置到云函数环境变量：
   - `CUTOUT_SECRET_ID`
   - `CUTOUT_SECRET_KEY`
   - `CUTOUT_REGION`（如 `ap-guangzhou`）
3. 登录控制台「资源包管理」**核实**当月免费额度余量、计费模式、QPS；官方文档写明每月每服务 1000 次免费，**不得当作本账号已保证事实**。
4. 配置账单预算与告警；欠费将停服。

## 数据库集合

| 集合 | 权限建议 | 索引 |
|------|----------|------|
| `cutout_cache` | 仅云函数可读写 | 唯一：`openid` + `hash`；可选 `expireAt` |
| `uv_logs` | 仅云函数可读写 | 唯一：`openidDate`（或 `openid`+`date`） |
| `sizes` | 所有人可读；写仅云函数（管理员鉴权后） | `sort`；`enabled`+`sort` |
| `configs` | 读可开放或仅云函数返回白名单；写仅云函数 | 文档 ID：`public` |
| `admin_users` | **仅云函数可读写** | — |
| `admin_audit_logs` | 仅云函数可读写 | `createdAt` |

### 初始化 admin_users

```json
{
  "openids": ["你的管理员openid"]
}
```

支持多人：向 `openids` 数组追加。离职时从数组移除。

### 初始化 configs / public

```json
{
  "sizesVersion": 1,
  "enablePrintLayout": false,
  "enableAiWatermark": false,
  "gradientStart": 0.7,
  "gradientRange": 0.15,
  "version": 1
}
```

可将一期硬编码尺寸导入 `sizes` 集合（字段见 `miniprogram/utils/constants.js` 的 `PHOTO_SIZES`）。

## 功能开关

- `ENABLE_PRINT_LAYOUT=false`（一期）；二期改为 `true`。
- `ENABLE_AI_WATERMARK=false`；审核要求时开启右下角半透明「AI生成」。
- 缓存 TTL：云函数内默认 7 天；请配置云存储生命周期清理过期 `cutouts/`、`uploads/`。

## 正式文案

上线前替换 `pages/user-agreement`、`privacy-policy`、`disclaimer` 为法务审定稿，并写明图片留存期限与删除申请方式。
