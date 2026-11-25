import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT, DIRECTIONS, generateMaze, cellAtPosition, moveWithCollisions } from './maze.js';
import { WAVES, createSonar } from './sonar.js';
import { SonarAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const canvas = $('world');
const waveButtons = [...document.querySelectorAll('[data-wave]')];
const helpDialog = $('help-dialog');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const keys = new Set();
const joystick = { x: 0, y: 0, pointer: null };
const lastEmissions = [-100, -100, -100];
const visitedCells = new Set();
const camera = new THREE.PerspectiveCamera(73, 1, 0.06, 90);
camera.rotation.order = 'YXZ';
const scene = new THREE.Scene();
const sonar = createSonar();
let renderer;
let maze;
let mazeGroup;
let exitTarget;
let state = 'intro';
let yaw = 0;
let pitch = 0;
let simulationTime = 0;
let totalDistance = 0;
let totalWaves = 0;
let selectedWave = 1;
let sessionNumber = 0;
let lastFrame = 0;
let lastUiUpdate = -1;
let echoLabelUntil = -1;
let lookPointer = null;
let lookX = 0;
let lookY = 0;
let resumeAfterHelp = false;
let suppressUnlockPause = false;

let muted = false;
try { muted = localStorage.getItem('echo-muted') === 'true'; } catch { /* Private browsing. */ }
const audio = new SonarAudio(muted);
updateSoundButton();

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.5 : 2));
  renderer.setClearColor(0x080c0d);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  resize();
} catch {
  showError('La 3D n’a pas pu démarrer. Essayez Chrome, Edge, Firefox ou Safari à jour, avec l’accélération graphique activée.');
}

function showError(message) {
  $('error-message').textContent = message;
  $('error-message').hidden = false;
  $('start-button').disabled = true;
  $('start-button').querySelector('span').textContent = '3D indisponible';
  $('system-label').textContent = 'SIGNAL INDISPONIBLE';
}

function resize() {
  if (!renderer) return;
  const width = app.clientWidth;
  const height = app.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function createExitSign() {
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 160;
  const context = signCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '500 66px monospace';
  context.fillText('SORTIE', 256, 83);
  const texture = new THREE.CanvasTexture(signCanvas);
  return { texture, material: sonar.createSignMaterial(texture) };
}
const exitSign = createExitSign();

function disposeMaze() {
  if (!mazeGroup) return;
  scene.remove(mazeGroup);
  const geometries = new Set();
  mazeGroup.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isInstancedMesh) object.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
}

function buildWorld() {
  disposeMaze();
  const seed = window.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now();
  maze = generateMaze(9, 9, seed);
  app.dataset.mazeSeed = String(seed);
  mazeGroup = new THREE.Group();

  // All walls are rendered in one draw call, including on phones.
  const box = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.InstancedMesh(box, sonar.wallMaterial, maze.walls.length);
  const transform = new THREE.Object3D();
  maze.walls.forEach((wall, index) => {
    transform.position.set(wall.x, WALL_HEIGHT / 2, wall.z);
    transform.scale.set(wall.sizeX, WALL_HEIGHT, wall.sizeZ);
    transform.updateMatrix();
    walls.setMatrixAt(index, transform.matrix);
  });
  walls.instanceMatrix.needsUpdate = true;
  walls.computeBoundingSphere();
  mazeGroup.add(walls);

  const plane = new THREE.PlaneGeometry(maze.width * CELL_SIZE, maze.height * CELL_SIZE);
  const centerX = (maze.width - 1) * CELL_SIZE / 2;
  const centerZ = (maze.height - 1) * CELL_SIZE / 2;
  const floor = new THREE.Mesh(plane, sonar.floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  mazeGroup.add(floor);
  const ceiling = new THREE.Mesh(plane, sonar.ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(centerX, WALL_HEIGHT, centerZ);
  mazeGroup.add(ceiling);

  // The exit is visible only while an echo touches it, never as a permanent light.
  const direction = DIRECTIONS[maze.exitDirection];
  const gate = new THREE.Group();
  gate.position.set(maze.exit.x * CELL_SIZE + direction.dx * 1.38, 0, maze.exit.z * CELL_SIZE + direction.dz * 1.38);
  gate.rotation.y = -maze.exitDirection * Math.PI / 2;
  const addGatePart = (x, y, sx, sy, sz) => {
    const part = new THREE.Mesh(box, sonar.exitMaterial);
    part.position.set(x, y, 0);
    part.scale.set(sx, sy, sz);
    gate.add(part);
  };
  addGatePart(-0.83, 1.1, 0.065, 2.2, 0.08);
  addGatePart(0.83, 1.1, 0.065, 2.2, 0.08);
  addGatePart(0, 2.2, 1.72, 0.065, 0.08);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), exitSign.material);
  sign.position.set(0, 1.8, 0.045);
  gate.add(sign);
  mazeGroup.add(gate);
  exitTarget = { x: maze.exit.x * CELL_SIZE + direction.dx * 0.65, z: maze.exit.z * CELL_SIZE + direction.dz * 0.65 };

  scene.add(mazeGroup);
  camera.position.set(maze.start.x * CELL_SIZE, 1.58, maze.start.z * CELL_SIZE);
  yaw = maze.startYaw;
  pitch = 0;
  updateCamera();
}

function setState(next) {
  state = next;
  app.classList.toggle('is-running', next === 'running');
  app.classList.toggle('is-paused', next === 'paused');
  app.classList.toggle('is-won', next === 'won');
  $('intro').hidden = next !== 'intro';
  $('pause-overlay').hidden = next !== 'paused';
  $('win-overlay').hidden = next !== 'won';
  $('system-label').textContent = next === 'running' ? 'EXPLORATION ACTIVE' : next === 'paused' ? 'SIGNAL EN PAUSE' : next === 'won' ? 'SORTIE ATTEINTE' : 'SYSTÈME PRÊT';
  canvas.style.cursor = next === 'running' ? 'grab' : 'default';
  updateWaveButtons();
}

function startGame() {
  if (!renderer) return;
  audio.unlock();
  clearInput();
  exitPointerLock();
  sonar.reset();
  simulationTime = 0;
  totalDistance = 0;
  totalWaves = 0;
  lastUiUpdate = -1;
  echoLabelUntil = -1;
  lastEmissions.fill(-100);
  visitedCells.clear();
  buildWorld();
  sessionNumber++;
  $('sector-label').textContent = `SECTEUR ${String(sessionNumber).padStart(2, '0')}`;
  $('game-hint').classList.remove('is-dismissed');
  $('echo-label').classList.remove('is-visible');
  $('dock-caption').textContent = coarsePointer ? 'TOUCHEZ POUR ÉMETTRE UNE ONDE' : 'CLIQUEZ OU UTILISEZ LES TOUCHES 1 / 2 / 3';
  $('footer-tip').textContent = coarsePointer ? 'Glissez sur l’écran pour regarder.' : 'ZQSD / WASD · cliquer-glisser pour regarder';
  renderer.setClearColor(0x000000);
  setState('running');
  updateTelemetry();
  lastFrame = performance.now();
  // Free cursor by default: every wave button stays clickable on desktop.
  // Double-clicking the scene enables optional immersive pointer lock.
}

function pauseGame(focus = true) {
  if (state !== 'running') return;
  setState('paused');
  clearInput();
  exitPointerLock();
  if (focus) $('resume-button').focus({ preventScroll: true });
}

function resumeGame() {
  if (state !== 'paused') return;
  audio.unlock();
  clearInput();
  setState('running');
  $('resume-button').blur();
  lastFrame = performance.now();
}

function winGame() {
  $('win-time').textContent = formatTime(simulationTime);
  $('win-distance').textContent = `${Math.round(totalDistance)} m`;
  $('win-waves').textContent = String(totalWaves);
  setState('won');
  clearInput();
  exitPointerLock();
  audio.victory();
  $('play-again-button').focus({ preventScroll: true });
}

function selectWave(index) {
  selectedWave = index;
  waveButtons.forEach((button, i) => button.classList.toggle('is-active', i === index));
}

function emitWave(index) {
  if (state !== 'running' || simulationTime - lastEmissions[index] < WAVES[index].cooldown) return;
  const wave = WAVES[index];
  selectWave(index);
  lastEmissions[index] = simulationTime;
  totalWaves++;
  sonar.emit(camera.position.x, camera.position.z, simulationTime, index);
  audio.unlock().then(() => audio.pulse(wave, index));
  $('game-hint').classList.add('is-dismissed');
  $('echo-label').textContent = `ONDE ${wave.name} · ${String(wave.range).padStart(2, '0')} M`;
  $('echo-label').style.color = wave.color;
  $('echo-label').classList.add('is-visible');
  echoLabelUntil = simulationTime + 1.35;
  const flash = $('pulse-flash');
  flash.style.setProperty('--pulse-color', wave.color);
  flash.classList.remove('is-flashing');
  void flash.offsetWidth;
  flash.classList.add('is-flashing');
  updateWaveButtons();
}

function updateWaveButtons() {
  waveButtons.forEach((button, index) => {
    const remaining = Math.max(0, WAVES[index].cooldown - (simulationTime - lastEmissions[index]));
    button.classList.toggle('is-cooling', state === 'running' && remaining > 0);
    button.setAttribute('aria-disabled', String(state !== 'running' || remaining > 0));
    button.querySelector('.cooldown-fill').style.transform = `scaleX(${state === 'running' ? remaining / WAVES[index].cooldown : 0})`;
  });
}

function updateCamera() {
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function look(dx, dy, touch = false) {
  yaw -= dx * (touch ? 0.0042 : 0.003);
  pitch = THREE.MathUtils.clamp(pitch - dy * (touch ? 0.0038 : 0.0028), -1.12, 1.12);
  updateCamera();
}

function updateMovement(dt) {
  let forward = Number(keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - joystick.y;
  let right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft')) + joystick.x;
  const length = Math.hypot(forward, right);
  if (length > 1) { forward /= length; right /= length; }
  const speed = 2.65;
  const dx = (right * Math.cos(yaw) - forward * Math.sin(yaw)) * speed * dt;
  const dz = (-right * Math.sin(yaw) - forward * Math.cos(yaw)) * speed * dt;
  if (Math.abs(dx) + Math.abs(dz) > 0.00001) {
    const position = moveWithCollisions(camera.position, dx, dz, maze.walls);
    const moved = Math.hypot(position.x - camera.position.x, position.z - camera.position.z);
    totalDistance += moved;
    camera.position.x = position.x;
    camera.position.z = position.z;
    camera.position.y = 1.58 + (reducedMotion ? 0 : Math.sin(totalDistance * 7.5) * Math.min(moved / Math.max(dt, 0.001), 1) * 0.018);
  } else {
    camera.position.y += (1.58 - camera.position.y) * Math.min(1, dt * 10);
  }
  const cell = cellAtPosition(maze, camera.position.x, camera.position.z);
  if (cell) visitedCells.add(cell.id);
  if (Math.hypot(camera.position.x - exitTarget.x, camera.position.z - exitTarget.z) < 0.72) winGame();
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function updateTelemetry() {
  if (!maze) return;
  const explored = Math.round(visitedCells.size / maze.cells.length * 100);
  $('exploration-value').textContent = String(explored).padStart(2, '0');
  $('exploration-bar').style.width = `${explored}%`;
  const degrees = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(degrees / 45) % 8];
  $('compass').textContent = `${cardinal} · ${String(Math.round(degrees) % 360).padStart(3, '0')}°`;
  $('footer-state').textContent = `${formatTime(simulationTime)} / ${String(Math.round(totalDistance)).padStart(3, '0')} M`;
}

function frame(now) {
  const dt = Math.max((now - lastFrame) / 1000, 0);
  lastFrame = now;
  if (state === 'running') {
    simulationTime += dt;
    // Sound/light durations follow real time even on a slower GPU. Movement
    // is sub-stepped to prevent crossing a thin wall during a dropped frame.
    let movementTime = Math.min(dt, 0.15);
    while (movementTime > 0.00001 && state === 'running') {
      const step = Math.min(movementTime, 1 / 60);
      updateMovement(step);
      movementTime -= step;
    }
    sonar.setTime(simulationTime);
    updateWaveButtons();
    if (simulationTime > echoLabelUntil) $('echo-label').classList.remove('is-visible');
    if (simulationTime - lastUiUpdate > 0.12) {
      updateTelemetry();
      lastUiUpdate = simulationTime;
    }
  }
  if (renderer) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resetJoystick() {
  joystick.x = 0;
  joystick.y = 0;
  joystick.pointer = null;
  $('joystick-thumb').style.transform = 'translate(0px, 0px)';
}

function clearInput() {
  keys.clear();
  if (lookPointer !== null && canvas.hasPointerCapture(lookPointer)) canvas.releasePointerCapture(lookPointer);
  if (joystick.pointer !== null && $('joystick').hasPointerCapture(joystick.pointer)) $('joystick').releasePointerCapture(joystick.pointer);
  lookPointer = null;
  resetJoystick();
}

function exitPointerLock() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function requestImmersiveView() {
  if (state !== 'running' || coarsePointer || !canvas.requestPointerLock) return;
  try {
    const promise = canvas.requestPointerLock();
    promise?.catch(() => { /* Clicking and dragging remains available. */ });
  } catch { /* Safari and embedded browsers can deny pointer lock. */ }
}

function updateSoundButton() {
  $('sound-icon').setAttribute('href', muted ? '#icon-muted' : '#icon-sound');
  $('sound-button').setAttribute('aria-pressed', String(muted));
  $('sound-button').setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
}

function toggleSound() {
  muted = !muted;
  audio.setMuted(muted);
  audio.unlock();
  updateSoundButton();
  try { localStorage.setItem('echo-muted', String(muted)); } catch { /* Optional preference. */ }
}

function openHelp() {
  if (helpDialog.open) return;
  resumeAfterHelp = state === 'running';
  if (resumeAfterHelp) pauseGame(false);
  helpDialog.showModal();
}

$('start-button').addEventListener('click', startGame);
$('resume-button').addEventListener('click', resumeGame);
$('restart-button').addEventListener('click', startGame);
$('play-again-button').addEventListener('click', startGame);
$('pause-button').addEventListener('click', () => pauseGame());
$('sound-button').addEventListener('click', toggleSound);
$('help-button').addEventListener('click', openHelp);
$('close-help').addEventListener('click', () => helpDialog.close());
$('help-done').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('close', () => {
  if (resumeAfterHelp && state === 'paused') resumeGame();
  resumeAfterHelp = false;
});
helpDialog.addEventListener('click', (event) => {
  if (event.target !== helpDialog) return;
  const rect = helpDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) helpDialog.close();
});

$('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (app.requestFullscreen) await app.requestFullscreen();
  } catch { /* Fullscreen is optional, and unavailable on some mobile browsers. */ }
});
if (!app.requestFullscreen) $('fullscreen-button').hidden = true;

waveButtons.forEach((button, index) => {
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      event.preventDefault();
      emitWave(index);
    }
  });
  button.addEventListener('click', () => {
    emitWave(index);
    button.blur();
  });
});

document.addEventListener('keydown', (event) => {
  if (helpDialog.open) return;
  if (event.code === 'KeyH' && !event.repeat) { openHelp(); return; }
  if (event.code === 'KeyM' && !event.repeat) { toggleSound(); return; }
  if (event.code === 'Escape') {
    if (state === 'running') pauseGame();
    else if (state === 'paused') resumeGame();
    return;
  }
  if (event.code === 'Enter' && !event.repeat && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A') {
    if (state === 'intro') startGame();
    else if (state === 'paused') resumeGame();
    return;
  }
  if (state !== 'running') return;
  const waveIndex = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
  const numpadIndex = ['Numpad1', 'Numpad2', 'Numpad3'].indexOf(event.code);
  if (waveIndex !== -1 || numpadIndex !== -1) {
    event.preventDefault();
    if (!event.repeat) emitWave(waveIndex !== -1 ? waveIndex : numpadIndex);
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) emitWave(selectedWave);
    return;
  }
  if (event.code === 'Tab' && document.pointerLockElement === canvas) {
    event.preventDefault();
    suppressUnlockPause = true;
    exitPointerLock();
    return;
  }
  if (['KeyW', 'KeyZ', 'KeyA', 'KeyQ', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
});
document.addEventListener('keyup', (event) => keys.delete(event.code));

canvas.addEventListener('pointerdown', (event) => {
  if (state !== 'running' || event.button > 0) return;
  if (document.pointerLockElement === canvas) { emitWave(selectedWave); return; }
  if (lookPointer !== null) return;
  lookPointer = event.pointerId;
  lookX = event.clientX;
  lookY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = 'grabbing';
  event.preventDefault();
});
canvas.addEventListener('dblclick', requestImmersiveView);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('pointermove', (event) => {
  if (state !== 'running') return;
  if (document.pointerLockElement === canvas) {
    look(event.movementX, event.movementY);
  } else if (event.pointerId === lookPointer) {
    look(event.clientX - lookX, event.clientY - lookY, event.pointerType === 'touch');
    lookX = event.clientX;
    lookY = event.clientY;
  }
});
function endLook(event) {
  if (event.pointerId !== lookPointer) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  lookPointer = null;
  canvas.style.cursor = state === 'running' ? 'grab' : 'default';
}
canvas.addEventListener('pointerup', endLook);
canvas.addEventListener('pointercancel', endLook);
canvas.addEventListener('lostpointercapture', endLook);
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    lookPointer = null;
    canvas.style.cursor = 'none';
    $('footer-tip').textContent = 'Clic : onde sélectionnée · Tab : curseur libre · Échap : pause';
  } else {
    if (state === 'running' && !suppressUnlockPause) pauseGame();
    suppressUnlockPause = false;
    $('footer-tip').textContent = 'ZQSD / WASD · cliquer-glisser pour regarder';
  }
});

const joystickElement = $('joystick');
function moveJoystick(event) {
  const rect = joystickElement.getBoundingClientRect();
  const max = rect.width * 0.32;
  let dx = event.clientX - rect.left - rect.width / 2;
  let dy = event.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(dx, dy);
  if (distance > max) { dx *= max / distance; dy *= max / distance; }
  joystick.x = Math.abs(dx / max) < 0.09 ? 0 : dx / max;
  joystick.y = Math.abs(dy / max) < 0.09 ? 0 : dy / max;
  $('joystick-thumb').style.transform = `translate(${dx}px, ${dy}px)`;
}
joystickElement.addEventListener('pointerdown', (event) => {
  if (state !== 'running' || joystick.pointer !== null) return;
  joystick.pointer = event.pointerId;
  joystickElement.setPointerCapture(event.pointerId);
  moveJoystick(event);
  event.preventDefault();
});
joystickElement.addEventListener('pointermove', (event) => {
  if (state === 'running' && event.pointerId === joystick.pointer) moveJoystick(event);
});
function endJoystick(event) {
  if (event.pointerId !== joystick.pointer) return;
  if (joystickElement.hasPointerCapture(event.pointerId)) joystickElement.releasePointerCapture(event.pointerId);
  resetJoystick();
}
joystickElement.addEventListener('pointerup', endJoystick);
joystickElement.addEventListener('pointercancel', endJoystick);
joystickElement.addEventListener('lostpointercapture', endJoystick);

window.addEventListener('resize', resize);
window.addEventListener('blur', () => { if (state === 'running') pauseGame(false); else clearInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'running') pauseGame(false); });
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  if (state === 'running') pauseGame(false);
  $('error-message').textContent = 'Le signal graphique a été interrompu. Attendez un instant ou rechargez la page.';
  $('error-message').hidden = false;
});
canvas.addEventListener('webglcontextrestored', () => {
  $('error-message').hidden = true;
  resize();
});

// A read-only snapshot makes the prototype testable without introducing cheats.
function getGameSnapshot() {
  return {
    state, seed: maze?.seed, width: maze?.width, height: maze?.height,
    player: { x: camera.position.x, z: camera.position.z, yaw, pitch },
    time: simulationTime, distance: totalDistance, waves: totalWaves,
    visited: visitedCells.size, selectedWave,
    drawCalls: renderer?.info.render.calls,
  };
}

if (import.meta.env.DEV) {
  window.echoDebug = Object.freeze({ snapshot: getGameSnapshot });
}

selectWave(selectedWave);
requestAnimationFrame(frame);
