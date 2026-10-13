// 地图配置：区域国家、难度与目标省数
// 说明：省份划分由 mapgen 离线生成；数值可后续调整（见 docs/开发计划与实现方案.md §8）

export const MAPS = [
  {
    id: "europe-3",
    name: "欧洲 · 3 国",
    difficulty: 3,
    totalProvinces: 30,
    playable: ["FRA", "DEU", "ITA"],
    neutral: ["BEL", "NLD", "LUX", "CHE", "AUT", "CZE", "DNK", "SVN", "HRV", "HUN"],
  },
  {
    id: "europe-5",
    name: "欧洲 · 5 国",
    difficulty: 5,
    totalProvinces: 50,
    playable: ["FRA", "DEU", "ITA", "ESP", "POL"],
    neutral: ["BEL", "NLD", "LUX", "CHE", "AUT", "CZE", "DNK", "SVN", "HRV", "HUN"],
  },
  {
    id: "europe-7",
    name: "欧洲 · 7 国",
    difficulty: 7,
    totalProvinces: 70,
    playable: ["FRA", "DEU", "ITA", "ESP", "POL", "GBR", "AUT"],
    neutral: ["BEL", "NLD", "LUX", "CHE", "CZE", "DNK", "SVN", "HRV", "HUN", "PRT"],
  },
];

/** 可玩国家每国目标省数（开局） */
export const PLAYABLE_PROVINCES = 6;

/** 欧洲裁剪范围（去掉海外领土 / 属地） */
export const EUROPE_BBOX = { minLon: -12, maxLon: 32, minLat: 35, maxLat: 71 };

/** 国家元数据（ISO A3 -> 中文名 + 颜色） */
export const NATION_META = {
  FRA: { name: "法国", color: "#3b6fd4" },
  DEU: { name: "德国", color: "#4d4d55" },
  ITA: { name: "意大利", color: "#3f9e57" },
  ESP: { name: "西班牙", color: "#c9a227" },
  POL: { name: "波兰", color: "#c0504d" },
  GBR: { name: "英国", color: "#7a4fbf" },
  AUT: { name: "奥地利", color: "#d97b2b" },
  BEL: { name: "比利时", color: "#9aa7b0" },
  NLD: { name: "荷兰", color: "#d4a017" },
  LUX: { name: "卢森堡", color: "#8fbf7a" },
  CHE: { name: "瑞士", color: "#b5453b" },
  CZE: { name: "捷克", color: "#5f9ea0" },
  DNK: { name: "丹麦", color: "#b06fa8" },
  SVN: { name: "斯洛文尼亚", color: "#6f8fbf" },
  HRV: { name: "克罗地亚", color: "#cf8b6a" },
  HUN: { name: "匈牙利", color: "#8a9a5b" },
  PRT: { name: "葡萄牙", color: "#4f7f6f" },
};

export const NEUTRAL_COLOR = "#c9c3b4";