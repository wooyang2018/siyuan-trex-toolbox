# 霸王龙工具箱 / Tyrannosaurus Toolbox

<p align="center">
  <img src="icon.png" alt="Tyrannosaurus Toolbox Icon" width="128" height="128">
</p>

<p align="center">
  <a href="https://github.com/wooyang2018/siyuan-trex-toolbox">
    <img src="https://img.shields.io/github/v/release/wooyang2018/siyuan-trex-toolbox?style=flat-square" alt="Release">
  </a>
  <a href="https://github.com/wooyang2018/siyuan-trex-toolbox/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/wooyang2018/siyuan-trex-toolbox?style=flat-square" alt="License">
  </a>
</p>

一个功能丰富的思源笔记插件，集成了多种实用工具，提升你的笔记体验。

A feature-rich SiYuan Note plugin that integrates various practical tools to enhance your note-taking experience.

## ✨ 功能特性 / Features

### 🖥️ 中键小窗 (Mini Window)
- 使用鼠标中键点击块元素，即可在新的独立小窗口中打开
- 支持居中显示，自动计算窗口位置
- 小窗模式下自动隐藏面包屑和操作按钮，提供更清爽的浏览体验

**适用场景**：快速查看引用内容、对比多个文档内容

### 💭 转移引用 (Transfer Reference)
- 批量将一个块的所有引用转移到另一个块
- 可视化界面显示引用列表
- 支持搜索和选择目标块
- 块菜单和文档标题右键菜单集成

**适用场景**：重构笔记结构、合并重复内容

### 📑 文档上下文 (Document Context)
- 快速查看和导航父文档、子文档和同级文档
- 支持快捷键快速跳转：
  - `Ctrl+↑`：跳转到父文档
  - `Ctrl+↓`：跳转到子文档
- 可视化展示文档层级关系
- 支持在当前标签页或新标签页打开

**适用场景**：在层级化的笔记结构中快速导航

### 🔍 引用迁移 (Migrate References)
- 搜索并迁移指定块的引用关系
- 批量处理引用更新
- 支持预览将要迁移的引用

### 🔗 链接图标 (Link Icon)
- 为外部链接自动添加网站图标
- 支持自定义图标映射
- 美化文档中的超链接显示

### 📌 固定图片 (Pin Image)
- 图片固定和预览功能
- 支持图片缩放和位置调整
- 改善图片浏览体验

### 💬 引用块标注 (Blockquote Callout)
- 为引用块添加特殊样式标注
- 支持多种标注类型（提示、警告、信息等）
- 增强文档的视觉层次

### 🔌 WebSocket 集成
- 支持通过WebSocket与外部工具通信
- 可扩展集成第三方服务
- 实时数据同步

### ⚙️ 文档文件工具 (Doc File Tools)
- 文档级别的实用工具集合
- 文件操作辅助功能

### ⌨️ 快捷键管理 (Keymap)
- 自定义快捷键配置
- 状态栏快速访问

## 🚀 使用说明 / Usage

### 启用功能模块
1. 点击顶栏的工具箱图标 🔧
2. 选择 `设置`
3. 在设置面板中勾选需要启用的功能模块

### 快速访问
- **顶栏图标**：左键点击显示功能菜单，右键点击打开设置
- **快捷键**：各功能模块支持自定义快捷键（在思源笔记的快捷键设置中配置）
- **右键菜单**：部分功能集成在块菜单和编辑器标题菜单中

### 配置选项
每个功能模块都有独立的配置选项，可以在设置面板中进行调整。

## 🛠️ 开发 / Development

### 技术栈
- **框架**: [SolidJS](https://www.solidjs.com/)
- **构建工具**: Vite
- **语言**: TypeScript
- **API**: SiYuan Plugin API
- **工具库**: @frostime/siyuan-plugin-kits

### 项目结构
```
siyuan-trex-toolbox/
├── src/
│   ├── func/              # 功能模块
│   │   ├── mini-window.ts      # 中键小窗
│   │   ├── transfer-ref/       # 转移引用
│   │   ├── doc-context.tsx     # 文档上下文
│   │   ├── migrate-refs/       # 引用迁移
│   │   ├── link-icon/          # 链接图标
│   │   ├── pin-image/          # 固定图片
│   │   ├── bq-callout/         # 引用块标注
│   │   ├── websocket/          # WebSocket
│   │   ├── docfile-tools.ts    # 文档工具
│   │   └── keymap.ts           # 快捷键
│   ├── libs/              # 共享组件库
│   ├── settings/          # 设置界面
│   ├── types/             # 类型定义
│   ├── api/               # API封装
│   └── index.ts           # 入口文件
├── public/                # 静态资源
├── scripts/               # 构建脚本
└── plugin.json            # 插件配置
```

### 本地开发

#### 环境要求
- Node.js 16+
- pnpm 7+

#### 开发步骤
```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm run dev

# 构建生产版本
pnpm run build

# 创建软链接（Windows）
pnpm run make-link

# 构建并安装到思源
pnpm run make-install
```