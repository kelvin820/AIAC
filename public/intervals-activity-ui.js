import {clearRouteMap,showRouteMap} from './route-map.js';

export function intervalsActivityPanel(activity, demo) {
  if(demo||!activity.sources.some(source=>source.source==='intervals')||
     activity.sources.some(source=>source.source.startsWith('strava')))return '';
  return `<details class="activity-route" data-intervals-details>
    <summary>intervals.icu 路線、曲線與分段</summary>
    <p class="small" data-intervals-status aria-live="polite"></p>
    <div data-intervals-map hidden></div>
    <div data-intervals-charts></div>
  </details>`;
}

export function mountIntervalsActivityDetails(root,{fetchDetails,renderCharts,renderIntervals}){
  const observer=new IntersectionObserver(entries=>{
    for(const {target,isIntersecting} of entries){
      if(isIntersecting&&target.open&&target.isConnected){
        observer.unobserve(target);
        void load(target);
      }
    }
  });
  async function load(panel){
    const status=panel.querySelector('[data-intervals-status]');
    if(panel.dataset.loaded)return;
    panel.dataset.loaded='loading';
    status.textContent='正在讀取 intervals.icu 詳情…';
    try{
      const data=await fetchDetails(panel.closest('[data-activity-id]').dataset.activityId);
      if(!panel.isConnected)return;
      const map=panel.querySelector('[data-intervals-map]');
      if(data.route.length>=2&&!panel.closest('article').querySelector('[data-route-activity]')){
        map.hidden=false;
        showRouteMap(map,data.route);
      }
      const charts=panel.querySelector('[data-intervals-charts]');
      renderCharts(charts,data.streams);
      charts.insertAdjacentHTML('beforeend',renderIntervals(data.intervals));
      status.textContent=data.route.length>=2?'':'intervals.icu 未提供可顯示的 GPS 路線。';
      panel.dataset.loaded='true';
    }catch(error){
      status.textContent=error.message+'。關閉後可重新展開再試。';
      delete panel.dataset.loaded;
    }
  }
  root.addEventListener('toggle',event=>{
    if(event.target.matches('[data-intervals-details]')&&event.target.open)observer.observe(event.target);
  },true);
  return ()=>{
    for(const panel of root.querySelectorAll('[data-intervals-details]')){
      observer.unobserve(panel);
      clearRouteMap(panel.querySelector('[data-intervals-map]'));
    }
  };
}
