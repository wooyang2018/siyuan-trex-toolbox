# 📖 Paper Reader — 读论文工作流模块

> 从 [obsidian-NotEMD](https://github.com/wooyang2018/obsidian-NotEMD) 迁移至 siyuan-trex-toolbox 的论文阅读辅助功能模块。

---

## 功能概览

| 操作 | 图标 | 说明 |
|------|------|------|
| 标注概念 | 🔗 | 识别文档中的学术概念并加粗标注 |
| 提取概念 | 📚 | 提取核心概念并在指定笔记本中创建独立笔记 |
| 研究摘要 | 🔍 | 搜索网络背景资料，生成带参考来源的研究摘要 |
| 生成内容 | ✍️ | 根据文档标题或选中文字，生成结构化文档内容 |
| 翻译文档 | 🌐 | 分块翻译整篇文档并在同一笔记本中创建译文 |
| 知识图谱 | 🗺️ | 生成 Mermaid 思维导图或流程图并追加到文档末尾 |

---

## 目录结构

```
src/func/paper-reader/
├── index.ts                   # IFuncModule 入口（Dock 注册 + 设置项声明）
├── types.ts                   # 共享类型定义
├── README.md                  # 本文档
│
├── actions/                   # 六大核心操作
│   ├── index.ts               # barrel export
│   ├── add-links.ts           # 标注概念
│   ├── extract-concepts.ts    # 提取概念
│   ├── research-summarize.ts  # 研究摘要
│   ├── generate-content.ts    # 生成内容
│   ├── translate.ts           # 翻译文档
│   └── mermaid-summary.ts     # 知识图谱
│
├── llm/                       # LLM 调用层
│   ├── client.ts              # callLLM（OpenAI / Anthropic 自动检测）
│   ├── providers.ts           # 11 个预设服务商
│   └── prompts.ts             # 中英双语 Prompt 模板
│
├── search/                    # 网络搜索
│   └── web-search.ts          # DuckDuckGo + Tavily
│
├── ui/                        # SolidJS UI
│   └── PaperReaderPanel.tsx   # Dock 面板（按钮 + 进度条 + 日志）
│
└── utils/                     # 工具层
    ├── siyuan-api.ts          # SiYuan Kernel HTTP API 封装
    ├── chunking.ts            # 文档分块
    └── progress.ts            # ProgressReporter
```

---

## 模块注册

`src/func/index.ts` 中已将 `pr`（paper-reader）加入 `_ModulesToEnable`：

```typescript
import * as pr from './paper-reader';
const _ModulesToEnable: IFuncModule[] = [..., pr];
```

启用后会在：
- **右侧边栏** 出现「读论文」Dock 面板
- **设置 → 其他设置** 出现「📖 读论文工作流」配置区

---

## 配置项

在设置面板的「其他设置」中可以配置：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| LLM API 地址 | 文本 | `https://api.openai.com/v1` | OpenAI 兼容接口地址 |
| API Key | 文本 | 空 | LLM 服务密钥 |
| 模型名称 | 文本 | `gpt-4o-mini` | 模型标识符 |
| 最大 Token 数 | 数字 | `4096` | 单次调用最大输出 token |
| 分块词数 | 数字 | `800` | 文档分块时每块的目标词数 |
| 输出语言 | 下拉 | `zh-CN` | 生成内容和翻译的目标语言 |
| 概念笔记本 | 文本 | 空 | 提取概念/译文存放的笔记本名称 |
| 概念路径 | 文本 | `/概念/` | 笔记本内的路径前缀 |
| 启用网络搜索 | 开关 | `true` | 研究摘要和生成内容时是否搜索网络 |
| Tavily API Key | 文本 | 空 | 可选，提供更高质量的学术搜索 |

---

## 架构说明

### LLM 客户端（`llm/client.ts`）

支持两种 API 格式，通过 `baseUrl` 和 `model` 自动检测：

- **OpenAI 兼容**：调用 `/v1/chat/completions`，支持 OpenAI、DeepSeek、Qwen、Moonshot、GLM、SiliconFlow、Groq、OpenRouter、Ollama、LM Studio 等
- **Anthropic Messages API**：当 `baseUrl` 含 `anthropic.com` 或 `model` 以 `claude-` 开头时自动切换，调用 `/v1/messages`

预设服务商（`llm/providers.ts`）：

| 服务商 | baseUrl |
|--------|---------|
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | `https://api.anthropic.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Moonshot | `https://api.moonshot.cn/v1` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama (本地) | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |

### 进度报告（`utils/progress.ts`）

```typescript
export type ProgressCallback = (
    log: string | null,
    status: string | null,
    percent: number | null
) => void;

export class ProgressReporter implements IProgressReporter {
    constructor(callback: ProgressCallback)
    log(msg: string): void
    updateStatus(text: string, percent: number): void
    cancel(): void
    readonly cancelled: boolean
    readonly abortController: AbortController
}
```

### 文档分块（`utils/chunking.ts`）

- `splitIntoChunks(markdown, wordCount)` — 按词数分块，尽量在段落边界切割
- `estimateTokens(text)` — 估算 token 数
- `countWords(text)` — 统计词数（中英文混合）

### SiYuan API 封装（`utils/siyuan-api.ts`）

封装思源内核 HTTP API：

| 函数 | 说明 |
|------|------|
| `getCurrentDocId()` | 获取当前编辑器文档 ID |
| `getSelectedText()` | 获取当前选中文本 |
| `getDocTitle(id)` | 获取文档标题 |
| `getDocMarkdown(id)` | 获取文档全文 Markdown |
| `appendMarkdownToDoc(id, md)` | 向文档末尾追加 Markdown 内容 |
| `updateDocContent(id, md)` | 更新文档全文内容 |
| `listNotebooks()` | 列出所有笔记本 |
| `findNotebookByName(name)` | 按名称查找笔记本 |
| `createDocWithMarkdown(nb, path, md)` | 在指定路径创建文档 |
| `getDocByPath(nb, path)` | 检查文档是否已存在 |

### 网络搜索（`search/web-search.ts`）

- **DuckDuckGo**：无需 API Key，免费
- **Tavily**：需要 API Key，学术搜索质量更高
- `performWebSearch(query, config, reporter)` — 优先使用 Tavily（若已配置），回退到 DuckDuckGo

---

## 六大操作详解

### 1. 标注概念（`add-links.ts`）

1. 读取当前文档 Markdown
2. 分块后逐块调用 LLM，识别 `[[概念名]]` 格式的学术词汇
3. 将识别到的概念用 `**粗体**` 标注替换文档中的对应文本
4. 调用 `updateDocContent` 更新整篇文档

### 2. 提取概念（`extract-concepts.ts`）

1. 读取当前文档，分块调用 LLM
2. LLM 输出 `CONCEPT: 概念名` 格式的列表
3. 去重后，在目标笔记本的 `conceptPath` 路径下为每个概念创建独立文档（跳过已存在的）
4. 每个概念文档包含：定义、核心要点、相关概念、参考来源等结构化章节

### 3. 研究摘要（`research-summarize.ts`）

1. 读取文档标题作为搜索主题
2. 调用 DuckDuckGo/Tavily 获取网络资料
3. 将搜索结果 + 文档摘要发送给 LLM 生成研究综述
4. 将综述（含参考来源列表）追加到当前文档末尾

### 4. 生成内容（`generate-content.ts`）

1. 优先使用选中文本作为主题，否则读取文档标题
2. 可选：搜索网络获取背景资料
3. 调用 LLM 生成结构化文档内容（大纲 + 段落）
4. 在文档末尾追加 `---` 分隔符和生成内容

### 5. 翻译文档（`translate.ts`）

1. 读取文档标题和全文
2. 分块逐一调用 LLM 翻译（目标语言由 `outputLanguage` 决定）
3. 合并翻译结果，在 `conceptPath/译文/` 路径下创建新文档
4. 文档名格式：`原标题（目标语言）`；若已存在则加时间戳后缀

### 6. 知识图谱（`mermaid-summary.ts`）

1. 读取文档并取前 2 个分块作为代表性内容
2. 调用 LLM 生成 Mermaid `mindmap` 或 `flowchart` 代码
3. 提取 ` ```mermaid ` 代码块（或处理无围栏的裸代码）
4. 在文档末尾追加 `## 📊 知识图谱` 章节和 Mermaid 代码块

---

## UI 面板

Dock 面板（`ui/PaperReaderPanel.tsx`）提供：

- **2 列按钮网格**：6 个操作按钮，运行时禁用并降低透明度
- **进度条区域**（运行时显示）：状态文字 + 百分比进度条 + 取消按钮
- **滚动日志区域**：最多保留 200 条日志，新日志置顶，带时间戳
- **清空按钮**：一键清空日志和进度状态

---

## 与 obsidian-NotEMD 的差异

| 方面 | obsidian-NotEMD | paper-reader (SiYuan) |
|------|-----------------|----------------------|
| 文件访问 | `app.vault` API | 思源 Kernel HTTP API |
| HTTP 请求 | `requestUrl()` | 原生 `fetch()` |
| 文档引用 | Obsidian `[[wiki links]]` | SiYuan 块 ID |
| 概念标注 | `[[概念]]` 双链 | `**概念**` 粗体（阶段一） |
| UI 框架 | Obsidian Modal | SolidJS Dock 面板 |
| 进度回调 | 多参数构造器 | 单回调 `(log, status, percent)` |
| 模块注册 | Obsidian Plugin | IFuncModule + `_ModulesToEnable` |
