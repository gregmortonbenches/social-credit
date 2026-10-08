import type { ReactElement } from 'react';
import Svg, { Circle, Line, Polygon, Rect } from 'react-native-svg';
import { CONFIG } from '../../constants/config';

// The streak is a count of weeks, which is an abstraction — this makes it a
// place. Each milestone in CONFIG.PROSPERITY_MILESTONES raises one more
// structure on the skyline, poorest to grandest left to right, and the
// structure not yet reached is shown mid-build: a rising solid core inside a
// scaffold, with a crane beside it, scaled to how far through the week-count
// the Collective has got. Reaching a milestone doesn't animate the join —
// the scaffold is simply gone and the full silhouette is there next render,
// same as the streak number itself only changes on a weekly-reset boundary.
// A streak of zero is the empty lot: ground broken, nothing standing, which
// reads truer than a blank card for "nothing built yet" and matches decision
// 47 — one missed week sends the whole skyline back to this, not one
// building, because the streak itself resets to zero with no partial credit.

const VIEW_W = 300;
const VIEW_H = 150;
const GROUND_Y = 128;
const INK = '#1A0A05';
const GOLD = '#C87F00';
const RED = '#C20000';
const SCAFFOLD = '#9C8A74';

interface Footprint {
  width: number;
  height: number;
}

const FOOTPRINTS: Footprint[] = [
  { width: 26, height: 40 }, // silo — The First Harvest
  { width: 38, height: 30 }, // commune hut — The People's Commune
  { width: 52, height: 46 }, // single-stack factory — The Five-Year Plan
  { width: 60, height: 62 }, // twin-stack factory — The Great Leap Forward
  { width: 24, height: 86 }, // golden spire — The Golden Age
];

// Centres computed once from the footprints above plus a 15px gap, left margin 17px.
const CENTRES = (() => {
  let x = 17;
  return FOOTPRINTS.map((f) => {
    x += f.width / 2;
    const cx = x;
    x += f.width / 2 + 15;
    return cx;
  });
})();

function Smoke({ cx, topY }: { cx: number; topY: number }) {
  return (
    <>
      <Circle cx={cx} cy={topY} r={3} fill={SCAFFOLD} opacity={0.7} />
      <Circle cx={cx + 3} cy={topY - 7} r={4} fill={SCAFFOLD} opacity={0.5} />
      <Circle cx={cx - 1} cy={topY - 15} r={5} fill={SCAFFOLD} opacity={0.3} />
    </>
  );
}

function Silo({ cx }: { cx: number }) {
  const { height: h } = FOOTPRINTS[0];
  const bodyH = 30;
  return (
    <>
      <Rect x={cx - 10} y={GROUND_Y - bodyH} width={20} height={bodyH} fill={INK} />
      <Polygon points={`${cx - 13},${GROUND_Y - bodyH} ${cx + 13},${GROUND_Y - bodyH} ${cx},${GROUND_Y - h}`} fill={INK} />
      <Rect x={cx - 3} y={GROUND_Y - 11} width={6} height={11} fill={GOLD} />
    </>
  );
}

function Hut({ cx }: { cx: number }) {
  const { height: h } = FOOTPRINTS[1];
  const bodyH = 16;
  return (
    <>
      <Polygon points={`${cx - 19},${GROUND_Y - bodyH} ${cx + 19},${GROUND_Y - bodyH} ${cx},${GROUND_Y - h}`} fill={INK} />
      <Rect x={cx - 15} y={GROUND_Y - bodyH} width={30} height={bodyH} fill={INK} />
      <Rect x={cx + 7} y={GROUND_Y - h + 4} width={5} height={12} fill={INK} />
      <Rect x={cx - 4} y={GROUND_Y - 10} width={8} height={10} fill={GOLD} />
    </>
  );
}

function Factory({ cx }: { cx: number }) {
  const bodyH = 28;
  const stackH = 18;
  return (
    <>
      <Rect x={cx - 20} y={GROUND_Y - bodyH} width={40} height={bodyH} fill={INK} />
      <Rect x={cx - 20} y={GROUND_Y - bodyH} width={40} height={3} fill={GOLD} />
      <Rect x={cx + 7} y={GROUND_Y - bodyH - stackH} width={8} height={stackH} fill={INK} />
      <Smoke cx={cx + 11} topY={GROUND_Y - bodyH - stackH - 4} />
    </>
  );
}

function GreatLeap({ cx }: { cx: number }) {
  const bodyH = 40;
  const stackH = 24;
  return (
    <>
      <Rect x={cx - 26} y={GROUND_Y - bodyH} width={52} height={bodyH} fill={INK} />
      <Rect x={cx - 26} y={GROUND_Y - bodyH} width={52} height={3} fill={GOLD} />
      <Rect x={cx - 14} y={GROUND_Y - bodyH - stackH} width={8} height={stackH} fill={INK} />
      <Rect x={cx + 6} y={GROUND_Y - bodyH - stackH} width={8} height={stackH} fill={INK} />
      <Smoke cx={cx - 10} topY={GROUND_Y - bodyH - stackH - 4} />
      <Smoke cx={cx + 10} topY={GROUND_Y - bodyH - stackH - 4} />
      <Polygon points={`${cx - 26},${GROUND_Y - bodyH - 2} ${cx - 26},${GROUND_Y - bodyH - 12} ${cx - 16},${GROUND_Y - bodyH - 7}`} fill={RED} />
    </>
  );
}

function GoldenSpire({ cx }: { cx: number }) {
  const { height: h } = FOOTPRINTS[4];
  return (
    <>
      <Polygon
        points={`${cx - 10},${GROUND_Y} ${cx + 10},${GROUND_Y} ${cx + 3},${GROUND_Y - h + 14} ${cx - 3},${GROUND_Y - h + 14}`}
        fill={GOLD}
        stroke={INK}
        strokeWidth={1.5}
      />
      <Polygon points={`${cx - 3},${GROUND_Y - h + 14} ${cx + 3},${GROUND_Y - h + 14} ${cx},${GROUND_Y - h}`} fill={GOLD} stroke={INK} strokeWidth={1.5} />
      <Polygon
        points={`${cx},${GROUND_Y - h - 8} ${cx + 2.4},${GROUND_Y - h - 2.5} ${cx + 8},${GROUND_Y - h - 2} ${cx + 3.5},${GROUND_Y - h + 1.5} ${cx + 5},${GROUND_Y - h + 7} ${cx},${GROUND_Y - h + 3.5} ${cx - 5},${GROUND_Y - h + 7} ${cx - 3.5},${GROUND_Y - h + 1.5} ${cx - 8},${GROUND_Y - h - 2} ${cx - 2.4},${GROUND_Y - h - 2.5}`}
        fill={RED}
      />
    </>
  );
}

const BUILDERS: Array<(args: { cx: number }) => ReactElement> = [Silo, Hut, Factory, GreatLeap, GoldenSpire];

/** The structure not yet earned: a rising core inside a scaffold, with a crane. */
function ConstructionSite({ cx, footprint, progress }: { cx: number; footprint: Footprint; progress: number }) {
  const { width: w, height: fullH } = footprint;
  const riseH = Math.max(4, progress * fullH);
  const rungCount = Math.max(1, Math.floor(fullH / 14));
  const rungs = Array.from({ length: rungCount }, (_, i) => GROUND_Y - ((i + 1) * fullH) / (rungCount + 1));
  const craneX = cx + w / 2 + 7;
  const craneTopY = GROUND_Y - fullH - 12;
  const showCrane = progress < 1;

  return (
    <>
      {/* the part already built, solid, narrower than the final footprint — a core, not the finished building */}
      <Rect x={cx - w * 0.3} y={GROUND_Y - riseH} width={w * 0.6} height={riseH} fill={INK} opacity={0.85} />
      {/* scaffold poles + rungs, the full target height */}
      <Line x1={cx - w / 2} y1={GROUND_Y} x2={cx - w / 2} y2={GROUND_Y - fullH} stroke={SCAFFOLD} strokeWidth={1.5} />
      <Line x1={cx + w / 2} y1={GROUND_Y} x2={cx + w / 2} y2={GROUND_Y - fullH} stroke={SCAFFOLD} strokeWidth={1.5} />
      {rungs.map((y, i) => (
        <Line key={i} x1={cx - w / 2} y1={y} x2={cx + w / 2} y2={y} stroke={SCAFFOLD} strokeWidth={1} />
      ))}
      {showCrane && (
        <>
          <Line x1={craneX} y1={GROUND_Y} x2={craneX} y2={craneTopY} stroke={INK} strokeWidth={2} />
          <Line x1={craneX} y1={craneTopY} x2={craneX - w / 2 - 6} y2={craneTopY} stroke={INK} strokeWidth={2} />
          <Line x1={craneX - w / 2 - 6} y1={craneTopY} x2={craneX - w / 2 - 6} y2={craneTopY + 8} stroke={INK} strokeWidth={1} />
          <Polygon points={`${craneX + 2},${craneTopY} ${craneX + 2},${craneTopY - 8} ${craneX + 11},${craneTopY - 4}`} fill={RED} />
        </>
      )}
    </>
  );
}

interface Props {
  /** Consecutive perfect weeks. */
  streak: number;
}

export function CollectiveConstruction({ streak }: Props) {
  const milestones = CONFIG.PROSPERITY_MILESTONES;
  const reachedCount = milestones.filter((m) => streak >= m.weeks).length;
  const nextIndex = reachedCount; // index into milestones/FOOTPRINTS/BUILDERS, or out of range once every stage is built
  const prevWeeks = reachedCount > 0 ? milestones[reachedCount - 1].weeks : 0;
  const nextMilestone = milestones[nextIndex];
  const progress = nextMilestone ? (streak - prevWeeks) / (nextMilestone.weeks - prevWeeks) : 1;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMax meet">
      <Line x1={0} y1={GROUND_Y} x2={VIEW_W} y2={GROUND_Y} stroke={INK} strokeWidth={1.5} opacity={0.5} />
      {CENTRES.slice(0, reachedCount).map((cx, i) => {
        const Builder = BUILDERS[i];
        return <Builder key={i} cx={cx} />;
      })}
      {nextIndex < CENTRES.length && (
        <ConstructionSite cx={CENTRES[nextIndex]} footprint={FOOTPRINTS[nextIndex]} progress={progress} />
      )}
    </Svg>
  );
}
