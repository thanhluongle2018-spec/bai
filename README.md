# 证件照工具

微信原生小程序 + 微信云开发 CloudBase。分三期：证件照 MVP → 打印排版 → 管理员后台与云端尺寸。

## 核验结论（开工前）

详见 [`docs/tencent-cloud-segment-portrait-verification.md`](docs/tencent-cloud-segment-portrait-verification.md)。

要点：

- **输入**：Base64 ≤ 5MB；分辨率 **&lt; 2000×2000**；PNG/JPG/JPEG/BMP。
- **输出**：`ResultImage` / `ResultImageUrl` 为透明背景图；`ResultMask` 为 Float 置信度数组，不可当普通图片解码。
- **免费额度**：官方购买指南写明开通后每种服务每月 1000 次；**本仓库无法登录你的腾讯云控制台，须你在资源包管理中自行核实**。
- 前端 &gt;3.5MB 压至最长边 1920，且须满足上述 API 限制；云函数二次校验。

## 目录

```text
miniprogram/          # 小程序前端（无任何腾讯云密钥）
cloudfunctions/       # 云函数（密钥仅环境变量）
docs/                 # 核验、部署、测试、数据模型
```

## 功能开关

`miniprogram/config/feature-flags.js`：

| 开关 | 默认 | 说明 |
|------|------|------|
| `ENABLE_PRINT_LAYOUT` | `false` | 一期隐藏排版入口，二期改为 `true` |
| `ENABLE_AI_WATERMARK` | `false` | AI 可见水印，审核需要时可开 |
| `ENABLE_ADMIN_ENTRY` | `true` | 是否尝试展示管理入口（真正鉴权在云函数） |
| `ENABLE_REWARD_AD` | `false` | 激励视频解锁高清导出；初期未开通流量主时关闭，直接保存 |

## 快速开始

1. 用微信开发者工具打开本仓库根目录，填入 AppID。
2. 开通云开发，将环境 ID 写入 `miniprogram/app.js` 的 `globalData.envId`。
3. 按 `docs/setup-manual.md` 创建集合、索引、权限，部署云函数并配置环境变量。
4. 在腾讯云开通人体分析，核实免费额度与计费，配置 `CUTOUT_*` 环境变量。
5. 初期无需配置广告位（`ENABLE_REWARD_AD=false`）。开通流量主后配置广告位 ID、将开关设为 `true` 并测试。
6. 在公众平台配置《用户隐私保护指引》。

## 云函数

| 名称 | 内存/超时 | 作用 |
|------|-----------|------|
| `segment-portrait` | 512MB / 60s | 抠图 + 缓存 |
| `uv-track` | 默认 | UV 按 openid+日期去重 |
| `admin-check` | 默认 | 管理员鉴权 |
| `admin-sizes` | 默认 | 尺寸公开读 / 管理写 |
| `admin-config` | 默认 | 公开配置 |

## 密钥安全

- 腾讯云 `SecretId` / `SecretKey` **只能**放在云函数环境变量。
- 前端源码、构建产物、仓库中不得出现密钥。
- Cursor 规则见 `.cursor/rules/no-frontend-secrets.mdc`。
