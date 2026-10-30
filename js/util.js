/* 钢线 1944 —— 基础工具库 */
(function () {
  'use strict';
  var SL = (window.SL = window.SL || {});
  var U = (SL.U = {});

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.smooth = function (t) { return t * t * (3 - 2 * t); };
  U.len = function (x, y) { return Math.sqrt(x * x + y * y); };
  U.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  U.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.angle = function (ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); };

  U.wrapAngle = function (a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };

  U.lerpAngle = function (a, b, t) {
    var d = U.wrapAngle(b - a);
    return a + d * U.clamp(t, 0, 1);
  };

  U.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function hash2(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = (h ^ (h >>> 13));
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  U.hash2 = hash2;

  /* 平滑值噪声，返回 0..1 */
  U.noise2 = function (x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = U.smooth(xf), v = U.smooth(yf);
    var a = hash2(xi, yi, seed);
    var b = hash2(xi + 1, yi, seed);
    var c = hash2(xi, yi + 1, seed);
    var d = hash2(xi + 1, yi + 1, seed);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };

  U.fbm = function (x, y, seed, octaves, lacunarity, gain) {
    var sum = 0, amp = 1, norm = 0, freq = 1;
    octaves = octaves || 4;
    lacunarity = lacunarity || 2;
    gain = gain === undefined ? 0.5 : gain;
    for (var i = 0; i < octaves; i++) {
      sum += amp * U.noise2(x * freq, y * freq, seed + i * 101);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };

  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  U.clock = function (sec) {
    var s = Math.max(0, Math.floor(sec));
    return U.pad2(Math.floor(s / 60)) + ':' + U.pad2(s % 60);
  };

  /* 点到线段距离 */
  U.pointSegDist2 = function (px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay;
    var wx = px - ax, wy = py - ay;
    var L2 = vx * vx + vy * vy;
    var t = L2 > 0 ? (wx * vx + wy * vy) / L2 : 0;
    t = U.clamp(t, 0, 1);
    var dx = px - (ax + vx * t), dy = py - (ay + vy * t);
    return dx * dx + dy * dy;
  };

  U.pointPolyDist2 = function (px, py, pts) {
    var best = Infinity;
    for (var i = 0; i < pts.length - 1; i++) {
      var d = U.pointSegDist2(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (d < best) best = d;
    }
    return best;
  };
})();
