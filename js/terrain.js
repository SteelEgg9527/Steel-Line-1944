/* 钢线 1944 —— 军用等高线地图生成与绘制
   战场 1km×1km，图幅向外延展 320m，形成一张完整的地图图纸 */
(function () {
  'use strict';
  var SL = window.SL, U = SL.U;
  var T = (SL.Terrain = {});
  var C = SL.COLORS;

  var SIZE = 2000;              // 作战区 2km × 2km
  var PAD = 0;                  // 不再向外延展
  var ORIGIN = -PAD;
  var EXTENT = SIZE + PAD * 2;
  var N = 400;                  // 网格数（5m 一格）
  var STEP = EXTENT / N;
  var GRID = N + 1;

  T.size = SIZE;
  T.origin = ORIGIN;
  T.extent = EXTENT;
  T.end = ORIGIN + EXTENT;
  T.step = STEP;

  /* ---------------- 地形骨架 ---------------- */

  /* 地形骨架由 SL.MAPS 提供（T.setMap 切换） */

  /* 路径与林地由地图数据提供 */

  /* 村庄 / 阵地由地图数据提供 */

  /* ---------------- 路径采样 ---------------- */

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  }

  function spline(pts, step) {
    var out = [];
    var n = pts.length;
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      var approx = U.dist(p1.x, p1.y, p2.x, p2.y);
      var count = Math.max(2, Math.ceil(approx / step));
      for (var k = 0; k < count; k++) out.push(catmull(p0, p1, p2, p3, k / count));
    }
    out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
    return out;
  }

  T.setMap = function (id) {
    var m = SL.MAP_BY_ID[id] || SL.MAPS[0];
    T.map = m;
    T.hills = m.hills;
    T.streams = m.streams.map(function (s) { return spline(s, 10); });
    T.roads = m.roads.map(function (s) { return spline(s, 10); });
    T.tracks = m.tracks.map(function (s) { return spline(s, 10); });
    T.stream = T.streams[0];
    T.road = T.roads[0];
    T.track = T.tracks[0];
    T.forests = m.forests;
    T.farms = m.farms || [];
    T.village = m.village;
    T.streamName = m.streamName;
    T.spawns = m.spawns;
    T.objective = m.objective;
    T.zones = m.zones.map(function (z) {
      var kind = z.kind;
      if (kind !== 'bush' && kind !== 'forest' && kind !== 'village' && kind !== 'town' && kind !== 'fort') {
        kind = kind === 'house' ? 'village' : 'fort';
      }
      return {
        id: z.id, name: z.name, kind: kind, x: z.x, y: z.y, r: z.r,
        owner: null, cap: 0, capSide: null,
        fortified: false, hp: 0, maxHp: SL.FORT.maxHp, fortifyProgress: 0, structure: null
      };
    });
    // 每片林地自动生成一个可占领的「林地」区，保证森林和占领区一一对应
    for (var fi = 0; fi < m.forests.length; fi++) {
      var f = m.forests[fi];
      if (f.x < 90 || f.y < 90 || f.x > SIZE - 90 || f.y > SIZE - 90) continue;
      T.zones.push({
        id: m.id + '_forest' + fi,
        name: '林地',
        kind: 'forest',
        x: f.x, y: f.y,
        r: Math.max(46, Math.min(92, f.r * 0.6)),
        owner: null, cap: 0, capSide: null,
        fortified: false, hp: 0, maxHp: SL.FORT.maxHp, fortifyProgress: 0, structure: null
      });
    }
    T.trees = [];
    T.buildings = [];
  };
  T.setMap(SL.MAPS[0].id);

  // 需要贴到真实高点的阵地
  var HIGH_IDS = {
    a: ['z_two', 'z_ridge', 'z_gun'],
    b: ['b_ridge', 'b_south', 'b_east', 'b_west'],
    c: ['c_north', 'c_south', 'c_gun']
  };

  function distToPath(x, y, path) {
    var best = Infinity;
    if (!path || path.length < 2) return Infinity;
    for (var i = 0; i < path.length - 1; i++) {
      var d = U.pointSegDist2(x, y, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /* ---------------- 高度场 ---------------- */

  var heights = new Float32Array(GRID * GRID);
  var minH = 0, maxH = 1;
  var shadeCanvas = null, forestCanvas = null, treeCanvas = null;
  var paths = {};

  function rawHeight(x, y) {
    var h = 0;
    for (var i = 0; i < T.hills.length; i++) {
      var hl = T.hills[i];
      var dx = (x - hl.x) / hl.rx, dy = (y - hl.y) / hl.ry;
      h += hl.h * Math.exp(-(dx * dx + dy * dy) * 1.35);
    }
    h += 15 * (U.fbm(x * 0.0034, y * 0.0034, 17, 3, 2, 0.55) - 0.5);
    h += 4.5 * (U.fbm(x * 0.011, y * 0.011, 41, 2, 2, 0.5) - 0.5);
    h += 1.6 * (U.noise2(x * 0.03, y * 0.03, 63) - 0.5);
    var ds = distToPath(x, y, T.stream);
    h -= 17 * Math.exp(-(ds * ds) / (2 * 62 * 62));
    return h;
  }

  T.heightAt = function (x, y) {
    var fx = U.clamp((x - ORIGIN) / STEP, 0, N - 0.0001);
    var fy = U.clamp((y - ORIGIN) / STEP, 0, N - 0.0001);
    var i = Math.floor(fx), j = Math.floor(fy);
    var tx = fx - i, ty = fy - j;
    var h00 = heights[j * GRID + i];
    var h10 = heights[j * GRID + i + 1];
    var h01 = heights[(j + 1) * GRID + i];
    var h11 = heights[(j + 1) * GRID + i + 1];
    return U.lerp(U.lerp(h00, h10, tx), U.lerp(h01, h11, tx), ty);
  };

  T.slopeAt = function (x, y) {
    var d = 6;
    var hx = T.heightAt(x + d, y) - T.heightAt(x - d, y);
    var hy = T.heightAt(x, y + d) - T.heightAt(x, y - d);
    return Math.sqrt(hx * hx + hy * hy) / (2 * d);
  };

  T.forestAt = function (x, y) {
    var f = 0;
    for (var i = 0; i < T.forests.length; i++) {
      var b = T.forests[i];
      var dx = x - b.x, dy = y - b.y;
      var r = b.r * (0.86 + 0.28 * U.noise2(x * 0.012, y * 0.012, 77 + i * 13));
      f += b.w * Math.exp(-(dx * dx + dy * dy) / (r * r * 0.55));
    }
    return U.clamp(f, 0, 1.4);
  };

  T.streamDistance = function (x, y) { return distToPath(x, y, T.stream); };
  T.roadDistance = function (x, y) { return distToPath(x, y, T.road); };

  T.speedAt = function (x, y) {
    var m = 1;
    var slope = T.slopeAt(x, y);
    m *= U.clamp(1 - slope * 1.15, 0.52, 1.08);
    var f = T.forestAt(x, y);
    if (f > 0.62) m *= 0.6;
    else if (f > 0.36) m *= 0.78;
    if (T.streamDistance(x, y) < 13) m *= 0.55;
    if (T.roadDistance(x, y) < 11) m *= 1.28;
    return U.clamp(m, 0.34, 1.5);
  };

  /* ---------------- 等高线 ---------------- */

  T.levels = [];
  T.contourPaths = [];
  T.contourLabels = [];
  T.trees = [];
  T.buildings = [];

  function edgePoint(ax, ay, ha, bx, by, hb, level) {
    var t = (level - ha) / (hb - ha);
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
  }

  function buildContours() {
    T.levels = [];
    var start = Math.ceil((minH + 0.01) / 10) * 10;
    var end = Math.floor(maxH / 10) * 10;
    for (var level = start; level <= end; level += 10) {
      T.levels.push({ level: level, index: level % 50 === 0, segs: [] });
    }
    var base = start;

    for (var j = 0; j < N; j++) {
      var y0 = ORIGIN + j * STEP, y1 = y0 + STEP;
      for (var i = 0; i < N; i++) {
        var x0 = ORIGIN + i * STEP, x1 = x0 + STEP;
        var h00 = heights[j * GRID + i];
        var h10 = heights[j * GRID + i + 1];
        var h01 = heights[(j + 1) * GRID + i];
        var h11 = heights[(j + 1) * GRID + i + 1];
        var cmin = Math.min(h00, h10, h01, h11);
        var cmax = Math.max(h00, h10, h01, h11);
        var lvFirst = Math.ceil((cmin + 0.0001) / 10) * 10;
        var lvLast = Math.floor((cmax - 0.0001) / 10) * 10;
        for (var lv = lvFirst; lv <= lvLast; lv += 10) {
          var idxLevel = (lv - base) / 10;
          if (idxLevel < 0 || idxLevel >= T.levels.length) continue;
          var rec = T.levels[idxLevel];
          var mask = (h00 > lv ? 1 : 0) | (h10 > lv ? 2 : 0) | (h11 > lv ? 4 : 0) | (h01 > lv ? 8 : 0);
          var top = edgePoint(x0, y0, h00, x1, y0, h10, lv);
          var right = edgePoint(x1, y0, h10, x1, y1, h11, lv);
          var bottom = edgePoint(x0, y1, h01, x1, y1, h11, lv);
          var left = edgePoint(x0, y0, h00, x0, y1, h01, lv);
          var pairs = null;
          switch (mask) {
            case 1: case 14: pairs = [[left, top]]; break;
            case 2: case 13: pairs = [[top, right]]; break;
            case 3: case 12: pairs = [[left, right]]; break;
            case 4: case 11: pairs = [[right, bottom]]; break;
            case 6: case 9: pairs = [[top, bottom]]; break;
            case 7: case 8: pairs = [[left, bottom]]; break;
            case 5: pairs = [[left, top], [right, bottom]]; break;
            case 10: pairs = [[top, right], [left, bottom]]; break;
          }
          if (!pairs) continue;
          for (var p = 0; p < pairs.length; p++) {
            rec.segs.push([pairs[p][0].x, pairs[p][0].y, pairs[p][1].x, pairs[p][1].y]);
          }
        }
      }
    }

    T.contourPaths = [];
    T.contourLabels = [];
    var placed = [];
    var rnd = U.mulberry32(90210);

    for (var ci = 0; ci < T.levels.length; ci++) {
      var rec2 = T.levels[ci];
      var path = new Path2D();
      for (var s = 0; s < rec2.segs.length; s++) {
        var sg = rec2.segs[s];
        path.moveTo(sg[0], sg[1]);
        path.lineTo(sg[2], sg[3]);
      }
      T.contourPaths.push(path);

      var cand = [];
      for (var k = 0; k < rec2.segs.length; k += 3) {
        var ss = rec2.segs[k];
        var len = U.dist(ss[0], ss[1], ss[2], ss[3]);
        if (len < 3.6) continue;
        cand.push({ x: (ss[0] + ss[2]) / 2, y: (ss[1] + ss[3]) / 2, a: Math.atan2(ss[3] - ss[1], ss[2] - ss[0]) });
      }
      for (var a = cand.length - 1; a > 0; a--) {
        var b = Math.floor(rnd() * (a + 1));
        var tmp = cand[a]; cand[a] = cand[b]; cand[b] = tmp;
      }
      var wanted = rec2.index ? 8 : 6;
      var count = 0;
      for (var c2 = 0; c2 < cand.length && count < wanted; c2++) {
        var cd = cand[c2];
        if (cd.x < 40 || cd.x > SIZE - 40 || cd.y < 40 || cd.y > SIZE - 40) continue;
        var ok = true;
        for (var q = 0; q < placed.length; q++) {
          if (U.dist2(cd.x, cd.y, placed[q].x, placed[q].y) < 110 * 110) { ok = false; break; }
        }
        if (!ok) continue;
        placed.push(cd);
        T.contourLabels.push({ x: cd.x, y: cd.y, a: cd.a, text: String(rec2.level), index: rec2.index });
        count++;
      }
    }
  }

  /* ---------------- 森林 / 村庄 ---------------- */

  function buildTrees() {
    T.trees = [];
    var rnd = U.mulberry32(31337);
    for (var gy = ORIGIN + 6; gy < ORIGIN + EXTENT; gy += 12) {
      for (var gx = ORIGIN + 6; gx < ORIGIN + EXTENT; gx += 12) {
        var x = gx + (rnd() - 0.5) * 10;
        var y = gy + (rnd() - 0.5) * 10;
        var f = T.forestAt(x, y);
        if (f > 0.44 && rnd() < Math.min(0.95, (f - 0.3) * 1.9)) {
          if (T.streamDistance(x, y) > 8 && T.roadDistance(x, y) > 9) {
            T.trees.push({ x: x, y: y, r: 2.1 + rnd() * 1.2 });
          }
        }
      }
    }
  }

  function buildVillage() {
    T.buildings = [];
    var rnd = U.mulberry32(7071);
    var v = T.village;
    var specs = [
      { x: -92, y: -52, w: 30, h: 18, a: -0.18 },
      { x: -56, y: -68, w: 22, h: 16, a: 0.06 },
      { x: -40, y: 36, w: 36, h: 20, a: -0.1 },
      { x: 8, y: -80, w: 24, h: 16, a: 0.22 },
      { x: 36, y: 52, w: 28, h: 18, a: 0.04 },
      { x: 68, y: -44, w: 32, h: 20, a: -0.24 },
      { x: 96, y: 24, w: 20, h: 16, a: 0.12 },
      { x: 124, y: -12, w: 26, h: 18, a: -0.05 },
      { x: -124, y: 12, w: 20, h: 16, a: 0.3 },
      { x: 24, y: 108, w: 24, h: 16, a: -0.16 },
      { x: -16, y: 96, w: 18, h: 14, a: 0.08 }
    ];
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      var b = { x: v.x + s.x, y: v.y + s.y, w: s.w + rnd() * 2, h: s.h + rnd() * 1.5, a: s.a };
      if (T.streamDistance(b.x, b.y) < 26) continue;
      T.buildings.push(b);
    }
    // 外围农舍
    var farms = T.farms || [];
    for (var f = 0; f < farms.length; f++) {
      var fm = farms[f];
      for (var k = 0; k < fm.n; k++) {
        var ang = fm.a + k * 2.1;
        var dist = 22 + k * 12;
        var bx = fm.x + Math.cos(ang) * dist;
        var by = fm.y + Math.sin(ang) * dist;
        if (T.streamDistance(bx, by) < 18 || T.roadDistance(bx, by) < 10) continue;
        T.buildings.push({
          x: bx, y: by,
          w: 9 + rnd() * 4, h: 7 + rnd() * 2,
          a: fm.a + (rnd() - 0.5) * 0.4
        });
      }
    }
  }

  T.buildZone = function () {
    // 清除上一局由工兵临时建造的占领区
    T.zones = T.zones.filter(function (z) { return !z.built; });
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      z.owner = null;
      z.cap = 0;
      z.capSide = null;
      z.flash = 0;
      z.fortified = false;
      z.hp = 0;
      z.maxHp = SL.FORT.maxHp;
      z.fortifyProgress = 0;
      z.structure = null;
      z.structures = [];
      z.rubbles = [];
      z.rubble = null;
      z.rubbleProgress = 0;
    }
  };

  // 运行时新增占领区（工兵野战工事）
  T.addZone = function (zone) {
    zone.owner = zone.owner || null;
    zone.cap = 0;
    zone.capSide = null;
    zone.flash = 0;
    zone.fortified = false;
    zone.hp = 0;
    zone.maxHp = SL.FORT.maxHp;
    zone.fortifyProgress = 0;
    zone.structure = null;
    zone.structures = [];
    zone.rubbles = [];
    zone.rubble = null;
    zone.rubbleProgress = 0;
    T.zones.push(zone);
    return zone;
  };

  T.zoneAt = function (x, y) {
    var best = null;
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      var dx = x - z.x, dy = y - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) {
        if (!best || z.r < best.r) best = z;
      }
    }
    return best;
  };

  T.drawZones = function (ctx, zoom) {
    var one = 1 / zoom;
    var kindColor = {
      house: '#7a5e46',
      trench: '#5c5838',
      nest: '#7c4030',
      gunpit: '#655640',
      bush: '#46603a',
      forest: '#3f5a32'
    };
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      var col = kindColor[z.kind] || '#5c5838';
      ctx.save();
      // 底色 + 阴影线（用矢量线，避免 CanvasPattern 在 GPU 上下文重置后失效）
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(104, 92, 58, 0.08)';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(92, 82, 52, 0.20)';
      ctx.lineWidth = 0.5 * one;
      ctx.beginPath();
      for (var k = -z.r; k <= z.r; k += 8) {
        ctx.moveTo(z.x - z.r, z.y + k);
        ctx.lineTo(z.x + z.r, z.y + k);
      }
      ctx.stroke();
      ctx.restore();
      // 外轮廓
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.35 * one;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // 兵种图标
      drawZoneIcon(ctx, z, col, one);

      // 占领进度弧
      if (z.capSide && z.cap > 0.02) {
        ctx.strokeStyle = z.capSide === 'blue' ? '#2f5f92' : (z.capSide === 'red' ? '#a63f33' : '#4f7a45');
        ctx.lineWidth = 2.4 * one;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, z.cap / 3));
        ctx.stroke();
      }

      // 工兵构筑进度
      if (!z.fortified && z.fortifyProgress > 0.01) {
        ctx.strokeStyle = 'rgba(214,178,92,0.95)';
        ctx.lineWidth = 3 * one;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r - 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * z.fortifyProgress);
        ctx.stroke();
      }

      // 强化工事：醒目外环 + 工事名 + 中心工事单位
      if (z.fortified && !z.rubble) {
        ctx.strokeStyle = 'rgba(230,190,92,0.98)';
        ctx.lineWidth = 3.2 * one;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(198,158,72,0.95)';
        ctx.lineWidth = 2.8 * one;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(244,220,150,0.85)';
        ctx.lineWidth = 1.3 * one;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r - 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        var zStructs = (z.structures && z.structures.length) ? z.structures : (z.structure ? [z.structure] : []);
        var stNames = { bunker: '机枪碉堡', mortar: '迫击炮阵地', at_nest: '反坦克炮阵地', flak88: '88防空炮阵地' };
        var stOrder = ['bunker', 'mortar', 'at_nest', 'flak88'];
        var stCounts = {};
        for (var zsi = 0; zsi < zStructs.length; zsi++) {
          var zt = zStructs[zsi].type;
          stCounts[zt] = (stCounts[zt] || 0) + 1;
        }
        var labelLines = [];
        for (var zoi = 0; zoi < stOrder.length; zoi++) {
          var ot = stOrder[zoi];
          if (!stCounts[ot]) continue;
          labelLines.push((stNames[ot] || '工事') + (stCounts[ot] > 1 ? ' ×' + stCounts[ot] : ''));
        }
        if (!labelLines.length) labelLines.push('强化工事');
        var zFont = 11;
        var zLineH = 13;
        var zBaseY = z.y - z.r - 11;
        ctx.font = '700 ' + zFont + 'px ' + SL.FONT_UI;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(24,22,16,0.72)';
        for (var zli = 0; zli < labelLines.length; zli++) {
          var zly = zBaseY - (labelLines.length - 1 - zli) * zLineH;
          ctx.strokeText(labelLines[zli], z.x, zly);
          ctx.fillStyle = 'rgba(244,220,150,0.98)';
          ctx.fillText(labelLines[zli], z.x, zly);
        }

        var bw = z.r * 1.6, bh = 3.2;
        var bx = z.x - bw / 2, by = z.y - z.r - 9;
        ctx.fillStyle = 'rgba(16,18,14,0.7)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#c8a24e';
        ctx.fillRect(bx, by, bw * Math.max(0, z.hp / z.maxHp), bh);

        // 圈中的工事“单位”：不可移动，独立标记
        if (z.structure) {
          var st = z.structure;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.fillStyle = 'rgba(28,26,18,0.82)';
          ctx.strokeStyle = 'rgba(236,206,126,0.95)';
          ctx.lineWidth = 1.8 * one;
          ctx.beginPath();
          ctx.arc(0, 0, 12 * one, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = 'rgba(244,220,150,0.98)';
          ctx.fillStyle = 'rgba(244,220,150,0.98)';
          ctx.lineWidth = 1.8 * one;
          if (st.type === 'bunker') {
            ctx.fillRect(-7 * one, -4 * one, 14 * one, 8 * one);
            ctx.strokeRect(-7 * one, -4 * one, 14 * one, 8 * one);
            ctx.beginPath();
            ctx.moveTo(-3 * one, 0); ctx.lineTo(3 * one, 0);
            ctx.stroke();
          } else if (st.type === 'mortar') {
            ctx.beginPath();
            ctx.moveTo(-4 * one, 5 * one);
            ctx.lineTo(2 * one, -6 * one);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 6 * one, 3.5 * one, 0, Math.PI);
            ctx.stroke();
          } else if (st.type === 'at_nest') {
            ctx.fillRect(-6 * one, -3 * one, 12 * one, 6 * one);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(10 * one, -3 * one);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, 5 * one, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -9 * one); ctx.lineTo(0, 9 * one);
            ctx.moveTo(-9 * one, 0); ctx.lineTo(9 * one, 0);
            ctx.stroke();
          }
          ctx.restore();

          var aw = 24 * one, ah = 2.4 * one;
          var ax = z.x - aw / 2, ay = z.y + z.r - 13 * one;
          ctx.fillStyle = 'rgba(16,18,14,0.72)';
          ctx.fillRect(ax, ay, aw, ah);
          ctx.fillStyle = st.ammo > 0 ? '#e0b95c' : '#8a3f33';
          ctx.fillRect(ax, ay, aw * Math.max(0, (st.ammo || 0) / (st.maxAmmo || 1)), ah);
        }
      }

        if (z.rubble) {
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = 'rgba(170,120,80,0.9)';
          ctx.lineWidth = 2.4 * one;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '700 ' + (9 / zoom).toFixed(1) + 'px ' + SL.FONT_UI;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          var rl = z.y - z.r - 12 * one;
          ctx.lineWidth = 3 * one;
          ctx.strokeStyle = 'rgba(24,22,16,0.7)';
          var rtxt = (z.rubble.name || '工事') + '残骸' + (z.rubbles && z.rubbles.length > 1 ? '×' + z.rubbles.length : '');
          ctx.strokeText(rtxt, z.x, rl);
          ctx.fillStyle = 'rgba(220,160,108,0.95)';
          ctx.fillText(rtxt, z.x, rl);
          ctx.strokeStyle = 'rgba(220,160,108,0.9)';
          ctx.lineWidth = 1.8 * one;
          ctx.beginPath();
          ctx.moveTo(z.x - 9 * one, z.y - 9 * one);
          ctx.lineTo(z.x + 9 * one, z.y + 9 * one);
          ctx.moveTo(z.x + 9 * one, z.y - 9 * one);
          ctx.lineTo(z.x - 9 * one, z.y + 9 * one);
          ctx.stroke();
          if (z.rubbleProgress > 0.01) {
            ctx.strokeStyle = 'rgba(230,190,92,0.98)';
            ctx.lineWidth = 3 * one;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.r - 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * z.rubbleProgress);
            ctx.stroke();
          }
        }
      ctx.restore();
    }
  };

  function drawZoneIcon(ctx, z, col, one) {
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.2 * one;
    var s = 5;
    if (z.kind === 'village' || z.kind === 'house') {
      ctx.strokeRect(-s * 0.8, -s * 0.5, s * 1.6, s);
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.5);
      ctx.lineTo(0, -s);
      ctx.lineTo(s * 0.9, -s * 0.5);
      ctx.stroke();
    } else if (z.kind === 'town') {
      ctx.strokeRect(-s * 1.05, -s * 0.2, s * 0.75, s * 0.8);
      ctx.strokeRect(s * 0.2, -s * 0.6, s * 0.9, s * 1.2);
      ctx.beginPath();
      ctx.moveTo(-s * 1.1, -s * 0.2);
      ctx.lineTo(-s * 0.68, -s * 0.65);
      ctx.lineTo(-s * 0.3, -s * 0.2);
      ctx.moveTo(s * 0.15, -s * 0.6);
      ctx.lineTo(s * 0.65, -s * 1.05);
      ctx.lineTo(s * 1.15, -s * 0.6);
      ctx.stroke();
    } else if (z.kind === 'fort' || z.kind === 'trench' || z.kind === 'nest') {
      ctx.beginPath();
      ctx.moveTo(-s * 1.4, s * 0.5);
      ctx.lineTo(-s * 0.6, -s * 0.4);
      ctx.lineTo(0, s * 0.4);
      ctx.lineTo(s * 0.7, -s * 0.4);
      ctx.lineTo(s * 1.4, s * 0.5);
      ctx.stroke();
    } else if (z.kind === 'nest') {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
    } else if (z.kind === 'bush') {
      ctx.beginPath();
      ctx.arc(-s * 0.55, s * 0.15, s * 0.45, 0, Math.PI * 2);
      ctx.arc(s * 0.15, -s * 0.25, s * 0.5, 0, Math.PI * 2);
      ctx.arc(s * 0.6, s * 0.2, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (z.kind === 'forest') {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.lineTo(s * 0.72, s * 0.4);
      ctx.lineTo(-s * 0.72, s * 0.4);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, s * 0.4);
      ctx.lineTo(0, s * 0.9);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0);
      ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 预烘焙贴图 ---------------- */

  function buildShade() {
    var S = 720;
    shadeCanvas = document.createElement('canvas');
    shadeCanvas.width = S;
    shadeCanvas.height = S;
    var ctx = shadeCanvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var cell = EXTENT / S;
    for (var j = 0; j < S; j++) {
      for (var i = 0; i < S; i++) {
        var x = ORIGIN + (i + 0.5) * cell, y = ORIGIN + (j + 0.5) * cell;
        var hx = T.heightAt(x + 4, y) - T.heightAt(x - 4, y);
        var hy = T.heightAt(x, y + 4) - T.heightAt(x, y - 4);
        var light = (-hx - hy) * 0.42;
        var v = U.clamp(light, -1, 1);
        var idx = (j * S + i) * 4;
        if (v > 0) {
          img.data[idx] = 255; img.data[idx + 1] = 252; img.data[idx + 2] = 238;
          img.data[idx + 3] = Math.round(v * 42);
        } else {
          img.data[idx] = 66; img.data[idx + 1] = 58; img.data[idx + 2] = 44;
          img.data[idx + 3] = Math.round(-v * 38);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function buildForestLayer() {
    var S = 640;
    forestCanvas = document.createElement('canvas');
    forestCanvas.width = S;
    forestCanvas.height = S;
    var ctx = forestCanvas.getContext('2d');
    var s = S / EXTENT;
    ctx.save();
    ctx.translate(-ORIGIN * s, -ORIGIN * s);
    ctx.scale(s, s);
    // 大块底色
    for (var i = 0; i < T.forests.length; i++) {
      var f = T.forests[i];
      var g = ctx.createRadialGradient(f.x, f.y, f.r * 0.2, f.x, f.y, f.r * 1.02);
      g.addColorStop(0, 'rgba(112,136,78,0.26)');
      g.addColorStop(0.6, 'rgba(112,136,78,0.16)');
      g.addColorStop(1, 'rgba(112,136,78,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 1.02, 0, Math.PI * 2);
      ctx.fill();
    }
    // 贴合树木分布
    ctx.fillStyle = 'rgba(104,128,72,0.055)';
    for (var k = 0; k < T.trees.length; k++) {
      var t = T.trees[k];
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function buildTreeLayer() {
    var S = 1600;
    treeCanvas = document.createElement('canvas');
    treeCanvas.width = S;
    treeCanvas.height = S;
    var ctx = treeCanvas.getContext('2d');
    var s = S / EXTENT;
    ctx.save();
    ctx.translate(-ORIGIN * s, -ORIGIN * s);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(118,138,84,0.95)';
    for (var i = 0; i < T.trees.length; i++) {
      var t = T.trees[i];
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70,86,50,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (var k = 0; k < T.trees.length; k++) {
      var tk = T.trees[k];
      ctx.moveTo(tk.x, tk.y - tk.r * 0.2);
      ctx.lineTo(tk.x, tk.y + tk.r * 1.9);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* 重新烘焙离屏图层（GPU 上下文恢复后调用，不重建地形数据） */
  T.rebakeLayers = function () {
    buildShade();
    buildForestLayer();
    buildTreeLayer();
  };

  /* ---------------- 构建 ---------------- */

  // 把高地类阵地吸附到附近真实最高点，保证占领区与地形高点一致
  function alignHighZones() {
    var ids = HIGH_IDS[T.map.id] || [];
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      if (ids.indexOf(z.id) < 0) continue;
      // 两轮局部爬山：只在这座山头附近找真实最高点
      for (var pass = 0; pass < 2; pass++) {
        var best = T.heightAt(z.x, z.y);
        var bx = z.x, by = z.y;
        for (var dx = -70; dx <= 70; dx += 7) {
          for (var dy = -70; dy <= 70; dy += 7) {
            var x = z.x + dx, y = z.y + dy;
            if (x < 60 || y < 60 || x > SIZE - 60 || y > SIZE - 60) continue;
            var h = T.heightAt(x, y);
            if (h > best + 0.05) { best = h; bx = x; by = y; }
          }
        }
        if (bx === z.x && by === z.y) break;
        z.x = bx; z.y = by;
      }
    }
  }

  T.build = function (seed) {
    for (var j = 0; j < GRID; j++) {
      for (var i = 0; i < GRID; i++) {
        heights[j * GRID + i] = rawHeight(ORIGIN + i * STEP, ORIGIN + j * STEP);
      }
    }
    var tmp = new Float32Array(heights.length);
    for (var pass = 0; pass < 2; pass++) {
      for (var y = 0; y < GRID; y++) {
        for (var x = 0; x < GRID; x++) {
          var sum = 0, cnt = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= GRID || yy >= GRID) continue;
              sum += heights[yy * GRID + xx];
              cnt++;
            }
          }
          tmp[y * GRID + x] = sum / cnt;
        }
      }
      heights.set(tmp);
    }

    minH = Infinity; maxH = -Infinity;
    for (var k = 0; k < heights.length; k++) {
      if (heights[k] < minH) minH = heights[k];
      if (heights[k] > maxH) maxH = heights[k];
    }
    var lo = 64, hi = 168;
    var span = (maxH - minH) || 1;
    for (var m = 0; m < heights.length; m++) {
      heights[m] = lo + (heights[m] - minH) / span * (hi - lo);
    }
    minH = lo; maxH = hi;

    alignHighZones();
    buildContours();
    buildTrees();
    buildVillage();
    T.buildZone();
    buildShade();
    buildForestLayer();
    buildTreeLayer();

    paths = {
      streams: T.streams.map(toPath),
      roads: T.roads.map(toPath),
      tracks: T.tracks.map(toPath)
    };
    return T;
  };

  function toPath(pts) {
    var p = new Path2D();
    p.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    return p;
  }

  /* ---------------- 绘制 ---------------- */

  T.drawGround = function (ctx, zoom, opts) {
    opts = opts || {};
    var simple = !!opts.simple;
    T.zoneError = null;
    T.treeError = null;
    var one = 1 / zoom;
    var X0 = ORIGIN, Y0 = ORIGIN, E = EXTENT;

    // 所有地形内容都裁剪在战场范围内，河流/道路不会再画到地图外
    ctx.save();
    ctx.beginPath();
    ctx.rect(X0, Y0, E, E);
    ctx.clip();

    ctx.fillStyle = C.paper;
    ctx.fillRect(X0, Y0, E, E);

    ctx.globalAlpha = 0.6;
    ctx.drawImage(shadeCanvas, X0, Y0, E, E);
    ctx.globalAlpha = 1;

    if (forestCanvas) ctx.drawImage(forestCanvas, X0, Y0, E, E);

    // 方里网
    var g0 = Math.ceil(ORIGIN / 100) * 100;
    var gp = new Path2D();
    for (var gx = g0; gx <= X0 + E; gx += 100) {
      gp.moveTo(gx, Y0);
      gp.lineTo(gx, Y0 + E);
    }
    for (var gy = g0; gy <= Y0 + E; gy += 100) {
      gp.moveTo(X0, gy);
      gp.lineTo(X0 + E, gy);
    }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.6 * one;
    ctx.stroke(gp);

    // 等高线
    var showFine = zoom >= 0.55;
    for (var i = 0; i < T.levels.length; i++) {
      var rec = T.levels[i];
      if (!showFine && !rec.index) continue;
      ctx.strokeStyle = rec.index ? C.contourIndex : C.contour;
      ctx.globalAlpha = rec.index ? 0.95 : 0.82;
      ctx.lineWidth = (rec.index ? 1.5 : 0.95) * one;
      ctx.stroke(T.contourPaths[i]);
    }
    ctx.globalAlpha = 1;

    // 河流
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var si;
    for (si = 0; si < paths.streams.length; si++) {
      ctx.strokeStyle = C.waterLight;
      ctx.lineWidth = 8;
      ctx.stroke(paths.streams[si]);
      ctx.strokeStyle = C.water;
      ctx.lineWidth = 5.2;
      ctx.stroke(paths.streams[si]);
    }

    // 公路与土路
    for (si = 0; si < paths.roads.length; si++) {
      ctx.strokeStyle = C.roadEdge;
      ctx.lineWidth = 9;
      ctx.stroke(paths.roads[si]);
      ctx.strokeStyle = C.road;
      ctx.lineWidth = 6.8;
      ctx.stroke(paths.roads[si]);
      if (zoom > 0.85) {
        ctx.strokeStyle = 'rgba(255,250,235,0.45)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([7, 9]);
        ctx.stroke(paths.roads[si]);
        ctx.setLineDash([]);
      }
    }
    for (si = 0; si < paths.tracks.length; si++) {
      ctx.strokeStyle = 'rgba(124,101,72,0.65)';
      ctx.lineWidth = 3.6;
      ctx.stroke(paths.tracks[si]);
      ctx.strokeStyle = 'rgba(203,172,131,0.9)';
      ctx.lineWidth = 2.2;
      ctx.stroke(paths.tracks[si]);
    }

    // 房屋
    for (var b = 0; b < T.buildings.length; b++) {
      var bd = T.buildings[b];
      ctx.save();
      ctx.translate(bd.x, bd.y);
      ctx.rotate(bd.a);
      ctx.fillStyle = 'rgba(80,60,45,0.22)';
      ctx.fillRect(-bd.w / 2 + 1.6, -bd.h / 2 + 1.6, bd.w, bd.h);
      ctx.fillStyle = C.building;
      ctx.strokeStyle = C.buildingEdge;
      ctx.lineWidth = 0.9;
      ctx.fillRect(-bd.w / 2, -bd.h / 2, bd.w, bd.h);
      ctx.strokeRect(-bd.w / 2, -bd.h / 2, bd.w, bd.h);
      ctx.beginPath();
      ctx.moveTo(-bd.w / 2, 0);
      ctx.lineTo(bd.w / 2, 0);
      ctx.strokeStyle = 'rgba(125,103,82,0.5)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }

    // 阵地区域（单独保护：即使这里出错，后面的树木/图框/单位仍会绘制）
    try {
      T.drawZones(ctx, zoom);
    } catch (e) {
      T.zoneError = (e && e.message) ? e.message : String(e);
    }

    // 树木
    if (!simple && treeCanvas) {
      ctx.globalAlpha = zoom < 0.5 ? 0.7 : 1;
      try {
        ctx.drawImage(treeCanvas, X0, Y0, E, E);
      } catch (e2) {
        T.treeError = (e2 && e2.message) ? e2.message : String(e2);
      }
      ctx.globalAlpha = 1;
    }

    // 作战区边框
    ctx.restore();

    ctx.strokeStyle = 'rgba(52,50,40,0.8)';
    ctx.lineWidth = 2.2 * one;
    ctx.strokeRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(52,50,40,0.35)';
    ctx.lineWidth = 0.8 * one;
    ctx.strokeRect(5, 5, SIZE - 10, SIZE - 10);

    // 作战区角标
    if (zoom > 0.7) {
      ctx.strokeStyle = 'rgba(52,50,40,0.85)';
      ctx.lineWidth = 1.6 * one;
      var L = 16;
      var corners = [[0, 0, 1, 1], [SIZE, 0, -1, 1], [0, SIZE, 1, -1], [SIZE, SIZE, -1, -1]];
      ctx.beginPath();
      for (var c = 0; c < corners.length; c++) {
        var cc = corners[c];
        ctx.moveTo(cc[0], cc[1] + cc[3] * L);
        ctx.lineTo(cc[0], cc[1]);
        ctx.lineTo(cc[0] + cc[2] * L, cc[1]);
      }
      ctx.stroke();
    }
  };

  T.drawLabels = function (ctx, proj, zoom, isSeen) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var seen = function (x, y) { return !isSeen || isSeen(x, y); };

    if (zoom >= 0.68) {
      ctx.font = '9px ' + SL.FONT_MONO;
      for (var i = 0; i < T.contourLabels.length; i++) {
        var lb = T.contourLabels[i];
        if (!seen(lb.x, lb.y)) continue;
        var sx = proj.x(lb.x), sy = proj.y(lb.y);
        if (sx < -60 || sy < -30 || sx > proj.w + 60 || sy > proj.h + 30) continue;
        ctx.save();
        ctx.translate(sx, sy);
        var a = lb.a;
        if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
        ctx.rotate(a);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(231,221,196,0.92)';
        ctx.strokeText(lb.text, 0, 0);
        ctx.fillStyle = lb.index ? C.contourIndex : 'rgba(140,100,70,0.9)';
        ctx.fillText(lb.text, 0, 0);
        ctx.restore();
      }
    }

    ctx.font = '600 13px ' + SL.FONT_UI;
    if (seen(T.village.x + 4, T.village.y + 36)) {
      drawSheetText(ctx, (T.village && T.village.name) || '村庄', proj.x(T.village.x + 4), proj.y(T.village.y + 36), 'rgba(70,60,44,0.95)');
    }
    if (seen(468, 585)) {
      ctx.font = 'italic 11px ' + SL.FONT_UI;
      drawSheetText(ctx, T.streamName, proj.x(468), proj.y(585), 'rgba(63,100,128,0.92)');
    }

    for (var h = 0; h < T.hills.length; h++) {
      var hl = T.hills[h];
      if (!hl.name || hl.hideLabel) continue;
      if (!seen(hl.x, hl.y)) continue;
      ctx.font = 'italic 600 11px ' + SL.FONT_UI;
      drawSheetText(ctx, hl.name, proj.x(hl.x), proj.y(hl.y - 14), 'rgba(110,74,46,0.95)');
    }

    // 阵地 / 房屋标识
    ctx.font = '600 10px ' + SL.FONT_UI;
    for (var zi = 0; zi < T.zones.length; zi++) {
      var z = T.zones[zi];
      if (!seen(z.x, z.y)) continue;
      var zx = proj.x(z.x), zy = proj.y(z.y - z.r) - 7;
      if (zx < -80 || zy < -20 || zx > proj.w + 80 || zy > proj.h + 20) continue;
      var own = z.owner === 'blue' ? 'rgba(47,95,146,0.95)' : (z.owner === 'red' ? 'rgba(166,63,51,0.95)' : (z.owner === 'green' ? 'rgba(79,122,69,0.95)' : 'rgba(107,100,70,0.9)'));
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(233,224,200,0.92)';
      ctx.fillRect(zx - 2, zy - 5, 6, 10);
      ctx.fillStyle = own;
      ctx.fillRect(zx - 2, zy - 5, 3, 10);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(233,224,200,0.9)';
      ctx.strokeText(z.name, zx + 8, zy);
      ctx.fillStyle = 'rgba(74,64,44,0.95)';
      ctx.fillText(z.name, zx + 8, zy);
      ctx.textAlign = 'center';
    }

    // 图廓坐标（仅作战区边缘）
    ctx.font = '9px ' + SL.FONT_MONO;
    for (var g = 200; g < SIZE; g += 200) {
      var px = proj.x(g);
      if (px > 20 && px < proj.w - 20) {
        drawSheetText(ctx, String(g), px, proj.y(0) + 12, 'rgba(60,58,48,0.6)');
        drawSheetText(ctx, String(g), px, proj.y(SIZE) - 12, 'rgba(60,58,48,0.6)');
      }
      var py = proj.y(g);
      if (py > 20 && py < proj.h - 20) {
        drawSheetText(ctx, String(g), proj.x(0) + 14, py, 'rgba(60,58,48,0.6)');
        drawSheetText(ctx, String(g), proj.x(SIZE) - 14, py, 'rgba(60,58,48,0.6)');
      }
    }
  };

  function drawSheetText(ctx, text, x, y, color) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(233,224,200,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  T.thumbnail = function (ctx, size) {
    var s = size / SIZE;
    ctx.save();
    ctx.scale(s, s);
    T.drawGround(ctx, s, { simple: true });
    ctx.restore();
  };

  T.bounds = { minX: 0, minY: 0, maxX: SIZE, maxY: SIZE };
})(window);
