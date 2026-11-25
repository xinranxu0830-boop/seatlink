import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {DEMO_PROFILES} from '../src/recommendation-service.js';
import {at} from '../src/engine.js';
import {runIncrementalReplay} from '../experiments/incremental-replay.mjs';
const url=process.env.SEATLINK_URL||'http://127.0.0.1:5175/';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
await mkdir('.qa',{recursive:true});
const errors=[];
async function newPage(viewport={width:1440,height:1000}){
 const page=await browser.newPage({viewport});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(url);await expect(page.locator('.school-header')).toContainText('交圖座位预约');await expect(page.getByRole('button',{name:'座位地图',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'时间列表',exact:true}).click();return page;
}
const nav=(page,name)=>page.getByRole('navigation',{name:'主要导航'}).getByRole('button',{name:({'预约':'预约管理','拼座':'智能找座','首页':'首页','个人中心':'个人中心'})[name]||name,exact:true});
async function goSeats(page){await nav(page,'首页').click();await page.getByRole('button',{name:/^C200-中区（M）/}).click();await page.getByRole('button',{name:'时间列表',exact:true}).click();}
const pref=page=>page.getByRole('button',{name:/座位偏好，/});
try{
 const page=await newPage();
 await expect(page.locator('.seat-result')).toHaveCount(17);
 await page.getByRole('button',{name:'座位地图',exact:true}).click();await page.screenshot({path:'.qa/school-map-desktop.png'});await page.getByRole('button',{name:'时间列表',exact:true}).click();
 await pref(page).click();
 await expect(page.getByRole('button',{name:'有显示屏',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'有显示屏',exact:true}).click();
 await page.getByRole('button',{name:'所选偏好必须满足'}).click();
 const selectedIds=await page.locator('.seat-result').evaluateAll(es=>es.map(e=>e.dataset.seatId));
 expect(selectedIds.length).toBeGreaterThan(0);
 expect(selectedIds.every(id=>DEMO_PROFILES[id].display===true)).toBeTruthy();
 await page.screenshot({path:'.qa/desktop-preferences.png'});
 await page.keyboard.press('Escape');await expect(pref(page)).toBeFocused();
 await expect(page.getByRole('dialog',{name:'座位偏好',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'座位地图',exact:true}).click();
 const mapIds=await page.locator('[data-seat][opacity="1"]').evaluateAll(es=>es.map(e=>e.dataset.seat));
 expect(mapIds.sort()).toEqual(selectedIds.sort());
 await page.getByRole('button',{name:'全部座位',exact:true}).click();
 const invalidId='SIM-M-006';
 await page.locator(`[data-seat="${invalidId}"]`).click();
 const detail=page.getByRole('dialog',{name:'座位详情'});
 await expect(detail.getByRole('alert')).toContainText('必须条件');
 await expect(detail.getByRole('button',{name:/^预约 \d/})).toBeDisabled();
 await page.getByRole('button',{name:'关闭座位详情'}).click();
 await page.getByRole('button',{name:'仅推荐',exact:true}).click();
 await page.getByRole('button',{name:'时间列表',exact:true}).click();
 await pref(page).click();await page.getByRole('button',{name:'附近少人',exact:true}).click();await page.getByRole('button',{name:'完成',exact:true}).click();
 await expect(page.getByText('没有完全匹配', {exact:true})).toBeVisible();
 await pref(page).click();await page.getByRole('button',{name:'清空偏好'}).click();await page.getByRole('button',{name:'完成',exact:true}).click();
 await page.locator('.seat-result').first().click();
 await page.getByRole('button',{name:'预约备注',exact:true}).click();await page.getByRole('textbox',{name:'预约备注'}).fill('组会前自习');
 await detail.getByRole('button',{name:'预约 14:00–17:00',exact:true}).click();
 await expect(page.getByText('组会前自习',{exact:true})).toBeVisible();
 const saved=await page.evaluate(()=>localStorage.getItem('c200-reservation-simulator-v2'));
 await page.reload();await nav(page,'预约').click();await expect(page.getByText('组会前自习',{exact:true})).toBeVisible();
 // Every demo is isolated from ordinary bookings and can actually be completed.
 const expected={ '必须换座':2,'一张就够':1,'有空窗':2 };
 for(const [name,count] of Object.entries(expected)){
  await page.getByRole('button',{name:'场景演示',exact:true}).click();
  await page.getByRole('dialog',{name:'场景演示'}).getByRole('button',{name,exact:true}).click();
  const card=page.getByTestId('plan-card').first();
  await expect(card.locator('.plan-segment')).toHaveCount(count);
  if(name==='有空窗'){
   await expect(card.getByRole('button',{name:'确认预约整套方案'})).toBeDisabled();
   await card.getByRole('checkbox').check();
  }
  await card.getByRole('button',{name:'确认预约整套方案'}).click();
  await expect(page.locator('.demo-booked')).toContainText(`共 ${count} 段`);
  expect(await page.evaluate(()=>localStorage.getItem('c200-reservation-simulator-v2'))).toBe(saved);
  await page.getByRole('button',{name:'退出演示',exact:true}).click();
 }
 await page.getByRole('button',{name:'场景演示',exact:true}).click();
 await page.getByRole('dialog',{name:'场景演示'}).getByRole('button',{name:'先坐，再续',exact:true}).click();
 await page.getByRole('button',{name:'确认预约可用时段'}).first().click();
 await page.getByRole('button',{name:'模拟入馆签到',exact:true}).click();
 await page.reload();await expect(page.getByRole('button',{name:'推进到 14:50，模拟 B 释放'})).toBeVisible();
 await page.getByRole('button',{name:'推进到 14:50，模拟 B 释放'}).click();
 await page.getByRole('button',{name:'确认追加续座',exact:true}).first().click();
 await expect(page.locator('.demo-booked')).toContainText('共 2 段，180 分钟');
 await page.getByRole('button',{name:'退出演示',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('c200-reservation-simulator-v2'))).toBe(saved);
 const replayDate='2026-01-01';
 const replayStart=at(replayDate,9*3600);
 const replayEnd=at(replayDate,11*3600);
 const replay=runIncrementalReplay({
  date:replayDate, seats:['A'], endedAfterBooked:0,
  requests:[{id:1,readerId:'fixture',seatId:'A',submit:replayStart-3600,start:replayStart,end:replayEnd,release:replayEnd}],
 },[1,2]);
 await page.route('**/__seatlink/c200-replay',route=>route.fulfill({status:204}));
 await page.getByRole('button',{name:'场景演示',exact:true}).click();
 await page.getByRole('button',{name:'东区预约回放',exact:true}).click();
 await expect(page.getByText('2026-10-29 · 108 个记录内座位 · 08:00–22:30')).toBeVisible();
 await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
 await expect(page.getByRole('button',{name:'真实记录',exact:true})).toHaveCount(0);
 await expect(page.getByText('已有预约 317 条，原有利用率 58.637%。')).toBeVisible();
 for(const count of [80,100,150,200]) {
  await page.getByRole('button',{name:`＋${count} 条`,exact:true}).click();
  await expect(page.getByText(`${count} 条模拟新增请求。四组使用相同需求。`)).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
 }
 await page.screenshot({path:'.qa/replay-real-desktop.png',fullPage:true});
 await page.getByText('导入其他汇总',{exact:true}).click();
 const replayInput=page.getByLabel('导入回放汇总');
 const replayFile=data=>({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 const malformed={...replay,workloads:[{...replay.workloads[0],id:{}},replay.workloads[1]]};
 await replayInput.setInputFiles(replayFile(malformed));
 await expect(page.getByRole('alert')).toContainText('文件格式不匹配');
 await replayInput.setInputFiles(replayFile(replay));
 await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
 await page.getByRole('button',{name:'＋2 条',exact:true}).click();
 await expect(page.getByText('2 条模拟新增请求。四组使用相同需求。')).toBeVisible();
 await expect(page.getByRole('slider',{name:'回放时段'})).toHaveAttribute('aria-valuetext','08:00–08:30');
 expect(await page.evaluate(()=>localStorage.getItem('c200-reservation-simulator-v2'))).toBe(saved);
 await nav(page,'预约').click();
 await page.getByRole('button',{name:'模拟控制',exact:true}).click();await page.getByRole('button',{name:'入馆',exact:true}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await expect(page.locator('.booking-status')).toHaveText('已签到');
 await page.getByRole('button',{name:'模拟控制',exact:true}).click();await page.getByRole('button',{name:'离馆',exact:true}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await expect(page.locator('.booking-status')).toHaveText('已签退');
 await goSeats(page);await expect(page.locator('.seat-result')).toHaveCount(17);
 await page.getByRole('button',{name:'模拟控制',exact:true}).click();await page.getByRole('button',{name:'22:30',exact:true}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'学习日期'})).toHaveValue('2026-11-20');
 await page.close();
 for(const width of [375,390,844]){
  const mobile=await newPage({width,height:width===844?390:812});
  await mobile.emulateMedia({reducedMotion:'reduce'});
  expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await mobile.getByRole('button',{name:'座位地图',exact:true}).click();
  if(width===375)await mobile.screenshot({path:'.qa/school-map-mobile.png'});
  await pref(mobile).click();await mobile.getByRole('button',{name:'自然光好',exact:true}).click();
  const popup=await mobile.getByRole('dialog',{name:'座位偏好',exact:true}).boundingBox();
  expect(popup.x).toBeGreaterThanOrEqual(0);expect(popup.x+popup.width).toBeLessThanOrEqual(width);
  if(width===375)await mobile.screenshot({path:'.qa/mobile-preferences.png'});
  await mobile.getByRole('button',{name:'完成',exact:true}).click();await mobile.getByRole('button',{name:'时间列表',exact:true}).click();await mobile.locator('.seat-result').first().click();
  await expect(mobile.getByRole('button',{name:/^预约 \d/})).toBeEnabled();
  if(width===375)await mobile.screenshot({path:'.qa/mobile-detail.png'});
  await mobile.getByRole('button',{name:'关闭座位详情'}).click();
  await nav(mobile,'拼座').click();
  expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await mobile.getByRole('button',{name:'帮我找座',exact:true}).click();await expect(mobile.getByTestId('plan-card').first()).toBeVisible();
  await nav(mobile,'首页').click();await expect(mobile.getByRole('img',{name:'上海交通大学图书馆'})).toBeVisible();
  await expect(mobile.getByRole('button',{name:/^B200-东区/})).toBeDisabled();
  await mobile.waitForLoadState('networkidle');
  if(width===375)await mobile.screenshot({path:'.qa/school-home-mobile.png'});
  await mobile.getByRole('button',{name:/^C200-中区（M）/}).click();await expect(mobile.locator('.seat-map')).toBeVisible();
  await nav(mobile,'个人中心').click();await expect(mobile.getByText('演示读者',{exact:true})).toBeVisible();
  await mobile.locator('.school-profile-row').filter({hasText:'模拟数据'}).click();await expect(mobile.getByRole('dialog',{name:'模拟数据',exact:true})).toBeVisible();
  await mobile.getByRole('button',{name:'关闭面板',exact:true}).click();
  await mobile.locator('.school-subheader').getByRole('button',{name:'场景演示',exact:true}).click();
  await mobile.getByRole('button',{name:'东区预约回放',exact:true}).click();
  await mobile.getByRole('button',{name:'＋200 条',exact:true}).click();
  await expect(mobile.getByRole('table').getByRole('row')).toHaveCount(5);
  expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  if(width===375)await mobile.screenshot({path:'.qa/replay-real-mobile.png',fullPage:true});
  await mobile.close();
 }
 expect(errors).toEqual([]);console.log('PASS: school theme, map default, home/area navigation, profile, desktop, 375/390/844px, preferences, map/list, strict validation, booking, persistence, 4 demos, renewal, replay import, gate, date rollover.');
}finally{await browser.close();}
