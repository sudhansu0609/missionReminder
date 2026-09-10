<#
.SYNOPSIS
  Start Mission Reminder.

.DESCRIPTION
  One entry point for the whole monorepo. Checks Node, installs dependencies
  when they are missing, builds the shared packages (@mission/core and
  @mission/data), then launches the target you asked for.

.PARAMETER Target
  desktop   (default) Electron + Vite dev app on http://localhost:5183
  mobile    Expo dev server; scan the QR code with the iPhone Camera app
  test      Behaviour tests over the shared rules
  typecheck TypeScript across every package and app
  build     Production build of the desktop renderer + main process

.PARAMETER Install
  Force `npm install` even if node_modules already exists.

.EXAMPLE
  .\start.ps1              # desktop app
  .\start.ps1 mobile       # phone
  .\start.ps1 test
  .\start.ps1 -Install     # refresh dependencies, then desktop
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('desktop', 'mobile', 'test', 'typecheck', 'build')]
  [string]$Target = 'desktop',
  [switch]$Install
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# 1. Node 20+ is required (see package.json "engines").
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js 20 or newer is required. https://nodejs.org'
}
$nodeVersion = (& node -v).TrimStart('v')
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 20) { Fail "Node $nodeVersion found; 20 or newer is required." }
Write-Host "Node $nodeVersion / npm $(& npm -v)"

# 2. Sync is opt-in. Say so once rather than failing silently later.
foreach ($app in 'desktop', 'mobile') {
  if (-not (Test-Path (Join-Path $root "apps\$app\.env"))) {
    Write-Host "  no apps/$app/.env -> running fully local (no account, no sync)" -ForegroundColor DarkGray
  }
}

# 3. Dependencies.
if ($Install -or -not (Test-Path (Join-Path $root 'node_modules'))) {
  Step 'Installing dependencies'
  & npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 4. The shared packages must be built before either app can resolve them.
Step 'Building @mission/core and @mission/data'
& npm run build:core
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5. Launch.
switch ($Target) {
  'desktop'   { Step 'Starting the desktop app (Electron + Vite)'; & npm run dev -w @mission/desktop }
  'mobile'    { Step 'Starting Expo - scan the QR code with your iPhone'; & npm start -w @mission/mobile }
  'test'      { Step 'Running behaviour tests'; & npm test -w @mission/core }
  'typecheck' { Step 'Typechecking every package and app'; & npm run typecheck }
  'build'     { Step 'Building the desktop app'; & npm run build -w @mission/desktop }
}
exit $LASTEXITCODE
