import {Game} from './game.js';
import {loadBoard, loadHighScore} from './leaderboard.js';
import createAudioEngine from './audio.js';

const canvas = document.getElementById('gameCanvas');
const muteBtn = document.getElementById('muteBtn');
const scoreEl = document.getElementById('score');
const highEl = document.getElementById('highScore');
const overlay = document.getElementById('overlay');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const leaderboardStart = document.getElementById('leaderboardStart');
const leaderboardGameOver = document.getElementById('leaderboardGameOver');
const finalScoreEl = document.getElementById('finalScore');

const ui = {
  updateHUD(score, high) {
    scoreEl.textContent = score;
    highEl.textContent = high;
  },
  showStart(board) {
    startScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden');
    leaderboardStart.innerHTML = renderBoard(board);
  },
  showGameOver(score, high, board) {
    startScreen.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    finalScoreEl.textContent = `Final Score: ${score}`;
    leaderboardGameOver.innerHTML = renderBoard(board);
    this.updateHUD(score, high);
  }
};

function renderBoard(board) {
  if (!board || board.length === 0) return '<div class="box" style="padding:8px">No scores yet</div>';
  return `<div class="box">${board.map((r,i)=>`<div class="row"><strong>#${i+1} ${escapeHtml(r.name)}</strong><span>${r.score}</span></div>`).join('')}</div>`;
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

const game = new Game(canvas, ui);
// sync audio engine mute with UI
const audioEngine = game.state.audio;

function init() {
  ui.showStart(loadBoard());
  ui.updateHUD(0, loadHighScore());
}

init();

window.addEventListener('keydown',(e)=>{
  const key = e.key;
  if (['ArrowUp','w','W'].includes(key)) { game.setDirection(0,-1); e.preventDefault(); }
  if (['ArrowDown','s','S'].includes(key)) { game.setDirection(0,1); e.preventDefault(); }
  if (['ArrowLeft','a','A'].includes(key)) { game.setDirection(-1,0); e.preventDefault(); }
  if (['ArrowRight','d','D'].includes(key)) { game.setDirection(1,0); e.preventDefault(); }
  if (key === ' '){
    // start / restart
    if (!game.state.running) {
      if (game.state.gameOver) game.reset();
      ui.showStart(loadBoard());
      game.start();
    }
    e.preventDefault();
  }
});

muteBtn.addEventListener('click', async ()=>{
  await audioEngine.resume();
  audioEngine.toggleMute();
  muteBtn.textContent = audioEngine.isMuted() ? 'Unmute' : 'Mute';
});

// pointer to keep canvas focused for key events on some browsers
canvas.addEventListener('click', ()=>canvas.focus());
