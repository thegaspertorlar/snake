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
      speed: Math.round((8 * 1.10) * 100) / 100,
      // number of food items (bait) eaten this round
      foodEaten: 0,
      lastMoveTime: 0,
      score: 0,
    running: false,
    gameOver: false,
    highScore: loadHighScore(),
    leaderboard: loadBoard(),
    audio: createAudioEngine(),
    muted: false,
    // animation / visuals
    headBlinkOffset: Math.random() * 2000,
    lastEatAt: 0,
    eatAnimDuration: 900,
    tailTaperSegments: 6,
    particles: [],
    obstacles: [],
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
    this.placeObstacles();
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
    this.placeObstacles();
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
    // also block obstacles
    for (const ob of (this.state.obstacles||[])) occupied.add(`${ob.x},${ob.y}`);
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

  placeObstacles() {
    const s = this.state;
    const size = s.gridSize;
    const occupied = new Set(s.snake.map(x=>`${x.x},${x.y}`));
    const obs = [];
    const target = Math.max(4, Math.floor(size * 0.12)); // dynamic based on grid
    let tries = 0;
    while (obs.length < target && tries < 5000) {
      const ox = Math.floor(Math.random()*size);
      const oy = Math.floor(Math.random()*size);
      const key = `${ox},${oy}`;
      if (occupied.has(key)) { tries++; continue; }
      // avoid putting obstacle too close to initial snake head
      if (Math.abs(ox - s.snake[0].x) + Math.abs(oy - s.snake[0].y) < 3) { tries++; continue; }
      occupied.add(key);
      obs.push({x:ox,y:oy});
    }
    s.obstacles = obs;
  }

  setDirection(dx,dy) {
    // prevent immediate 180
    const cur = this.state.dir;
    if (dx === -cur.x && dy === -cur.y) return;
    this.state.nextDir = {x:dx,y:dy};
  }

  tick(timestamp) {
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
    for (let seg of s.snake) {
      if (seg.x === head.x && seg.y === head.y) { this.onGameOver(); return; }
    }
    // obstacle collision
    for (const ob of (s.obstacles || [])) {
      if (ob.x === head.x && ob.y === head.y) { this.onGameOver(); return; }
    }

    s.snake.unshift(head);

    // eat food
      if (s.food && head.x === s.food.x && head.y === s.food.y) {
      s.score += 10;
      // mark eat time for animation
      s.lastEatAt = timestamp || performance.now();
      // play chomping sound
      try { if (s.audio && typeof s.audio.playChomp === 'function') s.audio.playChomp(); } catch(e){}
      // increment bait counter
      s.foodEaten = (s.foodEaten || 0) + 1;
      // spawn particles
      this.spawnParticles(head.x, head.y);
      s.audio.playEat();
      this.placeFood();
      // every 5 bait eaten, increase speed by 15%
      if (s.foodEaten % 5 === 0) {
        // multiply speed by 1.15 and keep two decimal places for stability
        s.speed = Math.round((s.speed * 1.15) * 100) / 100;
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

  spawnParticles(gridX, gridY) {
    const s = this.state;
    const cs = s.cellSize;
    const cx = gridX * cs + cs/2;
    const cy = gridY * cs + cs/2;
    const colors = ['#FFD166','#FF7AB6','#FFD89E','#FFFFFF','#C6F6D5'];
    const count = 18;
    for (let i=0;i<count;i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 3.2;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - (Math.random()*1.5);
      const size = Math.max(1, Math.floor(Math.random()*3 + 1));
      const life = 400 + Math.random()*500;
      const color = colors[Math.floor(Math.random()*colors.length)];
      s.particles.push({x:cx, y:cy, vx, vy, size, ttl: life, life, color});
    }
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
      this.tick(timestamp);
    }
    this.render(timestamp);
    this.raf = requestAnimationFrame((t)=>this.loop(t));
  }

  render(timestamp) {
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
    const now = timestamp || performance.now();
    // blinking parameters
    const blinkInterval = 3000;
    const blinkDuration = 160;
    const blinkPhase = (now + (s.headBlinkOffset || 0)) % blinkInterval;
    const isBlinking = blinkPhase < blinkDuration;
    const blinkProgress = isBlinking ? (blinkPhase / blinkDuration) : 0;
    // head pulsing
    const basePulse = 1 + 0.08 * Math.sin(now / 220);
    const eatenSince = now - (s.lastEatAt || 0);
    const eatPulse = eatenSince < s.eatAnimDuration ? 1 + 0.25 * Math.sin((eatenSince / s.eatAnimDuration) * Math.PI * 2) : 1;

    // update and draw particles
    const dt = Math.max(16, (timestamp || performance.now()) - (s._lastRenderTime || (timestamp || performance.now())));
    s._lastRenderTime = timestamp || performance.now();
    if (s.particles && s.particles.length) {
      for (let pI = s.particles.length - 1; pI >= 0; pI--) {
        const p = s.particles[pI];
        p.ttl -= dt;
        if (p.ttl <= 0) { s.particles.splice(pI,1); continue; }
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        // simple gravity
        p.vy += 0.12 * (dt / 16);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.ttl / p.life);
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }

    for (let i=0;i<s.snake.length;i++){
      const seg = s.snake[i];
      const isHead = i === 0;
      const isTail = i === s.snake.length - 1;

      if (isHead) {
        // clearer, stronger glowing head using radial gradient
        const cx = seg.x*cs + cs/2;
        const cy = seg.y*cs + cs/2;
        const outerR = Math.max(6, Math.floor(cs * 0.9)) * basePulse * eatPulse;
        const innerR = Math.max(1, Math.floor(cs * 0.18));
        // head color: neon blue with white outline
        const headCore = '#66d9ff';
        try {
          const g = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(0.18, headCore);
          g.addColorStop(0.45, headCore);
          g.addColorStop(1, 'rgba(102,217,255,0.06)');
          ctx.fillStyle = g;
        } catch (e) {
          ctx.fillStyle = headCore;
        }

        // draw outer glowing square slightly larger for emphasis
        ctx.shadowColor = 'rgba(102,217,255,0.95)';
        ctx.shadowBlur = Math.max(14, Math.floor(cs * 0.9)) * basePulse * eatPulse;
        ctx.fillRect(seg.x*cs + 0.5, seg.y*cs + 0.5, cs-1, cs-1);
        ctx.shadowBlur = 0;

        // white outline stroke
        ctx.lineWidth = Math.max(1, Math.floor(cs * 0.08));
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeRect(seg.x*cs + 0.5, seg.y*cs + 0.5, cs-1, cs-1);

        // inner neon core
        ctx.fillStyle = headCore;
        const coreInset = Math.max(3, Math.floor(cs * 0.18));
        ctx.fillRect(seg.x*cs + coreInset, seg.y*cs + coreInset, Math.max(0, cs - coreInset*2), Math.max(0, cs - coreInset*2));

        // draw a small nose/point in movement direction to make facing obvious
        try {
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath();
          const left = seg.x*cs + 2;
          const top = seg.y*cs + 2;
          const right = seg.x*cs + cs - 2;
          const bottom = seg.y*cs + cs - 2;
          if (s.dir.x === 1) {
            ctx.moveTo(right, cy);
            ctx.lineTo(right - Math.max(4, Math.floor(cs*0.22)), cy - Math.max(4, Math.floor(cs*0.14)));
            ctx.lineTo(right - Math.max(4, Math.floor(cs*0.22)), cy + Math.max(4, Math.floor(cs*0.14)));
          } else if (s.dir.x === -1) {
            ctx.moveTo(left, cy);
            ctx.lineTo(left + Math.max(4, Math.floor(cs*0.22)), cy - Math.max(4, Math.floor(cs*0.14)));
            ctx.lineTo(left + Math.max(4, Math.floor(cs*0.22)), cy + Math.max(4, Math.floor(cs*0.14)));
          } else if (s.dir.y === 1) {
            ctx.moveTo(cx, bottom);
            ctx.lineTo(cx - Math.max(4, Math.floor(cs*0.14)), bottom - Math.max(4, Math.floor(cs*0.22)));
            ctx.lineTo(cx + Math.max(4, Math.floor(cs*0.14)), bottom - Math.max(4, Math.floor(cs*0.22)));
          } else if (s.dir.y === -1) {
            ctx.moveTo(cx, top);
            ctx.lineTo(cx - Math.max(4, Math.floor(cs*0.14)), top + Math.max(4, Math.floor(cs*0.22)));
            ctx.lineTo(cx + Math.max(4, Math.floor(cs*0.14)), top + Math.max(4, Math.floor(cs*0.22)));
          } else {
            // default: point up
            ctx.moveTo(cx, top);
            ctx.lineTo(cx - Math.max(4, Math.floor(cs*0.14)), top + Math.max(4, Math.floor(cs*0.22)));
            ctx.lineTo(cx + Math.max(4, Math.floor(cs*0.14)), top + Math.max(4, Math.floor(cs*0.22)));
          }
          ctx.closePath();
          ctx.fill();
        } catch (e) {}

        // draw larger eyes with bright highlight and dark pupil, support blinking
        try {
          const eyeOffset = Math.max(1, Math.floor(cs * 0.22));
          let ex1 = cx - eyeOffset, ey1 = cy - Math.floor(cs * 0.12);
          let ex2 = cx + eyeOffset, ey2 = cy - Math.floor(cs * 0.12);
          if (s.dir.x === 1) { ex1 = cx + eyeOffset; ex2 = cx + eyeOffset; ey1 = cy - Math.floor(cs * 0.12); ey2 = cy + Math.floor(cs * 0.12); }
          else if (s.dir.x === -1) { ex1 = cx - eyeOffset; ex2 = cx - eyeOffset; ey1 = cy - Math.floor(cs * 0.12); ey2 = cy + Math.floor(cs * 0.12); }
          else if (s.dir.y === 1) { ey1 = cy + eyeOffset; ey2 = cy + eyeOffset; ex1 = cx - Math.floor(cs * 0.16); ex2 = cx + Math.floor(cs * 0.16); }
          else if (s.dir.y === -1) { ey1 = cy - eyeOffset; ey2 = cy - eyeOffset; ex1 = cx - Math.floor(cs * 0.16); ex2 = cx + Math.floor(cs * 0.16); }

          const eyeR = Math.max(1, Math.floor(cs * 0.14));
          const blinkScale = isBlinking ? (1 - (0.95 * (1 - blinkProgress))) : 1; // squish during blink
          const eyeHeight = Math.max(1, Math.floor(eyeR * blinkScale));
          // white sclera (draw as ellipse when blinking)
          ctx.fillStyle = 'rgba(255,255,255,0.98)';
          ctx.beginPath(); ctx.ellipse(ex1, ey1, eyeR, eyeHeight, 0, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(ex2, ey2, eyeR, eyeHeight, 0, 0, Math.PI*2); ctx.fill();
          // dark pupil
          ctx.fillStyle = 'rgba(8,12,16,0.98)';
          const pupR = Math.max(1, Math.floor(eyeR * 0.5));
          ctx.beginPath(); ctx.arc(ex1, ey1, pupR, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(ex2, ey2, pupR, 0, Math.PI*2); ctx.fill();
        } catch (e) {}

        // draw mouth, animated when eating
        try {
          const mouthY = cy + Math.floor(cs * 0.22);
          const baseMouthW = Math.floor(cs * 0.36);
          let mouthOpen = 1 * (eatPulse - 1);
          if (eatenSince < s.eatAnimDuration) {
            mouthOpen = 1 + 1.2 * Math.sin((eatenSince / s.eatAnimDuration) * Math.PI * 2);
          } else {
            // small idle munching occasionally
            mouthOpen = 1 + 0.08 * Math.sin(now / 160);
          }
          const mh = Math.max(1, Math.floor((baseMouthW * 0.25) * Math.abs(mouthOpen)));
          ctx.fillStyle = 'rgba(8,12,16,0.96)';
          ctx.beginPath();
          ctx.ellipse(cx, mouthY, Math.floor(baseMouthW/2), mh, 0, 0, Math.PI*2);
          ctx.fill();
        } catch (e) {}

        // reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        continue;
      }

      // draw tapered tail across the last few segments to make tail direction/ending clearer
      const maxTaper = s.tailTaperSegments || 6;
      const tailTaper = Math.min(maxTaper, Math.max(1, s.snake.length - 1));
      const tailStartIndex = s.snake.length - tailTaper;
      if (i >= tailStartIndex) {
        const idxFromTail = (s.snake.length - 1) - i; // 0 for last segment
        // factor: 1.0 for last segment (most transparent/small), increasing for earlier
        const factor = (idxFromTail + 1) / (tailTaper + 1);
        const alpha = 0.25 + (0.7 * (1 - factor));
        const inset = Math.max(1, Math.floor(cs * (0.08 + 0.18 * factor)));
        ctx.fillStyle = `rgba(69,255,137,${alpha.toFixed(2)})`;
        ctx.shadowColor = `rgba(69,255,137,${Math.max(0.03, 0.12 * (1-factor)).toFixed(2)})`;
        ctx.shadowBlur = Math.max(2, Math.floor(6 * (1 - factor)));
        ctx.fillRect(seg.x*cs + inset, seg.y*cs + inset, Math.max(0, cs - inset*2), Math.max(0, cs - inset*2));
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        continue;
      }

      // body segments (gradient)
      const t = 1 - (i / Math.max(1, s.snake.length));
      const neon = `rgba(${Math.floor(69 + (1-t)*30)},${Math.floor(255 - (t*40))},${Math.floor(137 + (t*40))},1)`;
      ctx.fillStyle = neon;
      ctx.shadowColor = 'rgba(69,255,137,0.18)';
      ctx.shadowBlur = 8;
      ctx.fillRect(seg.x*cs + 1, seg.y*cs + 1, cs-2, cs-2);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
    // HUD overlay handled separately
  }
}

export {Game, createInitialState};
