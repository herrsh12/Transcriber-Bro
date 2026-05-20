require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const Razorpay = require('razorpay');
const { Pool } = require('pg');
const { exec } = require('child_process');
const crypto = require('crypto');
const { name } = require('commander');
const archiver = require('archiver');
const cors = require('cors');
const app = express();
const port = 3000; // Change port if necessary

app.use(express.static(path.join(__dirname, 'public'))); 

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// PostgreSQL connection setup using environment variables
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// Body parsing middleware
app.use(express.urlencoded({ extended: true })); // For form submissions
app.use(express.json()); // For JSON data
app.use(cors());


// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Function to create a directory if it doesn't exist
function createDirectoryIfNotExists(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath);
  }
}

// Initialize directories
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');

// Route to handle root URL
app.get('/', (req, res) => {
  createDirectoryIfNotExists(uploadsDir);
  createDirectoryIfNotExists(outputDir);
  res.json({ status: 'Backend API running successfully' });
});

// Define the GET route for the upload page
app.get('/upload', (req, res) => {
  res.json({ message: 'Use frontend application for uploads' })
});

// Route to handle file upload and transcription
app.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    const fileName = req.file.originalname;
    console.log('Received file:', fileName);

    // Save the uploaded file temporarily
    const originalFilePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(originalFilePath, req.file.buffer);
    console.log('Uploaded file saved at:', originalFilePath);

    // Save the uploaded file path and filename in the database
    await pool.query(
      'INSERT INTO files (filename, originalFilePath) VALUES ($1, $2)',
      [fileName, originalFilePath]
    );

    // Calculate the duration of the audio file
    ffmpeg.ffprobe(originalFilePath, (err, metadata) => {
      if (err) {
        console.error('Error getting audio duration:', err);
        return res.status(500).send('Error calculating audio duration');
      }

      const duration = metadata.format.duration; // Duration in seconds
      const durationInMinutes = duration / 60;
      const formattedDuration = formatDuration(duration); // e.g., "5m 30s"
      let charge;

      if (durationInMinutes < 10) {
        charge = 65; // For files less than 10 minutes
      } else if (durationInMinutes < 30) {
        charge = 100; // For files between 10 minutes and 30 minutes
      } else {
        charge = 150; // For files greater than 30 minutes
      }

      // Redirect to payment page with duration and charge information
      res.json({
        success: true,
        file: fileName,
        charge,
        duration: formattedDuration
      });
    });
  } catch (error) {
    console.error('Error handling file upload:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/process-payment', async (req, res) => {
  try {
    console.log(req.body)
    const { file, charge } = req.body;

    // Create an order in Razorpay
    const order = await razorpay.orders.create({
      amount: charge * 100, // amount in paise
      currency: 'INR',
      receipt: file,
    });

    // Insert the order details into the PostgreSQL orders table
    await pool.query(
      'INSERT INTO orders (order_id, amount, currency, file_name) VALUES ($1, $2, $3, $4)',
      [order.id, charge, 'INR', file]
    );

    // Return the order ID and amount in the response
    res.json({
      orderId: order.id,
      amount: charge * 100,
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/payment-success', (req, res) => {
  const file = req.query.file;
  const charge = req.query.charge;
  const transcriptionFilePath = `${file.slice(0, -4)}.txt`; // Assuming the transcription file has the same name as the audio file

  res.render('payment-success', { file, charge, transcriptionFilePath });
});

app.get('/payment-failure', (req, res) => {
  const file = req.query.file;
  const charge = req.query.charge;

  res.render('payment-failure', { file, charge });
});

// Payment page route
app.get('/payment', (req, res) => {
  const fileName = req.query.file;
  const charge = req.query.charge;
  const duration = req.query.duration; // Retrieve duration from query params

  res.render('payment', { fileName, charge, duration });
});

async function transcribe(file) {
  // Fetch the original file path from the database
  const result = await pool.query('SELECT originalFilePath FROM files WHERE filename = $1', [file]);
  console.log('Fetching original file path for filename:', file);
  console.log('Query result:', result); // Log query result

  if (result.rows.length === 0) {
    console.error('No file found for transcription with filename:', file);
    throw new Error('File not found for transcription');
  }

  const originalFilePath = path.join(uploadsDir, file); // Changed to use path.join for cross-platform compatibility
  console.log('Original file path for transcription:', originalFilePath);

  if (!fs.existsSync(originalFilePath)) {
    console.error('File does not exist at the specified path:', originalFilePath);
    throw new Error('File not found for transcription');
  }

  // Return a promise that resolves when transcription is completed
  return new Promise((resolve, reject) => {
    // Start the transcription process using Whisper AI
    exec(`whisper "${originalFilePath}" --model base --language en --output_dir "${outputDir}"`, async (err, stdout, stderr) => {
      if (err) {
        console.error('Error during Whisper AI transcription:', err);
        console.error('stderr:', stderr);
        return reject('Error transcribing audio'); // Reject the promise on error
      }

      console.log('Transcription completed successfully:', stdout);

      // Here, you can insert the transcription into the database
      const transcriptionFilePath = path.join(outputDir, file.slice(0, -4) + ".txt"); // Removing the extension
      const transcriptionText = fs.readFileSync(transcriptionFilePath, 'utf8'); // Read the transcription text

      // Insert transcription into the database
      await pool.query(
        'INSERT INTO files (filename, transcription, created_at) VALUES ($1, $2, NOW())',
        [file, transcriptionText]
      );

      // Clean up the original file after transcription
      fs.unlink(originalFilePath, (cleanupErr) => {
        if (cleanupErr) {
          console.error('Error deleting the original file:', cleanupErr);
        } else {
          console.log('Original file deleted:', originalFilePath);
        }
      });

      resolve(); // Resolve the promise after transcription is done
    });
  });
}

// Verify payment route
app.post('/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, file, charge } = req.body;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  // Generate the signature
  const generated_signature = crypto.createHmac('sha256', key_secret)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  console.log('Generated Signature:', generated_signature); // Log generated signature
  console.log('Received Signature:', razorpay_signature); // Log received signature

  if (generated_signature === razorpay_signature) {
    // Payment is verified
    console.log('Payment verified successfully');

    // Update order status to 'paid'
    await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_id = $2',
      ['paid', razorpay_order_id]
    );

    try {
      await transcribe(file); // Wait for transcription to complete
      return res.json({ success: true, message: 'Payment verified and transcription completed successfully' });
    } catch (error) {
      console.error('Transcription error:', error);
      return res.status(500).json({ success: false, message: 'Transcription failed' });
    }

  } else {
    // Payment verification failed, update the order status to 'failed'
    console.error('Payment verification failed.'); // Log error
    await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_id = $2',
      ['failed', razorpay_order_id]
    );

    return res.status(400).json({ success: false, message: 'Payment verification failed' });
  }
});

// Route to fetch order status
app.get('/order-status/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const result = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderStatus = result.rows[0].status;
    res.json({ orderId, status: orderStatus });
  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/download', (req, res) => {
  const file = req.query.file; // This will include the file name with extension
  const filePath = path.join(outputDir, file); // Adjust the path based on your output directory

  console.log('File path:', filePath); // Log the file path for debugging

  if (!fs.existsSync(filePath)) {
      console.error('File does not exist:', filePath);
      return res.status(404).send('File not found');
  }

  res.download(filePath, (err) => {
      if (err) {
          console.error('Error downloading file:', err);
          return res.status(404).send('File not found');
      }
  });
});

// Route to handle downloading all transcription files as a zip
app.get('/download-all', async (req, res) => {
  const file = req.query.file; // Assuming this is the base name for the audio file
  const baseFileName = file.slice(0, -4); // Get the base file name without the extension

  // Create a zip file for all transcriptions related to the file
  const zipFileName = `${baseFileName}_transcriptions.zip`; // Name of the zip file
  const zipFilePath = path.join(outputDir, zipFileName); // Path where the zip file will be stored temporarily

  // Create a new archive instance
  const archive = archiver('zip', {
    zlib: { level: 9 } // Compression level
  });

  // Set the headers to download the zip file
  res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);
  res.setHeader('Content-Type', 'application/zip');

  // Pipe the archive data to the response
  archive.pipe(res);

  try {
    // Filter files in the output directory that match the base name of the audio file
    const transcriptionFiles = fs.readdirSync(outputDir).filter(fileName => {
      // Only include files that start with the base file name (before the extension)
      return fileName.startsWith(baseFileName);
    });

    // Add the matching transcription files to the zip archive
    transcriptionFiles.forEach(file => {
      const filePath = path.join(outputDir, file);
      archive.file(filePath, { name: file });
    });

    // Finalize the archive (it will call the response after done)
    await archive.finalize();
  } catch (err) {
    console.error('Error creating zip archive:', err);
    res.status(500).send('Error creating zip file');
  }
});


// Function to format duration from seconds to "Xm Ys" format
function formatDuration(duration) {
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return `${minutes}m ${seconds}s`;
}

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
