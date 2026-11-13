import {defaultConnections} from './providers.mjs';
import {defaultAthlete} from './training-load.mjs';
export function localDate() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()); }
export function initialState() {
 const date=localDate(); const d=new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return {activities:[],athlete:defaultAthlete(),goals:[],trainingPlans:[],wellness:[],intervalsFitness:{},connections:defaultConnections(),profile:{name:'',goal:'建立穩定跑步習慣',experience:'休閒跑者',preferences:'',constraints:'',weeklyMinutes:240},context:{date,timezone:'Asia/Taipei',location:'',minutes:45,sleep:'',feeling:'尚可',weather:'未提供',motivation:'',equipment:''},plan:Array.from({length:7},(_,i)=>{const day=new Date(d);day.setUTCDate(d.getUTCDate()+i);return {id:day.toISOString().slice(0,10),type:['Zone2','Interval','Recovery','Rest','Zone2','Long Run','Rest'][i],minutes:[40,45,25,0,40,70,0][i],completed:false};}),messages:[],recommendations:[],revisions:[],memories:[]};
}
