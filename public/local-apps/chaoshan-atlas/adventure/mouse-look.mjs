// Relative mouse distance, never event frequency or frame time, drives aiming.
export const LOOK_GAIN = .0052;
export function mouseLook(yaw, pitch, dx, dy, sensitivity=1, aiming=false,aimMultiplier=.65) {
  if (![yaw,pitch,dx,dy,sensitivity].every(Number.isFinite)) return {yaw,pitch};
  const gain=LOOK_GAIN*Math.max(.4,Math.min(3,sensitivity))*(aiming?Math.max(.02,Math.min(2,Number.isFinite(aimMultiplier)?aimMultiplier:.65)):1);
  return {yaw:yaw-dx*gain,pitch:Math.max(-1.28,Math.min(1.24,pitch-dy*gain))};
}
// Used only when the browser cannot capture the mouse. The outer 28 pixels
// keep turning so a screen edge never forces repeated drag gestures.
export function edgeLook(clientX, left, width) {
  if (![clientX,left,width].every(Number.isFinite)||width<=0)return 0;
  const margin=Math.min(28,width*.08),x=clientX-left;
  if(x<0||x>width)return 0;
  if(x<margin)return -(1-x/margin);
  if(x>width-margin)return (x-width+margin)/margin;
  return 0;
}
