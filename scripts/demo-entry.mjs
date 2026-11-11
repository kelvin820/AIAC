import {createDemoService} from '../src/demo-service.mjs';
const service=createDemoService(localStorage);
globalThis.AIAC_DEMO={...service,decorate(){
 document.body.classList.add('demo');document.querySelector('#mode').textContent='● DEMO · 不使用付費 LLM';
 document.querySelectorAll('#llm-form input,#llm-form select,#llm-form button,#mcp-form input,#mcp-form button,#strava-login,#strava-sync,#strava-disconnect').forEach(e=>e.disabled=true);
 document.querySelector('#key-status').textContent='線上試用不收集 API Key。使用自己的模型與線上資料連接，請下載本機版本。';
 const privacy=document.querySelector('#reset').closest('.card').querySelector('p');privacy.textContent='此試用資料保存在你目前瀏覽器的 localStorage，不會送往 AIAC、LLM 或其他訪客。FIT 在本機瀏覽器解析；不保存原始檔。重設只清除這個瀏覽器的試用資料。';
}};
const banner=document.createElement('div');banner.id='demo-banner';banner.innerHTML='朋友試用版 · 資料只留在你的瀏覽器 · Mock 不呼叫付費模型。<a href="https://github.com/kelvin820/AIAC" target="_blank" rel="noreferrer">完整本機版 / 留下回饋 ↗</a>';document.querySelector('header').after(banner);
await import('../public/app.js');
