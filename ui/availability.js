// All values are seconds from midnight. Windows come from the existing booking engine.
export const OPEN = 8 * 3600;
export const CLOSE = 22.5 * 3600;
export const MIN_BOOKING = 3600;

export function parseTime(value) {
  const parts = String(value).split(':').map(Number);
  if (parts.length < 2 || parts.some(n => !Number.isFinite(n))) return NaN;
  const [h, m, s = 0] = parts;
  return h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60 ? h * 3600 + m * 60 + s : NaN;
}

export function clock(seconds) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}`;
}

export function duration(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  return minutes > 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60}分` : `${minutes}分钟`;
}

export function validateRange(start, end, earliest = OPEN) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '请填写完整的开始和结束时间。';
  if (end <= start) return '结束时间需要晚于开始时间。';
  if (start < OPEN || end > CLOSE) return '请选择08:00—22:30开放时间内的时段。';
  if (start < earliest) return '开始时间已经过去，请调整到当前模拟时间之后。';
  if (end - start < MIN_BOOKING) return '每次预约至少1小时，请延长学习时段。';
  return '';
}

export function analyzeAvailability(windows, start, end, valid = true) {
  if (!valid) return {status:'busy', label:'请先调整时间', windows, overlaps:[], bookable:[], preferred:null};
  const overlaps = windows.map(([a,b])=>[Math.max(a,start),Math.min(b,end)]).filter(([a,b])=>b>a);
  const bookable = overlaps.filter(([a,b])=>b-a >= MIN_BOOKING);
  const full = windows.some(([a,b])=>a<=start && b>=end);
  const preferred = full ? [start,end] : [...bookable].sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]) || a[0]-b[0])[0] || null;
  let label = '所选时段不可约';
  if (full) label = '全程可约';
  else if (preferred) label = preferred[0] === start ? `可坐至${clock(preferred[1])}` : `${clock(preferred[0])}起可约`;
  else if (overlaps.length) label = '空闲不足1小时';
  return {status:full?'free':overlaps.length?'partial':'busy', label, windows, overlaps, bookable, preferred};
}
