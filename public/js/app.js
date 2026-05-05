/* DocScan – app.js */
'use strict';

// ── Globals ───────────────────────────────────────────────────────────────────
let mediaStream     = null;
let capturedDataUrl = null;
let pdfBlob         = null;
let currentFileName = '';
let flashTrack      = null;
let toastTimer      = null;
let selectedFiles   = [];   // [{ id, dataUrl, name }]  – multi-file mode

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screens = {
  init:     document.getElementById('screen-init'),
  scanning: document.getElementById('screen-scanning'),
  preview:  document.getElementById('screen-preview'),
  ready:    document.getElementById('screen-ready'),
  multi:    document.getElementById('screen-multi'),
};

const video       = document.getElementById('video');
const canvas      = document.getElementById('canvas');
const previewImg  = document.getElementById('preview-img');
const pdfFilename = document.getElementById('pdf-filename');
const toast       = document.getElementById('toast');

// Single-scan buttons
const startCameraBtn = document.getElementById('start-camera-btn');
const captureBtn     = document.getElementById('capture-btn');
const cancelScanBtn  = document.getElementById('cancel-scan-btn');
const galleryBtn     = document.getElementById('gallery-btn');
const galleryInput   = document.getElementById('gallery-input');
const flashBtn       = document.getElementById('flash-btn');
const retakeBtn      = document.getElementById('retake-btn');
const exportBtn      = document.getElementById('export-btn');
const downloadBtn    = document.getElementById('download-btn');
const emailBtn       = document.getElementById('email-btn');
const scanAgainBtn   = document.getElementById('scan-again-btn');

// Multi-file buttons
const multiFilesBtn  = document.getElementById('multi-files-btn');
const multiBackBtn   = document.getElementById('multi-back-btn');
const addFilesBtn    = document.getElementById('add-files-btn');
const multiFileInput = document.getElementById('multi-file-input');
const multiExportBtn = document.getElementById('multi-export-btn');
const thumbGrid      = document.getElementById('thumb-grid');
const multiEmpty     = document.getElementById('multi-empty');
const fileCountBadge = document.getElementById('file-count-badge');

// Email modal
const emailModal     = document.getElementById('email-modal');
const modalBackdrop  = document.getElementById('modal-backdrop');
const emailInput     = document.getElementById('email-input');
const emailError     = document.getElementById('email-error');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalSendBtn   = document.getElementById('modal-send-btn');
const sendBtnLabel   = document.getElementById('send-btn-label');
const sendBtnSpinner = document.getElementById('send-btn-spinner');

// ── Screen routing ────────────────────────────────────────────────────────────
function setScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = mediaStream;
    await video.play();
    flashTrack = mediaStream.getVideoTracks()[0];
    setScreen('scanning');
  } catch (err) {
    const msg = err.name === 'NotAllowedError' ? 'Camera access denied. Allow it in browser settings.'
              : err.name === 'NotFoundError'   ? 'No camera found on this device.'
              : `Camera error: ${err.message}`;
    showToast(msg, 'error');
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

// ── Flash ─────────────────────────────────────────────────────────────────────
let flashOn = false;

async function toggleFlash() {
  if (!flashTrack) return;
  const caps = flashTrack.getCapabilities();
  if (!caps.torch) { showToast('Torch not supported on this device.', 'error'); return; }
  try {
    flashOn = !flashOn;
    await flashTrack.applyConstraints({ advanced: [{ torch: flashOn }] });
    flashBtn.classList.toggle('active', flashOn);
  } catch { showToast('Could not toggle flash.', 'error'); }
}

// ── Capture (single scan) ─────────────────────────────────────────────────────
function captureFromVideo() {
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  stopCamera();
  previewImg.src = capturedDataUrl;
  setScreen('preview');
}

function handleGalleryFile(file) {
  if (!file || !file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => { capturedDataUrl = e.target.result; stopCamera(); previewImg.src = capturedDataUrl; setScreen('preview'); };
  reader.readAsDataURL(file);
}

// ── Single-page PDF ───────────────────────────────────────────────────────────
function generatePdf() {
  exportBtn.disabled = true;
  exportBtn.textContent = 'Generating…';
  const img = new Image();
  img.onload = () => {
    const blob = buildPdfFromImages([{ dataUrl: capturedDataUrl, img }]);
    pdfBlob = blob;
    currentFileName = `scan_${timestamp()}.pdf`;
    pdfFilename.textContent = currentFileName;
    exportBtn.disabled = false;
    exportBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/></svg>Create PDF`;
    setScreen('ready');
  };
  img.onerror = () => { showToast('Failed to load image.', 'error'); exportBtn.disabled = false; };
  img.src = capturedDataUrl;
}

// ── Shared PDF builder ────────────────────────────────────────────────────────
function buildPdfFromImages(pages) {
  const { jsPDF } = window.jspdf;
  let pdf = null;
  for (const { dataUrl, img } of pages) {
    const isLandscape = img.naturalWidth > img.naturalHeight;
    const orientation = isLandscape ? 'landscape' : 'portrait';
    const pageW = isLandscape ? 297 : 210;
    const pageH = isLandscape ? 210 : 297;
    const aspect = img.naturalWidth / img.naturalHeight;
    let imgW = pageW, imgH = imgW / aspect;
    if (imgH > pageH) { imgH = pageH; imgW = imgH * aspect; }
    if (!pdf) { pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' }); }
    else       { pdf.addPage('a4', orientation); }
    pdf.addImage(dataUrl, 'JPEG', (pageW - imgW) / 2, (pageH - imgH) / 2, imgW, imgH);
  }
  return pdf.output('blob');
}

// ── Multi-file mode ───────────────────────────────────────────────────────────
function openMultiMode() {
  selectedFiles = [];
  renderThumbnails();
  setScreen('multi');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function addFilesToSelection(files) {
  const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!valid.length) { showToast('Please select image files only.', 'error'); return; }
  for (const file of valid) {
    const dataUrl = await fileToDataUrl(file);
    selectedFiles.push({ id: Date.now() + Math.random(), dataUrl, name: file.name });
  }
  multiFileInput.value = '';
  renderThumbnails();
}

function removeFileById(id) {
  selectedFiles = selectedFiles.filter(f => f.id !== id);
  renderThumbnails();
}

function renderThumbnails() {
  const count = selectedFiles.length;
  const isEmpty = count === 0;

  multiEmpty.classList.toggle('hidden', !isEmpty);
  thumbGrid.classList.toggle('hidden', isEmpty);
  fileCountBadge.textContent = count;
  fileCountBadge.classList.toggle('hidden', isEmpty);
  multiExportBtn.disabled = isEmpty;
  multiExportBtn.textContent = isEmpty
    ? 'Create PDF'
    : `Create PDF  ·  ${count} page${count !== 1 ? 's' : ''}`;

  thumbGrid.innerHTML = '';
  selectedFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'thumb-item';

    const img = document.createElement('img');
    img.src = file.dataUrl;
    img.alt = `Page ${i + 1}`;

    const badge = document.createElement('span');
    badge.className = 'thumb-page';
    badge.textContent = i + 1;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'thumb-remove';
    removeBtn.setAttribute('aria-label', `Remove page ${i + 1}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeFileById(file.id));

    item.append(img, badge, removeBtn);
    thumbGrid.appendChild(item);
  });
}

async function generateMultiPagePdf() {
  if (!selectedFiles.length) return;
  const total = selectedFiles.length;
  multiExportBtn.disabled = true;

  try {
    const pages = [];
    for (let i = 0; i < total; i++) {
      multiExportBtn.textContent = `Generating… (${i + 1} / ${total})`;
      await new Promise(r => setTimeout(r, 0)); // yield to repaint
      const img = await loadImage(selectedFiles[i].dataUrl);
      pages.push({ dataUrl: selectedFiles[i].dataUrl, img });
    }
    pdfBlob = buildPdfFromImages(pages);
    currentFileName = `docscan_${total}pages_${timestamp()}.pdf`;
    pdfFilename.textContent = currentFileName;
    setScreen('ready');
  } catch {
    showToast('Failed to generate PDF.', 'error');
  } finally {
    multiExportBtn.disabled = false;
    renderThumbnails(); // restore button label
  }
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadPdf() {
  if (!pdfBlob) return;
  const url = URL.createObjectURL(pdfBlob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: currentFileName });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('PDF downloaded!', 'success');
}

// ── Email modal ───────────────────────────────────────────────────────────────
function openEmailModal() {
  emailInput.value = '';
  emailError.classList.add('hidden');
  emailModal.classList.remove('hidden');
  setTimeout(() => emailInput.focus(), 300);
}

function closeEmailModal() { emailModal.classList.add('hidden'); }

async function sendEmail() {
  const email = emailInput.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailError.textContent = 'Please enter a valid email address.';
    emailError.classList.remove('hidden');
    return;
  }
  emailError.classList.add('hidden');
  setSendingState(true);
  try {
    const pdfBase64 = await blobToBase64(pdfBlob);
    const res  = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pdfBase64, fileName: currentFileName }),
    });
    const data = await res.json();
    if (data.success) { closeEmailModal(); showToast('Email sent successfully!', 'success'); }
    else { emailError.textContent = data.error || 'Failed to send. Check server config.'; emailError.classList.remove('hidden'); }
  } catch {
    emailError.textContent = 'Network error. Is the server running?';
    emailError.classList.remove('hidden');
  } finally { setSendingState(false); }
}

function setSendingState(on) {
  modalSendBtn.disabled = on;
  sendBtnLabel.textContent = on ? 'Sending…' : 'Send';
  sendBtnSpinner.classList.toggle('hidden', !on);
}

// ── Reset to home ─────────────────────────────────────────────────────────────
function resetToHome() {
  capturedDataUrl = null;
  pdfBlob         = null;
  currentFileName = '';
  previewImg.src  = '';
  selectedFiles   = [];
  setScreen('init');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function timestamp() {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
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
multiFilesBtn.addEventListener('click', openMultiMode);
flashBtn.addEventListener('click', toggleFlash);

captureBtn.addEventListener('click', captureFromVideo);
cancelScanBtn.addEventListener('click', () => { stopCamera(); setScreen('init'); });

galleryBtn.addEventListener('click', () => galleryInput.click());
galleryInput.addEventListener('change', e => handleGalleryFile(e.target.files[0]));

retakeBtn.addEventListener('click', () => { capturedDataUrl = null; previewImg.src = ''; startCamera(); });
exportBtn.addEventListener('click', generatePdf);

multiBackBtn.addEventListener('click', () => setScreen('init'));
addFilesBtn.addEventListener('click', () => multiFileInput.click());
multiFileInput.addEventListener('change', e => addFilesToSelection(e.target.files));
multiExportBtn.addEventListener('click', generateMultiPagePdf);

downloadBtn.addEventListener('click', downloadPdf);
emailBtn.addEventListener('click', openEmailModal);
scanAgainBtn.addEventListener('click', resetToHome);

modalCancelBtn.addEventListener('click', closeEmailModal);
modalBackdrop.addEventListener('click', closeEmailModal);
modalSendBtn.addEventListener('click', sendEmail);
emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendEmail(); });


// ── Boot ──────────────────────────────────────────────────────────────────────
setScreen('init');
