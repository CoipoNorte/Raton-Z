import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CircleHelp,
  Coins,
  Crosshair,
  Flame,
  Gamepad2,
  Heart,
  Keyboard,
  Layers3,
  Maximize2,
  Moon,
  Package,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Shield,
  Skull,
  Sparkles,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wind,
  Zap,
  Magnet,
  Bomb,
  HeartPulse,
  Clover,
  Sword,
  ShieldPlus,
} from "lucide-react";
import {
  ArrowLink,
  GithubMark,
  Joystick,
  Modal,
  MouseMark,
  Portrait,
  Switch,
} from "./components";
import { RatonGame } from "./game/engine";
import {
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
} from "./game/storage";
import {
  CHARACTERS,
  DRAFT_PERKS,
  EMPTY_PROFILE,
  WEAPONS,
  INITIAL_SNAPSHOT,
  RUN_UPGRADES,
  calculateRunEmbers,
  formatTime,
  type CharacterId,
  type DraftPerkId,
  type EmberBreakdown,
  type GameSettings,
  type GameSnapshot,
  type GameStatus,
  type PermanentUpgradeId,
  type Profile,
  type UpgradeId,
} from "./game/types";

type ModalType = "survivors" | "leaderboard" | "settings" | "help" | null;
const upgradeIcons: Record<string, ReactNode> = {
  crosshair: <Crosshair />,
  layers: <Layers3 />,
  heart: <Heart />,
  wind: <Wind />,
  sparkles: <Sparkles />,
  shield: <Shield />,
  users: <Users />,
  zap: <Zap />,
  magnet: <Magnet />,
  bomb: <Bomb />,
  pulse: <HeartPulse />,
  clover: <Clover />,
  target: <Target />,
  shieldPlus: <ShieldPlus />,
  ammo: <Package />,
  knife: <Sword />,
  coins: <Coins />,
};

const PERMANENT_UPGRADES: {
  id: PermanentUpgradeId;
  name: string;
  description: string;
  base: number;
  step: number;
  max: number;
  icon: ReactNode;
}[] = [
  {
    id: "vitality",
    name: "Corazón valiente",
    description: "+10 de vida por nivel",
    base: 6,
    step: 5,
    max: 20,
    icon: <Heart />,
  },
  {
    id: "damage",
    name: "Instinto afilado",
    description: "+8% de daño por nivel",
    base: 8,
    step: 6,
    max: 20,
    icon: <Target />,
  },
  {
    id: "speed",
    name: "Siempre un paso más",
    description: "+4% de velocidad por nivel",
    base: 8,
    step: 6,
    max: 20,
    icon: <Wind />,
  },
  {
    id: "armor",
    name: "Segunda piel",
    description: "-4% de daño recibido por nivel",
    base: 10,
    step: 8,
    max: 16,
    icon: <Shield />,
  },
  {
    id: "gold",
    name: "Mano de oro",
    description: "+8% de oro ganado por nivel",
    base: 8,
    step: 7,
    max: 16,
    icon: <Coins />,
  },
  {
    id: "dash",
    name: "Fuelle",
    description: "-8% de recarga de esquiva por nivel",
    base: 10,
    step: 8,
    max: 12,
    icon: <Zap />,
  },
  {
    id: "reload",
    name: "Cargador táctico",
    description: "+11% recarga y +15% reserva por nivel",
    base: 8,
    step: 6,
    max: 16,
    icon: <Layers3 />,
  },
  {
    id: "crit",
    name: "Instinto crítico",
    description: "+5% de golpe crítico ×2 por nivel",
    base: 10,
    step: 8,
    max: 16,
    icon: <Crosshair />,
  },
  {
    id: "embers",
    name: "Cosecha de brasas",
    description: "+15% Ánima y +14% brasas por nivel",
    base: 10,
    step: 8,
    max: 16,
    icon: <Sparkles />,
  },
  {
    id: "startShield",
    name: "Barrera inicial",
    description: "Empiezas cada noche con +6 s de escudo por nivel",
    base: 12,
    step: 9,
    max: 10,
    icon: <ShieldPlus />,
  },
  {
    id: "startAmmo",
    name: "Alijo reservado",
    description: "Empiezas con la escopeta y +6 balas por nivel",
    base: 10,
    step: 8,
    max: 12,
    icon: <Package />,
  },
  {
    id: "accuracy",
    name: "Pulso maestro",
    description: "+1,2% de precisión por nivel",
    base: 12,
    step: 9,
    max: 10,
    icon: <Target />,
  },
];

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<RatonGame | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<GameStatus>("menu");
  const statusRef = useRef<GameStatus>("menu");
  const [character, setCharacter] = useState<CharacterId>("mouse");
  const characterRef = useRef<CharacterId>("mouse");
  const [runCharacter, setRunCharacter] = useState<CharacterId>("mouse");
  const runCharacterRef = useRef<CharacterId>("mouse");
  const [profile, setProfile] = useState<Profile>(
    structuredClone(EMPTY_PROFILE),
  );
  const profileRef = useRef(profile);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const settingsRef = useRef(settings);
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    ...INITIAL_SNAPSHOT,
  });
  const [modal, setModal] = useState<ModalType>(null);
  const modalRef = useRef<ModalType>(null);
  const resumeAfterModal = useRef(false);
  const [helpTab, setHelpTab] = useState<"keyboard" | "touch" | "gamepad">(
    "keyboard",
  );
  const [notice, setNotice] = useState<{
    title: string;
    subtitle?: string;
    id: number;
  } | null>(null);
  const noticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rewards, setRewards] = useState(0);
  const [rewardBreakdown, setRewardBreakdown] = useState<EmberBreakdown | null>(
    null,
  );
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [purchased, setPurchased] = useState<UpgradeId | null>(null);
  const [levelChoices, setLevelChoices] = useState<DraftPerkId[]>([]);
  const levelChoicesRef = useRef<DraftPerkId[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const handlers = useRef({
    start: () => {},
    pause: () => {},
    closeModal: () => {},
    chooseDraft: (_index: number) => {},
    gameOver: (_snapshot: GameSnapshot) => {},
  });

  const changeStatus = useCallback((next: GameStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);
  const selected = CHARACTERS.find((c) => c.id === character)!;
  const activeCharacter = CHARACTERS.find((c) => c.id === runCharacter)!;
  const best = profile.records[0]?.score || 0;
  const inGame = status !== "menu";

  const showNotice = useCallback((title: string, subtitle?: string) => {
    if (noticeTimeout.current) clearTimeout(noticeTimeout.current);
    setNotice({ title, subtitle, id: performance.now() });
    noticeTimeout.current = setTimeout(() => setNotice(null), 3200);
  }, []);

  useEffect(() => {
    let active = true;
    void loadProfile().then((value) => {
      if (active) {
        profileRef.current = value;
        setProfile(value);
        setStorageLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!host.current) return;
    try {
      const engine = new RatonGame(host.current, settingsRef.current, {
        onSnapshot: setSnapshot,
        onReady: () => setReady(true),
        onError: setError,
        onNotice: showNotice,
        onPause: () => handlers.current.pause(),
        onStart: () => handlers.current.start(),
        onUpgrade: () => {
          changeStatus("upgrade");
          setPurchased(null);
        },
        onLevelUp: (choices) => {
          levelChoicesRef.current = choices;
          setLevelChoices(choices);
          if (choices.length > 0) changeStatus("levelup");
          else if (statusRef.current === "levelup") changeStatus("playing");
        },
        onGameOver: (value) => handlers.current.gameOver(value),
      });
      game.current = engine;
      return () => {
        engine.dispose();
        game.current = null;
      };
    } catch (reason) {
      console.error(reason);
      setError(
        "Tu navegador no pudo iniciar WebGL. Activa la aceleración gráfica o prueba un navegador actualizado.",
      );
    }
  }, [changeStatus, showNotice]);

  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
    game.current?.setSettings(settings);
  }, [settings]);

  const persist = (next: Profile) => {
    profileRef.current = next;
    setProfile(next);
    setSaved(false);
    setSaveError(false);
    void saveProfile(next)
      .then(() => setSaved(true))
      .catch(() => {
        setSaveError(true);
        showNotice(
          "PROGRESO SIN GUARDAR",
          "El almacenamiento de este navegador está restringido.",
        );
      });
  };

  const recordRun = (result: GameSnapshot) => {
    const previous = profileRef.current;
    const breakdown = calculateRunEmbers(result, previous.upgrades.embers || 0);
    const earned = breakdown.total;
    const record = {
      id: crypto.randomUUID(),
      character: runCharacterRef.current,
      score: result.score,
      kills: result.kills,
      time: result.time,
      date: new Date().toISOString(),
    };
    persist({
      ...previous,
      tokens: previous.tokens + earned,
      totalRuns: previous.totalRuns + 1,
      totalKills: previous.totalKills + result.kills,
      records: [...previous.records, record]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10),
    });
    setRewards(earned);
    setRewardBreakdown(breakdown);
  };

  const start = () => {
    if (!game.current || !ready || !storageLoaded) return;
    resumeAfterModal.current = false;
    runCharacterRef.current = characterRef.current;
    setRunCharacter(characterRef.current);
    modalRef.current = null;
    setModal(null);
    levelChoicesRef.current = [];
    setLevelChoices([]);
    changeStatus("playing");
    setRewards(0);
    setRewardBreakdown(null);
    game.current.start(characterRef.current, profileRef.current);
  };

  const pause = () => {
    if (modalRef.current) return;
    const current = statusRef.current;
    if (current === "playing") {
      game.current?.pause(true);
      changeStatus("paused");
    } else if (current === "paused" || current === "upgrade") {
      game.current?.pause(false);
      changeStatus("playing");
    }
  };

  const goMenu = () => {
    if (
      statusRef.current === "playing" ||
      statusRef.current === "paused" ||
      statusRef.current === "upgrade"
    ) {
      const result = game.current?.getSnapshot();
      if (result && result.score > 0) recordRun(result);
    }
    changeStatus("menu");
    setModal(null);
    modalRef.current = null;
    resumeAfterModal.current = false;
    setNotice(null);
    game.current?.menu(characterRef.current);
  };

  const selectCharacter = (id: CharacterId) => {
    setCharacter(id);
    characterRef.current = id;
    game.current?.preview(id);
  };

  const openModal = (type: ModalType) => {
    if (!modalRef.current)
      resumeAfterModal.current = statusRef.current === "playing";
    if (resumeAfterModal.current && statusRef.current === "playing") {
      game.current?.pause(true);
      changeStatus("paused");
    }
    modalRef.current = type;
    setModal(type);
  };

  const closeModal = () => {
    modalRef.current = null;
    setModal(null);
    if (resumeAfterModal.current) {
      game.current?.pause(false);
      changeStatus("playing");
      resumeAfterModal.current = false;
    }
  };

  handlers.current = {
    start,
    pause,
    closeModal,
    chooseDraft: (index) => {
      const choice = levelChoicesRef.current[index];
      if (choice) game.current?.chooseDraft(index);
    },
    gameOver: (result) => {
      changeStatus("over");
      setSnapshot(result);
      setNotice(null);
      recordRun(result);
    },
  };

  useEffect(() => {
    const keys = new Set<string>();
    const updateMovement = () => {
      if (!game.current) return;
      game.current.input.x =
        Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"));
      game.current.input.y =
        Number(keys.has("KeyS") || keys.has("ArrowDown")) -
        Number(keys.has("KeyW") || keys.has("ArrowUp"));
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        event.preventDefault();
        if (modalRef.current) handlers.current.closeModal();
        else handlers.current.pause();
        return;
      }
      if (modalRef.current) return;
      if (
        statusRef.current === "levelup" &&
        ["Digit1", "Digit2", "Digit3"].includes(event.code)
      ) {
        event.preventDefault();
        handlers.current.chooseDraft(Number(event.code.slice(-1)) - 1);
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)
      )
        return;
      const focusedButton =
        event.target instanceof HTMLElement && event.target.closest("button");
      if (
        statusRef.current === "menu" &&
        event.code === "Enter" &&
        !event.repeat &&
        !focusedButton
      ) {
        event.preventDefault();
        handlers.current.start();
        return;
      }
      if (
        statusRef.current === "over" &&
        !event.repeat &&
        (event.code === "KeyR" || (event.code === "Enter" && !focusedButton))
      ) {
        event.preventDefault();
        handlers.current.start();
        return;
      }
      if (event.code === "KeyP" && !event.repeat) {
        handlers.current.pause();
        return;
      }
      if (statusRef.current !== "playing" || !game.current) return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowLeft",
          "ArrowDown",
          "ArrowRight",
          "Space",
        ].includes(event.code)
      )
        event.preventDefault();
      keys.add(event.code);
      updateMovement();
      if (event.code === "Space") game.current.input.attack = true;
      if (event.code === "KeyE") {
        game.current.input.interact = true;
        if (!event.repeat) game.current.interact();
      }
      if (event.code === "KeyQ" && !event.repeat) game.current.toggleWeapon();
      if (event.code === "KeyR" && !event.repeat) game.current.reload();
      if (event.code === "KeyF" && !event.repeat) game.current.knifeSlash();
      if (event.code === "Digit1" && !event.repeat) game.current.chooseDraft(0);
      if (event.code === "Digit2" && !event.repeat) game.current.chooseDraft(1);
      if (event.code === "Digit3" && !event.repeat) game.current.chooseDraft(2);
      if (
        (event.code === "ShiftLeft" || event.code === "ShiftRight") &&
        !event.repeat
      )
        game.current.dash();
    };
    const keyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
      updateMovement();
      if (!game.current) return;
      if (event.code === "Space") game.current.input.attack = false;
      if (event.code === "KeyE") game.current.input.interact = false;
    };
    const blur = () => {
      keys.clear();
      updateMovement();
      if (game.current)
        game.current.input.attack = game.current.input.interact = false;
      if (statusRef.current === "playing" && !modalRef.current)
        handlers.current.pause();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      if (noticeTimeout.current) clearTimeout(noticeTimeout.current);
    };
  }, []);

  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  const setSetting = <K extends keyof GameSettings>(
    key: K,
    value: GameSettings[K],
  ) => {
    if (key === "sound" || key === "ambience") game.current?.audio.unlock();
    setSettings((previous) => ({ ...previous, [key]: value }));
  };

  const buyPermanent = (type: keyof Profile["upgrades"]) => {
    const current = profileRef.current;
    const level = current.upgrades[type];
    const config = PERMANENT_UPGRADES.find((u) => u.id === type)!;
    const cost = config.base + level * config.step;
    if (current.tokens < cost || level >= config.max) return;
    persist({
      ...current,
      tokens: current.tokens - cost,
      upgrades: { ...current.upgrades, [type]: level + 1 },
    });
    game.current?.audio.unlock();
    game.current?.audio.play("upgrade");
  };

  const spentEmbers = PERMANENT_UPGRADES.reduce((sum, u) => {
    const lvl = profile.upgrades[u.id] || 0;
    let costSum = 0;
    for (let i = 0; i < lvl; i++) costSum += u.base + i * u.step;
    return sum + costSum;
  }, 0);

  const refundPermanent = () => {
    const current = profileRef.current;
    let refunded = 0;
    for (const u of PERMANENT_UPGRADES) {
      const lvl = current.upgrades[u.id] || 0;
      for (let i = 0; i < lvl; i++) refunded += u.base + i * u.step;
    }
    if (refunded <= 0) return;
    persist({
      ...current,
      tokens: current.tokens + refunded,
      upgrades: { ...EMPTY_PROFILE.upgrades },
    });
    game.current?.audio.unlock();
    game.current?.audio.play("upgrade");
  };

  const buyRunUpgrade = (id: UpgradeId) => {
    if (game.current?.buyUpgrade(id)) {
      setPurchased(id);
      setTimeout(() => setPurchased(null), 1500);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement)
      void document
        .exitFullscreen()
        .catch(() =>
          showNotice(
            "PANTALLA COMPLETA",
            "Tu navegador no permite salir de este modo.",
          ),
        );
    else if (!document.documentElement.requestFullscreen)
      showNotice(
        "PANTALLA COMPLETA NO DISPONIBLE",
        "Este navegador no admite el modo de pantalla completa.",
      );
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() =>
          showNotice(
            "PANTALLA COMPLETA NO DISPONIBLE",
            "Prueba a instalar el juego o gira tu dispositivo.",
          ),
        );
  };

  return (
    <div
      className={`app ${inGame ? "in-game" : "in-menu"} ${snapshot.hurt && status === "playing" ? "is-hurt" : ""}`}
    >
      <div className="world" ref={host} />
      <div className="world-vignette" />
      <div className="film-grain" />
      {!inGame && <div className="menu-shade" />}
      <header className="site-header">
        <button
          className="brand"
          aria-label={
            inGame ? "Ratón Z, pausar o volver al refugio" : "Ratón Z, inicio"
          }
          onClick={() => {
            if (statusRef.current === "menu") closeModal();
            else if (statusRef.current === "over") goMenu();
            else pause();
          }}
        >
          <span className="brand-mark">
            <MouseMark />
          </span>
          <span className="brand-word">
            RATÓN<span>Z</span>
          </span>
          <span className="brand-edition">
            SURVIVAL
            <br />
            ROGUELIKE
          </span>
        </button>
        {!inGame ? (
          <nav className="main-nav" aria-label="Navegación principal">
            <button className={!modal ? "active" : ""} onClick={closeModal}>
              Jugar
            </button>
            <button
              className={modal === "survivors" ? "active" : ""}
              onClick={() => openModal("survivors")}
            >
              Supervivientes
            </button>
            <button
              className={modal === "leaderboard" ? "active" : ""}
              onClick={() => openModal("leaderboard")}
            >
              Clasificación <ArrowUpRight size={12} />
            </button>
          </nav>
        ) : (
          <div className="run-label">
            <span className="live-dot" />
            LA NOCHE NO ESPERA <span className="header-separator">/</span>
            <span>OLEADA {String(snapshot.wave).padStart(2, "0")}</span>
          </div>
        )}
        <div className="header-actions">
          <button
            className="icon-button audio-button"
            aria-label={settings.sound ? "Silenciar sonido" : "Activar sonido"}
            title={settings.sound ? "Silenciar sonido" : "Activar sonido"}
            onClick={() => setSetting("sound", !settings.sound)}
          >
            {settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="icon-button help-button"
            aria-label="Cómo jugar"
            title="Cómo jugar"
            onClick={() => openModal("help")}
          >
            <CircleHelp size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Configuración"
            title="Configuración"
            onClick={() => openModal("settings")}
          >
            <Settings2 size={18} />
          </button>
          <span className="header-action-divider" />
          {inGame ? (
            <button
              className="icon-button"
              aria-label={
                status === "over"
                  ? "Reiniciar partida"
                  : status === "playing"
                    ? "Pausar partida"
                    : "Reanudar partida"
              }
              onClick={status === "over" ? start : pause}
            >
              {status === "over" ? (
                <RotateCcw size={18} />
              ) : status === "playing" ? (
                <Pause size={18} />
              ) : (
                <Play size={18} />
              )}
            </button>
          ) : (
            <a
              className="icon-button github-link"
              href="https://github.com/CoipoNorte/Raton-Z"
              target="_blank"
              rel="noreferrer"
              aria-label="Repositorio oficial de GitHub"
              title="Repositorio oficial"
            >
              <GithubMark size={19} />
            </a>
          )}
        </div>
      </header>

      {status === "menu" && (
        <main className="start-screen">
          <div className="start-content">
            <div className="hero-eyebrow intro-1">
              <span />
              PEQUEÑOS HÉROES. GRANDES PESADILLAS.
            </div>
            <h1 className="game-title intro-2">
              RATÓN
              <span className="title-z">
                Z<i />
              </span>
              <span className="title-period">.</span>
            </h1>
            <h2 className="hero-subtitle intro-3">
              La oscuridad cambia.
              <br />
              El instinto sobrevive.
            </h2>
            <p className="hero-description intro-3">
              No sabes qué hay tras la próxima puerta.
              <br className="desktop-break" /> Solo sabes que no puedes quedarte
              aquí.
            </p>
            <div className="character-picker intro-4">
              <div className="picker-heading">
                <span>ELIGE A TU SUPERVIVIENTE</span>
                <span>
                  0{CHARACTERS.findIndex((c) => c.id === character) + 1}
                  <span className="muted"> / 03</span>
                </span>
              </div>
              <div
                className="character-options"
                role="group"
                aria-label="Elige a tu superviviente"
              >
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    className={`character-option ${character === c.id ? "selected" : ""}`}
                    onClick={() => selectCharacter(c.id)}
                    aria-pressed={character === c.id}
                  >
                    <Portrait character={c.id} />
                    <span>{c.name}</span>
                    {character === c.id && (
                      <Check size={10} className="character-check" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="start-actions intro-5">
              <button
                className="primary-button start-button"
                onClick={start}
                disabled={!ready || !storageLoaded || Boolean(error)}
              >
                <Play size={17} fill="currentColor" />
                <span>
                  {ready && storageLoaded
                    ? "SOBREVIVE A LA NOCHE"
                    : "PREPARANDO EL REFUGIO"}
                </span>
                <ArrowRight size={19} />
              </button>
              <div className="start-button-caption">
                <span>
                  <span className="tiny-key">↵</span> ENTER PARA EMPEZAR
                </span>
                <span>JUEGA GRATIS. SIN DESCARGAS.</span>
              </div>
            </div>
            <div className="first-night intro-5">
              <span>¿Tu primera noche?</span>
              <ArrowLink onClick={() => openModal("help")}>
                Aprende a sobrevivir
              </ArrowLink>
            </div>
            {error && (
              <div className="error-message" role="alert">
                {error}
                <button onClick={() => location.reload()}>
                  Reintentar <RotateCcw size={13} />
                </button>
              </div>
            )}
          </div>
        </main>
      )}

      {inGame && (
        <>
          <div className="game-hud">
            <div className="health-hud">
              <div className="hud-portrait">
                <Portrait character={runCharacter} />
              </div>
              <div>
                <div className="health-heading">
                  <span>{activeCharacter.name.toUpperCase()}</span>
                  <span>
                    {snapshot.shieldTime > 0 && (
                      <span className="shield-tag">
                        <Shield size={9} />
                        {Math.ceil(snapshot.shieldTime)}s
                      </span>
                    )}
                    <Heart size={10} />
                    {Math.ceil(snapshot.health)}{" "}
                    <span className="muted">/ {snapshot.maxHealth}</span>
                  </span>
                </div>
                <div className="health-track">
                  <div
                    style={{
                      width: `${(snapshot.health / snapshot.maxHealth) * 100}%`,
                    }}
                  />
                </div>
                {snapshot.shieldTime > 0 && (
                  <div className="shield-track">
                    <i
                      style={{
                        width: `${(snapshot.shieldTime / snapshot.shieldMax) * 100}%`,
                      }}
                    />
                  </div>
                )}
                <div className="xp-track-row">
                  <span className="xp-level">NV.{snapshot.level}</span>
                  <div className="xp-track">
                    <i
                      style={{
                        width: `${Math.min(100, (snapshot.xp / Math.max(1, snapshot.xpNext)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="health-caption">
                  {snapshot.biome.toUpperCase()}
                </div>
              </div>
            </div>
            <div className="time-hud">
              <span className="run-time">{formatTime(snapshot.time)}</span>{" "}
              <span className="darkness">
                <Moon size={11} />
                {Math.round(snapshot.darkness)}% OSC. · HORDA ×
                {snapshot.enemyPower.toFixed(1)}
              </span>
              {snapshot.modifier && (
                <span className="wave-modifier">
                  MODIFICADOR · {snapshot.modifier}
                </span>
              )}
              {snapshot.frenzyTime > 0 ? (
                <span className="frenzy-badge">
                  FRENESÍ ÁMBAR · {Math.ceil(snapshot.frenzyTime)}S
                </span>
              ) : (
                snapshot.pressure > 1.05 && (
                  <span className="threat">
                    AMENAZA ×{snapshot.pressure.toFixed(1)}
                  </span>
                )
              )}
            </div>
            <div className="score-hud">
              <span className="hud-label">PUNTUACIÓN</span>
              <strong>
                {snapshot.score.toLocaleString("es-CL").padStart(4, "0")}
              </strong>
              <div>
                <span>
                  <Skull size={12} />
                  {snapshot.kills}
                </span>
                <span>
                  <Coins size={12} />
                  {Math.floor(snapshot.gold)}
                  {snapshot.goldMultiplier > 1 && (
                    <i className="gold-multiplier">×2</i>
                  )}
                </span>
                {snapshot.combo >= 2 && (
                  <span className="combo">
                    ×{Math.floor(snapshot.combo)} COMBO
                  </span>
                )}
              </div>
              {snapshot.activeBounty && (
                <aside className="bounty-tracker">
                  <strong>{snapshot.activeBounty.title}</strong>
                  <span>
                    {snapshot.activeBounty.progress} ·{" "}
                    <em>{snapshot.activeBounty.reward}</em>
                  </span>
                </aside>
              )}
            </div>
          </div>
          {status === "playing" && snapshot.draftChoices.length > 0 && (
            <div className="draft-strip" aria-label="Elige un don de nivel">
              <div className="draft-head">
                <span>
                  <Sparkles size={12} /> INSTINTO DESPIERTO · NIVEL{" "}
                  {snapshot.level}
                </span>
                <small>ELIGE UN DON (1-3)</small>
              </div>
              <div className="draft-cards">
                {snapshot.draftChoices.map((id, idx) => {
                  const perk = DRAFT_PERKS[id];
                  return (
                    <button
                      key={id}
                      className="draft-card"
                      onClick={() => game.current?.chooseDraft(idx)}
                    >
                      <kbd>{idx + 1}</kbd>
                      <div>
                        <span className="draft-tag">{perk.tag}</span>
                        <strong>{perk.name}</strong>
                        <small>{perk.desc}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="draft-timer">
                <i
                  style={{
                    width: `${Math.min(100, (snapshot.draftTimer / 9) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
          {notice &&
            status === "playing" &&
            snapshot.draftChoices.length === 0 && (
              <div className="game-notice" key={notice.id} role="status">
                <span className="notice-line" />
                <h3>{notice.title}</h3>
                {notice.subtitle && <p>{notice.subtitle}</p>}
              </div>
            )}
          <div
            className="weapon-hud"
            onClick={() => game.current?.reload()}
            title="Pulsa R o toca para recargar"
          >
            <div className="weapon-symbol">
              <Crosshair size={29} strokeWidth={1.4} />
            </div>
            <div>
              <span
                className={`hud-label ${snapshot.reloading > 0 ? "reloading-label" : ""}`}
              >
                {snapshot.reloading > 0
                  ? "RECARGANDO CARGADOR..."
                  : `${snapshot.weapon === "pistol" ? "TU VIEJA CONFIABLE" : "BOTÍN DE GUERRA"} · ${snapshot.accuracy}% PREC.`}
              </span>
              <strong>
                {WEAPONS[snapshot.weapon].name.toUpperCase()}
                <span>
                  {snapshot.clip}
                  <small className="ammo-sep">/</small>
                  {snapshot.weapon === "pistol" ? "∞" : snapshot.ammo}
                </span>
              </strong>
              <div
                className={`clip-bar ${snapshot.reloading > 0 ? "is-reloading" : ""}`}
              >
                <i
                  style={{
                    width: `${
                      snapshot.reloading > 0
                        ? snapshot.reloading * 100
                        : (snapshot.clip / Math.max(1, snapshot.clipMax)) * 100
                    }%`,
                  }}
                />
              </div>
              <span className="weapon-switch">
                <kbd>Q</kbd> ARMA · <kbd>R</kbd> RECARGA
                <span className="ammo-available">
                  · {WEAPONS[snapshot.weapon].range} PASOS
                  {snapshot.arsenal.length > 0 &&
                    " · " + (snapshot.arsenal.length + 1) + " ARMAS"}
                </span>
              </span>
            </div>
          </div>
          {snapshot.companions.length > 0 && (
            <div className="companions-hud">
              {snapshot.companions.map((health, index) => (
                <div key={index}>
                  <Portrait character="rabbit" />
                  <div>
                    <span>COMPAÑERO 0{index + 1}</span>
                    <div className="companion-health">
                      <i style={{ width: `${Math.min(100, health)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {status === "playing" && (
            <>
              <Joystick game={game} mode={settings.joystick} />
              <div className="action-controls">
                <button
                  className={`action-knife ${snapshot.knife >= 1 ? "ready" : ""}`}
                  aria-label="Cuchillazo, F"
                  disabled={snapshot.knife < 1}
                  style={
                    {
                      "--knife-progress": `${snapshot.knife * 100}%`,
                    } as CSSProperties
                  }
                  onClick={() => game.current?.knifeSlash()}
                >
                  {snapshot.knife >= 1 ? (
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m14.5 4.5 5 5-9.5 9.5H5v-5l9.5-9.5Z" />
                      <path d="m12 7 5 5" />
                      <path d="m3 21 3-3" />
                    </svg>
                  ) : (
                    <span className="knife-cd">
                      {snapshot.knifeCooldownLeft}s
                    </span>
                  )}
                  <span className="action-key">F</span>
                </button>
                <button
                  className="action-swap"
                  aria-label="Cambiar arma, Q"
                  onClick={() => game.current?.toggleWeapon()}
                >
                  <RotateCcw size={19} />
                  <span>Q</span>
                </button>
                <button
                  className={`action-b ${snapshot.context ? "available" : ""}`}
                  disabled={!snapshot.context}
                  aria-label="Interactuar, E"
                  onClick={(event) => {
                    if (event.detail === 0) game.current?.interact();
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    if (game.current) {
                      game.current.input.interact = true;
                      game.current.interact();
                    }
                  }}
                  onPointerUp={() => {
                    if (game.current) game.current.input.interact = false;
                  }}
                  onPointerCancel={() => {
                    if (game.current) game.current.input.interact = false;
                  }}
                >
                  <span>B</span>
                  <span className="action-key">E</span>
                </button>
                <button
                  className="action-a"
                  aria-label="Disparar, espacio"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    if (game.current) game.current.input.attack = true;
                  }}
                  onPointerUp={() => {
                    if (game.current) game.current.input.attack = false;
                  }}
                  onPointerCancel={() => {
                    if (game.current) game.current.input.attack = false;
                  }}
                >
                  <Crosshair size={28} />
                  <span>A</span>
                </button>
                <button
                  className="dash-button"
                  aria-label="Esquivar, Shift"
                  style={
                    {
                      "--dash-progress": `${snapshot.dash * 100}%`,
                    } as CSSProperties
                  }
                  onClick={() => game.current?.dash()}
                  disabled={snapshot.dash < 1}
                >
                  <Zap size={15} />
                  <span>ESQUIVAR</span>
                </button>
              </div>
              {snapshot.context && (
                <div className="context-prompt">
                  <kbd>E</kbd>
                  <div>
                    <strong>
                      {snapshot.context === "fire"
                        ? "UN RESPIRO JUNTO AL FUEGO"
                        : snapshot.context === "survivor"
                          ? "NO TIENES QUE IR SOLO"
                          : snapshot.context === "crate"
                            ? "SUMINISTROS DEL EJÉRCITO"
                            : "ABRE TU PROPIO CAMINO"}
                    </strong>
                    <span>
                      {snapshot.context === "fire"
                        ? "Mejoras de la partida"
                        : snapshot.context === "survivor"
                          ? "Reclutar superviviente"
                          : snapshot.context === "crate"
                            ? "Pulsa E o corta con el cuchillo para abrir"
                            : "Mantén para retirar escombros"}
                    </span>
                    {snapshot.context === "rubble" && (
                      <div className="rubble-progress">
                        <i
                          style={{
                            width: `${snapshot.contextProgress * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {snapshot.context === "fire" ? (
                    <Flame size={22} />
                  ) : snapshot.context === "survivor" ? (
                    <Users size={22} />
                  ) : snapshot.context === "crate" ? (
                    <Package size={22} />
                  ) : (
                    <Layers3 size={22} />
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <footer className="site-footer">
        <div className="footer-location">
          <Flame size={15} />
          <span>{inGame ? snapshot.biome.toUpperCase() : "EL REFUGIO"}</span>
          <i />
          <span className="location-status">
            {inGame ? "NO BAJES LA GUARDIA" : "POR AHORA, ESTÁS A SALVO"}
          </span>
        </div>
        <div className="footer-controls">
          <span>
            <kbd>W</kbd>
            <span className="wasd-bottom">
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
            </span>
            <span>Moverte</span>
          </span>
          <span>
            <kbd className="wide-key">ESPACIO</kbd> Paso firme
          </span>
          <span>
            <kbd>F</kbd> Cuchillo
          </span>
          <span>
            <kbd>R</kbd> Recargar
          </span>
          <span>
            <kbd>E</kbd> Interactuar
          </span>
          <span>
            <kbd>Q</kbd> Arma
          </span>
        </div>
        <div className="footer-right">
          {inGame ? (
            <button
              className="icon-button fullscreen-button"
              aria-label={
                fullscreen ? "Salir de pantalla completa" : "Pantalla completa"
              }
              onClick={toggleFullscreen}
            >
              <Maximize2 size={15} />
            </button>
          ) : (
            <button
              className="gamepad-ready"
              onClick={() => {
                setHelpTab("gamepad");
                openModal("help");
              }}
            >
              <Gamepad2 size={17} />
              <span>LISTO PARA MANDO</span>
            </button>
          )}
          <span className="version">v.1.0</span>
        </div>
      </footer>

      {status === "paused" && !modal && (
        <Modal
          title="TODAVÍA SIGUES AQUÍ."
          eyebrow="PARTIDA EN PAUSA"
          onClose={pause}
          className="pause-modal compact-modal"
        >
          <p className="modal-lead">
            Toma aire. La oscuridad puede esperar un momento.
          </p>
          <div className="pause-summary">
            <div>
              <span>TIEMPO</span>
              <strong>{formatTime(snapshot.time)}</strong>
            </div>
            <div>
              <span>PUNTOS</span>
              <strong>{snapshot.score.toLocaleString("es-CL")}</strong>
            </div>
            <div>
              <span>BAJAS</span>
              <strong>{snapshot.kills}</strong>
            </div>
          </div>
          <button className="primary-button" onClick={pause}>
            <Play size={16} fill="currentColor" />
            VOLVER A LA NOCHE
            <ArrowRight size={18} />
          </button>
          <button
            className="secondary-button"
            onClick={() => openModal("settings")}
          >
            <Settings2 size={16} />
            Configuración
          </button>
          <button className="subtle-button" onClick={goMenu}>
            Terminar partida y volver al refugio
          </button>
          <span className="pause-key">
            <kbd>ESC</kbd> para continuar
          </span>
        </Modal>
      )}

      {status === "over" && !modal && (
        <Modal
          title="LA NOCHE GANA."
          eyebrow="PERO NO PARA SIEMPRE"
          onClose={goMenu}
          className="gameover-modal compact-modal"
          closeAutoFocus={false}
        >
          <div className="gameover-mark">
            <MouseMark />
            <span>VOLVERÁS A INTENTARLO.</span>
          </div>
          <div className="final-score">
            <span>TU PUNTUACIÓN</span>
            <strong>{snapshot.score.toLocaleString("es-CL")}</strong>
            {snapshot.score >= best && snapshot.score > 0 && (
              <span className="new-best">
                <Trophy size={13} />
                NUEVO RÉCORD PERSONAL
              </span>
            )}
          </div>
          <div className="pause-summary">
            <div>
              <span>SOBREVIVISTE</span>
              <strong>{formatTime(snapshot.time)}</strong>
            </div>
            <div>
              <span>BAJAS</span>
              <strong>{snapshot.kills}</strong>
            </div>
            <div>
              <span>OLEADA</span>
              <strong>{String(snapshot.wave).padStart(2, "0")}</strong>
            </div>
          </div>
          <div className="run-reward">
            <Sparkles size={17} />
            <span>
              +{rewards} {rewards === 1 ? "brasa" : "brasas"} para tu legado
            </span>
            <span className="saved-status">
              {saveError ? (
                <CircleHelp size={12} />
              ) : saved ? (
                <Check size={12} />
              ) : (
                <span className="saving-dot" />
              )}
              {saveError
                ? "SOLO ESTA SESIÓN"
                : saved
                  ? "GUARDADO"
                  : "GUARDANDO"}
            </span>
          </div>
          {rewardBreakdown && rewardBreakdown.total > 1 && (
            <div className="reward-breakdown">
              {rewardBreakdown.scorePart > 0 && (
                <span>PUNTOS +{rewardBreakdown.scorePart}</span>
              )}
              {rewardBreakdown.combatPart > 0 && (
                <span>OLEADAS/BAJAS +{rewardBreakdown.combatPart}</span>
              )}
              {rewardBreakdown.bountyPart > 0 && (
                <span>CONTRATOS/COFRES +{rewardBreakdown.bountyPart}</span>
              )}
              {rewardBreakdown.legacyBonus > 0 && (
                <span>COSECHA +{rewardBreakdown.legacyBonus}</span>
              )}
            </div>
          )}
          <button className="primary-button" onClick={start} autoFocus>
            <RotateCcw size={17} />
            UNA NOCHE MÁS
            <ArrowRight size={18} />
          </button>
          <button
            className="secondary-button legacy-jump"
            onClick={() => {
              goMenu();
              openModal("survivors");
            }}
          >
            <Sparkles size={15} />
            Mejorar legado ({profile.tokens}{" "}
            {profile.tokens === 1 ? "brasa" : "brasas"})
          </button>
          <button className="secondary-button" onClick={goMenu}>
            Volver al refugio
          </button>
          <span className="pause-key">
            <kbd>R</kbd> o <kbd>ENTER</kbd> para volver a intentarlo
          </span>
        </Modal>
      )}

      {status === "upgrade" && !modal && (
        <Modal
          title="AVIVA TU INSTINTO."
          eyebrow="EL REFUGIO · MEJORAS DE PARTIDA"
          onClose={pause}
          className="upgrade-modal"
        >
          <div className="upgrade-intro">
            <p>El fuego no dura para siempre. Haz que cuente.</p>
            <span className="gold-balance">
              <Coins size={17} />
              {Math.floor(snapshot.gold)}
              <small>ORO</small>
            </span>
          </div>
          <div className="run-upgrades">
            {RUN_UPGRADES.map((upgrade) => (
              <button
                key={upgrade.id}
                className={`run-upgrade ${
                  snapshot.purchased.includes(upgrade.id) ? "sold" : ""
                } ${purchased === upgrade.id ? "just-purchased" : ""}`}
                disabled={
                  snapshot.purchased.includes(upgrade.id) ||
                  snapshot.gold < upgrade.cost
                }
                onClick={() => buyRunUpgrade(upgrade.id)}
              >
                <span className="upgrade-icon">
                  {snapshot.purchased.includes(upgrade.id) ? (
                    <Check />
                  ) : (
                    upgradeIcons[upgrade.icon]
                  )}
                </span>
                <span>
                  <strong>{upgrade.name}</strong>
                  <small>{upgrade.description}</small>
                </span>
                <span className="upgrade-cost">
                  {snapshot.purchased.includes(upgrade.id) ? (
                    <span className="sold-label">VENDIDO</span>
                  ) : (
                    <>
                      {upgrade.cost}
                      <Coins size={13} />
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="upgrade-bottom">
            <span>
              <Flame size={13} />
              Estas mejoras solo duran esta noche.
            </span>
            <button className="primary-button" onClick={pause}>
              SEGUIR SOBREVIVIENDO
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}

      {status === "levelup" && levelChoices.length > 0 && (
        <Modal
          title="LA NOCHE TE HACE MÁS FUERTE."
          eyebrow={`NIVEL ${snapshot.level} · PARTIDA EN PAUSA`}
          onClose={() => handlers.current.chooseDraft(0)}
          className="levelup-modal"
          closeAutoFocus={false}
        >
          <p className="modal-lead">
            El tiempo se ha detenido. Elige una mejora para continuar tu
            supervivencia; tus dones se acumulan durante esta noche.
          </p>
          <div className="level-choices">
            {levelChoices.map((id, index) => {
              const perk = DRAFT_PERKS[id];
              return (
                <button
                  key={id}
                  className="level-choice"
                  onClick={() => game.current?.chooseDraft(index)}
                  autoFocus={index === 0}
                >
                  <span className="choice-index">0{index + 1}</span>
                  <span className="choice-icon">
                    <Sparkles size={24} />
                  </span>
                  <span className="draft-tag">{perk.tag}</span>
                  <strong>{perk.name}</strong>
                  <small>{perk.desc}</small>
                  <span className="choice-key">
                    Pulsa {index + 1} o toca para elegir
                  </span>
                </button>
              );
            })}
          </div>
          <div className="levelup-footnote">
            <Sparkles size={14} />
            <span>
              No hay límite de tiempo: piensa tu build antes de volver a la
              horda.
            </span>
          </div>
        </Modal>
      )}

      {modal === "survivors" && (
        <Modal
          title="PEQUEÑOS. NO INDEFENSOS."
          eyebrow="CONOCE A TUS SUPERVIVIENTES"
          onClose={closeModal}
          className="survivors-modal"
        >
          <div className="survivor-layout">
            <div className="survivor-art">
              <div className="survivor-art-halo" />
              <Portrait character={character} />
              <span className="survivor-art-id">
                RZ / 0{CHARACTERS.findIndex((c) => c.id === character) + 1}
              </span>
            </div>
            <div className="survivor-details">
              <span className="eyebrow accent">{selected.role}</span>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
              <div className="character-stats">
                <span>
                  <Heart size={13} />
                  <b>{selected.health}</b> Vida
                </span>
                <span>
                  <Crosshair size={13} />
                  <b>{selected.damage}</b> Daño
                </span>
                <span>
                  <Wind size={13} />
                  <b>{selected.speed.toFixed(1)}</b> Velocidad
                </span>
              </div>
              <div className="modal-character-options">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    className={c.id === character ? "selected" : ""}
                    onClick={() => selectCharacter(c.id)}
                  >
                    <Portrait character={c.id} />
                    <span>{c.name}</span>
                    {c.id === character && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="legacy-heading">
            <div>
              <span className="eyebrow">EL FUEGO QUE LLEVAS DENTRO</span>
              <h3>Tu legado</h3>
            </div>
            <div className="legacy-actions">
              {spentEmbers > 0 && (
                <button
                  className="refund-button"
                  onClick={refundPermanent}
                  title="Recupera el 100% de las brasas invertidas"
                >
                  <RotateCcw size={12} />
                  Reembolsar ({spentEmbers})
                </button>
              )}
              <span className="ember-balance">
                <Sparkles size={16} />
                {Math.floor(profile.tokens)}
                <small>BRASAS</small>
              </span>
            </div>
          </div>
          <p className="legacy-description">
            Cada noche deja algo en ti. Estas mejoras son permanentes y se
            aplican a los tres personajes en tu próxima partida.
          </p>
          <div className="permanent-upgrades">
            {" "}
            {PERMANENT_UPGRADES.map((upgrade) => {
              const level = profile.upgrades[upgrade.id];
              const cost = upgrade.base + level * upgrade.step;
              const maxed = level >= upgrade.max;
              return (
                <div
                  className={`permanent-upgrade ${maxed ? "maxed" : ""}`}
                  key={upgrade.id}
                >
                  <span className="upgrade-icon">{upgrade.icon}</span>
                  <div>
                    <strong>{upgrade.name}</strong>
                    <small>{upgrade.description}</small>
                    <span className="level-bar">
                      <i style={{ width: `${(level / upgrade.max) * 100}%` }} />
                    </span>
                    <span className="level-caption">
                      NIVEL {level} / {upgrade.max}
                    </span>
                  </div>
                  <button
                    aria-label={
                      maxed
                        ? `${upgrade.name} al nivel máximo`
                        : `Mejorar ${upgrade.name} por ${cost} brasas`
                    }
                    disabled={maxed || profile.tokens < cost}
                    onClick={() => buyPermanent(upgrade.id)}
                  >
                    {maxed ? (
                      <Check size={14} />
                    ) : (
                      <>
                        {cost}
                        <Sparkles size={12} />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="modal-bottom">
            <span>
              <Shield size={12} />
              Progreso guardado en este navegador.
            </span>
            <button className="primary-button" onClick={closeModal}>
              ESTOY LISTO
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}

      {modal === "leaderboard" && (
        <Modal
          title="LOS QUE MÁS RESISTIERON."
          eyebrow="CLASIFICACIÓN LOCAL"
          onClose={closeModal}
          className="leaderboard-modal"
        >
          <div className="leaderboard-subtitle">
            <p>No se trata de no caer. Se trata de cuánto resistes.</p>
            <span>
              <Trophy size={14} />
              TUS 10 MEJORES NOCHES
            </span>
          </div>
          {profile.records.length ? (
            <div className="leaderboard-table">
              <div className="table-head">
                <span>#</span>
                <span>SUPERVIVIENTE</span>
                <span>TIEMPO</span>
                <span>BAJAS</span>
                <span>PUNTOS</span>
              </div>
              {profile.records.map((record, index) => (
                <div
                  className={`table-row ${index === 0 ? "first-place" : ""}`}
                  key={record.id}
                >
                  <span className="table-rank">
                    {index === 0 ? (
                      <Trophy size={17} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="table-player">
                    <Portrait character={record.character} />
                    <span>
                      <strong>
                        {
                          CHARACTERS.find((c) => c.id === record.character)
                            ?.name
                        }
                      </strong>
                      <small>
                        {new Date(record.date).toLocaleDateString("es-CL", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </small>
                    </span>
                  </span>
                  <span>{formatTime(record.time)}</span>
                  <span>{record.kills}</span>
                  <span className="table-score">
                    {record.score.toLocaleString("es-CL")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-leaderboard">
              <Trophy size={39} strokeWidth={1} />
              <h3>Las leyendas empiezan de cero.</h3>
              <p>
                Sobrevive a tu primera noche.
                <br />
                Aquí guardaremos tus mejores historias.
              </p>
              <button className="primary-button" onClick={start}>
                ESCRIBIR MI HISTORIA
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <div className="leaderboard-footer">
            <span>
              <span className="live-dot" />
              Solo tus partidas. Tus propias leyendas.
            </span>
            <span>
              {profile.totalRuns}{" "}
              {profile.totalRuns === 1 ? "NOCHE JUGADA" : "NOCHES JUGADAS"}
            </span>
          </div>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal
          title="A TU MANERA."
          eyebrow="CONFIGURACIÓN"
          onClose={closeModal}
          className="settings-modal"
        >
          <p className="modal-lead">
            La noche es impredecible. Tus controles no deberían serlo.
          </p>
          <div className="settings-group">
            <span className="settings-group-title">
              <AudioLines size={13} />
              SONIDO
            </span>
            <div className="setting-row">
              <div>
                <strong>Efectos de sonido</strong>
                <small>Disparos, impactos y pequeños hallazgos.</small>
              </div>
              <Switch
                checked={settings.sound}
                onChange={() => setSetting("sound", !settings.sound)}
                label="Efectos de sonido"
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Ambiente de la noche</strong>
                <small>Un rumor constante entre la niebla.</small>
              </div>
              <Switch
                checked={settings.ambience}
                onChange={() => setSetting("ambience", !settings.ambience)}
                label="Ambiente de la noche"
              />
            </div>
          </div>
          <div className="settings-group">
            <span className="settings-group-title">
              <Gamepad2 size={13} />
              CONTROLES
            </span>
            <div className="setting-row">
              <div>
                <strong>Disparo automático</strong>
                <small>Apunta y dispara al enemigo más cercano.</small>
              </div>
              <Switch
                checked={settings.autoFire}
                onChange={() => setSetting("autoFire", !settings.autoFire)}
                label="Disparo automático"
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Joystick táctil</strong>
                <small>
                  {settings.joystick === "dynamic"
                    ? "Aparece donde tocas y sigue tu dedo."
                    : "Permanece en la esquina inferior izquierda."}
                </small>
              </div>
              <div className="segmented-control">
                <button
                  className={settings.joystick === "dynamic" ? "selected" : ""}
                  onClick={() => setSetting("joystick", "dynamic")}
                >
                  Dinámico
                </button>
                <button
                  className={settings.joystick === "static" ? "selected" : ""}
                  onClick={() => setSetting("joystick", "static")}
                >
                  Fijo
                </button>
              </div>
            </div>
          </div>
          <div className="settings-group">
            <span className="settings-group-title">
              <Sparkles size={13} />
              IMAGEN
            </span>
            <div className="setting-row">
              <div>
                <strong>Calidad gráfica</strong>
                <small>Menos sombras, más fluidez en equipos modestos.</small>
              </div>
              <select
                aria-label="Calidad gráfica"
                value={settings.quality}
                onChange={(event) =>
                  setSetting(
                    "quality",
                    event.target.value as GameSettings["quality"],
                  )
                }
              >
                <option value="high">Alta</option>
                <option value="low">Rendimiento</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>Sacudida de cámara</strong>
                <small>Siente el impacto de cada disparo.</small>
              </div>
              <Switch
                checked={settings.shake}
                onChange={() => setSetting("shake", !settings.shake)}
                label="Sacudida de cámara"
              />
            </div>
          </div>
          <div className="modal-bottom">
            <span>
              <Check size={12} />
              Los cambios se guardan automáticamente.
            </span>
            <button className="primary-button" onClick={closeModal}>
              TODO LISTO
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}

      {modal === "help" && (
        <Modal
          title="CONFÍA EN TU INSTINTO."
          eyebrow="GUÍA PARA TU PRIMERA NOCHE"
          onClose={closeModal}
          className="help-modal"
        >
          <div className="help-tabs">
            <button
              className={helpTab === "keyboard" ? "active" : ""}
              onClick={() => setHelpTab("keyboard")}
            >
              <Keyboard size={16} />
              Teclado
            </button>
            <button
              className={helpTab === "touch" ? "active" : ""}
              onClick={() => setHelpTab("touch")}
            >
              <Target size={16} />
              Táctil
            </button>
            <button
              className={helpTab === "gamepad" ? "active" : ""}
              onClick={() => setHelpTab("gamepad")}
            >
              <Gamepad2 size={16} />
              Mando
            </button>
          </div>
          <div className="help-controls">
            {(helpTab === "keyboard"
              ? [
                  ["W A S D / ↑ ← ↓ →", "Muévete (75% prec. en carrera)"],
                  [
                    "ESPACIO · MANTENER",
                    "Disparo manual y paso lento con 90% de precisión",
                  ],
                  ["F", "Cuchillazo que empuja enemigos (cada 15 s)"],
                  ["R / Q", "Recarga el cargador o cambia de arma"],
                  ["E · MANTENER", "Recluta, mejora o retira escombros"],
                  ["SHIFT / ESC", "Esquiva o pausa la partida"],
                ]
              : helpTab === "touch"
                ? [
                    ["DESLIZA", "Muévete (75% prec.) o mantén A (90% prec.)"],
                    ["A · MANTENER", "Disparo manual con postura firme"],
                    ["CUCHILLO", "Empuja a los mutantes (cada 15 s)"],
                    ["TOCAR ARMA / ↻", "Recarga o alterna de arma"],
                    ["B · MANTENER", "Interactúa o retira escombros"],
                    ["ESQUIVAR", "Escapa de la horda"],
                  ]
                : [
                    ["STICK / CRUCETA", "Muévete por la oscuridad"],
                    [
                      "A / RT · MANTENER",
                      "Disparo manual con 90% de precisión",
                    ],
                    ["RB", "Cuchillazo de empuje (cada 15 s)"],
                    ["Y / X", "Recarga o cambia de arma"],
                    ["B · MANTENER", "Interactúa o retira escombros"],
                    ["LB / START", "Esquiva o pausa la partida"],
                  ]
            ).map(([key, action]) => (
              <div key={key}>
                <kbd>{key}</kbd>
                <span>{action}</span>
              </div>
            ))}
          </div>
          <div className="help-tips">
            <div>
              <span>01</span>
              <div>
                <h3>No dejes de moverte.</h3>
                <p>
                  Tu pistola tiene munición infinita y un alcance corto. Recoge
                  escopetas, fusiles y subfusiles para cambiar el ritmo. Los
                  botiquines son escasos.
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Busca otras luces.</h3>
                <p>
                  Recluta hasta dos conejos junto a los candelabros. En la
                  fogata, cambia oro por mejoras de la partida.
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>No confíes en el camino de vuelta.</h3>
                <p>
                  Al cruzar tres puertas, las salas lejanas colapsan. Cuanto más
                  tiempo pases en un bioma, más enemigos aparecerán: cambiar de
                  bioma reinicia la amenaza.
                </p>
              </div>
            </div>
          </div>
          <div className="help-footnote">
            <Sparkles size={15} />
            <p>
              El disparo automático viene activado. Al caer, ganarás brasas para
              desbloquear mejoras permanentes en{" "}
              <button onClick={() => openModal("survivors")}>
                Supervivientes <ArrowUpRight size={11} />
              </button>
              .
            </p>
          </div>
          <button className="primary-button help-ready" onClick={closeModal}>
            QUE VENGA LA NOCHE
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      <div className="sr-only" aria-live="polite">
        {status === "playing" &&
          `${snapshot.health} de vida, ${snapshot.score} puntos`}
      </div>
    </div>
  );
}
