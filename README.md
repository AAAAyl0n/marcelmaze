# Marcel Maze Web Flasher

基于 Next.js + Web Serial API 的 ESP32 固件烧录页面。

## 开发

- `npm install`
- `npm run dev`
- 浏览器访问 `http://localhost:3000`

## 使用要求

- 必须使用 Chromium 内核浏览器（Chrome / Edge / Brave 等）
- 必须在 `HTTPS` 或 `localhost` 下运行（Web Serial 安全限制）
- 固件清单位于 `public/firmware/index.json`
- 固件二进制文件路径由各 `manifest.json` 的 `files` 字段定义

## CDN 回退

可通过环境变量 `NEXT_PUBLIC_FIRMWARE_CDN_BASE` 配置远端固件基地址。当前端从本地静态目录下载失败时，会尝试从 CDN 拉取对应 `manifest` 与 `bin` 文件。