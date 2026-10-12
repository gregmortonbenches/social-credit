import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { AVATAR_COLORS } from '../../constants/theme';

// Mocked-up placeholder art for the onboarding slides, in the same 1950s
// propaganda-poster register as the rest of the app (decision 28's avatar
// palette, the sunburst/star motifs already on the poster banner). Built as
// flat vector shapes rather than a raster image: no asset pipeline, scales to
// any device density for free, and themes with the rest of the app if the
// palette ever changes. See "Custom propaganda poster artwork" in Not Built
// Yet — these replace the plain star row, not that open item.

const VIEW_W = 240;
const VIEW_H = 150;
const INK = '#1A0A05'; // warmer than pure black so silhouettes sit on the red banner without looking cut out
const GOLD = '#C87F00'; // AVATAR_COLORS' harvest gold — the ray/star colour in every reference poster

/** A ray as a thin triangle: wide at the sun's centre, pointed at its tip. */
function rayPoints(cx: number, cy: number, angleDeg: number, length: number, baseWidth: number): string {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const px = -dy;
  const py = dx;
  const tipX = cx + dx * length;
  const tipY = cy + dy * length;
  const b1x = cx + px * (baseWidth / 2);
  const b1y = cy + py * (baseWidth / 2);
  const b2x = cx - px * (baseWidth / 2);
  const b2y = cy - py * (baseWidth / 2);
  return `${b1x},${b1y} ${tipX},${tipY} ${b2x},${b2y}`;
}

/** Rising-sun motif: a disc parked above the frame so only its lower rays show. */
function SunRays({ cx = VIEW_W / 2, cy = -6, rayCount = 9, length = 60, discRadius = 20 }) {
  const start = 12;
  const end = 168;
  const rays = Array.from({ length: rayCount }, (_, i) => {
    const angle = start + ((end - start) * i) / (rayCount - 1);
    return rayPoints(cx, cy, angle, length, 9);
  });
  return (
    <>
      {rays.map((pts, i) => (
        <Polygon key={i} points={pts} fill={GOLD} opacity={0.85} />
      ))}
      <Circle cx={cx} cy={cy} r={discRadius} fill={GOLD} />
    </>
  );
}

interface WorkerProps {
  x: number;
  scale?: number;
  armRaised?: boolean;
  scarfColor?: string;
}

/** A single flat silhouette: head, torso, two legs, one arm either raised or crossed. */
function Worker({ x, scale = 1, armRaised = true, scarfColor }: WorkerProps) {
  const groundY = VIEW_H - 8;
  const headR = 9 * scale;
  const headCy = groundY - 70 * scale;
  const shoulderY = headCy + headR + 2 * scale;
  const waistY = shoulderY + 34 * scale;
  const shoulderHalf = 15 * scale;
  const waistHalf = 10 * scale;

  const torso = `${x - shoulderHalf},${shoulderY} ${x + shoulderHalf},${shoulderY} ${x + waistHalf},${waistY} ${x - waistHalf},${waistY}`;
  const legGap = 4 * scale;
  const legW = 8 * scale;

  const arm = armRaised
    ? `${x + shoulderHalf - 4 * scale},${shoulderY + 4 * scale} ${x + shoulderHalf + 22 * scale},${headCy - 8 * scale} ${x + shoulderHalf + 14 * scale},${headCy + 2 * scale} ${x + shoulderHalf - 10 * scale},${shoulderY + 12 * scale}`
    : // crossed/akimbo: a short diagonal wedge resting against the torso, not reaching above the shoulder
      `${x + shoulderHalf - 2 * scale},${shoulderY + 6 * scale} ${x + shoulderHalf + 10 * scale},${shoulderY + 16 * scale} ${x + shoulderHalf + 2 * scale},${shoulderY + 24 * scale} ${x + waistHalf - 2 * scale},${shoulderY + 14 * scale}`;
  const armMirror = armRaised
    ? `${x - shoulderHalf + 4 * scale},${shoulderY + 4 * scale} ${x - shoulderHalf - 22 * scale},${headCy - 8 * scale} ${x - shoulderHalf - 14 * scale},${headCy + 2 * scale} ${x - shoulderHalf + 10 * scale},${shoulderY + 12 * scale}`
    : `${x - shoulderHalf + 2 * scale},${shoulderY + 6 * scale} ${x - shoulderHalf - 10 * scale},${shoulderY + 16 * scale} ${x - shoulderHalf - 2 * scale},${shoulderY + 24 * scale} ${x - waistHalf + 2 * scale},${shoulderY + 14 * scale}`;

  return (
    <>
      {!armRaised && <Polygon points={armMirror} fill={INK} />}
      <Polygon points={arm} fill={INK} />
      <Polygon points={torso} fill={INK} />
      <Rect x={x - waistHalf - legGap / 2 - legW} y={waistY} width={legW} height={groundY - waistY} fill={INK} />
      <Rect x={x + legGap / 2} y={waistY} width={legW} height={groundY - waistY} fill={INK} />
      <Circle cx={x} cy={headCy} r={headR} fill={INK} />
      {scarfColor && (
        <Polygon
          points={`${x - 7 * scale},${shoulderY} ${x + 7 * scale},${shoulderY} ${x},${shoulderY + 10 * scale}`}
          fill={scarfColor}
        />
      )}
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
      {children}
    </Svg>
  );
}

/** Slide 1 — a lone worker raises a tool under the rising sun. */
export function WelcomeIllustration() {
  return (
    <Frame>
      <SunRays />
      <Worker x={VIEW_W / 2} scale={1.15} armRaised scarfColor={GOLD} />
    </Frame>
  );
}

/** Slide 2 — three comrades of different heights, standing shoulder to shoulder. */
export function CollectiveIllustration() {
  const centers = [VIEW_W / 2 - 54, VIEW_W / 2, VIEW_W / 2 + 54];
  const scales = [0.85, 1, 0.85];
  return (
    <Frame>
      <SunRays rayCount={7} length={44} discRadius={14} />
      {centers.map((cx, i) => (
        <Worker key={i} x={cx} scale={scales[i]} armRaised={i === 1} scarfColor={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
      ))}
    </Frame>
  );
}

/** Slide 3 — a stern, arms-crossed comrade beside a clock marked into the red. */
export function PenaltyIllustration() {
  const clockCx = VIEW_W / 2 + 46;
  const clockCy = 62;
  const clockR = 30;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180;
    const inner = clockR - 5;
    return {
      x1: clockCx + Math.cos(angle) * inner,
      y1: clockCy + Math.sin(angle) * inner,
      x2: clockCx + Math.cos(angle) * clockR,
      y2: clockCy + Math.sin(angle) * clockR,
    };
  });
  return (
    <Frame>
      <Worker x={VIEW_W / 2 - 38} scale={1.1} armRaised={false} />
      <Circle cx={clockCx} cy={clockCy} r={clockR} fill="#F0EAD6" stroke={INK} strokeWidth={3} />
      {/* the overdue wedge: a slice of the dial already in the danger colour */}
      <Polygon
        points={`${clockCx},${clockCy} ${clockCx},${clockCy - clockR} ${clockCx + clockR * Math.sin((2 * Math.PI) / 3)},${clockCy - clockR * Math.cos((2 * Math.PI) / 3)}`}
        fill="#C20000"
        opacity={0.8}
      />
      {ticks.map((t, i) => (
        <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={INK} strokeWidth={2} />
      ))}
      <Line x1={clockCx} y1={clockCy} x2={clockCx} y2={clockCy - clockR + 8} stroke={INK} strokeWidth={3} />
      <Line x1={clockCx} y1={clockCy} x2={clockCx + 16} y2={clockCy - 4} stroke={INK} strokeWidth={3} />
      <Circle cx={clockCx} cy={clockCy} r={3} fill={INK} />
      {/* warning badge: cream so the mark reads against the red poster field, same trap as text set in the primary red */}
      <Circle cx={VIEW_W / 2 - 10} cy={30} r={14} fill="#F0EAD6" stroke={INK} strokeWidth={2} />
      <SvgText x={VIEW_W / 2 - 10} y={36} fontSize={18} fontWeight="900" fill="#C20000" textAnchor="middle">
        !
      </SvgText>
    </Frame>
  );
}
