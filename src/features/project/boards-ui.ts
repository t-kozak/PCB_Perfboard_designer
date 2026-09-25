import {Utils} from "../../utils/utils";
import {
  activeBoardIndex, addBoard, BOARDS_CHANGED, boardNames, nextBoardName, removeBoard, renameBoard, switchBoard,
} from "./boards";
import {scheduleAutosave} from "./autosave";
import {reportWarnings} from "./project-menu";

// The Boards sidebar section: one row per board. Click opens a board,
// double-click renames it in place, the trash icon removes it (not the last
// one), and the section's ＋ adds an empty board.

const boardList = Utils.getSafeHtmlElement<HTMLUListElement>('boardList');
const addBoardBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('addBoardBtn');

const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;

/** Index of the board being renamed, so a re-render keeps its input open. */
let renaming: number | undefined;

function renderBoards() {
  const names = boardNames();
  const active = activeBoardIndex();
  boardList.replaceChildren(...names.map((name, i) => {
    const li = document.createElement('li');
    li.className = 'board-item' + (i === active ? ' active' : '');
    li.dataset.index = String(i);
    if (i === active) li.setAttribute('aria-current', 'true');

    if (i === renaming) {
      li.append(renameInput(i, name));
    } else {
      const label = document.createElement('span');
      label.className = 'board-name';
      label.textContent = name;
      label.title = name;
      li.append(label);
    }

    if (names.length > 1) {
      const del = document.createElement('button');
      del.className = 'board-delete';
      del.title = `Delete ${name}`;
      del.setAttribute('aria-label', `Delete ${name}`);
      del.innerHTML = TRASH_ICON;
      li.append(del);
    }
    return li;
  }));
  boardList.querySelector<HTMLInputElement>('.board-rename-input')?.focus();
}

function renameInput(index: number, name: string): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'board-rename-input';
  input.value = name;
  input.setAttribute('aria-label', 'Board name');
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    renaming = undefined;
    if (commit) renameBoard(index, input.value);
    renderBoards();
    scheduleAutosave();
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  // Clicks inside the input must not re-open / re-select the row.
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('dblclick', e => e.stopPropagation());
  queueMicrotask(() => input.select());
  return input;
}

function openBoard(index: number) {
  try {
    reportWarnings(switchBoard(index), boardNames()[index]);
  } catch (err) {
    console.error(err);
    alert(`Could not open that board: ${err instanceof Error ? err.message : err}`);
  }
}

function deleteBoard(index: number) {
  const name = boardNames()[index];
  if (!confirm(`Delete the board "${name}"? This can't be undone.`)) return;
  try {
    reportWarnings(removeBoard(index), boardNames()[activeBoardIndex()]);
  } catch (err) {
    console.error(err);
    alert(`Could not delete ${name}: ${err instanceof Error ? err.message : err}`);
  }
  scheduleAutosave();
}

const rowIndex = (e: Event) => {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('.board-item');
  return li ? Number(li.dataset.index) : undefined;
};

boardList.addEventListener('click', e => {
  const index = rowIndex(e);
  if (index === undefined) return;
  if ((e.target as HTMLElement).closest('.board-delete')) deleteBoard(index);
  else if (index !== activeBoardIndex()) openBoard(index);
});

boardList.addEventListener('dblclick', e => {
  const index = rowIndex(e);
  if (index === undefined || (e.target as HTMLElement).closest('.board-delete')) return;
  renaming = index;
  renderBoards();
});

addBoardBtn.addEventListener('click', () => {
  addBoard(nextBoardName());
  // Name it straight away — the default "Board N" stays if you just press Enter.
  renaming = activeBoardIndex();
  renderBoards();
});

window.addEventListener(BOARDS_CHANGED, renderBoards);
renderBoards();
