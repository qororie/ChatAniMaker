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
  await loadScript('./lib/html-to-image.js');
  await loadScript('./lib/gif.js');
}

export async function loadApngLibs() {
  await loadScript('./lib/html-to-image.js');
  await loadScript('./lib/pako.min.js');
  await loadScript('./lib/UPNG.js');
}

export async function loadWebMLibs() {
  await loadScript('./lib/html-to-image.js');
  await loadScript('./lib/webm-muxer.js');
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

let _cachedWorkerUrl = null;
async function fetchWorkerAsBlob() {
  if (_cachedWorkerUrl) return _cachedWorkerUrl;
  const WORKER_URL = './lib/gif.worker.js';
  const response = await fetch(WORKER_URL);
  if (!response.ok) throw new Error('gif.worker.js取得失敗');
  const code = await response.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  _cachedWorkerUrl = URL.createObjectURL(blob);
  return _cachedWorkerUrl;
}

export async function exportGIF(state, options, onProgress) {
  const frameDelay = Math.round(1000 / options.fps);

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
    repeat: -1
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

  onProgress('GIFを書き出し中...', 0.7);
  return new Promise((resolve, reject) => {
    gif.on('progress', (p) => {
      onProgress(`書き出し中... ${(p * 100).toFixed(0)}%`, 0.7 + p * 0.3);
    });
    gif.on('finished', (blob) => {
      downloadBlob(blob, 'chat-anime.gif');
      resolve();
    });
    gif.on('abort', () => reject(new Error('生成中断')));
    gif.render();
  });
}

export async function exportAPNG(state, options, onProgress) {
  const frameDelay = Math.round(1000 / options.fps);

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

  onProgress('APNGを書き出し中...', 0.7);
  await wait(50);

  const apngBuffer = UPNG.encode(frames, FIXED_WIDTH, FIXED_HEIGHT, 256, delays);
  onProgress('完了', 1.0);
  downloadBlob(new Blob([apngBuffer], { type: 'image/png' }), 'chat-anime.png');
}

export async function exportWebM(state, options, onProgress) {
  if (typeof WebMMuxer === 'undefined') throw new Error('WebMMuxerが読み込まれていません');
  if (typeof VideoEncoder === 'undefined') throw new Error('お使いのブラウザはVideoEncoderに対応していません（Chrome等の最新ブラウザをご利用ください）');

  const frameDelay = Math.round(1000 / options.fps);
  const isAV1 = options.codec === 'av1';

  state.visibleCount = state.scenario.length;
  state.scenario.forEach(msg => msg.displayText = msg.text);
  await wait(100);

  const { stageEl, width, height, scale } = getStageSize(options.outputWidth);
  const totalMs = calcTotalMs(state.scenario);
  const totalFrames = Math.ceil(totalMs / frameDelay);

  // 幅と高さは偶数である必要がある（エンコーダーの制限）
  const encWidth = width % 2 === 0 ? width : width + 1;
  const encHeight = height % 2 === 0 ? height : height + 1;

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
    throw new Error(`お使いの環境は ${isAV1 ? 'AV1' : 'VP9'} エンコードに対応していません。`);
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
        width: encWidth,
        height: encHeight,
        style: {
          transform: `scale(${scale})`,
          'transform-origin': 'top left',
          width: stageEl.offsetWidth + 'px',
          height: stageEl.offsetHeight + 'px',
          margin: '0'
        }
      });

      const frame = new VideoFrame(canvas, { timestamp: t * 1000 });
      encoder.encode(frame, { keyFrame: (t % 2000 === 0) });
      frame.close();

      if (t % (frameDelay * 5) === 0) {
        onProgress(`録画中... ${Math.floor(t / frameDelay)}/${totalFrames}`, (t / totalMs) * 0.9);
      }
    } catch (e) {
      console.warn('フレームキャプチャ失敗', e);
    }
    await new Promise(r => requestAnimationFrame(r));
  }

  onProgress('エンコード中...', 0.95);
  await encoder.flush();
  muxer.finalize();

  const buffer = muxer.target.buffer;
  const filename = isAV1 ? 'chat-anime-av1.webm' : 'chat-anime-vp9.webm';
  downloadBlob(new Blob([buffer], { type: 'video/webm' }), filename);
  onProgress('完了', 1.0);
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

  const stageHtml = stageEl.outerHTML;
  const scenarioData = state.scenario.map(s => ({
    speaker: s.speaker, emotion: s.emotion, text: s.text
  }));

  function escapeCdata(str) {
    return str.replace(/]]>/g, ']]]]><![CDATA[>');
  }

  let cssText = '';
  try {
    const res = await fetch('style.css');
    cssText = await res.text();
  } catch (e) {
    console.warn('CSS fetch failed', e);
  }

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

  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xhtml="http://www.w3.org/1999/xhtml"
     viewBox="0 0 ${width} ${height + 80}"
     width="${width}" height="${height + 80}">
  <defs>
    <style type="text/css"><![CDATA[
      :root { ${cssVars} }
      ${cssText}
      .svg-replay-btn {
        background: var(--e); color: var(--f);
        border: none; padding: 10px 22px; border-radius: 8px;
        font-size: 14px; font-family: 'Hiragino Sans', sans-serif;
        cursor: pointer;
      }
      .svg-replay-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .svg-controls { text-align: center; margin-top: 16px; }
    ]]></style>
  </defs>
  <foreignObject x="0" y="0" width="${width}" height="${height + 80}">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="width: ${rect.width}px; transform: scale(${scale}); transform-origin: 0 0;">
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
