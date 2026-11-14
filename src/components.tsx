import {
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { X, ArrowUpRight, Check } from "lucide-react";
import type { CharacterId, GameSettings } from "./game/types";
import type { RatonGame } from "./game/engine";

export function MouseMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 13C7 17 2 10 6 6c4-4 11 0 8 7ZM22 13c7 4 12-3 8-7-4-4-11 0-8 7Z"
        fill="currentColor"
      />
      <path d="m18 10 9 10-5 10h-8L9 20l9-10Z" fill="currentColor" />
      <path
        d="m13 21 3 1m7-1-3 1"
        stroke="var(--mark-eye, #ec8849)"
        strokeWidth="2"
      />
      <path d="m16 26 2 2 2-2" fill="var(--mark-eye, #ec8849)" />
    </svg>
  );
}

export function GithubMark({ size = 19 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19c-4.3 1.3-4.3-2-6-2.5M15 22v-3.3c0-1 .1-1.8-.5-2.5 3.3-.4 6.5-1.6 6.5-7A5.4 5.4 0 0 0 19.5 5c.2-1.2.1-2.4-.5-3.5 0 0-1.2-.3-4 1.5a13.6 13.6 0 0 0-7 0C5.2 1.2 4 1.5 4 1.5c-.6 1.1-.7 2.3-.5 3.5A5.4 5.4 0 0 0 2 9.2c0 5.4 3.2 6.6 6.5 7-.6.7-.6 1.5-.5 2.5V22" />
    </svg>
  );
}

export function Portrait({
  character,
  className = "",
}: {
  character: CharacterId;
  className?: string;
}) {
  const skin =
    character === "mouse"
      ? "#b7aa94"
      : character === "rabbit"
        ? "#dfd1b5"
        : "#9aa99b";
  return (
    <svg
      className={`portrait ${className}`}
      viewBox="0 0 80 86"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m9 86 5-22 17-8h18l17 8 5 22H9Z"
        fill={character === "cat" ? "#4c6261" : "#65704b"}
      />
      <path d="m14 66 13 3-5 17H9l5-20Z" fill="#414c36" />
      <path d="m66 66-13 3 5 17h13l-5-20Z" fill="#87916a" />
      <path d="m28 64 12 5 12-5-5-8H33l-5 8Z" fill="#d58a46" />
      <path d="m31 64-3 18 8-4 2-11-7-3Z" fill="#b76e36" />
      {character === "mouse" && (
        <>
          <circle cx="18" cy="24" r="16" fill={skin} />
          <circle cx="62" cy="24" r="16" fill={skin} />
          <circle cx="18" cy="24" r="10" fill="#c58c79" />
          <circle cx="62" cy="24" r="10" fill="#c58c79" />
          <path d="m3 25 4 10 13 5-2-7-15-8Z" fill="#8c8272" />
        </>
      )}
      {character === "rabbit" && (
        <>
          <path
            d="M23 37C9 6 21-12 29 13l6 23-12 1ZM45 36l7-25c9-26 20-4 6 27l-13-2Z"
            fill={skin}
          />
          <path
            d="m24 30-4-18 4-4 6 22h-6Zm27 0 6-22 4 5-5 18-5-1Z"
            fill="#ca9c88"
          />
        </>
      )}
      {character === "cat" && (
        <>
          <path
            d="m14 36 1-32 24 21-25 11ZM42 25 66 4l1 33-25-12Z"
            fill={skin}
          />
          <path
            d="m20 26-1-14 14 14H20Zm28 0 13-14 1 17-14-3Z"
            fill="#bd9787"
          />
        </>
      )}
      <path
        d="m16 36 9-15 15-4 15 4 9 15-3 20-14 9H33l-14-9-3-20Z"
        fill={skin}
      />
      <path
        d="m16 36 13 4 4 25-14-9-3-20Z"
        fill={character === "cat" ? "#7e9082" : "#a89b84"}
      />
      <path
        d="m40 17 15 4 9 15-11-4-13-15Z"
        fill={character === "cat" ? "#b3bdad" : "#ede0c5"}
      />
      <path
        d="m25 47 15-6 15 6-4 12H29l-4-12Z"
        fill={character === "cat" ? "#c0c9b5" : "#e1d3b9"}
      />
      <path
        d="m29 46 11-5v17H29l-4-11 4-1Z"
        fill={character === "cat" ? "#a6b5a2" : "#c6b99f"}
      />
      <ellipse cx="28" cy="38" rx="3.5" ry="4.5" fill="#17241d" />
      <ellipse cx="52" cy="38" rx="3.5" ry="4.5" fill="#17241d" />
      <circle cx="29" cy="36.5" r="1.1" fill="#f9f0d6" />
      <circle cx="53" cy="36.5" r="1.1" fill="#f9f0d6" />
      <path d="m35 47 5-2 5 2-5 5-5-5Z" fill="#685044" />
      <path
        d="m40 52-1 5 5-1"
        stroke="#8d7561"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {character === "cat" && (
        <>
          <path
            d="m23 45-15-3m15 7-16 2m50-6 15-3m-15 7 16 2"
            stroke="#63776b"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="m35 21 5 10 5-10" fill="#637b6b" />
        </>
      )}
      <path d="m47 72 11 1-1 8-10-1v-8Z" fill="#394435" />
      <path d="m50 73 5 1v3h-5v-4Z" fill="#b2a77e" />
    </svg>
  );
}

export function Modal({
  children,
  title,
  eyebrow,
  onClose,
  className = "",
  closeAutoFocus = true,
}: {
  children: ReactNode;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  className?: string;
  closeAutoFocus?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], select, input, [tabindex="0"]',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              !dialogRef.current?.contains(document.activeElement))
          ) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              !dialogRef.current?.contains(document.activeElement))
          ) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="modal-heading">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button modal-close"
            aria-label="Cerrar ventana"
            onClick={onClose}
            autoFocus={closeAutoFocus}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      className={`switch ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span>{checked && <Check size={10} />}</span>
    </button>
  );
}

export function ArrowLink({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button className={`text-link ${className}`} onClick={onClick}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}

export function Joystick({
  game,
  mode,
}: {
  game: RefObject<RatonGame | null>;
  mode: GameSettings["joystick"];
}) {
  const [position, setPosition] = useState({ x: 90, y: 140 });
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const origin = useRef({ x: 90, y: 140 });
  const pointer = useRef<number | null>(null);
  const radius = 39;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let dx = x - origin.current.x;
    let dy = y - origin.current.y;
    const length = Math.hypot(dx, dy);
    if (mode === "dynamic" && length > radius * 1.6) {
      origin.current.x += dx * (1 - (radius * 1.6) / length);
      origin.current.y += dy * (1 - (radius * 1.6) / length);
      setPosition({ ...origin.current });
      dx = x - origin.current.x;
      dy = y - origin.current.y;
    }
    const scale = Math.max(radius, Math.hypot(dx, dy));
    setThumb({ x: (dx / scale) * radius, y: (dy / scale) * radius });
    if (game.current) {
      game.current.input.x = dx / scale;
      game.current.input.y = dy / scale;
    }
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setActive(false);
    setThumb({ x: 0, y: 0 });
    if (game.current) game.current.input.x = game.current.input.y = 0;
  };
  return (
    <div
      className="joystick-zone"
      aria-label="Joystick de movimiento"
      onPointerDown={(event) => {
        if (pointer.current !== null) return;
        pointer.current = event.pointerId;
        const rect = event.currentTarget.getBoundingClientRect();
        origin.current =
          mode === "dynamic"
            ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
            : { x: 87, y: rect.height - 89 };
        setPosition({ ...origin.current });
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    >
      {(active || mode === "static") && (
        <div
          className={`joystick ${active ? "active" : ""}`}
          style={{
            left: active ? position.x : 87,
            top: active ? position.y : "calc(100% - 89px)",
          }}
        >
          <div className="joystick-cross" />
          <div
            className="joystick-thumb"
            style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
          />
        </div>
      )}
      {!active && mode === "dynamic" && (
        <span className="joystick-hint">
          <span />
          DESLIZA PARA MOVERTE
        </span>
      )}
    </div>
  );
}
