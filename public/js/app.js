/* DocScan – app.js */
'use strict';

// ── Globals ───────────────────────────────────────────────────────────────────
let mediaStream       = null;   // active camera stream
let capturedDataUrl   = null;   // captured image (data URL)
let pdfBlob           = null;   // generated PDF blob
let currentFileName   = '';     // e.g. "scan_20260504_143200.pdf"
let flashTrack        = null;   // video track for torch control
let toastTimer        = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screens = {
  init:     document.getElementById('screen-init'),
  scanning: document.getElementById('screen-scanning'),
  preview:  document.getElementById('screen-preview'),
  ready:    document.getElementById('screen-ready'),
};

const video       = document.getElementById('video');
const canvas      = document.getElementById('canvas');
const previewImg  = document.getElementById('preview-img');
const pdfFilename = document.getElementById('pdf-filename');
const toast       = document.getElementById('toast');

// Buttons
const startCameraBtn  = document.getElementById('start-camera-btn');
const captureBtn      = document.getElementById('capture-btn');
const cancelScanBtn   = document.getElementById('cancel-scan-btn');
const galleryBtn      = document.getElementById('gallery-btn');
const galleryInput    = document.getElementById('gallery-input');
const flashBtn        = document.getElementById('flash-btn');
const retakeBtn       = document.getElementById('retake-btn');
const exportBtn       = document.getElementById('export-btn');
const downloadBtn     = document.getElementById('download-btn');
const emailBtn        = document.getElementById('email-btn');
const scanAgainBtn    = document.getElementById('scan-again-btn');

// Modal
const emailModal      = document.getElementById('email-modal');
const modalBackdrop   = document.getElementById('modal-backdrop');
const emailInput      = document.getElementById('email-input');
const emailError      = document.getElementById('email-error');
const modalCancelBtn  = document.getElementById('modal-cancel-btn');
const modalSendBtn    = document.getElementById('modal-send-btn');
const sendBtnLabel    = document.getElementById('send-btn-label');
const sendBtnSpinner  = document.getElementById('send-btn-spinner');

// ── State helpers ─────────────────────────────────────────────────────────────
function setScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    video.srcObject = mediaStream;
    await video.play();

    // Save reference to video track for torch toggle
    flashTrack = mediaStream.getVideoTracks()[0];

    setScreen('scanning');
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showToast('Camera access denied. Please allow it in your browser settings.', 'error');
    } else if (err.name === 'NotFoundError') {
      showToast('No camera found on this device.', 'error');
    } else {
      showToast(`Camera error: ${err.message}`, 'error');
    }
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
    flashTrack  = null;
    video.srcObject = null;
  }
}

// ── Flash / Torch ─────────────────────────────────────────────────────────────
let flashOn = false;

async function toggleFlash() {
  if (!flashTrack) return;
  const caps = flashTrack.getCapabilities();
  if (!caps.torch) { showToast('Torch not supported on this device.', 'error'); return; }
  try {
    flashOn = !flashOn;
    await flashTrack.applyConstraints({ advanced: [{ torch: flashOn }] });
    flashBtn.classList.toggle('active', flashOn);
  } catch {
    showToast('Could not toggle flash.', 'error');
  }
}

// ── Capture ───────────────────────────────────────────────────────────────────
function captureFromVideo() {
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  stopCamera();
  showPreview();
}

function showPreview() {
  previewImg.src = capturedDataUrl;
  setScreen('preview');
}

// ── Gallery / file upload ─────────────────────────────────────────────────────
function handleGalleryFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select an image file.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    capturedDataUrl = e.target.result;
    stopCamera();
    showPreview();
  };
  reader.readAsDataURL(file);
}

// ── PDF generation ────────────────────────────────────────────────────────────
function generatePdf() {
  exportBtn.disabled = true;
  exportBtn.textContent = 'Generating…';

  // jsPDF is loaded via CDN, available at window.jspdf.jsPDF
  const { jsPDF } = window.jspdf;

  const img = new Image();
  img.onload = () => {
    const isLandscape = img.naturalWidth > img.naturalHeight;
    const orientation = isLandscape ? 'landscape' : 'portrait';

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

    const pageW = isLandscape ? 297 : 210;
    const pageH = isLandscape ? 210 : 297;
    const aspect = img.naturalWidth / img.naturalHeight;

    let imgW = pageW;
    let imgH = imgW / aspect;

    if (imgH > pageH) { imgH = pageH; imgW = imgH * aspect; }

    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;

    pdf.addImage(capturedDataUrl, 'JPEG', x, y, imgW, imgH);

    pdfBlob = pdf.output('blob');
    currentFileName = `scan_${timestamp()}.pdf`;
    pdfFilename.textContent = currentFileName;

    exportBtn.disabled = false;
    exportBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>Create PDF`;

    setScreen('ready');
  };

  img.onerror = () => {
    showToast('Failed to load image for PDF.', 'error');
    exportBtn.disabled = false;
  };

  img.src = capturedDataUrl;
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadPdf() {
  if (!pdfBlob) return;
  const url = URL.createObjectURL(pdfBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = currentFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke slightly so mobile browsers can handle it
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('PDF downloaded!', 'success');
}

// ── Email modal ───────────────────────────────────────────────────────────────
function openEmailModal() {
  emailInput.value = '';
  emailError.classList.add('hidden');
  emailError.textContent = '';
  emailModal.classList.remove('hidden');
  setTimeout(() => emailInput.focus(), 300);
}

function closeEmailModal() {
  emailModal.classList.add('hidden');
}

async function sendEmail() {
  const email = emailInput.value.trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!EMAIL_RE.test(email)) {
    emailError.textContent = 'Please enter a valid email address.';
    emailError.classList.remove('hidden');
    return;
  }

  emailError.classList.add('hidden');
  setSendingState(true);

  try {
    // Convert blob → base64
    const pdfBase64 = await blobToBase64(pdfBlob);

    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pdfBase64, fileName: currentFileName }),
    });

    const data = await res.json();

    if (data.success) {
      closeEmailModal();
      showToast('Email sent successfully!', 'success');
    } else {
      emailError.textContent = data.error || 'Failed to send. Check server config.';
      emailError.classList.remove('hidden');
    }
  } catch (err) {
    emailError.textContent = 'Network error. Is the server running?';
    emailError.classList.remove('hidden');
  } finally {
    setSendingState(false);
  }
}

function setSendingState(loading) {
  modalSendBtn.disabled  = loading;
  sendBtnLabel.textContent = loading ? 'Sending…' : 'Send';
  sendBtnSpinner.classList.toggle('hidden', !loading);
}

// ── Scan-again reset ──────────────────────────────────────────────────────────
function resetAndScanAgain() {
  capturedDataUrl = null;
  pdfBlob         = null;
  currentFileName = '';
  previewImg.src  = '';
  setScreen('init');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

function showToast(message, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className   = `toast${type ? ' ' + type : ''}`;
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ── Event listeners ───────────────────────────────────────────────────────────
startCameraBtn.addEventListener('click', startCamera);
flashBtn.addEventListener('click', toggleFlash);

captureBtn.addEventListener('click', captureFromVideo);

cancelScanBtn.addEventListener('click', () => {
  stopCamera();
  setScreen('init');
});

galleryBtn.addEventListener('click', () => galleryInput.click());
galleryInput.addEventListener('change', e => handleGalleryFile(e.target.files[0]));

retakeBtn.addEventListener('click', () => {
  capturedDataUrl = null;
  previewImg.src  = '';
  startCamera();
});

exportBtn.addEventListener('click', generatePdf);

downloadBtn.addEventListener('click', downloadPdf);
emailBtn.addEventListener('click', openEmailModal);
scanAgainBtn.addEventListener('click', resetAndScanAgain);

modalCancelBtn.addEventListener('click', closeEmailModal);
modalBackdrop.addEventListener('click', closeEmailModal);
modalSendBtn.addEventListener('click', sendEmail);

emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendEmail(); });

// Prevent accidental zoom on double-tap (iOS)
document.addEventListener('touchend', e => {
  if (e.target.tagName === 'BUTTON') e.preventDefault();
}, { passive: false });

// ── Init ──────────────────────────────────────────────────────────────────────
setScreen('init');
