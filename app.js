import { createApp, ref, reactive, onMounted, watch } from './lib/vue.esm-browser.js';
import { EMOTION_LABEL, defaultCharacters, defaultScenario } from './data.js';
import { playScenario } from './player.js';
import { useCharacters } from './composables/useCharacters.js';
import { useScenario, validateImportData } from './composables/useScenario.js';
import { useExport } from './composables/useExport.js';

function setupApp() {
  const appName = ref('ChatAniMaker');
  const activeTab = ref('anime');

  const state = reactive({
    scenario: JSON.parse(JSON.stringify(defaultScenario)),
    characters: JSON.parse(JSON.stringify(defaultCharacters)),
    visibleCount: 0,
    isPlaying: false,
    isExporting: false
  });

  const STORAGE_KEY = 'chatanimaker_state_v1';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      validateImportData(saved);
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
          scenario: state.scenario.map(s => ({ speaker: s.speaker, emotion: s.emotion, text: s.text })),
          characters: JSON.parse(JSON.stringify(state.characters))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) { console.warn('localStorage 保存失敗', e); }
    }, 1000);
  }
  watch(() => state.scenario, saveState, { deep: true });
  watch(() => state.characters, saveState, { deep: true });

  onMounted(() => { setTimeout(play, 200); });

  function play() { playScenario(state); }

  return {
    appName, activeTab, state, EMOTION_LABEL, play,
    ...useCharacters(state),
    ...useScenario(state),
    ...useExport(state, activeTab)
  };
}

createApp({ setup: setupApp }).mount('#app');
