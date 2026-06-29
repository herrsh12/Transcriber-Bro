# Starts the Express API on http://localhost:4000
# Prereqs: backend/.env filled in (Neon DATABASE_URL, Razorpay test keys, FRONTEND_URL)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Test-Path "backend\.env")) {
  Write-Host "Create backend\.env from backend\.env.example first." -ForegroundColor Red
  exit 1
}

Write-Host "Starting backend on http://localhost:4000 ..." -ForegroundColor Cyan
npm run dev:backend
