/* 钢线 1944 — HUD / 小地图 / 单位详情 */
(function () {
  'use strict';
  var SL = window.SL, U = SL.U, R = SL.Render;
  var UI = (SL.UI = {});
  var el = {};
  var game = null;
  var callbacks = {};
  var lastFeedId = 0;
  var selSig = '';
  var primaryId = null;
  var rows = [];
  var resultShown = false;
  var minimapTick = 0;
  var lbTick = 0;
  var rosterTick = 0;
  var rosterSig = '';
  var perfOn = false;
  var perfFrames = 0;
  var perfElapsed = 0;
  var perfFps = 0;
  var detailType = '';
  var fortReplaceCard = null;
  var fortReplaceZone = null;
  var uiCache = { counts: {}, scores: {}, co: '', clock: '', selCount: -1, scaleW: -1, scaleText: -1, handSig: '', lbSig: '', bossSig: '', bossKillSig: '', itemSig: '', buyDraft: '', draftOpen: false, renderErr: '' };

  function $(id) { return document.getElementById(id); }

  UI.init = function (opts) {
    callbacks = opts || {};
    el.list = $('sel-list');
    el.empty = $('sel-empty');
    el.count = $('sel-count');
    el.countBlue = $('count-blue');
    el.countRed = $('count-red');
    el.clock = $('clock');
    el.toasts = $('toasts');
    el.minimap = $('minimap');
    el.scaleLine = $('scale-line');
    el.scaleLabel = $('scale-label');
    el.briefing = $('briefing');
    el.help = $('help');
    el.result = $('result');
    el.fortReplace = $('fort-replace');
    el.fortReplaceList = $('fort-replace-list');
    el.pauseBadge = $('pause-badge');
    el.leaderboard = $('leaderboard');
    el.gameMenu = $('game-menu');
    el.gmClose = $('gm-close');
    el.gmResume = $('gm-resume');
    el.gmRestart = $('gm-restart');
    el.gmSave = $('gm-save');
    el.gmLoad = $('gm-load');
    el.gmSettle = $('gm-settle');
    el.gmMainMenu = $('gm-mainmenu');
    el.renderError = $('render-error');
    el.ctxLost = $('context-lost');
    el.btnHelp = $('btn-help');
    el.btnSound = $('gm-sound');
    el.detail = $('sel-detail');
    el.dType = $('d-type');
    el.dName = $('d-name');
    el.dHp = $('d-hp');
    el.dHpbar = $('d-hpbar');
    el.dStRow = $('d-stamina-row');
    el.dStbar = $('d-stbar');
    el.dAmbar = $('d-ambar');
    el.dAmmo = $('d-ammo');
    el.dReloadbar = $('d-reloadbar');
    el.dReload = $('d-reload');
    el.dReloadRow = $('d-reload-row');
    el.dRange = $('d-range');
    el.dVision = $('d-vision');
    el.dCover = $('d-cover');
    el.dStateRow = $('d-state-row');
    el.dState = $('d-state');
    el.dKills = $('d-kills');
    el.dItems = $('d-items');
    el.fireModeBtn = $('fire-mode-btn');
    el.grenadeModeRow = $('grenade-mode-row');
    el.grenadeModeBtn = $('grenade-mode-btn');
    el.btnFireSupport = $('btn-fire-support');
    el.btnRecon = $('btn-recon');
    el.btnGrenade = $('btn-grenade');
    el.btnSniperHide = $('btn-sniper-hide');
    el.btnEngineer = $('btn-engineer');
    el.commandActions = document.querySelector('.command-actions');
    el.counts = { blue: $('count-blue'), red: $('count-red'), green: $('count-green') };
    el.scores = { blue: $('score-blue'), red: $('score-red'), green: $('score-green') };
    el.yellowHud = $('yellow-hud');
    el.yhTime = $('yh-time');
    el.yhStatus = $('yh-status');
    el.yhFills = { blue: $('yh-fill-blue'), red: $('yh-fill-red'), green: $('yh-fill-green') };
    el.yhXps = { blue: $('yh-xp-blue'), red: $('yh-xp-red'), green: $('yh-xp-green') };
    el.defenseHud = $('defense-hud');
    el.dhHold = $('dh-hold');
    el.dhTarget = $('dh-target');
    el.dhWave = $('dh-wave');
    el.dhStatus = $('dh-status');
    el.dhHoldFill = $('dh-holdfill');
    el.dhCapFill = $('dh-capfill');
    el.dhCapText = $('dh-captext');
    el.bossHud = $('boss-hud');
    el.bossRows = $('boss-rows');
    el.bossKillBanner = $('boss-kill-banner');
    el.bkbName = $('bkb-name');
    el.bkbRewards = $('bkb-rewards');
    el.perfHud = $('perf-hud');
    el.dhActions = $('dh-actions');
    el.dhSettle = $('dh-settle');
    el.dhSave = $('dh-save');
    el.dhLoad = $('dh-load');
    el.coLv = $('co-lv');
    el.coCatchup = $('co-catchup');
    el.coXp = $('co-xp');
    el.coXpText = $('co-xp-text');
    el.killfeed = $('killfeed');
    el.lbRows = $('lb-rows');
    el.cards = $('cards');
    el.cardCount = $('card-count');
    el.buyDraft = $('buy-draft');
    el.buyCost = $('buy-cost');
    el.discard = $('discard');
    el.draft = $('draft');
    el.draftCards = $('draft-cards');
    el.draftQueue = $('draft-queue');
    el.draftCount = $('draft-count');
    el.draftLater = $('draft-later');
    el.draftAlert = $('draft-alert');
    el.draftAlertText = $('draft-alert-text');
    el.rosterList = $('roster-list');
    el.rosterCount = $('roster-count');
    el.rangeTools = $('range-tools');
    el.rangeFogBtn = $('range-fog-btn');
    el.rangeConsole = $('range-console');
    el.rangeZones = $('range-zones');
    el.testPack = $('test-pack');
    el.testPackBody = $('test-pack-body');

    bindCardDrag();

    $('btn-start').addEventListener('click', function () { if (callbacks.onStart) callbacks.onStart(); });
    $('btn-again').addEventListener('click', function () { if (callbacks.onRestart) callbacks.onRestart(); });
    $('btn-help').addEventListener('click', function () { UI.toggleHelp(); });
    $('btn-help-close').addEventListener('click', function () { UI.toggleHelp(false); });
    var frCancel = $('fort-replace-cancel');
    if (frCancel) frCancel.addEventListener('click', function () { closeFortReplace(); });
    var menuBtn = $('btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', function () { if (callbacks.onMenu) callbacks.onMenu(); });
    var menuResult = $('btn-menu-result');
    if (menuResult) menuResult.addEventListener('click', function () {
      if (callbacks.onReturnMenu) callbacks.onReturnMenu();
      else if (callbacks.onMenu) callbacks.onMenu();
    });
    var soundBtn = el.btnSound;
    function syncSound() {
      if (!soundBtn || !SL.Audio) return;
      soundBtn.textContent = '音效：' + (SL.Audio.muted ? '关' : '开');
      soundBtn.title = SL.Audio.muted ? '音效已关闭' : '音效已开启';
      soundBtn.classList.toggle('muted', !!SL.Audio.muted);
    }
    UI.syncSound = syncSound;
    if (soundBtn) soundBtn.addEventListener('click', function () {
      if (SL.Audio) { SL.Audio.toggle(); syncSound(); }
    });
    syncSound();
    if (el.gmClose) el.gmClose.addEventListener('click', function () { if (callbacks.onCloseMenu) callbacks.onCloseMenu(); });
    if (el.gmResume) el.gmResume.addEventListener('click', function () { if (callbacks.onCloseMenu) callbacks.onCloseMenu(); });
    if (el.gmRestart) el.gmRestart.addEventListener('click', function () { if (callbacks.onRestart) callbacks.onRestart(); });
    if (el.gmSave) el.gmSave.addEventListener('click', function () { UI.saveGame(); });
    if (el.gmLoad) el.gmLoad.addEventListener('click', function () {
      if (UI.loadGame() && callbacks.onCloseMenu) callbacks.onCloseMenu();
    });
    if (el.gmSettle) el.gmSettle.addEventListener('click', function () {
      if (game && game.settleDefense()) {
        UI.hideGameMenu();
        if (callbacks.onCloseMenu) callbacks.onCloseMenu();
      }
    });
    if (el.gmMainMenu) el.gmMainMenu.addEventListener('click', function () {
      UI.hideGameMenu();
      if (callbacks.onReturnMenu) callbacks.onReturnMenu();
    });
    if (el.btnPause) el.btnPause.addEventListener('click', function () { if (callbacks.onTogglePause) callbacks.onTogglePause(); });
    el.draftQueue.addEventListener('click', function () { UI.openDraft(); });
    el.draftAlert.addEventListener('click', function () { UI.openDraft(); });
    if (el.buyDraft) el.buyDraft.addEventListener('click', function () { UI.buyDraft(); });
    if (el.fireModeBtn) el.fireModeBtn.addEventListener('click', function () { UI.cycleFireMode(); });
    if (el.grenadeModeBtn) el.grenadeModeBtn.addEventListener('click', function () { UI.cycleGrenadeMode(); });
    if (el.btnFireSupport) el.btnFireSupport.addEventListener('click', function () { UI.beginCommand('fireSupport'); });
    if (el.btnRecon) el.btnRecon.addEventListener('click', function () { UI.beginCommand('recon'); });
    if (el.btnGrenade) el.btnGrenade.addEventListener('click', function () { UI.beginCommand('grenade'); });
    if (el.btnSniperHide) el.btnSniperHide.addEventListener('click', function () { UI.beginCommand('sniperHide'); });
    if (el.btnEngineer) el.btnEngineer.addEventListener('click', function () { UI.beginCommand('engineer'); });
    if (el.dhSettle) el.dhSettle.addEventListener('click', function () {
      if (game && game.settleDefense()) UI.pushToast('本局已结算', 'win');
    });
    if (el.dhSave) el.dhSave.addEventListener('click', function () { UI.saveGame(); });
    if (el.dhLoad) el.dhLoad.addEventListener('click', function () { UI.loadGame(); });
    el.draftLater.addEventListener('click', function () {
      hideDraft();
      uiCache.draftOpen = false;
    });
    $('range-console-btn').addEventListener('click', function () { UI.openRangeConsole(); });
    $('range-fog-btn').addEventListener('click', function () { UI.toggleTestFog(); });
    $('range-pack-btn').addEventListener('click', function () { UI.openTestPack(); });
    $('range-target-btn').addEventListener('click', function () { UI.addTestCard('target'); });
    $('range-armor-target-btn').addEventListener('click', function () { UI.addTestCard('armor_target'); });
    $('range-heavy-target-btn').addEventListener('click', function () { UI.addTestCard('heavy_target'); });
    $('range-yellow-btn').addEventListener('click', function () {
      if (game && game.refreshYellow && game.refreshYellow()) UI.pushToast('黄圈已刷新', 'info');
    });
    $('range-boss-btn').addEventListener('click', function () { UI.addBossCards(); });
    $('range-clear-btn').addEventListener('click', function () { UI.clearTestUnits(); });
    $('range-console-close').addEventListener('click', function () {
      el.rangeConsole.classList.add('hidden');
    });
    $('test-pack-close').addEventListener('click', function () {
      el.testPack.classList.add('hidden');
    });

    var dragging = false;
    var MS = function () { return SL.CONFIG.mapSize; };
    function jump(ev) {
      var rect = el.minimap.getBoundingClientRect();
      var m = MS();
      var x = (ev.clientX - rect.left) / rect.width * m;
      var y = (ev.clientY - rect.top) / rect.height * m;
      if (callbacks.onCamera) callbacks.onCamera(U.clamp(x, 0, m), U.clamp(y, 0, m));
    }
    el.minimap.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    el.minimap.addEventListener('pointerdown', function (ev) {
      if (ev.button === 2) {
        // 小地图右键：向该点下达移动命令，而不是跳镜头
        var rect = el.minimap.getBoundingClientRect();
        var m = MS();
        var wx = (ev.clientX - rect.left) / rect.width * m;
        var wy = (ev.clientY - rect.top) / rect.height * m;
        if (callbacks.onMinimapOrder) callbacks.onMinimapOrder(U.clamp(wx, 0, m), U.clamp(wy, 0, m));
        return;
      }
      dragging = true;
      el.minimap.setPointerCapture(ev.pointerId);
      jump(ev);
    });
    el.minimap.addEventListener('pointermove', function (ev) { if (dragging) jump(ev); });
    el.minimap.addEventListener('pointerup', function () { dragging = false; });
    el.minimap.addEventListener('pointercancel', function () { dragging = false; });
  };

  UI.bind = function (g) {
    game = g;
    lastFeedId = 0;
    selSig = '';
    primaryId = null;
    detailType = '';
    resultShown = false;
    rows = [];
    rosterSig = '';
    rosterTick = 0;
    el.list.innerHTML = '';
    if (el.rosterList) el.rosterList.innerHTML = '';
    if (el.rosterCount) el.rosterCount.textContent = '0';
    if (el.draftQueue) el.draftQueue.classList.add('hidden');
    if (el.draftCount) el.draftCount.textContent = '0';
    if (el.rangeTools) el.rangeTools.classList.add('hidden');
    if (el.rangeConsole) el.rangeConsole.classList.add('hidden');
    if (el.testPack) el.testPack.classList.add('hidden');
    hideDraftAlert();
    uiCache.draftSeen = 0;
    el.result.classList.add('hidden');
    if (el.fortReplace) el.fortReplace.classList.add('hidden');
    if (el.defenseHud) el.defenseHud.classList.add('hidden');
    fortReplaceCard = null;
    fortReplaceZone = null;
    el.toasts.innerHTML = '';
    el.killfeed.innerHTML = '';
    el.lbRows.innerHTML = '';
    uiCache = { counts: {}, scores: {}, co: '', clock: '', selCount: -1, scaleW: -1, scaleText: -1, handSig: '', lbSig: '', bossSig: '', bossKillSig: '', itemSig: '', buyDraft: '', draftOpen: false, renderErr: '' };
    hideDraft();
    UI.showBriefing(false);
    UI.setPaused(false);
  };

  UI.showBriefing = function (show) {
    el.briefing.classList.toggle('hidden', !show);
  };

  UI.setMapButtons = function (current) {
    var box = $('map-buttons');
    if (!box) return;
    box.innerHTML = '';
    var list = SL.MAPS.map(function (m) { return { id: m.id, name: m.name }; });
    list.push({ id: 'random', name: '随机' });
    for (var i = 0; i < list.length; i++) {
      (function (item) {
        var b = document.createElement('button');
        b.className = 'map-btn' + (item.id === current ? ' on' : '');
        b.textContent = item.name;
        b.addEventListener('click', function () {
          if (!callbacks.onChooseMap) return;
          if (item.id === current) return;
          var cur = $('map-current');
          if (cur) cur.textContent = '生成地形…';
          box.classList.add('loading');
          setTimeout(function () {
            callbacks.onChooseMap(item.id);
            box.classList.remove('loading');
          }, 30);
        });
        box.appendChild(b);
      })(list[i]);
    }
    var cur = $('map-current');
    if (cur && SL.Terrain.map) cur.textContent = SL.Terrain.map.name + ' · ' + SL.Terrain.map.subtitle;
  };

  UI.toggleHelp = function (force) {
    var show = force === undefined ? el.help.classList.contains('hidden') : force;
    el.help.classList.toggle('hidden', !show);
  };

  UI.isHelpOpen = function () { return !el.help.classList.contains('hidden'); };

  UI.isDraftOpen = function () {
    return !!uiCache.draftOpen;
  };

  UI.buyDraft = function () {
    if (!game || game.ended) return;
    var res = game.buyDraft('blue');
    UI.pushToast(res.ok ? ('花费 ' + res.cost + ' 分增加 1 次抽卡机会') : res.msg, res.ok ? 'win' : 'loss');
    if (res.ok) {
      renderCards();
      // 不自动打开抽卡界面：抽卡次数进入队列，玩家稍后自行点击“抽卡”
    }
  };

  UI.openDraft = function () {
    if (!game || !game.drafts.length || uiCache.draftOpen) return;
    hideDraftAlert();
    uiCache.draftOpen = true;
    renderDraft(game);
  };

  function closeFortReplace() {
    if (el.fortReplace) el.fortReplace.classList.add('hidden');
    fortReplaceCard = null;
    fortReplaceZone = null;
  }

  UI.isFortReplaceOpen = function () { return !!(el.fortReplace && !el.fortReplace.classList.contains('hidden')); };

  UI.openFortReplace = function (card, zone) {
    if (!game || !card || !zone || !el.fortReplace) return;
    fortReplaceCard = card;
    fortReplaceZone = zone;
    var structs = game.zoneStructures(zone);
    var names = { bunker: '机枪碉堡', mortar: '迫击炮阵地', at_nest: '反坦克炮阵地', flak88: '88防空炮阵地' };
    el.fortReplaceList.innerHTML = '';
    structs.forEach(function (st, idx) {
      var b = document.createElement('button');
      b.className = 'fort-replace-option';
      b.innerHTML = '<span class="fr-index">位置 ' + (idx + 1) + '</span>' +
        '<b>' + (names[st.type] || '工事') + '</b>' +
        '<span>HP ' + Math.ceil(st.hp) + ' / ' + st.maxHp +
        ' · 弹 ' + Math.ceil(st.ammo) + ' / ' + st.maxAmmo + '</span>';
      b.addEventListener('click', function () { UI.confirmFortReplace(idx); });
      el.fortReplaceList.appendChild(b);
    });
    el.fortReplace.classList.remove('hidden');
  };

  UI.confirmFortReplace = function (idx) {
    if (!game || !fortReplaceCard || !fortReplaceZone) return;
    var res = game.replaceFortification(fortReplaceZone, idx, fortReplaceCard);
    UI.pushToast(res.msg, res.ok ? 'win' : 'loss');
    closeFortReplace();
    renderCards();
  };

  /* ---------------- 试验场专用工具 ---------------- */
  UI.addTestCard = function (key, sub) {
    if (!game || !game.testMode) return;
    var hand = game.teams.blue.hand;
    if (hand.length >= SL.XP.handMax) hand.shift();
    var card = game.makeCard(key, sub);
    hand.push(card);
    if (el.testPack) el.testPack.classList.add('hidden');
    game.log('测试卡包：' + card.name, 'order');
  };

  UI.addBossCards = function () {
    if (!game || !game.testMode) return;
    ['boss_hell', 'boss_tank', 'boss_ghost'].forEach(function (key) {
      if (game.teams.blue.hand.length >= SL.XP.handMax) game.teams.blue.hand.shift();
      game.teams.blue.hand.push(game.makeCard(key));
    });
    game.log('测试卡包：Boss 召唤卡', 'order');
  };

  UI.toggleTestFog = function () {
    if (!game || !game.testMode) return;
    game.fogEnabled = !game.fogEnabled;
    if (game.fogEnabled) game.computeFog();
    if (el.rangeFogBtn) el.rangeFogBtn.textContent = '迷雾：' + (game.fogEnabled ? '开' : '关');
  };

  UI.clearTestUnits = function () {
    if (!game || !game.testMode) return;
    var n = game.clearTestUnits();
    game.log('已清空 ' + n + ' 个单位/标靶', 'order');
  };

  UI.openRangeConsole = function () {
    if (!game || !game.testMode || !el.rangeConsole) return;
    if (el.testPack) el.testPack.classList.add('hidden');
    var zlist = (SL.Terrain.zones || []).slice();
    zlist.sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    });
    el.rangeZones.innerHTML = '';
    zlist.forEach(function (z) {
      var b = document.createElement('button');
      b.className = 'range-zone';
      var bonus = SL.ZONE_BONUS[z.kind];
      b.innerHTML = '<b>' + z.name + '</b><span>' +
        ((bonus && bonus.label) || z.kind) + ' · ' + Math.round(z.x) + ',' + Math.round(z.y) + '</span>';
      b.addEventListener('click', function () {
        R.centerOn(z.x, z.y);
        el.rangeConsole.classList.add('hidden');
      });
      el.rangeZones.appendChild(b);
    });
    el.rangeConsole.classList.remove('hidden');
  };

  UI.openTestPack = function () {
    if (!game || !game.testMode || !el.testPack) return;
    if (el.rangeConsole) el.rangeConsole.classList.add('hidden');
    function section(title, items) {
      var box = document.createElement('div');
      box.className = 'test-pack-section';
      var h = document.createElement('h3');
      h.textContent = title;
      box.appendChild(h);
      var grid = document.createElement('div');
      grid.className = 'test-card-grid';
      items.forEach(function (it) {
        var card = game.makeCard(it.key, it.sub);
        var b = document.createElement('button');
        b.className = 'test-card';
        b.innerHTML = '<b>' + card.name + '</b><span>' + card.desc + '</span>';
        b.addEventListener('click', function () { UI.addTestCard(it.key, it.sub); });
        grid.appendChild(b);
      });
      box.appendChild(grid);
      el.testPackBody.appendChild(box);
    }
    el.testPackBody.innerHTML = '';
    var base = ['unitpack', 'equippack', 'ammo', 'airstrike', 'airpatrol',
      'artillery', 'recon', 'fortpack', 'bunker', 'mortar_nest', 'at_gun_nest', 'flak88', 'target', 'armor_target', 'heavy_target'];
    section('基础 / 支援 / 工事 / 标靶', base.map(function (k) { return { key: k }; }));
    var units = Object.keys(SL.UNIT_TYPES).filter(function (k) {
      return k !== 'target' && k !== 'armor_target' && k !== 'heavy_target';
    });
    section('单位包', units.map(function (k) { return { key: 'unit', sub: k }; }));
    section('装备包', SL.EQUIP_KEYS.map(function (k) { return { key: 'equip', sub: k }; }));
    el.testPack.classList.remove('hidden');
  };

  var draftAlertTimer = 0;
  function hideDraftAlert() {
    if (!el.draftAlert) return;
    el.draftAlert.classList.add('hidden');
    if (draftAlertTimer) { clearTimeout(draftAlertTimer); draftAlertTimer = 0; }
  }
  function showDraftAlert(total) {
    if (!el.draftAlert) return;
    el.draftAlertText.textContent = total > 1 ? '获得 ' + total + ' 次抽卡' : '获得抽卡机会';
    el.draftAlert.classList.remove('hidden');
    if (draftAlertTimer) clearTimeout(draftAlertTimer);
    draftAlertTimer = setTimeout(hideDraftAlert, 4500);
  }

  function renderDraft(g) {
    var d = g.drafts[0];
    if (!d) { hideDraft(); return; }
    el.draft.classList.remove('hidden');
    el.draftCards.innerHTML = '';
    d.cards.forEach(function (c, i) {
      var node = document.createElement('div');
      node.className = 'card';
      node.style.setProperty('--c', c.color);
      node.innerHTML = '<div class="ic">' + c.icon + '</div><div class="nm">' + c.name + '</div><div class="sub">' + c.desc + '</div>';
      node.addEventListener('click', function () {
        var picked = g.pickDraftCard(i);
        if (picked) UI.pushToast('获得 ' + picked.name, 'win');
        if (picked && SL.Audio) SL.Audio.card();
        hideDraft();
        uiCache.draftOpen = false;
        renderCards();
      });
      el.draftCards.appendChild(node);
    });
  }

  function hideDraft() {
    el.draft.classList.add('hidden');
    el.draftCards.innerHTML = '';
  }

  // 左侧部队清单
  function renderRoster(g) {
    var list = g.units.filter(function (u) { return u.alive && u.side === 'blue'; });
    var rank = { infantry: 0, armored: 1, tank: 2, heavy_tank: 3, at_gun: 4, aa: 5, artillery: 6, heavy_arty: 7 };
    list.sort(function (a, b) {
      var diff = (rank[a.type] || 0) - (rank[b.type] || 0);
      return diff || a.name.localeCompare(b.name, 'zh-CN');
    });
    var sig = list.map(function (u) { return u.id + ':' + (u.selected ? 1 : 0); }).join('|');
    if (sig === rosterSig) return;
    rosterSig = sig;
    if (el.rosterCount) el.rosterCount.textContent = list.length;
    if (!el.rosterList) return;
    el.rosterList.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('div');
      empty.id = 'roster-empty';
      empty.textContent = '没有存活单位';
      el.rosterList.appendChild(empty);
      return;
    }
    var abbr = {
      infantry: '步', armored: '装', tank: '坦', heavy_tank: '重',
      at_gun: '反', aa: '防', artillery: '炮', heavy_arty: '炮',
      rocket_arty: '火', command: '指'
    };
    list.forEach(function (u) {
      var row = document.createElement('div');
      row.className = 'roster-row' + (u.selected ? ' sel' : '');
      row.dataset.id = u.id;
      row.title = u.name + ' · ' + Math.ceil(u.hp) + '/' + u.maxHp;
      row.innerHTML = '<span class="rt">' + (abbr[u.type] || '?') + '</span>';
      row.addEventListener('click', function () {
        game.setSelection([u]);
        R.centerOn(u.x, u.y);
      });
      el.rosterList.appendChild(row);
    });
  }

  UI.setPaused = function (paused) {
    if (el.pauseBadge) el.pauseBadge.classList.toggle('hidden', !paused);
  };

  function renderYellowHud(g) {
    if (!el.yellowHud) return;
    if (g.mode === 'lastStand') {
      el.yellowHud.classList.add('hidden');
      return;
    }
    var y = g.yellow;
    if (!y || !y.active || g.testMode) {
      el.yellowHud.classList.add('hidden');
      return;
    }
    el.yellowHud.classList.remove('hidden');
    var counts = { blue: 0, red: 0, green: 0 };
    for (var i = 0; i < g.units.length; i++) {
      var u = g.units[i];
      if (!u.alive || u.side === 'neutral') continue;
      if (U.dist(u.x, u.y, y.x, y.y) <= y.r) counts[u.side]++;
    }
    var present = [];
    for (var side in counts) if (counts[side] > 0) present.push(side);
    var leader = null, second = 0, top = 0;
    for (var s in counts) {
      if (counts[s] > top) { second = top; top = counts[s]; leader = s; }
      else if (counts[s] > second) second = counts[s];
    }
    var total = counts.blue + counts.red + counts.green;
    var net = top * 2 - total;
    var status = '无人控制', cls = '';
    if (present.length === 1) {
      status = SL.SIDES[present[0]].name + '控制 · 无争夺';
      cls = present[0];
    } else if (present.length > 1) {
      if (top > second && leader) {
        status = '争夺中 · ' + SL.SIDES[leader].name + '净优势 ' + net + ' · +' + (net * SL.YELLOW.xpPerUnit) + ' XP/s';
        cls = 'contested';
      } else {
        status = '争夺中 · 势均力敌';
        cls = 'contested';
      }
    }
    el.yhTime.textContent = U.clock(Math.max(0, y.activeUntil - g.time));
    el.yhStatus.textContent = status;
    el.yhStatus.className = 'yh-status ' + cls;
    for (var sd in el.yhFills) {
      var xp = Math.max(0, g.teams[sd].yellowXp || 0);
      var pct = U.clamp(xp / SL.YELLOW.winXp, 0, 1) * 100;
      el.yhFills[sd].style.width = pct.toFixed(1) + '%';
      el.yhXps[sd].textContent = Math.floor(xp).toLocaleString('en-US');
    }
  }

  function renderDefenseHud(g) {
    if (!el.defenseHud) return;
    if (g.mode !== 'lastStand' || !g.defense) {
      el.defenseHud.classList.add('hidden');
      return;
    }
    el.defenseHud.classList.remove('hidden');
    var d = g.defense;
    var target = d.holdTarget === Infinity ? '无限' : U.clock(d.holdTarget);
    el.dhHold.textContent = U.clock(d.hold);
    el.dhTarget.textContent = '目标 ' + target;
    var next = Math.max(0, d.nextWaveAt - g.time);
    el.dhWave.textContent = next > 0
      ? '第 ' + (d.wave + 1) + ' 波 · 准备 ' + U.clock(next)
      : '第 ' + d.wave + ' 波 · 进攻中';
    el.dhHoldFill.style.width = (d.holdTarget === Infinity ? 0 : U.clamp(d.hold / d.holdTarget, 0, 1) * 100) + '%';
    el.dhCapFill.style.width = U.clamp(d.cap, 0, 1) * 100 + '%';
    el.dhCapText.textContent = Math.floor(U.clamp(d.cap, 0, 1) * 100) + '%';
    var status = '未控制';
    if (d.cap > 0.001) status = '敌军占领中';
    else if (d.blueIn > 0 && d.redIn > 0) status = '争夺中';
    else if (d.blueIn > 0) status = '坚守中';
    else if (d.redIn > 0) status = '敌军占领中';
    el.dhStatus.textContent = status;
    if (el.dhActions) {
      var showActions = d.holdTarget === Infinity && !g.ended;
      el.dhActions.style.display = showActions ? 'flex' : 'none';
    }
  }

  function renderBossHud(g) {
    if (!el.bossHud || !el.bossRows) return;
    var list = g.activeBosses ? g.activeBosses() : [];
    if (!list.length) {
      el.bossHud.classList.add('hidden');
      uiCache.bossSig = '';
      return;
    }
    el.bossHud.classList.remove('hidden');
    el.bossHud.style.top = g.mode === 'lastStand' ? '160px' : '74px';
    var sig = list.map(function (b) {
      return b.kind + ':' + b.name + ':' + Math.ceil(b.hp) + ':' + Math.ceil(b.maxHp) + ':' + b.side;
    }).join('|');
    if (sig === uiCache.bossSig) return;
    uiCache.bossSig = sig;
    el.bossRows.innerHTML = '';
    var shown = list.slice(0, 3);
    for (var i = 0; i < shown.length; i++) {
      var b = shown[i];
      var S = SL.SIDES[b.side] || SL.SIDES.red;
      var row = document.createElement('div');
      row.className = 'boss-row';
      row.innerHTML = '<span class="bn"></span><div class="bt"><i></i></div>' +
        (b.kind === 'ghost' ? '<span class="bc"></span>' : '');
      row.querySelector('.bn').textContent = b.name;
      row.querySelector('.bn').style.color = S.light;
      var fill = row.querySelector('.bt i');
      fill.style.width = (U.clamp(b.hp / Math.max(1, b.maxHp), 0, 1) * 100).toFixed(1) + '%';
      fill.style.background = S.color;
      if (b.kind === 'ghost') row.querySelector('.bc').textContent = '×' + b.count;
      el.bossRows.appendChild(row);
    }
    if (list.length > 3) {
      var extra = document.createElement('div');
      extra.className = 'boss-row';
      extra.textContent = '还有 ' + (list.length - 3) + ' 个 BOSS 在场';
      el.bossRows.appendChild(extra);
    }
  }

  function renderBossKillBanner(g) {
    if (!el.bossKillBanner) return;
    var ev = g.bossKillEvent;
    if (!ev || g.time - ev.t > 4.5) {
      el.bossKillBanner.classList.add('hidden');
      el.bossKillBanner.classList.remove('show');
      uiCache.bossKillSig = '';
      return;
    }
    var sig = ev.id + ':' + ev.name;
    if (sig !== uiCache.bossKillSig) {
      uiCache.bossKillSig = sig;
      if (el.bkbName) el.bkbName.textContent = ev.name;
      if (el.bkbRewards) {
        el.bkbRewards.textContent = '+' + ev.xp + ' 经验   ·   +' + ev.score +
          ' 战功   ·   +' + ev.cards + ' 张单位卡';
      }
      el.bossKillBanner.classList.remove('hidden');
      el.bossKillBanner.classList.remove('show');
      void el.bossKillBanner.offsetWidth;
      el.bossKillBanner.classList.add('show');
    }
  }

  function updateFireModeUI() {
    if (!el.fireModeBtn) return;
    var u = game && game.selected && game.selected.length ? game.selected[0] : null;
    var mode = u && SL.FIRE_MODES[u.fireMode] ? u.fireMode : 'free';
    el.fireModeBtn.dataset.mode = mode;
    el.fireModeBtn.textContent = SL.FIRE_MODES[mode].name;
    el.fireModeBtn.title = SL.FIRE_MODES[mode].desc + '（点击切换）';
  }

  UI.openGameMenu = function () {
    if (!game || !el.gameMenu) return;
    el.gameMenu.classList.remove('hidden');
    document.body.classList.add('menu-open');
    if (el.leaderboard) el.leaderboard.classList.add('show');
    var endless = game.mode === 'lastStand' && game.difficulty === 'endless' && !game.ended;
    if (el.gmSave) el.gmSave.disabled = !endless;
    if (el.gmSettle) el.gmSettle.disabled = !endless;
    if (UI.syncSound) UI.syncSound();
    renderLeaderboard(game);
  };

  UI.hideGameMenu = function () {
    if (el.gameMenu) el.gameMenu.classList.add('hidden');
    document.body.classList.remove('menu-open');
    if (el.leaderboard) el.leaderboard.classList.remove('show');
  };

  UI.isGameMenuOpen = function () {
    return !!(el.gameMenu && !el.gameMenu.classList.contains('hidden'));
  };

  UI.saveGame = function () {
    if (!game) return false;
    if (game.saveToStorage()) { UI.pushToast('无尽防线已存档', 'win'); return true; }
    UI.pushToast('存档失败：仅无尽模式进行中可存档', 'loss');
    return false;
  };

  UI.loadGame = function () {
    if (!game) return false;
    if (game.loadFromStorage()) {
      game.selected = [];
      UI.pushToast('已读取无尽防线存档', 'win');
      UI.update(game, 0.016);
      return true;
    }
    UI.pushToast('没有可读取的存档，或当前模式不匹配', 'loss');
    return false;
  };

  UI.beginCommand = function (kind) {
    if (!game || !game.selected || !game.selected.length) return;
    game.pendingCommand = { kind: kind };
    var msg = kind === 'engineer' ? '请在地图上点击构筑位置'
      : (kind === 'recon' ? '请在地图上点击侦察中心'
        : (kind === 'grenade' ? '请在地图上点击手雷/火箭筒目标'
          : (kind === 'sniperHide' ? '请在地图上点击隐蔽位置' : '请在地图上点击火力目标')));
    UI.pushToast(msg, 'win');
  };

  UI.togglePerf = function () {
    perfOn = !perfOn;
    if (el.perfHud) el.perfHud.classList.toggle('hidden', !perfOn);
    perfFrames = 0;
    perfElapsed = 0;
  };

  UI.cycleFireMode = function () {    if (!game || !game.selected || !game.selected.length) return;
    var order = ['free', 'return', 'hold'];
    var current = game.selected[0].fireMode || 'free';
    var next = order[(order.indexOf(current) + 1) % order.length];
    for (var i = 0; i < game.selected.length; i++) {
      var u = game.selected[i];
      u.fireMode = next;
      u.target = null;
      u.lastAttacker = null;
      u.lastHitAt = -99;
    }
    updateFireModeUI();
  };

  UI.cycleGrenadeMode = function () {
    if (!game || !game.selected || !game.selected.length) return;
    var primaryMode = game.selected[0].grenadeMode || 'auto';
    var next = primaryMode === 'auto' ? 'manual' : 'auto';
    for (var i = 0; i < game.selected.length; i++) {
      if (game.selected[i].type === 'infantry') game.selected[i].grenadeMode = next;
    }
    if (el.grenadeModeBtn) el.grenadeModeBtn.textContent = next === 'auto' ? '自动攻击' : '手动攻击';
    UI.pushToast(next === 'auto' ? '手雷/火箭筒：自动攻击' : '手雷/火箭筒：手动攻击（按 G）', 'info');
  };

  UI.update = function (g, dt) {
    game = g;
    if (el.rangeTools) {
      var rangeOn = !!g.testMode;
      el.rangeTools.classList.toggle('hidden', !rangeOn);
      if (rangeOn && el.rangeFogBtn) {
        el.rangeFogBtn.textContent = '迷雾：' + (g.fogEnabled === false ? '关' : '开');
        el.rangeFogBtn.classList.toggle('on', g.fogEnabled !== false);
      }
    }
    var i, side;
    if (el.counts.green && el.counts.green.parentNode) {
      el.counts.green.parentNode.classList.toggle('hidden', g.mode === 'lastStand');
    }
    var counts = { blue: 0, red: 0, green: 0 };
    for (i = 0; i < g.units.length; i++) {
      if (!g.units[i].alive) continue;
      if (counts[g.units[i].side] != null) counts[g.units[i].side]++;
    }
    for (side in counts) {
      if (uiCache.counts[side] !== counts[side] && el.counts[side]) {
        el.counts[side].textContent = counts[side];
        uiCache.counts[side] = counts[side];
      }
      var sc = g.teams[side].score;
      if (uiCache.scores[side] !== sc && el.scores[side]) {
        el.scores[side].textContent = sc;
        uiCache.scores[side] = sc;
      }
    }

    // 连队等级 / 经验
    var team = g.teams.blue;
    var catchup = g.catchUpBonus('blue');
    var coSig = team.level + ':' + Math.floor(team.xp) + ':' + team.nextXp + ':' + catchup.toFixed(2);
    if (uiCache.co !== coSig) {
      uiCache.co = coSig;
      el.coLv.textContent = 'Lv.' + team.level;
      el.coCatchup.textContent = '后追 +' + Math.round(catchup * 100) + '%';
      el.coCatchup.classList.toggle('hidden', catchup <= 0);
      el.coXp.style.width = U.clamp(team.xp / team.nextXp, 0, 1) * 100 + '%';
      el.coXpText.textContent = Math.floor(team.xp) + '/' + team.nextXp;
    }

    var clockText = U.clock(g.time);
    if (uiCache.clock !== clockText) { el.clock.textContent = clockText; uiCache.clock = clockText; }
    renderBuyDraft(g);
    renderYellowHud(g);
    renderDefenseHud(g);
    renderBossHud(g);
    renderBossKillBanner(g);
    updateFireModeUI();

    // 渲染异常提示（分阶段保护后其余图层仍会继续绘制）
    if (R.lastError) {
      if (uiCache.renderErr !== R.lastError) {
        uiCache.renderErr = R.lastError;
        el.renderError.textContent = '渲染异常已隔离 · ' + R.lastError;
        el.renderError.classList.remove('hidden');
      }
    } else if (uiCache.renderErr) {
      uiCache.renderErr = '';
      el.renderError.classList.add('hidden');
    }

    // 显卡上下文丢失提示
    if (R.dead || R.contextLost) {
      uiCache.ctxLost = true;
      el.ctxLost.classList.remove('hidden');
      var lostSecs = R.contextLostAt ? (performance.now() - R.contextLostAt) / 1000 : 0;
      var lostMsg = (R.recoverAttempts >= 3 || lostSecs > 8)
        ? '渲染上下文丢失 · 多次恢复失败，请按 F5 刷新'
        : '渲染上下文丢失 · 游戏已暂停 · 正在恢复…';
      if (el.ctxLost.textContent !== lostMsg) el.ctxLost.textContent = lostMsg;
    } else if (uiCache.ctxLost) {
      uiCache.ctxLost = false;
      el.ctxLost.classList.add('hidden');
    }

    var sig = g.selected.map(function (u) { return u.id; }).join(',');
    if (sig !== selSig) {
      selSig = sig;
      rebuildSelection(g);
    } else {
      updateBars();
    }
    if (uiCache.selCount !== g.selected.length) {
      uiCache.selCount = g.selected.length;
      el.count.textContent = g.selected.length;
      el.empty.style.display = g.selected.length ? 'none' : 'block';
    }

    // 只显示玩家自己的击杀与晋升，不刷其他队的战报
    for (i = 0; i < g.feed.length; i++) {
      var f = g.feed[i];
      if (f.id <= lastFeedId) continue;
      lastFeedId = f.id;
      if (f.kind === 'kill' && f.ks === 'blue') addKillFeed(f);
      else if (f.kind === 'wipe' && f.ks === 'blue') addKillFeed(f);
      else if (f.kind === 'level') addKillFeed(f);
    }

    // 升级抽卡：排队，玩家点“抽卡”按钮再打开，打开时暂停
    var qn = g.drafts.length;
    var prevDraft = uiCache.draftSeen || 0;
    var newestDraft = qn > 0 ? g.drafts[g.drafts.length - 1] : null;
    if (qn > prevDraft && !uiCache.draftOpen && !(newestDraft && newestDraft.purchased)) showDraftAlert(qn);
    uiCache.draftSeen = qn;
    if (qn > 0 && !uiCache.draftOpen) {
      el.draftQueue.classList.remove('hidden');
      if (uiCache.draftCount !== qn) {
        uiCache.draftCount = qn;
        el.draftCount.textContent = qn;
      }
    } else {
      el.draftQueue.classList.add('hidden');
      if (qn === 0) hideDraftAlert();
    }
    if (uiCache.draftOpen && qn === 0) {
      hideDraft();
      uiCache.draftOpen = false;
    }

    // 卡包
    var hand = g.teams.blue.hand;
    var handSig = hand.map(function (c) { return c.id; }).join(',');
    if (handSig !== uiCache.handSig) {
      uiCache.handSig = handSig;
      renderCards();
    }

    // 左侧部队清单
    rosterTick += dt;
    if (rosterTick > 0.25) {
      rosterTick = 0;
      renderRoster(g);
    }

    // 积分榜
    lbTick += dt;
    if (lbTick > 0.4) {
      lbTick = 0;
      renderLeaderboard(g);
    }

    if ((g.state === 'won' || g.state === 'lost') && !resultShown) {
      resultShown = true;
      showResult(g);
    }

    minimapTick += dt;
    if (minimapTick > ((SL.PERF && SL.PERF.minimapInterval) || 0.12)) {
      minimapTick = 0;
      var c = el.minimap.getContext('2d');
      R.drawMinimap(c, g, el.minimap.width);
    }

    if (perfOn && el.perfHud) {
      perfFrames++;
      perfElapsed += dt;
      if (perfElapsed >= 0.5) {
        perfFps = perfFrames / perfElapsed;
        perfFrames = 0;
        perfElapsed = 0;
        var perf = R.perf || {};
        el.perfHud.textContent = 'FPS ' + perfFps.toFixed(0) +
          ' · 单位 ' + g.aliveCount('blue') + '/' + g.aliveCount('red') + '/' + g.aliveCount('green') +
          ' · 更新 ' + (perf.updateMs || 0).toFixed(1) + 'ms' +
          ' · 渲染 ' + (perf.renderMs || 0).toFixed(1) + 'ms' +
          ' · 特效 ' + g.effects.length +
          ' · 可见 ' + (R.visibleUnits || 0) +
          ' · DPR ' + (R.dpr || window.devicePixelRatio || 1).toFixed(2);
      }
    }

    var meters = [50, 100, 200, 250, 500];
    var best = 200, bestDiff = Infinity;
    for (i = 0; i < meters.length; i++) {
      var px = meters[i] * R.cam.zoom;
      var diff = Math.abs(px - 120);
      if (diff < bestDiff) { bestDiff = diff; best = meters[i]; }
    }
    var w = Math.round(best * R.cam.zoom);
    if (uiCache.scaleW !== w || uiCache.scaleText !== best) {
      uiCache.scaleW = w;
      uiCache.scaleText = best;
      el.scaleLine.style.width = w + 'px';
      el.scaleLabel.textContent = best + ' m';
    }
  };

  /* ---------------- 选择与详情 ---------------- */

  function rebuildSelection(g) {
    var i;
    if (!g.selected.length) {
      primaryId = null;
      el.detail.classList.add('hidden');
      el.list.innerHTML = '';
      rows = [];
      return;
    }
    var primary = null;
    for (i = 0; i < g.selected.length; i++) {
      if (g.selected[i].id === primaryId) primary = g.selected[i];
    }
    if (!primary) {
      primary = g.selected[0];
      primaryId = primary.id;
    }
    el.detail.classList.remove('hidden');
    el.dType.textContent = SL.TYPE_LABEL[primary.type] || primary.type;
    el.dName.textContent = primary.name;
    el.dVision.textContent = (game.unitVision ? game.unitVision(primary) : primary.def.vision) + ' m';
    el.dStRow.style.display = primary.def.canSprint ? 'grid' : 'none';

    if (detailType !== primary.type) {
      detailType = primary.type;
      buildItems(primary);
    }

    el.list.innerHTML = '';
    rows = [];
    for (i = 0; i < g.selected.length; i++) {
      var u = g.selected[i];
      if (u === primary) continue;
      var row = document.createElement('div');
      row.className = 'sel-row';
      row.innerHTML =
        '<span class="dot"></span>' +
        '<span class="nm"></span>' +
        '<div class="mini"><i></i></div>' +
        '<span class="pc"></span>';
      row.querySelector('.nm').textContent = u.name;
      var ss = SL.SIDES[u.side] || SL.SIDES.blue;
      row.querySelector('.dot').style.background = ss.color;
      el.list.appendChild(row);
      (function (unit) {
        row.addEventListener('click', function () {
          primaryId = unit.id;
          detailType = '';
          rebuildSelection(game);
        });
      })(u);
      rows.push({
        u: u,
        fill: row.querySelector('.mini i'),
        pc: row.querySelector('.pc')
      });
    }
    updateBars();
  }

  function buildItems(u) {
    var glyph = { infantry: '步', armored: '装', tank: '坦', artillery: '炮', heavy_arty: '重炮', heavy_tank: '重坦', aa: '防', at_gun: '反' }[u.type] || '?';
    var defs = [
      { g: glyph, label: u.def.weapon.label, n: '' },
      { g: '弹', label: '弹药 ' + u.ammoMax + ' 发', n: String(u.ammoMax) }
    ];
    el.dItems.innerHTML = '';
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var s = document.createElement('div');
      s.className = 'slot';
      s.title = d.label;
      s.innerHTML = '<span class="g">' + d.g + '</span>' + (d.n ? '<span class="n">' + d.n + '</span>' : '');
      el.dItems.appendChild(s);
    }
    // 步兵物品栏
    for (var k = 0; k < SL.INFANTRY_SLOTS; k++) {
      var item = u.items[k];
      var slot = document.createElement('div');
      slot.className = 'slot item' + (item ? '' : ' empty');
      if (item) {
        var eq = SL.EQUIP[item.key];
        var usesSquad = !!(eq.weapon && eq.weapon.usesUnitAmmo);
        var num = eq.weapon ? (usesSquad ? '' : item.ammo) : (item.hp > 0 ? Math.ceil(item.hp) : (item.uses > 0 ? item.uses : 0));
        slot.dataset.i = k;
        slot.title = eq.name +
          (usesSquad ? ' · 使用步兵班弹药（当前 ' + Math.round(u.ammo) + ' 发)' :
            (eq.weapon ? ' · ' + item.ammo + ' 发' : (item.hp > 0 ? ' · 剩余 ' + Math.ceil(item.hp) : (item.uses !== undefined ? ' · 构筑次数 ' + item.uses : '')))) +
          ' · ' + eq.desc + '（拖到丢弃格丢弃）';
        slot.innerHTML = '<span class="g">' + eq.icon + '</span>' +
          (num ? '<span class="n">' + num + '</span>' : '');
        slot.addEventListener('pointerdown', startItemDrag);
      } else {
        slot.title = '空装备槽（把装备卡拖到单位上）';
        slot.innerHTML = '<span class="g">+</span>';
      }
      el.dItems.appendChild(slot);
    }
  }

  function coverText(u) {
    var txt = '无';
    if (u.type === 'infantry' && u.cover.zone) txt = u.cover.zone.name;
    else if (u.cover.dr > 0.03) txt = '林地';
    if (u.cover.dr > 0.005) txt += ' 减伤 ' + Math.round(u.cover.dr * 100) + '%';
    return txt;
  }

  function unitReloadInfo(u) {
    var w = u && u.def && u.def.weapon;
    if (!w || !w.interval || u.type === 'command' || u.type === 'target') return null;
    var max = w.rockets ? w.reload : ((w.mag && u.magLeft <= 0) ? w.reload : w.interval);
    if (!max) return null;
    var left = Math.max(0, u.cd || 0);
    return { progress: U.clamp(1 - left / max, 0, 1), left: left, max: max };
  }

  function updateBars() {
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var ratio = U.clamp(r.u.hp / r.u.maxHp, 0, 1);
      r.fill.style.width = (ratio * 100).toFixed(0) + '%';
      r.fill.style.background = ratio > 0.6 ? '#7fd4a0' : (ratio > 0.3 ? '#e5c46a' : '#e06a52');
      r.pc.textContent = Math.round(ratio * 100) + '%';
    }

    if (!primaryId) return;
    var u = null;
    for (i = 0; i < game.selected.length; i++) {
      if (game.selected[i].id === primaryId) { u = game.selected[i]; break; }
    }
    if (!u) return;

    var hpR = U.clamp(u.hp / u.maxHp, 0, 1);
    el.dHp.textContent = Math.ceil(u.hp) + ' / ' + u.maxHp;
    el.dHpbar.style.width = (hpR * 100).toFixed(0) + '%';
    el.dHpbar.style.background = hpR > 0.6 ? '#7fd4a0' : (hpR > 0.3 ? '#e5c46a' : '#e06a52');

    var stR = U.clamp(u.stamina / 100, 0, 1);
    el.dStbar.style.width = (stR * 100).toFixed(0) + '%';
    el.dStbar.style.background = u.stamina < 25 ? '#c9765a' : '#d8b25e';

    var amR = U.clamp(u.ammo / u.ammoMax, 0, 1);
    el.dAmbar.style.width = (amR * 100).toFixed(0) + '%';
    el.dAmbar.style.background = amR < 0.2 ? '#c9765a' : '#8aa9c8';
    el.dAmmo.textContent = u.ammo + ' / ' + u.ammoMax;

    var reload = unitReloadInfo(u);
    if (reload && el.dReloadRow) {
      el.dReloadRow.style.display = '';
      el.dReloadbar.style.width = (reload.progress * 100).toFixed(0) + '%';
      el.dReloadbar.style.background = reload.progress >= 1 ? '#7fd4a0' : '#d7a558';
      el.dReload.textContent = Math.round(reload.progress * 100) + '%';
    } else if (el.dReloadRow) {
      el.dReloadRow.style.display = 'none';
    }

    var canSupport = u.type === 'artillery' || u.type === 'heavy_arty' || u.type === 'rocket_arty';
    var canEngineer = u.type === 'infantry' && u.items.some(function (it) { return it.key === 'engineer' && it.uses > 0; });
    var canRecon = u.type === 'command';
    var canGrenade = u.type === 'infantry' && u.items.some(function (it) {
      return (it.key === 'grenade' || it.key === 'atgrenade' || it.key === 'bazooka') && it.ammo > 0;
    });
    var canSniperHide = u.type === 'infantry' && u.items.some(function (it) {
      return it.key === 'sniper' && (it.uses === undefined || it.uses > 0);
    });
    if (el.commandActions) el.commandActions.classList.toggle('show',
      canSupport || canEngineer || canRecon || canGrenade || canSniperHide);
    if (el.btnFireSupport) el.btnFireSupport.style.display = canSupport ? '' : 'none';
    if (el.btnRecon) el.btnRecon.style.display = canRecon ? '' : 'none';
    if (el.btnGrenade) el.btnGrenade.style.display = canGrenade ? '' : 'none';
    if (el.btnSniperHide) el.btnSniperHide.style.display = canSniperHide ? '' : 'none';
    if (el.btnEngineer) el.btnEngineer.style.display = canEngineer ? '' : 'none';
    if (el.grenadeModeRow) el.grenadeModeRow.style.display = canGrenade ? '' : 'none';
    if (el.grenadeModeBtn && canGrenade) {
      el.grenadeModeBtn.textContent = (u.grenadeMode || 'auto') === 'auto' ? '自动攻击' : '手动攻击';
    }

    var bonus = Math.round((u.cover.rangeBonus || 0) * 100);
    el.dRange.textContent = Math.round(u.maxRangeNow || u.rangeNow) + ' m' + (bonus > 1 ? ' +' + bonus + '%' : '');
    var cv = coverText(u);
    if (u.concealed) cv += ' · 隐蔽';
    el.dCover.textContent = cv;
    if (SL.ARTILLERY[u.type]) {
      el.dStateRow.style.display = '';
      var stTxt = '就绪';
      if (u.deployState === 'moving') stTxt = '移动';
      else if (u.deployState === 'packing') stTxt = '收炮 ' + u.deployTimer.toFixed(1) + 's';
      else if (u.deployState === 'deploying') stTxt = '架设 ' + u.deployTimer.toFixed(1) + 's';
      el.dState.textContent = stTxt;
    } else {
      el.dStateRow.style.display = 'none';
    }
    el.dKills.textContent = u.kills;

    // 装备变化时重建物品栏
    var itemSig = u.items.map(function (it) { return it.key + ':' + it.ammo + ':' + (it.hp || 0) + ':' + (it.uses || 0); }).join(',');
    if (uiCache.itemSig !== itemSig) {
      uiCache.itemSig = itemSig;
      buildItems(u);
    }
  }

  function pushToast(f) {
    var d = document.createElement('div');
    d.className = 'toast ' + (f.kind || 'info');
    d.textContent = f.text;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 3) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(function () {
      d.classList.add('out');
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 450);
    }, 3000);
  }

  function showResult(g) {
    renderResultLeaderboard(g);
    var win = g.state === 'won';
    hideDraft();
    uiCache.draftOpen = false;
    hideDraftAlert();
    if (g.winner) {
      if (g.mode === 'lastStand') {
        $('result-title').textContent = g.defense && g.defense.settled
          ? '背水一战 · 已结算'
          : (g.winner === 'blue' ? '背水一战 · 防守成功' : '背水一战 · 防线失守');
      } else {
        $('result-title').textContent = g.winner === 'blue' ? '黄圈决胜 · 蓝队胜利' : '黄圈决胜 · 蓝队战败';
      }
      $('result-title').style.color = g.winner === 'blue' ? '#f0e7ce' : '#e3a294';
    } else {
      $('result-title').textContent = win ? '阵地已肃清' : '防线被突破';
      $('result-title').style.color = win ? '#f0e7ce' : '#e3a294';
    }
    $('result-reason').textContent = g.endReason;
    $('res-time').textContent = U.clock(g.time);
    $('res-kills').textContent = (g.stats.kills && g.stats.kills.blue) || 0;
    $('res-losses').textContent = (g.stats.losses && g.stats.losses.blue) || 0;
    $('res-earned').textContent = (g.teams.blue && g.teams.blue.scoreEarned) || 0;
    el.result.classList.remove('hidden');
  }

  /* ---------------- 击杀反馈 / 积分榜 ---------------- */

  function addKillFeed(f) {
    var d = document.createElement('div');
    d.className = 'kf ' + f.kind;
    if (f.kind === 'kill') {
      var ks = SL.SIDES[f.ks] || SL.SIDES.blue;
      var vs = SL.SIDES[f.vs] || SL.SIDES.red;
      d.style.borderLeftColor = ks.color;
      d.innerHTML = '<span class="ks"></span><span>击毁</span><span class="vs"></span><span class="rw"></span>';
      var a = d.querySelector('.ks'), b = d.querySelector('.vs'), rw = d.querySelector('.rw');
      a.textContent = f.killer;
      a.style.color = ks.light;
      b.textContent = f.victim;
      b.style.color = vs.light;
      rw.textContent = '+' + f.xp + ' XP · +' + f.score + ' 分';
    } else if (f.kind === 'wipe') {
      var kw = SL.SIDES[f.ks] || SL.SIDES.blue;
      var vw = SL.SIDES[f.vs] || SL.SIDES.red;
      d.style.borderLeftColor = vw.color;
      d.innerHTML = '<span class="ks"></span><span>全灭</span><span class="vs">·</span><span class="rw"></span>';
      d.querySelector('.ks').textContent = vw.name;
      d.querySelector('.ks').style.color = vw.light;
      d.querySelector('.vs').textContent = f.xp ? kw.name + ' +100 XP' : '';
      d.querySelector('.vs').style.color = kw.light;
      d.querySelector('.rw').textContent = '';
    } else {
      d.textContent = f.text;
    }
    el.killfeed.appendChild(d);
    while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.firstChild);
    setTimeout(function () {
      d.style.opacity = '0';
      d.style.transition = 'opacity 0.35s';
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 400);
    }, 8000);
  }

  function renderLeaderboard(g) {
    var list = g.leaderboard(20);
    var sig = list.map(function (u) { return u.id + ':' + u.score; }).join(',');
    if (sig === uiCache.lbSig) return;
    uiCache.lbSig = sig;
    el.lbRows.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'lb-empty';
      empty.textContent = '还没有单位取得战功';
      el.lbRows.appendChild(empty);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      var S = SL.SIDES[u.side] || SL.SIDES.blue;
      var row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = '<span class="rk"></span><span class="dot"></span><span class="nm"></span><span class="kl"></span><span class="sc"></span>';
      row.querySelector('.rk').textContent = (i + 1);
      row.querySelector('.dot').style.background = S.color;
      row.querySelector('.nm').textContent = S.name.charAt(0) + '·' + u.name;
      row.querySelector('.nm').style.color = S.light;
      row.querySelector('.kl').textContent = u.kills + '杀';
      row.querySelector('.sc').textContent = u.score;
      el.lbRows.appendChild(row);
    }
  }

  function renderResultLeaderboard(g) {
    var box = document.getElementById('result-lb-rows');
    if (!box) return;
    var list = g.leaderboard(20);
    box.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'lb-empty';
      empty.textContent = '本局还没有单位取得战功';
      box.appendChild(empty);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      var S = SL.SIDES[u.side] || SL.SIDES.blue;
      var row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = '<span class="rk"></span><span class="dot"></span><span class="nm"></span><span class="kl"></span><span class="sc"></span>';
      row.querySelector('.rk').textContent = (i + 1);
      row.querySelector('.dot').style.background = S.color;
      row.querySelector('.nm').textContent = S.name.charAt(0) + '·' + u.name;
      row.querySelector('.nm').style.color = S.light;
      row.querySelector('.kl').textContent = u.kills + '杀';
      row.querySelector('.sc').textContent = u.score;
      box.appendChild(row);
    }
  }

  /* ---------------- 卡包 ---------------- */

  var cardDrag = null;
  var itemDrag = null;

  function primaryUnit() {
    if (!game || !primaryId) return null;
    for (var i = 0; i < game.selected.length; i++) {
      if (game.selected[i].id === primaryId) return game.selected[i];
    }
    return null;
  }

  function makeGhost(icon, name, color) {
    var g = document.createElement('div');
    g.id = 'card-ghost';
    g.style.setProperty('--c', color);
    g.innerHTML = '<div class="ic">' + icon + '</div><div class="nm">' + name + '</div>';
    g.style.left = '-999px';
    document.body.appendChild(g);
    return g;
  }

  function moveGhost(g, x, y) {
    g.style.left = (x - 39) + 'px';
    g.style.top = (y - 52) + 'px';
  }

  function overDiscard(x, y) {
    var r = el.discard.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function worldAt(cx, cy) {
    var w = document.getElementById('world');
    var r = w.getBoundingClientRect();
    return R.screenToWorld(cx - r.left, cy - r.top);
  }

  function renderBuyDraft(g) {
    if (!el.buyDraft) return;
    var cost = g.buyDraftPrice('blue');
    var score = g.teams.blue.score;
    var afford = !g.ended && score >= cost;
    var sig = cost + '|' + afford + '|' + score;
    if (uiCache.buyDraft === sig) return;
    uiCache.buyDraft = sig;
    el.buyCost.textContent = cost;
    el.buyDraft.classList.toggle('disabled', !afford);
    el.buyDraft.title = afford ? ('消耗 ' + cost + ' 分购买一次抽卡机会') : ('分数不足：需要 ' + cost);
  }

  function renderCards() {
    if (!game || !el.cards) return;
    var hand = game.teams.blue.hand;
    el.cardCount.textContent = hand.length + '/' + SL.XP.handMax;
    renderBuyDraft(game);
    el.cards.innerHTML = '';
    for (var i = 0; i < SL.XP.handMax; i++) {
      var c = hand[i];
      var d = document.createElement('div');
      if (!c) {
        d.className = 'card empty';
        el.cards.appendChild(d);
        continue;
      }
      d.className = 'card';
      d.dataset.id = c.id;
      d.style.setProperty('--c', c.color);
      d.title = c.desc;
      d.innerHTML = '<div class="ic">' + c.icon + '</div><div class="nm">' + c.name + '</div>';
      el.cards.appendChild(d);
    }
  }

  function bindCardDrag() {
    el.cards.addEventListener('pointerdown', function (ev) {
      var node = ev.target && ev.target.closest ? ev.target.closest('.card') : null;
      if (!node || !node.dataset.id || !game) return;
      var card = game.cardAt(+node.dataset.id);
      if (!card) return;
      ev.preventDefault();
      node.classList.add('dragging');
      cardDrag = {
        card: card, node: node, x: ev.clientX, y: ev.clientY, moved: false,
        ghost: makeGhost(card.icon, card.name, card.color)
      };
      moveGhost(cardDrag.ghost, ev.clientX, ev.clientY);
    });

    window.addEventListener('pointermove', function (ev) {
      if (cardDrag) {
        if (Math.abs(ev.clientX - cardDrag.x) > 4 || Math.abs(ev.clientY - cardDrag.y) > 4) cardDrag.moved = true;
        moveGhost(cardDrag.ghost, ev.clientX, ev.clientY);
        el.discard.classList.toggle('hot', overDiscard(ev.clientX, ev.clientY));
      }
      if (itemDrag) {
        moveGhost(itemDrag.ghost, ev.clientX, ev.clientY);
        el.discard.classList.toggle('hot', overDiscard(ev.clientX, ev.clientY));
      }
    });

    function finish(ev) {
      if (cardDrag) {
        var d = cardDrag;
        cardDrag = null;
        d.node.classList.remove('dragging');
        if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
        el.discard.classList.remove('hot');
        if (!game) return;
        if (overDiscard(ev.clientX, ev.clientY)) {
          game.discardCard(d.card);
          UI.pushToast('已丢弃 ' + d.card.name, 'info');
          renderCards();
          return;
        }
        if (!d.moved && d.card.use === 'open') {
          var ro = game.useCard(d.card, {});
          UI.pushToast(ro.msg, ro.ok ? 'win' : 'loss');
          renderCards();
          return;
        }
        var under = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!under || under.id !== 'world') return;
        var w = worldAt(ev.clientX, ev.clientY);
        var unit = game.unitAt(w.x, w.y, 26 / R.cam.zoom);
        var res = game.useCard(d.card, { unit: unit, x: w.x, y: w.y });
        if (res.needsReplace) {
          UI.openFortReplace(d.card, res.zone);
          return;
        }
        UI.pushToast(res.msg, res.ok ? 'order' : 'loss');
        if (res.ok) renderCards();
      }
      if (itemDrag) {
        var it = itemDrag;
        itemDrag = null;
        if (it.ghost.parentNode) it.ghost.parentNode.removeChild(it.ghost);
        el.discard.classList.remove('hot');
        if (overDiscard(ev.clientX, ev.clientY)) {
          game.removeItem(it.unit, it.item);
          UI.pushToast('已丢弃 ' + SL.EQUIP[it.item.key].name, 'info');
          detailType = '';
          rebuildSelection(game);
        }
      }
    }
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function startItemDrag(ev) {
    if (!game) return;
    var u = primaryUnit();
    if (!u) return;
    var node = ev.currentTarget;
    var item = u.items[+node.dataset.i];
    if (!item) return;
    ev.preventDefault();
    ev.stopPropagation();
    itemDrag = {
      unit: u, item: item, x: ev.clientX, y: ev.clientY, moved: false,
      ghost: makeGhost(SL.EQUIP[item.key].icon, SL.EQUIP[item.key].name, '#c08a4a')
    };
    moveGhost(itemDrag.ghost, ev.clientX, ev.clientY);
  }

  UI.hideResult = function () { el.result.classList.add('hidden'); };
  UI.pushToast = function (text, kind) { pushToast({ text: text, kind: kind }); };
})(window);
