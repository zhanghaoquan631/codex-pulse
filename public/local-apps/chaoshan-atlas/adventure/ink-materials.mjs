import * as THREE from 'three';

/** Original paper-and-pen surface treatment. No images, lighting or post pass.
 * Every factory call owns its material; dispose it normally when no longer used.
 * MeshBasicMaterial.color is the pen color, so color.set() remains useful.
 */
export const INK_COLORS = Object.freeze({
  blue: 0x28567d, red: 0xb12d38, green: 0x347448,
  orange: 0xb56a2b, brown: 0x87643f, paper: 0xf5f0dd,
});

const fragmentDeclarations = /* glsl */ `
uniform vec3 inkPaper;
uniform float inkTone;
uniform float inkAccent;
uniform float inkSpacing;
varying vec3 inkWorldNormal;
varying vec3 inkViewNormal;
varying vec3 inkViewPosition;

float penHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.7, 311.9))) * 43758.231);
}
// Distance to a wavy pen stroke. Derivatives retain a fine line at any DPR.
float penStroke(vec2 p, vec2 axis, float spacing, float phase) {
  float along = dot(p, vec2(-axis.y, axis.x));
  float wobble = sin(along * .021 + phase) * .38
    + sin(along * .073 + phase * 3.1) * .12;
  float q = (dot(p, axis) + wobble + phase * 5.) / spacing;
  float distanceToStroke = abs(fract(q + .5) - .5) * spacing;
  float aa = max(.45, fwidth(q) * spacing * .52);
  float stroke = 1. - smoothstep(.28, .28 + aa, distanceToStroke);
  return stroke * (.77 + .23 * sin(along * .033 + phase) * sin(along * .011));
}
`;

const fragmentSurface = /* glsl */ `
vec3 penNormal = normalize(inkWorldNormal);
if (!gl_FrontFacing) penNormal = -penNormal;
float penLight = dot(penNormal, normalize(vec3(-.38, .84, .54)));
float penShade = clamp((.88 - penLight) * .78, 0., 1.) * inkTone;
vec2 penPoint = gl_FragCoord.xy;
float firstHatch = penStroke(penPoint, normalize(vec2(1., -.67)), inkSpacing, .6);
float secondHatch = penStroke(penPoint, normalize(vec2(1., .89)), inkSpacing * 1.14, 2.4);
float hatch = firstHatch * smoothstep(.075, .36, penShade)
  + secondHatch * smoothstep(.32, .65, penShade) * .86;
float facing = abs(dot(normalize(inkViewNormal), normalize(-inkViewPosition)));
float rim = 1. - smoothstep(0., max(.012, fwidth(facing) * 1.05), facing);
float paperGrain = (penHash(floor(penPoint * .73)) - .5) * .012;
vec3 paperSurface = clamp(inkPaper + vec3(paperGrain), 0., 1.);
paperSurface = mix(paperSurface, diffuseColor.rgb, clamp(inkAccent, 0., .6));
float penCoverage = clamp(max(hatch * .86, rim * .8), 0., .96);
outgoingLight = mix(paperSurface, diffuseColor.rgb, penCoverage);
`;

/** tone: 0..1 hatch density; accent: 0..1 wash; spacing: framebuffer pixels.
 * Transparency and depth options are standard Three.js options. This is an
 * unlit pen shader: emissive/roughness/metalness are deliberately not relevant.
 */
export function createInkMaterial({
  ink = INK_COLORS.blue, paper = INK_COLORS.paper, tone = .55,
  accent = .02, spacing = 8, opacity = 1, transparent = false,
  depthWrite = true, side = THREE.FrontSide,
  emissive, emissiveIntensity, roughness, metalness, ...options
} = {}) {
  const material = new THREE.MeshBasicMaterial({
    ...options, color: ink, opacity, transparent, depthWrite, side, toneMapped: false,
  });
  material.name = 'Original procedural pen hatching';
  material.userData.ink = { paper, tone, accent, spacing };
  material.onBeforeCompile = shader => {
    shader.uniforms.inkPaper = { value: new THREE.Color(paper) };
    shader.uniforms.inkTone = { value: THREE.MathUtils.clamp(tone, 0, 1) };
    shader.uniforms.inkAccent = { value: THREE.MathUtils.clamp(accent, 0, 1) };
    shader.uniforms.inkSpacing = { value: Math.max(3, spacing) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 inkWorldNormal;
      varying vec3 inkViewNormal;
      varying vec3 inkViewPosition;
    `).replace('#include <project_vertex>', `
      #include <project_vertex>
      inkViewNormal = normalize(normalMatrix * normal);
      inkWorldNormal = normalize(vec3(vec4(inkViewNormal, 0.) * viewMatrix));
      inkViewPosition = mvPosition.xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      `#include <common>\n${fragmentDeclarations}`)
      .replace('#include <opaque_fragment>', `${fragmentSurface}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'chaoshan-original-paper-pen-v1';
  return material;
}

export function createInkLineMaterial(ink = INK_COLORS.blue, options = {}) {
  return new THREE.LineBasicMaterial({
    color: ink, transparent: true, opacity: .8, ...options, toneMapped: false,
  });
}
