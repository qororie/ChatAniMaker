import { TIMING } from './data.js';

export const wait = (ms) => new Promise(r => setTimeout(r, ms));

export async function typewriter(message) {
  message.displayText = '';
  for (const char of message.text) {
    message.displayText += char;
    await wait(TIMING.charDelay);
  }
}

export async function playScenario(state) {
  if (state.isPlaying) return;
  state.isPlaying = true;

  state.visibleCount = 0;
  state.scenario.forEach(msg => {
    msg.displayText = '';
    msg.currentEmotion = '';
  });

  await wait(TIMING.initialDelay);

  for (let i = 0; i < state.scenario.length; i++) {
    const msg = state.scenario[i];
    state.visibleCount = i + 1;

    await wait(TIMING.iconAppear);
    await wait(TIMING.bubbleAppear);

    msg.currentEmotion = msg.emotion;
    await typewriter(msg);
    msg.currentEmotion = '';

    await wait(TIMING.afterText);
  }

  state.isPlaying = false;
}

export function renderStateAtTime(state, t) {
  let elapsed = TIMING.initialDelay;
  state.visibleCount = 0;

  for (let i = 0; i < state.scenario.length; i++) {
    const msg = state.scenario[i];
    const charCount = Array.from(msg.text || '').length;
    const msgDuration = TIMING.iconAppear + TIMING.bubbleAppear + (charCount * TIMING.charDelay) + TIMING.afterText;

    msg.exportStyle = {};

    if (t < elapsed) {
      msg.displayText = '';
      msg.currentEmotion = '';
      continue;
    }

    state.visibleCount = i + 1;
    const msgT = t - elapsed;

    if (msgT >= TIMING.iconAppear) {
      const iconElapsedSec = ((msgT - TIMING.iconAppear) / 1000).toFixed(3);
      msg.exportStyle = {
        animationDelay: `-${iconElapsedSec}s`,
        animationPlayState: 'paused'
      };
    }

    if (msgT < TIMING.iconAppear + TIMING.bubbleAppear) {
      msg.displayText = '';
      msg.currentEmotion = msg.emotion;
    } else {
      const textT = msgT - (TIMING.iconAppear + TIMING.bubbleAppear);
      const charsToShow = Math.floor(textT / TIMING.charDelay);
      if (charsToShow < charCount) {
        msg.displayText = Array.from(msg.text || '').slice(0, charsToShow).join('');
        msg.currentEmotion = msg.emotion;
      } else {
        msg.displayText = msg.text;
        msg.currentEmotion = '';
      }
    }
    elapsed += msgDuration;
  }
}

export function calcTotalMs(scenario) {
  let totalMs = TIMING.initialDelay;
  for (const step of scenario) {
    const charCount = Array.from(step.text || '').length;
    totalMs += TIMING.iconAppear + TIMING.bubbleAppear
      + (charCount * TIMING.charDelay) + TIMING.afterText;
  }
  return totalMs + 500;
}
