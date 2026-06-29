require('dotenv').config();

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const ffmpeg   = require('fluent-ffmpeg');
const Razorpay = require('razorpay');
const { Pool } = require('pg');
const { execFile } = require('child_process'); // safer than exec — no shell interpolation
const crypto   = require('crypto');
const archiver = require('archiver');
const cors     = require('cors');

const app  = express();
const port = process.env.PORT || 4000;

app.use(express.static(path.join(__dirname, 'public')));

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function createPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }

  return new Pool({
    user:     process.env.PG_USER,
    host:     process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port:     process.env.PG_PORT || 5432,
  });
}

const pool = createPool();

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';
const WHISPER_PYTHON = process.env.WHISPER_PYTHON || 'python3';
const WHISPER_DEVICE = process.env.WHISPER_DEVICE || '';
const MAX_CONCURRENT_JOBS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10) || 1
);
const MAX_UPLOAD_MB = Math.max(
  1,
  parseInt(process.env.MAX_UPLOAD_MB || '5', 10) || 5
);

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}));

// ─── Multer ──────────────────────────────────────────────────────────────────
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

// ─── Directories ─────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir  = path.join(__dirname, 'output');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

/**
 * Sanitise a filename so it is safe to pass to execFile.
 * Strips path separators and null bytes; rejects anything that looks
 * like it escaped its directory.
 */
function sanitiseFilename(raw) {
  const base = path.basename(raw); // strip any directory component
  if (base !== raw) throw new Error('Invalid filename: path traversal detected');
  if (/[\x00]/.test(base)) throw new Error('Invalid filename: null byte');
  return base;
}

const TRANSCRIPTION_FORMATS = new Set(['txt', 'srt', 'vtt', 'json', 'tsv']);

function resolveTranscriptionFile(uploadFilename, format) {
  const ext = String(format || 'txt').toLowerCase().replace(/^\./, '');
  if (!TRANSCRIPTION_FORMATS.has(ext)) {
    throw new Error('Invalid format');
  }
  const baseName = path.parse(sanitiseFilename(uploadFilename)).name;
  return {
    baseName,
    format: ext,
    outputName: `${baseName}.${ext}`,
    filePath: path.join(outputDir, `${baseName}.${ext}`),
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  ensureDir(uploadsDir);
  ensureDir(outputDir);
  res.json({
    status: 'Backend API running successfully',
    mode: process.env.PORTFOLIO_MODE === 'true' ? 'portfolio' : 'standard',
    whisperModel: WHISPER_MODEL,
    maxUploadMb: MAX_UPLOAD_MB,
  });
});

app.get('/upload', (req, res) => {
  res.json({ message: 'Use frontend application for uploads' });
});

// Upload audio → probe duration → return charge
app.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const fileName = sanitiseFilename(req.file.originalname);
    console.log('Received file:', fileName);

    const originalFilePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(originalFilePath, req.file.buffer);

    await pool.query(
      'INSERT INTO files (filename, originalfilepath) VALUES ($1, $2)',
      [fileName, originalFilePath]
    );

    ffmpeg.ffprobe(originalFilePath, (err, metadata) => {
      if (err) {
        console.error('ffprobe error:', err);
        return res.status(500).json({ error: 'Error calculating audio duration' });
      }

      const duration        = metadata.format.duration;
      const durationMinutes = duration / 60;
      const charge =
        durationMinutes < 10 ? 65 :
        durationMinutes < 30 ? 100 : 150;

      res.json({ success: true, file: fileName, charge, duration: formatDuration(duration) });
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create Razorpay order
app.post('/process-payment', async (req, res) => {
  try {
    const { file, charge } = req.body;

    const order = await razorpay.orders.create({
      amount:   charge * 100,
      currency: 'INR',
      receipt:  file,
    });

    await pool.query(
      'INSERT INTO orders (order_id, amount, currency, file_name) VALUES ($1, $2, $3, $4)',
      [order.id, charge, 'INR', file]
    );

    res.json({ orderId: order.id, amount: charge * 100 });
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Verify Razorpay signature → queue transcription job → respond immediately
app.post('/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, file, charge } = req.body;

  // ── 1. Verify signature ───────────────────────────────────────────────────
  const generated = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generated !== razorpay_signature) {
    await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_id = $2',
      ['failed', razorpay_order_id]
    );
    return res.status(400).json({ success: false, message: 'Payment verification failed' });
  }

  // ── 2. Mark order paid ────────────────────────────────────────────────────
  await pool.query(
    'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_id = $2',
    ['paid', razorpay_order_id]
  );

  // ── 3. Create a transcription job row ─────────────────────────────────────
  const jobResult = await pool.query(
    `INSERT INTO transcription_jobs (order_id, file_name, status)
     VALUES ($1, $2, 'pending')
     RETURNING job_id`,
    [razorpay_order_id, file]
  );
  const jobId = jobResult.rows[0].job_id;

  // ── 4. Respond immediately — don't wait for Whisper ───────────────────────
  res.json({ success: true, jobId, message: 'Payment verified. Transcription started.' });

  // ── 5. Queue transcription (limits concurrent Whisper runs to avoid OOM) ──
  enqueueTranscriptionJob(jobId, file);
});

// Poll transcription job status
app.get('/job-status/:jobId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT status, error FROM transcription_jobs WHERE job_id = $1',
      [req.params.jobId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ jobId: req.params.jobId, ...result.rows[0] });
  } catch (err) {
    console.error('job-status error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Existing order-status route (frontend still uses this)
app.get('/order-status/:orderId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT status FROM orders WHERE order_id = $1',
      [req.params.orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ orderId: req.params.orderId, status: result.rows[0].status });
  } catch (err) {
    console.error('order-status error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// List Whisper output formats available for an upload
app.get('/formats', (req, res) => {
  try {
    const file = sanitiseFilename(req.query.file || '');
    const { baseName } = resolveTranscriptionFile(file, 'txt');
    const formats = [...TRANSCRIPTION_FORMATS].filter((ext) =>
      fs.existsSync(path.join(outputDir, `${baseName}.${ext}`))
    );
    res.json({ file, baseName, formats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Download single transcription file (upload name + format extension)
app.get('/download', (req, res) => {
  try {
    const file = sanitiseFilename(req.query.file || '');
    const format = req.query.format || req.query.type || 'txt';
    if (format === 'zip') {
      return res.status(400).json({ error: 'Use /download-all for zip' });
    }

    const { outputName, filePath } = resolveTranscriptionFile(file, format);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (req.query.inline === '1') {
      const body = fs.readFileSync(filePath, 'utf8');
      const contentType =
        format === 'json' ? 'application/json' :
        format === 'vtt' ? 'text/vtt' : 'text/plain';
      return res.type(contentType).send(body);
    }

    res.download(filePath, outputName);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Download all transcription formats as a zip
app.get('/download-all', async (req, res) => {
  const file         = sanitiseFilename(req.query.file || '');
  const baseName     = path.parse(file).name;
  const zipFileName  = `${baseName}_transcriptions.zip`;

  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  try {
    const files = fs.readdirSync(outputDir).filter(f => f.startsWith(baseName));
    files.forEach(f => archive.file(path.join(outputDir, f), { name: f }));
    await archive.finalize();
  } catch (err) {
    console.error('download-all error:', err);
    // Headers already sent at this point — just destroy
    res.destroy();
  }
});

// ─── Transcription job queue (one Whisper process at a time by default) ───────

const transcriptionQueue = [];
let activeTranscriptionJobs = 0;

function enqueueTranscriptionJob(jobId, file) {
  transcriptionQueue.push({ jobId, file });
  void drainTranscriptionQueue();
}

async function drainTranscriptionQueue() {
  if (activeTranscriptionJobs >= MAX_CONCURRENT_JOBS || transcriptionQueue.length === 0) {
    return;
  }

  const { jobId, file } = transcriptionQueue.shift();
  activeTranscriptionJobs += 1;

  try {
    await runTranscriptionJob(jobId, file);
  } catch (err) {
    console.error(`Background job ${jobId} threw unexpectedly:`, err);
  } finally {
    activeTranscriptionJobs -= 1;
    void drainTranscriptionQueue();
  }
}

// ─── Background transcription job ────────────────────────────────────────────

async function runTranscriptionJob(jobId, file) {
  const safeFile        = sanitiseFilename(file);
  const originalFilePath = path.join(uploadsDir, safeFile);

  // Mark as processing
  await pool.query(
    'UPDATE transcription_jobs SET status = $1, updated_at = NOW() WHERE job_id = $2',
    ['processing', jobId]
  );

  try {
    if (!fs.existsSync(originalFilePath)) {
      throw new Error(`Upload not found on disk: ${safeFile}`);
    }

    const whisperArgs = [
      '-m', 'whisper',
      originalFilePath,
      '--model', WHISPER_MODEL,
      '--language', 'en',
      '--output_dir', outputDir,
    ];
    if (WHISPER_DEVICE) {
      whisperArgs.push('--device', WHISPER_DEVICE);
    }

    await new Promise((resolve, reject) => {
      execFile(
        WHISPER_PYTHON,
        whisperArgs,
        (err, stdout, stderr) => {
          if (err) {
            console.error('Whisper error:', stderr);
            return reject(new Error(stderr || err.message));
          }
          console.log('Whisper stdout:', stdout);
          resolve();
        }
      );
    });

    // Read the .txt output Whisper produced
    const txtPath         = path.join(outputDir, path.parse(safeFile).name + '.txt');
    const transcriptionText = fs.readFileSync(txtPath, 'utf8');

    // FIX: UPDATE the existing row instead of inserting a duplicate
    await pool.query(
      'UPDATE files SET transcription = $1, created_at = NOW() WHERE filename = $2',
      [transcriptionText, safeFile]
    );

    // Mark job completed
    await pool.query(
      'UPDATE transcription_jobs SET status = $1, updated_at = NOW() WHERE job_id = $2',
      ['completed', jobId]
    );

    // Clean up the uploaded audio file
    fs.unlink(originalFilePath, (err) => {
      if (err) console.error('Could not delete upload:', err);
    });

    console.log(`Job ${jobId} completed for file: ${safeFile}`);

  } catch (err) {
    console.error(`Job ${jobId} failed:`, err.message);
    await pool.query(
      'UPDATE transcription_jobs SET status = $1, error = $2, updated_at = NOW() WHERE job_id = $3',
      ['failed', err.message, jobId]
    );
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
ensureDir(uploadsDir);
ensureDir(outputDir);

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Max ${MAX_UPLOAD_MB} MB.` });
  }
  next(err);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});