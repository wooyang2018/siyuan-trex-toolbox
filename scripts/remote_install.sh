#!/usr/bin/env bash
# remote_install.sh — 远程安装/更新 SiYuan 插件
# 通过 /api/file/putFile 上传 dist/，再热重载插件，并确认入口文件和启用状态。
set -euo pipefail

# ── 连接配置 ──────────────────────────────────────────
# SIYUAN_API 未设置时用本机默认端口；SIYUAN_TOKEN 未设置时为开放模式。
API_URL="${SIYUAN_API:-http://127.0.0.1:6806}"
TOKEN="${SIYUAN_TOKEN:-}"

# ── 默认值 ──────────────────────────────────────────────
PLUGIN_NAME="siyuan-trex-toolbox"
DIST_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"
FRONTEND="desktop"
REMOTE_BASE="/data/plugins/$PLUGIN_NAME"

# ── 参数解析 ────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --plugin-name) PLUGIN_NAME="$2"; REMOTE_BASE="/data/plugins/$PLUGIN_NAME"; shift 2 ;;
        --dist-dir)   DIST_DIR="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: SIYUAN_API=URL SIYUAN_TOKEN=TOKEN $0 [--plugin-name NAME] [--dist-dir DIR]"
            echo "  SIYUAN_API   default http://127.0.0.1:6806"
            echo "  SIYUAN_TOKEN default empty (open mode)"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── 校验 ────────────────────────────────────────────────
if [[ ! -d "$DIST_DIR" ]]; then
    echo "ERROR: dist directory not found: $DIST_DIR"
    exit 1
fi

# token 为空或 "none" 时视为开放模式，不发送 Authorization 头
if [[ -z "$TOKEN" || "$TOKEN" == "none" ]]; then
    AUTH_HEADER=()
else
    AUTH_HEADER=(-H "Authorization: Token $TOKEN")
fi

echo "============================================"
echo "  Remote Plugin Installer"
echo "============================================"
echo "  API URL    : $API_URL"
if [[ -z "$TOKEN" || "$TOKEN" == "none" ]]; then
    echo "  Token      : (open mode)"
else
    echo "  Token      : set"
fi
echo "  Plugin     : $PLUGIN_NAME"
echo "  Remote base: $REMOTE_BASE"
echo "  Dist dir   : $DIST_DIR"
echo "============================================"
echo ""

# ── 辅助函数 ────────────────────────────────────────────
api_post_json() {
    local endpoint="$1" body="$2"
    curl -s -X POST "$API_URL$endpoint" \
        ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} \
        -H "Content-Type: application/json" \
        -d "$body"
}

api_post_form() {
    local endpoint="$1"; shift
    curl -s -X POST "$API_URL$endpoint" \
        ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} \
        "$@"
}

check_code() {
    local resp="$1"
    echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code',1))" 2>/dev/null || echo "1"
}

# ── Step 1: 创建目录 ───────────────────────────────────
echo "[1/4] Creating directories..."
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
echo "[2/4] Uploading files..."
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
echo "[3/4] Reloading plugin (disable → enable)..."

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

# ── Step 4: 确认入口文件和启用状态 ────────────────────
echo ""
echo "[4/4] Checking remote plugin..."

TMP_JS=$(mktemp)
curl -s -X POST "$API_URL/api/file/getFile" \
    ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$REMOTE_BASE/index.js\"}" -o "$TMP_JS" 2>/dev/null

READBACK="failed"
if [[ ! -s "$TMP_JS" ]]; then
    echo "  ERROR: could not read back remote index.js"
else
    REMOTE_SIZE=$(wc -c < "$TMP_JS" | tr -d ' ')
    LOCAL_SIZE=$(wc -c < "$DIST_DIR/index.js" | tr -d ' ')
    echo "  Remote index.js: ${REMOTE_SIZE} bytes"
    echo "  Local  index.js: ${LOCAL_SIZE} bytes"
    if [[ "$REMOTE_SIZE" == "$LOCAL_SIZE" ]]; then
        echo "  Size matches"
        READBACK="ok"
    else
        echo "  WARN: size differs"
        READBACK="size-mismatch"
    fi
fi
rm -f "$TMP_JS"

PETALS_RESP=$(api_post_json "/api/petal/loadPetals" "{\"frontend\":\"$FRONTEND\"}")
PLUGIN_ENABLED=$(echo "$PETALS_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('data',[]):
    if p.get('name')=='$PLUGIN_NAME':
        print(p.get('enabled','unknown'))
        break
else:
    print('not-found')
" 2>/dev/null || echo "error")
echo "  Plugin enabled: $PLUGIN_ENABLED"

NOTIFY_MSG="${PLUGIN_NAME} 已更新。请刷新页面后验收。"
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
echo "  index.js       : $READBACK"
echo "  Plugin enabled : $PLUGIN_ENABLED"
echo "============================================"
