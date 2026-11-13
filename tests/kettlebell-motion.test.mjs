import assert from 'node:assert/strict';
import {test} from 'node:test';
import {movements} from '../public/kettlebell-core.js';
import {getClip,sampleMotion} from '../public/kettlebell-motion.js';

test('every available movement has a continuous loop, with planted feet where the movement requires it',()=>{
 for(const move of Object.keys(movements)){
  const clip=getClip(move);
  assert.ok(clip,move);
  const first=sampleMotion(move,0),loop=sampleMotion(move,clip.seconds);
  for(const field of ['hip','hands','feet'])assert.deepEqual(loop[field],first[field],`${move}: reset ${field}`);
  for(let i=1;i<=35;i++){
   const pose=sampleMotion(move,clip.seconds*i/18);
   assert.ok([...pose.hip,...pose.axis,...pose.hands.flat(),...pose.feet.flat()].every(Number.isFinite),move);
   if(!['lunge','carry'].includes(move))assert.deepEqual(pose.feet,first.feet,`${move}: no sliding`);
  }
 }
 const {seconds}=getClip('lunge');
 assert.ok(sampleMotion('lunge',seconds*.5).feet[0][2]<-.5);
 assert.ok(sampleMotion('lunge',seconds*1.5).feet[1][2]<-.5);
});
