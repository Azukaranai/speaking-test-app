const appEl = document.getElementById('app');

const LOG_STORAGE_KEY = 'speaking-log-v1';
const THEME_STORAGE_KEY = 'speaking-theme-v1';
const PLAYBACK_RATE_BASE = 0.6;
const APP_VERSION = '0.1.14';

const state = {
  dialogues: [],
  currentDialogueId: null,
  screen: 'script',
  displayMode: 'all',
  roleFilter: 'both',
  voice: 'f',
  rate: '100',
  playbackRate: 1,
  continuous: true,
  continuousGap: 0,
  roleplayRole: 'A',
  autoScroll: true,
  hints: {},
  logs: loadLogs(),
  theme: getInitialTheme(),
  playing: null,
  lastPlayed: null,
  playQueue: [],
  overlayCollapsed: false,
  controlPanelCollapsed: false,
  allowAnimation: true,
  error: null,
};

applyTheme(state.theme);

const audioPlayer = new Audio();
audioPlayer.preload = 'auto';
let nextLineTimer = null;
audioPlayer.addEventListener('loadedmetadata', () => {
  applyPlaybackRateForUrl(audioPlayer.currentSrc || audioPlayer.src);
});
audioPlayer.addEventListener('ended', () => {
  if (state.playQueue.length > 0) {
    playNextFromQueue();
    return;
  }
  state.playQueue = [];
  if (state.continuous && state.playing) {
    const dialogue = getDialogue(state.playing.dialogueId);
    const nextLineI = dialogue ? getNextLineI(dialogue, state.playing.lineI) : null;
    if (nextLineI) {
      scheduleNextLine(state.playing.dialogueId, nextLineI);
      return;
    }
  }
  state.playing = null;
  render();
});

audioPlayer.addEventListener('play', () => {
  render();
});

audioPlayer.addEventListener('pause', () => {
  render();
});

audioPlayer.addEventListener('error', () => {
  state.playQueue = [];
  state.playing = null;
  render();
});

appEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;

  switch (action) {
    case 'set-screen':
      state.screen = button.dataset.value;
      clearNextLineTimer();
      render();
      return;
    case 'set-display':
      state.displayMode = button.dataset.value;
      render();
      return;
    case 'set-role-filter':
      state.roleFilter = button.dataset.value;
      render();
      return;
    case 'set-voice':
      state.voice = button.dataset.value;
      render();
      return;
    case 'toggle-continuous':
      state.continuous = !state.continuous;
      if (!state.continuous) {
        clearNextLineTimer();
      }
      render();
      return;
    case 'stop-playback':
      stopPlayback();
      return;
    case 'overlay-play':
      overlayPlay();
      return;
    case 'overlay-pause':
      overlayPause();
      return;
    case 'overlay-restart':
      overlayRestart();
      return;
    case 'toggle-theme':
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, state.theme);
      applyTheme(state.theme);
      render();
      return;
    case 'toggle-overlay':
      state.overlayCollapsed = !state.overlayCollapsed;
      render();
      return;
    case 'toggle-auto-scroll':
      state.autoScroll = !state.autoScroll;
      render();
      if (state.autoScroll) {
        scrollToCurrentLine();
      }
      return;
    case 'toggle-control-panel':
      state.controlPanelCollapsed = !state.controlPanelCollapsed;
      render();
      return;
    case 'set-roleplay-role':
      state.roleplayRole = button.dataset.value;
      render();
      return;
    case 'play-line':
      playLine(button.dataset.dialogueId, Number(button.dataset.lineI));
      return;
    case 'hint-step':
      stepHint(button.dataset.dialogueId, Number(button.dataset.lineI));
      return;
    case 'mark-ok':
      updateLog(button.dataset.dialogueId, Number(button.dataset.lineI), 'ok');
      render();
      return;
    case 'mark-ng':
      updateLog(button.dataset.dialogueId, Number(button.dataset.lineI), 'ng');
      render();
      return;
    case 'adjust-ok':
      adjustLogCounts(
        button.dataset.dialogueId,
        Number(button.dataset.lineI),
        Number(button.dataset.delta),
        0
      );
      render();
      return;
    case 'adjust-ng':
      adjustLogCounts(
        button.dataset.dialogueId,
        Number(button.dataset.lineI),
        0,
        Number(button.dataset.delta)
      );
      render();
      return;
    default:
      return;
  }
});

appEl.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('[data-action="select-dialogue"]')) {
    const value = target.value;
    state.currentDialogueId = value;
    clearNextLineTimer();
    render();
    precacheDialogueAudio(value);
  }
});

appEl.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('[data-action="set-gap"]')) {
    state.continuousGap = Number(target.value);
    updateRangeLabel(target, formatGap(state.continuousGap));
    return;
  }
  if (target.matches('[data-action="set-playback-rate"]')) {
    state.playbackRate = Number(target.value);
    applyPlaybackRateForUrl(audioPlayer.currentSrc || audioPlayer.src);
    updateRangeLabel(target, formatPlaybackRate(state.playbackRate));
  }
});

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (error) {
    // Ignore storage errors and fall back to system preference.
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
}

init();

async function init() {
  try {
    const response = await fetch('/data/dialogues.json');
    if (!response.ok) {
      throw new Error('Failed to load dialogues');
    }
    const data = await response.json();
    state.dialogues = Array.isArray(data.dialogues) ? data.dialogues : [];
    if (!state.currentDialogueId && state.dialogues.length > 0) {
      state.currentDialogueId = state.dialogues[0].dialogueId;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to load dialogues';
  }

  render();
  registerServiceWorker();
  if (state.currentDialogueId) {
    precacheDialogueAudio(state.currentDialogueId);
  }
}

function render() {
  const dialogue = getDialogue(state.currentDialogueId);
  const bodyContent = state.error
    ? `<div class="panel error">${escapeHtml(state.error)}</div>`
    : dialogue
    ? renderScreen(dialogue)
    : '<div class="panel">会話データがありません。</div>';
  const appClass = state.allowAnimation ? 'app animate' : 'app';

  appEl.innerHTML = `
    <div class="${appClass}">
      <header class="app-header">
        <div class="title-block">
          <div class="eyebrow">中国語スピーキングスタジオ</div>
          <h1>中国語スピーキング対策</h1>
          <p class="subtitle">音声を反復し、ロールプレイで口に慣らす。</p>
        </div>
        <div class="header-controls">
          <div class="nav">
            ${renderTabButton('script', '台本')}
            ${renderTabButton('roleplay', 'ロールプレイ')}
          </div>
          ${renderThemeToggle()}
        </div>
      </header>

      <section class="control-panel" data-collapsed="${state.controlPanelCollapsed}">
        <div class="control-panel-head">
          <span>設定</span>
          <button
            class="control-panel-toggle"
            data-action="toggle-control-panel"
            aria-label="${state.controlPanelCollapsed ? '設定を展開' : '設定を収納'}"
            title="${state.controlPanelCollapsed ? '設定を展開' : '設定を収納'}"
          >
            ${state.controlPanelCollapsed ? iconChevronDown() : iconChevronUp()}
          </button>
        </div>
        <div class="control-panel-body">
          ${renderControls(dialogue)}
        </div>
      </section>

      <main class="content">
        ${bodyContent}
      </main>

      <footer class="app-footer">
        <span>クレジット: Tadamichi Azukari</span>
        <span>連絡先: tadamichi.azukari@gmail.com</span>
        <span>バージョン: ${APP_VERSION}</span>
      </footer>
    </div>
    ${renderOverlayControls()}
  `;
  state.allowAnimation = false;
}

function renderScreen(dialogue) {
  if (state.screen === 'roleplay') {
    return renderRoleplay(dialogue);
  }
  return renderScript(dialogue);
}

function renderControls(dialogue) {
  if (!dialogue) return '';

  const dialogueOptions = state.dialogues
    .map(
      (item) =>
        `<option value="${escapeHtml(item.dialogueId)}" ${
          item.dialogueId === state.currentDialogueId ? 'selected' : ''
        }>${escapeHtml(item.title)}</option>`
    )
    .join('');

  const dialogueSelect = `
    <label class="control-group">
      <span>会話</span>
      <select data-action="select-dialogue">
        ${dialogueOptions}
      </select>
    </label>
  `;

  const voiceControls = `
    <div class="control-group">
      <span>音声</span>
      <div class="chip-row">
        ${renderChip('set-voice', 'f', '女性', state.voice)}
        ${renderChip('set-voice', 'm', '男性', state.voice)}
        ${renderChip('set-voice', 'alt', '交互', state.voice)}
      </div>
    </div>
    <div class="control-group">
      <span>再生速度</span>
      <div class="range-row">
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.05"
          value="${Number(state.playbackRate || 1)}"
          data-action="set-playback-rate"
        />
        <span class="range-value">${formatPlaybackRate(state.playbackRate)}</span>
      </div>
    </div>
  `;
  const gapValue = Number(state.continuousGap || 0);
  const gapLabel = formatGap(gapValue);
  const displayControls = `
    <div class="control-group">
      <span>表示</span>
      <div class="chip-row">
        ${renderChip('set-display', 'zh', 'ZH', state.displayMode)}
        ${renderChip('set-display', 'zh-pinyin', 'ZH+Pin', state.displayMode)}
        ${renderChip('set-display', 'zh-ja', 'ZH+JA', state.displayMode)}
        ${renderChip('set-display', 'all', 'ALL', state.displayMode)}
      </div>
    </div>
  `;
  const continuousControl = `
    <div class="control-group">
      <span>連続再生</span>
      <button class="chip ${state.continuous ? 'active' : ''}" data-action="toggle-continuous">
        ${state.continuous ? 'オン' : 'オフ'}
      </button>
    </div>
  `;
  const autoScrollControl = `
    <div class="control-group">
      <span>自動スクロール</span>
      <button class="chip ${state.autoScroll ? 'active' : ''}" data-action="toggle-auto-scroll">
        ${state.autoScroll ? 'オン' : 'オフ'}
      </button>
    </div>
  `;
  const gapControl = `
    <div class="control-group">
      <span>間隔</span>
      <div class="range-row">
        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value="${gapValue}"
          data-action="set-gap"
          ${state.continuous ? '' : 'disabled'}
        />
        <span class="range-value">${gapLabel}</span>
      </div>
    </div>
  `;

  if (state.screen === 'roleplay') {
    return `
      ${dialogueSelect}
      ${displayControls}
      <div class="control-group">
        <span>自分の役</span>
        <div class="chip-row">
          ${renderChip('set-roleplay-role', 'A', 'A', state.roleplayRole)}
          ${renderChip('set-roleplay-role', 'B', 'B', state.roleplayRole)}
        </div>
      </div>
      ${continuousControl}
      ${autoScrollControl}
      ${gapControl}
      ${voiceControls}
    `;
  }

  return `
    ${dialogueSelect}
    ${displayControls}
    <div class="control-group">
      <span>役</span>
      <div class="chip-row">
        ${renderChip('set-role-filter', 'both', 'A+B', state.roleFilter)}
        ${renderChip('set-role-filter', 'A', 'Aのみ', state.roleFilter)}
        ${renderChip('set-role-filter', 'B', 'Bのみ', state.roleFilter)}
      </div>
    </div>
    ${continuousControl}
    ${autoScrollControl}
    ${gapControl}
    ${voiceControls}
  `;
}

function renderScript(dialogue) {
  const lines = dialogue.lines.filter((line) => {
    if (state.roleFilter === 'both') return true;
    return line.role === state.roleFilter;
  });

  if (lines.length === 0) {
    return '<div class="panel">該当する行がありません。</div>';
  }

  return `
    <div class="list">
      ${lines
        .map((line, index) => {
          const lineNo = pad3(line.i);
          const lineKey = makeLineKey(dialogue.dialogueId, line.i);
          const textHtml = renderScriptLineText(line);
          const isPlaying =
            state.playing &&
            state.playing.dialogueId === dialogue.dialogueId &&
            state.playing.lineI === line.i;
          const stats = getLog(dialogue.dialogueId, line.i);
          return `
            <article class="line-card ${isPlaying ? 'playing' : ''}" data-line-key="${escapeHtml(
              lineKey
            )}" style="--delay:${index * 0.04}s">
              <div class="line-meta">
                <span class="badge role-${line.role}">${escapeHtml(line.role)}</span>
                <span class="line-no">${lineNo}</span>
              </div>
              <div class="line-text">
                ${textHtml}
              </div>
              <div class="line-actions">
                <button class="primary" data-action="play-line" data-dialogue-id="${escapeHtml(
                  dialogue.dialogueId
                )}" data-line-i="${line.i}">再生</button>
                <div class="stats">
                  <span>OK ${stats.okCount}</span>
                  <span>NG ${stats.ngCount}</span>
                </div>
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderRoleplay(dialogue) {
  if (!dialogue.lines.length) {
    return '<div class="panel">該当する行がありません。</div>';
  }

  return `
    <div class="roleplay">
      ${dialogue.lines
        .map((line, index) => {
          const lineNo = pad3(line.i);
          const lineKey = makeLineKey(dialogue.dialogueId, line.i);
          const isSelf = line.role === state.roleplayRole;
          const log = getLog(dialogue.dialogueId, line.i);
          const hintLevel = state.hints[makeLineKey(dialogue.dialogueId, line.i)] || 0;
          const hintLabel = hintLevel === 0 ? 'ヒント' : hintLevel === 3 ? 'ヒント戻す' : 'ヒント+';
          const hintText =
            hintLevel === 0
              ? 'ヒント: なし'
              : hintLevel === 1
              ? 'ヒント: 和訳'
              : hintLevel === 2
              ? 'ヒント: 和訳 + ピンイン'
              : 'ヒント: 全文';
          const isPlaying =
            state.playing &&
            state.playing.dialogueId === dialogue.dialogueId &&
            state.playing.lineI === line.i;

          if (!isSelf) {
            return `
              <article class="line-card opponent ${isPlaying ? 'playing' : ''}" data-line-key="${escapeHtml(
                lineKey
              )}" style="--delay:${index * 0.04}s">
                <div class="line-meta">
                  <span class="badge role-${line.role}">${escapeHtml(line.role)}</span>
                  <span class="line-no">${lineNo}</span>
                  <span class="tag">相手</span>
                </div>
                <div class="line-text">
                  ${renderScriptLineText(line)}
                </div>
                <div class="line-actions">
                  <div class="action-group">
                    <div class="action-title">相手の音声</div>
                    <button class="primary" data-action="play-line" data-dialogue-id="${escapeHtml(
                      dialogue.dialogueId
                    )}" data-line-i="${line.i}">再生</button>
                  </div>
                  <div class="stats">
                    <span>OK ${log.okCount}</span>
                    <span>NG ${log.ngCount}</span>
                  </div>
                </div>
              </article>
            `;
          }

          const hintHtml = [
            hintLevel >= 1 ? `<div class="line-ja">${escapeHtml(line.ja)}</div>` : '',
            hintLevel >= 2 ? `<div class="line-pinyin">${escapeHtml(line.pinyin)}</div>` : '',
            hintLevel >= 3 ? `<div class="line-zh">${escapeHtml(line.zh)}</div>` : '',
          ].join('');

          return `
            <article class="line-card self ${isPlaying ? 'playing' : ''}" data-line-key="${escapeHtml(
              lineKey
            )}" style="--delay:${index * 0.04}s">
              <div class="line-meta">
                <span class="badge role-${line.role}">${escapeHtml(line.role)}</span>
                <span class="line-no">${lineNo}</span>
                <span class="tag">自分の番</span>
              </div>
              <div class="line-text">
                <div class="hint">${hintText}</div>
                ${hintHtml || '<div class="line-placeholder">まだ開示されていません</div>'}
              </div>
              <div class="line-actions">
                <div class="action-group">
                  <div class="action-title">ヒント</div>
                  <button class="hint-button" data-action="hint-step" data-dialogue-id="${escapeHtml(
                    dialogue.dialogueId
                  )}" data-line-i="${line.i}">${hintLabel}</button>
                </div>
                <div class="action-group">
                  <div class="action-title">自己評価</div>
                  <div class="segment">
                    <button class="segment-button primary" data-action="mark-ok" data-dialogue-id="${escapeHtml(
                      dialogue.dialogueId
                    )}" data-line-i="${line.i}">言えた</button>
                    <button class="segment-button ghost" data-action="mark-ng" data-dialogue-id="${escapeHtml(
                      dialogue.dialogueId
                    )}" data-line-i="${line.i}">言えなかった</button>
                  </div>
                  <div class="adjust-row">
                    <span class="adjust-label">OK</span>
                    <button class="chip small" data-action="adjust-ok" data-dialogue-id="${escapeHtml(
                      dialogue.dialogueId
                    )}" data-line-i="${line.i}" data-delta="-1">-</button>
                    <button class="chip small" data-action="adjust-ok" data-dialogue-id="${escapeHtml(
                      dialogue.dialogueId
                    )}" data-line-i="${line.i}" data-delta="1">+</button>
                    <span class="adjust-value">${log.okCount}</span>
                  </div>
                  <div class="adjust-row">
                    <span class="adjust-label">NG</span>
                    <button class="chip small" data-action="adjust-ng" data-dialogue-id="${escapeHtml(
                      dialogue.dialogueId
                    )}" data-line-i="${line.i}" data-delta="-1">-</button>
                    <button class="chip small" data-action="adjust-ng" data-dialogue-id="${escapeHtml(
                      dialogue.dialogueId
                    )}" data-line-i="${line.i}" data-delta="1">+</button>
                    <span class="adjust-value">${log.ngCount}</span>
                  </div>
                </div>
                <div class="action-group">
                  <div class="action-title">答え合わせ</div>
                  <button class="ghost" data-action="play-line" data-dialogue-id="${escapeHtml(
                    dialogue.dialogueId
                  )}" data-line-i="${line.i}">音声で確認</button>
                </div>
                <div class="stats">
                  <span>OK ${log.okCount}</span>
                  <span>NG ${log.ngCount}</span>
                </div>
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderScriptLineText(line) {
  const zh = `<div class="line-zh">${escapeHtml(line.zh)}</div>`;
  const pinyin = `<div class="line-pinyin">${escapeHtml(line.pinyin)}</div>`;
  const ja = `<div class="line-ja">${escapeHtml(line.ja)}</div>`;

  switch (state.displayMode) {
    case 'zh-pinyin':
      return zh + pinyin;
    case 'zh-ja':
      return zh + ja;
    case 'all':
      return zh + pinyin + ja;
    case 'zh':
    default:
      return zh;
  }
}

function renderTabButton(value, label) {
  return `
    <button class="tab ${state.screen === value ? 'active' : ''}" data-action="set-screen" data-value="${value}">
      ${label}
    </button>
  `;
}

function renderThemeToggle() {
  const label = state.theme === 'dark' ? 'ライト' : 'ダーク';
  const pressed = state.theme === 'dark' ? 'true' : 'false';
  return `
    <button class="theme-toggle" data-action="toggle-theme" aria-pressed="${pressed}">
      ${label}
    </button>
  `;
}

function iconPlay() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="8,5 19,12 8,19" fill="currentColor" />
    </svg>
  `;
}

function iconPause() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  `;
}

function iconStop() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" />
    </svg>
  `;
}

function iconRestart() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 13a6 6 0 1 0 2-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <polyline points="6 4 8 6 4 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function iconChevronDown() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function iconChevronUp() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="6 15 12 9 18 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function renderOverlayControls() {
  const target = state.playing || state.lastPlayed;
  const activeDialogue = getDialogue(state.currentDialogueId);
  const firstLineI = getFirstLineI(activeDialogue);
  const isPlaying = Boolean(state.playing && !audioPlayer.paused);
  const playAction = isPlaying ? 'overlay-pause' : 'overlay-play';
  const playLabel = isPlaying ? '一時停止' : '再生';
  const restartDisabled = firstLineI === null;
  const stopDisabled = !target && !audioPlayer.src;
  const status = target ? formatLineLabel(target.dialogueId, target.lineI) : '未再生';
  const isCollapsed = state.overlayCollapsed;
  const toggleLabel = isCollapsed ? '展開' : '最小化';
  const playIcon = isPlaying ? iconPause() : iconPlay();
  const restartIcon = iconRestart();
  const stopIcon = iconStop();
  const toggleIcon = isCollapsed ? iconChevronUp() : iconChevronDown();

  return `
    <div class="overlay-controls" data-collapsed="${isCollapsed}">
      <div class="overlay-head">
        <div class="overlay-status">
          <span class="overlay-label">再生中</span>
          <span class="overlay-value">${escapeHtml(status)}</span>
        </div>
        <button
          class="overlay-toggle"
          data-action="toggle-overlay"
          aria-label="${toggleLabel}"
          title="${toggleLabel}"
        >
          ${toggleIcon}
        </button>
      </div>
      <div class="overlay-body">
        <div class="overlay-buttons">
          <button
            class="overlay-button primary"
            data-action="${playAction}"
            aria-label="${playLabel}"
            title="${playLabel}"
            ${!target ? 'disabled' : ''}
          >
            ${playIcon}
          </button>
          <button
            class="overlay-button restart"
            data-action="overlay-restart"
            aria-label="最初から"
            title="最初から"
            ${restartDisabled ? 'disabled' : ''}
          >
            ${restartIcon}
          </button>
          <button
            class="overlay-button stop"
            data-action="stop-playback"
            aria-label="停止"
            title="停止"
            ${stopDisabled ? 'disabled' : ''}
          >
            ${stopIcon}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderChip(action, value, label, activeValue) {
  const isActive = value === activeValue;
  return `
    <button class="chip ${isActive ? 'active' : ''}" data-action="${action}" data-value="${value}">
      ${label}
    </button>
  `;
}

function playLine(dialogueId, lineI) {
  clearNextLineTimer();
  const dialogue = getDialogue(dialogueId);
  if (!dialogue) return;
  const line = dialogue.lines.find((item) => item.i === lineI);
  if (!line) return;

  const selectedVoice = getVoiceForLine(line.i);
  const urls = [getAudioUrl(dialogue.dialogueId, line.i, selectedVoice, state.rate)];
  if (shouldPlayJapanese() && line.ja) {
    urls.push(getAudioUrl(dialogue.dialogueId, line.i, selectedVoice, state.rate, 'ja'));
  }

  state.playQueue = urls.slice();
  state.playing = { dialogueId: dialogue.dialogueId, lineI: line.i };
  state.lastPlayed = { dialogueId: dialogue.dialogueId, lineI: line.i };
  audioPlayer.pause();
  playNextFromQueue();
  render();
  if (state.autoScroll) {
    scrollToLine(dialogue.dialogueId, line.i);
  }
}

function playNextFromQueue() {
  const nextUrl = state.playQueue.shift();
  if (!nextUrl) {
    return;
  }
  audioPlayer.src = nextUrl;
  applyPlaybackRateForUrl(nextUrl);
  audioPlayer.currentTime = 0;
  audioPlayer.play().catch(() => {});
}

function shouldPlayJapanese() {
  return state.displayMode === 'zh-ja' || state.displayMode === 'all';
}

function getVoiceForLine(lineI) {
  if (state.voice !== 'alt') return state.voice;
  const index = Number(lineI);
  if (!Number.isFinite(index)) return 'f';
  return index % 2 === 1 ? 'f' : 'm';
}

function scrollToLine(dialogueId, lineI, behavior = 'smooth') {
  const key = makeLineKey(dialogueId, lineI);
  const selectorKey =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(key) : key;
  const target = document.querySelector(`[data-line-key="${selectorKey}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
}

function scrollToCurrentLine() {
  const target = state.playing || state.lastPlayed;
  if (!target) return;
  scrollToLine(target.dialogueId, target.lineI);
}

function getFirstLineI(dialogue) {
  if (!dialogue || !Array.isArray(dialogue.lines) || dialogue.lines.length === 0) return null;
  return dialogue.lines.reduce((min, line) => Math.min(min, Number(line.i)), Number(dialogue.lines[0].i));
}

function scheduleNextLine(dialogueId, lineI) {
  const delayMs = Math.max(0, Number(state.continuousGap || 0) * 1000);
  clearNextLineTimer();
  if (delayMs === 0) {
    playLine(dialogueId, lineI);
    return;
  }
  nextLineTimer = setTimeout(() => playLine(dialogueId, lineI), delayMs);
}

function clearNextLineTimer() {
  if (nextLineTimer) {
    clearTimeout(nextLineTimer);
    nextLineTimer = null;
  }
}

function getNextLineI(dialogue, currentLineI) {
  const index = dialogue.lines.findIndex((line) => line.i === currentLineI);
  if (index < 0) return null;
  for (let i = index + 1; i < dialogue.lines.length; i += 1) {
    const line = dialogue.lines[i];
    if (state.roleFilter === 'both' || line.role === state.roleFilter) {
      return line.i;
    }
  }
  return null;
}

function getAudioUrl(dialogueId, lineI, voice, rate, lang = 'zh') {
  const lineNo = pad3(lineI);
  const suffix = lang === 'ja' ? '__ja' : '';
  return `/audio/${dialogueId}/${lineNo}__${voice}__r${rate}${suffix}.mp3`;
}

function overlayPlay() {
  if (state.playing && audioPlayer.src && audioPlayer.paused) {
    audioPlayer.play().catch(() => {});
    return;
  }
  if (state.lastPlayed) {
    playLine(state.lastPlayed.dialogueId, state.lastPlayed.lineI);
  }
}

function overlayPause() {
  if (!audioPlayer.paused) {
    audioPlayer.pause();
  }
}

function overlayRestart() {
  const dialogueId =
    state.currentDialogueId ||
    (state.playing ? state.playing.dialogueId : null) ||
    (state.lastPlayed ? state.lastPlayed.dialogueId : null);
  if (!dialogueId) return;
  const dialogue = getDialogue(dialogueId);
  const firstLineI = getFirstLineI(dialogue);
  if (firstLineI === null) return;
  playLine(dialogueId, firstLineI);
}

function stopPlayback() {
  clearNextLineTimer();
  state.playQueue = [];
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  state.playing = null;
  render();
}

function stepHint(dialogueId, lineI) {
  const key = makeLineKey(dialogueId, lineI);
  const current = state.hints[key] || 0;
  state.hints[key] = (current + 1) % 4;
  render();
}

function loadLogs() {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function saveLogs() {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(state.logs));
}

function getLog(dialogueId, lineI) {
  const key = makeLineKey(dialogueId, lineI);
  return {
    okCount: 0,
    ngCount: 0,
    lastStudiedAt: null,
    ...(state.logs[key] || {}),
  };
}

function updateLog(dialogueId, lineI, result) {
  if (result === 'ok') {
    adjustLogCounts(dialogueId, lineI, 1, 0);
  } else {
    adjustLogCounts(dialogueId, lineI, 0, 1);
  }
}

function adjustLogCounts(dialogueId, lineI, okDelta, ngDelta) {
  const key = makeLineKey(dialogueId, lineI);
  const entry = getLog(dialogueId, lineI);
  entry.okCount = Math.max(0, entry.okCount + okDelta);
  entry.ngCount = Math.max(0, entry.ngCount + ngDelta);
  entry.lastStudiedAt = new Date().toISOString();
  state.logs[key] = entry;
  saveLogs();
}

function makeLineKey(dialogueId, lineI) {
  return `${dialogueId}_${lineI}`;
}

function getDialogue(dialogueId) {
  return state.dialogues.find((dialogue) => dialogue.dialogueId === dialogueId) || null;
}

function formatLineLabel(dialogueId, lineI) {
  const dialogue = getDialogue(dialogueId);
  if (!dialogue) return '';
  const line = dialogue.lines.find((item) => item.i === lineI);
  if (!line) return dialogue.title || '';
  return `${dialogue.title} #${pad3(line.i)} ${line.role}`;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function formatGap(value) {
  const num = Number(value || 0);
  return `${num.toFixed(1)}s`;
}

function formatPlaybackRate(value) {
  const num = Number(value || 1);
  return `${num.toFixed(2)}x`;
}

function applyPlaybackRate(value) {
  const rate = toActualPlaybackRate(value);
  audioPlayer.playbackRate = rate;
  audioPlayer.defaultPlaybackRate = rate;
}

function applyPlaybackRateForUrl(url) {
  if (isJapaneseAudio(url)) {
    audioPlayer.playbackRate = PLAYBACK_RATE_BASE;
    audioPlayer.defaultPlaybackRate = PLAYBACK_RATE_BASE;
    return;
  }
  applyPlaybackRate(state.playbackRate);
}

function isJapaneseAudio(url) {
  return typeof url === 'string' && url.includes('__ja');
}

function toActualPlaybackRate(value) {
  const uiRate = Number(value || 1);
  return Number((uiRate * PLAYBACK_RATE_BASE).toFixed(3));
}

function updateRangeLabel(inputEl, text) {
  const row = inputEl.closest('.range-row');
  if (!row) return;
  const label = row.querySelector('.range-value');
  if (label) {
    label.textContent = text;
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

async function precacheDialogueAudio(dialogueId) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const dialogue = getDialogue(dialogueId);
    if (!dialogue || !registration.active) return;
    const urls = buildAudioList(dialogue);
    registration.active.postMessage({ type: 'PRECACHE_AUDIO', urls });
  } catch (error) {
    // Ignore cache errors; playback will still use network.
  }
}

function buildAudioList(dialogue) {
  const urls = [];
  const rates = ['100', '085'];
  const voices = ['f', 'm'];

  dialogue.lines.forEach((line) => {
    const lineNo = pad3(line.i);
    voices.forEach((voice) => {
      rates.forEach((rate) => {
        urls.push(`/audio/${dialogue.dialogueId}/${lineNo}__${voice}__r${rate}.mp3`);
        if (line.ja) {
          urls.push(`/audio/${dialogue.dialogueId}/${lineNo}__${voice}__r${rate}__ja.mp3`);
        }
      });
    });
  });

  return urls;
}
