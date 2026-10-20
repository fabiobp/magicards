// Converts MagiCards source art (Unity project + art folder) into web-ready WebP files
// for /magicards. Run from this folder: `npm run assets`.
// Source roots are machine-specific; adjust them if the projects move.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// libvips keeps opened files cached; on Windows that blocks overwriting outputs on re-runs.
sharp.cache(false);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const OUT = path.join(SITE, 'magicards', 'assets', 'img');
const GENERATED = path.join(SITE, 'magicards', 'src', 'generated');
const PREVIEW = process.env.MAGICARDS_PREVIEW || path.join(HERE, '.preview');

const UNITY = 'C:/Unity Projects/DungeonRunner Project/Dungeon-Runner-Fabio/Assets/Resources/Textures';
const ART = 'C:/Users/fabio/OneDrive-Armazenamento/OneDrive/MagiCards/Arte Final';
const RENDER = 'C:/Users/fabio/magicards_build/render';

const FOREST_ART = `${ART}/1) BIOMA- FLORESTA (easy)`;
// Union of the closed and open Dragon Tower chest bounds: both share one frame so swapping them keeps the box in place.
const CHEST_CROP = { left: 65, top: 78, width: 905, height: 819 };

// [output name (no extension), source file, max width, options]
const MANIFEST = [
  // Environment
  ['env/forest-wallfloor', `${UNITY}/Biome/Forest/Dungeon/ForestDungeon_WallFloor.png`, 2048, { q: 80, opaque: true }],
  ['env/forest-wallroom', `${FOREST_ART}/AMBIENTE/FLORESTA-DG/ForestDungeon_WALLROOM_TEX_3072.png`, 2048, { q: 80 }],
  ['env/desert-wallfloor', `${UNITY}/Biome/Desert/Dungeon/Desert_WallFloor_Dungeon.png`, 2048, { q: 80, opaque: true }],
  ['env/desert-ceiling', `${UNITY}/Biome/Desert/Dungeon/Desert_WallFloor_Dungeon_Ceiling.png`, 1024, { q: 78 }],
  ['env/door-open', `${UNITY}/Biome/Forest/Dungeon/Door_1.png`, 1024, {}],
  ['env/door-stairs', `${UNITY}/Biome/Forest/Dungeon/Door_up.png`, 1024, {}],
  ['env/pillar', `${UNITY}/Biome/Forest/Dungeon/Pillar_Full_1A.png`, 1024, { trim: true }],
  ['env/grass', `${UNITY}/Biome/Forest/Dungeon/Grass_dungeon.png`, 1024, { trim: true }],
  ['env/grass2', `${UNITY}/Biome/Forest/Dungeon/Grass_dungeon_2.png`, 1024, { trim: true }],
  ['env/vines', `${FOREST_ART}/AMBIENTE/FLORESTA-INTERAÇÃO/SPRITES/sprite_forest_vines_3.png`, 1024, { trim: true }],
  ['env/rock', `${FOREST_ART}/AMBIENTE/FLORESTA-INTERAÇÃO/SPRITES/sprite_forest_dungeon_rock_1.png`, 768, { trim: true }],
  ['env/spikes', `${UNITY}/Biome/Forest/Dungeon/MetalSpike.png`, 1024, { trim: true }],
  ['env/floor-trap', `${UNITY}/trap/FloorTrap1.png`, 1024, { trim: true }],
  ['env/mist-0', `${UNITY}/trap/GasTrap/PoisonMist_1.png`, 1024, {}],
  ['env/mist-1', `${UNITY}/trap/GasTrap/PoisonMist_3.png`, 1024, {}],
  ['env/light-1', `${UNITY}/Biome/Common/vfx/Light_1.png`, 512, {}],
  ['env/light-2', `${UNITY}/Biome/Common/vfx/Light_2.png`, 512, {}],
  ['env/light-3', `${UNITY}/Biome/Common/vfx/Light_3.png`, 512, {}],
  ['env/light-4', `${UNITY}/Biome/Common/vfx/Light_4.png`, 512, {}],
  // Home map portal: layers of the game's Portal VFX rendered in Unity (Prefabs/Home/Portal.prefab),
  // circular and sharing one frame so they can be stacked and the swirl spun.
  ['env/home-portal-swirl', `${RENDER}/hp-portal.png`, 768, { additive: true }],
  ['env/home-portal-glow', `${RENDER}/hp-center-glow.png`, 512, { additive: true }],
  ['env/home-portal-smoke', `${RENDER}/hp-smoke.png`, 768, { additive: true }],
  ['env/exit', `${UNITY}/Biome/Common/sprite_exit.png`, 1024, { trim: true }],
  ['env/desert-pillar', `${UNITY}/Biome/Desert/Dungeon/DesertDungeon_Pillar.png`, 1024, { trim: true }],
  ['env/desert-vase', `${UNITY}/Biome/Desert/Dungeon/DesertDungeon_Vase.png`, 768, { trim: true }],
  ['env/desert-vase2', `${UNITY}/Biome/Desert/Dungeon/Desert_Dungeon_Vase3.png`, 768, { trim: true }],
  ['env/desert-sarcophagus', `${UNITY}/Biome/Desert/Dungeon/Desert_Dungeon_Sarcophagus.png`, 768, { trim: true }],
  ['env/desert-bowl', `${UNITY}/Biome/Desert/Dungeon/DesertDungeon_Bowl.png`, 768, { trim: true }],

  // Hero, logo, homepage banner
  ['hero/splash', `${ART}/slashart/Splash2.jpg`, 2400, { q: 80, opaque: true }],
  ['hero/splash-m', `${ART}/slashart/Splash2.jpg`, 1280, { q: 78, opaque: true }],
  ['hero/logo', `${UNITY}/logo_MagiCards_arcana_D.png`, 1200, { trim: true }],
  ['hero/feature', `${ART}/logo e icones/Icone e Feature/feature1.jpg`, 1600, { q: 80, opaque: true }],

  // Monsters
  ['monsters/nightfang', `${FOREST_ART}/PERSONAGENS/PNG/Easy1_Nightfang.png`, 1024, { trim: true }],
  ['monsters/grimboar', `${FOREST_ART}/PERSONAGENS/PNG/Easy1_Grimboar.png`, 1024, { trim: true }],
  ['monsters/monkeyguard', `${FOREST_ART}/PERSONAGENS/PNG/Easy1_MonkeyGuard.png`, 1024, { trim: true }],
  ['monsters/worldboss', `${RENDER}/ogre_0_Idle.png`, 1024, { trim: true }],

  // Cards
  ...[100, 1000, 1100, 1200, 1300, 3000, 5100, 8400, 11800, 12800, 14100, 14400, 15500, 16500, 18700, 19000, 20400, 10500, 1000000]
    .map(id => [`cards/${id}`, `${UNITY}/Cards/${id}.png`, 512, { q: 82 }]),
  ['cards/back', `${ART}/Cartas/backview/backview.png`, 512, { q: 82 }],
  ['ui/star', `${UNITY}/Cards/UI/star.png`, 128, {}],
  ['ui/star-empty', `${UNITY}/Cards/UI/star_placeholder.png`, 128, {}],
  ['ui/card-glow', `${UNITY}/Cards/UI/vfx_frame_cards.png`, 512, {}],

  // Loot & player assets
  ['loot/coin', `${UNITY}/Coin/coin.png`, 256, { trim: true }],
  ['loot/card-soul', `${UNITY}/CardSoul/card_soul_mage.png`, 256, { trim: true }],
  ['loot/relic', `${UNITY}/Relics/1.png`, 256, { trim: true }],
  ['loot/potion-heal', `${UNITY}/Potions/1004.png`, 256, { trim: true }],
  ['loot/potion-2', `${UNITY}/Potions/1104.png`, 256, { trim: true }],
  ['loot/potion-3', `${UNITY}/Potions/1204.png`, 256, { trim: true }],
  ['loot/potion-4', `${UNITY}/Potions/1304.png`, 256, { trim: true }],
  ['loot/torch', `${UNITY}/Consumables/torch.png`, 256, { trim: true }],
  ['loot/bandage', `${UNITY}/Consumables/bandage.png`, 256, { trim: true }],
  ['loot/bomb', `${UNITY}/Consumables/bomb.png`, 256, { trim: true }],
  ['loot/provision', `${UNITY}/Consumables/food_provision.png`, 256, { trim: true }],
  ['loot/escape', `${UNITY}/Consumables/escape.png`, 256, { trim: true }],
  ['loot/luck', `${UNITY}/Consumables/luck.png`, 256, { trim: true }],
  ['loot/amulet', `${UNITY}/Equipments/Amulet/5016.png`, 256, { trim: true }],
  ['loot/shield', `${UNITY}/Equipments/Shield/5015.png`, 256, { trim: true }],
  ['loot/armour', `${UNITY}/Equipments/Body_Armour/5013.png`, 256, { trim: true }],
  ['loot/helmet', `${UNITY}/Equipments/Helmet/4011.png`, 256, { trim: true }],
  ['loot/boots', `${UNITY}/Equipments/Boots/5014.png`, 256, { trim: true }],
  ['loot/chest', `${UNITY}/Biome/DragonTower/DragonTower_chest1.png`, 512, { extract: CHEST_CROP }],
  ['loot/chest-open', `${UNITY}/Biome/DragonTower/DragonTower_chest2.png`, 512, { extract: CHEST_CROP }],

  // Forge
  ['forge/blacksmith-place', `${UNITY}/Home/same throne/blacksmith_place.png`, 1536, { trim: true }],
  ['forge/apothecary-place', `${UNITY}/Home/same throne/apothecary_place.png`, 1536, { trim: true }],
  ['forge/hammer', `${UNITY}/Crafting/blacksmith_highhammer.png`, 256, { trim: true }],
  // INGRED1 is a 5x4 grid of ingredient icons
  ['forge/ingredient-1', `${UNITY}/Potions/Material/INGRED1.png`, 192, { trim: true, cell: { cols: 5, rows: 4, col: 4, row: 2 } }],
  ['forge/ingredient-2', `${UNITY}/Potions/Material/INGRED1.png`, 192, { trim: true, cell: { cols: 5, rows: 4, col: 2, row: 1 } }],
  ['forge/ingredient-3', `${UNITY}/Potions/Material/INGRED1.png`, 192, { trim: true, cell: { cols: 5, rows: 4, col: 3, row: 3 } }],

  // Live events
  ['events/dragon-tower', `${UNITY}/Map/dragontower.png`, 512, { trim: true }],
  ['events/victory-stack', `${UNITY}/Map/victoryStackEvent.png`, 512, { trim: true }],
  ['events/wb-ticket', `${UNITY}/PlayerAssets/WorldBossTicket.png`, 256, { trim: true }],

  // Pet
  ['pet/egg-1', `${UNITY}/Pet/CaptureEvent/ovo1.png`, 768, {}],
  ['pet/egg-2', `${UNITY}/Pet/CaptureEvent/ovo2.png`, 768, {}],
  ['pet/egg-3', `${UNITY}/Pet/CaptureEvent/ovo3.png`, 768, {}],
  ['pet/ruffin', `${UNITY}/Pet/50.png`, 768, { trim: true }],
  ['pet/ruffin-coin', `${ART}/Pet/Pet Coin/Ruffin_coin.png`, 256, { trim: true }],
  ['ui/tap-hand', `${UNITY}/Pet/CaptureEvent/Hand.png`, 192, { trim: true }],

  // Minigame
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [`minigame/piece-${i}`, `${UNITY}/MiniGames/BlockOrder/Piece${i}.png`, 256, { q: 85 }]),
  ['minigame/board', `${UNITY}/MiniGames/BlockOrder/board_frame_square.png`, 1024, { q: 82 }],
  // 2x2 sheet, frames in reading order (closed -> open)
  ['minigame/lock-sheet', `${UNITY}/MiniGames/BlockOrder/lock_sheet.png`, 1024, {}],
  ['ui/banner-top', `${UNITY}/MiniGames/Shared/banner_top.png`, 1024, {}],
];

async function cellOf(src, { cols, rows, col, row }) {
  const { width, height } = await sharp(src).metadata();
  const w = Math.floor(width / cols), h = Math.floor(height / rows);
  return sharp(src).extract({ left: col * w, top: row * h, width: w, height: h }).png().toBuffer();
}

// Additive VFX renders carry no alpha: brightness becomes alpha and the colour is un-premultiplied,
// so the image looks the same over dark art with normal or additive blending.
async function additiveToAlpha(src) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0, q = 0; p < data.length; p += 3, q += 4) {
    const a = Math.max(data[p], data[p + 1], data[p + 2]);
    const k = a ? 255 / a : 0;
    out[q] = Math.round(data[p] * k);
    out[q + 1] = Math.round(data[p + 1] * k);
    out[q + 2] = Math.round(data[p + 2] * k);
    out[q + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function convert([name, src, maxW, opt]) {
  const dest = path.join(OUT, `${name}.webp`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const input = opt.cell ? await cellOf(src, opt.cell) : opt.additive ? await additiveToAlpha(src) : src;
  let img = sharp(input, { limitInputPixels: false });
  if (opt.trim) img = img.trim({ threshold: 1 });
  if (opt.extract) img = img.extract(opt.extract);
  img = img.resize({ width: maxW, withoutEnlargement: true });
  const q = opt.q ?? 82;
  const { data, info } = await img.webp(opt.opaque ? { quality: q } : { quality: q, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
  fs.writeFileSync(dest, data);
  return { name, w: info.width, h: info.height, kb: Math.round(data.length / 1024) };
}

// Splits the closed door (stone arch + wooden leaf in one image) into a frame layer and a
// separately hinged leaf. The leaf is the brown wood region; iron bands inside it are
// neutral grey, so each row is filled between the wood extents and band rows inherit the
// previous row's span.
async function splitDoor() {
  const src = `${UNITY}/Biome/Forest/Dungeon/Doorframe.png`;
  const { data, info } = await sharp(src).resize({ width: 1024 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const isWood = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    return a > 200 && r - b > 14 && r > 40 && r > g;
  };
  const spans = new Array(H).fill(null);
  for (let y = 0; y < H; y++) {
    let x0 = -1, x1 = -1, count = 0;
    for (let x = 0; x < W; x++) {
      if (isWood((y * W + x) * 4)) { count++; if (x0 < 0) x0 = x; x1 = x; }
    }
    if (count > 6) spans[y] = [x0, x1];
  }
  const firstY = spans.findIndex(s => s);
  let lastY = H - 1;
  while (lastY > 0 && !spans[lastY]) lastY--;
  // Rows inside iron bands have no wood: inherit the widest neighbour span.
  let prev = spans[firstY];
  for (let y = firstY; y <= lastY; y++) {
    if (!spans[y] || spans[y][1] - spans[y][0] < (prev[1] - prev[0]) * 0.6) spans[y] = prev.slice();
    prev = spans[y];
  }
  const mask = Buffer.alloc(W * H);
  let minX = W, maxX = 0;
  for (let y = firstY; y <= lastY; y++) {
    const [x0, x1] = spans[y];
    for (let x = Math.max(0, x0 - 2); x <= Math.min(W - 1, x1 + 2); x++) mask[y * W + x] = 255;
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
  }
  const leaf = Buffer.from(data);
  const frame = Buffer.from(data);
  for (let p = 0; p < W * H; p++) {
    if (mask[p]) frame[p * 4 + 3] = 0; else leaf[p * 4 + 3] = 0;
  }
  const raw = { raw: { width: W, height: H, channels: 4 } };
  fs.mkdirSync(path.join(OUT, 'env'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'env/door-frame.webp'), await sharp(frame, raw).webp({ quality: 82, alphaQuality: 90 }).toBuffer());
  const left = Math.max(0, minX - 2), top = Math.max(0, firstY - 2);
  const lw = Math.min(W - left, maxX - minX + 6), lh = Math.min(H - top, lastY - firstY + 4);
  fs.writeFileSync(path.join(OUT, 'env/door-leaf.webp'),
    await sharp(leaf, raw).extract({ left, top, width: lw, height: lh }).webp({ quality: 82, alphaQuality: 90 }).toBuffer());
  // Leaf rectangle in the frame's normalized UV space (origin top-left).
  return { canvas: [W, H], leaf: { x: left / W, y: top / H, w: lw / W, h: lh / H } };
}

async function contactSheet(results) {
  const cell = 220, cols = 8;
  const rows = Math.ceil(results.length / cols);
  const composites = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    const thumb = await sharp(path.join(OUT, `${r.name}.webp`)).resize(cell - 20, cell - 44, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    composites.push({ input: thumb, left: x + 10, top: y + 8 });
    const label = `${r.name} ${r.w}x${r.h} ${r.kb}KB`.replace(/&/g, '&amp;');
    composites.push({ input: Buffer.from(`<svg width="${cell}" height="30"><text x="4" y="20" font-size="12" fill="#ffd27a" font-family="Arial">${label}</text></svg>`), left: x, top: y + cell - 32 });
  }
  fs.mkdirSync(PREVIEW, { recursive: true });
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: '#3a3550' } })
    .composite(composites).png().toFile(path.join(PREVIEW, 'contact-sheet.png'));
}

const results = [];
for (const entry of MANIFEST) {
  try {
    results.push(await convert(entry));
  } catch (e) {
    console.error(`FAILED ${entry[0]} <- ${entry[1]}: ${e.message}`);
  }
}
const door = await splitDoor();
for (const name of ['env/door-frame', 'env/door-leaf']) {
  const file = path.join(OUT, `${name}.webp`);
  const meta = await sharp(file).metadata();
  results.push({ name, w: meta.width, h: meta.height, kb: Math.round(fs.statSync(file).size / 1024) });
}
// Official Google Play badge, trimmed of its built-in padding.
const BADGE = 'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
const badge = Buffer.from(await (await fetch(BADGE)).arrayBuffer());
fs.writeFileSync(path.join(OUT, 'ui/google-play.webp'), await sharp(badge).trim({ threshold: 10 }).webp({ quality: 90 }).toBuffer());

// Share image for link previews (JPEG for the widest crawler support).
fs.writeFileSync(path.join(OUT, 'hero/og.jpg'),
  await sharp(`${ART}/logo e icones/Icone e Feature/feature1.jpg`).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer());

fs.mkdirSync(GENERATED, { recursive: true });
fs.writeFileSync(path.join(GENERATED, 'door.json'), JSON.stringify(door));
fs.mkdirSync(PREVIEW, { recursive: true });
fs.writeFileSync(path.join(PREVIEW, 'manifest.json'), JSON.stringify({ door, results }, null, 1));
await contactSheet(results);
const total = results.reduce((s, r) => s + r.kb, 0);
console.log(`converted ${results.length} files, ${total} KB total`);
console.log('door', JSON.stringify(door));
