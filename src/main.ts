import "./styles.css";
import type { ExposureItem, PrivacyReport } from "./types";
import { collectReport } from "./probes";
import { createDownload } from "./utils";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

let currentReport: PrivacyReport | null = null;

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">静态隐私暴露检测</p>
        <h1>隐私暴露自检</h1>
        <p>
          这是一个完全前端的静态页面。它会展示本页 JavaScript 可以直接读取或推断的信息，
          并评估这些信息是否可能被浏览器指纹关联到同一个用户。
        </p>
      </div>
      <div class="hero__actions">
        <button class="button button--primary" id="rerun">重新检测</button>
        <button class="button" id="download-json">导出 JSON</button>
        <button class="button" id="download-md">导出 Markdown</button>
      </div>
    </section>

    <section class="notice">
      <strong>数据处理方式：</strong>
      所有检测都在本机浏览器内执行，不会自动上传。纯静态页无法直接取得你的 IP、HTTP headers、TLS 指纹或服务器日志；
      代理 IP、CDN 时延异常等判断需要服务端日志、多节点探针或第三方网络测量配合。
    </section>

    <section class="summary-grid" id="summary"></section>

    <section class="permission-panel">
      <div>
        <h2>需要用户授权的测试</h2>
        <p>以下测试不会自动执行。点击后才会请求浏览器授权或读取用户主动提供的数据。</p>
      </div>
      <div class="permission-actions">
        <button class="button" id="test-location">测试定位</button>
        <button class="button" id="test-clipboard">测试剪贴板</button>
        <label class="file-button">
          选择文件
          <input id="file-input" type="file" multiple />
        </label>
      </div>
      <div class="permission-results" id="permission-results"></div>
    </section>

    <section class="toolbar">
      <label class="search">
        <span>搜索</span>
        <input id="filter" type="search" placeholder="例如 Canvas、时区、WebGL、权限" />
      </label>
      <div class="legend">
        <span><i class="dot dot--high"></i>高风险</span>
        <span><i class="dot dot--medium"></i>中风险</span>
        <span><i class="dot dot--low"></i>低风险</span>
      </div>
    </section>

    <section id="report" class="report" aria-live="polite"></section>
  </main>
`;

const summaryElement = document.querySelector<HTMLElement>("#summary");
const reportElement = document.querySelector<HTMLElement>("#report");
const filterInput = document.querySelector<HTMLInputElement>("#filter");
const permissionResults = document.querySelector<HTMLElement>("#permission-results");

document.querySelector("#rerun")?.addEventListener("click", () => {
  void runInspection();
});

document.querySelector("#download-json")?.addEventListener("click", () => {
  if (!currentReport) return;
  createDownload(
    `privacy-report-${Date.now()}.json`,
    JSON.stringify(currentReport, null, 2),
    "application/json",
  );
});

document.querySelector("#download-md")?.addEventListener("click", () => {
  if (!currentReport) return;
  createDownload(`privacy-report-${Date.now()}.md`, toMarkdown(currentReport), "text/markdown");
});

filterInput?.addEventListener("input", () => {
  renderReport(currentReport, filterInput.value);
});

document.querySelector("#test-location")?.addEventListener("click", () => {
  testLocation();
});

document.querySelector("#test-clipboard")?.addEventListener("click", () => {
  void testClipboard();
});

document.querySelector("#file-input")?.addEventListener("change", (event) => {
  const input = event.currentTarget as HTMLInputElement;
  testFiles(input.files);
});

void runInspection();

async function runInspection(): Promise<void> {
  renderLoading();
  currentReport = await collectReport();
  renderSummary(currentReport);
  renderReport(currentReport, filterInput?.value ?? "");
}

function renderLoading(): void {
  if (summaryElement) {
    summaryElement.innerHTML = `
      <article class="metric">
        <span>状态</span>
        <strong>检测中</strong>
        <small>正在读取本地浏览器暴露面</small>
      </article>
    `;
  }

  if (reportElement) {
    reportElement.innerHTML = `<div class="empty">正在生成报告...</div>`;
  }
}

function renderSummary(report: PrivacyReport): void {
  if (!summaryElement) return;

  summaryElement.innerHTML = `
    <article class="metric metric--${levelClass(report.summary.linkabilityLevel)}">
      <span>指纹关联风险</span>
      <strong>${report.summary.linkabilityLevel}</strong>
      <small>分数 ${report.summary.linkabilityScore}</small>
    </article>
    <article class="metric">
      <span>检测项目</span>
      <strong>${report.summary.itemCount}</strong>
      <small>${report.summary.highRiskCount} 项高风险，${report.summary.mediumRiskCount} 项中风险</small>
    </article>
    <article class="metric">
      <span>高可关联项</span>
      <strong>${report.summary.highLinkabilityCount}</strong>
      <small>跨会话稳定信号越多，越容易被关联</small>
    </article>
    <article class="metric">
      <span>本地指纹摘要</span>
      <strong class="mono">${report.summary.fingerprintId}</strong>
      <small>基于 ${report.summary.fingerprintInputCount} 项相对稳定信号尽力关联同一用户，未上传</small>
    </article>
  `;
}

function renderReport(report: PrivacyReport | null, filter: string): void {
  if (!reportElement || !report) return;

  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const items = normalizedFilter
    ? report.items.filter((entry) =>
        [
          entry.group,
          entry.label,
          entry.value,
          entry.displayValue,
          entry.leakedFeature,
          entry.explanation,
          entry.caveat ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedFilter),
      )
    : report.items;

  if (!items.length) {
    reportElement.innerHTML = `<div class="empty">没有符合条件的项目。</div>`;
    return;
  }

  const groups = new Map<string, ExposureItem[]>();
  for (const entry of items) {
    const group = groups.get(entry.group) ?? [];
    group.push(entry);
    groups.set(entry.group, group);
  }

  reportElement.innerHTML = [...groups.entries()]
    .map(
      ([group, entries]) => `
        <section class="group">
          <div class="group__header">
            <h2>${escapeHtml(group)}</h2>
            <span>${entries.length} 项</span>
          </div>
          <div class="cards">
            ${entries.map(renderItem).join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function renderItem(entry: ExposureItem): string {
  const risk = riskClass(entry.risk);

  return `
    <article class="card card--${risk}">
      <div class="card__top">
        <h3>${escapeHtml(entry.label)}</h3>
        <span class="badge badge--${risk}">${escapeHtml(entry.risk)}风险</span>
      </div>
      <dl>
        <div>
          <dt>输出信息</dt>
          <dd class="display-value">${escapeHtml(entry.displayValue)}</dd>
        </div>
        <div>
          <dt>泄漏功能</dt>
          <dd>${escapeHtml(entry.leakedFeature)}</dd>
        </div>
        <div>
          <dt>谁能看到</dt>
          <dd>${escapeHtml(entry.audience)}</dd>
        </div>
        <div>
          <dt>稳定性</dt>
          <dd>${escapeHtml(entry.stability)}</dd>
        </div>
        <div>
          <dt>指纹关联</dt>
          <dd>${escapeHtml(entry.linkability)}</dd>
        </div>
      </dl>
      <details class="raw-details">
        <summary>查看原始数据</summary>
        <pre>${escapeHtml(entry.value)}</pre>
      </details>
      <p>${escapeHtml(entry.explanation)}</p>
      ${entry.caveat ? `<p class="caveat">${escapeHtml(entry.caveat)}</p>` : ""}
    </article>
  `;
}

function testLocation(): void {
  if (!permissionResults) return;

  if (!navigator.geolocation) {
    addPermissionResult("定位", "此浏览器不支持 Geolocation API。");
    return;
  }

  addPermissionResult("定位", "等待用户授权...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      addPermissionResult(
        "定位",
        `纬度 ${position.coords.latitude.toFixed(6)}，经度 ${position.coords.longitude.toFixed(6)}，精度约 ${Math.round(
          position.coords.accuracy,
        )} 米。这是高敏感信息，可直接暴露近似实际位置。`,
      );
    },
    (error) => {
      addPermissionResult("定位", `未取得定位：${error.message}`);
    },
    {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 0,
    },
  );
}

async function testClipboard(): Promise<void> {
  if (!permissionResults) return;

  if (!navigator.clipboard?.readText) {
    addPermissionResult("剪贴板", "此浏览器不支持 Clipboard.readText，或当前不是安全上下文。");
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    addPermissionResult(
      "剪贴板",
      `已读取 ${text.length} 个字符。为避免暴露敏感内容，本页不直接显示剪贴板全文。`,
    );
  } catch (error) {
    addPermissionResult("剪贴板", `未取得剪贴板：${String(error)}`);
  }
}

function testFiles(files: FileList | null): void {
  if (!permissionResults) return;

  if (!files || files.length === 0) {
    addPermissionResult("文件", "没有选择文件。");
    return;
  }

  const rows = [...files].slice(0, 6).map((file) => {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return `${file.name} / ${file.type || "未知类型"} / ${file.size} 字节 / ${new Date(
      file.lastModified,
    ).toLocaleString()}${relativePath ? ` / ${relativePath}` : ""}`;
  });

  addPermissionResult(
    "文件",
    `用户主动选择后，页面可看到文件名、类型、大小和修改时间：${rows.join("；")}`,
  );
}

function addPermissionResult(title: string, body: string): void {
  if (!permissionResults) return;

  const result = document.createElement("article");
  result.className = "permission-result";
  result.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p>`;
  permissionResults.prepend(result);
}

function toMarkdown(report: PrivacyReport): string {
  const lines = [
    "# 隐私暴露自检报告",
    "",
    `生成时间：${report.summary.generatedAt}`,
    "",
    "## 摘要",
    "",
    `- 指纹关联风险：${report.summary.linkabilityLevel}`,
    `- 关联分数：${report.summary.linkabilityScore}`,
    `- 本地指纹摘要：${report.summary.fingerprintId}`,
    `- 指纹输入项数：${report.summary.fingerprintInputCount}`,
    `- 检测项目：${report.summary.itemCount}`,
    `- 高风险项：${report.summary.highRiskCount}`,
    `- 高可关联项：${report.summary.highLinkabilityCount}`,
    "",
    "## 项目",
    "",
  ];

  for (const entry of report.items) {
    lines.push(
      `### ${entry.group} / ${entry.label}`,
      "",
      `- 输出信息：${entry.displayValue.replace(/\n/g, " ")}`,
      `- 泄漏功能：${entry.leakedFeature}`,
      `- 谁能看到：${entry.audience}`,
      `- 风险：${entry.risk}`,
      `- 稳定性：${entry.stability}`,
      `- 指纹关联：${entry.linkability}`,
      `- 说明：${entry.explanation}`,
      `- 原始数据：${entry.value.replace(/\n/g, " ")}`,
    );

    if (entry.caveat) {
      lines.push(`- 注意：${entry.caveat}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function riskClass(risk: string): string {
  if (risk === "高") return "high";
  if (risk === "中") return "medium";
  return "low";
}

function levelClass(level: string): string {
  if (level === "高") return "high";
  if (level === "中") return "medium";
  return "low";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
