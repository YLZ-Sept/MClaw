// 一键追爆款 — 运行环境配置
module.exports = {
  // FFmpeg
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe',
  // Video rendering
  fontPath: process.env.FONT_PATH || 'C:/Windows/Fonts/msyh.ttc',
  videoWidth: parseInt(process.env.VIDEO_WIDTH) || 1080,
  videoHeight: parseInt(process.env.VIDEO_HEIGHT) || 1920,
  videoFps: parseInt(process.env.VIDEO_FPS) || 24,
  videoPreset: process.env.VIDEO_PRESET || 'veryfast',
  videoCrf: parseInt(process.env.VIDEO_CRF) || 26,
  // AI Video (inference.sh)
  inferenceApiKey: process.env.INFERENCE_API_KEY || '',
  aiVideoImageApp: process.env.AI_VIDEO_IMAGE_APP || 'pruna/p-image',
  aiVideoVideoApp: process.env.AI_VIDEO_VIDEO_APP || 'falai/wan-2-5-i2v',
  // Kling AI
  klingaiAccessKey: process.env.KLINGAI_ACCESS_KEY || '',
  klingaiSecretKey: process.env.KLINGAI_SECRET_KEY || '',
  klingaiBaseUrl: process.env.KLINGAI_BASE_URL || 'https://api-beijing.klingai.com',
  // Chanjing
  chanjingAppId: process.env.CHANJING_APP_ID || '',
  chanjingSecretKey: process.env.CHANJING_SECRET_KEY || '',
  chanjingBaseUrl: process.env.CHANJING_BASE_URL || 'https://open-api.chanjing.cc',
  // Notification
  dingtalkWebhook: process.env.DINGTALK_WEBHOOK || '',
};
