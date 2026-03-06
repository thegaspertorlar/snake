import createAudioEngine from './audio.js';
import {loadHighScore, saveHighScore, loadBoard, isTopScore, addScore} from './leaderboard.js';

const GRID_SIZE = 20;

function createInitialState() {
  return {
    gridSize: GRID_SIZE,
    cellSize: 20,
    snake: [{x:10,y:10}],
    dir: {x:0,y:0},
    nextDir: {x:0,y:0},
    food: null,
    speed: 8,
    lastMoveTime: 0,
    score: 0,
    running: false,
    gameOver: false,
    highScore: loadHighScore(),
    leaderboard: loadBoard(),
    audio: createAudioEngine(),
    muted: false,
  };
}

class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.state = createInitialState();
    this.resizeCanvas();
    window.addEventListener('resize',()=>this.resizeCanvas());
    this.placeFood();
    this.raf = null;
  }

  reset() {
    this.state = createInitialState();
    this.placeFood();
    this.ui.updateHUD(this.state.score, this.state.highScore);
  }

  start() {
    if (!this.state.running) {
      this.state.running = true;
      this.state.gameOver = false;
      this.state.lastMoveTime = 0;
      this.state.audio.resume();
      this.loop(0);
    }
  }

  stop() {
    this.state.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  resizeCanvas() {
    // ensure canvas pixel ratio clarity
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * ratio);
    this.canvas.height = Math.floor(rect.height * ratio);
    this.state.cellSize = Math.floor(this.canvas.width / this.state.gridSize);
    this.ctx.setTransform(ratio,0,0,ratio,0,0);
  }

  placeFood() {
    const size = this.state.gridSize;
    const occupied = new Set(this.state.snake.map(s=>`${s.x},${s.y}`));
    let tries = 0;
    while (tries < 1000) {
      const fx = Math.floor(Math.random()*size);
      const fy = Math.floor(Math.random()*size);
      if (!occupied.has(`${fx},${fy}`)) {
        this.state.food = {x:fx,y:fy};
        return;
      }
      tries++;
    }
    // fallback
    this.state.food = {x:0,y:0};
  }

  setDirection(dx,dy) {
    // prevent immediate 180
    const cur = this.state.dir;
    if (dx === -cur.x && dy === -cur.y) return;
    this.state.nextDir = {x:dx,y:dy};
  }

  tick() {
    const s = this.state;
    // apply nextDir
    if (s.nextDir.x !== 0 || s.nextDir.y !== 0) s.dir = s.nextDir;
    if (s.dir.x === 0 && s.dir.y === 0) return; // not moving yet

    // compute new head
    const head = {...s.snake[0]};
    head.x += s.dir.x;
    head.y += s.dir.y;

    // wall collision
    if (head.x < 0 || head.y < 0 || head.x >= s.gridSize || head.y >= s.gridSize) {
      this.onGameOver();
      return;
    }

    // self collision
    for (let seg of s.snake) {
      if (seg.x === head.x && seg.y === head.y) { this.onGameOver(); return; }
    }

    s.snake.unshift(head);

    // eat food
    if (s.food && head.x === s.food.x && head.y === s.food.y) {
      s.score += 10;
      s.audio.playEat();
      this.placeFood();
      if (s.score > s.highScore) {
        s.highScore = s.score;
        saveHighScore(s.highScore);
      }
      this.ui.updateHUD(s.score, s.highScore);
      return; // keep tail to grow
    }

    // move forward remove tail
    s.snake.pop();
  }

  onGameOver() {
    const s = this.state;
    s.audio.playGameOver();
    s.running = false;
    s.gameOver = true;
    // check leaderboard
    if (isTopScore(s.score)) {
      s.audio.playHighScore();
      // ask for name
      setTimeout(()=>{
        const name = prompt('New High Score! Enter your name:','PLAYER') || 'PLAYER';
        addScore(name, s.score);
        this.ui.showGameOver(s.score, loadHighScore(), loadBoard());
      }, 150);
    } else {
      setTimeout(()=>{
        this.ui.showGameOver(s.score, s.highScore, loadBoard());
      }, 50);
    }
  }

  loop(timestamp) {
    if (!this.state.running) return;
    const s = this.state;
    if (!s.lastMoveTime) s.lastMoveTime = timestamp;
    const secondsPerMove = 1 / s.speed;
    if ((timestamp - s.lastMoveTime) / 1000 >= secondsPerMove) {
      s.lastMoveTime = timestamp;
      this.tick();
    }
    this.render();
    this.raf = requestAnimationFrame((t)=>this.loop(t));
  }

  render() {
    const ctx = this.ctx;
    const s = this.state;
    const size = s.gridSize;
    const cs = s.cellSize;
    // clear
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    // draw grid subtle
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

    // draw food
    if (s.food) {
      ctx.fillStyle = 'rgba(255,88,198,0.95)';
      ctx.shadowColor = 'rgba(255,88,198,0.6)';
      ctx.shadowBlur = 12;
      ctx.fillRect(s.food.x*cs + 2, s.food.y*cs + 2, cs-4, cs-4);
      ctx.shadowBlur = 0;
    }

    // draw snake
    for (let i=0;i<s.snake.length;i++){
      const seg = s.snake[i];
      const t = 1 - (i / Math.max(1, s.snake.length));
      const neon = `rgba(${Math.floor(69 + (1-t)*30)},${Math.floor(255 - (t*40))},${Math.floor(137 + (t*40))},1)`;
      ctx.fillStyle = neon;
      ctx.shadowColor = 'rgba(69,255,137,0.25)';
      ctx.shadowBlur = 8;
      ctx.fillRect(seg.x*cs + 1, seg.y*cs + 1, cs-2, cs-2);
      ctx.shadowBlur = 0;
    }
    // HUD overlay handled separately
  }
}

export {Game, createInitialState};
