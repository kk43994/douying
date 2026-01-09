#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "[Error] 未检测到 Node.js，无法自动关闭。请手动结束 node 进程。"
  echo
  read -n 1 -s -r -p "按任意键退出..."
  echo
  exit 1
fi

echo "[关闭] 正在关闭平台..."
echo

node scripts/launcher/stop.mjs

echo
read -n 1 -s -r -p "按任意键关闭窗口..."
echo

