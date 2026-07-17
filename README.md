# Scribestellar

**Convert audio to text with precision — a full-stack transcription app with payments, job tracking, and GPU-powered Whisper.**

🌐 **Live demo:** [https://extraordinary-chaja-8aff00.netlify.app](https://extraordinary-chaja-8aff00.netlify.app)

---

## Overview

Scribestellar is a production-style audio transcription web app built as a portfolio project. Users upload audio files, see duration-based pricing, pay through Razorpay checkout, and receive transcriptions in multiple formats — all through a polished multi-step UI.

The live site runs in **portfolio demo mode**: the frontend is hosted on Netlify, the database on Neon PostgreSQL, and transcription runs on a local machine with an **NVIDIA GPU (RTX 3060)** via OpenAI Whisper — exposed to the internet through a **Cloudflare Tunnel** when the backend is online.

---

## Features

- **Drag-and-drop upload** — MP3, WAV, M4A, OGG, FLAC (configurable max size, default 5 MB for demo)
- **Duration-based pricing** — automatic quote after upload via ffmpeg probe
- **Razorpay payments** — test-mode checkout with server-side signature verification
- **Async transcription jobs** — payment verified instantly; Whisper runs in a background queue
- **Multiple export formats** — TXT, SRT, VTT, JSON, TSV, or download all as ZIP
- **Live preview** — view and copy transcription text in the browser before downloading
- **Backend health indicator** — demo banner shows when the GPU backend is online
- **Animated UI** — canvas particle background, step progress, and shadcn/ui components

---

## How it works

```
Visitor
  → Netlify (Next.js frontend + /api/* proxy routes)
    → Cloudflare Tunnel (when PC is online)
      → Express API on local PC
        → Neon PostgreSQL (orders, jobs, files)
        → OpenAI Whisper (GPU) + ffmpeg
```

### User flow

1. **Upload** — User drops an audio file; the backend probes duration and returns a price.
2. **Pricing** — User reviews file name, duration, and total cost.
3. **Payment** — Razorpay checkout opens (test mode in demo).
4. **Processing** — Frontend polls job status while Whisper transcribes on GPU.
5. **Download** — User previews text, switches formats, copies to clipboard, or downloads files.

### Pricing tiers (INR)

| Audio length | Price |
|--------------|-------|
| Under 10 min | ₹65   |
| 10–30 min    | ₹100  |
| Over 30 min  | ₹150  |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | Node.js, Express, Multer, fluent-ffmpeg |
| **Transcription** | OpenAI Whisper (Python), CUDA GPU acceleration |
| **Database** | PostgreSQL (Neon) |
| **Payments** | Razorpay (orders + HMAC signature verification) |
| **Hosting** | Netlify (frontend), Cloudflare Tunnel (backend), local PC (Whisper) |
| **Containerization** | Docker + docker-compose (optional local backend) |

---

## Project structure

```
Transcriber Bro/
├── frontend/                 # Next.js app → Netlify
│   ├── app/
│   │   ├── page.tsx          # Main transcription UI
│   │   └── api/              # Server routes proxying to backend
│   ├── components/           # UI components (shadcn)
│   └── lib/backend.ts        # Backend URL config
├── backend/                  # Express API + Whisper
│   ├── server.js             # Upload, payment, jobs, download
│   ├── Dockerfile
│   └── requirements.txt      # Python Whisper dependency
├── database/
│   └── migrations/           # Neon SQL migrations
├── scripts/                  # Portfolio setup & tunnel helpers
├── docker-compose.yml
├── netlify.toml
└── package.json              # Root dev scripts
```

---

## Getting started (local development)

### Prerequisites

- Node.js 20+
- Python 3 with `openai-whisper` installed (`pip install -r backend/requirements.txt`)
- ffmpeg on PATH
- PostgreSQL (or a [Neon](https://neon.tech) connection string)

### 1. Clone the repo

```bash
git clone https://github.com/herrsh12/Transcriber-Bro.git
cd Transcriber-Bro
```

### 2. Database setup

Run these in order in the Neon SQL Editor (or local Postgres):

1. `database/migrations/000_base_schema.sql`
2. `database/migrations/001_transcription_jobs.sql`

### 3. Environment variables

Copy the example env files and fill in your values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

**`backend/.env`** — key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `RAZORPAY_KEY_ID` | Razorpay test key |
| `RAZORPAY_KEY_SECRET` | Razorpay test secret |
| `FRONTEND_URL` | `http://localhost:3000` (comma-separated for multiple origins) |
| `WHISPER_MODEL` | Whisper model size (`base`, `small`, etc.) |
| `WHISPER_DEVICE` | `cuda` for GPU, leave empty for CPU |

**`frontend/.env.local`** — key variables:

| Variable | Description |
|----------|-------------|
| `BACKEND_URL` | `http://localhost:4000` |
| `NEXT_PUBLIC_BACKEND_URL` | Same as above |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay public test key |

### 4. Run locally

```bash
# Terminal 1 — backend
npm run dev:backend

# Terminal 2 — frontend
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000).

---

## Portfolio demo mode (live site)

The deployed app uses a **$0/month** architecture:

| Service | Role | Cost |
|---------|------|------|
| **Netlify** | Frontend hosting | Free |
| **Neon** | PostgreSQL | Free tier |
| **Your PC** | Express API + Whisper on GPU | Electricity only |
| **Cloudflare Tunnel** | HTTPS URL to localhost:4000 | Free |
| **Razorpay** | Test-mode payments | Free |

To keep the live demo working:

```powershell
# Terminal 1
npm run start:backend:tunnel

# Terminal 2
npm run tunnel
```

Copy the `https://*.trycloudflare.com` URL into Netlify environment variables as `BACKEND_URL` and `NEXT_PUBLIC_BACKEND_URL`, then redeploy.

Run `npm run portfolio` for the full checklist.

---

## Docker (optional)

Run the backend in a container with ffmpeg and Whisper pre-installed:

```bash
npm run docker:build
npm run docker:up
```

The API listens on [http://localhost:4000](http://localhost:4000).

---

## API endpoints (backend)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | Health check + config info |
| `POST` | `/upload` | Upload audio, get duration & price |
| `POST` | `/process-payment` | Create Razorpay order |
| `POST` | `/verify-payment` | Verify payment & start transcription job |
| `GET` | `/job-status/:jobId` | Poll transcription progress |
| `GET` | `/formats?file=` | List available output formats |
| `GET` | `/download?file=&format=` | Download a single format |
| `GET` | `/download-all?file=` | Download all formats as ZIP |

The Next.js frontend proxies these through `/api/*` routes so the browser never talks to the backend directly.

---

## Screenshots

Visit the live app to see the full experience:

**[https://extraordinary-chaja-8aff00.netlify.app](https://extraordinary-chaja-8aff00.netlify.app)**

---

## Author

Built by [herrsh12](https://github.com/herrsh12) as a portfolio project demonstrating full-stack development, payment integration, async job processing, and GPU-accelerated ML inference.

---

## License

Private portfolio project. All rights reserved.
