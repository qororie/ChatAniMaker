import { ref, nextTick } from '../lib/vue.esm-browser.js';
import { exportGIF, exportAPNG, exportSVG, exportWebM } from '../exporter.js';

export function useExport(state, activeTab) {
  const showDownloadMenu = ref(false);
  const fps = ref(8);
  const outputWidth = ref(480);
  const showProgress = ref(false);
  const progressTitle = ref('');
  const progressText = ref('');
  const progressRatio = ref(0);

  async function prepareExport(title) {
    showDownloadMenu.value = false;
    if (state.scenario.length === 0) {
      alert('セリフが1つもありません');
      return false;
    }
    state.isExporting = true;
    activeTab.value = 'anime';
    showProgress.value = true;
    progressTitle.value = title;
    progressText.value = '準備中';
    progressRatio.value = 0;
    await new Promise(r => setTimeout(r, 100));
    return true;
  }

  function handleProgress(text, ratio) {
    progressText.value = text;
    progressRatio.value = ratio;
  }

  async function downloadGif() {
    if (!await prepareExport('🎬 GIF生成中...')) return;
    try {
      await exportGIF(state, { fps: fps.value, outputWidth: outputWidth.value, nextTick }, handleProgress);
    } catch (err) {
      alert('GIF生成に失敗しました: ' + err.message);
      console.error(err);
    } finally {
      showProgress.value = false;
      state.isExporting = false;
    }
  }

  async function downloadApng() {
    if (!await prepareExport('🌈 APNG生成中...')) return;
    try {
      await exportAPNG(state, { fps: fps.value, outputWidth: outputWidth.value, nextTick }, handleProgress);
    } catch (err) {
      alert('APNG生成に失敗しました: ' + err.message);
      console.error(err);
    } finally {
      showProgress.value = false;
      state.isExporting = false;
    }
  }

  async function downloadAnimSvg() {
    showDownloadMenu.value = false;
    if (state.scenario.length === 0) {
      alert('セリフが1つもありません'); return;
    }
    activeTab.value = 'anime';
    try {
      await exportSVG(state, { outputWidth: outputWidth.value });
    } catch (err) {
      alert('アニメSVG生成に失敗しました: ' + err.message);
      console.error(err);
    }
  }

  async function downloadWebM(codec = 'vp9') {
    const title = codec === 'av1' ? '🎥 AV1動画生成中...' : '🎥 WebM動画生成中...';
    if (!await prepareExport(title)) return;
    try {
      await exportWebM(state, { fps: fps.value, outputWidth: outputWidth.value, nextTick, codec }, handleProgress);
    } catch (err) {
      alert('動画生成に失敗しました: ' + err.message);
      console.error(err);
    } finally {
      showProgress.value = false;
      state.isExporting = false;
    }
  }

  return {
    showDownloadMenu, fps, outputWidth,
    showProgress, progressTitle, progressText, progressRatio,
    downloadGif, downloadApng, downloadAnimSvg, downloadWebM
  };
}
