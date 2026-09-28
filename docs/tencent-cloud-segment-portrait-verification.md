# SegmentPortraitPic 开工前核验记录

核验日期：2026-09-28  
核验依据：腾讯云官方文档（非本仓库腾讯云账号控制台，**控制台额度需人工登录核实**）

| 来源 | 说明 |
|------|------|
| [人像分割 API](https://cloud.tencent.com/document/product/1208/42970) | 输入/输出参数、错误码 |
| [人体分析购买指南](https://cloud.tencent.com/document/product/1208/44922) | 免费额度、计费、欠费 |
| [人体分析快速入门](https://cloud.tencent.com/document/product/1208/42739) | 接口组并发限制说明 |

## 1. 免费额度 / 计费 / QPS / 超限

| 项 | 官方文档结论 | 本账号控制台核实 |
|----|--------------|------------------|
| 每月免费额度 | 开通人体分析后，**每种服务每月 1000 次**免费调用（资源包，优先扣除） | **未核实**。须登录[资源包管理](https://console.cloud.tencent.com/bda)查看实际发放与余量 |
| 计费顺序 | 免费资源包 → 付费资源包 → 后付费按量 | 同上 |
| 欠费 | 余额不足约 24 小时后停服，充正后恢复 | 建议配置账单告警 |
| 默认请求频率 | 社区/接口说明常见写法为 **300 次/秒**；按量计费下部分接口组有独立 QPS 上限 | **须在控制台/配额页确认本账号实际限流** |
| 超限行为 | 超 QPS 返回限频类错误且通常不计费；余额不足返回 `BalanceInsufficient` / `InArrears` 等 | — |

> **重要**：不得将「每月 1000 次」当作本项目账号已保证额度。代码常量中的 `FREE_QUOTA_HINT` 仅作文档提示，以控制台为准。

## 2. 输入格式与限制（已写入代码常量）

| 限制 | 官方值 | 项目常量 |
|------|--------|----------|
| 传参 | `Image`（Base64）或 `Url`，二选一；同时提供时只用 Url | — |
| Base64 后大小 | ≤ **5MB** | `API_MAX_BASE64_BYTES = 5 * 1024 * 1024` |
| 分辨率 | **小于 2000×2000**（宽与高均须 < 2000） | `API_MAX_EDGE = 1999` |
| 格式 | PNG / JPG / JPEG / BMP，**不支持 GIF** | `API_ALLOWED_MIME` |
| 场景 | `SceneType`: `GEN`（默认）/ `GS`（绿幕） | 默认 `GEN` |
| 返回方式 | `RspImgType`: `base64` 或 `url`（Url 约 30 分钟有效） | 云函数优先 `url` |

前端补充规则（需求确认）：源图超过 **3.5MB** 时压缩至最长边 **1920px**，且压缩后仍须满足上表 API 限制；云函数二次校验。

## 3. 输出格式

| 字段 | 含义 |
|------|------|
| `ResultImage` | 处理后图片 Base64，文档描述为 **透明背景图** |
| `ResultImageUrl` | 同上内容的临时 Url（约 30 分钟） |
| `ResultMask` | Base64 文件；解码后为 **Float 数组**（按行扫描），值为轮廓置信度灰度 **0–255**，**不是普通图片** |
| `ResultMaskUrl` | Mask 的临时 Url |
| MIME | 透明背景图按 PNG（含 alpha）使用；Mask 为浮点置信度数据 |

结论：接口可直接返回透明前景图。若 `ResultImage`/`ResultImageUrl` 缺失而仅有 Mask，则按官方 Float 置信度解码后与原图合成 RGBA PNG，**不得把 Mask 当普通图片解码**。

## 4. 合成策略（云函数）

1. 优先下载/解码 `ResultImage` 或 `ResultImageUrl` 的透明 PNG 并上传云存储。  
2. 若仅有 Mask：解码 Float 置信度 → 阈值/按 alpha 映射 → 与原图像素合成 RGBA。  
3. 上传结果后返回云存储 `fileID`；前端用 `wx.cloud.getTempFileURL` 显示。

## 5. 手动待办（控制台）

- [ ] 开通人体分析并记录地域（与 `CUTOUT_REGION` 一致）
- [ ] 在资源包管理核实当月免费余量与计费模式
- [ ] 配置 `CUTOUT_SECRET_ID` / `CUTOUT_SECRET_KEY` / `CUTOUT_REGION` 到云函数环境变量
- [ ] 配置账单预算与告警
- [ ] 确认实际 QPS / 超限错误码表现
