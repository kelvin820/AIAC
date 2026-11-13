// Coordinates for the demo: y is up, z is forward, metres are relative to the character.
const vec=(x,y,z)=>[x,y,z];
const neutralFeet=(stance=.24)=>[vec(-stance,.125,0),vec(stance,.125,0)];
const symmetric=(x,y,z)=>[vec(-x,y,z),vec(x,y,z)];
const upright=(hipY,hipZ,tilt,hands,{feet=neutralFeet(),bell='none',angle=0,elbows='neutral',hipX=0,footPitch=[0,0]}={})=>({
  hip:vec(hipX,hipY,hipZ), axis:vec(0,Math.cos(tilt),Math.sin(tilt)), faceTilt:tilt*.33,hands,feet,bell,angle,elbows,footPitch,
});
const key=(at,caption,pose)=>({at,caption,pose});
const hanging=(y,z,options)=>upright(.95,0,0,symmetric(.095,y,z),{bell:'both',...options});

function deadlift(wide) {
  const feet=neutralFeet(wide?.36:.24);
  const low=upright(wide?.59:.58,-.28,wide?.68:.79,symmetric(.095,.35,.11),{feet,bell:'both'});
  const top=hanging(.98,.17,{feet});
  return [key(0,'髖往後，握住壺鈴',low),key(.47,'踩地站直',top),key(.62,'站直後穩住',top),key(1,'控制下放',low)];
}

function squat(chair) {
  const set=(y,z,tilt)=>{
    const chestY=y+Math.cos(tilt)*.47,chestZ=z+Math.sin(tilt)*.47;
    return upright(y,z,tilt,chair?symmetric(.19,chestY+.04,.55):symmetric(.14,chestY+.015,chestZ+.22),{bell:chair?'none':'goblet',feet:neutralFeet(.27)});
  };
  const top=set(.95,0,.08), bottom=set(chair?.57:.52,-.29,.32);
  return [key(0,'腳掌踩穩',top),key(.47,chair?'臀部輕碰椅面':'屈膝屈髖下蹲',bottom),key(.58,'保持穩定',bottom),key(1,'踩地站起',top)];
}

function lunge(side) {
  const stance=neutralFeet(.23), step=side===0?-1:1;
  const make=(y,z,tilt,backZ)=>{
    const feet=stance.map((foot,index)=>index===side?vec(foot[0],.125+Math.abs(backZ)*.12,backZ):foot);
    const chestY=y+Math.cos(tilt)*.47,chestZ=z+Math.sin(tilt)*.47;
    const footPitch=side===0?[Math.abs(backZ)*.92,0]:[0,Math.abs(backZ)*.92];
    return upright(y,z,tilt,symmetric(.14,chestY,chestZ+.20),{bell:'goblet',feet,elbows:'neutral',footPitch,hipX:backZ===0?0:-step*(.95-y)*.18});
  };
  const top=make(.95,0,.07,0), stepBack=make(.84,-.11,.13,-.57), low=make(.54,-.16,.18,-.59);
  return [key(0,'先站穩',top),key(.29,'向後跨一步',stepBack),key(.58,'彎曲雙膝下沉',low),key(.76,'前腳推地',stepBack),key(1,'站回，下一次換腳',top)];
}

function row(single) {
  const feet=[vec(-.27,.125,-.16),vec(.27,.125,.04)];
  const set=(y,z)=>upright(.88,-.20,.92,single?[vec(-.34,y,z),vec(.42,.94,.54)]:symmetric(.095,y,z),{feet,bell:single?'left':'both',elbows:single?'supported-row':'row'});
  const low=set(.68,.30), high=set(.99,.04);
  return [key(0,'穩住軀幹，手臂放長',low),key(.44,'肘往後，拉向下肋',high),key(.57,'短暫穩住',high),key(1,'慢慢下放',low)];
}

function floorPress() {
  const set=y=>({hip:vec(0,.27,-.39),axis:vec(0,.03,Math.sqrt(1-.03**2)),faceTilt:-Math.PI/2,
    hands:[vec(-.32,y,.21),vec(.12,.43,-.12)],feet:symmetric(.21,.125,-.96),bell:'left',angle:-1.03,elbows:'floor',footPitch:[0,0]});
  const low=set(.53), high=set(.91);
  return [key(0,'屈膝踩地，上臂輕觸地面',low),key(.43,'手腕保持直，推起',high),key(.58,'肩膀保持穩定',high),key(1,'慢慢放回',low)];
}

function pushup() {
  const set=(y,z,tilt)=>upright(y,z,tilt,symmetric(.245,.78,.55),{feet:symmetric(.18,.135,-1.10),elbows:'pushup',footPitch:[.49,.49]});
  const top=set(.57,-.43,1.03), low=set(.44,-.30,1.19);
  return [key(0,'雙手撐穩，身體拉長',top),key(.45,'胸口靠近支撐面',low),key(.57,'保持軀幹穩定',low),key(1,'推回起始位置',top)];
}

function suitcase(march) {
  const set=(foot=-1)=>{
    const feet=neutralFeet(.21);
    if(foot!==-1)feet[foot]=vec(feet[foot][0],.36,.23);
    return upright(.95,0,0,[vec(-.44,.97,.01),vec(.36,1.0,.035)],{feet,bell:'left',hipX:foot===-1?0:foot===0?.05:-.05});
  };
  const top=set();
  return march?[key(0,'單側提鈴，軀幹站直',top),key(.24,'慢慢抬起一腳',set(0)),key(.49,'踩穩地板',top),key(.74,'換另一腳',set(1)),key(1,'踩穩地板',top)]
    :[key(0,'提鈴，肩膀保持水平',top),key(.50,'自然呼吸，別往一側傾',top),key(1,'穩住，再換側',top)];
}

function swing() {
  const feet=neutralFeet(.29), low=upright(.76,-.31,.97,symmetric(.10,.66,-.23),{feet,bell:'both',angle:1.12});
  const launch=upright(.92,-.06,.27,symmetric(.10,.94,.27),{feet,bell:'both',angle:-.20});
  const float=upright(.95,0,.02,symmetric(.10,1.53,.58),{feet,bell:'both',angle:-1.42});
  return [key(0,'髖往後，讓鈴回到腿間',low),key(.22,'伸髖，把壺鈴送出去',launch),key(.47,'手臂引導，鈴自然浮起',float),key(.56,'軀幹站直，不後仰',float),key(.81,'等鈴回落再折髖',launch),key(1,'髖往後，讓鈴回到腿間',low)];
}

const clips={
  deadlift:{seconds:4.4,keys:deadlift(false)},'wide-deadlift':{seconds:4.4,keys:deadlift(true)},
  swing:{seconds:2.7,keys:swing()},squat:{seconds:4.5,keys:squat(false)},'chair-squat':{seconds:4.8,keys:squat(true),prop:'chair'},
  lunge:{seconds:4.7,keys:lunge(0),alternate:lunge(1)},press:{seconds:4.1,keys:floorPress(),camera:'floor'},
  pushup:{seconds:4.3,keys:pushup(),prop:'pushup',camera:'incline'},row:{seconds:4.2,keys:row(true),prop:'row'},
  'two-hand-row':{seconds:4.2,keys:row(false)},carry:{seconds:4.1,keys:suitcase(true)},hold:{seconds:4.4,keys:suitcase(false)},
};

const blend=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>blend(v,b[i],t)):a+(b-a)*t;
export const getClip=move=>clips[move];

export function sampleMotion(move,elapsed) {
  const clip=getClip(move),loop=Math.floor(elapsed/clip.seconds);
  const keys=clip.alternate&&loop%2?clip.alternate:clip.keys;
  const t=elapsed/clip.seconds-loop;
  const end=keys.findIndex(frame=>frame.at>t);
  const a=keys[end-1], b=keys[end];
  const ratio=(t-a.at)/(b.at-a.at), eased=ratio*ratio*(3-2*ratio);
  const pose={...a.pose};
  for(const field of ['hip','axis','faceTilt','hands','feet','angle','footPitch'])pose[field]=blend(a.pose[field],b.pose[field],eased);
  return {...pose,caption:t-a.at<.02?a.caption:b.caption};
}
