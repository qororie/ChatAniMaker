import { downloadBlob } from '../exporter.js';

const REQUIRED_CHAR_FIELDS = ['name', 'facing', 'bubbleFill', 'bubbleStroke', 'promptColor', 'textColor', 'iconUrl'];

export function validateImportData(data) {
  if (!data || typeof data !== 'object') throw new Error('JSONの形式が正しくありません');

  if (data.characters) {
    if (typeof data.characters !== 'object' || Array.isArray(data.characters))
      throw new Error('characters の形式が正しくありません');
    for (const [id, char] of Object.entries(data.characters)) {
      for (const field of REQUIRED_CHAR_FIELDS) {
        if (!(field in char))
          throw new Error(`キャラ "${id}" に必須フィールド "${field}" がありません`);
      }
    }
  }

  if (data.scenario) {
    if (!Array.isArray(data.scenario))
      throw new Error('scenario は配列である必要があります');
    for (const [i, msg] of data.scenario.entries()) {
      if (!msg.speaker || msg.text === undefined || !msg.emotion)
        throw new Error(`セリフ ${i + 1} 行目に必須フィールドがありません`);
    }
  }
}

export function useScenario(state) {
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

  function downloadProject() {
    try {
      const blob = new Blob(
        [JSON.stringify({ scenario: state.scenario, characters: state.characters }, null, 2)],
        { type: 'application/json' }
      );
      downloadBlob(blob, 'chat-anime-project.json');
    } catch (e) {
      console.error(e);
      alert('ダウンロードに失敗しました');
    }
  }

  function handleScenarioOption(e) {
    const action = e.target.value;
    e.target.value = '';
    if (action === 'export') {
      downloadProject();
    } else if (action === 'import') {
      document.getElementById('import-json').click();
    }
  }

  function importProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        validateImportData(data);
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
        alert('読み込み失敗: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  return {
    countWeightedLength,
    addMessage, deleteMessage, moveMessage,
    handleScenarioOption, importProject
  };
}
