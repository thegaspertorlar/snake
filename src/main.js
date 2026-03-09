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

const btnLabel = muteBtn.querySelector('.btnLabel');

function updateMuteUI(ae){
  if (!ae || typeof ae.isMuted !== 'function') return;
  const muted = ae.isMuted();
  if (btnLabel) btnLabel.textContent = muted ? 'Unmute' : 'Mute';
  if (muted) muteBtn.classList.add('muted'); else muteBtn.classList.remove('muted');
}

function init() {
  ui.showStart(loadBoard());
  ui.updateHUD(0, loadHighScore());
  // ensure mute button reflects current audio engine state
  try { updateMuteUI(game.state.audio); } catch (e) { if (btnLabel) btnLabel.textContent = 'Mute'; }
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
      // hide overlays and start
      startScreen.classList.add('hidden');
      gameOverScreen.classList.add('hidden');
      game.start();
    }
    e.preventDefault();
  }
});

muteBtn.addEventListener('click', async ()=>{
  // always operate on the current audio engine instance from game state
  const ae = game && game.state && game.state.audio;
  if (!ae) return;
  await ae.resume();
  ae.toggleMute();
  updateMuteUI(ae);
});

// pointer to keep canvas focused for key events on some browsers
canvas.addEventListener('click', ()=>canvas.focus());
