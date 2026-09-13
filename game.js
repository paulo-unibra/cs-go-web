import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const container = document.querySelector('#game');
const menu = document.querySelector('#menu');
const playButton = document.querySelector('#playButton');
const hud = document.querySelector('#hud');
const healthEl = document.querySelector('#health');
const armorEl = document.querySelector('#armor');
const ammoEl = document.querySelector('#ammo');
const reserveEl = document.querySelector('#reserve');
const reloadText = document.querySelector('#reloadText');
const timerEl = document.querySelector('#timer');
const roundLabel = document.querySelector('#roundLabel');
const scoreBlueEl = document.querySelector('#scoreBlue');
const scoreRedEl = document.querySelector('#scoreRed');
const killfeed = document.querySelector('#killfeed');
const hitmarker = document.querySelector('#hitmarker');
const damageFlash = document.querySelector('#damageFlash');
const roundOverlay = document.querySelector('#roundOverlay');
const roundResult = document.querySelector('#roundResult');
const roundSubtext = document.querySelector('#roundSubtext');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x99a8b7);
scene.fog = new THREE.Fog(0x99a8b7, 38, 88);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 160);
camera.position.set(0, 1.72, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.object);

const hemi = new THREE.HemisphereLight(0xddeeff, 0x5b5146, 2.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(18, 30, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(88, 88),
  new THREE.MeshStandardMaterial({ color: 0x8c8578, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(88, 44, 0x605c54, 0x777064);
grid.position.y = 0.008;
grid.material.opacity = 0.08;
grid.material.transparent = true;
scene.add(grid);

const colliders = [];
const worldMeshes = [];
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const keys = new Set();

function addBox(x, y, z, w, h, d, color = 0x72716d, collider = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02 })
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  worldMeshes.push(mesh);
  if (collider) colliders.push({ x, z, hw: w / 2, hd: d / 2, mesh });
  return mesh;
}

function addStripe(mesh, color = 0xe6b650) {
  const { x, z } = mesh.position;
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3(); box.getSize(size);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(size.x * 1.01, 0.13, size.z * 1.01),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  stripe.position.set(x, box.max.y - 0.23, z);
  scene.add(stripe);
}

addBox(0, 0, -42, 84, 5, 2, 0x53585c);
addBox(0, 0, 42, 84, 5, 2, 0x53585c);
addBox(-42, 0, 0, 2, 5, 84, 0x53585c);
addBox(42, 0, 0, 2, 5, 84, 0x53585c);
addBox(-19, 0, -18, 17, 4.2, 2.2, 0x62696d);
addBox(18, 0, -16, 18, 4.2, 2.2, 0x62696d);
addBox(-13, 0, 12, 2.2, 4.2, 19, 0x62696d);
addBox(14, 0, 14, 2.2, 4.2, 18, 0x62696d);
addBox(0, 0, -2, 12, 3.3, 2.2, 0x6a6f72);
addBox(-30, 0, 4, 2, 4, 22, 0x5b6166);
addBox(30, 0, 2, 2, 4, 22, 0x5b6166);
for (const [x, z, s] of [[-25,-27,3],[22,-27,3],[24,25,4],[-23,27,4],[-4,22,3],[6,17,2.5],[-6,-28,3]]) {
  const crate = addBox(x, 0, z, s, s, s, 0x8f7757);
  addStripe(crate, 0xb89560);
}
for (let i = -32; i <= 32; i += 16) {
  addBox(i, 4.8, -40.6, 0.7, 4, 0.7, 0x454a4d, false);
  addBox(i, 4.8, 40.6, 0.7, 4, 0.7, 0x454a4d, false);
}

const player = {
  health: 100, armor: 100, ammo: 30, reserve: 90, clip: 30,
  speed: 7.1, sprint: 10.2, radius: 0.42, velocityY: 0,
  grounded: true, alive: true, reloading: false, lastShot: 0,
  shotDelay: 0.095, recoil: 0,
};

let round = 1;
let roundTime = 90;
let scoreBlue = 0;
let scoreRed = 0;
let roundEnding = false;
let gameStarted = false;

const bots = [];
const botSpawns = [[-24, -31], [-5, -31], [17, -29], [27, 18], [-21, 28]];
const playerSpawn = new THREE.Vector3(0, 1.72, 34);

function material(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.72 }); }

function createBot(index, x, z) {
  const group = new THREE.Group();
  const enemyMat = material(index % 2 ? 0xa33c37 : 0x9f443b);
  const darkMat = material(0x262b31);
  const skinMat = material(0xb98d6d);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.02, 0.42), enemyMat);
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), skinMat);
  head.position.y = 1.93;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.82, 0.3), darkMat);
  const legR = legL.clone();
  legL.position.set(-0.21, 0.41, 0); legR.position.set(0.21, 0.41, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), enemyMat);
  const armR = armL.clone();
  armL.position.set(-0.52, 1.22, 0); armR.position.set(0.52, 1.22, 0);
  armL.rotation.z = -0.18; armR.rotation.z = 0.18;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.9), darkMat);
  gun.position.set(0.3, 1.25, -0.52); gun.rotation.x = -0.08;
  for (const p of [body, head, legL, legR, armL, armR, gun]) {
    p.castShadow = true; p.receiveShadow = true; group.add(p);
  }
  group.position.set(x, 0, z); scene.add(group);
  const bot = {
    id: index, group, head, body, health: 100, alive: true,
    speed: 2.0 + Math.random() * 0.6,
    destination: new THREE.Vector3(x, 0, z), nextMoveAt: 0, nextShotAt: 0,
    strafeDir: Math.random() > .5 ? 1 : -1, radius: .48,
  };
  head.userData = { bot, headshot: true };
  body.userData = { bot, headshot: false };
  armL.userData = armR.userData = legL.userData = legR.userData = { bot, headshot: false };
  bots.push(bot);
}

botSpawns.forEach((s, i) => createBot(i, s[0], s[1]));

function makeWeapon() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1d2227, roughness: .5, metalness: .65 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x4b555e, roughness: .6, metalness: .35 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x171a1d, roughness: .85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .78), metal); body.position.set(.26, -.22, -.54);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(.07, .07, .48), metal); barrel.position.set(.26, -.2, -.98);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(.2, .15, .35), accent); handguard.position.set(.26, -.22, -.78);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.11, .28, .12), gripMat); grip.position.set(.23, -.37, -.43); grip.rotation.x = -.22;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(.15, .15, .36), gripMat); stock.position.set(.26, -.19, -.18); stock.rotation.x = .06;
  group.add(body, barrel, handguard, grip, stock);
  group.position.set(.28, -.17, -.25); group.rotation.y = -0.03; camera.add(group);
  const flash = new THREE.PointLight(0xffb347, 0, 4, 2); flash.position.set(.26, -.2, -1.25); camera.add(flash);
  return { group, flash };
}
const weapon = makeWeapon();

function collides(x, z, radius = player.radius) {
  for (const c of colliders) {
    if (x + radius > c.x - c.hw && x - radius < c.x + c.hw && z + radius > c.z - c.hd && z - radius < c.z + c.hd) return true;
  }
  return false;
}

function moveWithCollision(dx, dz) {
  const pos = controls.object.position;
  const nx = pos.x + dx; if (!collides(nx, pos.z)) pos.x = nx;
  const nz = pos.z + dz; if (!collides(pos.x, nz)) pos.z = nz;
}

function botMoveWithCollision(bot, dx, dz) {
  const p = bot.group.position;
  const nx = p.x + dx;
  if (!collides(nx, p.z, bot.radius)) p.x = nx; else bot.strafeDir *= -1;
  const nz = p.z + dz;
  if (!collides(p.x, nz, bot.radius)) p.z = nz; else bot.strafeDir *= -1;
}

function setHUD() {
  healthEl.textContent = Math.max(0, Math.ceil(player.health));
  armorEl.textContent = Math.max(0, Math.ceil(player.armor));
  ammoEl.textContent = player.ammo; reserveEl.textContent = player.reserve;
  scoreBlueEl.textContent = scoreBlue; scoreRedEl.textContent = scoreRed;
  roundLabel.textContent = `ROUND ${round}`;
}

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function addKillFeed(killer, victim, headshot = false) {
  const el = document.createElement('div'); el.className = 'kill';
  el.textContent = `${killer}  ${headshot ? '✦' : '▸'}  ${victim}`;
  killfeed.appendChild(el); setTimeout(() => el.remove(), 4100);
}
function showHitmarker() { hitmarker.classList.add('active'); setTimeout(() => hitmarker.classList.remove('active'), 90); }
function tracer(start, end, color = 0xffd37c) {
  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .95 });
  const line = new THREE.Line(geo, mat); scene.add(line); setTimeout(() => scene.remove(line), 55);
}
function spark(point, color = 0xffcc6a) {
  const geo = new THREE.SphereGeometry(.045, 6, 6); const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(geo, mat);
    s.position.copy(point).add(new THREE.Vector3((Math.random()-.5)*.12, (Math.random()-.5)*.12, (Math.random()-.5)*.12));
    scene.add(s); setTimeout(() => scene.remove(s), 100 + i * 20);
  }
}

function shoot() {
  if (!gameStarted || !controls.isLocked || !player.alive || player.reloading || roundEnding) return;
  const now = performance.now() / 1000;
  if (now - player.lastShot < player.shotDelay) return;
  if (player.ammo <= 0) { reload(); return; }
  player.lastShot = now; player.ammo--; player.recoil = Math.min(.08, player.recoil + .012); setHUD();
  weapon.flash.intensity = 7; setTimeout(() => weapon.flash.intensity = 0, 42);
  weapon.group.position.z += .04; setTimeout(() => weapon.group.position.z -= .04, 55);
  const movementSpread = (keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD')) ? .005 : .002;
  const spread = player.recoil + movementSpread;
  raycaster.setFromCamera(new THREE.Vector2((Math.random()-.5)*spread, (Math.random()-.5)*spread), camera);
  const targetMeshes = [];
  for (const bot of bots) if (bot.alive) bot.group.traverse(o => { if (o.isMesh && o.userData?.bot) targetMeshes.push(o); });
  targetMeshes.push(...worldMeshes);
  const hits = raycaster.intersectObjects(targetMeshes, false);
  const start = new THREE.Vector3(); camera.getWorldPosition(start);
  let end = start.clone().add(raycaster.ray.direction.clone().multiplyScalar(60));
  if (hits.length) {
    const hit = hits[0]; end = hit.point.clone(); const info = hit.object.userData;
    if (info?.bot?.alive) {
      const damage = info.headshot ? 100 : 34; info.bot.health -= damage; showHitmarker();
      spark(hit.point, info.headshot ? 0xffd15c : 0xff6a54);
      if (info.bot.health <= 0) killBot(info.bot, info.headshot);
    } else spark(hit.point);
  }
  tracer(start, end);
}

function reload() {
  if (player.reloading || player.ammo === player.clip || player.reserve <= 0 || !player.alive) return;
  player.reloading = true; reloadText.textContent = 'RECARREGANDO...';
  const start = performance.now(); const duration = 1950;
  const anim = () => {
    if (!player.reloading) return;
    const t = Math.min(1, (performance.now() - start) / duration);
    weapon.group.rotation.z = Math.sin(t * Math.PI) * .28;
    weapon.group.position.y = -.17 - Math.sin(t * Math.PI) * .18;
    if (t < 1) requestAnimationFrame(anim);
  };
  anim();
  setTimeout(() => {
    if (!player.alive) return;
    const need = player.clip - player.ammo; const used = Math.min(need, player.reserve);
    player.ammo += used; player.reserve -= used; player.reloading = false; reloadText.textContent = '';
    weapon.group.rotation.z = 0; weapon.group.position.y = -.17; setHUD();
  }, duration);
}

function killBot(bot, headshot) {
  bot.alive = false; bot.group.visible = false; addKillFeed('VOCÊ', `BOT ${bot.id + 1}`, headshot);
  if (bots.every(b => !b.alive)) endRound(true, 'EQUIPE INIMIGA ELIMINADA');
}

function damagePlayer(amount) {
  if (!player.alive || roundEnding) return;
  const absorbed = Math.min(player.armor, amount * .55);
  player.armor -= absorbed; player.health -= amount - absorbed;
  damageFlash.classList.add('active'); setTimeout(() => damageFlash.classList.remove('active'), 110); setHUD();
  if (player.health <= 0) { player.alive = false; addKillFeed('BOT', 'VOCÊ'); endRound(false, 'VOCÊ FOI ELIMINADO'); }
}

function hasLineOfSight(bot) {
  const origin = bot.group.position.clone(); origin.y = 1.45;
  const target = controls.object.position.clone(); target.y = 1.55;
  const dir = target.clone().sub(origin); const dist = dir.length(); dir.normalize();
  raycaster.set(origin, dir); raycaster.far = dist;
  return raycaster.intersectObjects(worldMeshes, false).length === 0;
}

function updateBots(dt, now) {
  if (!player.alive || roundEnding) return;
  const playerPos = controls.object.position;
  for (const bot of bots) {
    if (!bot.alive) continue;
    const p = bot.group.position;
    const toPlayer = new THREE.Vector3(playerPos.x - p.x, 0, playerPos.z - p.z);
    const dist = toPlayer.length(); bot.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z) + Math.PI;
    if (dist < 28 && hasLineOfSight(bot)) {
      const dir = toPlayer.normalize(); let dx = 0, dz = 0;
      if (dist > 12) { dx += dir.x * bot.speed * dt; dz += dir.z * bot.speed * dt; }
      if (dist < 7) { dx -= dir.x * bot.speed * dt * .7; dz -= dir.z * bot.speed * dt * .7; }
      dx += -dir.z * bot.strafeDir * bot.speed * dt * .55; dz += dir.x * bot.strafeDir * bot.speed * dt * .55;
      botMoveWithCollision(bot, dx, dz);
      if (now > bot.nextShotAt && dist < 25) {
        bot.nextShotAt = now + .65 + Math.random() * .85;
        const origin = p.clone(); origin.y = 1.35;
        const target = playerPos.clone(); target.y = 1.45;
        target.x += (Math.random()-.5) * (dist * .035); target.y += (Math.random()-.5) * (dist * .02); target.z += (Math.random()-.5) * (dist * .035);
        tracer(origin, target, 0xff6b54);
        const accuracy = THREE.MathUtils.clamp(.83 - dist * .022, .22, .72);
        if (Math.random() < accuracy) damagePlayer(10 + Math.random() * 12);
      }
    } else {
      if (now > bot.nextMoveAt || p.distanceTo(bot.destination) < 2) {
        bot.nextMoveAt = now + 2 + Math.random() * 2.5;
        bot.destination.set((Math.random()-.5)*62, 0, (Math.random()-.5)*62);
      }
      const dir = bot.destination.clone().sub(p); dir.y = 0;
      if (dir.lengthSq() > .1) {
        dir.normalize(); bot.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
        botMoveWithCollision(bot, dir.x * bot.speed * dt * .62, dir.z * bot.speed * dt * .62);
      }
    }
  }
}

function resetRound() {
  roundEnding = false; roundTime = 90;
  Object.assign(player, { health: 100, armor: 100, ammo: 30, reserve: 90, alive: true, reloading: false, velocityY: 0, grounded: true });
  controls.object.position.copy(playerSpawn);
  weapon.group.rotation.z = 0; weapon.group.position.set(.28, -.17, -.25); reloadText.textContent = '';
  bots.forEach((bot, i) => {
    bot.health = 100; bot.alive = true; bot.group.visible = true;
    bot.group.position.set(botSpawns[i][0], 0, botSpawns[i][1]);
    bot.nextShotAt = performance.now()/1000 + 1 + Math.random();
  });
  roundOverlay.classList.add('hidden'); setHUD();
}

function endRound(playerWon, reason) {
  if (roundEnding) return; roundEnding = true;
  if (playerWon) scoreBlue++; else scoreRed++;
  roundResult.textContent = playerWon ? 'VITÓRIA' : 'DERROTA';
  roundResult.style.color = playerWon ? '#66a8ff' : '#ff6565';
  roundSubtext.textContent = reason; roundOverlay.classList.remove('hidden'); setHUD();
  setTimeout(() => { round++; resetRound(); }, 2800);
}

function updatePlayer(dt) {
  if (!controls.isLocked || !player.alive || roundEnding) return;
  const speed = keys.has('ShiftLeft') ? player.sprint : player.speed;
  let f = 0, r = 0;
  if (keys.has('KeyW')) f += 1; if (keys.has('KeyS')) f -= 1; if (keys.has('KeyD')) r += 1; if (keys.has('KeyA')) r -= 1;
  if (f || r) {
    const len = Math.hypot(f, r); f /= len; r /= len;
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
    const move = forward.multiplyScalar(f).add(right.multiplyScalar(r)).multiplyScalar(speed * dt);
    moveWithCollision(move.x, move.z);
  }
  player.velocityY -= 19 * dt; controls.object.position.y += player.velocityY * dt;
  if (controls.object.position.y <= 1.72) { controls.object.position.y = 1.72; player.velocityY = 0; player.grounded = true; }
  player.recoil = Math.max(0, player.recoil - dt * .045);
  const moving = f || r; const t = performance.now() * .008;
  const bob = moving && player.grounded ? Math.sin(t * (keys.has('ShiftLeft') ? 1.7 : 1.15)) * .012 : 0;
  weapon.group.position.x = .28 + (moving ? Math.cos(t * .5) * .006 : 0);
  if (!player.reloading) weapon.group.position.y = -.17 + bob;
}

function startGame() { gameStarted = true; hud.classList.remove('hidden'); controls.lock(); setHUD(); }
playButton.addEventListener('click', startGame);
controls.addEventListener('lock', () => menu.classList.remove('visible'));
controls.addEventListener('unlock', () => { if (gameStarted) menu.classList.add('visible'); });
document.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyR') reload();
  if (e.code === 'Space' && controls.isLocked && player.grounded && player.alive) { player.velocityY = 6.2; player.grounded = false; }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
document.addEventListener('mousedown', (e) => { if (e.button === 0) shoot(); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

resetRound();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04); const now = performance.now() / 1000;
  if (gameStarted && controls.isLocked && !roundEnding) {
    roundTime -= dt; if (roundTime <= 0) endRound(false, 'TEMPO ESGOTADO');
  }
  timerEl.textContent = formatTime(roundTime);
  updatePlayer(dt); updateBots(dt, now); renderer.render(scene, camera);
}
animate();
