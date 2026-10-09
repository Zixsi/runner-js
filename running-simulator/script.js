/* ==============================================
   3D Runner Simulator - Main Script
   ============================================== */

const CONFIG = { LANES: 3, LANE_WIDTH: 2.5, PLAYER_X: 0, GROUND_Y: 0, GRAVITY: -20, JUMP_VELOCITY: 8, BASE_SPEED: 12, SPEED_INCREMENT: 0.5, MAX_SPEED: 30, ZONE_LENGTH: 100, SPAWN_AHEAD: 200, DESPAWN_BEHIND: 50, COIN_VALUE: 1 };
const ZONE_COLORS = [0x2d5a27,0x3a6b8c,0x8b4513,0x6b2d8c,0x8c3a2d,0x2d8c6b,0x8c8c2d,0x2d2d8c,0x5a2d5a,0x1a1a2e];
const OBSTACLE_COLORS = { barrier: 0xff4444, wall: 0x4444ff, moving: 0xffaa00 };
const UPGRADES = [
  { id:"magnet", name:"Magnet", desc:"Attracts coins from adjacent lanes", basePrice:50, maxLevel:5, effectRadius:2 },
  { id:"shield", name:"Shield", desc:"Protects from one collision", basePrice:100, maxLevel:1 },
  { id:"multiplier", name:"Multiplier", desc:"x2 coin value", basePrice:75, maxLevel:3 },
  { id:"speed_boost", name:"Speed Boost", desc:"+2m/s initial speed", basePrice:60, maxLevel:4 }
];

// === CLASS Player ===
class Player {
  constructor(scene) {
    this.scene = scene;
    this.x = CONFIG.PLAYER_X;
    this.y = CONFIG.GROUND_Y;
    this.z = 0;
    this.velocityY = 0;
    this.onGround = true;
    this.width = 0.8;
    this.height = 1.8;
    this.depth = 0.5;
    this.shieldActive = false;
    this.targetX = this.x;
    const bg = new THREE.BoxGeometry(0.6, 1.2, 0.4);
    const bm = new THREE.MeshStandardMaterial({ color: 0x00d4ff, roughness: 0.3, metalness: 0.7 });
    this.body = new THREE.Mesh(bg, bm);
    this.body.position.set(this.x, this.y + 0.9, this.z);
    this.body.castShadow = true;
    this.scene.add(this.body);
    const hg = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const hm = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4, metalness: 0.5 });
    this.head = new THREE.Mesh(hg, hm);
    this.head.position.set(this.x, this.y + 1.85, this.z);
    this.head.castShadow = true;
    this.scene.add(this.head);
    const sg = new THREE.SphereGeometry(1.2, 16, 16);
    const sm = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    this.shieldMesh = new THREE.Mesh(sg, sm);
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
    const gg = new THREE.PlaneGeometry(1.5, 1.5);
    const gm = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.3 });
    this.glow = new THREE.Mesh(gg, gm);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.set(this.x, CONFIG.GROUND_Y + 0.01, this.z);
    this.scene.add(this.glow);
  }
  update(dt) {
    var dx = this.targetX - this.x;
    if (Math.abs(dx) > 0.05) this.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 12);
    else this.x = this.targetX;
    if (!this.onGround) {
      this.velocityY += CONFIG.GRAVITY * dt;
      this.y += this.velocityY * dt;
      if (this.y <= CONFIG.GROUND_Y) { this.y = CONFIG.GROUND_Y; this.velocityY = 0; this.onGround = true; }
    }
    this.body.position.set(this.x, this.y + 0.9, this.z);
    this.head.position.set(this.x, this.y + 1.85, this.z);
    this.glow.position.set(this.x, CONFIG.GROUND_Y + 0.01, this.z);
    if (this.shieldActive) {
      this.shieldMesh.visible = true;
      this.shieldMesh.position.set(this.x, this.y + 1, this.z);
      this.shieldMesh.rotation.y += dt * 2;
      this.shieldMesh.rotation.x += dt;
    } else { this.shieldMesh.visible = false; }
    this.glow.material.opacity = 0.3 + Math.sin(performance.now() * 0.005) * 0.1;
  }
  moveLeft()  { 
    if (this.targetX > -CONFIG.LANE_WIDTH / 2) this.targetX -= CONFIG.LANE_WIDTH; 
  }
  moveRight() { 
    if (this.targetX < CONFIG.LANE_WIDTH / 2) this.targetX += CONFIG.LANE_WIDTH; 
  }
  jump()      { if (this.onGround) { this.velocityY = CONFIG.JUMP_VELOCITY; this.onGround = false; } }
  setShield(a) { this.shieldActive = a; }
  getBoundingBox() {
    return { minX: this.x - this.width / 2, maxX: this.x + this.width / 2, minY: this.y, maxY: this.y + this.height, minZ: this.z - this.depth / 2, maxZ: this.z + this.depth / 2 };
  }
  dispose() {
    [this.body, this.head, this.shieldMesh, this.glow].forEach(function(m) {
      if (m) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    }.bind(this));
  }
}

// === CLASS Obstacle ===
class Obstacle {
  constructor(type, lane, z, scene) {
    this.type = type; this.lane = lane; this.z = z; this.scene = scene;
    this.active = true; this.offsetX = 0;
    var h, d, c;
    if (type === "barrier") { h = 0.6; d = 1.5; c = OBSTACLE_COLORS.barrier; }
    else if (type === "wall") { h = 2.0; d = 0.3; c = OBSTACLE_COLORS.wall; }
    else { h = 1.2; d = 1.0; c = OBSTACLE_COLORS.moving; }
    var geo = new THREE.BoxGeometry(1.5, h, d);
    var mat = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(((c >> 16) & 255) / 255 * 0.4, ((c >> 8) & 255) / 255 * 0.4, (c & 255) / 255 * 0.4), roughness: 0.4, metalness: 0.6 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(this.x || lane * CONFIG.LANE_WIDTH, h / 2, z);
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);
    var gg = new THREE.BoxGeometry(1.7, 0.05, d + 0.2);
    var gm = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25 });
    this.glow = new THREE.Mesh(gg, gm);
    this.glow.position.set(this.x || lane * CONFIG.LANE_WIDTH, 0.025, z);
    this.scene.add(this.glow);
    this.height = h; this.depth = d;
    this.x = lane * CONFIG.LANE_WIDTH;
  }
  update(dt, playerZ) {
    if (this.type === "moving") {
      this.offsetX += dt * 1.5;
      this.x = this.lane * CONFIG.LANE_WIDTH + Math.sin(this.offsetX) * CONFIG.LANE_WIDTH;
      this.mesh.position.x = this.x;
      this.glow.position.x = this.x;
    }
    if (this.z - playerZ > CONFIG.SPAWN_AHEAD + 50) this.active = false;
  }
  getBoundingBox() {
    return { minX: this.x - 0.75, maxX: this.x + 0.75, minY: 0, maxY: this.height, minZ: this.z - this.depth / 2, maxZ: this.z + this.depth / 2 };
  }
  dispose() {
    [this.mesh, this.glow].forEach(function(m) {
      this.scene.remove(m); m.geometry.dispose(); m.material.dispose();
    }.bind(this));
  }
}

// === CLASS Coin ===
class Coin {
  constructor(lane, z, scene) {
    this.lane = lane; this.z = z; this.scene = scene;
    this.active = true; this.collected = false;
    this.baseY = 0.8; this.phase = Math.random() * Math.PI * 2;
    this.x = lane * CONFIG.LANE_WIDTH;
    var geo = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16);
    var mat = new THREE.MeshStandardMaterial({ color: 0xffc800, emissive: 0x443300, roughness: 0.2, metalness: 0.9 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(this.x, this.baseY, z);
    this.scene.add(this.mesh);
    var gg = new THREE.SphereGeometry(0.35, 8, 8);
    var gm = new THREE.MeshBasicMaterial({ color: 0xffc800, transparent: true, opacity: 0.15 });
    this.glow = new THREE.Mesh(gg, gm);
    this.mesh.add(this.glow);
  }
  update(dt) {
    if (!this.collected) {
      this.phase += dt * 3;
      this.mesh.position.y = this.baseY + Math.sin(this.phase) * 0.15;
      this.mesh.rotation.y += dt * 2;
    }
  }
  collect() {
    if (!this.collected) { this.collected = true; this.active = false; this.scene.remove(this.mesh); }
  }
  distanceTo(px, pz) { var dx = this.x - px, dz = this.z - pz; return Math.sqrt(dx * dx + dz * dz); }
  dispose() {
    this.scene.remove(this.mesh); if (this.mesh.geometry) this.mesh.geometry.dispose();
    if (this.mesh.material) this.mesh.material.dispose();
    if (this.glow && this.glow.geometry) this.glow.geometry.dispose();
    if (this.glow && this.glow.material) this.glow.material.dispose();
  }
}

// === CLASS Zone ===
class Zone {
  constructor(number, scene) {
    this.number = number; this.scene = scene;
    this.startZ = -(number - 1) * CONFIG.ZONE_LENGTH;
    this.endZ = this.startZ - CONFIG.ZONE_LENGTH;
    this.obstacles = []; this.coins = [];
    this.color = ZONE_COLORS[(number - 1) % ZONE_COLORS.length];
    var geo = new THREE.PlaneGeometry(CONFIG.LANE_WIDTH * CONFIG.LANES, CONFIG.ZONE_LENGTH);
    var mat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.8, metalness: 0.2 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(2.5, CONFIG.GROUND_Y + 0.01, this.startZ - CONFIG.ZONE_LENGTH / 2);
    this.scene.add(this.mesh);
    for (var i = 1; i < CONFIG.LANES; i++) {
      var lg = new THREE.PlaneGeometry(0.05, CONFIG.ZONE_LENGTH);
      var lm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
      var ln = new THREE.Mesh(lg, lm);
      ln.rotation.x = -Math.PI / 2;
      ln.position.set(i * CONFIG.LANE_WIDTH - CONFIG.LANE_WIDTH / 2, CONFIG.GROUND_Y + 0.02, this.startZ - CONFIG.ZONE_LENGTH / 2);
      this.scene.add(ln);
    }
  }
  addObstacle(t, l, z) { var o = new Obstacle(t, l, z, this.scene); this.obstacles.push(o); return o; }
  addCoin(l, z) { var c = new Coin(l, z, this.scene); this.coins.push(c); return c; }
  isNear(pz) { return this.endZ >= pz - CONFIG.DESPAWN_BEHIND && this.startZ <= pz + CONFIG.SPAWN_AHEAD; }
  dispose() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
    for (var i = 0; i < this.obstacles.length; i++) this.obstacles[i].dispose();
    for (var j = 0; j < this.coins.length; j++) this.coins[j].dispose();
  }
  static generate(n, sc) { return new Zone(n, sc); }
}

// === CLASS Shop ===
class Shop {
  constructor() {
    this.coins = parseInt(localStorage.getItem("runner_coins") || "0", 10);
    this.upgrades = {};
    for (var i = 0; i < UPGRADES.length; i++) this.upgrades[UPGRADES[i].id] = 0;
    this.loadFromStorage();
  }
  loadFromStorage() {
    var d = localStorage.getItem("runner_upgrades");
    if (d) try { var p = JSON.parse(d); for (var k in p) if (this.upgrades.hasOwnProperty(k)) this.upgrades[k] = p[k]; } catch (e) {}
  }
  saveToStorage() {
    localStorage.setItem("runner_upgrades", JSON.stringify(this.upgrades));
    localStorage.setItem("runner_coins", this.coins.toString());
  }
  addCoins(a) { this.coins += a; this.saveToStorage(); }
  getPrice(id) {
    var u = null; for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) { u = UPGRADES[i]; break; }
    if (!u) return Infinity; var lvl = this.upgrades[id] || 0;
    return Math.floor(u.basePrice * Math.pow(1.5, lvl));
  }
  getLevel(id) { return this.upgrades[id] || 0; }
  buy(id) {
    var u = null; for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) { u = UPGRADES[i]; break; }
    if (!u) return false; var lvl = this.upgrades[id] || 0;
    if (lvl >= u.maxLevel) return false; var price = this.getPrice(id);
    if (this.coins < price) return false;
    this.coins -= price; this.upgrades[id] = lvl + 1; this.saveToStorage(); return true;
  }
  getMagnetRadius() {
    var l = this.getLevel("magnet");
    return l > 0 ? UPGRADES.find(function(u) { return u.id === "magnet" }).effectRadius * l : 0;
  }
  getCoinMultiplier() { var l = this.getLevel("multiplier"); return l > 0 ? 1 + l : 1; }
  getSpeedBonus() { var l = this.getLevel("speed_boost"); return l > 0 ? l * 2 : 0; }
  hasShield() { return this.getLevel("shield") > 0; }
  render(cid) {
    var c = document.getElementById(cid); if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      var lvl = this.getLevel(u.id);
      var price = this.getPrice(u.id);
      var mx = lvl >= u.maxLevel;
      var card = document.createElement('div');
      card.className = 'upgrade-card' + (mx ? ' purchased' : '');

      var infoDiv = document.createElement("div");
      infoDiv.className = 'upgrade-info';

      var nameDiv = document.createElement("div");
      nameDiv.className = 'upgrade-name';
      nameDiv.innerHTML = u.name + ' <span style="color:#00d4ff">' + lvl + '/' + u.maxLevel + '</span>';

      var descDiv = document.createElement("div");
      descDiv.className = 'upgrade-desc';
      descDiv.textContent = u.desc;

      infoDiv.appendChild(nameDiv);
      infoDiv.appendChild(descDiv);

      var priceDiv = document.createElement("div");
      priceDiv.className = 'upgrade-price';
      priceDiv.textContent = mx ? 'MAX' : price + ' coins';

      card.appendChild(infoDiv);
      card.appendChild(priceDiv);

      if (!mx) {
        card.style.cursor = 'pointer';
        (function(uid, cid2) {
          card.addEventListener('click', function() {
            if (window.game.shop.buy(uid)) {
              window.game.shop.render(cid2);
              updateCoinDisplay();
            }
          });
        })(u.id, cid);
      }
      c.appendChild(card);
    }
  }
}

// === CLASS Game ===

class Game {
  constructor() {
    this.scene = null; this.camera = null; this.renderer = null;
    this.clock = new THREE.Clock();
    this.player = null; this.shop = null;
    this.zones = []; this.currentZone = null;
    this.gameSpeed = CONFIG.BASE_SPEED + (this.shop ? this.shop.getSpeedBonus() : 0);
    this.distance = 0; this.coins = 0;
    this.isPlaying = false; this.gameOver = false;
    this.spawnTimer = 0; this.coinSpawnTimer = 0;
    this.lastPlayerZ = 0;
    this.init();
  }
  init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1a1a2e, 30, 180);
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(CONFIG.PLAYER_X - 3, 5, -8);
    this.camera.lookAt(CONFIG.PLAYER_X, 2, 10);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);
    var amb = new THREE.AmbientLight(0x404060, 0.8);
    this.scene.add(amb);
    var dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(-10, 20, -5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    var sd = 60;
    dir.shadow.camera.left = -sd; dir.shadow.camera.right = sd;
    dir.shadow.camera.top = sd; dir.shadow.camera.bottom = -sd;
    this.scene.add(dir);
    var hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d1b, 0.4);
    this.scene.add(hemi);
    var gGeo = new THREE.PlaneGeometry(200, 600);
    var gMat = new THREE.MeshStandardMaterial({ color: 0x1a3a17, roughness: 0.9 });
    this.ground = new THREE.Mesh(gGeo, gMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.z = 250;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    var sGeo = new THREE.BoxGeometry(400, 200, 600);
    var sMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.BackSide });
    this.skybox = new THREE.Mesh(sGeo, sMat);
    this.skybox.position.z = 250;
    this.scene.add(this.skybox);
    for (var i = 0; i < 80; i++) {
      var tGeo = new THREE.ConeGeometry(1.5 + Math.random() * 3, 4 + Math.random() * 8, 6);
      var tMat = new THREE.MeshStandardMaterial({ color: 0x2d4a27, roughness: 0.9 });
      for (var s = -1; s <= 1; s += 2) {
        var tree = new THREE.Mesh(tGeo, tMat);
        tree.position.set(s * (8 + Math.random() * 30), 0, Math.random() * 500 - 50);
        this.scene.add(tree);
      }
    }

    this.shop = new Shop();
    this.player = new Player(this.scene);
  }
  start() {
    this.isPlaying = true; 
    this.gameOver = false;
    this.distance = 0; 
    this.coins = 0;
    this.gameSpeed = CONFIG.BASE_SPEED + (this.shop ? this.shop.getSpeedBonus() : 0);
    this.lastPlayerZ = 0; this.spawnTimer = 0; this.coinSpawnTimer = 0;
    for (var i = 0; i < this.zones.length; i++) this.zones[i].dispose();
    this.zones = []; this.currentZone = null;

    this.createZone(1); 
    updateCoinDisplay();
    this.gameLoop();
  }
  createZone(n) {
    var z = Zone.generate(n, this.scene);
    this.zones.push(z);
    if (n > 1) z.addObstacle("barrier", -1, z.startZ + 30);
    if (n > 2) z.addObstacle("wall", 1, z.startZ + 50);
    if (n > 3) z.addObstacle("moving", 0, z.startZ + 70);
    if (n > 4) {
      z.addObstacle("barrier", -1, z.startZ + 90);
      z.addObstacle("wall", 1, z.startZ + 120);
    }
    if (n % 2 === 0) z.addObstacle("moving", 0, z.startZ + 40);
    for (var i = 0; i < 5; i++) {
      var cl = Math.floor(Math.random() * CONFIG.LANES);
      var cz = z.startZ + 10 + Math.random() * (CONFIG.ZONE_LENGTH - 20);
      z.addCoin(cl, cz);
    }
    this.currentZone = z;
  }
  update(dt) {
    if (!this.isPlaying || this.gameOver) return;
    this.player.z += this.gameSpeed * dt;
    this.distance = Math.floor(this.player.z);
    this.lastPlayerZ = this.player.z;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      var nl = Math.floor(Math.random() * CONFIG.LANES);
      var types = ["barrier", "wall"];
      if (Math.random() < 0.3) types.push("moving");
      this.currentZone.addObstacle(types[Math.floor(Math.random() * types.length)], nl, this.player.z + CONFIG.SPAWN_AHEAD - Math.random() * 40);
      this.spawnTimer = 1.5 + Math.random() * 2;
    }
    this.coinSpawnTimer -= dt;
    if (this.coinSpawnTimer <= 0) {
      var cl = Math.floor(Math.random() * CONFIG.LANES);
      this.currentZone.addCoin(cl, this.player.z + CONFIG.SPAWN_AHEAD - 20 - Math.random() * 30);
      this.coinSpawnTimer = 0.8 + Math.random() * 1;
    }
    for (var i = this.zones.length - 1; i >= 0; i--) {
      if (!this.zones[i].isNear(this.player.z)) {
        if (i > 0) this.zones[i].dispose();
        this.zones.splice(i, 1);
      } else { this.currentZone = this.zones[i]; }
    }
    var nzNum = this.zones.length + 1;
    if (!this.zones[this.zones.length - 1] || this.zones[this.zones.length - 1].startZ < this.player.z - CONFIG.ZONE_LENGTH * 0.5) {
      this.createZone(nzNum);
    }
    for (var k = 0; k < this.zones.length; k++) {
      for (var m = 0; m < this.zones[k].obstacles.length; m++) {
        var obs = this.zones[k].obstacles[m];
        if (obs.active) {
          obs.update(dt, this.player.z);
          if (!obs.active) continue;
          var pb = this.player.getBoundingBox();
          var ob = obs.getBoundingBox();
          if (pb.minX < ob.maxZ && pb.maxX > ob.minX && pb.minY < ob.maxY && pb.maxY > ob.minY) {
            var mbx = Math.abs((ob.minX + ob.maxX) / 2 - (pb.minX + pb.maxX) / 2);
            if (mbx < (this.player.width + obs.depth) / 2 + 0.3 && Math.abs(this.player.z - obs.z) < 1.5) {
            }
          }
        }
      }
      for (var n = 0; n < this.zones[k].coins.length; n++) {
        var coin = this.zones[k].coins[n];
        if (!coin.active) continue;
        coin.update(dt);
        var mr = this.shop ? this.shop.getMagnetRadius() : 0;
        var dist = coin.distanceTo(this.player.x, this.player.z);
        if (mr > 0 && dist < mr * 3 && !coin.collected) {
          var t = Math.min(1, dt * 8);
          coin.mesh.position.x += (this.player.x - coin.mesh.position.x) * t;
          coin.mesh.position.y += (this.player.y + 1 - coin.mesh.position.y) * t;
        }
        if (dist < 1.2 && !coin.collected) {
          var mult = this.shop ? this.shop.getCoinMultiplier() : 1;
          coin.collect(); this.coins += Math.floor(mult); updateCoinDisplay();
        }
      }
    }
    this.player.update(dt);
    this.camera.position.z = this.player.z - 8;
    this.camera.position.x = CONFIG.PLAYER_X - 3;
    this.ground.position.z = this.player.z + 250;
    this.skybox.position.z = this.player.z + 250;
    updateHUD();
    this.renderer.render(this.scene, this.camera)
  }
  gameLoop() {
    if (!this.isPlaying) return;
    var dt = Math.min(this.clock.getDelta(), 0.05);
    this.gameSpeed = Math.min(this.gameSpeed + CONFIG.SPEED_INCREMENT * dt, CONFIG.MAX_SPEED);
    this.update(dt);
    requestAnimationFrame(() => this.gameLoop());
  }
  gameOver() {

    if (this.shop) { this.shop.addCoins(Math.floor(this.distance / 10)); }
    this.isPlaying = false; this.gameOver = true;
    var goScreen = document.getElementById("gameOverScreen");
    if (goScreen) {
      goScreen.style.display = "flex";
      document.getElementById("goMeters").textContent = Math.floor(this.distance) + " m";
      var zn = this.zones.length > 0 ? this.zones[this.zones.length - 1].number : 1;
      document.getElementById("goZone").textContent = zn;
      document.getElementById("goCoins").textContent = Math.floor(this.distance / 10) + " coins";
    }
    var hud = document.getElementById("hud"); if (hud) hud.style.display = "none";
  }
  dispose() {
    this.isPlaying = false;
    if (this.player) this.player.dispose();
    for (var i = 0; i < this.zones.length; i++) this.zones[i].dispose();
    if (this.renderer) {
      if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}

// === GLOBAL FUNCTIONS AND INITIALIZATION ===
var game = null;

window.addEventListener("load", function () {
  var btn = document.getElementById("btnStartRun");

  if (btn) { 
    btn.addEventListener("click", function () { 
      document.getElementById("shopScreen").style.display = "none"; 
      document.getElementById("gameOverScreen").style.display = "none"; 
      document.getElementById("hud").style.display = "flex"; 
      
      if (!game) { 
        game = new Game(); 
      } 
      
      game.start(); 
    }); 
  }

  var btn2 = document.getElementById("btnReturnToShop"); 

  if (btn2) { 
    btn2.addEventListener("click", function () { 
      document.getElementById("gameOverScreen").style.display = "none"; 
      document.getElementById("shopScreen").style.display = "flex"; 
      document.getElementById("hud").style.display = "none"; 

      if (window.game && window.game.shop) { 
        window.game.shop.render("upgradesList"); 
        updateShopCoins(); 
      } 
    }); 
  }
  
  updateShopCoins();
});


document.addEventListener("keydown", function(e) {
  if (!game || !game.isPlaying) return;
  switch(e.key) {
    case "ArrowLeft": case "a": case "A": game.player.moveLeft(); break;
    case "ArrowRight": case "d": case "D": game.player.moveRight(); break;
    case "ArrowUp": case "w": case "W": case " ": game.player.jump(); break;
  }
});

window.addEventListener("resize", function() {
  if (!game) return;
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
});

var tsx=0,tsy=0;

document.addEventListener("touchstart",function(e){
  tsx=e.touches[0].clientX;
  tsy=e.touches[0].clientY;
});

document.addEventListener("touchend",function(e){
  if(!game||!game.isPlaying) return;

  var dx=e.changedTouches[0].clientX-tsx;
  var dy=e.changedTouches[0].clientY-tsy;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx>30) {
      game.player.moveRight();
    } else if (dx<-30) {
      game.player.moveLeft();
    } else {
      if(dy<-30) game.player.jump();
    }
  }
});

function updateHUD(){
  if(!game)return;
  var sp=document.getElementById("hudSpeed");
  if(sp)sp.textContent=Math.floor(game.gameSpeed*3.6)+" km/h";
  var zn=document.getElementById("hudZone");
  if(zn&&game.zones.length>0)zn.textContent=game.zones[game.zones.length-1].number;
  var mt=document.getElementById("hudMeters");
  if(mt)mt.textContent=game.distance+" m";
  var cn=document.getElementById("hudCoins");
  if(cn)cn.textContent=game.coins+" coins";
}

function updateCoinDisplay(){
  if(!game)return;
  var el=document.getElementById("hudCoins");
  if(el)el.textContent=game.coins+" coins";
  updateShopCoins();
}

function updateShopCoins() { 
  var el=document.getElementById("shopCoins"); 
  if(el&&window.game&&window.game.shop) el.textContent=window.game.shop.coins; 
}
