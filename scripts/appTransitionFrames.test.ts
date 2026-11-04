import assert from "node:assert/strict";
import { appTransitionFrames } from "../src/features/home/appTransitionFrames";
const transform = "translate(40px, 70px) scale(.15)";
const clip = "inset(0px 0px 375px 0px round 100px)";
const open = appTransitionFrames({direction:"open",iconTransform:transform,iconClip:clip,reduced:false});
const close = appTransitionFrames({direction:"close",iconTransform:transform,iconClip:clip,reduced:false});
assert.equal(open.frames[0].clipPath, clip);
assert.equal(close.frames[1].clipPath, clip);
const interrupted = appTransitionFrames({direction:"close",iconTransform:transform,iconClip:clip,reduced:false,fromTransform:"matrix(.5,0,0,.5,20,30)",fromClip:"inset(0px 0px 100px 0px round 30px)"});
assert.equal(interrupted.frames[0].clipPath,"inset(0px 0px 100px 0px round 30px)","interrupted opening continues from its current mask");
assert.equal(open.frames[0].transform,close.frames[1].transform,"open and close use the same icon origin");
assert.ok([...open.frames,...close.frames].every(frame=>frame.opacity===1),"spatial flight never crossfades the app contents over the desktop");
assert.ok(close.duration < open.duration);
for (const direction of ["open","close"] as const) {
  const minimal=appTransitionFrames({direction,iconTransform:transform,reduced:true});
  assert.ok(minimal.frames.every(frame=>frame.transform==="none"),"reduced motion must not zoom or translate");
  assert.equal(minimal.duration,180,"avoid a short flash masquerading as a transition");
  const fallback=appTransitionFrames({direction,iconTransform:null,reduced:false});
  assert.ok(fallback.frames.every(frame=>frame.transform==="none"),"no invented icon position for notifications or removed icons");
}
console.log("PASS solid spatial surfaces, reverse geometry and reduced-motion policy");
