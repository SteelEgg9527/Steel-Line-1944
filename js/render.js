/* 钢线 1944 —— 渲染：地图、军标、迷雾、特效 */
(function () {
  'use strict';
  var SL = window.SL, U = SL.U, T = SL.Terrain, C = SL.COLORS;
  var R = (SL.Render = {});
  var cam = (R.cam = { x: 500, y: 500, zoom: 1.45, min: 0.72, max: 3.6 });
  var canvas = null, ctx = null, overlay = null, octx = null;
  var W = 1200, H = 800, dpr = 1;

  var proj = (R.proj = {
    x: function (wx) { return (wx - cam.x) * cam.zoom + W / 2; },
    y: function (wy) { return (wy - cam.y) * cam.zoom + H / 2; },
    w: W, h: H
  });

  R.markers = [];
  R.minimapCache = null;

  function attachLossHandlers(el) {
    // 注意：绝对不能 preventDefault()，否则浏览器不会自动恢复上下文
    el.addEventListener('contextlost', function () {
      R.markLost();
    });
    el.addEventListener('contextrestored', function () {
      R.dead = false;
      R.contextLost = false;
      R.contextLostAt = 0;
      R._blank = 0;
      R.recoverAttempts = 0;
      R.needsRebake = true;
    });
  }

  R.dead = false;
  R._blank = 0;
  R.recoverAttempts = 0;

  R.markLost = function () {
    if (R.dead) return;
    R.dead = true;
    R.contextLost = true;
    R.contextLostAt = performance.now();
  };

  R.init = function (el, overlayEl) {
    canvas = el;
    ctx = canvas.getContext('2d');
    overlay = overlayEl || null;
    octx = overlay ? overlay.getContext('2d') : null;
    attachLossHandlers(canvas);
    R.resize();
    window.addEventListener('resize', R.resize);
  };

  // 主动体检：不依赖 contextlost 事件，读一个像素判断画布是否还活着
  R.checkAlive = function () {
    if (!ctx || !canvas || !canvas.width || !canvas.height) { R.markLost(); return; }
    try {
      var px = ctx.getImageData(1, 1, 1, 1).data;
      if (px[3] === 0) {
        R._blank++;
        if (R._blank >= 2) R.markLost();
      } else {
        R._blank = 0;
        R.dead = false;
        R.contextLost = false;
        R.contextLostAt = 0;
        R.recoverAttempts = 0;
      }
    } catch (e) {
      R._blank++;
      R.markLost();
    }
  };

  // 上下文长时间没有自动恢复时，换一块新画布重建上下文
  R.recoverCanvas = function () {
    if (!canvas || !canvas.parentNode) return;
    R.recoverAttempts = (R.recoverAttempts || 0) + 1;
    var fresh = document.createElement('canvas');
    fresh.id = 'world';
    fresh.className = canvas.className;
    canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    ctx = canvas.getContext('2d');
    attachLossHandlers(canvas);
    R.dead = false;
    R.contextLost = false;
    R.contextLostAt = 0;
    R._blank = 0;
    R.lastError = null;
    R.needsRebake = true;
    R.minimapCache = null;
    R.resize();
  };

  R.resize = function () {
    if (!canvas) return;
    var baseDpr = Math.min(window.devicePixelRatio || 1, (SL.PERF && SL.PERF.maxDpr) || 1.25);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    // 高分辨率屏幕不按 CSS 像素无限放大：限制内部渲染像素总数，再用 CSS 拉伸。
    // 这样 1440p / 4K 不会因为填充率暴涨而掉帧，文字和 UI 仍由 DOM 保持清晰。
    var budget = (SL.PERF && SL.PERF.maxRenderPixels) || 2600000;
    var capDpr = Math.sqrt(budget / Math.max(1, W * H));
    dpr = Math.max(0.5, Math.min(baseDpr, capDpr));
    R.dpr = dpr;
    R.cssW = W;
    R.cssH = H;
    R.renderPixels = Math.round(W * H * dpr * dpr);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (overlay) {
      overlay.width = Math.round(W * dpr);
      overlay.height = Math.round(H * dpr);
    }
    proj.w = W;
    proj.h = H;
    // 最小缩放 = 让地图刚好铺满屏幕较长的一边，始终不露出地图外的空白
    cam.min = Math.max(W, H) / SL.CONFIG.mapSize;
    cam.max = Math.max(3.6, cam.min * 1.7);
    cam.zoom = U.clamp(cam.zoom, cam.min, cam.max);
    R.clampCam();
  };

  R.clampCam = function () {
    var T = SL.Terrain;
    var halfW = W / 2 / cam.zoom;
    var halfH = H / 2 / cam.zoom;
    // 允许镜头越出地图边缘一段距离，拖动时不会顶死在边界上
    var OS = 220;
    var loX = T.origin + halfW - OS;
    var hiX = T.end - halfW + OS;
    var loY = T.origin + halfH - OS;
    var hiY = T.end - halfH + OS;
    cam.x = loX <= hiX ? U.clamp(cam.x, loX, hiX) : 500;
    cam.y = loY <= hiY ? U.clamp(cam.y, loY, hiY) : 500;
  };

  // 开局取景：严格限制在地图内，避免第一眼就看到大片黑边
  R.clampCamStrict = function () {
    var T = SL.Terrain;
    var halfW = W / 2 / cam.zoom;
    var halfH = H / 2 / cam.zoom;
    var loX = T.origin + halfW, hiX = T.end - halfW;
    var loY = T.origin + halfH, hiY = T.end - halfH;
    cam.x = loX <= hiX ? U.clamp(cam.x, loX, hiX) : 500;
    cam.y = loY <= hiY ? U.clamp(cam.y, loY, hiY) : 500;
  };

  R.centerOn = function (x, y) {
    cam.x = x; cam.y = y;
    R.clampCam();
  };

  R.screenToWorld = function (sx, sy) {
    return { x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y };
  };

  R.zoomAt = function (sx, sy, factor) {
    var before = R.screenToWorld(sx, sy);
    cam.zoom = U.clamp(cam.zoom * factor, cam.min, cam.max);
    var after = R.screenToWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    R.clampCam();
  };

  R.addMarker = function (x, y, kind) {
    R.markers.push({ x: x, y: y, t: 0, dur: 0.8, kind: kind || 'move' });
  };

  /* ---------------- 主绘制 ---------------- */

  R.lastError = null;
  R.clearError = function () { R.lastError = null; };
  R._cleanFrames = 0;
  R.perf = R.perf || { updateMs: 0, renderMs: 0 };

  function noteError(name, e) {
    R._errThisFrame = true;
    if (!R.lastError) {
      R.lastError = name + ' · ' + ((e && e.message) ? e.message : String(e));
      try { console.error('[render]', name, e); } catch (err) {}
    }
  }

  function stage(name, fn) {
    ctx.save();
    try {
      fn();
    } catch (e) {
      noteError(name, e);
    } finally {
      try { ctx.restore(); } catch (err) {}
    }
  }

  R.draw = function (game, dt) {
    // 上下文丢失后按 0.8s / 1.6s / 3.2s / 6.4s 退避重试，换新画布
    if (R.dead && !R._replacing) {
      var wait = Math.min(6400, 800 * Math.pow(2, R.recoverAttempts || 0));
      if (!R.contextLostAt || performance.now() - R.contextLostAt >= wait) {
        R._replacing = true;
        try { R.recoverCanvas(); } catch (e) { R.markLost(); }
        R._replacing = false;
      }
    }
    if (!ctx) return;
    R._errThisFrame = false;
    if (R.needsRebake) {
      R.needsRebake = false;
      try { T.rebakeLayers(); } catch (e) { /* 忽略，下一帧继续 */ }
      R.minimapCache = null;
      if (game.resetFogCanvas) game.resetFogCanvas();
    }
    var tm = R.timings || (R.timings = { ground: 0, labels: 0, fog: 0, units: 0, effects: 0, n: 0 });
    var t0 = performance.now();
    // 每帧重置画布状态，避免任何一次异常把透明度/虚线/变换泄漏到后续绘制
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#151813';
    ctx.fillRect(0, 0, W, H);

    // 地图
    stage('terrain', function () {
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      T.drawGround(ctx, cam.zoom);
      if (T.zoneError) noteError('zones', { message: T.zoneError });
      if (T.treeError) noteError('trees', { message: T.treeError });
    });

    var t1 = performance.now();
    stage('labels', function () {
      T.drawLabels(ctx, proj, cam.zoom, function (x, y) { return game.isSeen(x, y); });
    });

    stage('fog', function () {
      drawWrecks(game);
      drawFog(game);
      drawPaths(game);
      drawObstacles(game);
    });
    stage('fortRanges', function () {
      drawFortRanges(game);
    });

    stage('airPatrols', function () {
      drawAirPatrols(game);
    });
    var t2 = performance.now();

    // 单位
    var visible = [];
    var cullPad = 96;
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive) continue;
      if (u.side !== 'blue' && !game.unitVisibleTo('blue', u)) continue;
      // 视口裁剪：屏幕外单位不再进入后续绘制/文字/血条路径
      var usx = proj.x(u.x), usy = proj.y(u.y);
      if (usx < -cullPad || usx > W + cullPad || usy < -cullPad || usy > H + cullPad) continue;
      visible.push(u);
    }
    visible.sort(function (a, b) { return a.y - b.y; });
    R.visibleUnits = visible.length;
    // 近景显示完整信息；中景保留血条；远景只画单位本体
    R.lod = cam.zoom >= 1.15 ? 2 : (cam.zoom >= 0.85 ? 1 : 0);

    stage('support', function () {
      drawSupport(game);
    });

    stage('units', function () {
      var nSel = game.selected.length;
      for (var s = 0; s < game.selected.length; s++) {
        drawRangeRing(game.selected[s], nSel);
      }
      for (var v = 0; v < visible.length; v++) {
        if (visible[v].selected) continue;
        drawUnit(game, visible[v]);
      }
      for (var v2 = 0; v2 < visible.length; v2++) {
        if (visible[v2].selected) drawUnit(game, visible[v2]);
      }
    });
    stage('fortMarkers', function () {
      drawFortMarkers(game);
    });

    stage('bossAims', function () {
      drawBossAims(game);
    });

    stage('bombs', function () {
      drawBombs(game);
    });

    var t3 = performance.now();

    stage('effects', function () {
      drawEffects(game);
      drawMarkers(dt);
      drawSelectionBox();
    });
    if (octx) {
      try {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.clearRect(0, 0, W, H);
        drawOffscreenMarkers(octx, game);
      } catch (e) {
        if (!R.lastError) R.lastError = 'overlay · ' + ((e && e.message) ? e.message : String(e));
      }
    }
    var t4 = performance.now();

    tm.ground += t1 - t0;
    tm.labels += t2 - t1;
    tm.units += t3 - t2;
    tm.effects += t4 - t3;
    tm.n++;
    R.perf.renderMs = performance.now() - t0;

    // 连续多帧无异常后自动清除错误提示
    if (!R._errThisFrame && R.lastError) {
      R._cleanFrames++;
      if (R._cleanFrames > 30) R.clearError();
    } else if (R._errThisFrame) {
      R._cleanFrames = 0;
    }

    // 每秒体检一次画布：画布透明/上下文失效都会被主动发现并重建
    R._healthT = (R._healthT || 0) + (dt || 0.016);
    if (R._healthT > 1.1) {
      R._healthT = 0;
      R.checkAlive();
    }
  };

  // 阵地武器射程：只要建筑未被摧毁就常显
  function drawFortRanges(game) {
    if (!game || !SL.Terrain.zones) return;
    for (var i = 0; i < SL.Terrain.zones.length; i++) {
      var z = SL.Terrain.zones[i];
      var structs = (z.structures && z.structures.length) ? z.structures : (z.structure ? [z.structure] : []);
      if (!structs.length || !z.owner) continue;
      if (game.fogEnabled !== false && z.owner !== 'blue' && !game.isSeen(z.x, z.y)) continue;
      for (var sfi = 0; sfi < structs.length; sfi++) {
        var st = structs[sfi];
        if (!st || st.hp <= 0) continue;
        var range = 0, minRange = 0, airRange = 0;
        if (st.type === 'bunker') range = SL.FORT.bunkerRange;
        else if (st.type === 'mortar') { range = SL.FORT.mortarRange; minRange = 30; }
        else if (st.type === 'at_nest') range = SL.FORT.atNestRange;
        else if (st.type === 'flak88') { range = SL.FORT.flakGroundRange; airRange = SL.FORT.flakAirRange; }
        if (!range) continue;
        var sx = proj.x(z.x), sy = proj.y(z.y);
        var side = SL.SIDES[z.owner] || SL.SIDES.blue;
        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = side.light;
        ctx.globalAlpha = z.owner === 'blue' ? 0.72 : 0.42;
        ctx.beginPath();
        ctx.arc(sx, sy, range * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
        if (minRange) {
          ctx.setLineDash([2, 4]);
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(sx, sy, minRange * cam.zoom, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (airRange) {
          ctx.setLineDash([3, 9]);
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.arc(sx, sy, airRange * cam.zoom, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  function drawRangeRing(u, nSel) {
    var sx = proj.x(u.x), sy = proj.y(u.y);
    var k = nSel <= 1 ? 1 : (nSel <= 3 ? 0.62 : 0.34);
    var rRange = (u.maxRangeNow || u.rangeNow || u.def.range) * cam.zoom;
    var rVis = u.def.vision * cam.zoom;
    ctx.save();

    // 视野圈
    if (k > 0.4) {
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(36,78,124,' + (0.30 * k).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, rVis, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 射程圈（含装备）
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(30,84,140,' + (0.62 * k).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(sx, sy, rRange, 0, Math.PI * 2);
    ctx.stroke();

    // 最小射程
    if (u.def.minRange) {
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(176,100,38,' + (0.5 * k).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, u.def.minRange * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 行军路径 ---------------- */

  function drawPaths(game) {
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive || u.side !== 'blue' || !u.order || !u.selected) continue;
      var o = u.order;
      var tx = null, ty = null;
      if (o.kind === 'attack') {
        if (!o.target || !o.target.alive) continue;
        tx = o.target.x; ty = o.target.y;
      } else if (o.x != null) {
        tx = o.x; ty = o.y;
      }
      if (tx === null) continue;
      var sx = proj.x(u.x), sy = proj.y(u.y);
      var ex = proj.x(tx), ey = proj.y(ty);
      if (Math.abs(ex - sx) < 3 && Math.abs(ey - sy) < 3) continue;
      var attack = o.kind === 'attack';
      var color = attack ? '#b04a35' : (o.sprint ? '#c47f2c' : '#2f6a4a');
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.lineCap = 'round';
      ctx.setLineDash(attack ? [3, 4] : [6, 5]);
      ctx.strokeStyle = 'rgba(236,228,205,0.55)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);

      // 终点标记
      var ang = Math.atan2(ey - sy, ex - sx);
      if (attack) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.moveTo(ex - 8, ey); ctx.lineTo(ex + 8, ey);
        ctx.moveTo(ex, ey - 8); ctx.lineTo(ex, ey + 8);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.42) * 9, ey - Math.sin(ang - 0.42) * 9);
        ctx.lineTo(ex - Math.cos(ang + 0.42) * 9, ey - Math.sin(ang + 0.42) * 9);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // 距离标注（仅选中单位）
      if (u.selected) {
        var mx = (sx + ex) / 2, my = (sy + ey) / 2;
        var dm = Math.round(U.dist(u.x, u.y, tx, ty));
        ctx.save();
        ctx.font = '9px ' + SL.FONT_MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(20,26,20,0.55)';
        ctx.fillRect(mx - 20, my - 7, 40, 14);
        ctx.fillStyle = o.sprint ? '#f0c07a' : '#d8e4cf';
        ctx.fillText(dm + ' m' + (o.sprint ? '  »' : ''), mx, my);
        ctx.restore();
      } else if (e.kind === 'dust') {
        sx = proj.x(e.x); sy = proj.y(e.y);
        var dr = e.size * (1 + k * 2.4);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.fillStyle = '#b8a98a';
        ctx.beginPath();
        ctx.arc(sx, sy, dr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'text') {
        sx = proj.x(e.x);
        sy = proj.y(e.y) - k * 26;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - k) * 1.7);
        ctx.font = '700 11px ' + SL.FONT_MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(18,20,16,0.55)';
        ctx.strokeText(e.text, sx, sy);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, sx, sy);
        ctx.restore();
      }
    }
  }

  /* ---------------- 单位符号 ---------------- */

  function unitScreenSize() {
    return 24 + 12 * U.clamp((cam.zoom - 0.6) / 1.6, 0, 1);
  }

  // 工事单位标记绘制在单位之上，避免被驻守步兵完全遮住
  function drawAirPatrols(game) {
    var groups = {};
    for (var i = 0; i < game.planes.length; i++) {
      var p = game.planes[i];
      if (!p || p.kind !== 'fighter' || p.hp <= 0) continue;
      var left = Math.max(0, (p.dur || 0) - (p.t || 0));
      if (left <= 0) continue;
      var key = p.side + ':' + Math.round(p.cx) + ':' + Math.round(p.cy);
      if (!groups[key] || left > groups[key].left) {
        groups[key] = { cx: p.cx, cy: p.cy, r: p.orbitR || 250, left: left, dur: p.dur || 60, side: p.side };
      }
    }
    for (var k in groups) {
      var g = groups[k];
      var sx = proj.x(g.cx), sy = proj.y(g.cy);
      var rr = g.r * cam.zoom;
      var blue = g.side === 'blue';
      ctx.save();
      ctx.fillStyle = blue ? 'rgba(70,140,230,0.055)' : 'rgba(220,90,50,0.05)';
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([10, 6]);
      ctx.strokeStyle = blue ? 'rgba(120,190,255,0.92)' : 'rgba(255,135,90,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = blue ? 'rgba(180,225,255,0.95)' : 'rgba(255,190,130,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, rr + 5, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * U.clamp(g.left / g.dur, 0, 1));
      ctx.stroke();
      ctx.strokeStyle = blue ? 'rgba(180,225,255,0.7)' : 'rgba(255,190,130,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy); ctx.lineTo(sx + 12, sy);
      ctx.moveTo(sx, sy - 12); ctx.lineTo(sx, sy + 12);
      ctx.stroke();
      var label = '制空圈 · 剩余 ' + g.left.toFixed(1) + 's';
      ctx.font = '800 12px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var tw = ctx.measureText(label).width + 14;
      var lx = sx - tw / 2, ly = sy - rr - 24;
      ctx.fillStyle = 'rgba(10,20,32,0.82)';
      roundRect(ctx, lx, ly, tw, 18, 4);
      ctx.fill();
      ctx.strokeStyle = blue ? 'rgba(120,190,255,0.9)' : 'rgba(255,135,90,0.9)';
      ctx.lineWidth = 1;
      roundRect(ctx, lx, ly, tw, 18, 4);
      ctx.stroke();
      ctx.fillStyle = blue ? '#d2ecff' : '#ffe0c8';
      ctx.fillText(label, sx, ly + 9.5);
      ctx.restore();
    }
  }

  function drawSkull(x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(28,22,16,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -size * 0.15, size * 0.55, Math.PI, 0);
    ctx.lineTo(size * 0.55, size * 0.2);
    ctx.lineTo(-size * 0.55, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-size * 0.28, size * 0.2, size * 0.56, size * 0.28);
    ctx.fillStyle = '#211a12';
    ctx.beginPath();
    ctx.arc(-size * 0.22, -size * 0.12, size * 0.13, 0, Math.PI * 2);
    ctx.arc(size * 0.22, -size * 0.12, size * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-size * 0.06, size * 0.02, size * 0.12, size * 0.15);
    ctx.restore();
  }

  function drawBossAims(game) {
    function drawAim(aim, label, total, radius, color) {
      var sx = proj.x(aim.x), sy = proj.y(aim.y);
      var rr = (aim.radius || radius) * cam.zoom;
      ctx.save();
      ctx.fillStyle = 'rgba(220,70,45,0.10)';
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      var leftRatio = U.clamp(1 - aim.t / (total || 5), 0, 1);
      ctx.strokeStyle = 'rgba(255,190,90,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, rr + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * leftRatio);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,210,120,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - 10, sy); ctx.lineTo(sx + 10, sy);
      ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy + 10);
      ctx.stroke();
      var aimLeft = Math.max(0, (total || 5) - aim.t);
      var aimLabel = label + ' ' + aimLeft.toFixed(1) + 's';
      ctx.font = '800 12px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(24,12,8,0.9)';
      ctx.strokeText(aimLabel, sx, sy - rr - 14);
      ctx.fillStyle = 'rgba(255,228,160,0.98)';
      ctx.fillText(aimLabel, sx, sy - rr - 14);
      ctx.restore();
    }
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive) continue;
      if (u.bossAim) drawAim(u.bossAim, '主炮攻击倒计时',
        SL.BOSS.superTank.mainAimTime || 5, 75, 'rgba(255,92,64,0.95)');
      if (u.bossSecAim) drawAim(u.bossSecAim, '副炮攻击倒计时',
        SL.BOSS.superTank.secondaryAimTime || 3, 90, 'rgba(255,150,60,0.95)');
    }
  }

  function drawBombs(game) {
    for (var i = 0; i < (game.bombs || []).length; i++) {
      var b = game.bombs[i];
      var sx = proj.x(b.x), sy = proj.y(b.y);
      var rr = b.radius * cam.zoom;
      var left = Math.max(0, b.dur - b.t);
      ctx.save();
      ctx.fillStyle = 'rgba(210,60,40,0.12)';
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(255,90,60,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,190,90,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, rr + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * U.clamp(left / b.dur, 0, 1));
      ctx.stroke();
      ctx.fillStyle = '#241b16';
      ctx.strokeStyle = '#ffcc80';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      var bombLabel = '炸弹倒计时 ' + left.toFixed(1) + 's';
      ctx.font = '800 12px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(24,12,8,0.9)';
      ctx.strokeText(bombLabel, sx, sy - rr - 14);
      ctx.fillStyle = '#ffd8a0';
      ctx.fillText(bombLabel, sx, sy - rr - 14);
      ctx.restore();
    }
  }

  function drawFortMarkers(game) {
    if (!game || !SL.Terrain.zones) return;
    for (var i = 0; i < SL.Terrain.zones.length; i++) {
      var z = SL.Terrain.zones[i];
      if (!z.fortified) continue;
      if (game.fogEnabled !== false && !game.isSeen(z.x, z.y)) continue;
      var structs = (z.structures && z.structures.length) ? z.structures : (z.structure ? [z.structure] : []);
      if (!structs.length) continue;
      var sx = R.proj.x(z.x), sy = R.proj.y(z.y);
      var n = structs.length;
      for (var si = 0; si < n; si++) {
        var st = structs[si];
        if (!st) continue;
        var off = (si - (n - 1) / 2) * 23;
        ctx.save();
        ctx.translate(sx + off, sy);
        ctx.fillStyle = 'rgba(24,23,17,0.90)';
        ctx.strokeStyle = 'rgba(238,208,128,0.98)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(244,220,150,0.98)';
        ctx.strokeStyle = 'rgba(244,220,150,0.98)';
        ctx.lineWidth = 1.6;
        if (st.type === 'bunker') {
          ctx.fillRect(-6, -3.5, 12, 7);
          ctx.strokeRect(-6, -3.5, 12, 7);
          ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();
        } else if (st.type === 'mortar') {
          ctx.beginPath(); ctx.moveTo(-3.5, 4); ctx.lineTo(1.5, -5); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 5, 3, 0, Math.PI); ctx.stroke();
        } else if (st.type === 'at_nest') {
          ctx.fillRect(-5, -2.5, 10, 5);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, -2.5); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -8); ctx.lineTo(0, 8);
          ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
          ctx.stroke();
        }
        var aw = 20, ah = 2.2;
        ctx.fillStyle = 'rgba(16,18,14,0.8)';
        ctx.fillRect(-aw / 2, 15, aw, ah);
        ctx.fillStyle = st.ammo > 0 ? '#e0b95c' : '#8a3f33';
        ctx.fillRect(-aw / 2, 15, aw * Math.max(0, (st.ammo || 0) / (st.maxAmmo || 1)), ah);
        ctx.restore();
      }
    }
  }

  function drawUnit(game, u) {
    var lod = R.lod === undefined ? 2 : R.lod;
    var full = lod >= 2 || !!u.selected || !!u.bossKind;
    var mid = lod >= 1 || full;
    var size = unitScreenSize() * (u.type === 'boss_super' ? 2.15
      : (u.type === 'heavy_tank' || u.type === 'heavy_arty' ? 1.2
        : (u.type === 'aa' ? 0.94 : 1)));
    var sx = proj.x(u.x), sy = proj.y(u.y);
    var w = size, h = size * 0.64;
    var S = SL.SIDES[u.side] || SL.SIDES.blue;
    var fill = S.color;
    var line = S.light;
    var acc = S.light;

    // 炮管（先画，压在车身下面）
    if (u.type !== 'infantry' && u.type !== 'target' && u.type !== 'command' &&
      u.type !== 'rocket_arty' && u.type !== 'engineer_vehicle') {
      var len = (u.type === 'artillery' || u.type === 'heavy_arty') ? w * 0.95
        : (u.type === 'at_gun' ? w * 0.82
        : ((u.type === 'tank' || u.type === 'heavy_tank') ? w * 0.78
          : (u.type === 'boss_super' ? w * 0.95 : w * 0.5)));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(u.turret);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(20,26,20,0.45)';
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len + 1, 0);
      ctx.stroke();
      ctx.strokeStyle = acc;
      ctx.lineWidth = (u.type === 'artillery' || u.type === 'heavy_arty') ? 2 : 2.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 地面阴影
    ctx.fillStyle = 'rgba(20,24,16,0.28)';
    roundRect(ctx, sx - w / 2 + 2, sy - h / 2 + 3, w, h, 3);
    ctx.fill();

    // 车身（保持水平，便于识别）
    ctx.fillStyle = fill;
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.4;
    roundRect(ctx, sx - w / 2, sy - h / 2, w, h, 3);
    ctx.fill();
    ctx.stroke();

    // 兵种符号
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    if (u.type === 'target') {
      ctx.strokeStyle = 'rgba(255,235,210,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, h * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, h * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#d0573f';
      ctx.beginPath();
      ctx.arc(sx, sy, h * 0.11, 0, Math.PI * 2);
      ctx.fill();
    } else if (u.type === 'infantry') {
      ctx.moveTo(sx - w / 2 + 3, sy - h / 2 + 2.5);
      ctx.lineTo(sx + w / 2 - 3, sy + h / 2 - 2.5);
      ctx.moveTo(sx + w / 2 - 3, sy - h / 2 + 2.5);
      ctx.lineTo(sx - w / 2 + 3, sy + h / 2 - 2.5);
      ctx.stroke();
    } else if (u.type === 'armored' || u.type === 'aa') {
      ctx.moveTo(sx - w / 2 + 3, sy + h / 2 - 2.5);
      ctx.lineTo(sx + w / 2 - 3, sy - h / 2 + 2.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx - w * 0.22, sy + h * 0.2, h * 0.11, 0, Math.PI * 2);
      ctx.arc(sx + w * 0.22, sy + h * 0.2, h * 0.11, 0, Math.PI * 2);
      ctx.fill();
      if (u.type === 'aa') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(sx, sy, h * 0.42, Math.PI * 1.05, Math.PI * 1.75);
        ctx.stroke();
      }
    } else if (u.type === 'rocket_arty') {
      // 十联装火箭发射巢：两排五管
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      for (var rr = 0; rr < 2; rr++) {
        for (var cc = 0; cc < 5; cc++) {
          var rx = sx - w * 0.3 + cc * w * 0.14;
          var ry = sy - h * 0.19 + rr * h * 0.22;
          ctx.strokeRect(rx, ry, w * 0.1, h * 0.15);
        }
      }
    } else if (u.type === 'command') {
      // 指挥车：天线与指挥旗
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx + w * 0.18, sy - h * 0.1);
      ctx.lineTo(sx + w * 0.18, sy - h * 0.62);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,235,180,0.95)';
      ctx.beginPath();
      ctx.moveTo(sx + w * 0.18, sy - h * 0.62);
      ctx.lineTo(sx + w * 0.42, sy - h * 0.5);
      ctx.lineTo(sx + w * 0.18, sy - h * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(sx - w * 0.14, sy + h * 0.13, h * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (u.type === 'engineer_vehicle') {
      // 工程车：扳手 / 工程臂
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(sx - w * 0.22, sy - h * 0.12);
      ctx.lineTo(sx + w * 0.22, sy + h * 0.14);
      ctx.moveTo(sx - w * 0.22, sy + h * 0.14);
      ctx.lineTo(sx + w * 0.22, sy - h * 0.12);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,235,180,0.95)';
      ctx.beginPath();
      ctx.arc(sx - w * 0.23, sy - h * 0.13, h * 0.1, 0, Math.PI * 2);
      ctx.arc(sx + w * 0.23, sy + h * 0.15, h * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (u.type === 'tank' || u.type === 'heavy_tank' || u.type === 'boss_super') {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * 0.33, h * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (u.type === 'heavy_tank') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(sx, sy, w * 0.24, h * 0.14, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(sx, sy, h * 0.11, 0, Math.PI * 2);
      ctx.fill();
    } else if (u.type === 'artillery' || u.type === 'heavy_arty' || u.type === 'at_gun') {
      ctx.beginPath();
      ctx.arc(sx, sy, h * 0.19, 0, Math.PI * 2);
      ctx.fill();
      if (u.type === 'heavy_arty') {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(sx, sy, h * 0.31, 0, Math.PI * 2);
        ctx.stroke();
      } else if (u.type === 'at_gun') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx - w * 0.26, sy + h * 0.24);
        ctx.lineTo(sx + w * 0.26, sy + h * 0.24);
        ctx.stroke();
      }
    }

    // 幽灵兵团：骷髅头直接画在单位棋子上
    if (u.bossKind === 'ghost') {
      var skullSize = U.clamp(Math.min(w, h) * 0.62, 9, 18);
      drawSkull(sx, sy - h * 0.06, skullSize, '#f0e6c8');
    }

    // 朝向指示
    if (u.type === 'infantry') {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(u.facing);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(w * 0.5 + 4, 0);
      ctx.lineTo(w * 0.5 + 0.5, -3.2);
      ctx.lineTo(w * 0.5 + 0.5, 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 步兵装备小图标（近景或选中时显示）
    if (full && u.type === 'infantry' && u.items && u.items.length) {
      ctx.save();
      var badges = u.items.slice(0, 6);
      var bsz = U.clamp(w * 0.52, 12, 22);
      var step = bsz * 1.06;
      var bxs = sx - (badges.length * step) / 2;
      var byy = sy - h / 2 - bsz - 9;
      for (var bi = 0; bi < badges.length; bi++) {
        var eqd = SL.EQUIP[badges[bi].key];
        if (!eqd) continue;
        var bx0 = bxs + bi * step;
        ctx.fillStyle = 'rgba(20,22,17,0.94)';
        ctx.fillRect(bx0, byy, bsz, bsz);
        ctx.strokeStyle = eqd.slot === 'weapon' ? 'rgba(238,198,104,1)' : 'rgba(126,204,206,1)';
        ctx.lineWidth = Math.max(1, bsz * 0.09);
        ctx.strokeRect(bx0, byy, bsz, bsz);
        ctx.fillStyle = eqd.slot === 'weapon' ? '#ffe3a0' : '#b7f0ec';
        ctx.font = '700 ' + Math.max(7, Math.round(bsz * 0.56)) + 'px ' + SL.FONT_UI;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(eqd.icon, bx0 + bsz / 2, byy + bsz / 2 + 0.4);
      }
      ctx.restore();
    }

    // 受击白闪
    if (u.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.7, u.hitFlash * 4);
      ctx.fillStyle = '#fff8e0';
      roundRect(ctx, sx - w / 2, sy - h / 2, w, h, 3);
      ctx.fill();
      ctx.restore();
    }

    // 工程车：工程值进度条直接画在车身上
    if (u.type === 'engineer_vehicle') {
      var evMax = Math.max(1, u.engineerMax || SL.ENGINEER.maxValue || 200);
      var evr = U.clamp((u.engineerValue || 0) / evMax, 0, 1);
      var evw = w * 0.8;
      var evx = sx - evw / 2;
      var evy = sy + h / 2 - 4.5;
      ctx.save();
      ctx.fillStyle = 'rgba(8,18,16,0.9)';
      ctx.fillRect(evx, evy, evw, 3);
      ctx.fillStyle = evr < 0.2 ? '#d07a58' : '#6fd0c8';
      ctx.fillRect(evx, evy, evw * evr, 3);
      ctx.strokeStyle = 'rgba(8,12,10,0.7)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(evx, evy, evw, 3);
      ctx.restore();
    }

    // 血条
    var hpw = w * 1.05;
    var hpr = u.hp / u.maxHp;
    var by = sy - h / 2 - 8;
    if (mid) {
      ctx.fillStyle = 'rgba(16,20,18,0.72)';
      ctx.fillRect(sx - hpw / 2, by, hpw, 3.5);
      var hpColor = hpr > 0.6 ? '#7fd4a0' : (hpr > 0.3 ? '#e5c46a' : '#e06a52');
      ctx.fillStyle = hpColor;
      ctx.fillRect(sx - hpw / 2, by, hpw * hpr, 3.5);
      ctx.strokeStyle = 'rgba(10,12,10,0.5)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(sx - hpw / 2, by, hpw, 3.5);
    }

    // 装填进度条（所有有武器的单位）
    var rwDef = u.def.weapon;
    if (full && rwDef && rwDef.interval && u.type !== 'command' && u.type !== 'target') {
      var reloadMax = rwDef.rockets ? rwDef.reload : ((rwDef.mag && u.magLeft <= 0) ? rwDef.reload : rwDef.interval);
      if (reloadMax) {
        var reloadP = U.clamp(1 - Math.max(0, u.cd || 0) / reloadMax, 0, 1);
        var rlw = hpw * 0.72, rlh = 2.2, rly = by - 4.2;
        ctx.fillStyle = 'rgba(16,20,18,0.68)';
        ctx.fillRect(sx - rlw / 2, rly, rlw, rlh);
        ctx.fillStyle = reloadP >= 1 ? 'rgba(127,212,160,0.95)' : 'rgba(215,165,88,0.98)';
        ctx.fillRect(sx - rlw / 2, rly, rlw * reloadP, rlh);
      }
    }

    // 隐蔽标记：光环 + 名称下方醒目标签
    if (full && u.concealed) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = u.ghost ? 'rgba(120,205,255,0.98)' : 'rgba(216,232,160,0.9)';
      ctx.lineWidth = u.ghost ? 1.8 : 1;
      if (u.ghost) {
        ctx.shadowColor = 'rgba(80,170,255,0.85)';
        ctx.shadowBlur = 9;
      }
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * 0.78, h * 0.95, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 掩体标记
    if (full && u.type === 'infantry' && u.cover && u.cover.dr > 0.08) {
      var cx = sx - hpw / 2 - 7, cyy = by + 2;
      ctx.save();
      ctx.fillStyle = 'rgba(64, 96, 66, 0.9)';
      ctx.strokeStyle = 'rgba(232, 238, 210, 0.85)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cyy - 5);
      ctx.lineTo(cx + 4, cyy - 3);
      ctx.lineTo(cx + 4, cyy + 1.5);
      ctx.lineTo(cx, cyy + 5);
      ctx.lineTo(cx - 4, cyy + 1.5);
      ctx.lineTo(cx - 4, cyy - 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 急行军标记
    if (full && u.sprinting) {
      ctx.save();
      ctx.fillStyle = '#e0a04a';
      ctx.font = '700 9px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.fillText('»', sx + hpw / 2 + 6, by + 2);
      ctx.restore();
    }

    // 小字名牌
    if (full) {
      ctx.font = '10px ' + SL.FONT_UI;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(233,224,200,0.9)';
      ctx.strokeText(u.name, sx, sy + h / 2 + 9);
      ctx.fillStyle = S.dark;
      ctx.fillText(u.name, sx, sy + h / 2 + 9);
      if (u.concealed) {
        var stText = u.ghost ? '幽灵' : '隐蔽';
        var stColor = u.ghost ? '#bfe3ff' : '#e4edb0';
        var stBorder = u.ghost ? 'rgba(110,190,255,0.98)' : 'rgba(220,232,160,0.85)';
        var stFill = u.ghost ? 'rgba(12,30,52,0.96)' : 'rgba(42,46,26,0.92)';
        ctx.font = '800 9px ' + SL.FONT_MONO;
        var stw = ctx.measureText(stText).width + 14;
        var sth = 14;
        var stx = sx - stw / 2;
        var sty = sy + h / 2 + 15;
        ctx.save();
        if (u.ghost) {
          ctx.shadowColor = 'rgba(80,170,255,0.9)';
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = stFill;
        roundRect(ctx, stx, sty, stw, sth, 4);
        ctx.fill();
        ctx.strokeStyle = stBorder;
        ctx.lineWidth = 1.2;
        roundRect(ctx, stx, sty, stw, sth, 4);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = stColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stText, sx, sty + sth / 2 + 0.5);
        ctx.restore();
      } else if ((u.type === 'at_gun' || u.type === 'command') && u.atStealthT > 0) {
        var atLeft = Math.max(0, (SL.AT_STEALTH.delay || 5) - u.atStealthT);
        var atText = '隐蔽倒计时 ' + atLeft.toFixed(1) + 's';
        ctx.font = '800 9px ' + SL.FONT_MONO;
        var atw = ctx.measureText(atText).width + 14;
        var atx = sx - atw / 2;
        var aty = sy + h / 2 + 15;
        ctx.save();
        ctx.fillStyle = 'rgba(44,38,20,0.94)';
        roundRect(ctx, atx, aty, atw, 14, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,196,104,0.9)';
        ctx.lineWidth = 1.2;
        roundRect(ctx, atx, aty, atw, 14, 4);
        ctx.stroke();
        ctx.fillStyle = '#f0d89a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(atText, sx, aty + 7.5);
        ctx.restore();
      }
    }

    // 火炮收炮 / 移动 / 架设状态
    if (full && SL.ARTILLERY[u.type]) {
      var stateText = '', stateColor = '#9aa89a';
      if (u.deployState === 'moving') { stateText = '移动'; stateColor = '#b9c2b0'; }
      else if (u.deployState === 'packing') { stateText = '收炮 ' + u.deployTimer.toFixed(1) + 's'; stateColor = '#e8c47a'; }
      else if (u.deployState === 'deploying') { stateText = '架设 ' + u.deployTimer.toFixed(1) + 's'; stateColor = '#f0a866'; }
      else if (u.deployState === 'deployed') { stateText = '就绪'; stateColor = '#9fe0a0'; }
      if (stateText) {
        ctx.save();
        ctx.font = '700 8px ' + SL.FONT_MONO;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(16,20,18,0.85)';
        ctx.strokeText(stateText, sx, sy + h / 2 + 21);
        ctx.fillStyle = stateColor;
        ctx.fillText(stateText, sx, sy + h / 2 + 21);
        ctx.restore();
      }
    }

    // 选中标记
    if (u.selected) {
      ctx.strokeStyle = 'rgba(220,245,190,0.95)';
      ctx.lineWidth = 1.6;
      var bx = w / 2 + 6, byy = h / 2 + 5, L = 6;
      ctx.beginPath();
      ctx.moveTo(sx - bx, sy - byy + L); ctx.lineTo(sx - bx, sy - byy); ctx.lineTo(sx - bx + L, sy - byy);
      ctx.moveTo(sx + bx - L, sy - byy); ctx.lineTo(sx + bx, sy - byy); ctx.lineTo(sx + bx, sy - byy + L);
      ctx.moveTo(sx + bx, sy + byy - L); ctx.lineTo(sx + bx, sy + byy); ctx.lineTo(sx + bx - L, sy + byy);
      ctx.moveTo(sx - bx + L, sy + byy); ctx.lineTo(sx - bx, sy + byy); ctx.lineTo(sx - bx, sy + byy - L);
      ctx.stroke();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /* 屏幕外部队指示：部队走出镜头时在屏幕边缘给出方向（画在 HUD 之上的叠加层） */
  function drawOffscreenMarkers(g2, game) {
    var margin = 30;
    var top = 74;
    var cx = W / 2, cy = H / 2;
    var off = [];
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive || u.side !== 'blue') continue;
      var sx = proj.x(u.x), sy = proj.y(u.y);
      if (sx > margin && sx < W - margin && sy > top && sy < H - margin) continue;
      off.push({ u: u, sx: sx, sy: sy });
    }
    if (!off.length) return;
    var marks = [];
    for (var k = 0; k < off.length; k++) {
      var o = off[k];
      var dx = o.sx - cx, dy = o.sy - cy;
      var ang = Math.atan2(dy, dx);
      var tx = Math.abs(dx) > 0.001 ? ((dx > 0 ? W - margin : margin) - cx) / dx : Infinity;
      var ty = Math.abs(dy) > 0.001 ? ((dy > 0 ? H - margin : top) - cy) / dy : Infinity;
      var t = Math.min(tx, ty);
      if (!isFinite(t) || t < 0) t = 0;
      marks.push({ x: cx + dx * t, y: cy + dy * t, ang: ang, u: o.u });
    }
    // 位置接近的合并成一个箭头
    var clusters = [];
    for (var m = 0; m < marks.length; m++) {
      var mk = marks[m];
      var found = null;
      for (var ci = 0; ci < clusters.length; ci++) {
        if (U.dist2(mk.x, mk.y, clusters[ci].x, clusters[ci].y) < 40 * 40) { found = clusters[ci]; break; }
      }
      if (found) {
        found.n++;
        found.units.push(mk.u);
        found.sel = found.sel || mk.u.selected;
      } else {
        clusters.push({ x: mk.x, y: mk.y, ang: mk.ang, n: 1, units: [mk.u], sel: mk.u.selected });
      }
    }
    for (var q = 0; q < clusters.length; q++) {
      var cl = clusters[q];
      g2.save();
      g2.globalAlpha = cl.sel ? 0.95 : 0.62;
      g2.translate(cl.x, cl.y);
      g2.rotate(cl.ang);
      g2.fillStyle = '#7fb4e0';
      g2.strokeStyle = 'rgba(12,18,24,0.8)';
      g2.lineWidth = 1;
      g2.beginPath();
      g2.moveTo(9, 0);
      g2.lineTo(-4, -6);
      g2.lineTo(-1, 0);
      g2.lineTo(-4, 6);
      g2.closePath();
      g2.fill();
      g2.stroke();
      g2.restore();

      if (cl.n > 1) {
        g2.save();
        g2.font = '700 9px ' + SL.FONT_MONO;
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        g2.fillStyle = 'rgba(12,18,24,0.72)';
        g2.fillRect(cl.x - 10, cl.y - 17, 20, 12);
        g2.fillStyle = '#cfe6ff';
        g2.fillText('×' + cl.n, cl.x, cl.y - 11);
        g2.restore();
      }
    }
  }

  /* ---------------- 迷雾 ---------------- */

  function drawFog(game) {
    if (game.fogEnabled === false) return;
    if (typeof game.buildFogCanvas !== 'function') return;
    var f = game.fog;
    var now = performance.now();
    if (f.forceFallbackUntil && now < f.forceFallbackUntil) {
      drawFogFallback(game);
      return;
    }
    // 离屏迷雾画布定期换新，避免长时间使用后上下文静默失效
    if (f.canvas && now - (f.createdAt || 0) > 15000) game.resetFogCanvas();
    if (!f.canvas || f.builtVersion !== f.version) {
      try { game.buildFogCanvas(); f.bornAt = now; } catch (e) { /* 下一帧再试 */ }
    }
    // 每秒探测一次：画面全透明但仍有未探索区域 → 重建；重建失败则走直接绘制兜底
    if (f.canvas && now - (f.checkedAt || 0) > 1000) {
      f.checkedAt = now;
      if (!fogCanvasHasInk(game)) {
        game.resetFogCanvas();
        try { game.buildFogCanvas(); f.bornAt = now; } catch (e) { /* 兜底 */ }
        if (!fogCanvasHasInk(game)) f.forceFallbackUntil = now + 5000;
      }
    }
    if (!f.canvas) {
      drawFogFallback(game);
      return;
    }
    var mapSize = SL.CONFIG.mapSize;
    var x0 = proj.x(0), y0 = proj.y(0);
    var x1 = proj.x(mapSize), y1 = proj.y(mapSize);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    try {
      ctx.drawImage(f.canvas, x0, y0, x1 - x0, y1 - y0);
    } catch (e) {
      game.resetFogCanvas();
      ctx.restore();
      drawFogFallback(game);
      return;
    }
    ctx.restore();
  }

  // 检查迷雾画布是否真的画上了东西：找几个未探索格，读它们的 alpha
  function fogCanvasHasInk(game) {
    var f = game.fog;
    if (!f.canvas || !f.ctx) return false;
    var res = f.res;
    var probes = 0;
    for (var i = 0; i < res * res && probes < 4; i += 97) {
      if (f.vis[i]) continue;
      probes++;
      try {
        var a = f.ctx.getImageData(i % res, (i / res) | 0, 1, 1).data[3];
        if (a > 4) return true;
      } catch (e) {
        return false;
      }
    }
    return probes === 0;  // 全图可见时没有迷雾是正常的
  }

  // 兜底迷雾：直接用低分辨率色块绘制，避免离屏画布失效时完全看不到迷雾
  function drawFogFallback(game) {
    var f = game.fog;
    var res = f.res;
    var step = 4;
    var cells = Math.ceil(res / step);
    var ms = SL.CONFIG.mapSize;
    var cell = ms / cells;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (var cy = 0; cy < cells; cy++) {
      var run = 0, prev = -1;
      for (var cx = 0; cx <= cells; cx++) {
        var a = 0;
        if (cx < cells) {
          var idx = Math.min(res - 1, cy * step) * res + Math.min(res - 1, cx * step);
          a = f.vis[idx] ? 0 : (f.seen[idx] ? 58 : 198);
        }
        if (cx === cells || a !== prev) {
          if (prev > 0) {
            ctx.fillStyle = 'rgba(10,14,18,' + (prev / 255).toFixed(3) + ')';
            var x0 = proj.x(run * cell), y0 = proj.y(cy * cell);
            var x1 = proj.x(cx * cell), y1 = proj.y((cy + 1) * cell);
            ctx.fillRect(x0, y0, Math.ceil(x1 - x0) + 1, Math.ceil(y1 - y0) + 1);
          }
          run = cx;
          prev = a;
        }
      }
    }
    ctx.restore();
  }

  /* ---------------- 障碍与地雷 ---------------- */

  function drawObstacles(game) {
    var i, s, a, b;
    var segs = game.barrierSegments ? game.barrierSegments() : [];
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (!game.isSeen(s.a.x, s.a.y) && !game.isSeen(s.b.x, s.b.y)) continue;
      var x1 = proj.x(s.a.x), y1 = proj.y(s.a.y);
      var x2 = proj.x(s.b.x), y2 = proj.y(s.b.y);
      ctx.save();
      if (s.type === 'wire') {
        ctx.strokeStyle = 'rgba(198,190,158,0.82)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        var ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.strokeStyle = 'rgba(150,145,120,0.8)';
        ctx.lineWidth = 1;
        for (var t = 0.12; t < 0.95; t += 0.18) {
          var px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
          ctx.beginPath();
          ctx.moveTo(px - Math.sin(ang) * 4, py + Math.cos(ang) * 4);
          ctx.lineTo(px + Math.sin(ang) * 4, py - Math.cos(ang) * 4);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(132,97,58,0.9)';
        ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = 'rgba(74,55,35,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x1 - 5, y1 + 5); ctx.lineTo(x2 + 5, y2 - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1 + 5, y1 + 5); ctx.lineTo(x2 - 5, y2 - 5); ctx.stroke();
      }
      ctx.restore();
    }
    for (i = 0; i < game.barriers.length; i++) {
      a = game.barriers[i];
      if (!a.alive || !game.isSeen(a.x, a.y)) continue;
      var nx = proj.x(a.x), ny = proj.y(a.y);
      ctx.save();
      ctx.fillStyle = a.type === 'wire' ? '#b9b39a' : '#8a6a42';
      ctx.strokeStyle = '#181812';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (a.type === 'wire') {
        ctx.arc(nx, ny, 3.2, 0, Math.PI * 2);
      } else {
        ctx.rect(nx - 4, ny - 4, 8, 8);
      }
      ctx.fill(); ctx.stroke();
      if (a.hp < a.maxHp) {
        var hw = 26;
        ctx.fillStyle = 'rgba(10,12,9,0.8)';
        ctx.fillRect(nx - hw / 2, ny - 13, hw, 3);
        ctx.fillStyle = a.hp / a.maxHp > 0.5 ? '#d8b25e' : '#d06a52';
        ctx.fillRect(nx - hw / 2, ny - 13, hw * U.clamp(a.hp / a.maxHp, 0, 1), 3);
      }
      ctx.restore();
    }
    for (i = 0; i < game.mines.length; i++) {
      var m = game.mines[i];
      if (!m.alive || (!game.isSeen(m.x, m.y) && m.side !== 'blue')) continue;
      var mx2 = proj.x(m.x), my2 = proj.y(m.y);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = m.type === 'mine_at' ? '#b46a4e' : '#9c9a7a';
      ctx.beginPath();
      ctx.arc(mx2, my2, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,222,160,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx2, my2, 4.2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------------- 残骸 ---------------- */

  function drawWrecks(game) {
    for (var i = 0; i < game.wrecks.length; i++) {
      var w = game.wrecks[i];
      var sx = proj.x(w.x), sy = proj.y(w.y);
      if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;
      if (!game.isSeen(w.x, w.y)) continue;
      var size = unitScreenSize() * 0.92;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(w.a);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#2b2a24';
      roundRect(ctx, -size / 2, -size * 0.31, size, size * 0.62, 3);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#0e0f0c';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      if (w.t < 14) {
        var a = (1 - w.t / 14) * 0.5;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#5a5750';
        ctx.beginPath();
        ctx.arc(sx + Math.sin(w.t * 2) * 2, sy - 6 - w.t * 3, 4 + w.t * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ---------------- 特效 ---------------- */

  function drawEffects(game) {
    var i, e, k, sx, sy;
    for (i = 0; i < game.effects.length; i++) {
      e = game.effects[i];
      k = e.t / e.dur;
      var ax = (e.kind === 'tracer') ? e.x2 : e.x;
      var ay = (e.kind === 'tracer') ? e.y2 : e.y;
      if (e.side && e.side !== 'blue' && ax != null && !game.canSee('blue', ax, ay)) continue;
      if (e.kind === 'tracer') {
        var t1x = proj.x(e.x1), t1y = proj.y(e.y1), t2x = proj.x(e.x2), t2y = proj.y(e.y2);
        if ((t1x < -40 && t2x < -40) || (t1x > W + 40 && t2x > W + 40) ||
          (t1y < -40 && t2y < -40) || (t1y > H + 40 && t2y > H + 40)) continue;
      } else {
        var epx = proj.x(e.x), epy = proj.y(e.y);
        var epad = 80 + (e.r || 0) * cam.zoom + (e.size || 0) * 2.4;
        if (epx < -epad || epx > W + epad || epy < -epad || epy > H + epad) continue;
      }
      if (e.kind === 'tracer') {
        sx = proj.x(e.x1); sy = proj.y(e.y1);
        var ex = proj.x(e.x2), ey = proj.y(e.y2);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = e.heavy ? '#ffd27a' : '#ffe8b0';
        ctx.lineWidth = e.heavy ? 2 : 1.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'muzzle') {
        sx = proj.x(e.x); sy = proj.y(e.y);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.95;
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(sx + Math.cos(e.a) * 8, sy + Math.sin(e.a) * 8, e.size * (0.5 + k), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'explosion') {
        sx = proj.x(e.x); sy = proj.y(e.y);
        var r = e.size * (0.5 + k * 1.4);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.9;
        var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, '#fff2c0');
        g.addColorStop(0.35, '#f2a03c');
        g.addColorStop(0.7, 'rgba(120,60,30,0.8)');
        g.addColorStop(1, 'rgba(40,34,28,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 烟
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.fillStyle = '#4c4a42';
        ctx.beginPath();
        ctx.arc(sx, sy - r * 0.5, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'blast') {
        sx = proj.x(e.x); sy = proj.y(e.y);
        var rr = e.r * cam.zoom * (0.15 + k * 0.85);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.strokeStyle = '#ffd08a';
        ctx.lineWidth = 2 * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, Math.PI * 2);
        ctx.stroke();
        if (k < 0.28) {
          var g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 0.8 + 4);
          g2.addColorStop(0, 'rgba(255,244,200,0.95)');
          g2.addColorStop(1, 'rgba(240,150,60,0)');
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(sx, sy, rr * 0.8 + 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (e.kind === 'dust') {
        sx = proj.x(e.x); sy = proj.y(e.y);
        var dr = e.size * (1 + k * 2.4);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.fillStyle = '#b8a98a';
        ctx.beginPath();
        ctx.arc(sx, sy, dr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'text') {
        sx = proj.x(e.x);
        sy = proj.y(e.y) - k * 26;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - k) * 1.7);
        ctx.font = '700 11px ' + SL.FONT_MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(18,20,16,0.55)';
        ctx.strokeText(e.text, sx, sy);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, sx, sy);
        ctx.restore();
      }
    }

    // 炮弹
    for (i = 0; i < game.shells.length; i++) {
      var s2 = game.shells[i];
      if (s2.side !== 'blue' && !game.canSee('blue', s2.x1, s2.y1)) continue;
      var p = s2.t / s2.dur;
      var gx = proj.x(U.lerp(s2.x0, s2.x1, p));
      var gy = proj.y(U.lerp(s2.y0, s2.y1, p));
      if (s2.rocket) {
        var ra = Math.atan2(s2.y1 - s2.y0, s2.x1 - s2.x0);
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(ra);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#171714';
        ctx.strokeStyle = '#6a6a5c';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-8, -2.8, 16, 5.6);
        ctx.strokeRect(-8, -2.8, 16, 5.6);
        ctx.fillStyle = '#2b2b25';
        ctx.beginPath();
        ctx.moveTo(8, -2.8);
        ctx.lineTo(13, 0);
        ctx.lineTo(8, 2.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e06a3a';
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-15, -3.5);
        ctx.lineTo(-15, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#f0b27a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(-24, 0);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (s2.grenade) {
        var gd = U.dist(s2.x0, s2.y0, s2.x1, s2.y1);
        var garc = Math.sin(Math.PI * p) * Math.min(70, gd * 0.28) * cam.zoom;
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#1c1a12';
        ctx.beginPath();
        ctx.ellipse(gx, gy, 3.2, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3d4a32';
        ctx.beginPath();
        ctx.arc(gx, gy - garc, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c8b46a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx + 2, gy - garc - 2);
        ctx.lineTo(gx + 5, gy - garc - 5);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      var dist = U.dist(s2.x0, s2.y0, s2.x1, s2.y1);
      var arc = Math.sin(Math.PI * p) * Math.min(120, dist * 0.32) * cam.zoom;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#201a12';
      ctx.beginPath();
      ctx.ellipse(gx, gy, 2.5, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#3a3126';
      ctx.beginPath();
      ctx.arc(gx, gy - arc, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#4a3f30';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx, gy - arc);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMarkers(dt) {
    for (var i = R.markers.length - 1; i >= 0; i--) {
      var m = R.markers[i];
      m.t += dt;
      if (m.t >= m.dur) { R.markers.splice(i, 1); continue; }
      var k = m.t / m.dur;
      var sx = proj.x(m.x), sy = proj.y(m.y);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = m.kind === 'attack' ? '#ff9d7a' : (m.kind === 'sprint' ? '#f0b060' : '#b9e8a8');
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + k * 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy);
      ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  var selBox = null;
  R.setSelectionBox = function (box) { selBox = box; };
  function drawSelectionBox() {
    if (!selBox) return;
    var x = Math.min(selBox.x0, selBox.x1), y = Math.min(selBox.y0, selBox.y1);
    var w = Math.abs(selBox.x1 - selBox.x0), h = Math.abs(selBox.y1 - selBox.y0);
    ctx.save();
    ctx.fillStyle = 'rgba(150,210,255,0.10)';
    ctx.strokeStyle = 'rgba(190,235,255,0.8)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();
  }

  /* ---------------- 支援 / 补给 / 飞机 ---------------- */

  function drawSupport(game) {
    var i, sx, sy;
    // 黄圈争夺区
    if (game.yellow && game.yellow.active) {
      var yz = game.yellow;
      sx = proj.x(yz.x); sy = proj.y(yz.y);
      var yr = yz.r * cam.zoom;
      ctx.save();
      ctx.fillStyle = 'rgba(232,200,70,0.10)';
      ctx.beginPath();
      ctx.arc(sx, sy, yr, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([10, 7]);
      ctx.strokeStyle = 'rgba(240,206,76,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, yr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(240,206,76,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, yr * 0.55, 0, Math.PI * 2);
      ctx.stroke();

      // 圈顶倒计时：随视角缩放并加底框，保持醒目
      if (game.mode !== 'lastStand') {
      var yLeft = Math.max(0, yz.activeUntil - game.time);
      var yScale = U.clamp(cam.zoom, 0.9, 3.6);
      var yFont = Math.round(13 * yScale);
      var yLabel = '剩余 ' + U.clock(yLeft);
      ctx.font = '700 ' + yFont + 'px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var yTw = ctx.measureText(yLabel).width;
      var yPadX = 9 * yScale;
      var yBoxH = yFont + 12 * yScale;
      var yBoxW = yTw + yPadX * 2;
      var yBoxX = sx - yBoxW / 2;
      var yBoxY = sy - yr - yBoxH - 8 * yScale;
      ctx.fillStyle = 'rgba(18,17,10,0.88)';
      ctx.fillRect(yBoxX, yBoxY, yBoxW, yBoxH);
      ctx.strokeStyle = 'rgba(245,208,78,0.98)';
      ctx.lineWidth = Math.max(1.2, 1.5 * yScale);
      ctx.strokeRect(yBoxX, yBoxY, yBoxW, yBoxH);
      ctx.fillStyle = '#f5d34e';
      ctx.fillText(yLabel, sx, yBoxY + yBoxH / 2 + 0.5);
      }
      ctx.restore();
    }
    // 侦察区
    for (i = 0; i < game.recons.length; i++) {
      var rc = game.recons[i];
      var left = Math.max(0, rc.until - game.time);
      var isCommandRecon = !!rc.command;
      sx = proj.x(rc.x); sy = proj.y(rc.y);
      ctx.save();
      if (isCommandRecon) {
        ctx.fillStyle = 'rgba(86,196,210,0.08)';
        ctx.beginPath();
        ctx.arc(sx, sy, rc.r * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = isCommandRecon ? 'rgba(110,226,234,0.82)' : 'rgba(120,200,210,0.55)';
      ctx.lineWidth = isCommandRecon ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, rc.r * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(150,220,225,0.9)';
      // 侦察倒计时：醒目底框，随视角缩放
      var rScale = U.clamp(cam.zoom, 0.9, 3.6);
      var rFont = Math.round(12 * rScale);
      var rLabel = isCommandRecon ? ('持续侦察 ' + (rc.r * 2) + 'm') : ('侦察 ' + Math.ceil(left) + 's');
      ctx.font = '700 ' + rFont + 'px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var rTw = ctx.measureText(rLabel).width;
      var rPadX = 8 * rScale;
      var rBoxH = rFont + 10 * rScale;
      var rBoxW = rTw + rPadX * 2;
      var rBoxX = U.clamp(sx - rBoxW / 2, 4, proj.w - rBoxW - 4);
      var rBoxY = sy - rc.r * cam.zoom - rBoxH - 7 * rScale;
      if (rBoxY < 102) rBoxY = 102;
      rBoxY = U.clamp(rBoxY, 102, proj.h - rBoxH - 4);
      ctx.fillStyle = 'rgba(16,36,38,0.88)';
      ctx.fillRect(rBoxX, rBoxY, rBoxW, rBoxH);
      ctx.strokeStyle = 'rgba(126,220,228,0.96)';
      ctx.lineWidth = Math.max(1.2, 1.4 * rScale);
      ctx.strokeRect(rBoxX, rBoxY, rBoxW, rBoxH);
      ctx.fillStyle = '#a9edf2';
      ctx.fillText(rLabel, rBoxX + rBoxW / 2, rBoxY + rBoxH / 2 + 0.5);
      ctx.restore();
    }
    // 炮火压制区
    for (i = 0; i < game.strikes.length; i++) {
      var st = game.strikes[i];
      sx = proj.x(st.x); sy = proj.y(st.y);
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(230,150,90,0.7)';
      ctx.lineWidth = 1.4;
      var radius = st.areaRadius || st.scatter || (SL.SUPPORT && SL.SUPPORT.radius) || 100;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(240,170,110,0.9)';
      ctx.font = '9px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('炮火覆盖 ' + Math.round(radius * 2) + 'm', sx, sy - radius * cam.zoom - 6);
      ctx.restore();
    }
    // 补给站
    for (i = 0; i < game.supplies.length; i++) {
      var sp = game.supplies[i];
      sx = proj.x(sp.x); sy = proj.y(sp.y);
      var spr = sp.r * cam.zoom;
      ctx.save();
      ctx.fillStyle = 'rgba(88,214,118,0.09)';
      ctx.beginPath();
      ctx.arc(sx, sy, spr, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(96,232,126,0.95)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(sx, sy, spr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(178,246,186,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, spr - 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(130,240,150,0.98)';
      var ss = U.clamp(cam.zoom, 0.9, 3.6);
      ctx.font = '700 ' + (11 * ss).toFixed(1) + 'px ' + SL.FONT_UI;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = 'rgba(18,28,18,0.7)';
      ctx.lineWidth = 3 * ss;
      ctx.strokeText('补给 ' + (sp.r * 2) + 'm', sx, sy - spr - 6 * ss);
      ctx.fillText('补给 ' + (sp.r * 2) + 'm', sx, sy - spr - 6 * ss);
      var iw = 12 * ss, ih = 10 * ss;
      ctx.fillStyle = 'rgba(74,104,60,0.95)';
      ctx.strokeStyle = 'rgba(230,238,205,0.9)';
      ctx.lineWidth = 1;
      ctx.fillRect(sx - iw / 2, sy - ih / 2, iw, ih);
      ctx.strokeRect(sx - iw / 2, sy - ih / 2, iw, ih);
      ctx.fillStyle = 'rgba(240,244,220,0.95)';
      ctx.font = '700 ' + (8 * ss).toFixed(1) + 'px ' + SL.FONT_UI;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('补', sx, sy + 0.5);
      ctx.fillStyle = '#9fe0a0';
      ctx.font = '700 ' + (9 * ss).toFixed(1) + 'px ' + SL.FONT_MONO;
      ctx.fillText('+', sx + iw * 0.6, sy - ih * 0.45);
      // 弹药 / 维修医疗余量进度条
      var amax = sp.ammoMax || SL.SUPPLY.ammo;
      var hmax = sp.hpMax || SL.SUPPLY.hp;
      var bmax = sp.boxMaxHp || SL.SUPPLY.boxHp || 500;
      var barW = 82 * ss, barH = 5.2 * ss;
      var barY1 = sy + 11 * ss, barY2 = barY1 + barH + 3.5 * ss;
      var barY3 = barY2 + barH + 3.5 * ss;
      ctx.fillStyle = 'rgba(12,18,12,0.82)';
      ctx.fillRect(sx - barW / 2, barY1, barW, barH);
      ctx.fillRect(sx - barW / 2, barY2, barW, barH);
      ctx.fillRect(sx - barW / 2, barY3, barW, barH);
      ctx.fillStyle = '#70d890';
      ctx.fillRect(sx - barW / 2, barY1, barW * U.clamp(sp.ammo / amax, 0, 1), barH);
      ctx.fillStyle = '#e0a080';
      ctx.fillRect(sx - barW / 2, barY2, barW * U.clamp((sp.hp || 0) / hmax, 0, 1), barH);
      ctx.fillStyle = '#d9c06c';
      ctx.fillRect(sx - barW / 2, barY3, barW * U.clamp((sp.boxHp === undefined ? bmax : sp.boxHp) / bmax, 0, 1), barH);
      ctx.fillStyle = 'rgba(220,235,210,0.95)';
      ctx.font = '600 ' + (8 * ss).toFixed(1) + 'px ' + SL.FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('弹 ' + Math.ceil(sp.ammo) + ' / 修 ' + Math.ceil(sp.hp || 0) + ' / 箱 ' + Math.ceil(sp.boxHp === undefined ? bmax : sp.boxHp), sx, barY3 + barH + 4 * ss);
      ctx.restore();
    }
    // 掉落装备
    for (i = 0; i < (game.drops || []).length; i++) {
      var drp = game.drops[i];
      if (game.fogEnabled && !game.isSeen(drp.x, drp.y)) continue;
      var dsx = proj.x(drp.x), dsy = proj.y(drp.y);
      var dss = U.clamp(cam.zoom, 0.9, 2.8);
      ctx.save();
      ctx.fillStyle = 'rgba(20,22,16,0.9)';
      ctx.strokeStyle = 'rgba(226,198,120,0.95)';
      ctx.lineWidth = 1.3;
      ctx.fillRect(dsx - 7 * dss, dsy - 7 * dss, 14 * dss, 14 * dss);
      ctx.strokeRect(dsx - 7 * dss, dsy - 7 * dss, 14 * dss, 14 * dss);
      ctx.fillStyle = '#f0da9a';
      ctx.font = '700 ' + Math.round(9 * dss) + 'px ' + SL.FONT_UI;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((SL.EQUIP[drp.key] && SL.EQUIP[drp.key].icon) || '装', dsx, dsy + 0.5);
      var dleft = Math.max(0, drp.expire - game.time);
      ctx.fillStyle = 'rgba(190,220,210,0.9)';
      ctx.font = '700 ' + Math.round(8 * dss) + 'px ' + SL.FONT_MONO;
      ctx.fillText(Math.ceil(dleft) + 's', dsx, dsy + 12 * dss);
      ctx.restore();
    }
    // 飞机
    for (i = 0; i < game.planes.length; i++) {
      var p = game.planes[i];
      // 轰炸预警：落点、杀伤半径、到达时间
      if (!p.dropped && p.tx != null && (p.kind === 'airstrike' || p.kind === 'hellBomber')) {
        var bwx = proj.x(p.bombTx != null ? p.bombTx : p.tx);
        var bwy = proj.y(p.bombTy != null ? p.bombTy : p.ty);
        var br = (p.bombRadius || 150) * cam.zoom;
        var eta = Math.max(0, U.dist(p.x, p.y, p.tx, p.ty) / (p.speed || 260));
        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = 'rgba(236,92,64,0.95)';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(220,64,44,0.1)';
        ctx.beginPath();
        ctx.arc(bwx, bwy, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        var blabel = '轰炸倒计时 ' + eta.toFixed(1) + 's · 直径 ' + Math.round((p.bombRadius || 150) * 2) + 'm';
        ctx.font = '700 12px ' + SL.FONT_UI;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var btw = ctx.measureText(blabel).width;
        ctx.fillStyle = 'rgba(36,18,14,0.88)';
        ctx.fillRect(bwx - btw / 2 - 7, bwy - br - 27, btw + 14, 20);
        ctx.strokeStyle = 'rgba(236,120,88,0.9)';
        ctx.strokeRect(bwx - btw / 2 - 7, bwy - br - 27, btw + 14, 20);
        ctx.fillStyle = '#ffc0a4';
        ctx.fillText(blabel, bwx, bwy - br - 17);
        ctx.restore();
      }
      sx = proj.x(p.x); sy = proj.y(p.y);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.heading || 0);
      var PS = SL.SIDES[p.side] || SL.SIDES.red;
      ctx.fillStyle = p.kind === 'recon' ? 'rgba(120,200,210,0.95)'
        : (p.kind === 'supply' ? 'rgba(88,214,118,0.98)'
          : (p.kind === 'hellBomber' ? PS.dark : PS.light));
      ctx.strokeStyle = p.kind === 'hellBomber' ? PS.light : PS.dark;
      ctx.lineWidth = 1;
      if (p.kind === 'hellBomber') {
        // 80m 巨型箭头轰炸机，按阵营配色
        var hl = 80 * cam.zoom, hw = 28 * cam.zoom;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(hl * 0.55, 0);
        ctx.lineTo(-hl * 0.35, -hw);
        ctx.lineTo(-hl * 0.2, 0);
        ctx.lineTo(-hl * 0.35, hw);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = PS.light;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-hl * 0.2, 0);
        ctx.lineTo(hl * 0.55, 0);
        ctx.stroke();
      } else if (p.kind === 'fighter') {
        // 制空战斗机：无尾翼的简洁箭头，按阵营配色
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-7, -8);
        ctx.lineTo(-7, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === 'supply') {
        // 绿色运输机：比战斗机略大，带货舱线
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-8, -10);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-8, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(210,255,220,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-2, -4);
        ctx.lineTo(-2, 4);
        ctx.moveTo(4, -3);
        ctx.lineTo(4, 3);
        ctx.stroke();
      } else {
        // 普通飞机箭头
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-5, -8);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      if (p.maxHp) {
        var pbw = p.kind === 'hellBomber' ? 52 : 20;
        ctx.fillStyle = 'rgba(14,16,12,0.72)';
        ctx.fillRect(sx - pbw / 2, sy - (p.kind === 'hellBomber' ? 28 : 14), pbw, 2.6);
        ctx.fillStyle = '#d8b25e';
        ctx.fillRect(sx - pbw / 2, sy - (p.kind === 'hellBomber' ? 28 : 14), pbw * Math.max(0, p.hp / p.maxHp), 2.6);
      }
    }
  }

  /* ---------------- 小地图 ---------------- */

  R.buildMinimapCache = function () {
    var size = 240;
    var cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    var c = cv.getContext('2d');
    T.thumbnail(c, size);
    R.minimapCache = cv;
  };

  R.drawMinimap = function (c, game, size) {
    if (!R.minimapCache) R.buildMinimapCache();
    c.clearRect(0, 0, size, size);
    c.drawImage(R.minimapCache, 0, 0, size, size);
    if (game.fog.canvas) c.drawImage(game.fog.canvas, 0, 0, size, size);

    var s = size / SL.CONFIG.mapSize;
    // 黄圈
    if (game.yellow && game.yellow.active) {
      c.fillStyle = 'rgba(232,200,70,0.16)';
      c.beginPath();
      c.arc(game.yellow.x * s, game.yellow.y * s, game.yellow.r * s, 0, Math.PI * 2);
      c.fill();
      c.setLineDash([3, 3]);
      c.strokeStyle = 'rgba(240,206,76,0.9)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(game.yellow.x * s, game.yellow.y * s, game.yellow.r * s, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    // 单位
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive) continue;
      if (u.side !== 'blue' && !game.unitVisibleTo('blue', u)) continue;
      var sc = SL.SIDES[u.side] || SL.SIDES.blue;
      c.fillStyle = sc.light;
      c.beginPath();
      c.arc(u.x * s, u.y * s, u.side === 'blue' ? 2.4 : 2.1, 0, Math.PI * 2);
      c.fill();
    }
    // 视野框
    var wl = (cam.x - W / 2 / cam.zoom) * s;
    var wt = (cam.y - H / 2 / cam.zoom) * s;
    var ww = (W / cam.zoom) * s;
    var wh = (H / cam.zoom) * s;
    c.strokeStyle = 'rgba(245,240,215,0.9)';
    c.lineWidth = 1;
    c.strokeRect(wl + 0.5, wt + 0.5, ww, wh);
    // 北向
    c.fillStyle = 'rgba(40,38,28,0.75)';
    c.font = '9px ' + SL.FONT_MONO;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('N↑', 4, 4);
  };
})(window);
