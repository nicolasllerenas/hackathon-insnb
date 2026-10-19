import { useEffect, useRef, useState } from "react";
import { ACCESORIOS } from "./contenido";
import type { Cara } from "./juego";

interface Props {
  cara: Cara;
  gesto: "saltando" | "meneo" | null;
  escaneando: boolean;
  accesorio: string | null;
  nombre: string;
  alTocar: () => void;
}

export function Gato({ cara, gesto, escaneando, accesorio, nombre, alTocar }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const pupilaI = useRef<SVGGElement>(null);
  const pupilaD = useRef<SVGGElement>(null);
  const [parpadea, setParpadea] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (Math.random() < 0.55) {
        setParpadea(true);
        window.setTimeout(() => setParpadea(false), 200);
      }
    }, 3400);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const caja = svg.current?.getBoundingClientRect();
      if (!caja?.width) return;
      const cx = caja.left + caja.width / 2;
      const cy = caja.top + caja.height * 0.44;
      const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (caja.width / 2))) * 5;
      const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (caja.height / 2))) * 4;
      for (const p of [pupilaI.current, pupilaD.current]) if (p) p.style.transform = `translate(${dx}px,${dy}px)`;
    };
    document.addEventListener("pointermove", mover, { passive: true });
    return () => document.removeEventListener("pointermove", mover);
  }, []);

  const clases = ["gato", gesto ?? "", escaneando ? "escaneando" : "", parpadea && cara === "normal" ? "parpadea" : ""].filter(Boolean).join(" ");

  return (
    <button type="button" className="gato-boton" onClick={alTocar} aria-label={`Tocar a ${nombre}`}>
      <svg ref={svg} id="gato" className={clases} viewBox="0 0 300 300" data-cara={cara} aria-hidden="true">
        <defs>
          <linearGradient id="pelo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#DCD6E8" />
            <stop offset="1" stopColor="#A79FC0" />
          </linearGradient>
          <linearGradient id="peloOsc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#B6AECB" />
            <stop offset="1" stopColor="#8B82A6" />
          </linearGradient>
          <linearGradient id="panelOjo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B1030" />
            <stop offset="1" stopColor="#0B0518" />
          </linearGradient>
          <radialGradient id="nariz">
            <stop offset="0" stopColor="#D8B4FE" />
            <stop offset="1" stopColor="#7C3AED" />
          </radialGradient>
          <radialGradient id="brilloNariz">
            <stop offset="0" stopColor="#67E8F9" stopOpacity=".95" />
            <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="cuerpo-g">
          <g className="cola">
            <path
              d="M232 232 C272 226 282 190 262 168 C252 157 236 160 234 174 C232 187 246 190 250 181"
              fill="none"
              stroke="url(#peloOsc)"
              strokeWidth="17"
              strokeLinecap="round"
            />
          </g>
          <ellipse cx="150" cy="292" rx="72" ry="9" fill="#000" opacity=".28" />
          <path d="M92 246 C92 196 116 176 150 176 C184 176 208 196 208 246 C208 266 190 274 150 274 C110 274 92 266 92 246 Z" fill="url(#pelo)" />
          <path d="M124 250 C124 232 136 224 150 224 C164 224 176 232 176 250 C176 262 166 266 150 266 C134 266 124 262 124 250 Z" fill="#EFEAF8" opacity=".75" />
          <rect x="90" y="212" width="120" height="15" rx="7.5" fill="#7C3AED" />
          <rect x="90" y="212" width="120" height="15" rx="7.5" fill="#A855F7" opacity=".45" />
          <circle cx="150" cy="219.5" r="10" fill="#160A2A" />
          <circle cx="150" cy="219.5" r="5" fill="#22D3EE" className="luz-collar" />
          <ellipse cx="112" cy="272" rx="17" ry="11" fill="#EFEAF8" />
          <ellipse cx="188" cy="272" rx="17" ry="11" fill="#EFEAF8" />
          <g className="cabeza">
            <path className="oreja-i" d="M84 96 L74 44 L124 74 Z" fill="url(#peloOsc)" />
            <path d="M92 92 L86 60 L114 78 Z" fill="#FF9EC7" opacity=".85" />
            <path className="oreja-d" d="M216 96 L226 44 L176 74 Z" fill="url(#peloOsc)" />
            <path d="M208 92 L214 60 L186 78 Z" fill="#FF9EC7" opacity=".85" />
            <ellipse cx="150" cy="128" rx="80" ry="70" fill="url(#pelo)" />
            <path d="M104 78 C112 92 118 100 122 106" stroke="#9A93AE" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".55" />
            <path d="M196 78 C188 92 182 100 178 106" stroke="#9A93AE" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".55" />
            <path d="M150 68 L150 86" stroke="#9A93AE" strokeWidth="6" strokeLinecap="round" opacity=".55" />
            <rect x="88" y="104" width="124" height="52" rx="26" fill="url(#panelOjo)" />
            <rect x="88" y="104" width="124" height="52" rx="26" fill="none" stroke="#3C2A5E" strokeWidth="2" />
            <g className="ojo-normal">
              <g className="pupila" ref={pupilaI}>
                <ellipse cx="119" cy="130" rx="17" ry="19" fill="#22D3EE" />
                <ellipse cx="119" cy="130" rx="7" ry="15" fill="#0B0518" />
                <circle cx="113" cy="122" r="5" fill="#fff" opacity=".92" />
              </g>
              <g className="pupila" ref={pupilaD}>
                <ellipse cx="181" cy="130" rx="17" ry="19" fill="#22D3EE" />
                <ellipse cx="181" cy="130" rx="7" ry="15" fill="#0B0518" />
                <circle cx="175" cy="122" r="5" fill="#fff" opacity=".92" />
              </g>
              <g className="parpado">
                <rect x="98" y="106" width="42" height="46" rx="21" fill="#0B0518" />
                <rect x="160" y="106" width="42" height="46" rx="21" fill="#0B0518" />
              </g>
            </g>
            <g className="ojo-feliz">
              <path d="M104 136 Q119 116 134 136" stroke="#22D3EE" strokeWidth="8" fill="none" strokeLinecap="round" />
              <path d="M166 136 Q181 116 196 136" stroke="#22D3EE" strokeWidth="8" fill="none" strokeLinecap="round" />
            </g>
            <g className="ojo-cerrado">
              <path d="M104 130 Q119 142 134 130" stroke="#7C3AED" strokeWidth="7" fill="none" strokeLinecap="round" />
              <path d="M166 130 Q181 142 196 130" stroke="#7C3AED" strokeWidth="7" fill="none" strokeLinecap="round" />
            </g>
            <g className="ojo-triste">
              <ellipse cx="119" cy="134" rx="14" ry="15" fill="#5B8FA8" />
              <ellipse cx="181" cy="134" rx="14" ry="15" fill="#5B8FA8" />
              <path d="M102 116 L136 124" stroke="#3C2A5E" strokeWidth="6" strokeLinecap="round" />
              <path d="M198 116 L164 124" stroke="#3C2A5E" strokeWidth="6" strokeLinecap="round" />
            </g>
            <g className="ojo-corazon">
              <path d="M119 142 C104 130 106 116 114 116 C118 116 119 120 119 122 C119 120 120 116 124 116 C132 116 134 130 119 142 Z" fill="#FF6BB5" />
              <path d="M181 142 C166 130 168 116 176 116 C180 116 181 120 181 122 C181 120 182 116 186 116 C194 116 196 130 181 142 Z" fill="#FF6BB5" />
            </g>
            <circle className="brillo-nariz" cx="150" cy="168" r="34" fill="url(#brilloNariz)" />
            <path d="M138 162 L162 162 L150 178 Z" fill="url(#nariz)" />
            <circle cx="150" cy="167" r="4" fill="#F5D0FE" opacity=".85" />
            <path d="M150 178 L150 186" stroke="#8B82A6" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M150 186 Q138 196 130 186" stroke="#8B82A6" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M150 186 Q162 196 170 186" stroke="#8B82A6" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <g stroke="#EFEAF8" strokeWidth="2.6" strokeLinecap="round" opacity=".7">
              <path d="M78 160 L38 152" />
              <path d="M78 170 L40 172" />
              <path d="M80 180 L44 192" />
              <path d="M222 160 L262 152" />
              <path d="M222 170 L260 172" />
              <path d="M220 180 L256 192" />
            </g>
            <g dangerouslySetInnerHTML={{ __html: accesorio ? (ACCESORIOS[accesorio] ?? "") : "" }} />
          </g>
        </g>
      </svg>
    </button>
  );
}
