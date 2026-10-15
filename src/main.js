import QrScanner from 'qr-scanner';
import { parseBadgeQr, ScanGate } from './qr.js';
import './style.css';

const el = (id) => document.getElementById(id);
const video = el('camera');
const gate = new ScanGate();
let scanner;
let starting = false;
let running = false;
let generation = 0;
let count = 0;
let audio;
let resetFeedback;
let startedAt;
let firstDetection = false;

function result(title, detail, state = 'neutral') {
  el('result-title').textContent = title;
  el('result-detail').textContent = detail;
  el('result').className = `result ${state}`;
}

function feedback() {
  navigator.vibrate?.(70);
  if (!el('sound').checked || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.connect(gain).connect(audio.destination);
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.08, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.12);
}

function onDecode({ data }) {
  if (!running || document.hidden || !gate.accept(data)) return;
  count++;
  el('count').textContent = String(count);
  const badge = parseBadgeQr(data);
  result(badge ? 'QR DETECTED' : 'UNRECOGNIZED QR', badge
    ? 'Badge URL shape recognized. Deployment unverified. No attendance recorded.'
    : 'This is not the expected Apps Script badge URL shape. No attendance recorded.', badge ? 'detected' : 'error');
  if (!firstDetection) {
    firstDetection = true;
    performance.mark('first-qr-detection');
  }
  feedback();
  clearTimeout(resetFeedback);
  resetFeedback = setTimeout(() => result('Ready for next QR', 'No attendance is recorded in this test.'), 2200);
}

function stopCamera(message = 'Camera stopped. Tap Restart camera when ready.') {
  generation++;
  running = false;
  starting = false;
  scanner?.destroy();
  scanner = undefined;
  clearTimeout(resetFeedback);
  gate.clear();
  el('start').disabled = false;
  el('stop').disabled = true;
  el('camera-status').textContent = message;
}

function cameraError(error) {
  const name = error?.name || String(error);
  if (/NotAllowed|Permission|denied/i.test(name)) return 'Camera permission denied. Allow camera access in browser settings, then tap Restart camera.';
  if (/NotFound|DevicesNotFound/i.test(name)) return 'No camera found. Use a phone with a rear camera.';
  if (/NotReadable|TrackStart/i.test(name)) return 'Camera is busy. Close other camera apps, then tap Restart camera.';
  return 'Could not start the camera. Use HTTPS in Safari or Chrome, check permission, then tap Restart camera.';
}

async function startCamera() {
  if (starting) return;
  stopCamera();
  const attempt = generation;
  starting = true;
  el('start').disabled = true;
  el('stop').disabled = false;
  el('camera-status').textContent = 'Starting rear camera…';
  el('start').textContent = 'Restart camera';
  // Audio support must never block camera startup; sound remains opt-in.
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio && !audio) audio = new Audio();
    if (audio?.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* Silent visual feedback is sufficient. */ }
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Secure camera unavailable');
    startedAt = performance.now();
    firstDetection = false;
    performance.mark('camera-start-request');
    const current = new QrScanner(video, onDecode, {
      preferredCamera: 'environment', maxScansPerSecond: 12,
      returnDetailedScanResult: true,
    });
    scanner = current;
    await current.start();
    if (attempt !== generation) { current.destroy(); return; }
    running = true;
    performance.mark('camera-ready');
    performance.measure('camera-initialization', 'camera-start-request', 'camera-ready');
    el('camera-status').textContent = `Camera active · started in ${Math.round(performance.now() - startedAt)} ms`;
    result('Ready for next QR', 'Hold one badge steady inside the frame.');
    const track = video.srcObject?.getVideoTracks()[0];
    track?.addEventListener('ended', () => {
      if (attempt === generation) {
        stopCamera('Camera interrupted. Tap Restart camera.');
        result('Camera interrupted', 'No attendance was recorded.', 'error');
      }
    }, { once: true });
  } catch (error) {
    if (attempt !== generation) return;
    stopCamera(cameraError(error));
    result('Camera unavailable', cameraError(error), 'error');
  } finally {
    if (attempt === generation) { starting = false; el('start').disabled = false; }
  }
}

el('start').addEventListener('click', startCamera);
el('stop').addEventListener('click', () => stopCamera());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera('Camera paused while away. Tap Restart camera to resume.');
});
window.addEventListener('pagehide', () => stopCamera());
function updateConnection() {
  el('connection').textContent = navigator.onLine
    ? 'Camera-only test · no attendance connection'
    : 'Offline · camera test can continue if loaded. Attendance is unavailable.';
}
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
updateConnection();
