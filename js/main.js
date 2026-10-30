/* 钢线 1944 —— 入口、镜头、输入、主循环 */
(function () {
  'use strict';
  var SL = window.SL, U = SL.U, R = SL.Render, UI = SL.UI;
  var STEP = 1 / 20;
  var params = new URLSearchParams(location.search);

  var game = null;
  var started = false;
  var paused = false;
  var demo = params.get('demo') === '1';
  var follow = params.get('follow') === '1';
  var gameMode = 'melee';
  var difficulty = 'normal';
  if (params.get('mode') === 'lastStand') gameMode = 'lastStand';
  if (params.get('difficulty') && (SL.LAST_STAND.difficulties[params.get('difficulty')] || SL.MELEE_DIFFICULTIES[params.get('difficulty')])) {
    difficulty = params.get('difficulty');
  }
  var last = 0, acc = 0;
  var keys = {};
  var drag = null;
  var world = null;
  var lastRight = 0, lastRightX = 0, lastRightY = 0;

  function boot() {
    var seed = parseInt(params.get('seed') || '19440606', 10) || 19440606;
    var bootEl = document.getElementById('boot');
    var paramMap = params.get('map');
    // 先让加载层画出来，再做地图测绘
    setTimeout(function () {
      var playable = SL.MAPS.filter(function (m) { return !m.test; });
      var chosen = (paramMap && SL.MAP_BY_ID[paramMap])
        ? paramMap
        : playable[Math.floor(Math.random() * playable.length)].id;
      SL.Terrain.setMap(chosen);
      if (SL.MAP_BY_ID[chosen].test) gameMode = 'melee';
      SL.Terrain.build(seed);
      world = document.getElementById('world');
      R.init(world, document.getElementById('overlay'));
      UI.init({
        onStart: begin,
        onRestart: restart,
        onMenu: openGameMenu,
        onReturnMenu: returnToMenu,
        onCloseMenu: closeGameMenu,
        onTogglePause: togglePause,
        onChooseMap: chooseMap,
        onCamera: function (x, y) { R.centerOn(x, y); },
        onMinimapOrder: function (x, y) {
          if (!started || game.state !== 'playing') return;
          if (!game.selected.length) { R.centerOn(x, y); return; }
          game.commandMove(game.selected, x, y);
          R.addMarker(x, y, 'move');
        }
      });
      newGame(params.get('autostart') === '1');
      UI.setMapButtons(SL.Terrain.map.id);
      renderModeButtons();
      updateObjective();
      bindInput();
      if (params.get('help') === '1') UI.toggleHelp(true);
      R.draw(game, 0);
      requestAnimationFrame(frame);
      if (bootEl) {
        bootEl.classList.add('done');
        setTimeout(function () { bootEl.parentNode && bootEl.parentNode.removeChild(bootEl); }, 500);
      }
      window.__STEEL = {
        game: function () { return game; },
        render: R,
        ui: UI,
        begin: begin,
        restart: restart,
        pause: function (v) {
          if (!started) return;
          paused = !!v;
          UI.setPaused(paused);
        },
        isPaused: function () { return paused; }
      };
    }, 40);
  }

  function updateObjective() {
    var el = document.getElementById('objective');
    var m = SL.Terrain.map;
    var actualMode = game ? game.mode : gameMode;
    var diffTable = actualMode === 'lastStand' ? SL.LAST_STAND.difficulties : SL.MELEE_DIFFICULTIES;
    var diff = diffTable[difficulty] || diffTable.normal;
    if (el && m) {
      el.textContent = m.test ? '训练场 · 无敌人'
        : actualMode === 'lastStand' ? '背水一战 · ' + diff.name + ' · ' + m.name
          : '三军混战 · ' + diff.name + ' · ' + m.name;
    }
    var cur = document.getElementById('map-current');
    if (cur && m) cur.textContent = m.name + ' · ' + m.subtitle;
    var title = document.getElementById('brief-title');
    if (title && m) title.textContent = '作战简报 · ' + m.name;
    var stamp = document.getElementById('brief-stamp');
    if (stamp) stamp.textContent = m.test ? '训练' : actualMode === 'lastStand' ? '背水一战' : '车轮战';
    var missionTag = document.getElementById('mission-tag');
    if (missionTag) missionTag.textContent = m.test ? '训练' : actualMode === 'lastStand' ? '背水一战' : '车轮战';
    var sub = document.getElementById('brief-sub');
    if (sub) {
      sub.textContent = '1944 年 6 月 10 日 · ' +
        (m.test ? '训练场 · 无敌人' : actualMode === 'lastStand' ? '防守战 · ' + diff.name + '难度' : '三军混战 · ' + diff.name + (diff.endless ? ' · 无胜利条件' : '难度'));
    }
    var copy = document.getElementById('brief-copy');
    if (copy) {
      copy.textContent = m.test
        ? '训练场用于测试单位、武器、工事与占领机制；可选择任意测试卡，不受资源与波次限制。'
        : actualMode === 'lastStand'
          ? '背水一战。黄圈开局固定；蓝队守住黄圈直至目标时间。红队分波进攻，黄圈被红队占领即失败。每5波加入BOSS：第30波双BOSS，第50波起三BOSS。红队空袭第1波2架，每5波+1，第50波达到10架，以三角形编队随机轰炸黄圈。'
          : '1944 年 6 月，西欧战场。蓝、红、绿三支合成部队在 2 km × 2 km 战场上争夺黄圈。' +
            (diff.endless
              ? '无限难度没有胜利条件。玩家累计50,000黄圈经验时红/绿一方召唤一次BOSS；此后AI每次全灭重生按时间概率召唤，45分钟达到峰值。'
              : diff.id === 'easy'
                ? '黄圈累计100,000经验者获胜；简单难度没有BOSS。'
                : diff.id === 'hard'
                  ? '黄圈累计100,000经验者获胜；50,000经验时红/绿一方召唤BOSS，90,000时红绿双方各召唤一位。'
                  : '黄圈累计100,000经验者获胜；50,000与90,000经验时，红/绿其中一方各召唤一位BOSS。') +
            'AI单位上限：简单14 / 普通20 / 困难26 / 无限32。黄圈与占领区提供经验、分数；分数可购买额外抽卡。';
    }
    var md = document.getElementById('mode-desc');
    if (md) md.textContent = m.test ? '训练场固定为单阵营测试模式。' : SL.MODES[actualMode].desc;
    var mc = document.getElementById('mode-current');
    if (mc) mc.textContent = m.test ? '训练场' : SL.MODES[actualMode].name;
    var dc = document.getElementById('difficulty-current');
    if (dc) dc.textContent = actualMode === 'lastStand'
      ? diff.name + ' · ' + (diff.holdTime === Infinity ? '无限' : U.clock(diff.holdTime))
      : diff.name + ' · ' + (diff.endless ? '无胜利条件' : '100,000 经验胜利');
    var heading = document.getElementById('enemy-heading');
    var force = document.getElementById('enemy-force');
    var rules = document.getElementById('battle-rules');
    if (rules) {
      rules.innerHTML = m.test
        ? '<li><span class="chip blue"></span>单阵营训练，无敌人、无波次</li><li><span class="chip blue"></span>可自由使用测试卡包、标靶与BOSS卡</li><li><span class="chip blue"></span>可开关战争迷雾</li>'
        : actualMode === 'lastStand'
          ? '<li><span class="chip blue"></span>黄圈本局固定；蓝队守住目标时间即获胜</li><li><span class="chip red"></span>红队分波进攻；黄圈被红队占领即失败</li><li><span class="chip red"></span>每5波BOSS：第30波双BOSS，第50波起三BOSS</li><li><span class="chip red"></span>空袭2架起，每5波+1，第50波10架；三角编队随机投弹</li>'
          : diff.endless
            ? '<li><span class="chip"></span>本难度无胜利条件；50,000黄圈经验触发一次BOSS，之后AI重生按时间概率召唤</li><li><span class="chip red"></span>AI单位上限32；AI步兵出生携带0~6件随机装备</li><li><span class="chip"></span>黄圈与占领区提供经验、分数；占领区提供掩护与持续经验</li><li><span class="chip"></span>隐蔽1秒、幽灵1秒；反坦克炮原地5秒进入隐蔽；G键含手雷/火箭筒</li>'
            : '<li><span class="chip"></span>黄圈累计100,000经验者获胜；黄圈内净优势单位持续获得经验与分数</li><li><span class="chip red"></span>' +
              (diff.id === 'easy' ? '简单难度无BOSS' : diff.id === 'hard' ? '50,000一位BOSS；90,000红绿双方各一位' : '50,000与90,000各召唤一位BOSS') +
              '</li><li><span class="chip red"></span>AI单位上限：简单14 / 普通20 / 困难26；AI出生可带0~6件装备</li><li><span class="chip"></span>隐蔽1秒、幽灵1秒；反坦克炮原地5秒进入隐蔽；G键含手雷/火箭筒</li>';
    }
    if (heading && force) {
      if (m.test) {
        heading.textContent = '训练场';
        force.innerHTML = '<li><span class="chip blue"></span>无敌人、无波次</li>' +
          '<li><span class="chip blue"></span>测试卡包提供全部单位、装备、工事与标靶</li>' +
          '<li><span class="chip blue"></span>可召唤三种BOSS与刷新黄圈</li>';
      } else if (actualMode === 'lastStand') {
        heading.textContent = '进攻方（红队）';
        force.innerHTML = '<li><span class="chip red"></span>开局1分钟准备，随后每波间隔1分钟进攻</li>' +
          '<li><span class="chip red"></span>首波约为玩家初始兵力的1.5倍，单波上限48</li>' +
          '<li><span class="chip red"></span>每5波加入BOSS；30波双BOSS，50波起三BOSS</li>' +
          '<li><span class="chip red"></span>空袭第1波2架，每5波+1，50波10架</li>';
      } else {
        heading.textContent = '敌方 AI · ' + diff.name;
        force.innerHTML = '<li><span class="chip red"></span>红队 / 绿队 · 初始6单位基础连队</li>' +
          '<li><span class="chip green"></span>AI单位上限：简单14 / 普通20 / 困难26 / 无限32</li>' +
          '<li><span class="chip"></span>升级+1随机增援；全灭后按等级重建，最高不超过难度上限</li>' +
          '<li><span class="chip"></span>AI步兵出生携带0~6件随机装备；AI不能拾取掉落</li>' +
          '<li><span class="chip"></span>难度越高：敌方经验、火力与进攻欲望越强</li>';
      }
    }
  }

  function renderModeButtons() {
    var modeBox = document.getElementById('mode-buttons');
    var diffBox = document.getElementById('difficulty-buttons');
    var diffPick = document.getElementById('difficulty-pick');
    var isTest = !!(SL.Terrain.map && SL.Terrain.map.test);
    if (modeBox) {
      modeBox.innerHTML = '';
      Object.keys(SL.MODES).forEach(function (id) {
        var b = document.createElement('button');
        b.className = 'map-btn' + (gameMode === id ? ' on' : '');
        b.textContent = SL.MODES[id].name;
        b.disabled = isTest && id === 'lastStand';
        if (b.disabled) b.title = '训练场不支持背水一战';
        b.addEventListener('click', function () { selectMode(id); });
        modeBox.appendChild(b);
      });
    }
    if (diffBox) {
      diffBox.innerHTML = '';
      var diffTable = gameMode === 'lastStand' ? SL.LAST_STAND.difficulties : SL.MELEE_DIFFICULTIES;
      Object.keys(diffTable).forEach(function (id) {
        var d = diffTable[id];
        var b = document.createElement('button');
        b.className = 'map-btn' + (difficulty === id ? ' on' : '');
        b.textContent = d.name;
        b.addEventListener('click', function () { selectDifficulty(id); });
        diffBox.appendChild(b);
      });
    }
    if (diffPick) diffPick.classList.toggle('hidden', isTest);
  }

  function selectMode(id) {
    if (!SL.MODES[id] || id === gameMode) return;
    if (SL.Terrain.map && SL.Terrain.map.test && id === 'lastStand') return;
    gameMode = id;
    newGame(false);
    renderModeButtons();
  }

  function selectDifficulty(id) {
    var valid = SL.LAST_STAND.difficulties[id] || SL.MELEE_DIFFICULTIES[id];
    if (!valid || id === difficulty) return;
    difficulty = id;
    if (!SL.Terrain.map.test) newGame(false);
    renderModeButtons();
  }

  function gameOptions() {
    return { demo: demo, mode: gameMode, difficulty: difficulty };
  }

  // 在简报里换战场：重生成地形并开一局新的（仅开局前可见）
  function chooseMap(id) {
    if (id === 'random') {
      var playable = SL.MAPS.filter(function (m) { return !m.test; });
      id = playable[Math.floor(Math.random() * playable.length)].id;
    }
    if (!SL.MAP_BY_ID[id] || (SL.Terrain.map && id === SL.Terrain.map.id)) return;
    if (SL.MAP_BY_ID[id].test) gameMode = 'melee';
    SL.Terrain.setMap(id);
    SL.Terrain.build();
    game = SL.Game.create(gameOptions());
    UI.bind(game);
    started = false;
    paused = false;
    UI.showBriefing(true);
    centerOnArmy();
    UI.setMapButtons(id);
    renderModeButtons();
    updateObjective();
    R.draw(game, 0);
  }

  function newGame(autostart) {
    game = SL.Game.create(gameOptions());
    UI.bind(game);
    UI.hideGameMenu();
    paused = false;
    UI.setPaused(false);
    started = !!autostart;
    UI.showBriefing(!started);
    centerOnArmy();
    if (params.get('sel') === '1') game.setSelection(game.aliveOf('blue'));
    if (params.get('sel') === 'one') {
      var pick = game.units.filter(function (u) { return u.side === 'blue' && u.type === 'tank'; })[0];
      if (pick) game.setSelection([pick]);
    }
    if (params.get('sel') === 'inf') {
      var pickInf = game.units.filter(function (u) { return u.side === 'blue' && u.type === 'infantry'; })[0];
      if (pickInf) game.setSelection([pickInf]);
    }
    updateObjective();
    renderModeButtons();
    if (started) fastForward();
  }

  function centerOnArmy() {
    var cx = 0, cy = 0, n = 0, i;
    for (i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (u.side === 'blue') { cx += u.x; cy += u.y; n++; }
    }
    // 默认缩放：2km 地图不铺满整宽，取一个更适合指挥的中景
    var zParam = parseFloat(params.get('zoom') || '0');
    var z = zParam > 0 ? zParam
      : Math.max(1.15, Math.max(R.proj.w, R.proj.h) / SL.CONFIG.mapSize * 1.55);
    R.cam.zoom = U.clamp(z, R.cam.min, R.cam.max);
    if (game.mode === 'lastStand' && game.defense && n) {
      // 防守模式开局同时看到边缘出生点与黄圈，便于立即布防
      R.cam.zoom = U.clamp(Math.min(z, 0.82), R.cam.min, R.cam.max);
      R.centerOn((cx / n + game.yellow.x) / 2, (cy / n + game.yellow.y) / 2);
      R.clampCamStrict();
      return;
    }
    if (game.testMode) {
      R.cam.zoom = U.clamp(0.65, R.cam.min, R.cam.max);
      R.centerOn(SL.CONFIG.mapSize / 2, 1100);
    } else if (n) {
      R.centerOn(cx / n, cy / n);
    }
    R.clampCamStrict();
  }

  function begin() {
    if (started) return;
    started = true;
    paused = false;
    UI.setPaused(false);
    UI.showBriefing(false);
    fastForward();
  }

  function fastForward() {
    var ff = parseFloat(params.get('ff') || '0');
    if (!ff || !isFinite(ff)) return;
    var n = Math.min(20 * 300, Math.round(ff * 20));
    for (var i = 0; i < n; i++) game.update(STEP);
  }

  function restart() {
    newGame(true);
    UI.hideResult();
  }

  function returnToMenu() {
    UI.hideGameMenu();
    UI.toggleHelp(false);
    newGame(false);
  }

  function openGameMenu() {
    if (!started || game.state !== 'playing') return;
    if (UI.isGameMenuOpen()) { closeGameMenu(); return; }
    paused = true;
    UI.setPaused(true);
    UI.openGameMenu();
  }

  function closeGameMenu() {
    UI.hideGameMenu();
    paused = false;
    UI.setPaused(false);
  }

  function togglePause() {
    if (!started) return;
    if (UI.isGameMenuOpen()) { closeGameMenu(); return; }
    paused = !paused;
    UI.setPaused(paused);
  }

  /* ---------------- 主循环 ---------------- */

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = Math.min(0.08, Math.max(0, (ts - last) / 1000));
    last = ts;

    updateCamera(dt);
    if (follow) followArmy(dt);

    var updateStart = performance.now();
    if (started && !paused && !R.dead && !UI.isDraftOpen() && !UI.isFortReplaceOpen()) {
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 6) {
        game.update(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps >= 6) acc = 0;
    }
    if (R.perf) R.perf.updateMs = performance.now() - updateStart;

    R.draw(game, dt);
    UI.update(game, dt);
  }

  function updateCamera(dt) {
    var kx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
    var ky = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
    if (!kx && !ky) return;
    var L = Math.hypot(kx, ky);
    var sp = 720 / R.cam.zoom;
    R.cam.x += kx / L * sp * dt;
    R.cam.y += ky / L * sp * dt;
    R.clampCam();
  }

  function followArmy(dt) {
    var cx = 0, cy = 0, n = 0;
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive) continue;
      cx += u.x; cy += u.y; n++;
    }
    if (!n) return;
    var k = Math.min(1, dt * 1.6);
    R.cam.x += (cx / n - R.cam.x) * k;
    R.cam.y += (cy / n - R.cam.y) * k;
    R.clampCam();
  }

  /* ---------------- 输入 ---------------- */

  function pointerPos(ev) {
    var el = document.getElementById('world');
    var r = el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function bindInput() {
    // 事件挂在 window 上，画布被重建后输入不会失效
    window.addEventListener('contextmenu', function (ev) {
      if (ev.target && ev.target.id === 'world') ev.preventDefault();
    });

    window.addEventListener('pointerdown', function (ev) {
      if (!ev.target || ev.target.id !== 'world') return;
      var p = pointerPos(ev);
      if (ev.button === 1) {
        ev.preventDefault();
        drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, cx: R.cam.x, cy: R.cam.y };
        ev.target.classList.add('panning');
        return;
      }
      if (ev.button === 2) {
        ev.preventDefault();
        if (!started) return;
        orderAt(p.x, p.y, ev.shiftKey);
        return;
      }
      if (ev.button !== 0) return;
      if (!started) return;

      var w = R.screenToWorld(p.x, p.y);
      if (game.pendingCommand) {
        var pc = game.pendingCommand.kind;
        game.pendingCommand = null;
        if (pc === 'engineer') {
          var fzBtn = game.buildFieldZone(game.selected, w.x, w.y);
          if (fzBtn) R.addMarker(w.x, w.y, 'move');
        } else if (pc === 'recon') {
          var reconN = game.commandRecon(game.selected, w.x, w.y);
          if (reconN > 0) R.addMarker(w.x, w.y, 'move');
        } else if (pc === 'grenade') {
          var grenadeTarget = game.enemyAt(w.x, w.y, 26 / R.cam.zoom);
          if (grenadeTarget && game.commandGrenade(game.selected, w.x, w.y) > 0) {
            R.addMarker(w.x, w.y, 'attack');
          } else {
            UI.pushToast('该位置没有可攻击的目标，或不在手雷/火箭筒射程内', 'info');
          }
        } else if (pc === 'sniperHide') {
          if (game.commandSniperHide(game.selected, w.x, w.y) > 0) {
            R.addMarker(w.x, w.y, 'move');
          } else {
            UI.pushToast('无法在此建立狙击隐蔽', 'info');
          }
        } else {
          var hasRocket = game.selected.some(function (u) { return u.type === 'rocket_arty'; });
          var hasArty = game.selected.some(function (u) { return u.type === 'artillery' || u.type === 'heavy_arty'; });
          var nBtn = 0;
          if (hasRocket) nBtn += game.commandRocketStrike(game.selected, w.x, w.y);
          if (hasArty) nBtn += game.commandSuppress(game.selected, w.x, w.y);
          if (nBtn > 0) R.addMarker(w.x, w.y, 'attack');
        }
        return;
      }
      var own = game.unitAt(w.x, w.y, 20 / R.cam.zoom);
      if (own) {
        if (ev.shiftKey) {
          var arr = game.selected.slice();
          var idx = arr.indexOf(own);
          if (idx >= 0) arr.splice(idx, 1); else arr.push(own);
          game.setSelection(arr);
        } else {
          game.setSelection([own]);
        }
        return;
      }
      drag = { kind: 'box', sx: p.x, sy: p.y, ex: p.x, ey: p.y, shift: ev.shiftKey };
      if (!ev.shiftKey) game.setSelection([]);
      R.setSelectionBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    });

    window.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      if (drag.kind === 'pan') {
        R.cam.x = drag.cx - (ev.clientX - drag.sx) / R.cam.zoom;
        R.cam.y = drag.cy - (ev.clientY - drag.sy) / R.cam.zoom;
        R.clampCam();
        return;
      }
      var p = pointerPos(ev);
      drag.ex = p.x; drag.ey = p.y;
      R.setSelectionBox({ x0: drag.sx, y0: drag.sy, x1: drag.ex, y1: drag.ey });
    });

    window.addEventListener('pointerup', function (ev) {
      if (!drag) return;
      if (drag.kind === 'pan') {
        var el = document.getElementById('world');
        if (el) el.classList.remove('panning');
        drag = null;
        return;
      }
      if (drag.kind === 'box') {
        var moved = Math.hypot(drag.ex - drag.sx, drag.ey - drag.sy);
        if (moved > 6) {
          var a = R.screenToWorld(drag.sx, drag.sy);
          var b = R.screenToWorld(drag.ex, drag.ey);
          var picked = game.unitsInRect(a.x, a.y, b.x, b.y);
          if (drag.shift) {
            var merged = game.selected.slice();
            for (var i = 0; i < picked.length; i++) {
              if (merged.indexOf(picked[i]) < 0) merged.push(picked[i]);
            }
            picked = merged;
          }
          game.setSelection(picked);
        }
        R.setSelectionBox(null);
        drag = null;
      }
      void ev;
    });

    window.addEventListener('wheel', function (ev) {
      if (!ev.target || ev.target.id !== 'world') return;
      ev.preventDefault();
      var p = pointerPos(ev);
      var f = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      R.zoomAt(p.x, p.y, f);
    }, { passive: false });

    window.addEventListener('keydown', function (ev) {
      var k = (ev.key || '').toLowerCase();
      if (k === ' ') {
        ev.preventDefault();
        togglePause();
        return;
      }
      if (k === 'h') { UI.toggleHelp(); return; }
      if (k === 'f3') { ev.preventDefault(); UI.togglePerf(); return; }
      if (k === 'g') {
        ev.preventDefault();
        if (game && game.selected && game.selected.length) {
          var thrown = game.commandGrenadeNearest(game.selected);
          if (thrown > 0) UI.pushToast('手雷/火箭筒攻击', 'info');
          else UI.pushToast('手雷/火箭筒射程内没有目标', 'info');
        }
        return;
      }
      if (k === 'escape') {
        if (game && game.pendingCommand) { game.pendingCommand = null; UI.pushToast('已取消指令', 'info'); return; }
        if (UI.isGameMenuOpen()) { closeGameMenu(); return; }
        if (UI.isHelpOpen()) UI.toggleHelp(false);
        else game.setSelection([]);
        return;
      }
      if (k === 'enter') { if (!started) begin(); return; }
      if (k === 'r') {
        restart();
        return;
      }
      if (k === 'x' || k === 'f') {
        if (game.selected.length) {
          game.clearOrders(game.selected);
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && k === 'a') {
        ev.preventDefault();
        game.setSelection(game.aliveOf('blue'));
        return;
      }
      if (k === '+' || k === '=') { R.zoomAt(R.proj.w / 2, R.proj.h / 2, 1.15); return; }
      if (k === '-') { R.zoomAt(R.proj.w / 2, R.proj.h / 2, 1 / 1.15); return; }
      keys[k] = true;
    });

    window.addEventListener('keyup', function (ev) {
      keys[(ev.key || '').toLowerCase()] = false;
    });

    window.addEventListener('blur', function () { keys = {}; });
  }

  function orderAt(sx, sy, shift) {
    if (game.state !== 'playing') return;
    var w = R.screenToWorld(sx, sy);
    var hitR = 22 / R.cam.zoom;
    var enemy = game.enemyAt(w.x, w.y, hitR);
    if (!game.selected.length) {
      var own = game.unitAt(w.x, w.y, hitR);
      if (own) game.setSelection([own]);
      return;
    }
    // Shift + 右键：指挥车侦察 / 工兵 / 狙击小组 / 火箭炮点射
    if (shift) {
      var rc = game.commandRecon(game.selected, w.x, w.y);
      if (rc > 0) {
        R.addMarker(w.x, w.y, 'move');
        return;
      }
      if (game.commandSniperHide(game.selected, w.x, w.y) > 0) {
        R.addMarker(w.x, w.y, 'move');
        return;
      }
      var rocketStrike = game.commandRocketStrike(game.selected, w.x, w.y);
      if (rocketStrike > 0) {
        R.addMarker(w.x, w.y, 'attack');
        return;
      }
      if (!enemy) {
        var fz = game.buildFieldZone(game.selected, w.x, w.y);
        if (fz) {
          R.addMarker(w.x, w.y, 'move');
          return;
        }
      }
    }
    if (enemy) {
      game.commandAttack(game.selected, enemy);
      R.addMarker(w.x, w.y, 'attack');
      lastRight = 0;
      return;
    }
    // Shift + 右键：选中火炮时对该点进行 60 秒火力压制
    if (shift) {
      var n = game.commandSuppress(game.selected, w.x, w.y);
      if (n > 0) {
        R.addMarker(w.x, w.y, 'attack');
        return;
      }
    }
    var now = performance.now();
    var dbl = now - lastRight < 330 &&
      Math.hypot(sx - lastRightX, sy - lastRightY) < 80;
    lastRight = now;
    lastRightX = sx;
    lastRightY = sy;

    if (dbl) {
      game.commandSprint(game.selected, w.x, w.y);
      R.addMarker(w.x, w.y, 'sprint');
    } else {
      game.commandMove(game.selected, w.x, w.y);
      R.addMarker(w.x, w.y, 'move');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
