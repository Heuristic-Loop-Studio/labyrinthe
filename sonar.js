import * as THREE from 'three';

export const WAVES = Object.freeze([
  { name: 'COURTE', range: 4, duration: 1, speed: 9, cooldown: 0.85, color: '#b6f9c8', frequency: 510 },
  { name: 'MOYENNE', range: 8, duration: 2, speed: 9, cooldown: 1.65, color: '#9cdeed', frequency: 290 },
  { name: 'LONGUE', range: 14, duration: 4, speed: 9, cooldown: 2.8, color: '#c7b8ef', frequency: 155 },
]);
export const MAX_WAVES = 16;

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vec4 localPosition = vec4(position, 1.0);
    vec3 localNormal = normal;
    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
      localNormal = mat3(instanceMatrix) * localNormal;
    #endif
    vec4 worldPosition = modelMatrix * localPosition;
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uKind;
  uniform int uWaveCount;
  uniform vec4 uWaves[${MAX_WAVES}];
  uniform vec4 uSettings[3];
  uniform vec3 uColors[3];
  #ifdef USE_SIGN
    uniform sampler2D uMap;
  #endif
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  float gridLine(float coordinate, float size, float thickness) {
    float distanceToLine = abs(fract(coordinate / size + 0.5) - 0.5) * size;
    return 1.0 - smoothstep(thickness, thickness * 2.0, distanceToLine);
  }

  void main() {
    // Most of the time the entire scene is black: avoid all wave/grid math.
    if (uWaveCount == 0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec3 light = vec3(0.0);
    float edgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edges = 1.0 - smoothstep(0.007, 0.014, edgeDistance);
    vec3 normal = abs(vWorldNormal);
    float horizontalCoordinate = normal.x > normal.z ? vWorldPosition.z : vWorldPosition.x;
    float wallGrid = max(gridLine(horizontalCoordinate, 0.6, 0.005), gridLine(vWorldPosition.y, 0.6, 0.005));
    float floorGrid = max(gridLine(vWorldPosition.x + 1.5, 3.0, 0.018), gridLine(vWorldPosition.z + 1.5, 3.0, 0.018));
    float detail = 0.10 + edges * 0.68 + wallGrid * 0.055;
    if (uKind > 0.5 && uKind < 1.5) detail = 0.022 + floorGrid * 0.23;
    if (uKind > 2.5) detail = 0.015 + floorGrid * 0.09;

    for (int i = 0; i < ${MAX_WAVES}; i++) {
      if (i >= uWaveCount) break;
      vec4 wave = uWaves[i];
      vec4 settings = uSettings[0];
      vec3 waveColor = uColors[0];
      if (wave.w > 0.5) { settings = uSettings[1]; waveColor = uColors[1]; }
      if (wave.w > 1.5) { settings = uSettings[2]; waveColor = uColors[2]; }
      float distanceFromSource = distance(vWorldPosition.xz, wave.xy);
      float age = uTime - wave.z - distanceFromSource / settings.z;
      if (age >= 0.0 && age < settings.y && distanceFromSource < settings.x) {
        float fade = pow(max(0.0, 1.0 - age / settings.y), 1.65);
        float front = exp(-age * 19.0);
        float rangeFade = 1.0 - smoothstep(settings.x * 0.78, settings.x, distanceFromSource);
        float brightness = (detail + front * 0.3) * fade * rangeFade;
        if (uKind > 1.5 && uKind < 2.5) {
          waveColor = vec3(0.52, 1.0, 0.37);
          brightness = (0.38 + edges * 0.45 + front * 0.2) * fade * rangeFade;
        }
        light = max(light, waveColor * brightness);
      }
    }
    #ifdef USE_SIGN
      float mask = texture2D(uMap, vUv).a;
      if (mask < 0.05) discard;
      light *= mask;
    #endif
    gl_FragColor = vec4(light, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSonar() {
  const waveSlots = Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 0, -1000, 0));
  const uniforms = {
    uTime: { value: 0 },
    uWaveCount: { value: 0 },
    uWaves: { value: waveSlots },
    uSettings: { value: WAVES.map((wave) => new THREE.Vector4(wave.range, wave.duration, wave.speed, 0)) },
    uColors: { value: WAVES.map((wave) => new THREE.Color(wave.color)) },
  };
  const createMaterial = (kind, map) => new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: { ...uniforms, uKind: { value: kind }, ...(map ? { uMap: { value: map } } : {}) },
    defines: map ? { USE_SIGN: true } : {},
  });
  let activeWaves = [];
  const updateSlots = () => {
    uniforms.uWaveCount.value = activeWaves.length;
    activeWaves.forEach((wave, index) => waveSlots[index].set(wave.x, wave.z, wave.time, wave.type));
  };
  return {
    wallMaterial: createMaterial(0),
    floorMaterial: createMaterial(1),
    exitMaterial: createMaterial(2),
    ceilingMaterial: createMaterial(3),
    createSignMaterial: (map) => createMaterial(2, map),
    setTime: (time) => {
      uniforms.uTime.value = time;
      activeWaves = activeWaves.filter((wave) => time - wave.time < WAVES[wave.type].duration + WAVES[wave.type].range / WAVES[wave.type].speed);
      updateSlots();
    },
    emit: (x, z, time, type) => {
      activeWaves.push({ x, z, time, type });
      if (activeWaves.length > MAX_WAVES) activeWaves.shift();
      updateSlots();
    },
    reset: () => {
      waveSlots.forEach((slot) => slot.set(0, 0, -1000, 0));
      uniforms.uTime.value = 0;
      activeWaves = [];
      uniforms.uWaveCount.value = 0;
    },
  };
}
