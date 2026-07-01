# Portfolio demo - run in two separate terminals:
#   1. .\scripts\start-backend.ps1
#   2. .\scripts\start-tunnel.ps1
#
# Then set Netlify env BACKEND_URL to the cloudflared https URL and redeploy.

Write-Host @"

Scribestellar - portfolio mode
================================

Terminal 1:  .\scripts\start-backend.ps1
Terminal 2:  .\scripts\start-tunnel.ps1

Netlify (Site settings -> Environment variables):
  BACKEND_URL              = <cloudflared https URL>
  NEXT_PUBLIC_BACKEND_URL  = <same URL>
  NEXT_PUBLIC_DEMO_MODE    = true
  NEXT_PUBLIC_RAZORPAY_KEY_ID = <test key>

backend/.env on this PC:
  DATABASE_URL   = Neon connection string
  FRONTEND_URL   = https://your-site.netlify.app
  PORTFOLIO_MODE = true
  WHISPER_DEVICE = cuda   (optional, if PyTorch+CUDA installed locally)

"@ -ForegroundColor Cyan
