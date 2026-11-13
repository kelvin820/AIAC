import * as T from './vendor/three.module.js';
import {getClip,sampleMotion} from './kettlebell-motion.js';

const Y=new T.Vector3(0,1,0);
const vector=coords=>new T.Vector3(...coords);
const palette={mint:0x75b39a,green:0x2e695c,dark:0x24483e,cream:0xfff6dc,ivory:0xfffdf4,ink:0x153930,peach:0xefab8e,orange:0xec8d54,metal:0x664335,stage:0xd3e4c9,ring:0xb7d0ae,bench:0xa57550};

// Resolve a knee or elbow from two limb lengths and a direction in which it can bend.
function bend(root,tip,first,second,pole) {
  const line=tip.clone().sub(root),length=line.length();
  const ray=length>1e-6?line.multiplyScalar(1/length):Y.clone();
  const d=T.MathUtils.clamp(length,Math.abs(first-second)+.0001,first+second-.0001);
  const along=(first**2-second**2+d**2)/(2*d);
  const dir=pole.addScaledVector(ray,-pole.dot(ray)).normalize();
  return root.clone().addScaledVector(ray,along).addScaledVector(dir,Math.sqrt(Math.max(0,first**2-along**2)));
}

function makeStudio(scene,clip) {
  const resources=new Set();
  const geometry=shape=>{resources.add(shape);return shape;};
  const material=(color,extra={})=>{const m=new T.MeshStandardMaterial({color,roughness:.76,...extra});resources.add(m);return m;};
  const mats=Object.fromEntries(Object.entries(palette).map(([name,color])=>[name,material(color)]));
  const sphere=geometry(new T.SphereGeometry(1,28,18)), cylinder=geometry(new T.CylinderGeometry(1,1,1,20));
  const block=geometry(new T.BoxGeometry(1,1,1));
  const group=(parent=scene)=>{const g=new T.Group();parent.add(g);return g;};
  function mesh(parent,shape,mat,pos=[0,0,0],size=[1,1,1]) {
    const item=new T.Mesh(shape,mat);item.position.set(...pos);item.scale.set(...size);parent.add(item);return item;
  }
  const oval=(parent,color,pos,size)=>mesh(parent,sphere,mats[color],pos,size);
  const box=(parent,color,pos,size)=>mesh(parent,block,mats[color],pos,size);
  const tube=(parent,color,points,radius)=>mesh(parent,geometry(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(vector)),20,radius,10,false)),mats[color]);

  mesh(scene,cylinder,mats.stage,[0,-.076,-.10],[1.43,.14,1.43]);
  const ring=mesh(scene,geometry(new T.RingGeometry(1.21,1.227,64)),mats.ring,[0,.002,-.10]);ring.rotation.x=-Math.PI/2;
  for(const x of [-.53,.53])box(scene,'ring',[x,.001,.37],[.14,.005,.026]);
  const shadow=oval(scene,'ring',[0,.006,0],[.42,.006,.30]);
  function bench(kind) {
    if(!kind)return;
    const isChair=kind==='chair', x=kind==='row'?.43:0;
    const z=isChair?-.50:kind==='row'?.60:.68;
    const w=isChair?.61:kind==='row'?.45:.78,depth=isChair?.49:kind==='row'?.36:.52;
    const y=isChair?.42:kind==='row'?.885:.732;
    box(scene,'bench',[x,y,z],[w,.075,depth]);
    for(const side of [-1,1])for(const end of [-1,1])box(scene,'green',[x+side*w*.39,y/2,z+end*depth*.34],[.068,y,.068]);
    if(isChair){
      for(const side of [-1,1])box(scene,'green',[side*w*.39,.65,z-depth*.37],[.055,.43,.055]);
      box(scene,'bench',[0,.83,z-depth*.37],[w,.10,.064]);
    }
  }
  bench(clip.prop);

  const body=group();
  oval(body,'dark',[0,.018,0],[.28,.175,.205]);
  oval(body,'green',[0,.30,0],[.333,.337,.225]);
  oval(body,'mint',[0,.37,.085],[.305,.247,.169]);
  oval(body,'cream',[0,.418,.248],[.088,.073,.020]);
  oval(body,'orange',[0,.418,.267],[.031,.031,.014]);
  oval(body,'dark',[0,.603,0],[.139,.097,.131]);

  const head=group();
  oval(head,'green',[0,0,0],[.341,.304,.282]);
  oval(head,'mint',[0,.062,-.044],[.333,.292,.255]);
  oval(head,'cream',[0,-.016,.198],[.274,.214,.128]);
  for(const x of [-1,1]){
    oval(head,'cream',[x*.322,-.005,0],[.070,.104,.086]);
    oval(head,'ink',[x*.091,.028,.313],[.028,.039,.021]);
    oval(head,'ivory',[x*.091-.008,.041,.330],[.008,.011,.006]);
    oval(head,'peach',[x*.151,-.045,.298],[.047,.025,.010]);
  }
  tube(head,'ink',[[-.032,-.061,.321],[0,-.075,.327],[.032,-.061,.321]],.007);
  oval(head,'green',[0,.327,-.023],[.023,.075,.023]);
  oval(head,'orange',[0,.389,-.023],[.058,.053,.058]);

  function limb(isArm) {
    const outer=isArm?.081:.111, inner=isArm?.068:.092;
    return {
      outer,inner,top:mesh(scene,cylinder,mats[isArm?'green':'dark']),bottom:mesh(scene,cylinder,mats[isArm?'mint':'green']),
      start:oval(scene,isArm?'green':'dark',[0,0,0],[outer,outer,outer]),joint:oval(scene,isArm?'mint':'green',[0,0,0],[inner*1.07,inner*1.07,inner*1.07]),
      end:isArm?oval(scene,'cream',[0,0,0],[.071,.065,.066]):group(),
    };
  }
  const arms=[limb(true),limb(true)],legs=[limb(false),limb(false)];
  for(const leg of legs){
    oval(leg.end,'green',[0,-.072,.057],[.117,.058,.187]);
    oval(leg.end,'ivory',[0,-.031,.064],[.108,.069,.172]);
    oval(leg.end,'mint',[0,.011,.095],[.076,.025,.052]);
  }

  const bell=group();
  oval(bell,'orange',[0,-.233,0],[.158,.150,.145]);
  mesh(bell,cylinder,mats.metal,[0,-.365,0],[.108,.024,.092]);
  oval(bell,'cream',[0,-.235,.138],[.063,.048,.015]);
  tube(bell,'metal',[[-.102,-.166,0],[-.107,-.058,0],[-.066,.010,0],[.066,.010,0],[.107,-.058,0],[.102,-.166,0]],.027);

  function span(item,a,b,r) {
    const difference=b.clone().sub(a);
    item.position.copy(a).lerp(b,.5);item.quaternion.setFromUnitVectors(Y,difference.clone().normalize());item.scale.set(r,difference.length(),r);
  }
  function positionLimb(limb,a,b,c) {
    span(limb.top,a,b,limb.outer);span(limb.bottom,b,c,limb.inner);
    limb.start.position.copy(a);limb.joint.position.copy(b);limb.end.position.copy(c);
  }
  function update(pose) {
    const hip=vector(pose.hip),axis=vector(pose.axis).normalize(),shoulders=hip.clone().addScaledVector(axis,.57);
    body.position.copy(hip);body.quaternion.setFromUnitVectors(Y,axis);
    head.position.copy(hip).addScaledVector(axis,.83);head.rotation.x=pose.faceTilt;
    shadow.position.x=hip.x;shadow.position.z=hip.z;
    shadow.scale.set(.43,.006,clip.camera==='floor'?.66:.31);
    const hands=pose.hands.map(vector), feet=pose.feet.map(vector);
    for(const [i,side] of [-1,1].entries()){
      const shoulder=shoulders.clone().add(new T.Vector3(side*.283,0,0));
      const topLeg=hip.clone().add(new T.Vector3(side*.165,0,0));
      const elbowPole=pose.elbows==='floor'?new T.Vector3(side*.97,-.44,0)
        :pose.elbows==='row'||(pose.elbows==='supported-row'&&i===0)?new T.Vector3(side*.30,.40,-1)
          :pose.elbows==='pushup'?new T.Vector3(side*.60,-.23,-.6):new T.Vector3(side*.56,-.7,-.34);
      positionLimb(arms[i],shoulder,bend(shoulder,hands[i],.30,.34,elbowPole),hands[i]);
      const kneePole=pose.elbows==='floor'?new T.Vector3(side*.08,1,.3):new T.Vector3(side*.21,-.03,1);
      positionLimb(legs[i],topLeg,bend(topLeg,feet[i],.445,.425,kneePole),feet[i]);
      legs[i].end.rotation.x=pose.footPitch[i];
    }
    bell.visible=pose.bell!=='none';
    if(bell.visible){
      bell.position.copy(hands[0]);
      if(pose.bell!=='left')bell.position.lerp(hands[1],.5);
      if(pose.bell==='goblet')bell.position.y+=.20;
      bell.rotation.set(pose.elbows==='floor'?0:pose.angle,0,pose.elbows==='floor'?pose.angle:0);
    }
  }

  return {update,dispose:()=>resources.forEach(item=>item.dispose())};
}

export function createMovementDemo(canvas,move,onCaption) {
  const clip=getClip(move);
  if(!clip)throw Error('沒有這個動作的示範。');
  // Explicitly require WebGL2 so the written cues remain available on older devices.
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'low-power'});
  if(!context)throw Error('此裝置無法啟用 3D。');
  const renderer=new T.WebGLRenderer({canvas,context,antialias:true});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));
  const scene=new T.Scene();scene.background=new T.Color(0xe8f0e4);
  scene.add(new T.HemisphereLight(0xfff8e6,0x88a89c,2.5));
  const key=new T.DirectionalLight(0xfff1d8,2.2);key.position.set(-3,6,4);scene.add(key);
  const rim=new T.DirectionalLight(0xc9f1ef,1.1);rim.position.set(3,4,-4);scene.add(rim);
  const camera=new T.OrthographicCamera(-1,1,1,-1,.1,20);
  const studio=makeStudio(scene,clip);
  let elapsed=0, speed=1, angle=-.66, running=false, raf=0, previous=null, caption='';
  const low=clip.camera==='floor', inclined=clip.camera==='incline';
  function render() {
    const pose=sampleMotion(move,elapsed);studio.update(pose);
    if(pose.caption!==caption){caption=pose.caption;onCaption(caption);}
    renderer.render(scene,camera);
  }
  function resize() {
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    renderer.setSize(width,height,false);
    const zoom=low?1.04:inclined?1.10:1.33;
    camera.left=-zoom*width/height;camera.right=-camera.left;camera.top=zoom;camera.bottom=-zoom;camera.updateProjectionMatrix();
    view(angle);
  }
  function view(radians) {
    angle=radians;
    const target=new T.Vector3(0,low?.53:inclined?.61:1.08,low?-.15:-.05);
    camera.position.set(target.x+Math.sin(angle)*5,target.y+(low?2.55:1.55),target.z+Math.cos(angle)*5);
    camera.lookAt(target);render();
  }
  function step(now) {
    if(!running)return;
    if(previous!==null)elapsed+=Math.min((now-previous)/1000,.10)*speed;
    previous=now;render();raf=requestAnimationFrame(step);
  }
  const size=new ResizeObserver(resize);size.observe(canvas);resize();
  function play(value) {
    if(running===value)return;
    running=value;previous=null;
    if(value)raf=requestAnimationFrame(step);else cancelAnimationFrame(raf);
  }
  return {view,play,speed:value=>{speed=value;},restart:()=>{elapsed=0;render();},dispose:()=>{play(false);size.disconnect();studio.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
