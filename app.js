// --- 1. AUDIO ENGINE (TONE.JS MULTI-TONE SYNTHESIZER) ---
let synth;
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function initAudio(toneType = 'rhodes') {
  if (synth) synth.dispose();
  
  const presets = {
    rhodes: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.8, sustain: 0.3, release: 1.5 }
    },
    grand: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 1.2, sustain: 0.2, release: 1.8 }
    },
    pad: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.4, decay: 0.5, sustain: 0.8, release: 2.0 }
    },
    organ: {
      oscillator: { type: 'square' },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.9, release: 0.3 }
    }
  };

  synth = new Tone.PolySynth(Tone.Synth, presets[toneType]).toDestination();
  synth.volume.value = -6;
}

async function changeTone(toneType) {
  await Tone.start();
  initAudio(toneType);
}

async function playMidiNotes(midiArray, duration = '2n') {
  if (!synth) initAudio();
  await Tone.start();
  const freqs = midiArray.map(m => Tone.Frequency(m, 'midi').toNote());
  synth.triggerAttackRelease(freqs, duration);
}

// --- 2. TRANSPOSABLE JAZZ VOICING LIBRARY (LOCALSTORAGE) ---
const defaultVoicings = [
  { name: 'Maj9 (Rootless)', intervals: new Array(4, 7, 11, 14) },
  { name: 'Maj13 (#11)', intervals: new Array(4, 11, 14, 18, 21) },
  { name: 'm9 (So What)', intervals: new Array(3, 8, 13, 18, 22) },
  { name: 'm11 (Neo-Soul)', intervals: new Array(3, 7, 10, 14, 17) },
  { name: '13 (Bill Evans)', intervals: new Array(4, 10, 14, 21) },
  { name: '7alt (#9 #5)', intervals: new Array(4, 8, 10, 15) },
  { name: '7b9 (Dim)', intervals: new Array(4, 7, 10, 13, 21) },
  { name: 'm7b5 (Half-Dim)', intervals: new Array(3, 6, 10, 14) },
  { name: '6/9', intervals: new Array(4, 9, 14, 19) },
  { name: 'Sus13', intervals: new Array(5, 10, 14, 21) }
];

let voicingLibrary = JSON.parse(localStorage.getItem('jazzVoicings')) || defaultVoicings;

function saveLibrary() {
  localStorage.setItem('jazzVoicings', JSON.stringify(voicingLibrary));
}

// --- 3. STATE & SPREADSHEET LOGIC ---
let activeKeys = new Set();
let selectedCellIndex = 0;
let gridCells = Array(16).fill(null);
let isPlaying = false;
let playInterval = null;

function midiToName(midi) {
  const note = noteNames[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function renderSpreadsheet() {
  const container = document.getElementById('spreadsheet');
  const cols = parseInt(document.getElementById('time-sig').value);
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  container.innerHTML = '';

  gridCells.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = `cell ${idx === selectedCellIndex ? 'selected' : ''}`;
    div.id = `cell-${idx}`;
    div.onclick = () => selectCell(idx);

    if (cell) {
      div.innerHTML = `
        <div class="cell-chord">${cell.label}</div>
        <div class="cell-notes">${cell.midi.map(m => noteNames[m % 12]).join('-')}</div>
      `;
    } else {
      div.innerHTML = `<div class="cell-notes">Beat ${(idx % cols) + 1}</div>`;
    }
    container.appendChild(div);
  });
}

function selectCell(idx) {
  selectedCellIndex = idx;
  renderSpreadsheet();
  const cell = gridCells[idx];
  if (cell && cell.midi.length > 0) {
    activeKeys = new Set(cell.midi);
    syncKeyboardUI();
    playMidiNotes(cell.midi);
  }
}

function applyVoicingToSelectedCell(voicing) {
  const rootOffset = parseInt(document.getElementById('root-key').value);
  const rootName = noteNames[rootOffset];
  const baseMidi = 48 + rootOffset;
  const transposedMidi = voicing.intervals.map(interval => baseMidi + interval);

  gridCells[selectedCellIndex] = {
    label: `${rootName} ${voicing.name}`,
    midi: transposedMidi
  };

  activeKeys = new Set(transposedMidi);
  syncKeyboardUI();
  renderSpreadsheet();
  playMidiNotes(transposedMidi);

  if (selectedCellIndex < gridCells.length - 1) {
    selectedCellIndex++;
    renderSpreadsheet();
  }
}

function addRow() {
  const cols = parseInt(document.getElementById('time-sig').value);
  gridCells.push(...Array(cols).fill(null));
  renderSpreadsheet();
}

function clearGrid() {
  const cols = parseInt(document.getElementById('time-sig').value);
  gridCells = Array(cols * 4).fill(null);
  selectedCellIndex = 0;
  renderSpreadsheet();
}

function rebuildGrid() {
  clearGrid();
}

// --- 4. VIRTUAL KEYBOARD & VOICING CREATOR ---
function buildKeyboard() {
  const piano = document.getElementById('piano');
  piano.innerHTML = '';
  const blackNotes = new Set([1, 3, 6, 8, 10]);

  for (let midi = 48; midi <= 83; midi++) {
    const noteIndex = midi % 12;
    const isBlack = blackNotes.has(noteIndex);
    const key = document.createElement('div');
    key.className = `key ${isBlack ? 'black-key' : 'white-key'}`;
    key.dataset.midi = midi;
    if (!isBlack) key.textContent = midiToName(midi);

    key.onclick = () => togglePianoKey(midi);
    piano.appendChild(key);
  }
}

function togglePianoKey(midi) {
  if (activeKeys.has(midi)) {
    activeKeys.delete(midi);
  } else {
    activeKeys.add(midi);
    playMidiNotes(new Array(midi), '8n');
  }
  syncKeyboardUI();
}

function syncKeyboardUI() {
  document.querySelectorAll('.key').forEach(k => {
    const m = parseInt(k.dataset.midi);
    k.classList.toggle('active', activeKeys.has(m));
  });
  const sorted = Array.from(activeKeys).sort((a, b) => a - b);
  document.getElementById('active-notes-display').textContent = 
    sorted.length ? `Selected: ${sorted.map(midiToName).join(' ')}` : 'Tap keys to build a voicing or select a cell';
}

function clearActiveKeys() {
  activeKeys.clear();
  syncKeyboardUI();
}

function saveCurrentKeysAsTemplate() {
  const sorted = Array.from(activeKeys).sort((a, b) => a - b);
  if (sorted.length < 2) {
    alert('Tap at least 2 notes on the keyboard first to save a voicing template.');
    return;
  }
  const name = prompt('Name this voicing template (e.g., My Dark m11, Gospel Drop-2):');
  if (!name) return;

  const rootOffset = parseInt(document.getElementById('root-key').value);
  const lowestNote = sorted.at(0);
  const rootMidi = lowestNote - ((lowestNote - rootOffset) % 12);
  const intervals = sorted.map(m => m - rootMidi);

  voicingLibrary.unshift({ name, intervals });
  saveLibrary();
  renderLibrary();
}

function renderLibrary() {
  const query = document.getElementById('search-voicing').value.toLowerCase();
  const container = document.getElementById('voicing-chips');
  container.innerHTML = '';

  voicingLibrary
    .filter(v => v.name.toLowerCase().includes(query))
    .forEach(voicing => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = voicing.name;
      chip.onclick = () => applyVoicingToSelectedCell(voicing);
      container.appendChild(chip);
    });
}

// --- 5. VIEW TOGGLES & PLAYBACK SEQUENCER ---
function setView(mode) {
  const sheet = document.getElementById('sheet-pane');
  const keys = document.getElementById('keyboard-pane');
  document.querySelectorAll('header .btn-group button').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${mode}`).classList.add('active');

  if (mode === 'split') {
    sheet.classList.remove('hidden');
    keys.classList.remove('hidden');
  } else if (mode === 'sheet') {
    sheet.classList.remove('hidden');
    keys.classList.add('hidden');
  } else if (mode === 'keys') {
    sheet.classList.add('hidden');
    keys.classList.remove('hidden');
  }
}

async function togglePlay() {
  const btn = document.getElementById('play-btn');
  if (isPlaying) {
    isPlaying = false;
    clearInterval(playInterval);
    btn.textContent = '▶ Play';
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('playing'));
    return;
  }

  await Tone.start();
  if (!synth) initAudio();
  isPlaying = true;
  btn.textContent = '⏹ Stop';
  let step = 0;

  const tick = () => {
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('playing'));
    const currentEl = document.getElementById(`cell-${step}`);
    if (currentEl) currentEl.classList.add('playing');

    const cell = gridCells[step];
    if (cell && cell.midi.length > 0) {
      playMidiNotes(cell.midi, '2n');
      activeKeys = new Set(cell.midi);
      syncKeyboardUI();
    }
    step = (step + 1) % gridCells.length;
  };

  tick();
  playInterval = setInterval(tick, 900);
}

// --- 6. PROMPT-TO-MUSIC PARSER ---
function runPrompt() {
  const raw = document.getElementById('prompt-input').value.trim();
  if (!raw) return;

  if (raw.includes('3/4')) document.getElementById('time-sig').value = '3';
  else if (raw.includes('6/8')) document.getElementById('time-sig').value = '6';
  else if (raw.includes('4/4')) document.getElementById('time-sig').value = '4';

  const cols = parseInt(document.getElementById('time-sig').value);
  const tokens = raw.replace(/3\/4|4\/4|6\/8/g, '').split(/[\|,]+/).map(s => s.trim()).filter(Boolean);
  
  if (tokens.length === 0) return;

  gridCells = Array(Math.max(tokens.length, cols * 2)).fill(null);

  tokens.forEach((token, idx) => {
    const match = token.match(/^([A-G][#b]?)(.*)$/i);
    if (!match) return;

    const notePart = match.at(1);
    const qualPart = match.at(2) || '';

    let rootStr = notePart.charAt(0).toUpperCase() + (notePart.slice(1) || '');
    const flatMap = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    if (flatMap[rootStr]) rootStr = flatMap[rootStr];

    const rootIdx = noteNames.indexOf(rootStr);
    if (rootIdx === -1) return;

    const quality = qualPart.toLowerCase();
    let matchedVoicing = voicingLibrary.find(v => quality && v.name.toLowerCase().includes(quality));
    if (!matchedVoicing) {
(quality.includes('m')) matchedVoicing = voicingLibrary.find(v => v.name.toLowerCase().startsWith('m'));
else if (quality.includes('13') || quality.includes('7') || quality.includes('alt')) matchedVoicing = voicingLibrary.find(v => v.name.includes('13') || v.name.includes('7'));
else matchedVoicing = voicingLibrary.at(0);
}
const baseMidi = 48 + rootIdx;
gridCells[idx] = {
label: ${token} (${matchedVoicing.name}),
midi: matchedVoicing.intervals.map(i => baseMidi + i)
};
});
selectedCellIndex = 0;
renderSpreadsheet();
selectCell(0);
}
// --- INITIALIZE APP ---
buildKeyboard();
renderSpreadsheet();
renderLibrary();

*(Note: Because `sw.js` cached your first version, if refreshing doesn't immediately show the keyboard and grid, open your Vercel URL in an Incognito/Private tab once or clear site cache for your `.vercel.app` link so your phone loads the updated `app.js`!)*

<FollowUp>
Replace `app.js` with this fixed version, refresh your Vercel page, and let me know if the **spreadsheet grid**, **voicing chips**, and **virtual piano keyboard** appear right away!
</FollowUp>
