import type { ExposureItem, PrivacyReport } from "./types";
import {
  calculateLinkabilityLevel,
  compactFingerprintInput,
  sha256,
  stringifyValue,
  truncate,
} from "./utils";

interface NavigatorWithExtras extends Navigator {
  userAgentData?: {
    brands?: Array<{ brand: string; version: string }>;
    mobile?: boolean;
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
  };
  deviceMemory?: number;
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  globalPrivacyControl?: boolean;
  getBattery?: () => Promise<{
    charging: boolean;
    level: number;
    chargingTime: number;
    dischargingTime: number;
  }>;
  gpu?: unknown;
  xr?: unknown;
  usb?: unknown;
  hid?: unknown;
  serial?: unknown;
  bluetooth?: unknown;
}

interface WindowWithExtras extends Window {
  DeviceMotionEvent?: typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  DeviceOrientationEvent?: typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  AmbientLightSensor?: unknown;
  Accelerometer?: unknown;
  Gyroscope?: unknown;
  Magnetometer?: unknown;
  NDEFReader?: unknown;
}

const nav = navigator as NavigatorWithExtras;
const win = window as WindowWithExtras;

function item(params: Omit<ExposureItem, "value" | "displayValue"> & {
  value: unknown;
  displayValue?: string;
}): ExposureItem {
  const rawValue = truncate(stringifyValue(params.value), 1200);

  return {
    ...params,
    value: rawValue,
    displayValue: params.displayValue ?? rawValue,
  };
}

export async function collectReport(): Promise<PrivacyReport> {
  const items: ExposureItem[] = [];

  items.push(...collectBrowserIdentity());
  items.push(...(await collectClientHints()));
  items.push(...collectLocale());
  items.push(...collectScreenAndMedia());
  items.push(...collectHardware());
  items.push(...(await collectStorage()));
  items.push(...(await collectPermissions()));
  items.push(...collectUrlAndNavigation());
  items.push(...collectRenderingFingerprints());
  items.push(...(await collectAudioFingerprint()));
  items.push(...collectPerformanceSignals());
  items.push(...(await collectWebRtcSignals()));
  items.push(...collectApiSurface());
  items.push(...collectFrontendSideChannels());

  const fingerprintInput = compactFingerprintInput(items);
  const fingerprintId = await sha256(fingerprintInput);
  const linkability = calculateLinkabilityLevel(items);

  return {
    summary: {
      itemCount: items.length,
      highRiskCount: items.filter((entry) => entry.risk === "高").length,
      mediumRiskCount: items.filter((entry) => entry.risk === "中").length,
      highLinkabilityCount: items.filter((entry) => entry.linkability === "高").length,
      fingerprintId: fingerprintId.slice(0, 24),
      fingerprintInputCount: items.filter(
        (entry) =>
          entry.includeInFingerprint !== false &&
          entry.linkability !== "低" &&
          (entry.stability === "跨会话可能稳定" || entry.stability === "授权后稳定"),
      ).length,
      linkabilityScore: linkability.score,
      linkabilityLevel: linkability.level,
      generatedAt: new Date().toISOString(),
    },
    items,
  };
}

function detectOs(userAgent: string, platform = ""): string {
  const source = `${userAgent} ${platform}`.toLowerCase();
  if (source.includes("windows")) return "Windows";
  if (source.includes("android")) return "Android";
  if (source.includes("iphone") || source.includes("ipad") || source.includes("ios")) return "iOS/iPadOS";
  if (source.includes("mac")) return "macOS";
  if (source.includes("linux")) return "Linux";
  if (source.includes("cros")) return "ChromeOS";
  return "未知系统";
}

function detectBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/opr\//i.test(userAgent)) return "Opera";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/safari\//i.test(userAgent) && !/chrome|chromium|crios/i.test(userAgent)) return "Safari";
  if (/chrome|chromium|crios/i.test(userAgent)) return "Chrome/Chromium";
  return "未知浏览器";
}

function detectDeviceKind(): string {
  if (nav.userAgentData?.mobile || /mobi|android|iphone|ipad/i.test(nav.userAgent)) {
    return nav.maxTouchPoints > 1 ? "移动/平板设备" : "移动设备";
  }

  if (nav.maxTouchPoints > 1) return "支持触控的桌面/二合一设备";
  return "桌面或笔记本设备";
}

function yesNo(value: unknown): string {
  return value ? "是" : "否";
}

function valueText(value: unknown, fallback = "未暴露"): string {
  if (value === undefined) return fallback;
  if (value === null) return "null";
  if (typeof value === "boolean") return yesNo(value);
  if (typeof value === "number") return Number.isNaN(value) ? "未知" : String(value);
  if (typeof value === "string") return value || "空字符串";
  if (Array.isArray(value)) return value.length ? value.map((entry) => valueText(entry)).join("、") : "空";
  return stringifyValue(value);
}

function field(label: string, value: unknown, fallback?: string): string {
  return `${label}：${valueText(value, fallback)}`;
}

function fieldList(fields: Array<[label: string, value: unknown, fallback?: string]>): string {
  return `${fields.map(([label, value, fallback]) => field(label, value, fallback)).join("；")}。`;
}

function normalizeUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\d+(?:\.\d+)+/g, "x")
    .replace(/\b\d{2,}\b/g, "x")
    .toLowerCase();
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value)) ?? "undefined";
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortStable(entry)]),
    );
  }

  return value;
}

function formatBytes(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "未知";
  if (value === 0) return "0 B";
  if (value >= 1024 ** 3) return `${Math.round((value / 1024 ** 3) * 10) / 10} GB`;
  if (value >= 1024 ** 2) return `${Math.round((value / 1024 ** 2) * 10) / 10} MB`;
  if (value >= 1024) return `${Math.round((value / 1024) * 10) / 10} KB`;
  return `${value} B`;
}

function supportList(record: Record<string, boolean>, labels: Record<string, string> = {}): string {
  const supported = Object.entries(record)
    .filter(([, value]) => value)
    .map(([key]) => labels[key] ?? key);
  return supported.length ? supported.join("、") : "未检测到支持项";
}

function supportStateList(record: Record<string, boolean>, labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, label]) => `${label}=${yesNo(record[key])}`)
    .join("；");
}

function formatMetrics(metrics: unknown): string {
  if (!Array.isArray(metrics)) return "未知";
  return metrics
    .map((entry) => {
      const metric = entry as { font?: string; width?: number; height?: number };
      return `${metric.font ?? "未知字体"} ${metric.width ?? "?"}x${metric.height ?? "?"}`;
    })
    .join("；");
}

function brandList(brands?: Array<{ brand: string; version: string }>): string {
  if (!brands?.length) return "未知";
  return brands.map((brand) => `${brand.brand} ${brand.version}`).join("、");
}

function permissionStateList(permissions: Record<string, string>): string {
  const labels: Record<string, string> = {
    geolocation: "定位",
    camera: "相机",
    microphone: "麦克风",
    notifications: "通知",
    "clipboard-read": "读剪贴板",
    "clipboard-write": "写剪贴板",
    "persistent-storage": "持久化存储",
    "display-capture": "屏幕捕获",
  };
  const states: Record<string, string> = {
    granted: "已授权",
    denied: "已拒绝",
    prompt: "询问时授权",
  };

  return Object.entries(permissions)
    .map(([name, state]) => `${labels[name] ?? name}=${states[state] ?? state}`)
    .join("；");
}

function bucketViewport(width: number, height: number): string {
  if (width >= 1400) return `宽屏桌面窗口（${width}x${height}）`;
  if (width >= 1024) return `桌面窗口（${width}x${height}）`;
  if (width >= 700) return `平板/窄桌面窗口（${width}x${height}）`;
  return `移动宽度窗口（${width}x${height}）`;
}

function collectBrowserIdentity(): ExposureItem[] {
  const os = detectOs(nav.userAgent, nav.platform);
  const browser = detectBrowser(nav.userAgent);
  const deviceKind = detectDeviceKind();

  return [
    item({
      id: "user-agent",
      group: "浏览器与平台",
      label: "User-Agent",
      value: nav.userAgent,
      displayValue: `浏览器：${browser}；操作系统：${os}；设备类型：${deviceKind}；UA 字符串：${truncate(nav.userAgent, 220)}。`,
      fingerprintValue: stableJson({
        browser,
        deviceKind,
        os,
        uaShape: normalizeUserAgent(nav.userAgent),
      }),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "浏览器、版本、操作系统与设备类型",
      explanation: "传统 UA 字符串会被本页读取，并且通常也会出现在服务器请求头中。",
      caveat: "现代浏览器正在降低 UA 熵，且用户可以伪装。",
    }),
    item({
      id: "platform",
      group: "浏览器与平台",
      label: "平台与供应商",
      value: {
        platform: nav.platform,
        vendor: nav.vendor,
        product: nav.product,
      },
      displayValue: fieldList([
        ["platform", nav.platform],
        ["vendor", nav.vendor],
        ["product", nav.product],
      ]),
      fingerprintValue: stableJson({
        platform: nav.platform,
        product: nav.product,
        vendor: nav.vendor,
      }),
      audience: "本页 JavaScript",
      risk: "低",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "操作系统/浏览器家族提示",
      explanation: "这些兼容性字段可帮助分辨平台，但许多值已被固定或降熵。",
    }),
    item({
      id: "privacy-preferences",
      group: "浏览器与平台",
      label: "反追踪偏好",
      value: {
        doNotTrack: nav.doNotTrack,
        globalPrivacyControl: nav.globalPrivacyControl,
        cookieEnabled: nav.cookieEnabled,
        webdriver: nav.webdriver,
      },
      displayValue: fieldList([
        ["Cookie 可用", nav.cookieEnabled],
        ["Do Not Track", nav.doNotTrack, "未声明"],
        ["Global Privacy Control", nav.globalPrivacyControl],
        ["WebDriver 自动化标记", nav.webdriver],
      ]),
      fingerprintValue: stableJson({
        cookieEnabled: nav.cookieEnabled,
        doNotTrack: nav.doNotTrack,
        globalPrivacyControl: nav.globalPrivacyControl,
        webdriver: nav.webdriver,
      }),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "会话内稳定",
      linkability: "中",
      leakedFeature: "Cookie、DNT/GPC、WebDriver 状态",
      explanation: "隐私偏好和自动化状态本身会透露用户环境与防护工具。",
      caveat: "DNT/GPC 只是偏好信号，是否被尊重取决于网站。",
    }),
  ];
}

async function collectClientHints(): Promise<ExposureItem[]> {
  const lowEntropy = nav.userAgentData
    ? {
        brands: nav.userAgentData.brands,
        mobile: nav.userAgentData.mobile,
        platform: nav.userAgentData.platform,
      }
    : undefined;

  let highEntropy: Record<string, unknown> | undefined;
  if (nav.userAgentData?.getHighEntropyValues) {
    try {
      highEntropy = await nav.userAgentData.getHighEntropyValues([
        "architecture",
        "bitness",
        "formFactors",
        "model",
        "platformVersion",
        "uaFullVersion",
        "fullVersionList",
        "wow64",
      ]);
    } catch {
      highEntropy = { error: "高熵 Client Hints 无法取得" };
    }
  }
  const hasHighEntropyValues = Boolean(highEntropy && !highEntropy.error);
  const fullVersionList = highEntropy?.fullVersionList as
    | Array<{ brand: string; version: string }>
    | undefined;

  const lowEntropyText = lowEntropy
    ? fieldList([
        ["品牌", brandList(lowEntropy.brands)],
        ["平台", lowEntropy.platform],
        ["移动设备", lowEntropy.mobile],
      ])
    : "当前浏览器没有暴露低熵 Client Hints。";
  const highEntropyText = highEntropy?.error
    ? `高熵 Client Hints 请求失败：${valueText(highEntropy.error)}。`
    : highEntropy
      ? fieldList([
          ["架构", highEntropy.architecture],
          ["位数", highEntropy.bitness],
          ["设备形态", highEntropy.formFactors],
          ["设备型号", highEntropy.model],
          ["平台版本", highEntropy.platformVersion],
          ["UA 完整版本", highEntropy.uaFullVersion],
          ["完整品牌列表", brandList(fullVersionList)],
          ["Windows 32 位进程运行在 64 位系统", highEntropy.wow64],
        ])
    : "当前页面未取得高熵 Client Hints。";

  return [
    item({
      id: "ua-client-hints-low",
      group: "浏览器与平台",
      label: "低熵 Client Hints",
      value: lowEntropy,
      displayValue: lowEntropyText,
      fingerprintValue: lowEntropy ? stableJson(lowEntropy) : undefined,
      audience: "本页 JavaScript",
      risk: "低",
      stability: "会话内稳定",
      linkability: "低",
      leakedFeature: "品牌、移动设备、平台",
      explanation: "Chromium 系浏览器可能暴露结构化的 UA Client Hints。",
      caveat: "非 Chromium 浏览器可能不支持。",
    }),
    item({
      id: "ua-client-hints-high",
      group: "浏览器与平台",
      label: "高熵 Client Hints",
      value: highEntropy,
      displayValue: highEntropyText,
      fingerprintValue: hasHighEntropyValues ? stableJson(highEntropy) : undefined,
      includeInFingerprint: hasHighEntropyValues,
      audience: "本页 JavaScript",
      risk: hasHighEntropyValues ? "中" : "低",
      stability: "跨会话可能稳定",
      linkability: hasHighEntropyValues ? "中" : "低",
      leakedFeature: "架构、位数、平台版本、完整版本、设备型号",
      explanation: "高熵值比传统 UA 更结构化，和其他信号组合后可提高可关联性。",
      caveat: "服务端通常需要 Accept-CH 才能在请求头中获得更多 hints。",
    }),
  ];
}

function collectLocale(): ExposureItem[] {
  const dateOptions = Intl.DateTimeFormat().resolvedOptions();
  const numberOptions = Intl.NumberFormat().resolvedOptions();
  const languageList = nav.languages?.length ? nav.languages.join("、") : nav.language || "未知";

  return [
    item({
      id: "language",
      group: "语言与区域",
      label: "语言偏好",
      value: {
        language: nav.language,
        languages: nav.languages,
      },
      displayValue: fieldList([
        ["首选语言", nav.language],
        ["语言优先级", languageList],
      ]),
      fingerprintValue: stableJson({
        language: nav.language,
        languages: nav.languages,
      }),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "系统语言与浏览器语言顺序",
      explanation: "语言顺序常被用于地区推断，也会在服务端 Accept-Language 中出现。",
    }),
    item({
      id: "timezone",
      group: "语言与区域",
      label: "时区与日期格式",
      value: {
        timeZone: dateOptions.timeZone,
        locale: dateOptions.locale,
        calendar: dateOptions.calendar,
        numberingSystem: dateOptions.numberingSystem,
        hourCycle: dateOptions.hourCycle,
        clientTime: new Date().toString(),
      },
      displayValue: fieldList([
        ["时区", dateOptions.timeZone],
        ["区域格式", dateOptions.locale],
        ["日历", dateOptions.calendar],
        ["数字系统", dateOptions.numberingSystem],
        ["小时周期", dateOptions.hourCycle],
      ]),
      fingerprintValue: stableJson({
        calendar: dateOptions.calendar,
        hourCycle: dateOptions.hourCycle,
        locale: dateOptions.locale,
        numberingSystem: dateOptions.numberingSystem,
        timeZone: dateOptions.timeZone,
      }),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "所在地区/系统本地化设置",
      explanation: "时区、日历和数字系统可与 IP 地理位置比对，用于提示代理或远程环境不一致。",
      caveat: "旅行、语言偏好和手动设置都可能造成正常不一致。",
    }),
    item({
      id: "number-locale",
      group: "语言与区域",
      label: "数字格式",
      value: numberOptions,
      displayValue: fieldList([
        ["区域格式", numberOptions.locale],
        ["数字系统", numberOptions.numberingSystem],
        ["样式", numberOptions.style],
        ["最小小数位", numberOptions.minimumFractionDigits],
        ["最大小数位", numberOptions.maximumFractionDigits],
      ]),
      fingerprintValue: stableJson({
        locale: numberOptions.locale,
        numberingSystem: numberOptions.numberingSystem,
      }),
      audience: "本页 JavaScript",
      risk: "低",
      stability: "跨会话可能稳定",
      linkability: "低",
      leakedFeature: "数字与货币格式偏好",
      explanation: "本地化格式本身熵不高，但能补充语言/时区信号。",
    }),
  ];
}

function collectScreenAndMedia(): ExposureItem[] {
  const mediaQueries = {
    darkMode: matchMedia("(prefers-color-scheme: dark)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    highContrast: matchMedia("(prefers-contrast: more)").matches,
    forcedColors: matchMedia("(forced-colors: active)").matches,
    hover: matchMedia("(hover: hover)").matches,
    pointerFine: matchMedia("(pointer: fine)").matches,
    colorGamutP3: matchMedia("(color-gamut: p3)").matches,
    dynamicRangeHdr: matchMedia("(dynamic-range: high)").matches,
  };
  const screenValue = {
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
    },
    viewport: {
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      devicePixelRatio,
    },
    orientation: screen.orientation?.type,
  };
  const displaySummary = `${bucketViewport(innerWidth, innerHeight)}；物理屏幕：${screen.width}x${screen.height}；可用区域：${screen.availWidth}x${screen.availHeight}；浏览器窗口：inner ${innerWidth}x${innerHeight} / outer ${outerWidth}x${outerHeight}；DPR：${devicePixelRatio}；色深：${screen.colorDepth} 位；方向：${screen.orientation?.type || "未知"}。`;

  return [
    item({
      id: "screen",
      group: "屏幕与显示",
      label: "屏幕与窗口",
      value: screenValue,
      displayValue: displaySummary,
      fingerprintValue: stableJson({
        colorDepth: screen.colorDepth,
        dprBucket: Math.round(devicePixelRatio * 2) / 2,
        heightBucket: Math.round(screen.height / 100) * 100,
        orientation: screen.orientation?.type,
        widthBucket: Math.round(screen.width / 100) * 100,
      }),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "会话内稳定",
      linkability: "中",
      leakedFeature: "屏幕分辨率、缩放比例、窗口大小",
      explanation: "显示能力和窗口尺寸能区分设备类型，也能成为指纹组合的一部分。",
    }),
    item({
      id: "media-preferences",
      group: "屏幕与显示",
      label: "CSS 媒体偏好",
      value: mediaQueries,
      displayValue: fieldList([
        ["深色模式", mediaQueries.darkMode],
        ["减少动态效果", mediaQueries.reducedMotion],
        ["高对比度", mediaQueries.highContrast],
        ["强制颜色", mediaQueries.forcedColors],
        ["支持悬停", mediaQueries.hover],
        ["精细指针", mediaQueries.pointerFine],
        ["P3 色域", mediaQueries.colorGamutP3],
        ["HDR 动态范围", mediaQueries.dynamicRangeHdr],
      ]),
      fingerprintValue: stableJson(mediaQueries),
      audience: "本页 JavaScript",
      risk: "低",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "深色模式、无障碍偏好、输入方式、色域",
      explanation: "这些偏好通常不是高敏感数据，但会增加用户环境的可识别性。",
    }),
  ];
}

function collectHardware(): ExposureItem[] {
  const hardwareValue = {
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    maxTouchPoints: nav.maxTouchPoints,
    gpuApi: Boolean(nav.gpu),
    xrApi: Boolean(nav.xr),
  };

  return [
    item({
      id: "hardware",
      group: "硬件能力",
      label: "CPU、内存与触控",
      value: hardwareValue,
      displayValue: fieldList([
        ["逻辑 CPU 线程", nav.hardwareConcurrency],
        ["内存档位", nav.deviceMemory ? `${nav.deviceMemory} GB` : undefined],
        ["最大触控点", nav.maxTouchPoints],
        ["WebGPU", Boolean(nav.gpu)],
        ["WebXR", Boolean(nav.xr)],
      ]),
      fingerprintValue: stableJson(hardwareValue),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "设备性能档位与互动能力",
      explanation: "CPU 核数、内存档位和触控能力可以辅助判断设备类型。",
      caveat: "浏览器通常会粗化这些值。",
    }),
  ];
}

async function collectStorage(): Promise<ExposureItem[]> {
  let storageEstimate: StorageEstimate | undefined;
  let persisted: boolean | undefined;

  try {
    storageEstimate = await nav.storage?.estimate();
    persisted = await nav.storage?.persisted();
  } catch {
    storageEstimate = undefined;
  }

  const storageAvailability = {
    localStorage: canUseStorage("localStorage"),
    sessionStorage: canUseStorage("sessionStorage"),
    indexedDB: "indexedDB" in window,
    cacheApi: "caches" in window,
    serviceWorker: "serviceWorker" in nav,
    storageEstimate,
    persisted,
  };
  const quota = storageEstimate?.quota;
  const usage = storageEstimate?.usage;

  return [
    item({
      id: "storage",
      group: "存储与持久化",
      label: "本地存储能力",
      value: storageAvailability,
      displayValue: fieldList([
        ["localStorage", storageAvailability.localStorage],
        ["sessionStorage", storageAvailability.sessionStorage],
        ["IndexedDB", storageAvailability.indexedDB],
        ["Cache API", storageAvailability.cacheApi],
        ["Service Worker", storageAvailability.serviceWorker],
        ["持久化存储已授予", persisted],
        ["估计配额", formatBytes(quota)],
        ["当前已用", formatBytes(usage)],
      ]),
      fingerprintValue: stableJson({
        cacheApi: storageAvailability.cacheApi,
        indexedDB: storageAvailability.indexedDB,
        localStorage: storageAvailability.localStorage,
        persisted,
        quotaBucket: quota ? Math.round(quota / 1024 ** 3) : undefined,
        serviceWorker: storageAvailability.serviceWorker,
        sessionStorage: storageAvailability.sessionStorage,
      }),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "Cookie/本地存储/缓存可用性与配额估计",
      explanation: "存储能力可用于保存同源状态；配额和支持矩阵也会形成环境信号。",
      caveat: "本工具不会自动写入持久追踪 ID。",
    }),
  ];
}

function canUseStorage(name: "localStorage" | "sessionStorage"): boolean {
  try {
    const key = "__privacy_exposure_test__";
    window[name].setItem(key, "1");
    window[name].removeItem(key);
    return true;
  } catch {
    return false;
  }
}

async function collectPermissions(): Promise<ExposureItem[]> {
  const permissionNames = [
    "geolocation",
    "camera",
    "microphone",
    "notifications",
    "clipboard-read",
    "clipboard-write",
    "persistent-storage",
    "display-capture",
  ];

  const permissions: Record<string, string> = {};
  if ("permissions" in nav) {
    for (const permissionName of permissionNames) {
      try {
        const status = await nav.permissions.query({
          name: permissionName as PermissionName,
        });
        permissions[permissionName] = status.state;
      } catch {
        permissions[permissionName] = "不支持查询";
      }
    }
  }

  return [
    item({
      id: "permissions",
      group: "权限状态",
      label: "浏览器权限",
      value: Object.keys(permissions).length ? permissions : "Permissions API 不支持",
      displayValue: Object.keys(permissions).length
        ? `${permissionStateList(permissions)}。`
        : "当前浏览器不支持 Permissions API 查询。",
      fingerprintValue: Object.keys(permissions).length ? stableJson(permissions) : undefined,
      audience: "本页 JavaScript",
      risk: "中",
      stability: "会话内稳定",
      linkability: "中",
      leakedFeature: "定位、相机、麦克风、剪贴板、通知等权限状态",
      explanation: "权限状态会透露目前 origin 是否被信任，或用户是否全局封锁某类能力。",
      caveat: "本工具不会在加载时主动弹出权限请求。",
    }),
  ];
}

function collectUrlAndNavigation(): ExposureItem[] {
  const url = new URL(location.href);
  const queryKeys = [...url.searchParams.keys()];
  const navigationEntry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  return [
    item({
      id: "url",
      group: "URL 与来源",
      label: "目前 URL",
      value: {
        origin: location.origin,
        pathname: location.pathname,
        queryKeys,
        hashPresent: Boolean(location.hash),
      },
      displayValue: fieldList([
        ["origin", location.origin],
        ["路径", location.pathname || "/"],
        ["query 参数名", queryKeys.length ? queryKeys.join("、") : "无"],
        ["fragment/hash 存在", Boolean(location.hash)],
      ]),
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: queryKeys.length || location.hash ? "高" : "低",
      stability: "一次性",
      linkability: queryKeys.length || location.hash ? "中" : "低",
      leakedFeature: "路径、查询参数名称、fragment 是否存在",
      explanation: "URL 中的 token、email、code、订单号或搜索词会被本页 JS 读取；query 也会被服务器看到。",
      caveat: "本工具只显示 query key，不展示 query value，避免把敏感值直接打印出来。",
    }),
    item({
      id: "referrer",
      group: "URL 与来源",
      label: "来源页面",
      value: {
        documentReferrer: document.referrer || "空",
        historyLength: history.length,
        navigationType: navigationEntry?.type,
        redirectCount: navigationEntry?.redirectCount,
      },
      displayValue: fieldList([
        ["referrer", document.referrer || "未暴露"],
        ["历史长度", history.length],
        ["导航类型", navigationEntry?.type],
        ["重定向次数", navigationEntry?.redirectCount],
      ]),
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: document.referrer ? "中" : "低",
      stability: "一次性",
      linkability: "低",
      leakedFeature: "上一页来源与导航上下文",
      explanation: "来源 URL 可能透露用户从哪个页面、搜索结果或业务流程进入本站。",
    }),
  ];
}

function collectRenderingFingerprints(): ExposureItem[] {
  const canvasHash = getCanvasFingerprint();
  const webgl = getWebglFingerprint();
  const textMetrics = getTextMetricsFingerprint();

  return [
    item({
      id: "canvas",
      group: "渲染指纹",
      label: "Canvas 2D 指纹",
      value: canvasHash,
      displayValue: `摘要哈希：${canvasHash}；测试画布：360x120；测试内容：混合中文、英文、数字、emoji、透明图形与 composite 操作。`,
      fingerprintValue: canvasHash,
      audience: "本页 JavaScript",
      risk: "高",
      stability: "跨会话可能稳定",
      linkability: "高",
      leakedFeature: "字体、抗锯齿、Canvas 渲染差异",
      explanation: "Canvas 输出受到系统、字体、GPU 和浏览器影响，可用于关联同一浏览器环境。",
      caveat: "隐私浏览器可能阻断或随机化输出。",
    }),
    item({
      id: "webgl",
      group: "渲染指纹",
      label: "WebGL 能力",
      value: webgl,
      displayValue: webgl.supported
        ? fieldList([
            ["WebGL", "可用"],
            ["厂商", webgl.vendor],
            ["渲染器", webgl.renderer],
            ["未屏蔽厂商", webgl.unmaskedVendor],
            ["未屏蔽渲染器", webgl.unmaskedRenderer],
            ["版本", webgl.version],
            ["着色语言版本", webgl.shadingLanguageVersion],
            ["最大纹理尺寸", webgl.maxTextureSize],
            ["扩展数量", webgl.extensionCount],
          ])
        : "WebGL 不可用或被浏览器阻止。",
      fingerprintValue: webgl.supported
        ? stableJson({
            extensionCount: webgl.extensionCount,
            maxTextureSize: webgl.maxTextureSize,
            renderer: webgl.unmaskedRenderer || webgl.renderer,
            vendor: webgl.unmaskedVendor || webgl.vendor,
            version: webgl.version,
          })
        : undefined,
      audience: "本页 JavaScript",
      risk: webgl.supported ? "高" : "低",
      stability: "跨会话可能稳定",
      linkability: webgl.supported ? "高" : "低",
      leakedFeature: "GPU、驱动、WebGL 扩展与精度",
      explanation: "WebGL 参数和 GPU renderer 在部分浏览器中具有较高识别性。",
    }),
    item({
      id: "text-metrics",
      group: "渲染指纹",
      label: "文字测量",
      value: textMetrics,
      displayValue: `摘要哈希：${textMetrics.hash}；测量字体尺寸：${formatMetrics(textMetrics.metrics)}。`,
      fingerprintValue: String(textMetrics.hash),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "字体 fallback、emoji、文字渲染差异",
      explanation: "同一段文字在不同系统和字体环境下尺寸不同，可补充 Canvas/WebGL 指纹。",
    }),
  ];
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "Canvas 2D 不支持";

    ctx.fillStyle = "#f3f6fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.font = "18px Arial";
    ctx.fillStyle = "#184c7a";
    ctx.fillText("Privacy 测试 12345 😀", 14, 18);
    ctx.font = "24px Georgia";
    ctx.fillStyle = "rgba(182, 65, 32, 0.82)";
    ctx.fillText("fingerprint", 42, 54);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(0, 137, 123, 0.72)";
    ctx.beginPath();
    ctx.arc(248, 62, 28, 0, Math.PI * 2);
    ctx.fill();

    return simpleHash(canvas.toDataURL());
  } catch (error) {
    return `无法取得 Canvas 指纹：${String(error)}`;
  }
}

function getWebglFingerprint(): Record<string, unknown> {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) return { supported: false };

  const context = gl as WebGLRenderingContext;
  const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
  const precision = context.getShaderPrecisionFormat(context.FRAGMENT_SHADER, context.HIGH_FLOAT);

  return {
    supported: true,
    vendor: context.getParameter(context.VENDOR),
    renderer: context.getParameter(context.RENDERER),
    unmaskedVendor: debugInfo
      ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : "未暴露",
    unmaskedRenderer: debugInfo
      ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : "未暴露",
    version: context.getParameter(context.VERSION),
    shadingLanguageVersion: context.getParameter(context.SHADING_LANGUAGE_VERSION),
    maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE),
    maxViewportDims: context.getParameter(context.MAX_VIEWPORT_DIMS),
    highFloatPrecision: precision
      ? {
          precision: precision.precision,
          rangeMin: precision.rangeMin,
          rangeMax: precision.rangeMax,
        }
      : undefined,
    extensionCount: context.getSupportedExtensions()?.length,
  };
}

function getTextMetricsFingerprint(): Record<string, unknown> {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  probe.style.top = "-9999px";
  probe.style.fontSize = "32px";
  probe.style.whiteSpace = "nowrap";
  probe.textContent = "Privacy 测试 12345 😀 汉字かな";
  document.body.appendChild(probe);

  const fonts = ["serif", "sans-serif", "monospace", "Arial", "Georgia", "Courier New"];
  const metrics = fonts.map((font) => {
    probe.style.fontFamily = font;
    const rect = probe.getBoundingClientRect();
    return {
      font,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    };
  });

  document.body.removeChild(probe);
  return {
    metrics,
    hash: simpleHash(JSON.stringify(metrics)),
  };
}

async function collectAudioFingerprint(): Promise<ExposureItem[]> {
  const AudioContextConstructor =
    window.OfflineAudioContext || (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  if (!AudioContextConstructor) {
    return [
      item({
        id: "audio",
        group: "音频指纹",
        label: "AudioContext",
        value: "不支持",
        displayValue: "当前浏览器没有暴露可用的离线音频处理接口。",
        includeInFingerprint: false,
        audience: "本页 JavaScript",
        risk: "低",
        stability: "不稳定",
        linkability: "低",
        leakedFeature: "音频处理能力",
        explanation: "此浏览器未暴露可用的离线音频处理接口。",
      }),
    ];
  }

  let result = "无法生成";
  try {
    const context = new AudioContextConstructor(1, 4500, 44100);
    const oscillator = context.createOscillator();
    const compressor = context.createDynamicsCompressor();

    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;
    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const buffer = await context.startRendering();
    const data = buffer.getChannelData(0).slice(400, 1200);
    result = simpleHash([...data].map((sample) => sample.toFixed(6)).join(","));
  } catch (error) {
    result = `无法生成：${String(error)}`;
  }

  return [
    item({
      id: "audio",
      group: "音频指纹",
      label: "AudioContext 指纹",
      value: result,
      displayValue: `摘要哈希：${result}；OfflineAudioContext：1 声道 / 4500 帧 / 44100 Hz；信号链：triangle oscillator + dynamics compressor。`,
      fingerprintValue: result,
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "音频处理链、浮点处理与浏览器实现差异",
      explanation: "离线音频图的输出会受到浏览器、操作系统和音频实现影响，可作为补充指纹。",
    }),
  ];
}

function collectPerformanceSignals(): ExposureItem[] {
  const navigationEntry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];

  return [
    item({
      id: "network-hints",
      group: "网络与时序",
      label: "Network Information",
      value: nav.connection
        ? {
            effectiveType: nav.connection.effectiveType,
            downlink: nav.connection.downlink,
            rtt: nav.connection.rtt,
            saveData: nav.connection.saveData,
          }
        : "不支持",
      displayValue: nav.connection
        ? fieldList([
            ["有效连接类型", nav.connection.effectiveType],
            ["估计下行 Mbps", nav.connection.downlink],
            ["估计 RTT ms", nav.connection.rtt],
            ["省流量模式", nav.connection.saveData],
          ])
        : "当前浏览器没有暴露 Network Information API。",
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: nav.connection ? "中" : "低",
      stability: "不稳定",
      linkability: "低",
      leakedFeature: "网络类型、估计带宽、RTT、省流量模式",
      explanation: "网络提示可反映目前连接质量，但数值粗略且波动大。",
    }),
    item({
      id: "resource-timing",
      group: "网络与时序",
      label: "页面加载时序",
      value: navigationEntry
        ? {
            type: navigationEntry.type,
            protocol: navigationEntry.nextHopProtocol,
            domContentLoadedMs: Math.round(navigationEntry.domContentLoadedEventEnd),
            loadMs: Math.round(navigationEntry.loadEventEnd),
            transferSize: navigationEntry.transferSize,
            encodedBodySize: navigationEntry.encodedBodySize,
            resourceCount: resources.length,
          }
        : "Navigation Timing 不支持",
      displayValue: navigationEntry
        ? fieldList([
            ["导航类型", navigationEntry.type],
            ["协议", navigationEntry.nextHopProtocol],
            ["DOM ready ms", Math.round(navigationEntry.domContentLoadedEventEnd)],
            ["load event ms", Math.round(navigationEntry.loadEventEnd)],
            ["传输大小", formatBytes(navigationEntry.transferSize)],
            ["编码正文大小", formatBytes(navigationEntry.encodedBodySize)],
            ["资源条目数", resources.length],
          ])
        : "当前浏览器没有暴露 Navigation Timing。",
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: "低",
      stability: "不稳定",
      linkability: "低",
      leakedFeature: "加载耗时、协议、缓存/传输大小",
      explanation: "Resource Timing 可显示本页资源加载情况；跨域细节受 Timing-Allow-Origin 限制。",
    }),
  ];
}

async function collectWebRtcSignals(): Promise<ExposureItem[]> {
  if (!("RTCPeerConnection" in window)) {
    return [
      item({
        id: "webrtc-local-candidates",
        group: "网络与时序",
        label: "WebRTC 本地候选",
        value: "RTCPeerConnection 不支持",
        displayValue: "当前浏览器没有暴露 RTCPeerConnection，无法进行 WebRTC 本地候选测试。",
        includeInFingerprint: false,
        audience: "本页 JavaScript",
        risk: "低",
        stability: "不稳定",
        linkability: "低",
        leakedFeature: "WebRTC host candidate / mDNS candidate",
        explanation: "WebRTC 候选在旧浏览器或弱隐私配置下可能暴露局域网地址；现代浏览器通常会使用 mDNS 隐藏真实本地 IP。",
      }),
    ];
  }

  const result = await collectLocalIceCandidates();
  const risk = result.localIps.length ? "高" : result.mdnsNames.length ? "中" : "低";

  return [
    item({
      id: "webrtc-local-candidates",
      group: "网络与时序",
      label: "WebRTC 本地候选",
      value: result,
      displayValue: fieldList([
        ["RTCPeerConnection", "可用"],
        ["候选数量", result.candidateCount],
        ["局域网 IP", result.localIps.length ? result.localIps.join("、") : "未观察到"],
        ["mDNS 主机名", result.mdnsNames.length ? result.mdnsNames.join("、") : "未观察到"],
        ["候选类型", result.candidateTypes.length ? result.candidateTypes.join("、") : "未观察到"],
        ["测试方式", "无 STUN/TURN，仅本地候选"],
      ]),
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk,
      stability: "不稳定",
      linkability: result.localIps.length || result.mdnsNames.length ? "中" : "低",
      leakedFeature: "WebRTC host candidate / mDNS candidate",
      explanation: "这个测试不连接外部 STUN 服务器，只观察浏览器是否在本地 ICE 候选中暴露局域网地址或 mDNS 名称。",
      caveat: "公网 IP、NAT 类型和真实 WebRTC 泄露需要 STUN/TURN 或服务端配合，纯静态页面不应默认执行。",
    }),
  ];
}

async function collectLocalIceCandidates(): Promise<{
  candidateCount: number;
  candidateTypes: string[];
  localIps: string[];
  mdnsNames: string[];
  rawCandidates: string[];
}> {
  const peer = new RTCPeerConnection({ iceServers: [] });
  const rawCandidates: string[] = [];

  try {
    peer.createDataChannel("privacy-check");
    peer.onicecandidate = (event) => {
      if (event.candidate?.candidate) {
        rawCandidates.push(event.candidate.candidate);
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 900);
      peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === "complete") {
          window.clearTimeout(timeout);
          resolve();
        }
      };
    });
  } catch (error) {
    rawCandidates.push(`无法收集 WebRTC 候选：${String(error)}`);
  } finally {
    peer.close();
  }

  const parsed = rawCandidates.map(parseIceCandidate);
  const candidateTypes = unique(parsed.map((entry) => entry.type).filter(Boolean));
  const localIps = unique(parsed.map((entry) => entry.ip).filter((entry) => entry && isPrivateIp(entry)));
  const mdnsNames = unique(parsed.map((entry) => entry.ip).filter((entry) => entry?.endsWith(".local")));

  return {
    candidateCount: rawCandidates.length,
    candidateTypes,
    localIps,
    mdnsNames,
    rawCandidates,
  };
}

function parseIceCandidate(candidate: string): { ip?: string; type?: string } {
  const parts = candidate.split(/\s+/);
  const typIndex = parts.indexOf("typ");

  return {
    ip: parts[4],
    type: typIndex >= 0 ? parts[typIndex + 1] : undefined,
  };
}

function isPrivateIp(value: string): boolean {
  return (
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    /^169\.254\./.test(value) ||
    /^127\./.test(value) ||
    value === "::1" ||
    /^fc/i.test(value) ||
    /^fd/i.test(value) ||
    /^fe80:/i.test(value)
  );
}

function unique<T>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))];
}

function collectApiSurface(): ExposureItem[] {
  const deviceApis = {
    webBluetooth: Boolean(nav.bluetooth),
    webUsb: Boolean(nav.usb),
    webHid: Boolean(nav.hid),
    webSerial: Boolean(nav.serial),
    webMidi: Boolean(nav.requestMIDIAccess),
    webNfc: Boolean(win.NDEFReader),
    webXr: Boolean(nav.xr),
  };

  const sensors = {
    deviceMotion: Boolean(win.DeviceMotionEvent),
    deviceMotionPermission: Boolean(win.DeviceMotionEvent?.requestPermission),
    deviceOrientation: Boolean(win.DeviceOrientationEvent),
    deviceOrientationPermission: Boolean(win.DeviceOrientationEvent?.requestPermission),
    accelerometer: Boolean(win.Accelerometer),
    gyroscope: Boolean(win.Gyroscope),
    magnetometer: Boolean(win.Magnetometer),
    ambientLightSensor: Boolean(win.AmbientLightSensor),
  };
  const deviceApiLabels = {
    webBluetooth: "Web Bluetooth",
    webUsb: "WebUSB",
    webHid: "WebHID",
    webSerial: "Web Serial",
    webMidi: "Web MIDI",
    webNfc: "Web NFC",
    webXr: "WebXR",
  };
  const sensorLabels = {
    deviceMotion: "DeviceMotion",
    deviceMotionPermission: "DeviceMotion 授权模式",
    deviceOrientation: "DeviceOrientation",
    deviceOrientationPermission: "DeviceOrientation 授权模式",
    accelerometer: "Accelerometer",
    gyroscope: "Gyroscope",
    magnetometer: "Magnetometer",
    ambientLightSensor: "AmbientLightSensor",
  };

  return [
    item({
      id: "device-apis",
      group: "强能力 API",
      label: "外设与强能力 API",
      value: deviceApis,
      displayValue: `${supportStateList(deviceApis, deviceApiLabels)}；支持项：${supportList(deviceApis, deviceApiLabels)}。`,
      fingerprintValue: stableJson(deviceApis),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "蓝牙、USB、HID、Serial、MIDI、NFC、XR 支持状态",
      explanation: "API 支持矩阵本身可作为浏览器/平台指纹；授权后还可能暴露外接设备信息。",
      caveat: "本工具只检查支持状态，不主动请求设备。",
    }),
    item({
      id: "sensor-apis",
      group: "强能力 API",
      label: "传感器 API",
      value: sensors,
      displayValue: `${supportStateList(sensors, sensorLabels)}；支持项：${supportList(sensors, sensorLabels)}。`,
      fingerprintValue: stableJson(sensors),
      audience: "本页 JavaScript",
      risk: "中",
      stability: "跨会话可能稳定",
      linkability: "中",
      leakedFeature: "动作、方向、加速度、陀螺仪、环境光支持",
      explanation: "传感器支持和授权模式能暴露设备类型；授权后的高频数据还可能形成行为或设备指纹。",
      caveat: "本工具不在后台持续收集传感器数据。",
    }),
  ];
}

function collectFrontendSideChannels(): ExposureItem[] {
  const timer = measureTimerResolution();
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const zeroTransferEntries = resources.filter((entry) => entry.transferSize === 0).length;
  const protocols = [...new Set(resources.map((entry) => entry.nextHopProtocol).filter(Boolean))];
  const jsPerf = measureJsPerformance();

  return [
    item({
      id: "timer-resolution",
      group: "纯前端侧信道",
      label: "计时器精度",
      value: timer,
      displayValue: fieldList([
        ["performance.now() 最小跳变 ms", timer.minDeltaMs],
        ["有效样本数", timer.positiveSamples],
        ["crossOriginIsolated", timer.crossOriginIsolated],
        ["SharedArrayBuffer", timer.sharedArrayBuffer],
      ]),
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: "中",
      stability: "不稳定",
      linkability: "低",
      leakedFeature: "高精度计时器、隔离状态、潜在时序侧信道能力",
      explanation: "计时器越精细，页面越容易通过加载耗时、渲染耗时或缓存命中差异观察侧信道。",
      caveat: "现代浏览器会降低计时精度；该值受浏览器策略和页面隔离状态影响。",
    }),
    item({
      id: "resource-cache-timing",
      group: "纯前端侧信道",
      label: "资源加载与缓存时序",
      value: {
        resourceCount: resources.length,
        zeroTransferEntries,
        protocols,
        navigationEntries: performance.getEntriesByType("navigation").length,
      },
      displayValue: fieldList([
        ["资源时序条目", resources.length],
        ["transferSize 为 0 的条目", zeroTransferEntries],
        ["协议", protocols.length ? protocols.join("、") : "未知"],
        ["navigation 条目", performance.getEntriesByType("navigation").length],
      ]),
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: "中",
      stability: "不稳定",
      linkability: "低",
      leakedFeature: "资源加载耗时、缓存命中迹象、协议与响应大小侧信道",
      explanation: "纯前端页面可以通过 Resource Timing 观察同源资源加载细节；跨域资源通常会被 Timing-Allow-Origin 限制。",
      caveat: "这类信息适合提示侧信道风险，不适合作为稳定身份指纹。",
    }),
    item({
      id: "page-visibility-focus",
      group: "纯前端侧信道",
      label: "页面可见性与焦点",
      value: {
        hasFocus: document.hasFocus(),
        online: nav.onLine,
        visibilityState: document.visibilityState,
        hidden: document.hidden,
      },
      displayValue: fieldList([
        ["页面拥有焦点", document.hasFocus()],
        ["页面可见性", document.visibilityState],
        ["document.hidden", document.hidden],
        ["浏览器在线状态", nav.onLine],
      ]),
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: "低",
      stability: "不稳定",
      linkability: "低",
      leakedFeature: "标签页可见性、焦点状态、在线状态",
      explanation: "页面可以观察用户是否切走标签页、窗口是否有焦点，以及网络在线状态，这些可用于行为侧信道和会话状态推断。",
    }),
    item({
      id: "js-performance-side-channel",
      group: "纯前端侧信道",
      label: "脚本性能侧信道",
      value: jsPerf,
      displayValue: fieldList([
        ["小型 JS 运算耗时 ms", jsPerf.elapsedMs],
        ["性能档位", jsPerf.tier],
        ["校验值", jsPerf.checksum],
      ]),
      includeInFingerprint: false,
      audience: "本页 JavaScript",
      risk: "中",
      stability: "不稳定",
      linkability: "低",
      leakedFeature: "CPU 性能、当前负载、节能或虚拟化环境的间接信号",
      explanation: "脚本执行耗时可以作为性能侧信道，用来粗略推断设备档位或当前负载，但噪声很大。",
    }),
  ];
}

function measureTimerResolution(): Record<string, unknown> {
  const deltas: number[] = [];
  let previous = performance.now();

  for (let index = 0; index < 1200; index += 1) {
    const current = performance.now();
    const delta = current - previous;
    if (delta > 0) deltas.push(delta);
    previous = current;
  }

  const minDelta = deltas.length ? Math.min(...deltas) : 0;

  return {
    minDeltaMs: Math.round(minDelta * 1000) / 1000,
    positiveSamples: deltas.length,
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
  };
}

function measureJsPerformance(): Record<string, unknown> {
  const start = performance.now();
  let accumulator = 0;

  for (let index = 0; index < 220_000; index += 1) {
    accumulator += Math.sqrt(index % 997) * Math.sin(index);
  }

  const elapsed = performance.now() - start;
  const elapsedMs = Math.round(elapsed * 10) / 10;

  return {
    elapsedMs,
    tier: elapsedMs < 4 ? "较快" : elapsedMs < 16 ? "中等" : "较慢",
    checksum: Math.round(accumulator),
  };
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
