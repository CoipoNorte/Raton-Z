export type CharacterId = "mouse" | "rabbit" | "cat";
export type WeaponId = "pistol" | "shotgun" | "rifle" | "smg";

// One "personaje" is 0.85 world units, so pistol/shotgun reach 5 characters
// (4.25 units) and rifles reach 7 (5.95). That is roughly one third of the
// original 12.5-unit auto-aim bubble.
export const CHARACTER_UNIT = 0.85;
export const KNIFE_COOLDOWN = 15;

export const WEAPONS: Record<
  WeaponId,
  {
    id: WeaponId;
    name: string;
    range: number;
    clip: number;
    ammo: number;
    reload: number;
    cooldown: number;
    damage: number;
    targets: number;
    color: string;
    kick: number;
  }
> = {
  pistol: {
    id: "pistol",
    name: "Pistola",
    range: 5,
    clip: 9,
    ammo: 0,
    reload: 0.85,
    cooldown: 0.25,
    damage: 1.05,
    targets: 1,
    color: "#ffe7a4",
    kick: 0.65,
  },
  shotgun: {
    id: "shotgun",
    name: "Escopeta",
    range: 5,
    clip: 6,
    ammo: 8,
    reload: 1.15,
    cooldown: 0.52,
    damage: 2.2,
    targets: 3,
    color: "#ffb951",
    kick: 1.05,
  },
  rifle: {
    id: "rifle",
    name: "Fusil",
    range: 7,
    clip: 29,
    ammo: 29,
    reload: 1.15,
    cooldown: 0.16,
    damage: 1.6,
    targets: 1,
    color: "#bfe3ff",
    kick: 0.72,
  },
  smg: {
    id: "smg",
    name: "Subfusil",
    range: 5,
    clip: 24,
    ammo: 24,
    reload: 0.95,
    cooldown: 0.11,
    damage: 0.82,
    targets: 1,
    color: "#ffd2a3",
    kick: 0.42,
  },
};
export const SECONDARY_WEAPONS: WeaponId[] = ["shotgun", "rifle", "smg"];
export type GameStatus =
  | "menu"
  | "playing"
  | "paused"
  | "over"
  | "upgrade"
  | "levelup";
export type UpgradeId =
  | "damage"
  | "multishot"
  | "health"
  | "speed"
  | "lifesteal"
  | "armor"
  | "companion"
  | "firerate"
  | "magnet"
  | "blast"
  | "regen"
  | "luck"
  | "crit"
  | "shield"
  | "reserve"
  | "knife"
  | "accuracy"
  | "fortune";
export type PermanentUpgradeId =
  | "vitality"
  | "damage"
  | "speed"
  | "armor"
  | "gold"
  | "dash"
  | "reload"
  | "crit"
  | "embers"
  | "startShield"
  | "startAmmo"
  | "accuracy";

export type DraftPerkId =
  | "caliber"
  | "quickhands"
  | "deadeye"
  | "phantom"
  | "bloodthirst"
  | "razor";

export const DRAFT_PERKS: Record<
  DraftPerkId,
  { id: DraftPerkId; name: string; desc: string; tag: string }
> = {
  caliber: {
    id: "caliber",
    name: "Punta Hueca",
    desc: "+18% daño y mayor empuje",
    tag: "OFENSIVA",
  },
  quickhands: {
    id: "quickhands",
    name: "Manos Rápidas",
    desc: "+18% recarga y +10% cadencia",
    tag: "CADENCIA",
  },
  deadeye: {
    id: "deadeye",
    name: "Ojo Letal",
    desc: "+12% crítico ×2 y +3% precisión",
    tag: "PRECISIÓN",
  },
  phantom: {
    id: "phantom",
    name: "Paso Fantasma",
    desc: "+9% velocidad y -12% esquiva",
    tag: "MOVILIDAD",
  },
  bloodthirst: {
    id: "bloodthirst",
    name: "Sed Vital",
    desc: "+15 vida máx., cura +18 y +1 robo",
    tag: "SUPERVIVENCIA",
  },
  razor: {
    id: "razor",
    name: "Hoja Voraz",
    desc: "+35% daño cuchillo y -2 s recarga",
    tag: "COMBATE",
  },
};

export interface Character {
  id: CharacterId;
  name: string;
  role: string;
  description: string;
  health: number;
  speed: number;
  damage: number;
  color: string;
}

export const CHARACTERS: Character[] = [
  {
    id: "mouse",
    name: "Ratón",
    role: "EL INGENIOSO",
    description:
      "Pequeño, valiente y difícil de atrapar. El equilibrio perfecto para sobrevivir a tu primera noche.",
    health: 100,
    speed: 6.8,
    damage: 14,
    color: "#dc976b",
  },
  {
    id: "rabbit",
    name: "Coneja",
    role: "LA VELOZ",
    description:
      "Sus pasos son ligeros. Su puntería, no tanto. Más velocidad para encontrar una salida donde nadie la ve.",
    health: 85,
    speed: 8.1,
    damage: 13,
    color: "#dbbd9b",
  },
  {
    id: "cat",
    name: "Gato",
    role: "EL IMPARABLE",
    description:
      "Le quedan muchas vidas por gastar. Resiste más y golpea más fuerte, aunque prefiere ir a su ritmo.",
    health: 125,
    speed: 5.9,
    damage: 18,
    color: "#a3b5a7",
  },
];

export interface GameSettings {
  sound: boolean;
  ambience: boolean;
  autoFire: boolean;
  joystick: "dynamic" | "static";
  quality: "high" | "low";
  shake: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  sound: true,
  ambience: true,
  autoFire: true,
  joystick: "dynamic",
  quality: "high",
  shake: true,
};

export interface RunRecord {
  id: string;
  character: CharacterId;
  score: number;
  kills: number;
  time: number;
  date: string;
}

export interface Profile {
  tokens: number;
  totalRuns: number;
  totalKills: number;
  upgrades: Record<PermanentUpgradeId, number>;
  records: RunRecord[];
}

export const EMPTY_PROFILE: Profile = {
  tokens: 0,
  totalRuns: 0,
  totalKills: 0,
  upgrades: {
    vitality: 0,
    damage: 0,
    speed: 0,
    armor: 0,
    gold: 0,
    dash: 0,
    reload: 0,
    crit: 0,
    embers: 0,
    startShield: 0,
    startAmmo: 0,
    accuracy: 0,
  },
  records: [],
};

export interface BountyView {
  title: string;
  progress: string;
  reward: string;
}

export interface GameSnapshot {
  health: number;
  maxHealth: number;
  score: number;
  kills: number;
  time: number;
  gold: number;
  goldMultiplier: number;
  goldBoostTime: number;
  wave: number;
  darkness: number;
  combo: number;
  clip: number;
  clipMax: number;
  ammo: number;
  reloading: number;
  accuracy: number;
  purchased: UpgradeId[];
  weapon: WeaponId;
  arsenal: WeaponId[];
  pressure: number;
  enemyPower: number;
  level: number;
  xp: number;
  xpNext: number;
  draftChoices: DraftPerkId[];
  draftTimer: number;
  bonusEmbers: number;
  bountiesDone: number;
  activeBounty: BountyView | null;
  frenzyTime: number;
  companions: number[];
  biome: string;
  context: "fire" | "survivor" | "rubble" | "crate" | null;
  contextProgress: number;
  hurt: boolean;
  dash: number;
  knife: number;
  knifeCooldownLeft: number;
  shieldTime: number;
  shieldMax: number;
  cratesOpened: number;
  modifier: string;
}

export const INITIAL_SNAPSHOT: GameSnapshot = {
  health: 100,
  maxHealth: 100,
  score: 0,
  kills: 0,
  time: 0,
  gold: 0,
  goldMultiplier: 1,
  goldBoostTime: 0,
  wave: 1,
  darkness: 18,
  combo: 1,
  clip: 9,
  clipMax: 9,
  ammo: 0,
  reloading: 0,
  accuracy: 90,
  purchased: [],
  weapon: "pistol",
  arsenal: [],
  pressure: 1,
  enemyPower: 1,
  level: 1,
  xp: 0,
  xpNext: 90,
  draftChoices: [],
  draftTimer: 0,
  bonusEmbers: 0,
  bountiesDone: 0,
  activeBounty: {
    title: "CAZA INICIAL",
    progress: "0 / 8 bajas",
    reward: "+20 ORO · +1 BRASA",
  },
  frenzyTime: 0,
  companions: [],
  biome: "El refugio",
  context: null,
  contextProgress: 0,
  hurt: false,
  dash: 1,
  knife: 1,
  knifeCooldownLeft: 0,
  shieldTime: 0,
  shieldMax: 30,
  cratesOpened: 0,
  modifier: "",
};

export interface EmberBreakdown {
  total: number;
  scorePart: number;
  combatPart: number;
  bountyPart: number;
  legacyBonus: number;
}

export function calculateRunEmbers(
  result: GameSnapshot,
  embersLevel = 0,
): EmberBreakdown {
  const scorePart = Math.floor(result.score / 220);
  const combatPart =
    Math.floor(result.kills / 10) + Math.max(0, result.wave - 1);
  const bountyPart = result.bonusEmbers || 0;
  const raw = Math.max(1, scorePart + combatPart + bountyPart);
  const legacyBonus =
    embersLevel > 0 && (result.kills > 0 || result.score > 0)
      ? Math.max(1, Math.round(raw * embersLevel * 0.14))
      : 0;
  return {
    total: raw + legacyBonus,
    scorePart,
    combatPart,
    bountyPart,
    legacyBonus,
  };
}

export const RUN_UPGRADES: {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
  icon: string;
}[] = [
  {
    id: "damage",
    name: "Mano firme",
    description: "+25% de daño con todas las armas.",
    cost: 60,
    icon: "crosshair",
  },
  {
    id: "multishot",
    name: "Doble o nada",
    description: "Un segundo disparo a otro enemigo cercano.",
    cost: 110,
    icon: "layers",
  },
  {
    id: "health",
    name: "Un nuevo aliento",
    description: "+25 de vida máxima y curación completa.",
    cost: 55,
    icon: "heart",
  },
  {
    id: "speed",
    name: "Pies ligeros",
    description: "+15% de velocidad de movimiento.",
    cost: 65,
    icon: "wind",
  },
  {
    id: "lifesteal",
    name: "Instinto vital",
    description: "Recupera 3 de vida por cada baja.",
    cost: 95,
    icon: "sparkles",
  },
  {
    id: "armor",
    name: "Segunda piel",
    description: "Recibe un 20% menos de daño.",
    cost: 80,
    icon: "shield",
  },
  {
    id: "companion",
    name: "Nadie se queda atrás",
    description: "Cura y refuerza a tus compañeros.",
    cost: 50,
    icon: "users",
  },
  {
    id: "firerate",
    name: "Reflejos vivos",
    description: "-15% de cadencia entre disparos.",
    cost: 75,
    icon: "zap",
  },
  {
    id: "magnet",
    name: "Imán del destino",
    description: "+50% de alcance para recoger botín.",
    cost: 55,
    icon: "magnet",
  },
  {
    id: "blast",
    name: "Ceniza expansiva",
    description: "Cada enemigo derrotado estalla y daña a los cercanos.",
    cost: 95,
    icon: "bomb",
  },
  {
    id: "regen",
    name: "Calor interior",
    description: "Regeneras 1,5 de vida por segundo.",
    cost: 85,
    icon: "pulse",
  },
  {
    id: "luck",
    name: "Suerte oscura",
    description: "+4% de probabilidad de botín útil.",
    cost: 90,
    icon: "clover",
  },
  {
    id: "crit",
    name: "Ojo de halcón",
    description: "+10% de probabilidad de crítico ×2.",
    cost: 100,
    icon: "target",
  },
  {
    id: "shield",
    name: "Piel de titanio",
    description: "Escudo táctico de 25 s al comprar.",
    cost: 85,
    icon: "shieldPlus",
  },
  {
    id: "reserve",
    name: "Alijo de campaña",
    description: "Desbloquea la escopeta con 24 balas.",
    cost: 70,
    icon: "ammo",
  },
  {
    id: "knife",
    name: "Hoja larga",
    description: "+30% daño de cuchillo y -3 s de recarga.",
    cost: 80,
    icon: "knife",
  },
  {
    id: "accuracy",
    name: "Pulso firme",
    description: "+6% de precisión al disparar.",
    cost: 65,
    icon: "crosshair",
  },
  {
    id: "fortune",
    name: "Fortuna macabra",
    description: "+25% oro y +2 de suerte.",
    cost: 95,
    icon: "coins",
  },
];

export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
