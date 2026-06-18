const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

const homeDir = os.homedir();
const OPENCLAW_DIR = path.join(homeDir, '.openclaw');

function base64url(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

// Config
let gatewayUrl = 'ws://127.0.0.1:18622';
let gatewayToken = '';
let deviceId = '';
let publicKeyBase64url = '';
let privateKeyPem = '';
let scopes = ['operator.admin', 'operator.read', 'operator.write'];

let ws = null;
let requestId = 0;
const pending = new Map();
let connected = false;
let reconnectTimer = null;
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 30000;
let shuttingDown = false;

const emitter = new EventEmitter();

function loadDeviceIdentity() {
  const identity = readJson(path.join(OPENCLAW_DIR, 'identity', 'device.json'));
  if (!identity) { console.warn('[OpenClaw WS] No device identity found'); return false; }

  const pubDer = crypto.createPublicKey({ key: identity.publicKeyPem, format: 'pem' })
    .export({ type: 'spki', format: 'der' });
  const rawPub = pubDer.slice(pubDer.length - 32);

  deviceId = identity.deviceId;
  publicKeyBase64url = base64url(rawPub);
  privateKeyPem = identity.privateKeyPem;
  return true;
}

function loadGatewayConfig() {
  const config = readJson(path.join(OPENCLAW_DIR, 'openclaw.json'));
  if (config?.gateway?.port) {
    gatewayUrl = `ws://127.0.0.1:${config.gateway.port}`;
  }
  if (config?.gateway?.auth?.token) {
    gatewayToken = config.gateway.auth.token;
  }
}

function signDevicePayload(nonce, ts) {
  const payloadStr = [
    'v3',
    deviceId,
    'cli',
    'backend',
    'operator',
    scopes.join(','),
    String(ts),
    gatewayToken,
    nonce,
    'win32',
    ''
  ].join('|');
  return base64url(crypto.sign(null, Buffer.from(payloadStr, 'utf8'),
    crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' })));
}

function doConnect() {
  if (shuttingDown) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(gatewayUrl);

  ws.on('open', () => {
    // Wait for connect.challenge event
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // Handle connect challenge
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const nonce = msg.payload.nonce;
      const ts = msg.payload.ts;
      const sig = signDevicePayload(nonce, ts);

      ws.send(JSON.stringify({
        type: 'req', id: 'conn-1', method: 'connect',
        params: {
          minProtocol: 4, maxProtocol: 4,
          client: { id: 'cli', version: '1.0.0', platform: 'win32', mode: 'backend' },
          role: 'operator', scopes,
          caps: [], commands: [], permissions: {},
          auth: { token: gatewayToken },
          device: { id: deviceId, publicKey: publicKeyBase64url, signature: sig, signedAt: ts, nonce }
        }
      }));
      return;
    }

    // Handle connect response
    if (msg.type === 'res' && msg.id === 'conn-1') {
      if (msg.ok) {
        connected = true;
        reconnectDelay = 2000;
        emitter.emit('connected');
        console.log('[OpenClaw WS] Connected, scopes:', msg.payload?.auth?.scopes);
      } else {
        console.error('[OpenClaw WS] Connect failed:', msg.error?.message);
        ws.close();
      }
      return;
    }

    // Handle general responses
    if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.ok) resolve(msg.payload);
      else reject(new Error(msg.error?.message || 'OpenClaw RPC error'));
      return;
    }

    // Forward events
    if (msg.type === 'event') {
      emitter.emit('event', msg);
      if (msg.event) emitter.emit(msg.event, msg.payload);
    }
  });

  ws.on('close', () => {
    connected = false;
    emitter.emit('disconnected');
    rejectAllPending(new Error('OpenClaw connection closed'));
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[OpenClaw WS] Error:', err.message);
    // Will trigger close event
  });
}

function scheduleReconnect() {
  if (shuttingDown) return;
  if (reconnectTimer) return;
  console.log(`[OpenClaw WS] Reconnecting in ${reconnectDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    doConnect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function rejectAllPending(err) {
  for (const [id, { reject, timer }] of pending) {
    clearTimeout(timer);
    reject(err);
  }
  pending.clear();
}

function connect(url) {
  if (url) gatewayUrl = url;
  shuttingDown = false;
  loadGatewayConfig();
  if (!loadDeviceIdentity()) {
    console.warn('[OpenClaw WS] Cannot connect without device identity');
    return;
  }
  doConnect();
}

function disconnect() {
  shuttingDown = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  rejectAllPending(new Error('Client shutting down'));
  if (ws) { ws.close(); ws = null; }
  connected = false;
}

function request(method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      return reject(new Error('OpenClaw not connected'));
    }
    const id = `req-${++requestId}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`OpenClaw request timeout: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

function isConnected() { return connected; }
function on(event, handler) { emitter.on(event, handler); }
function off(event, handler) { emitter.off(event, handler); }

module.exports = { connect, disconnect, request, isConnected, on, off };
