import {movements} from './kettlebell-core.js';

const viewerModule='./kettlebell-demo.js';

export function movementGuide(move,{includeCue=false}={}) {
  const exercise=movements[move];
  return `<details class="kb-motion-guide" data-kb-guide="${move}">
    <summary>看 3D 示範 <small>${includeCue?'・動作要點':''}</small></summary>
    ${includeCue?`<p>${exercise.cue} ${exercise.check}</p>`:''}
    <div data-kb-demo-panel></div>
  </details>`;
}

export function mountMovementGuidance(root) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let active;
  function close() {
    if(!active)return;
    const entry=active;active=undefined;
    entry.intersection?.disconnect();
    entry.canvas?.removeEventListener('webglcontextlost',entry.onLost);
    entry.viewer?.dispose();
    entry.guide.open=false;
    entry.panel.replaceChildren();
  }
  const sync=()=>active?.viewer?.play(active.playing&&active.inView&&!document.hidden);
  function unavailable(entry) {
    if(active!==entry)return;
    entry.intersection?.disconnect();
    entry.canvas?.removeEventListener('webglcontextlost',entry.onLost);
    entry.viewer?.dispose();
    entry.viewer=undefined;
    entry.panel.innerHTML='<p class="kb-demo-status" role="status">這個瀏覽器目前無法播放 3D，請參考上方動作要點。</p>';
  }

  async function open(guide) {
    if(active?.guide===guide)return;
    close();
    const panel=guide.querySelector('[data-kb-demo-panel]');
    const entry={guide,panel,playing:!reduced.matches,inView:false};
    active=entry;
    panel.innerHTML='<p class="kb-demo-status" role="status">載入 3D 示範中…</p>';
    try {
      const {createMovementDemo}=await import(viewerModule);
      if(active!==entry||!guide.open||!guide.isConnected)return;
      panel.innerHTML=`<div class="kb-demo-studio">
        <div class="kb-demo-stage"><canvas role="img" aria-label="${movements[guide.dataset.kbGuide].name}的 3D 示範"></canvas><span class="kb-demo-chip">AIAC 動作示範</span></div>
        <p class="kb-demo-caption" data-kb-demo-caption></p>
        <div class="kb-demo-controls">
          <div role="group" aria-label="播放控制"><button type="button" class="secondary" data-kb-demo-play></button><button type="button" class="secondary" data-kb-demo-restart>從頭看</button><button type="button" class="secondary" data-kb-demo-slow aria-pressed="false">半速</button></div>
          <div role="group" aria-label="觀察角度"><button type="button" class="secondary" data-kb-demo-view="-0.66" aria-pressed="true">斜前方</button><button type="button" class="secondary" data-kb-demo-view="0" aria-pressed="false">正面</button><button type="button" class="secondary" data-kb-demo-view="-1.57" aria-pressed="false">側面</button></div>
        </div>
      </div>`;
      const canvas=panel.querySelector('canvas'), caption=panel.querySelector('[data-kb-demo-caption]');
      entry.canvas=canvas;
      entry.onLost=event=>{event.preventDefault();unavailable(entry);};
      canvas.addEventListener('webglcontextlost',entry.onLost);
      entry.viewer=createMovementDemo(canvas,guide.dataset.kbGuide,text=>{caption.textContent=text;});
      entry.intersection=new IntersectionObserver(([observation])=>{
        if(active!==entry)return;
        entry.inView=observation.isIntersecting;sync();
      });
      entry.intersection.observe(canvas);
      panel.querySelector('[data-kb-demo-play]').textContent=entry.playing?'暫停示範':'播放示範';
    } catch { unavailable(entry); }
  }

  root.addEventListener('toggle',event=>{
    const guide=event.target;
    if(!guide.matches('[data-kb-guide]'))return;
    if(guide.open&&guide.isConnected)void open(guide);
    else if(active?.guide===guide)close();
  },true);
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button||!active?.viewer||!active.panel.contains(button))return;
    if(button.hasAttribute('data-kb-demo-play')){
      active.playing=!active.playing;
      button.textContent=active.playing?'暫停示範':'播放示範';sync();
    }else if(button.hasAttribute('data-kb-demo-restart'))active.viewer.restart();
    else if(button.hasAttribute('data-kb-demo-slow')){
      const slower=button.getAttribute('aria-pressed')!=='true';
      button.setAttribute('aria-pressed',String(slower));active.viewer.speed(slower?.5:1);
    }else if(button.hasAttribute('data-kb-demo-view')){
      for(const option of active.panel.querySelectorAll('[data-kb-demo-view]'))option.setAttribute('aria-pressed',String(option===button));
      active.viewer.view(Number(button.dataset.kbDemoView));
    }
  });
  new MutationObserver(()=>{if(active&&(root.hidden||!active.guide.isConnected))close();})
    .observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',sync);
  return {refresh:guide=>{if(active?.guide===guide){close();guide.open=true;void open(guide);}}};
}
