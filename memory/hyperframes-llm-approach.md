---
name: hyperframes-llm-approach
description: HyperFrames 视频生成改用 LLM 全自动方案，不再硬拼 HTML
metadata:
  type: project
---

HyperFrames 视频模式已改为 LLM 全自动方案。

**方案**：edge-tts 配音 → 活跃 LLM 生成完整 HTML → npx hyperframes render → MP4

**Why**: 旧方案 JS 硬拼 HTML（固定深蓝渐变模板 + CSS 动画），画面千篇一律、字幕时间轴按字符数比例估算必然漂移。

**How to apply**:
- `hyperframes-video.js` 的 `buildPrompt()` 构造 prompt 发给 LLM，要求输出完整 HTML
- prompt 包含：标题/正文/品牌/分辨率/音频时长，HyperFrames 的 data-start/data-duration 规则，设计要求（深色科技风 + 金色点缀 + GSAP 动画 + HUD + 分段字幕）
- 后处理：自动替换问题字体名（Microsoft YaHei→system-ui），自动注入 `window.__hf` shim
- inference 和 image_sequence 模式已从前后端移除

**已删除的模式**：Inference.sh FLUX+Wan、AI 图片序列（用户要求，因为 Inference.sh 401/inferenceApiKey 缺配）

**当前 4 种模式**：standard / hyperframes / kling / chanjing

**已验证**：2026-05-28 生成 1080×1920 竖屏 30fps 49 秒视频成功。
