import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReservationReplay } from '../experiments/reservation-replay.mjs';
import { runHeavyPressure, runReplayImprovements } from '../experiments/replay-improvements.mjs';
import { runDensityPressure } from '../experiments/density-pressure.mjs';
import { runIncrementalReplay } from '../experiments/incremental-replay.mjs';

const localPath = relative => fileURLToPath(new URL(relative, import.meta.url));
const args = process.argv.slice(2);
const improvements = args[0] === '--improvements';
const heavyPressure = args[0] === '--heavy-pressure';
const densityPressure = args[0] === '--density-pressure';
const incremental = args[0] === '--incremental';
if (improvements || heavyPressure || densityPressure || incremental) args.shift();
let demandPath;
const demandIndex = args.indexOf('--demand');
if (demandIndex !== -1 && improvements && args[demandIndex + 1] && !args[demandIndex + 1].startsWith('--')) {
  [, demandPath] = args.splice(demandIndex, 2);
}
if (args.length > 1 || args[0]?.startsWith('--')) {
  throw new Error('用法：experiment:c200[:stress|:density] [预约表] 或 experiment:c200:improve [预约表] [--demand 匿名意向.json]');
}
const xlsx = resolve(args[0] ?? localPath('../../../data/2026-10-29-C200东区座位预约记录.xlsx'));
const outputName = incremental ? 'c200-incremental.json' : densityPressure ? 'c200-density-pressure-45min.json'
  : heavyPressure ? 'c200-heavy-pressure.json' : improvements ? 'c200-improvements.json' : 'c200-replay.json';
const output = localPath(`../.qa/${outputName}`);
const python = process.env.SEATLINK_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const read = spawnSync(python, ['-X', 'utf8', localPath('read-c200-workbook.py'), xlsx], { encoding: 'utf8' });
if (read.error || read.status !== 0) {
  console.error(read.error?.message ?? read.stderr.trim());
  process.exit(1);
}

const bookings = JSON.parse(read.stdout);
const demand = demandPath === undefined
  ? undefined
  : JSON.parse((await readFile(resolve(demandPath), 'utf8')).replace(/^\uFEFF/, ''));
const result = incremental ? runIncrementalReplay(bookings) : densityPressure ? runDensityPressure(bookings, {
  onTrial: (increase, seed) => console.log(`需求 +${increase}% · 种子 ${seed} 完成`),
}) : heavyPressure ? runHeavyPressure(bookings)
  : improvements ? runReplayImprovements(bookings, demand) : runReservationReplay(bookings);
const tmp = `${output}.${process.pid}.tmp`;
await mkdir(dirname(output), { recursive: true });
try {
  await writeFile(tmp, JSON.stringify(result, null, 2) + '\n', 'utf8');
  await rename(tmp, output);
} finally {
  await rm(tmp, { force: true });
}

function printWorkload(workload) {
  console.log(`${workload.id} · ${workload.totalRequests} requests · ${result.seatCount} seats`);
  console.table(workload.groups.map(group => ({
    strategy: improvements || heavyPressure ? group.id : group.label,
    seatMinutes: (group.occupiedSeconds / 60).toFixed(2),
    utilization: (100 * group.utilization).toFixed(3) + '%',
    ...(incremental ? { addedMinutes:(group.addedSeconds/60).toFixed(2) } : {}),
    ...(improvements || heavyPressure ? { firstFailed: group.firstFailed, peakComplete: group.peak.complete } : {}),
    served: group.served,
    complete: group.complete,
    switches: group.switches,
    stitched: group.stitched,
    renewed: group.renewed,
  })));
}

if (densityPressure) {
  for (const workload of result.workloads) {
    console.log(`需求 +${workload.increasePercent}% · ${workload.totalRequests} 条 · ${result.seeds.length} 次回放均值`);
    console.table(workload.groups.map(({id, averages}) => ({
      strategy: id,
      firstFailed: averages.firstFailed.mean.toFixed(1),
      complete: averages.complete.mean.toFixed(1),
      utilization: averages.occupancyPercent.mean.toFixed(3) + '%',
      switches: averages.switches.mean.toFixed(1),
    })));
  }
} else if (improvements) {
  console.log('首段门槛与候补');
  printWorkload(result.firstSegment.find(workload => workload.id === 'pressure'));
  console.log('提前锁定与逐段确认');
  for (const trial of result.confirmation) {
    printWorkload(trial.workloads.find(workload => workload.id === 'pressure'));
  }
  console.log('晚高峰额外需求');
  for (const workload of result.peakDemand) printWorkload(workload);
} else {
  for (const workload of result.workloads) printWorkload(workload);
}
console.log(output);
