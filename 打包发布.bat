@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

where powershell >nul 2>&1
if errorlevel 1 (
  echo [Error] 未检测到 PowerShell，无法自动打包。
  pause
  goto END
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\\make-release.ps1"
if errorlevel 1 (
  echo [Error] 打包失败，请查看输出信息。
  pause
  goto END
)

echo [OK] 打包完成，文件在 release\\ 目录。
pause

:END
popd >nul
endlocal

