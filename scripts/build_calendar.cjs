// Offline extraction adapter for Yuk Tung Liu's GPL-3.0 ChineseCalendar.
// This adapter is distributed under GPL-3.0. Original sources and license are
// retained beside the input; no upstream JavaScript is loaded by the app.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'data/references/chinese-calendar');
const context = vm.createContext({});
const hashes = {};
for (const file of ['calendarData.js', 'split.js']) {
  const code = fs.readFileSync(path.join(folder, file), 'utf8');
  hashes[file] = crypto.createHash('sha256').update(code).digest('hex');
  vm.runInContext(code, context, {filename:file, timeout:1000});
}
function julianDay(year, month, day) {
  const a=Math.floor((14-month)/12), y=year+4800-a, m=month+12*a-3;
  return day+Math.floor((153*m+2)/5)+365*y+Math.floor(y/4)-32083;
}
const rows={han:context.ChineseToGregorian().filter(r=>r[0]>=183&&r[0]<=281), shu:[], wu:[]};
for(let year=221;year<=264;year++)rows.shu.push(context.setup_region_calendar('Shu',year,false));
for(let year=222;year<=280;year++)rows.wu.push(context.setup_region_calendar('Wu',year,false));
const calendars={};
for(const [id, records] of Object.entries(rows)) {
  calendars[id]=[];
  for(const row of records) {
    const year=row[0], base=julianDay(year,1,1)-1;
    const months=Array.from({length:12},(_,i)=>({month:i+1,start:base+row[i+1]}));
    if(row[14])months.push({month:-row[14],start:base+row[13]});
    months.sort((a,b)=>a.start-b.start);
    months.forEach((month,i)=>{
      const end=i+1<months.length?months[i+1].start-1:base+row[1]+row[15]-1;
      const transition=id==='han'&&year===236&&month.month===12;
      assert.ok([29,30].includes(end-month.start+1)||(transition&&end-month.start+1===28),`${id} ${year} ${month.month}: invalid month length`);
      let officialYear=year, officialMonth=month.month;
      const jian=Math.abs(month.month);
      if(id==='han'&&((year===237&&jian>2)||year===238||(year===239&&jian<12))){
        officialMonth=(jian===12?1:jian+1)*Math.sign(month.month);
        if(jian===12)officialYear++;
      }
      calendars[id].push({year:officialYear,month:officialMonth,start:month.start,end,
        note:transition?'改历交接有一日差异：源表自237年正月行景初历，原站另列五月改历之说。':
          id==='han'&&year===239&&jian===12?'景初三年后十二月，次年恢复建寅为年首。':''});
    });
  }
  for(let i=1;i<calendars[id].length;i++)assert.equal(calendars[id][i-1].end+1,calendars[id][i].start,`${id} month continuity`);
}
// Compare with the separately published three-kingdom month table, 223 CE.
assert.equal(calendars.han.find(m=>m.year===223&&m.month===2).start,julianDay(223,3,20));
assert.equal(calendars.wu.find(m=>m.year===223&&m.month===2).start,julianDay(223,3,19));
const result={source:'https://github.com/ytliu0/ChineseCalendar', author:'Yuk Tung Liu',
  source_hashes:hashes, license:'GPL-3.0', calendars,
  note:'公开历法复原数据；汉魏晋、蜀汉、孙吴朔闰分别处理，西历对照用儒略历。换算精度不改变史料日期精度。'};
fs.writeFileSync(path.join(root,'web/calendar.json'),JSON.stringify(result));
fs.copyFileSync(path.join(folder,'LICENSE.txt'),path.join(root,'web/assets/CALENDAR-LICENSE.txt'));
console.log(JSON.stringify({months:Object.fromEntries(Object.entries(calendars).map(([k,v])=>[k,v.length])),source_hashes:hashes}));
