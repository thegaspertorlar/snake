const HIGHSCORE_KEY = 'snake_highscore_v1';
const BOARD_KEY = 'snake_leaderboard_v1';
const MAX_ENTRIES = 5;

function loadHighScore() {
  const v = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10);
  return isNaN(v) ? 0 : v;
}

function saveHighScore(score) {
  localStorage.setItem(HIGHSCORE_KEY, String(score));
}

function loadBoard() {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ENTRIES);
  } catch (e) {
    return [];
  }
}

function saveBoard(board) {
  localStorage.setItem(BOARD_KEY, JSON.stringify(board.slice(0, MAX_ENTRIES)));
}

function isTopScore(score) {
  const board = loadBoard();
  if (board.length < MAX_ENTRIES) return true;
  return score > board[board.length - 1].score;
}

function addScore(name, score) {
  const board = loadBoard();
  board.push({name: name || 'Anon', score});
  board.sort((a,b)=>b.score-a.score);
  const sliced = board.slice(0, MAX_ENTRIES);
  saveBoard(sliced);
  return sliced;
}

export {loadHighScore, saveHighScore, loadBoard, saveBoard, isTopScore, addScore};
