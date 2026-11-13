import {allowedMoves, buildCircuit, circuitPhases, currentPhase, findCircuitMatches, formatClock, movements, plannedSeconds, remainingMs, sessionTotals} from './kettlebell-core.js';
import {renderResearch} from './training-research.js';
import {mountMovementGuidance,movementGuide} from './kettlebell-guidance.js';

const phaseLabels={warmup:'暖身',work:'動作',transition:'換站休息',rest:'輪間休息',cooldown:'緩和'};
const shortTime=seconds=>`${Math.floor(seconds/60)} 分 ${String(seconds%60).padStart(2,'0')} 秒`;
const options=(move,familiar)=>allowedMoves(move,familiar).map(id=>`<option value="${id}"${id===move?' selected':''}>${movements[id].name}</option>`).join('');
export const circuitButton=(date,text='改做壺鈴間歇',className='secondary')=>`<button class="${className}" type="button" data-kb-date="${date}">${text}</button>`;
export const findCircuit=(state,date)=>state.kettlebell?.plans[date];
export const findCircuitResult=(state,date)=>state.kettlebell?.sessions.find(session=>session.plan.date===date);

export function mountKettlebell({getState, today, showPage, submit, notify, escape}) {
  const $=selector=>document.querySelector(selector);
  const form=$('#kb-form'), preview=$('#kb-preview'), player=$('#kb-player'), history=$('#kb-history');
  const research=$('#research-results'), researchCount=$('#research-count'), search=$('#research-search');
  const guidance=mountMovementGuidance($('#kettlebell'));
  let draft=null, playerKey='';

  const inputs=()=>{
    const values=new FormData(form);
    return {date:values.get('date'),minutes:Number(values.get('minutes')),count:Number(values.get('count')),rounds:Number(values.get('rounds')),pace:values.get('pace'),weights:values.get('weights').trim().split(/[\s,，、]+/).filter(Boolean).map(Number),familiar:values.getAll('familiar')};
  };
  const setForm=(date,plan)=>{
    form.elements.date.value=date;
    if(!plan)return;
    for(const key of ['minutes','count','rounds','pace'])form.elements[key].value=plan[key];
    form.elements.weights.value=plan.weights.join(', ');
    for(const box of form.querySelectorAll('[name=familiar]'))box.checked=plan.familiar.includes(box.value);
  };

  function renderPreview() {
    const state=getState(), date=form.elements.date.value;
    const saved=findCircuit(state,date), result=findCircuitResult(state,date), plan=draft??saved;
    if(!plan){preview.innerHTML='<h2>課表預覽</h2><p class="small">先填可用時間與壺鈴重量，再按「預覽訓練」。</p>';return;}
    const previous=[...state.plan,...Object.values(state.planHistory??{}).flat()].find(day=>day.id===date);
    const original=saved?saved.original:previous?.type!=='Rest'&&previous?.minutes>0?previous:null;
    const cutoff=draft&&plan.rounds<Number(form.elements.rounds.value);
    preview.innerHTML=`<div class="kb-card-heading"><h2>${draft?'課表預覽':'已安排的課表'}</h2><span class="status-pill">${draft?'待儲存':result?'已記錄':'已排程'}</span></div>
      <p class="kb-lead">${plan.count} 個動作 × ${plan.rounds} 輪 <span>約 ${shortTime(plannedSeconds(plan))}</span></p>
      <p class="small">每站 ${plan.work} 秒 · 換站 ${plan.transition} 秒 · 輪間休息 ${plan.rest} 秒 · 含暖身與緩和。</p>
      ${cutoff?'<p class="kb-note">已依可用時間減少輪數；休息時間保留。</p>':''}
      ${original?`<p class="kb-note">原定 ${original.type} · ${original.minutes} 分鐘。儲存後這天會顯示為壺鈴替代課，原定跑步可查閱。</p>`:''}
      <ol class="kb-moves">${plan.moves.map((move,index)=>`<li>${draft?`<label>動作 ${index+1}<select data-kb-slot="${index}">${options(move,plan.familiar)}</select></label>`:`<strong>${movements[move].name}</strong>`}${movementGuide(move,{includeCue:true})}</li>`).join('')}</ol>
      <p class="small">用能維持動作品質的重量，單側動作兩側平均分配。計時上限不等於必須做到最後一秒。</p>
      <div class="actions">${draft?'<button type="button" class="primary" data-kb-action="save">加入週課表</button>':result?'<button type="button" class="primary" data-kb-result>查看訓練結果</button>':`${date===today()?'<button type="button" class="primary" data-kb-action="start">開始暖身</button>':''}<button type="button" class="secondary" data-kb-action="remove">移除壺鈴課</button>`}</div>`;
  }

  function tick() {
    const active=getState()?.kettlebell?.active, clock=player.querySelector('[data-kb-clock]');
    if(!active||!clock)return;
    const left=remainingMs(active), phase=currentPhase(active);
    const ready=active.deadline===null&&left===phase.seconds*1000+active.extraMs;
    const time=formatClock(Math.ceil(left/1000));
    const status=left===0?'時間到，請確認本段實際結果。':active.deadline!==null?'計時中':ready?'就緒後啟動本段':'暫停中';
    if(clock.textContent!==time)clock.textContent=time;
    const statusNode=player.querySelector('[data-kb-status]');
    if(statusNode.textContent!==status)statusNode.textContent=status;
    player.querySelector('[data-kb-action=pause]').hidden=active.deadline===null||left===0;
    const resume=player.querySelector('[data-kb-action=resume]');
    resume.hidden=active.deadline!==null||left===0;
    resume.textContent=ready?'開始本段':'繼續計時';
    const next=player.querySelector('[data-kb-action=next]');
    next.hidden=ready;
    next.textContent=phase.kind==='cooldown'?(left?'結束並記錄緩和':'完成並儲存'):(left?'結束並記錄本段':'記錄並下一段');
    const replace=player.querySelector('[data-kb-replace]');
    if(replace)replace.hidden=!ready;
  }

  function renderPlayer(active) {
    player.hidden=!active;
    $('#kb-builder').hidden=Boolean(active);
    if(!active){player.innerHTML='';playerKey='';return;}
    const key=`${active.id}:${active.rev}`;
    if(key===playerKey){tick();return;}
    const oldSegment=player.dataset.segment;
    const segment=`${active.id}:${active.index}:${active.plan.moves[currentPhase(active).slot]}`;
    const savedValues=oldSegment===segment?[player.querySelector('[name=kg]')?.value,player.querySelector('[name=reps]')?.value]:[];
    player.dataset.segment=segment;
    playerKey=key;
    const phase=currentPhase(active), all=circuitPhases(active.plan), move=active.plan.moves[phase.slot], info=phase.kind==='work'?movements[move]:null;
    const nextWork=all.slice(active.index+1).find(item=>item.kind==='work');
    const note=info?info.cue:phase.kind==='warmup'?'先輕鬆走動、活動關節，再用徒手練習蹲和髖折。需要更多時間，可以暫停後再繼續。':phase.kind==='cooldown'?'放穩壺鈴，慢走並讓呼吸逐漸放緩。':'把鈴放穩，讓呼吸放慢。準備好才啟動下一段。';
    player.innerHTML=`<div class="kb-card-heading"><span class="status-pill">${active.plan.date}</span><span>${phase.round===undefined?'':`第 ${phase.round+1} / ${active.plan.rounds} 輪`}${phase.kind==='work'?` · 第 ${phase.slot+1} / ${active.plan.count} 站`:''}</span></div>
      <h2>${info?info.name:phaseLabels[phase.kind]}</h2><div class="kb-clock" data-kb-clock role="timer" aria-label="本段剩餘時間"></div><p class="kb-clock-status" data-kb-status role="status"></p>
      <p class="kb-cue">${note}${info?`<br><strong>${info.check}</strong>`:''}</p>
      ${nextWork?`<p class="small">下一個動作：${movements[active.plan.moves[nextWork.slot]].name}</p>`:''}
      ${info?`<div class="fields kb-work-facts">${info.bodyweight?'<p class="small">徒手動作</p>':`<label>實際重量（公斤）<select name="kg"><option value="">未記錄</option>${active.plan.weights.map(kg=>`<option>${kg}</option>`).join('')}</select></label>`}<label>實際次數（雙側合計，選填）<input name="reps" type="number" min="0" max="300" inputmode="numeric" placeholder="未記錄"></label></div>`:''}
      ${info&&allowedMoves(move,active.plan.familiar).length>1?`<label class="kb-replace" data-kb-replace>換這一站（後續輪次沿用）<select id="kb-active-move">${options(move,active.plan.familiar)}</select></label>`:''}
      <div class="actions kb-player-actions"><button type="button" class="primary" data-kb-action="resume">開始本段</button><button type="button" class="primary" data-kb-action="next">記錄並下一段</button><button type="button" class="secondary" data-kb-action="pause">暫停</button>${['transition','rest'].includes(phase.kind)?'<button type="button" class="secondary" data-kb-action="extend">休息 +15 秒</button>':''}</div>
      <div class="actions kb-player-options"><button type="button" class="text-button" data-kb-action="skip">跳過本段，不計入</button><button type="button" class="text-button" data-kb-action="finish">提前結束</button></div>
      ${info?movementGuide(move):''}`;
    for(const [index,name] of ['kg','reps'].entries()){
      const input=player.querySelector(`[name=${name}]`);
      if(input&&savedValues[index]!==undefined)input.value=savedValues[index];
    }
    tick();
  }

  function renderDeviceMatch(result) {
    const state=getState(), session=state.kettlebell.sessions.find(item=>item.id===result.dataset.kbSession);
    if(!session)return;
    const panel=result.querySelector('[data-kb-device]');
    if(panel.dataset.ready)return;
    const candidates=findCircuitMatches(state,session);
    const linked=state.activities.filter(activity=>activity.kettlebellSessionId===session.id);
    const stamp=new Intl.DateTimeFormat('zh-TW',{timeZone:state.context.timezone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
    const sources={'garmin-connect':'Garmin Connect','garmin-export':'Garmin 匯出','apple-export':'Apple 匯出',strava:'Strava','strava-mcp':'Strava MCP',fit:'FIT',manual:'手動登錄',mcp:'MCP'};
    const description=activity=>`${activity.name} · ${activity.sources.map(item=>Object.hasOwn(sources,item.source)?sources[item.source]:item.source).filter((label,index,all)=>all.indexOf(label)===index).join(' / ')} · ${stamp.format(new Date(activity.startedAt))} · ${(activity.durationSeconds/60).toFixed(1)} 分`;
    panel.innerHTML=`<h3>同一堂課的裝置紀錄</h3>
      ${linked.length?`<ul class="kb-linked-activities">${linked.map(activity=>`<li><span><button type="button" class="text-button" data-open-activity="${escape(activity.id)}">${escape(description(activity))}</button>${activity.avgHeartRate>0?`<small>平均心率 ${Math.round(activity.avgHeartRate)} bpm</small>`:''}</span><button type="button" class="secondary" data-kb-unmatch="${escape(activity.id)}">解除對應</button></li>`).join('')}</ul><p class="small">裝置時間與心率可查閱；週總時間只計入 AIAC 的壺鈴計時。</p>`:''}
      ${candidates.length?`<form data-kb-match-form><p class="small">請確認是不是同一堂課。對應後，裝置活動的時間不再加到週總時間。</p><label>選擇同時段活動<select name="activityId" required><option value="">請選擇</option>${candidates.map(activity=>`<option value="${escape(activity.id)}">${escape(description(activity))}</option>`).join('')}</select></label><button type="submit" class="primary">確認為同一堂課</button></form>`:linked.length?'':'<p class="small">目前沒有可對應的同時段活動。同步或匯入後，可回來確認；已對應其他課的活動需先解除原對應。</p><button type="button" class="secondary" data-tab="activity-log">前往訓練活動 →</button>'}`;
    panel.dataset.ready='true';
  }

  function renderHistory(sessions) {
    const openIds=new Set([...history.querySelectorAll('[data-kb-session][open]')].map(result=>result.dataset.kbSession));
    history.hidden=!sessions.length;
    history.innerHTML=sessions.length?`<h2>壺鈴訓練紀錄</h2><p class="small">完整輪數以每站完成預定秒數計算。計時包含暖身、換站、休息和緩和；動作時間另外顯示。</p>${[...sessions].reverse().map(session=>{
      const totals=sessionTotals(session);
      const work=session.log.filter(entry=>entry.kind==='work'&&entry.seconds>0);
      return `<details class="kb-result" data-kb-log-date="${session.plan.date}" data-kb-session="${escape(session.id)}" ${openIds.has(session.id)?'open':''}><summary>${session.plan.date} · ${totals.rounds} / ${session.plan.rounds} 完整輪 · ${shortTime(totals.totalSeconds)}</summary><p>實際動作 ${shortTime(totals.workSeconds)} / 預計 ${shortTime(session.plan.rounds*session.plan.count*session.plan.work)} · ${totals.slots} 站有紀錄</p>${work.length?`<ul>${work.map(entry=>`<li>第 ${entry.round+1} 輪 · ${movements[entry.move].name} · ${entry.seconds} 秒${entry.kg===null?'':` · ${entry.kg} 公斤`}${entry.reps===null?'':` · ${entry.reps} 次`}</li>`).join('')}</ul>`:'<p class="small">沒有已記錄的動作段。</p>'}<div class="kb-device-match" data-kb-device></div></details>`;
    }).join('')}`:'';
    history.querySelectorAll('[data-kb-session][open]').forEach(renderDeviceMatch);
  }

  function openResult(date) {
    const result=[...history.querySelectorAll('[data-kb-log-date]')].find(node=>node.dataset.kbLogDate===date);
    if(result){result.open=true;renderDeviceMatch(result);result.scrollIntoView({block:'nearest'});}
  }

  history.addEventListener('toggle',event=>{
    if(event.target.matches('[data-kb-session][open]'))renderDeviceMatch(event.target);
  },true);
  history.addEventListener('submit',event=>{
    if(!event.target.matches('[data-kb-match-form]'))return;
    event.preventDefault();
    submit({action:'match-activity',id:event.target.closest('[data-kb-session]').dataset.kbSession,activityId:new FormData(event.target).get('activityId')});
  });
  history.addEventListener('click',event=>{
    const button=event.target.closest('[data-kb-unmatch]');
    if(button)submit({action:'unmatch-activity',id:button.closest('[data-kb-session]').dataset.kbSession,activityId:button.dataset.kbUnmatch});
  });

  function render() {
    const state=getState();
    if(!state)return;
    const {active=null,sessions=[]}=state.kettlebell??{};
    if(!form.elements.date.value)setForm(today(),findCircuit(state,today()));
    renderPlayer(active);
    if(!active)renderPreview();
    renderHistory(sessions);
  }

  form.addEventListener('submit',event=>{
    event.preventDefault();
    try{
      if(findCircuitResult(getState(),form.elements.date.value))throw Error('這天已有訓練結果。請選擇其他日期。');
      draft=buildCircuit(inputs());renderPreview();
      preview.scrollIntoView({block:'nearest'});
    }catch(error){notify(error.message);}
  });
  form.addEventListener('input',event=>{
    if(event.target===form.elements.date){draft=null;setForm(event.target.value,findCircuit(getState(),event.target.value));renderPreview();}
    else if(draft){draft=null;renderPreview();}
  });
  preview.addEventListener('change',event=>{
    if(!event.target.matches('[data-kb-slot]')||!draft)return;
    draft.moves[Number(event.target.dataset.kbSlot)]=event.target.value;
    const guide=event.target.closest('li').querySelector('[data-kb-guide]'), movement=movements[event.target.value];
    guide.dataset.kbGuide=event.target.value;
    guide.querySelector('p').textContent=`${movement.cue} ${movement.check}`;
    guidance.refresh(guide);
  });
  player.addEventListener('change',event=>{
    if(event.target.id!=='kb-active-move')return;
    const active=getState().kettlebell?.active;
    if(!active)return;
    submit({action:'replace',move:event.target.value,id:active.id,rev:active.rev});
  });
  document.addEventListener('click',event=>{
    const dateButton=event.target.closest('[data-kb-date]');
    if(dateButton){
      const {kbDate:date}=dateButton.dataset;
      draft=null;setForm(date,findCircuit(getState(),date));showPage('kettlebell');render();
      if(findCircuitResult(getState(),date))openResult(date);
      return;
    }
    if(event.target.closest('[data-kb-result]')){
      openResult(form.elements.date.value);return;
    }
    const button=event.target.closest('[data-kb-action]');
    if(!button)return;
    const action=button.dataset.kbAction, date=form.elements.date.value;
    if(action==='save'&&draft){const plan=draft;submit({...plan,action},()=>{draft=null;});return;}
    if(action==='start'||action==='remove'){submit({action,date});return;}
    const active=getState().kettlebell?.active;
    if(!active)return;
    if(action==='finish'&&!window.confirm('提前結束這堂課？目前有計時的段落會保存，未執行的動作不計入。'))return;
    const reps=player.querySelector('[name=reps]'), kg=player.querySelector('[name=kg]');
    const saveFacts=['next','finish'].includes(action);
    if(saveFacts&&reps&&!reps.reportValidity())return;
    submit({action:action==='skip'?'next':action,id:active.id,rev:active.rev,skip:action==='skip',kg:saveFacts&&kg?.value?Number(kg.value):null,reps:saveFacts&&reps?.value?Number(reps.value):null});
  });
  search.addEventListener('input',()=>renderResearch(research,researchCount,search.value));
  renderResearch(research,researchCount);
  setInterval(tick,200);
  return {render,openResult};
}
