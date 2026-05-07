import { createApp, ref, reactive, onMounted, nextTick, watch } from 'https://unpkg.com/vue@3.4.27/dist/vue.esm-browser.js';
import { EMOTION_LABEL, defaultCharacters, defaultScenario } from './data.js';
import { playScenario } from './player.js';
import { exportGIF, exportAPNG, exportSVG, exportWebM, downloadBlob, loadGifLibs, loadApngLibs, loadWebMLibs } from './exporter.js';

export function setupApp() {
  const appName = ref('ChatAniMaker');
  const activeTab = ref('anime');
  const showDownloadMenu = ref(false);
  const fps = ref(8);
  const outputWidth = ref(480);
  const showProgress = ref(false);
  const progressTitle = ref('');
  const progressText = ref('');
  const progressRatio = ref(0);
  const showCharForm = ref(false);

  const newChar = reactive({
    id: '', name: '', facing: 'left', iconUrl: '',
    color: '#888888', bubbleFill: '#ffffff', bubbleStroke: '#000000', 
    bubbleNoStroke: false, promptColor: '#000000', textColor: '#000000'
  });

  const state = reactive({
    scenario: JSON.parse(JSON.stringify(defaultScenario)),
    characters: JSON.parse(JSON.stringify(defaultCharacters)),
    visibleCount: 0,
    isPlaying: false,
    isExporting: false
  });

  // Handle localStorage
  const STORAGE_KEY = 'chatanimaker_state_v1';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && Array.isArray(saved.scenario) && saved.scenario.length) {
        state.scenario = saved.scenario.map(s => ({
          speaker: s.speaker, emotion: s.emotion || 'neutral',
          text: s.text || '', displayText: '', currentEmotion: ''
        }));
      }
      if (saved && saved.characters && typeof saved.characters === 'object') {
        for (const key in state.characters) delete state.characters[key];
        Object.assign(state.characters, saved.characters);
      }
    }
  } catch (e) { console.warn('localStorage 読み込み失敗', e); }

  let _saveTimer = null;
  function saveState() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      try {
        const payload = {
          scenario: state.scenario.map(s => ({
            speaker: s.speaker, emotion: s.emotion, text: s.text
          })),
          characters: JSON.parse(JSON.stringify(state.characters))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) { console.warn('localStorage 保存失敗', e); }
    }, 1000);
  }
  watch(() => state.scenario, saveState, { deep: true });
  watch(() => state.characters, saveState, { deep: true });

  onMounted(() => {
    setTimeout(play, 200);
  });

  function play() {
    playScenario(state);
  }

  function countWeightedLength(text) {
    let count = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      count += (code >= 0x20 && code <= 0x7E) ? 0.5 : 1;
    }
    return count;
  }

  function addMessage() {
    state.scenario.push({
      speaker: Object.keys(state.characters)[0] || 'qororie', emotion: 'neutral',
      text: '', displayText: '', currentEmotion: ''
    });
  }

  function deleteMessage(index) {
    state.scenario.splice(index, 1);
  }

  function moveMessage(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.scenario.length) return;
    const arr = state.scenario;
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  }

  function handleScenarioOption(e) {
    const action = e.target.value;
    e.target.value = ""; 
    if (action === "export") {
      downloadProject();
    } else if (action === "import") {
      document.getElementById("import-json").click();
    }
  }

  function downloadProject() {
    try {
      const data = {
        scenario: state.scenario,
        characters: state.characters
      };
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      downloadBlob(blob, 'chat-anime-project.json');
    } catch (e) {
      console.error(e);
      alert('ダウンロードに失敗しました');
    }
  }

  function importProject(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.characters && typeof data.characters === 'object') {
          for (const key in state.characters) delete state.characters[key];
          Object.assign(state.characters, data.characters);
        }
        if (data.scenario && Array.isArray(data.scenario)) {
          state.scenario = data.scenario;
        }
        alert('プロジェクトを読み込みました');
      } catch (err) {
        console.error(err);
        alert('JSONの読み込みに失敗しました');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function deleteCharacter(charId) {
    if (Object.keys(state.characters).length <= 1) {
      alert('最低1キャラは必要です');
      return;
    }

    const c = state.characters[charId];
    const usedCount = state.scenario.filter(s => s.speaker === charId).length;

    let confirmMsg = `「${c.name}」を削除しますか？`;
    if (usedCount > 0) {
      confirmMsg = `「${c.name}」はシナリオで ${usedCount}回 使われています。\n削除すると該当メッセージも消えます。\n続けますか？`;
    }
    if (!confirm(confirmMsg)) return;

    for (let i = state.scenario.length - 1; i >= 0; i--) {
      if (state.scenario[i].speaker === charId) {
        state.scenario.splice(i, 1);
      }
    }
    delete state.characters[charId];
  }

  function openCharForm() {
    Object.assign(newChar, {
      id: '', name: '', facing: 'left', iconUrl: '',
      color: '#888888', bubbleFill: '#ffffff', bubbleStroke: '#000000', bubbleNoStroke: false,
      promptColor: '#000000', textColor: '#000000'
    });
    showCharForm.value = true;
  }

  function closeCharForm() {
    showCharForm.value = false;
  }

  function submitNewChar() {
    const id = newChar.id.trim();
    if (!id) { alert('キャラIDを入力してください'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(id)) {
      alert('キャラIDは半角英数字とアンダースコアのみ使えます'); return;
    }
    if (state.characters[id]) {
      alert(`キャラID "${id}" はすでに使われています`); return;
    }
    const name = newChar.name.trim();
    if (!name) { alert('表示名を入力してください'); return; }
    if (!newChar.iconUrl) { alert('アイコン画像を選択してください'); return; }

    state.characters[id] = {
      name, color: newChar.color, facing: newChar.facing,
      bubbleFill: newChar.bubbleFill,
      bubbleStroke: newChar.bubbleNoStroke ? 'none' : newChar.bubbleStroke,
      promptColor: newChar.promptColor,
      textColor: newChar.textColor,
      iconUrl: newChar.iconUrl
    };
    closeCharForm();
  }

  function handleIconUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('PNG, JPEG, WebP形式の画像を選択してください');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxSide = Math.max(img.width, img.height);
        const scale = Math.min(88 / maxSide, 1);
        const boxSize = Math.round(maxSide * scale);
        canvas.width = boxSize;
        canvas.height = boxSize;
        const drawWidth = Math.round(img.width * scale);
        const drawHeight = Math.round(img.height * scale);
        const dx = (boxSize - drawWidth) / 2;
        const dy = (boxSize - drawHeight) / 2;
        ctx.clearRect(0, 0, boxSize, boxSize);
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
        newChar.iconUrl = canvas.toDataURL('image/webp', 0.8);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

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
    await new Promise(r => setTimeout(r, 100)); // DOM update
    return true;
  }

  function handleProgress(text, ratio) {
    progressText.value = text;
    progressRatio.value = ratio;
  }

  async function downloadGif() {
    if (!await prepareExport('🎬 GIF生成中...')) return;

    try {
      handleProgress('ライブラリを読み込み中...', 0);
      await loadGifLibs();
      await exportGIF(state, { fps: fps.value, outputWidth: outputWidth.value, nextTick }, handleProgress);
    } catch (err) {
      alert('GIF生成に失敗しました: ' + err.message);
      console.error(err);
    } finally {
      showProgress.value = false;
      state.isExporting = false;
    }
  }

  async function downloadWebM(codec = 'vp9') {
    const title = codec === 'av1' ? '🎥 AV1動画生成中...' : '🎥 WebM動画生成中...';
    if (!await prepareExport(title)) return;

    try {
      handleProgress('ライブラリを読み込み中...', 0);
      await loadWebMLibs();
      await exportWebM(state, { fps: fps.value, outputWidth: outputWidth.value, nextTick, codec }, handleProgress);
    } catch (err) {
      alert('動画生成に失敗しました: ' + err.message);
      console.error(err);
    } finally {
      showProgress.value = false;
      state.isExporting = false;
    }
  }

  async function downloadApng() {
    if (!await prepareExport('🌈 APNG生成中...')) return;

    try {
      handleProgress('ライブラリを読み込み中...', 0);
      await loadApngLibs();
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

  return {
    appName, activeTab,
    showDownloadMenu, fps, outputWidth,
    showProgress, progressTitle, progressText, progressRatio,
    showCharForm, newChar,
    state, EMOTION_LABEL,
    countWeightedLength, play,
    addMessage, deleteMessage, moveMessage, handleScenarioOption, importProject,
    deleteCharacter, openCharForm, closeCharForm, submitNewChar, handleIconUpload,
    downloadGif, downloadApng, downloadAnimSvg, downloadWebM
  };
}

createApp({ setup: setupApp }).mount('#app');
