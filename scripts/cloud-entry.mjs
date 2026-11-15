document.body.classList.add('cloud-preview');
const disabled=['#llm-form button','#llm-form input','#llm-form select','#clear-key','#mcp-form button','#mcp-form input',
 '#strava-login','#strava-sync','#strava-backfill','#strava-disconnect','#garmin-sync','#reset'];
const decorate=()=>{
  for(const node of document.querySelectorAll(disabled.join(',')))node.disabled=true;
  document.querySelector('#key-status').textContent='雲端試用使用伺服器設定的模型與額度。';
};
globalThis.AIAC_CLOUD=true;
document.addEventListener('aiac-rendered',decorate);
const fitHelp=document.querySelector('#fit-drop p');
if(fitHelp)fitHelp.textContent='選擇或拖入 FIT · 雲端上限 4 MB';
const signIn=document.createElement('a');
signIn.href='/api/state';
signIn.className='secondary';
signIn.textContent='登入雲端試用';
document.querySelector('main > header').append(signIn);
document.addEventListener('aiac-rendered',()=>{signIn.hidden=true;},{once:true});
await import('../public/app.js');
decorate();
