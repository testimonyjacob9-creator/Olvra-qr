/* Lumora chess engine. Rules + search in one file.
   Main thread: window.Chess (rules, SAN, status).  Web Worker: loaded via new Worker('/chess-engine.js'),
   answers {id,fen,depth,ms,margin,blunder,rep} with {id,move,score,depth}. */
(function (root) {
'use strict';
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const VAL = [0, 100, 320, 330, 500, 900, 0];
const FILES = 'abcdefgh';
const sqName = (s) => FILES[s & 7] + (8 - (s >> 3));
const nameSq = (n) => (8 - +n[1]) * 8 + FILES.indexOf(n[0]);

// ---- precomputed tables ----
const KNIGHT = [], KING = [], RAYS = [];
const DIRS = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [-1, -1], [1, 1], [1, -1]]; // 0-3 rook, 4-7 bishop
for (let s = 0; s < 64; s++) {
  const r = s >> 3, c = s & 7;
  KNIGHT[s] = []; KING[s] = []; RAYS[s] = [];
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) KNIGHT[s].push(rr * 8 + cc);
  }
  DIRS.forEach(([dr, dc], i) => {
    const ray = []; let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { ray.push(rr * 8 + cc); rr += dr; cc += dc; }
    RAYS[s][i] = ray; if (ray.length) KING[s].push(ray[0]);
  });
}
const CRM = new Int8Array(64); CRM[63] = 1; CRM[56] = 2; CRM[7] = 4; CRM[0] = 8; CRM[60] = 3; CRM[4] = 12;

// move = from | to<<6 | promo<<12 | flag<<15   flag: 1 ep, 2 O-O, 3 O-O-O, 4 double push
const mk = (f, t, pr, fl) => f | (t << 6) | (pr << 12) | (fl << 15);
const mFrom = (m) => m & 63, mTo = (m) => (m >> 6) & 63, mPromo = (m) => (m >> 12) & 7, mFlag = (m) => (m >> 15) & 7;

function Pos() { this.b = new Int8Array(64); this.side = 1; this.cs = 0; this.ep = -1; this.half = 0; this.full = 1; this.kw = 60; this.kb = 4; }

Pos.prototype.load = function (fen) {
  const parts = fen.trim().split(/\s+/); this.b.fill(0);
  const map = { p: P, n: N, b: B, r: R, q: Q, k: K };
  let i = 0;
  for (const ch of parts[0]) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { i += +ch; continue; }
    const t = map[ch.toLowerCase()], v = ch === ch.toUpperCase() ? t : -t;
    this.b[i] = v; if (v === K) this.kw = i; if (v === -K) this.kb = i; i++;
  }
  this.side = parts[1] === 'b' ? -1 : 1;
  const c = parts[2] || '-'; this.cs = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
  this.ep = parts[3] && parts[3] !== '-' ? nameSq(parts[3]) : -1;
  this.half = +parts[4] || 0; this.full = +parts[5] || 1;
  return this;
};
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
Pos.prototype.fen = function () {
  const sym = '.pnbrqk'; let out = '';
  for (let r = 0; r < 8; r++) {
    let e = 0;
    for (let c = 0; c < 8; c++) {
      const v = this.b[r * 8 + c];
      if (!v) { e++; continue; }
      if (e) { out += e; e = 0; }
      const ch = sym[Math.abs(v)]; out += v > 0 ? ch.toUpperCase() : ch;
    }
    if (e) out += e; if (r < 7) out += '/';
  }
  const cs = (this.cs & 1 ? 'K' : '') + (this.cs & 2 ? 'Q' : '') + (this.cs & 4 ? 'k' : '') + (this.cs & 8 ? 'q' : '') || '-';
  return `${out} ${this.side === 1 ? 'w' : 'b'} ${cs} ${this.ep < 0 ? '-' : sqName(this.ep)} ${this.half} ${this.full}`;
};
Pos.prototype.key = function () { return this.fen().split(' ').slice(0, 4).join(' '); };

Pos.prototype.attacked = function (sq, by) {
  const b = this.b, r = sq >> 3, c = sq & 7;
  if (by === 1) { if (r < 7) { if (c > 0 && b[sq + 7] === P) return true; if (c < 7 && b[sq + 9] === P) return true; } }
  else if (r > 0) { if (c > 0 && b[sq - 9] === -P) return true; if (c < 7 && b[sq - 7] === -P) return true; }
  const kn = KNIGHT[sq]; for (let i = 0; i < kn.length; i++) if (b[kn[i]] === by * N) return true;
  const kg = KING[sq]; for (let i = 0; i < kg.length; i++) if (b[kg[i]] === by * K) return true;
  const rays = RAYS[sq];
  for (let d = 0; d < 8; d++) {
    const ray = rays[d];
    for (let i = 0; i < ray.length; i++) {
      const v = b[ray[i]]; if (!v) continue;
      if (v * by > 0) { const t = v * by; if (t === Q || (d < 4 ? t === R : t === B)) return true; }
      break;
    }
  }
  return false;
};
Pos.prototype.inCheck = function (side) { return this.attacked(side === 1 ? this.kw : this.kb, -side); };

Pos.prototype.gen = function (capsOnly) {
  const mv = [], b = this.b, s = this.side;
  for (let f = 0; f < 64; f++) {
    const p = b[f]; if (p * s <= 0) continue; const t = p * s;
    if (t === P) {
      const r = f >> 3, c = f & 7, dir = -8 * s, promoRow = s === 1 ? 0 : 7, startRow = s === 1 ? 6 : 1, one = f + dir;
      if (!b[one]) {
        if ((one >> 3) === promoRow) { for (let pr = 5; pr >= 2; pr--) mv.push(mk(f, one, pr, 0)); }
        else { if (!capsOnly) { mv.push(mk(f, one, 0, 0)); if (r === startRow && !b[one + dir]) mv.push(mk(f, one + dir, 0, 4)); } }
      }
      for (let dc = -1; dc <= 1; dc += 2) {
        const cc = c + dc; if (cc < 0 || cc > 7) continue; const to = one + dc;
        if (b[to] * s < 0) { if ((to >> 3) === promoRow) { for (let pr = 5; pr >= 2; pr--) mv.push(mk(f, to, pr, 0)); } else mv.push(mk(f, to, 0, 0)); }
        else if (to === this.ep && !b[to]) mv.push(mk(f, to, 0, 1));
      }
    } else if (t === N || t === K) {
      const list = t === N ? KNIGHT[f] : KING[f];
      for (let i = 0; i < list.length; i++) { const to = list[i], x = b[to] * s; if (capsOnly ? x < 0 : x <= 0) mv.push(mk(f, to, 0, 0)); }
      if (t === K && !capsOnly) {
        if (s === 1 && f === 60 && !this.attacked(60, -1)) {
          if ((this.cs & 1) && !b[61] && !b[62] && b[63] === R && !this.attacked(61, -1) && !this.attacked(62, -1)) mv.push(mk(60, 62, 0, 2));
          if ((this.cs & 2) && !b[59] && !b[58] && !b[57] && b[56] === R && !this.attacked(59, -1) && !this.attacked(58, -1)) mv.push(mk(60, 58, 0, 3));
        } else if (s === -1 && f === 4 && !this.attacked(4, 1)) {
          if ((this.cs & 4) && !b[5] && !b[6] && b[7] === -R && !this.attacked(5, 1) && !this.attacked(6, 1)) mv.push(mk(4, 6, 0, 2));
          if ((this.cs & 8) && !b[3] && !b[2] && !b[1] && b[0] === -R && !this.attacked(3, 1) && !this.attacked(2, 1)) mv.push(mk(4, 2, 0, 3));
        }
      }
    } else {
      const from = t === B ? 4 : 0, to2 = t === R ? 4 : 8, rays = RAYS[f];
      for (let d = from; d < to2; d++) {
        const ray = rays[d];
        for (let i = 0; i < ray.length; i++) {
          const to = ray[i], x = b[to] * s;
          if (x === 0) { if (!capsOnly) mv.push(mk(f, to, 0, 0)); continue; }
          if (x < 0) mv.push(mk(f, to, 0, 0));
          break;
        }
      }
    }
  }
  return mv;
};

Pos.prototype.make = function (m) {
  const f = m & 63, t = (m >> 6) & 63, pr = (m >> 12) & 7, fl = (m >> 15) & 7, b = this.b, p = b[f], s = this.side, ap = Math.abs(p);
  const u = { m, cap: b[t], cs: this.cs, ep: this.ep, half: this.half, p, cpSq: -1 };
  b[t] = p; b[f] = 0;
  if (pr) b[t] = s * pr;
  if (fl === 1) { const cp = t + 8 * s; u.cap = b[cp]; u.cpSq = cp; b[cp] = 0; }
  else if (fl === 2) { if (s === 1) { b[61] = b[63]; b[63] = 0; } else { b[5] = b[7]; b[7] = 0; } }
  else if (fl === 3) { if (s === 1) { b[59] = b[56]; b[56] = 0; } else { b[3] = b[0]; b[0] = 0; } }
  if (ap === K) { if (s === 1) this.kw = t; else this.kb = t; }
  this.cs &= ~(CRM[f] | CRM[t]);
  this.ep = fl === 4 ? (f + t) >> 1 : -1;
  this.half = (ap === P || u.cap) ? 0 : this.half + 1;
  if (s === -1) this.full++;
  this.side = -s;
  return u;
};
Pos.prototype.unmake = function (u) {
  const m = u.m, f = m & 63, t = (m >> 6) & 63, fl = (m >> 15) & 7, b = this.b, s = -this.side;
  this.side = s; if (s === -1) this.full--;
  b[f] = u.p;
  if (fl === 1) { b[t] = 0; b[u.cpSq] = u.cap; } else b[t] = u.cap;
  if (fl === 2) { if (s === 1) { b[63] = b[61]; b[61] = 0; } else { b[7] = b[5]; b[5] = 0; } }
  else if (fl === 3) { if (s === 1) { b[56] = b[59]; b[59] = 0; } else { b[0] = b[3]; b[3] = 0; } }
  if (Math.abs(u.p) === K) { if (s === 1) this.kw = f; else this.kb = f; }
  this.cs = u.cs; this.ep = u.ep; this.half = u.half;
};
Pos.prototype.legal = function () {
  const out = [], s = this.side;
  for (const m of this.gen(false)) {
    const u = this.make(m), ok = !this.attacked(s === 1 ? this.kw : this.kb, -s);
    this.unmake(u); if (ok) out.push(m);
  }
  return out;
};
Pos.prototype.insufficient = function () {
  let minors = 0;
  for (let i = 0; i < 64; i++) { const a = Math.abs(this.b[i]); if (a === P || a === R || a === Q) return false; if (a === N || a === B) minors++; }
  return minors <= 1;
};
// 'mate' | 'stalemate' | 'fifty' | 'material' | null  (repetition is tracked by the UI)
Pos.prototype.status = function () {
  if (!this.legal().length) return this.inCheck(this.side) ? 'mate' : 'stalemate';
  if (this.half >= 100) return 'fifty';
  if (this.insufficient()) return 'material';
  return null;
};
Pos.prototype.san = function (m, legals) {
  const f = mFrom(m), t = mTo(m), pr = mPromo(m), fl = mFlag(m), p = Math.abs(this.b[f]);
  let s;
  if (fl === 2) s = 'O-O'; else if (fl === 3) s = 'O-O-O';
  else {
    const cap = this.b[t] !== 0 || fl === 1;
    if (p === P) { s = (cap ? FILES[f & 7] + 'x' : '') + sqName(t); if (pr) s += '=' + ' PNBRQK'[pr]; }
    else {
      s = ' PNBRQK'[p];
      const others = (legals || this.legal()).filter((o) => o !== m && mTo(o) === t && Math.abs(this.b[mFrom(o)]) === p);
      if (others.length) {
        const sameFile = others.some((o) => (mFrom(o) & 7) === (f & 7)), sameRank = others.some((o) => (mFrom(o) >> 3) === (f >> 3));
        if (!sameFile) s += FILES[f & 7]; else if (!sameRank) s += 8 - (f >> 3); else s += sqName(f);
      }
      s += (cap ? 'x' : '') + sqName(t);
    }
  }
  const u = this.make(m);
  if (this.inCheck(this.side)) s += this.legal().length ? '+' : '#';
  this.unmake(u);
  return s;
};

// ---- evaluation ----
const T = {
  [P]: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  [N]: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  [B]: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  [R]: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  [Q]: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  6: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  7: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
};
function evaluate(pos) {
  const b = pos.b; let score = 0, mat = 0, bw = 0, bb = 0;
  for (let i = 0; i < 64; i++) { const v = b[i]; if (v) { const a = Math.abs(v); if (a !== P && a !== K) mat += VAL[a]; } }
  const end = mat < 2600;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v) continue; const a = Math.abs(v);
    if (v > 0) { score += VAL[a] + T[a === K ? (end ? 7 : 6) : a][i]; if (a === B) bw++; }
    else { score -= VAL[a] + T[a === K ? (end ? 7 : 6) : a][i ^ 56]; if (a === B) bb++; }
  }
  if (bw > 1) score += 30; if (bb > 1) score -= 30;
  return score * pos.side;
}

// ---- search ----
const MATE = 100000, INF = 1000000;
let nodes = 0, deadline = 0, abortable = false, killers = [];
const TIMEOUT = { t: 1 };
function orderMoves(pos, mv, ply) {
  const b = pos.b, sc = mv.map((m) => {
    const t = mTo(m), cap = b[t] ? Math.abs(b[t]) : (mFlag(m) === 1 ? P : 0), pr = mPromo(m);
    let s = 0;
    if (cap) s = 10000 + 10 * VAL[cap] - VAL[Math.abs(b[mFrom(m)])] / 10;
    if (pr) s += 9000 + VAL[pr];
    if (!cap && !pr && killers[ply] && (killers[ply][0] === m || killers[ply][1] === m)) s = 8000;
    return s;
  });
  const idx = mv.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
  return idx.map((i) => mv[i]);
}
function tick() { if ((++nodes & 2047) === 0 && abortable && Date.now() > deadline) throw TIMEOUT; }
function qs(pos, alpha, beta, ply) {
  tick();
  const sp = evaluate(pos); if (sp >= beta) return beta; if (sp > alpha) alpha = sp;
  const s = pos.side;
  for (const m of orderMoves(pos, pos.gen(true), ply)) {
    const u = pos.make(m);
    if (pos.attacked(s === 1 ? pos.kw : pos.kb, -s)) { pos.unmake(u); continue; }
    const sc = -qs(pos, -beta, -alpha, ply + 1); pos.unmake(u);
    if (sc >= beta) return beta; if (sc > alpha) alpha = sc;
  }
  return alpha;
}
function negamax(pos, depth, alpha, beta, ply) {
  tick();
  if (pos.half >= 100) return 0;
  const s = pos.side, chk = pos.inCheck(s);
  if (chk && ply < 14) depth++;
  if (depth <= 0) return qs(pos, alpha, beta, ply);
  let legal = 0;
  for (const m of orderMoves(pos, pos.gen(false), ply)) {
    const u = pos.make(m);
    if (pos.attacked(s === 1 ? pos.kw : pos.kb, -s)) { pos.unmake(u); continue; }
    legal++;
    const sc = -negamax(pos, depth - 1, -beta, -alpha, ply + 1); pos.unmake(u);
    if (sc >= beta) { if (!pos.b[mTo(m)]) { const k = killers[ply] || (killers[ply] = [0, 0]); if (k[0] !== m) { k[1] = k[0]; k[0] = m; } } return beta; }
    if (sc > alpha) alpha = sc;
  }
  if (!legal) return chk ? -MATE + ply : 0;
  return alpha;
}
// Returns { move, score (cp, side-to-move view), depth }.
function think(fen, o) {
  const pos = new Pos().load(fen), s = pos.side, legals = pos.legal();
  if (!legals.length) return { move: 0, score: 0, depth: 0 };
  const rep = o.rep || {};
  if (legals.length === 1) return { move: legals[0], score: evaluate(pos), depth: 0 };
  if (o.blunder && Math.random() < o.blunder) { const m = legals[Math.floor(Math.random() * legals.length)]; return { move: m, score: evaluate(pos), depth: 0 }; }
  nodes = 0; killers = []; deadline = Date.now() + (o.ms || 800);
  let done = null, reached = 0;
  for (let d = 1; d <= (o.depth || 2); d++) {
    abortable = d > 1; const res = []; let best = -INF; const margin = o.margin || 0;
    try {
      for (const m of orderMoves(pos, legals, 0)) {
        const u = pos.make(m); let sc;
        const key = pos.key(), seen = rep[key] || 0;
        if (seen >= 2) sc = 0; // would be a threefold: treat as a draw
        else sc = -negamax(pos, d - 1, -INF, -(best - margin - 1), 1);
        pos.unmake(u);
        if (sc > best - margin - 1 || res.length === 0) { res.push({ m, sc }); if (sc > best) best = sc; }
      }
    } catch (e) { if (e !== TIMEOUT) throw e; abortable = false; break; }
    done = { res, best }; reached = d;
    if (best > MATE / 2) break; // forced mate found
  }
  abortable = false;
  const cand = done.res.filter((r) => r.sc >= done.best - (o.margin || 0));
  const pick = cand[Math.floor(Math.random() * cand.length)];
  return { move: pick.m, score: pick.sc, depth: reached };
}

const api = { Pos, START, sqName, nameSq, mFrom, mTo, mPromo, mFlag, think, evaluate, VAL };
if (typeof document === 'undefined' && typeof postMessage === 'function') {
  root.onmessage = (e) => { const d = e.data; let r; try { r = think(d.fen, d); } catch (err) { r = { move: 0, score: 0, depth: 0, error: String(err) }; } r.id = d.id; postMessage(r); };
} else root.Chess = api;
})(typeof self !== 'undefined' ? self : this);
