import { at, CLOSE, createState, freeSlots, OPEN, RULES } from '../src/engine.js';
import { bookPlan, planRenewal, planSeats, PLANNER_DEFAULTS } from '../src/planner.js';

export const POLICIES = [
  { id: 'baseline', label: '对照组', stitch: false, renew: false },
  { id: 'stitch', label: '仅拼接', stitch: true, renew: false },
  { id: 'renew', label: '仅续座', stitch: false, renew: true },
  { id: 'both', label: '拼接＋续座', stitch: true, renew: true },
];

const BLOCK_SECONDS = 30 * 60;
const PRESSURE_PERCENT = 25;
export const PEAK_HOURS = Object.freeze([18, 22]);
const { maxGapMinutes, minSegmentMinutes, maxSwitches } = PLANNER_DEFAULTS;
const bySubmission = (a, b) => a.submit - b.submit || a.id - b.id;
const effectiveSeconds = request => Math.max(0, request.release - request.start);
const duration = (start, end) => end - start;
const sumSeconds = slots => slots.reduce((sum, slot) => sum + duration(slot.start, slot.end), 0);

function findWaitlistPlan(state, request, options, maxDelayMinutes) {
  const earliest = Math.max(request.start, state.now);
  const latest = Math.min(request.start + maxDelayMinutes * 60, request.end - minSegmentMinutes * 60);
  if (earliest > latest) return null;
  const starts = new Set();
  for (const seat of state.seats) {
    for (const [from, until] of freeSlots(state, seat.id, options.date)) {
      const start = Math.max(earliest, from);
      if (start <= latest && Math.min(until, request.end) - start >= minSegmentMinutes * 60) starts.add(start);
    }
  }
  for (const start of [...starts].sort((a, b) => a - b)) {
    const [plan] = planSeats(state, { ...options, start, end: request.end }).plans;
    if (plan) return plan;
  }
  return null;
}

function replayPolicy(data, requests, policy) {
  const sessions = new Map(requests.map(request => [request.id, { request, decisions: [], slots: [] }]));
  const queue = new Map();
  const waiting = new Set();
  function eventsAt(time) {
    if (!queue.has(time)) queue.set(time, { arrivals: [], releases: [], fixedReleases: [], checks: new Set(), waitlistCheck: false });
    return queue.get(time);
  }

  for (const session of sessions.values()) {
    const { submit, start, release } = session.request;
    eventsAt(submit).arrivals.push(session);
    eventsAt(release).releases.push(session);
    if (policy.renew && release > start) eventsAt(start).checks.add(session);
  }

  // In incremental experiments all historical bookings form an existing
  // schedule snapshot. Keep their seats and planned intervals fixed; only
  // reveal an early release when its recorded event time is reached.
  const fixed = (data.backgroundReservations ?? []).map(request => {
    const slot = {
      id: `fixed-${request.id}`, userId: `fixed-${request.readerId}`, seatId: request.seatId,
      date: data.date, start: request.start, end: request.end,
      createdAt: request.submit, status: 'reserved', releasedAt: null,
    };
    eventsAt(request.release).fixedReleases.push(slot.id);
    return slot;
  });

  let state = {
    ...createState(true),
    events: [],
    replayDate: data.date,
    seats: data.seats.map(id => ({ id })),
    minReservationMinutes: policy.minFirstSegmentMinutes,
    reservations: fixed,
  };
  const options = {
    date: data.date, limit: 1, maxGapMinutes, minSegmentMinutes, maxSwitches,
    minFirstSegmentMinutes: policy.minFirstSegmentMinutes,
  };
  if (!policy.stitch) options.maxSegments = 1;

  function accept(session, stateForReader, plan, action) {
    const booking = policy.confirmLeadMinutes === undefined
      ? plan
      : { ...plan, segments: plan.segments.slice(0, 1) };
    const count = state.reservations.length;
    state = bookPlan(stateForReader, booking);
    const added = state.reservations.slice(count);
    session.slots.push(...added);
    session.decisions.push({ action, time: state.now, slots: added });
    const tail = added.at(-1);
    if (policy.renew && tail.end < session.request.end) {
      eventsAt(tail.end).checks.add(session);
      if (policy.confirmLeadMinutes !== undefined) {
        const checkAt = tail.end - policy.confirmLeadMinutes * 60;
        if (checkAt > state.now) eventsAt(checkAt).checks.add(session);
      }
      if (action === 'waitlist' && added[0].start > state.now) {
        eventsAt(added[0].start).checks.add(session);
      }
    }
  }

  while (queue.size) {
    const time = Math.min(...queue.keys());
    const { arrivals, releases, fixedReleases, checks, waitlistCheck } = queue.get(time);
    let retryWaiting = waitlistCheck;
    queue.delete(time);
    state.now = time;

    const releasedIds = new Set([...fixedReleases, ...releases.flatMap(session => session.slots.map(slot => slot.id))]);
    let freesSeat = false;
    if (releasedIds.size) {
      state.reservations = state.reservations.map(slot => {
        if (!releasedIds.has(slot.id) || slot.end <= time) return slot;
        freesSeat = true;
        return { ...slot, releasedAt: time, status: slot.start >= time ? 'cancelled' : 'completed' };
      });
    }

    for (const session of arrivals) {
      const { start, end, release, readerId } = session.request;
      if (release <= time) continue;
      const stateForReader = { ...state, userId: readerId };
      const [plan] = planSeats(stateForReader, { ...options, start, end }).plans;
      if (plan) accept(session, stateForReader, plan, 'initial');
      else if (policy.waitlistMinutes) {
        waiting.add(session);
        if (policy.waitlistAtStart) {
          if (start > time) eventsAt(start).waitlistCheck = true;
          else retryWaiting = true;
        }
      }
    }

    if (policy.waitlistMinutes && (freesSeat || retryWaiting)) {
      for (const session of waiting) {
        const { start, release, readerId } = session.request;
        if (release <= time || time > start + policy.waitlistMinutes * 60) {
          waiting.delete(session);
          continue;
        }
        if (policy.waitlistAtStart && (time < start || (!freesSeat && time !== start))) continue;
        const stateForReader = { ...state, userId: readerId };
        const plan = findWaitlistPlan(stateForReader, session.request, options, policy.waitlistMinutes);
        if (!plan) continue;
        accept(session, stateForReader, plan, 'waitlist');
        waiting.delete(session);
      }
    }

    if (!policy.renew) continue;
    // The timing trial also checks near the end of the current slot.
    // No planner call receives future releases.
    const candidates = freesSeat
      ? sessions.values()
      : [...checks].sort((a, b) => bySubmission(a.request, b.request));
    for (const session of candidates) {
      const { end, release, readerId } = session.request;
      const head = session.slots[0];
      const tail = session.slots.at(-1);
      if (!tail || head.start > time || time >= release || tail.end >= end ||
          time > tail.end + maxGapMinutes * 60) continue;
      const confirmAt = policy.confirmLeadMinutes === undefined ? -Infinity : tail.end - policy.confirmLeadMinutes * 60;
      if (time < confirmAt) continue;
      if (!freesSeat && time !== head.start && time !== tail.end && time !== confirmAt) continue;
      const stateForReader = { ...state, userId: readerId };
      const [plan] = planRenewal(stateForReader, { ...options, reservationId: tail.id, end }).plans;
      if (plan) accept(session, stateForReader, plan, 'renewal');
    }
  }
  return sessions;
}

function effectiveSlots(session) {
  return session.slots
    .filter(slot => session.request.release > slot.start)
    .map(slot => ({ ...slot, end: Math.min(slot.end, session.request.release) }));
}

function assertDisjoint(slots, field) {
  const latest = new Map();
  for (const slot of [...slots].sort((a, b) => a.start - b.start)) {
    const key = slot[field];
    if (slot.start < (latest.get(key) ?? -Infinity)) {
      throw new Error(`回放出现 ${field} 时段冲突，结果未发布。`);
    }
    latest.set(key, slot.end);
  }
}

function summarizeSlots(data, slots) {
  assertDisjoint(slots, 'seatId');
  assertDisjoint(slots, 'userId');
  const start = at(data.date, OPEN);
  const end = at(data.date, CLOSE);
  const capacitySeconds = data.seats.length * (end - start);
  const occupiedSeconds = sumSeconds(slots);
  const bins = [];
  for (let t = start; t < end; t += BLOCK_SECONDS) {
    let seconds = 0;
    const until = Math.min(t + BLOCK_SECONDS, end);
    for (const slot of slots) {
      seconds += Math.max(0, Math.min(until, slot.end) - Math.max(t, slot.start));
    }
    bins.push(seconds);
  }
  if (occupiedSeconds !== bins.reduce((a, b) => a + b, 0) || occupiedSeconds > capacitySeconds) {
    throw new Error('座位分钟合计与分时结果不一致。');
  }
  return { capacitySeconds, occupiedSeconds, utilization: occupiedSeconds / capacitySeconds, bins };
}

function summarizePolicy(data, sessions, policy, baseline, diagnostics) {
  const allSlots = [];
  let served = 0;
  let complete = 0;
  let switches = 0;
  let stitched = 0;
  let renewed = 0;
  let improved = 0;
  let reduced = 0;
  let firstFailed = 0;
  let shortFirst = 0;
  let waitlistServed = 0;
  let delaySeconds = 0;
  let peakRequests = 0;
  let peakFirstFailed = 0;
  let peakComplete = 0;
  const [peakStart, peakEnd] = PEAK_HOURS.map(hour => at(data.date, hour * 3600));
  for (const session of sessions.values()) {
    const needed = effectiveSeconds(session.request);
    if (!needed) continue;
    const slots = effectiveSlots(session);
    const covered = sumSeconds(slots);
    if (covered > needed) throw new Error('分配超过请求的有效时段。');
    allSlots.push(...slots);
    served += Number(covered > 0);
    complete += Number(covered === needed);
    switches += slots.filter((slot, i) => i && slot.seatId !== slots[i - 1].seatId).length;
    stitched += Number((session.decisions[0]?.slots.length ?? 0) > 1);
    renewed += Number(session.decisions.length > 1);
    const baselineSeconds = sumSeconds(effectiveSlots(baseline.get(session.request.id)));
    improved += Number(covered > baselineSeconds);
    reduced += Number(covered < baselineSeconds);
    if (!diagnostics) continue;
    const { request, decisions } = session;
    const first = decisions[0];
    const failed = first?.action !== 'initial';
    firstFailed += Number(failed);
    if (covered > 0 && first.slots[0].end - first.slots[0].start < minSegmentMinutes * 60) shortFirst++;
    if (first?.action === 'waitlist' && covered > 0) {
      waitlistServed++;
      delaySeconds += slots[0].start - request.start;
    }
    if (request.start >= peakStart && request.start < peakEnd) {
      peakRequests++;
      peakFirstFailed += Number(failed);
      peakComplete += Number(covered === needed);
    }
  }
  const additional = summarizeSlots(data, allSlots);
  const background = (data.backgroundReservations ?? []).filter(request => effectiveSeconds(request) > 0)
    .map(request => ({seatId:request.seatId,userId:`fixed-${request.readerId}`,start:request.start,end:request.release}));
  const total = data.backgroundReservations ? summarizeSlots(data, [...background, ...allSlots]) : additional;
  const result = { ...policy, ...total, served, complete, switches, stitched, renewed, improved, reduced,
    ...(data.backgroundReservations ? {addedSeconds:additional.occupiedSeconds,addedBins:additional.bins} : {}) };
  if (!diagnostics) return result;
  const open = at(data.date, OPEN);
  const peakBins = result.bins.slice((peakStart - open) / BLOCK_SECONDS, (peakEnd - open) / BLOCK_SECONDS);
  const peakUtilization = peakBins.reduce((a, b) => a + b, 0) / (data.seats.length * (peakEnd - peakStart));
  return {
    ...result, firstFailed, shortFirst, waitlistServed, delaySeconds,
    peak: { requests: peakRequests, firstFailed: peakFirstFailed, complete: peakComplete, utilization: peakUtilization },
  };
}

function illustrativeCase(requests, groups, policies) {
  let example;
  let largestDifference = 0;
  for (const request of requests) {
    const covered = groups.map(group => sumSeconds(effectiveSlots(group.get(request.id))));
    const difference = Math.max(...covered) - Math.min(...covered);
    if (difference > largestDifference) {
      example = request;
      largestDifference = difference;
    }
  }
  if (!example) return null;

  const aliases = new Map();
  const aliasSeat = seat => {
    if (!aliases.has(seat)) aliases.set(seat, String.fromCharCode(65 + aliases.size));
    return aliases.get(seat);
  };
  return {
    start: example.start,
    end: example.end,
    release: example.release,
    added: Boolean(example.added),
    groups: groups.map((group, index) => {
      const session = group.get(example.id);
      return {
        id: policies[index].id,
        occupiedSeconds: sumSeconds(effectiveSlots(session)),
        decisions: session.decisions.map(({ action, time, slots }) => ({
          action, time,
          slots: slots.map(({ seatId, start, end }) => ({ seat: aliasSeat(seatId), start, end })),
        })),
      };
    }),
  };
}

export function runWorkload(data, { requests, id, addedCount = 0 }, policies = POLICIES, diagnostics = false) {
  const ordered = [...requests].sort(bySubmission);
  const groups = policies.map(policy => replayPolicy(data, ordered, policy));
  const effective = ordered.filter(request => effectiveSeconds(request) > 0);
  return {
    id, addedCount,
    totalRequests: ordered.length,
    effectiveRequests: effective.length,
    demandSeconds: effective.reduce((sum, request) => sum + effectiveSeconds(request), 0),
    groups: groups.map((sessions, index) => summarizePolicy(data, sessions, policies[index], groups[0], diagnostics)),
    ...(diagnostics ? {} : { example: illustrativeCase(ordered, groups, policies) }),
  };
}

export function buildPressureWorkload(observed, increasePercent, id = `pressure+${increasePercent}`) {
  if (!Number.isFinite(increasePercent) || increasePercent < 0) throw new Error('加量比例须为非负数。');
  const ordered = [...observed.requests].sort(bySubmission);
  const donors = ordered.filter(request => effectiveSeconds(request) > 0);
  if (!donors.length) throw new Error('没有具备正有效时长的请求可供加量。');
  const addedCount = Math.ceil(ordered.length * increasePercent / 100);
  const lastId = Math.max(...ordered.map(request => request.id));
  const added = Array.from({ length: addedCount }, (_, index) => ({
    ...donors[Math.floor(index * donors.length / addedCount)],
    id: lastId + index + 1,
    readerId: `pressure-${index + 1}`,
    added: true,
  }));
  return { id, requests: [...ordered, ...added], addedCount };
}

export function buildReplayWorkloads(data) {
  const open = at(data.date, OPEN);
  const close = at(data.date, CLOSE);
  if (!data.seats.length || !data.requests.length || data.requests.some(request =>
    request.start < open || request.end > close ||
    request.end - request.start < RULES.minDuration ||
    request.end - request.start > RULES.maxDuration)) {
    throw new Error('缺少东区座位或请求，或原预约时段超出 Demo 开馆与预约时长规则。');
  }
  const ordered = [...data.requests].sort(bySubmission);
  const active = ordered.filter(request => effectiveSeconds(request) > 0);
  if (!active.length) throw new Error('没有具备正有效时长的请求。');
  const observed = { id: 'observed', requests: ordered };
  return {
    active, open, close,
    observed,
    pressure: buildPressureWorkload(observed, PRESSURE_PERCENT, 'pressure'),
  };
}

export function runReservationReplay(data) {
  const { active, open, close, observed, pressure } = buildReplayWorkloads(data);
  const ordered = observed.requests;
  const history = active.map(request => ({
    seatId: request.seatId, userId: request.readerId, start: request.start, end: request.release,
  }));
  return {
    schemaVersion: 1, date: data.date, seatCount: data.seats.length,
    sourceSha256: data.sourceSha256,
    open, close, binSeconds: BLOCK_SECONDS,
    rules: { maxGapMinutes, minSegmentMinutes, maxSwitches },
    timings: {
      noEffectiveTime: ordered.length - active.length,
      releasedDuringSlot: active.filter(request => request.release < request.end).length,
      endedAfterBooked: data.endedAfterBooked,
      priorToDemoWindow: ordered.filter(request => request.submit < at(data.date) - (86400 - CLOSE)).length,
    },
    historical: summarizeSlots(data, history),
    workloads: [
      runWorkload(data, observed),
      runWorkload(data, pressure),
    ],
  };
}
