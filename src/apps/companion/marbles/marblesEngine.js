/**
 * marblesEngine.js
 *
 * 「小伙伴弹珠」(祖玛式) 小游戏的纯 Canvas 引擎：不碰 React、不碰 Dexie，
 * 只管一局游戏本身的物理和碰撞（建轨道、推进链子、插入/消除、判定
 * 过关/失败）。关卡参数（颜色数/链长/速度/轨道）全部来自
 * marblesData.js，不在这里重复；画面效果（粒子/浮动分数）也在这个
 * 文件里直接画在 canvas 上，不额外经过 React state，跟
 * CatchGameEngine 的职责划分保持一致。
 *
 * 用法（在 CompanionMarblesModal.jsx 里）：
 *   const engine = new MarblesEngine({
 *     canvas, assets, onScoreChange, onComboChange, onRemainChange,
 *     onWin, onLose,
 *   });
 *   engine.resize();           // canvas 尺寸变化时调用（含首次挂载）
 *   engine.attachControls();   // 挂一次
 *   engine.prepareLevel(cfg);  // 选关 / 重来这一关：建轨道+清空链子，不开始推进
 *   engine.start();            // 开始推进链子（从"准备"进入"游玩"）
 *   engine.stop();             // 暂停推进（比如用户在游玩中关闭弹窗）
 *   engine.destroy();          // 组件卸载 / 关闭弹窗时调用
 *
 * assets 是 { avatar } 一个可选的 HTMLImageElement —— 头像加载完成后
 * 调用方直接把同一个 assets 对象上的 avatar 字段换成真正的图即可，
 * 这个引擎每帧都读 this.assets.avatar，不需要额外的 setter。
 */

import { CANDY_COLORS } from './marblesData';

const W = 360;
const H = 520;
const CX = 180;
const CY = 282;
const D = 26;
const R = D / 2;
const RUSH = 160;
const CLOSE = 520;
const GAP_T = 6;
const SHOT_V = 640;

const KEYS = ['heart', 'sky', 'mint', 'butter', 'lav'];

/* ---------- 轨道：三条固定路线，起点都在画面左侧外、终点都是中央的洞 ---------- */

function spiralRaw() {
  const R0 = 158; const R1 = 80; const turns = 1.8; const th0 = -Math.PI / 2; const th1 = th0 + turns * Math.PI * 2;
  const raw = [];
  for (let x = -60; x < CX; x += 4) raw.push({ x, y: CY - R0 });
  const steps = Math.ceil(turns * 360);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps; const th = th0 + (th1 - th0) * t; const r = R0 + (R1 - R0) * t;
    raw.push({ x: CX + r * Math.cos(th), y: CY + r * Math.sin(th) });
  }
  return raw;
}
function roundedPoly(P, r) {
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i += 1) {
    const a = P[i - 1]; const b = P[i]; const c = P[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y); const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1 = { x: b.x + ((a.x - b.x) / l1) * rr, y: b.y + ((a.y - b.y) / l1) * rr };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * rr, y: b.y + ((c.y - b.y) / l2) * rr };
    out.push(p1);
    for (let t = 1; t <= 10; t += 1) {
      const u = t / 10;
      out.push({
        x: (1 - u) ** 2 * p1.x + 2 * (1 - u) * u * b.x + u * u * p2.x,
        y: (1 - u) ** 2 * p1.y + 2 * (1 - u) * u * b.y + u * u * p2.y,
      });
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
const TRACKS = {
  spiral: spiralRaw,
  square: () => roundedPoly([
    { x: -60, y: 110 }, { x: 320, y: 110 }, { x: 320, y: 450 }, { x: 40, y: 450 }, { x: 40, y: 170 },
    { x: 265, y: 170 }, { x: 265, y: 390 }, { x: 95, y: 390 }, { x: 95, y: 290 },
  ], 44),
  snake: () => roundedPoly([
    { x: -60, y: 70 }, { x: 310, y: 70 }, { x: 310, y: 140 }, { x: 50, y: 140 }, { x: 50, y: 420 },
    { x: 310, y: 420 }, { x: 310, y: 478 }, { x: 120, y: 478 },
  ], 40),
};

export class MarblesEngine {
  constructor({
    canvas, assets, onScoreChange, onComboChange, onRemainChange, onWin, onLose,
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets || {};
    this.onScoreChange = onScoreChange || (() => {});
    this.onComboChange = onComboChange || (() => {});
    this.onRemainChange = onRemainChange || (() => {});
    this.onWin = onWin || (() => {});
    this.onLose = onLose || (() => {});

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.cfg = null;
    this.pts = [];
    this.L = 0;
    this.trackPath = null;

    this.state = 'idle'; // idle | ready | playing | win | lose
    this.chain = [];
    this.shots = [];
    this.parts = [];
    this.floats = [];
    this.cur = 'heart';
    this.nxt = 'sky';
    this.aim = -Math.PI / 2;
    this.cd = 0;
    this.kick = 0;
    this.time = 0;
    this.score = 0;
    this.bestCombo = 0;
    this.chainCombo = 0;

    this.rafId = null;
    this.lastTs = 0;

    this._toLocal = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
    };
    this._onPointerMove = (e) => {
      const p = this._toLocal(e);
      this.aim = Math.atan2(p.y - CY, p.x - CX);
    };
    this._onPointerDown = (e) => {
      e.preventDefault();
      const p = this._toLocal(e);
      this.aim = Math.atan2(p.y - CY, p.x - CX);
      this._shoot();
    };
  }

  /* ---------------- 生命周期 ---------------- */

  // 画布内部始终是固定的 360x520 逻辑坐标系，展示尺寸完全交给 CSS（width:100% +
  // aspect-ratio），dpr 只用来让这套固定分辨率在高清屏上不糊——跟 CSS 实际显示
  // 尺寸无关，所以不用像 CatchGameEngine 那样每次读 getBoundingClientRect() 来
  // 重新计算内部分辨率，调用一次就够了（屏幕旋转/窗口变化不影响逻辑坐标系）。
  resize() {
    this.canvas.width = W * this.dpr;
    this.canvas.height = H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  attachControls() {
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    if (!this.rafId) {
      this.lastTs = performance.now();
      this.rafId = requestAnimationFrame((ts) => this._loop(ts));
    }
  }

  detachControls() {
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.detachControls();
  }

  /* ---------------- 关卡 ---------------- */

  prepareLevel(levelCfg) {
    this.cfg = levelCfg;
    this._buildTrack(levelCfg.track);
    const cols = this._makeColors(levelCfg.count, levelCfg.colors);
    this.chain = cols.map((c, i) => ({
      c, d: 300 - i * D, rd: 300 - i * D, seeking: false, born: 1,
    }));
    this.shots = []; this.parts = []; this.floats = [];
    this.score = 0; this.bestCombo = 0; this.chainCombo = 0; this.cd = 0; this.kick = 0;
    this.cur = this._pickColor(); this.nxt = this._pickColor();
    this.state = 'ready';
    this.onScoreChange(0);
    this.onComboChange(0);
    this.onRemainChange(100);
  }

  start() {
    if (!this.cfg) return;
    this.state = 'playing';
  }

  stop() {
    if (this.state === 'playing') this.state = 'ready';
  }

  /* ---------------- 轨道构建 ---------------- */

  _buildTrack(kind) {
    const raw = TRACKS[kind]();
    this.pts = [{ x: raw[0].x, y: raw[0].y, d: 0 }];
    let d = 0;
    for (let i = 1; i < raw.length; i += 1) {
      d += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
      this.pts.push({ x: raw[i].x, y: raw[i].y, d });
    }
    this.L = d;
    this.trackPath = new Path2D();
    this.pts.forEach((p, i) => (i ? this.trackPath.lineTo(p.x, p.y) : this.trackPath.moveTo(p.x, p.y)));
  }

  _posAt(d0) {
    let d = d0;
    if (d < 0) d = 0;
    if (d > this.L) d = this.L;
    let lo = 0; let hi = this.pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.pts[m].d <= d) lo = m; else hi = m; }
    const a = this.pts[lo]; const b = this.pts[hi]; const seg = (b.d - a.d) || 1; const t = (d - a.d) / seg;
    return {
      x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: (b.x - a.x) / seg, ty: (b.y - a.y) / seg,
    };
  }

  /* ---------------- 颜色 ---------------- */

  _makeColors(n, k) {
    const arr = [];
    for (let i = 0; i < n; i += 1) {
      let c = null;
      for (let tries = 0; tries < 12; tries += 1) {
        c = (i > 0 && Math.random() < 0.38) ? arr[i - 1] : KEYS[(Math.random() * k) | 0];
        if (!(i > 1 && c === arr[i - 1] && c === arr[i - 2])) break;
      }
      if (i > 1 && c === arr[i - 1] && c === arr[i - 2]) c = KEYS.slice(0, k).find((x) => x !== c);
      arr.push(c);
    }
    return arr;
  }

  _pickColor() {
    const present = [...new Set(this.chain.filter((b) => b.rd >= 0).map((b) => b.c))];
    const pool = present.length ? present : KEYS.slice(0, this.cfg.colors);
    return pool[(Math.random() * pool.length) | 0];
  }

  /* ---------------- 链子逻辑 ---------------- */

  _pushPass() {
    for (let i = this.chain.length - 1; i >= 1; i -= 1) {
      if (this.chain[i - 1].d < this.chain[i].d + D - 0.01) this.chain[i - 1].d = this.chain[i].d + D;
    }
  }

  _pop(lo, hi, combo) {
    const removed = this.chain.splice(lo, hi - lo + 1);
    let mx = 0; let my = 0; let n = 0;
    removed.forEach((b) => {
      if (b.rd < 0) return;
      const p = this._posAt(b.rd); mx += p.x; my += p.y; n += 1;
      for (let k = 0; k < 6; k += 1) {
        const a = Math.random() * 6.283; const s = 40 + Math.random() * 110;
        this.parts.push({
          x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.55 + Math.random() * 0.3, t: 0, c: b.c,
        });
      }
    });
    const gain = removed.length * 10 * Math.max(1, combo);
    this.score += gain;
    if (combo > this.bestCombo) { this.bestCombo = combo; this.onComboChange(this.bestCombo); }
    if (n) {
      this.floats.push({
        x: mx / n, y: my / n, t: 0, text: `+${gain}`,
      });
      if (combo > 1) this.floats.push({
        x: mx / n, y: my / n - 18, t: 0, text: `连锁 ×${combo}`, big: true,
      });
    }
    this.onScoreChange(this.score);
  }

  _tryMatch(i, combo) {
    if (i < 0 || i >= this.chain.length) return false;
    const c = this.chain[i].c;
    let lo = i; let hi = i;
    while (lo > 0 && this.chain[lo - 1].c === c) lo -= 1;
    while (hi < this.chain.length - 1 && this.chain[hi + 1].c === c) hi += 1;
    if (hi - lo + 1 >= 3) { this._pop(lo, hi, combo); return true; }
    return false;
  }

  _insertShot(j, s) {
    const b = this.chain[j]; const p = this._posAt(b.rd);
    const front = (s.x - p.x) * p.tx + (s.y - p.y) * p.ty > 0;
    const idx = front ? j : j + 1;
    const nb = {
      c: s.c, d: front ? b.d + D : b.d - D, rd: b.rd + (front ? D * 0.7 : -D * 0.7), seeking: false, born: 0,
    };
    this.chain.splice(idx, 0, nb);
    this._pushPass();
    this.chainCombo = 0;
    if (this._tryMatch(idx, 1)) this.chainCombo = 1;
  }

  _shoot() {
    if (this.state !== 'playing' || this.cd > 0) return;
    const m = { x: CX + Math.cos(this.aim) * 44, y: CY + Math.sin(this.aim) * 44 };
    this.shots.push({
      x: m.x, y: m.y, vx: Math.cos(this.aim) * SHOT_V, vy: Math.sin(this.aim) * SHOT_V, c: this.cur,
    });
    this.cur = this.nxt; this.nxt = this._pickColor(); this.cd = 0.22; this.kick = 1;
  }

  /* ---------------- 主循环 ---------------- */

  _update(dt) {
    this.time += dt;
    this.cd = Math.max(0, this.cd - dt); this.kick = Math.max(0, this.kick - dt * 7);
    this.parts.forEach((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; });
    this.parts = this.parts.filter((p) => p.t < p.life);
    this.floats.forEach((f) => { f.t += dt; });
    this.floats = this.floats.filter((f) => f.t < 0.9);
    if (this.state !== 'playing') return;

    this._pushPass();
    if (this.chain.length) {
      let gap = false;
      for (let i = 1; i < this.chain.length; i += 1) if (this.chain[i - 1].d - this.chain[i].d - D > GAP_T) { gap = true; break; }
      const lead = this.chain[0];
      if (!gap) lead.d += (lead.d < 300 ? RUSH : this.cfg.speed) * dt;
      const joins = [];
      for (let i = 1; i < this.chain.length; i += 1) {
        const prev = this.chain[i - 1]; const b = this.chain[i]; const g = prev.d - b.d - D;
        if (g > GAP_T) { b.seeking = true; b.d += Math.min(g, CLOSE * dt); } else {
          if (g > 0) b.d = prev.d - D;
          if (b.seeking) { b.seeking = false; joins.push(i); }
        }
      }
      for (let k = joins.length - 1; k >= 0; k -= 1) {
        const i = joins[k];
        if (i > 0 && i < this.chain.length && this.chain[i].c === this.chain[i - 1].c) {
          if (this._tryMatch(i, Math.max(2, this.chainCombo + 1))) this.chainCombo = Math.max(2, this.chainCombo + 1);
        }
      }
    }
    this.chain.forEach((b) => {
      b.rd += (b.d - b.rd) * Math.min(1, dt * 30);
      if (Math.abs(b.d - b.rd) < 0.05) b.rd = b.d;
      if (b.born < 1) b.born = Math.min(1, b.born + dt * 7);
    });

    for (const s of this.shots) {
      const steps = Math.max(1, Math.ceil((SHOT_V * dt) / 6));
      for (let k = 0; k < steps && !s.dead; k += 1) {
        s.x += (s.vx * dt) / steps; s.y += (s.vy * dt) / steps;
        if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) { s.dead = true; break; }
        for (let i = 0; i < this.chain.length; i += 1) {
          const b = this.chain[i]; if (b.rd < 0) continue; // eslint-disable-line no-continue
          const p = this._posAt(b.rd);
          if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < (D * 0.9) ** 2) { this._insertShot(i, s); s.dead = true; break; }
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);

    this.onRemainChange(Math.max(0, Math.round((this.chain.length / this.cfg.count) * 100)));

    if (this.chain.length === 0) {
      this.state = 'win';
      this.onWin({ score: this.score, bestCombo: this.bestCombo });
    } else if (this.chain[0].d >= this.L - 8) {
      this.state = 'lose';
      this.onLose({ score: this.score });
    }
  }

  /* ---------------- 绘制 ---------------- */

  _ell(x, y, rx, ry, rot, fill, stroke) {
    const { ctx } = this;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, 6.283);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  _drawBall(x, y, r, key, s = 1) {
    const { ctx } = this;
    const c = CANDY_COLORS[key];
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(90,70,150,0.16)'; ctx.beginPath(); ctx.ellipse(1.5, r * 0.78, r * 0.86, r * 0.38, 0, 0, 6.283); ctx.fill();
    let g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, c.l); g.addColorStop(0.55, c.m); g.addColorStop(1, c.d);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
    g = ctx.createRadialGradient(r * 0.35, r * 0.4, 0, r * 0.35, r * 0.4, r * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r - 0.6, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0.15 * Math.PI, 0.5 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.beginPath(); ctx.ellipse(-r * 0.36, -r * 0.42, r * 0.3, r * 0.17, -0.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(-r * 0.02, -r * 0.66, r * 0.07, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  _drawBackground() {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#E4F2FF'); g.addColorStop(1, '#F6E9FB');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 18; i += 1) { const x = (i * 97) % W; const y = (i * 61) % H; ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, 6.283); ctx.fill(); }
  }

  _drawTrack() {
    const { ctx } = this;
    if (!this.trackPath) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.translate(0, 3); ctx.strokeStyle = 'rgba(110,90,170,0.16)'; ctx.lineWidth = 40; ctx.stroke(this.trackPath); ctx.translate(0, -3);
    ctx.strokeStyle = '#DDD5F3'; ctx.lineWidth = 38; ctx.stroke(this.trackPath);
    ctx.strokeStyle = '#BFB4E4'; ctx.lineWidth = 31; ctx.stroke(this.trackPath);
    ctx.strokeStyle = '#B2A6DD'; ctx.lineWidth = 27; ctx.stroke(this.trackPath);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.setLineDash([3, 10]); ctx.stroke(this.trackPath);
    ctx.restore();
  }

  _drawHole() {
    if (!this.pts.length) return;
    const { ctx } = this;
    const p = this._posAt(this.L);
    ctx.save(); ctx.translate(p.x, p.y);
    this._ell(0, 0, 25, 25, 0, '#D3C9EE', '#B2A6DD');
    const g = ctx.createRadialGradient(0, -3, 2, 0, 0, 20);
    g.addColorStop(0, '#7561A8'); g.addColorStop(1, '#382C61');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 19, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    [[-6, -5, 1.6], [5, 3, 1.2], [-2, 8, 1.1]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); });
    ctx.restore();
  }

  _drawPedestal() {
    const { ctx } = this;
    ctx.save(); ctx.translate(CX, CY);
    this._ell(0, 4, 54, 52, 0, 'rgba(110,90,170,0.16)');
    this._ell(0, 0, 50, 50, 0, '#E6DFF7', '#C9BFE8');
    this._ell(0, 0, 41, 41, 0, '#D9D0F0', '#C2B7E5');
    ctx.fillStyle = '#BDB1E0';
    for (let i = 0; i < 16; i += 1) {
      ctx.save(); ctx.rotate((i / 16) * 6.283); ctx.translate(0, -45.5);
      ctx.beginPath(); ctx.roundRect(-2.5, -2.5, 5, 5, 1.5); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = '#C7BCE7'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, 6.283); ctx.stroke();
    ctx.restore();
  }

  _drawAvatar() {
    const { ctx } = this;
    const r = 27;
    const avatarImg = this.assets.avatar;
    ctx.save(); ctx.translate(CX, CY);
    const sc0 = (1 + this.kick * 0.05) * (1 + Math.sin(this.time * 3) * 0.012);
    ctx.scale(sc0, sc0);
    ctx.save(); ctx.rotate(this.aim);
    ctx.fillStyle = '#FFB3C2'; ctx.strokeStyle = '#E4607F'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(r - 2, -10); ctx.quadraticCurveTo(r + 16, -8, r + 20, 0); ctx.quadraticCurveTo(r + 16, 8, r - 2, 10); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
    this._ell(0, 3, r + 5, r + 5, 0, 'rgba(110,90,170,0.2)');
    this._ell(0, 0, r + 4, r + 4, 0, '#FFFFFF', '#E2D9F7');
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.clip();
    if (avatarImg && avatarImg.complete && avatarImg.naturalWidth) {
      const iw = avatarImg.naturalWidth; const ih = avatarImg.naturalHeight; const k = Math.max((2 * r) / iw, (2 * r) / ih);
      const w = iw * k; const h = ih * k;
      ctx.drawImage(avatarImg, -w / 2, -r - (h - 2 * r) * 0.3, w, h);
    } else {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#CBF1DE'); g.addColorStop(1, '#8EDDB8');
      ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      this._ell(-9, -3, 3.2, 3.8, 0, '#3B3156'); this._ell(9, -3, 3.2, 3.8, 0, '#3B3156');
      this._ell(-15, 5, 4.5, 3, 0, 'rgba(255,143,166,0.55)'); this._ell(15, 5, 4.5, 3, 0, 'rgba(255,143,166,0.55)');
      ctx.strokeStyle = '#3B3156'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, 7); ctx.quadraticCurveTo(0, 12, 5, 7); ctx.stroke();
    }
    ctx.restore(); ctx.restore();
  }

  _render() {
    const { ctx } = this;
    this._drawBackground();
    if (!this.cfg) return;
    this._drawTrack(); this._drawHole();
    for (let i = this.chain.length - 1; i >= 0; i -= 1) {
      const b = this.chain[i]; if (b.rd < 0) continue; // eslint-disable-line no-continue
      const p = this._posAt(b.rd);
      if (p.x < -R || p.x > W + R) continue; // eslint-disable-line no-continue
      this._drawBall(p.x, p.y, R, b.c, 0.6 + 0.4 * b.born);
    }
    this._drawPedestal(); this._drawAvatar();
    const mx = CX + Math.cos(this.aim) * (44 - this.kick * 4);
    const my = CY + Math.sin(this.aim) * (44 - this.kick * 4);
    ctx.save(); ctx.strokeStyle = 'rgba(110,90,170,0.35)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.setLineDash([1, 8]);
    ctx.beginPath(); ctx.moveTo(mx + Math.cos(this.aim) * 20, my + Math.sin(this.aim) * 20); ctx.lineTo(mx + Math.cos(this.aim) * 110, my + Math.sin(this.aim) * 110); ctx.stroke(); ctx.restore();
    this._drawBall(mx, my, R, this.cur);
    this.shots.forEach((s) => this._drawBall(s.x, s.y, R, s.c));
    this.parts.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = CANDY_COLORS[p.c].m; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.283); ctx.fill();
    });
    ctx.globalAlpha = 1;
    this.floats.forEach((f) => {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 0.9);
      ctx.font = `${f.big ? '20px' : '16px'} "ZCOOL KuaiLe", "PingFang SC", sans-serif`;
      ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.fillStyle = f.big ? '#D95F72' : '#3B3156';
      const y = f.y - f.t * 28; ctx.strokeText(f.text, f.x, y); ctx.fillText(f.text, f.x, y);
    });
    ctx.globalAlpha = 1;
    ctx.font = '12px "PingFang SC", system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#7A6FA0';
    ctx.fillText('下一颗', W - 44, 26); this._drawBall(W - 24, 22, 9, this.nxt);
  }

  _loop(now) {
    const dt = Math.min(0.025, (now - this.lastTs) / 1000); this.lastTs = now;
    this._update(dt);
    this._render();
    this.rafId = requestAnimationFrame((t) => this._loop(t));
  }
}

export default MarblesEngine;