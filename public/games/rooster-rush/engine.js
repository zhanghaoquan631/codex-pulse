// Independent platform-game simulation. All positions use world units; +Y is up.
// Actors use foot positions, coins use centers, and solid Y is its top surface.
const approach = (n, target, delta) => n < target ? Math.min(n + delta, target) : Math.max(n - delta, target);

export class GameEngine {
  constructor({ onEvent = () => {}, seed = 21 } = {}) {
    this.onEvent = onEvent;
    this.seed = seed;
    this.best = 0;
    this.reset();
  }

  reset() {
    this._rng = (this.seed >>> 0) || 21;
    this._id = 0;
    this.solids = [];
    this.coins = [];
    this.enemies = [];
    this.mushrooms = [];
    this.player = { x: 0, y: 0, vx: 0, vy: 0, big: false, grounded: true, facing: 1, invincible: 0, width: .9, height: 1.6 };
    this.score = 0;
    this.lives = 3;
    this.boostTime = 0;
    this.boostCharge = 0;
    this.boostGoal = 200;
    this.status = 'ready';
    this.maxX = 0;
    this.time = 0;
    this._safeX = 0;
    this._safeY = 0;
    this._jumpBuffer = 0;
    this._coyote = .1;
    this._won = false;
    this._end = 16;
    this._level = 0;
    this._chunk = 0;
    this._solid(1, 0, 30, 10, 'ground');
    this._coin(2.8, 2.2);
    this._generateAhead();
    return this;
  }

  start() {
    if (this.status === 'ready') this.status = 'playing';
    return this;
  }

  _random() {
    let x = this._rng;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this._rng = x >>> 0;
    return this._rng / 4294967296;
  }

  _solid(x, y, w, h, kind) {
    const s = { id: ++this._id, x, y, w, h, kind, used: false };
    this.solids.push(s);
    return s;
  }

  _coin(x, y) {
    this.coins.push({ id: ++this._id, x, y, active: true });
  }

  _enemy(x, type = 'goomba', direction = -1, y = 0) {
    const speed = type === 'koopa' ? 2.9 : type === 'spiky' ? 1.1 : 1.7;
    this.enemies.push({ id: ++this._id, x, y, vx: direction * speed, vy: 0, type, alive: true });
  }

  _emit(type, x = this.player.x, y = this.player.y, value) {
    const event = { type, x, y };
    if (value !== undefined) event.value = value;
    this.onEvent(event);
  }

  _addScore(value) {
    this.score += value;
    this.best = Math.max(this.best, this.score);
    this.boostCharge += value;
    this._maybeBoost();
    if (this.score >= 10000 && !this._won) {
      this._won = true;
      this.status = 'won';
      this._emit('win');
    }
  }

  _maybeBoost() {
    if (this.boostTime > 0 || this.boostCharge < this.boostGoal) return;
    this.boostCharge -= this.boostGoal;
    this.boostGoal = 300;
    this.boostTime = 5;
    this.player.vy = 0;
    this.player.grounded = false;
    this._emit('boost');
  }

  _generateAhead() {
    while (this._end < this.player.x + 128) {
      const x = this._end, y = this._level;
      const ground = (offset, width, top = y) => this._solid(x + offset + width / 2, top, width, 10 + top, 'ground');
      const line = (offset, count, top = y + 2.2, spacing = 1.6) => {
        for (let j = 0; j < count; j++) this._coin(x + offset + j * spacing, top);
      };
      const arc = (offset, span, count, top = y + 2) => {
        for (let j = 0; j < count; j++) {
          const t = j / (count - 1);
          this._coin(x + offset + t * span, top + Math.sin(t * Math.PI) * 1.6);
        }
      };
      // Two generous opening stretches teach movement before the terrain alternates.
      if (this._chunk === 0) {
        ground(0, 16);
        const block = this._solid(18, 4.5, 1.4, 1.4, 'question');
        block.reward = 'mushroom';
        line(4, 3);
        this._enemy(24, 'goomba');
      } else {
        const sequence = ['steps', 'platform', 'gap', 'tower', 'reward', 'pipe', 'double', 'enemies', 'steps', 'flat'];
        const kind = sequence[(this._chunk - 1) % sequence.length];
        if (kind === 'steps') {
          const up = y < .1;
          for (let j = 0; j < 8; j++) {
            const top = Math.max(0, y + (up ? 1 : -1) * Math.floor(j / 2) * 1.2);
            ground(j * 2, 2, top);
            if (j % 2) this._coin(x + j * 2 + 1, top + 2.2);
          }
          this._level = up ? y + 3.6 : Math.max(0, y - 3.6);
        } else if (kind === 'gap') {
          const gap = this._random() < .5 ? 2 : 4;
          const first = (16 - gap) / 2;
          ground(0, first); ground(first + gap, first);
          arc(first - .4, gap + .8, 3);
          line(1.5, 2);
        } else if (kind === 'double') {
          ground(0, 4); ground(12, 4);
          this._solid(x + 8, y + 2.6, 4, .6, 'platform');
          arc(3.5, 3, 3, y + 2.4); arc(9.5, 3, 3, y + 2.4);
          line(7, 2, y + 4.8);
        } else {
          ground(0, 16);
          if (kind === 'platform') {
            this._solid(x + 8, y + 3.4, 6, .6, 'platform');
            arc(5.5, 5, 4, y + 5.2);
          } else if (kind === 'tower') {
            this._solid(x + 5, y + 2, 2, 2, 'ground');
            this._coin(x + 5, y + 4.2);
            line(9, 3);
          } else if (kind === 'reward') {
            for (let j = 0; j < 3; j++) {
              const block = this._solid(x + 6 + j * 1.4, y + 4.5, 1.4, 1.4, j === 1 ? 'question' : 'brick');
              block.reward = j === 1 ? 'mushroom' : 'coin';
            }
            line(1.5, 2); line(11, 2);
          } else if (kind === 'pipe') {
            this._solid(x + 8, y + 2.2, 1.7, 2.2, 'pipe');
            this._coin(x + 8, y + 4.4);
            line(2, 3);
            this._enemy(x + 12, 'koopa', -1, y);
          } else if (kind === 'enemies') {
            this._enemy(x + 6, 'goomba', -1, y);
            this._enemy(x + 12, this._random() < .5 ? 'koopa' : 'spiky', -1, y);
            this.mushrooms.push({ id: ++this._id, x: x + 3, y: y + .1, vx: 3, vy: 0, active: true });
            line(2, 5);
          } else line(3, 5);
        }
      }
      this._end = x + 16;
      this._chunk++;
    }
  }

  step(dt, input = {}) {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // Fixed-size substeps prevent tunneling and keep the controls frame-rate independent.
    let remaining = Math.min(dt, .12);
    if (input.jumpPressed) this._jumpBuffer = .12;
    while (remaining > 1e-8 && this.status === 'playing') {
      const delta = Math.min(remaining, 1 / 120);
      this._step(delta, input);
      remaining -= delta;
    }
    this._generateAhead();
    this._prune();
  }

  _step(dt, input) {
    const p = this.player;
    p.height = p.big ? 2.4 : 1.6;
    p.width = .9;
    this.time += dt;
    p.invincible = Math.max(0, p.invincible - dt);
    this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);
    this._coyote = p.grounded ? .1 : Math.max(0, this._coyote - dt);

    this._maybeBoost();
    if (this.boostTime > 0) {
      this.boostTime = Math.max(0, this.boostTime - dt);
      p.vx = 24.7;
      p.facing = 1;
      p.grounded = false;
      const ahead = this.solids.filter(s => s.x + s.w / 2 >= p.x - 1 && s.x - s.w / 2 <= p.x + 12);
      const top = ahead.length ? Math.max(...ahead.map(s => s.y)) : this._safeY;
      const target = top + 2.3;
      const oldY = p.y;
      p.y += (target - p.y) * (1 - Math.exp(-5 * dt));
      p.vy = (p.y - oldY) / dt;
      p.x += p.vx * dt;
      this._collectCoins(true);
      this._updateEnemies(dt, oldY, true);
      this._updateMushrooms(dt);
      if (this.boostTime <= 0) {
        p.vx = 9.5;
        p.vy = 1;
        p.invincible = Math.max(p.invincible, 1);
        this._emit('boostend');
      }
    } else {
      const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
      p.vx = approach(p.vx, direction * 9.5, (direction ? 70 : 18) * dt);
      if (direction) p.facing = direction;
      if (this._jumpBuffer > 0 && this._coyote > 0) {
        p.vy = 19.5;
        p.grounded = false;
        this._jumpBuffer = 0;
        this._coyote = 0;
        this._emit('jump');
      }
      // Releasing early cuts upward momentum; holding sustains the full four-unit jump.
      if (!input.jumpHeld && p.vy > 8) p.vy = 8;
      p.vy -= 45 * dt;
      const oldX = p.x, oldY = p.y;
      this._movePlayer(dt, oldX, oldY);
      this._collectCoins(false);
      this._updateEnemies(dt, oldY);
      this._updateMushrooms(dt);
      if (p.y < -7) this._loseLife();
    }
    this.maxX = Math.max(this.maxX, p.x);
    if (p.grounded && p.x >= this._safeX) {
      const safeGround = this.solids.find(s => s.kind === 'ground' && Math.abs(s.y - p.y) < .05 && p.x > s.x - s.w / 2 + 1 && p.x < s.x + s.w / 2 - 1);
      if (safeGround) { this._safeX = p.x; this._safeY = p.y; }
    }
  }

  _movePlayer(dt, oldX, oldY) {
    const p = this.player, half = p.width / 2;
    p.x += p.vx * dt;
    for (const s of this.solids) {
      if (p.y >= s.y - .015 || p.y + p.height <= s.y - s.h + .015) continue;
      const left = s.x - s.w / 2, right = s.x + s.w / 2;
      if (p.x + half <= left || p.x - half >= right) continue;
      if (oldX + half <= left + .02 && p.vx > 0) { p.x = left - half; p.vx = 0; }
      else if (oldX - half >= right - .02 && p.vx < 0) { p.x = right + half; p.vx = 0; }
    }
    p.y += p.vy * dt;
    p.grounded = false;
    for (const s of this.solids) {
      if (p.x + half <= s.x - s.w / 2 + .015 || p.x - half >= s.x + s.w / 2 - .015) continue;
      const bottom = s.y - s.h;
      if (p.vy <= 0 && oldY >= s.y - .025 && p.y <= s.y) {
        p.y = s.y; p.vy = 0; p.grounded = true;
      } else if (p.vy > 0 && oldY + p.height <= bottom + .025 && p.y + p.height >= bottom) {
        p.y = bottom - p.height;
        p.vy = -.2;
        this._bump(s);
      }
    }
  }

  _bump(s) {
    this._emit('bump', s.x, s.y);
    s.bumpTime = this.time;
    if ((s.kind === 'question' || s.kind === 'brick') && !s.used) {
      s.used = true;
      if (s.reward === 'coin' || (s.kind === 'brick' && !s.reward)) {
        this._addScore(10);
        this._emit('coin', s.x, s.y + 1, 10);
      } else {
        this.mushrooms.push({ id: ++this._id, x: s.x, y: s.y + .05, vx: 3, vy: 3, active: true });
      }
    }
  }

  _collectCoins(magnet) {
    const p = this.player;
    for (const c of this.coins) {
      if (!c.active) continue;
      const dx = Math.abs(c.x - p.x), dy = Math.abs(c.y - (p.y + p.height * .5));
      const caught = magnet
        ? c.x <= p.x + 1.2 && Math.hypot(dx, dy) < 9
        : dx < p.width / 2 + .3 && dy < p.height / 2 + .24;
      if (caught) {
        c.active = false;
        this._addScore(10);
        this._emit('coin', c.x, c.y, 10);
      }
    }
  }

  _floorAt(x, y, margin = 0) {
    return this.solids.find(s => x >= s.x - s.w / 2 + margin && x <= s.x + s.w / 2 - margin && Math.abs(y - s.y) < .15);
  }

  _updateEnemies(dt, oldPlayerY, boosting = false) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive || Math.abs(e.x - p.x) > 45) continue;
      if (!this._floorAt(e.x + Math.sign(e.vx) * .55, e.y)) e.vx *= -1;
      e.x += e.vx * dt;
      const height = e.type === 'koopa' ? 1.08 : .68;
      if (boosting) {
        if (Math.abs(p.x - e.x) < 1.8 && Math.abs(p.y - e.y) < 8) {
          e.alive = false;
          e.diedAt = this.time;
          this._addScore(100);
          this._emit('stomp', e.x, e.y, 100);
        }
        continue;
      }
      if (Math.abs(p.x - e.x) > p.width / 2 + .34 || p.y >= e.y + height || p.y + p.height <= e.y) continue;
      if (p.vy < 0 && oldPlayerY >= e.y + height - .18 && e.type !== 'spiky') {
        e.alive = false;
        e.diedAt = this.time;
        p.y = e.y + height;
        p.vy = 12;
        p.grounded = false;
        this._addScore(100);
        this._emit('stomp', e.x, e.y, 100);
      } else if (p.invincible <= 0) {
        this._hurt(e.x);
        return;
      }
    }
  }

  _updateMushrooms(dt) {
    const p = this.player;
    for (const m of this.mushrooms) {
      if (!m.active) continue;
      const oldY = m.y, oldX = m.x;
      m.x += m.vx * dt;
      for (const s of this.solids) {
        if (m.y >= s.y - .02 || m.y + .8 <= s.y - s.h + .02) continue;
        const left = s.x - s.w / 2, right = s.x + s.w / 2;
        if (m.x + .35 <= left || m.x - .35 >= right) continue;
        if (oldX + .35 <= left + .03 && m.vx > 0) { m.x = left - .35; m.vx *= -1; }
        else if (oldX - .35 >= right - .03 && m.vx < 0) { m.x = right + .35; m.vx *= -1; }
      }
      m.vy = (m.vy || 0) - 35 * dt;
      m.y += m.vy * dt;
      for (const s of this.solids) {
        if (m.x + .3 < s.x - s.w / 2 || m.x - .3 > s.x + s.w / 2) continue;
        if (m.vy <= 0 && oldY >= s.y - .01 && m.y <= s.y) { m.y = s.y; m.vy = 0; }
      }
      if (m.y < -8) m.active = false;
      if (Math.abs(m.x - p.x) < p.width / 2 + .38 && m.y < p.y + p.height && m.y + .65 > p.y) {
        m.active = false;
        p.big = true;
        p.height = 2.4;
        p.width = .9;
        p.invincible = Math.max(p.invincible, .6);
        this._addScore(50);
        this._emit('grow', m.x, m.y, 50);
      }
    }
  }

  _hurt(sourceX) {
    const p = this.player;
    if (p.invincible > 0 || this.boostTime > 0) return;
    if (p.big) {
      p.big = false;
      p.height = 1.6;
      p.width = .9;
      p.invincible = 1.4;
      p.vx = p.x < sourceX ? -3 : 3;
      p.vy = 4;
      p.grounded = false;
      this._emit('hit');
    } else this._loseLife();
  }

  _loseLife() {
    const p = this.player;
    this.lives = Math.max(0, this.lives - 1);
    this._emit('death');
    this.boostTime = 0;
    if (this.lives === 0) {
      this.status = 'gameover';
      this._emit('gameover');
      return;
    }
    p.x = this._safeX;
    p.y = this._safeY + .02;
    p.vx = 0; p.vy = 0;
    p.big = false; p.height = 1.6; p.width = .9;
    p.grounded = true;
    p.invincible = 1.4;
    this._jumpBuffer = 0;
  }

  _prune() {
    const cutoff = this.maxX - 65;
    // Keep the respawn checkpoint and leftmost available terrain consistent.
    this.solids = this.solids.filter(s => s.x + s.w / 2 > cutoff);
    this.coins = this.coins.filter(c => c.x > cutoff);
    this.enemies = this.enemies.filter(e => e.x > cutoff);
    this.mushrooms = this.mushrooms.filter(m => m.x > cutoff && m.active);
    const first = this.solids.find(s => s.kind === 'ground');
    if (first) {
      const left = first.x - first.w / 2 + .5;
      if (this.player.x < left) { this.player.x = left; this.player.vx = Math.max(0, this.player.vx); }
      if (this._safeX < left) { this._safeX = left + .5; this._safeY = first.y; }
    }
  }
}
