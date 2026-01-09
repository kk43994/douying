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

echo "[重启] 关闭中..."
node scripts/launcher/stop.mjs >/dev/null 2>&1 || true

echo "[重启] 启动中..."
echo
node scripts/launcher/start.mjs "$@"

echo
read -n 1 -s -r -p "按任意键关闭窗口..."
echo

