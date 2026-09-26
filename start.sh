#!/bin/bash
cd "$(dirname "$0")" || exit 1

PORT=${1:-8000}

echo "================================"
echo "  胖宝网 本地服务器启动中..."
echo "  端口: $PORT"
echo "================================"

# 1 秒后自动打开浏览器
( sleep 1 && open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" 2>/dev/null ) &

python3 -m http.server "$PORT"
