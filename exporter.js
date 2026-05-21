import { TIMING } from './data.js';
import { calcTotalMs, renderStateAtTime, wait } from './player.js';

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      return resolve();
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`スクリプト読み込み失敗: ${src}`));
    document.head.appendChild(script);
  });
}

export async function loadGifLibs() {
  await loadScript('https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js');
  await loadScript('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js');
}

export async function loadApngLibs() {
  await loadScript('https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js');
  await loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js');
}

export async function loadWebMLibs() {
  await loadScript('https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js');
  await loadScript('https://cdn.jsdelivr.net/npm/webm-muxer@5.0.2/build/webm-muxer.js');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function saveMediaBlob(blob, filename, options = {}) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });

  if (
    options.preferShare &&
    navigator.canShare &&
    navigator.canShare({ files: [file] }) &&
    navigator.share
  ) {
    try {
      await navigator.share({
        files: [file],
        title: options.title || filename
      });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      console.warn('共有に失敗したためダウンロードへ切り替えます', err);
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}

function getStageSize(outputWidth) {
  const stageEl = document.querySelector('.stage');
  if (!stageEl) throw new Error('ステージが見つかりません');
  const rect = stageEl.getBoundingClientRect();
  const scale = outputWidth / rect.width;
  return {
    stageEl,
    width: outputWidth,
    height: Math.round(rect.height * scale),
    scale
  };
}

function makeEven(value) {
  return value % 2 === 0 ? value : value + 1;
}

function normalizeLoopCount(value) {
  return Number(value) === -1 ? -1 : 0;
}

function getApngPlayCount(loopCount) {
  return loopCount === -1 ? 1 : 0;
}

let _crcTable = null;
function getCrcTable() {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crcTable[n] = c >>> 0;
  }
  return _crcTable;
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}

function crc32(bytes, offset, length) {
  const table = getCrcTable();
  let c = 0xFFFFFFFF;
  for (let i = offset; i < offset + length; i++) {
    c = table[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function patchApngPlayCount(buffer, playCount) {
  const bytes = new Uint8Array(buffer);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'acTL' && length >= 8) {
      writeUint32(bytes, offset + 12, playCount);
      writeUint32(bytes, offset + 8 + length, crc32(bytes, offset + 4, length + 4));
      break;
    }
    offset += length + 12;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function getAspectSize(contentWidth, contentHeight, aspectMode) {
  if (aspectMode === '9:16') {
    let outputWidth = contentWidth;
    let outputHeight = Math.round(outputWidth * 16 / 9);
    if (outputHeight < contentHeight) {
      outputHeight = contentHeight;
      outputWidth = Math.round(outputHeight * 9 / 16);
    }
    return {
      width: makeEven(outputWidth),
      height: makeEven(outputHeight)
    };
  }

  if (aspectMode === '16:9') {
    let outputWidth = contentWidth;
    let outputHeight = Math.round(outputWidth * 9 / 16);
    if (outputHeight < contentHeight) {
      outputHeight = contentHeight;
      outputWidth = Math.round(outputHeight * 16 / 9);
    }
    return {
      width: makeEven(outputWidth),
      height: makeEven(outputHeight)
    };
  }

  return {
    width: makeEven(contentWidth),
    height: makeEven(contentHeight)
  };
}

function composeAspectCanvas(contentCanvas, outputWidth, outputHeight, backgroundColor = '#F5F2E4') {
  if (contentCanvas.width === outputWidth && contentCanvas.height === outputHeight) {
    return contentCanvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.drawImage(
    contentCanvas,
    Math.round((outputWidth - contentCanvas.width) / 2),
    Math.round((outputHeight - contentCanvas.height) / 2)
  );

  return canvas;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function buildInlineStyle(styles) {
  return Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('; ');
}

function buildSvgStageHtml(state) {
  const messages = state.scenario.map(msg => {
    const char = state.characters[msg.speaker] || {};
    const facing = char.facing === 'right' ? 'right' : 'left';
    const bubbleStroke = char.bubbleStroke === 'none' ? 'none' : `1px solid ${char.bubbleStroke || '#000000'}`;
    const iconUrl = String(char.iconUrl || '').replace(/'/g, '%27').replace(/\)/g, '%29');
    const iconStyle = buildInlineStyle({
      'background-image': iconUrl ? `url('${iconUrl}')` : 'none',
      'background-size': 'contain',
      'background-position': 'center',
      'background-repeat': 'no-repeat',
      'background-color': 'transparent'
    });
    const bubbleStyle = buildInlineStyle({
      background: char.bubbleFill || '#ffffff',
      border: bubbleStroke,
      color: char.textColor || '#000000'
    });

    return `
        <div class="message face-${facing}">
          <div class="message-icon face-${facing}" style="${escapeAttr(iconStyle)}"></div>
          <div class="message-bubble" style="${escapeAttr(bubbleStyle)}">
            <div class="bubble-buttons"><span class="btn-dot"></span><span class="btn-dot"></span><span class="btn-dot"></span></div>
            <div class="bubble-text"><span class="prompt" style="color: ${escapeAttr(char.promptColor || '#000000')}">${escapeHtml(msg.speaker)} $</span><span class="main-text">${escapeHtml(msg.text || '')}</span></div>
            <span class="bubble-tail-outer"></span>
            <span class="bubble-tail-inner"></span>
          </div>
        </div>`;
  }).join('');

  return `<div class="stage">${messages}
      </div>`;
}

function buildSvgCss(cssVars, sourceWidth) {
  const stageWidth = Math.round(sourceWidth);
  const bubbleMaxWidth = Math.max(220, stageWidth - 80);

  return `
    :root { ${cssVars} }
    * { box-sizing: border-box; }
    body { margin: 0; }
    .stage {
      background: var(--b);
      border-radius: 20px;
      box-shadow: 0 2px 10px rgba(25, 25, 25, 0.06);
      border: 1px solid rgba(25, 25, 25, 0.12);
      padding: 22px;
      gap: 14px;
      display: flex;
      flex-direction: column;
      width: ${stageWidth}px;
      margin: 0 auto;
      box-sizing: border-box;
      font-family: 'Hiragino Sans', 'Yu Gothic UI', sans-serif;
    }
    .message {
      display: flex;
      align-items: center;
      gap: 10px;
      animation: message-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .message.face-right { flex-direction: row; }
    .message.face-left { flex-direction: row-reverse; }
    .message-icon {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--b);
      font-weight: bold;
      font-size: 18px;
    }
    .message-bubble {
      width: fit-content;
      max-width: ${bubbleMaxWidth}px;
      border-radius: 8px;
      padding: 10px 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      font-family: 'M PLUS 1 Code', 'Consolas', 'Menlo', 'Courier New', monospace;
      position: relative;
      min-height: 36px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box;
    }
    .bubble-buttons { display: flex; gap: 4px; }
    .btn-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .btn-dot:nth-child(1) { background: #ff5f57; }
    .btn-dot:nth-child(2) { background: #ffbd2e; }
    .btn-dot:nth-child(3) { background: #28c840; }
    .bubble-text {
      font-family: 'M PLUS 1 Code', 'Consolas', 'Menlo', 'Courier New', monospace;
      font-size: 16px;
      letter-spacing: 0.1em;
      line-height: 1.5;
      word-break: break-word;
      white-space: normal;
      max-width: 30em;
    }
    .bubble-text .prompt {
      font-size: 14px;
      letter-spacing: 0;
      font-weight: bold;
      margin-right: 6px;
    }
    .main-text { white-space: pre-wrap; }
    .bubble-tail-outer,
    .bubble-tail-inner { display: none; }
    .svg-replay-btn {
      background: var(--e);
      color: var(--f);
      border: none;
      padding: 10px 22px;
      border-radius: 8px;
      font-size: 14px;
      font-family: 'Hiragino Sans', sans-serif;
      cursor: pointer;
    }
    .svg-replay-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .svg-controls { text-align: center; margin-top: 16px; }
    @keyframes shake-x {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-2px); }
      40% { transform: translateX(1.5px); }
      60% { transform: translateX(-1.5px); }
      80% { transform: translateX(2px); }
    }
    .message-icon.emotion-angry { animation: shake-x 0.12s linear infinite; }
    @keyframes bounce-up {
      0%, 70%, 100% { transform: translateY(0); }
      30%, 50% { transform: translateY(-6px); }
    }
    .message-icon.emotion-happy { animation: bounce-up 0.5s cubic-bezier(0.5, 0, 0.5, 1) infinite; }
    @keyframes shrink-sad {
      0% { transform: scale(1) translateY(0); }
      100% { transform: scale(0.85) translateY(3px); }
    }
    .message-icon.emotion-sad { animation: shrink-sad 0.7s ease-out forwards; }
    @keyframes proud-breathe {
      0%, 100% { transform: scale(1.1) translateY(0); }
      50% { transform: scale(1.1) translateY(-2px); }
    }
    .message-icon.emotion-proud { animation: proud-breathe 1.2s ease-in-out infinite; }
    @keyframes surprise-jump {
      0% { transform: scale(1) translateY(0); }
      20% { transform: scale(1.15) translateY(-8px); }
      40% { transform: scale(1) translateY(0); }
      50% { transform: translateX(-1.5px); }
      70% { transform: translateX(1.5px); }
      90% { transform: translateX(-1px); }
      100% { transform: translateX(0); }
    }
    .message-icon.emotion-surprise { animation: surprise-jump 1s ease-out infinite; }
    @keyframes fall-right {
      0% { transform: scale(1) rotate(0deg) translateY(0); }
      30% { transform: scale(1) rotate(0deg) translateY(2px); }
      100% { transform: scale(1) rotate(85deg) translateY(-8px); }
    }
    @keyframes fall-left {
      0% { transform: scale(1) rotate(0deg) translateY(0); }
      30% { transform: scale(1) rotate(0deg) translateY(2px); }
      100% { transform: scale(1) rotate(-85deg) translateY(-8px); }
    }
    .message-icon.emotion-fall.face-right { animation: fall-right 0.7s ease-out forwards; }
    .message-icon.emotion-fall.face-left { animation: fall-left 0.7s ease-out forwards; }
  `;
}

function buildEmbedScript(scenarioData) {
  function escapeCdata(str) {
    return str.replace(/<\/script/gi, '<\\/script');
  }

  return `
(() => {
  const root = document.currentScript.closest('.chat-ani-embed');
  if (!root) return;

  const SCENARIO = ${escapeCdata(JSON.stringify(scenarioData))};
  const TIMING = ${escapeCdata(JSON.stringify(TIMING))};
  let isPlaying = false;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const messages = root.querySelectorAll('.stage .message');
  const textEls = root.querySelectorAll('.stage .main-text');
  const iconEls = root.querySelectorAll('.stage .message-icon');
  const replayBtn = root.querySelector('.embed-replay-btn');
  const originalTexts = Array.from(textEls).map(el => el.textContent);

  async function play() {
    if (isPlaying) return;
    isPlaying = true;
    if (replayBtn) replayBtn.disabled = true;

    messages.forEach(m => m.style.display = 'none');
    textEls.forEach(el => el.textContent = '');
    await wait(TIMING.initialDelay);

    for (let i = 0; i < SCENARIO.length; i++) {
      const msg = SCENARIO[i];
      if (!messages[i]) continue;

      messages[i].style.display = '';
      await wait(TIMING.iconAppear);
      await wait(TIMING.bubbleAppear);

      if (msg.emotion && msg.emotion !== 'neutral') {
        iconEls[i].classList.add('emotion-' + msg.emotion);
      }

      textEls[i].textContent = '';
      for (const ch of originalTexts[i]) {
        textEls[i].textContent += ch;
        await wait(TIMING.charDelay);
      }

      if (msg.emotion && msg.emotion !== 'neutral') {
        iconEls[i].classList.remove('emotion-' + msg.emotion);
      }

      await wait(TIMING.afterText);
    }

    isPlaying = false;
    if (replayBtn) replayBtn.disabled = false;
  }

  if (replayBtn) replayBtn.addEventListener('click', play);
  play();
})();
  `;
}

function buildEmbedHtml(state, options = {}) {
  const stageWidth = options.stageWidth || 720;
  const rs = getComputedStyle(document.documentElement);
  const cssVars = ['--a', '--b', '--c', '--d', '--e', '--f']
    .map(v => `${v}: ${rs.getPropertyValue(v).trim()};`)
    .join(' ');
  const scenarioData = state.scenario.map(s => ({
    speaker: s.speaker, emotion: s.emotion, text: s.text
  }));

  const css = buildSvgCss(cssVars, stageWidth)
    .replaceAll('.svg-replay-btn', '.embed-replay-btn')
    .replaceAll('.svg-controls', '.embed-controls');

  return `<div class="chat-ani-embed">
  <style>
${css}
    .chat-ani-embed { width: 100%; }
    .embed-controls { text-align: center; margin-top: 16px; }
  </style>
  ${buildSvgStageHtml(state)}
  <div class="embed-controls">
    <button type="button" class="embed-replay-btn">▶ 再生</button>
  </div>
  <script>
${buildEmbedScript(scenarioData)}
  </script>
</div>`;
}

let _cachedWorkerUrl = null;
async function fetchWorkerAsBlob() {
  if (_cachedWorkerUrl) return _cachedWorkerUrl;
  const WORKER_URL = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js';
  const response = await fetch(WORKER_URL);
  if (!response.ok) throw new Error('gif.worker.js取得失敗');
  const code = await response.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  _cachedWorkerUrl = URL.createObjectURL(blob);
  return _cachedWorkerUrl;
}

export async function exportGIF(state, options, onProgress) {
  const frameDelay = Math.round(1000 / options.fps);
  const loopCount = normalizeLoopCount(options.loopCount);
  const tailDelayMs = 2000;

  state.visibleCount = state.scenario.length;
  state.scenario.forEach(msg => msg.displayText = msg.text);
  await wait(100);

  const { stageEl, width, height, scale } = getStageSize(options.outputWidth);
  const totalMs = calcTotalMs(state.scenario);
  const totalFrames = Math.ceil(totalMs / frameDelay);

  onProgress('ライブラリを準備中...', 0);
  const workerUrl = await fetchWorkerAsBlob();

  const gif = new GIF({
    workers: 2, quality: 10,
    width, height,
    workerScript: workerUrl,
    repeat: loopCount
  });

  onProgress('アニメを録画中...', 0);
  for (let t = 0; t < totalMs; t += frameDelay) {
    try {
      renderStateAtTime(state, t);
      await options.nextTick();

      const canvas = await htmlToImage.toCanvas(stageEl, {
        backgroundColor: '#F5F2E4',
        pixelRatio: 1,
        width: width,
        height: height,
        style: {
          transform: `scale(${scale})`,
          'transform-origin': 'top left',
          width: stageEl.offsetWidth + 'px',
          height: stageEl.offsetHeight + 'px',
          margin: '0'
        }
      });
      gif.addFrame(canvas, { delay: frameDelay, copy: true });

      if (t % (frameDelay * 5) === 0) {
        onProgress(`録画中... ${Math.floor(t / frameDelay)}/${totalFrames}`, (t / totalMs) * 0.7);
      }
    } catch (e) {
      console.warn('フレームキャプチャ失敗', e);
    }
    await new Promise(r => requestAnimationFrame(r));
  }

  if (loopCount !== -1 && tailDelayMs > 0) {
    try {
      renderStateAtTime(state, totalMs);
      await options.nextTick();
      const tailCanvas = await htmlToImage.toCanvas(stageEl, {
        backgroundColor: '#F5F2E4',
        pixelRatio: 1,
        width: width,
        height: height,
        style: {
          transform: `scale(${scale})`,
          'transform-origin': 'top left',
          width: stageEl.offsetWidth + 'px',
          height: stageEl.offsetHeight + 'px',
          margin: '0'
        }
      });
      gif.addFrame(tailCanvas, { delay: tailDelayMs, copy: true });
    } catch (e) {
      console.warn('余韻フレーム追加失敗', e);
    }
  }

  onProgress('GIFを書き出し中...', 0.7);
  return new Promise((resolve, reject) => {
    gif.on('progress', (p) => {
      onProgress(`書き出し中... ${(p * 100).toFixed(0)}%`, 0.7 + p * 0.3);
    });
    gif.on('finished', (blob) => {
      if (options.returnBlob) {
        resolve(blob);
        return;
      }

      saveMediaBlob(blob, 'chat-anime.gif', {
        preferShare: options.preferShare,
        title: 'ChatAniMaker GIF'
      }).then(resolve).catch(reject);
    });
    gif.on('abort', () => reject(new Error('生成中断')));
    gif.render();
  });
}

export async function exportAPNG(state, options, onProgress) {
  const frameDelay = Math.round(1000 / options.fps);
  const loopCount = normalizeLoopCount(options.loopCount);
  const tailDelayMs = 2000;

  state.visibleCount = state.scenario.length;
  state.scenario.forEach(msg => msg.displayText = msg.text);
  await wait(100);

  const { stageEl, width, height, scale } = getStageSize(options.outputWidth);
  const totalMs = calcTotalMs(state.scenario);
  const totalFrames = Math.ceil(totalMs / frameDelay);

  const FIXED_WIDTH = width;
  const FIXED_HEIGHT = height;
  const STAGE_REAL_WIDTH = stageEl.offsetWidth;
  const STAGE_REAL_HEIGHT = stageEl.offsetHeight;

  const frames = [];
  const delays = [];

  onProgress('アニメを録画中...', 0);
  for (let t = 0; t < totalMs; t += frameDelay) {
    try {
      renderStateAtTime(state, t);
      await options.nextTick();

      const canvas = await htmlToImage.toCanvas(stageEl, {
        backgroundColor: '#F5F2E4',
        pixelRatio: 1,
        width: FIXED_WIDTH,
        height: FIXED_HEIGHT,
        style: {
          transform: `scale(${scale})`,
          'transform-origin': 'top left',
          width: STAGE_REAL_WIDTH + 'px',
          height: STAGE_REAL_HEIGHT + 'px',
          margin: '0'
        }
      });

      if (canvas.width !== FIXED_WIDTH || canvas.height !== FIXED_HEIGHT) {
        console.warn(`サイズ不一致でスキップ: ${canvas.width}×${canvas.height} (期待 ${FIXED_WIDTH}×${FIXED_HEIGHT})`);
        await wait(frameDelay);
        continue;
      }

      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
      frames.push(imgData.data.buffer);
      delays.push(frameDelay);

      if (t % (frameDelay * 5) === 0) {
        onProgress(`録画中... ${frames.length}/${totalFrames}`, (t / totalMs) * 0.6);
      }
    } catch (e) {
      console.warn('フレームキャプチャ失敗', e);
    }
    await new Promise(r => requestAnimationFrame(r));
  }

  if (frames.length === 0) {
    throw new Error('フレームが1つも取得できませんでした');
  }

  if (loopCount !== -1 && tailDelayMs > 0) {
    const lastFrame = frames[frames.length - 1];
    frames.push(lastFrame.slice(0));
    delays.push(tailDelayMs);
  }

  onProgress('APNGを書き出し中...', 0.7);
  await wait(50);

  const apngPlayCount = getApngPlayCount(loopCount);
  const apngBuffer = patchApngPlayCount(
    UPNG.encode(frames, FIXED_WIDTH, FIXED_HEIGHT, 256, delays, { loop: apngPlayCount }),
    apngPlayCount
  );
  onProgress('完了', 1.0);
  const blob = new Blob([apngBuffer], { type: 'image/png' });

  if (options.returnBlob) return blob;

  await saveMediaBlob(blob, 'chat-anime.png', {
    preferShare: options.preferShare,
    title: 'ChatAniMaker APNG'
  });
}

export async function exportWebM(state, options, onProgress) {
  if (!window.isSecureContext) {
    throw new Error('WebM生成にはHTTPSまたはlocalhostでの表示が必要です。HTTPS配信で開いてお試しください。');
  }
  if (typeof WebMMuxer === 'undefined') throw new Error('WebMMuxerが読み込まれていません');
  if (typeof VideoEncoder === 'undefined') throw new Error('お使いのブラウザはVideoEncoderに対応していません。最新のOS、ブラウザでお試しください。');

  const frameDelay = Math.round(1000 / options.fps);
  const isAV1 = options.codec === 'av1';

  state.visibleCount = state.scenario.length;
  state.scenario.forEach(msg => msg.displayText = msg.text);
  await wait(100);

  const { stageEl, width, height, scale } = getStageSize(options.outputWidth);
  const totalMs = calcTotalMs(state.scenario);
  const totalFrames = Math.ceil(totalMs / frameDelay);

  // 幅と高さは偶数である必要がある（エンコーダーの制限）
  const FIXED_WIDTH = makeEven(width);
  const FIXED_HEIGHT = makeEven(height);
  const outputSize = getAspectSize(FIXED_WIDTH, FIXED_HEIGHT, options.aspectMode || 'content');
  const encWidth = outputSize.width;
  const encHeight = outputSize.height;
  const STAGE_REAL_WIDTH = stageEl.offsetWidth;
  const STAGE_REAL_HEIGHT = stageEl.offsetHeight;

  const encoderCodec = isAV1 ? 'av01.0.04M.08' : 'vp09.00.10.08';
  const config = {
    codec: encoderCodec,
    width: encWidth,
    height: encHeight,
    bitrate: 2_000_000 * (encWidth / 720), // 720p基準で2Mbps
    framerate: options.fps
  };

  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) {
    throw new Error(`お使いの環境は ${isAV1 ? 'AV1' : 'VP9'} エンコードに対応していません。${isAV1 ? 'Android端末ではAV1非対応が多いため、WebM(VP9)をお試しください。' : ''}`);
  }

  const muxer = new WebMMuxer.Muxer({
    target: new WebMMuxer.ArrayBufferTarget(),
    video: {
      codec: isAV1 ? 'V_AV1' : 'V_VP9',
      width: encWidth,
      height: encHeight,
      frameRate: options.fps
    }
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error(e)
  });

  encoder.configure(config);

  onProgress('アニメを録画中...', 0);
  for (let t = 0; t < totalMs; t += frameDelay) {
    try {
      renderStateAtTime(state, t);
      await options.nextTick();

      const canvas = await htmlToImage.toCanvas(stageEl, {
        backgroundColor: '#F5F2E4',
        pixelRatio: 1,
        width: FIXED_WIDTH,
        height: FIXED_HEIGHT,
        style: {
          transform: `scale(${scale})`,
          'transform-origin': 'top left',
          width: STAGE_REAL_WIDTH + 'px',
          height: STAGE_REAL_HEIGHT + 'px',
          margin: '0'
        }
      });

      if (canvas.width !== FIXED_WIDTH || canvas.height !== FIXED_HEIGHT) {
        throw new Error(`WebMフレームサイズ不一致: ${canvas.width}×${canvas.height} (期待 ${FIXED_WIDTH}×${FIXED_HEIGHT})`);
      }

      const outputCanvas = composeAspectCanvas(canvas, encWidth, encHeight);
      const frame = new VideoFrame(outputCanvas, { timestamp: t * 1000 });
      encoder.encode(frame, { keyFrame: (t % 2000 === 0) });
      frame.close();

      if (t % (frameDelay * 5) === 0) {
        onProgress(`録画中... ${Math.floor(t / frameDelay)}/${totalFrames}`, (t / totalMs) * 0.9);
      }
    } catch (e) {
      if (e && e.message && e.message.startsWith('WebMフレームサイズ不一致')) throw e;
      console.warn('フレームキャプチャ失敗', e);
    }
    await new Promise(r => requestAnimationFrame(r));
  }

  onProgress('エンコード中...', 0.95);
  await encoder.flush();
  muxer.finalize();

  const buffer = muxer.target.buffer;
  const filename = isAV1 ? 'chat-anime-av1.webm' : 'chat-anime-vp9.webm';
  const blob = new Blob([buffer], { type: 'video/webm' });
  onProgress('完了', 1.0);

  if (options.returnBlob) return blob;

  downloadBlob(blob, filename);
}

export async function exportSVG(state, options) {
  state.visibleCount = state.scenario.length;
  state.scenario.forEach(msg => {
    msg.displayText = msg.text;
    msg.currentEmotion = '';
  });
  await wait(50);

  const { stageEl, width, height, scale } = getStageSize(options.outputWidth);
  const rect = stageEl.getBoundingClientRect();

  const rs = getComputedStyle(document.documentElement);
  const cssVars = ['--a', '--b', '--c', '--d', '--e', '--f']
    .map(v => `${v}: ${rs.getPropertyValue(v).trim()};`)
    .join(' ');

  const sourceWidth = Math.round(rect.width);
  const stageHtml = buildSvgStageHtml(state);
  const scenarioData = state.scenario.map(s => ({
    speaker: s.speaker, emotion: s.emotion, text: s.text
  }));

  function escapeCdata(str) {
    return str.replace(/]]>/g, ']]]]><![CDATA[>');
  }

  const cssText = buildSvgCss(cssVars, sourceWidth);

  const animScript = `
  const SCENARIO = ${escapeCdata(JSON.stringify(scenarioData))};
  const TIMING   = ${escapeCdata(JSON.stringify(TIMING))};

let isPlaying = false;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const messages = document.querySelectorAll('.stage .message');
const textEls  = document.querySelectorAll('.stage .main-text');
const iconEls  = document.querySelectorAll('.stage .message-icon');
const replayBtn = document.getElementById('replay-btn');

const originalTexts = Array.from(textEls).map(el => el.textContent);

async function play() {
  if (isPlaying) return;
  isPlaying = true;
  replayBtn.disabled = true;

  messages.forEach(m => m.style.display = 'none');
  textEls.forEach(el => el.textContent = '');

  await wait(TIMING.initialDelay);

  for (let i = 0; i < SCENARIO.length; i++) {
    const msg = SCENARIO[i];
    if (!messages[i]) continue;

    messages[i].style.display = '';
    await wait(TIMING.iconAppear);
    await wait(TIMING.bubbleAppear);

    if (msg.emotion && msg.emotion !== 'neutral') {
      iconEls[i].classList.add('emotion-' + msg.emotion);
    }

    textEls[i].textContent = '';
    for (const ch of originalTexts[i]) {
      textEls[i].textContent += ch;
      await wait(TIMING.charDelay);
    }

    if (msg.emotion && msg.emotion !== 'neutral') {
      iconEls[i].classList.remove('emotion-' + msg.emotion);
    }

    await wait(TIMING.afterText);
  }

  isPlaying = false;
  replayBtn.disabled = false;
}

replayBtn.addEventListener('click', play);
play();
`;

  const controlHeight = 96;
  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xhtml="http://www.w3.org/1999/xhtml"
     viewBox="0 0 ${width} ${height + controlHeight}"
     width="${width}" height="${height + controlHeight}">
  <defs>
    <style type="text/css"><![CDATA[
      ${cssText}
    ]]></style>
  </defs>
  <foreignObject x="0" y="0" width="${width}" height="${height + controlHeight}">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="width: ${sourceWidth}px; transform: scale(${scale}); transform-origin: 0 0;">
      ${stageHtml}
      <div class="svg-controls">
        <button id="replay-btn" class="svg-replay-btn">▶ 再生</button>
      </div>
    </div>
  </foreignObject>
  <script type="text/javascript"><![CDATA[
${animScript}
  ]]></script>
</svg>`;

  downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), 'chat-anime.svg');
}

export async function exportEmbedHTML(state, options = {}) {
  state.visibleCount = state.scenario.length;
  state.scenario.forEach(msg => {
    msg.displayText = msg.text;
    msg.currentEmotion = '';
  });
  await wait(50);

  const { stageEl } = getStageSize(options.outputWidth || 720);
  const rect = stageEl.getBoundingClientRect();
  const html = buildEmbedHtml(state, {
    stageWidth: Math.round(rect.width)
  });

  if (options.returnText) return html;

  downloadBlob(new Blob([html], { type: 'text/html' }), 'chat-anime-embed.html');
}
