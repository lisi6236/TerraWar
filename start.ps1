# TerraWar 地缘战争 · 一键启动（Windows）
# 命令行运行：powershell -ExecutionPolicy Bypass -File start.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$port = if ($env:PORT) { $env:PORT } else { "5175" }

function Write-Fail($msg) {
  Write-Host ""
  Write-Host "[错误] $msg" -ForegroundColor Red
  exit 1
}

Write-Host "==============================================" -ForegroundColor DarkYellow
Write-Host "   TerraWar 地缘战争 · 一键启动" -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor DarkYellow
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Fail "未找到 Node.js，请先安装：https://nodejs.org/"
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Fail "未找到 pnpm，可先执行：npm install -g pnpm"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[1/3] 安装依赖（首次较慢，请耐心等待）..." -ForegroundColor Cyan
  pnpm install
  if ($LASTEXITCODE -ne 0) { Write-Fail "依赖安装失败" }
} else {
  Write-Host "[1/3] 依赖已就绪" -ForegroundColor DarkGray
}

if (-not (Test-Path "packages/map-data/maps/maps.json")) {
  Write-Host "[2/3] 生成地图数据..." -ForegroundColor Cyan
  pnpm mapgen
  if ($LASTEXITCODE -ne 0) { Write-Fail "地图生成失败" }
} else {
  Write-Host "[2/3] 地图数据已就绪" -ForegroundColor DarkGray
}

$url = "http://localhost:$port"
Write-Host "[3/3] 启动本地服务器：$url" -ForegroundColor Cyan
Write-Host "      浏览器会自动打开；按 Ctrl+C 或关闭窗口即可停止" -ForegroundColor DarkGray
Write-Host ""

# 延迟 4 秒后用系统默认浏览器打开（后台线程，避免阻塞服务器启动）
$open = [scriptblock]::Create("Start-Sleep -Seconds 4; [System.Diagnostics.Process]::Start('$url')")
$null = $open.BeginInvoke($null, $null)

pnpm --filter @terrawar/web exec vite --port $port --strictPort

Write-Host ""
Write-Host "服务器已停止。" -ForegroundColor DarkGray