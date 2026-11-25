import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { POLICIES } from '../experiments/reservation-replay.mjs';

const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const totals = value => ({
  ...pick(value, ['capacitySeconds', 'occupiedSeconds', 'utilization']),
  bins: value.bins.map(Number),
});
const policy = id => {
  const found = POLICIES.find(item => item.id === id);
  if (!found) throw new Error('未知的回放策略');
  return found;
};

// Publish only aggregates and letter-labelled allocation examples. Never copy
// raw rows, reader identifiers, seat identifiers, or arbitrary extra fields.
export function publicReplay(data) {
  if (data.schemaVersion !== 2 || data.mode !== 'fixed-bookings') throw new Error('请选择固定已有预约的增量实验汇总');
  return {
    ...pick(data, ['schemaVersion', 'mode', 'date', 'seatCount', 'backgroundCount', 'backgroundEffectiveCount', 'seed', 'sourceSha256', 'open', 'close', 'binSeconds']),
    rules: pick(data.rules, ['maxGapMinutes', 'minSegmentMinutes', 'maxSwitches']),
    timings: pick(data.timings, ['noEffectiveTime', 'releasedDuringSlot', 'endedAfterBooked', 'priorToDemoWindow']),
    historical: totals(data.historical),
    workloads: data.workloads.map(workload => ({
      ...pick(workload, ['id', 'addedCount', 'totalRequests', 'effectiveRequests', 'demandSeconds']),
      groups: workload.groups.map(group => ({
        ...policy(group.id), ...totals(group),
        ...pick(group, ['served', 'complete', 'switches', 'stitched', 'renewed', 'improved', 'reduced']),
        addedSeconds: group.addedSeconds,
        addedBins: group.addedBins.map(Number),
      })),
      example: !workload.example ? null : {
        ...pick(workload.example, ['start', 'end', 'release', 'added']),
        groups: workload.example.groups.map(group => ({
          id: policy(group.id).id,
          occupiedSeconds: group.occupiedSeconds,
          decisions: group.decisions.map(decision => ({
            ...pick(decision, ['action', 'time']),
            slots: decision.slots.map(slot => {
              if (!/^[A-Z]$/.test(slot.seat)) throw new Error('公开示例的座位必须使用字母代号');
              return pick(slot, ['seat', 'start', 'end']);
            }),
          })),
        })),
      },
    })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = new URL('../.qa/c200-incremental.json', import.meta.url);
  const destination = new URL('../src/c200-replay.public.json', import.meta.url);
  const result = publicReplay(JSON.parse(await readFile(source, 'utf8')));
  await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
  console.log(`Published aggregate: ${result.date}, ${result.backgroundCount} fixed bookings, added ${result.workloads.map(w=>w.addedCount).join('/')} requests.`);
}
