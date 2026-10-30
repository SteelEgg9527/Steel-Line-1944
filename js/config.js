/* ============================================================================
   钢线 1944 · 平衡参数总表
   ----------------------------------------------------------------------------
   这是手动调整单位、武器、卡池、敌人构成的主要入口。
   修改后刷新浏览器即可生效，不需要改 game.js。

   文件结构：
   1. SL.CONFIG / SL.COMBAT        地图、移动、掩体、高地
   2. SL.UNIT_TYPES                所有单位与主武器数据
   3. SL.EQUIP                     步兵装备与武器数据
   4. SL.FORT / SL.SUPPORT         工事、炮火支援
   5. SL.PLANE / SL.AIRSTRIKE      飞机与空袭
   6. SL.BOSS                      三位 BOSS 与击杀奖励
   7. SL.LAST_STAND                背水一战波次、难度、敌军权重
   8. SL.MELEE_DIFFICULTIES        混战难度
   9. SL.NEUTRAL / SL.COMPANY      中立单位、基础连队
   10. SL.CARD_DEFS / SL.CARD_POOL 卡牌定义与抽卡权重
   ========================================================================== */
/* 钢线 1944 —— 全局配置：地图、单位、配色 */
(function () {
  'use strict';
  var SL = (window.SL = window.SL || {});
  SL.BALANCE_FILE_VERSION = 1;

  SL.CONFIG = {
    mapSize: 2000,          // 战场 2km x 2km
    seed: 19440606,
    simHz: 20,
    contourInterval: 10,    // 等高距 10m
    gridInterval: 100       // 方里网 100m
  };

  /* 性能选项（第一轮优化） */
  SL.PERF = {
    maxEffects: 280,        // 场上特效上限，超出丢弃最旧特效
    maxDpr: 1.25,           // 画布最大 devicePixelRatio
    maxRenderPixels: 2600000, // 内部渲染像素上限（约 2.6MP），高分辨率设备自动降采样
    minimapInterval: 0.12   // 小地图刷新间隔（秒）
  };

  SL.COMBAT = {
    sprintMul: 1.85,        // 急行军速度倍率
    sprintMeters: 300,      // 满体力可急行军的距离（按米消耗体力）
    sprintDrain: 4.45,      // 旧版按秒消耗，保留未用
    staminaRegen: 12,       // 体力恢复 / 秒
    sprintMin: 8,           // 低于该体力无法起跑
    coverDRCap: 0.65,       // 减伤上限
    coverEvadeCap: 0.55,    // 闪避上限
    elevationRangeBonus: 0.25, // 高地射程加成上限
    elevationBase: 100,     // 高于该海拔开始获得射程加成
    elevationSpan: 70
  };

  /* ==========================================================================
     一、单位与主武器
     字段说明：hp 血量 / armor 是否有装甲 / vision 视野(m) / range 射程(m)
     speed 移速(m/s) / radius 碰撞半径(m) / weapon 主武器
     weapon: dmg 伤害 / interval 射击间隔(s) / ap 穿甲 / accuracy 命中
             spread 散布(m) / splash 溅射(m) / ammo 弹药 / mag 弹夹 /
             reload 装填(s) / kind direct|shell / label 显示名称
     ========================================================================== */
  /* 单位类型。射程/视野单位为米，速度单位为米/秒 */
  SL.UNIT_TYPES = {
    infantry: {
      key: 'infantry',
      name: '步兵班',
      short: '步兵',
      symbol: 'infantry',
      hp: 300,
      armor: 0,
      vision: 350,
      range: 160,
      speed: 7.2,
      radius: 7,
      canSprint: true,
      weapon: {
        dmg: 10, interval: 0.95, ap: 0.12, accuracy: 0.7, spread: 5,
        ammo: 300, kind: 'direct', label: 'Kar98k / MG42'
      }
    },
    armored: {
      key: 'armored',
      name: '装甲车',
      short: '装甲车',
      symbol: 'armored',
      hp: 150,
      armor: 1,
      vision: 200,
      range: 180,
      speed: 14,
      radius: 8,
      canSprint: false,
      weapon: {
        dmg: 18, interval: 0.42, ap: 0.6, accuracy: 0.82, spread: 3, splash: 10,
        mag: 10, reload: 2.4, ammo: 200, kind: 'direct', label: '30mm MK 103'
      }
    },
    tank: {
      key: 'tank',
      name: '中型坦克',
      short: '中坦',
      symbol: 'tank',
      hp: 400,
      armor: 1,
      vision: 190,
      range: 190,
      speed: 9.5,
      radius: 9,
      canSprint: false,
      weapon: {
        dmg: 80, interval: 4.2, ap: 1.1, accuracy: 0.86, spread: 2,
        ammo: 50, kind: 'direct', label: '75mm KwK 40'
      }
    },
    artillery: {
      key: 'artillery',
      name: '火炮',
      short: '火炮',
      symbol: 'artillery',
      hp: 65,
      armor: 0,
      vision: 160,
      range: 600,
      minRange: 70,
      speed: 14,
      radius: 9,
      canSprint: false,
      weapon: {
        dmg: 95, interval: 7.5, ap: 0.55, accuracy: 1,
        ammo: 36, kind: 'shell', splash: 50, scatter: 100, label: '105mm leFH 18'
      }
    },
    heavy_arty: {
      key: 'heavy_arty',
      name: '重型火炮',
      short: '重炮',
      symbol: 'artillery',
      hp: 85,
      armor: 0,
      vision: 160,
      range: 800,
      minRange: 100,
      speed: 14,
      radius: 10,
      canSprint: false,
      weapon: {
        dmg: 180, interval: 14, ap: 1.3, accuracy: 1,
        ammo: 18, kind: 'shell', splash: 100, scatter: 150, label: '150mm sFH 18'
      }
    },
    heavy_tank: {
      key: 'heavy_tank',
      name: '重型坦克',
      short: '重坦',
      symbol: 'tank',
      hp: 520,
      armor: 2,
      vision: 110,
      range: 210,
      speed: 8.5,
      radius: 10,
      canSprint: false,
      weapon: {
        dmg: 120, interval: 5.8, ap: 1.4, accuracy: 0.88, spread: 1.5,
        ammo: 45, kind: 'direct', label: '88mm KwK 43'
      }
    },
    aa: {
      key: 'aa',
      name: '防空车',
      short: '防空',
      symbol: 'armored',
      hp: 90,
      armor: 1,
      vision: 150,
      range: 160,
      speed: 13,
      radius: 8,
      canSprint: false,
      aaRange: 600,
      airDmg: 8,
      weapon: {
        dmg: 7, interval: 0.13, ap: 0.3, accuracy: 0.72, spread: 4, splash: 4,
        mag: 20, reload: 6, ammo: 300, kind: 'direct', label: '20mm Flak 38'
      }
    },
    at_gun: {
      key: 'at_gun',
      name: '轻型反坦克炮',
      short: '反坦克炮',
      symbol: 'artillery',
      hp: 90,
      armor: 0,
      vision: 160,
      range: 190,
      minRange: 15,
      speed: 6.5,
      radius: 8,
      canSprint: false,
      weapon: {
        dmg: 120, interval: 4.5, ap: 1.8, accuracy: 0.88, spread: 1.5,
        ammo: 24, kind: 'direct', label: '75mm Pak 40'
      }
    },
    rocket_arty: {
      key: 'rocket_arty',
      name: '自行火箭炮',
      short: '火箭',
      symbol: 'armored',
      hp: 110,
      armor: 1,
      vision: 200,
      range: 700,
      speed: 10,
      radius: 10,
      canSprint: false,
      weapon: {
        dmg: 190, interval: 90, ap: 0.65, accuracy: 1,
        ammo: 100, kind: 'shell', splash: 150, scatter: 200,
        rockets: 10, rocketDelay: 0.5, reload: 90, fixedScatter: true, label: '十联装火箭炮'
      }
    },
    boss_super: {
      key: 'boss_super', name: '超级重坦', short: 'BOSS', symbol: 'heavy_tank',
      hp: 3000, armor: 3, vision: 500, range: 400, speed: 6.5, radius: 24, canSprint: false,
      weapon: { dmg: 500, interval: 5, ap: 2.6, accuracy: 1, spread: 0, ammo: 999, kind: 'shell', splash: 90, label: '150mm 主炮' }
    },
    boss_ghost: {
      key: 'boss_ghost', name: '幽灵步兵', short: '幽灵', symbol: 'infantry',
      hp: 1500, armor: 0, vision: 350, range: 160, speed: 20, radius: 8, canSprint: false,
      weapon: { range: 160, dmg: 12, interval: 0.32, ap: 0.25, accuracy: 0.8, spread: 5, ammo: 300, kind: 'direct', usesUnitAmmo: true, label: 'Kar98k' }
    },
    command: {
      key: 'command',
      name: '指挥车',
      short: '指挥',
      symbol: 'armored',
      hp: 120,
      armor: 1,
      vision: 450,
      range: 0,
      speed: 12,
      radius: 9,
      canSprint: false,
      weapon: {
        dmg: 0, interval: 1, ap: 0, accuracy: 0, spread: 0,
        ammo: 0, kind: 'direct', label: '无武装'
      }
    },
    engineer_vehicle: {
      key: 'engineer_vehicle',
      name: '工程车',
      short: '工程',
      symbol: 'armored',
      hp: 220,
      armor: 1,
      vision: 240,
      range: 0,
      speed: 12,
      radius: 10,
      canSprint: false,
      weapon: {
        dmg: 0, interval: 1, ap: 0, accuracy: 0, spread: 0,
        ammo: 0, kind: 'direct', label: '无武装 · 工程作业'
      }
    },
    target: {
      key: 'target',
      name: '标靶',
      short: '靶',
      symbol: 'target',
      hp: 600,
      armor: 0,
      vision: 50,
      range: 0,
      speed: 0,
      radius: 10,
      canSprint: false,
      weapon: {
        dmg: 0, interval: 1, ap: 0, accuracy: 0, spread: 0,
        ammo: 0, kind: 'direct', label: '标靶'
      }
    },
    armor_target: {
      key: 'armor_target',
      name: '装甲标靶',
      short: '装甲靶',
      symbol: 'tank',
      hp: 400,
      armor: 1,
      vision: 190,
      range: 0,
      speed: 0,
      radius: 9,
      canSprint: false,
      weapon: {
        dmg: 0, interval: 1, ap: 0, accuracy: 0, spread: 0,
        ammo: 0, kind: 'direct', label: '装甲标靶'
      }
    },
    heavy_target: {
      key: 'heavy_target',
      name: '重坦标靶',
      short: '重坦靶',
      symbol: 'tank',
      hp: 520,
      armor: 2,
      vision: 110,
      range: 0,
      speed: 0,
      radius: 10,
      canSprint: false,
      weapon: {
        dmg: 0, interval: 1, ap: 0, accuracy: 0, spread: 0,
        ammo: 0, kind: 'direct', label: '重坦标靶'
      }
    }
  };

  SL.FIRE_MODES = {
    free: { id: 'free', name: '自由开火', desc: '自动攻击视野内敌人' },
    return: { id: 'return', name: '反击', desc: '只还击最近攻击自己的敌人' },
    hold: { id: 'hold', name: '停火', desc: '不主动开火' }
  };
  SL.COMMAND_RECON = { range: 600, radius: 150 };

  SL.BOSS = {
    interval: 5,
    finalSafety: 60,       // 坚守目标前 60 秒不再刷新 BOSS，避免登场即结束
    meleeThreshold: 0.9,
    reward: { xp: 10000, score: 10000, cards: 6 },
    hell: {
      name: '地狱轰炸机', hp: 3000, speed: 60, length: 80,
      bombRadius: 300, coreRadius: 100, coreFrac: 0.6, outerFrac: 0.3,
      orbitSpeed: 0.08, gunRange: 520, gunAirRange: 520, gunGroundRange: 400,
      gunInterval: 0.45, gunDmg: 7, gunSplash: 50,
      fortDmg: 2500, extraBombAt: 0.3,
      extraBombCount: 8, extraBombRadius: 75, extraBombInterval: 0.6,
      extraBombCoreRadius: 25, extraBombCoreFrac: 0.2, extraBombOuterFrac: 0.1,
      extraBombFortDmg: 600, extraBombSupplyDmg: 1000    },
    superTank: {
      name: '超级重坦', hp: 3000, range: 400, mgRange: 400, speed: 6.5,
      chargeMul: 3.5, spiralSpeed: 18, spiralRadial: 6, patrolSpeed: 12,
      mainInterval: 10, mainAimTime: 5, mainAimRadius: 75,
      secondaryInterval: 6, secondaryAimTime: 3, secondaryAimRadius: 90,
      mgInterval: 1.8,
      mainDmg: 100, secondaryDmg: 50, mgDmg: 1.5,
      mainSplash: 75, secondarySplash: 90,
      mainAccuracy: 1, secondaryAccuracy: 1, mgAccuracy: 0.65,
      crushDmg: 50, crushInterval: 0.1
    },
    ghost: {
      name: '幽灵兵团', count: 10, hp: 1500, speed: 20, revealRadius: 30,
      damageScale: 0.45, fireRateScale: 2.0,
      halfBombAt: 0.5, bombRadius: 50, bombDmg: 400, bombDelay: 10
    }
  };

  /* 占领区类型：灌木丛 / 树林 / 村庄 / 城镇 / 工事 */
  SL.ZONE_BONUS = {
    bush: { dr: 0.10, evade: 0.10, label: '灌木丛' },
    forest: { dr: 0.18, evade: 0.15, label: '树林' },
    village: { dr: 0.28, evade: 0.20, label: '村庄' },
    town: { dr: 0.38, evade: 0.24, label: '城镇' },
    fort: { dr: 0.58, evade: 0.32, label: '工事' }
  };
  SL.ZONE_VEG_EVADE = 0.10;
  SL.ZONE_INF_FORT = { dr: 0.12, evade: 0.12 };       // 步兵在工事区额外加成
  SL.ZONE_INF_FORTIFIED = { dr: 0.10, evade: 0.10 };  // 强化工事区再额外加成

  /* ---------------- 模式 ---------------- */
  SL.MODES = {
    melee: {
      id: 'melee', name: '混战模式',
      desc: '蓝、红、绿三军混战；普通/困难以100,000黄圈经验获胜，无限无胜利条件。BOSS与AI单位上限随难度变化。'
    },
    lastStand: {
      id: 'lastStand', name: '背水一战',
      desc: '蓝队固守随机黄圈，红队分波进攻；守住目标时间即胜，黄圈被红队占领即败。'
    }
  };

  SL.LAST_STAND = {
    prepTime: 60,
    waveGap: 60,
    captureTime: 30,
    firstWave: 9,
    maxWaveUnits: 48,
    unitWeights: {
      first: { infantry: 48, armored: 24, at_gun: 15, tank: 10, artillery: 3 },
      normal: { infantry: 42, armored: 21, at_gun: 12, tank: 12, aa: 6, heavy_tank: 4, artillery: 3 },
      low: ['aa', 'heavy_tank', 'artillery'],
      lowStep: 1,
      tierWaves: 5,
      maxTier: 5
    },
    difficulties: {
      easy: { id: 'easy', name: '简单', holdTime: 900, waveAdd: 2, waveScale: 0.9 },
      normal: { id: 'normal', name: '普通', holdTime: 1500, waveAdd: 3, waveScale: 1.0 },
      hard: { id: 'hard', name: '困难', holdTime: 2100, waveAdd: 4, waveScale: 1.1 },
      endless: { id: 'endless', name: '无限', holdTime: Infinity, waveAdd: 5, waveScale: 1.2 }
    },
    air: { tier: 5, baseMin: 2, baseMax: 2, maxPerWave: 10, delayMin: 8, delayMax: 50 }
  };

  /* ---------------- 三阵营 ---------------- */
  SL.SIDES = {
    blue: {
      key: 'blue', name: '蓝队', color: '#2f5f92', light: '#8fbce4', dark: '#1d3d61',
      spawn: { x: 250, y: 792 }, ai: false
    },
    red: {
      key: 'red', name: '红队', color: '#a63f33', light: '#e39484', dark: '#6e2620',
      spawn: { x: 762, y: 208 }, ai: true
    },
    green: {
      key: 'green', name: '绿队', color: '#4f7a45', light: '#b4d3a4', dark: '#2f4a29',
      spawn: { x: 818, y: 796 }, ai: true
    },
    neutral: {
      key: 'neutral', name: '中立', color: '#7d7866', light: '#c9c2a8', dark: '#4a4638',
      spawn: { x: 1000, y: 1000 }, ai: false
    }
  };
  SL.SIDE_ORDER = ['blue', 'red', 'green'];

  /* 基础连队 / AI 重生补员循环
     注意：修改这里的单位类型时，必须保证 SL.UNIT_TYPES 中存在对应 key。 */
  SL.COMPANY = {
    base: ['infantry', 'infantry', 'infantry', 'armored', 'armored', 'tank'],
    aiCycle: ['armored', 'tank', 'infantry', 'armored', 'tank']
  };

  /* 击杀奖励：经验大幅提高（1 级时一个击杀即可升级），分数仍按目标等级 */
  SL.REWARD = {
    infantry: { xp: 150, score: 10 },
    armored: { xp: 200, score: 20 },
    tank: { xp: 250, score: 35 },
    artillery: { xp: 200, score: 25 }
  };

  SL.XP = {
    first: 150,        // 升到 2 级所需
    step: 100,         // 每级递增
    wipe: 200,         // 灭队奖励经验
    respawnDelay: 6,   // 全灭后重生延迟（秒）
    handMax: 10,
    draftCount: 5,     // 升级时抽几张供选择
    draftPick: 1,      // 选几张进卡包
    buyDraftCost: 200, // 首次用分数购买抽卡的价格
    buyDraftStep: 40,  // 每次购买后价格上涨
    equipCost: 0,      // 已取消：装备步兵装备不再消耗弹药（保留字段兼容旧配置）
    zoneRate: 3,       // 每个有人驻守的占领区每秒经验
    zoneMax: 8,        // 最多按 8 个占领区结算
    catchupPerLevel: 0.10, // 每落后 1 级，经验 +10%
    catchupCap: 1.0    // 后追加成上限 +100%（最高双倍）
  };

  /* AI 成长速度：敌方经验略减，避免 AI 滚雪球过快 */
  SL.AI_XP_SCALE = 0.75;
  SL.MELEE_DIFFICULTIES = {
    easy: { id: 'easy', name: '简单', enemyXp: 0.55, enemyDamage: 0.9, aggro: 0.82, endless: false },
    normal: { id: 'normal', name: '普通', enemyXp: 0.75, enemyDamage: 1.0, aggro: 1.0, endless: false },
    hard: { id: 'hard', name: '困难', enemyXp: 0.95, enemyDamage: 1.12, aggro: 1.28, endless: false },
    endless: { id: 'endless', name: '无限', enemyXp: 1.1, enemyDamage: 1.2, aggro: 1.5, endless: true }
  };
  /* 增援/单位卡部署半径 */
  SL.DEPLOY_RANGE = 200;
  /* 步兵物品栏格数 */
  SL.INFANTRY_SLOTS = 6;

  /* 中立落单单位 */
  SL.NEUTRAL = {
    initial: 10,        // 开局中立单位数量
    cap: 20,            // 场上中立单位上限
    minGap: 8,          // 刷新间隔下限（秒）
    maxGap: 14,         // 刷新间隔上限（秒）
    fastFactorMin: 0.30,// 场上越空，刷新间隔最低缩到 30%
    weights: {          // 中立单位类型权重（总和不要求为 1）
      infantry: 0.50,
      armored: 0.30,
      tank: 0.15,
      artillery: 0.05
    }
  };

  /* 阵地加成：步兵全额，装甲单位打折 */
  SL.ZONE_UNIT_SCALE = { foot: 1, armor: 0.65 };
  /* 占领区额外加成：步兵大幅闪避；其他单位同时获得闪避与减伤 */
  SL.ZONE_INF_EVADE = 0.28;
  SL.ZONE_OTHER = { dr: 0.08, evade: 0.08 };

  SL.STEALTH = {
    delay: 1,          // 开火后 1 秒未开火即可重新隐蔽
    revealRange: 50,   // 敌人逼近到该距离内即暴露
    concealEvade: 0.25, // 普通隐蔽额外闪避
    ghostEvade: 0.35   // 伪装服步兵在灌木/树林中进入“幽灵”后的额外闪避
  };
  SL.SNIPER = {
    spotRange: 100,    // 狙击小组创建灌木的最大距离
    bushRadius: 45     // 创建的灌木半径
  };
  SL.AT_STEALTH = { delay: 5, revealRange: 50 };
  SL.AI_EQUIP = { easy: 0.20, normal: 0.45, hard: 0.70, endless: 0.90 };
  SL.AI_EQUIP_MAX = { easy: 2, normal: 4, hard: 6, endlessEarly: 2, endlessMid: 4, endlessLate: 6 };
  SL.AI_EQUIP_TIME = { early: 900, mid: 1800 };

  /* ---------------- 强化工事 ---------------- */
  SL.FORT = {
    buildTime: 12,      // 工兵进入已占领区后构筑时间（秒）
    maxHp: 1500,        // 强化工事区血量
    repairRate: 8,      // 工兵每秒修复量
    reconRadius: 150,
    bunkerHp: 1000,     // 机枪碉堡血量
    mortarHp: 875,      // 迫击炮阵地血量
    atNestHp: 950,      // 反坦克炮阵地血量
    flak88Hp: 1050,     // 88 防空炮阵地血量
    bunkerAmmo: 400,
    mortarAmmo: 72,
    atNestAmmo: 30,
    flakAmmo: 80,
    bunkerRange: 300,
    bunkerInterval: 0.22,
    mortarRange: 500,
    mortarTubes: 3,
    mortarDelay: 0.45,
    mortarScatter: 50,
    mortarSplash: 40,      // 迫击炮阵地单发溅射半径
    mgDamageVsGarrison: 0.25,
    atNestRange: 500,
    atNestDmg: 120,
    atNestInterval: 4.5,
    atNestAP: 1.8,
    flakGroundRange: 400,
    flakAirRange: 600,
    flakGroundDmg: 150,
    flakGroundInterval: 5,
    flakAirDmg: 150,
    flakAirInterval: 5,
    bunkerDR: 0.15,     // 碉堡额外减伤
    bunkerEvade: 0.05,
    dmgMult: 1,         // 炮弹/空袭对工事的最终伤害倍率（伤害值由武器类型决定）
    suppressDuration: 60, // 火炮压制持续时间
    suppressRadius: 100,  // 压制落点散布半径
    rebuildTime: 8,       // 工兵修复被毁工事时间
    maxStructures: 4,     // 每个强化工事区最多部署的工事数量
    fieldBuildRange: 100, // 携带工兵装备的步兵可构筑野战工事的距离
    rubbleAmmoRatio: 0.35 // 修复后保留的弹药比例
  };

  /* ---------------- 步兵装备 ---------------- */
  /* ==========================================================================
     二、步兵装备（装备包与装备卡的数据来源）
     ========================================================================== */
  SL.EQUIP = {
    mg: {
      key: 'mg', name: '机枪', icon: 'MG', slot: 'weapon',
      desc: 'MG42，高射速大伤害，射程 180m',
      weapon: { range: 180, dmg: 12, interval: 0.32, ap: 0.25, accuracy: 0.75, spread: 5, ammo: 120, kind: 'direct', usesUnitAmmo: true, mg: true, label: 'MG42' }
    },
    mortar: {
      key: 'mortar', name: '迫击炮', icon: 'MT', slot: 'weapon',
      desc: '8cm 迫击炮，射程 300m，散布 65m，溅射 60m；停止移动后才能开火',
      weapon: { range: 300, dmg: 70, interval: 5, ap: 0.45, accuracy: 1, spread: 0, ammo: 0, kind: 'shell', minRange: 40, scatter: 65, splash: 60, usesUnitAmmo: true, requiresStop: true, mortar: true, label: '8cm GrW 34' }
    },
    bazooka: {
      key: 'bazooka', name: '火箭筒', icon: 'BZ', slot: 'weapon',
      desc: 'Panzerschreck，3 发，对装甲高额杀伤，射程 200m；散布较大，不吃高地射程加成',
      weapon: { range: 200, dmg: 400, interval: 5, ap: 1.9, accuracy: 0.9, spread: 8, noRangeBonus: true, ammo: 3, kind: 'direct', antiArmor: true, rocket: true, projectileSpeed: 55, label: 'Panzerschreck' }
    },
    atgrenade: {
      key: 'atgrenade', name: '反坦克手雷', icon: '雷', slot: 'weapon',
      desc: '5 发一组，射程 100m，高穿甲，对装甲目标优先使用',
      weapon: { range: 100, dmg: 450, interval: 2.5, ap: 1.5, accuracy: 0.85, spread: 3, ammo: 5, kind: 'direct', antiArmor: true, label: '反坦克手雷' }
    },
    grenade: {
      key: 'grenade', name: '手榴弹', icon: '手', slot: 'weapon',
      desc: '10 发，射程 100m，35m 溅射',
      weapon: { range: 100, dmg: 220, interval: 1.5, ap: 0.3, accuracy: 0.85, spread: 4, ammo: 10, kind: 'direct', splash: 35, label: '手榴弹' }
    },
    sniper: {
      key: 'sniper', name: '狙击侦察小组', icon: '狙', slot: 'weapon',
      desc: '狙击步枪+反坦克步枪：视野+100m，对步兵600m/150伤害，对装甲车400m高伤，对中坦轻伤，对重坦无效；可创建一次灌木隐蔽',
      weapon: {
        range: 600, dmg: 150, interval: 4.5, ap: 0.5, accuracy: 0.9, spread: 1,
        ammo: 0, kind: 'direct', usesUnitAmmo: true, sniper: true,
        antiArmorRange: 400, armoredDmg: 280, tankDmg: 60, heavyDmg: 0,
        label: '狙击步枪 / 反坦克步枪'
      },
      uses: 1
    },
    camo: {
      key: 'camo', name: '伪装服', icon: '伪', slot: 'tool',
      desc: '步兵自带伪装效果，开火失效',
      weapon: null
    },
    medkit: {
      key: 'medkit', name: '应急医疗包', icon: '医', slot: 'tool',
      desc: '自动恢复生命，医疗量耗尽后消失',
      heal: 120, healRate: 4, weapon: null
    },
    engineer: {
      key: 'engineer', name: '工兵装备', icon: '工', slot: 'tool',
      desc: '可构筑/修复强化工事；Shift+右键可建造一个野战工事区（1 次）',
      uses: 1, weapon: null
    }
  };
  SL.AI_FORT = {
    fillChance: { easy: 0.25, normal: 0.45, hard: 0.65, endless: 0.8 },
    weaponCap: { easy: 1, normalMin: 2, normalMax: 3, hard: 4, endlessEarly: 2, endlessMid: 4, endlessLate: 6 },
    types: ['bunker', 'mortar_nest', 'at_gun_nest', 'flak88']
  };
  /* 工程车：工程值、布设间距、消耗与障碍血量 */
  SL.ENGINEER = {
    maxValue: 200,
    refillRate: 30,
    refillAmmoCost: 1,
    modeSpeedMul: 0.8,
    rubbleRepairSpeed: 2,
    rubbleRepairCost: 18,
    layGap: { mine_ap: 18, mine_at: 18, wire: 28, hedgehog: 28 },
    cost: { mine_ap: 8, mine_at: 14, wire: 12, hedgehog: 12 },
    connectRange: 52,
    nodeHp: 1500,
    mineTrigger: 16,
    mineSplash: { mine_ap: 34, mine_at: 48 },
    mineDamage: { mine_ap: 190, mine_at: 520 },
    crushWireDamage: 1500
  };

  SL.DROP = { chance: 0.15, expire: 150, radius: 12, max: 24 };

  SL.EQUIP_KEYS = ['mg', 'mortar', 'bazooka', 'atgrenade', 'grenade', 'sniper', 'camo', 'medkit', 'engineer'];
  SL.EQUIP_PACK = [
    { key: 'mg', w: 14 },
    { key: 'mortar', w: 14 },
    { key: 'bazooka', w: 14 },
    { key: 'atgrenade', w: 12 },
    { key: 'grenade', w: 12 },
    { key: 'sniper', w: 10 },
    { key: 'camo', w: 14 },
    { key: 'medkit', w: 14 },
    { key: 'engineer', w: 16 }
  ];
  SL.pickEquipKey = function () {
    var total = 0, i;
    for (i = 0; i < SL.EQUIP_PACK.length; i++) total += SL.EQUIP_PACK[i].w;
    var roll = Math.random() * total;
    for (i = 0; i < SL.EQUIP_PACK.length; i++) {
      roll -= SL.EQUIP_PACK[i].w;
      if (roll < 0) return SL.EQUIP_PACK[i].key;
    }
    return 'mg';
  };

  /* 距离越远，直接火力命中率越低；火炮 scatter 视为最大射程散布 */
  SL.ACCURACY_FALLOFF = 0.30;
  SL.MOVING_ACCURACY = 0.50;

  /* 单位包 / AI 增援的随机权重 */
  SL.UNIT_PACK = [
    { key: 'infantry', w: 20 },
    { key: 'armored', w: 15 },
    { key: 'aa', w: 14 },
    { key: 'at_gun', w: 12 },
    { key: 'rocket_arty', w: 5 },
    { key: 'command', w: 6 },
    { key: 'engineer_vehicle', w: 14 },
    { key: 'tank', w: 12 },
    { key: 'heavy_tank', w: 10 },
    { key: 'artillery', w: 7 },
    { key: 'heavy_arty', w: 5 }
  ];
  /* AI 大幅偏向步兵 */
  SL.AI_UNIT_PACK = [
    { key: 'infantry', w: 51 },
    { key: 'armored', w: 16 },
    { key: 'aa', w: 9 },
    { key: 'at_gun', w: 8 },
    { key: 'rocket_arty', w: 3 },
    { key: 'tank', w: 7 },
    { key: 'heavy_tank', w: 4 },
    { key: 'artillery', w: 3 },
    { key: 'heavy_arty', w: 2 }
  ];
  /* 玩家基础连队保持 6；AI 重生更高 */
  SL.RESPAWN = {
    playerBase: 6,
    aiBase: 8,
    aiPerLevel: 1,
    aiCap: 14,
    playerCap: 12
  };
  SL.AI_UNIT_CAP = { easy: 14, normal: 20, hard: 26, endless: 32 };

  /* 黄圈争夺区：同一落点持续 2.5 分钟，结束后换点 */
  SL.YELLOW = {
    r: 300,
    duration: 150,
    xpPerUnit: 18,
    winXp: 100000,
    scorePerUnitSecond: 1
  };

  SL.ZONE_SCORE = { holdPerSecond: 1 };

  /* 飞机与 AI 空袭 */
  SL.PLANE = {
    hp: 200,                 // 普通空袭轰炸机血量（玩家/AI 共用）
    vision: 200,             // 侦察机 200m 视野；其他飞机不提供视野
    supplyHp: 300,           // 补给运输机血量
    supplyEvade: 0.30,       // 补给运输机闪避
    reconHp: 140,            // 侦察机血量
    reconEvade: 0.60,        // 侦察机闪避
    airstrikeSpeed: 200,     // 空袭飞机速度
    supplySpeed: 180,        // 补给运输机速度
    reconSpeed: 0.9          // 侦察机绕圈角速度
  };
  /* 空袭炸弹参数（普通空袭申请，玩家与 AI 共用） */
  SL.AIRSTRIKE = {
    damage: 300,             // 对单位基础伤害
    radius: 125,             // 伤害半径（直径 250）
    fortDamage: 650,         // 对工事伤害
    supplyDamage: 300        // 对补给箱伤害
  };
  /* 侦察机侦察区参数 */
  SL.RECON_PLANE = {
    radius: 250,             // 侦察半径（直径 500）
    duration: 20,            // 持续秒数
    altitude: 150,           // 盘旋高度偏移
    orbitRadius: 150
  };
  /* 制空盘旋：三架战斗机在目标点上空巡逻，只攻击敌方飞机 */
  SL.AIR_PATROL = {
    count: 3,                // 战斗机数量
    hp: 180,                 // 单机血量
    evade: 0.50,             // 单机闪避率
    radius: 250,             // 制空圈半径（直径 500m）
    orbitRadius: 250,        // 盘旋半径（直径 500m）
    duration: 40,            // 持续 40 秒
    orbitSpeed: 0.9,         // 盘旋角速度
    chaseSpeed: 180,         // 追击敌机时的飞行速度
    tailDistance: 100,       // 追击时保持在敌机后方的距离
    jitter: 8,               // 跟随位置的轻微随机浮动幅度
    groundRange: 300,        // 无对空目标时扫射地面目标的距离
    groundDamage: 15,        // 对地扫射伤害
    groundInterval: 0.6,     // 对地扫射间隔
    interval: 1.1,           // 对空射击间隔
    damage: 35               // 对敌机单次伤害
  };
  SL.AI_AIR = { minGap: 20, maxGap: 45, chance: 0.6 };

  /* 炮火支援：显示圈与落点共用 radius */
  SL.SUPPORT = { radius: 150, duration: 15, shots: 30, dmg: 140, splash: 100 };

  /* 牵引火炮：收炮/架设时间（秒），移动完成前不开火 */
  SL.ARTILLERY = {
    artillery: { pack: 3.5, deploy: 4.5 },
    heavy_arty: { pack: 5.0, deploy: 6.0 }
  };

  /* 补给站：同时提供弹药、医疗与维修 */
  SL.SUPPLY = {
    radius: 100, ammo: 2500, hp: 2000,
    boxHp: 500,
    infantryHeal: 25, vehicleRepair: 20,
    ammoRate: 25
  };

  /* ---------------- 卡片 ---------------- */
  SL.CARD_DEFS = {
    med: { key: 'med', name: '医疗包', icon: '＋', color: '#b85c5c', use: 'unit', desc: '拖到步兵班：恢复 45% 生命' },
    repair: { key: 'repair', name: '维修包', icon: '⚒', color: '#c08a4a', use: 'unit', desc: '拖到装甲单位：恢复 40% 生命' },
    unitpack: { key: 'unitpack', name: '单位包', icon: '▣', color: '#5c7fa8', use: 'open', desc: '升级选中后立即开出一张单位卡' },
    equippack: { key: 'equippack', name: '装备包', icon: '✦', color: '#8a7a4a', use: 'open', desc: '升级选中后立即开出一张装备卡' },
    ammo: { key: 'ammo', name: '补给站', icon: '补', color: '#4f7a45', use: 'point', desc: '绿色运输机投送：补给圈中心有 500 HP 补给箱，可被摧毁' },
    airstrike: { key: 'airstrike', name: '空袭申请', icon: '空', color: '#a63f33', use: 'point', desc: '拖到地图：半径 125m 伤害圈，高额杀伤' },
    artillery: { key: 'artillery', name: '炮火申请', icon: '☄', color: '#a65c33', use: 'point', desc: '拖到地图：重炮支援 15s 30 发，直径 300m' },
    recon: { key: 'recon', name: '侦察申请', icon: '◎', color: '#3f7a7a', use: 'point', desc: '拖到地图：飞机盘旋 20s，侦察直径 500m' },
    airpatrol: { key: 'airpatrol', name: '制空盘旋', icon: '战', color: '#5a6f8a', use: 'point', desc: '拖到地图：3 架战斗机盘旋 40 秒，在直径 500m 空域追击敌机尾部' },
    fortpack: { key: 'fortpack', name: '工事装备包', icon: '堡', color: '#7c5a32', use: 'open', desc: '升级选中后立即开出一张工事卡' },
    bunker: { key: 'bunker', name: '机枪碉堡', icon: '堡', color: '#7c5a32', use: 'point', desc: '拖到强化工事区：300m 机枪火力 + 额外减伤' },
    mortar_nest: { key: 'mortar_nest', name: '迫击炮阵地', icon: '迫', color: '#6e6a3a', use: 'point', desc: '拖到强化工事区：3 门迫击炮陆续射击，射程 500m，散布 50m' },
    at_gun_nest: { key: 'at_gun_nest', name: '反坦克炮阵地', icon: '反炮', color: '#6b5b34', use: 'point', desc: '拖到强化工事区：500m 反坦克火力' },
    flak88: { key: 'flak88', name: '88防空炮阵地', icon: '88', color: '#5f5530', use: 'point', desc: '拖到强化工事区：400m 对地 / 600m 对空' },
    target: { key: 'target', name: '标靶卡片', icon: '靶', color: '#a84c3c', use: 'point', desc: '仅试验场：在指定位置放置一个标靶' },
    armor_target: { key: 'armor_target', name: '装甲标靶卡片', icon: '甲靶', color: '#7a5c3a', use: 'point', desc: '仅试验场：在指定位置放置一个装甲标靶（参考中型坦克）' },
    heavy_target: { key: 'heavy_target', name: '重坦标靶卡片', icon: '重靶', color: '#6e4d32', use: 'point', desc: '仅试验场：在指定位置放置一个敌方重坦标靶（参考重型坦克）' },
    boss_hell: { key: 'boss_hell', name: 'Boss · 地狱轰炸机', icon: 'B', color: '#8c3b2e', use: 'point', desc: '仅试验场：召唤地狱轰炸机' },
    boss_tank: { key: 'boss_tank', name: 'Boss · 超级重坦', icon: 'B', color: '#6d5630', use: 'point', desc: '仅试验场：召唤超级重坦' },
    boss_ghost: { key: 'boss_ghost', name: 'Boss · 幽灵兵团', icon: 'B', color: '#4b6a5a', use: 'point', desc: '仅试验场：召唤幽灵兵团' },
    unit: { key: 'unit', name: '单位卡', icon: '▣', color: '#5c7fa8', use: 'unit', desc: '拖到地图：在友军 200m 内生成单位' },
    equip: { key: 'equip', name: '装备卡', icon: '✦', color: '#8a7a4a', use: 'equip', desc: '拖到步兵班：直接装备武器' }
  };

  /* 抽卡池权重 */
  SL.CARD_POOL = [
    { key: 'unitpack', w: 11 },
    { key: 'equippack', w: 11 },
    { key: 'ammo', w: 11 },
    { key: 'fortpack', w: 11 },
    { key: 'recon', w: 10 },
    { key: 'airpatrol', w: 4 },
    { key: 'airstrike', w: 4 },
    { key: 'artillery', w: 2 }
  ];

  SL.COLORS = {
    paper: '#e7ddc4',
    paperLight: '#efe6d0',
    paperDark: '#d9cdb0',
    ink: '#3b3a31',
    inkSoft: 'rgba(59,58,49,0.55)',
    contour: '#a1764f',
    contourIndex: '#7c4f2e',
    grid: 'rgba(72,86,66,0.20)',
    gridBold: 'rgba(60,74,56,0.30)',
    water: '#5f87a8',
    waterLight: '#93b8cf',
    forest: '#7e9157',
    forestDark: '#66794a',
    road: '#c9a97f',
    roadEdge: '#8f7350',
    building: '#c3ab8c',
    buildingEdge: '#7d6752',
    blue: '#2f5f92',
    blueLight: '#8fbce4',
    blueDark: '#1d3d61',
    red: '#a63f33',
    redLight: '#e39484',
    redDark: '#6e2620',
    green: '#4f7a45',
    greenLight: '#b4d3a4',
    greenDark: '#2f4a29',
    fog: '#0c1116',
    hudBg: 'rgba(14,18,20,0.86)',
    hudLine: 'rgba(196,178,134,0.35)',
    hudText: '#e7ddc4'
  };

  SL.TYPE_LABEL = {
    infantry: '步兵', armored: '装甲车', tank: '中型坦克', artillery: '火炮',
    heavy_arty: '重型火炮', heavy_tank: '重型坦克', aa: '防空车',
    at_gun: '反坦克炮', rocket_arty: '自行火箭炮', command: '指挥车', engineer_vehicle: '工程车',
    boss_super: '超级重坦', boss_ghost: '幽灵步兵', target: '标靶', armor_target: '装甲标靶', heavy_target: '重坦标靶'
  };

  SL.FONT_UI = '"Noto Sans SC","Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  SL.FONT_MONO = '"Cascadia Mono",Consolas,"Courier New",monospace';
})();
