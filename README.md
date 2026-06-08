# Privacy Exposure Inspector

完全静态的浏览器隐私暴露自检工具，使用 Vite + TypeScript + 原生 DOM 实现。

## 功能

- 展示本页 JavaScript 可以直接读取或推断的信息。
- 页面主视图优先展示解析后的自然语言摘要，原始数据保留在折叠菜单中。
- 为每个项目标记：
  - 输出信息
  - 泄漏功能
  - 谁能看到
  - 风险等级
  - 稳定性
  - 是否可能被指纹关联到同一个用户
- 生成本地指纹摘要，仅在浏览器内计算，不自动上传。
- 指纹摘要只使用相对稳定的信号做最佳努力关联，不使用当前时间、加载耗时等强波动数据。
- 支持导出 JSON 和 Markdown 报告。
- 定位、剪贴板、文件信息等高敏感项目只在用户点击后测试。

## 已覆盖的静态检测面

- 浏览器与平台：User-Agent、Client Hints、DNT/GPC、WebDriver。
- 语言与区域：语言顺序、时区、日期/数字格式。
- 屏幕与显示：分辨率、窗口、DPR、CSS 媒体偏好。
- 硬件能力：CPU 核数、内存提示、触控点、WebGPU/XR 支持。
- 存储与持久化：localStorage、sessionStorage、IndexedDB、Cache API、Storage quota。
- 权限状态：定位、相机、麦克风、通知、剪贴板、持久化存储、屏幕捕获。
- URL 与来源：path、query key、hash 是否存在、document.referrer。
- 渲染指纹：Canvas、WebGL、文字测量。
- 音频指纹：OfflineAudioContext。
- 网络与时序：Network Information、Navigation/Resource Timing。
- WebRTC：无 STUN/TURN 的本地 ICE candidate 观测，用于提示是否暴露局域网 IP 或 mDNS 名称。
- 强能力 API：Bluetooth、USB、HID、Serial、MIDI、NFC、XR、传感器支持状态。
- 纯前端侧信道：计时器精度、资源加载/缓存时序、页面可见性/焦点、脚本性能侧信道。

## 纯静态页面的限制

纯静态页面无法直接取得：

- 公网 IP。
- 原始 HTTP request headers。
- TLS/JA3/JA4 指纹。
- HTTP/2/HTTP/3 协议指纹。
- 服务器观察到的 RTT、ASN、GeoIP、DNS resolver。

这些需要自有服务器、CDN 日志、STUN/DNS 测试服务或第三方 API。

## 参考项目

- EFF Cover Your Tracks：强调追踪者如何看见浏览器，以及指纹是否足够独特。
- AmIUnique：按浏览器、系统、屏幕、存储、Canvas、WebGL、字体、媒体能力等属性展示指纹组成。
- BrowserLeaks / BrowserLeaks.io：把 IP、DNS、WebRTC、HTTP headers、TLS、Canvas、WebGL、Fonts、Audio 等检测拆成独立实验室。

本项目只实现无需后端、无需第三方探针的静态检测面；需要公网 IP、DNS、STUN、TLS/JA3/JA4、服务器 RTT、ASN、GeoIP 或代理/VPN 判断时，应扩展为可选的服务端辅助模式。

## 开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
```

构建输出在 `dist/`，可部署到任何静态托管服务。
