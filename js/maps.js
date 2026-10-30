/* 钢线 1944 —— 三张 2km × 2km 战场布局 */
(function () {
  'use strict';
  var SL = window.SL;

  SL.MAPS = [
    {
      id: 'a',
      name: '圣洛村',
      subtitle: '河谷与村落',
      seed: 19440606,
      objective: { x: 1000, y: 1000 },
      spawns: {
        blue: { x: 500, y: 1590 },
        red: { x: 1524, y: 416 },
        green: { x: 1636, y: 1592 }
      },
      hills: [
        { x: 660, y: 600, rx: 400, ry: 360, h: 60, name: '圣洛高地' },
        { x: 300, y: 1280, rx: 420, ry: 330, h: 44, name: '蒙西山' },
        { x: 1600, y: 1600, rx: 400, ry: 340, h: 52, name: '卢普山' },
        { x: 1720, y: 450, rx: 300, ry: 270, h: 34, name: '博蒙丘' },
        { x: 1130, y: 1040, rx: 230, ry: 190, h: 16, name: '莫尔旺丘', hideLabel: true },
        { x: 1040, y: 1980, rx: 500, ry: 300, h: 26, name: '' },
        { x: -120, y: 600, rx: 380, ry: 320, h: 24, name: '' }
      ],
      streamName: '欧尔河',
      streams: [[
        { x: 1256, y: -120 }, { x: 1230, y: -40 }, { x: 1200, y: 180 }, { x: 1272, y: 420 },
        { x: 1176, y: 690 }, { x: 1044, y: 924 }, { x: 936, y: 1170 }, { x: 1032, y: 1412 },
        { x: 1208, y: 1640 }, { x: 1280, y: 1860 }, { x: 1324, y: 2040 }
      ]],
      roads: [[
        { x: -120, y: 1532 }, { x: -40, y: 1484 }, { x: 340, y: 1400 }, { x: 704, y: 1296 },
        { x: 1040, y: 1212 }, { x: 1384, y: 1280 }, { x: 1704, y: 1120 }, { x: 2040, y: 1024 },
        { x: 2120, y: 980 }
      ]],
      tracks: [[
        { x: 1400, y: 1296 }, { x: 1496, y: 1040 }, { x: 1400, y: 784 },
        { x: 1452, y: 500 }, { x: 1380, y: 240 }, { x: 1336, y: -60 }
      ]],
      forests: [
        { x: 304, y: 850, r: 236, w: 1.0 },
        { x: 850, y: 356, r: 164, w: 0.85 },
        { x: 1744, y: 1400, r: 236, w: 1.0 },
        { x: 576, y: 1810, r: 168, w: 0.8 },
        { x: 1132, y: 1524, r: 116, w: 0.7 },
        { x: 1850, y: 300, r: 140, w: 0.8 }
      ],
      village: { x: 1384, y: 1296, name: '圣洛村' },
      farms: [
        { x: 840, y: 1460, a: 0.25, n: 3 },
        { x: 940, y: 1384, a: -0.55, n: 2 },
        { x: 1212, y: 752, a: 0.1, n: 0 }
      ],
      zones: [
        { id: 'z_outpost', name: '圣洛前哨', kind: 'fort', x: 664, y: 1600, r: 72 },
        { id: 'z_one', name: '圣洛一号阵地', kind: 'fort', x: 1040, y: 1208, r: 72 },
        { id: 'z_two', name: '卢普二号阵地', kind: 'fort', x: 1600, y: 1600, r: 68 },
        { id: 'z_nest', name: '磨坊机枪巢', kind: 'fort', x: 1488, y: 1112, r: 48 },
        { id: 'z_ridge', name: '圣洛北岭哨位', kind: 'fort', x: 660, y: 600, r: 64 },
        { id: 'z_gun', name: '教堂炮位', kind: 'fort', x: 1720, y: 450, r: 56 },
        { id: 'z_east', name: '圣洛村东院', kind: 'town', x: 1432, y: 1280, r: 60 },
        { id: 'z_west', name: '圣洛村西院', kind: 'town', x: 1316, y: 1324, r: 52 },
        { id: 'z_li', name: '勒克莱尔农庄', kind: 'village', x: 840, y: 1460, r: 56 },
        { id: 'z_hewan', name: '欧尔河农舍', kind: 'village', x: 940, y: 1384, r: 48 },
        { id: 'z_bush1', name: '山楂丛', kind: 'bush', x: 904, y: 1544, r: 68 },
        { id: 'z_bush2', name: '榛木丛', kind: 'bush', x: 1208, y: 904, r: 60 },
        { id: 'z_bush3', name: '荆豆丛', kind: 'bush', x: 744, y: 1192, r: 64 },
        { id: 'z_bush4', name: '接骨木丛', kind: 'bush', x: 1584, y: 744, r: 60 }
      ]
    },
    {
      id: 'b',
      name: '奥恩岭',
      subtitle: '南北山脊与中央桥',
      seed: 19440720,
      objective: { x: 1000, y: 1000 },
      spawns: {
        blue: { x: 300, y: 1800 },
        red: { x: 1700, y: 250 },
        green: { x: 1750, y: 1750 }
      },
      hills: [
        { x: 700, y: 520, rx: 520, ry: 320, h: 70, name: '奥恩北岭' },
        { x: 900, y: 1550, rx: 600, ry: 300, h: 58, name: '奥恩南岭' },
        { x: 1650, y: 800, rx: 300, ry: 260, h: 40, name: '卡堡丘' },
        { x: 250, y: 1000, rx: 280, ry: 240, h: 36, name: '圣米歇尔丘' },
        { x: 1050, y: 1050, rx: 160, ry: 140, h: 18, name: '库唐丘', hideLabel: true }
      ],
      streamName: '奥恩河',
      streams: [[
        { x: -60, y: 1180 }, { x: 300, y: 1120 }, { x: 600, y: 1160 }, { x: 900, y: 1080 },
        { x: 1200, y: 1120 }, { x: 1500, y: 1050 }, { x: 2060, y: 1100 }
      ]],
      roads: [
        [{ x: 950, y: -60 }, { x: 930, y: 300 }, { x: 980, y: 700 }, { x: 940, y: 1100 }, { x: 960, y: 1500 }, { x: 980, y: 2060 }],
        [{ x: -60, y: 980 }, { x: 400, y: 1020 }, { x: 800, y: 980 }, { x: 1200, y: 1010 }, { x: 1600, y: 980 }, { x: 2060, y: 1000 }]
      ],
      tracks: [[
        { x: 1050, y: 980 }, { x: 1050, y: 700 }, { x: 1000, y: 500 }, { x: 1050, y: 300 }
      ]],
      forests: [
        { x: 300, y: 300, r: 150, w: 1.0 },
        { x: 1700, y: 300, r: 120, w: 0.9 },
        { x: 1700, y: 1700, r: 130, w: 0.9 },
        { x: 300, y: 1700, r: 150, w: 1.0 },
        { x: 1250, y: 700, r: 90, w: 0.7 }
      ],
      village: { x: 1050, y: 980, name: '奥恩村' },
      farms: [
        { x: 1500, y: 700, a: 0.3, n: 3 },
        { x: 600, y: 1500, a: -0.4, n: 3 }
      ],
      zones: [
        { id: 'b_ridge', name: '奥恩北岭哨位', kind: 'fort', x: 700, y: 520, r: 64 },
        { id: 'b_south', name: '奥恩南岭阵地', kind: 'fort', x: 900, y: 1550, r: 68 },
        { id: 'b_bridge', name: '奥恩桥头堡', kind: 'fort', x: 1000, y: 1090, r: 56 },
        { id: 'b_east', name: '卡堡东岗', kind: 'fort', x: 1650, y: 800, r: 60 },
        { id: 'b_west', name: '圣米歇尔西岗', kind: 'fort', x: 250, y: 1000, r: 56 },
        { id: 'b_village', name: '奥恩村', kind: 'town', x: 1050, y: 980, r: 64 },
        { id: 'b_farm1', name: '奥恩北岸农舍', kind: 'village', x: 1500, y: 700, r: 52 },
        { id: 'b_farm2', name: '奥恩南岸农舍', kind: 'village', x: 600, y: 1500, r: 52 },
        { id: 'b_bush1', name: '山楂丛', kind: 'bush', x: 400, y: 1200, r: 60 },
        { id: 'b_bush2', name: '榛木丛', kind: 'bush', x: 1350, y: 1300, r: 60 },
        { id: 'b_bush3', name: '荆豆丛', kind: 'bush', x: 1200, y: 400, r: 60 },
        { id: 'b_gun', name: '奥恩东岭炮位', kind: 'fort', x: 1650, y: 1200, r: 48 }
      ]
    },
    {
      id: 'c',
      name: '维尔河湾',
      subtitle: '大河拐弯与林地',
      seed: 19440811,
      objective: { x: 1000, y: 1000 },
      spawns: {
        blue: { x: 250, y: 350 },
        red: { x: 1750, y: 350 },
        green: { x: 1000, y: 1850 }
      },
      hills: [
        { x: 1500, y: 1200, rx: 500, ry: 300, h: 62, name: '维尔岭' },
        { x: 400, y: 500, rx: 400, ry: 300, h: 48, name: '格朗北丘' },
        { x: 600, y: 1850, rx: 350, ry: 250, h: 30, name: '格朗南丘' },
        { x: 1800, y: 1500, rx: 300, ry: 250, h: 34, name: '东岸丘' },
        { x: 150, y: 1500, rx: 250, ry: 200, h: 24, name: '西岸丘' }
      ],
      streamName: '维尔河',
      streams: [[
        { x: -60, y: 1700 }, { x: 300, y: 1620 }, { x: 600, y: 1500 }, { x: 800, y: 1350 },
        { x: 900, y: 1200 }, { x: 980, y: 1050 }, { x: 1050, y: 900 }, { x: 1200, y: 760 },
        { x: 1400, y: 650 }, { x: 1650, y: 560 }, { x: 2060, y: 520 }
      ]],
      roads: [
        [{ x: -60, y: 1900 }, { x: 500, y: 1820 }, { x: 900, y: 1650 }, { x: 1300, y: 1500 }, { x: 1700, y: 1380 }, { x: 2060, y: 1320 }],
        [{ x: -60, y: 700 }, { x: 400, y: 780 }, { x: 800, y: 720 }, { x: 1200, y: 800 }, { x: 1600, y: 750 }, { x: 2060, y: 820 }]
      ],
      tracks: [[
        { x: 1000, y: 700 }, { x: 980, y: 900 }, { x: 1000, y: 1100 }, { x: 1020, y: 1300 }, { x: 1050, y: 1500 }
      ]],
      forests: [
        { x: 300, y: 300, r: 150, w: 1.0 },
        { x: 900, y: 300, r: 120, w: 0.9 },
        { x: 1700, y: 300, r: 140, w: 0.9 },
        { x: 400, y: 1650, r: 120, w: 0.9 },
        { x: 1800, y: 1800, r: 130, w: 0.9 },
        { x: 1600, y: 900, r: 90, w: 0.7 }
      ],
      village: { x: 1400, y: 1400, name: '维尔村' },
      farms: [
        { x: 500, y: 1300, a: 0.2, n: 3 },
        { x: 1600, y: 700, a: -0.3, n: 2 }
      ],
      zones: [
        { id: 'c_ferry', name: '维尔渡口', kind: 'fort', x: 1000, y: 1050, r: 60 },
        { id: 'c_north', name: '维尔北岸哨位', kind: 'fort', x: 400, y: 500, r: 64 },
        { id: 'c_south', name: '维尔南岸阵地', kind: 'fort', x: 600, y: 1850, r: 64 },
        { id: 'c_village', name: '维尔村', kind: 'town', x: 1400, y: 1400, r: 64 },
        { id: 'c_mill', name: '维尔河东农舍', kind: 'village', x: 1600, y: 700, r: 50 },
        { id: 'c_gun', name: '维尔高地炮位', kind: 'fort', x: 1500, y: 1200, r: 56 },
        { id: 'c_bush1', name: '山楂丛', kind: 'bush', x: 800, y: 800, r: 60 },
        { id: 'c_bush2', name: '榛木丛', kind: 'bush', x: 1200, y: 1600, r: 60 },
        { id: 'c_bush3', name: '荆豆丛', kind: 'bush', x: 500, y: 1000, r: 60 },
        { id: 'c_bush4', name: '接骨木丛', kind: 'bush', x: 1700, y: 1100, r: 60 }
      ]
    }
  ];

  // 训练场：2km 平地，无敌人；每种代表占领区各放一个
  SL.MAPS.push({
    id: 'range',
    name: '圣洛训练场',
    subtitle: '无敌人 · 6 种代表占领区',
    seed: 19440901,
    test: true,
    objective: { x: 1000, y: 1000 },
    spawns: {
      blue: { x: 1000, y: 1600 },
      red: { x: 100, y: 100 },
      green: { x: 1900, y: 100 }
    },
    hills: [
      { x: 500, y: 800, rx: 210, ry: 170, h: 70, name: '训练高地' }
    ],
    streamName: '',
    streams: [],
    roads: [],
    tracks: [],
    forests: [],
    village: { x: 1000, y: 1000, name: '圣洛训练营地' },
    farms: [],
    zones: [
      { id: 'r_highland', name: '训练区 · 高地', kind: 'fort', x: 500, y: 800, r: 76 },
      { id: 'r_bush', name: '训练区 · 灌木', kind: 'bush', x: 1000, y: 800, r: 68 },
      { id: 'r_forest', name: '训练区 · 林地', kind: 'forest', x: 1500, y: 800, r: 74 },
      { id: 'r_trench', name: '训练区 · 阵地', kind: 'fort', x: 500, y: 1200, r: 72 },
      { id: 'r_house', name: '训练区 · 房区', kind: 'village', x: 1000, y: 1200, r: 68 },
      { id: 'r_fort', name: '训练区 · 工事', kind: 'fort', x: 1500, y: 1200, r: 60 }
    ]
  });

  SL.MAP_BY_ID = {};
  for (var i = 0; i < SL.MAPS.length; i++) SL.MAP_BY_ID[SL.MAPS[i].id] = SL.MAPS[i];
})(window);
