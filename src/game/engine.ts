import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GameAudio } from "./audio";
import {
  CHARACTER_UNIT,
  CHARACTERS,
  DRAFT_PERKS,
  INITIAL_SNAPSHOT,
  KNIFE_COOLDOWN,
  RUN_UPGRADES,
  SECONDARY_WEAPONS,
  WEAPONS,
  type BountyView,
  type CharacterId,
  type DraftPerkId,
  type GameSettings,
  type GameSnapshot,
  type Profile,
  type UpgradeId,
  type WeaponId,
} from "./types";

const ROOM = 20;
const HALF = ROOM / 2;
const TAU = Math.PI * 2;
const BIOMES = [
  "Oficinas olvidadas",
  "Calles del silencio",
  "Bloque de celdas",
  "Biblioteca perdida",
  "Jardín mutante",
];
const UP = new THREE.Vector3(0, 1, 0);
/** Anything thinner than this is scenery, not an obstacle. */
const MIN_COLLIDER = 0.55;
/** Allies recover supplies at 75% effectiveness: a fair but real drawback. */
const ALLY_EFFICIENCY = 0.75;
const clamp = THREE.MathUtils.clamp;

type Actor = {
  root: THREE.Group;
  rig: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group | null;
  rightArm: THREE.Group | null;
  tail: THREE.Group | null;
  gun: THREE.Group;
  knife: THREE.Group | null;
  models: Record<WeaponId, THREE.Group> | null;
  flash: THREE.Mesh;
  phase: number;
  moveBlend: number;
  aimBlend: number;
  aimHold: number;
  strafeBank: number;
  strideSign: number;
  attackAnim: number;
  flashTime: number;
  gunKick: number;
  gunRise: number;
  gunRoll: number;
  bodyKick: number;
  infected: boolean;
};
type Enemy = {
  actor: Actor;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  hit: number;
  kind: CharacterId;
  variant: "walker" | "sprinter" | "stalker" | "elite";
  lungeCd: number;
  lungeTime: number;
  dying: number;
  deathDuration: number;
  baseScale: number;
  elite: boolean;
};
type Candle = { light: THREE.PointLight; room: Room };
type Companion = {
  actor: Actor;
  hp: number;
  maxHp: number;
  cooldown: number;
  knifeCd: number;
  hurt: number;
  resource: number;
  recruited: boolean;
  roomKey: string;
  weapon: WeaponId;
  ammo: number;
  state: "follow" | "hunt" | "loot";
  name: string;
  damageTaken: number;
};
type Collider = { x: number; z: number; w: number; d: number };
type SupplyCrate = {
  mesh: THREE.Group;
  beacon: THREE.PointLight;
  opened: boolean;
  x: number;
  z: number;
};
type Room = {
  root: THREE.Group;
  x: number;
  z: number;
  biome: number;
  visited: number;
  materials: {
    material: THREE.MeshLambertMaterial;
    color: THREE.Color;
    emissive: THREE.Color;
  }[];
  floor: THREE.InstancedMesh;
  colliders: Collider[];
  fire: THREE.Group | null;
  candleLight: THREE.PointLight | null;
  rubble: {
    mesh: THREE.Group;
    progress: number;
    cleared: boolean;
    x: number;
    z: number;
  } | null;
  crate: SupplyCrate | null;
  brightness: number;
  geometries: THREE.BufferGeometry[];
  resources: { materials: THREE.Material[]; textures: THREE.Texture[] };
};
type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  scale: number;
  color: THREE.Color;
};
type Drop = {
  mesh: THREE.Group;
  kind: "health" | "ammo" | "gold" | "boost" | "xp" | "chest";
  age: number;
  base: number;
  weapon?: WeaponId;
  source: "player" | "companion";
};
type FloatingPopup = {
  el: HTMLSpanElement;
  x: number;
  y: number;
  z: number;
  life: number;
  max: number;
  active: boolean;
};
type Trail = { mesh: THREE.Mesh; life: number; max: number };
type Portal = {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  disc: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  active: boolean;
};

export interface GameCallbacks {
  onSnapshot: (snapshot: GameSnapshot) => void;
  onGameOver: (snapshot: GameSnapshot) => void;
  onUpgrade: () => void;
  onLevelUp: (choices: DraftPerkId[]) => void;
  onPause: () => void;
  onStart: () => void;
  onNotice: (title: string, subtitle?: string) => void;
  onReady: () => void;
  onError: (message: string) => void;
}

export class RatonGame {
  readonly input = { x: 0, y: 0, attack: false, interact: false };
  readonly audio = new GameAudio();
  private host: HTMLDivElement;
  private callbacks: GameCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.1, 180);
  private rooms = new Map<string, Room>();
  private regens = new Map<string, number>();
  private biomeSeed = 1;
  private portals: Portal[] = [];
  private dying: Enemy[] = [];
  private fillLight!: THREE.PointLight;
  private playerFace: { yaw: number; snap: boolean } | null = null;
  private goldBase = 1;
  private dashMax = 2.6;
  private materialCache = new Map<string, THREE.Material>();
  private geometryCache = new Map<string, THREE.BufferGeometry>();
  private actorTemplates = new Map<string, THREE.Group>();
  private textures = new Set<THREE.Texture>();
  private player!: Actor;
  private enemies: Enemy[] = [];
  private companions: Companion[] = [];
  private drops: Drop[] = [];
  private trails: Trail[] = [];
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private fireLight: THREE.PointLight;
  private playerLight: THREE.PointLight;
  private sun: THREE.DirectionalLight;
  private dust: THREE.Points;
  private embers: THREE.Points;
  private emberPositions: Float32Array;
  private shadowTexture: THREE.CanvasTexture;
  private glowTexture: THREE.CanvasTexture;
  private state: "menu" | "playing" | "paused" | "over" | "levelup" = "menu";
  private settings: GameSettings;
  private snapshot: GameSnapshot = { ...INITIAL_SNAPSHOT };
  private damage = 14;
  private speed = 6.8;
  private armor = 1;
  private lifesteal = 0;
  private multishot = 0;
  private fireRate = 1;
  private magnet = 1;
  private blast = 0;
  private blastDepth = 0;
  private regen = 0;
  private luck = 0;
  private eliteTimer = 42;
  private spawnTimer = 0.4;
  private healthTimer = 0;
  private spawnSamples = 0;
  private spawnDistance = 0;
  private spawnedTotal = 0;
  private colorCache = new Map<string, THREE.Color>();
  private clips = new Map<WeaponId, number>();
  private arsenal = new Map<WeaponId, number>();
  private reloadTimer = 0;
  private reloadTotal = 0;
  private knifeCooldown = 0;
  private knifeMax = KNIFE_COOLDOWN;
  private knifeDamageMult = 1;
  private reloadSpeed = 1;
  private clipBonus = 0;
  private critChance = 0.05;
  private accuracyBonus = 0;
  private knockBonus = 1;
  private xpMultiplier = 1;
  private elitesKilled = 0;
  private bountyStage = 0;
  private muzzleGlow = 0;
  private hitStop = 0;
  private footstep = 0;
  private heartTimer = 0;
  private landing = 0;
  private ghostTimer = 0;
  private decorFloating = 0;
  private decorSunk = 0;
  private decorUnsupported = 0;
  private decorCount = 0;
  private allyDamageTotal = 0;
  private allyDeaths = 0;
  private minRigY = 0;
  private velocity = new THREE.Vector2();
  private waveSpeed = 1;
  private waveElite = 1;
  private waveHint = "";
  private ash!: THREE.Points;
  private ashPositions!: Float32Array;
  private popups: FloatingPopup[] = [];
  private slashTime = 0;
  private slashArc!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private missedShots = 0;
  private slashCount = 0;
  private dwell = 0;
  private dwellBiome = -1;
  private candleLights: Candle[] = [];
  private candleTimer = 0;
  private adaptiveSteps = 0;
  private viewCorners = [
    new THREE.Vector2(-1, -1),
    new THREE.Vector2(1, -1),
    new THREE.Vector2(1, 1),
    new THREE.Vector2(-1, 1),
  ];
  private viewPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  private viewRay = new THREE.Raycaster();
  private viewPoint = new THREE.Vector3();
  private tempVec = new THREE.Vector3();
  private shotCooldown = 0;
  private hurtCooldown = 0;
  private dashCooldown = 0;
  private dashTime = 0;
  private dashDirection = new THREE.Vector2(1, 0);
  private lastKill = -100;
  private currentX = 0;
  private currentZ = 0;
  private steps = 0;
  private previousRoom = "";
  private shake = 0;
  private uiTimer = 0;
  private lastTime = 0;
  private visualTime = 0;
  private diagnosticsTimer = 0;
  private diagnosticsFrames = 0;
  private animation = 0;
  private disposed = false;
  private target = new THREE.Vector3(-6.5, 0, 3.7);
  private cameraTarget = new THREE.Vector3(-6.5, 0, 3.7);
  private move = new THREE.Vector3();
  private resizeObserver: ResizeObserver;
  private gamepadButtons = {
    pause: false,
    swap: false,
    interact: false,
    dash: false,
    reload: false,
    knife: false,
  };
  private gamepadInteract = false;
  private gamepadAttack = false;
  private gamepadConfirm = false;
  private mobile: boolean;

  constructor(
    host: HTMLDivElement,
    settings: GameSettings,
    callbacks: GameCallbacks,
  ) {
    this.host = host;
    this.callbacks = callbacks;
    this.settings = settings;
    this.mobile = matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.quality === "high" && !this.mobile,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, settings.quality === "high" ? 1.75 : 1),
    );
    this.renderer.setClearColor(0x101b1b);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = settings.quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Mundo isométrico 3D de Ratón Z",
    );
    this.host.appendChild(this.renderer.domElement);
    const fxLayer = document.createElement("div");
    fxLayer.className = "fx-layer";
    fxLayer.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 16; i++) {
      const span = document.createElement("span");
      span.className = "fx-pop";
      span.style.display = "none";
      fxLayer.appendChild(span);
      this.popups.push({
        el: span,
        x: 0,
        y: 0,
        z: 0,
        life: 0,
        max: 1,
        active: false,
      });
    }
    this.host.appendChild(fxLayer);
    this.scene.fog = new THREE.FogExp2(0x101b1b, 0.018);
    this.scene.add(new THREE.HemisphereLight(0xc6e0cf, 0x273025, 2.05));
    this.sun = new THREE.DirectionalLight(0xc6e1d8, 2.6);
    this.sun.position.set(-8, 23, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -18,
      right: 18,
      top: 18,
      bottom: -18,
      far: 65,
    });
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.fireLight = new THREE.PointLight(0xff9b43, 65, 17, 2);
    this.fireLight.position.set(0, 2, 0);
    this.scene.add(this.fireLight);
    this.playerLight = new THREE.PointLight(0xffe7aa, 16, 13, 2);
    this.fillLight = new THREE.PointLight(0x9fc3b4, 5, 22, 2);
    this.scene.add(this.fillLight);
    this.scene.add(this.playerLight);
    this.shadowTexture = this.radialTexture(
      "rgba(0,0,0,0.65)",
      "rgba(0,0,0,0)",
    );
    this.glowTexture = this.radialTexture(
      "rgba(255,173,64,0.65)",
      "rgba(255,115,20,0)",
    );
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const disc = new THREE.Mesh(
        this.geo("circle"),
        new THREE.MeshBasicMaterial({
          color: "#060b0a",
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      const ring = new THREE.Mesh(
        this.geo("ring"),
        new THREE.MeshBasicMaterial({
          color: "#8fae74",
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      disc.rotation.x = ring.rotation.x = -Math.PI / 2;
      disc.position.y = ring.position.y = 0.07;
      group.add(disc, ring);
      group.visible = false;
      this.scene.add(group);
      this.portals.push({ group, ring, disc, life: 0, active: false });
    }
    const slashGeometry = new THREE.RingGeometry(
      1.05,
      3.35,
      26,
      1,
      -Math.PI * 0.65,
      Math.PI * 1.3,
    );
    this.geometryCache.set("slash-arc", slashGeometry);
    const slashMaterial = new THREE.MeshBasicMaterial({
      color: "#ffe4a8",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.materialCache.set("slash-arc-mat", slashMaterial);
    this.slashArc = new THREE.Mesh(slashGeometry, slashMaterial);
    this.slashArc.rotation.x = -Math.PI / 2;
    this.slashArc.visible = false;
    this.scene.add(this.slashArc);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      this.mat("#111d1c"),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.3;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.geometryCache.set("ground", ground.geometry);
    this.particleMesh = new THREE.InstancedMesh(
      this.geo("oct"),
      new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      400,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);

    const dustPositions = new Float32Array(120 * 3);
    for (let i = 0; i < dustPositions.length; i += 3) {
      dustPositions[i] = (Math.random() - 0.5) * 42;
      dustPositions[i + 1] = Math.random() * 11;
      dustPositions[i + 2] = (Math.random() - 0.5) * 42;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(dustPositions, 3),
    );
    this.dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: "#d4dfc0",
        size: 0.035,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    this.scene.add(this.dust);
    this.emberPositions = new Float32Array(45 * 3);
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.emberPositions, 3),
    );
    this.embers = new THREE.Points(
      emberGeometry,
      new THREE.PointsMaterial({
        color: "#ffb462",
        size: 0.075,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(this.embers);

    this.ashPositions = new Float32Array(90 * 3);
    for (let i = 0; i < 90; i++) {
      this.ashPositions[i * 3] = (Math.random() - 0.5) * 34;
      this.ashPositions[i * 3 + 1] = Math.random() * 10;
      this.ashPositions[i * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    const ashGeometry = new THREE.BufferGeometry();
    ashGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.ashPositions, 3),
    );
    this.ash = new THREE.Points(
      ashGeometry,
      new THREE.PointsMaterial({
        color: "#c2cbb4",
        size: 0.05,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.scene.add(this.ash);
    this.createWorld();
    this.player = this.createActor("mouse");
    this.player.root.position.set(2.1, 0.06, 2.7);
    this.player.root.rotation.y = 0.8;
    this.scene.add(this.player.root);
    this.addPreviewEnemies();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
    this.animation = requestAnimationFrame(this.frame);
    this.callbacks.onReady();
  }

  private geo(kind: string) {
    if (!this.geometryCache.has(kind)) {
      const geometry =
        kind === "box"
          ? new THREE.BoxGeometry(1, 1, 1)
          : kind === "sphere"
            ? new THREE.IcosahedronGeometry(1, 1)
            : kind === "sphereLow"
              ? new THREE.IcosahedronGeometry(1, 0)
              : kind === "ico"
                ? new THREE.DodecahedronGeometry(1, 0)
                : kind === "cylinder"
                  ? new THREE.CylinderGeometry(1, 1, 1, 8)
                  : kind === "cone"
                    ? new THREE.ConeGeometry(1, 1, 7)
                    : kind === "plane"
                      ? new THREE.PlaneGeometry(1, 1)
                      : kind === "circle"
                        ? new THREE.CircleGeometry(1, 20)
                        : kind === "ring"
                          ? new THREE.RingGeometry(0.6, 1, 24)
                          : new THREE.OctahedronGeometry(1, 0);
      this.geometryCache.set(kind, geometry);
    }
    return this.geometryCache.get(kind)!;
  }

  private mat(color: string, glow = false): THREE.MeshLambertMaterial {
    const key = `${color}-${glow}`;
    if (!this.materialCache.has(key)) {
      this.materialCache.set(
        key,
        new THREE.MeshLambertMaterial({
          color,
          flatShading: true,
          toneMapped: !glow,
          emissive: glow ? color : "#000000",
          emissiveIntensity: glow ? 1.4 : 0,
        }),
      );
    }
    return this.materialCache.get(key) as THREE.MeshLambertMaterial;
  }

  private roomMat(room: Room, color: string, glow = false) {
    const original = new THREE.Color(color);
    const match = room.materials.find(
      (m) => m.color.equals(original) && (m.emissive.getHex() !== 0) === glow,
    );
    if (match) return match.material;
    const material = this.mat(color, glow).clone();
    room.materials.push({
      material,
      color: original,
      emissive: material.emissive.clone(),
    });
    return material;
  }

  private mesh(
    parent: THREE.Object3D,
    kind: string,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    ry = 0,
  ) {
    const mesh = new THREE.Mesh(
      this.geo(
        kind === "sphere" && Math.max(sx, sy, sz) <= 0.31 ? "sphereLow" : kind,
      ),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private radialTexture(inner: string, outer: string) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    this.textures.add(texture);
    return texture;
  }

  private mergeStatic(
    group: THREE.Group,
    owned?: THREE.BufferGeometry[],
    room?: Room,
  ) {
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert();
    const buckets = new Map<boolean, THREE.BufferGeometry[]>();
    group.traverse((child) => {
      if (
        !(child instanceof THREE.Mesh) ||
        child instanceof THREE.InstancedMesh
      )
        return;
      const material = child.material as THREE.MeshLambertMaterial;
      const geometry = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      geometry.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld),
      );
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = material.color.r;
        colors[i + 1] = material.color.g;
        colors[i + 2] = material.color.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const glowing =
        material.emissiveIntensity > 0 && material.emissive?.getHex() !== 0;
      const bucket = buckets.get(glowing) || [];
      bucket.push(geometry);
      buckets.set(glowing, bucket);
    });
    group.clear();
    buckets.forEach((geometries, glowing) => {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!merged) return;
      let material: THREE.Material;
      if (glowing) {
        const key = "batched-glow";
        if (!this.materialCache.has(key))
          this.materialCache.set(
            key,
            new THREE.MeshBasicMaterial({
              vertexColors: true,
              toneMapped: false,
            }),
          );
        material = this.materialCache.get(key)!;
      } else if (room) {
        const roomMaterial = this.roomMat(room, "#ffffff");
        roomMaterial.vertexColors = true;
        material = roomMaterial;
      } else {
        const key = "batched-lit";
        if (!this.materialCache.has(key))
          this.materialCache.set(
            key,
            new THREE.MeshLambertMaterial({
              vertexColors: true,
              flatShading: true,
            }),
          );
        material = this.materialCache.get(key)!;
      }
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      owned?.push(merged);
      if (!owned) this.geometryCache.set(`merged-${merged.uuid}`, merged);
    });
  }

  private createActor(kind: CharacterId, infected = false): Actor {
    const templateKey = `${kind}-${infected}`;
    const template = this.actorTemplates.get(templateKey);
    if (template) {
      const root = template.clone(true);
      return {
        root,
        rig: root.getObjectByName("rig") as THREE.Group,
        leftLeg: root.getObjectByName("left-leg") as THREE.Group,
        rightLeg: root.getObjectByName("right-leg") as THREE.Group,
        leftArm: root.getObjectByName("left-arm") as THREE.Group,
        rightArm: root.getObjectByName("right-arm") as THREE.Group,
        tail: root.getObjectByName("tail") as THREE.Group,
        gun: root.getObjectByName("gun") as THREE.Group,
        knife: infected ? null : (root.getObjectByName("knife") as THREE.Group),
        models: infected
          ? null
          : {
              pistol: root.getObjectByName("weapon-pistol") as THREE.Group,
              shotgun: root.getObjectByName("weapon-shotgun") as THREE.Group,
              rifle: root.getObjectByName("weapon-rifle") as THREE.Group,
              smg: root.getObjectByName("weapon-smg") as THREE.Group,
            },
        flash: root.getObjectByName("flash") as THREE.Mesh,
        phase: Math.random() * TAU,
        moveBlend: 0,
        aimBlend: 0,
        aimHold: 0,
        strafeBank: 0,
        strideSign: 1,
        attackAnim: 0,
        flashTime: 0,
        gunKick: 0,
        gunRise: 0,
        gunRoll: 0,
        bodyKick: 0,
        infected,
      };
    }
    const root = new THREE.Group();
    const rig = new THREE.Group();
    rig.name = "rig";
    root.add(rig);
    const skin = this.mat(
      infected
        ? kind === "cat"
          ? "#778d76"
          : "#a3b092"
        : kind === "mouse"
          ? "#a89d8d"
          : kind === "rabbit"
            ? "#d9ccaf"
            : "#87968e",
    );
    const inner = this.mat(infected ? "#576c55" : "#ce9c8a");
    const vest = this.mat(
      infected ? "#3f5146" : kind === "cat" ? "#4c6062" : "#606b48",
    );
    const dark = this.mat("#252e28");
    const accent = this.mat(infected ? "#69754c" : "#c17b3f");
    this.mesh(rig, "ico", vest, 0, 0.85, 0, 0.46, 0.55, 0.36);
    this.mesh(rig, "sphere", skin, 0, 1.52, 0.06, 0.53, 0.49, 0.45);
    this.mesh(rig, "sphere", skin, 0, 1.36, 0.42, 0.28, 0.19, 0.23);
    this.mesh(
      rig,
      "ico",
      this.mat(infected ? "#273628" : "#5b4840"),
      0,
      1.44,
      0.63,
      0.09,
      0.065,
      0.065,
    );
    [-1, 1].forEach((side) => {
      if (kind === "mouse") {
        this.mesh(
          rig,
          "sphere",
          skin,
          side * 0.43,
          1.96,
          0.01,
          0.36,
          0.36,
          0.15,
        );
        this.mesh(
          rig,
          "sphere",
          inner,
          side * 0.43,
          1.96,
          0.13,
          0.255,
          0.255,
          0.04,
        );
      } else if (kind === "rabbit") {
        const ear = this.mesh(
          rig,
          "sphere",
          skin,
          side * 0.22,
          2.17,
          0,
          0.16,
          0.62,
          0.13,
        );
        ear.rotation.z = -side * 0.13;
        const inside = this.mesh(
          rig,
          "sphere",
          inner,
          side * 0.22,
          2.19,
          0.1,
          0.08,
          0.45,
          0.035,
        );
        inside.rotation.z = -side * 0.13;
      } else {
        const ear = this.mesh(
          rig,
          "cone",
          skin,
          side * 0.35,
          1.97,
          0,
          0.24,
          0.56,
          0.2,
        );
        ear.rotation.z = -side * 0.17;
        this.mesh(
          rig,
          "cone",
          inner,
          side * 0.35,
          1.98,
          0.12,
          0.13,
          0.3,
          0.035,
        );
      }
      this.mesh(
        rig,
        "sphere",
        this.mat(infected ? "#df6944" : "#171c18", infected),
        side * 0.22,
        1.61,
        0.435,
        0.075,
        0.09,
        0.045,
      );
      if (!infected)
        this.mesh(
          rig,
          "sphere",
          this.mat("#fff4cd", true),
          side * 0.22 - 0.015,
          1.64,
          0.473,
          0.019,
          0.022,
          0.012,
        );
    });
    if (!infected) {
      this.mesh(rig, "box", accent, 0, 1.21, 0.13, 0.77, 0.13, 0.56);
      this.mesh(rig, "box", accent, -0.2, 1.04, 0.37, 0.15, 0.35, 0.07, -0.1);
      this.mesh(
        rig,
        "box",
        this.mat("#584f36"),
        0,
        0.92,
        -0.39,
        0.62,
        0.65,
        0.28,
      );
      this.mesh(
        rig,
        "box",
        this.mat("#9c916c"),
        0,
        1.12,
        -0.56,
        0.48,
        0.1,
        0.06,
      );
      this.mesh(rig, "box", dark, 0.24, 0.76, 0.37, 0.18, 0.24, 0.12);
    } else {
      this.mesh(
        rig,
        "oct",
        this.mat("#899f62", true),
        -0.35,
        1.2,
        -0.23,
        0.18,
        0.31,
        0.18,
      );
      this.mesh(
        rig,
        "oct",
        this.mat("#a7be6f", true),
        0.24,
        1.08,
        -0.28,
        0.13,
        0.24,
        0.13,
      );
    }
    this.mergeStatic(rig);

    const arms = [-1, 1].map((side) => {
      const arm = new THREE.Group();
      arm.name = side === -1 ? "left-arm" : "right-arm";
      arm.position.set(side * 0.39, 1.08, infected ? 0.1 : 0.06);
      this.mesh(arm, "sphere", vest, 0, -0.05, 0, 0.17, 0.18, 0.17);
      this.mesh(
        arm,
        "box",
        vest,
        0,
        -0.18,
        infected ? 0.09 : 0.05,
        0.19,
        0.28,
        0.2,
      );
      if (!infected) {
        this.mesh(arm, "box", accent, 0, -0.28, 0.08, 0.21, 0.06, 0.21);
        this.mesh(arm, "sphere", skin, 0, -0.35, 0.12, 0.12, 0.12, 0.13);
      } else {
        this.mesh(arm, "sphere", skin, 0, -0.34, 0.16, 0.13, 0.13, 0.15);
        this.mesh(
          arm,
          "cone",
          dark,
          -0.04,
          -0.39,
          0.28,
          0.03,
          0.12,
          0.03,
        ).rotation.x = Math.PI * 0.65;
        this.mesh(
          arm,
          "cone",
          dark,
          0.04,
          -0.39,
          0.28,
          0.03,
          0.12,
          0.03,
        ).rotation.x = Math.PI * 0.65;
      }
      this.mergeStatic(arm);
      rig.add(arm);
      return arm;
    });
    const leftArm = arms[0];
    const rightArm = arms[1];

    const tail = new THREE.Group();
    tail.name = "tail";
    tail.position.set(0, 0.62, -0.3);
    if (kind === "mouse") {
      const t1 = this.mesh(
        tail,
        "cylinder",
        inner,
        0,
        -0.02,
        -0.22,
        0.045,
        0.38,
        0.045,
      );
      t1.rotation.x = Math.PI * 0.42;
      const t2 = this.mesh(
        tail,
        "cylinder",
        inner,
        0,
        0.04,
        -0.48,
        0.03,
        0.28,
        0.03,
      );
      t2.rotation.x = Math.PI * 0.56;
    } else if (kind === "rabbit") {
      this.mesh(tail, "sphere", skin, 0, 0.05, -0.14, 0.17, 0.16, 0.17);
    } else {
      const c1 = this.mesh(
        tail,
        "cylinder",
        skin,
        0,
        0.08,
        -0.2,
        0.055,
        0.36,
        0.055,
      );
      c1.rotation.x = Math.PI * 0.34;
      const c2 = this.mesh(
        tail,
        "cylinder",
        skin,
        0,
        0.28,
        -0.38,
        0.048,
        0.3,
        0.048,
      );
      c2.rotation.x = Math.PI * 0.18;
    }
    this.mergeStatic(tail);
    rig.add(tail);
    rig.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = false;
    });
    const legs = [-1, 1].map((side) => {
      const leg = new THREE.Group();
      leg.name = side === -1 ? "left-leg" : "right-leg";
      leg.position.set(side * 0.22, 0.45, 0);
      this.mesh(leg, "box", dark, 0, -0.12, 0, 0.25, 0.42, 0.28);
      this.mesh(
        leg,
        "ico",
        this.mat("#3d382d"),
        0,
        -0.33,
        0.12,
        0.19,
        0.13,
        0.28,
      );
      this.mergeStatic(leg);
      root.add(leg);
      return leg;
    });
    const gun = new THREE.Group();
    gun.name = "gun";
    gun.position.set(0.24, 1.02, 0.44);
    let models: Record<WeaponId, THREE.Group> | null = null;
    let knife: THREE.Group | null = null;
    if (!infected) {
      const steel = this.mat("#9aa89b");
      const gunmetal = this.mat("#232c2a");
      const alloy = this.mat("#495651");
      const walnut = this.mat("#6e4c30");
      const brass = this.mat("#d8aa55");
      const polymer = this.mat("#1c2322");

      // 1. Tactical semi-auto pistol (9-round mag)
      const pistol = new THREE.Group();
      pistol.name = "weapon-pistol";
      this.mesh(pistol, "box", gunmetal, 0, 0.03, 0.16, 0.12, 0.1, 0.42);
      this.mesh(pistol, "box", steel, 0, 0.1, 0.18, 0.13, 0.085, 0.44);
      this.mesh(pistol, "box", gunmetal, 0, 0.155, -0.01, 0.09, 0.03, 0.04);
      this.mesh(
        pistol,
        "box",
        this.mat("#ec8849", true),
        0,
        0.155,
        0.37,
        0.04,
        0.03,
        0.04,
      );
      const pGrip = this.mesh(
        pistol,
        "box",
        walnut,
        0,
        -0.08,
        0.0,
        0.11,
        0.22,
        0.13,
      );
      pGrip.rotation.x = -0.22;
      this.mesh(pistol, "box", polymer, 0, -0.19, -0.025, 0.12, 0.035, 0.15);
      this.mesh(pistol, "box", gunmetal, 0, -0.03, 0.13, 0.05, 0.06, 0.12);
      const pBbl = this.mesh(
        pistol,
        "cylinder",
        polymer,
        0,
        0.095,
        0.43,
        0.032,
        0.1,
        0.032,
      );
      pBbl.rotation.x = Math.PI / 2;
      this.mergeStatic(pistol);

      // 2. Pump-action survival shotgun (6 shells)
      const shotgun = new THREE.Group();
      shotgun.name = "weapon-shotgun";
      const sStock = this.mesh(
        shotgun,
        "box",
        walnut,
        0,
        -0.03,
        -0.18,
        0.12,
        0.16,
        0.34,
      );
      sStock.rotation.x = -0.14;
      this.mesh(shotgun, "box", walnut, 0, 0.02, 0.0, 0.11, 0.11, 0.16);
      this.mesh(shotgun, "box", gunmetal, 0, 0.065, 0.16, 0.14, 0.15, 0.32);
      this.mesh(shotgun, "box", brass, 0.073, 0.075, 0.17, 0.015, 0.055, 0.11);
      const sBbl = this.mesh(
        shotgun,
        "cylinder",
        steel,
        0,
        0.105,
        0.55,
        0.038,
        0.62,
        0.038,
      );
      sBbl.rotation.x = Math.PI / 2;
      const sTube = this.mesh(
        shotgun,
        "cylinder",
        gunmetal,
        0,
        0.04,
        0.5,
        0.034,
        0.52,
        0.034,
      );
      sTube.rotation.x = Math.PI / 2;
      this.mesh(shotgun, "box", walnut, 0, 0.032, 0.46, 0.12, 0.095, 0.26);
      this.mesh(
        shotgun,
        "box",
        this.mat("#ffb951", true),
        0,
        0.15,
        0.83,
        0.035,
        0.03,
        0.035,
      );
      shotgun.visible = false;
      this.mergeStatic(shotgun);

      // 3. Tactical assault carbine / rifle (29-round curved mag)
      const rifle = new THREE.Group();
      rifle.name = "weapon-rifle";
      this.mesh(rifle, "box", polymer, 0, 0.03, -0.22, 0.11, 0.18, 0.26);
      this.mesh(rifle, "box", alloy, 0, 0.06, -0.05, 0.09, 0.09, 0.16);
      this.mesh(rifle, "box", alloy, 0, 0.07, 0.16, 0.14, 0.16, 0.34);
      this.mesh(rifle, "box", polymer, 0, 0.165, 0.15, 0.09, 0.04, 0.3);
      this.mesh(rifle, "box", gunmetal, 0, 0.21, 0.13, 0.1, 0.075, 0.12);
      this.mesh(
        rifle,
        "box",
        this.mat("#bfe3ff", true),
        0,
        0.21,
        0.195,
        0.065,
        0.045,
        0.015,
      );
      const rGrip = this.mesh(
        rifle,
        "box",
        polymer,
        0,
        -0.07,
        0.04,
        0.1,
        0.18,
        0.11,
      );
      rGrip.rotation.x = -0.24;
      const rMag = this.mesh(
        rifle,
        "box",
        gunmetal,
        0,
        -0.11,
        0.24,
        0.095,
        0.26,
        0.13,
      );
      rMag.rotation.x = 0.26;
      this.mesh(rifle, "box", alloy, 0, 0.075, 0.48, 0.12, 0.125, 0.34);
      const rBbl = this.mesh(
        rifle,
        "cylinder",
        gunmetal,
        0,
        0.085,
        0.76,
        0.03,
        0.32,
        0.03,
      );
      rBbl.rotation.x = Math.PI / 2;
      const rBrake = this.mesh(
        rifle,
        "cylinder",
        steel,
        0,
        0.085,
        0.92,
        0.045,
        0.09,
        0.045,
      );
      rBrake.rotation.x = Math.PI / 2;
      rifle.visible = false;
      this.mergeStatic(rifle);

      // 4. Compact rapid-fire SMG with suppressor & vertical foregrip
      const smg = new THREE.Group();
      smg.name = "weapon-smg";
      this.mesh(smg, "box", gunmetal, 0, 0.07, -0.1, 0.08, 0.07, 0.18);
      this.mesh(smg, "box", gunmetal, 0, 0.065, 0.14, 0.13, 0.15, 0.34);
      this.mesh(smg, "box", steel, 0, 0.15, 0.14, 0.08, 0.03, 0.3);
      const smgGrip = this.mesh(
        smg,
        "box",
        polymer,
        0,
        -0.07,
        0.03,
        0.095,
        0.18,
        0.1,
      );
      smgGrip.rotation.x = -0.18;
      this.mesh(smg, "box", polymer, 0, -0.12, 0.2, 0.075, 0.28, 0.085);
      this.mesh(smg, "box", walnut, 0, -0.05, 0.3, 0.075, 0.14, 0.075);
      const supp = this.mesh(
        smg,
        "cylinder",
        alloy,
        0,
        0.075,
        0.45,
        0.052,
        0.3,
        0.052,
      );
      supp.rotation.x = Math.PI / 2;
      smg.visible = false;
      this.mergeStatic(smg);

      gun.add(pistol, shotgun, rifle, smg);
      models = { pistol, shotgun, rifle, smg };

      // 5. Survival combat knife for the F ability
      knife = new THREE.Group();
      knife.name = "knife";
      knife.position.set(0, 0.98, 0.18);
      const bladeGroup = new THREE.Group();
      this.mesh(bladeGroup, "box", walnut, 0, 0, 0.32, 0.07, 0.07, 0.2);
      this.mesh(bladeGroup, "box", brass, 0, 0, 0.43, 0.18, 0.05, 0.04);
      this.mesh(bladeGroup, "box", steel, 0, 0, 0.65, 0.09, 0.025, 0.42);
      this.mesh(
        bladeGroup,
        "cone",
        this.mat("#fff6dc", true),
        0,
        0,
        0.92,
        0.055,
        0.18,
        0.02,
      ).rotation.x = Math.PI / 2;
      this.mergeStatic(bladeGroup);
      knife.add(bladeGroup);
      knife.visible = false;
      root.add(knife);
    }
    const flash = this.mesh(
      gun,
      "oct",
      this.mat("#ffdd86", true),
      0,
      0.09,
      0.52,
      0.24,
      0.24,
      0.46,
    );
    flash.name = "flash";
    flash.visible = false;
    gun.visible = !infected;
    root.add(gun);
    const shadow = new THREE.Mesh(
      this.geo("plane"),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.1;
    shadow.scale.set(2.1, 1.6, 1);
    root.add(shadow);
    this.materialCache.set(`shadow-${shadow.uuid}`, shadow.material);
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = false;
    });
    if (infected) root.scale.setScalar(kind === "cat" ? 1.1 : 0.9);
    this.actorTemplates.set(templateKey, root.clone(true));
    return {
      root,
      rig,
      leftLeg: legs[0],
      rightLeg: legs[1],
      leftArm,
      rightArm,
      tail,
      gun,
      knife,
      models,
      flash,
      phase: Math.random() * TAU,
      moveBlend: 0,
      aimBlend: 0,
      aimHold: 0,
      strafeBank: 0,
      strideSign: 1,
      attackAnim: 0,
      flashTime: 0,
      gunKick: 0,
      gunRise: 0,
      gunRoll: 0,
      bodyKick: 0,
      infected,
    };
  }

  private createWorld() {
    for (let z = -1; z <= 1; z++) {
      for (let x = -1; x <= 1; x++) this.createRoom(x, z);
    }
    this.updateRoomLights(true);
  }
  private biomeAt(x: number, z: number) {
    if (x === 0 && z === 0) return -1;
    const gen = this.regens.get(`${x},${z}`) || 0;
    // Cells are grouped in 2x2 blocks so matching biomes form one arena.
    const bx = Math.floor((x + 128) / 2);
    const bz = Math.floor((z + 128) / 2);
    let h =
      Math.imul(bx + 1013, 374761393) ^
      Math.imul(bz + 7919, 668265263) ^
      Math.imul(this.biomeSeed, 1274126177) ^
      Math.imul(gen + 31, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    const biome = h % BIOMES.length;
    const cell =
      (Math.imul(x + 97, 92837111) ^
        Math.imul(z + 53, 689287499) ^
        Math.imul(this.biomeSeed, 2654435761) ^
        Math.imul(gen + 7, 40503)) >>>
      0;
    // One cell out of seven fractures its block to keep the map chaotic.
    if (cell % 7 === 0) return (biome + 1 + (cell % 3)) % BIOMES.length;
    return biome;
  }

  private createRoom(x: number, z: number) {
    const key = `${x},${z}`;
    const biome = this.biomeAt(x, z);
    const root = new THREE.Group();
    const room: Room = {
      root,
      x,
      z,
      biome,
      visited: -1,
      materials: [],
      floor: null!,
      colliders: [],
      fire: null,
      candleLight: null,
      rubble: null,
      crate: null,
      brightness: 0.12,
      geometries: [],
      resources: { materials: [], textures: [] },
    };
    const staticGroup = new THREE.Group();
    root.add(staticGroup);
    const concrete = this.roomMat(room, "#727368");
    const pale = this.roomMat(room, "#a29e86");
    const wall = this.roomMat(room, "#687266");
    const dark = this.roomMat(room, "#354039");
    const metal = this.roomMat(room, "#343e37");
    const wood = this.roomMat(room, "#786448");
    const rust = this.roomMat(room, "#8e5c42");
    const tileMaterial = this.roomMat(
      room,
      biome === 4 ? "#5c6951" : biome === 1 ? "#586158" : "#717467",
    );
    const floor = new THREE.InstancedMesh(this.geo("box"), tileMaterial, 100);
    floor.receiveShadow = true;
    const tileColor = new THREE.Color();
    for (let iz = 0; iz < 10; iz++) {
      for (let ix = 0; ix < 10; ix++) {
        const i = iz * 10 + ix;
        this.dummy.position.set(
          -9 + ix * 2,
          -0.08 + Math.random() * 0.025,
          -9 + iz * 2,
        );
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1.965, 0.18, 1.965);
        if (
          biome === 4 &&
          Math.hypot(this.dummy.position.x, this.dummy.position.z) > 10 &&
          Math.min(
            Math.abs(this.dummy.position.x),
            Math.abs(this.dummy.position.z),
          ) > 2
        )
          this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        floor.setMatrixAt(i, this.dummy.matrix);
        tileColor.setScalar(0.72 + Math.random() * 0.28);
        if (biome === 1 && (ix < 3 || iz < 3))
          tileColor.setRGB(0.44, 0.48, 0.44);
        floor.setColorAt(i, tileColor);
      }
    }
    room.floor = floor;
    root.add(floor);
    if (biome === 4) {
      this.mesh(staticGroup, "cylinder", dark, 0, -0.47, 0, 10, 0.62, 10);
      this.mesh(staticGroup, "box", dark, 0, -0.47, 0, 20, 0.62, 4);
      this.mesh(staticGroup, "box", dark, 0, -0.47, 0, 4, 0.62, 20);
    } else this.mesh(staticGroup, "box", dark, 0, -0.47, 0, 20, 0.62, 20);

    for (let i = 0; i < 24; i++) {
      const side = Math.floor(i / 6);
      const offset = (i % 6) * 3.4 - 8.5;
      const px = side < 2 ? offset : side === 2 ? -9.8 : 9.8;
      const pz = side >= 2 ? offset : side === 0 ? -9.8 : 9.8;
      if (Math.abs(offset) < 2) continue;
      const neighbour = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ][side];
      // Neighbours sharing a biome lose the shared wall: one huge arena.
      if (
        biome !== -1 &&
        this.biomeAt(x + neighbour[0], z + neighbour[1]) === biome
      )
        continue;
      if (biome === 4 && Math.hypot(px, pz) > 11.3) continue;
      this.mesh(
        staticGroup,
        "ico",
        concrete,
        px,
        -0.48,
        pz,
        1.8,
        0.65 + Math.random() * 0.2,
        1.2,
        Math.random(),
      );
      {
        const vertical = side < 2;
        const height = 0.45 + Math.random() * 0.7;
        this.mesh(
          staticGroup,
          "box",
          wall,
          px,
          height / 2,
          pz,
          vertical ? 2.9 : 0.4,
          height,
          vertical ? 0.4 : 2.9,
        );
      }
    }

    // Only substantial furniture may block movement. Tiny props (lamps, signs,
    // tree trunks, pebbles) are visual only: colliding with them snags the
    // survivor for no gameplay benefit. Solid footprints are also shrunk a
    // little so corners feel forgiving instead of sticky.
    const addCollider = (px: number, pz: number, w: number, d: number) => {
      if (w < MIN_COLLIDER || d < MIN_COLLIDER) {
        this.host.dataset.collidersIgnored = String(
          Number(this.host.dataset.collidersIgnored || 0) + 1,
        );
        return;
      }
      room.colliders.push({
        x: px + x * ROOM,
        z: pz + z * ROOM,
        w: w * 0.94,
        d: d * 0.94,
      });
    };
    const crate = (px: number, pz: number, size = 1.3, py = 0) => {
      this.mesh(
        staticGroup,
        "box",
        wood,
        px,
        size / 2 + py,
        pz,
        size,
        size,
        size,
        0.06,
      );
      [-1, 1].forEach((side) => {
        this.mesh(
          staticGroup,
          "box",
          pale,
          px + side * size * 0.4,
          size / 2 + py,
          pz + size * 0.51,
          0.1,
          size * 0.93,
          0.06,
          0.06,
        );
        this.mesh(
          staticGroup,
          "box",
          pale,
          px,
          size / 2 + side * size * 0.4 + py,
          pz + size * 0.51,
          size,
          0.1,
          0.06,
          0.06,
        );
      });
      if (py === 0) addCollider(px, pz, size * 0.6, size * 0.6);
    };
    const barrel = (px: number, pz: number) => {
      this.mesh(staticGroup, "cylinder", rust, px, 0.68, pz, 0.48, 1.36, 0.48);
      [0.24, 1.12].forEach((py) =>
        this.mesh(staticGroup, "cylinder", metal, px, py, pz, 0.5, 0.09, 0.5),
      );
      addCollider(px, pz, 0.5, 0.5);
    };
    const tree = (px: number, pz: number, height: number) => {
      this.mesh(
        staticGroup,
        "cylinder",
        wood,
        px,
        height * 0.3,
        pz,
        0.19,
        height * 0.6,
        0.19,
      );
      [0, 1, 2].forEach((level) =>
        this.mesh(
          staticGroup,
          "cone",
          this.roomMat(room, ["#304b3b", "#3d5844", "#49634b"][level]),
          px,
          height * (0.47 + level * 0.19),
          pz,
          height * (0.33 - level * 0.07),
          height * 0.56,
          height * (0.33 - level * 0.07),
          level * 0.6,
        ),
      );
      addCollider(px, pz, 0.45, 0.45);
    };
    const lamp = (px: number, pz: number) => {
      this.mesh(staticGroup, "box", metal, px, 0.16, pz, 0.55, 0.32, 0.55);
      this.mesh(staticGroup, "cylinder", metal, px, 2.7, pz, 0.075, 5.4, 0.075);
      this.mesh(staticGroup, "box", metal, px - 0.45, 5.3, pz, 1.05, 0.1, 0.12);
      this.mesh(staticGroup, "box", metal, px - 0.9, 5.21, pz, 0.6, 0.12, 0.4);
      this.mesh(
        staticGroup,
        "box",
        this.roomMat(room, "#e9c37b", true),
        px - 0.9,
        5.13,
        pz,
        0.45,
        0.06,
        0.3,
      );
      addCollider(px, pz, 0.28, 0.28);
    };

    if (biome === -1) {
      // A broken facade frames the refuge without hiding the playable floor.
      [-8.7, -5.3, -1.8].forEach((px, i) => {
        const height = [5.5, 4.9, 3.9][i];
        this.mesh(
          staticGroup,
          "box",
          wall,
          px,
          height / 2,
          -8.8,
          0.65,
          height,
          0.65,
        );
        this.mesh(
          staticGroup,
          "box",
          pale,
          px,
          height + 0.12,
          -8.8,
          0.8,
          0.22,
          0.8,
        );
      });
      [-7, -3.55].forEach((px, i) => {
        this.mesh(staticGroup, "box", wall, px, 0.9, -8.8, 2.8, 1.8, 0.55);
        this.mesh(
          staticGroup,
          "box",
          concrete,
          px,
          4.15 - i * 0.4,
          -8.8,
          3,
          0.6,
          0.6,
        );
        this.mesh(staticGroup, "box", dark, px, 2.9, -8.94, 2.65, 1.9, 0.12);
        this.mesh(staticGroup, "box", metal, px, 2.9, -8.55, 0.07, 1.9, 0.08);
        this.mesh(staticGroup, "box", metal, px, 2.9, -8.55, 2.65, 0.07, 0.08);
        this.mesh(staticGroup, "box", pale, px, 1.85, -8.4, 2.9, 0.15, 0.8);
      });
      this.mesh(staticGroup, "box", wall, -8.8, 1.7, -6.4, 0.6, 3.4, 4.8);
      this.mesh(staticGroup, "box", pale, -8.8, 3.5, -6.4, 0.8, 0.18, 4.9);
      this.mesh(staticGroup, "box", wall, 6.8, 1.5, -8.8, 4.5, 3, 0.5);
      this.mesh(staticGroup, "box", pale, 6.8, 3.05, -8.8, 4.7, 0.2, 0.75);
      crate(-6.6, 3.7, 1.5);
      crate(-5.1, 4, 1.25);
      crate(-6.5, 3.8, 1.1, 1.5);
      barrel(4.2, -5.9);
      barrel(5.3, -6.3);
      tree(8.2, -5.8, 5.9);
      tree(8.1, 6.7, 4.6);
      tree(-8, 7.5, 3.4);
      lamp(5.7, -2.8);
      this.mesh(
        staticGroup,
        "box",
        concrete,
        5.3,
        0.6,
        5.6,
        3.5,
        1.2,
        0.7,
        -0.13,
      );
      [-1, 0, 1].forEach((i) => {
        const stripe = this.mesh(
          staticGroup,
          "box",
          this.roomMat(room, "#bb9b4d"),
          5.3 + i * 0.8,
          0.64,
          6,
          0.22,
          0.8,
          0.03,
          -0.13,
        );
        stripe.rotation.z = -0.45;
      });
      addCollider(5.3, 5.6, 1.9, 0.5);
      this.addSign(
        root,
        "NO HAY VUELTA ATRÁS",
        6.7,
        2.05,
        -8.48,
        3.4,
        0.6,
        room,
      );
      room.fire = this.createFire(root, room);
    } else if (biome === 0) {
      for (const px of [-5.7, 5.7])
        for (const pz of [-5.5, 4.7]) {
          this.mesh(staticGroup, "box", wood, px, 1.1, pz, 3, 0.18, 1.6);
          [-1, 1].forEach((side) =>
            this.mesh(
              staticGroup,
              "box",
              metal,
              px + side * 1.3,
              0.55,
              pz,
              0.13,
              1.1,
              1.3,
            ),
          );
          this.mesh(
            staticGroup,
            "box",
            metal,
            px,
            1.7,
            pz - 0.25,
            0.95,
            0.8,
            0.12,
          );
          this.mesh(
            staticGroup,
            "box",
            this.roomMat(room, "#738e7d", true),
            px,
            1.7,
            pz - 0.17,
            0.78,
            0.6,
            0.03,
          );
          this.mesh(
            staticGroup,
            "box",
            pale,
            px + 0.85,
            1.23,
            pz,
            0.5,
            0.08,
            0.7,
            0.25,
          );
          addCollider(px, pz, 1.65, 0.95);
        }
      this.mesh(staticGroup, "box", wall, -6, 1.4, -8, 5.5, 2.8, 0.35);
      crate(7, -7);
      lamp(-6, -2.5);
    } else if (biome === 1) {
      for (let i = -3; i <= 3; i++)
        this.mesh(staticGroup, "box", pale, -5, 0.04, i * 2.6, 0.13, 0.03, 1.3);
      for (let i = 0; i < 5; i++)
        this.mesh(
          staticGroup,
          "box",
          pale,
          -1 + i * 2.2,
          0.04,
          -5,
          1.1,
          0.03,
          0.12,
        );
      lamp(-6.8, 5.8);
      lamp(6.4, -6.2);
      barrel(5.8, 4.8);
      crate(7.7, 5);
      this.mesh(
        staticGroup,
        "box",
        this.roomMat(room, "#58675d"),
        5.6,
        0.9,
        -5.8,
        3.2,
        1.5,
        1.9,
        -0.2,
      );
      this.mesh(staticGroup, "box", dark, 5.6, 1.9, -5.8, 1.8, 0.7, 1.8, -0.2);
      addCollider(5.6, -5.8, 1.9, 1.2);
      tree(7.8, -8, 4.4);
    } else if (biome === 2) {
      [-5.5, 5.5].forEach((px) => {
        this.mesh(staticGroup, "box", wall, px, 1.6, -5.9, 6.2, 3.2, 0.4);
        for (let i = 0; i < 9; i++)
          this.mesh(
            staticGroup,
            "cylinder",
            metal,
            px - 2.7 + i * 0.68,
            1.65,
            -2.5,
            0.045,
            3.3,
            0.045,
          );
        [0.2, 3.2].forEach((py) =>
          this.mesh(staticGroup, "box", metal, px, py, -2.5, 6, 0.1, 0.1),
        );
        this.mesh(staticGroup, "box", metal, px, 0.6, -4.6, 3.6, 0.2, 1.4);
        this.mesh(
          staticGroup,
          "box",
          this.roomMat(room, "#888b6e"),
          px,
          0.8,
          -4.6,
          3.4,
          0.25,
          1.3,
        );
        addCollider(px, -2.5, 3.1, 0.17);
      });
      barrel(-7, 6);
      lamp(7, 5);
      this.addSign(root, "BLOQUE C · 03", 5.4, 2.5, -5.65, 3.1, 0.6, room);
    } else if (biome === 3) {
      for (const px of [-6.5, 5.8])
        for (const pz of [-4.8, 4.8]) {
          this.mesh(staticGroup, "box", wood, px, 1.65, pz, 3.8, 3.3, 0.6);
          for (let shelf = 0; shelf < 3; shelf++) {
            this.mesh(
              staticGroup,
              "box",
              pale,
              px,
              0.3 + shelf,
              pz + 0.05,
              3.9,
              0.1,
              0.8,
            );
            for (let book = 0; book < 11; book++)
              this.mesh(
                staticGroup,
                "box",
                this.roomMat(
                  room,
                  ["#9a7852", "#687763", "#936951", "#b2a17c"][book % 4],
                ),
                px - 1.55 + book * 0.3,
                0.72 + shelf,
                pz + 0.27,
                0.2,
                0.7 - Math.random() * 0.2,
                0.3,
                (Math.random() - 0.5) * 0.2,
              );
          }
          addCollider(px, pz, 2.05, 0.5);
        }
      this.mesh(staticGroup, "box", wood, -3.5, 0.9, -0.7, 2, 0.18, 2);
      addCollider(-3.5, -0.7, 1.1, 1.1);
      lamp(7.7, -0.7);
    } else {
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * TAU;
        const radius = 6 + Math.random() * 2;
        const px = Math.cos(angle) * radius;
        const pz = Math.sin(angle) * radius;
        if (Math.abs(px) < 2 || Math.abs(pz) < 2) continue;
        this.mesh(
          staticGroup,
          "ico",
          this.roomMat(room, "#59694b"),
          px,
          0.5,
          pz,
          1 + Math.random(),
          0.5 + Math.random(),
          1.2,
          angle,
        );
        if (i % 2 === 0) tree(px, pz, 3 + Math.random() * 2);
        this.mesh(
          staticGroup,
          "oct",
          this.roomMat(room, "#a9b975", true),
          px,
          1.2,
          pz,
          0.18,
          0.6,
          0.18,
        );
        // Pebbles are decoration only.
      }
    }

    for (let i = 0; i < 25; i++) {
      const px = (Math.random() - 0.5) * 18;
      const pz = (Math.random() - 0.5) * 18;
      if (Math.abs(px) < 2 && Math.abs(pz) < 3) continue;
      if (i % 3 === 0) {
        const paper = this.mesh(
          staticGroup,
          "box",
          pale,
          px,
          0.04,
          pz,
          0.33,
          0.015,
          0.48,
          Math.random() * TAU,
        );
        paper.castShadow = false;
      } else {
        this.mesh(
          staticGroup,
          "ico",
          concrete,
          px,
          0.1,
          pz,
          0.15 + Math.random() * 0.2,
          0.12,
          0.22,
          Math.random(),
        );
      }
    }
    if (biome !== -1 && Math.random() < 0.28) {
      room.crate = this.createSupplyCrate(root, x, z, room);
    }
    this.decorateRoom(staticGroup, room, biome, room.crate);
    this.mergeStatic(staticGroup, room.geometries, room);
    if (biome !== -1 && (Math.abs(x) + Math.abs(z)) % 4 === 0)
      room.fire = this.createFire(root, room);
    if (biome !== -1 && Math.random() < 0.45) {
      const rubble = new THREE.Group();
      for (let i = 0; i < 8; i++)
        this.mesh(
          rubble,
          "ico",
          concrete,
          (Math.random() - 0.5) * 3,
          0.2 + Math.random() * 0.6,
          -9 + (Math.random() - 0.5),
          0.5 + Math.random() * 0.5,
          0.5,
          0.6,
          Math.random(),
        );
      this.mergeStatic(rubble, room.geometries, room);
      root.add(rubble);
      room.rubble = {
        mesh: rubble,
        progress: 0,
        cleared: false,
        x: x * ROOM,
        z: z * ROOM - 8.8,
      };
    }
    root.position.set(x * ROOM, 0, z * ROOM);
    this.scene.add(root);
    this.rooms.set(key, room);
    if ((x === 0 && z === 0) || Math.random() < 0.16) this.createSurvivor(room);
    return room;
  }

  private addSign(
    parent: THREE.Group,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    room: Room,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 144;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#333c32";
    context.fillRect(0, 0, 768, 144);
    context.strokeStyle = "#a39d72";
    context.lineWidth = 6;
    context.strokeRect(7, 7, 754, 130);
    context.fillStyle = "#d4c497";
    context.font = "bold 43px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 384, 75);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: false,
    });
    room.resources.textures.push(texture);
    room.resources.materials.push(material);
    const sign = new THREE.Mesh(this.geo("plane"), material);
    sign.position.set(x, y, z);
    sign.scale.set(w, h, 1);
    parent.add(sign);
  }

  private createFire(parent: THREE.Group, room: Room) {
    const fire = new THREE.Group();
    const stones = this.mat("#62635a");
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * TAU;
      this.mesh(
        fire,
        "ico",
        stones,
        Math.cos(angle) * 1.07,
        0.15,
        Math.sin(angle) * 1.07,
        0.36,
        0.25,
        0.32,
        angle,
      );
    }
    [-1, 1].forEach((side) => {
      const log = this.mesh(
        fire,
        "cylinder",
        this.mat("#58452e"),
        side * 0.16,
        0.25,
        0,
        0.2,
        1.7,
        0.2,
      );
      log.rotation.set(Math.PI / 2, 0, side * 0.65);
    });
    this.mergeStatic(fire, room.geometries, room);
    const flames = new THREE.Group();
    flames.name = "flames";
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU;
      this.mesh(
        flames,
        "ico",
        this.mat(i % 2 ? "#ffad43" : "#e96e28", true),
        Math.cos(angle) * 0.28,
        0.85,
        Math.sin(angle) * 0.28,
        0.33,
        0.75 + Math.random() * 0.35,
        0.32,
        angle,
      );
    }
    this.mesh(
      flames,
      "cone",
      this.mat("#ffe3a3", true),
      0,
      0.75,
      0,
      0.3,
      1.05,
      0.3,
    );
    fire.add(flames);
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.55,
    });
    const glow = new THREE.Mesh(this.geo("plane"), glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.045;
    glow.scale.set(12, 12, 1);
    fire.add(glow);
    room.resources.materials.push(glowMaterial);
    parent.add(fire);
    return fire;
  }

  /**
   * Counts parts that are not connected, through touching or resting contacts,
   * to any part that actually rests on the floor. Catches floating clutter.
   */
  private countUnsupported(parts: THREE.Box3[]) {
    const count = parts.length;
    if (count === 0) return 0;
    const links: number[][] = parts.map(() => []);
    const padded = parts.map((part) => part.clone().expandByScalar(0.03));
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = parts[i];
        const b = parts[j];
        const overlapX = a.max.x >= b.min.x - 0.03 && a.min.x <= b.max.x + 0.03;
        const overlapZ = a.max.z >= b.min.z - 0.03 && a.min.z <= b.max.z + 0.03;
        const rests =
          (b.max.y >= a.min.y - 0.16 && b.max.y <= a.min.y + 0.1) ||
          (a.max.y >= b.min.y - 0.16 && a.max.y <= b.min.y + 0.1);
        if (
          padded[i].intersectsBox(padded[j]) ||
          (rests && overlapX && overlapZ)
        ) {
          links[i].push(j);
          links[j].push(i);
        }
      }
    }
    const reached = new Array<boolean>(count).fill(false);
    const queue: number[] = [];
    parts.forEach((part, i) => {
      if (part.min.y <= 0.09) {
        reached[i] = true;
        queue.push(i);
      }
    });
    while (queue.length) {
      const i = queue.shift()!;
      links[i].forEach((j) => {
        if (!reached[j]) {
          reached[j] = true;
          queue.push(j);
        }
      });
    }
    return reached.reduce((total, ok) => total + (ok ? 0 : 1), 0);
  }

  // Set dressing: every prop is grounded on the floor or on a support that is
  // itself grounded, belongs to its own biome, and never blocks the survivor
  // (rooms regenerate constantly, so blocking props could trap the player).
  private decorateRoom(
    group: THREE.Group,
    room: Room,
    biome: number,
    crate: SupplyCrate | null,
  ) {
    const wood = this.roomMat(room, "#6d5a40");
    const darkWood = this.roomMat(room, "#4a3c29");
    const metal = this.roomMat(room, "#39443d");
    const steel = this.roomMat(room, "#69786e");
    const pale = this.roomMat(room, "#9b9882");
    const cloth = this.roomMat(room, "#4b5a48");
    const screen = this.roomMat(room, "#8fe6c4", true);
    const amber = this.roomMat(room, "#e8a856", true);
    const paper = this.roomMat(room, "#c9c2a6");
    const concrete = this.roomMat(room, "#727368");
    const organic = this.roomMat(room, "#46593f");
    const spore = this.roomMat(room, "#a9d98a", true);
    const bone = this.roomMat(room, "#cfc6a8");
    const rust = this.roomMat(room, "#8e5c42");
    const bookA = this.roomMat(room, "#9a7852");
    const bookB = this.roomMat(room, "#687763");
    const bookC = this.roomMat(room, "#936951");
    const bookD = this.roomMat(room, "#b2a17c");
    const books = [bookA, bookB, bookC, bookD];

    // Keep the fire, the survivor's candelabrum, the door lanes and the biome's
    // own furniture clear of clutter.
    const blocked: { x: number; z: number; r: number }[] = [
      { x: 0, z: 0, r: 3.3 },
      { x: -2.9, z: 2.4, r: 2.2 },
      { x: 0, z: -8.6, r: 2.8 },
      { x: 0, z: 8.6, r: 2.4 },
      { x: -8.6, z: 0, r: 2.4 },
      { x: 8.6, z: 0, r: 2.4 },
    ];
    if (crate)
      blocked.push({
        x: crate.x - room.x * ROOM,
        z: crate.z - room.z * ROOM,
        r: 2.1,
      });
    const anchors: Record<number, [number, number][]> = {
      [-1]: [
        [-6.6, 3.8],
        [4.7, -6.1],
        [8.2, -5.8],
        [8.1, 6.7],
        [-8, 7.5],
        [5.7, -2.8],
        [5.3, 5.6],
        [6.7, -8.5],
      ],
      0: [
        [-5.7, -5.5],
        [5.7, -5.5],
        [-5.7, 4.7],
        [5.7, 4.7],
        [-6, -8],
      ],
      1: [
        [-6.8, 5.8],
        [6.4, -6.2],
        [5.8, 4.8],
        [7.7, 5],
        [5.6, -5.8],
        [7.8, -8],
      ],
      2: [
        [-5.5, -5.9],
        [5.5, -5.9],
        [-7, 6],
        [7, 5],
        [5.4, -5.6],
      ],
      3: [
        [-6.5, -4.8],
        [6.5, -4.8],
        [-5.8, 4.8],
        [5.8, 4.8],
        [-3.5, -0.7],
        [7.7, -0.7],
      ],
    };
    (anchors[biome] || []).forEach(([ax, az]) =>
      blocked.push({ x: ax, z: az, r: 2.6 }),
    );
    if (biome === 4)
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        blocked.push({ x: Math.cos(a) * 7, z: Math.sin(a) * 7, r: 2.3 });
      }

    const wanted = biome === -1 ? 3 : 7;
    const slots: [number, number][] = [];
    let tries = 0;
    while (slots.length < wanted && tries < 280) {
      tries++;
      const x = (Math.random() - 0.5) * 16.4;
      const z = (Math.random() - 0.5) * 16.4;
      // Door lanes stay walkable.
      if (Math.abs(x) < 2.6 && Math.abs(z) > 5.2) continue;
      if (Math.abs(z) < 2.6 && Math.abs(x) > 5.2) continue;
      if (blocked.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 1.2))
        continue;
      if (slots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 2.8)) continue;
      slots.push([x, z]);
    }

    const props: THREE.Group[] = [];
    slots.forEach(([px, pz], index) => {
      const prop = new THREE.Group();
      prop.position.set(px, 0, pz);
      prop.rotation.y = Math.random() * TAU;
      group.add(prop);
      props.push(prop);
      const box = (
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        ry = 0,
      ) => this.mesh(prop, "box", mat, x, y, z, w, h, d, ry);
      const cyl = (
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        r: number,
        h: number,
        ry = 0,
      ) => this.mesh(prop, "cylinder", mat, x, y, z, r, h, r, ry);
      const sph = (
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        rx: number,
        ry2: number,
        rz: number,
      ) => this.mesh(prop, "sphere", mat, x, y, z, rx, ry2, rz);
      const ico = (
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        ry = 0,
      ) => this.mesh(prop, "ico", mat, x, y, z, sx, sy, sz, ry);
      const cone = (
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        r: number,
        h: number,
        ry = 0,
      ) => this.mesh(prop, "cone", mat, x, y, z, r, h, r, ry);
      const oct = (
        _p: THREE.Group,
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
      ) => this.mesh(prop, "oct", mat, x, y, z, sx, sy, sz);
      const kind = index % 6;

      if (biome === -1) {
        // Refuge camp: bedroll, lantern crate and sandbags, all on the ground.
        if (kind % 3 === 0) {
          const roll = cyl(cloth, 0, 0.14, 0, 0.15, 0.86);
          roll.rotation.z = Math.PI / 2;
          box(darkWood, -0.22, 0.15, 0, 0.05, 0.32, 0.05);
          box(darkWood, 0.22, 0.15, 0, 0.05, 0.32, 0.05);
          box(cloth, 0.5, 0.06, 0.1, 0.44, 0.1, 0.34, 0.2);
        } else if (kind % 3 === 1) {
          box(wood, 0, 0.26, 0, 0.66, 0.52, 0.5);
          box(pale, 0, 0.53, 0, 0.7, 0.05, 0.54);
          cyl(metal, 0, 0.66, 0, 0.11, 0.2);
          box(amber, 0, 0.68, 0, 0.14, 0.16, 0.14);
          cone(metal, 0, 0.82, 0, 0.13, 0.12);
          const handle = cyl(steel, 0, 0.92, 0, 0.02, 0.16);
          handle.rotation.z = 0.5;
        } else {
          for (let row = 0; row < 3; row++)
            for (let i = 0; i < 3 - row; i++)
              box(
                cloth,
                -0.62 + i * 0.62 + row * 0.31,
                0.14 + row * 0.27,
                0,
                0.58,
                0.25,
                0.44,
              );
        }
        return;
      }

      if (biome === 0) {
        if (kind === 0) {
          [-0.72, 0.72].forEach((lx) =>
            [-0.34, 0.34].forEach((lz) =>
              box(metal, lx, 0.36, lz, 0.07, 0.72, 0.07),
            ),
          );
          box(wood, 0, 0.755, 0, 1.7, 0.07, 0.85);
          box(darkWood, 0, 0.5, -0.39, 1.6, 0.44, 0.05);
          box(metal, 0, 0.8, -0.14, 0.34, 0.03, 0.24);
          box(metal, 0, 0.9, -0.14, 0.07, 0.2, 0.07);
          box(metal, 0, 1.18, -0.17, 0.86, 0.52, 0.05);
          box(screen, 0, 1.18, -0.135, 0.76, 0.42, 0.02);
          box(pale, 0, 0.8, 0.18, 0.5, 0.03, 0.17);
          cyl(pale, 0.56, 0.85, 0.12, 0.06, 0.11);
          box(paper, -0.55, 0.795, 0.16, 0.3, 0.02, 0.4, 0.2);
          cyl(metal, 0, 0.22, 1.0, 0.05, 0.44);
          cyl(metal, 0, 0.03, 1.0, 0.26, 0.06);
          box(cloth, 0, 0.47, 1.0, 0.5, 0.07, 0.48);
          box(cloth, 0, 0.78, 1.23, 0.48, 0.56, 0.07);
        } else if (kind === 1) {
          box(metal, 0, 0.03, 0, 0.58, 0.06, 0.48);
          box(metal, 0, 0.575, 0, 0.62, 1.15, 0.52);
          box(steel, 0, 1.175, 0, 0.66, 0.05, 0.56);
          [0.24, 0.58, 0.92].forEach((y) => {
            box(steel, 0, y, 0.27, 0.56, 0.3, 0.03);
            box(pale, 0, y, 0.3, 0.2, 0.04, 0.03);
          });
          box(paper, 0.05, 1.06, 0.28, 0.26, 0.02, 0.34, 0.15);
        } else if (kind === 2) {
          cyl(metal, 0, 0.22, 0, 0.05, 0.44);
          cyl(metal, 0, 0.03, 0, 0.26, 0.06);
          box(cloth, 0, 0.47, 0, 0.5, 0.07, 0.48);
          box(cloth, 0, 0.78, -0.23, 0.48, 0.56, 0.07);
          cyl(rust, 0.85, 0.14, -0.3, 0.19, 0.28);
          cyl(rust, 0.85, 0.29, -0.3, 0.21, 0.05);
          cyl(darkWood, 0.85, 0.3, -0.3, 0.16, 0.03);
          [-0.16, 0, 0.18].forEach((lean, i) => {
            const stem = cyl(organic, 0.85 + i * 0.05, 0.48, -0.3, 0.02, 0.34);
            stem.rotation.z = lean;
            sph(
              organic,
              0.85 + lean * 0.9,
              0.66 + i * 0.04,
              -0.3,
              0.11,
              0.07,
              0.11,
            );
          });
        } else if (kind === 3) {
          box(metal, 0, 0.44, 0, 0.44, 0.88, 0.44);
          box(screen, 0, 0.66, 0.225, 0.2, 0.16, 0.02);
          const tap = cyl(steel, 0, 0.3, 0.25, 0.03, 0.09);
          tap.rotation.x = Math.PI / 2;
          box(steel, 0, 0.16, 0.24, 0.26, 0.03, 0.14);
          cyl(pale, 0, 1.09, 0, 0.17, 0.42);
          cyl(pale, 0, 0.9, 0, 0.09, 0.1);
          cyl(steel, 0, 1.32, 0, 0.08, 0.06);
        } else if (kind === 4) {
          const bin = cyl(metal, 0.22, 0.19, 0, 0.19, 0.36);
          bin.rotation.z = Math.PI / 2;
          for (let i = 0; i < 5; i++)
            box(
              paper,
              -0.35 + Math.random() * 0.9,
              0.012 + i * 0.014,
              -0.3 + Math.random() * 0.7,
              0.3,
              0.015,
              0.4,
              Math.random() * TAU,
            );
          for (let i = 0; i < 3; i++)
            ico(
              paper,
              -0.4 + i * 0.34,
              0.07,
              0.34,
              0.08,
              0.07,
              0.08,
              Math.random(),
            );
        } else {
          box(darkWood, 0, 0.05, 0, 0.74, 0.1, 0.54);
          box(metal, 0, 0.95, 0, 0.7, 1.7, 0.5);
          box(steel, 0, 1.82, 0, 0.74, 0.05, 0.54);
          [-0.17, 0.17].forEach((dx) => {
            box(steel, dx, 0.95, 0.26, 0.32, 1.62, 0.03);
            [1.5, 1.6, 1.7].forEach((y) =>
              box(metal, dx, y, 0.28, 0.2, 0.02, 0.02),
            );
          });
          [-0.04, 0.04].forEach((dx) =>
            box(pale, dx, 1.05, 0.29, 0.035, 0.16, 0.035),
          );
        }
        return;
      }

      if (biome === 1) {
        if (kind === 0) {
          box(metal, 0, 0.03, 0, 0.46, 0.06, 0.46);
          cone(amber, 0, 0.36, 0, 0.19, 0.6);
          cyl(pale, 0, 0.4, 0, 0.085, 0.07);
          box(wood, 0.9, 0.28, 0.2, 0.6, 0.56, 0.6, 0.2);
        } else if (kind === 1) {
          [-0.72, 0.72].forEach((lx) =>
            [-0.42, 0.42].forEach((lz) =>
              box(metal, lx, 0.09, lz, 0.12, 0.18, 0.12),
            ),
          );
          box(metal, 0, 0.66, 0, 1.7, 0.96, 1.05);
          box(steel, 0, 1.16, 0, 1.78, 0.09, 1.12);
          [-0.43, 0.43].forEach((dx, i) => {
            const lid = box(darkWood, dx, 1.24, 0, 0.84, 0.07, 1.06);
            lid.rotation.z = i ? -0.12 : 0.16;
          });
          box(rust, -0.5, 0.6, 0.53, 0.34, 0.24, 0.02);
          box(rust, 0.55, 0.45, -0.53, 0.28, 0.2, 0.02);
          ico(cloth, -0.3, 1.3, 0, 0.3, 0.2, 0.3);
          ico(cloth, 0.32, 1.28, 0.1, 0.26, 0.18, 0.26);
        } else if (kind === 2) {
          cyl(rust, 0, 0.05, 0, 0.22, 0.1);
          cyl(rust, 0, 0.38, 0, 0.14, 0.56);
          sph(rust, 0, 0.7, 0, 0.15, 0.13, 0.15);
          [-0.19, 0.19].forEach((dx) => {
            const cap = cyl(steel, dx, 0.46, 0, 0.06, 0.1);
            cap.rotation.z = Math.PI / 2;
          });
          cyl(steel, 0, 0.8, 0, 0.05, 0.09);
          ico(cloth, 0.6, 0.28, 0.25, 0.34, 0.28, 0.34, 0.4);
          ico(cloth, 0.85, 0.2, -0.15, 0.24, 0.2, 0.24, 1.1);
        } else if (kind === 3) {
          [-0.78, 0.78].forEach((dx) => {
            box(metal, dx, 0.22, 0, 0.1, 0.44, 0.52);
            box(wood, dx, 0.62, 0, 0.1, 0.06, 0.5);
            box(metal, dx, 0.68, -0.24, 0.08, 0.5, 0.08);
          });
          [-0.17, 0, 0.17].forEach((dz) =>
            box(wood, 0, 0.47, dz, 1.9, 0.06, 0.14),
          );
          [0.72, 0.88].forEach((y) => box(wood, 0, y, -0.24, 1.9, 0.06, 0.1));
        } else if (kind === 4) {
          cyl(metal, 0, 0.04, 0, 0.24, 0.08);
          cyl(metal, 0, 1.35, 0, 0.06, 2.6);
          box(pale, 0, 2.42, 0, 0.95, 0.36, 0.05);
          box(metal, 0, 2.42, 0.03, 0.82, 0.07, 0.02);
          box(pale, 0, 2.05, 0, 0.7, 0.28, 0.05, Math.PI / 2);
          box(metal, 0.9, 0.4, 0.3, 0.6, 0.8, 0.45);
          box(steel, 0.9, 0.82, 0.3, 0.64, 0.06, 0.5);
          box(pale, 0.9, 0.52, 0.53, 0.4, 0.32, 0.02);
        } else {
          cyl(metal, 0, 0.012, 0, 0.6, 0.025);
          cyl(steel, 0, 0.03, 0, 0.52, 0.04);
          [0, 1, 2, 3].forEach((i) =>
            box(steel, 0, 0.052, 0, 0.94, 0.012, 0.05, (i * Math.PI) / 4),
          );
          [-0.95, 0.9].forEach((dx, i) => {
            box(metal, dx, 0.03, i ? 0.3 : -0.2, 0.4, 0.06, 0.4);
            cone(amber, dx, 0.34, i ? 0.3 : -0.2, 0.16, 0.52);
            cyl(pale, dx, 0.38, i ? 0.3 : -0.2, 0.075, 0.06);
          });
        }
        return;
      }

      if (biome === 2) {
        if (kind === 0) {
          [-0.72, 0.72].forEach((lx) =>
            [-0.95, 0.95].forEach((lz) =>
              box(metal, lx, 1.0, lz, 0.09, 2.0, 0.09),
            ),
          );
          [0.42, 1.34].forEach((y) => {
            box(metal, 0, y, 0, 1.55, 0.08, 2.0);
            box(pale, 0, y + 0.12, 0, 1.45, 0.16, 1.9);
            box(cloth, 0, y + 0.24, -0.75, 0.6, 0.1, 0.34);
          });
          box(metal, 0, 1.66, 0.98, 1.55, 0.24, 0.06);
          [-0.3, 0.3].forEach((lz) =>
            box(metal, 0.78, 0.75, lz, 0.05, 1.5, 0.05),
          );
          [0.35, 0.65, 0.95, 1.25].forEach((y) =>
            box(metal, 0.78, y, 0, 0.05, 0.05, 0.6),
          );
        } else if (kind === 1) {
          box(pale, 0, 0.19, 0.2, 0.42, 0.38, 0.5);
          cyl(pale, 0, 0.44, 0.2, 0.2, 0.14);
          cyl(cloth, 0, 0.53, 0.2, 0.21, 0.04);
          box(pale, 0, 0.62, -0.12, 0.44, 0.52, 0.2);
          box(pale, 0, 0.9, -0.12, 0.46, 0.05, 0.22);
          cyl(steel, 0.14, 0.95, -0.12, 0.03, 0.08);
          cyl(pale, 0.92, 0.4, 0.1, 0.09, 0.8);
          box(pale, 0.92, 0.84, 0.1, 0.56, 0.12, 0.44);
          box(metal, 0.92, 0.88, 0.1, 0.44, 0.06, 0.32);
          cyl(steel, 0.92, 0.98, -0.06, 0.03, 0.18);
        } else if (kind === 2) {
          [-0.75, 0.75].forEach((dx) =>
            box(concrete, dx, 0.25, 0.7, 0.3, 0.5, 0.56),
          );
          box(concrete, 0, 0.5, 0.7, 2.0, 0.14, 0.6);
          box(concrete, 0, 0.39, -0.4, 1.2, 0.66, 0.5);
          box(concrete, 0, 0.78, -0.4, 1.6, 0.12, 0.9);
          box(metal, 0.3, 0.87, -0.3, 0.4, 0.04, 0.3);
          cyl(pale, -0.4, 0.9, -0.5, 0.06, 0.12);
        } else if (kind === 3) {
          box(wood, 0, 0.22, 0, 0.95, 0.44, 0.52);
          box(darkWood, 0, 0.47, 0, 0.99, 0.08, 0.56);
          [-0.3, 0.3].forEach((dx) =>
            box(metal, dx, 0.4, 0.27, 0.08, 0.1, 0.03),
          );
          box(metal, 0, 0.5, 0.28, 0.24, 0.04, 0.04);
          box(wood, 0.9, 0.28, 0.1, 0.6, 0.56, 0.6, 0.2);
          const blanket = cyl(cloth, -0.8, 0.12, 0.2, 0.12, 0.5);
          blanket.rotation.z = Math.PI / 2;
        } else if (kind === 4) {
          [-0.55, 0.55].forEach((lx) =>
            [-0.3, 0.3].forEach((lz) =>
              box(metal, lx, 0.9, lz, 0.06, 1.8, 0.06),
            ),
          );
          [0.35, 0.9, 1.45].forEach((y) =>
            box(metal, 0, y, 0, 1.16, 0.05, 0.66),
          );
          box(metal, 0, 1.82, 0, 1.2, 0.05, 0.7);
          for (let i = 0; i < 6; i++)
            cyl(metal, -0.5 + i * 0.2, 0.9, 0.32, 0.022, 1.78);
          box(cloth, -0.25, 0.44, 0, 0.4, 0.14, 0.44);
          box(cloth, 0.25, 0.99, 0, 0.4, 0.14, 0.44);
        } else {
          cyl(metal, 0, 0.2, 0, 0.25, 0.4);
          cyl(steel, 0, 0.41, 0, 0.27, 0.05);
          const mop = cyl(wood, 0.05, 0.9, 0, 0.028, 1.5);
          mop.rotation.z = 0.22;
          box(pale, 0.3, 0.16, 0, 0.2, 0.1, 0.26);
          cyl(wood, 0.78, 0.46, 0.2, 0.22, 0.07);
          [-0.14, 0, 0.14].forEach((a, i) => {
            const leg = cyl(
              metal,
              0.78 + a * 0.8,
              0.22,
              0.2 + a * 0.5,
              0.03,
              0.44,
            );
            leg.rotation.z = a * 1.6;
            leg.rotation.x = i === 1 ? 0.2 : -a * 1.4;
          });
        }
        return;
      }

      if (biome === 3) {
        if (kind === 0) {
          for (let i = 0; i < 7; i++)
            box(
              books[i % 4],
              (Math.random() - 0.5) * 0.06,
              0.05 + i * 0.1,
              (Math.random() - 0.5) * 0.06,
              0.54,
              0.09,
              0.38,
              (Math.random() - 0.5) * 0.3,
            );
          box(books[2], 0.62, 0.05, 0.2, 0.44, 0.09, 0.32, 0.7);
        } else if (kind === 1) {
          [-0.62, 0.62].forEach((lx) =>
            [-0.4, 0.4].forEach((lz) =>
              box(wood, lx, 0.37, lz, 0.09, 0.74, 0.09),
            ),
          );
          box(darkWood, 0, 0.68, 0, 1.34, 0.12, 0.84);
          box(wood, 0, 0.78, 0, 1.5, 0.08, 1.0);
          [-0.13, 0.13].forEach((dx, i) => {
            const page = box(paper, dx, 0.84, 0.05, 0.26, 0.03, 0.36);
            page.rotation.z = i ? -0.07 : 0.07;
          });
          box(darkWood, 0, 0.835, 0.05, 0.04, 0.03, 0.36);
          cyl(metal, -0.5, 0.85, -0.2, 0.07, 0.06);
          cyl(pale, -0.5, 0.95, -0.2, 0.045, 0.16);
          sph(amber, -0.5, 1.07, -0.2, 0.05, 0.08, 0.05);
          [-0.22, 0.22].forEach((dx) =>
            [-0.2, 0.2].forEach((dz) =>
              box(wood, dx, 0.22, 1.0 + dz, 0.07, 0.44, 0.07),
            ),
          );
          box(cloth, 0, 0.47, 1.0, 0.5, 0.07, 0.48);
          box(cloth, 0, 0.78, 1.23, 0.48, 0.56, 0.07);
        } else if (kind === 2) {
          box(darkWood, 0, 0.06, 0, 1.16, 0.12, 0.54);
          box(wood, 0, 0.72, 0, 1.1, 1.2, 0.5);
          box(wood, 0, 1.35, 0, 1.16, 0.06, 0.56);
          [-0.4, -0.13, 0.13, 0.4].forEach((dx) =>
            [0.32, 0.62, 0.92].forEach((y) => {
              box(pale, dx, y, 0.26, 0.22, 0.17, 0.03);
              box(metal, dx, y, 0.29, 0.07, 0.03, 0.03);
            }),
          );
        } else if (kind === 3) {
          [-0.24, 0.24].forEach((dx) =>
            box(wood, dx, 0.26, 0, 0.06, 0.52, 0.36),
          );
          box(wood, 0, 0.2, 0, 0.54, 0.06, 0.34);
          box(wood, 0, 0.48, 0, 0.54, 0.06, 0.34);
          box(books[0], 0, 0.55, 0, 0.34, 0.08, 0.26, 0.1);
          box(books[3], 0.75, 0.05, 0.15, 0.44, 0.09, 0.32, 1.2);
        } else if (kind === 4) {
          box(wood, 0, 0.04, 0, 2.2, 0.08, 0.95);
          [-1.06, 1.06].forEach((dx) =>
            box(wood, dx, 0.48, 0, 0.08, 0.86, 0.95),
          );
          [0.34, 0.62].forEach((y) => box(wood, 0, y, 0, 2.05, 0.06, 0.88));
          for (let i = 0; i < 6; i++)
            box(
              books[i % 4],
              -0.8 + i * 0.3,
              0.44 + (i % 2) * 0.28,
              (Math.random() - 0.5) * 0.2,
              0.09,
              0.24,
              0.34,
            );
          for (let i = 0; i < 4; i++)
            box(
              books[(i + 1) % 4],
              -1.3 + i * 0.34,
              0.05,
              0.72 + (Math.random() - 0.5) * 0.2,
              0.44,
              0.08,
              0.32,
              Math.random() * TAU,
            );
        } else {
          cyl(darkWood, 0, 0.05, 0, 0.28, 0.1);
          cyl(wood, 0, 0.5, 0, 0.04, 0.9);
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU;
            const leg = cyl(
              wood,
              Math.cos(a) * 0.16,
              0.34,
              Math.sin(a) * 0.16,
              0.028,
              0.7,
            );
            leg.rotation.z = -Math.cos(a) * 0.26;
            leg.rotation.x = Math.sin(a) * 0.26;
          }
          sph(this.roomMat(room, "#7f96a8"), 0, 0.99, 0, 0.24, 0.24, 0.24);
          cyl(steel, 0, 0.99, 0, 0.27, 0.03);
          box(pale, 0, 1.05, 0, 0.5, 0.02, 0.05, 0.5);
        }
        return;
      }

      // Biome 4 — jardín mutante: growth, bones and stones, all rooted.
      if (kind === 0) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.4;
          const dx = Math.cos(a) * (0.16 + i * 0.09);
          const dz = Math.sin(a) * (0.16 + i * 0.09);
          const r = 0.05 + (i % 3) * 0.02;
          const h = 0.28 + (i % 3) * 0.17;
          cyl(bone, dx, h / 2, dz, r, h);
          sph(organic, dx, h + 0.02, dz, r * 2.6, r * 1.3, r * 2.6);
          cyl(spore, dx, h - 0.02, dz, r * 1.5, 0.03);
        }
      } else if (kind === 1) {
        const spine = cyl(bone, 0, 0.06, 0, 0.055, 0.8);
        spine.rotation.z = Math.PI / 2;
        for (let i = 0; i < 5; i++) {
          const rib = box(bone, -0.28 + i * 0.14, 0.08, 0, 0.03, 0.03, 0.3);
          rib.rotation.x = i % 2 ? 0.55 : -0.55;
        }
        sph(bone, -0.52, 0.13, 0, 0.17, 0.15, 0.2);
        box(bone, -0.52, 0.05, 0.13, 0.14, 0.06, 0.1);
        [-0.07, 0.07].forEach((dx) =>
          sph(
            this.roomMat(room, "#2b3a2c"),
            -0.52 + dx,
            0.15,
            0.15,
            0.04,
            0.045,
            0.03,
          ),
        );
        const limb = cyl(bone, 0.5, 0.05, 0.16, 0.035, 0.46);
        limb.rotation.z = Math.PI / 2 - 0.3;
      } else if (kind === 2) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          ico(
            concrete,
            Math.cos(a) * 0.62,
            0.12,
            Math.sin(a) * 0.62,
            0.26,
            0.2,
            0.24,
            a,
          );
        }
        cyl(concrete, 0, 0.05, 0, 0.34, 0.1);
        ico(organic, 0.1, 0.11, -0.08, 0.14, 0.06, 0.14, 0.6);
      } else if (kind === 3) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU;
          const root = cyl(
            organic,
            Math.cos(a) * 0.24,
            0.09,
            Math.sin(a) * 0.24,
            0.04,
            0.2,
          );
          root.rotation.z = -Math.cos(a) * 0.5;
          root.rotation.x = Math.sin(a) * 0.5;
        }
        sph(organic, 0, 0.4, 0, 0.32, 0.42, 0.32);
        [0.9, 2.1, 3.4].forEach((a) =>
          oct(
            prop,
            spore,
            Math.cos(a) * 0.26,
            0.44 + Math.sin(a) * 0.16,
            Math.sin(a) * 0.26,
            0.05,
            0.1,
            0.05,
          ),
        );
        cyl(spore, 0, 0.86, 0, 0.05, 0.12);
        ico(organic, 0.42, 0.14, 0.2, 0.13, 0.14, 0.13, 0.5);
      } else if (kind === 4) {
        [-0.7, 0.7].forEach((dx) => cyl(darkWood, dx, 0.13, 0, 0.19, 0.26));
        const log = cyl(wood, 0, 0.36, 0, 0.22, 1.9);
        log.rotation.z = Math.PI / 2;
        [-0.92, 0.92].forEach((dx) => {
          const ring = cyl(darkWood, dx, 0.36, 0, 0.23, 0.04);
          ring.rotation.z = Math.PI / 2;
        });
        [-0.3, 0.15, 0.5].forEach((dx, i) => {
          cyl(bone, dx, 0.6, 0.06, 0.035, 0.16);
          sph(organic, dx, 0.7, 0.06, 0.1 - i * 0.015, 0.05, 0.1 - i * 0.015);
        });
      } else {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + 0.3;
          const dx = Math.cos(a) * (0.2 + (i % 3) * 0.16);
          const dz = Math.sin(a) * (0.2 + (i % 3) * 0.16);
          const stem = cyl(organic, dx, 0.17, dz, 0.018, 0.34);
          stem.rotation.z = Math.cos(a) * 0.18;
          stem.rotation.x = -Math.sin(a) * 0.18;
          oct(prop, spore, dx, 0.37, dz, 0.09, 0.12, 0.09);
          box(organic, dx + 0.07, 0.09, dz, 0.13, 0.02, 0.06, a);
          box(organic, dx - 0.07, 0.12, dz, 0.12, 0.02, 0.06, a + 1);
        }
      }
    });

    // Grounding audit: no prop may hover over the floor or sink through it.
    this.decorCount += props.length;
    this.host.dataset.decorCount = String(this.decorCount);
    const bounds = new THREE.Box3();
    const parts: THREE.Box3[] = [];
    props.forEach((item) => {
      item.updateMatrixWorld(true);
      bounds.setFromObject(item);
      if (bounds.min.y > 0.06) this.decorFloating++;
      else if (bounds.min.y < -0.25) this.decorSunk++;
      parts.length = 0;
      item.children.forEach((child) => {
        const part = new THREE.Box3().setFromObject(child);
        if (!part.isEmpty()) parts.push(part);
      });
      this.decorUnsupported += this.countUnsupported(parts);
    });
    this.host.dataset.decorFloating = String(this.decorFloating);
    this.host.dataset.decorSunk = String(this.decorSunk);
    this.host.dataset.decorUnsupported = String(this.decorUnsupported);
  }

  private applyWaveModifier(wave: number) {
    const modifiers = [
      {
        name: "AIRE VICIADO",
        speed: 1,
        elite: 1,
        hint: "La niebla se espesa. La horda acecha.",
      },
      {
        name: "ESTAMPIDA",
        speed: 1.22,
        elite: 1,
        hint: "Los mutantes corren más rápido. No te detengas.",
      },
      {
        name: "CARNE DURA",
        speed: 1,
        elite: 1.3,
        hint: "Cada mutante resiste más disparos.",
      },
      {
        name: "SANGRE FRÍA",
        speed: 1.08,
        elite: 1.16,
        hint: "Más brutos y corredores entre las sombras.",
      },
      {
        name: "LLUVIA DE CENIZA",
        speed: 0.94,
        elite: 0.9,
        hint: "Calma tensa: un respiro, y mejor botín.",
      },
    ];
    const pick = modifiers[wave % modifiers.length];
    this.waveSpeed = pick.speed;
    this.waveElite = pick.elite;
    this.waveHint = pick.hint;
    this.snapshot.modifier = pick.name;
    this.host.dataset.modifier = pick.name;
  }

  private createSupplyCrate(
    parent: THREE.Group,
    rx: number,
    rz: number,
    room: Room,
  ): SupplyCrate {
    const crateGroup = new THREE.Group();
    const parts = new THREE.Group();
    const cx = (Math.random() < 0.5 ? -1 : 1) * (5.2 + Math.random() * 1.8);
    const cz = (Math.random() < 0.5 ? -1 : 1) * (5.2 + Math.random() * 1.8);
    crateGroup.position.set(cx, 0, cz);

    const steel = this.roomMat(room, "#2c3631");
    const olive = this.roomMat(room, "#435242");
    const hazard = this.roomMat(room, "#e8aa43", true);
    const darkLatch = this.roomMat(room, "#1c221e");

    this.mesh(parts, "box", olive, 0, 0.42, 0, 1.45, 0.84, 1.05);
    [-0.68, 0.68].forEach((bx) => {
      [-0.48, 0.48].forEach((bz) => {
        this.mesh(parts, "box", steel, bx, 0.42, bz, 0.14, 0.86, 0.14);
      });
    });
    this.mesh(parts, "box", steel, 0, 0.84, 0, 1.5, 0.08, 1.1);
    this.mesh(parts, "box", darkLatch, 0, 0.46, 0.53, 0.26, 0.18, 0.04);
    this.mesh(parts, "box", hazard, 0, 0.89, 0, 1.0, 0.02, 0.6);
    this.mesh(parts, "cylinder", steel, 0, 0.94, 0, 0.06, 0.1, 0.06);
    this.mesh(parts, "oct", hazard, 0, 1.04, 0, 0.14, 0.18, 0.14);

    this.mergeStatic(parts, room.geometries, room);
    crateGroup.add(parts);
    const beacon = new THREE.PointLight(0xffae42, 4.5, 6.5, 2);
    beacon.position.set(0, 1.25, 0);
    crateGroup.add(beacon);

    parent.add(crateGroup);
    room.colliders.push({
      x: rx * ROOM + cx,
      z: rz * ROOM + cz,
      w: 0.75,
      d: 0.55,
    });

    return {
      mesh: crateGroup,
      beacon,
      opened: false,
      x: rx * ROOM + cx,
      z: rz * ROOM + cz,
    };
  }

  private openSupplyCrate(crate: SupplyCrate) {
    if (crate.opened) return;
    crate.opened = true;
    crate.beacon.intensity = 0;
    crate.mesh.scale.set(1.1, 0.45, 1.1);

    const px = crate.x;
    const pz = crate.z;
    this.spawnParticles(this.tempVec.set(px, 0.8, pz), "#ffdc78", 28, 3.0);
    this.spawnParticles(this.tempVec.set(px, 1.0, pz), "#52db9a", 16, 2.4);
    this.audio.play("chest");
    if (this.settings.shake) this.shake = Math.max(this.shake, 0.28);
    this.snapshot.cratesOpened++;
    this.host.dataset.crates = String(this.snapshot.cratesOpened);

    const roll = Math.floor(Math.random() * 5);
    if (roll === 0) {
      SECONDARY_WEAPONS.forEach((wid) => {
        const config = WEAPONS[wid];
        this.clips.set(wid, config.clip);
        const cur = this.arsenal.get(wid) || 0;
        this.arsenal.set(wid, cur + config.ammo * 2);
      });
      this.syncWeapon();
      this.spawnPopup(px, 2.1, pz, "¡ARSENAL COMPLETO!", "reward");
      this.callbacks.onNotice(
        "SUMINISTROS: ARSENAL COMPLETO",
        "Munición masiva para escopeta, fusil y subfusil.",
      );
    } else if (roll === 1) {
      const goldBounty = Math.round(
        (110 + Math.random() * 70) * this.snapshot.goldMultiplier,
      );
      this.addGold(goldBounty);
      this.snapshot.score += 260;
      this.spawnPopup(px, 2.1, pz, `+${goldBounty} ORO!`, "reward");
      this.callbacks.onNotice(
        "SUMINISTROS: TESORO DE CAMPAÑA",
        `+${goldBounty} de oro asegurados para la fogata.`,
      );
    } else if (roll === 2) {
      this.grantXp(this.snapshot.xpNext - this.snapshot.xp + 10);
      this.spawnPopup(px, 2.1, pz, "¡INSTINTO DESPERTADO!", "reward");
      this.callbacks.onNotice(
        "SUMINISTROS: RELIQUIA DE ÁNIMA",
        "Subida de nivel instantánea y don táctico.",
      );
    } else if (roll === 3) {
      const embersGained = 3 + Math.floor(Math.random() * 3);
      this.snapshot.bonusEmbers += embersGained;
      this.snapshot.score += 220;
      this.spawnPopup(px, 2.1, pz, `+${embersGained} BRASAS!`, "reward");
      this.callbacks.onNotice(
        "SUMINISTROS: COSECHA DE BRASAS",
        `+${embersGained} brasas permanentes añadidas a tu legado.`,
      );
    } else {
      this.snapshot.health = this.snapshot.maxHealth;
      this.snapshot.shieldTime = 30;
      this.snapshot.shieldMax = 30;
      this.spawnPopup(px, 2.1, pz, "¡ESCUDO TÁCTICO 30s!", "reward");
      this.callbacks.onNotice(
        "SUMINISTROS: BARRERA TÁCTICA Y CIRUGÍA",
        "Vida al 100% y escudo de absorción de daño por 30 s.",
      );
    }

    this.emit();
  }

  /** Gold is always an integer: fractions are rounded down, never displayed. */
  private addGold(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.snapshot.gold += Math.floor(amount);
    this.snapshot.gold = Math.floor(this.snapshot.gold);
  }

  private createSurvivor(room: Room) {
    if (this.companions.filter((c) => c.recruited).length >= 2) return;
    const actor = this.createActor("rabbit");
    const x = room.x * ROOM - 3.7;
    const z = room.z * ROOM + 2.4;
    actor.root.position.set(x, 0.06, z);
    actor.root.rotation.y = 0.75;
    this.scene.add(actor.root);
    this.companions.push({
      actor,
      hp: this.snapshot.maxHealth,
      maxHp: this.snapshot.maxHealth,
      cooldown: 0,
      knifeCd: 0,
      hurt: 0,
      resource: 0,
      recruited: false,
      roomKey: `${room.x},${room.z}`,
      weapon: "pistol",
      ammo: 0,
      state: "follow",
      name: `COMPAÑERO ${String(this.companions.length + 1).padStart(2, "0")}`,
      damageTaken: 0,
    });
    const candle = new THREE.Group();
    const metal = this.roomMat(room, "#8a7953");
    this.mesh(candle, "cylinder", metal, -2.5, 0.08, 2.4, 0.35, 0.16, 0.35);
    this.mesh(candle, "cylinder", metal, -2.5, 0.77, 2.4, 0.055, 1.5, 0.055);
    this.mesh(candle, "box", metal, -2.5, 1.4, 2.4, 0.9, 0.06, 0.09);
    [-1, 0, 1].forEach((i) => {
      this.mesh(
        candle,
        "cylinder",
        this.roomMat(room, "#d8c69d"),
        -2.5 + i * 0.38,
        1.65,
        2.4,
        0.075,
        0.38,
        0.075,
      );
      this.mesh(
        candle,
        "oct",
        this.mat("#ffd58e", true),
        -2.5 + i * 0.38,
        1.96,
        2.4,
        0.07,
        0.18,
        0.07,
      );
    });
    this.mergeStatic(candle, room.geometries, room);
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(this.geo("plane"), glowMaterial);
    glow.position.set(-2.5, 0.05, 2.4);
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(7, 7, 1);
    candle.add(glow);
    room.resources.materials.push(glowMaterial);
    const candleLight = new THREE.PointLight(0xffbd6b, 7, 9, 2);
    candleLight.position.set(-2.5, 1.95, 2.4);
    candle.add(candleLight);
    room.candleLight = candleLight;
    this.candleLights.push({ light: candleLight, room });
    room.root.add(candle);
  }

  private addPreviewEnemies() {
    [
      [6.7, -5.1],
      [-6.2, -3.5],
      [7, 2.2],
    ].forEach(([x, z], i) => {
      const actor = this.createActor(i === 2 ? "cat" : "rabbit", true);
      actor.root.position.set(x, 0.06, z);
      actor.root.rotation.y = -2.3;
      this.scene.add(actor.root);
      this.enemies.push({
        actor,
        hp: 28,
        maxHp: 28,
        speed: 2,
        damage: 13,
        hit: 0,
        kind: i === 2 ? "cat" : "rabbit",
        variant: i === 2 ? "stalker" : "walker",
        lungeCd: 2,
        lungeTime: 0,
        dying: 0,
        deathDuration: 0.85,
        baseScale: actor.root.scale.x,
        elite: false,
      });
    });
  }

  preview(character: CharacterId) {
    if (this.state !== "menu") return;
    const old = this.player.root;
    this.player = this.createActor(character);
    this.player.root.position.copy(old.position);
    this.player.root.rotation.copy(old.rotation);
    this.scene.remove(old);
    this.scene.add(this.player.root);
  }

  start(character: CharacterId, profile: Profile) {
    this.audio.unlock();
    this.audio.setEnabled(this.settings.sound, this.settings.ambience);
    this.clearRun();
    const stats = CHARACTERS.find((c) => c.id === character)!;
    this.damage = stats.damage * (1 + profile.upgrades.damage * 0.08);
    this.speed = stats.speed * (1 + profile.upgrades.speed * 0.04);
    this.armor = Math.pow(0.96, profile.upgrades.armor || 0);
    this.lifesteal = 0;
    this.multishot = 0;
    this.fireRate = 1;
    this.magnet = 1;
    this.blast = 0;
    this.blastDepth = 0;
    this.regen = 0;
    this.luck = 0;
    this.adaptiveSteps = 0;
    this.clips.clear();
    this.clips.set("pistol", WEAPONS.pistol.clip);
    this.arsenal.clear();
    this.reloadTimer = 0;
    this.reloadTotal = 0;
    this.knifeCooldown = 0;
    this.knifeMax = KNIFE_COOLDOWN;
    this.knifeDamageMult = 1;
    this.reloadSpeed = Math.pow(0.89, profile.upgrades.reload || 0);
    this.clipBonus = profile.upgrades.reload || 0;
    this.critChance = 0.05 + (profile.upgrades.crit || 0) * 0.05;
    this.accuracyBonus = 0;
    this.knockBonus = 1;
    this.xpMultiplier = 1 + (profile.upgrades.embers || 0) * 0.15;
    this.accuracyBonus = (profile.upgrades.accuracy || 0) * 0.012;
    this.hitStop = 0;
    this.landing = 0;
    this.footstep = 0;
    this.heartTimer = 0;
    this.ghostTimer = 0;
    this.velocity.set(0, 0);
    this.waveSpeed = 1;
    this.waveElite = 1;
    this.waveHint = "";
    this.elitesKilled = 0;
    this.bountyStage = 0;
    this.muzzleGlow = 0;
    this.slashTime = 0;
    this.missedShots = 0;
    this.slashCount = 0;
    this.slashArc.visible = false;
    this.dwell = 0;
    this.dwellBiome = -1;
    this.goldBase = 1 + (profile.upgrades.gold || 0) * 0.08;
    this.dashMax = Math.max(
      1.2,
      2.6 * (1 - (profile.upgrades.dash || 0) * 0.08),
    );
    this.snapshot = {
      ...INITIAL_SNAPSHOT,
      companions: [],
      purchased: [],
      draftChoices: [],
      goldMultiplier: this.goldBase,
      weapon: "pistol",
      clip: WEAPONS.pistol.clip,
      clipMax: WEAPONS.pistol.clip,
      ammo: 0,
      reloading: 0,
      accuracy: 90,
      arsenal: [],
      pressure: 1,
      enemyPower: 1,
      level: 1,
      xp: 0,
      xpNext: 90,
      draftTimer: 0,
      bonusEmbers: 0,
      bountiesDone: 0,
      frenzyTime: 0,
      knife: 1,
      knifeCooldownLeft: 0,
      health: stats.health + profile.upgrades.vitality * 10,
      maxHealth: stats.health + profile.upgrades.vitality * 10,
    };
    this.currentX = this.currentZ = this.steps = 0;
    this.previousRoom = "";
    this.shotCooldown = 0;
    this.hurtCooldown = this.dashCooldown = this.dashTime = 0;
    this.lastKill = -100;
    this.eliteTimer = 26;
    this.spawnTimer = 0.4;
    this.healthTimer = 0;
    this.spawnSamples = 0;
    this.spawnDistance = 0;
    this.spawnedTotal = 0;
    delete this.host.dataset.avgSpawn;
    delete this.host.dataset.enemies;
    delete this.host.dataset.population;
    delete this.host.dataset.kits;
    delete this.host.dataset.elites;
    delete this.host.dataset.spawned;
    delete this.host.dataset.slashes;
    delete this.host.dataset.pushed;
    delete this.host.dataset.misses;
    this.host.dataset.level = "1";
    this.host.dataset.levelup = "0";
    this.host.dataset.enemyPower = "1.00";
    this.decorFloating = 0;
    this.decorSunk = 0;
    this.decorUnsupported = 0;
    this.decorCount = 0;
    this.allyDamageTotal = 0;
    this.allyDeaths = 0;
    this.host.dataset.decorUnsupported = "0";
    this.minRigY = 0;
    this.host.dataset.decorCount = "0";
    this.host.dataset.decorFloating = "0";
    this.host.dataset.decorSunk = "0";
    this.host.dataset.minRigY = "0.000";
    this.host.dataset.modifier = "REFUGIO";
    this.host.dataset.allyDamage = "0";
    this.host.dataset.allyDeaths = "0";
    const shieldLevel = profile.upgrades.startShield || 0;
    if (shieldLevel > 0) {
      this.snapshot.shieldTime = shieldLevel * 6;
      this.snapshot.shieldMax = shieldLevel * 6;
    }
    const ammoLevel = profile.upgrades.startAmmo || 0;
    if (ammoLevel > 0) {
      this.clips.set("shotgun", WEAPONS.shotgun.clip);
      this.arsenal.set("shotgun", ammoLevel * 6);
    }
    this.host.dataset.bounties = "0";
    this.fireLight.position.set(0, 2, 0);
    this.createWorld();
    const center = this.rooms.get("0,0")!;
    center.visited = 0;
    this.scene.remove(this.player.root);
    this.player = this.createActor(character);
    this.player.root.position.set(2.1, 0.06, 2.7);
    this.unstick(this.player.root, 0.38);
    this.scene.add(this.player.root);
    this.state = "playing";
    this.syncWeapon();
    this.input.attack = this.input.interact = false;
    this.input.x = this.input.y = 0;
    for (let i = 0; i < 4; i++) this.spawnEnemy(true, i);
    this.updateRoomLights(true);
    this.renderer.shadowMap.needsUpdate = true;
    this.emit();
    this.callbacks.onNotice(
      "QUE LA LUZ TE ACOMPAÑE",
      "Muévete. Tu pistola se encarga del resto.",
    );
  }

  menu(character: CharacterId) {
    this.clearRun();
    this.state = "menu";
    this.currentX = this.currentZ = this.steps = 0;
    this.createWorld();
    this.scene.remove(this.player.root);
    this.player = this.createActor(character);
    this.player.root.position.set(2.1, 0.06, 2.7);
    this.player.root.rotation.y = 0.8;
    this.scene.add(this.player.root);
    this.addPreviewEnemies();
    this.fireLight.position.set(0, 2, 0);
    this.updateRoomLights(true);
    this.renderer.shadowMap.needsUpdate = true;
    this.input.x = this.input.y = 0;
    this.input.attack = this.input.interact = false;
  }

  private clearRun() {
    this.enemies.forEach((e) => this.scene.remove(e.actor.root));
    this.companions.forEach((c) => this.scene.remove(c.actor.root));
    this.drops.forEach((d) => this.scene.remove(d.mesh));
    this.trails.forEach((t) => this.scene.remove(t.mesh));
    this.enemies = [];
    this.companions = [];
    this.drops = [];
    this.trails = [];
    this.particles = [];
    this.particleMesh.count = 0;
    this.rooms.forEach((room) => this.disposeRoom(room));
    this.rooms.clear();
    this.regens.clear();
    this.candleLights = [];
    this.dying.forEach((enemy) => this.scene.remove(enemy.actor.root));
    this.dying = [];
    this.portals.forEach((portal) => {
      portal.active = false;
      portal.life = 0;
      portal.group.visible = false;
    });
    this.biomeSeed = 1 + Math.floor(Math.random() * 1e9);
  }

  private disposeRoom(room: Room) {
    this.scene.remove(room.root);
    const key = `${room.x},${room.z}`;
    this.companions = this.companions.filter((companion) => {
      if (!companion.recruited && companion.roomKey === key) {
        this.scene.remove(companion.actor.root);
        return false;
      }
      return true;
    });
    room.floor.dispose();
    room.geometries.forEach((g) => g.dispose());
    room.materials.forEach((m) => m.material.dispose());
    room.resources.materials.forEach((m) => m.dispose());
    room.resources.textures.forEach((t) => t.dispose());
    if (room.candleLight)
      this.candleLights = this.candleLights.filter(
        (entry) => entry.light !== room.candleLight,
      );
    if (room.crate) {
      room.crate.beacon.dispose();
    }
  }

  pause(paused: boolean) {
    if (this.state === "over" || this.state === "menu") return;
    this.state = paused ? "paused" : "playing";
    this.input.x = this.input.y = 0;
    this.input.interact = this.input.attack = false;
  }

  setSettings(settings: GameSettings) {
    this.settings = settings;
    this.audio.setEnabled(settings.sound, settings.ambience);
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, settings.quality === "high" ? 1.75 : 1),
    );
    this.renderer.shadowMap.enabled = settings.quality === "high";
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }
  private weapon() {
    return WEAPONS[this.snapshot.weapon];
  }

  private weaponRange() {
    return this.weapon().range * CHARACTER_UNIT;
  }

  private totalAmmo(id: WeaponId) {
    if (id === "pistol") return Infinity;
    return (this.clips.get(id) || 0) + (this.arsenal.get(id) || 0);
  }

  private syncWeapon() {
    if (
      this.snapshot.weapon !== "pistol" &&
      this.totalAmmo(this.snapshot.weapon) <= 0
    ) {
      this.snapshot.weapon = "pistol";
      this.reloadTimer = 0;
      this.reloadTotal = 0;
    }
    const id = this.snapshot.weapon;
    const config = WEAPONS[id];
    const clip = this.clips.get(id) ?? (id === "pistol" ? config.clip : 0);
    this.clips.set(id, clip);
    this.snapshot.clip = clip;
    this.snapshot.clipMax = config.clip;
    this.snapshot.ammo = id === "pistol" ? 0 : this.arsenal.get(id) || 0;
    this.snapshot.reloading =
      this.reloadTotal > 0
        ? clamp(1 - this.reloadTimer / this.reloadTotal, 0.01, 1)
        : 0;
    this.snapshot.arsenal = SECONDARY_WEAPONS.filter(
      (weapon) => this.totalAmmo(weapon) > 0,
    );
    if (this.player?.models) {
      (Object.keys(this.player.models) as WeaponId[]).forEach((key) => {
        this.player.models![key].visible = key === id;
      });
      this.player.flash.position.z =
        id === "rifle"
          ? 1.0
          : id === "shotgun"
            ? 0.9
            : id === "smg"
              ? 0.66
              : 0.52;
    }
    this.host.dataset.weapon = id;
    this.host.dataset.clip = `${clip}/${config.clip}`;
    this.host.dataset.reserve =
      id === "pistol" ? "inf" : String(this.snapshot.ammo);
    this.host.dataset.reloading = this.reloadTimer > 0 ? "1" : "0";
    this.host.dataset.range = this.weaponRange().toFixed(2);
    this.host.dataset.arsenal = this.snapshot.arsenal
      .map(
        (weapon) =>
          `${weapon}:${this.clips.get(weapon) || 0}+${this.arsenal.get(weapon) || 0}`,
      )
      .join(",");
  }

  private startReload() {
    const id = this.snapshot.weapon;
    const config = WEAPONS[id];
    const clip = this.clips.get(id) ?? 0;
    if (clip >= config.clip) return false;
    if (id !== "pistol" && (this.arsenal.get(id) || 0) <= 0) return false;
    const frenzyFactor = this.snapshot.frenzyTime > 0 ? 0.55 : 1;
    const duration = Math.max(
      0.24,
      config.reload * this.fireRate * this.reloadSpeed * frenzyFactor,
    );
    this.reloadTotal = duration;
    this.reloadTimer = duration;
    this.audio.play("reload");
    this.syncWeapon();
    this.emit();
    return true;
  }

  reload() {
    if (this.state !== "playing" || this.reloadTimer > 0) return false;
    return this.startReload();
  }

  toggleWeapon() {
    if (this.state !== "playing") return;
    const order: WeaponId[] = [
      "pistol",
      ...SECONDARY_WEAPONS.filter((id) => this.totalAmmo(id) > 0),
    ];
    if (order.length < 2) {
      this.callbacks.onNotice(
        "LA PISTOLA NUNCA TE ABANDONA",
        "Encuentra un arma secundaria entre los botines.",
      );
      return;
    }
    this.reloadTimer = 0;
    this.reloadTotal = 0;
    const index = order.indexOf(this.snapshot.weapon);
    this.snapshot.weapon = order[(index + 1) % order.length];
    this.syncWeapon();
    const nextClip = this.clips.get(this.snapshot.weapon) || 0;
    if (nextClip <= 0) this.startReload();
    this.audio.play("pickup");
    this.emit();
  }

  knifeSlash() {
    if (this.state !== "playing" || this.knifeCooldown > 0) return false;
    this.knifeCooldown = this.knifeMax;
    this.slashTime = 0.46;
    this.slashCount++;
    this.host.dataset.slashes = String(this.slashCount);
    this.audio.play("knife");
    if (this.settings.shake) this.shake = Math.max(this.shake, 0.22);
    const origin = this.player.root.position;
    const hitDamage = Math.round(this.damage * 1.45 * this.knifeDamageMult);
    const curRoom = this.rooms.get(`${this.currentX},${this.currentZ}`);
    if (curRoom?.crate && !curRoom.crate.opened) {
      if (
        Math.hypot(curRoom.crate.x - origin.x, curRoom.crate.z - origin.z) < 4.2
      ) {
        this.openSupplyCrate(curRoom.crate);
      }
    }
    let pushed = 0;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.dying > 0) continue;
      const ep = enemy.actor.root.position;
      const dx = ep.x - origin.x;
      const dz = ep.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 4.0) continue;
      const ux =
        dist > 0.05 ? dx / dist : Math.sin(this.player.root.rotation.y);
      const uz =
        dist > 0.05 ? dz / dist : Math.cos(this.player.root.rotation.y);
      const pushDist = enemy.elite ? 2.1 : 3.6;
      for (let step = 0; step < 6; step++) {
        this.moveActor(
          enemy.actor.root,
          (ux * pushDist) / 6,
          (uz * pushDist) / 6,
          0.28,
          true,
        );
      }
      enemy.hit = Math.max(enemy.hit, 0.5);
      enemy.hp -= hitDamage;
      pushed++;
      this.spawnPopup(ep.x, 1.55, ep.z, `${hitDamage}!`, "crit");
      this.spawnParticles(
        this.tempVec.set(ep.x, 1.0, ep.z),
        "#fff0be",
        10,
        2.4,
      );
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
    this.spawnParticles(
      this.tempVec.set(origin.x, 0.95, origin.z),
      "#ffe3a4",
      14,
      2.6,
    );
    this.host.dataset.pushed = String(pushed);
    this.snapshot.knife = 0;
    this.snapshot.knifeCooldownLeft = Math.ceil(this.knifeCooldown);
    this.host.dataset.knifeCooldown = this.knifeCooldown.toFixed(1);
    this.emit();
    return true;
  }

  private spawnPopup(
    x: number,
    y: number,
    z: number,
    text: string,
    tone: "normal" | "crit" | "miss" | "reward" = "normal",
  ) {
    let slot = this.popups.find((p) => !p.active);
    if (!slot) slot = this.popups.reduce((a, b) => (a.life < b.life ? a : b));
    slot.active = true;
    slot.x = x + (Math.random() - 0.5) * 0.35;
    slot.y = y;
    slot.z = z + (Math.random() - 0.5) * 0.35;
    slot.max = tone === "reward" ? 1.15 : tone === "crit" ? 0.85 : 0.65;
    slot.life = slot.max;
    slot.el.textContent = text;
    slot.el.className = `fx-pop fx-${tone}`;
    slot.el.style.display = "block";
  }

  private grantXp(rawAmount: number) {
    if (this.state !== "playing") return;
    this.snapshot.xp += rawAmount * this.xpMultiplier;
    while (this.snapshot.xp >= this.snapshot.xpNext) {
      this.snapshot.xp -= this.snapshot.xpNext;
      this.snapshot.level++;
      this.snapshot.xpNext = Math.round(this.snapshot.xpNext * 1.32 + 28);
      this.snapshot.health = Math.min(
        this.snapshot.maxHealth,
        this.snapshot.health + 12,
      );
      const pool: DraftPerkId[] = [
        "caliber",
        "quickhands",
        "deadeye",
        "phantom",
        "bloodthirst",
        "razor",
      ];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      this.snapshot.draftChoices = pool.slice(0, 3);
      this.snapshot.draftTimer = 0;
      this.host.dataset.level = String(this.snapshot.level);
      this.audio.play("levelup");
      const p = this.player.root.position;
      this.spawnParticles(this.tempVec.set(p.x, 0.8, p.z), "#ffd97d", 26, 3.0);
      this.spawnPopup(
        p.x,
        2.15,
        p.z,
        `¡NIVEL ${this.snapshot.level}!`,
        "reward",
      );
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || enemy.dying > 0) continue;
        const ep = enemy.actor.root.position;
        const dx = ep.x - p.x;
        const dz = ep.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05 && d < 3.4) {
          this.moveActor(
            enemy.actor.root,
            (dx / d) * 1.3,
            (dz / d) * 1.3,
            0.28,
            true,
          );
          enemy.hit = Math.max(enemy.hit, 0.25);
        }
      }
      // Stop the whole simulation until a boon is selected. Held inputs are
      // intentionally preserved so firing/movement resume seamlessly.
      this.state = "levelup";
      this.host.dataset.levelup = "1";
      this.host.dataset.levelups = String(
        Number(this.host.dataset.levelups || 0) + 1,
      );
      this.emit();
      this.callbacks.onLevelUp([...this.snapshot.draftChoices]);
      break;
    }
  }

  private applyDraftPerk(index: number) {
    const choice = this.snapshot.draftChoices[index];
    if (!choice) return false;
    this.snapshot.draftChoices = [];
    this.snapshot.draftTimer = 0;
    if (choice === "caliber") {
      this.damage *= 1.18;
      this.knockBonus *= 1.15;
    } else if (choice === "quickhands") {
      this.reloadSpeed *= 0.84;
      this.fireRate = Math.max(0.55, this.fireRate * 0.9);
    } else if (choice === "deadeye") {
      this.critChance = Math.min(0.75, this.critChance + 0.12);
      this.accuracyBonus = Math.min(0.1, this.accuracyBonus + 0.03);
    } else if (choice === "phantom") {
      this.speed *= 1.09;
      this.dashMax = Math.max(1.0, this.dashMax * 0.88);
    } else if (choice === "bloodthirst") {
      this.snapshot.maxHealth += 15;
      this.snapshot.health = Math.min(
        this.snapshot.maxHealth,
        this.snapshot.health + 18,
      );
      this.lifesteal += 1;
    } else if (choice === "razor") {
      this.knifeDamageMult *= 1.35;
      this.knifeMax = Math.max(6, this.knifeMax - 2);
      this.knifeCooldown = Math.min(this.knifeCooldown, this.knifeMax);
    }
    const p = this.player.root.position;
    this.audio.play("upgrade");
    this.spawnParticles(this.tempVec.set(p.x, 1.0, p.z), "#ffcf7a", 18, 2.2);
    this.spawnPopup(
      p.x,
      2.0,
      p.z,
      DRAFT_PERKS[choice].name.toUpperCase(),
      "reward",
    );
    if (this.state === "levelup") {
      this.state = "playing";
      this.host.dataset.levelup = "0";
      this.callbacks.onLevelUp([]);
    }
    this.emit();
    return true;
  }

  chooseDraft(index: number) {
    if (this.state !== "playing" && this.state !== "levelup") return false;
    return this.applyDraftPerk(index);
  }

  private updateBounties() {
    const stages: {
      title: string;
      done: boolean;
      progress: string;
      reward: string;
      gold: number;
      embers: number;
    }[] = [
      {
        title: "CAZA INICIAL",
        done: this.snapshot.kills >= 8,
        progress: `${Math.min(8, this.snapshot.kills)} / 8 bajas`,
        reward: "+20 ORO · +1 BRASA",
        gold: 20,
        embers: 1,
      },
      {
        title: "SALTO AL CAOS",
        done: this.steps >= 1,
        progress: `${Math.min(1, this.steps)} / 1 bioma`,
        reward: "+25 ORO · +1 BRASA",
        gold: 25,
        embers: 1,
      },
      {
        title: "RACHA IMPLACABLE",
        done: this.snapshot.combo >= 3,
        progress: `×${this.snapshot.combo.toFixed(1)} / ×3.0`,
        reward: "+30 ORO · +1 BRASA",
        gold: 30,
        embers: 1,
      },
      {
        title: "CAZADOR DEL AVERNO",
        done: this.elitesKilled >= 1,
        progress: `${Math.min(1, this.elitesKilled)} / 1 bruto`,
        reward: "+45 ORO · +2 BRASAS",
        gold: 45,
        embers: 2,
      },
      {
        title: "VOLUNTAD DE HIERRO",
        done: this.snapshot.time >= 75,
        progress: `${Math.min(75, Math.floor(this.snapshot.time))}s / 75s`,
        reward: "+55 ORO · +2 BRASAS",
        gold: 55,
        embers: 2,
      },
    ];
    while (this.bountyStage < stages.length && stages[this.bountyStage].done) {
      const completed = stages[this.bountyStage];
      this.bountyStage++;
      this.snapshot.bountiesDone = this.bountyStage;
      this.addGold(completed.gold * this.snapshot.goldMultiplier);
      this.snapshot.bonusEmbers += completed.embers;
      this.snapshot.score += 110;
      this.host.dataset.bounties = String(this.bountyStage);
      this.audio.play("chest");
      const p = this.player.root.position;
      this.spawnPopup(
        p.x,
        2.25,
        p.z,
        `+${completed.embers} ${completed.embers === 1 ? "BRASA" : "BRASAS"}`,
        "reward",
      );
      this.callbacks.onNotice(
        `CONTRATO CUMPLIDO · ${completed.title}`,
        `${completed.reward} asegurados para tu legado.`,
      );
    }
    const current: BountyView | null =
      this.bountyStage < stages.length
        ? {
            title: stages[this.bountyStage].title,
            progress: stages[this.bountyStage].progress,
            reward: stages[this.bountyStage].reward,
          }
        : null;
    this.snapshot.activeBounty = current;
  }

  dash() {
    if (this.state !== "playing" || this.dashCooldown > 0) return;
    this.dashTime = 0.36;
    this.dashCooldown = this.dashMax;
    this.host.dataset.dashing = "1";
    this.host.dataset.dash = "0.00";
    const x = this.input.x;
    const y = this.input.y;
    if (Math.abs(x) + Math.abs(y) > 0.1)
      this.dashDirection.set((x + y) * 0.7071, (-x + y) * 0.7071).normalize();
    else
      this.dashDirection.set(
        Math.sin(this.player.root.rotation.y),
        Math.cos(this.player.root.rotation.y),
      );
    this.audio.play("dash");
    this.spawnParticles(this.player.root.position, "#c6d0a9", 8, 1.5);
  }

  interact() {
    if (this.state !== "playing") return;
    const context = this.getContext();
    if (context.type === "fire") {
      this.state = "paused";
      this.callbacks.onUpgrade();
    } else if (context.type === "crate" && context.crate) {
      this.openSupplyCrate(context.crate);
    } else if (context.type === "survivor" && context.companion) {
      context.companion.recruited = true;
      this.spawnParticles(
        context.companion.actor.root.position,
        "#f8d78c",
        22,
        2,
      );
      this.audio.play("upgrade");
      this.callbacks.onNotice(
        "NUNCA MÁS A SOLAS",
        "Tu compañero te cubre y busca recursos.",
      );
      this.emit();
    }
  }

  buyUpgrade(id: UpgradeId) {
    const upgrade = RUN_UPGRADES.find((u) => u.id === id)!;
    if (this.state !== "paused" || this.snapshot.purchased.includes(id))
      return false;
    if (this.snapshot.gold < upgrade.cost) return false;
    this.snapshot.gold -= upgrade.cost;
    this.snapshot.purchased.push(id);
    if (id === "damage") this.damage *= 1.25;
    if (id === "multishot") this.multishot++;
    if (id === "health") {
      this.snapshot.maxHealth += 25;
      this.snapshot.health = this.snapshot.maxHealth;
    }
    if (id === "speed") this.speed *= 1.15;
    if (id === "lifesteal") this.lifesteal += 3;
    if (id === "armor") this.armor *= 0.8;
    if (id === "companion")
      this.companions
        .filter((c) => c.recruited)
        .forEach((c) => {
          c.maxHp += 25;
          c.hp = c.maxHp;
        });
    if (id === "firerate") this.fireRate = Math.max(0.68, this.fireRate * 0.85);
    if (id === "magnet") this.magnet *= 1.5;
    if (id === "blast") this.blast += 1;
    if (id === "regen") this.regen += 1.5;
    if (id === "luck") this.luck += 1;
    if (id === "crit") this.critChance = Math.min(0.85, this.critChance + 0.1);
    if (id === "shield") {
      this.snapshot.shieldMax = 25;
      this.snapshot.shieldTime = 25;
    }
    if (id === "reserve") {
      this.clips.set("shotgun", WEAPONS.shotgun.clip);
      this.arsenal.set("shotgun", (this.arsenal.get("shotgun") || 0) + 24);
      this.snapshot.weapon = "shotgun";
      this.syncWeapon();
    }
    if (id === "knife") {
      this.knifeDamageMult *= 1.3;
      this.knifeMax = Math.max(6, this.knifeMax - 3);
    }
    if (id === "accuracy")
      this.accuracyBonus = Math.min(0.22, this.accuracyBonus + 0.06);
    if (id === "fortune") {
      this.goldBase += 0.25;
      this.luck += 2;
    }
    this.audio.play("upgrade");
    this.spawnParticles(this.player.root.position, "#ffcf7a", 24, 2);
    this.emit();
    return true;
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.renderer.setSize(width, height);
    const aspect = width / Math.max(height, 1);
    const size =
      this.state === "menu" ? (aspect < 0.8 ? 27 : 23) : aspect < 0.8 ? 23 : 20;
    this.camera.left = (-size * aspect) / 2;
    this.camera.right = (size * aspect) / 2;
    this.camera.top = size / 2;
    this.camera.bottom = -size / 2;
    this.camera.updateProjectionMatrix();
  }

  private frame = (time: number) => {
    if (this.disposed) return;
    const rawDelta = (time - (this.lastTime || time)) / 1000;
    let delta = Math.min(rawDelta, 0.25);
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - rawDelta);
      delta *= 0.2;
    }
    this.lastTime = time;
    this.visualTime += delta;
    // Fixed substeps keep collisions and aiming consistent on slower displays.
    let remaining = delta;
    while (this.state === "playing" && remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      this.update(step);
      remaining -= step;
    }
    this.updateVisuals(delta);
    this.renderer.render(this.scene, this.camera);
    this.diagnosticsTimer += rawDelta;
    this.diagnosticsFrames++;
    if (this.diagnosticsTimer >= 2) {
      const fps = this.diagnosticsFrames / this.diagnosticsTimer;
      this.host.dataset.fps = String(Math.round(fps));
      this.host.dataset.drawCalls = String(this.renderer.info.render.calls);
      this.host.dataset.triangles = String(this.renderer.info.render.triangles);
      this.host.dataset.geometries = String(
        this.renderer.info.memory.geometries,
      );
      this.host.dataset.player = `${this.player.root.position.x.toFixed(1)},${this.player.root.position.z.toFixed(1)}`;
      this.host.dataset.dying = String(this.dying.length);
      if (fps < 35 && this.state === "playing" && this.adaptiveSteps < 3) {
        this.adaptiveSteps++;
        const minimum = this.settings.quality === "high" ? 0.8 : 0.5;
        this.renderer.setPixelRatio(
          Math.max(minimum, this.renderer.getPixelRatio() * 0.8),
        );
        if (fps < 22) this.renderer.shadowMap.enabled = false;
        this.resize();
      }
      this.diagnosticsFrames = 0;
      this.diagnosticsTimer = 0;
    }
    this.animation = requestAnimationFrame(this.frame);
  };

  private readGamepad() {
    const gamepad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    this.gamepadAttack = this.gamepadInteract = false;
    if (!gamepad) return null;
    const buttons = gamepad.buttons;
    const confirm = buttons[0]?.pressed || false;
    if (confirm && !this.gamepadConfirm) {
      if (this.state === "menu" || this.state === "over")
        this.callbacks.onStart();
      else if (this.state === "paused") this.callbacks.onPause();
      else if (this.state === "levelup") this.chooseDraft(0);
    }
    this.gamepadConfirm = confirm;
    const pause = buttons[9]?.pressed || false;
    if (pause && !this.gamepadButtons.pause) this.callbacks.onPause();
    this.gamepadButtons.pause = pause;
    if (this.state !== "playing") return null;
    this.gamepadAttack = buttons[0]?.pressed || buttons[7]?.pressed || false;
    this.gamepadInteract = buttons[1]?.pressed || false;
    const swap = buttons[2]?.pressed || false;
    const reload = buttons[3]?.pressed || false;
    const dash = buttons[4]?.pressed || false;
    const knife = buttons[5]?.pressed || false;
    if (swap && !this.gamepadButtons.swap) this.toggleWeapon();
    if (reload && !this.gamepadButtons.reload) this.reload();
    if (this.gamepadInteract && !this.gamepadButtons.interact) this.interact();
    if (dash && !this.gamepadButtons.dash) this.dash();
    if (knife && !this.gamepadButtons.knife) this.knifeSlash();
    this.gamepadButtons = {
      pause,
      swap,
      interact: this.gamepadInteract,
      dash,
      reload,
      knife,
    };
    const x =
      (gamepad.axes[0] || 0) +
      (buttons[15]?.pressed ? 1 : 0) -
      (buttons[14]?.pressed ? 1 : 0);
    const y =
      (gamepad.axes[1] || 0) +
      (buttons[13]?.pressed ? 1 : 0) -
      (buttons[12]?.pressed ? 1 : 0);
    return { x: Math.abs(x) > 0.17 ? x : 0, y: Math.abs(y) > 0.17 ? y : 0 };
  }
  private currentEnemyPower() {
    const minutes = this.snapshot.time / 60;
    const waveFactor = Math.pow(1.15, Math.max(0, this.snapshot.wave - 1));
    return (
      (1 + this.snapshot.time * 0.018 + Math.pow(minutes, 1.8) * 0.9) *
      waveFactor
    );
  }

  private update(dt: number) {
    this.playerFace = null;
    this.snapshot.time += dt;
    this.snapshot.goldBoostTime = Math.max(0, this.snapshot.goldBoostTime - dt);
    this.snapshot.frenzyTime = Math.max(0, this.snapshot.frenzyTime - dt);
    this.snapshot.goldMultiplier =
      this.snapshot.goldBoostTime > 0 ? this.goldBase * 2 : this.goldBase;
    const nextWave = 1 + Math.floor(this.snapshot.time / 25);
    if (nextWave > this.snapshot.wave) {
      this.snapshot.wave = nextWave;
      this.applyWaveModifier(nextWave);
      const surge = Math.min(8, 1 + nextWave);
      for (let i = 0; i < surge; i++) {
        if (this.enemies.length < (this.mobile ? 46 : 68)) this.spawnEnemy();
      }
      this.callbacks.onNotice(
        `OLEADA ${String(nextWave).padStart(2, "0")} · ${this.snapshot.modifier}`,
        this.waveHint,
      );
      this.audio.play("wave");
      if (this.settings.shake) this.shake = Math.max(this.shake, 0.2);
    }
    const power = this.currentEnemyPower();
    this.snapshot.enemyPower = Math.round(power * 10) / 10;
    this.host.dataset.enemyPower = power.toFixed(2);
    const room = this.rooms.get(`${this.currentX},${this.currentZ}`)!;
    if (room.biome !== this.dwellBiome) {
      // A new biome wipes the horde's accumulated interest in you.
      this.dwell = 0;
      this.dwellBiome = room.biome;
      this.spawnTimer = Math.min(this.spawnTimer, 0.5);
    }
    if (room.biome !== -1) this.dwell += dt;
    const pressure = room.biome === -1 ? 1 : 1 + Math.min(1.6, this.dwell / 45);
    this.snapshot.pressure = Math.round(pressure * 10) / 10;
    this.host.dataset.dwell = this.dwell.toFixed(1);
    this.host.dataset.pressure = this.snapshot.pressure.toFixed(2);
    this.audio.setMood(
      Math.min(
        1,
        (this.snapshot.darkness / 100) * 0.75 +
          (this.snapshot.pressure - 1) * 0.35,
      ),
      room.biome,
    );
    if (this.snapshot.health < this.snapshot.maxHealth * 0.32) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 0.95;
        this.audio.play("heart");
      }
    }
    this.snapshot.darkness = Math.min(
      95,
      18 +
        this.snapshot.time * 0.28 +
        (room.biome === 4 ? 16 : room.biome === -1 ? 0 : 9),
    );
    this.shotCooldown -= dt;
    this.hurtCooldown -= dt;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    const wasDashing = this.dashTime > 0;
    this.dashTime = Math.max(0, this.dashTime - dt);
    if (wasDashing && this.dashTime === 0) {
      this.landing = 0.22;
      this.velocity.copy(this.dashDirection).multiplyScalar(1.35);
      this.spawnParticles(
        this.tempVec.set(
          this.player.root.position.x,
          0.18,
          this.player.root.position.z,
        ),
        "#c3cdb0",
        9,
        1.1,
      );
    }
    this.landing = Math.max(0, this.landing - dt);
    this.knifeCooldown = Math.max(0, this.knifeCooldown - dt);
    this.slashTime = Math.max(0, this.slashTime - dt);
    this.muzzleGlow = Math.max(0, this.muzzleGlow - dt * 11);
    this.snapshot.shieldTime = Math.max(0, this.snapshot.shieldTime - dt);
    this.host.dataset.shield = this.snapshot.shieldTime > 0 ? "1" : "0";

    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) {
        const id = this.snapshot.weapon;
        const config = WEAPONS[id];
        const current = this.clips.get(id) || 0;
        const needed = Math.max(0, config.clip - current);
        if (id === "pistol") {
          this.clips.set("pistol", config.clip);
        } else {
          const reserve = this.arsenal.get(id) || 0;
          const load = Math.min(needed, reserve);
          this.clips.set(id, current + load);
          this.arsenal.set(id, reserve - load);
        }
        this.reloadTotal = 0;
        this.audio.play("reloadDone");
        this.syncWeapon();
      }
    }

    const gamepad = this.readGamepad();
    const manualFire = this.input.attack || this.gamepadAttack;
    let ix = gamepad && (gamepad.x || gamepad.y) ? gamepad.x : this.input.x;
    let iy = gamepad && (gamepad.x || gamepad.y) ? gamepad.y : this.input.y;
    const magnitude = Math.hypot(ix, iy);
    if (magnitude > 1) {
      ix /= magnitude;
      iy /= magnitude;
    }
    const desiredX = (ix + iy) * 0.7071;
    const desiredZ = (-ix + iy) * 0.7071;
    const desiredMag = Math.hypot(desiredX, desiredZ);
    this.move.set(desiredX, 0, desiredZ);
    const movingInput = desiredMag > 0.02 && this.dashTime <= 0;
    // Holding SPACE / manual fire lets the survivor walk slowly in aiming stance,
    // keeping 90% precision at the cost of mobility; running freely drops to 75%.
    const slowAimWalk = manualFire && movingInput;
    const moveScale = this.dashTime > 0 ? 1 : slowAimWalk ? 0.46 : 1;
    const accuracy = clamp(
      (!movingInput || slowAimWalk ? 0.9 : 0.75) + this.accuracyBonus,
      0.5,
      0.99,
    );
    this.snapshot.accuracy = Math.round(accuracy * 100);
    this.host.dataset.accuracy = String(this.snapshot.accuracy);
    this.host.dataset.moveScale = moveScale.toFixed(2);

    // Weighted acceleration: the survivor eases into a run instead of snapping.
    const accel = movingInput ? 12 : 17;
    this.velocity.x += (desiredX - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.y += (desiredZ - this.velocity.y) * Math.min(1, accel * dt);
    if (!movingInput && this.velocity.lengthSq() < 0.0025)
      this.velocity.set(0, 0);

    if (this.dashTime > 0) {
      const p = clamp(1 - this.dashTime / 0.36, 0, 1);
      const surge = (1 - p * 0.55) * 2.85;
      this.move.set(
        this.dashDirection.x * surge,
        0,
        this.dashDirection.y * surge,
      );
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = 0.055;
        this.spawnParticles(
          this.tempVec.set(
            this.player.root.position.x,
            0.35 + Math.random() * 0.5,
            this.player.root.position.z,
          ),
          "#c8d2b3",
          2,
          0.6,
        );
      }
    }
    const vx = this.dashTime > 0 ? this.move.x : this.velocity.x;
    const vz = this.dashTime > 0 ? this.move.z : this.velocity.y;
    const planarSpeed = Math.hypot(vx, vz);
    if (planarSpeed > 0.02) {
      this.moveActor(
        this.player.root,
        vx * this.speed * moveScale * dt,
        vz * this.speed * moveScale * dt,
        0.38,
      );
      this.playerFace = {
        yaw: Math.atan2(vx, vz),
        snap: false,
      };
    }
    if (planarSpeed > 0.3 && this.dashTime <= 0) {
      this.footstep += planarSpeed * this.speed * moveScale * dt;
      if (this.footstep > 0.85) {
        this.footstep = 0;
        this.spawnParticles(
          this.tempVec.set(
            this.player.root.position.x,
            0.16,
            this.player.root.position.z,
          ),
          "#8d9884",
          2,
          0.45,
        );
        if (Math.random() < 0.6) this.audio.play("step");
      }
    }
    if (manualFire) {
      this.player.aimHold = Math.max(this.player.aimHold, 0.22);
      const lookRange = this.weaponRange() * 1.35;
      let nearest: Enemy | null = null;
      let bestDist = lookRange * lookRange;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const d = e.actor.root.position.distanceToSquared(
          this.player.root.position,
        );
        if (d < bestDist) {
          bestDist = d;
          nearest = e;
        }
      }
      if (nearest) {
        const to = nearest.actor.root.position;
        const from = this.player.root.position;
        this.playerFace = {
          yaw: Math.atan2(to.x - from.x, to.z - from.z),
          snap: true,
        };
      }
    }
    if (this.move.lengthSq() > 0.001) {
      const yaw = this.playerFace
        ? this.playerFace.yaw
        : this.player.root.rotation.y;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const ml = Math.max(0.001, Math.hypot(this.move.x, this.move.z));
      const mx = this.move.x / ml;
      const mz = this.move.z / ml;
      const forwardDot = mx * fx + mz * fz;
      const sideDot = mx * fz - mz * fx;
      this.player.strideSign = forwardDot < -0.25 ? -1 : 1;
      this.player.strafeBank +=
        (-sideDot * 0.14 - this.player.strafeBank) * (1 - Math.exp(-12 * dt));
    } else {
      this.player.strideSign = 1;
      this.player.strafeBank *= Math.exp(-10 * dt);
    }
    this.animateActor(
      this.player,
      dt,
      this.move.length() * this.speed * moveScale,
    );
    this.transitionRoom();

    if (
      this.shotCooldown <= 0 &&
      this.reloadTimer <= 0 &&
      (this.settings.autoFire || manualFire)
    ) {
      const id = this.snapshot.weapon;
      const config = this.weapon();
      const currentClip = this.clips.get(id) ?? config.clip;
      if (currentClip <= 0) {
        if (id === "pistol" || (this.arsenal.get(id) || 0) > 0) {
          this.startReload();
        } else {
          this.snapshot.weapon = "pistol";
          this.syncWeapon();
          if ((this.clips.get("pistol") || 0) <= 0) this.startReload();
        }
      } else {
        const range = this.weaponRange();
        const targets = this.enemies
          .filter(
            (e) =>
              e.hp > 0 &&
              e.actor.root.position.distanceToSquared(
                this.player.root.position,
              ) <
                range * range,
          )
          .sort(
            (a, b) =>
              a.actor.root.position.distanceToSquared(
                this.player.root.position,
              ) -
              b.actor.root.position.distanceToSquared(
                this.player.root.position,
              ),
          );
        if (targets.length) {
          this.shoot(
            this.player,
            targets[0],
            this.damage * config.damage,
            id,
            false,
            accuracy,
          );
          const extra = Math.max(this.multishot + config.targets - 1, 0);
          for (let i = 1; i <= extra; i++) {
            if (targets[i])
              this.shoot(
                this.player,
                targets[i],
                this.damage * config.damage * (i < config.targets ? 0.8 : 0.7),
                id,
                true,
                accuracy,
              );
          }
          const frenzyMul = this.snapshot.frenzyTime > 0 ? 0.65 : 1;
          this.shotCooldown = config.cooldown * this.fireRate * frenzyMul;
          const nextClip = currentClip - 1;
          this.clips.set(id, Math.max(0, nextClip));
          if (nextClip <= 0) {
            if (id === "pistol" || (this.arsenal.get(id) || 0) > 0) {
              this.startReload();
            } else {
              this.snapshot.weapon = "pistol";
              this.callbacks.onNotice(
                "SIEMPRE QUEDA LA PISTOLA",
                "Munición secundaria agotada. Busca otro botín.",
              );
              if ((this.clips.get("pistol") || 0) <= 0)
                this.clips.set("pistol", WEAPONS.pistol.clip);
            }
          }
          this.syncWeapon();
        }
      }
    }
    const face = this.playerFace;
    this.face(
      this.player,
      face ? face.yaw : this.player.root.rotation.y,
      face ? face.snap : false,
      dt,
      face ? (face.snap ? 17 : 10) : 1,
    );
    this.updateDying(dt);
    if (this.regen > 0) {
      this.snapshot.health = Math.min(
        this.snapshot.maxHealth,
        this.snapshot.health + this.regen * dt,
      );
    }
    this.healthTimer = Math.max(0, this.healthTimer - dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      // Relentless escalation: horde budget and spawn rate climb with time,
      // wave number, and biome dwell pressure until they overwhelm the unprepared.
      const baseBudget =
        9 +
        this.snapshot.time * 0.28 +
        Math.max(0, this.snapshot.wave - 1) * 2.5;
      const budget = Math.min(
        this.mobile ? 44 : 64,
        baseBudget * this.snapshot.pressure,
      );
      const rate = Math.min(
        3.5,
        (0.52 +
          this.snapshot.time * 0.011 +
          Math.max(0, this.snapshot.wave - 1) * 0.22) *
          this.snapshot.pressure,
      );
      this.spawnTimer = 1 / rate;
      if (this.enemies.length < budget) this.spawnEnemy();
      this.host.dataset.population = String(Math.round(budget));
      this.host.dataset.enemies = String(this.enemies.length);
    }
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0) {
      this.eliteTimer = 38 + Math.random() * 16;
      this.spawnEnemy(false, 0, true);
      this.host.dataset.elites = String(
        Number(this.host.dataset.elites || 0) + 1,
      );
      this.callbacks.onNotice(
        "ALGO GRANDE SE ACERCA",
        "Un bruto mutante cruza la oscuridad.",
      );
      this.audio.play("hurt");
    }
    this.updateEnemies(dt);
    this.updateCompanions(dt);
    this.updateDrops(dt);
    if (this.snapshot.time - this.lastKill > 3.6) this.snapshot.combo = 1;
    const context = this.getContext();
    this.snapshot.context = context.type;
    this.snapshot.contextProgress = context.rubble?.progress || 0;
    if (
      context.type === "rubble" &&
      context.rubble &&
      (this.input.interact || this.gamepadInteract)
    ) {
      context.rubble.progress = Math.min(1, context.rubble.progress + dt / 2.2);
      if (context.rubble.progress >= 1) {
        context.rubble.cleared = true;
        context.rubble.mesh.visible = false;
        this.spawnParticles(
          new THREE.Vector3(context.rubble.x, 0.5, context.rubble.z),
          "#a0a08a",
          25,
          3,
        );
        this.audio.play("kill");
        this.snapshot.score += 75;
        this.addGold(10);
        this.grantXp(28);
        this.callbacks.onNotice(
          "CAMINO DESPEJADO",
          "+75 puntos · La noche continúa.",
        );
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    this.updateBounties();
    this.snapshot.hurt = this.hurtCooldown > 0.43;
    this.snapshot.dash = 1 - this.dashCooldown / this.dashMax;
    this.snapshot.knife = 1 - this.knifeCooldown / this.knifeMax;
    this.snapshot.knifeCooldownLeft = Math.ceil(this.knifeCooldown);
    this.host.dataset.knifeCooldown = this.knifeCooldown.toFixed(1);
    this.uiTimer += dt;
    if (this.uiTimer > 0.1) {
      this.uiTimer = 0;
      const p = this.player.root.position;
      this.host.dataset.player = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
      this.host.dataset.dash = this.snapshot.dash.toFixed(2);
      this.host.dataset.gold = String(Math.floor(this.snapshot.gold));
      this.host.dataset.allyEfficiency = String(ALLY_EFFICIENCY);
      this.host.dataset.allyHeal = String(Math.round(40 * ALLY_EFFICIENCY));
      this.host.dataset.allyDamage = String(Math.floor(this.allyDamageTotal));
      let tiny = 0;
      let total = 0;
      this.rooms.forEach((room) => {
        room.colliders.forEach((collider) => {
          total++;
          if (Math.min(collider.w, collider.d) * 2 < MIN_COLLIDER) tiny++;
        });
      });
      this.host.dataset.tinyColliders = String(tiny);
      this.host.dataset.totalColliders = String(total);
      this.minRigY = Math.min(this.minRigY, this.player.rig.position.y);
      this.host.dataset.minRigY = this.minRigY.toFixed(3);
      this.host.dataset.dashing = this.dashTime > 0 ? "1" : "0";
      this.emit();
    }
    if (this.snapshot.health <= 0) {
      this.snapshot.health = 0;
      this.state = "over";
      this.spawnParticles(this.player.root.position, "#e8ad6c", 40, 3);
      this.shake = 0.6;
      this.emit();
      this.callbacks.onGameOver(this.copySnapshot());
    }
  }
  private face(
    actor: Actor,
    desired: number,
    snapGun: boolean,
    dt: number,
    speed: number,
  ) {
    const wrap = (value: number) =>
      ((((value + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    actor.root.rotation.y +=
      wrap(desired - actor.root.rotation.y) * (1 - Math.exp(-speed * dt));
    const targetGun = snapGun ? wrap(desired - actor.root.rotation.y) : 0;
    actor.gun.rotation.y +=
      (targetGun - actor.gun.rotation.y) *
      (1 - Math.exp(-(snapGun ? 30 : 12) * dt));
  }

  private animateActor(actor: Actor, dt: number, speed: number) {
    const targetMove = Math.min(1, speed / 4.2);
    // Smooth physical momentum on movement transitions (no sudden snaps)
    actor.moveBlend +=
      (targetMove - actor.moveBlend) * (1 - Math.exp(-7.5 * dt));
    const m = actor.moveBlend;
    const dir = actor.infected ? 1 : actor.strideSign;
    // Natural, rhythmic gait cadence (8 rad/s at full run instead of violent 18 rad/s)
    const strideFreq = actor.infected
      ? speed > 0.08
        ? 3.2 + speed * 0.45
        : 1.4
      : speed > 0.08
        ? 3.6 + speed * 0.65
        : 1.5;
    actor.phase += dt * dir * strideFreq;
    const sL = Math.sin(actor.phase);
    const sR = -sL;

    if (actor.infected) {
      actor.attackAnim = Math.max(0, actor.attackAnim - dt * 3.4);
      actor.bodyKick = Math.max(0, actor.bodyKick - dt * 9);
      const atk = actor.attackAnim;
      const slashArc = atk > 0 ? Math.sin((1 - atk) * Math.PI) : 0;
      // Staggered zombie shamble with forward hunch and claw reaching
      actor.leftLeg.rotation.x = sL * 0.52 * m;
      actor.rightLeg.rotation.x = sR * 0.62 * m;
      const liftL = Math.max(0, sL);
      const liftR = Math.max(0, sR);
      actor.leftLeg.position.y = 0.45 + liftL * liftL * 0.065 * m;
      actor.rightLeg.position.y = 0.45 + liftR * liftR * 0.075 * m;
      actor.rig.position.y =
        (Math.cos(actor.phase * 2) * 0.5 + 0.5) * 0.035 * m +
        Math.sin(actor.phase) * 0.015 * (1 - m);
      actor.rig.rotation.x = 0.18 * m + slashArc * 0.32 - actor.bodyKick * 0.28;
      actor.rig.rotation.z = Math.sin(actor.phase) * 0.06 * m;
      if (actor.leftArm && actor.rightArm) {
        const reach = -1.12 - 0.16 * m;
        const swipe =
          atk > 0.55
            ? -0.9 * ((atk - 0.55) / 0.45)
            : atk > 0
              ? 0.95 * (1 - atk / 0.55)
              : 0;
        actor.leftArm.rotation.set(reach + sL * 0.22 * m + swipe, 0.14, -0.08);
        actor.rightArm.rotation.set(
          reach - sL * 0.22 * m + swipe * 1.08,
          -0.14,
          0.08,
        );
      }
      if (actor.tail) {
        actor.tail.rotation.y = Math.sin(actor.phase * 0.9) * 0.25;
      }
      actor.flash.visible = false;
      return;
    }

    // Survivor athletic gait: smooth sinusoidal stride with knee & foot lift
    actor.leftLeg.rotation.x = sL * 0.58 * m;
    actor.rightLeg.rotation.x = sR * 0.58 * m;
    const liftL = Math.max(0, sL);
    const liftR = Math.max(0, sR);
    actor.leftLeg.position.y = 0.45 + liftL * liftL * 0.082 * m;
    actor.rightLeg.position.y = 0.45 + liftR * liftR * 0.082 * m;

    actor.aimHold = Math.max(0, actor.aimHold - dt);
    const isPlayer = actor === this.player;
    const dashRoll =
      isPlayer && this.dashTime > 0 ? clamp(1 - this.dashTime / 0.36, 0, 1) : 0;
    const reloading =
      isPlayer && this.reloadTotal > 0
        ? clamp(1 - this.reloadTimer / this.reloadTotal, 0, 1)
        : 0;
    const slashing =
      isPlayer && this.slashTime > 0
        ? clamp(1 - this.slashTime / 0.46, 0, 1)
        : 0;
    const wantAim =
      actor.aimHold > 0 && reloading === 0 && dashRoll === 0 ? 1 : 0;
    actor.aimBlend +=
      (wantAim - actor.aimBlend) * (1 - Math.exp(-(wantAim ? 15 : 7.0) * dt));
    const aim = actor.aimBlend;
    const weapon: WeaponId = isPlayer ? this.snapshot.weapon : "pistol";
    const longGun = weapon !== "pistol";

    // Recoil springs with natural damped settling
    actor.gunKick = Math.max(
      0,
      actor.gunKick - dt * (6.5 + actor.gunKick * 5.5),
    );
    actor.gunRise = Math.max(
      0,
      actor.gunRise - dt * (7.2 + actor.gunRise * 4.8),
    );
    actor.gunRoll *= Math.exp(-14 * dt);
    actor.bodyKick = Math.max(0, actor.bodyKick - dt * 8.0);
    actor.flashTime = Math.max(0, actor.flashTime - dt);

    // Continuous hip bounce (C1 smooth, no cusps)
    const stepBounce =
      (Math.cos(actor.phase * 2) * 0.5 + 0.5) * 0.034 * m * (1 - aim * 0.4) +
      Math.sin(actor.phase) * 0.015 * (1 - m);

    // Multi-phase martial slash torso twist
    let slashTwist = 0;
    if (slashing > 0) {
      if (slashing < 0.28) {
        slashTwist = (slashing / 0.28) * 0.42;
      } else if (slashing < 0.7) {
        const s = (slashing - 0.28) / 0.42;
        slashTwist = 0.42 - Math.sin(s * Math.PI) * 1.25;
      } else {
        const r = (slashing - 0.7) / 0.3;
        slashTwist = (1 - r) * -0.22;
      }
    }

    const breathing = Math.sin(actor.phase * 0.55) * 0.013 * (1 - m);
    const landSquash = isPlayer ? clamp(this.landing / 0.22, 0, 1) : 0;
    // Combat slide: the torso pitches and tucks, but the rig origin is never
    // pushed below the floor, so the survivor cannot sink through the ground.
    const tuck = dashRoll > 0 ? Math.sin(dashRoll * Math.PI) : 0;
    actor.rig.position.y = Math.max(
      0,
      stepBounce + breathing + tuck * 0.05 - landSquash * 0.04,
    );
    if (isPlayer) {
      actor.rig.scale.set(
        1 + tuck * 0.06 + landSquash * 0.1,
        Math.max(0.72, 1 - tuck * 0.14 - landSquash * 0.16),
        1 + tuck * 0.06 + landSquash * 0.1,
      );
    }
    actor.rig.rotation.x =
      (dashRoll > 0
        ? tuck * 1.2
        : m * (1 - aim * 0.7) * 0.13 * actor.strideSign) -
      actor.bodyKick * 0.16 +
      landSquash * 0.2;
    actor.rig.rotation.z = sL * 0.038 * m * (1 - aim * 0.5) + actor.strafeBank;
    const bladeStance = longGun ? -0.26 * aim : -0.1 * aim;
    actor.rig.rotation.y =
      bladeStance + slashTwist + sL * 0.045 * m * (1 - aim);
    if (actor.tail) {
      actor.tail.rotation.y =
        Math.sin(actor.phase * (m > 0.1 ? 0.9 : 0.6)) * (0.12 + m * 0.18);
      actor.tail.rotation.x =
        -0.1 * aim + Math.cos(actor.phase * 0.8) * 0.05 * m;
    }

    if (dashRoll > 0) {
      // Knees tuck up and the weapon is pulled in: a grounded dodge, not a dive.
      actor.leftLeg.rotation.x = -tuck * 0.95;
      actor.rightLeg.rotation.x = -tuck * 0.7;
      actor.leftLeg.position.y = 0.45 + tuck * 0.06;
      actor.rightLeg.position.y = 0.45 + tuck * 0.04;
      if (actor.leftArm && actor.rightArm) {
        actor.leftArm.rotation.set(-1.45 + tuck * 0.35, 0.42, -0.24);
        actor.rightArm.rotation.set(-1.45 + tuck * 0.35, -0.42, 0.24);
      }
      actor.gun.position.set(0.14, 0.94, 0.24);
      actor.gun.rotation.set(0.5, 0, 0.28);
      actor.flash.visible = false;
      return;
    }

    // Weapon posture: low patrol carry <-> shouldered / Weaver firing stance
    const gx = longGun
      ? THREE.MathUtils.lerp(0.2, 0.24, aim)
      : THREE.MathUtils.lerp(0.31, 0.17, aim);
    const gy =
      (longGun
        ? THREE.MathUtils.lerp(0.91, 1.01, aim)
        : THREE.MathUtils.lerp(0.89, 1.03, aim)) +
      stepBounce * 0.6 +
      (reloading > 0 ? 0.09 : 0);
    const gz =
      (longGun
        ? THREE.MathUtils.lerp(0.31, 0.39, aim)
        : THREE.MathUtils.lerp(0.33, 0.48, aim)) -
      actor.gunKick * 0.22;
    actor.gun.position.set(gx, gy, gz);

    const patrolDip = (longGun ? 0.22 : 0.28) * (1 - aim);
    const reloadTiltX =
      reloading > 0 ? 0.42 + Math.sin(reloading * Math.PI * 2) * 0.2 : 0;
    const reloadTiltZ = reloading > 0 ? 0.66 : 0;
    actor.gun.rotation.x = patrolDip - actor.gunRise * 0.48 + reloadTiltX;
    actor.gun.rotation.z =
      (longGun ? 0.2 * (1 - aim) : 0) + actor.gunRoll + reloadTiltZ;

    // Articulated arms follow stance, recoil, reload, and knife slash
    if (actor.leftArm && actor.rightArm) {
      const armSwing = sL * 0.55 * m * (1 - aim);
      if (slashing > 0) {
        if (slashing < 0.28) {
          const w = slashing / 0.28;
          actor.leftArm.rotation.set(-1.18 - w * 0.28, 0.85 + w * 0.42, 0.12);
        } else if (slashing < 0.7) {
          const s = (slashing - 0.28) / 0.42;
          actor.leftArm.rotation.set(-1.48, 1.38 - s * 2.85, -0.22);
        } else {
          const r = (slashing - 0.7) / 0.3;
          actor.leftArm.rotation.set(
            THREE.MathUtils.lerp(-1.48, -0.35, r),
            THREE.MathUtils.lerp(-1.47, 0.08, r),
            0,
          );
        }
      } else if (reloading > 0) {
        actor.leftArm.rotation.set(
          -1.42 + Math.sin(reloading * Math.PI * 2) * 0.45,
          0.68,
          0.18,
        );
      } else {
        actor.leftArm.rotation.set(
          THREE.MathUtils.lerp(
            armSwing - 0.35 * (longGun ? 1 : 0),
            (longGun ? -1.38 : -1.26) - actor.gunRise * 0.3,
            aim,
          ),
          THREE.MathUtils.lerp(
            longGun ? 0.38 : 0.08,
            longGun ? 0.58 : 0.52,
            aim,
          ),
          0,
        );
      }
      actor.rightArm.rotation.set(
        THREE.MathUtils.lerp(
          -armSwing - 0.35,
          (longGun ? -1.08 : -1.36) - actor.gunRise * 0.36,
          reloading > 0 ? 0.85 : aim,
        ),
        THREE.MathUtils.lerp(-0.08, longGun ? -0.18 : -0.15, aim),
        reloading > 0 ? 0.25 : 0,
      );
    }

    if (actor.knife) {
      if (slashing > 0) {
        actor.knife.visible = true;
        if (slashing < 0.28) {
          const w = slashing / 0.28;
          actor.knife.rotation.set(0.12, 1.15 + w * 0.45, -0.1);
        } else if (slashing < 0.7) {
          const s = (slashing - 0.28) / 0.42;
          actor.knife.rotation.set(0.08, 1.6 - s * 3.3, -0.14);
        } else {
          const r = (slashing - 0.7) / 0.3;
          actor.knife.rotation.set(0.08, -1.7 + r * 0.5, -0.14);
        }
      } else {
        actor.knife.visible = false;
      }
    }
    actor.flash.visible = actor.flashTime > 0;
  }

  private moveActor(
    root: THREE.Group,
    dx: number,
    dz: number,
    radius: number,
    collide = true,
  ) {
    const position = root.position;
    const oldX = position.x;
    const oldZ = position.z;
    position.x += dx;
    if (collide && this.collides(position.x, position.z, radius))
      position.x = oldX;
    position.z += dz;
    if (collide && this.collides(position.x, position.z, radius))
      position.z = oldZ;
  }

  /** Teleports an actor out of solid geometry by searching the closest gap. */
  private unstick(root: THREE.Group, radius: number) {
    const position = root.position;
    if (!this.collides(position.x, position.z, radius)) return;
    for (let ring = 1; ring <= 10; ring++) {
      const distance = ring * 0.32;
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * TAU;
        const x = position.x + Math.cos(angle) * distance;
        const z = position.z + Math.sin(angle) * distance;
        if (!this.collides(x, z, radius)) {
          position.set(x, position.y, z);
          return;
        }
      }
    }
  }

  private collides(x: number, z: number, radius: number) {
    const rx = Math.round(x / ROOM);
    const rz = Math.round(z / ROOM);
    const lx = x - rx * ROOM;
    const lz = z - rz * ROOM;
    // Same-biome neighbours share an open seam: they are one room.
    const localBiome = this.biomeAt(rx, rz);
    const openX =
      localBiome !== -1 && localBiome === this.biomeAt(rx + Math.sign(lx), rz);
    const openZ =
      localBiome !== -1 && localBiome === this.biomeAt(rx, rz + Math.sign(lz));
    if (
      (Math.abs(lx) > HALF - radius - 0.12 && Math.abs(lz) > 2 && !openX) ||
      (Math.abs(lz) > HALF - radius - 0.12 && Math.abs(lx) > 2 && !openZ)
    )
      return true;
    const room = this.rooms.get(`${rx},${rz}`);
    if (!room) return true;
    if (
      room.biome === 4 &&
      Math.hypot(lx, lz) > 9.6 - radius &&
      Math.min(Math.abs(lx), Math.abs(lz)) > 2 - radius
    )
      return true;
    if (
      room.rubble &&
      !room.rubble.cleared &&
      Math.abs(x - room.rubble.x) < 1.9 &&
      Math.abs(z - room.rubble.z) < 0.85
    )
      return true;
    return room.colliders.some(
      (c) =>
        Math.abs(x - c.x) < c.w + radius && Math.abs(z - c.z) < c.d + radius,
    );
  }

  private transitionRoom() {
    const x = Math.round(this.player.root.position.x / ROOM);
    const z = Math.round(this.player.root.position.z / ROOM);
    if (x === this.currentX && z === this.currentZ) return;
    const oldX = this.currentX;
    const oldZ = this.currentZ;
    const previousBiome = this.biomeAt(oldX, oldZ);
    const biome = this.biomeAt(x, z);
    // Cells sharing a biome are one continuous arena, not a new room.
    const sameRoom = biome === previousBiome && biome !== -1;
    this.previousRoom = `${oldX},${oldZ}`;
    this.currentX = x;
    this.currentZ = z;
    if (!sameRoom) this.steps++;
    // A regenerated room can appear around the survivor: never leave them stuck.
    this.unstick(this.player.root, 0.38);
    this.rooms.forEach((room, key) => {
      const stale = Math.abs(room.x - x) > 1 || Math.abs(room.z - z) > 1;
      const collapsed =
        room.visited >= 0 &&
        this.steps - room.visited >= 3 &&
        key !== `${x},${z}` &&
        key !== "0,0";
      if (stale || collapsed) {
        // Collapsed cells regenerate later with a brand new biome.
        this.regens.set(key, (this.regens.get(key) || 0) + 1);
        this.disposeRoom(room);
        this.rooms.delete(key);
      }
    });
    for (let rz = z - 1; rz <= z + 1; rz++)
      for (let rx = x - 1; rx <= x + 1; rx++) {
        if (!this.rooms.has(`${rx},${rz}`)) this.createRoom(rx, rz);
      }
    const room = this.rooms.get(`${x},${z}`)!;
    room.visited = this.steps;
    // The whole biome cluster counts as this single room.
    this.rooms.forEach((other) => {
      if (other.biome !== -1 && other.biome === room.biome)
        other.visited = this.steps;
    });
    this.host.dataset.cell = `${x},${z}`;
    this.host.dataset.roomSteps = String(this.steps);
    this.snapshot.biome = room.biome === -1 ? "El refugio" : BIOMES[room.biome];
    this.snapshot.score += sameRoom ? 0 : 25;
    this.updateRoomLights();
    this.sun.position.set(x * ROOM - 8, 23, z * ROOM + 9);
    this.sun.target.position.set(x * ROOM, 0, z * ROOM);
    if (room.fire) this.fireLight.position.set(x * ROOM, 2, z * ROOM);
    this.renderer.shadowMap.needsUpdate = true;
    if (sameRoom) return;
    this.callbacks.onNotice(
      this.snapshot.biome.toUpperCase(),
      this.steps > 2
        ? "Lo que dejas atrás ya no es lo que recuerdas."
        : "La luz viaja contigo. La oscuridad también.",
    );
  }
  private updateRoomLights(immediate = false) {
    const currentBiome = this.biomeAt(this.currentX, this.currentZ);
    this.rooms.forEach((room, key) => {
      const current = room.x === this.currentX && room.z === this.currentZ;
      const sameArena =
        currentBiome !== -1 && this.biomeAt(room.x, room.z) === currentBiome;
      const brightness =
        current || sameArena ? 1 : key === this.previousRoom ? 0.38 : 0.14;
      room.root.userData.targetBrightness = brightness;
      if (immediate) room.brightness = brightness;
    });
  }
  private viewBounds() {
    const raycaster = this.viewRay;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const corner of this.viewCorners) {
      raycaster.setFromCamera(corner, this.camera);
      const point = raycaster.ray.intersectPlane(
        this.viewPlane,
        this.viewPoint,
      );
      if (!point) continue;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
  }

  // Vampire-Survivors pressure: mutants always walk in from beyond the camera,
  // so danger arrives from directions the player cannot see yet.
  private offscreenPoint() {
    const bounds = this.viewBounds();
    const margin = 2.6;
    const areaMinX = (this.currentX - 1) * ROOM - 9.4;
    const areaMaxX = (this.currentX + 1) * ROOM + 9.4;
    const areaMinZ = (this.currentZ - 1) * ROOM - 9.4;
    const areaMaxZ = (this.currentZ + 1) * ROOM + 9.4;
    const lo = Math.max(bounds.minX - margin, areaMinX);
    const hi = Math.min(bounds.maxX + margin, areaMaxX);
    const loZ = Math.max(bounds.minZ - margin, areaMinZ);
    const hiZ = Math.min(bounds.maxZ + margin, areaMaxZ);
    const minX = Number.isFinite(lo) ? Math.min(lo, hi) : areaMinX;
    const maxX = Number.isFinite(hi) ? Math.max(lo, hi) : areaMaxX;
    const minZ = Number.isFinite(loZ) ? Math.min(loZ, hiZ) : areaMinZ;
    const maxZ = Number.isFinite(hiZ) ? Math.max(loZ, hiZ) : areaMaxZ;
    this.host.dataset.viewRadius = String(
      Math.round(Math.max((maxX - minX) / 2, (maxZ - minZ) / 2)),
    );
    const t = Math.random();
    let x: number;
    let z: number;
    switch (Math.floor(Math.random() * 4)) {
      case 0:
        x = minX + (maxX - minX) * t;
        z = minZ;
        break;
      case 1:
        x = maxX;
        z = minZ + (maxZ - minZ) * t;
        break;
      case 2:
        x = minX + (maxX - minX) * t;
        z = maxZ;
        break;
      default:
        x = minX;
        z = minZ + (maxZ - minZ) * t;
    }
    const player = this.player.root.position;
    const insideView =
      x > bounds.minX - margin &&
      x < bounds.maxX + margin &&
      z > bounds.minZ - margin &&
      z < bounds.maxZ + margin;
    // When the loaded rooms are smaller than the view, use the farthest corner.
    if (insideView) {
      x = player.x > (areaMinX + areaMaxX) / 2 ? areaMaxX : areaMinX;
      z = player.z > (areaMinZ + areaMaxZ) / 2 ? areaMaxZ : areaMinZ;
    }
    return { x, z };
  }

  private spawnEnemy(initial = false, index = 0, elite = false) {
    const canSprint = !initial && !elite && this.snapshot.time > 18;
    const sprinter = canSprint && Math.random() < 0.26;
    const kind: CharacterId = elite
      ? "cat"
      : sprinter
        ? "rabbit"
        : this.snapshot.darkness > 24 && Math.random() < 0.36
          ? "cat"
          : "rabbit";
    const variant: Enemy["variant"] = elite
      ? "elite"
      : sprinter
        ? "sprinter"
        : kind === "cat"
          ? "stalker"
          : "walker";
    const actor = this.createActor(kind, true);
    let x: number;
    let z: number;
    if (initial) {
      const angle = (index / 4) * TAU + 0.4;
      const center = this.player.root.position;
      x = clamp(
        center.x + Math.cos(angle) * 7.2,
        this.currentX * ROOM - 8.8,
        this.currentX * ROOM + 8.8,
      );
      z = clamp(
        center.z + Math.sin(angle) * 7.2,
        this.currentZ * ROOM - 8.8,
        this.currentZ * ROOM + 8.8,
      );
    } else {
      const point = this.offscreenPoint();
      x = point.x;
      z = point.z;
      this.spawnSamples++;
      this.spawnDistance += Math.hypot(
        x - this.player.root.position.x,
        z - this.player.root.position.z,
      );
      this.host.dataset.avgSpawn = String(
        Math.round(this.spawnDistance / this.spawnSamples),
      );
    }
    this.spawnedTotal++;
    this.host.dataset.spawned = String(this.spawnedTotal);
    actor.root.position.set(x, 0.06, z);
    actor.root.scale.multiplyScalar(
      elite
        ? 1.4 + Math.random() * 0.2
        : sprinter
          ? 0.85
          : 0.94 + Math.random() * 0.14,
    );
    const power = initial ? 1 : this.currentEnemyPower();
    const dmgScale =
      1 +
      this.snapshot.time * 0.01 +
      Math.max(0, this.snapshot.wave - 1) * 0.16;
    const speedBonus = Math.min(
      2.8,
      this.snapshot.time * 0.014 + Math.max(0, this.snapshot.wave - 1) * 0.16,
    );
    const baseHp = elite ? 185 : sprinter ? 24 : kind === "cat" ? 50 : 30;
    const maxHp = baseHp * power * this.waveElite;
    this.scene.add(actor.root);
    this.enemies.push({
      actor,
      hp: maxHp,
      maxHp,
      speed:
        (elite
          ? 2.0 + speedBonus * 0.55
          : sprinter
            ? 3.45 + speedBonus * 0.85
            : (kind === "cat" ? 3.25 : 2.3) + speedBonus * 0.72) *
        this.waveSpeed,
      damage:
        (elite ? 28 : kind === "cat" ? 21 : 15) * dmgScale * this.waveElite,
      hit: 0,
      kind,
      variant,
      lungeCd: 1.6 + Math.random(),
      lungeTime: 0,
      dying: 0,
      deathDuration: 0.85,
      baseScale: actor.root.scale.x,
      elite,
    });
    this.spawnParticles(
      actor.root.position,
      elite ? "#c98a4a" : sprinter ? "#d86b52" : "#65765c",
      elite ? 14 : 5,
      elite ? 1.6 : 0.8,
    );
  }
  private shoot(
    actor: Actor,
    enemy: Enemy,
    damage: number,
    weapon: WeaponId = "pistol",
    quiet = false,
    accuracy = 1,
  ) {
    const from = actor.root.position;
    const to = enemy.actor.root.position;
    const config = WEAPONS[weapon];
    const heavy = weapon === "shotgun" || weapon === "rifle";
    const desired = Math.atan2(to.x - from.x, to.z - from.z);
    actor.aimHold = Math.max(actor.aimHold, 0.48);
    if (actor === this.player) {
      this.playerFace = { yaw: desired, snap: true };
      this.muzzleGlow = 1;
    } else {
      this.face(actor, desired, true, 1 / 15, 26);
    }

    actor.flashTime = 0.075;
    actor.gunKick = Math.min(1.35, actor.gunKick + config.kick);
    actor.gunRise = Math.min(1.25, actor.gunRise + config.kick * 0.92);
    actor.gunRoll = (Math.random() - 0.5) * 0.22 * config.kick;
    actor.bodyKick = Math.min(1.1, actor.bodyKick + config.kick * 0.72);

    const hit = actor !== this.player || Math.random() < accuracy;
    const crit =
      hit && actor === this.player && Math.random() < this.critChance;
    const finalDamage = crit ? damage * 2 : damage;
    const start = new THREE.Vector3(from.x, 1.06, from.z);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    let end: THREE.Vector3;
    if (hit) {
      end = new THREE.Vector3(to.x, 1.1, to.z);
    } else {
      const missAngle =
        desired + (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.15);
      const missDist = Math.min(dist + 0.7, this.weaponRange());
      end = new THREE.Vector3(
        from.x + Math.sin(missAngle) * missDist,
        0.55,
        from.z + Math.cos(missAngle) * missDist,
      );
      this.missedShots++;
      this.host.dataset.misses = String(this.missedShots);
    }

    const direction = end.clone().sub(start);
    if (actor === this.player) {
      this.host.dataset.lastHit = dist.toFixed(2);
      this.host.dataset.lastWeapon = weapon;
    }
    const length = Math.max(0.1, direction.length());
    const trail = new THREE.Mesh(
      this.geo("cylinder"),
      this.mat(crit ? "#ffe37e" : hit ? config.color : "#8c9a88", true),
    );
    trail.position.copy(start).add(end).multiplyScalar(0.5);
    trail.quaternion.setFromUnitVectors(UP, direction.normalize());
    const thickness = crit ? 0.028 : heavy ? 0.022 : 0.013;
    trail.scale.set(thickness, length, thickness);
    this.scene.add(trail);
    this.trails.push({ mesh: trail, life: 0.068, max: 0.068 });

    if (!quiet) {
      const sound = crit
        ? "crit"
        : weapon === "shotgun"
          ? "shotgun"
          : weapon === "rifle"
            ? "rifle"
            : weapon === "smg"
              ? "smg"
              : "shoot";
      this.audio.play(sound);
      if (this.settings.shake)
        this.shake = Math.max(
          this.shake,
          crit ? 0.19 : weapon === "shotgun" ? 0.16 : heavy ? 0.11 : 0.04,
        );
      // Eject a glinting brass shell casing to the right of the survivor
      const rightX = Math.cos(desired);
      const rightZ = -Math.sin(desired);
      if (this.particles.length < 350) {
        this.particles.push({
          x: from.x + rightX * 0.25,
          y: 1.08,
          z: from.z + rightZ * 0.25,
          vx: rightX * (1.8 + Math.random()) + (Math.random() - 0.5) * 0.5,
          vy: 2.3 + Math.random() * 0.8,
          vz: rightZ * (1.8 + Math.random()) + (Math.random() - 0.5) * 0.5,
          life: 0.42,
          max: 0.42,
          scale: 0.036,
          color: this.color("#e7be63"),
        });
      }
    }

    if (!quiet && this.particles.length < 340) {
      for (let smoke = 0; smoke < 2; smoke++) {
        this.particles.push({
          x: from.x,
          y: 1.12,
          z: from.z,
          vx: (Math.random() - 0.5) * 0.7,
          vy: 0.7 + Math.random() * 0.5,
          vz: (Math.random() - 0.5) * 0.7,
          life: 0.55,
          max: 0.55,
          scale: 0.075,
          color: this.color("#96a190"),
        });
      }
    }

    if (!hit) {
      this.spawnParticles(end, "#a8b29b", 3, 1.1);
      if (!quiet) this.spawnPopup(end.x, 1.35, end.z, "FALLO", "miss");
      return;
    }

    if (crit) this.hitStop = 0.055;
    enemy.hp -= finalDamage;
    enemy.hit = 0.15;
    enemy.actor.bodyKick = Math.min(
      1,
      enemy.actor.bodyKick + (crit ? 0.95 : 0.65),
    );
    if (actor === this.player) {
      this.spawnPopup(
        to.x,
        1.55,
        to.z,
        crit ? `¡${Math.round(finalDamage)}!` : `${Math.round(finalDamage)}`,
        crit ? "crit" : "normal",
      );
    }
    this.spawnParticles(
      end,
      crit ? "#ffdf73" : config.color,
      crit ? 14 : heavy ? 9 : 4,
      crit ? 2.4 : 1.8,
    );
    const baseKnock = weapon === "shotgun" ? 0.58 : heavy ? 0.36 : 0.2;
    const knock =
      baseKnock * this.knockBonus * (enemy.elite ? 0.4 : 1) * (crit ? 1.35 : 1);
    enemy.actor.root.position.x += direction.x * knock;
    enemy.actor.root.position.z += direction.z * knock;
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }
  private killEnemy(enemy: Enemy) {
    if (enemy.dying > 0) return;
    this.snapshot.kills++;
    this.addGold(2 * this.snapshot.goldMultiplier);
    this.grantXp(enemy.elite ? 58 : enemy.kind === "cat" ? 18 : 13);
    const consecutive = this.snapshot.time - this.lastKill < 3.6;
    this.snapshot.combo = consecutive
      ? Math.min(5, this.snapshot.combo + 0.25)
      : 1;
    this.lastKill = this.snapshot.time;
    this.snapshot.score += Math.round(
      (enemy.elite ? 140 : enemy.kind === "cat" ? 75 : 40) *
        this.snapshot.combo,
    );
    this.snapshot.health = Math.min(
      this.snapshot.maxHealth,
      this.snapshot.health + this.lifesteal,
    );
    this.spawnParticles(
      this.tempVec.set(
        enemy.actor.root.position.x,
        enemy.actor.root.position.y + 0.7,
        enemy.actor.root.position.z,
      ),
      enemy.elite ? "#e8b45c" : "#98a974",
      enemy.elite ? 26 : 14,
      enemy.elite ? 3.4 : 3,
    );
    if (enemy.elite) {
      this.elitesKilled++;
      this.addGold(40 * this.snapshot.goldMultiplier);
      this.snapshot.score += 120;
      this.shake = Math.max(this.shake, 0.32);
      this.createDrop(enemy.actor.root.position, "chest");
      this.callbacks.onNotice(
        "UN BRUTO CAE · COFRE DE RELIQUIA",
        "Recoge el cofre dorado para ganar una Brasa permanente.",
      );
    }
    if (this.blast > 0) this.explode(enemy);
    this.createDrop(enemy.actor.root.position, "gold");
    if (Math.random() < 0.65) this.createDrop(enemy.actor.root.position, "xp");
    const chance = Math.random();
    const luck = this.luck * 0.04;
    const kits = this.drops.filter((d) => d.kind === "health").length;
    const roll = Math.random();
    const ammoWeapon: WeaponId =
      roll < 0.4 ? "shotgun" : roll < 0.72 ? "smg" : "rifle";
    if (enemy.elite) this.createDrop(enemy.actor.root.position, "health");
    else if (chance < 0.035 || this.snapshot.kills === 12)
      this.createDrop(enemy.actor.root.position, "boost");
    else if (
      chance < 0.16 + luck ||
      (this.snapshot.kills === 4 && this.snapshot.arsenal.length === 0)
    )
      this.createDrop(enemy.actor.root.position, "ammo", ammoWeapon);
    // Medical kits stay scarce: at most two on the field, with a cooldown.
    else if (
      kits < 2 &&
      this.healthTimer <= 0 &&
      (chance < 0.1 + luck || (this.snapshot.health < 45 && chance < 0.22))
    ) {
      this.createDrop(enemy.actor.root.position, "health");
      this.healthTimer = 9;
    }
    this.audio.play("kill");
    this.startAbyss(enemy);
  }
  private explode(enemy: Enemy) {
    if (this.blastDepth > 2) return;
    this.blastDepth++;
    const centre = enemy.actor.root.position;
    const victims = this.enemies.filter(
      (other) =>
        other !== enemy &&
        other.hp > 0 &&
        other.actor.root.position.distanceToSquared(centre) < 12,
    );
    for (const victim of victims) {
      victim.hp -= this.damage * 0.45 * this.blast;
      victim.hit = 0.12;
      if (victim.hp <= 0) this.killEnemy(victim);
    }
    if (victims.length) {
      this.spawnParticles(
        this.tempVec.set(centre.x, centre.y + 0.6, centre.z),
        "#e2a45c",
        14,
        2.2,
      );
      this.audio.play("hit");
    }
    this.blastDepth--;
  }

  private startAbyss(enemy: Enemy) {
    enemy.dying = 0.0001;
    enemy.deathDuration = 0.85;
    enemy.baseScale = enemy.actor.root.scale.x;
    this.dying.push(enemy);
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.spawnPortal(enemy.actor.root.position);
    this.spawnParticles(
      this.tempVec.set(
        enemy.actor.root.position.x,
        enemy.actor.root.position.y + 0.5,
        enemy.actor.root.position.z,
      ),
      "#26362b",
      18,
      1.7,
    );
    this.audio.play("sink");
    this.host.dataset.abyss = String(Number(this.host.dataset.abyss || 0) + 1);
  }

  private spawnPortal(position: THREE.Vector3) {
    let portal = this.portals.find((p) => !p.active);
    if (!portal)
      portal = this.portals.reduce((a, b) => (a.life < b.life ? a : b));
    portal.active = true;
    portal.life = 0;
    portal.group.visible = true;
    portal.group.position.set(position.x, 0.06, position.z);
    portal.group.rotation.y = Math.random() * TAU;
  }

  private updateDying(dt: number) {
    for (const enemy of this.dying) {
      enemy.dying += dt;
      const t = Math.min(1, enemy.dying / enemy.deathDuration);
      const root = enemy.actor.root;
      root.rotation.y += dt * 7;
      root.position.y = 0.06 - t * t * 2.4;
      root.scale.setScalar(enemy.baseScale * (1 - 0.45 * t));
      this.animateActor(enemy.actor, dt, 6);
      enemy.actor.rig.rotation.x = t * 1.15;
      enemy.actor.rig.scale.y = 1 - t * 0.35;
      if (t >= 1) {
        this.scene.remove(root);
        enemy.actor.rig.rotation.x = 0;
        enemy.actor.rig.scale.y = 1;
      }
    }
    this.dying = this.dying.filter(
      (enemy) => enemy.dying < enemy.deathDuration,
    );
    for (const portal of this.portals) {
      if (!portal.active) continue;
      portal.life += dt;
      const t = Math.min(1, portal.life / 0.9);
      const scale = 0.5 + t * 1.35;
      portal.group.scale.set(scale, scale, scale);
      portal.group.rotation.y += dt * 2.4;
      portal.disc.material.opacity = (1 - t) * 0.92;
      portal.ring.material.opacity = (1 - t) * 0.8;
      if (t >= 1) {
        portal.active = false;
        portal.group.visible = false;
      }
    }
  }

  private updateEnemies(dt: number) {
    const playerPosition = this.player.root.position;
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.enemies.forEach((enemy, index) => {
      const p = enemy.actor.root.position;
      let target = playerPosition;
      let companionTarget: Companion | null = null;
      let distance = p.distanceToSquared(playerPosition);
      for (const companion of this.companions) {
        if (!companion.recruited) continue;
        const d = p.distanceToSquared(companion.actor.root.position);
        if (d < distance) {
          distance = d;
          target = companion.actor.root.position;
          companionTarget = companion;
        }
      }
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      let vx = dx / length;
      let vz = dz / length;
      // Light separation keeps the horde readable instead of stacking models.
      for (let j = index + 1; j < this.enemies.length; j++) {
        const other = this.enemies[j].actor.root.position;
        const sx = p.x - other.x;
        const sz = p.z - other.z;
        const d = sx * sx + sz * sz;
        if (d > 0.01 && d < 0.8) {
          vx += sx * 1.7;
          vz += sz * 1.7;
        }
      }
      enemy.hit = Math.max(0, enemy.hit - dt);
      enemy.lungeCd = Math.max(0, enemy.lungeCd - dt);
      enemy.lungeTime = Math.max(0, enemy.lungeTime - dt);
      if (
        enemy.variant === "sprinter" &&
        enemy.lungeCd <= 0 &&
        length > 1.1 &&
        length < 2.9 &&
        enemy.hit <= 0
      ) {
        enemy.lungeTime = 0.2;
        enemy.lungeCd = 2.8;
        enemy.actor.attackAnim = 1;
      } else if (enemy.variant === "stalker" && length > 1.6 && length < 5.5) {
        const weave = Math.sin(enemy.actor.phase * 0.45) * 0.35;
        vx += (-dz / length) * weave;
        vz += (dx / length) * weave;
      }
      if (length < 1.55 && enemy.actor.attackAnim < 0.35)
        enemy.actor.attackAnim = 0.65;
      const speed =
        enemy.speed * (enemy.hit > 0 ? 0.22 : enemy.lungeTime > 0 ? 1.85 : 1);
      this.moveActor(
        enemy.actor.root,
        vx * speed * dt,
        vz * speed * dt,
        0.28,
        false,
      );
      this.face(enemy.actor, Math.atan2(dx, dz), false, dt, 8);
      this.animateActor(enemy.actor, dt, speed);
      if (enemy.hit > 0) {
        enemy.actor.rig.scale.set(1.16, 0.86, 1.16);
      } else {
        enemy.actor.rig.scale.set(1, 1, 1);
      }
      if (length < 0.95) {
        enemy.actor.attackAnim = 1;
        if (companionTarget) {
          // Same hit rules as the survivor: one hit, then brief mercy frames.
          if (companionTarget.hurt <= 0) {
            const allyDamage = enemy.damage * 1.15;
            companionTarget.hp -= allyDamage;
            companionTarget.damageTaken += allyDamage;
            this.allyDamageTotal += allyDamage;
            companionTarget.hurt = 0.55;
            this.spawnParticles(
              companionTarget.actor.root.position,
              "#e3a168",
              8,
              2,
            );
            this.audio.play("hurt");
          }
          if (companionTarget.hp <= 0) {
            this.spawnParticles(
              companionTarget.actor.root.position,
              "#cfb486",
              18,
              2,
            );
            this.scene.remove(companionTarget.actor.root);
            this.companions = this.companions.filter(
              (c) => c !== companionTarget,
            );
            this.allyDeaths++;
            this.host.dataset.allyDeaths = String(this.allyDeaths);
            this.callbacks.onNotice(
              "UNA LUZ MENOS",
              "Tu compañero ha caído. Sigue adelante.",
            );
          }
        } else if (
          this.hurtCooldown <= 0 &&
          this.dashTime <= 0 &&
          !this.isAtSafeFire()
        ) {
          const rawTaken = enemy.damage * this.armor;
          const shieldActive = this.snapshot.shieldTime > 0;
          const taken = Math.round(shieldActive ? rawTaken * 0.4 : rawTaken);
          this.snapshot.health -= taken;
          this.hurtCooldown = 0.78;
          if (shieldActive) {
            this.spawnParticles(
              this.tempVec.set(
                playerPosition.x,
                playerPosition.y + 0.9,
                playerPosition.z,
              ),
              "#6ec5ff",
              10,
              2.0,
            );
          }
          this.audio.play("hurt");
          if (this.settings.shake) this.shake = 0.32;
          this.spawnPopup(
            playerPosition.x,
            1.9,
            playerPosition.z,
            `-${taken}`,
            "miss",
          );
          this.spawnParticles(
            this.tempVec.set(
              playerPosition.x,
              playerPosition.y + 0.8,
              playerPosition.z,
            ),
            "#e3a168",
            12,
            2.5,
          );
          p.x -= (dx / length) * 1;
          p.z -= (dz / length) * 1;
        }
      }
      if (p.distanceToSquared(playerPosition) > 2800) {
        enemy.hp = 0;
        this.scene.remove(enemy.actor.root);
      }
    });
  }

  /** Nearest live enemy, optionally limited by distance. */
  private nearestEnemy(from: THREE.Vector3, maxDistance: number) {
    let best: Enemy | null = null;
    let bestDist = maxDistance * maxDistance;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.dying > 0) continue;
      const d = enemy.actor.root.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    return best;
  }

  /**
   * Allies behave like a second player: they hunt enemies, keep their distance,
   * shoot with their own weapon, knife enemies that crowd them, and scavenge
   * supplies. Anything they recover is 25% less effective than for the survivor.
   */
  private updateCompanions(dt: number) {
    let follower = 0;
    this.companions.forEach((companion) => {
      if (!companion.recruited) {
        this.animateActor(companion.actor, dt, 0);
        return;
      }
      companion.hurt = Math.max(0, companion.hurt - dt);
      companion.cooldown = Math.max(0, companion.cooldown - dt);
      companion.knifeCd = Math.max(0, companion.knifeCd - dt);
      const p = companion.actor.root.position;
      const playerPosition = this.player.root.position;
      const enemy = this.nearestEnemy(p, 9.5);
      const looseLoot = this.drops.find(
        (drop) =>
          (drop.kind === "health" || drop.kind === "ammo") &&
          (drop.source === "companion" || drop.age > 5) &&
          drop.mesh.position.distanceToSquared(p) < 64,
      );

      let moveX = 0;
      let moveZ = 0;
      let moveSpeed = 0;

      if (enemy) {
        companion.state = "hunt";
        const ep = enemy.actor.root.position;
        const dx = ep.x - p.x;
        const dz = ep.z - p.z;
        const dist = Math.max(0.001, Math.hypot(dx, dz));
        this.face(companion.actor, Math.atan2(dx, dz), false, dt, 9);
        // Keep a firing lane instead of hugging the mutant.
        const ideal = 2.5;
        if (dist > ideal + 0.5) {
          moveX = (dx / dist) * 0.92;
          moveZ = (dz / dist) * 0.92;
          moveSpeed = 0.94;
        } else if (dist < ideal - 0.6) {
          moveX = -(dx / dist) * 0.8;
          moveZ = -(dz / dist) * 0.8;
          moveSpeed = 0.9;
        } else {
          // Hold the line beside the horde instead of kiting forever.
          moveX = (-dz / dist) * 0.35;
          moveZ = (dx / dist) * 0.35;
          moveSpeed = 0.3;
        }
        const config = WEAPONS[companion.weapon];
        const range = config.range * CHARACTER_UNIT + 1.2;
        const canShoot =
          companion.weapon === "pistol" ? true : companion.ammo > 0;
        if (dist < range && companion.cooldown <= 0 && canShoot) {
          const damage = this.damage * config.damage * 0.72;
          this.shoot(companion.actor, enemy, damage, companion.weapon, true);
          if (companion.weapon !== "pistol") {
            companion.ammo = Math.max(0, companion.ammo - 1);
            if (companion.ammo === 0) companion.weapon = "pistol";
          }
          companion.cooldown = Math.max(0.34, config.cooldown * 1.25) / 1;
        } else if (dist < 3 && companion.knifeCd <= 0) {
          this.companionKnife(companion, enemy);
        }
      } else if (looseLoot) {
        companion.state = "loot";
        const lp = looseLoot.mesh.position;
        const dx = lp.x - p.x;
        const dz = lp.z - p.z;
        const dist = Math.max(0.001, Math.hypot(dx, dz));
        moveX = dx / dist;
        moveZ = dz / dist;
        moveSpeed = 0.9;
        this.face(companion.actor, Math.atan2(dx, dz), false, dt, 8);
        if (dist < 0.85) this.companionCollect(companion, looseLoot);
      } else {
        companion.state = "follow";
        const anchor = new THREE.Vector2(
          playerPosition.x + (follower === 0 ? -1.15 : 1.15),
          playerPosition.z + 1.15,
        );
        const dx = anchor.x - p.x;
        const dz = anchor.y - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.5) {
          moveX = dx / dist;
          moveZ = dz / dist;
          moveSpeed = Math.min(1.05, 0.55 + dist * 0.06);
          this.face(companion.actor, Math.atan2(dx, dz), false, dt, 8);
        }
      }

      if (moveSpeed > 0) {
        const speed = this.speed * moveSpeed;
        this.moveActor(
          companion.actor.root,
          moveX * speed * dt,
          moveZ * speed * dt,
          0.3,
          true,
        );
      }
      this.animateActor(
        companion.actor,
        dt,
        moveSpeed > 0 ? this.speed * moveSpeed : 0,
      );
      if (companion.hurt > 0) {
        companion.actor.rig.visible = Math.sin(companion.hurt * 40) > -0.5;
      } else companion.actor.rig.visible = true;

      if (p.distanceToSquared(playerPosition) > 700) {
        p.copy(playerPosition).add(new THREE.Vector3(-1, 0, 1));
      }
      // Never stay wedged inside geometry if a room regenerated around the ally.
      this.unstick(companion.actor.root, 0.3);

      companion.resource += dt;
      if (companion.resource > 16) {
        companion.resource = 0;
        const kind = companion.hp < companion.maxHp * 0.7 ? "health" : "ammo";
        const foundWeapon =
          Math.random() < 0.45
            ? SECONDARY_WEAPONS[
                Math.floor(Math.random() * SECONDARY_WEAPONS.length)
              ]
            : undefined;
        this.createDrop(p, kind, foundWeapon, "companion");
        this.callbacks.onNotice(
          "UN PEQUEÑO HALLAZGO",
          `${companion.name} ha encontrado suministros.`,
        );
      }
      follower++;
    });

    const alive = this.companions.filter((c) => c.recruited);
    this.host.dataset.companions = String(alive.length);
    const first = alive[0];
    this.host.dataset.companionState = first ? first.state : "none";
    this.host.dataset.companionHp = first
      ? String(Math.max(0, Math.ceil(first.hp)))
      : "0";
    this.host.dataset.companionMaxHp = first ? String(first.maxHp) : "0";
    this.host.dataset.companionWeapon = first ? first.weapon : "none";
    this.host.dataset.companionDamage = first
      ? String(Math.floor(first.damageTaken))
      : "0";
  }

  private companionKnife(companion: Companion, enemy: Enemy) {
    companion.knifeCd = 2.4;
    companion.actor.aimHold = 0.3;
    const from = companion.actor.root.position;
    const to = enemy.actor.root.position;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    enemy.hp -= this.damage * 0.62;
    enemy.hit = 0.35;
    const push = enemy.elite ? 0.7 : 1.7;
    this.moveActor(
      enemy.actor.root,
      (dx / dist) * push,
      (dz / dist) * push,
      0.28,
      true,
    );
    this.spawnParticles(this.tempVec.set(to.x, 1.0, to.z), "#ffe0a3", 8, 1.8);
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  private companionCollect(companion: Companion, drop: Drop) {
    // Ally supplies are deliberately weaker: 75% of the effect.
    if (drop.kind === "health") {
      companion.hp = Math.min(
        companion.maxHp,
        companion.hp + Math.round(40 * ALLY_EFFICIENCY),
      );
    } else if (drop.kind === "ammo") {
      const found = drop.weapon || "shotgun";
      const config = WEAPONS[found];
      const rounds = Math.max(1, Math.floor(config.clip * ALLY_EFFICIENCY));
      if (companion.weapon === found) {
        companion.ammo += rounds;
      } else if (companion.weapon === "pistol") {
        companion.weapon = found;
        companion.ammo = rounds;
      } else {
        companion.ammo += rounds;
      }
      this.callbacks.onNotice(
        "TU COMPAÑERO SE ARMA",
        `${companion.name} recogió ${config.name.toLowerCase()} (75% de munición).`,
      );
    }
    this.scene.remove(drop.mesh);
    this.drops = this.drops.filter((d) => d !== drop);
    this.spawnParticles(drop.mesh.position, "#b9d6a4", 8, 1.6);
    this.audio.play("pickup");
  }

  private createDrop(
    position: THREE.Vector3,
    kind: Drop["kind"],
    requested?: WeaponId,
    source: "player" | "companion" = "player",
  ) {
    const weapon =
      kind === "ammo" && !requested
        ? SECONDARY_WEAPONS[
            Math.floor(Math.random() * SECONDARY_WEAPONS.length)
          ]
        : requested;
    const mesh = new THREE.Group();
    mesh.position.copy(position);
    mesh.position.x += (Math.random() - 0.5) * 0.9;
    mesh.position.z += (Math.random() - 0.5) * 0.9;
    if (kind === "xp") {
      this.mesh(
        mesh,
        "oct",
        this.mat("#72e3a8", true),
        0,
        0,
        0,
        0.13,
        0.24,
        0.13,
      );
    } else if (kind === "chest") {
      this.mesh(mesh, "box", this.mat("#6e4c30"), 0, 0.04, 0, 0.62, 0.42, 0.46);
      this.mesh(
        mesh,
        "box",
        this.mat("#e8b856", true),
        0,
        0.18,
        0,
        0.65,
        0.1,
        0.49,
      );
      this.mesh(
        mesh,
        "box",
        this.mat("#ffea9e", true),
        0,
        0.08,
        0.24,
        0.12,
        0.14,
        0.04,
      );
      this.mesh(
        mesh,
        "cylinder",
        this.mat("#ffe396", true),
        0,
        1.15,
        0,
        0.05,
        2.1,
        0.05,
      );
    } else {
      const golden = kind === "gold" || kind === "boost";
      const material = this.mat(
        golden ? "#e8b856" : kind === "health" ? "#e7dac1" : "#88af95",
        golden,
      );
      this.mesh(
        mesh,
        golden ? "oct" : "box",
        material,
        0,
        0,
        0,
        golden ? (kind === "boost" ? 0.34 : 0.16) : 0.48,
        golden ? (kind === "boost" ? 0.58 : 0.28) : 0.34,
        golden ? 0.2 : 0.35,
      );
      if (kind === "health") {
        this.mesh(mesh, "box", this.mat("#bc6750"), 0, 0.18, 0, 0.1, 0.02, 0.3);
        this.mesh(mesh, "box", this.mat("#bc6750"), 0, 0.18, 0, 0.3, 0.02, 0.1);
      } else if (kind === "ammo") {
        [-1, 0, 1].forEach((i) =>
          this.mesh(
            mesh,
            "cylinder",
            this.mat(
              kind === "ammo" && weapon ? WEAPONS[weapon].color : "#e4bc6c",
            ),
            i * 0.12,
            0.24,
            0,
            0.04,
            0.2,
            0.04,
          ),
        );
      } else if (kind === "boost") {
        [-1, 1].forEach((i) =>
          this.mesh(
            mesh,
            "oct",
            this.mat("#ffdc8c", true),
            i * 0.42,
            0,
            0,
            0.12,
            0.22,
            0.12,
          ),
        );
      }
    }
    this.scene.add(mesh);
    this.drops.push({
      mesh,
      kind,
      age: 0,
      base: Math.random() * TAU,
      weapon,
      source,
    });
    if (this.drops.length > (this.mobile ? 56 : 92)) {
      const idx = this.drops.findIndex((d) => d.kind !== "chest");
      const oldest =
        idx >= 0 ? this.drops.splice(idx, 1)[0] : this.drops.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }
  }

  private updateDrops(dt: number) {
    this.drops = this.drops.filter((drop) => {
      drop.age += dt;
      drop.mesh.position.y =
        0.55 + Math.sin(this.visualTime * 3 + drop.base) * 0.13;
      drop.mesh.rotation.y += dt * (drop.kind === "chest" ? 1.4 : 0.7);
      const player = this.player.root.position;
      const dx = player.x - drop.mesh.position.x;
      const dz = player.z - drop.mesh.position.z;
      const distance = Math.hypot(dx, dz);
      const pullRadius =
        drop.kind === "xp"
          ? 7.2
          : drop.kind === "gold"
            ? 6.4
            : drop.kind === "chest"
              ? 3.8
              : 2.9;
      if (distance < pullRadius * this.magnet) {
        const pullSpeed = drop.kind === "xp" ? 9.5 : 7;
        drop.mesh.position.x += dx * dt * pullSpeed;
        drop.mesh.position.z += dz * dt * pullSpeed;
      }
      if (distance < (drop.kind === "chest" ? 1.05 : 0.85)) {
        if (drop.kind === "gold")
          this.addGold(7 * this.snapshot.goldMultiplier);
        if (drop.kind === "xp") {
          this.grantXp(16);
        }
        if (drop.kind === "chest") {
          this.addGold(45 * this.snapshot.goldMultiplier);
          this.snapshot.bonusEmbers += 1;
          this.snapshot.score += 180;
          this.snapshot.frenzyTime = 6;
          const active = this.snapshot.weapon;
          this.clips.set(active, WEAPONS[active].clip);
          this.reloadTimer = 0;
          this.reloadTotal = 0;
          this.audio.play("chest");
          this.spawnParticles(player, "#ffe184", 30, 3.2);
          this.spawnPopup(
            player.x,
            2.3,
            player.z,
            "¡RELIQUIA +1 BRASA!",
            "reward",
          );
          this.callbacks.onNotice(
            "RELIQUIA DEL AVERNO ABIERTA",
            "+1 Brasa · +Oro · Frenesí de cadencia durante 6 s.",
          );
        }
        if (drop.kind === "boost") {
          this.snapshot.goldBoostTime = 18;
          this.snapshot.goldMultiplier = 2;
          this.spawnParticles(player, "#ffd780", 24, 2.5);
          this.callbacks.onNotice(
            "EL DOBLE DE RAZONES",
            "Oro x2 durante 18 segundos. Haz que brille.",
          );
        }
        if (drop.kind === "health") {
          this.snapshot.health = Math.min(
            this.snapshot.maxHealth,
            this.snapshot.health + 40,
          );
          this.spawnPopup(player.x, 1.9, player.z, "+40 VIDA", "reward");
          this.spawnParticles(player, "#aecb94", 10, 2);
        }
        if (drop.kind === "ammo") {
          const found: WeaponId = drop.weapon || "shotgun";
          const config = WEAPONS[found];
          const bonusAmmo = Math.round(
            config.ammo * (1 + this.clipBonus * 0.15),
          );
          const hadWeapon = this.totalAmmo(found) > 0;
          if (!hadWeapon) {
            this.clips.set(found, config.clip);
            this.arsenal.set(found, bonusAmmo);
            this.reloadTimer = 0;
            this.reloadTotal = 0;
            this.snapshot.weapon = found;
            this.syncWeapon();
            this.callbacks.onNotice(
              "HAS ENCONTRADO " + config.name.toUpperCase(),
              config.clip +
                " en cargador + " +
                bonusAmmo +
                " de reserva · Q para cambiar.",
            );
          } else {
            const owned = this.arsenal.get(found) || 0;
            this.arsenal.set(
              found,
              Math.min(config.clip * 5, owned + bonusAmmo),
            );
            this.syncWeapon();
            if (
              this.snapshot.weapon === found &&
              (this.clips.get(found) || 0) === 0 &&
              this.reloadTimer <= 0
            )
              this.startReload();
            this.callbacks.onNotice(
              "MUNICIÓN DE " + config.name.toUpperCase(),
              "+" + bonusAmmo + " balas de reserva.",
            );
          }
        }
        if (drop.kind !== "gold" && drop.kind !== "xp" && drop.kind !== "chest")
          this.audio.play("pickup");
        else if (drop.kind === "gold" && Math.random() < 0.2)
          this.audio.play("pickup");
        this.syncWeapon();
        this.scene.remove(drop.mesh);
        return false;
      }
      if (drop.age > 45) {
        this.scene.remove(drop.mesh);
        return false;
      }
      return true;
    });
  }

  private getContext(): {
    type: GameSnapshot["context"];
    companion?: Companion;
    rubble?: NonNullable<Room["rubble"]>;
    crate?: SupplyCrate;
  } {
    const p = this.player.root.position;
    const followers = this.companions.filter((c) => c.recruited).length;
    if (followers < 2) {
      const companion = this.companions.find(
        (c) => !c.recruited && c.actor.root.position.distanceToSquared(p) < 10,
      );
      if (companion) return { type: "survivor", companion };
    }
    const room = this.rooms.get(`${this.currentX},${this.currentZ}`);
    if (room?.crate && !room.crate.opened) {
      if (Math.hypot(p.x - room.crate.x, p.z - room.crate.z) < 2.5) {
        return { type: "crate", crate: room.crate };
      }
    }
    if (room?.rubble && !room.rubble.cleared) {
      // Measure to the edge of the pile, then allow one extra character.
      const dx = Math.max(0, Math.abs(p.x - room.rubble.x) - 1.9);
      const dz = Math.max(0, Math.abs(p.z - room.rubble.z) - 0.85);
      if (Math.hypot(dx, dz) < 2.2)
        return { type: "rubble", rubble: room.rubble };
    }
    if (
      room?.fire &&
      Math.hypot(p.x - room.x * ROOM, p.z - room.z * ROOM) < 4.6
    )
      return { type: "fire" };
    return { type: null };
  }

  private isAtSafeFire() {
    const room = this.rooms.get(`${this.currentX},${this.currentZ}`);
    const p = this.player.root.position;
    return Boolean(
      room?.fire && Math.hypot(p.x - room.x * ROOM, p.z - room.z * ROOM) < 1.8,
    );
  }

  private spawnParticles(
    position: THREE.Vector3,
    color: string,
    amount: number,
    force: number,
  ) {
    const cap = this.settings.quality === "high" ? 390 : 220;
    for (let i = 0; i < amount && this.particles.length < cap; i++) {
      const life = 0.3 + Math.random() * 0.5;
      this.particles.push({
        x: position.x,
        y: position.y + 0.2,
        z: position.z,
        vx: (Math.random() - 0.5) * force * 2,
        vy: Math.random() * force + 1,
        vz: (Math.random() - 0.5) * force * 2,
        life,
        max: life,
        scale: 0.035 + Math.random() * 0.06,
        color: this.color(color),
      });
    }
  }

  private color(hex: string) {
    let cached = this.colorCache.get(hex);
    if (!cached) {
      cached = new THREE.Color(hex);
      this.colorCache.set(hex, cached);
    }
    return cached;
  }

  private updateVisuals(dt: number) {
    const playing = this.state !== "menu";
    if (!playing) {
      this.animateActor(this.player, dt, 0);
      this.companions.forEach((c) => this.animateActor(c.actor, dt, 0));
      this.enemies.forEach((e) => this.animateActor(e.actor, dt, 0));
      const aspect =
        this.host.clientWidth / Math.max(1, this.host.clientHeight);
      if (aspect < 0.8) this.target.set(-1.7, 0, -2.5);
      else this.target.set(-6.5, 0, 3.7);
    } else {
      this.target.copy(this.player.root.position);
      this.target.x += this.velocity.x * 1.1;
      this.target.z += this.velocity.y * 1.1;
      this.target.y = 0;
    }
    this.cameraTarget.lerp(this.target, 1 - Math.exp(-dt * (playing ? 6 : 2)));
    this.camera.position
      .copy(this.cameraTarget)
      .add(new THREE.Vector3(24, 29, 28));
    const sway = playing ? 0 : Math.sin(this.visualTime * 0.18) * 0.2;
    this.camera.position.x += sway;
    if (this.shake > 0 && this.settings.shake) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.camera.lookAt(this.cameraTarget);
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const wantedSize = playing
      ? aspect < 0.8
        ? 24
        : 21
      : aspect < 0.8
        ? 29
        : 24.5;
    const size = THREE.MathUtils.lerp(
      this.camera.top * 2,
      wantedSize,
      dt * 2.5,
    );
    this.camera.left = (-size * aspect) / 2;
    this.camera.right = (size * aspect) / 2;
    this.camera.top = size / 2;
    this.camera.bottom = -size / 2;
    this.camera.updateProjectionMatrix();
    const flicker =
      1 +
      Math.sin(this.visualTime * 7.3) * 0.05 +
      Math.sin(this.visualTime * 13.7) * 0.03;
    this.playerLight.position
      .copy(this.player.root.position)
      .add(new THREE.Vector3(0, 2.4, 0));
    this.playerLight.intensity = 16 * flicker + this.muzzleGlow * 11;
    this.fillLight.position
      .copy(this.player.root.position)
      .add(new THREE.Vector3(1.5, 3.6, -1.5));
    this.fillLight.intensity = 5 * flicker;
    if (this.player.models) {
      const activeWeapon: WeaponId = playing ? this.snapshot.weapon : "pistol";
      (Object.keys(this.player.models) as WeaponId[]).forEach((key) => {
        this.player.models![key].visible = key === activeWeapon;
      });
    }
    if (playing && this.slashTime > 0) {
      const progress = 1 - this.slashTime / 0.46;
      this.slashArc.visible = progress > 0.22 && progress < 0.88;
      this.slashArc.position.set(
        this.player.root.position.x,
        0.96,
        this.player.root.position.z,
      );
      const sweep = (progress - 0.22) / 0.66;
      this.slashArc.rotation.z =
        -this.player.root.rotation.y + Math.PI * 0.55 - (sweep - 0.5) * 1.4;
      const arcScale = 0.85 + Math.sin(sweep * Math.PI) * 0.48;
      this.slashArc.scale.set(arcScale, arcScale, 1);
      this.slashArc.material.opacity = Math.sin(sweep * Math.PI) * 0.92;
    } else {
      this.slashArc.visible = false;
    }
    this.player.root.visible =
      this.state !== "over" || Math.sin(this.visualTime * 8) > -0.5;
    if (this.state === "playing" && this.hurtCooldown > 0)
      this.player.rig.visible = Math.sin(this.hurtCooldown * 35) > -0.35;
    else this.player.rig.visible = true;
    const visibleBiome = this.biomeAt(this.currentX, this.currentZ);
    this.rooms.forEach((room, key) => {
      const current = room.x === this.currentX && room.z === this.currentZ;
      const dx = Math.abs(room.x * ROOM - this.player.root.position.x);
      const dz = Math.abs(room.z * ROOM - this.player.root.position.z);
      const sameArena =
        visibleBiome !== -1 && this.biomeAt(room.x, room.z) === visibleBiome;
      room.root.visible =
        current ||
        (playing &&
          (key === this.previousRoom ||
            sameArena ||
            (Math.max(dx, dz) < 16 && Math.min(dx, dz) < 12)));
      room.brightness = THREE.MathUtils.lerp(
        room.brightness,
        room.root.userData.targetBrightness ?? 0.14,
        Math.min(1, dt * 3),
      );
      room.materials.forEach(({ material, color, emissive }) => {
        material.color.copy(color).multiplyScalar(room.brightness);
        material.emissive
          .copy(emissive)
          .multiplyScalar(Math.max(0.28, room.brightness));
      });
      if (room.fire) {
        const flames = room.fire.getObjectByName("flames");
        flames?.children.forEach((flame, i) => {
          flame.scale.y =
            (i === 6 ? 1.05 : 0.95) *
            (0.85 + Math.sin(this.visualTime * 8 + i * 2.7) * 0.2);
          flame.rotation.z = Math.sin(this.visualTime * 5 + i) * 0.13;
        });
      }
    });
    this.candleTimer -= dt;
    if (this.candleTimer <= 0) {
      this.candleTimer = 0.45;
      // Only the nearest candle keeps a real light: fewer lights, cheaper shaders.
      const px = this.player.root.position.x;
      const pz = this.player.root.position.z;
      let nearest: Candle | null = null;
      let best = Infinity;
      for (const entry of this.candleLights) {
        if (!entry.room.root.visible) continue;
        const distance = Math.hypot(
          entry.light.position.x + entry.room.x * ROOM - px,
          entry.light.position.z + entry.room.z * ROOM - pz,
        );
        if (distance < best) {
          best = distance;
          nearest = entry;
        }
      }
      for (const entry of this.candleLights)
        entry.light.intensity = entry === nearest ? 7 : 0;
      this.host.dataset.kits = String(
        this.drops.filter((d) => d.kind === "health").length,
      );
    }
    this.companions.forEach((companion) => {
      companion.actor.root.visible =
        companion.recruited ||
        (this.companions.filter((c) => c.recruited).length < 2 &&
          Boolean(this.rooms.get(companion.roomKey)?.root.visible));
    });
    this.fireLight.intensity =
      65 +
      Math.sin(this.visualTime * 13) * 8 +
      Math.sin(this.visualTime * 7.1) * 5;
    this.dust.rotation.y = this.visualTime * 0.009;
    if (this.scene.fog instanceof THREE.FogExp2) {
      const currentBiome =
        this.state === "menu" ? -1 : this.biomeAt(this.currentX, this.currentZ);
      const fogHex =
        ["#16211e", "#151d23", "#131f1d", "#171d26", "#17241b"][
          Math.max(0, currentBiome)
        ] ?? "#16211e";
      this.scene.fog.color.lerp(this.color(fogHex), Math.min(1, dt * 1.4));
    }
    const plaza = this.player.root.position;
    for (let i = 0; i < 90; i++) {
      this.ashPositions[i * 3 + 1] -= dt * (0.22 + (i % 5) * 0.05);
      this.ashPositions[i * 3] +=
        Math.sin(this.visualTime * 0.5 + i * 0.7) * dt * 0.22;
      if (this.ashPositions[i * 3 + 1] < 0) {
        this.ashPositions[i * 3 + 1] = 9;
        this.ashPositions[i * 3] = plaza.x + (Math.random() - 0.5) * 26;
        this.ashPositions[i * 3 + 2] = plaza.z + (Math.random() - 0.5) * 26;
      }
    }
    this.ash.geometry.attributes.position.needsUpdate = true;
    (this.ash.material as THREE.PointsMaterial).opacity =
      0.28 + this.snapshot.darkness / 260;
    for (let i = 0; i < 45; i++) {
      const age = (this.visualTime * (0.24 + (i % 5) * 0.025) + i / 45) % 1;
      const angle = i * 2.4 + this.visualTime * 0.3;
      this.emberPositions[i * 3] = Math.cos(angle) * age * 1.3;
      this.emberPositions[i * 3 + 1] = 0.7 + age * 5;
      this.emberPositions[i * 3 + 2] = Math.sin(angle) * age;
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
    const animateParticles =
      this.state === "playing" ||
      this.state === "menu" ||
      this.state === "over";
    if (animateParticles) {
      this.particles = this.particles.filter((p) => {
        p.life -= dt;
        if (p.life <= 0) return false;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= dt * 7;
        return true;
      });
      this.particles.forEach((particle, i) => {
        this.dummy.position.set(
          particle.x,
          Math.max(0.08, particle.y),
          particle.z,
        );
        this.dummy.rotation.set(particle.life * 3, particle.life, 0);
        this.dummy.scale.setScalar(
          particle.scale * Math.min(1, (particle.life / particle.max) * 2),
        );
        this.dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this.dummy.matrix);
        this.particleMesh.setColorAt(i, particle.color);
      });
      this.particleMesh.count = this.particles.length;
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor)
        this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.trails = this.trails.filter((trail) => {
      trail.life -= dt;
      if (trail.life <= 0) {
        this.scene.remove(trail.mesh);
        return false;
      }
      trail.mesh.scale.x = trail.mesh.scale.z =
        (0.015 * trail.life) / trail.max;
      return true;
    });
    const hostW = this.host.clientWidth;
    const hostH = this.host.clientHeight;
    for (const pop of this.popups) {
      if (!pop.active) continue;
      pop.life -= dt;
      if (pop.life <= 0 || !playing) {
        pop.active = false;
        pop.el.style.display = "none";
        continue;
      }
      pop.y += dt * 1.15;
      this.tempVec.set(pop.x, pop.y, pop.z).project(this.camera);
      const sx = (this.tempVec.x * 0.5 + 0.5) * hostW;
      const sy = (-this.tempVec.y * 0.5 + 0.5) * hostH;
      const ratio = pop.life / pop.max;
      const scale = ratio > 0.8 ? 1.18 : 1;
      pop.el.style.opacity = String(Math.min(1, ratio * 2.1));
      pop.el.style.transform = `translate3d(${sx.toFixed(0)}px, ${sy.toFixed(0)}px, 0) translate(-50%, -50%) scale(${scale})`;
    }
    if (this.state !== "playing") this.readGamepad();
  }
  private copySnapshot(): GameSnapshot {
    this.syncWeapon();
    return {
      ...this.snapshot,
      gold: Math.floor(this.snapshot.gold),
      health: Math.max(0, Math.round(this.snapshot.health)),
      companions: this.companions
        .filter((c) => c.recruited)
        .map((c) => Math.round(c.hp)),
    };
  }

  private emit() {
    this.callbacks.onSnapshot(this.copySnapshot());
  }

  getSnapshot() {
    return this.copySnapshot();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.clearRun();
    this.geometryCache.forEach((g) => g.dispose());
    this.materialCache.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    this.ash.geometry.dispose();
    (this.ash.material as THREE.Material).dispose();
    this.embers.geometry.dispose();
    (this.embers.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.sun.shadow.dispose();
    this.audio.dispose();
    this.host.replaceChildren();
  }
}
