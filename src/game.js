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
      // base speed increased by 10% (was 8)
      baseSpeed: Math.round((8 * 1.10) * 100) / 100,
      // effective speed = baseSpeed * speedMultiplier (used for slow-time powerup)
      speedMultiplier: 1,
      speed: Math.round((Math.round((8 * 1.10) * 100) / 100) * 1 * 100) / 100,
      // number of food items (bait) eaten this round
      foodEaten: 0,
      lastMoveTime: 0,
      score: 0,
      // powerup & pickup state
      pickups: [], // {x,y,type}
      activePowerups: {}, // name -> {expiresAt(ms)}
      // automatic pickup spawn control
      lastPickupSpawnTime: Date.now(),
      pickupSpawnInterval: 12000, // ms between auto spawns
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
    // Lock the canvas CSS size so the visible game area does NOT grow
    // between rounds (prevents responsive rules from enlarging it).
    // Set inline width/height in CSS pixels which overrides stylesheet
    // responsive sizing. We intentionally do not listen to window resize
    // after this so the game area remains constant for subsequent games.
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.style.width = `${Math.round(rect.width)}px`;
    this.canvas.style.height = `${Math.round(rect.height)}px`;
    this.placeFood();
    // ensure at least one pickup may appear after a short delay
    this.state.lastPickupSpawnTime = Date.now();
    this.raf = null;
  }

  reset() {
    // preserve mute state across resets so user preference remains
    const oldMuted = this.state && this.state.audio && typeof this.state.audio.isMuted === 'function' ? this.state.audio.isMuted() : false;
    this.state = createInitialState();
    if (oldMuted && this.state && this.state.audio && typeof this.state.audio.toggleMute === 'function') {
      try { this.state.audio.toggleMute(); } catch (e) {}
    }
    this.resizeCanvas();
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
    // store CSS (layout) size for drawing in transformed coordinates
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    // cellSize should be in CSS pixels because we set a transform to map
    // CSS pixels to device pixels. Using canvas.width (device pixels)
    // produced a mismatch where drawn cells appeared larger than the
    // logical grid and collisions still used the logical grid size.
    this.state.cellSize = Math.floor(this.cssWidth / this.state.gridSize);
    // scale the drawing context so 1 unit == 1 CSS pixel
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

    // wall collision removed: wrap around edges instead of dying
    if (head.x < 0) head.x = s.gridSize - 1;
    if (head.y < 0) head.y = s.gridSize - 1;
    if (head.x >= s.gridSize) head.x = 0;
    if (head.y >= s.gridSize) head.y = 0;

    // self collision
    for (let i=0;i<s.snake.length;i++){
      const seg = s.snake[i];
      if (seg.x === head.x && seg.y === head.y) {
        // if shield is active, consume it and remove the collided segment
        if (s.activePowerups && s.activePowerups.shield) {
          delete s.activePowerups.shield;
          s.snake.splice(i,1);
          break;
        }
        this.onGameOver(); return;
      }
    }

    s.snake.unshift(head);

    // pickup collection
    if (s.pickups && s.pickups.length) {
      for (let pi=0; pi<s.pickups.length; pi++){
        const p = s.pickups[pi];
        if (p.x === head.x && p.y === head.y) {
          // activate
          const now = Date.now();
          if (p.type === 'slow') {
            s.activePowerups.slow = {expiresAt: now + 8000};
            s.speedMultiplier = 0.6;
            s.speed = Math.round((s.baseSpeed * s.speedMultiplier) * 100) / 100;
          } else if (p.type === 'double') {
            s.activePowerups.double = {expiresAt: now + 8000};
          } else if (p.type === 'shield') {
            s.activePowerups.shield = {expiresAt: now + 8000};
          }
          s.pickups.splice(pi,1);
          s.audio.playEat();
          break;
        }
      }
    }

    // eat food
    if (s.food && head.x === s.food.x && head.y === s.food.y) {
      const multiplier = (s.activePowerups && s.activePowerups.double) ? 2 : 1;
      s.score += 10 * multiplier;
      // increment bait counter
      s.foodEaten = (s.foodEaten || 0) + 1;
      s.audio.playEat();
      this.placeFood();
      // spawn pickup after every 3 food eaten to create moment-to-moment variety
      if (s.foodEaten % 3 === 0) this.placePickup();
      // every 5 bait eaten, increase speed by 15%
      if (s.foodEaten % 5 === 0) {
        // multiply baseSpeed by 1.15 and keep two decimal places for stability
        s.baseSpeed = Math.round((s.baseSpeed * 1.15) * 100) / 100;
        s.speed = Math.round((s.baseSpeed * s.speedMultiplier) * 100) / 100;
      }
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
    // handle pickup auto-spawn based on time
    try {
      const now = Date.now();
      if (!s.lastPickupSpawnTime) s.lastPickupSpawnTime = now;
      if (now - s.lastPickupSpawnTime >= s.pickupSpawnInterval) {
        this.placePickup();
        s.lastPickupSpawnTime = now;
      }
      // expire powerups
      if (s.activePowerups) {
        for (const k of Object.keys({...s.activePowerups})) {
          if (s.activePowerups[k] && s.activePowerups[k].expiresAt <= now) {
            delete s.activePowerups[k];
            if (k === 'slow') {
              s.speedMultiplier = 1;
              s.speed = Math.round((s.baseSpeed * s.speedMultiplier) * 100) / 100;
            }
          }
        }
      }
    } catch (e) {}
    this.render();
    this.raf = requestAnimationFrame((t)=>this.loop(t));
  }

  render() {
    const ctx = this.ctx;
    const s = this.state;
    const size = s.gridSize;
    const cs = s.cellSize;
    // clear
    // use CSS sizes because the context is transformed to CSS pixels
    const w = this.cssWidth || (this.canvas.width);
    const h = this.cssHeight || (this.canvas.height);
    ctx.clearRect(0,0,w,h);
    // draw grid subtle
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0,0,w,h);

    // draw food (bait) - make it yellow
    if (s.food) {
      // use a bright yellow for the bait
      ctx.fillStyle = '#FFFF00';
      ctx.shadowColor = 'rgba(255,255,0,0.65)';
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
    // draw pickups
    if (s.pickups && s.pickups.length) {
      for (const p of s.pickups) {
        if (p.type === 'slow') ctx.fillStyle = '#88ccff';
        else if (p.type === 'double') ctx.fillStyle = '#ffd166';
        else if (p.type === 'shield') ctx.fillStyle = '#9bffb8';
        else ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.12)';
        ctx.shadowBlur = 10;
        // draw a circle-like pickup
        const x = p.x*cs + cs/2;
        const y = p.y*cs + cs/2;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, cs/2 - 3), 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // small label
        ctx.fillStyle = '#000';
        ctx.font = `${Math.max(8, cs/3)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = p.type === 'slow' ? 'S' : p.type === 'double' ? '2x' : 'H';
        ctx.fillText(label, x, y);
      }
    }

    // HUD overlay for active powerups (top-right)
    const hudX = w - 8;
    let hudY = 8;
    ctx.textAlign = 'right';
    ctx.font = '12px sans-serif';
    if (s.activePowerups) {
      const now = Date.now();
      for (const k of ['slow','double','shield']){
        if (s.activePowerups[k]){
          const rem = Math.max(0, Math.ceil((s.activePowerups[k].expiresAt - now)/1000));
          let color = '#fff';
          let label = '';
          if (k === 'slow') { color = '#88ccff'; label = 'Slow'; }
          if (k === 'double') { color = '#ffd166'; label = '2x Score'; }
          if (k === 'shield') { color = '#9bffb8'; label = 'Shield'; }
          // draw pill background
          const text = `${label} ${rem}s`;
          const padding = 8;
          const metrics = ctx.measureText(text);
          const tw = metrics.width + padding*2;
          const th = 20;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(hudX - tw, hudY, tw, th);
          ctx.fillStyle = color;
          ctx.fillText(text, hudX - padding, hudY + th/2 + 1);
          hudY += th + 6;
        }
      }
    }
  }

  placePickup() {
    const s = this.state;
    const size = s.gridSize;
    const occupied = new Set([...s.snake.map(x=>`${x.x},${x.y}`), `${s.food.x},${s.food.y}`]);
    for (let tries=0; tries<200; tries++){
      const px = Math.floor(Math.random()*size);
      const py = Math.floor(Math.random()*size);
      if (occupied.has(`${px},${py}`)) continue;
      const types = ['slow','double','shield'];
      const type = types[Math.floor(Math.random()*types.length)];
      s.pickups.push({x:px,y:py,type});
      return;
    }
  }
}

export {Game, createInitialState};
