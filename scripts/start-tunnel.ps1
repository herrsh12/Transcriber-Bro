# Exposes http://localhost:4000 to the internet via Cloudflare (free HTTPS).
# Install: winget install Cloudflare.cloudflared
# Copy the printed https://*.trycloudflare.com URL into Netlify BACKEND_URL.

$ErrorActionPreference = "Stop"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Install cloudflared: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

Write-Host "Tunneling http://localhost:4000 - copy the https URL into Netlify BACKEND_URL" -ForegroundColor Cyan
cloudflared tunnel --url http://localhost:4000
