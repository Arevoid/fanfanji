import assert from "node:assert/strict";
import { iconSurfaceTransform } from "../src/features/home/appTransitionGeometry";
assert.equal(iconSurfaceTransform({left:120,top:240,width:60,height:60},{left:100,top:200,width:375,height:750}),"translate(20px, 40px) scale(0.16, 0.08)");
assert.equal(iconSurfaceTransform(undefined,{left:0,top:0,width:375,height:750}),null);
assert.equal(iconSurfaceTransform({left:-100,top:10,width:60,height:60},{left:0,top:0,width:375,height:750}),null,"removed/offscreen icons use the fade fallback");
assert.equal(iconSurfaceTransform({left:0,top:0,width:60,height:60},{left:0,top:0,width:0,height:750}),null);
console.log("PASS icon transitions use viewport offsets and reject invalid/offscreen origins");
