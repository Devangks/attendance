const KEY='attendance-v1';
const D={version:1,config:{defaultTarget:75,odCountsAsPresent:true,semesterStartDate:'',semesterEndDate:''},subjects:[],timetable:[],records:[],holidays:[],assignments:[],lastBackupAt:null};
let S=load();
function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&x.version===1)return{...structuredClone(D),...x,config:{...D.config,...x.config}}}catch(e){}return structuredClone(D)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){alert('Storage blocked/full! Export a backup.')}}

// ---------- helpers ----------
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const ds=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; // local date, never toISOString
const pd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const dow=d=>d.getDay()||7; // Mon=1..Sun=7
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const fmt=s=>pd(s).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const fm=t=>{const[h,m]=t.split(':').map(Number);return`${h%12||12}:${pad(m)} ${h<12?'AM':'PM'}`};
function range(a,b){let x=pd(a),y=pd(b);if(x>y)[x,y]=[y,x];const o=[];while(x<=y){o.push(ds(x));x.setDate(x.getDate()+1)}return o}
const subj=id=>S.subjects.find(s=>s.id===id);
const isHol=d=>S.holidays.some(h=>h.date===d);
const rid=(s,d,t)=>`${s}_${d}_${t}`;
const byT=(a,b)=>a.startTime.localeCompare(b.startTime);
const PAL=['#ec4899','#ef4444','#eab308','#22c55e','#06b6d4','#8b5cf6','#f97316'];
const col=sb=>PAL[Math.max(0,S.subjects.findIndex(s=>s.id===sb.id))%PAL.length];

// ---------- engine ----------
function stats(sb){
  const hs=new Set(S.holidays.map(h=>h.date));
  let a=sb.initialBalance.attended,h=sb.initialBalance.held;
  for(const r of S.records){
    if(r.subjectId!==sb.id||hs.has(r.date))continue;
    if(r.status==='PRESENT'){a++;h++}
    else if(r.status==='ABSENT')h++;
    else if(r.status==='OD'&&S.config.odCountsAsPresent){a++;h++}
  }
  const t=Math.min(100,Math.max(1,Math.round(sb.targetPercent)));
  const safe=h===0||a*100>=t*h;let sf=0,rc=0;
  if(h>0){if(safe)sf=Math.max(0,Math.floor((a*100-t*h)/t));else rc=t>=100?null:Math.ceil((t*h-a*100)/(100-t))}
  const p=h?a/h*100:100;
  return{a,h,t,safe,sf,rc,p:(Math.floor(p*10)/10).toFixed(1),i:Math.floor(p)};
}
function setSlot(sid,slot,d,st){
  const id=rid(sid,d,slot);S.records=S.records.filter(r=>r.id!==id);
  if(st)S.records.push({id,subjectId:sid,date:d,slotId:slot,status:st,isExtraClass:false,timestamp:Date.now()});
}
function items(d,f){
  const out=[];
  S.timetable.filter(t=>t.dayOfWeek===dow(pd(d))&&(!f||t.subjectId===f)).sort(byT).forEach(t=>{
    const sb=subj(t.subjectId);if(sb)out.push({sb,t,r:S.records.find(r=>r.id===rid(t.subjectId,d,t.id))})});
  S.records.filter(r=>r.date===d&&r.isExtraClass&&(!f||r.subjectId===f)).forEach(r=>{
    const sb=subj(r.subjectId);if(sb)out.push({sb,r,x:1})});
  return out;
}

// ---------- ui state ----------
const ST=[['PRESENT','P','Attended'],['ABSENT','A','Not Attended'],['CANCELLED','C','Cancelled'],['OD','OD','On Duty']];
const COL={PRESENT:'#22c55e',ABSENT:'#ef4444',CANCELLED:'#eab308',OD:'#3b82f6'};
const DN=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let tab='sub',SEL=null,SELD=null,CAL=new Date(),LD=ds(new Date()),OPEN=new Set([dow(new Date())]),sheet=null;

function ring(p,sz,c,txt){
  const r=sz/2-5,C=2*Math.PI*r,m=sz/2;
  return`<svg width="${sz}" height="${sz}" style="flex:none"><circle cx="${m}" cy="${m}" r="${r}" stroke="rgba(255,255,255,.12)" stroke-width="5" fill="none"/><circle cx="${m}" cy="${m}" r="${r}" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${C*Math.min(100,p)/100} ${C}" transform="rotate(-90 ${m} ${m})"/><text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="#fff" font-weight="700" font-size="${sz/4.4}">${txt}</text></svg>`;
}
const pc=s=>s.safe?'#4ade80':'#f87171';
function msg(s){
  if(s.h===0)return`<div class="msg mu">No classes yet.</div>`;
  if(!s.safe)return`<div class="msg bad">${s.rc===null?'Target unreachable.':`Attend next ${s.rc} class${s.rc>1?'es':''}.`}</div>`;
  return s.sf>0?`<div class="msg ok">Can skip ${s.sf} class${s.sf>1?'es':''}.</div>`:`<div class="msg bl">Cannot skip classes.</div>`;
}

// ---------- views ----------
function vSub(){
  if(SEL)return vCal();
  let A=0,H=0;S.subjects.forEach(s=>{const x=stats(s);A+=x.a;H+=x.h});
  const op=H?Math.floor(A/H*100):100;
  let h=`<h1><span>My Subjects 📚</span>${S.subjects.length?ring(op,56,'#4ade80',op+'%'):''}</h1>`;
  if(!S.subjects.length)h+=`<div class="glass" style="padding:20px">Neeche <b>+</b> dabake pehla subject add karo.</div>`;
  for(const sb of S.subjects){
    const s=stats(sb);
    h+=`<div class="glass sc" data-a=open data-id="${sb.id}"><div><b>${esc(sb.name)}</b><div class=cnt style="margin-top:10px"><b>${s.a}</b>Attended</div><div class=cnt><b>${s.h-s.a}</b>Missed</div><div class=cnt><b>${s.h}</b>Total</div>${msg(s)}<div class=mu>Requirement: ${s.t}%</div></div>${ring(s.i,130,pc(s),s.i+'%')}</div>
    <div class=adj><div>Attended<br><button class=m data-a=adj data-id="${sb.id}" data-k=a data-n=-1>−</button><button class=p data-a=adj data-id="${sb.id}" data-k=a data-n=1>+</button></div><div>Missed<br><button class=m data-a=adj data-id="${sb.id}" data-k=m data-n=-1>−</button><button class=p data-a=adj data-id="${sb.id}" data-k=m data-n=1>+</button></div></div>`;
  }
  return h;
}

function logCard(it,d){
  const{sb,t,r,x}=it,s=stats(sb);
  const lab=r?ST.find(z=>z[0]===r.status)[1]:'N/A';
  return`<div class="glass lg"><div><h3>${esc(sb.name)}</h3><div class=mu>${x?'Extra class':'⏰ '+fm(t.startTime)+' – '+fm(t.endTime)}</div>${t&&t.room?`<div class=mu>Room: ${esc(t.room)}</div>`:''}<div class=pc style="color:${pc(s)}">Attendance: ${s.i}%</div></div>
  <button class=circ style="background:${r?COL[r.status]:'#3b82f6'}" data-a=menu data-d="${d}" ${x?`data-id="${r.id}"`:`data-sid="${sb.id}" data-slot="${t.id}"`}>${lab}</button></div>`;
}
function dayPanel(d,f){
  if(isHol(d))return`<div class="glass" style="padding:18px;margin:12px 0">🏖 Holiday: ${esc(S.holidays.find(h=>h.date===d).reason)}<br><button style="margin-top:10px" data-a=hol data-d="${d}">Unmark holiday</button></div>`;
  const{semesterStartDate:a,semesterEndDate:b}=S.config;
  if((a&&d<a)||(b&&d>b))return`<div class="glass mu" style="padding:18px;margin:12px 0">Outside semester dates</div>`;
  const it=items(d,f);
  return(it.map(i=>logCard(i,d)).join('')||`<div class="glass mu" style="padding:18px;margin:12px 0">No classes scheduled</div>`)
  +`<div class=row><button data-a=xtra data-d="${d}" data-sid="${f||''}">+ Extra class</button><button data-a=hol data-d="${d}">🏖 Holiday</button></div>`;
}
function vLog(){
  const d=LD,hol=isHol(d),it=hol?[]:items(d,'');
  let h=`<h1>Attendance 🧑‍🎓</h1><div class=row><div class="glass row" style="flex:1;padding:6px"><button class=rd style="border-radius:50%;width:44px;height:44px;padding:0;background:#3b82f6;border:0" data-a=ld data-n=-1>‹</button><b class=bl>${fmt(d)}</b><button style="border-radius:50%;width:44px;height:44px;padding:0;background:#3b82f6;border:0" data-a=ld data-n=1>›</button></div><button data-a=hol data-d="${d}" style="width:58px;height:58px;border-radius:50%;background:#f59e0b;border:0;font-size:26px;padding:0">🏖</button></div>`;
  if(!hol&&it.length)h+=`<div class=row style="margin:12px 4px"><div class=mu>Total classes: ${it.length}<br>Marked classes: ${it.filter(i=>i.r).length}</div><button data-a=allp style="color:var(--g);font-weight:700">🅟 Mark All Present</button></div>`;
  return h+dayPanel(d,'');
}

function vTT(){
  let h=`<h1>Time Table 📅</h1>`;
  for(let w=1;w<=7;w++){
    const sl=S.timetable.filter(t=>t.dayOfWeek===w&&subj(t.subjectId)).sort(byT);if(!sl.length)continue;
    const o=OPEN.has(w);
    h+=`<div class="glass dh" data-a=tog data-w="${w}"><span><b>${DN[w]}</b> <span class=mu>(${sl.length} classes)</span></span><span>${o?'⌄':'›'}</span></div>`;
    if(o)h+=sl.map(t=>{const sb=subj(t.subjectId),s=stats(sb);
      return`<div class="glass tt" style="--c:${col(sb)}"><i></i><div class=ttb><h3>${esc(sb.name)}</h3><div class=mu>⏰ ${fm(t.startTime)} – ${fm(t.endTime)}</div>${t.room?`<div class=mu>📍 ${esc(t.room)}</div>`:''}</div>${ring(s.i,66,pc(s),s.i+'%')}<button class=x data-a=delslot data-id="${t.id}">✕</button></div>`}).join('');
  }
  if(!S.timetable.length)h+=`<div class="glass" style="padding:20px">Neeche <b>+</b> dabake class slot add karo.</div>`;
  return h;
}

function vAs(){
  const td=ds(new Date()),A=[...S.assignments].sort((a,b)=>(a.done-b.done)||a.due.localeCompare(b.due));
  let h=`<h1>Assignments 📋</h1>`;
  if(!A.length)h+=`<div class="glass" style="padding:20px">Koi assignment nahi. <b>+</b> se add karo.</div>`;
  return h+A.map(a=>{const od=!a.done&&a.due<td,sb=subj(a.subjectId);
    return`<div class="glass as ${a.done?'dn':''}"><button class=chk data-a=asdone data-id="${a.id}">${a.done?'✓':''}</button><div class=ttb><h3>${esc(a.title)}</h3><div class=mu style="${od?'color:var(--r)':''}">${sb?esc(sb.name)+' · ':''}Due ${fmt(a.due)}${od?' · overdue':''}</div></div><button class=x data-a=asdel data-id="${a.id}">✕</button></div>`}).join('');
}

function vSet(){
  const c=S.config;
  return`<h1>Settings</h1>
  <h2>Preferences</h2><div class="glass set">
  <label class=row>OD ko present count karo<input type=checkbox id=cf-od ${c.odCountsAsPresent?'checked':''} data-ch=1></label>
  <div><div class=mu>Default target %</div><input id=cf-t type=number value="${c.defaultTarget}"><div class=mu>Semester start / end</div><input id=cf-s type=date value="${c.semesterStartDate||''}"><input id=cf-e type=date value="${c.semesterEndDate||''}"><button class=pri data-a=savecfg>Save</button></div></div>
  <h2>Holidays</h2><div class="glass set"><div><button class=pri style="margin:0" data-a=sheet data-k=holr>🏖 Add holiday / break</button></div>
  ${S.holidays.map(h=>`<div class=row><span>${fmt(h.date)} <span class=mu>${esc(h.reason)}</span></span><button class=x data-a=unhol data-d="${h.date}">✕</button></div>`).join('')}</div>
  <h2>Account & Data</h2><div class="glass set">
  <div class=mu>Last backup: ${S.lastBackupAt?new Date(S.lastBackupAt).toLocaleString('en-IN'):'never ⚠️'}</div>
  <div class=row><button data-a=export>⬇ Export JSON</button><button data-a=import>⬆ Import JSON</button></div>
  <div><button class=dng data-a=reset>↻ Reset the Semester</button></div></div>`;
}

function vCal(){
  const sb=subj(SEL);if(!sb){SEL=null;return vSub()}
  const s=stats(sb),y=CAL.getFullYear(),m=CAL.getMonth(),lead=(new Date(y,m,1).getDay()+6)%7,n=new Date(y,m+1,0).getDate();
  let c=['M','T','W','T','F','S','S'].map(x=>`<div class=h>${x}</div>`).join('')+'<div class=e></div>'.repeat(lead);
  for(let i=1;i<=n;i++){
    const d=ds(new Date(y,m,i));
    const dots=S.records.filter(r=>r.subjectId===sb.id&&r.date===d).map(r=>`<span class=dot style="background:${COL[r.status]}"></span>`).join('');
    c+=`<div class="${isHol(d)?'hol':''} ${SELD===d?'sel':''}" data-a=day data-d="${d}">${i}<br>${dots}</div>`;
  }
  return`<div class=row style="margin-top:14px"><button data-a=back>‹ Back</button><button class=dng data-a=delsub data-id="${sb.id}">Delete subject</button></div>
  <h1><span>${esc(sb.name)}</span>${ring(s.i,64,pc(s),s.i+'%')}</h1>
  <div class="glass" style="padding:14px 18px">${s.a} attended · ${s.h-s.a} missed · ${s.h} total${msg(s)}</div>
  <div class=row style="margin-top:14px"><button data-a=mon data-n=-1>‹</button><b>${CAL.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</b><button data-a=mon data-n=1>›</button></div>
  <div class=cal>${c}</div>
  <div class=mu><span class=dot style="background:#22c55e"></span>Present <span class=dot style="background:#ef4444"></span>Absent <span class=dot style="background:#eab308"></span>Cancelled <span class=dot style="background:#3b82f6"></span>OD · grey = holiday</div>
  ${SELD?`<h2>${fmt(SELD)}</h2>`+dayPanel(SELD,sb.id):'<div class=mu style="margin-top:10px">Kisi date par tap karke edit karo</div>'}`;
}

function vSheet(){
  if(!sheet)return'';
  const k=sheet.k,td=ds(new Date());
  const opts=S.subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  let h='';
  if(k==='st')h=`<h3>Mark class</h3>`+ST.map(z=>`<button class=opt data-a=pick data-s="${z[0]}">${z[2]}</button>`).join('')+`<button class=opt data-a=pick data-s="">Clear</button>`;
  else if(k==='sub')h=`<h3>Add subject</h3><input id=f1 placeholder="Subject name (e.g. CSMC101 C Prog)"><input id=f2 type=number placeholder="Target %" value="${S.config.defaultTarget}"><div class=mu>Opening balance (semester beech me ho to)</div><input id=f3 type=number placeholder="Attended so far" value=0><input id=f4 type=number placeholder="Total held so far" value=0><button class=pri data-a=addsub>Add</button>`;
  else if(k==='slot')h=S.subjects.length?`<h3>Add class slot</h3><select id=f1>${DN.slice(1).map((n,i)=>`<option value=${i+1}>${n}</option>`).join('')}</select><select id=f2>${opts}</select><div class=row><input id=f3 type=time value="09:00"><input id=f4 type=time value="10:00"></div><input id=f5 placeholder="Room (optional)"><button class=pri data-a=addslot>Add</button>`:'<h3>Pehle subject add karo</h3>';
  else if(k==='as')h=`<h3>Add assignment</h3><input id=f1 placeholder="Title"><select id=f2><option value="">No subject</option>${opts}</select><input id=f3 type=date value="${td}"><button class=pri data-a=addas>Add</button>`;
  else if(k==='xtra')h=S.subjects.length?`<h3>Extra class</h3><select id=f1>${opts}</select><button class=pri data-a=addx>Add as Present</button>`:'<h3>Pehle subject add karo</h3>';
  else if(k==='holr')h=`<h3>Holiday / break</h3><div class=mu>Ek din ke liye dono date same rakho</div><input id=f1 type=date value="${td}"><input id=f2 type=date value="${td}"><input id=f3 placeholder="Reason (Diwali, Strike…)"><button class=pri data-a=addhol>Mark holiday</button>`;
  return`<div class=ov><div class=sheet>${h}</div></div>`;
}

const V={sub:vSub,log:vLog,tt:vTT,as:vAs,set:vSet};
const TABS=[['sub','📖','Subjects'],['log','🗒️','Daily Log'],['tt','📅','Timetable'],['as','📋','Assignments'],['set','⚙️','Settings']];
const FAB={sub:'sub',tt:'slot',as:'as'};
function render(){
  $('#app').innerHTML=V[tab]();
  $('#nav').innerHTML=TABS.map(([k,i,l])=>`<button class="${tab===k?'on':''}" data-a=tab data-t="${k}"><span>${i}</span>${l}</button>`).join('');
  $('#fab').innerHTML=FAB[tab]&&!SEL?`<button class=pri data-a=sheet data-k="${FAB[tab]}">+</button>`:'';
  $('#sh').innerHTML=vSheet();
}
function commit(){save();render()}

// ---------- events ----------
document.addEventListener('click',e=>{
  if(e.target.classList.contains('ov')){sheet=null;return render()}
  const el=e.target.closest('[data-a]');if(!el)return;
  const a=el.dataset.a,d=el.dataset,v=id=>$('#'+id).value;
  switch(a){
    case'tab':tab=d.t;SEL=null;SELD=null;sheet=null;return render();
    case'sheet':sheet={k:d.k};return render();
    case'menu':sheet={k:'st',d:d.d,id:d.id,sid:d.sid,slot:d.slot};return render();
    case'pick':{const z=sheet;sheet=null;
      if(z.id){if(d.s==='')S.records=S.records.filter(r=>r.id!==z.id);else{const r=S.records.find(r=>r.id===z.id);if(r)r.status=d.s}}
      else setSlot(z.sid,z.slot,z.d,d.s);break}
    case'allp':items(LD,'').forEach(i=>{if(!i.r&&!i.x)setSlot(i.sb.id,i.t.id,LD,'PRESENT')});break;
    case'xtra':if(d.sid){S.records.push({id:'extra_'+uid(),subjectId:d.sid,date:d.d,slotId:null,status:'PRESENT',isExtraClass:true,timestamp:Date.now()})}
      else{sheet={k:'xtra',d:d.d};return render()}break;
    case'addx':S.records.push({id:'extra_'+uid(),subjectId:v('f1'),date:LD,slotId:null,status:'PRESENT',isExtraClass:true,timestamp:Date.now()});sheet=null;break;
    case'ld':{const x=pd(LD);x.setDate(x.getDate()+ +d.n);LD=ds(x);return render()}
    case'hol':{const have=isHol(d.d);S.holidays=have?S.holidays.filter(h=>h.date!==d.d):[...S.holidays,{date:d.d,reason:'Holiday'}].sort((p,q)=>p.date.localeCompare(q.date));break}
    case'unhol':S.holidays=S.holidays.filter(h=>h.date!==d.d);break;
    case'addhol':{if(!v('f1')||!v('f2'))return;const have=new Set(S.holidays.map(h=>h.date));
      range(v('f1'),v('f2')).forEach(x=>{if(!have.has(x))S.holidays.push({date:x,reason:v('f3')||'Holiday'})});
      S.holidays.sort((p,q)=>p.date.localeCompare(q.date));sheet=null;break}
    case'addsub':{
      const n=v('f1').trim(),t=+v('f2'),at=+v('f3'),h=+v('f4');
      if(!n)return alert('Naam daalo');if(!(t>=1&&t<=100))return alert('Target 1-100 hona chahiye');
      if(at<0||h<0||at>h)return alert('Attended, held se zyada nahi ho sakta');
      S.subjects.push({id:uid(),name:n,targetPercent:Math.round(t),initialBalance:{attended:at,held:h}});sheet=null;break}
    case'adj':{const b=subj(d.id).initialBalance,n=+d.n;
      if(d.k==='a'){if(n>0){b.attended++;b.held++}else if(b.attended>0){b.attended--;b.held--}else return alert('Ye count daily records se aaya hai. Daily Log ya calendar me edit karo.')}
      else{if(n>0)b.held++;else if(b.held-b.attended>0)b.held--;else return alert('Ye count daily records se aaya hai. Daily Log ya calendar me edit karo.')}break}
    case'open':SEL=d.id;SELD=ds(new Date());CAL=new Date();break;
    case'back':SEL=null;SELD=null;break;
    case'mon':CAL=new Date(CAL.getFullYear(),CAL.getMonth()+ +d.n,1);return render();
    case'day':SELD=d.d;return render();
    case'delsub':if(!confirm('Subject, uska timetable aur sab records delete honge. Pakka?'))return;
      S.subjects=S.subjects.filter(s=>s.id!==d.id);S.timetable=S.timetable.filter(t=>t.subjectId!==d.id);S.records=S.records.filter(r=>r.subjectId!==d.id);SEL=null;break;
    case'tog':{const w=+d.w;OPEN.has(w)?OPEN.delete(w):OPEN.add(w);return render()}
    case'addslot':if(v('f3')>=v('f4'))return alert('End time start ke baad hona chahiye');
      S.timetable.push({id:uid(),dayOfWeek:+v('f1'),subjectId:v('f2'),startTime:v('f3'),endTime:v('f4'),room:v('f5').trim()});OPEN.add(+v('f1'));sheet=null;break;
    case'delslot':S.timetable=S.timetable.filter(t=>t.id!==d.id);break;
    case'addas':if(!v('f1').trim())return alert('Title daalo');
      S.assignments.push({id:uid(),title:v('f1').trim(),subjectId:v('f2'),due:v('f3'),done:false});sheet=null;break;
    case'asdone':{const x=S.assignments.find(x=>x.id===d.id);if(x)x.done=!x.done;break}
    case'asdel':S.assignments=S.assignments.filter(x=>x.id!==d.id);break;
    case'savecfg':S.config={...S.config,odCountsAsPresent:$('#cf-od').checked,defaultTarget:Math.min(100,Math.max(1,+v('cf-t')||75)),semesterStartDate:v('cf-s'),semesterEndDate:v('cf-e')};alert('Saved ✅');break;
    case'reset':if(!confirm('Sab records, holidays, assignments aur opening balance 0 ho jayenge. Subjects/timetable bachenge. Pehle backup le lo. Pakka?'))return;
      S.records=[];S.holidays=[];S.assignments=[];S.subjects.forEach(s=>s.initialBalance={attended:0,held:0});break;
    case'export':{
      S.lastBackupAt=Date.now();save();
      const u=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));
      const l=document.createElement('a');l.href=u;l.download=`attendance-backup-${ds(new Date())}.json`;l.click();setTimeout(()=>URL.revokeObjectURL(u),1000);break}
    case'import':return $('#imp').click();
  }
  commit();
});
$('#imp').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{
    const x=JSON.parse(await f.text());
    if(x.version!==1||!['subjects','timetable','records','holidays'].every(k=>Array.isArray(x[k])))throw 0;
    if(!confirm('Current data replace ho jayega. Continue?'))return;
    S={...structuredClone(D),...x,config:{...D.config,...x.config}};commit();alert('Imported ✅');
  }catch(_){alert('Ye valid backup file nahi hai')}
});
render();
