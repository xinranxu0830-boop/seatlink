import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTime,validateRange,analyzeAvailability} from '../ui/availability.js';
const t=parseTime;
const windows=[[t('13:00'),t('16:00')],[t('20:00'),t('22:30')]];
test('003 exposes the actual partial interval for a 14–17 request',()=>{
  const result=analyzeAvailability(windows,t('14:00'),t('17:00'));
  assert.equal(result.status,'partial');assert.equal(result.label,'可坐至16:00');assert.deepEqual(result.preferred,[t('14:00'),t('16:00')]);
});
test('changing the query changes partial to full without changing the seat',()=>{
  assert.equal(analyzeAvailability(windows,t('14:00'),t('16:00')).status,'free');
  assert.equal(analyzeAvailability(windows,t('17:00'),t('19:00')).status,'busy');
});
test('adjacent boundary is not treated as overlapping availability',()=>{
  assert.equal(analyzeAvailability(windows,t('16:00'),t('20:00')).status,'busy');
});
test('a short overlap is visible but cannot become a bookable suggestion',()=>{
  const result=analyzeAvailability(windows,t('15:30'),t('18:00'));
  assert.equal(result.label,'空闲不足1小时');assert.equal(result.preferred,null);
});
test('an interval starting later is explicitly labelled',()=>{
  const result=analyzeAvailability([[t('15:00'),t('18:00')]],t('14:00'),t('17:00'));
  assert.equal(result.label,'15:00起可约');assert.deepEqual(result.preferred,[t('15:00'),t('17:00')]);
});
test('invalid, past, short and out-of-hours requests cannot be shown as bookable',()=>{
  for(const [a,b,earliest] of [['17:00','14:00','08:00'],['07:00','09:00','08:00'],['21:00','23:00','08:00'],['14:00','14:30','08:00'],['14:00','17:00','15:00']]){
    assert.ok(validateRange(t(a),t(b),t(earliest)));
    assert.equal(analyzeAvailability(windows,t(a),t(b),false).preferred,null);
  }
  assert.ok(validateRange(t(''),t('17:00')));
  assert.equal(validateRange(t('21:00'),t('22:30')),'');
});
