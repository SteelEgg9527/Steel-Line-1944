/* 钢线 1944 —— 单位、战斗、视野、掩体、占领与 AI */
(function () {
  'use strict';
  var SL = window.SL, U = SL.U, T = SL.Terrain, CB = SL.COMBAT;
  var G = (SL.Game = {});
  var nextId = 1;

  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }

  function segmentsIntersect(x0, y0, x1, y1, x2, y2, x3, y3) {
    var d1 = cross(x3 - x2, y3 - y2, x0 - x2, y0 - y2);
    var d2 = cross(x3 - x2, y3 - y2, x1 - x2, y1 - y2);
    var d3 = cross(x1 - x0, y1 - y0, x2 - x0, y2 - y0);
    var d4 = cross(x1 - x0, y1 - y0, x3 - x0, y3 - y0);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function segmentIntersectsRect(x0, y0, x1, y1, rx0, ry0, rx1, ry1) {
    // Liang-Barsky 裁剪：包含贴边、端点在边上的情况
    var dx = x1 - x0, dy = y1 - y0;
    var t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [x0 - rx0, rx1 - x0, y0 - ry0, ry1 - y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        var r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return t0 <= t1;
  }

  function Game(opts) {
    opts = opts || {};
    this.units = [];
    this.effects = [];
    this.shells = [];
    this.wrecks = [];
    this.selected = [];
    this.time = 0;
    this.state = 'playing';
    this.demo = !!opts.demo;
    this.testMode = !!(T.map && T.map.test);
    this.mode = this.testMode ? 'melee' : (opts.mode === 'lastStand' ? 'lastStand' : 'melee');
    var diffTable = this.mode === 'lastStand' ? SL.LAST_STAND.difficulties : SL.MELEE_DIFFICULTIES;
    this.difficulty = (diffTable[opts.difficulty] ? opts.difficulty : 'normal');
    this.defense = null;
    this.fogEnabled = !this.testMode;
    this.feed = [];
    this.feedSeq = 0;
    this.endReason = '';
    this.aiTimer = 0;
    this.fogTimer = 0;
    this.zoneXpTimer = 1;
    this.checkTimer = 0;
    this.zoneTimer = 0;
    this.nextCardId = 1;
    this.meleeBossSummoned = false;
    this.meleeBossCount = 0;
    this.meleeBoss50k = false;
    this.meleeBoss90k = false;
    this.bossGroupSeq = 0;
    this.fortBag = [];      // 工事包轮换袋：每 4 包必出一次 88 炮
    this.fortNo88 = 0;       // 连续未出 88 炮的工事包数量（保底用）
    this.bossKillEvent = null; // 最近一次 BOSS 击破，用于全屏醒目提示
    this.strikes = [];      // 炮火压制
    this.supplies = [];     // 补给站
    this.bombs = [];        // 幽灵兵团安置的炸弹
    this.recons = [];       // 侦察机视野
    this.planes = [];       // 飞机
    this.drops = [];        // 战场掉落的步兵装备
    this.mines = [];        // 工程车布设的地雷
    this.barriers = [];     // 铁丝网 / 拒马节点
    this.barrierVersion = 0;
    this.barrierGridCache = {};
    this.drafts = [];       // 升级后的抽卡选择（蓝队）
    this.stats = { kills: { blue: 0, red: 0, green: 0 }, losses: { blue: 0, red: 0, green: 0 }, wipes: 0 };
    this.teams = {};
    for (var si = 0; si < SL.SIDE_ORDER.length; si++) {
      var side = SL.SIDE_ORDER[si];
      this.teams[side] = {
        side: side, xp: 0, level: 1, nextXp: SL.XP.first,
        score: 0, scoreEarned: 0, kills: 0, hand: [], respawnAt: 0, company: 0,
        draftBuys: 0,
        yellowXp: 0,
        airTimer: 30 + Math.random() * 50
      };
    }
    // 中立单位只用于给击杀方提供经验，不参与三阵营循环
    this.teams.neutral = {
      side: 'neutral', xp: 0, level: 1, nextXp: SL.XP.first,
      score: 0, scoreEarned: 0, kills: 0, hand: [], respawnAt: 0, company: 0, draftBuys: 0, airTimer: 9999
    };
    this.yellow = {
      x: 0, y: 0, r: SL.YELLOW.r,
      active: true,
      activeUntil: SL.YELLOW.duration,
      nextSpawn: SL.YELLOW.duration,
      cycle: 0
    };
    this.pickYellowPoint();
    this.yellowXpTimer = 1;
    this.zoneScoreTimer = 1;
    this.winner = null;
    this.ended = false;
    this.endReason = null;
    this.neutralTimer = 8;
    this.neutralSeen = null;
    this.fog = {
      res: 300,
      vis: new Uint8Array(300 * 300),
      seen: new Uint8Array(300 * 300),
      version: 0,
      canvas: null,
      ctx: null
    };
    this.setup();
    this.computeFog();
  }

  G.create = function (opts) { return new Game(opts); };
  G.Game = Game;

  Game.prototype.meleeMods = function () {
    return SL.MELEE_DIFFICULTIES[this.difficulty] || SL.MELEE_DIFFICULTIES.normal;
  };

  /* ---------------- 初始化 ---------------- */

  Game.prototype.setup = function () {
    T.buildZone();
    if (this.mode === 'lastStand') {
      this.setupLastStand();
      return;
    }
    for (var i = 0; i < SL.SIDE_ORDER.length; i++) {
      if (this.testMode && SL.SIDE_ORDER[i] !== 'blue') continue;
      this.spawnCompany(SL.SIDE_ORDER[i]);
    }
    if (this.testMode) {
      this.yellow.active = false;
      this.log('试验场：无敌人，所有占领区已平铺', 'info');
      return;
    }
    // 初始卡包：给玩家两张起手卡（单位包/装备包会立刻开包）
    this.drawCard();
    this.drawCard();
    // 地图上先放若干中立落单单位
    for (var ni = 0; ni < SL.NEUTRAL.initial; ni++) this.spawnNeutral();
    this.log('三军混战：蓝 / 红 / 绿 无限重生', 'info');
  };

  /* ---------------- 背水一战 ---------------- */

  Game.prototype.findDefenseEdgeSpawn = function (ax, ay, minDist, avoidX, avoidY, avoidDist) {
    var ms = SL.CONFIG.mapSize, margin = 260;
    var fallback = { x: margin, y: margin };
    for (var tries = 0; tries < 240; tries++) {
      var edge = Math.floor(Math.random() * 4);
      var x, y;
      if (edge === 0) { x = margin + Math.random() * (ms - margin * 2); y = margin; }
      else if (edge === 1) { x = margin + Math.random() * (ms - margin * 2); y = ms - margin; }
      else if (edge === 2) { x = margin; y = margin + Math.random() * (ms - margin * 2); }
      else { x = ms - margin; y = margin + Math.random() * (ms - margin * 2); }
      if (U.dist(x, y, ax, ay) < minDist) { fallback = { x: x, y: y }; continue; }
      if (avoidDist && U.dist(x, y, avoidX, avoidY) < avoidDist) continue;
      return { x: x, y: y };
    }
    return fallback;
  };

  Game.prototype.findDefenseBlueSpawn = function () {
    var ms = SL.CONFIG.mapSize, margin = 260;
    var y = this.yellow;
    var edges = [
      { side: 0, d: y.y },
      { side: 1, d: ms - y.y },
      { side: 2, d: y.x },
      { side: 3, d: ms - y.x }
    ].sort(function (a, b) { return a.d - b.d; });
    for (var e = 0; e < edges.length; e++) {
      for (var tries = 0; tries < 80; tries++) {
        var along = U.clamp(
          (edges[e].side < 2 ? y.x : y.y) + (Math.random() - 0.5) * 700,
          margin, ms - margin
        );
        var x = edges[e].side < 2 ? along : (edges[e].side === 2 ? margin : ms - margin);
        var yy = edges[e].side < 2 ? (edges[e].side === 0 ? margin : ms - margin) : along;
        if (U.dist(x, yy, y.x, y.y) > y.r + 120) return { x: x, y: yy };
      }
    }
    return this.findDefenseEdgeSpawn(y.x, y.y, y.r + 120);
  };

  Game.prototype.setupLastStand = function () {
    var d = SL.LAST_STAND;
    var diff = d.difficulties[this.difficulty];
    this.yellow.active = true;
    this.yellow.nextSpawn = Infinity;
    this.yellow.activeUntil = Infinity;
    var at = this.findDefenseBlueSpawn();
    this.defense = {
      hold: 0,
      holdTarget: diff.holdTime,
      wave: 0,
      nextWaveAt: d.prepTime,
      cap: 0,
      airQueue: [],
      blueSpawn: at,
      playerStart: 6,
      difficulty: this.difficulty
    };
    this.spawnCompany('blue', at);
    this.teams.blue.respawnAt = 0;
    this.teams.red.airTimer = 18 + Math.random() * 12;
    // 只有蓝红两方；没有中立单位和绿色单位
    this.drawCard();
    this.drawCard();
    this.log('背水一战：守住黄圈 ' + (diff.holdTime === Infinity ? '直至最后' : U.clock(diff.holdTime)), 'order');
  };

  Game.prototype.defenseWeights = function (wave) {
    var cfg = SL.LAST_STAND.unitWeights;
    var base = wave <= 1 ? cfg.first : cfg.normal;
    var weights = {};
    for (var k in base) weights[k] = base[k];
    if (wave > 1) {
      var tier = Math.min(cfg.maxTier, Math.floor(wave / cfg.tierWaves));
      for (var i = 0; i < cfg.low.length; i++) {
        var key = cfg.low[i];
        weights[key] = (weights[key] || 0) + tier * cfg.lowStep;
      }
    }
    return weights;
  };

  Game.prototype.pickDefenseType = function (wave) {
    var weights = this.defenseWeights(wave);
    var total = 0, k;
    for (k in weights) total += weights[k];
    var r = Math.random() * total;
    for (k in weights) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return 'infantry';
  };

  Game.prototype.defenseWaveCount = function (wave) {
    if (wave <= 1) return SL.LAST_STAND.firstWave;
    var d = SL.LAST_STAND.difficulties[this.difficulty];
    return Math.min(SL.LAST_STAND.maxWaveUnits,
      Math.round(SL.LAST_STAND.firstWave + (wave - 1) * d.waveAdd * d.waveScale));
  };

  Game.prototype.spawnDefenseWave = function (count, wave) {
    var ms = SL.CONFIG.mapSize;
    var b = this.defense.blueSpawn;
    var at = this.findDefenseEdgeSpawn(this.yellow.x, this.yellow.y, this.yellow.r + 180, b.x, b.y, 700);
    var cols = Math.ceil(Math.sqrt(count));
    this.teams.red.level = Math.max(this.teams.red.level || 1, wave);
    for (var i = 0; i < count; i++) {
      var type = this.pickDefenseType(wave);
      var row = Math.floor(i / cols), col = i % cols;
      var x = U.clamp(at.x + (col - (cols - 1) / 2) * 30, 30, ms - 30);
      var y = U.clamp(at.y + row * 28, 30, ms - 30);
      var u = this.addUnit('red', type, x, y, SL.UNIT_TYPES[type].name);
      u.aggressive = true;
    }
    this.log('第 ' + wave + ' 波敌军抵达（' + count + ' 个单位）', 'loss');
    var airCfg = SL.LAST_STAND.air;
    var airCount = Math.min(airCfg.maxPerWave,
      airCfg.baseMin + Math.floor((wave - 1) / (airCfg.tier || 5)));
    this.defense.airQueue.push({
      at: this.time + airCfg.delayMin + Math.random() * (airCfg.delayMax - airCfg.delayMin),
      wave: wave, count: airCount
    });
    this.defense.airQueue.sort(function (a, b) { return a.at - b.at; });
    this.feed.push({
      id: ++this.feedSeq, t: this.time, kind: 'level', ks: 'red', vs: null,
      xp: 0, score: 0, killer: '', victim: '', text: '第 ' + wave + ' 波进攻'
    });
  };

  Game.prototype.defenseBossCount = function (wave) {
    if (wave >= 50) return 3;
    if (wave === 30) return 2;
    return wave % SL.BOSS.interval === 0 ? 1 : 0;
  };

  Game.prototype.spawnBoss = function (wave, log) {
    this.spawnBossForSide('red');
    if (log !== false) this.log('BOSS 加入战场：第 ' + wave + ' 波', 'loss');
  };

  Game.prototype.spawnBossForSide = function (side) {
    side = side || 'red';
    var roll = Math.floor(Math.random() * 3);
    if (roll === 0) this.spawnBossHell(null, null, side);
    else if (roll === 1) this.spawnBossSuper(null, null, side);
    else this.spawnBossGhost(null, null, side);
    return roll;
  };

  Game.prototype.spawnBossHell = function (tx, ty, side) {
    side = side || 'red';
    var cfg = SL.BOSS.hell, ms = SL.CONFIG.mapSize;
    var center = (tx != null && ty != null) ? { x: tx, y: ty } : this.yellow;
    var dl = center.x, dr = ms - center.x, dtp = center.y, db = ms - center.y;
    var m = Math.min(dl, dr, dtp, db), sx, sy, ex, ey;
    if (m === dl) { sx = -180; sy = center.y; ex = ms + 220; ey = center.y; }
    else if (m === dr) { sx = ms + 180; sy = center.y; ex = -220; ey = center.y; }
    else if (m === dtp) { sx = center.x; sy = -180; ex = center.x; ey = ms + 220; }
    else { sx = center.x; sy = ms + 180; ex = center.x; ey = -220; }
    this.planes.push({
      kind: 'hellBomber', boss: true, name: cfg.name, x: sx, y: sy, tx: center.x, ty: center.y, ex: ex, ey: ey,
      center: center, side: side, speed: cfg.speed, t: 0, dropped: false, bombRadius: cfg.bombRadius,
      hp: cfg.hp, maxHp: cfg.hp, hitFlash: 0, heading: Math.atan2(center.y - sy, center.x - sx),
      orbitAng: Math.atan2(sy - center.y, sx - center.x), orbitR: (center.r || this.yellow.r) + 60, gunCd: 1,
      extraBombDone: false, extraBombsLeft: 0, extraBombTimer: 0
    });
  };

  Game.prototype.spawnBossSuper = function (spawnX, spawnY, side) {
    side = side || 'red';
    var cfg = SL.BOSS.superTank, y = this.yellow;
    var at = (spawnX != null) ? { x: spawnX, y: spawnY } : this.findDefenseEdgeSpawn(y.x, y.y, y.r + 120, y.x, y.y, y.r + 100);
    var dx = y.x - at.x, dy = y.y - at.y, L = Math.hypot(dx, dy) || 1;
    var u = this.addUnit(side, 'boss_super', at.x, at.y, cfg.name);
    u.armor = 3; u.bossKind = 'super'; u.bossPhase = 'enter';
    u.bossTarget = { x: y.x, y: y.y };
    u.bossSpiralR = 0; u.bossSpiralAng = 0; u.bossAim = null; u.bossSecAim = null;
    u.bossMainCd = 2; u.bossSecCd = 1.2; u.bossMgCd = 0.4;
    u.crushCd = 0;
    u.aggressive = true;
  };

  Game.prototype.spawnBossGhost = function (spawnX, spawnY, side) {
    side = side || 'red';
    var cfg = SL.BOSS.ghost, y = this.yellow;
    var group = 'ghost_' + (++this.bossGroupSeq);
    var at = (spawnX != null) ? { x: spawnX, y: spawnY } : this.findDefenseEdgeSpawn(y.x, y.y, y.r + 160, y.x, y.y, y.r + 140);
    for (var i = 0; i < cfg.count; i++) {
      var u = this.addUnit(side, 'boss_ghost', at.x + (i % 5) * 22, at.y + Math.floor(i / 5) * 22, cfg.name + ' ' + (i + 1));
      u.hp = u.maxHp = cfg.hp;
      u.bossKind = 'ghost'; u.bossGroup = group;
      u.ghostPhase = 'approach'; u.forceConcealed = true;
      u.concealed = true;
      u.fireMode = 'hold';
      u.items = [
        { key: 'bazooka', ammo: Infinity, cd: 0 },
        { key: 'atgrenade', ammo: Infinity, cd: 0 },
        { key: 'grenade', ammo: Infinity, cd: 0 },
        { key: 'mortar', ammo: 12, cd: 0 }
      ];
      u.ammo = 300;
      u.halfBombTriggered = false;
    }
  };

  Game.prototype.bossShellDamage = function (u, x, y, dmg, radius, ap, fortDmg) {
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side) continue;
      var d = U.dist(e.x, e.y, x, y);
      if (d > radius) continue;
      var falloff = 1 - 0.55 * (d / Math.max(1, radius));
      this.damage(e, dmg * falloff, u, ap);
    }
    if (fortDmg) this.damageFortifications(x, y, fortDmg, radius);
    this.damageSupplies(x, y, dmg * 2, radius);
    this.effects.push({ kind: 'blast', x: x, y: y, t: 0, dur: 0.45, r: radius, side: u.side });
  };

  Game.prototype.updateBossSuper = function (u, dt) {
    var y = this.yellow;
    var cfg = SL.BOSS.superTank;
    var srange = cfg.range || 400;
    u.turret = u.turret || 0;
    if (u.bossPhase === 'enter') {
      // 加速冲向黄圈中心
      var dx = y.x - u.x, dy = y.y - u.y, d = Math.hypot(dx, dy);
      var step = u.def.speed * (cfg.chargeMul || 2.2) * dt;
      if (d > step + 2) {
        u.x += dx / d * step;
        u.y += dy / d * step;
        u.facing = Math.atan2(dy, dx);
      } else {
        u.x = y.x; u.y = y.y;
        u.bossPhase = 'spiral';
        u.bossSpiralR = 0;
        u.bossSpiralAng = 0;
      }
    } else if (u.bossPhase === 'spiral') {
      // 沿螺旋线匀速向外：径向 + 切向合成线速度恒定
      var v = cfg.spiralSpeed || 18;
      var vr = cfg.spiralRadial || 6;
      var vt = Math.sqrt(Math.max(0, v * v - vr * vr));
      u.bossSpiralR += vr * dt;
      var maxR = Math.max(40, y.r - 42);
      if (u.bossSpiralR >= maxR) {
        u.bossSpiralR = maxR;
        u.bossPhase = 'patrol';
      }
      u.bossSpiralAng += (vt / Math.max(1, u.bossSpiralR)) * dt;
      u.x = y.x + Math.cos(u.bossSpiralAng) * u.bossSpiralR;
      u.y = y.y + Math.sin(u.bossSpiralAng) * u.bossSpiralR;
      u.facing = u.bossSpiralAng + Math.PI / 2;
    } else if (u.bossPhase === 'patrol') {
      // 沿黄圈内圈匀速巡逻
      u.bossSpiralR = Math.max(40, y.r - 42);
      var pv = cfg.patrolSpeed || 12;
      u.bossSpiralAng += (pv / u.bossSpiralR) * dt;
      u.x = y.x + Math.cos(u.bossSpiralAng) * u.bossSpiralR;
      u.y = y.y + Math.sin(u.bossSpiralAng) * u.bossSpiralR;
      u.facing = u.bossSpiralAng + Math.PI / 2;
    }
    // 碾压
    u.crushCd = (u.crushCd || 0) - dt;
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side) continue;
      if (U.dist(u.x, u.y, e.x, e.y) < u.def.radius + e.def.radius * 0.5) {
        if (u.crushCd <= 0) {
          u.crushCd = cfg.crushInterval || 0.1;
          var wasAlive = e.alive;
          this.damage(e, cfg.crushDmg || 50, u, 9);
          this.fxText(e.x, e.y - 10, '碾压', '#ff9a6a', u.side);
          if (wasAlive && !e.alive) {
            this.effects.push({ kind: 'explosion', x: e.x, y: e.y, t: 0, dur: 0.75, size: 36, side: e.side });
            this.effects.push({ kind: 'blast', x: e.x, y: e.y, t: 0, dur: 0.55, r: 45, side: e.side });
            if (SL.Audio) SL.Audio.explosion(45, e.x, e.y);
          }
        }
      }
    }
    // 主炮：每 10 秒开始一次 5 秒瞄准，优先重甲；命中区域直径 150m
    u.bossMainCd -= dt;
    if (u.bossAim) {
      u.bossAim.t += dt;
      u.turret = U.angle(u.x, u.y, u.bossAim.x, u.bossAim.y);
      if (u.bossAim.t >= (cfg.mainAimTime || 5)) {
        var aim = u.bossAim;
        u.bossAim = null;
        this.effects.push({ kind: 'tracer', x1: u.x, y1: u.y, x2: aim.x, y2: aim.y, t: 0, dur: 0.2, side: u.side, heavy: true });
        this.bossShellDamage(u, aim.x, aim.y, cfg.mainDmg, cfg.mainAimRadius || 75, 2.6, 300);
        this.effects.push({ kind: 'explosion', x: aim.x, y: aim.y, t: 0, dur: 0.8, size: 60, side: u.side });
        this.effects.push({ kind: 'blast', x: aim.x, y: aim.y, t: 0, dur: 0.8, r: cfg.mainAimRadius || 75, side: u.side });
      }
    } else if (u.bossMainCd <= 0) {
      var big = null, bigScore = -1;
      for (var j = 0; j < this.units.length; j++) {
        var t = this.units[j];
        if (!t.alive || t.side === u.side) continue;
        if (!this.unitVisibleTo(u.side, t)) continue;
        if (U.dist(u.x, u.y, t.x, t.y) > srange) continue;
        var sc = t.type === 'heavy_tank' ? 4 : (t.type === 'tank' ? 3 : (t.def.armor ? 2 : 1));
        if (sc > bigScore) { bigScore = sc; big = t; }
      }
      if (big) {
        u.bossMainCd = cfg.mainInterval || 10;
        u.bossAim = { x: big.x, y: big.y, t: 0, radius: cfg.mainAimRadius || 75 };
        this.fxText(big.x, big.y - 10, '瞄准', '#ffd08a');
      }
    }
    // 双 88 副炮：类似主炮的瞄准式区域炮击
    u.bossSecCd -= dt;
    if (u.bossSecAim) {
      u.bossSecAim.t += dt;
      if (u.bossSecAim.t >= (cfg.secondaryAimTime || 3)) {
        var secAim = u.bossSecAim;
        u.bossSecAim = null;
        for (var sg = 0; sg < 2; sg++) {
          this.effects.push({ kind: 'tracer', x1: u.x, y1: u.y, x2: secAim.x, y2: secAim.y, t: 0, dur: 0.16, side: u.side, heavy: true });
        }
        this.bossShellDamage(u, secAim.x, secAim.y, cfg.secondaryDmg, cfg.secondaryAimRadius || 90, 2.2, 120);
        this.effects.push({ kind: 'explosion', x: secAim.x, y: secAim.y, t: 0, dur: 0.55, size: 34, side: u.side });
        this.effects.push({ kind: 'blast', x: secAim.x, y: secAim.y, t: 0, dur: 0.55, r: cfg.secondaryAimRadius || 90, side: u.side });
      }
    } else if (u.bossSecCd <= 0) {
      var armored = null, ad = Infinity;
      for (var k = 0; k < this.units.length; k++) {
        var t2 = this.units[k];
        if (!t2.alive || t2.side === u.side || !t2.def.armor) continue;
        if (!this.unitVisibleTo(u.side, t2)) continue;
        var dd = U.dist(u.x, u.y, t2.x, t2.y);
        if (dd <= srange && dd < ad) { ad = dd; armored = t2; }
      }
      if (armored) {
        u.bossSecCd = cfg.secondaryInterval || 6;
        u.bossSecAim = { x: armored.x, y: armored.y, t: 0, radius: cfg.secondaryAimRadius || 90 };
        this.fxText(armored.x, armored.y - 10, '副炮瞄准', '#ffd08a');
      }
    }
    // 机枪随机扫射，可对空
    u.bossMgCd -= dt;
    if (u.bossMgCd <= 0) {
      u.bossMgCd = cfg.mgInterval;
      var alive = [];
      for (var ai = 0; ai < this.units.length; ai++) {
        var au = this.units[ai];
        if (!au.alive || au.side === u.side) continue;
        if (U.dist(u.x, u.y, au.x, au.y) > (cfg.mgRange || 400)) continue;
        alive.push({ target: au, plane: false });
      }
      for (var pj = 0; pj < this.planes.length; pj++) {
        var ap = this.planes[pj];
        if (!ap || ap.side === u.side || ap.hp <= 0) continue;
        if (U.dist(u.x, u.y, ap.x, ap.y) > (cfg.mgRange || 400)) continue;
        alive.push({ target: ap, plane: true });
      }
      if (alive.length) {
        for (var mgi = 0; mgi < 4; mgi++) {
          var pick = alive[Math.floor(Math.random() * alive.length)];
          var mt = pick.target;
          if (Math.random() <= cfg.mgAccuracy) {
            if (pick.plane) this.damagePlane(mt, cfg.mgDmg, { side: u.side, name: '超级重坦机枪', kills: 0, score: 0 });
            else this.damage(mt, cfg.mgDmg, u, 0.3);
          }
          this.effects.push({ kind: 'tracer', x1: u.x, y1: u.y, x2: mt.x, y2: mt.y, t: 0, dur: 0.06, side: u.side, heavy: false });
        }
      }
    }
  };

  Game.prototype.updateBossGhost = function (u, dt) {
    var y = this.yellow;
    var gcfg = SL.BOSS.ghost;
    if (!u.halfBombTriggered && u.hp <= u.maxHp * (gcfg.halfBombAt || 0.5)) {
      u.halfBombTriggered = true;
      u.ghostPhase = 'bombing';
      u.forceConcealed = true;
      u.concealed = true;
      u.fireMode = 'hold';
      // 寻找蓝队最密集的位置
      var best = null, bestN = -1;
      for (var bi = 0; bi < this.units.length; bi++) {
        var bu = this.units[bi];
        if (!bu.alive || bu.side !== 'blue') continue;
        var n = 0;
        for (var bj = 0; bj < this.units.length; bj++) {
          var bv = this.units[bj];
          if (bv.alive && bv.side === 'blue' && U.dist(bu.x, bu.y, bv.x, bv.y) <= 100) n++;
        }
        if (n > bestN) { bestN = n; best = bu; }
      }
      u.bombTarget = best ? { x: best.x, y: best.y } : { x: y.x, y: y.y };
      this.log('幽灵步兵半血，强行隐身潜入', 'loss');
    }
    if (u.ghostPhase === 'bombing') {
      if (u.bombTarget && U.dist(u.x, u.y, u.bombTarget.x, u.bombTarget.y) > 18) {
        this.moveToward(u, u.bombTarget.x, u.bombTarget.y, dt);
      } else {
        this.bombs.push({
          x: u.x, y: u.y, side: u.side, source: u, t: 0,
          dur: gcfg.bombDelay || 10, radius: gcfg.bombRadius || 50, dmg: gcfg.bombDmg || 400
        });
        u.forceConcealed = false;
        u.concealed = false;
        u.fireMode = 'free';
        u.ghostPhase = 'spread';
        u.bossTarget = {
          x: U.clamp(y.x + (Math.random() - 0.5) * y.r * 1.5, 40, SL.CONFIG.mapSize - 40),
          y: U.clamp(y.y + (Math.random() - 0.5) * y.r * 1.5, 40, SL.CONFIG.mapSize - 40)
        };
        this.log('幽灵炸弹已安装，10 秒后爆炸', 'loss');
      }
      return;
    }
    if (u.ghostPhase === 'approach') {
      if (U.dist(u.x, u.y, y.x, y.y) > (gcfg.revealRadius || 30)) this.moveToward(u, y.x, y.y, dt);
      else {
        u.ghostPhase = 'spread';
        u.forceConcealed = false;
        u.concealed = false;
        u.fireMode = 'free';
        u.bossTarget = {
          x: U.clamp(y.x + (Math.random() - 0.5) * y.r * 1.5, 40, SL.CONFIG.mapSize - 40),
          y: U.clamp(y.y + (Math.random() - 0.5) * y.r * 1.5, 40, SL.CONFIG.mapSize - 40)
        };
        this.log('幽灵兵团现身', 'loss');
      }
    } else {
      if (U.dist(u.x, u.y, u.bossTarget.x, u.bossTarget.y) > 12) this.moveToward(u, u.bossTarget.x, u.bossTarget.y, dt);
    }
  };

  Game.prototype.settleDefense = function () {
    if (this.mode !== 'lastStand' || this.ended || !this.defense || this.defense.holdTarget !== Infinity) return false;
    this.defense.settled = true;
    this.endDefense(true, '主动结算：坚守 ' + U.clock(this.defense.hold) + '，波次 ' + this.defense.wave);
    return true;
  };

  Game.prototype.saveToStorage = function () {
    if (this.mode !== 'lastStand' || this.difficulty !== 'endless' || this.ended) return false;
    try {
      localStorage.setItem('steel1944_endless_save', JSON.stringify(this.snapshot()));
      return true;
    } catch (e) { return false; }
  };

  Game.prototype.loadFromStorage = function () {
    try {
      var raw = localStorage.getItem('steel1944_endless_save');
      if (!raw) return false;
      return this.restoreSnapshot(JSON.parse(raw));
    } catch (e) { return false; }
  };

  Game.prototype.snapshot = function () {
    var self = this;
    var teams = {};
    ['blue', 'red', 'green'].forEach(function (side) {
      var t = self.teams[side];
      if (!t) return;
      teams[side] = {
        xp: t.xp, level: t.level, nextXp: t.nextXp, score: t.score,
        scoreEarned: t.scoreEarned, kills: t.kills, respawnAt: t.respawnAt,
        company: t.company, draftBuys: t.draftBuys, hand: t.hand
      };
    });
    return {
      v: 1, map: T.map.id, mode: this.mode, difficulty: this.difficulty,
      time: this.time, yellow: this.yellow,
      defense: this.defense ? {
        hold: this.defense.hold,
        holdTarget: this.defense.holdTarget === Infinity ? 'Infinity' : this.defense.holdTarget,
        wave: this.defense.wave, nextWaveAt: this.defense.nextWaveAt,
        cap: this.defense.cap, airQueue: this.defense.airQueue,
        blueSpawn: this.defense.blueSpawn, playerStart: this.defense.playerStart,
        difficulty: this.defense.difficulty
      } : null,
      teams: teams, stats: this.stats, drafts: this.drafts,
      nextCardId: this.nextCardId,
      zones: T.zones.map(function (z) {
        return {
          id: z.id, owner: z.owner, cap: z.cap, capSide: z.capSide,
          fortified: z.fortified, hp: z.hp, maxHp: z.maxHp,
          fortifyProgress: z.fortifyProgress, structure: z.structure,
          structures: z.structures || [], rubble: z.rubble || null,
          rubbleProgress: z.rubbleProgress || 0
        };
      }),
      supplies: this.supplies,
      drops: this.drops,
      mines: this.mines,
      barriers: this.barriers,
      recons: [],
      planes: this.planes,
      units: this.units.filter(function (u) { return u.alive; }).map(function (u) {
        return {
          side: u.side, type: u.type, name: u.name, x: u.x, y: u.y,
          hp: u.hp, maxHp: u.maxHp, ammo: u.ammo, ammoMax: u.ammoMax,
          mgAmmo: u.mgAmmo, mgAmmoMax: u.mgAmmoMax, magLeft: u.magLeft,
          cd: u.cd, stamina: u.stamina, fireMode: u.fireMode,
          grenadeMode: u.grenadeMode, kills: u.kills, score: u.score, items: u.items,
          deployState: u.deployState, deployTimer: u.deployTimer,
          engineerMode: u.engineerMode, engineerValue: u.engineerValue,
          engineerMax: u.engineerMax, engLastX: u.engLastX, engLastY: u.engLastY,
          bossKind: u.bossKind, ghostPhase: u.ghostPhase,
          forceConcealed: u.forceConcealed, bossPhase: u.bossPhase,
          bossTarget: u.bossTarget, bossMainCd: u.bossMainCd,
          bossSecCd: u.bossSecCd, bossMgCd: u.bossMgCd
        };
      })
    };
  };

  Game.prototype.restoreSnapshot = function (data) {
    if (!data || data.v !== 1 || data.map !== T.map.id || data.mode !== 'lastStand' || data.difficulty !== 'endless') return false;
    var self = this;
    this.time = data.time || 0;
    this.ended = false; this.winner = null; this.state = 'playing';
    this.selected = [];
    this.units.length = 0;
    this.planes.length = 0; this.shells.length = 0; this.effects.length = 0;
    this.strikes.length = 0; this.supplies.length = 0; this.recons.length = 0;
    this.wrecks.length = 0;
    this.stats = data.stats || this.stats;
    this.nextCardId = data.nextCardId || this.nextCardId;
    this.drafts = data.drafts || [];
    this.yellow = data.yellow || this.yellow;
    this.yellow.nextSpawn = Infinity;
    this.yellow.activeUntil = Infinity;
    if (data.defense) {
      var d = {}; for (var k in data.defense) d[k] = data.defense[k];
      if (d.holdTarget === 'Infinity') d.holdTarget = Infinity;
      this.defense = d;
    }
    for (var side in data.teams) {
      if (!this.teams[side]) continue;
      var t = data.teams[side];
      for (var key in t) this.teams[side][key] = t[key];
    }
    (data.zones || []).forEach(function (z) {
      var zone = T.zones.find(function (zz) { return zz.id === z.id; });
      if (!zone) return;
      for (var k in z) zone[k] = z[k];
    });
    this.supplies = data.supplies || [];
    this.drops = data.drops || [];
    this.mines = data.mines || [];
    this.barriers = data.barriers || [];
    this.barrierVersion++;
    this.barrierGridCache = {};
    this.recons = data.recons || [];
    this.planes = data.planes || [];
    (data.units || []).forEach(function (su) {
      var u = self.addUnit(su.side, su.type, su.x, su.y, su.name);
      for (var k in su) if (k !== 'side' && k !== 'type' && k !== 'name' && k !== 'x' && k !== 'y') u[k] = su[k];
      u.maxHp = su.maxHp; u.hp = su.hp;
      u.items = su.items || [];
      u.target = null; u.order = null; u.selected = false;
      if (u.type === 'engineer_vehicle') {
        u.engineerMode = su.engineerMode || null;
        u.engineerValue = su.engineerValue === undefined ? u.engineerMax : su.engineerValue;
        u.engLastX = su.engLastX === undefined ? u.x : su.engLastX;
        u.engLastY = su.engLastY === undefined ? u.y : su.engLastY;
      }
    });
    this.computeFog();
    this.log('已读取无尽防线存档', 'win');
    return true;
  };

  Game.prototype.endDefense = function (win, reason) {
    if (this.ended) return;
    this.ended = true;
    this.winner = win ? 'blue' : 'red';
    this.state = win ? 'won' : 'lost';
    this.endReason = reason;
    if (win && SL.Audio) SL.Audio.win();
    this.log(reason, win ? 'win' : 'loss');
  };

  Game.prototype.updateDefense = function (dt) {
    if (this.mode !== 'lastStand' || this.ended) return;
    var d = this.defense;
    while (this.time >= d.nextWaveAt) {
      d.wave++;
      this.spawnDefenseWave(this.defenseWaveCount(d.wave), d.wave);
      var nearEnd = d.holdTarget !== Infinity &&
        d.holdTarget - d.hold <= (SL.BOSS.finalSafety || 60);
      if (!nearEnd && d.wave % SL.BOSS.interval === 0) {
        var bossCount = this.defenseBossCount(d.wave);
        for (var bi = 0; bi < bossCount; bi++) this.spawnBoss(d.wave, bi === 0);
      }
      d.nextWaveAt += SL.LAST_STAND.waveGap;
    }
    var blue = 0, red = 0;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive) continue;
      if (U.dist2(u.x, u.y, this.yellow.x, this.yellow.y) > this.yellow.r * this.yellow.r) continue;
      if (u.side === 'blue') blue++;
      else if (u.side === 'red') red++;
    }
    d.blueIn = blue;
    d.redIn = red;
    if (blue > 0) {
      // 只要蓝队仍在圈内，坚守计时就不因敌军争夺而暂停
      d.hold += dt;
      if (red > 0) d.cap = Math.max(0, d.cap - dt / SL.LAST_STAND.captureTime * 0.35);
      else d.cap = Math.max(0, d.cap - dt / SL.LAST_STAND.captureTime * 0.8);
    } else if (red > 0) {
      d.cap += dt / SL.LAST_STAND.captureTime;
    } else {
      d.cap = Math.max(0, d.cap - dt / SL.LAST_STAND.captureTime * 0.5);
    }
    if (d.cap >= 1) {
      this.endDefense(false, '黄圈被红队占领，防线失守');
      return;
    }
    if (d.holdTarget !== Infinity && d.hold >= d.holdTarget) {
      this.endDefense(true, '成功固守黄圈 ' + U.clock(d.holdTarget) + '，防线稳固');
    }
  };

  // 地图随机位置的中立落单单位：不占点、不参与车轮战，击杀给经验
  Game.prototype.spawnNeutral = function () {
    if (this.testMode) return null;
    if (this.aliveCount('neutral') >= SL.NEUTRAL.cap) return null;
    var ms = SL.CONFIG.mapSize;
    var w = SL.NEUTRAL.weights;
    var total = 0, key;
    for (key in w) total += w[key];
    var roll = Math.random() * total, type = 'infantry';
    for (key in w) {
      roll -= w[key];
      if (roll < 0) { type = key; break; }
    }
    var x = ms / 2, y = ms / 2, ok = false;
    for (var tries = 0; tries < 60; tries++) {
      x = 220 + Math.random() * (ms - 440);
      y = 220 + Math.random() * (ms - 440);
      var minD = Infinity;
      for (var i = 0; i < this.units.length; i++) {
        var u = this.units[i];
        if (!u.alive) continue;
        var d = U.dist(x, y, u.x, u.y);
        if (d < minD) minD = d;
      }
      if (minD >= 200) { ok = true; break; }
    }
    if (!ok) return null;
    var nu = this.addUnit('neutral', type, x, y, SL.UNIT_TYPES[type].name);
    nu.neutral = true;
    nu.aggressive = false;
    return nu;
  };

  // 场上中立单位越少，刷新间隔越短
  Game.prototype.neutralSpawnGap = function () {
    var n = this.aliveCount('neutral');
    var ratio = U.clamp(n / SL.NEUTRAL.cap, 0, 1);
    var factor = SL.NEUTRAL.fastFactorMin + (1 - SL.NEUTRAL.fastFactorMin) * ratio;
    return (SL.NEUTRAL.minGap + Math.random() * (SL.NEUTRAL.maxGap - SL.NEUTRAL.minGap)) * factor;
  };

  Game.prototype.updateNeutrals = function (dt) {
    var nAlive = this.aliveCount('neutral');
    if (this.neutralSeen !== null && nAlive < this.neutralSeen) {
      var fastGap = this.neutralSpawnGap();
      if (fastGap < this.neutralTimer) this.neutralTimer = fastGap;
    }
    this.neutralSeen = nAlive;
    this.neutralTimer -= dt;
    if (this.neutralTimer <= 0) {
      this.neutralTimer = this.neutralSpawnGap();
      if (this.aliveCount('neutral') < SL.NEUTRAL.cap) this.spawnNeutral();
    }
    // 清理没有战功的中立尸体，避免长期堆积
    var keep = [];
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.side === 'neutral' && !u.alive && u.score === 0) continue;
      keep.push(u);
    }
    this.units = keep;
  };

  Game.prototype.aiUnitCap = function () {
    if (this.mode !== 'melee') return 20;
    return (SL.AI_UNIT_CAP && SL.AI_UNIT_CAP[this.difficulty]) || 20;
  };

  // 无限难度按时间分档：15 分钟前 2 件、15~30 分钟 4 件、30 分钟后 6 件
  Game.prototype.endlessStage = function () {
    var t = SL.AI_EQUIP_TIME || { early: 900, mid: 1800 };
    if (this.time < t.early) return 'early';
    if (this.time < t.mid) return 'mid';
    return 'late';
  };

  Game.prototype.aiEquipCap = function () {
    var cap = SL.AI_EQUIP_MAX || { easy: 2, normal: 4, hard: 6 };
    if (this.difficulty === 'easy') return cap.easy;
    if (this.difficulty === 'normal') return cap.normal;
    if (this.difficulty === 'hard') return cap.hard;
    var stage = this.endlessStage();
    return stage === 'early' ? cap.endlessEarly : (stage === 'mid' ? cap.endlessMid : cap.endlessLate);
  };

  Game.prototype.aiFortWeaponCap = function () {
    var cap = SL.AI_FORT.weaponCap || { easy: 1, normalMin: 2, normalMax: 3, hard: 4 };
    if (this.difficulty === 'easy') return cap.easy;
    if (this.difficulty === 'hard') return cap.hard;
    if (this.difficulty === 'normal') {
      return cap.normalMin + (Math.random() < 0.5 ? 0 : 1);
    }
    var stage = this.endlessStage();
    return Math.min(SL.FORT.maxStructures,
      stage === 'early' ? cap.endlessEarly : (stage === 'mid' ? cap.endlessMid : cap.endlessLate));
  };

  // 按连队等级生成重生编制：玩家固定基础连队，AI 规模更大
  Game.prototype.companyForLevel = function (level, ai) {
    var list = SL.COMPANY.base.slice();
    var cycle = SL.COMPANY.aiCycle;
    var aiMax = this.mode === 'melee' ? this.aiUnitCap() : SL.RESPAWN.aiCap;
    var target = ai
      ? Math.min(aiMax, SL.RESPAWN.aiBase + Math.max(0, (level || 1) - 1) * SL.RESPAWN.aiPerLevel)
      : Math.min(SL.RESPAWN.playerCap, SL.RESPAWN.playerBase + Math.max(0, (level || 1) - 1));
    var ci = 0;
    while (list.length < target) {
      list.push(cycle[ci % cycle.length]);
      ci++;
    }
    return list.slice(0, target);
  };

  // 在指定位置附近展开一个连队（level 决定规模；scaled 只用于 AI 重生）
  Game.prototype.spawnCompany = function (side, at, level, scaled) {
    var S = SL.SIDES[side];
    var team = this.teams[side];
    team.company++;
    var base = at || (T.spawns && T.spawns[side]) || S.spawn;
    var mapSize = SL.CONFIG.mapSize;
    var ai = !!scaled && (side === 'red' || side === 'green');
    var list = this.companyForLevel(level || 1, ai);
    var n = list.length;
    var cols = Math.ceil(Math.sqrt(n));
    var gap = 34;
    var idxByType = { infantry: 0, armored: 0, tank: 0 };
    for (var i = 0; i < n; i++) {
      var type = list[i];
      idxByType[type]++;
      var name = SL.UNIT_TYPES[type].name;
      if (type === 'infantry') name = '步兵' + idxByType[type] + '班';
      if (type === 'armored') name = '装甲车' + idxByType[type] + '号';
      if (type === 'tank') name = '中型坦克' + idxByType[type] + '号';
      var col = i % cols, row = Math.floor(i / cols);
      var rows = Math.ceil(n / cols);
      var ox = (col - (cols - 1) / 2) * gap;
      var oy = (row - (rows - 1) / 2) * gap;
      var u = this.addUnit(
        side, type,
        U.clamp(base.x + ox, 30, mapSize - 30),
        U.clamp(base.y + oy, 30, mapSize - 30),
        name
      );
      var obj = T.objective || { x: mapSize / 2, y: mapSize / 2 };
      var cx = obj.x - u.x, cy = obj.y - u.y;
      u.facing = Math.atan2(cy, cx);
      u.turret = u.facing;
      u.aggressive = type !== 'infantry';
      u.objective = { x: obj.x + (side === 'blue' ? -40 : 40), y: obj.y };
      if (side !== 'blue') u.aggressive = true;
    }
  };

  // 全图最稀薄的位置：网格搜索 + 局部细化，保证有单位时一定能找到落脚点
  Game.prototype.thinnestPoint = function () {
    var ms = SL.CONFIG.mapSize;
    var best = null, bestD = -1;
    var self = this;
    function evalAt(x, y) {
      var minD = Infinity;
      for (var i = 0; i < self.units.length; i++) {
        var u = self.units[i];
        if (!u.alive) continue;
        var d = U.dist(x, y, u.x, u.y);
        if (d < minD) minD = d;
      }
      if (minD > bestD) { bestD = minD; best = { x: x, y: y }; }
    }
    var margin = 80;
    for (var x = margin; x <= ms - margin; x += 80) {
      for (var y = margin; y <= ms - margin; y += 80) evalAt(x, y);
    }
    if (best) {
      var cx = best.x, cy = best.y;
      for (var dx = -80; dx <= 80; dx += 16) {
        for (var dy = -80; dy <= 80; dy += 16) {
          var rx = U.clamp(cx + dx, margin, ms - margin);
          var ry = U.clamp(cy + dy, margin, ms - margin);
          evalAt(rx, ry);
        }
      }
    }
    return best || { x: ms / 2, y: ms / 2 };
  };

  Game.prototype.findSafeSpawn = function (side) {
    var margin = 110;
    var mapSize = SL.CONFIG.mapSize;
    for (var tries = 0; tries < 80; tries++) {
      var x = margin + Math.random() * (mapSize - margin * 2);
      var y = margin + Math.random() * (mapSize - margin * 2);
      var minD = Infinity;
      for (var i = 0; i < this.units.length; i++) {
        var u = this.units[i];
        if (!u.alive) continue;
        var d = U.dist(x, y, u.x, u.y);
        if (d < minD) minD = d;
      }
      if (minD >= 240) return { x: x, y: y };
    }
    // 全图没有像样的安全区：去最稀薄的地方强行重生
    return this.thinnestPoint();
  };

  // 按权重随机一个单位类型（单位包 / AI 增援共用）
  Game.prototype.pickUnitType = function (ai) {
    var table = ai ? SL.AI_UNIT_PACK : SL.UNIT_PACK;
    var total = 0;
    for (var i = 0; i < table.length; i++) total += table[i].w;
    var r = Math.random() * total;
    for (var k = 0; k < table.length; k++) {
      r -= table[k].w;
      if (r < 0) return table[k].key;
    }
    return 'infantry';
  };

  // AI 升级时的增援：随机一个单位，落在己方部队附近
  Game.prototype.spawnReinforcement = function (side) {
    if (this.aliveCount(side) === 0) return null;   // 等待重生期间没有增援
    if (this.aliveCount(side) >= this.aiUnitCap()) return null;
    var type = this.pickUnitType(true);
    var mates = this.units.filter(function (u) { return u.alive && u.side === side; });
    var mapSize = SL.CONFIG.mapSize;
    var anchor = mates.length ? mates[Math.floor(Math.random() * mates.length)]
      : ((T.spawns && T.spawns[side]) || SL.SIDES[side].spawn);
    var ang = Math.random() * Math.PI * 2;
    var rr = SL.DEPLOY_RANGE * Math.sqrt(Math.random());
    var x = U.clamp(anchor.x + Math.cos(ang) * rr, 30, mapSize - 30);
    var y = U.clamp(anchor.y + Math.sin(ang) * rr, 30, mapSize - 30);
    var n = this.units.filter(function (u) { return u.side === side; }).length + 1;
    var u = this.addUnit(side, type, x, y, SL.UNIT_TYPES[type].name + n);
    u.aggressive = true;
    u.objective = { x: (T.objective && T.objective.x) || mapSize / 2, y: (T.objective && T.objective.y) || mapSize / 2 };
    return u;
  };

  Game.prototype.addUnit = function (side, typeKey, x, y, name) {
    var def = SL.UNIT_TYPES[typeKey];
    var u = {
      id: nextId++,
      side: side,
      team: this.teams[side],
      type: typeKey,
      def: def,
      name: name || def.name,
      x: x, y: y,
      hp: def.hp,
      maxHp: def.hp,
      facing: side === 'blue' ? -0.9 : 2.2,
      turret: side === 'blue' ? -0.9 : 2.2,
      cd: 0.4 + Math.random() * 1.2,
      scan: Math.random() * 0.3,
      coverTimer: 0,
      target: null,
      order: null,
      alive: true,
      selected: false,
      moving: false,
      fireMode: (typeKey === 'rocket_arty' && side === 'blue') ? 'hold' : 'free',
      engaging: false,
      sprinting: false,
      stamina: 100,
      ammo: def.weapon.ammo,
      ammoMax: def.weapon.ammo,
      ammoWarned: false,
      magLeft: def.weapon.mag || 0,
      mgAmmo: (typeKey === 'tank' || typeKey === 'heavy_tank') ? SL.EQUIP.mg.weapon.ammo : 0,
      mgAmmoMax: (typeKey === 'tank' || typeKey === 'heavy_tank') ? SL.EQUIP.mg.weapon.ammo : 0,
      reloadT: 0,
      flash: 0,
      hitFlash: 0,
      kills: 0,
      score: 0,
      items: [],
      lastFire: -99,
      concealed: false,
      ghost: false,
      grenadeMode: 'auto',
      aggressive: false,
      objective: null,
      lastSeen: null,
      dustT: 0,
      idle: 0,
      deployState: SL.ARTILLERY[typeKey] ? 'deployed' : 'none',
      deployTimer: 0,
      engineerMode: null,
      engineerValue: typeKey === 'engineer_vehicle' ? SL.ENGINEER.maxValue : 0,
      engineerMax: typeKey === 'engineer_vehicle' ? SL.ENGINEER.maxValue : 0,
      engLastX: x, engLastY: y,
      engLastNode: null,
      rangeNow: def.range,
      maxRangeNow: def.range,
      cover: { zone: null, forest: 0, dr: 0, evade: 0, rangeBonus: 0, height: 0 }
    };
    this.units.push(u);
    if ((side === 'red' || side === 'green') && typeKey === 'infantry') this.rollAIEquipment(u);
    return u;
  };

  Game.prototype.rollAIEquipment = function (u) {
    var chance = (SL.AI_EQUIP && SL.AI_EQUIP[this.difficulty]) || 0.45;
    var cap = this.aiEquipCap();
    var count = 0;
    for (var i = 0; i < 6; i++) if (Math.random() < chance) count++;
    count = Math.min(count, cap);
    if (!count) return;
    var keys = SL.EQUIP_KEYS.slice();
    for (var j = keys.length - 1; j > 0; j--) {
      var r = Math.floor(Math.random() * (j + 1));
      var tmp = keys[j]; keys[j] = keys[r]; keys[r] = tmp;
    }
    for (var k = 0; k < count && k < keys.length; k++) {
      var eq = SL.EQUIP[keys[k]];
      u.items.push({
        key: keys[k],
        ammo: eq.weapon ? eq.weapon.ammo : 0,
        hp: eq.heal || 0,
        uses: eq.uses || 0,
        cd: 0
      });
    }
  };

  Game.prototype.log = function (text, kind) {
    this.feed.push({ id: ++this.feedSeq, t: this.time, text: text, kind: kind || 'info' });
    if (this.feed.length > 40) this.feed.shift();
    this.feedVersion = (this.feedVersion || 0) + 1;
  };

  Game.prototype.aliveOf = function (side) {
    var out = [];
    for (var i = 0; i < this.units.length; i++) {
      if (this.units[i].alive && this.units[i].side === side) out.push(this.units[i]);
    }
    return out;
  };

  /* ---------------- 选择 ---------------- */

  Game.prototype.unitAt = function (x, y, maxDist) {
    var best = null, bestD = maxDist || 22;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side !== 'blue') continue;
      if (!this.canSee('blue', u.x, u.y)) continue;
      var d = U.dist(x, y, u.x, u.y);
      if (d < bestD) { best = u; bestD = d; }
    }
    return best;
  };

  Game.prototype.enemyAt = function (x, y, maxDist) {
    var best = null, bestD = maxDist || 24;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side === 'blue') continue;
      if (!this.unitVisibleTo('blue', u)) continue;
      var d = U.dist(x, y, u.x, u.y);
      if (d < bestD) { best = u; bestD = d; }
    }
    return best;
  };

  Game.prototype.unitsInRect = function (x0, y0, x1, y1) {
    var out = [];
    var ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    var ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side !== 'blue') continue;
      if (u.x >= ax && u.x <= bx && u.y >= ay && u.y <= by) out.push(u);
    }
    return out;
  };

  Game.prototype.setSelection = function (units) {
    this.selected = units.slice();
    for (var i = 0; i < this.units.length; i++) this.units[i].selected = false;
    for (var k = 0; k < this.selected.length; k++) this.selected[k].selected = true;
  };

  Game.prototype.clearOrders = function (units) {
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      u.order = null;
      u.moving = false;
      var art = SL.ARTILLERY[u.type];
      if (!art) continue;
      u.target = null;
      if (u.deployState === 'packing' || u.deployState === 'moving') {
        u.deployState = 'deploying';
        u.deployTimer = art.deploy;
        u.engaging = false;
      }
    }
  };

  // 试验场专用：一键清空全部单位与标靶
  Game.prototype.clearTestUnits = function () {
    if (!this.testMode) return 0;
    var n = 0;
    for (var i = 0; i < this.units.length; i++) if (this.units[i].alive) n++;
    this.units = [];
    this.selected = [];
    this.effects = [];
    this.shells = [];
    this.wrecks = [];
    this.bombs = [];
    this.teams.blue.respawnAt = 0;
    return n;
  };

  // 工兵 Shift+右键：在 200m 内新建一个可占领的野战工事区，每件工兵装备一次
  Game.prototype.buildFieldZone = function (units, x, y) {
    if (!units || !units.length) return null;
    var u = null, item = null;
    for (var i = 0; i < units.length; i++) {
      var cand = units[i];
      if (!cand.alive || cand.type !== 'infantry' || cand.side !== 'blue') continue;
      for (var k = 0; k < cand.items.length; k++) {
        if (cand.items[k].key !== 'engineer') continue;
        var uses = cand.items[k].uses === undefined ? 1 : cand.items[k].uses;
        if (uses > 0) { u = cand; item = cand.items[k]; break; }
      }
      if (u) break;
    }
    if (!u || !item) return null;
    if (U.dist(u.x, u.y, x, y) > SL.FORT.fieldBuildRange) return null;
    if (T.zoneAt(x, y)) return null;
    item.uses = (item.uses === undefined ? 1 : item.uses) - 1;
    var z = T.addZone({
      id: 'field_' + (++nextId), name: '野战工事', kind: 'fort',
      x: x, y: y, r: 64, owner: u.side, built: true
    });
    if (SL.Render) SL.Render.minimapCache = null;
    if (SL.Audio) SL.Audio.build(u.x, u.y);
    this.log(u.name + ' 构筑了野战工事', 'order');
    this.fxText(x, y - 12, '野战工事', '#e8c47a', u.side);
    return z;
  };

  /* 编队移动：围绕目标点排开 */
  Game.prototype.commandMove = function (units, x, y, sprint) {
    if (!units.length) return;
    var cols = Math.ceil(Math.sqrt(units.length));    var gap = 26;
    var count = units.length;
    var anySprint = false;
    var ms = SL.CONFIG.mapSize;
    // 多单位行动：整队按最慢单位的速度前进
    var speedCap = 0;
    if (count > 1) {
      speedCap = Infinity;
      for (var si = 0; si < count; si++) {
        var su = units[si];
        var canS = sprint && su.def.canSprint && su.stamina > CB.sprintMin;
        var sp = su.def.speed * (canS ? CB.sprintMul : 1);
        if (sp < speedCap) speedCap = sp;
      }
    }
    for (var i = 0; i < count; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var rows = Math.ceil(count / cols);
      var ox = (col - (cols - 1) / 2) * gap;
      var oy = (row - (rows - 1) / 2) * gap;
      var tx = U.clamp(x + ox, 14, ms - 14);
      var ty = U.clamp(y + oy, 14, ms - 14);
      var canRun = sprint && units[i].def.canSprint && units[i].stamina > CB.sprintMin;
      if (canRun) anySprint = true;
      units[i].order = { kind: 'move', x: tx, y: ty, sprint: !!canRun, speedCap: speedCap };
      units[i].target = null;
      units[i].path = null;
      units[i].noPath = false;
    }
    if (sprint && !anySprint) this.log('体力不足，无法急行军', 'order');
    else this.log((anySprint ? '急行军' : '移动') + '指令 · ' + units.length + ' 个单位', 'order');
  };

  Game.prototype.commandAttack = function (units, target) {
    var speedCap = 0;
    if (units.length > 1) {
      speedCap = Infinity;
      for (var k = 0; k < units.length; k++) {
        if (units[k].def.speed < speedCap) speedCap = units[k].def.speed;
      }
    }
    for (var i = 0; i < units.length; i++) {
      units[i].order = { kind: 'attack', target: target, speedCap: speedCap };
      units[i].target = target;
      units[i].path = null;
      units[i].noPath = false;
    }
    this.log('攻击指令 · ' + target.name, 'order');
  };

  /* 双击右键：步兵急行军 */
  Game.prototype.commandSprint = function (units, x, y) {
    this.commandMove(units, x, y, true);
  };

  Game.prototype.hasEquip = function (u, key) {
    for (var i = 0; i < u.items.length; i++) if (u.items[i].key === key) return true;
    return false;
  };

  /* ---------------- 掩体 / 高地 ---------------- */

  Game.prototype.updateCover = function (u) {
    var z = T.zoneAt(u.x, u.y);
    var f = T.forestAt(u.x, u.y);
    var h = T.heightAt(u.x, u.y);
    var dr = 0, ev = 0;
    if (z) {
      var zb = SL.ZONE_BONUS[z.kind];
      if (zb) {
        var mul = z.owner === u.side ? 1 : (z.owner ? 0.55 : 0.8);
        // 所有单位都能吃到阵地加成，装甲单位效果较低
        var unitMul = u.def.armor ? SL.ZONE_UNIT_SCALE.armor : SL.ZONE_UNIT_SCALE.foot;
        dr += zb.dr * mul * unitMul;
        ev += zb.evade * mul * unitMul;
        // 灌木 / 树林提供额外隐蔽与闪避
        if (z.kind === 'bush' || z.kind === 'forest') ev += SL.ZONE_VEG_EVADE * mul;
        // 占领区内：步兵大幅提高闪避；其他单位也同时获得闪避和减伤
        if (u.type === 'infantry') {
          ev += SL.ZONE_INF_EVADE * mul;
          if (z.kind === 'fort') {
            dr += (SL.ZONE_INF_FORT.dr || 0) * mul;
            ev += (SL.ZONE_INF_FORT.evade || 0) * mul;
            if (z.fortified) {
              dr += (SL.ZONE_INF_FORTIFIED.dr || 0) * mul;
              ev += (SL.ZONE_INF_FORTIFIED.evade || 0) * mul;
            }
          }
        } else {
          dr += SL.ZONE_OTHER.dr * mul;
          ev += SL.ZONE_OTHER.evade * mul;
        }
      }
      // 机枪碉堡：本阵营步兵额外减伤
      var zStructs = this.zoneStructures(z);
      for (var zsi = 0; zsi < zStructs.length; zsi++) {
        if (zStructs[zsi].type === 'bunker' && u.type === 'infantry' && z.owner === u.side) {
          dr += SL.FORT.bunkerDR;
          ev += SL.FORT.bunkerEvade;
          break;
        }
      }
    }
    if (f > 0.6) { dr += u.type === 'infantry' ? 0.12 : 0.06; ev += 0.18; }
    else if (f > 0.36) { dr += 0.05; ev += 0.08; }
    u.cover.zone = z;
    u.cover.forest = f;
    u.cover.dr = Math.min(CB.coverDRCap, dr);
    u.cover.evade = Math.min(CB.coverEvadeCap, ev);
    u.cover.height = h;
    u.cover.rangeBonus = U.clamp((h - CB.elevationBase) / CB.elevationSpan, 0, CB.elevationRangeBonus);
    var bonus = 1 + u.cover.rangeBonus;
    u.rangeNow = u.def.range * bonus;
    var maxR = u.def.range * bonus;
    for (var k = 0; k < u.items.length; k++) {
      var ew = SL.EQUIP[u.items[k].key].weapon;
      if (!ew) continue;
      var effective = ew.noRangeBonus ? ew.range : ew.range * bonus;
      if (effective > maxR) maxR = effective;
    }
    // 强化工事里的机枪碉堡/迫击炮阵地提供额外射程
    if (z && z.owner === u.side && u.type === 'infantry') {
      var zrStructs = this.zoneStructures(z);
      for (var zr = 0; zr < zrStructs.length; zr++) {
        if (zrStructs[zr].type === 'bunker') maxR = Math.max(maxR, SL.FORT.bunkerRange * bonus);
        if (zrStructs[zr].type === 'mortar') maxR = Math.max(maxR, SL.FORT.mortarRange * bonus);
      }
    }
    u.maxRangeNow = maxR;
  };

  /* ---------------- 占领 ---------------- */

  Game.prototype.updateZones = function (dt) {
    this.zoneScoreTimer -= dt;
    var scoreTick = false;
    if (this.zoneScoreTimer <= 0) { this.zoneScoreTimer = 1; scoreTick = true; }
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      if (z.tempBush) continue;
      var counts = { blue: 0, red: 0, green: 0 };
      for (var k = 0; k < this.units.length; k++) {
        var u = this.units[k];
        if (!u.alive || u.side === 'neutral') continue;
        var dx = u.x - z.x, dy = u.y - z.y;
        if (dx * dx + dy * dy <= z.r * z.r) counts[u.side]++;
      }
      var present = [];
      for (var s in counts) if (counts[s] > 0) present.push(s);
      var side = present.length === 1 ? present[0] : null;
      if (!side) {
        z.cap = Math.max(0, z.cap - dt * 1.6);
        if (z.cap === 0) z.capSide = null;
        continue;
      }
      if (z.capSide !== side) { z.capSide = side; z.cap = 0; }
      z.cap += dt;
      if (scoreTick && z.owner === side) this.addScore(side, SL.ZONE_SCORE.holdPerSecond);
      if (z.cap >= 3 && z.owner !== side) {
        z.owner = side;
        z.cap = 0;
        this.clearFortification(z);
        this.autoFortifyAI(z, side);
        this.addXp(side, 20);
        if (SL.Audio) SL.Audio.capture(z.x, z.y);
        var nm = SL.SIDES[side].name;
        this.log(nm + '占领 ' + z.name, side === 'blue' ? 'order' : 'loss');
        this.fxText(z.x, z.y - z.r - 4, '占领 ' + z.name, SL.SIDES[side].light);
      }
    }
  };

  /* ---------------- 强化工事 ---------------- */

  /* ---------------- 黄圈争夺区 ---------------- */

  Game.prototype.pickYellowPoint = function () {
    var ms = SL.CONFIG.mapSize;
    var m = 340;
    this.yellow.x = m + Math.random() * (ms - m * 2);
    this.yellow.y = m + Math.random() * (ms - m * 2);
  };

  Game.prototype.refreshYellow = function () {
    if (!this.testMode) return false;
    this.pickYellowPoint();
    this.yellow.active = true;
    this.yellow.activeUntil = this.time + SL.YELLOW.duration;
    this.computeFog();
    if (SL.Render) SL.Render.minimapCache = null;
    return true;
  };

  Game.prototype.updateYellow = function (dt) {
    var y = this.yellow;
    if (!y) return;
    // 背水一战：黄圈固定，不换点、不按经验决胜
    if (this.mode === 'lastStand') {
      y.active = true;
    } else {
      // 同一落点持续 2.5 分钟；时间到才换新地点
      if (this.time >= y.nextSpawn) {
        this.pickYellowPoint();
        y.nextSpawn = this.time + SL.YELLOW.duration;
        y.activeUntil = y.nextSpawn;
        y.cycle++;
      }
      y.active = true;
    }
    this.yellowXpTimer -= dt;
    if (this.yellowXpTimer > 0) return;
    this.yellowXpTimer = 1;
    var counts = { blue: 0, red: 0, green: 0 };
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side === 'neutral') continue;
      if (U.dist2(u.x, u.y, y.x, y.y) <= y.r * y.r) counts[u.side] = (counts[u.side] || 0) + 1;
    }
    var sides = ['blue', 'red', 'green'];
    for (var k = 0; k < sides.length; k++) {
      var side = sides[k];
      if (this.aliveCount(side) === 0) continue;
      var others = 0;
      for (var j = 0; j < sides.length; j++) if (sides[j] !== side) others += counts[sides[j]] || 0;
      var net = counts[side] - others;
      if (net > 0) {
        var gain = net * SL.YELLOW.xpPerUnit;
        this.teams[side].yellowXp += gain;
        this.addScore(side, net * SL.YELLOW.scorePerUnitSecond);
        this.addXp(side, gain);
        this.checkYellowWin(side);
      }
    }
    if (this.mode === 'melee') this.checkMeleeBossTrigger();
  };

  Game.prototype.checkMeleeBossTrigger = function () {
    if (this.mode !== 'melee' || this.testMode || this.ended) return false;
    var mods = this.meleeMods();
    if (mods.id === 'easy') return false;
    var xp = this.teams.blue.yellowXp;
    var spawned = 0, lastSide = null;

    function aliveChoices() {
      return ['red', 'green'].filter(function (side) { return this.aliveCount(side) > 0; }, this);
    }

    if (xp >= 50000 && !this.meleeBoss50k) {
      this.meleeBoss50k = true;
      var choices = aliveChoices.call(this);
      if (choices.length) {
        lastSide = choices[Math.floor(Math.random() * choices.length)];
        this.spawnBossForSide(lastSide);
        this.meleeBossCount++;
        this.meleeBossSummoned = true;
        spawned++;
        this.log('玩家累计 50000 黄圈经验，' + SL.SIDES[lastSide].name + ' 召唤 BOSS', 'loss');
      }
    }

    if (!mods.endless && xp >= 90000 && !this.meleeBoss90k) {
      this.meleeBoss90k = true;
      if (mods.id === 'hard') {
        // 困难：红绿双方各召唤一位
        this.spawnBossForSide('red');
        this.spawnBossForSide('green');
        this.meleeBossCount += 2;
        this.meleeBossSummoned = true;
        spawned += 2;
        lastSide = 'red';
        this.log('玩家累计 90000 黄圈经验，红绿双方各召唤一位 BOSS', 'loss');
      } else {
        var choices2 = aliveChoices.call(this);
        if (choices2.length) {
          lastSide = choices2[Math.floor(Math.random() * choices2.length)];
          this.spawnBossForSide(lastSide);
          this.meleeBossCount++;
          this.meleeBossSummoned = true;
          spawned++;
          this.log('玩家累计 90000 黄圈经验，' + SL.SIDES[lastSide].name + ' 再次召唤 BOSS', 'loss');
        }
      }
    }

    if (!spawned) return false;
    return true;
  };

  // 无限模式：50k 后，AI 每次全灭重生都有随时间提高的 BOSS 召唤概率
  Game.prototype.tryMeleeRespawnBoss = function (side) {
    if (this.mode !== 'melee' || !this.meleeMods().endless || !this.meleeBoss50k) return false;
    var chance = U.clamp(0.15 + (this.time / 2700) * 0.65, 0, 0.8);
    if (Math.random() > chance) return false;
    this.spawnBossForSide(side);
    this.meleeBossCount++;
    this.log(SL.SIDES[side].name + ' 全灭重生，召唤 BOSS（概率 ' + Math.round(chance * 100) + '%）', 'loss');
    return true;
  };

  Game.prototype.checkYellowWin = function (side) {
    if (this.mode === 'lastStand') return false;
    if (this.mode === 'melee' && this.meleeMods().endless) return false;
    if (this.ended || this.winner) return false;
    var t = this.teams[side];
    if (!t || t.yellowXp < SL.YELLOW.winXp) return false;
    this.winner = side;
    this.ended = true;
    if (SL.Audio) SL.Audio.win();
    this.endReason = SL.SIDES[side].name + '通过黄圈经验达到 ' + SL.YELLOW.winXp + ' 获胜';
    this.state = side === 'blue' ? 'won' : 'lost';
    this.log(SL.SIDES[side].name + ' 通过黄圈经验获胜', 'win');
    this.feed.push({
      id: ++this.feedSeq, t: this.time, kind: 'level', ks: side, vs: null,
      xp: 0, score: 0, killer: '', victim: '',
      text: SL.SIDES[side].name + ' 黄圈经验决胜'
    });
    return true;
  };

  Game.prototype.autoFortifyAI = function (z, side) {
    if (!z || !SL.SIDES[side] || !SL.SIDES[side].ai) return 0;
    if (z.kind === 'bush' || z.kind === 'forest') return 0;
    // 只有装备了工兵装备的步兵占领该区，AI 才会形成强化工事与武器
    if (!this.zoneEngineer(z, side)) {
      z.aiFortifyEligible = false;
      return 0;
    }
    z.aiFortifyEligible = true;
    z.fortified = true;
    z.hp = z.maxHp;
    z.fortifyProgress = 0;
    z.structures = [];
    z.structure = null;
    z.rubbles = [];
    z.rubble = null;
    var count = Math.min(SL.FORT.maxStructures, this.aiFortWeaponCap());
    for (var k = 0; k < count; k++) {
      var key = SL.AI_FORT.types[Math.floor(Math.random() * SL.AI_FORT.types.length)];
      var info = this.fortCardInfo(key);
      if (!info) continue;
      z.structures.push({
        type: info.type, hp: info.hp, maxHp: info.hp,
        ammo: info.ammo, maxAmmo: info.ammo,
        cd: this.fortPhaseFor(info.type, k)
      });
    }
    z.structure = z.structures[0] || null;
    this.log(SL.SIDES[side].name + ' 工兵在 ' + z.name + ' 自动构筑工事（' + z.structures.length + ' 座）', 'loss');
    return z.structures.length;
  };

  Game.prototype.clearFortification = function (z) {
    z.fortified = false;
    z.aiFortifyEligible = false;
    z.hp = 0;
    z.fortifyProgress = 0;
    z.structure = null;
    z.structures = [];
    z.rubbles = [];
    z.rubble = null;
    z.rubbleProgress = 0;
  };

  // 兼容单结构旧数据，并统一返回工事数组
  Game.prototype.zoneStructures = function (z) {
    if (!z.structures) z.structures = [];
    if (z.structure && z.structures.indexOf(z.structure) < 0) z.structures.push(z.structure);
    if (!z.structure && z.structures.length) z.structure = z.structures[0];
    return z.structures;
  };

  // 区域内是否有该阵营的工兵步兵
  Game.prototype.zoneEngineer = function (z, side) {
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side !== side || u.type !== 'infantry') continue;
      if (U.dist2(u.x, u.y, z.x, z.y) > z.r * z.r) continue;
      for (var k = 0; k < u.items.length; k++) {
        if (u.items[k].key === 'engineer') return true;
      }
    }
    return false;
  };

  Game.prototype.updateFortifications = function (dt) {
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      if (!z.owner) continue;
      if (z.kind === 'bush' || z.kind === 'forest') {
        if (z.fortified) this.clearFortification(z);
        continue;
      }
      // AI 只有工兵占领的区才允许后续构筑/修复
      if (SL.SIDES[z.owner] && SL.SIDES[z.owner].ai && !z.aiFortifyEligible) continue;
      var eng = this.zoneEngineer(z, z.owner);
      var structs = this.zoneStructures(z);
      if (!z.rubbles) z.rubbles = [];
      if (z.rubble && z.rubbles.indexOf(z.rubble) < 0) z.rubbles.push(z.rubble);
      if (z.rubbles.length) {
        z.rubble = z.rubbles[0];
        if (eng) {
          z.rubbleProgress = Math.min(1, (z.rubbleProgress || 0) + dt / SL.FORT.rebuildTime);
          if (z.rubbleProgress >= 1) {
            var rb = z.rubbles.shift();
            if (rb.type === 'zone') {
              z.fortified = true;
              z.hp = z.maxHp;
              z.structures = [];
            } else {
              var restored = {
                type: rb.type, hp: rb.maxHp, maxHp: rb.maxHp,
                ammo: Math.max(1, Math.round((rb.maxAmmo || 0) * SL.FORT.rubbleAmmoRatio)),
                maxAmmo: rb.maxAmmo || 0
              };
              z.fortified = true;
              z.hp = z.maxHp;
              z.structures.push(restored);
              z.structure = z.structures[0];
            }
            this.log(SL.SIDES[z.owner].name + ' 工兵修复了 ' + z.name + ' 的工事', 'order');
            if (SL.Audio) SL.Audio.repair(z.x, z.y);
            z.rubble = z.rubbles[0] || null;
            z.rubbleProgress = 0;
          }
        }
        continue;
      }
      if (z.fortified) {
        if (eng) {
          z.hp = Math.min(z.maxHp, z.hp + SL.FORT.repairRate * dt);
          for (var sr = 0; sr < structs.length; sr++) {
            structs[sr].hp = Math.min(structs[sr].maxHp, structs[sr].hp + SL.FORT.repairRate * dt);
          }
        }
      } else if (eng) {
        z.fortifyProgress = Math.min(1, z.fortifyProgress + dt / SL.FORT.buildTime);
        if (z.fortifyProgress >= 1) {
          z.fortified = true;
          z.hp = z.maxHp;
          z.fortifyProgress = 0;
          this.log(SL.SIDES[z.owner].name + ' 在 ' + z.name + ' 构筑强化工事', 'order');
          if (SL.Audio) SL.Audio.build(z.x, z.y);
        }
      }
    }
  };

  // 工事独立开火：只要求区域仍被己方占领，不依赖驻守步兵
  Game.prototype.fortIntervalFor = function (type) {
    if (type === 'bunker') return SL.FORT.bunkerInterval;
    if (type === 'flak88') return SL.FORT.flakGroundInterval;
    return SL.FORT.atNestInterval;
  };

  Game.prototype.fortPhaseFor = function (type, index) {
    return (index / Math.max(1, SL.FORT.maxStructures)) * this.fortIntervalFor(type);
  };

  Game.prototype.updateStructureFire = function (dt) {
    var ammoMax = { bunker: SL.FORT.bunkerAmmo, mortar: SL.FORT.mortarAmmo, at_nest: SL.FORT.atNestAmmo, flak88: SL.FORT.flakAmmo };
    var names = { bunker: '机枪碉堡', mortar: '迫击炮阵地', at_nest: '反坦克炮阵地', flak88: '88防空炮阵地' };
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      if (!z.owner) continue;
      var structs = this.zoneStructures(z);
      for (var si = 0; si < structs.length; si++) {
        var st = structs[si];
        if (!st || st.hp <= 0) continue;
        if (st.ammo === undefined) { st.ammo = ammoMax[st.type] || 0; st.maxAmmo = st.ammo; }
        // 每个工事独立相位，避免同型工事永远同时开火
        if (st.cd === undefined) st.cd = this.fortPhaseFor(st.type, si);
        // 迫击炮阵地的 3 门炮按顺序陆续开火
        if (st.mortarQueue && st.mortarQueue.length) {
          while (st.mortarQueue.length && st.mortarQueue[0].at <= this.time) {
            var mq = st.mortarQueue.shift();
            var msrc = { side: z.owner, name: '迫击炮阵地', kills: 0, score: 0 };
            var mdist = U.dist(z.x, z.y, mq.tx, mq.ty);
            if (SL.Audio) SL.Audio.shot({ dmg: 55, kind: 'shell' }, { type: 'structure' }, false, z.x, z.y);
            this.shells.push({
              x0: z.x, y0: z.y, x1: mq.tx, y1: mq.ty,
              t: 0,
              dur: U.clamp(mdist / 90 + 0.95, 1.2, 3.2),
              dmg: 55, radius: SL.FORT.mortarSplash || 40, ap: 0.4, mortar: true,
              side: z.owner, source: msrc
            });
          }
        }
        st.cd = (st.cd || 0) - dt;
        if (st.cd > 0 || st.ammo <= 0) continue;
        var side = z.owner;
        var source = { side: side, name: names[st.type] || '工事', kills: 0, score: 0 };

        if (st.type === 'flak88') {
          var plane = null, pd = SL.FORT.flakAirRange;
          for (var p = 0; p < this.planes.length; p++) {
            var pl = this.planes[p];
            if (!pl || pl.side === side || pl.hp <= 0) continue;
            var dpl = U.dist(z.x, z.y, pl.x, pl.y);
            if (!this.canSee(side, pl.x, pl.y)) continue;
            if (dpl <= pd) { pd = dpl; plane = pl; }
          }
          if (plane) {
            st.ammo--;
            if (SL.Audio) SL.Audio.shot({ dmg: 90, label: '88' }, { type: 'structure' }, false, z.x, z.y);
            st.cd = SL.FORT.flakAirInterval;
            this.effects.push({ kind: 'tracer', x1: z.x, y1: z.y, x2: plane.x, y2: plane.y, t: 0, dur: 0.1, side: side, heavy: true });
            var pacc = 0.9 - 0.2 * U.clamp(pd / SL.FORT.flakAirRange, 0, 1);
            if (Math.random() <= pacc) this.damagePlane(plane, SL.FORT.flakAirDmg, source);
            continue;
          }
        }

        var range = st.type === 'bunker' ? SL.FORT.bunkerRange : st.type === 'mortar' ? SL.FORT.mortarRange :
          st.type === 'at_nest' ? SL.FORT.atNestRange : SL.FORT.flakGroundRange;
        var minR = st.type === 'mortar' ? 30 : 0;
        var target = null, bestScore = Infinity;
        for (var u = 0; u < this.units.length; u++) {
          var e = this.units[u];
          if (!e.alive || e.side === side) continue;
          if (!this.unitVisibleTo(side, e)) continue;
          var d = U.dist(z.x, z.y, e.x, e.y);
          if (d > range || d < minR) continue;
          var tscore = d + (st.type === 'mortar' ? (e.def.armor ? 900 : -260) : 0);
          if (tscore < bestScore) { target = e; bestScore = tscore; }
        }
        if (!target) continue;
        var td = U.dist(z.x, z.y, target.x, target.y);
        if (st.type === 'mortar') {
          var tubes = SL.FORT.mortarTubes || 3;
          if (st.ammo < tubes) continue;
          st.ammo -= tubes;
        } else {
          st.ammo--;
        }
        if (SL.Audio && st.type !== 'mortar') {
          SL.Audio.shot({ dmg: st.type === 'at_nest' ? 120 : st.type === 'flak88' ? 90 : 12, label: st.type === 'at_nest' ? 'Pak' : st.type === 'flak88' ? '88' : 'MG' }, { type: 'structure' }, false, z.x, z.y);
        }

        if (st.type === 'at_nest') {
          st.cd = SL.FORT.atNestInterval;
          var aacc = 0.88 - 0.3 * U.clamp(td / range, 0, 1);
          this.effects.push({ kind: 'tracer', x1: z.x, y1: z.y, x2: target.x, y2: target.y, t: 0, dur: 0.1, side: side, heavy: true });
          if (Math.random() <= aacc) this.damage(target, SL.FORT.atNestDmg, source, SL.FORT.atNestAP);
        } else if (st.type === 'flak88') {
          st.cd = SL.FORT.flakGroundInterval;
          var facc = 0.85 - 0.3 * U.clamp(td / range, 0, 1);
          this.effects.push({ kind: 'tracer', x1: z.x, y1: z.y, x2: target.x, y2: target.y, t: 0, dur: 0.1, side: side, heavy: true });
          if (Math.random() <= facc) this.damage(target, SL.FORT.flakGroundDmg, source, 1.2);
        } else if (st.type === 'bunker') {
          st.cd = SL.FORT.bunkerInterval;
          var bacc = 0.8 - 0.25 * U.clamp(td / range, 0, 1);
          this.effects.push({ kind: 'tracer', x1: z.x, y1: z.y, x2: target.x, y2: target.y, t: 0, dur: 0.08, side: side, heavy: false });
          var bdmg = 12;
          if (target.type === 'infantry' && target.cover.zone && target.cover.zone.fortified) bdmg *= SL.FORT.mgDamageVsGarrison;
          if (Math.random() <= bacc) this.damage(target, bdmg, source, 0.25);
        } else if (st.type === 'mortar') {
          st.cd = 4.5;
          st.mortarQueue = [];
          var mtubes = SL.FORT.mortarTubes || 3;
          var mspread = SL.FORT.mortarScatter || 50;
          for (var mt = 0; mt < mtubes; mt++) {
            var mang = Math.random() * Math.PI * 2;
            var mrad = Math.sqrt(Math.random()) * mspread;
            st.mortarQueue.push({
              at: this.time + mt * (SL.FORT.mortarDelay || 0.45),
              tx: target.x + Math.cos(mang) * mrad,
              ty: target.y + Math.sin(mang) * mrad
            });
          }
        }
      }
    }
  };
  Game.prototype.commandGrenade = function (units, x, y) {
    var target = this.enemyAt(x, y, 26);
    if (!target) return 0;
    var n = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || !u.alive || u.type !== 'infantry' || u.side !== 'blue') continue;
      var at = null, gr = null, bz = null;
      for (var k = 0; k < u.items.length; k++) {
        var it = u.items[k];
        if (it.cd > 0 || it.ammo <= 0) continue;
        if (it.key === 'atgrenade') at = it;
        if (it.key === 'grenade') gr = it;
        if (it.key === 'bazooka') bz = it;
      }
      var d = U.dist(u.x, u.y, target.x, target.y);
      var pick = null;
      if (target.def.armor && bz && d <= SL.EQUIP.bazooka.weapon.range) pick = bz;
      else if (target.def.armor && at && d <= SL.EQUIP.atgrenade.weapon.range) pick = at;
      else if (gr && d <= SL.EQUIP.grenade.weapon.range) pick = gr;
      if (!pick) continue;
      if (this.fire(u, target, SL.EQUIP[pick.key].weapon, pick)) n++;
    }
    return n;
  };

  Game.prototype.commandGrenadeNearest = function (units) {
    var n = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || !u.alive || u.type !== 'infantry' || u.side !== 'blue') continue;
      var at = null, gr = null, bz = null;
      for (var k = 0; k < u.items.length; k++) {
        var it = u.items[k];
        if (it.cd > 0 || it.ammo <= 0) continue;
        if (it.key === 'atgrenade') at = it;
        if (it.key === 'grenade') gr = it;
        if (it.key === 'bazooka') bz = it;
      }
      if (!at && !gr && !bz) continue;
      var grenadeRange = Math.max(SL.EQUIP.grenade.weapon.range, SL.EQUIP.atgrenade.weapon.range,
        bz ? SL.EQUIP.bazooka.weapon.range : 0);
      var best = null, bestD = Infinity;
      for (var e = 0; e < this.units.length; e++) {
        var target = this.units[e];
        if (!target.alive || target.side === 'blue') continue;
        if (!this.unitVisibleTo('blue', target)) continue;
        var d = U.dist(u.x, u.y, target.x, target.y);
        if (d <= grenadeRange && d < bestD) { best = target; bestD = d; }
      }
      if (!best) continue;
      var pick = null;
      if (best.def.armor && bz && bestD <= SL.EQUIP.bazooka.weapon.range) pick = bz;
      else if (best.def.armor && at && bestD <= SL.EQUIP.atgrenade.weapon.range) pick = at;
      else if (gr && bestD <= SL.EQUIP.grenade.weapon.range) pick = gr;
      if (!pick) continue;
      if (this.fire(u, best, SL.EQUIP[pick.key].weapon, pick)) n++;
    }
    return n;
  };

  Game.prototype.commandSniperHide = function (units, x, y) {
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || !u.alive || u.type !== 'infantry' || u.side !== 'blue') continue;
      var item = null;
      for (var k = 0; k < u.items.length; k++) {
        if (u.items[k].key === 'sniper' && (u.items[k].uses === undefined || u.items[k].uses > 0)) {
          item = u.items[k]; break;
        }
      }
      if (!item) continue;
      if (U.dist(u.x, u.y, x, y) > SL.SNIPER.spotRange) continue;
      if (T.zoneAt(x, y)) continue;
      item.uses = (item.uses === undefined ? 1 : item.uses) - 1;
      T.addZone({
        id: 'sniper_bush_' + (++nextId), name: '狙击隐蔽', kind: 'bush',
        x: x, y: y, r: SL.SNIPER.bushRadius, owner: null, built: true, tempBush: true
      });
      if (SL.Render) SL.Render.minimapCache = null;
      this.log(u.name + ' 建立狙击隐蔽灌木', 'order');
      this.fxText(x, y - 12, '狙击隐蔽', '#a8d890', u.side);
      return 1;
    }
    return 0;
  };

  Game.prototype.commandRecon = function (units, x, y) {
    var n = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || !u.alive || u.type !== 'command') continue;
      this.updateCover(u);
      var maxR = SL.COMMAND_RECON.range * (1 + (u.cover.rangeBonus || 0));
      if (U.dist(u.x, u.y, x, y) > maxR) continue;
      this.recons = this.recons.filter(function (r) { return !(r.command && r.source === u.id); });
      u.order = null;
      u.moving = false;
      this.recons.push({
        x: x, y: y, side: u.side, r: SL.COMMAND_RECON.radius,
        until: Infinity, source: u.id, command: true
      });
      n++;
    }
    if (n > 0) this.log('指挥车建立持续侦察区', 'order');
    return n;
  };

  Game.prototype.commandRocketStrike = function (units, x, y) {
    var n = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || !u.alive || u.type !== 'rocket_arty') continue;
      u.order = { kind: 'rocketStrike', x: x, y: y };
      u.target = null;
      u.moving = false;
      n++;
    }
    if (n > 0) this.log('自行火箭炮准备齐射', 'order');
    return n;
  };

  Game.prototype.commandSuppress = function (units, x, y) {
    var n = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || (u.type !== 'artillery' && u.type !== 'heavy_arty')) continue;
      u.order = { kind: 'suppress', x: x, y: y, until: this.time + SL.FORT.suppressDuration };
      u.target = null;
      n++;
    }
    return n;
  };

  Game.prototype.fireAtPoint = function (u, x, y) {
    var fake = { x: x, y: y, def: { armor: 0 }, cover: { evade: 0 } };
    this.fire(u, fake, u.def.weapon, null);
  };

  // 火炮落点对强化工事/碉堡的伤害：先毁建筑，再毁强化区
  Game.prototype.damageFortifications = function (x, y, dmg, radius) {
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      if (!z.fortified) continue;
      var d = U.dist(x, y, z.x, z.y);
      if (d > z.r + radius) continue;
      var falloff = 1 - 0.5 * Math.min(1, d / (z.r + radius));
      var applied = dmg * falloff * SL.FORT.dmgMult;
      var structs = this.zoneStructures(z);
      if (structs.length) {
        var st = structs[0];
        st.hp -= applied;
        if (st.hp <= 0) {
          var stName = { bunker: '机枪碉堡', mortar: '迫击炮阵地', at_nest: '反坦克炮阵地', flak88: '88防空炮阵地' }[st.type] || '工事';
          if (!z.rubbles) z.rubbles = [];
          z.rubbles.push({
            type: st.type, name: stName,
            maxHp: st.maxHp,
            maxAmmo: st.maxAmmo || st.ammo || 0,
            ammo: st.ammo || 0
          });
          z.rubble = z.rubbles[0];
          var ri = z.structures.indexOf(st);
          if (ri >= 0) z.structures.splice(ri, 1);
          z.structure = z.structures[0] || null;
          z.rubbleProgress = 0;
          this.log(z.name + ' 的' + stName + '被摧毁，残骸可修复', 'loss');
        }
      } else {
        z.hp -= applied;
        if (z.hp <= 0) {
          z.fortified = false;
          z.hp = 0;
          z.fortifyProgress = 0;
          z.structures = [];
          z.rubbles = [];
          z.structure = null;
          z.rubble = { type: 'zone', name: '强化工事' };
          z.rubbleProgress = 0;
          this.log(z.name + ' 的强化工事被摧毁，残骸可修复', 'loss');
        }
      }
    }
  };

  Game.prototype.update = function (dt) {
    var i, u;
    if (this.state !== 'playing') {
      this.updateEffects(dt);
      this.updateShells(dt);
      return;
    }
    this.time += dt;

    for (i = 0; i < this.units.length; i++) {
      u = this.units[i];
      if (!u.alive) continue;
      u.cd -= dt;
      if (u.def.weapon.mag && u.magLeft <= 0 && u.cd <= 0) u.magLeft = u.def.weapon.mag;
      u.scan -= dt;
      if (u.flash > 0) u.flash -= dt;
      if (u.hitFlash > 0) u.hitFlash -= dt;
      for (var it = 0; it < u.items.length; it++) u.items[it].cd -= dt;
      // 应急医疗包：自动回血，医疗量耗尽后消失
      if (u.type === 'infantry' && u.hp < u.maxHp) {
        for (var mi = 0; mi < u.items.length; mi++) {
          var med = u.items[mi];
          if (med.key !== 'medkit' || !(med.hp > 0)) continue;
          var heal = Math.min(u.maxHp - u.hp, med.hp, SL.EQUIP.medkit.healRate * dt);
          u.hp += heal;
          med.hp -= heal;
          if (med.hp <= 0.001) {
            u.items.splice(mi, 1);
            this.log(u.name + ' 的应急医疗包耗尽', 'loss');
          }
          break;
        }
      }
      u.coverTimer -= dt;
      if (u.coverTimer <= 0) {
        u.coverTimer = 0.22;
        this.updateCover(u);
      }
    }

    this.updateDrops(dt);
    this.updateZones(dt);
    this.updateFortifications(dt);
    this.updateStructureFire(dt);
    if (!this.testMode) {
      this.updateYellow(dt);
      if (this.mode === 'lastStand') this.updateDefense(dt);
      this.updateAI(dt);
    }
    this.updateStealth(dt);

    for (i = 0; i < this.units.length; i++) {
      u = this.units[i];
      if (!u.alive) continue;
      this.updateUnit(u, dt);
    }
    this.updateRocketQueues(dt);
     this.resolveSeparation();
+    this.updateMines(dt);
     this.updateShells(dt);
    this.updateBombs(dt);
    this.updateEffects(dt);
    this.updateStrikes(dt);
    this.updateSupplies(dt);
    this.updatePlanes(dt);
    this.updateRecons();
    this.updateTeams(dt);
    if (!this.testMode && this.mode !== 'lastStand') this.updateNeutrals(dt);

    // 占领区持续提供少量连队经验（上限按 6 个区计算）
    this.zoneXpTimer -= dt;
    if (this.zoneXpTimer <= 0) {
      this.zoneXpTimer = 1;
      var owned = { blue: 0, red: 0, green: 0 };
      for (var zi = 0; zi < T.zones.length; zi++) {
        var zo = T.zones[zi];
        if (!zo.owner) continue;
        // 只有当前仍被该阵营单位驻守的占领区才给经验；离开即停止，重新进入/再次占领后恢复
        var held = false;
        for (var ui = 0; ui < this.units.length; ui++) {
          var uu = this.units[ui];
          if (!uu.alive || uu.side !== zo.owner) continue;
          if (U.dist2(uu.x, uu.y, zo.x, zo.y) <= zo.r * zo.r) { held = true; break; }
        }
        if (held) owned[zo.owner] = (owned[zo.owner] || 0) + 1;
      }
      for (var sd in owned) {
        // 已被全灭、等待重生的阵营不再从占领区获得经验
        if (owned[sd] > 0 && this.aliveCount(sd) > 0) {
          this.addXp(sd, Math.min(owned[sd], SL.XP.zoneMax) * SL.XP.zoneRate);
        }
      }
    }

    if (this.fogEnabled !== false) {
      this.fogTimer -= dt;
      if (this.fogTimer <= 0) {
        this.computeFog();
        this.fogTimer = 0.14;
      }
    }
  };

  Game.prototype.updateUnit = function (u, dt) {
    var def = u.def;
    if (u.frozenTarget) return;

    if (u.bossKind === 'super') {
      this.updateBossSuper(u, dt);
      return;
    }
    if (u.bossKind === 'ghost') {
      if (u.ghostPhase === 'approach') {
        this.updateBossGhost(u, dt);
        return;
      }
      this.updateBossGhost(u, dt);
    }

    // 防空车优先对空：自由开火模式下自动射击敌方飞机
    if (u.type === 'aa' && (u.fireMode || 'free') === 'free') {
      var plane = this.findEnemyPlane(u);
      if (plane) {
        u.target = null;
        u.moving = false;
        u.engaging = true;
        if (u.cd <= 0 && u.ammo > 0 && u.magLeft > 0) {
          u.magLeft--;
          u.cd = u.magLeft <= 0 ? u.def.weapon.reload : 0.12;
          u.ammo--;
          u.flash = 0.06;
          u.lastFire = this.time;
          var pa = U.angle(u.x, u.y, plane.x, plane.y);
          u.turret = pa;
          u.facing = pa;
          this.effects.push({
            kind: 'tracer', x1: u.x, y1: u.y, x2: plane.x, y2: plane.y,
            t: 0, dur: 0.08, side: u.side, heavy: false
          });
          var aaDist = U.dist(u.x, u.y, plane.x, plane.y);
          var aaAcc = 0.95 - 0.2 * U.clamp(aaDist / (u.def.aaRange || 600), 0, 1);
          if (Math.random() <= aaAcc) {
            this.damagePlane(plane, u.def.airDmg || 8, u);
          }
        }
        return;
      }
    }

    var artilleryCfg = SL.ARTILLERY[u.type];
    if (u.order && u.order.kind === 'rocketStrike' && u.type === 'rocket_arty') {
      var ro = u.order;
      var rd = U.dist(u.x, u.y, ro.x, ro.y);
      var ra = U.angle(u.x, u.y, ro.x, ro.y);
      u.turret = U.lerpAngle(u.turret, ra, Math.min(1, dt * 2.6));
      if (u.ammo < (u.def.weapon.rockets || 1)) {
        u.order = null;
        u.target = null;
        u.moving = false;
        return;
      }
      if (rd > u.maxRangeNow * 0.92) {
        u.moving = false;
        this.moveToward(u, ro.x, ro.y, dt);
      } else {
        u.moving = false;
        u.facing = U.lerpAngle(u.facing, ra, Math.min(1, dt * 3));
        if (u.cd <= 0) {
          this.fireAtPoint(u, ro.x, ro.y);
          u.order = null;
        }
      }
      u.engaging = rd <= u.maxRangeNow;
      return;
    }
    if (artilleryCfg) {
      var needsMove = false;
      if (u.order) {
        if (u.order.kind === 'move' || u.order.kind === 'attackMove') {
          needsMove = U.dist(u.x, u.y, u.order.x, u.order.y) > 2;
        } else if (u.order.kind === 'attack' && u.order.target && u.order.target.alive) {
          needsMove = U.dist(u.x, u.y, u.order.target.x, u.order.target.y) > u.maxRangeNow * 0.88;
        } else if (u.order.kind === 'suppress') {
          needsMove = U.dist(u.x, u.y, u.order.x, u.order.y) > u.maxRangeNow * 0.9;
        }
      }
      if (needsMove && (u.deployState === 'deployed' || u.deployState === 'deploying')) {
        u.deployState = 'packing';
        u.deployTimer = artilleryCfg.pack;
        u.target = null;
      }
      if (u.deployState === 'packing' || u.deployState === 'deploying') {
        u.deployTimer -= dt;
        u.target = null;
        u.moving = false;
        u.engaging = false;
        u.sprinting = false;
        if (u.deployTimer <= 0) {
          u.deployState = u.deployState === 'packing' ? 'moving' : 'deployed';
          u.deployTimer = 0;
        }
        return;
      }
      if (u.deployState === 'moving') u.target = null;
    }

    var suppressing = !!(u.order && u.order.kind === 'suppress');

    // 被障碍阻挡后转为拆除障碍
    if (u.order && u.order.kind === 'attackBarrier') {
      var bar = u.order.target;
      if (!bar || !bar.alive) {
        var resume = u.order.resume;
        u.order = resume ? { kind: 'move', x: resume.x, y: resume.y, speedCap: 0 } : null;
        u.target = null;
        u.path = null;
      } else {
        var bd = U.dist(u.x, u.y, bar.x, bar.y);
        var bRange = Math.max(20, u.maxRangeNow || u.def.range || 20);
        u.engaging = bd <= bRange;
        u.target = bar;
        if (bd > bRange * 0.9) {
          this.moveToward(u, bar.x, bar.y, dt);
        } else {
          u.moving = false;
          var ba = U.angle(u.x, u.y, bar.x, bar.y);
          u.turret = U.lerpAngle(u.turret, ba, Math.min(1, dt * 2.6));
          u.facing = U.lerpAngle(u.facing, ba, Math.min(1, dt * 3));
          if ((u.fireMode || 'free') !== 'hold' && u.cd <= 0) this.tryFire(u, bd);
        }
        return;
      }
    }

    var locked = (u.order && u.order.kind === 'attack' && u.order.target && u.order.target.alive)
      ? u.order.target : null;

    if (artilleryCfg && u.deployState === 'moving') {
      u.target = null;
    } else if (suppressing) {
      u.target = null;
      if (this.time >= u.order.until) u.order = null;
    } else if (u.scan <= 0) {
      u.scan = 0.28;
      var fm = u.fireMode || 'free';
      if (fm === 'hold') {
        u.target = null;
      } else if (locked && (locked.isBarrier || this.unitVisibleTo(u.side, locked))) {
        u.target = locked;
      } else if (fm === 'return') {
        var attacker = u.lastAttacker;
        if (attacker && attacker.alive && this.unitVisibleTo(u.side, attacker) &&
          this.time - (u.lastHitAt == null ? -99 : u.lastHitAt) < 4 &&
          U.dist(u.x, u.y, attacker.x, attacker.y) <= Math.max(def.vision, u.maxRangeNow) * 1.05) {
          u.target = attacker;
        } else {
          u.target = null;
        }
      } else {
        u.target = this.findTarget(u);
      }
    }
    if (u.target) {
      var td = U.dist(u.x, u.y, u.target.x, u.target.y);
      var limit = (u.target === locked) ? Math.max(def.vision, u.maxRangeNow) : u.maxRangeNow * 1.05;
      if (!u.target.alive || (!u.target.isBarrier && !this.unitVisibleTo(u.side, u.target)) || td > limit) {
        u.target = null;
      }
    }

    // 体力与急行军
    var sprinting = false;
    if (u.order && u.order.sprint && def.canSprint && u.stamina > 0.5) {
      sprinting = true;
      if (u.stamina <= 0.5) {
        u.order.sprint = false;
        sprinting = false;
      }
    }
    if (!sprinting) u.stamina = Math.min(100, u.stamina + CB.staminaRegen * dt);
    u.sprinting = sprinting;

    // 指令
    u.moving = false;
    if (u.order) {
      if (u.order.kind === 'suppress') {
        var sd = U.dist(u.x, u.y, u.order.x, u.order.y);
        if (this.time >= u.order.until) {
          u.order = null;
        } else if (sd > u.maxRangeNow * 0.92) {
          this.moveToward(u, u.order.x, u.order.y, dt);
        } else if (sd < (def.minRange || 0) + 15) {
          var ax = u.x - u.order.x, ay = u.y - u.order.y;
          var L = Math.hypot(ax, ay) || 1;
          this.moveToward(u, u.x + ax / L * 40, u.y + ay / L * 40, dt);
        }
      } else if (u.order.kind === 'attack') {
        var tg = u.order.target;
        if (!tg || !tg.alive) {
          u.order = null;
        } else {
          var dd = U.dist(u.x, u.y, tg.x, tg.y);
          if (dd > u.maxRangeNow * 0.9 && (tg.isBarrier || this.unitVisibleTo(u.side, tg))) {
            this.moveToward(u, tg.x, tg.y, dt);
          }
        }
      } else {
        var d = U.dist(u.x, u.y, u.order.x, u.order.y);
        if (d < 3) {
          u.order = null;
        } else {
          this.moveToward(u, u.order.x, u.order.y, dt);
        }
      }
    }

    // 火炮移动优先：未走完移动命令前不索敌、不开火
    if (artilleryCfg && u.deployState === 'moving') {
      if (!u.order || !u.moving) {
        u.deployState = 'deploying';
        u.deployTimer = artilleryCfg.deploy;
        u.moving = false;
        u.engaging = false;
        u.target = null;
      }
      return;
    }

    // 交火时减速
    var targetDist = u.target ? U.dist(u.x, u.y, u.target.x, u.target.y) : Infinity;
    u.engaging = !!u.target && targetDist <= u.maxRangeNow;
    u.idle = u.target ? 0 : u.idle + dt;

    if (u.target) {
      var ta = U.angle(u.x, u.y, u.target.x, u.target.y);
      u.turret = U.lerpAngle(u.turret, ta, Math.min(1, dt * 2.6));
      if (!u.moving) u.facing = U.lerpAngle(u.facing, ta, Math.min(1, dt * 3));
      if (def.weapon.kind === 'shell' && u.order && u.order.kind !== 'attack' && targetDist <= u.rangeNow) {
        u.order = null;      // 火炮进入射程后停车开火
        u.moving = false;
      }
      if (!u.sprinting && (u.fireMode || 'free') !== 'hold' && targetDist <= u.maxRangeNow) {
        this.tryFire(u, targetDist);
      }
    } else {
      u.turret = U.lerpAngle(u.turret, u.facing, Math.min(1, dt * 1.4));
    }

    // 压制：朝目标点持续射击，不索敌
    if (u.order && u.order.kind === 'suppress') {
      var sdist = U.dist(u.x, u.y, u.order.x, u.order.y);
      var sa = U.angle(u.x, u.y, u.order.x, u.order.y);
      u.turret = U.lerpAngle(u.turret, sa, Math.min(1, dt * 2.6));
      if (!u.moving) u.facing = U.lerpAngle(u.facing, sa, Math.min(1, dt * 3));
      var minR = def.minRange || 0;
      if (this.time < u.order.until && sdist <= u.maxRangeNow && sdist >= minR && !u.sprinting && u.cd <= 0) {
        this.fireAtPoint(u, u.order.x, u.order.y);
      }
    }

    // 急行军的尘土
    if (u.sprinting && u.moving) {
      u.dustT -= dt;
      if (u.dustT <= 0) {
        u.dustT = 0.16;
        this.effects.push({
          kind: 'dust', x: u.x + (Math.random() - 0.5) * 6, y: u.y + (Math.random() - 0.5) * 6,
          t: 0, dur: 0.7, size: 3 + Math.random() * 2, side: u.side
        });
      }
    }

    // 工程车：行驶中按当前模式布设障碍
    this.updateEngineerVehicle(u);

    // 所有通往目标的路线都被障碍封死时，转为拆除敌方障碍
    if (u.noPath) {
      var resumeOrder = u.order;
      var rx = u.noPathX, ry = u.noPathY;
      u.noPath = false;
      if (resumeOrder && resumeOrder.kind !== 'attackBarrier' && this.tryBreakBarrier(u, rx, ry)) {
        u.order.resume = resumeOrder;
      }
    }

    var ms = SL.CONFIG.mapSize;
    u.x = U.clamp(u.x, 8, ms - 8);
    u.y = U.clamp(u.y, 8, ms - 8);
  };

  Game.prototype.moveToward = function (u, tx, ty, dt) {
    u.noPath = false;
    // 有绕行路径时沿路径点行进
    if (u.path && u.path.length) {
      if (!u.pathGoal || U.dist(u.pathGoal.x, u.pathGoal.y, tx, ty) > 6) {
        u.path = null;
      } else {
        var wp = u.path[0];
        if (U.dist(u.x, u.y, wp.x, wp.y) < 4) {
          u.path.shift();
          if (!u.path.length) { u.path = null; return; }
          wp = u.path[0];
        }
        this.moveTowardDirect(u, wp.x, wp.y, dt);
        return;
      }
    }
    var dx = tx - u.x, dy = ty - u.y;
    var d = U.len(dx, dy);
    if (d < 0.001) return;
    var speed = u.def.speed * T.speedAt(u.x, u.y, u.type);
    if (u.engaging) speed *= 0.55;
    if (u.sprinting) speed *= CB.sprintMul;
    if (u.order && u.order.speedCap > 0) speed = Math.min(speed, u.order.speedCap);
    var step = Math.min(d, speed * dt);
    var nx = u.x + dx / d * step, ny = u.y + dy / d * step;
    // 载具可碾压铁丝网；先处理碾压，再判断是否仍被拒马阻挡
    if (this.isVehicleUnit(u)) this.crushWireOnSegment(u, u.x, u.y, nx, ny);
    if (this.segmentBlocked(u, u.x, u.y, nx, ny)) {
      if (!u.pathCooldown || this.time >= u.pathCooldown) {
        u.pathCooldown = this.time + 1.2;
        var path = this.findPath(u, tx, ty);
        if (path && path.length) {
          u.path = path;
          u.pathGoal = { x: tx, y: ty };
          var first = u.path[0];
          this.moveTowardDirect(u, first.x, first.y, dt);
          return;
        }
      }
      u.noPath = true;
      u.noPathX = tx; u.noPathY = ty;
      return;
    }
    this.moveTowardDirect(u, tx, ty, dt);
  };

  Game.prototype.moveTowardDirect = function (u, tx, ty, dt) {
    var dx = tx - u.x, dy = ty - u.y;
    var d = U.len(dx, dy);
    if (d < 0.001) return;
    var mul = T.speedAt(u.x, u.y, u.type);
    var speed = u.def.speed * mul;
    if (u.engaging) speed *= 0.55;
    if (u.sprinting) speed *= CB.sprintMul;
    if (u.order && u.order.speedCap > 0) speed = Math.min(speed, u.order.speedCap);
    var step = Math.min(d, speed * dt);
    u.x += dx / d * step;
    u.y += dy / d * step;
    // 指挥车移动后原侦察区失效，需要重新侦察
    if (u.type === 'command' && step > 0.01 && this.recons.length) {
      this.recons = this.recons.filter(function (r) { return !(r.command && r.source === u.id); });
    }
    // 急行军按实际移动距离扣体力：满体力正好约 300m
    if (u.sprinting) {
      u.stamina = Math.max(0, u.stamina - step * (100 / CB.sprintMeters));
      if (u.stamina <= 0.5 && u.order) {
        u.order.sprint = false;
        u.sprinting = false;
      }
    }
    u.facing = U.lerpAngle(u.facing, Math.atan2(dy, dx), Math.min(1, dt * 5));
    u.moving = true;
  };

  /* ---------------- 工程车 / 障碍 ---------------- */

  Game.prototype.isVehicleUnit = function (u) {
    return !!u && u.type !== 'infantry' && u.type !== 'target' &&
      u.type !== 'armor_target' && u.type !== 'heavy_target';
  };

  Game.prototype.barrierById = function (id) {
    for (var i = 0; i < this.barriers.length; i++) {
      if (this.barriers[i].id === id) return this.barriers[i];
    }
    return null;
  };

  Game.prototype.barrierSegments = function () {
    var out = [];
    for (var i = 0; i < this.barriers.length; i++) {
      var a = this.barriers[i];
      if (!a.alive) continue;
      for (var k = 0; k < a.links.length; k++) {
        var b = this.barrierById(a.links[k]);
        if (!b || !b.alive || b.id < a.id) continue;
        out.push({ a: a, b: b, type: a.type });
      }
    }
    return out;
  };

  Game.prototype.barrierBlocksUnit = function (u, type) {
    if (u.type === 'infantry' && type === 'wire') return true;
    if (this.isVehicleUnit(u) && type === 'hedgehog') return true;
    return false;
  };

  Game.prototype.segmentBlocked = function (u, x0, y0, x1, y1) {
    var segs = this.barrierSegments();
    for (var i = 0; i < segs.length; i++) {
      if (!this.barrierBlocksUnit(u, segs[i].type)) continue;
      if (segmentsIntersect(x0, y0, x1, y1, segs[i].a.x, segs[i].a.y, segs[i].b.x, segs[i].b.y)) return true;
    }
    return false;
  };

  Game.prototype.crushWireOnSegment = function (u, x0, y0, x1, y1) {
    var segs = this.barrierSegments();
    var hit = [];
    for (var i = 0; i < segs.length; i++) {
      if (segs[i].type !== 'wire') continue;
      if (segmentsIntersect(x0, y0, x1, y1, segs[i].a.x, segs[i].a.y, segs[i].b.x, segs[i].b.y)) {
        hit.push(segs[i].a, segs[i].b);
      }
    }
    for (var k = 0; k < hit.length; k++) {
      if (hit[k].alive) this.destroyBarrier(hit[k], u, true);
    }
  };

  Game.prototype.destroyBarrier = function (node, source, crushed) {
    if (!node || !node.alive) return;
    node.alive = false;
    node.hp = 0;
    node.links = [];
    this.barrierVersion++;
    this.fxText(node.x, node.y - 8, crushed ? '铁丝网被碾断' : '障碍被摧毁', '#e8c47a');
    if (source && source.side === 'blue') this.log('摧毁 ' + (node.type === 'wire' ? '铁丝网' : '拒马'), 'order');
  };

  Game.prototype.hitBarrier = function (node, amount, source) {
    if (!node || !node.alive) return;
    node.hp -= amount;
    node.hitFlash = 0.16;
    this.fxText(node.x + (Math.random() - 0.5) * 8, node.y - 8,
      '-' + Math.max(1, Math.round(amount)), '#ffe08a');
    if (node.hp <= 0) this.destroyBarrier(node, source, false);
  };

  Game.prototype.damageBarrierFromArea = function (x, y, radius, dmg, source) {
    for (var i = 0; i < this.barriers.length; i++) {
      var b = this.barriers[i];
      if (!b.alive) continue;
      var d = U.dist(x, y, b.x, b.y);
      if (d > radius) continue;
      this.hitBarrier(b, dmg * (1 - 0.65 * (d / Math.max(1, radius))), source);
    }
  };

  Game.prototype.layBarrier = function (u, type) {
    if (this.barriers.length >= 240) return null;
    var node = {
      id: nextId++, isBarrier: true, type: type, x: u.x, y: u.y, side: u.side,
      hp: SL.ENGINEER.nodeHp, maxHp: SL.ENGINEER.nodeHp, alive: true,
      links: [], hitFlash: 0, name: type === 'wire' ? '铁丝网' : '拒马',
      def: { armor: 0 }, cover: { dr: 0, evade: 0 }
    };
    var prev = u.engLastNode ? this.barrierById(u.engLastNode) : null;
    if (prev && prev.alive && prev.side === u.side && prev.type === type &&
      U.dist(prev.x, prev.y, node.x, node.y) <= SL.ENGINEER.connectRange) {
      node.links.push(prev.id);
      prev.links.push(node.id);
    }
    u.engLastNode = node.id;
    this.barriers.push(node);
    this.barrierVersion++;
    return node;
  };

  Game.prototype.layMine = function (u, type) {
    if (this.mines.length >= 260) return null;
    var mine = {
      id: nextId++, type: type, x: u.x, y: u.y, side: u.side, alive: true,
      trigger: SL.ENGINEER.mineTrigger,
      radius: SL.ENGINEER.mineSplash[type] || 34,
      damage: SL.ENGINEER.mineDamage[type] || 190,
      armT: this.time + 1.5
    };
    this.mines.push(mine);
    return mine;
  };

  Game.prototype.setEngineerMode = function (units, mode) {
    var changed = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u.alive || u.type !== 'engineer_vehicle') continue;
      u.engineerMode = (u.engineerMode === mode) ? null : mode;
      u.engLastX = u.x; u.engLastY = u.y;
      u.engLastNode = null;
      changed++;
    }
    return changed;
  };

  Game.prototype.updateEngineerVehicle = function (u) {
    if (!u.alive || u.type !== 'engineer_vehicle') return;
    var mode = u.engineerMode;
    if (!mode) { u.engLastX = u.x; u.engLastY = u.y; return; }
    var gap = SL.ENGINEER.layGap[mode] || 20;
    var cost = SL.ENGINEER.cost[mode] || 10;
    if (U.dist(u.x, u.y, u.engLastX, u.engLastY) < gap) return;
    u.engLastX = u.x; u.engLastY = u.y;
    if (u.engineerValue < cost) return;
    var made = null;
    if (mode === 'wire' || mode === 'hedgehog') made = this.layBarrier(u, mode);
    else made = this.layMine(u, mode);
    if (!made) return;
    u.engineerValue = Math.max(0, u.engineerValue - cost);
    this.fxText(u.x, u.y - 14,
      mode === 'wire' ? '布设铁丝网' : (mode === 'hedgehog' ? '布设拒马' : '布设地雷'),
      '#e8c47a', u.side);
  };

  Game.prototype.updateMines = function (dt) {
    for (var i = this.mines.length - 1; i >= 0; i--) {
      var m = this.mines[i];
      if (!m.alive) { this.mines.splice(i, 1); continue; }
      if (this.time < m.armT) continue;
      var victim = null;
      for (var k = 0; k < this.units.length; k++) {
        var u = this.units[k];
        if (!u.alive || u.side === m.side || u.side === 'neutral') continue;
        if (U.dist(u.x, u.y, m.x, m.y) > m.trigger) continue;
        var isInf = u.type === 'infantry';
        if (m.type === 'mine_ap' && !isInf) continue;
        if (m.type === 'mine_at' && isInf) continue;
        victim = u; break;
      }
      if (!victim) continue;
      m.alive = false;
      this.effects.push({ kind: 'explosion', x: m.x, y: m.y, t: 0, dur: 0.5, size: m.radius, side: m.side });
      if (SL.Audio) SL.Audio.explosion(m.radius, m.x, m.y);
      for (var q = 0; q < this.units.length; q++) {
        var e = this.units[q];
        if (!e.alive || e.side === m.side || e.side === 'neutral') continue;
        var ed = U.dist(e.x, e.y, m.x, m.y);
        if (ed > m.radius) continue;
        var mul = 1 - 0.65 * (ed / Math.max(1, m.radius));
        this.damage(e, m.damage * mul, { side: m.side, name: '地雷', kills: 0, score: 0 }, 1.5, true);
      }
      this.mines.splice(i, 1);
    }
  };

  Game.prototype.barrierGridFor = function (u) {
    var key = this.isVehicleUnit(u) ? 'vehicle' : 'infantry';
    var cached = this.barrierGridCache[key];
    if (cached && cached.version === this.barrierVersion) return cached;
    var cell = 40, n = Math.ceil(SL.CONFIG.mapSize / cell);
    var blocked = new Uint8Array(n * n);
    var segs = this.barrierSegments();
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (!this.barrierBlocksUnit(u, s.type)) continue;
      var minX = Math.max(0, Math.floor(Math.min(s.a.x, s.b.x) / cell) - 1);
      var maxX = Math.min(n - 1, Math.floor(Math.max(s.a.x, s.b.x) / cell) + 1);
      var minY = Math.max(0, Math.floor(Math.min(s.a.y, s.b.y) / cell) - 1);
      var maxY = Math.min(n - 1, Math.floor(Math.max(s.a.y, s.b.y) / cell) + 1);
      for (var gy = minY; gy <= maxY; gy++) {
        for (var gx = minX; gx <= maxX; gx++) {
          if (segmentIntersectsRect(s.a.x, s.a.y, s.b.x, s.b.y,
            gx * cell, gy * cell, (gx + 1) * cell, (gy + 1) * cell)) {
            blocked[gy * n + gx] = 1;
          }
        }
      }
    }
    cached = { version: this.barrierVersion, cell: cell, n: n, blocked: blocked };
    this.barrierGridCache[key] = cached;
    return cached;
  };

  Game.prototype.findPath = function (u, tx, ty) {
    if (!this.barriers.length) return null;
    if (!this.segmentBlocked(u, u.x, u.y, tx, ty)) return [];
    var grid = this.barrierGridFor(u);
    var cell = grid.cell, n = grid.n, blocked = grid.blocked;
    var sx = U.clamp(Math.floor(u.x / cell), 0, n - 1);
    var sy = U.clamp(Math.floor(u.y / cell), 0, n - 1);
    var gx = U.clamp(Math.floor(tx / cell), 0, n - 1);
    var gy = U.clamp(Math.floor(ty / cell), 0, n - 1);
    if (blocked[gy * n + gx]) {
      var found = false;
      for (var rr = 1; rr <= 5 && !found; rr++) {
        for (var oy = -rr; oy <= rr && !found; oy++) {
          for (var ox = -rr; ox <= rr; ox++) {
            var cx = gx + ox, cy = gy + oy;
            if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
            if (!blocked[cy * n + cx]) { gx = cx; gy = cy; found = true; break; }
          }
        }
      }
      if (!found) return null;
    }
    var start = sy * n + sx, goal = gy * n + gx;
    if (start === goal) return [{ x: tx, y: ty }];
    var total = n * n;
    var gScore = new Float32Array(total); gScore.fill(Infinity);
    var fScore = new Float32Array(total); fScore.fill(Infinity);
    var came = new Int32Array(total); came.fill(-1);
    var closed = new Uint8Array(total);
    var open = [start];
    gScore[start] = 0;
    fScore[start] = Math.hypot(sx - gx, sy - gy);
    var foundPath = false;
    var guard = 0;
    while (open.length && guard++ < 12000) {
      open.sort(function (a, b) { return fScore[b] - fScore[a]; });
      var cur = open.pop();
      if (cur === goal) { foundPath = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      var cx0 = cur % n, cy0 = Math.floor(cur / n);
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx2 = -1; dx2 <= 1; dx2++) {
          if (!dx2 && !dy) continue;
          var nx2 = cx0 + dx2, ny2 = cy0 + dy;
          if (nx2 < 0 || ny2 < 0 || nx2 >= n || ny2 >= n) continue;
          var ni = ny2 * n + nx2;
          if (blocked[ni] || closed[ni]) continue;
          if (dx2 && dy && (blocked[cy0 * n + nx2] || blocked[ny2 * n + cx0])) continue;
          var ng = gScore[cur] + (dx2 && dy ? 1.4142 : 1);
          if (ng >= gScore[ni]) continue;
          came[ni] = cur;
          gScore[ni] = ng;
          fScore[ni] = ng + Math.hypot(nx2 - gx, ny2 - gy);
          open.push(ni);
        }
      }
    }
    if (!foundPath) return null;
    var cells = [];
    for (var at = goal; at !== -1 && at !== start; at = came[at]) cells.push(at);
    cells.reverse();
    var points = [];
    for (var ci = 0; ci < cells.length; ci++) {
      points.push({
        x: (cells[ci] % n + 0.5) * cell,
        y: (Math.floor(cells[ci] / n) + 0.5) * cell
      });
    }
    points.push({ x: tx, y: ty });
    // 拉直路径，减少网格锯齿
    var out = [], anchorX = u.x, anchorY = u.y;
    var idx = 0;
    while (idx < points.length) {
      var far = idx;
      for (var j = points.length - 1; j >= idx; j--) {
        if (!this.segmentBlocked(u, anchorX, anchorY, points[j].x, points[j].y)) { far = j; break; }
      }
      var p = points[far];
      out.push(p);
      anchorX = p.x; anchorY = p.y;
      idx = far + 1;
    }
    return out.length ? out : null;
  };

  Game.prototype.findBlockingBarrier = function (u, tx, ty) {
    var segs = this.barrierSegments();
    var best = null, bestD = Infinity;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.a.side === u.side) continue;
      if (!this.barrierBlocksUnit(u, s.type)) continue;
      if (!segmentsIntersect(u.x, u.y, tx, ty, s.a.x, s.a.y, s.b.x, s.b.y)) continue;
      var da = U.dist(u.x, u.y, s.a.x, s.a.y);
      if (da < bestD) { bestD = da; best = s.a; }
      var db = U.dist(u.x, u.y, s.b.x, s.b.y);
      if (db < bestD) { bestD = db; best = s.b; }
    }
    // 没有正好压在直线上的线段时，选附近最近的敌方障碍，供无路时拆除
    if (!best) {
      for (var k = 0; k < this.barriers.length; k++) {
        var b = this.barriers[k];
        if (!b.alive || b.side === u.side) continue;
        if (!this.barrierBlocksUnit(u, b.type)) continue;
        var d = U.dist(u.x, u.y, b.x, b.y);
        if (d < 260 && d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  };

  Game.prototype.tryBreakBarrier = function (u, tx, ty) {
    var node = this.findBlockingBarrier(u, tx, ty);
    if (!node || !node.alive) return false;
    u.order = { kind: 'attackBarrier', target: node, resume: { x: tx, y: ty } };
    u.target = node;
    u.path = null;
    u.noPath = false;
    this.log(u.name + ' 前进道路被阻，转为拆除 ' + node.name, 'order');
    return true;
  };

  Game.prototype.commandAttackBarrier = function (units, node) {
    for (var i = 0; i < units.length; i++) {
      if (!units[i].alive) continue;
      units[i].order = { kind: 'attackBarrier', target: node };
      units[i].target = node;
      units[i].path = null;
    }
    if (node) this.log('攻击指令 · ' + node.name, 'order');
  };

  Game.prototype.barrierAt = function (x, y, maxDist) {
    var best = null, bestD = maxDist || 24;
    for (var i = 0; i < this.barriers.length; i++) {
      var b = this.barriers[i];
      if (!b.alive) continue;
      if (!this.isSeen(b.x, b.y)) continue;
      var d = U.dist(x, y, b.x, b.y);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  };


  Game.prototype.resolveSeparation = function () {
    for (var i = 0; i < this.units.length; i++) {
      var a = this.units[i];
      if (!a.alive) continue;
      for (var j = i + 1; j < this.units.length; j++) {
        var b = this.units[j];
        if (!b.alive || b.side !== a.side) continue;
        var minD = a.def.radius + b.def.radius + 2;
        var dx = b.x - a.x, dy = b.y - a.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 0.0001) {
          var d = Math.sqrt(d2);
          var push = (minD - d) * 0.5;
          var nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  };

  /* ---------------- 索敌 / 开火 ---------------- */

  Game.prototype.unitVision = function (u) {
    var v = u.def.vision;
    if (u.items && u.items.some(function (it) { return it.key === 'sniper'; })) v += 100;
    return v;
  };

  Game.prototype.canSee = function (side, x, y) {
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side !== side) continue;
      var v = this.unitVision(u);
      if (U.dist2(u.x, u.y, x, y) <= v * v) return true;
    }
    for (var k = 0; k < this.recons.length; k++) {
      var r = this.recons[k];
      if (r.side !== side || this.time >= r.until) continue;
      if (U.dist2(r.x, r.y, x, y) <= r.r * r.r) return true;
    }
    // 仅侦察机自带 200m 视野
    var pv = SL.PLANE.vision || 200;
    for (var pi = 0; pi < this.planes.length; pi++) {
      var pl = this.planes[pi];
      if (!pl || pl.hp <= 0 || pl.side !== side || pl.kind !== 'recon') continue;
      if (U.dist2(pl.x, pl.y, x, y) <= pv * pv) return true;
    }
    return false;
  };

  // 侦察机是否照亮了某点
  Game.prototype.reconSees = function (side, x, y) {
    for (var i = 0; i < this.recons.length; i++) {
      var r = this.recons[i];
      if (r.side !== side || this.time >= r.until) continue;
      if (U.dist2(r.x, r.y, x, y) <= r.r * r.r) return true;
    }
    return false;
  };

  // 单位是否对某阵营可见（隐蔽中的步兵只能被侦察机或 50m 内的敌人发现）
  Game.prototype.unitVisibleTo = function (side, u) {
    if (!u || !u.alive) return false;
    if (u.side === side) return true;
    // 试验场中幽灵兵团始终可见，便于测试
    if (this.testMode && u.bossKind === 'ghost') return true;
    // 幽灵兵团在抵达黄圈中心前强制隐身，连侦察也无法发现
    if (u.forceConcealed) return false;
    // 伪装服步兵进入幽灵状态后，任何侦察手段都无法发现
    if (u.ghost) return false;
    // 试验场关闭迷雾时全图可见，标靶放到远处也会出现在小地图
    if (this.testMode && this.fogEnabled === false) return true;
    if (this.reconSees(side, u.x, u.y)) return true;
    if (u.concealed) return false;
    return this.canSee(side, u.x, u.y);
  };

  Game.prototype.enemyWithin = function (u, radius) {
    var r2 = radius * radius;
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side) continue;
      if (U.dist2(u.x, u.y, e.x, e.y) <= r2) return true;
    }
    return false;
  };

  // 灌木丛 / 树林隐蔽：不开火就不被发现，敌人逼近 50m 暴露
  Game.prototype.finishStealth = function (u, wasActive) {
    var active = !!(u.concealed || u.ghost);
    if (wasActive && !active) {
      u.stealthLingerUntil = this.time + 1;
      u.stealthLingerEvade = u.stealthLastEvade || SL.STEALTH.concealEvade;
    }
    if (active) u.stealthLastEvade = u.ghost ? SL.STEALTH.ghostEvade : SL.STEALTH.concealEvade;
  };

  Game.prototype.updateStealth = function (dt) {
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u) continue;
      var wasActive = !!(u.concealed || u.ghost);
      if (u.forceConcealed) {
        u.concealed = true; u.ghost = false;
        this.finishStealth(u, wasActive);
        continue;
      }
      if (!u.alive) {
        u.concealed = false; u.ghost = false;
        this.finishStealth(u, wasActive);
        continue;
      }
      // 反坦克炮 / 指挥车：原地 5 秒不开炮进入隐蔽，移动/开火立即解除
      if (u.type === 'at_gun' || u.type === 'command') {
        var stationary = !u.moving && !u.sprinting;
        var justFired = (this.time - u.lastFire) < 0.2;
        var safe = !this.enemyWithin(u, SL.AT_STEALTH.revealRange || 50);
        if (stationary && !justFired && safe) u.atStealthT = (u.atStealthT || 0) + dt;
        else u.atStealthT = 0;
        u.concealed = (u.atStealthT >= (SL.AT_STEALTH.delay || 5));
        u.ghost = false;
        this.finishStealth(u, wasActive);
        continue;
      }
      if (u.type !== 'infantry') {
        u.concealed = false; u.ghost = false;
        this.finishStealth(u, wasActive);
        continue;
      }
      u.stealthTimer = (u.stealthTimer || 0) - dt;
      if (u.stealthTimer > 0) {
        this.finishStealth(u, wasActive);
        continue;
      }
      u.stealthTimer = 0.25;
      var z = u.cover.zone;
      var inCover = (z && (z.kind === 'bush' || z.kind === 'forest')) || (u.cover.forest > 0.52);
      var camo = this.hasEquip(u, 'camo');
      // 伪装服 + 灌木/树林 + 1 秒未开火：幽灵状态
      if (camo && inCover && (this.time - u.lastFire) >= 1) {
        u.ghost = true;
        u.concealed = true;
        this.finishStealth(u, wasActive);
        continue;
      }
      u.ghost = false;
      var hidden = false;
      if ((inCover || camo) && (this.time - u.lastFire) >= SL.STEALTH.delay) {
        hidden = !this.enemyWithin(u, SL.STEALTH.revealRange);
      }
      u.concealed = hidden;
      this.finishStealth(u, wasActive);
    }
  };

  Game.prototype.findTarget = function (u) {
    var best = null, bestScore = Infinity;
    var range = u.maxRangeNow || u.def.range;
    var mortar = !!(u.def.weapon && u.def.weapon.mortar);
    if (!mortar) {
      for (var mi = 0; mi < u.items.length; mi++) {
        if (u.items[mi].key === 'mortar') { mortar = true; break; }
      }
    }
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side) continue;
      var d = U.dist(u.x, u.y, e.x, e.y);
      if (d > range) continue;
      // 狙击侦察小组：软目标 600m，装甲目标 400m，重坦不可攻击
      var sniper = false;
      for (var sk = 0; sk < u.items.length; sk++) {
        if (u.items[sk].key === 'sniper') { sniper = true; break; }
      }
      if (sniper && e.def.armor) {
        if (e.type === 'heavy_tank') continue;
        if (d > (SL.EQUIP.sniper.weapon.antiArmorRange || 400)) continue;
      }
      // 只要目标被己方任何单位看见，就可以在射程内开火（团队目标指示）
      if (!this.unitVisibleTo(u.side, e)) continue;
      var score = d;
      if (mortar) score += e.def.armor ? 900 : -260;
      if (score < bestScore) { best = e; bestScore = score; }
    }
    return best;
  };

  // 选择当前可用的武器：火箭筒反装甲、迫击炮打远、机枪扫步兵
  Game.prototype.pickWeapon = function (u, target, d) {
    var bonus = 1 + (u.cover.rangeBonus || 0);
    var best = null, bestPrio = -1;
    var base = u.def.weapon;
    if (u.ammo > 0 && u.cd <= 0 && d <= u.def.range * bonus && d >= (u.def.minRange || 0)) {
      best = { weapon: base, item: null, prio: 0 };
      bestPrio = 0;
    }
    for (var i = 0; i < u.items.length; i++) {
      var it = u.items[i];
      var eq = SL.EQUIP[it.key];
      if (!eq || !eq.weapon) continue;
      var w = eq.weapon;
      var itemBonus = w.noRangeBonus ? 1 : bonus;
      if (it.cd > 0) continue;
      if ((it.key === 'grenade' || it.key === 'atgrenade' || it.key === 'bazooka') &&
        (u.grenadeMode || 'auto') === 'manual') continue;
      if (w.requiresStop && (u.moving || u.sprinting)) continue;
      if (w.usesUnitAmmo) { if (u.ammo <= 0) continue; }
      else if (it.ammo <= 0) continue;
      if (w.antiArmor && !target.def.armor) continue;
      if (w.sniper && target.def.armor) {
        if (target.type === 'heavy_tank') continue;
        if (d > (w.antiArmorRange || 400)) continue;
      }
      if (d > w.range * itemBonus || d < (w.minRange || 0)) continue;
      var prio = 1;
      // 反坦克手雷：只要目标有装甲，优先于机枪、火箭筒和其他投掷物
      if (it.key === 'atgrenade' && target.def.armor) prio = 9;
      else if (w.sniper) prio = 5;
      else if (w.kind === 'direct' && w.ap >= 1 && target.def.armor) prio = 4;
      else if (w.kind === 'shell') prio = 3;
      else if (w.kind === 'direct' && !target.def.armor) prio = 2;
      if (prio > bestPrio) { best = { weapon: w, item: it, prio: prio }; bestPrio = prio; }
    }
    // 坦克 / 重型坦克的并列机枪：使用步兵装备包中的 MG42 数据
    if ((u.type === 'tank' || u.type === 'heavy_tank') && u.mgAmmo > 0 &&
      !target.def.armor) {
      var mgw = SL.EQUIP.mg.weapon;
      if (d <= mgw.range * bonus && d >= (mgw.minRange || 0) && 3 > bestPrio) {
        best = { weapon: mgw, item: null, prio: 3, secondary: true };
        bestPrio = 3;
      }
    }
    // 碉堡/迫击炮等工事现在独立开火并消耗工事弹药
    return best;
  };

  Game.prototype.accuracyAtRange = function (d, range) {
    var r = U.clamp(d / (range || 1), 0, 1);
    return 1 - SL.ACCURACY_FALLOFF * r;
  };

  Game.prototype.scatterAtRange = function (scatter, d, range) {
    var r = U.clamp(d / (range || 1), 0, 1);
    return (scatter || 0) * Math.max(0.2, r);
  };

  Game.prototype.tryFire = function (u, d) {
    if (!u.target) return;
    var pick = this.pickWeapon(u, u.target, d);
    if (!pick) return;
    this.fire(u, u.target, pick.weapon, pick.item, pick.secondary);
  };

  Game.prototype.fire = function (u, target, w, item, secondary) {
    w = w || u.def.weapon;
    if (w.requiresStop && (u.moving || u.sprinting)) return false;
    var usesSquadAmmo = !!(item && w.usesUnitAmmo);
    if (item) item.usesUnitAmmo = !!w.usesUnitAmmo;
    var ammoRef = secondary ? { ammo: u.mgAmmo } : (usesSquadAmmo ? u : (item ? item : u));
    if (usesSquadAmmo && u.ammo <= 0) {
      if (!u.ammoWarned) {
        u.ammoWarned = true;
        this.log(u.name + ' 弹药耗尽', 'loss');
        this.fxText(u.x, u.y - 12, '弹药耗尽', '#e0a08a', u.side);
      }
      return false;
    }
    if (ammoRef.ammo <= 0) {
      if (!secondary && !u.ammoWarned) {
        u.ammoWarned = true;
        this.log(u.name + ' 弹药耗尽', 'loss');
        this.fxText(u.x, u.y - 12, '弹药耗尽', '#e0a08a', u.side);
      }
      return false;
    }
    var shotCount = w.rockets || 1;
    if (shotCount > 1 && ammoRef.ammo < shotCount) {
      if (!secondary && !u.ammoWarned) {
        u.ammoWarned = true;
        this.log(u.name + ' 弹药不足，无法齐射', 'loss');
        this.fxText(u.x, u.y - 12, '弹药不足', '#e0a08a', u.side);
      }
      return false;
    }
    if (w.mag && !item && u.magLeft <= 0) return false;
    var shotDist = U.dist(u.x, u.y, target.x, target.y);
    u.cd = item ? u.cd : (w.rockets ? w.reload : w.interval * (0.86 + Math.random() * 0.28));
    if (item) item.cd = w.interval * (0.86 + Math.random() * 0.28);
    if (u.bossKind === 'ghost') {
      u.cd *= SL.BOSS.ghost.fireRateScale;
      if (item) item.cd *= SL.BOSS.ghost.fireRateScale;
    }
    // 弹夹炮：打空后进入长装填
    if (w.mag && !item) {
      u.magLeft--;
      if (u.magLeft <= 0) u.cd = w.reload;
    }
    if (secondary) u.mgAmmo--; else ammoRef.ammo -= shotCount;
    u.flash = 0.1;
    var silentThrow = !!(item && (item.key === 'grenade' || item.key === 'atgrenade'));
    if (!silentThrow) {
      u.lastFire = this.time;
      u.concealed = false;
    }

    var a = U.angle(u.x, u.y, target.x, target.y);
    u.turret = a;

    if (w.kind === 'shell') {
      // 火箭炮逐发速射：先建立发射队列，随后按短间隔逐发飞出
      if (w.rockets) {
        if (!u.rocketQueue) u.rocketQueue = [];
        for (var qi = 0; qi < shotCount; qi++) {
          u.rocketQueue.push({
            at: this.time + qi * (w.rocketDelay || 0.16),
            tx: target.x, ty: target.y, weapon: w
          });
        }
        this.cleanupItem(u, item);
        return true;
      }
      // scatter 是极限射程散布：越近落点越集中
      var sc = w.fixedScatter ? (w.scatter || 0) : this.scatterAtRange(w.scatter || 100, shotDist, w.range || u.def.range);
      var ms0 = SL.CONFIG.mapSize;
      for (var ri = 0; ri < shotCount; ri++) {
        var ang = Math.random() * Math.PI * 2;
        var rad = sc * Math.sqrt(Math.random());
        var tx = U.clamp(target.x + Math.cos(ang) * rad, 10, ms0 - 10);
        var ty = U.clamp(target.y + Math.sin(ang) * rad, 10, ms0 - 10);
        var flightD = U.dist(u.x, u.y, tx, ty);
        this.shells.push({
          x0: u.x, y0: u.y, x1: tx, y1: ty,
          t: 0,
          dur: U.clamp(flightD / 150 + 0.7, 0.8, 2.6),
          dmg: w.dmg,
          radius: w.splash,
          ap: w.ap,
          mortar: !!w.mortar,
          side: u.side,
          source: u
        });
      }
      this.effects.push({ kind: 'muzzle', x: u.x, y: u.y, a: a, t: 0, dur: 0.18, size: 14, side: u.side });
      if (SL.Audio) SL.Audio.shot(w, u, secondary, u.x, u.y);
      this.cleanupItem(u, item);
      return true;
    }

    // 火箭筒：发射一枚可见、慢速飞行的火箭弹
    if (w.rocket) {
      this.shells.push({
        x0: u.x, y0: u.y, x1: target.x, y1: target.y,
        t: 0,
        dur: U.clamp(shotDist / (w.projectileSpeed || 55), 0.35, 8),
        dmg: w.dmg, radius: w.splash || 10, ap: w.ap,
        rocket: true, side: u.side, source: u
      });
      this.effects.push({ kind: 'muzzle', x: u.x, y: u.y, a: a, t: 0, dur: 0.22, size: 16, side: u.side });
      if (SL.Audio) SL.Audio.shot(w, u, secondary, u.x, u.y);
      this.cleanupItem(u, item);
      return true;
    }

    // 手雷：抛掷飞行，落点爆炸；投掷不破除隐藏
    if (silentThrow) {
      this.shells.push({
        x0: u.x, y0: u.y, x1: target.x, y1: target.y,
        t: 0,
        dur: U.clamp(shotDist / 90 + 0.2, 0.25, 1.25),
        dmg: w.dmg, radius: w.splash || 10, ap: w.ap,
        grenade: true, side: u.side, source: u
      });
      this.effects.push({ kind: 'muzzle', x: u.x, y: u.y, a: a, t: 0, dur: 0.12, size: 8, side: u.side });
      if (SL.Audio) SL.Audio.shot(w, u, secondary, u.x, u.y);
      this.cleanupItem(u, item);
      return true;
    }

    var spread = w.spread || 0;
    var sa = Math.random() * Math.PI * 2;
    var srad = spread * Math.sqrt(Math.random());
    var ix = target.x + Math.cos(sa) * srad;
    var iy = target.y + Math.sin(sa) * srad;

    var acc = w.accuracy;
    acc *= this.accuracyAtRange(shotDist, w.range || u.def.range);
    if (u.moving) acc *= SL.MOVING_ACCURACY;
    if (u.sprinting) acc *= 0.5;
    var stealthEvade = 0;
    if (target.ghost) stealthEvade = SL.STEALTH.ghostEvade;
    else if (target.concealed) stealthEvade = SL.STEALTH.concealEvade || 0;
    else if (target.stealthLingerUntil && target.stealthLingerUntil > this.time) {
      stealthEvade = target.stealthLingerEvade || SL.STEALTH.concealEvade || 0;
    }
    var targetEvade = (target.cover ? target.cover.evade : 0) + stealthEvade;
    acc *= (1 - U.clamp(targetEvade, 0, 0.9));

    var muzzleSize = u.type === 'infantry' ? 5 : 9;
    this.effects.push({ kind: 'muzzle', x: u.x, y: u.y, a: a, t: 0, dur: 0.1, size: muzzleSize, side: u.side });
    if (SL.Audio) SL.Audio.shot(w, u, secondary, u.x, u.y);

    if (Math.random() > acc) {
      var mo = spread * 2.2;
      var mx = target.x + (Math.random() - 0.5) * mo;
      var my = target.y + (Math.random() - 0.5) * mo;
      this.effects.push({
        kind: 'tracer', x1: u.x, y1: u.y, x2: mx, y2: my,
        t: 0, dur: 0.13, side: u.side, heavy: u.type !== 'infantry'
      });
      this.fxText(mx, my - 4, 'MISS', '#d8d2bd', target.side);
      this.cleanupItem(u, item);
      return true;
    }

    this.effects.push({
      kind: 'tracer', x1: u.x, y1: u.y, x2: ix, y2: iy,
      t: 0, dur: 0.13, side: u.side, heavy: u.type !== 'infantry' || w.ap >= 1
    });

    var armor = target.def.armor;
    var sniperShot = !!(item && item.key === 'sniper');
    var dmg;
    if (sniperShot) {
      if (target.type === 'heavy_tank') {
        this.fxText(target.x, target.y - 10, '无法击穿', '#d8d2b0', target.side);
        this.cleanupItem(u, item);
        return true;
      }
      if (target.type === 'armored' || target.type === 'aa') dmg = w.armoredDmg;
      else if (target.type === 'tank') dmg = w.tankDmg;
      else dmg = w.dmg;
      dmg *= (0.94 + Math.random() * 0.12);
    } else {
      dmg = w.dmg * (armor ? w.ap : 1) * (0.88 + Math.random() * 0.24);
    }
    if (w.mg && target.type === 'infantry' && target.cover.zone && target.cover.zone.fortified) {
      dmg *= SL.FORT.mgDamageVsGarrison;
    }
    this.damage(target, dmg, u, sniperShot ? 1.2 : w.ap);
    // 小半径溅射（防空车 5m）
    if (w.splash) {
      for (var si = 0; si < this.units.length; si++) {
        var su = this.units[si];
        if (!su.alive || su === target) continue;
        var sd = U.dist(su.x, su.y, target.x, target.y);
        if (sd > w.splash) continue;
        var sfall = 1 - 0.6 * (sd / w.splash);
        this.damage(su, w.dmg * 0.55 * sfall, u, w.ap);
      }
    }
    this.cleanupItem(u, item);
    return true;
  };

  // 弹药打光的装备自动移除
  Game.prototype.cleanupItem = function (u, item) {
    if (!item) return;
    if (item.usesUnitAmmo) { this.updateCover(u); return; }
    if (item.ammo > 0) { this.updateCover(u); return; }
    var idx = u.items.indexOf(item);
    if (idx >= 0) u.items.splice(idx, 1);
    this.updateCover(u);
    this.log(u.name + ' 的 ' + SL.EQUIP[item.key].name + ' 已耗尽', 'loss');
  };

  Game.prototype.damage = function (target, amount, source, ap, bypassArmorImmunity) {
    if (!target.alive) return;
    if (target.isBarrier) {
      this.hitBarrier(target, amount, source);
      return;
    }
    // 重型坦克免疫步兵 / 装甲车 / 防空车的低穿甲火力；迫击炮直击可绕过此限制
    if (!bypassArmorImmunity && target.type === 'heavy_tank' && source &&
      (source.type === 'infantry' || source.type === 'armored' || source.type === 'aa') &&
      (ap === undefined || ap < 1)) {
      this.fxText(target.x, target.y - 10, '免疫', '#d8d2b0', target.side);
      return;
    }
    // 步兵轻武器无法伤害坦克；迫击炮直击可绕过此限制
    if (!bypassArmorImmunity && target.type === 'tank' && source && source.type === 'infantry' && (ap === undefined || ap < 1)) {
      this.fxText(target.x, target.y - 10, '免疫', '#d8d2b0', target.side);
      return;
    }
    var dr = target.cover ? target.cover.dr : 0;
    var incoming = amount;
    if (this.mode === 'melee' && target.side === 'blue' && source &&
      (source.side === 'red' || source.side === 'green')) {
      incoming *= this.meleeMods().enemyDamage;
    }
    if (source && source.bossKind === 'ghost') {
      incoming *= SL.BOSS.ghost.damageScale;
    }
    var applied = incoming * (1 - dr);
    target.hp -= applied;
    if (source && source.side !== target.side && source.x != null) {
      target.lastAttacker = source;
      target.lastHitAt = this.time;
    }
    target.hitFlash = 0.16;
    this.fxText(
      target.x + (Math.random() - 0.5) * 10,
      target.y - 8,
      '-' + Math.max(1, Math.round(applied)),
      target.side === 'blue' ? '#ff9c82' : '#ffe08a',
      target.side
    );
    if (target.hp <= 0) {
      target.hp = 0;
      this.kill(target, source);
    }
  };

  Game.prototype.fxText = function (x, y, text, color, side) {
    this.effects.push({ kind: 'text', x: x, y: y, text: text, color: color, side: side || null, t: 0, dur: 1.0 });
  };

  Game.prototype.dropItem = function (x, y, item) {
    if (!item || !SL.EQUIP[item.key]) return;
    if (this.drops.length >= SL.DROP.max) this.drops.shift();
    this.drops.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 14,
      key: item.key,
      item: {
        key: item.key, ammo: item.ammo || 0, hp: item.hp || 0,
        uses: item.uses || 0, cd: 0
      },
      expire: this.time + SL.DROP.expire
    });
  };

  Game.prototype.dropEquipment = function (x, y) {
    var key = SL.pickEquipKey();
    var eq = SL.EQUIP[key];
    if (!eq) return;
    this.dropItem(x, y, {
      key: key, ammo: eq.weapon ? eq.weapon.ammo : 0,
      hp: eq.heal || 0, uses: eq.uses || 0, cd: 0
    });
  };

  Game.prototype.updateDrops = function (dt) {
    void dt;
    for (var i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i];
      if (this.time >= d.expire) { this.drops.splice(i, 1); continue; }
      for (var k = 0; k < this.units.length; k++) {
        var u = this.units[k];
        if (!u.alive || u.type !== 'infantry' || u.side !== 'blue') continue;
        if (u.items.length >= 6) continue;
        if (U.dist(u.x, u.y, d.x, d.y) > SL.DROP.radius) continue;
        u.items.push(d.item);
        this.updateCover(u);
        if (u.side === 'blue') {
          this.log(u.name + ' 拾取 ' + SL.EQUIP[d.key].name, 'win');
          this.fxText(u.x, u.y - 10, '拾取 ' + SL.EQUIP[d.key].name, '#f0da9a');
        }
        this.drops.splice(i, 1);
        break;
      }
    }
  };

  Game.prototype.kill = function (u, source) {
    if (!u.alive) return;
    u.alive = false;
    u.selected = false;
    u.target = null;
    u.concealed = false;
    u.rocketQueue = [];
    this.recons = this.recons.filter(function (r) { return !(r.command && r.source === u.id); });
    if (u.side !== 'neutral') {
      this.stats.losses[u.side] = (this.stats.losses[u.side] || 0) + 1;
    }
    var idx = this.selected.indexOf(u);
    if (idx >= 0) this.selected.splice(idx, 1);

    var killer = (source && source.side && source.side !== u.side) ? source : null;
    if (killer) {
      var r = SL.REWARD[u.type] || SL.REWARD.infantry;
      killer.kills++;
      killer.score += r.score;
      var team = this.teams[killer.side];
      this.addScore(killer.side, r.score);
      team.kills++;
      this.stats.kills[killer.side] = (this.stats.kills[killer.side] || 0) + 1;
      this.addXp(killer.side, r.xp);
      this.feed.push({
        id: ++this.feedSeq, t: this.time, kind: 'kill',
        ks: killer.side, vs: u.side, killer: killer.name, victim: u.name,
        xp: r.xp, score: r.score, text: ''
      });
      if (this.feed.length > 60) this.feed.shift();
    }

    if (u.bossKind && killer && killer.side === 'blue') {
      var bossGroupAlive = false;
      if (u.bossKind === 'ghost' && u.bossGroup) {
        for (var bi = 0; bi < this.units.length; bi++) {
          var bo = this.units[bi];
          if (bo !== u && bo.alive && bo.bossKind === 'ghost' && bo.bossGroup === u.bossGroup) {
            bossGroupAlive = true; break;
          }
        }
      }
      if (u.bossKind === 'ghost') this.awardGhostKill(u, !bossGroupAlive);
      else if (!bossGroupAlive) this.awardBossKill(u);
    }

    this.effects.push({
      kind: 'explosion', x: u.x, y: u.y, t: 0, dur: 0.8,
      size: u.type === 'infantry' ? 9 : 22, side: u.side
    });
    if (u.type !== 'infantry') {
      this.wrecks.push({ x: u.x, y: u.y, a: u.facing, type: u.type, side: u.side, t: 0 });
      if (this.wrecks.length > 30) this.wrecks.shift();
    } else if ((u.side === 'red' || u.side === 'green') && Math.random() < SL.DROP.chance) {
      this.dropEquipment(u.x, u.y);
    } else if (u.side === 'blue' && u.items.length && Math.random() < SL.DROP.chance) {
      var loot = u.items.slice();
      var lootCount = Math.min(loot.length, 1 + (Math.random() < 0.5 ? 1 : 0));
      for (var di = 0; di < lootCount; di++) {
        var li = Math.floor(Math.random() * loot.length);
        this.dropItem(u.x, u.y, loot.splice(li, 1)[0]);
      }
    }
    this.log(u.name + ' 被击毁', 'info');

    // 全灭：6 秒后重生。中立单位不参与重生
    if (u.side !== 'neutral' && this.aliveCount(u.side) === 0 && this.teams[u.side].respawnAt === 0) {
      this.teams[u.side].respawnAt = this.time + SL.XP.respawnDelay;
      this.stats.wipes++;
      if (killer) {
        this.addXp(killer.side, SL.XP.wipe);
        this.feed.push({
          id: ++this.feedSeq, t: this.time, kind: 'wipe',
          ks: killer.side, vs: u.side, xp: SL.XP.wipe, score: 0,
          killer: SL.SIDES[killer.side].name, victim: SL.SIDES[u.side].name,
          text: SL.SIDES[u.side].name + ' 全灭'
        });
      } else {
        this.feed.push({
          id: ++this.feedSeq, t: this.time, kind: 'wipe',
          ks: null, vs: u.side, xp: 0, score: 0, killer: '', victim: SL.SIDES[u.side].name,
          text: SL.SIDES[u.side].name + ' 全灭'
        });
      }
      this.log(SL.SIDES[u.side].name + ' 全灭，' + SL.XP.respawnDelay + ' 秒后重生', 'info');
    }
  };

  Game.prototype.aliveCount = function (side) {
    var n = 0;
    for (var i = 0; i < this.units.length; i++) if (this.units[i].alive && this.units[i].side === side) n++;
    return n;
  };

  /* ---------------- 经验 / 卡片 ---------------- */

  // 等级落后的阵营获得后追经验加成：每落后 1 级 +10%，上限 +150%
  Game.prototype.catchUpBonus = function (side) {
    var t = this.teams[side];
    if (!t) return 0;
    var lead = 1;
    for (var i = 0; i < SL.SIDE_ORDER.length; i++) {
      var other = this.teams[SL.SIDE_ORDER[i]];
      if (other && other.level > lead) lead = other.level;
    }
    var gap = Math.max(0, lead - t.level);
    return Math.min(SL.XP.catchupCap, gap * SL.XP.catchupPerLevel);
  };

  Game.prototype.pickLowWeightUnitType = function () {
    var table = SL.UNIT_PACK.slice().sort(function (a, b) { return a.w - b.w; });
    var n = Math.min(4, table.length);
    return table[Math.floor(Math.random() * n)].key;
  };

  Game.prototype.awardGhostKill = function (u, groupCleared) {
    this.addXp('blue', 1000);
    this.addScore('blue', 1000);
    this.drawCard('unit', this.pickUnitType(false));
    var msg = '击毁幽灵步兵班：+1000 经验 / +1000 分 / 1 张单位卡';
    if (groupCleared) {
      this.addXp('blue', 2000);
      this.addScore('blue', 2000);
      this.drawCard('unit', this.pickLowWeightUnitType());
      msg += '；幽灵兵团全灭：+2000 经验 / +2000 分 / 1 张低权重单位卡';
      this.bossKillEvent = {
        name: '幽灵兵团', xp: 2000, score: 2000, cards: 1,
        t: this.time, id: ++this.feedSeq
      };
    }
    if (SL.Audio) SL.Audio.level();
    this.log(msg, 'win');
    this.feed.push({
      id: ++this.feedSeq, t: this.time, kind: 'level', ks: 'blue', vs: u.side,
      xp: groupCleared ? 3000 : 1000, score: groupCleared ? 3000 : 1000,
      killer: '', victim: u.name, text: msg
    });
  };

  Game.prototype.awardBossKill = function (boss) {
    var cfg = SL.BOSS.reward;
    this.addXp('blue', cfg.xp);
    this.addScore('blue', cfg.score);
    var names = [];
    for (var i = 0; i < cfg.cards; i++) {
      var sub = this.pickUnitType(false);
      this.drawCard('unit', sub);
      names.push(SL.UNIT_TYPES[sub].name);
    }
    var msg = '击破 ' + (boss && (boss.name || 'BOSS')) + '：+' + cfg.xp + ' 经验 / +' +
      cfg.score + ' 分 / ' + cfg.cards + ' 张单位卡';
    this.bossKillEvent = {
      name: boss && (boss.name || 'BOSS') || 'BOSS',
      xp: cfg.xp, score: cfg.score, cards: cfg.cards,
      t: this.time, id: ++this.feedSeq
    };
    if (boss && boss.x != null) {
      this.effects.push({ kind: 'blast', x: boss.x, y: boss.y, t: 0, dur: 1.2, r: 130, side: 'blue' });
      this.fxText(boss.x, boss.y - 24, 'BOSS 击破', '#ffe0a0', 'blue');
    }
    if (SL.Audio) SL.Audio.level();
    this.log(msg, 'win');
    this.feed.push({
      id: ++this.feedSeq, t: this.time, kind: 'level', ks: 'blue', vs: null,
      xp: cfg.xp, score: cfg.score, killer: '', victim: boss ? boss.name : 'BOSS',
      text: msg
    });
    return { xp: cfg.xp, score: cfg.score, cards: names };
  };

  Game.prototype.addScore = function (side, amount) {
    var t = this.teams[side];
    if (!t || !amount) return;
    t.score += amount;
    t.scoreEarned = (t.scoreEarned || 0) + amount;
  };

  Game.prototype.addXp = function (side, amount) {
    if (!amount) return;
    var t = this.teams[side];
    if (!t) return;
    amount *= 1 + this.catchUpBonus(side);
    // 敌方 AI 经验略减，避免 AI 滚雪球过快
    if (side === 'red' || side === 'green') amount *= this.mode === 'melee' ? this.meleeMods().enemyXp : SL.AI_XP_SCALE;
    t.xp += amount;
    var levels = 0;
    while (t.xp >= t.nextXp) {
      t.xp -= t.nextXp;
      t.level++;
      levels++;
      t.nextXp = SL.XP.first + (t.level - 1) * SL.XP.step;
      if (side === 'blue') {
        var cards = [];
        for (var i = 0; i < SL.XP.draftCount; i++) cards.push(this.makeCard(this.randomPoolKey()));
        this.drafts.push({ level: t.level, cards: cards });
        this.feed.push({
          id: ++this.feedSeq, t: this.time, kind: 'level', ks: side, vs: null,
          xp: 0, score: 0, killer: '', victim: '', text: '连队晋升 Lv.' + t.level + ' · 选择一张卡'
        });
        this.log('连队晋升 Lv.' + t.level + ' · 选择一张卡', 'win');
      }
    }
    if (levels > 0 && side === 'blue' && SL.Audio) SL.Audio.level();
    // AI 没有卡片机制：每次升级随机增援一个单位（中立不增援）
    if ((side === 'red' || side === 'green') && levels > 0 && this.mode !== 'lastStand') {
      for (var k = 0; k < levels; k++) {
        var ru = this.spawnReinforcement(side);
        if (ru) this.log(SL.SIDES[side].name + ' 增援 ' + ru.name, 'info');
      }
    }
  };

  // 单位包 / 装备包立即开包，避免在卡包里留下需要手动拆的包
  Game.prototype.resolvePack = function (card) {
    if (card.key === 'unitpack') return this.makeCard('unit', this.pickUnitType(false));
    if (card.key === 'equippack') {
      return this.makeCard('equip', SL.pickEquipKey());
    }
    if (card.key === 'fortpack') {
      var fp = ['bunker', 'mortar_nest', 'at_gun_nest', 'flak88'];
      // 每局用“无放回轮换袋”，避免同一局连续不出 88 炮
      if (!this.fortBag || !this.fortBag.length) {
        this.fortBag = fp.slice();
        for (var fi = this.fortBag.length - 1; fi > 0; fi--) {
          var fj = Math.floor(Math.random() * (fi + 1));
          var ft = this.fortBag[fi];
          this.fortBag[fi] = this.fortBag[fj];
          this.fortBag[fj] = ft;
        }
      }
      var key = this.fortBag.pop();
      this.fortNo88 = this.fortNo88 || 0;
      if (key === 'flak88') {
        this.fortNo88 = 0;
      } else {
        this.fortNo88++;
        // 连续 2 包没有 88 炮时，第 3 包强制补出，避免一局长期抽不到
        if (this.fortNo88 >= 2) {
          key = 'flak88';
          var i88 = this.fortBag.indexOf('flak88');
          if (i88 >= 0) this.fortBag.splice(i88, 1);
          this.fortNo88 = 0;
        }
      }
      return this.makeCard(key);
    }
    return card;
  };

  // 从 5 张候选里选 1 张进卡包
  // 用战功分数购买一次抽卡机会
  Game.prototype.fortCardInfo = function (key) {
    return {
      bunker: { type: 'bunker', hp: SL.FORT.bunkerHp, ammo: SL.FORT.bunkerAmmo, name: '机枪碉堡' },
      mortar_nest: { type: 'mortar', hp: SL.FORT.mortarHp, ammo: SL.FORT.mortarAmmo, name: '迫击炮阵地' },
      at_gun_nest: { type: 'at_nest', hp: SL.FORT.atNestHp, ammo: SL.FORT.atNestAmmo, name: '反坦克炮阵地' },
      flak88: { type: 'flak88', hp: SL.FORT.flak88Hp, ammo: SL.FORT.flakAmmo, name: '88防空炮阵地' }
    }[key];
  };

  Game.prototype.replaceFortification = function (zone, index, card) {
    if (!zone || !card || !card.use || card.use !== 'point') return { ok: false, msg: '无法替换' };
    var structs = this.zoneStructures(zone);
    if (index < 0 || index >= structs.length) return { ok: false, msg: '无效的工事位置' };
    var info = this.fortCardInfo(card.key);
    if (!info) return { ok: false, msg: '不是工事卡' };
    var old = structs[index];
    structs[index] = {
      type: info.type, hp: info.hp, maxHp: info.hp,
      ammo: info.ammo, maxAmmo: info.ammo,
      cd: this.fortPhaseFor(info.type, index)
    };
    zone.structure = structs[0];
    var hand = this.teams.blue.hand;
    var hi = hand.indexOf(card);
    if (hi >= 0) hand.splice(hi, 1);
    if (SL.Audio) SL.Audio.card();
    this.log(zone.name + ' 的' + (info.name) + '替换了原有工事', 'order');
    return { ok: true, msg: zone.name + ' 已替换为' + info.name, replaced: old ? old.type : null };
  };

  Game.prototype.buyDraftPrice = function (side) {
    var t = this.teams[side] || this.teams.blue;
    return SL.XP.buyDraftCost + (t.draftBuys || 0) * SL.XP.buyDraftStep;
  };

  Game.prototype.buyDraft = function (side) {
    side = side || 'blue';
    var t = this.teams[side];
    if (!t) return { ok: false, msg: '无效阵营' };
    if (this.ended) return { ok: false, msg: '战斗已结束' };
    var cost = this.buyDraftPrice(side);
    if (t.score < cost) return { ok: false, msg: '分数不足，需要 ' + cost };
    t.score -= cost;
    t.draftBuys = (t.draftBuys || 0) + 1;
    var cards = [];
    for (var i = 0; i < SL.XP.draftCount; i++) cards.push(this.makeCard(this.randomPoolKey()));
    this.drafts.push({ level: t.level, cards: cards, purchased: true });
    this.log('花费 ' + cost + ' 分购买抽卡机会', 'order');
    return { ok: true, cost: cost, cards: cards.length, nextCost: this.buyDraftPrice(side) };
  };

  Game.prototype.pickDraftCard = function (idx) {
    if (!this.drafts.length) return null;
    var d = this.drafts[0];
    var card = d.cards[idx];
    if (!card) return null;
    var hand = this.teams.blue.hand;
    card = this.resolvePack(card);
    hand.push(card);
    if (hand.length > SL.XP.handMax) hand.shift();
    this.drafts.shift();
    this.log('获得 ' + card.name, 'win');
    return card;
  };

  Game.prototype.randomPoolKey = function () {
    var total = 0, i;
    for (i = 0; i < SL.CARD_POOL.length; i++) total += SL.CARD_POOL[i].w;
    var v = Math.random() * total;
    for (i = 0; i < SL.CARD_POOL.length; i++) {
      v -= SL.CARD_POOL[i].w;
      if (v <= 0) return SL.CARD_POOL[i].key;
    }
    return SL.CARD_POOL[0].key;
  };

  Game.prototype.makeCard = function (key, sub) {
    var def = SL.CARD_DEFS[key];
    var c = {
      id: ++this.nextCardId, key: key, sub: sub || null,
      name: def.name, icon: def.icon, color: def.color, use: def.use, desc: def.desc
    };
    if (key === 'unit' && sub) {
      c.name = '单位卡 · ' + SL.UNIT_TYPES[sub].name;
      c.desc = '拖到地图：在友军 ' + SL.DEPLOY_RANGE + 'm 内生成' + SL.UNIT_TYPES[sub].name;
    } else if (key === 'equip' && sub) {
      c.name = '装备卡 · ' + SL.EQUIP[sub].name;
      c.desc = SL.EQUIP[sub].desc;
    }
    return c;
  };

  Game.prototype.drawCard = function (key, sub) {
    var c = this.makeCard(key || this.randomPoolKey(), sub);
    c = this.resolvePack(c);
    var hand = this.teams.blue.hand;
    hand.push(c);
    if (hand.length > SL.XP.handMax) hand.shift();
    return c;
  };

  Game.prototype.cardAt = function (id) {
    var hand = this.teams.blue.hand;
    for (var i = 0; i < hand.length; i++) if (hand[i].id === id) return hand[i];
    return null;
  };

  Game.prototype.discardCard = function (card) {
    var hand = this.teams.blue.hand;
    var idx = hand.indexOf(card);
    if (idx >= 0) { hand.splice(idx, 1); return true; }
    return false;
  };

  Game.prototype.removeItem = function (u, item) {
    var idx = u.items.indexOf(item);
    if (idx >= 0) {
      u.items.splice(idx, 1);
      this.updateCover(u);
      this.log(u.name + ' 丢弃 ' + SL.EQUIP[item.key].name, 'info');
      return true;
    }
    return false;
  };

  Game.prototype.useCard = function (card, target) {
    target = target || {};
    var hand = this.teams.blue.hand;
    var idx = hand.indexOf(card);
    if (idx < 0) return { ok: false, msg: '卡包中没有这张卡' };
    var res = { ok: false, msg: '' };
    var u = target.unit || null;
    var tx = target.x, ty = target.y;
    var self = this;

    function inside() {
      var m = SL.CONFIG.mapSize;
      return tx > 12 && tx < m - 12 && ty > 12 && ty < m - 12;
    }
    function blueUnit() { return u && u.alive && u.side === 'blue'; }

    switch (card.key) {
      case 'med':
        if (!blueUnit() || u.type !== 'infantry') { res.msg = '医疗包只能拖到步兵班身上'; break; }
        if (u.hp >= u.maxHp) { res.msg = '该班生命值已满'; break; }
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.45);
        this.fxText(u.x, u.y - 10, '+' + Math.round(u.maxHp * 0.45), '#9fe0a0');
        res.ok = true; res.msg = u.name + ' 恢复生命';
        break;
      case 'repair':
        if (!blueUnit() || u.type === 'infantry') { res.msg = '维修包只能拖到装甲单位'; break; }
        if (u.hp >= u.maxHp) { res.msg = '该单位生命值已满'; break; }
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.4);
        this.fxText(u.x, u.y - 10, '+' + Math.round(u.maxHp * 0.4), '#e8c47a');
        res.ok = true; res.msg = u.name + ' 恢复装甲';
        break;
      case 'unitpack':
        var sub = this.pickUnitType();
        this.drawCard('unit', sub);
        res.ok = true; res.msg = '获得 ' + SL.UNIT_TYPES[sub].name + ' 单位卡';
        break;
      case 'equippack':
        var ek = SL.pickEquipKey();
        this.drawCard('equip', ek);
        res.ok = true; res.msg = '获得 ' + SL.EQUIP[ek].name + ' 装备卡';
        break;
      case 'ammo':
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        this.spawnPlane('supply', tx, ty);
        res.ok = true; res.msg = '补给运输机已出发，正在部署补给点';
        break;
      case 'airstrike':
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        this.spawnPlane('airstrike', tx, ty);
        res.ok = true; res.msg = '空袭已呼叫';
        break;
      case 'artillery':
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        var msA = SL.CONFIG.mapSize;
        var sup = SL.SUPPORT;
        // 目标点向内收，保证 500m 直径的覆盖圈完整落在地图内
        tx = U.clamp(tx, sup.radius + 12, msA - sup.radius - 12);
        ty = U.clamp(ty, sup.radius + 12, msA - sup.radius - 12);
        var dlA = tx, drA = msA - tx, dtA = ty, dbA = msA - ty;
        var edgeA = Math.min(dlA, drA, dtA, dbA);
        var dirA = edgeA === dlA ? 0 : (edgeA === drA ? Math.PI : (edgeA === dtA ? Math.PI / 2 : -Math.PI / 2));
        dirA += (Math.random() - 0.5) * 0.16;
        this.strikes.push({
          x: tx, y: ty, side: 'blue', t: 0, next: 0, shots: sup.shots, dur: sup.duration,
          interval: sup.duration / sup.shots, dmg: sup.dmg, areaRadius: sup.radius,
          splash: sup.splash, ap: 1.2, dir: dirA,
          source: { side: 'blue', name: '炮火', kills: 0, score: 0 }
        });
        res.ok = true; res.msg = '炮火压制已呼叫';
        break;
      case 'recon':
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        var reconPlane = this.spawnPlane('recon', tx, ty);
        this.recons.push({ x: tx, y: ty, side: 'blue', r: SL.RECON_PLANE.radius, until: this.time + SL.RECON_PLANE.duration, plane: reconPlane });
        res.ok = true; res.msg = '侦察机已起飞';
        break;
      case 'airpatrol':
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        this.spawnAirPatrol(tx, ty, 'blue');
        res.ok = true; res.msg = '3 架战斗机已抵达，开始制空盘旋';
        break;
      case 'boss_hell':
      case 'boss_tank':
      case 'boss_ghost':
        if (!this.testMode) { res.msg = 'Boss 召唤卡仅限训练场'; break; }
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        if (card.key === 'boss_hell') this.spawnBossHell(tx, ty);
        else if (card.key === 'boss_tank') this.spawnBossSuper(tx, ty);
        else this.spawnBossGhost(tx, ty);
        res.ok = true; res.msg = 'Boss 已召唤';
        break;
      case 'unit':
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        var okNear = false;
        for (var i = 0; i < this.units.length; i++) {
          var f = this.units[i];
          if (f.alive && f.side === 'blue' && U.dist(f.x, f.y, tx, ty) <= SL.DEPLOY_RANGE) { okNear = true; break; }
        }
        if (!okNear && !this.testMode) { res.msg = '只能在友军单位 ' + SL.DEPLOY_RANGE + 'm 内生成'; break; }
        var nu = this.addUnit('blue', card.sub, tx, ty, SL.UNIT_TYPES[card.sub].name);
        nu.facing = -0.9;
        res.ok = true; res.msg = nu.name + ' 已部署';
        break;
      case 'equip':
        if (!blueUnit() || u.type !== 'infantry') { res.msg = '装备卡只能装备到步兵班'; break; }
        var eqDef = SL.EQUIP[card.sub];
        if (!eqDef) { res.msg = '未知装备'; break; }
        if (card.sub === 'engineer') {
          var eng = null;
          for (var ei = 0; ei < u.items.length; ei++) if (u.items[ei].key === 'engineer') { eng = u.items[ei]; break; }
          if (eng) {
            if ((eng.uses === undefined ? 1 : eng.uses) >= 1) {
              res.msg = '该班的工兵构建次数已满';
              break;
            }
            eng.uses = 1;
            this.updateCover(u);
            res.ok = true; res.msg = u.name + ' 补充了工兵构建次数';
            break;
          }
        }
        if (card.sub === 'sniper') {
          var oldSniper = null;
          for (var sni = 0; sni < u.items.length; sni++) {
            if (u.items[sni].key === 'sniper') { oldSniper = u.items[sni]; break; }
          }
          if (oldSniper) {
            oldSniper.uses = 1;
            this.updateCover(u);
            res.ok = true; res.msg = u.name + ' 的狙击侦察小组补充了隐蔽次数';
            break;
          }
        }
        if (u.items.length >= SL.INFANTRY_SLOTS) { res.msg = '物品栏已满（' + SL.INFANTRY_SLOTS + ' 格）'; break; }
        u.items.push({
          key: card.sub, ammo: eqDef.weapon ? eqDef.weapon.ammo : 0,
          hp: eqDef.heal || 0, uses: eqDef.uses || 0, cd: 0
        });
        this.updateCover(u);
        res.ok = true; res.msg = u.name + ' 装备 ' + eqDef.name;
        break;
      case 'target':
      case 'armor_target':
      case 'heavy_target':
        if (!this.testMode) { res.msg = '标靶卡仅限试验场使用'; break; }
        if (!inside()) { res.msg = '请拖到地图上'; break; }
        var targetSide = card.key === 'heavy_target' ? 'red' : 'neutral';
        var targetUnit = this.addUnit(targetSide, card.key, tx, ty, SL.UNIT_TYPES[card.key].name);
        targetUnit.neutral = targetSide === 'neutral';
        targetUnit.aggressive = false;
        targetUnit.frozenTarget = card.key === 'heavy_target';
        if (targetUnit.frozenTarget) targetUnit.fireMode = 'hold';
        res.ok = true; res.msg = SL.UNIT_TYPES[card.key].name + ' 已放置';
        break;
      case 'bunker':
      case 'mortar_nest':
      case 'at_gun_nest':
      case 'flak88': {
        if (!inside()) { res.msg = '请拖到强化工事区'; break; }
        var zone = T.zoneAt(tx, ty);
        if (!zone) { res.msg = '这里没有可用的阵地'; break; }
        if (zone.owner !== 'blue') { res.msg = '只能建在己方阵地'; break; }
        if (zone.kind === 'bush' || zone.kind === 'forest') { res.msg = '灌木/林地不能建工事'; break; }
        if (!zone.fortified) { res.msg = '需要先由工兵构筑强化工事'; break; }
        if (zone.rubble) { res.msg = '工事残骸需要工兵先修复'; break; }
        var zStructs = this.zoneStructures(zone);
        if (zStructs.length >= SL.FORT.maxStructures) {
          res.needsReplace = true;
          res.zone = zone;
          res.card = card;
          res.msg = '该阵地已装满工事，请选择要替换的工事';
          break;
        }
        var stInfo = this.fortCardInfo(card.key);
        if (!stInfo) { res.msg = '不是工事卡'; break; }
        var newStruct = { type: stInfo.type, hp: stInfo.hp, maxHp: stInfo.hp, ammo: stInfo.ammo, maxAmmo: stInfo.ammo, cd: this.fortPhaseFor(stInfo.type, zStructs.length) };
        zStructs.push(newStruct);
        zone.structure = zStructs[0];
        res.ok = true;
        res.msg = zone.name + ' 建起' + stInfo.name + '（' + zStructs.length + '/' + SL.FORT.maxStructures + '）';
        break;
      }
      default:
        res.msg = '未知卡片';
    }

    if (res.ok) {
      hand.splice(idx, 1);
      this.log(res.msg, 'order');
      if (SL.Audio) SL.Audio.card();
    }
    return res;
  };

  /* ---------------- 车轮战：重生 / 支援 / 补给 ---------------- */

  Game.prototype.spawnPlane = function (kind, tx, ty, side) {
    side = side || 'blue';
    if (SL.Audio) SL.Audio.plane(tx, ty);
    var ms = SL.CONFIG.mapSize;
    if (kind === 'recon') {
      var rp = {
        kind: 'recon', cx: tx, cy: ty, x: tx, y: ty - SL.RECON_PLANE.altitude, ang: -Math.PI / 2,
        rad: SL.RECON_PLANE.orbitRadius, t: 0, dur: SL.RECON_PLANE.duration, side: side,
        speed: SL.PLANE.reconSpeed,
        hp: SL.PLANE.reconHp, maxHp: SL.PLANE.reconHp, hitFlash: 0,
        evade: SL.PLANE.reconEvade
      };
      this.planes.push(rp);
      return rp;
    }
    // 从离目标最近的地图边缘进入，穿过后离场
    var dl = tx, dr = ms - tx, dtp = ty, db = ms - ty;
    var m = Math.min(dl, dr, dtp, db);
    var sx, sy, ex, ey;
    if (m === dl) { sx = -90; sy = ty + (Math.random() - 0.5) * 50; ex = ms + 200; ey = ty; }
    else if (m === dr) { sx = ms + 90; sy = ty + (Math.random() - 0.5) * 50; ex = -200; ey = ty; }
    else if (m === dtp) { sx = tx + (Math.random() - 0.5) * 50; sy = -90; ex = tx; ey = ms + 200; }
    else { sx = tx + (Math.random() - 0.5) * 50; sy = ms + 90; ex = tx; ey = -200; }
    var supplyPlane = kind === 'supply';
    var plane = {
      kind: supplyPlane ? 'supply' : 'airstrike', x: sx, y: sy, tx: tx, ty: ty, ex: ex, ey: ey,
      side: side, speed: supplyPlane ? SL.PLANE.supplySpeed : SL.PLANE.airstrikeSpeed, t: 0, dropped: false,
      bombRadius: supplyPlane ? 0 : SL.AIRSTRIKE.radius,
      hp: supplyPlane ? SL.PLANE.supplyHp : SL.PLANE.hp,
      maxHp: supplyPlane ? SL.PLANE.supplyHp : SL.PLANE.hp,
      evade: supplyPlane ? SL.PLANE.supplyEvade : 0,
      hitFlash: 0, heading: Math.atan2(ty - sy, tx - sx)
    };
    this.planes.push(plane);
    return plane;
  };

  Game.prototype.airstrikeBomb = function (x, y, side) {
    side = side || 'blue';
    var radius = SL.AIRSTRIKE.radius;
    if (SL.Audio) SL.Audio.explosion(radius, x, y);
    this.effects.push({ kind: 'blast', x: x, y: y, t: 0, dur: 1.3, r: radius, side: side });
    this.effects.push({ kind: 'explosion', x: x, y: y, t: 0, dur: 1.1, size: 80, side: side });
    var credit = { side: side, name: '空袭', kills: 0, score: 0 };
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive) continue;
      var d = U.dist(u.x, u.y, x, y);
      if (d > radius) continue;
      var falloff = 1 - 0.55 * (d / radius);
      this.damage(u, SL.AIRSTRIKE.damage * falloff * (u.def.armor ? 0.75 : 1), credit, 2);
    }
    // 空袭对工事造成 500 点直击攻坚伤害
    this.damageFortifications(x, y, SL.AIRSTRIKE.fortDamage, radius);
    this.damageSupplies(x, y, SL.AIRSTRIKE.supplyDamage, radius);
    if (side === 'blue') this.log('空袭命中', 'kill');
  };

  Game.prototype.findEnemyPlane = function (u) {
    var range = u.def.aaRange || 0;
    if (!range) return null;
    var best = null, bestD = range;
    for (var i = 0; i < this.planes.length; i++) {
      var p = this.planes[i];
      if (p.side === u.side || p.hp <= 0) continue;
      var d = U.dist(u.x, u.y, p.x, p.y);
      if (d <= bestD) { bestD = d; best = p; }
    }
    return best;
  };

  Game.prototype.damagePlane = function (p, dmg, source) {
    if (!p || p.hp <= 0) return;
    if (p.evade && Math.random() < p.evade) {
      p.hitFlash = 0.12;
      this.fxText(p.x, p.y - 12, '规避', '#d8e8b0');
      return;
    }
    p.hp -= dmg;
    p.hitFlash = 0.12;
    if (p.hp > 0) return;
    var idx = this.planes.indexOf(p);
    if (idx >= 0) this.planes.splice(idx, 1);
    this.recons = this.recons.filter(function (r) { return r.plane !== p; });
    this.effects.push({ kind: 'explosion', x: p.x, y: p.y, t: 0, dur: 0.9, size: 30, side: p.side });
    if (SL.Audio) SL.Audio.explosion(20, p.x, p.y);
    if (source && source.side === 'blue') {
      this.addXp('blue', 40);
      source.score += 20;
      this.addScore('blue', 20);
      this.stats.kills.blue = (this.stats.kills.blue || 0) + 1;
      if (p.boss) this.awardBossKill(p);
      this.feed.push({
        id: ++this.feedSeq, t: this.time, kind: 'kill',
        ks: 'blue', vs: p.side, xp: 40, score: 20,
        killer: source.name, victim: '飞机', text: '击落飞机'
      });
    }
  };

  Game.prototype.hellBomb = function (x, y, side) {
    var cfg = SL.BOSS.hell;
    if (SL.Audio) SL.Audio.explosion(cfg.bombRadius, x, y);
    this.effects.push({ kind: 'blast', x: x, y: y, t: 0, dur: 1.8, r: cfg.bombRadius, side: side });
    this.effects.push({ kind: 'explosion', x: x, y: y, t: 0, dur: 1.6, size: 160, side: side });
    var credit = { side: side, name: '地狱轰炸机', kills: 0, score: 0 };
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive) continue;
      var d = U.dist(u.x, u.y, x, y);
      if (d > cfg.bombRadius) continue;
      var frac = d <= cfg.coreRadius ? cfg.coreFrac : cfg.outerFrac;
      this.damage(u, u.maxHp * frac, credit, 9);
    }
    this.damageFortifications(x, y, cfg.fortDmg || 2500, cfg.bombRadius);
    this.damageSupplies(x, y, 5000, cfg.bombRadius);
  };

  Game.prototype.hellSmallBomb = function (x, y, side) {
    var cfg = SL.BOSS.hell;
    var radius = cfg.extraBombRadius || 75;
    var coreR = cfg.extraBombCoreRadius || 25;
    if (SL.Audio) SL.Audio.explosion(radius, x, y);
    this.effects.push({ kind: 'blast', x: x, y: y, t: 0, dur: 0.65, r: radius, side: side });
    this.effects.push({ kind: 'explosion', x: x, y: y, t: 0, dur: 0.7, size: 58, side: side });
    var credit = { side: side, name: '地狱轰炸机小航弹', kills: 0, score: 0 };
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side === side) continue;
      var d = U.dist(u.x, u.y, x, y);
      if (d > radius) continue;
      var frac = d <= coreR ? (cfg.extraBombCoreFrac || 0.2) : (cfg.extraBombOuterFrac || 0.1);
      this.damage(u, u.maxHp * frac, credit, 9);
    }
    this.damageFortifications(x, y, cfg.extraBombFortDmg || 600, radius);
    this.damageSupplies(x, y, cfg.extraBombSupplyDmg || 1000, radius);
  };

  Game.prototype.updateHellBomber = function (p, dt) {
    var cfg = SL.BOSS.hell, y = p.center || this.yellow;
    if (!p.extraBombDone && p.hp <= p.maxHp * (cfg.extraBombAt || 0.25)) {
      p.extraBombDone = true;
      p.extraBombsLeft = cfg.extraBombCount || 8;
      p.extraBombTimer = 0;
      this.fxText(y.x, y.y - y.r * 0.4, '8 枚航弹来袭', '#ffd08a');
      this.log('地狱轰炸机垂死挣扎：8 枚小航弹即将落入黄圈', 'loss');
    }
    // 半血以下：即使尚未飞到黄圈中心，也开始向黄圈随机投放小航弹
    if (p.extraBombsLeft > 0 && p.hp > 0) {
      p.extraBombTimer -= dt;
      if (p.extraBombTimer <= 0) {
        p.extraBombsLeft--;
        p.extraBombTimer = cfg.extraBombInterval || 0.6;
        var ea = Math.random() * Math.PI * 2;
        var er = Math.sqrt(Math.random()) * y.r * 0.9;
        this.hellSmallBomb(y.x + Math.cos(ea) * er, y.y + Math.sin(ea) * er, p.side);
      }
    }
    if (!p.dropped) {
      var dx = y.x - p.x, dy = y.y - p.y, d = Math.hypot(dx, dy);
      p.heading = Math.atan2(dy, dx);
      var step = p.speed * dt;
      if (d <= step + 2) {
        p.x = y.x; p.y = y.y; p.dropped = true;
        this.hellBomb(y.x, y.y, p.side);
        p.orbitAng = Math.PI;
      } else {
        p.x += dx / d * step; p.y += dy / d * step;
      }
      return;
    }
    p.orbitAng += cfg.orbitSpeed * dt;
    p.x = y.x + Math.cos(p.orbitAng) * p.orbitR;
    p.y = y.y + Math.sin(p.orbitAng) * p.orbitR;
    p.heading = p.orbitAng + Math.PI / 2;
    p.gunCd -= dt;
    if (p.gunCd <= 0) {
      p.gunCd = cfg.gunInterval;
      var targets = [];
      // 对地：400m，命中点 50m 溅射
      for (var i = 0; i < this.units.length; i++) {
        var u = this.units[i];
        if (!u.alive || u.side === p.side) continue;
        if (!this.unitVisibleTo(p.side, u)) continue;
        if (U.dist(u.x, u.y, p.x, p.y) > (cfg.gunGroundRange || 400)) continue;
        targets.push({ unit: u });
      }
      // 对空：520m，无溅射
      for (var pi = 0; pi < this.planes.length; pi++) {
        var ap = this.planes[pi];
        if (!ap || ap === p || ap.side === p.side || ap.hp <= 0) continue;
        if (U.dist(ap.x, ap.y, p.x, p.y) <= (cfg.gunAirRange || 520)) targets.push({ plane: ap });
      }
      if (targets.length) {
        var pick = targets[Math.floor(Math.random() * targets.length)];
        for (var g = 0; g < 2; g++) {
          var tx = pick.plane ? pick.plane.x : pick.unit.x;
          var ty = pick.plane ? pick.plane.y : pick.unit.y;
          this.effects.push({ kind: 'tracer', x1: p.x, y1: p.y, x2: tx, y2: ty, t: 0, dur: 0.06, side: p.side, heavy: false });
          if (pick.plane) {
            this.damagePlane(pick.plane, cfg.gunDmg, { side: p.side, name: '地狱轰炸机机炮', kills: 0, score: 0 });
          } else {
            var credit = { side: p.side, name: '地狱轰炸机机炮', kills: 0, score: 0 };
            this.damage(pick.unit, cfg.gunDmg, credit, 0.4);
            for (var si = 0; si < this.units.length; si++) {
              var su = this.units[si];
              if (!su.alive || su.side === p.side || su === pick.unit) continue;
              var sd = U.dist(su.x, su.y, tx, ty);
              if (sd > (cfg.gunSplash || 50)) continue;
              this.damage(su, cfg.gunDmg * (1 - 0.55 * sd / (cfg.gunSplash || 50)), credit, 0.4);
            }
            this.effects.push({ kind: 'blast', x: tx, y: ty, t: 0, dur: 0.35, r: cfg.gunSplash || 50, side: p.side });
          }
        }
      }
    }
  };

  Game.prototype.spawnAirPatrol = function (x, y, side) {
    side = side || 'blue';
    var cfg = SL.AIR_PATROL;
    for (var i = 0; i < cfg.count; i++) {
      var ang = (Math.PI * 2 / cfg.count) * i;
      this.planes.push({
        kind: 'fighter', name: '战斗机', cx: x, cy: y, ang: ang,
        orbitR: cfg.orbitRadius, x: x + Math.cos(ang) * cfg.orbitRadius,
        y: y + Math.sin(ang) * cfg.orbitRadius, heading: ang + Math.PI / 2,
        side: side, t: 0, dur: cfg.duration, gunCd: i * 0.25,
        interval: cfg.interval, damage: cfg.damage, range: cfg.radius,
        mode: 'orbit', targetPlane: null, formationSlot: i,
        jitterPhase: Math.random() * Math.PI * 2,
        hp: cfg.hp, maxHp: cfg.hp, evade: cfg.evade, hitFlash: 0,
        kills: 0, score: 0
      });
    }
    this.log('制空盘旋：3 架战斗机抵达目标空域', 'order');
  };

  Game.prototype.updateFighter = function (p, dt) {
    var cfg = SL.AIR_PATROL;
    if (p.t >= p.dur) return false;
    p.gunCd -= dt;

    // 目标离开制空圈或坠毁，恢复盘旋
    if (p.targetPlane) {
      var tp = p.targetPlane;
      if (!tp || tp.hp <= 0 || this.planes.indexOf(tp) < 0 ||
        U.dist(tp.x, tp.y, p.cx, p.cy) > cfg.radius) {
        p.targetPlane = null;
        p.mode = 'orbit';
      }
    }
    if (!p.targetPlane) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < this.planes.length; i++) {
        var e = this.planes[i];
        if (e === p || e.side === p.side || e.hp <= 0) continue;
        var d = U.dist(p.cx, p.cy, e.x, e.y);
        if (d > cfg.radius || d >= bestD) continue;
        best = e; bestD = d;
      }
      if (best) {
        p.targetPlane = best;
        p.mode = 'chase';
      }
    }

    var desiredX, desiredY;
    if (p.targetPlane) {
      var t = p.targetPlane;
      // 品字追击：长机在敌机后 100m，两架僚机稍靠后并左右展开，带轻微浮动
      var fwd = t.heading || 0;
      var slot = p.formationSlot || 0;
      var back = (cfg.tailDistance || 100) + (slot === 0 ? 0 : 24);
      var lateral = slot === 0 ? 0 : (slot === 1 ? -34 : 34);
      var jitter = cfg.jitter || 0;
      var jx = Math.sin(p.t * 1.7 + (p.jitterPhase || 0)) * jitter;
      var jy = Math.cos(p.t * 1.3 + (p.jitterPhase || 0) * 1.7) * jitter;
      desiredX = t.x - Math.cos(fwd) * back + Math.cos(fwd + Math.PI / 2) * (lateral + jx) + Math.cos(fwd) * jy;
      desiredY = t.y - Math.sin(fwd) * back + Math.sin(fwd + Math.PI / 2) * (lateral + jx) + Math.sin(fwd) * jy;
      var dx = desiredX - p.x, dy = desiredY - p.y;
      var d = Math.hypot(dx, dy);
      if (d > 1) {
        var step = cfg.chaseSpeed * dt;
        p.x += dx / d * Math.min(step, d);
        p.y += dy / d * Math.min(step, d);
      }
      p.heading = Math.atan2(t.y - p.y, t.x - p.x);
      if (p.gunCd <= 0 && U.dist(p.x, p.y, t.x, t.y) <= cfg.radius) {
        p.gunCd = cfg.interval;
        this.effects.push({
          kind: 'tracer', x1: p.x, y1: p.y, x2: t.x, y2: t.y,
          t: 0, dur: 0.08, side: p.side, heavy: false
        });
        this.damagePlane(t, p.damage, p);
      }
    } else {
      // 无对空目标：仍可扫射地面步兵和装甲车
      if (p.gunCd <= 0) {
        var bestGround = null, bestGD = Infinity;
        for (var gi = 0; gi < this.units.length; gi++) {
          var gu = this.units[gi];
          if (!gu.alive || gu.side === p.side) continue;
          if (gu.type !== 'infantry' && gu.type !== 'armored' &&
            gu.type !== 'artillery' && gu.type !== 'heavy_arty' && gu.type !== 'rocket_arty') continue;
          var gd = U.dist(p.x, p.y, gu.x, gu.y);
          if (gd <= (cfg.groundRange || 300) && gd < bestGD) { bestGD = gd; bestGround = gu; }
        }
        if (bestGround) {
          p.gunCd = cfg.groundInterval || 0.6;
          p.heading = Math.atan2(bestGround.y - p.y, bestGround.x - p.x);
          this.effects.push({
            kind: 'tracer', x1: p.x, y1: p.y, x2: bestGround.x, y2: bestGround.y,
            t: 0, dur: 0.08, side: p.side, heavy: false
          });
          this.damage(bestGround, cfg.groundDamage || 15,
            { side: p.side, name: '战斗机扫射', kills: 0, score: 0 }, 1.2);
        }
      }
      // 无目标：沿直径 500m 的制空圈盘旋
      p.ang += cfg.orbitSpeed * dt;
      desiredX = p.cx + Math.cos(p.ang) * p.orbitR;
      desiredY = p.cy + Math.sin(p.ang) * p.orbitR;
      var rdx = desiredX - p.x, rdy = desiredY - p.y;
      var rd = Math.hypot(rdx, rdy);
      if (rd > 2) {
        var rstep = cfg.chaseSpeed * dt;
        p.x += rdx / rd * Math.min(rstep, rd);
        p.y += rdy / rd * Math.min(rstep, rd);
      } else {
        p.x = desiredX; p.y = desiredY;
      }
      p.heading = p.ang + Math.PI / 2;
    }
    return true;
  };

  Game.prototype.updatePlanes = function (dt) {
    var ms = SL.CONFIG.mapSize;
    for (var i = this.planes.length - 1; i >= 0; i--) {
      var p = this.planes[i];
      p.t += dt;
      if (p.hitFlash > 0) p.hitFlash -= dt;
      if (p.kind === 'fighter') {
        if (!this.updateFighter(p, dt)) this.planes.splice(i, 1);
        continue;
      }
      if (p.kind === 'recon') {
        p.ang += p.speed * dt;
        p.x = p.cx + Math.cos(p.ang) * p.rad;
        p.y = p.cy + Math.sin(p.ang) * p.rad;
        p.heading = p.ang + Math.PI / 2;
        if (p.t >= p.dur) this.planes.splice(i, 1);
        continue;
      }
      if (p.kind === 'hellBomber') {
        this.updateHellBomber(p, dt);
        continue;
      }
      if (!p.dropped) {
        var dx = p.tx - p.x, dy = p.ty - p.y;
        var d = U.len(dx, dy);
        p.heading = Math.atan2(dy, dx);
        var step = p.speed * dt;
        if (d <= step + 2) {
          p.x = p.tx; p.y = p.ty;
          p.dropped = true;
          if (p.kind === 'supply') this.deploySupply(p.tx, p.ty, p.side);
          else this.airstrikeBomb(p.bombTx != null ? p.bombTx : p.tx,
            p.bombTy != null ? p.bombTy : p.ty, p.side);
        } else {
          p.x += dx / d * step;
          p.y += dy / d * step;
        }
      } else {
        var ex = p.ex - p.x, ey = p.ey - p.y;
        var ed = U.len(ex, ey);
        p.heading = Math.atan2(ey, ex);
        p.x += ex / (ed || 1) * p.speed * dt;
        p.y += ey / (ed || 1) * p.speed * dt;
        if (p.x < -160 || p.x > ms + 160 || p.y < -160 || p.y > ms + 160) this.planes.splice(i, 1);
      }
    }
  };

  Game.prototype.updateStrikes = function (dt) {
    var ms = SL.CONFIG.mapSize;
    for (var i = this.strikes.length - 1; i >= 0; i--) {
      var s = this.strikes[i];
      s.t += dt;
      if (s.shots > 0 && s.t >= s.next) {
        s.next += s.interval || 0.8;
        s.shots--;
        var ang = Math.random() * Math.PI * 2;
        var rad = (s.areaRadius || s.scatter || 100) * Math.sqrt(Math.random());
        var x1 = U.clamp(s.x + Math.cos(ang) * rad, 8, ms - 8);
        var y1 = U.clamp(s.y + Math.sin(ang) * rad, 8, ms - 8);
        var dir = s.dir === undefined ? 0 : s.dir;
        this.shells.push({
          x0: U.clamp(x1 - Math.cos(dir) * 700, -200, ms + 200),
          y0: U.clamp(y1 - Math.sin(dir) * 700, -200, ms + 200),
          x1: x1, y1: y1, t: 0, dur: 1.5,
          dmg: s.dmg || 70, radius: s.splash || s.radius || 30, ap: s.ap || 1,
          side: s.side, source: s.source || null
        });
      }
      if (s.shots <= 0 && s.t >= s.dur) this.strikes.splice(i, 1);
    }
  };

  Game.prototype.deploySupply = function (x, y, side) {
    side = side || 'blue';
    this.supplies.push({
      x: x, y: y, side: side, r: SL.SUPPLY.radius,
      ammo: SL.SUPPLY.ammo, ammoMax: SL.SUPPLY.ammo,
      hp: SL.SUPPLY.hp, hpMax: SL.SUPPLY.hp,
      boxHp: SL.SUPPLY.boxHp, boxMaxHp: SL.SUPPLY.boxHp, t: 0
    });
    this.effects.push({ kind: 'explosion', x: x, y: y, t: 0, dur: 0.45, size: 18, side: side });
    if (SL.Audio) SL.Audio.repair(x, y);
    this.log('补给箱空投完成', 'order');
  };

  Game.prototype.destroySupply = function (s) {
    var idx = this.supplies.indexOf(s);
    if (idx < 0) return;
    this.supplies.splice(idx, 1);
    this.effects.push({ kind: 'blast', x: s.x, y: s.y, t: 0, dur: 0.9, r: 75, side: s.side });
    this.effects.push({ kind: 'explosion', x: s.x, y: s.y, t: 0, dur: 0.75, size: 42, side: s.side });
    if (SL.Audio) SL.Audio.explosion(45, s.x, s.y);
    this.log('补给箱被摧毁', 'loss');
  };

  Game.prototype.damageSupplies = function (x, y, dmg, radius) {
    for (var i = this.supplies.length - 1; i >= 0; i--) {
      var s = this.supplies[i];
      var d = U.dist(x, y, s.x, s.y);
      if (d > (radius || 20)) continue;
      s.boxHp = (s.boxHp === undefined ? SL.SUPPLY.boxHp : s.boxHp) - dmg;
      if (s.boxHp <= 0) this.destroySupply(s);
    }
  };

  Game.prototype.updateSupplies = function (dt) {
    for (var i = this.supplies.length - 1; i >= 0; i--) {
      var s = this.supplies[i];
      s.t += dt;
      if (s.t < 0.5) continue;
      s.t -= 0.5;
      if (s.hp === undefined) s.hp = 0;

      // 弹药
      if (s.ammo > 0) {
        for (var k = 0; k < this.units.length; k++) {
          var u = this.units[k];
          if (!u.alive || u.side !== s.side) continue;
          if (U.dist(u.x, u.y, s.x, s.y) > s.r) continue;
          // 工程车在补给点消耗弹药补充工程值
          if (u.type === 'engineer_vehicle' && u.engineerValue < u.engineerMax && s.ammo > 0) {
            var engAdd = Math.min(SL.ENGINEER.refillRate * 0.5,
              u.engineerMax - u.engineerValue, s.ammo / Math.max(1, SL.ENGINEER.refillAmmoCost));
            if (engAdd > 0) {
              u.engineerValue += engAdd;
              s.ammo -= engAdd * (SL.ENGINEER.refillAmmoCost || 1);
            }
          }
          if (u.ammo >= u.ammoMax) continue;
          var add = Math.min(SL.SUPPLY.ammoRate, u.ammoMax - u.ammo, s.ammo);
          u.ammo += add;
          s.ammo -= add;
          if (s.ammo <= 0) break;
        }
      }

      // 医疗步兵 / 维修车辆
      if (s.hp > 0) {
        for (var m = 0; m < this.units.length; m++) {
          var med = this.units[m];
          if (!med.alive || med.side !== s.side) continue;
          if (U.dist(med.x, med.y, s.x, s.y) > s.r) continue;
          if (med.hp >= med.maxHp) continue;
          var rate = med.type === 'infantry' ? SL.SUPPLY.infantryHeal : SL.SUPPLY.vehicleRepair;
          var mend = Math.min(rate * 0.5, med.maxHp - med.hp, s.hp);
          med.hp += mend;
          s.hp -= mend;
          if (s.hp <= 0) break;
        }
      }

      // 补给站：工事弹药 / 工事维修
      for (var zi = 0; zi < T.zones.length; zi++) {
        var z = T.zones[zi];
        if (!z.owner || z.owner !== s.side) continue;
        if (U.dist(z.x, z.y, s.x, s.y) > s.r + z.r) continue;
        var zsStructs = this.zoneStructures(z);
        if (zsStructs.length) {
          for (var zsi = 0; zsi < zsStructs.length; zsi++) {
            var zst = zsStructs[zsi];
            if (zst.ammo < zst.maxAmmo && s.ammo > 0) {
              var addA = Math.min(SL.SUPPLY.ammoRate, zst.maxAmmo - zst.ammo, s.ammo);
              zst.ammo += addA;
              s.ammo -= addA;
            }
            if (zst.hp < zst.maxHp && s.hp > 0) {
              var mendS = Math.min(SL.SUPPLY.vehicleRepair * 0.5, zst.maxHp - zst.hp, s.hp);
              zst.hp += mendS;
              s.hp -= mendS;
            }
          }
        } else if (z.fortified && !z.rubble && z.hp < z.maxHp && s.hp > 0) {
          var mendZ = Math.min(SL.SUPPLY.vehicleRepair * 0.5, z.maxHp - z.hp, s.hp);
          z.hp += mendZ;
          s.hp -= mendZ;
        }
        if (s.ammo <= 0 && s.hp <= 0) break;
      }

      if (s.ammo <= 0 && s.hp <= 0) this.supplies.splice(i, 1);
    }
  };

  Game.prototype.updateRecons = function () {
    for (var i = this.recons.length - 1; i >= 0; i--) {
      if (this.time >= this.recons[i].until) this.recons.splice(i, 1);
    }
  };

  Game.prototype.purgeDead = function (side) {
    var keep = [];
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.alive || u.side !== side) { keep.push(u); continue; }
      if (u.score > 0) keep.push(u);   // 保留上过分数的老兵，供积分榜显示
    }
    this.units = keep;
    // 控制单位总数，避免长时间车轮战后无限增长
    if (this.units.length > 260) {
      var dead = this.units.filter(function (x) { return !x.alive; })
        .sort(function (a, b) { return a.score - b.score; });
      var remove = this.units.length - 240;
      for (var k = 0; k < dead.length && remove > 0; k++) {
        var idx = this.units.indexOf(dead[k]);
        if (idx >= 0) { this.units.splice(idx, 1); remove--; }
      }
    }
  };

  Game.prototype.updateTeams = function (dt) {
    void dt;
    for (var i = 0; i < SL.SIDE_ORDER.length; i++) {
      var side = SL.SIDE_ORDER[i];
      if (this.mode === 'lastStand' && side !== 'blue') continue;
      var t = this.teams[side];
      if (!t.respawnAt || this.time < t.respawnAt) continue;
      t.respawnAt = 0;
      this.purgeDead(side);
      var at = (this.mode === 'lastStand' && side === 'blue' && this.defense)
        ? this.defense.blueSpawn : this.findSafeSpawn(side);
      if (side === 'blue') {
        // 玩家：固定基础连队 6 个单位，等级清零，卡包保留；清零后才能重新升级抽卡
        this.spawnCompany(side, at, 1);
        t.level = 1;
        t.xp = 0;
        t.nextXp = SL.XP.first;
      } else {
        // AI 连队：等级保留，按当前等级生成更大编制
        this.spawnCompany(side, at, t.level, true);
        this.tryMeleeRespawnBoss(side);
      }
      this.log(SL.SIDES[side].name + ' 重生', side === 'blue' ? 'order' : 'info');
    }
  };

  Game.prototype.activeBosses = function () {
    var out = [], groups = {};
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive) continue;
      if (u.bossKind === 'super') {
        out.push({ name: u.name, hp: u.hp, maxHp: u.maxHp, side: u.side, kind: 'super' });
      } else if (u.bossKind === 'ghost') {
        var key = u.bossGroup || ('ghost_' + u.side);
        if (!groups[key]) {
          groups[key] = {
            name: '幽灵兵团', hp: 0, maxHp: SL.BOSS.ghost.count * SL.BOSS.ghost.hp,
            side: u.side, kind: 'ghost', count: 0
          };
          out.push(groups[key]);
        }
        groups[key].hp += u.hp;
        groups[key].count++;
      }
    }
    for (var p = 0; p < this.planes.length; p++) {
      var pl = this.planes[p];
      if (pl.boss && pl.kind === 'hellBomber') {
        out.push({ name: pl.name || SL.BOSS.hell.name, hp: pl.hp, maxHp: pl.maxHp, side: pl.side, kind: 'hell' });
      }
    }
    return out;
  };

  Game.prototype.leaderboard = function (n) {
    var list = this.units.filter(function (u) { return u.score > 0; });
    list.sort(function (a, b) { return b.score - a.score || b.kills - a.kills; });
    return list.slice(0, n || 10);
  };

  Game.prototype.updateRocketQueues = function (dt) {
    void dt;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || !u.rocketQueue || !u.rocketQueue.length) continue;
      while (u.rocketQueue.length && this.time >= u.rocketQueue[0].at) {
        var q = u.rocketQueue.shift();
        var w = q.weapon || u.def.weapon;
        var sc = w.fixedScatter ? (w.scatter || 0) : this.scatterAtRange(w.scatter || 100, U.dist(u.x, u.y, q.tx, q.ty), w.range || u.def.range);
        var ang = Math.random() * Math.PI * 2;
        var rad = sc * Math.sqrt(Math.random());
        var ms = SL.CONFIG.mapSize;
        var tx = U.clamp(q.tx + Math.cos(ang) * rad, 10, ms - 10);
        var ty = U.clamp(q.ty + Math.sin(ang) * rad, 10, ms - 10);
        var flightD = U.dist(u.x, u.y, tx, ty);
        this.shells.push({
          x0: u.x, y0: u.y, x1: tx, y1: ty,
          t: 0,
          dur: U.clamp(flightD / 150 + 0.7, 0.8, 2.6),
          dmg: w.dmg, radius: w.splash, ap: w.ap,
          mortar: !!w.mortar, side: u.side, source: u
        });
        this.effects.push({ kind: 'muzzle', x: u.x, y: u.y, a: u.turret, t: 0, dur: 0.1, size: 10, side: u.side });
        if (SL.Audio) SL.Audio.shot(w, u, false, u.x, u.y);
      }
    }
  };

  Game.prototype.updateShells = function (dt) {
    for (var i = this.shells.length - 1; i >= 0; i--) {
      var s = this.shells[i];
      s.t += dt;
      if (s.t >= s.dur) {
        this.explode(s);
        this.shells.splice(i, 1);
      }
    }
  };

  Game.prototype.explode = function (s) {
    if (SL.Audio) SL.Audio.explosion(s.radius || 30, s.x1, s.y1);
    this.effects.push({ kind: 'blast', x: s.x1, y: s.y1, t: 0, dur: 1.0, r: s.radius, side: s.side });
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive) continue;
      var d = U.dist(u.x, u.y, s.x1, s.y1);
      if (d > s.radius) continue;
      var falloff = 1 - 0.62 * (d / s.radius);
      var ap = s.ap || 1;
      var direct = d <= Math.min(12, s.radius * 0.3);
      var mult = u.def.armor ? (direct ? ap : 0.5 * ap) : 1;
      if (u.side === s.side) mult *= 0.5;
      this.damage(u, s.dmg * falloff * mult, s.source, ap, !!(s.mortar && direct));
    }
    // 迫击炮没有攻坚能力；其他炮弹直击工事造成 200 点伤害
    if (!s.mortar) this.damageFortifications(s.x1, s.y1, 200, s.radius);
    this.damageBarrierFromArea(s.x1, s.y1, s.radius, s.mortar ? 90 : 240, s.source);
    this.damageSupplies(s.x1, s.y1, s.dmg, s.radius);
  };

  Game.prototype.updateBombs = function (dt) {
    for (var i = this.bombs.length - 1; i >= 0; i--) {
      var b = this.bombs[i];
      b.t += dt;
      if (b.t < b.dur) continue;
      this.bombs.splice(i, 1);
      for (var k = 0; k < this.units.length; k++) {
        var u = this.units[k];
        if (!u.alive || u.side === b.side) continue;
        var d = U.dist(u.x, u.y, b.x, b.y);
        if (d > b.radius) continue;
        var fall = 1 - 0.5 * (d / b.radius);
        this.damage(u, b.dmg * fall, b.source, 9);
      }
      this.damageFortifications(b.x, b.y, 250, b.radius);
      this.damageBarrierFromArea(b.x, b.y, b.radius, 260, b.source);
      this.damageSupplies(b.x, b.y, 300, b.radius);
      this.effects.push({ kind: 'explosion', x: b.x, y: b.y, t: 0, dur: 1.1, size: 80, side: b.side });
      this.effects.push({ kind: 'blast', x: b.x, y: b.y, t: 0, dur: 1.1, r: b.radius, side: b.side });
      if (SL.Audio) SL.Audio.explosion(b.radius, b.x, b.y);
    }
  };

  Game.prototype.updateEffects = function (dt) {
    for (var i = this.effects.length - 1; i >= 0; i--) {
      var e = this.effects[i];
      e.t += dt;
      if (e.t >= e.dur) this.effects.splice(i, 1);
    }
    for (var k = 0; k < this.wrecks.length; k++) this.wrecks[k].t += dt;
    var maxEffects = (SL.PERF && SL.PERF.maxEffects) || 280;
    if (this.effects.length > maxEffects) {
      this.effects.splice(0, this.effects.length - maxEffects);
    }
  };

  /* ---------------- 敌方 AI ---------------- */

  Game.prototype.nearestVisibleEnemy = function (u, radius) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side) continue;
      var d = U.dist(u.x, u.y, e.x, e.y);
      if (d <= radius && d < bestD) { best = e; bestD = d; }
    }
    return best;
  };

  /* 己方任何单位看见、且在本单位交战范围内的最近敌人 */
  Game.prototype.nearestSpottedEnemy = function (u, radius) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side) continue;
      var d = U.dist(u.x, u.y, e.x, e.y);
      if (d > radius || d >= bestD) continue;
      if (!this.unitVisibleTo(u.side, e)) continue;
      best = e;
      bestD = d;
    }
    return best;
  };

  Game.prototype.updateAI = function (dt) {
    this.aiTimer -= dt;
    if (this.aiTimer > 0) return;
    this.aiTimer = 0.5;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side === 'neutral') continue;
      if (SL.SIDES[u.side].ai || this.demo) this.aiUnit(u);
    }
    this.updateAIAir();
  };

  Game.prototype.updateAIAir = function () {
    if (this.mode === 'lastStand') {
      var d = this.defense;
      if (!d || !d.airQueue || !d.airQueue.length) return;
      while (d.airQueue.length && this.time >= d.airQueue[0].at) {
        var group = d.airQueue.shift();
        if (this.aliveCount('red') === 0) continue;
        var count = Math.max(1, group.count || 1);
        var cang = Math.random() * Math.PI * 2;
        var crad = Math.sqrt(Math.random()) * this.yellow.r * 0.55;
        var ctx0 = this.yellow.x + Math.cos(cang) * crad;
        var cty0 = this.yellow.y + Math.sin(cang) * crad;
        for (var gi = 0; gi < count; gi++) {
          var plane = this.spawnPlane('airstrike', ctx0, cty0, 'red');
          var bang = Math.random() * Math.PI * 2;
          var brad = Math.sqrt(Math.random()) * this.yellow.r * 0.9;
          plane.bombTx = this.yellow.x + Math.cos(bang) * brad;
          plane.bombTy = this.yellow.y + Math.sin(bang) * brad;
          // 三角形编队：后排逐渐展开，整体随长机掠过黄圈
          var row = Math.floor((Math.sqrt(8 * gi + 1) - 1) / 2);
          var inRow = gi - row * (row + 1) / 2;
          var lat = (inRow - row / 2) * 32;
          var back = row * 34;
          var hd = plane.heading || 0;
          plane.x -= Math.cos(hd) * back + Math.cos(hd + Math.PI / 2) * lat;
          plane.y -= Math.sin(hd) * back + Math.sin(hd + Math.PI / 2) * lat;
        }
      }
      return;
    }
    var air = SL.AI_AIR;
    for (var si = 1; si < SL.SIDE_ORDER.length; si++) {
      var side = SL.SIDE_ORDER[si];
      if (this.mode === 'lastStand' && side !== 'red') continue;
      var t = this.teams[side];
      if (t.airTimer === undefined) t.airTimer = 30 + Math.random() * 50;
      t.airTimer -= 0.5;
      if (t.airTimer > 0) continue;
      t.airTimer = air.minGap + Math.random() * (air.maxGap - air.minGap);
      if (Math.random() > air.chance) continue;
      if (this.aliveCount(side) === 0 || this.planes.length >= 3) continue;
      var tx, ty;
      if (this.yellow && this.yellow.active) {
        tx = this.yellow.x; ty = this.yellow.y;
      } else {
        var cnt = 0, sx = 0, sy = 0;
        for (var k = 0; k < this.units.length; k++) {
          var e = this.units[k];
          if (!e.alive || e.side === side) continue;
          sx += e.x; sy += e.y; cnt++;
        }
        tx = cnt ? sx / cnt : SL.CONFIG.mapSize / 2;
        ty = cnt ? sy / cnt : SL.CONFIG.mapSize / 2;
      }
      tx += (Math.random() - 0.5) * 80;
      ty += (Math.random() - 0.5) * 80;
      this.spawnPlane('airstrike', tx, ty, side);
    }
  };

  Game.prototype.aiUnit = function (u) {
    // 正在拆除障碍时不要被下一次 AI 决策覆盖
    if (u.order && u.order.kind === 'attackBarrier' &&
      u.order.target && u.order.target.alive) return;
    var aggro = this.mode === 'melee' ? this.meleeMods().aggro : 1;
    var enemy = this.nearestSpottedEnemy(u, Math.max(u.maxRangeNow || u.def.range, u.def.vision) * aggro);
    if (enemy) {
      u.lastSeen = { x: enemy.x, y: enemy.y, t: this.time };
      var d = U.dist(u.x, u.y, enemy.x, enemy.y);
      if (u.type === 'artillery' || u.type === 'heavy_arty') {
        if (d < u.def.minRange + 20) {
          var ax = u.x - enemy.x, ay = u.y - enemy.y;
          var L = U.len(ax, ay) || 1;
          u.order = {
            kind: 'move',
            x: U.clamp(u.x + ax / L * 110, 20, SL.CONFIG.mapSize - 20),
            y: U.clamp(u.y + ay / L * 110, 20, SL.CONFIG.mapSize - 20)
          };
        } else {
          u.order = null;
        }
      } else if (d > u.maxRangeNow * 0.82) {
        u.order = { kind: 'attackMove', x: enemy.x, y: enemy.y };
      } else {
        u.order = null;
      }
      return;
    }

    // 黄圈为 AI 最高优先级；黄圈窗口结束后才去争夺占领区
    if (u.side !== 'blue' && this.yellow && this.yellow.active) {
      var y = this.yellow;
      var yd = U.dist(u.x, u.y, y.x, y.y);
      if (yd > Math.min(110, y.r * 0.4)) {
        u.order = { kind: 'attackMove', x: y.x, y: y.y };
      } else {
        u.order = null;
      }
      return;
    }

    // 无敌情时，步兵就近进入未占领的阵地
    if (u.type === 'infantry' && !u.aggressive) {
      var zone = this.nearestFreeZone(u);
      if (zone) {
        u.order = { kind: 'move', x: zone.x, y: zone.y };
        return;
      }
    }

    // 长时间没有接触的进攻单位会去最后发现敌人的位置搜索
    if (u.aggressive && u.idle > 14 / aggro && u.lastSeen) {
      var lx = u.lastSeen.x, ly = u.lastSeen.y;
      if (U.dist(u.x, u.y, lx, ly) > 30) {
        u.order = { kind: 'attackMove', x: lx, y: ly };
        return;
      }
    }

    if (u.aggressive && u.objective) {
      if (!u.order && U.dist(u.x, u.y, u.objective.x, u.objective.y) > 24) {
        u.order = { kind: 'attackMove', x: u.objective.x, y: u.objective.y };
      }
    }
  };

  Game.prototype.nearestFreeZone = function (u) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < T.zones.length; i++) {
      var z = T.zones[i];
      if (z.owner === u.side) continue;
      var d = U.dist(u.x, u.y, z.x, z.y);
      if (d < 160 && d > z.r * 0.5 && d < bestD) { best = z; bestD = d; }
    }
    return best;
  };

  /* ---------------- 视野迷雾 ---------------- */

  Game.prototype.isSeen = function (x, y) {
    var res = this.fog.res;
    var i = Math.floor(x / SL.CONFIG.mapSize * res);
    var j = Math.floor(y / SL.CONFIG.mapSize * res);
    if (i < 0 || j < 0 || i >= res || j >= res) return true;
    return this.fog.seen[j * res + i] === 1;
  };

  Game.prototype.revealFogCircle = function (cx0, cy0, r) {
    var res = this.fog.res;
    var cell = SL.CONFIG.mapSize / res;
    var vis = this.fog.vis, seen = this.fog.seen;
    var i0 = U.clamp(Math.floor((cx0 - r) / cell), 0, res - 1);
    var i1 = U.clamp(Math.ceil((cx0 + r) / cell), 0, res - 1);
    var j0 = U.clamp(Math.floor((cy0 - r) / cell), 0, res - 1);
    var j1 = U.clamp(Math.ceil((cy0 + r) / cell), 0, res - 1);
    var r2 = r * r;
    for (var j = j0; j <= j1; j++) {
      var cy = (j + 0.5) * cell;
      for (var k = i0; k <= i1; k++) {
        var cx = (k + 0.5) * cell;
        var dx = cx - cx0, dy = cy - cy0;
        if (dx * dx + dy * dy <= r2) {
          vis[j * res + k] = 1;
          seen[j * res + k] = 1;
        }
      }
    }
  };

  Game.prototype.computeFog = function () {
    var f = this.fog;
    f.vis.fill(0);
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.alive || u.side !== 'blue') continue;
      this.revealFogCircle(u.x, u.y, this.unitVision(u));
    }
    for (var k = 0; k < this.recons.length; k++) {
      var r = this.recons[k];
      if (r.side !== 'blue' || this.time >= r.until) continue;
      this.revealFogCircle(r.x, r.y, r.r);
    }
    for (var pi = 0; pi < this.planes.length; pi++) {
      var pl = this.planes[pi];
      if (!pl || pl.hp <= 0 || pl.side !== 'blue' || pl.kind !== 'recon') continue;
      this.revealFogCircle(pl.x, pl.y, SL.PLANE.vision || 200);
    }
    // 只有迷雾像素真的变化时才递增版本，避免离屏画布每个 tick 都被重绘
    var n = f.vis.length;
    if (!f.prevVis || f.prevVis.length !== n) {
      f.prevVis = new Uint8Array(n);
      f.prevSeen = new Uint8Array(n);
    }
    var changed = false;
    for (var p = 0; p < n; p++) {
      if (f.vis[p] !== f.prevVis[p] || f.seen[p] !== f.prevSeen[p]) {
        changed = true;
        f.prevVis[p] = f.vis[p];
        f.prevSeen[p] = f.seen[p];
      }
    }
    if (changed) f.version++;
  };

  Game.prototype.resetFogCanvas = function () {
    var f = this.fog;
    f.canvas = null;
    f.ctx = null;
    f.image = null;
    f.builtVersion = -1;
    f.bornAt = 0;
    f.createdAt = 0;
    f.forceFallbackUntil = 0;
  };

  Game.prototype.buildFogCanvas = function () {
    if (typeof document === 'undefined') return;
    var f = this.fog;
    try {
      if (!f.canvas) {
        f.canvas = document.createElement('canvas');
        f.canvas.width = f.res;
        f.canvas.height = f.res;
        f.ctx = f.canvas.getContext('2d');
        f.image = f.ctx.createImageData(f.res, f.res);
        f.createdAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      }
      var res = f.res;
      var n = res * res;
      var alpha = this._fogA || (this._fogA = new Float32Array(n));
      var tmp = this._fogB || (this._fogB = new Float32Array(n));
      for (var i = 0; i < n; i++) {
        alpha[i] = f.vis[i] ? 0 : (f.seen[i] ? 58 : 198);
      }

      var radius = 2;
      var i2, j2, k, sum, cnt;
      for (var y = 0; y < res; y++) {
        var row = y * res;
        for (var x = 0; x < res; x++) {
          sum = 0; cnt = 0;
          for (k = -radius; k <= radius; k++) {
            i2 = x + k;
            if (i2 < 0 || i2 >= res) continue;
            sum += alpha[row + i2]; cnt++;
          }
          tmp[row + x] = sum / cnt;
        }
      }
      for (var x2 = 0; x2 < res; x2++) {
        for (var y3 = 0; y3 < res; y3++) {
          sum = 0; cnt = 0;
          for (k = -radius; k <= radius; k++) {
            j2 = y3 + k;
            if (j2 < 0 || j2 >= res) continue;
            sum += tmp[j2 * res + x2]; cnt++;
          }
          alpha[y3 * res + x2] = sum / cnt;
        }
      }

      var data = f.image.data;
      for (var p = 0; p < n; p++) {
        var idx = p * 4;
        data[idx] = 10;
        data[idx + 1] = 14;
        data[idx + 2] = 18;
        data[idx + 3] = alpha[p];
      }
      f.ctx.putImageData(f.image, 0, 0);
      f.builtVersion = f.version;
    } catch (e) {
      // 上下文失效时丢弃整张离屏画布，下一帧重建
      this.resetFogCanvas();
      throw e;
    }
  };

  /* ---------------- 车轮战：没有胜负，只有重生 ---------------- */

  Game.prototype.checkEnd = function () {
    // 无限模式：任何一方全灭都会在 updateTeams 中安排重生
  };

  Game.prototype.restart = function () {
    nextId = 1;
    return new Game({ demo: this.demo });
  };
})(window);
