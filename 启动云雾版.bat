@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

set "DRY_RUN=0"
if /i "%~1"=="--dry-run" set "DRY_RUN=1"

echo ========================================
echo   天雨学长AI编导 - YunWu API Edition
echo ========================================
echo.
echo Tips:
echo 1. This version uses YunWu.ai OpenAI-compatible API
echo 2. After startup, go to Settings to enter your API Key
echo 3. Default URL: http://127.0.0.1:3000
echo.

if not exist "%ROOT%package.json" (
  echo [Error] package.json not found
  pause
  goto END
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [Error] npm not found. Please install Node.js and reopen this script.
  pause
  goto END
)

if not exist "%ROOT%node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Error] npm install failed
    pause
    goto END
  )
)

if "%DRY_RUN%"=="1" (
  echo.
  echo Dry run OK.
  goto END
)

echo Opening: http://127.0.0.1:3000
start "" "http://127.0.0.1:3000/"

echo Starting dev server...
call npm run dev
goto END

:END
popd >nul
endlocal
