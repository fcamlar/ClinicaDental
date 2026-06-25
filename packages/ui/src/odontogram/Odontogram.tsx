import { useMemo, useState } from 'react';
import {
  ADULT_TEETH_FDI,
  CONDITION_COLORS,
  CONDITION_LABELS,
  isMolar,
  type Condition,
  type OdontogramState,
  type Surface,
  type ToothFDI,
} from './model.js';

/**
 * Odontograma adulto clickable — prototipo Sprint 0.
 *
 * Pensado para validar UX con dentistas reales antes de Sprint 4. NO interactúa
 * con backend: recibe `value` y emite `onChange`.
 *
 * Cada diente se dibuja como un cuadrado dividido en 5 zonas (mesial/distal/
 * vestibular/lingual/centro). Al hacer click sobre una zona se aplica la
 * condición activa de la paleta.
 */

interface OdontogramProps {
  value: OdontogramState;
  onChange: (next: OdontogramState) => void;
}

const TOOTH_BOX = 44; // px
const GAP = 6;

const SURFACE_PATHS: Record<Surface, string> = {
  // Trapecios alrededor del cuadrado central. Coords sobre un viewbox 100x100.
  vestibular: 'M 0,0 L 100,0 L 70,30 L 30,30 Z',
  lingual: 'M 0,100 L 30,70 L 70,70 L 100,100 Z',
  mesial: 'M 0,0 L 30,30 L 30,70 L 0,100 Z',
  distal: 'M 100,0 L 100,100 L 70,70 L 70,30 Z',
  occlusal: 'M 30,30 L 70,30 L 70,70 L 30,70 Z',
};

const ALL_CONDITIONS: Condition[] = [
  'HEALTHY',
  'CARIES',
  'FILLING',
  'CROWN',
  'ENDODONTICS',
  'IMPLANT',
  'MISSING',
  'EXTRACTION_PLANNED',
];

const WHOLE_CONDITIONS: Condition[] = ['MISSING', 'IMPLANT', 'CROWN', 'EXTRACTION_PLANNED'];

function Tooth({
  fdi,
  state,
  onSurface,
  onWhole,
}: {
  fdi: ToothFDI;
  state: OdontogramState[ToothFDI];
  onSurface: (s: Surface) => void;
  onWhole: () => void;
}) {
  const whole = state?.whole;
  const wholeColor = whole ? CONDITION_COLORS[whole] : null;

  const surfaceOrder: Surface[] = isMolar(fdi)
    ? ['vestibular', 'lingual', 'mesial', 'distal', 'occlusal']
    : ['vestibular', 'lingual', 'mesial', 'distal', 'occlusal'];

  return (
    <div style={{ textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: 10, color: '#6b7280' }}>{fdi}</div>
      <svg
        width={TOOTH_BOX}
        height={TOOTH_BOX}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Diente ${String(fdi)}`}
      >
        {wholeColor && (
          <rect
            x={0}
            y={0}
            width={100}
            height={100}
            fill={wholeColor}
            opacity={0.85}
            onClick={onWhole}
            style={{ cursor: 'pointer' }}
          />
        )}
        {!wholeColor &&
          surfaceOrder.map((s) => {
            const surf = state?.surfaces[s];
            const fill = surf ? CONDITION_COLORS[surf.condition] : '#ffffff';
            return (
              <path
                key={s}
                d={SURFACE_PATHS[s]}
                fill={fill}
                stroke="#111827"
                strokeWidth={2}
                onClick={(e) => {
                  e.stopPropagation();
                  onSurface(s);
                }}
                style={{ cursor: 'pointer' }}
                aria-label={`${s} del diente ${String(fdi)}`}
              />
            );
          })}
        {!wholeColor && (
          <rect
            x={0}
            y={0}
            width={100}
            height={100}
            fill="transparent"
            stroke="#111827"
            strokeWidth={2}
            onClick={onWhole}
          />
        )}
      </svg>
    </div>
  );
}

export function Odontogram({ value, onChange }: OdontogramProps) {
  const [active, setActive] = useState<Condition>('CARIES');

  // Particionamos los dientes según el layout 2 filas × 16 columnas.
  const rows = useMemo(() => {
    const top = ADULT_TEETH_FDI.slice(0, 16); // 18..28
    const bot = ADULT_TEETH_FDI.slice(16); // 38..48
    return { top, bot };
  }, []);

  const applySurface = (fdi: ToothFDI, surface: Surface) => {
    const tooth: OdontogramState[ToothFDI] = value[fdi] ?? { surfaces: {} };
    const next: OdontogramState = {
      ...value,
      [fdi]: {
        ...tooth,
        whole: undefined,
        surfaces:
          active === 'HEALTHY'
            ? Object.fromEntries(Object.entries(tooth.surfaces).filter(([k]) => k !== surface))
            : { ...tooth.surfaces, [surface]: { condition: active } },
      },
    };
    onChange(next);
  };

  const applyWhole = (fdi: ToothFDI) => {
    if (!WHOLE_CONDITIONS.includes(active) && active !== 'HEALTHY') return;
    const next: OdontogramState = {
      ...value,
      [fdi]: {
        surfaces: {},
        whole: active === 'HEALTHY' ? undefined : active,
      },
    };
    onChange(next);
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 16 }}>
      {/* Paleta */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ALL_CONDITIONS.map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setActive(c)}
            aria-pressed={active === c}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              border: active === c ? '2px solid #111827' : '1px solid #d1d5db',
              borderRadius: 6,
              background: active === c ? '#f3f4f6' : '#ffffff',
              cursor: 'pointer',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 12,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                background: CONDITION_COLORS[c],
                border: '1px solid #111827',
                borderRadius: 3,
              }}
            />
            {CONDITION_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Arcada superior */}
      <div style={{ display: 'flex', gap: GAP, justifyContent: 'center' }}>
        {rows.top.map((fdi) => (
          <Tooth
            key={fdi}
            fdi={fdi}
            state={value[fdi]}
            onSurface={(s) => applySurface(fdi, s)}
            onWhole={() => applyWhole(fdi)}
          />
        ))}
      </div>

      {/* Arcada inferior */}
      <div style={{ display: 'flex', gap: GAP, justifyContent: 'center' }}>
        {rows.bot.map((fdi) => (
          <Tooth
            key={fdi}
            fdi={fdi}
            state={value[fdi]}
            onSurface={(s) => applySurface(fdi, s)}
            onWhole={() => applyWhole(fdi)}
          />
        ))}
      </div>
    </div>
  );
}
