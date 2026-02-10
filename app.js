const blessed = require('blessed');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.terminoted');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

let tasks = [];
try {
  const loaded = JSON.parse(fs.readFileSync(TASKS_FILE));
  tasks = Array.isArray(loaded) ? loaded : [];
} catch (e) {
  tasks = [];
}

let notes = [];
try {
  const loaded = JSON.parse(fs.readFileSync(NOTES_FILE));
  notes = Array.isArray(loaded) ? loaded : [];
  // migrate old format: { text } -> { title, content }
  notes = notes.map(n => {
    if (n.text && !n.title) return { title: n.text, content: n.content || '', createdAt: n.createdAt || Date.now() };
    return n;
  });
} catch (e) {
  notes = [];
}

let currentTab = 'todo'; // 'todo' | 'notes'
let editorOpen = false;
let editorNoteIndex = -1;

const screen = blessed.screen({ smartCSR: true, title: 'Ghostty Sticky Notes' });
screen.style = { bg: 'black' };

// --- Header ---
const header = blessed.box({
  parent: screen,
  top: 0,
  height: 3,
  width: '100%',
  border: { type: 'line' },
  style: { bg: 'black', border: { fg: 'cyan' } }
});

const tabTitle = blessed.box({
  parent: header,
  top: 0,
  left: 1,
  height: 1,
  tags: true,
  content: '',
  style: { fg: 'cyan', bg: 'black' }
});

const stats = blessed.box({
  parent: header,
  top: 0,
  right: 1,
  height: 1,
  tags: true,
  content: '',
  style: { fg: 'green', bg: 'black' }
});

// --- To-Do panel ---
const todoPanel = blessed.box({
  parent: screen,
  top: 3,
  bottom: 4,
  left: 0,
  right: 0,
  border: { type: 'line' },
  label: '{bold}{cyan-fg} Tasks {/cyan-fg}{/bold}',
  tags: true,
  style: { border: { fg: 'cyan' }, bg: 'black' }
});

const todoList = blessed.list({
  parent: todoPanel,
  top: 0,
  left: 1,
  right: 1,
  bottom: 0,
  items: [],
  keys: true,
  vi: true,
  tags: true,
  style: {
    selected: { bg: 'cyan', fg: 'black', bold: true },
    item: { fg: 'white' },
    bg: 'black'
  }
});

const todoEmpty = blessed.box({
  parent: todoPanel,
  top: 'center',
  height: 3,
  width: '100%',
  align: 'center',
  tags: true,
  content: '{bold}{green-fg}No tasks yet. Press "a" to add one.{/green-fg}{/bold}',
  style: { fg: 'green', bg: 'black' }
});

// --- Notes list panel ---
const notesPanel = blessed.box({
  parent: screen,
  top: 3,
  bottom: 4,
  left: 0,
  right: 0,
  border: { type: 'line' },
  label: '{bold}{cyan-fg} Notes {/cyan-fg}{/bold}',
  tags: true,
  hidden: true,
  style: { border: { fg: 'cyan' }, bg: 'black' }
});

const notesList = blessed.list({
  parent: notesPanel,
  top: 0,
  left: 1,
  right: 1,
  bottom: 0,
  items: [],
  keys: true,
  vi: true,
  tags: true,
  style: {
    selected: { bg: 'cyan', fg: 'black', bold: true },
    item: { fg: 'white' },
    bg: 'black'
  }
});

const notesEmpty = blessed.box({
  parent: notesPanel,
  top: 'center',
  height: 3,
  width: '100%',
  align: 'center',
  tags: true,
  content: '{bold}{green-fg}No notes yet. Press "a" to add one.{/green-fg}{/bold}',
  style: { fg: 'green', bg: 'black' }
});

// --- Note editor panel ---
const editorPanel = blessed.box({
  parent: screen,
  top: 3,
  bottom: 1,
  left: 0,
  right: 0,
  border: { type: 'line' },
  label: '',
  tags: true,
  hidden: true,
  style: { border: { fg: 'yellow' }, bg: 'black' }
});

const editorArea = blessed.textarea({
  parent: editorPanel,
  top: 0,
  left: 1,
  right: 1,
  bottom: 0,
  keys: true,
  inputOnFocus: true,
  tags: false,
  style: {
    fg: 'white',
    bg: 'black'
  }
});

// --- Input bar ---
const input = blessed.textbox({
  parent: screen,
  bottom: 1,
  height: 3,
  width: '100%',
  keys: true,
  inputOnFocus: true,
  border: { type: 'line' },
  label: '',
  tags: true,
  style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' }
});

// --- Footer ---
const footer = blessed.box({
  parent: screen,
  bottom: 0,
  height: 1,
  width: '100%',
  tags: true,
  content: '',
  style: { fg: 'cyan', bg: 'black' }
});

// --- Persistence ---
const persistTasks = () => {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
};

const persistNotes = () => {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
};

// --- To-Do helpers ---
const formatTask = task => {
  if (task.done) {
    return `{magenta-fg}■{/magenta-fg} {white-fg}${task.text}{/white-fg}`;
  }
  return `{green-fg}▸{/green-fg} {white-fg}${task.text}{/white-fg}`;
};

let todoMap = [];

const buildTodoView = () => {
  const open = tasks
    .map((task, idx) => ({ task, idx }))
    .filter(entry => !entry.task.done);
  const done = tasks
    .map((task, idx) => ({ task, idx }))
    .filter(entry => entry.task.done);

  const items = [];
  const map = [];

  if (open.length > 0) {
    items.push('{bold}{green-fg}── Open ──────────────────────{/green-fg}{/bold}');
    map.push(null);
    open.forEach(entry => {
      items.push(formatTask(entry.task));
      map.push(entry.idx);
    });
  }

  if (done.length > 0) {
    if (items.length > 0) {
      items.push('');
      map.push(null);
    }
    items.push('{bold}{magenta-fg}── Completed ─────────────────{/magenta-fg}{/bold}');
    map.push(null);
    done.forEach(entry => {
      items.push(formatTask(entry.task));
      map.push(entry.idx);
    });
  }

  return { items, map };
};

const getSelectedTaskIndex = () => {
  const idx = todoList.selected;
  if (typeof idx !== 'number') return null;
  const taskIndex = todoMap[idx];
  return typeof taskIndex === 'number' ? taskIndex : null;
};

// --- Notes helpers ---
const formatNote = note => {
  const preview = note.content
    ? ` {gray-fg}– ${note.content.split('\n')[0].substring(0, 40)}${note.content.length > 40 ? '…' : ''}{/gray-fg}`
    : ' {gray-fg}– empty{/gray-fg}';
  return `{yellow-fg}●{/yellow-fg} {white-fg}${note.title}{/white-fg}${preview}`;
};

const buildNotesView = () => {
  return notes.map(n => formatNote(n));
};

// --- Editor ---
const openEditor = (idx) => {
  editorOpen = true;
  editorNoteIndex = idx;
  const note = notes[idx];

  editorPanel.setLabel(`{bold}{yellow-fg} ${note.title} {/yellow-fg}{/bold}`);
  editorArea.setValue(note.content || '');

  todoPanel.hidden = true;
  notesPanel.hidden = true;
  input.hidden = true;
  editorPanel.hidden = false;

  header.hidden = true;

  footer.setContent('{yellow-fg}{bold} esc{/bold} save & back{/yellow-fg}');

  editorArea.focus();
  screen.render();
};

const closeEditor = () => {
  // save content
  if (editorNoteIndex >= 0 && editorNoteIndex < notes.length) {
    notes[editorNoteIndex].content = editorArea.getValue() || '';
    persistNotes();
  }

  editorOpen = false;
  editorNoteIndex = -1;

  editorPanel.hidden = true;
  header.hidden = false;
  input.hidden = false;

  refresh();
  notesList.focus();
};

// --- Tab header ---
const updateTabHeader = () => {
  const todoLabel = currentTab === 'todo'
    ? '{bold}{cyan-fg}[{/cyan-fg} {white-fg}To-Do{/white-fg} {cyan-fg}]{/cyan-fg}{/bold}'
    : '{gray-fg}  To-Do  {/gray-fg}';
  const notesLabel = currentTab === 'notes'
    ? '{bold}{cyan-fg}[{/cyan-fg} {white-fg}Notes{/white-fg} {cyan-fg}]{/cyan-fg}{/bold}'
    : '{gray-fg}  Notes  {/gray-fg}';

  tabTitle.setContent(`${todoLabel}  ${notesLabel}`);
};

// --- Refresh ---
const refreshTodo = () => {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const view = buildTodoView();
  todoMap = view.map;
  todoList.setItems(view.items);
  todoEmpty.hidden = tasks.length > 0;
  stats.setContent(`{green-fg}${done} done{/green-fg}  {cyan-fg}•{/cyan-fg}  {magenta-fg}${total} total{/magenta-fg}`);
};

const refreshNotes = () => {
  const items = buildNotesView();
  notesList.setItems(items);
  notesEmpty.hidden = notes.length > 0;
  stats.setContent(`{yellow-fg}${notes.length} notes{/yellow-fg}`);
};

const refresh = () => {
  updateTabHeader();

  if (currentTab === 'todo') {
    todoPanel.hidden = false;
    notesPanel.hidden = true;
    input.setLabel('{bold}{cyan-fg} New Task (Enter to save) {/cyan-fg}{/bold}');
    footer.setContent('{cyan-fg}{bold} a{/bold} add  {bold}x{/bold} toggle  {bold}d{/bold} delete  {bold}tab{/bold} switch tab  {bold}q{/bold} quit{/cyan-fg}');
    refreshTodo();
  } else {
    todoPanel.hidden = true;
    notesPanel.hidden = false;
    input.setLabel('{bold}{cyan-fg} New Note (Enter to save) {/cyan-fg}{/bold}');
    footer.setContent('{cyan-fg}{bold} a{/bold} add  {bold}enter{/bold} open  {bold}d{/bold} delete  {bold}tab{/bold} switch tab  {bold}q{/bold} quit{/cyan-fg}');
    refreshNotes();
  }

  screen.render();
};

// --- Input submit ---
input.on('submit', text => {
  if (text) {
    if (currentTab === 'todo') {
      tasks.push({ text, done: false, doneAt: null });
      persistTasks();
    } else {
      notes.push({ title: text, content: '', createdAt: Date.now() });
      persistNotes();
    }
    refresh();
  }
  input.clearValue();
  if (currentTab === 'todo') {
    todoList.focus();
  } else {
    notesList.focus();
  }
});

// --- Open note on Enter ---
notesList.on('select', (item, index) => {
  if (index >= 0 && index < notes.length) {
    openEditor(index);
  }
});

// --- Editor escape to save & close ---
editorArea.key(['escape'], () => {
  closeEditor();
});

// --- Global keys ---
screen.key(['a'], () => {
  if (editorOpen) return;
  input.focus();
});

screen.key(['tab'], () => {
  if (editorOpen) return;
  currentTab = currentTab === 'todo' ? 'notes' : 'todo';
  refresh();
  if (currentTab === 'todo') {
    todoList.focus();
  } else {
    notesList.focus();
  }
});

screen.key(['q', 'C-c'], () => {
  if (editorOpen) return;
  process.exit(0);
});

screen.key(['x'], () => {
  if (editorOpen) return;
  if (currentTab !== 'todo') return;
  const idx = getSelectedTaskIndex();
  if (idx === null || tasks.length === 0) return;
  tasks[idx].done = !tasks[idx].done;
  tasks[idx].doneAt = tasks[idx].done ? Date.now() : null;
  persistTasks();
  refresh();
});

screen.key(['d'], () => {
  if (editorOpen) return;
  if (currentTab === 'todo') {
    const idx = getSelectedTaskIndex();
    if (idx === null || tasks.length === 0) return;
    tasks.splice(idx, 1);
    persistTasks();
  } else {
    const idx = notesList.selected;
    if (typeof idx !== 'number' || notes.length === 0) return;
    notes.splice(idx, 1);
    persistNotes();
  }
  refresh();
});

refresh();
todoList.focus();
