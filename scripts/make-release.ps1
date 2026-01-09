param(
  [string]$OutDir = "release"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Stamp = Get-Date -Format "yyyyMMdd-HHmm"
$ReleaseName = "tianyu-ai-director-$Stamp"
$ReleaseRoot = Join-Path $Root $OutDir
$ReleaseDir = Join-Path $ReleaseRoot $ReleaseName
$ZipPath = Join-Path $ReleaseRoot "$ReleaseName.zip"

New-Item -ItemType Directory -Force -Path $ReleaseRoot | Out-Null
if (Test-Path $ReleaseDir) { Remove-Item -Recurse -Force $ReleaseDir }

Write-Host "[打包] 确保依赖..."
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Push-Location $Root
  npm install
  Pop-Location
}

Write-Host "[打包] 构建 dist..."
Push-Location $Root
npm run build
Pop-Location

Write-Host "[打包] 复制文件..."
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
$ReleaseScriptsDir = Join-Path $ReleaseDir "scripts"
New-Item -ItemType Directory -Force -Path $ReleaseScriptsDir | Out-Null

Copy-Item (Join-Path $Root "dist") $ReleaseDir -Recurse -Force
Copy-Item (Join-Path $Root "package.json") $ReleaseDir -Force
Copy-Item (Join-Path $Root "package-lock.json") $ReleaseDir -Force
Copy-Item (Join-Path $Root "vite.config.ts") $ReleaseDir -Force
Copy-Item (Join-Path $Root "vite.api.ts") $ReleaseDir -Force
Copy-Item (Join-Path $Root "tsconfig.json") $ReleaseDir -Force
Copy-Item (Join-Path $Root "启动平台.bat") $ReleaseDir -Force
Copy-Item (Join-Path $Root "关闭平台.bat") $ReleaseDir -Force
Copy-Item (Join-Path $Root "重启平台.bat") $ReleaseDir -Force
Copy-Item (Join-Path $Root "启动平台.command") $ReleaseDir -Force
Copy-Item (Join-Path $Root "关闭平台.command") $ReleaseDir -Force
Copy-Item (Join-Path $Root "重启平台.command") $ReleaseDir -Force
Copy-Item (Join-Path $Root "使用说明.md") $ReleaseDir -Force
Copy-Item (Join-Path $Root "scripts\\launcher") $ReleaseScriptsDir -Recurse -Force

Write-Host "[打包] 生成压缩包..."
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $ReleaseDir "*") -DestinationPath $ZipPath -Force

Write-Host "[打包] 完成：$ZipPath"
