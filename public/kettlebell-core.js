export const movements = {
  deadlift: {group:'hinge', name:'壺鈴硬舉', cue:'鈴在兩腳之間，髖往後折，手臂放長；踩穩地板站直，再把鈴放回。', check:'腰背保持自然；鈴靠近身體。'},
  'wide-deadlift': {group:'hinge', name:'壺鈴寬站硬舉', cue:'站距略寬、腳尖微朝外，壺鈴放在兩腳之間。髖往後折，雙腳踩地站直。', check:'選擇自然站距，膝蓋跟著腳尖方向。'},
  swing: {group:'hinge', name:'雙手壺鈴擺盪', skilled:true, cue:'用髖往後帶鈴，靠髖伸展送鈴向前；手只引導，讓鈴自然落回。', check:'需已熟悉擺盪。若開始用手拉或腰背代償，停下並改硬舉。'},
  squat: {group:'legs', name:'高腳杯深蹲', cue:'把鈴抱近胸口，腳掌踩穩，屈膝屈髖下蹲到可控制的深度，再起身。', check:'膝蓋跟著腳尖方向，腳跟保持踩地。'},
  'chair-squat': {group:'legs', name:'徒手椅子深蹲', bodyweight:true, cue:'面向前方站在穩固的椅子前，髖部向後坐到椅面，再踩穩雙腳站起。', check:'椅子靠牆固定，控制下坐速度。'},
  lunge: {group:'legs', name:'高腳杯後跨弓箭步', skilled:true, cue:'把鈴抱在胸前，向後跨一步，前腳踩穩後推地回來，左右交替。', check:'先用小步幅確認平衡；兩側平均分配時間。'},
  press: {group:'push', name:'單手壺鈴地板推舉', cue:'仰躺、屈膝踩地。用雙手協助把鈴就位，單手推起，慢慢降到上臂輕觸地面。', check:'手腕保持直；放穩鈴再換手，兩側平均分配時間。'},
  pushup: {group:'push', name:'斜板伏地挺身', bodyweight:true, cue:'雙手撐牢固的高台，身體維持一直線；胸口靠近支撐面，再推回。', check:'先確認支撐面不會滑動；提高支撐面可降低難度。'},
  row: {group:'pull', name:'單手支撐壺鈴划船', cue:'一手撐穩固支撐物，髖往後折；另一手把鈴拉向髖部，再慢慢放下。', check:'胸口保持朝下，不扭腰；放穩鈴再換手。'},
  'two-hand-row': {group:'pull', name:'雙手俯身壺鈴划船', cue:'雙手握鈴，膝微彎、髖往後折；把鈴拉向下肋，再慢慢放下。', check:'軀幹保持穩定；若很難維持姿勢就換成支撐划船。'},
  carry: {group:'core', name:'單手提鈴原地踏步', cue:'單手提鈴站直，原地慢慢左右抬腳；放下鈴，換另一側。', check:'別往持鈴側傾斜；兩側平均分配時間。'},
  hold: {group:'core', name:'單手提鈴靜止站姿', cue:'單手提鈴，站穩、自然呼吸；把鈴放回地面後再換手。', check:'讓肩膀和骨盆維持水平，別憋氣。'},
};

const baseMoves = ['deadlift','squat','press','row','carry'];
const owns = (value,key) => Object.hasOwn(value,key);
const object = value => value && typeof value==='object' && !Array.isArray(value);
const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const bounded = (value,min,max) => Number.isFinite(value) && value>=min && value<=max;
const integer = (value,min,max) => Number.isInteger(value) && bounded(value,min,max);
const fail = message => { throw Error(message); };
export const emptyKettlebell = () => ({plans:{}, active:null, sessions:[]});
export const formatClock = seconds => `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;

export function allowedMoves(move,familiar) {
  return Object.keys(movements).filter(id=>movements[id].group===movements[move]?.group && (!movements[id].skilled || familiar.includes(id)));
}

export function circuitPhases(plan) {
  const phases = [{kind:'warmup', seconds:180}];
  for(let round=0;round<plan.rounds;round++) {
    for(let slot=0;slot<plan.moves.length;slot++) {
      phases.push({kind:'work',round,slot,seconds:plan.work});
      if(slot<plan.moves.length-1) phases.push({kind:'transition',seconds:plan.transition,round,slot});
      else if(round<plan.rounds-1) phases.push({kind:'rest',seconds:plan.rest,round});
    }
  }
  phases.push({kind:'cooldown',seconds:120});
  return phases;
}

export const plannedSeconds = plan => circuitPhases(plan).reduce((sum,phase)=>sum+phase.seconds,0);

export function buildCircuit(input) {
  const {date,minutes,count,rounds,pace}=input;
  if(!validDate(date) || !integer(minutes,10,90) || ![4,5].includes(count) || !integer(rounds,2,5) || !['steady','interval'].includes(pace)) fail('請檢查日期、可用時間、輪數與強度。');
  if(!Array.isArray(input.weights) || !input.weights.length || input.weights.length>10 || !input.weights.every(kg=>bounded(kg,1,100))) fail('請輸入 1–10 個可用重量，每個為 1–100 公斤。');
  if(!Array.isArray(input.familiar) || input.familiar.length>2 || !input.familiar.every(id=>id==='swing'||id==='lunge')) fail('熟悉動作的選擇不正確。');
  const weights=[...new Set(input.weights)].sort((a,b)=>a-b);
  const familiar=[...new Set(input.familiar)];
  const defaults=baseMoves.slice(0,count).map((move,index)=>pace==='interval'&&index===0&&familiar.includes('swing')?'swing':move);
  const moves=input.moves??defaults;
  if(!Array.isArray(moves)||moves.length!==count||!moves.every((move,index)=>allowedMoves(defaults[index],familiar).includes(move))) fail('請選擇同類型且熟悉的替換動作。');
  const plan={date,minutes,count,rounds,pace,weights,familiar,moves:[...moves],work:pace==='interval'?30:25,transition:pace==='interval'?25:35,rest:pace==='interval'?60:75};
  while(plan.rounds>2 && plannedSeconds(plan)>minutes*60) plan.rounds--;
  if(plannedSeconds(plan)>minutes*60) fail(`這個組合至少需要 ${Math.ceil(plannedSeconds(plan)/60)} 分鐘，請增加時間或選擇較少動作。`);
  return plan;
}

export const currentPhase = session => circuitPhases(session.plan)[session.index];
const fullPhaseMs = session => currentPhase(session).seconds*1000+session.extraMs;
export const remainingMs = (session,now=Date.now()) => Math.min(fullPhaseMs(session),session.deadline===null?session.remainingMs:Math.max(0,session.deadline-now));

export function sessionTotals(session) {
  const work=session.log.filter(entry=>entry.kind==='work');
  const rounds=Array.from({length:session.plan.rounds},(_,round)=>work.filter(entry=>entry.round===round&&entry.seconds===session.plan.work).length===session.plan.moves.length).filter(Boolean).length;
  return {rounds,slots:work.filter(entry=>entry.seconds>0).length,workSeconds:work.reduce((sum,entry)=>sum+entry.seconds,0),totalSeconds:session.log.reduce((sum,entry)=>sum+entry.seconds,0)};
}

const compatibleSports=new Set(['','unknown','generic','other','all','training','fitnessequipment','strength','strengthtraining','resistancetraining','functionalstrengthtraining','traditionalstrengthtraining','weightlifting','weighttraining','kettlebell','hiit','highintensityintervaltraining','workout']);
const normalizeSport=sport=>String(sport??'').toLowerCase().replace(/[\s_-]+/g,'');

export function matchesCircuitTime(session,activity) {
  const start=Date.parse(activity.startedAt), duration=activity.durationSeconds;
  if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0||!compatibleSports.has(normalizeSport(activity.sport)))return false;
  // Tolerate watch/phone clock and start differences, but require the two records to cover the same time window.
  return Math.abs(start-session.startedAt)<=15*60_000
    && start<=session.finishedAt+2*60_000 && start+duration*1000>=session.startedAt-2*60_000;
}

export function findCircuitMatches(state,session) {
  return state.activities.filter(activity=>!activity.planId&&!activity.kettlebellSessionId&&matchesCircuitTime(session,activity))
    .sort((a,b)=>Math.abs(Date.parse(a.startedAt)-session.startedAt)-Math.abs(Date.parse(b.startedAt)-session.startedAt));
}

export function circuitDeviceRecords(state) {
  const devices=new Map();
  for(const activity of state.activities??[]){
    const id=activity.kettlebellSessionId;
    if(!id)continue;
    const previous=devices.get(id);
    if(!previous||(!(previous.avgHeartRate>0)&&activity.avgHeartRate>0))devices.set(id,activity);
  }
  return devices;
}

function matchCircuitActivity(state,command) {
  const session=state.kettlebell?.sessions.find(item=>item.id===command.id);
  const activity=state.activities.find(item=>item.id===command.activityId);
  if(!session||!activity)fail('找不到這堂壺鈴課或活動，請重新整理。');
  if(command.action==='unmatch-activity') {
    if(activity.kettlebellSessionId!==session.id)fail('這筆活動沒有對應到這堂壺鈴課。');
    delete activity.kettlebellSessionId;
    return;
  }
  if(activity.kettlebellSessionId===session.id)return;
  if(activity.planId||activity.kettlebellSessionId)fail('這筆活動已有課表對應，請先解除原對應。');
  if(!matchesCircuitTime(session,activity))fail('活動時間或運動類型與這堂壺鈴課不符。');
  activity.kettlebellSessionId=session.id;
}

function startPhase(session) {
  session.extraMs=0;
  session.remainingMs=fullPhaseMs(session);
  session.deadline=null;
}

function capture(session,command,now) {
  const phase=currentPhase(session);
  const seconds=command.skip?0:Math.floor((fullPhaseMs(session)-remainingMs(session,now))/1000);
  const entry={...phase,seconds};
  if(phase.kind==='work') {
    entry.move=session.plan.moves[phase.slot];
    const {kg=null,reps=null}=command;
    if((kg!==null&&!bounded(kg,0,100))||(reps!==null&&!integer(reps,0,300))) fail('請檢查重量與次數。');
    if(!command.skip && reps>0 && !seconds) fail('請先啟動本段計時，再登錄實際次數。');
    entry.kg=seconds>0&&!movements[entry.move].bodyweight?kg:null;
    entry.reps=seconds>0?reps:null;
  }
  session.log.push(entry);
}

// Commands apply to the saved revision so two tabs cannot log the same interval twice.
export function updateKettlebell(state,command,{now=Date.now(),makeId=()=>globalThis.crypto.randomUUID()}={}) {
  if(command.action==='match-activity'||command.action==='unmatch-activity')return matchCircuitActivity(state,command);
  const kb=state.kettlebell??=emptyKettlebell();
  const {action,date}=command;
  if(['save','remove','start'].includes(action)) {
    if(!validDate(date)) fail('請選擇有效的課表日期。');
    if(kb.active?.plan.date===date || kb.sessions.some(session=>session.plan.date===date)) fail('這天已有訓練進度或結果，原課表已保留。');
    if(action==='remove') { delete kb.plans[date]; return; }
    if(action==='save') {
      const plan=buildCircuit(command);
      const day=[...state.plan,...Object.values(state.planHistory??{}).flat()].find(item=>item.id===date);
      plan.original=owns(kb.plans,date)?kb.plans[date].original:(day?.minutes>0&&day.type!=='Rest'?{type:day.type,minutes:day.minutes}:null);
      kb.plans[date]=plan;
      return;
    }
    if(kb.active) fail('請先完成或結束進行中的壺鈴訓練。');
    if(!owns(kb.plans,date)) fail('請先把壺鈴課加入課表。');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:state.context.timezone}).format(new Date(now));
    if(date!==today) fail('請在課表日期當天開始；過期的課可另排到今天。');
    const session={id:makeId(),rev:0,plan:structuredClone(kb.plans[date]),startedAt:now,index:0,log:[],extraMs:0,deadline:null,remainingMs:0};
    startPhase(session);
    session.deadline=now+session.remainingMs;
    kb.active=session;
    return;
  }
  if(action==='finish'&&kb.sessions.some(item=>item.id===command.id)) return;
  const session=kb.active;
  if(!session || session.id!==command.id || session.rev!==command.rev) fail('進度已更新，請重新整理後再繼續。');
  const phase=currentPhase(session);
  switch(action) {
    case 'pause': session.remainingMs=remainingMs(session,now);session.deadline=null;break;
    case 'resume': if(session.deadline===null&&session.remainingMs>0)session.deadline=now+session.remainingMs;break;
    case 'extend': {
      if(!['transition','rest'].includes(phase.kind)||session.extraMs>=300000) fail('只有換站或輪間休息可加時，最多 5 分鐘。');
      const left=remainingMs(session,now);
      session.extraMs+=15000;
      if(session.deadline===null)session.remainingMs=left+15000;
      else session.deadline=now+left+15000;
      break;
    }
    case 'replace': {
      if(phase.kind!=='work'||!allowedMoves(session.plan.moves[phase.slot],session.plan.familiar).includes(command.move)||remainingMs(session,now)<fullPhaseMs(session)) fail('請在本段啟動前選擇同類動作。');
      session.plan.moves[phase.slot]=command.move;
      break;
    }
    case 'next':
    case 'finish': {
      capture(session,command,now);
      if(action==='finish'||session.index===circuitPhases(session.plan).length-1) {
        const {id,plan,log,startedAt}=session;
        if(log.some(entry=>entry.seconds>0))kb.sessions.push({id,plan,log,startedAt,finishedAt:now});
        kb.active=null;
        return;
      }
      session.index++;
      startPhase(session);
      // Rest starts after the last station is logged; work always waits for an explicit start.
      if(['transition','rest'].includes(currentPhase(session).kind)) session.deadline=now+session.remainingMs;
      break;
    }
    default: fail('找不到壺鈴操作。');
  }
  session.rev++;
}

// A backup may predate this feature; otherwise rebuild plans and check every stored segment.
export function restoreKettlebell(data=emptyKettlebell()) {
  const bad=()=>fail('備份的壺鈴課表或訓練紀錄格式不正確。');
  if(!object(data)||!object(data.plans)||!Array.isArray(data.sessions)||!owns(data,'active')) bad();
  const cleanPlan=raw=>{
    if(!object(raw)) bad();
    let plan;
    try{plan=buildCircuit(raw);}catch{bad();}
    if(raw.original!==null && (!object(raw.original)||!['Zone2','Interval','Tempo','Recovery','Long Run','Indoor'].includes(raw.original.type)||!bounded(raw.original.minutes,0,180))) bad();
    return {...plan,original:raw.original===null?null:{type:raw.original.type,minutes:raw.original.minutes}};
  };
  const plans=Object.fromEntries(Object.entries(data.plans).map(([date,raw])=>{
    const plan=cleanPlan(raw);
    if(date!==plan.date)bad();
    return [date,plan];
  }));
  const ids=new Set(), dates=new Set();
  const cleanSession=(raw,active)=>{
    if(!object(raw)||typeof raw.id!=='string'||!/^[-\w]{1,128}$/.test(raw.id)||ids.has(raw.id)||!integer(raw.startedAt,0,8640000000000000)||!Array.isArray(raw.log)) bad();
    const plan=cleanPlan(raw.plan), phases=circuitPhases(plan);
    if(!owns(plans,plan.date)||dates.has(plan.date)||raw.log.length>phases.length)bad();
    ids.add(raw.id);dates.add(plan.date);
    const log=raw.log.map((entry,index)=>{
      const phase=phases[index];
      if(!object(entry)||entry.kind!==phase.kind||!integer(entry.seconds,0,phase.seconds+(['transition','rest'].includes(phase.kind)?300:0))) bad();
      const result={...phase,seconds:entry.seconds};
      if(phase.kind==='work'){
        if(!allowedMoves(plan.moves[phase.slot],plan.familiar).includes(entry.move)||(entry.kg!==null&&!bounded(entry.kg,0,100))||(entry.reps!==null&&!integer(entry.reps,0,300))) bad();
        Object.assign(result,{move:entry.move,kg:entry.kg,reps:entry.reps});
      }
      return result;
    });
    const session={id:raw.id,plan,log,startedAt:raw.startedAt};
    if(!active){
      if(!integer(raw.finishedAt,raw.startedAt,8640000000000000)||!log.some(entry=>entry.seconds>0))bad();
      return {...session,finishedAt:raw.finishedAt};
    }
    const phase=phases[log.length];
    if(!phase||raw.index!==log.length||!integer(raw.rev,raw.index,Number.MAX_SAFE_INTEGER)||!integer(raw.extraMs,0,['transition','rest'].includes(phase.kind)?300000:0)||!integer(raw.remainingMs,0,phase.seconds*1000+raw.extraMs)||(raw.deadline!==null&&!integer(raw.deadline,raw.startedAt,8640000000000000)))bad();
    return {...session,index:raw.index,rev:raw.rev,extraMs:raw.extraMs,remainingMs:raw.remainingMs,deadline:raw.deadline};
  };
  const sessions=data.sessions.map(item=>cleanSession(item,false));
  return {plans,sessions,active:data.active===null?null:cleanSession(data.active,true)};
}
