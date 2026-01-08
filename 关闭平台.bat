@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

where node >nul 2>&1
if errorlevel 1 (
  echo [Error] 未检测到 Node.js，无法自动关闭。请到任务管理器结束 node 进程。
  pause
  goto END
)

echo [关闭] 正在关闭平台...
node scripts\launcher\stop.mjs

:END
popd >nul
endlocal

