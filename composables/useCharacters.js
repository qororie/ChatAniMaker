import { reactive, ref } from '../lib/vue.esm-browser.js';

export function useCharacters(state) {
  const showCharForm = ref(false);

  const newChar = reactive({
    id: '', name: '', facing: 'left', iconUrl: '',
    color: '#888888', bubbleFill: '#ffffff', bubbleStroke: '#000000',
    bubbleNoStroke: false, promptColor: '#000000', textColor: '#000000'
  });

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
      if (state.scenario[i].speaker === charId) state.scenario.splice(i, 1);
    }
    delete state.characters[charId];
  }

  return {
    showCharForm, newChar,
    openCharForm, closeCharForm, submitNewChar, handleIconUpload, deleteCharacter
  };
}
