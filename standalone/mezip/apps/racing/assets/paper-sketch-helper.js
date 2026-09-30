// APEX's existing Three.js/TSL runtime only. Copy this file beside the vendor.
// Original models, physics, lights, particle emitters and cameras are retained.
// The build adds a foliage alpha cutoff only in paper mode for clean silhouettes.
import {
  a5 as Fn, g as uv, f as float, a1 as vec2, aa as vec3, J as vec4,
  a9 as screenSize, a7 as max, ab as clamp, I as smoothstep,
  ac as step, e as color,
} from './three-vendor-BonXT3HA.js';

/**
 * Pass the original composed output after radial blur / SMAA / bloom.
 * Optional normalTextureName must already exist in scenePass's MRT setup.
 * Geometry normals are preferred. Normal-map normals add unwanted texture lines.
 *
 * Integration:
 *   postProcessing.outputNode = createPaperSketch(
 *     passes.scenePass, postProcessing.outputNode,
 *     { normalTextureName: 'sketchNormal' }
 *   );
 */
export function createPaperSketch(scenePass, originalOutput, {
  normalTextureName = null,
  lineWidth = 0.8,
  lineStrength = 0.90,
  detailStrength = 0.36,
  washStrength = 0.14,
  hatchStrength = 0.035,
} = {}) {
  const beauty = scenePass.getTextureNode();
  // PassNode owns a depth texture independently of Canvas's depth:false flag.
  const depth = scenePass.getTextureNode('depth');
  const normal = normalTextureName ? scenePass.getTextureNode(normalTextureName) : null;
  const near = scenePass._cameraNear;
  const far = scenePass._cameraFar;
  const paper = color('#f5f0dd');
  const ink = color('#28567d');
  const weights = vec3(0.2126, 0.7152, 0.0722);

  return Fn(() => {
    const p = uv();
    const pixel = vec2(lineWidth).div(screenSize);
    const dx = vec2(pixel.x, 0);
    const dy = vec2(0, pixel.y);
    const leftUV = clamp(p.sub(dx), vec2(0), vec2(1));
    const rightUV = clamp(p.add(dx), vec2(0), vec2(1));
    const upUV = clamp(p.sub(dy), vec2(0), vec2(1));
    const downUV = clamp(p.add(dy), vec2(0), vec2(1));

    // Perspective depth -> positive view-space distance. These are the same
    // camera uniforms maintained by PassNode.getViewZNode().
    const distance = position => near.mul(far).div(
      far.sub(far.sub(near).mul(depth.sample(position).r))
    );
    const z = distance(p);
    const zl = distance(leftUV);
    const zr = distance(rightUV);
    const zu = distance(upUV);
    const zd = distance(downUV);
    // Second differences remove most smooth planar gradients. First differences
    // alone produce ink over the whole road as the camera looks down it.
    const curvatureX = zl.add(zr).sub(z.mul(2)).abs();
    const curvatureY = zu.add(zd).sub(z.mul(2)).abs();
    const curvature = max(curvatureX, curvatureY).div(max(z, float(2)));
    const depthEdge = smoothstep(0.014, 0.06, curvature);
    let geometryEdge = depthEdge;
    if (normal) {
      const nl = normal.sample(leftUV).rgb;
      const nr = normal.sample(rightUV).rgb;
      const nu = normal.sample(upUV).rgb;
      const nd = normal.sample(downUV).rgb;
      const normalJump = max(nl.sub(nr).length(), nu.sub(nd).length());
      // WebGPU only blends the beauty MRT attachment. Ignore geometric normal
      // discontinuities where transparent tree / smoke cards overwrote this one.
      // Their visible contours are retained by the beauty edge below.
      const alphaCoverage = normal.sample(leftUV).a.mul(normal.sample(rightUV).a)
        .mul(normal.sample(upUV).a).mul(normal.sample(downUV).a);
      const normalEdge = smoothstep(0.20, 0.62, normalJump)
        .mul(smoothstep(0.15, 0.65, alphaCoverage));
      geometryEdge = max(depthEdge, normalEdge);
    }

    // A tiny high-threshold contribution keeps window frames, road lines and
    // signs recognizable without drawing every asphalt/grass texture texel.
    const l = beauty.sample(leftUV).rgb.dot(weights);
    const r = beauty.sample(rightUV).rgb.dot(weights);
    const u = beauty.sample(upUV).rgb.dot(weights);
    const d = beauty.sample(downUV).rgb.dot(weights);
    const photoEdge = smoothstep(0.065, 0.22, vec2(r.sub(l), d.sub(u)).length());
    const originalLuma = clamp(originalOutput.rgb.dot(weights), 0, 1);
    const shadow = float(1).sub(originalLuma);
    const foreground = float(1).sub(step(0.999999, depth.sample(p).r));
    const point = p.mul(screenSize);
    const wave = point.x.mul(0.67).add(point.y.mul(0.46))
      .add(point.y.mul(0.035).sin().mul(0.38)).sin().abs();
    const hatch = float(1).sub(smoothstep(0.045, 0.17, wave))
      .mul(smoothstep(0.72, 0.95, shadow)).mul(foreground);
    const grain = point.floor().dot(vec2(12.9898, 78.233)).sin()
      .mul(43758.5453).fract().sub(0.5).mul(0.003);
    const coverage = clamp(geometryEdge.mul(lineStrength)
      .add(photoEdge.mul(detailStrength))
      .add(shadow.mul(washStrength).mul(foreground))
      .add(hatch.mul(hatchStrength)), 0, 0.96);
    const shadedPaper = paper.add(grain);
    const result = shadedPaper.mul(float(1).sub(coverage)).add(ink.mul(coverage));
    return vec4(result, 1);
  })();
}
