#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "[Error] 未检测到 Node.js。请先安装 Node.js（建议 18+）"
  echo "下载：https://nodejs.org/"
  echo
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

echo "[启动] 正在启动平台..."
echo "提示：如需换端口，可在终端执行：./启动平台.command --port 3001"
echo

node scripts/launcher/start.mjs "$@"

echo
read -n 1 -s -r -p "按任意键关闭窗口..."
echo

