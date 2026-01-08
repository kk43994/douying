@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

where node >nul 2>&1
if errorlevel 1 (
  echo [Error] 未检测到 Node.js。请先安装 Node.js 后再重启。
  echo 下载: https://nodejs.org/
  pause
  goto END
)

echo [重启] 关闭中...
node scripts\launcher\stop.mjs >nul 2>&1

echo [重启] 启动中...
node scripts\launcher\start.mjs %*

:END
popd >nul
endlocal

