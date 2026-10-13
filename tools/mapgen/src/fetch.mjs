// 数据源：@geo-insight/data 的 ADM1 行政区划（GeoJSON，覆盖全球各国，体积小）
// 通过 npm 依赖获取（npmmirror 国内可快速下载），失败时回退到本地缓存目录。
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** ISO 3166-1 alpha-3 -> UN M49 数字码（@geo-insight/data 的文件名） */
export const ISO3_TO_M49 = {
  FRA: "250", DEU: "276", ITA: "380", ESP: "724", POL: "616", GBR: "826",
  AUT: "040", BEL: "056", NLD: "528", LUX: "442", CHE: "756", CZE: "203",
  DNK: "208", SVN: "705", HRV: "191", HUN: "348", PRT: "620", IRL: "372",
};

function resolveAdm1Dir() {
  const tries = [];
  for (const spec of ["@geo-insight/data", "@geo-insight/data/package.json", "@geo-insight/data/dist/assets/adm1/276.json"]) {
    try { tries.push(path.dirname(require.resolve(spec))); } catch { /* ignore */ }
  }
  tries.push(path.resolve(__dirname, "../node_modules/@geo-insight/data"));
  tries.push(path.resolve(__dirname, "../../../node_modules/@geo-insight/data"));
  for (const base of tries) {
    const dir = path.join(base, "dist", "assets", "adm1");
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error("找不到 @geo-insight/data 的 ADM1 目录，请先运行 pnpm install");
}

export const ADM1_DIR = resolveAdm1Dir();

/** 读取某国的 ADM1 要素（统一成 MultiPolygon 坐标） */
export async function loadCountryAdm1(iso3) {
  const code = ISO3_TO_M49[iso3];
  if (!code) throw new Error("未配置 M49 代码的国家：" + iso3);
  const file = path.join(ADM1_DIR, code + ".json");
  const gj = JSON.parse(await readFile(file, "utf8"));
  const out = [];
  for (const f of gj.features || []) {
    const geom = f.geometry;
    if (!geom) continue;
    const coords = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    if (!coords || !coords.length) continue;
    out.push({
      iso3,
      name: f.properties.name || f.properties.iso || iso3,
      iso: f.properties.iso || "",
      subType: f.properties.type || "",
      coords,
    });
  }
  return out;
}