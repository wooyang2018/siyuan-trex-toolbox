#!/usr/bin/env bash
# remote_install.sh — 远程安装/更新 SiYuan 插件到远程实例
# 通过 /api/file/putFile 逐文件上传 dist/ 到远程插件目录，
# 然后通过 /api/petal/setPetalEnabled 热重载插件，
# 最后验证 SRS 模块群代码并通知用户。
set -euo pipefail

# ── 默认值 ──────────────────────────────────────────────
PLUGIN_NAME="siyuan-trex-toolbox"
DIST_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"
CONFIG_FILE="$HOME/.siyuan-sisyphus/config.json"
FRONTEND="desktop"
REMOTE_BASE="/data/plugins/$PLUGIN_NAME"

# 从 config 读取凭据
if [[ -f "$CONFIG_FILE" ]]; then
    API_URL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['profiles']['default']['apiUrl'])" 2>/dev/null || echo "")
    TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['profiles']['default']['token'])" 2>/dev/null || echo "")
fi

# ── 参数解析 ────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-url)    API_URL="$2"; shift 2 ;;
        --token)      TOKEN="$2"; shift 2 ;;
        --plugin-name) PLUGIN_NAME="$2"; REMOTE_BASE="/data/plugins/$PLUGIN_NAME"; shift 2 ;;
        --dist-dir)   DIST_DIR="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: $0 [--api-url URL] [--token TOKEN] [--plugin-name NAME] [--dist-dir DIR]"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── 校验 ────────────────────────────────────────────────
if [[ -z "$API_URL" || -z "$TOKEN" ]]; then
    echo "ERROR: API URL or Token not set. Use --api-url and --token, or configure ~/.siyuan-sisyphus/config.json"
    exit 1
fi
if [[ ! -d "$DIST_DIR" ]]; then
    echo "ERROR: dist directory not found: $DIST_DIR"
    exit 1
fi

echo "============================================"
echo "  Remote Plugin Installer"
echo "============================================"
echo "  API URL    : $API_URL"
echo "  Plugin     : $PLUGIN_NAME"
echo "  Remote base: $REMOTE_BASE"
echo "  Dist dir   : $DIST_DIR"
echo "============================================"
echo ""

# ── 辅助函数 ────────────────────────────────────────────
api_post_json() {
    local endpoint="$1" body="$2"
    curl -s -X POST "$API_URL$endpoint" \
        -H "Authorization: Token $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$body"
}

api_post_form() {
    local endpoint="$1"; shift
    curl -s -X POST "$API_URL$endpoint" \
        -H "Authorization: Token $TOKEN" \
        "$@"
}

check_code() {
    local resp="$1"
    echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code',1))" 2>/dev/null || echo "1"
}

# ── Step 1: 创建目录 ───────────────────────────────────
echo "[1/5] Creating directories..."
DIR_COUNT=0
while IFS= read -r dir; do
    rel="${dir#"$DIST_DIR"}"
    [[ -z "$rel" ]] && continue
    resp=$(api_post_form "/api/file/putFile" -F "path=$REMOTE_BASE$rel" -F "isDir=true")
    code=$(check_code "$resp")
    if [[ "$code" != "0" ]]; then
        echo "  WARN: failed to create dir $rel (code=$code)"
    fi
    DIR_COUNT=$((DIR_COUNT + 1))
done < <(find "$DIST_DIR" -type d)
echo "  Done: $DIR_COUNT directories processed"

# ── Step 2: 上传文件 ───────────────────────────────────
echo ""
echo "[2/5] Uploading files..."
SUCCESS=0
FAILED=0
FAILED_FILES=()

while IFS= read -r file; do
    rel="${file#"$DIST_DIR"}"
    resp=$(api_post_form "/api/file/putFile" -F "path=$REMOTE_BASE$rel" -F "file=@$file")
    code=$(check_code "$resp")
    if [[ "$code" == "0" ]]; then
        SUCCESS=$((SUCCESS + 1))
        echo "  OK   $rel"
    else
        FAILED=$((FAILED + 1))
        FAILED_FILES+=("$rel")
        echo "  FAIL $rel (code=$code)"
    fi
done < <(find "$DIST_DIR" -type f)

echo ""
echo "  Upload summary: $SUCCESS succeeded, $FAILED failed"
if [[ ${#FAILED_FILES[@]} -gt 0 ]]; then
    echo "  Failed files:"
    for f in "${FAILED_FILES[@]}"; do
        echo "    - $f"
    done
    echo ""
    echo "  Retrying failed files..."
    RETRY_OK=0
    for f in "${FAILED_FILES[@]}"; do
        resp=$(api_post_form "/api/file/putFile" -F "path=$REMOTE_BASE$f" -F "file=@$DIST_DIR$f")
        code=$(check_code "$resp")
        if [[ "$code" == "0" ]]; then
            RETRY_OK=$((RETRY_OK + 1))
            echo "    OK (retry) $f"
        else
            echo "    FAIL (retry) $f"
        fi
    done
    echo "  Retry result: $RETRY_OK/${#FAILED_FILES[@]} recovered"
fi

# ── Step 3: 热重载插件 ─────────────────────────────────
echo ""
echo "[3/5] Reloading plugin (disable → enable)..."

echo "  Disabling $PLUGIN_NAME..."
resp=$(api_post_json "/api/petal/setPetalEnabled" \
    "{\"packageName\":\"$PLUGIN_NAME\",\"enabled\":false,\"frontend\":\"$FRONTEND\"}")
code=$(check_code "$resp")
echo "  Disable result: code=$code"

sleep 2

echo "  Enabling $PLUGIN_NAME..."
resp=$(api_post_json "/api/petal/setPetalEnabled" \
    "{\"packageName\":\"$PLUGIN_NAME\",\"enabled\":true,\"frontend\":\"$FRONTEND\"}")
code=$(check_code "$resp")
echo "  Enable result: code=$code"

# ── Step 4: 验证 SRS 模块代码 ─────────────────────────
echo ""
echo "[4/5] Verifying SRS modules in remote bundle..."

# 读回远程 index.js（入口文件，含 require 指向主 bundle）
TMP_ENTRY=$(mktemp)
curl -s -X POST "$API_URL/api/file/getFile" \
    -H "Authorization: Token $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$REMOTE_BASE/index.js\"}" -o "$TMP_ENTRY" 2>/dev/null

# 从 index.js 提取主 bundle 文件名（如 index-B4aOLP5u.cjs）；若无代码分割则回退到 index.js
MAIN_BUNDLE=$(grep -oP 'require\("\./(index-[A-Za-z0-9_]+\.cjs)"\)' "$TMP_ENTRY" 2>/dev/null | grep -oP 'index-[A-Za-z0-9_]+\.cjs' 2>/dev/null | head -1 || true)
rm -f "$TMP_ENTRY"

if [[ -z "$MAIN_BUNDLE" ]]; then
    echo "  Single-file build detected (no code-split chunks), verifying index.js directly"
    MAIN_BUNDLE="index.js"
else
    echo "  Code-split build detected, main bundle: $MAIN_BUNDLE"
fi
echo "  Main bundle to verify: $MAIN_BUNDLE"

# 下载主 bundle 到临时文件
TMP_JS=$(mktemp)
curl -s -X POST "$API_URL/api/file/getFile" \
    -H "Authorization: Token $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$REMOTE_BASE/$MAIN_BUNDLE\"}" -o "$TMP_JS" 2>/dev/null

if [[ ! -s "$TMP_JS" ]]; then
    echo "  ERROR: could not read back remote $MAIN_BUNDLE"
else
    REMOTE_SIZE=$(wc -c < "$TMP_JS")
    echo "  Remote $MAIN_BUNDLE size: $REMOTE_SIZE bytes"
    echo ""
    echo "  Checking SRS module patterns (minification-safe):"
    # 使用编译后仍保留的字符串：CSS 类名、日志前缀、存储键、菜单标签
    PATTERNS=("srs-review" "srs-card" "srs-rating" "srs-table" "srs-browser" "srs-neural" "srs-progressive" "SRS-Cards" "SRS-Review" "SRS-Browser" "SRS-Neural" "SRS-Progressive" "cards.json" "queues.json" "提取练习" "Final Drill" "神经漫游" "筛选复习" "srs-queue" "ts-fsrs" "FSRS")
    FOUND=0
    for pat in "${PATTERNS[@]}"; do
        if grep -qF "$pat" "$TMP_JS"; then
            echo "    FOUND  $pat"
            FOUND=$((FOUND + 1))
        else
            echo "    MISSING $pat"
        fi
    done
    echo ""
    echo "  SRS patterns found: $FOUND/${#PATTERNS[@]}"

    # 用 python3 检查中文 UI 文本
    echo "  Checking Chinese UI text:"
    CN_PATTERNS=$(python3 -c "
content = open('$TMP_JS', 'r', errors='replace').read()
pats = ['提取练习', '神经漫游', '筛选复习', '显示答案', '重来', '困难', '良好', '简单', '空间站', 'SRS 浏览器', '摘录', '块级复习']
found = sum(1 for p in pats if p in content)
for p in pats:
    print(f'    {\"FOUND \" if p in content else \"MISS  \"} {p}')
print(f'  Chinese patterns: {found}/{len(pats)}')
import re
count = len(re.findall(r'srs', content, re.IGNORECASE))
print(f'  Total srs occurrences (case-insensitive): {count}')
" 2>/dev/null)
    echo "$CN_PATTERNS"
fi
rm -f "$TMP_JS"

# 验证插件状态
echo ""
echo "  Checking plugin status via loadPetals..."
PETALS_RESP=$(api_post_json "/api/petal/loadPetals" "{\"frontend\":\"$FRONTEND\"}")
TOOLBOX_ENABLED=$(echo "$PETALS_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('data',[]):
    if p.get('name')=='$PLUGIN_NAME':
        print(p.get('enabled','unknown'))
        break
else:
    print('not-found')
" 2>/dev/null || echo "error")
echo "  Plugin $PLUGIN_NAME enabled status: $TOOLBOX_ENABLED"

# ── Step 5: 发送通知 ───────────────────────────────────
echo ""
echo "[5/5] Sending notification to SiYuan..."
NOTIFY_MSG="toolbox 已远程更新！含 SRS 模块群（FSRS v6 调度器/制卡系统/五种队列复习/SRS 浏览器/神经漫游/渐进阅读摘录）。请在设置中启用 SRS 相关模块，顶栏菜单或命令面板打开复习界面验证。"
resp=$(api_post_json "/api/notification/pushMsg" "{\"msg\":\"$NOTIFY_MSG\",\"timeout\":10000}")
code=$(check_code "$resp")
echo "  Notification sent: code=$code"

# ── 汇总 ───────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Remote install complete!"
echo "============================================"
echo "  Files uploaded : $SUCCESS"
echo "  Files failed   : $FAILED"
echo "  Plugin reloaded: $TOOLBOX_ENABLED"
echo "============================================"
