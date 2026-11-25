import React, { useEffect, useRef, useState } from 'react';
import { clock, dayOf, secOf } from './engine.js';
import publishedReplay from './c200-replay.public.json';
import './replay.css';

const timeOf = (seconds, precise = false) => clock(secOf(seconds), precise);
const interval = (start, end) => `${timeOf(start)}–${timeOf(end)}`;
const percent = (value, digits = 3) => `${(100 * value).toFixed(digits)}%`;
const minutes = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
const isCount = value => Number.isInteger(value) && value >= 0;

function validExample(example) {
  if (example === null) return true;
  return [example?.start, example?.end, example?.release].every(Number.isFinite) &&
    Array.isArray(example.groups) && example.groups.every(group =>
      typeof group?.id === 'string' && Array.isArray(group.decisions) && group.decisions.every(decision =>
        Number.isFinite(decision?.time) && Array.isArray(decision.slots) && decision.slots.every(slot =>
          typeof slot?.seat === 'string' && [slot.start, slot.end].every(Number.isFinite))));
}

function validSummary(data) {
  return data?.schemaVersion === 2 && data.mode === 'fixed-bookings' && typeof data.date === 'string' &&
    isCount(data.backgroundCount) && Number.isFinite(data.historical?.utilization) &&
    [data.seatCount, data.open, data.close, data.binSeconds].every(Number.isFinite) &&
    data.seatCount > 0 && data.close > data.open && data.binSeconds > 0 &&
    Array.isArray(data.workloads) && data.workloads.length > 0 &&
    new Set(data.workloads.map(workload=>workload?.addedCount)).size === data.workloads.length &&
    data.workloads.every(workload => typeof workload?.id === 'string' &&
      [workload.totalRequests, workload.effectiveRequests, workload.addedCount].every(isCount) &&
      workload.addedCount > 0 && workload.totalRequests === workload.addedCount &&
      Array.isArray(workload.groups) && workload.groups.length === 4 && validExample(workload.example) &&
      workload.groups.every(group => typeof group?.id === 'string' && typeof group.label === 'string' &&
        [group.occupiedSeconds, group.addedSeconds, group.utilization, group.complete, group.served].every(Number.isFinite) &&
        Array.isArray(group.bins) && group.bins.length === Math.ceil((data.close - data.open) / data.binSeconds) &&
        group.bins.every(Number.isFinite)));
}

function LoadReplay({ loading, error, onLoad }) {
  return <section className="c200-replay">
    <h1>C200 东区预约回放</h1>
    {loading ? <p role="status">正在读取回放结果。</p> : <>
      <p>暂时无法读取回放，请刷新重试或导入汇总文件。</p>
      <label className="replay-import">导入回放汇总
        <input type="file" accept=".json,application/json" onChange={onLoad}/>
      </label>
    </>}
    {error && <p className="compact-error" role="alert">{error}</p>}
  </section>;
}

function TimeProfile({ summary, workload }) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [bin, setBin] = useState(0);
  const group = workload.groups[groupIndex];
  const binStart = summary.open + summary.binSeconds * bin;
  const binEnd = Math.min(binStart + summary.binSeconds, summary.close);
  const limit = summary.seatCount * (binEnd - binStart);
  return <section className="replay-section">
    <div className="replay-section-heading">
      <h2>分时总预约利用率</h2>
      <label>查看策略
        <select value={groupIndex} onChange={event => setGroupIndex(Number(event.target.value))}>
          {workload.groups.map((item, index) => <option key={item.id} value={index}>{item.label}</option>)}
        </select>
      </label>
    </div>
    <div className="replay-bars" aria-hidden="true">
      {group.bins.map((seconds, index) => {
        const start = summary.open + index * summary.binSeconds;
        const capacity = summary.seatCount * Math.min(summary.binSeconds, summary.close - start);
        return <span key={index} className={index === bin ? 'selected' : undefined} style={{height: percent(seconds / capacity)}}/>;
      })}
    </div>
    <label className="replay-range">
      回放时段
      <input type="range" min="0" max={group.bins.length - 1} value={bin}
        aria-valuetext={interval(binStart, binEnd)} onChange={event => setBin(Number(event.target.value))}/>
    </label>
    <div className="replay-bin" aria-live="polite">
      <strong>{interval(binStart, binEnd)}</strong>
      {workload.groups.map(item => <span key={item.id}>{item.label} {percent(item.bins[bin] / limit, 1)}</span>)}
    </div>
  </section>;
}

function Example({ example, groups, date }) {
  const [step, setStep] = useState(0);
  const decisions = example.groups.flatMap(group => group.decisions);
  const timeline = [...new Set([...decisions.map(decision => decision.time), example.release])].sort((a, b) => a - b);
  const now = timeline[step];
  return <section className="replay-section">
    <h2>同一请求的分配过程</h2>
    <p>目标 {interval(example.start, example.end)}，座位用字母标记。</p>
    <label className="replay-range">
      决策时刻
      <input type="range" min="0" max={timeline.length - 1} value={step}
        aria-valuetext={timeOf(now, true)} onChange={event => setStep(Number(event.target.value))}/>
    </label>
    <output>{dayOf(now) !== date && '前一日 '}{timeOf(now, true)}{now === example.release && ' · 记录结束'}</output>
    <ul className="replay-decisions">
      {example.groups.map(group => {
        const made = group.decisions.filter(decision => decision.time <= now);
        return <li key={group.id}>
          <strong>{groups.find(item => item.id === group.id)?.label}</strong>
          {made.length === 0 ? <span>此时未分配</span> : <ul>
            {made.map((decision, index) => <li key={index}>
              {decision.action === 'initial' ? '首次预约' : '续座'} · {decision.slots.map(slot =>
                `${slot.seat} 座 ${interval(slot.start, slot.end)}`).join(' / ')}
            </li>)}
          </ul>}
        </li>;
      })}
    </ul>
  </section>;
}

export default function ReplayPanel() {
  const [summary, setSummary] = useState(publishedReplay);
  const [loading, setLoading] = useState(import.meta.env.DEV);
  const [error, setError] = useState('');
  const [workloadIndex, setWorkloadIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const imported = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/__seatlink/c200-replay', { signal: controller.signal });
        if (response.status === 204) return;
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!validSummary(data)) throw new Error();
        if (!imported.current) {
          setSummary(data);
          setRevision(value => value + 1);
        }
      } catch {
        // The published aggregate remains available if the local dev file is absent or invalid.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, []);

  async function loadFile(event) {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!validSummary(data)) throw new Error();
      imported.current = true;
      setSummary(data);
      setRevision(value => value + 1);
      setWorkloadIndex(0);
      setError('');
    } catch {
      setError('文件格式不匹配，请选择新增需求实验生成的汇总 JSON。');
    } finally {
      input.value = '';
    }
  }

  if (!summary) return <LoadReplay loading={loading} error={error} onLoad={loadFile}/>;
  const workload = summary.workloads[workloadIndex];
  return <section className="c200-replay" aria-labelledby="c200-replay-title">
    <h1 id="c200-replay-title">C200 东区预约回放</h1>
    <p>{summary.date} · {summary.seatCount} 个记录内座位 · {interval(summary.open, summary.close)}</p>
    <p>已有预约 {summary.backgroundCount} 条，原有利用率 {percent(summary.historical.utilization)}。</p>
    <p>已有预约保持原座位与时段，新增需求只安排剩余空位。</p>
    <div className="replay-tabs" role="group" aria-label="选择模拟新增请求数">
      {summary.workloads.map((item, index) => <button key={item.id}
        aria-pressed={index === workloadIndex} onClick={() => setWorkloadIndex(index)}>
        ＋{item.addedCount} 条
      </button>)}
    </div>
    <section className="replay-section">
      <h2>新增需求的四组对比</h2>
      <p>{workload.addedCount} 条模拟新增请求。四组使用相同需求。</p>
      <table className="replay-results">
        <thead><tr><th scope="col">策略</th><th scope="col">有座</th><th scope="col">完整</th><th scope="col">新增分钟</th><th scope="col">总利用率</th></tr></thead>
        <tbody>{workload.groups.map(group => <tr key={group.id}>
          <th scope="row">{group.label}</th>
          <td>{group.served}/{workload.effectiveRequests}</td>
          <td>{group.complete}/{workload.effectiveRequests}</td>
          <td>{minutes.format(group.addedSeconds / 60)}</td>
          <td>{percent(group.utilization)}</td>
        </tr>)}</tbody>
      </table>
      <p className="replay-caption">有座：至少安排一段；完整：覆盖全部目标时段。总利用率包含已有预约与新增分配，非实测在座率。</p>
    </section>
    <TimeProfile key={revision} summary={summary} workload={workload}/>
    {workload.example && <Example key={`${revision}-${workload.id}`} example={workload.example} groups={workload.groups} date={summary.date}/>}
    <details className="replay-tools">
      <summary>导入其他汇总</summary>
      <label className="replay-import">导入回放汇总
        <input type="file" accept=".json,application/json" onChange={loadFile}/>
      </label>
    </details>
    {error && <p className="compact-error" role="alert">{error}</p>}
  </section>;
}
