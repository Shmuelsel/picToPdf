require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '15mb' }));

// Stamp CSS/JS links with build version so mobile browsers never serve stale files
const BUILD_VER = Date.now();
const rawHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const indexHtml = rawHtml
  .replace('href="css/styles.css"', `href="css/styles.css?v=${BUILD_VER}"`)
  .replace('src="js/app.js"',       `src="js/app.js?v=${BUILD_VER}"`);

// Serve static assets (icons, manifest, sw.js, css, js) but not index.html
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Email validation ──────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/send-email ──────────────────────────────────────────────────────
app.post('/api/send-email', async (req, res) => {
  const { email, pdfBase64, fileName } = req.body;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address.' });
  }
  if (!pdfBase64) {
    return res.status(400).json({ success: false, error: 'No PDF data received.' });
  }

  // Verify SMTP credentials are configured
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-email@gmail.com') {
    return res.status(503).json({
      success: false,
      error: 'Email is not configured. Copy .env.example to .env and fill in your SMTP credentials.',
    });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"DocScan" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Your Scanned Document',
      text: 'Please find your scanned document attached.',
      html: '<p>Please find your scanned document attached.</p><p><em>Sent via DocScan</em></p>',
      attachments: [
        {
          filename: fileName || `scan_${Date.now()}.pdf`,
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Nodemailer error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Fallback → serve versioned index.html ────────────────────────────────────
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/html');
  res.send(indexHtml);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  DocScan is running!\n`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<YOUR_IP>:${PORT}  ← open this on your phone`);
  console.log(`\n  Tip: run "ipconfig" (Windows) or "ifconfig" (Mac/Linux) to find your IP.\n`);
});
