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

const VIEW_W = 320;
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

/**
 * A tower crane: mast, a T-top (jib toward the building, counter-jib with a
 * counterweight behind it) and a hoist cable that drops a lifted block down
 * to roughly where the build has got to. The earlier version was just an
 * mast with one arm and a flag that didn't touch anything — it read as a
 * stray mark, not a crane, especially at zero progress where it's the only
 * moving part on the card.
 */
function Crane({ cx, w, fullH, riseH }: { cx: number; w: number; fullH: number; riseH: number }) {
  const mastX = cx + w / 2 + 9;
  const topY = GROUND_Y - fullH - 20;
  const jibInnerX = cx - w * 0.15;
  const counterX = mastX + 13;
  const hookX = cx + w * 0.05;
  const hookBottomY = Math.max(topY + 12, Math.min(GROUND_Y - riseH - 3, GROUND_Y - 6));

  return (
    <>
      {/* counter-jib + counterweight, behind the mast */}
      <Line x1={mastX} y1={topY} x2={counterX} y2={topY} stroke={INK} strokeWidth={1.8} />
      <Rect x={counterX - 3} y={topY} width={6} height={5} fill={INK} />
      {/* mast */}
      <Line x1={mastX} y1={GROUND_Y} x2={mastX} y2={topY} stroke={INK} strokeWidth={2.2} />
      {/* operator cab */}
      <Rect x={mastX - 2} y={topY + 1} width={4} height={6} fill={INK} />
      {/* main jib, over the building */}
      <Line x1={mastX} y1={topY} x2={jibInnerX} y2={topY} stroke={INK} strokeWidth={1.8} />
      {/* hoist cable + the block it's lifting, roughly up to the current build height */}
      <Line x1={hookX} y1={topY} x2={hookX} y2={hookBottomY} stroke={INK} strokeWidth={1} />
      <Rect x={hookX - 2.5} y={hookBottomY} width={5} height={5} fill={GOLD} stroke={INK} strokeWidth={0.8} />
      {/* flag at the very top of the mast */}
      <Polygon points={`${mastX},${topY - 2} ${mastX},${topY - 10} ${mastX + 9},${topY - 6}`} fill={RED} />
    </>
  );
}

/** A small propaganda-poster stick figure — the Collective's own hands on the build. */
function WorkerFigure({ x, standY, toolUp = true }: { x: number; standY: number; toolUp?: boolean }) {
  const headR = 2.4;
  const headCy = standY - 13;
  const shoulderY = headCy + headR + 1;
  const hipY = shoulderY + 6;
  return (
    <>
      <Line x1={x} y1={shoulderY} x2={x} y2={hipY} stroke={INK} strokeWidth={1.4} />
      <Line x1={x} y1={hipY} x2={x - 3} y2={standY} stroke={INK} strokeWidth={1.4} />
      <Line x1={x} y1={hipY} x2={x + 3} y2={standY} stroke={INK} strokeWidth={1.4} />
      <Line x1={x} y1={shoulderY + 1} x2={x - 3.5} y2={shoulderY + 5} stroke={INK} strokeWidth={1.3} />
      {toolUp ? (
        <>
          <Line x1={x} y1={shoulderY + 1} x2={x + 4} y2={shoulderY - 5} stroke={INK} strokeWidth={1.3} />
          <Rect x={x + 2.8} y={shoulderY - 7} width={3.4} height={1.6} fill={INK} />
        </>
      ) : (
        <Line x1={x} y1={shoulderY + 1} x2={x + 3.5} y2={shoulderY + 5} stroke={INK} strokeWidth={1.3} />
      )}
      <Circle cx={x} cy={headCy} r={headR} fill={INK} />
    </>
  );
}

/** The structure not yet earned: a rising core inside a scaffold, with a crane and a couple of comrades on it. */
function ConstructionSite({ cx, footprint, progress }: { cx: number; footprint: Footprint; progress: number }) {
  const { width: w, height: fullH } = footprint;
  const riseH = Math.max(4, progress * fullH);
  const rungCount = Math.max(1, Math.floor(fullH / 14));
  const rungs = Array.from({ length: rungCount }, (_, i) => GROUND_Y - ((i + 1) * fullH) / (rungCount + 1));
  const showCrane = progress < 1;
  // a worker rides the rising core once there's enough of it to stand on;
  // below that it would float above empty scaffold with nothing underfoot
  const workerOnTop = riseH > 14;

  return (
    <>
      {/* the part already built, solid, narrower than the final footprint — a core, not the finished building */}
      <Rect x={cx - w * 0.3} y={GROUND_Y - riseH} width={w * 0.6} height={riseH} fill={INK} opacity={0.85} />
      {riseH > 6 && <Rect x={cx - w * 0.3} y={GROUND_Y - riseH} width={w * 0.6} height={2} fill={GOLD} />}
      {/* scaffold poles + rungs, the full target height */}
      <Line x1={cx - w / 2} y1={GROUND_Y} x2={cx - w / 2} y2={GROUND_Y - fullH} stroke={SCAFFOLD} strokeWidth={1.5} />
      <Line x1={cx + w / 2} y1={GROUND_Y} x2={cx + w / 2} y2={GROUND_Y - fullH} stroke={SCAFFOLD} strokeWidth={1.5} />
      {rungs.map((y, i) => (
        <Line key={i} x1={cx - w / 2} y1={y} x2={cx + w / 2} y2={y} stroke={SCAFFOLD} strokeWidth={1} />
      ))}
      {showCrane && <Crane cx={cx} w={w} fullH={fullH} riseH={riseH} />}
      <WorkerFigure x={cx - w / 2 - 5} standY={GROUND_Y} toolUp={!workerOnTop} />
      {workerOnTop && <WorkerFigure x={cx - w * 0.1} standY={GROUND_Y - riseH} toolUp />}
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
