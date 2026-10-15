import * as THREE from "/vendor/three/three.module.js";

const $ = (id) => document.getElementById(id),
  socket = io(),
  canvas = $("arena");
let me = null,
  room = null,
  keys = { up: false, down: false, left: false, right: false },
  jumpRequested = false,
  answeredId = null;
const params = new URLSearchParams(location.search);
if (params.has("room")) $("code").value = params.get("room");
const sections = ["setup", "lobby", "game", "end"];
function show(s) {
  sections.forEach((x) => $(x).classList.toggle("hidden", x !== s));
}
function msg(s) {
  $("message").textContent = s;
}
function myMatch() {
  return (
    room?.matches
      ?.slice()
      .reverse()
      .find((m) => m.ids.includes(me.id) && m.phase !== "ended") ||
    room?.matches
      ?.slice()
      .reverse()
      .find((m) => m.ids.includes(me.id))
  );
}
function player(id) {
  return room.players.find((p) => p.id === id);
}
function safe(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
$("join").onclick = () =>
  socket.emit("join", {
    code: $("code").value.trim().toUpperCase(),
    name: $("name").value,
    token: sessionStorage.getItem("gully-token"),
  });
$("ready").onclick = () =>
  socket.emit("ready", !room.players.find((p) => p.id === me.id)?.ready);
$("bots").onclick = () => socket.emit("addBots");
$("start").onclick = () => socket.emit("start");
$("final").onclick = () => socket.emit("startFinal");
$("copy").onclick = async () => {
  const link = location.origin + "/?room=" + room.code;
  try {
    await navigator.clipboard.writeText(link);
    $("copy").textContent = "Copied!";
  } catch {
    $("copy").textContent = link;
  }
};
socket.on("errorMessage", msg);
socket.on("joined", (data) => {
  me = data;
  sessionStorage.setItem("gully-token", data.token);
  history.replaceState({}, "", `/?room=${data.code}`);
  show("lobby");
});
socket.on("state", (r) => {
  room = r;
  if (!me) return;
  if (r.status === "lobby") {
    show("lobby");
    $("roomcode").textContent = r.code;
    $("players").innerHTML = r.players
      .map(
        (p) =>
          `<div>🚘 ${safe(p.name)} ${p.bot ? "🤖 " : ""}${p.id === r.host ? "👑" : ""} — ${p.ready ? "✅ READY" : "⌛ WAITING"} ${p.connected ? "" : "(offline)"}</div>`,
      )
      .join("");
    $("ready").textContent = r.players.find((p) => p.id === me.id)?.ready
      ? "Not Ready"
      : "I'm Ready";
    $("bots").classList.toggle(
      "hidden",
      r.host !== me.id || r.players.length === 4,
    );
    $("start").classList.toggle("hidden", r.host !== me.id);
    $("start").disabled =
      r.players.length !== 4 || !r.players.every((p) => p.ready);
  } else if (r.status === "finalReady" || r.status === "finished") {
    show("end");
    $("endtitle").textContent =
      r.status === "finished"
        ? "🏆 " + player(r.champion)?.name + " IS THE CHAMPION!"
        : "🏁 Semi-finals Complete";
    $("results").innerHTML = r.matches
      .map(
        (m) =>
          `<p>${m.round === 1 ? "Semi-final" : "Grand final"}: ${safe(player(m.winner)?.name || "Pending")} wins</p>`,
      )
      .join("");
    $("final").classList.toggle(
      "hidden",
      r.status !== "finalReady" || r.host !== me.id,
    );
  } else {
    show("game");
    const m = myMatch(),
      active = m && m.phase !== "ended";
    $("spectator").classList.toggle("hidden", active);
    if (!active) {
      $("spectator").innerHTML =
        "<h2>🏁 Your match is complete</h2><p>Waiting for the tournament to advance...</p>";
    } else {
      $("matchlabel").textContent =
        m.round === 2 ? "🏆 GRAND FINAL" : "⚔️ SEMI-FINAL";
      $("health").textContent = m.ids
        .map((id) => `${player(id)?.name}: ${Math.ceil(m.cars[id].hp)} HP`)
        .join(" | ");
      $("clock").textContent = Math.ceil(m.remaining) + "s";
      if (m.phase === "quiz" && m.quiz) {
        $("quiz").classList.remove("hidden");
        const q = m.quiz;
        const has = q.answered.includes(me.id);
        if ($("quiz").dataset.qid !== `${m.round}-${q.id}`) {
          $("quiz").dataset.qid = `${m.round}-${q.id}`;
          answeredId = null;
          $("quiz").innerHTML =
            `<h2>🇮🇳 ${safe(q.question)}</h2><div id="answers"></div><p id="qtime"></p>`;
          q.options.forEach((option, i) => {
            const b = document.createElement("button");
            b.textContent = `${"ABCD"[i]}. ${option}`;
            b.onclick = () => {
              if (answeredId === q.id) return;
              answeredId = q.id;
              socket.emit("answer", { questionId: q.id, index: i });
              document
                .querySelectorAll("#answers button")
                .forEach((b) => (b.disabled = true));
            };
            $("answers").append(b);
          });
        }
        document
          .querySelectorAll("#answers button")
          .forEach((b) => (b.disabled = has || answeredId === q.id));
        $("qtime").textContent = has
          ? "Answer locked — waiting for opponent"
          : `${q.remaining}s remaining`;
      } else {
        $("quiz").classList.add("hidden");
        $("quiz").dataset.qid = "";
      }
    }
  }
});
function send() {
  socket.emit("input", { ...keys, jump: jumpRequested });
  jumpRequested = false;
}
setInterval(() => {
  if (room && ["playing", "final"].includes(room.status)) send();
}, 50);
const mapping = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};
window.addEventListener("keydown", (e) => {
  if (mapping[e.code]) {
    keys[mapping[e.code]] = true;
    e.preventDefault();
  }
  if (e.code === "Space") {
    if (!e.repeat) jumpRequested = true;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (mapping[e.code]) keys[mapping[e.code]] = false;
});
document.querySelectorAll("[data-key]").forEach((b) => {
  const k = b.dataset.key;
  for (const ev of [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "pointerleave",
  ])
    b.addEventListener(ev, (e) => {
      e.preventDefault();
      keys[k] = ev === "pointerdown";
    });
});
$("jump").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  jumpRequested = true;
});
window.addEventListener("blur", () => {
  keys = { up: false, down: false, left: false, right: false };
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x83c8e8);
scene.fog = new THREE.Fog(0x83c8e8, 28, 62);
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 100);
const carMeshes = new Map();
const obstacleMeshes = new Map();
const WORLD_SCALE = 0.045;

scene.add(new THREE.HemisphereLight(0xd8efff, 0x53613e, 2.4));
const sun = new THREE.DirectionalLight(0xfff2cf, 3.2);
sun.position.set(-15, 24, -10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
scene.add(sun);

function material(color, roughness = 0.8, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(width, height, depth, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildArena() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 36),
    material(0x343b3f, 1),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const lineMaterial = material(0xe8bd3f, 0.9);
  for (let x = -18; x <= 18; x += 6) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.025, 0.12),
      lineMaterial,
    );
    line.position.set(x, 0.025, 0);
    scene.add(line);
  }
  for (let z = -12; z <= 12; z += 5) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.025, 2.1),
      lineMaterial,
    );
    line.position.set(0, 0.025, z);
    scene.add(line);
  }

  const wallMaterial = material(0xd8b45a);
  for (const [x, z, width, depth] of [
    [0, -14.6, 43, 0.8],
    [0, 14.6, 43, 0.8],
    [-21.1, 0, 0.8, 30],
    [21.1, 0, 0.8, 30],
  ]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.1, depth),
      wallMaterial,
    );
    wall.position.set(x, 0.55, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  const shopColors = [0xef654f, 0xf0b83f, 0x42aa99, 0xd779a6, 0x5c89c7];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 9; i++) {
      const height = 2.8 + (i % 3) * 0.65;
      const shop = box(4, height, 2.8, shopColors[i % shopColors.length]);
      shop.position.set(-17 + i * 4.25, height / 2, side * 17.2);
      scene.add(shop);
      const awning = box(3.7, 0.18, 0.8, i % 2 ? 0xffe28a : 0xe85244);
      awning.position.set(shop.position.x, 1.3, side * 15.7);
      scene.add(awning);
    }
  }
}

function createCar(color) {
  const group = new THREE.Group();
  const body = box(2.5, 0.68, 1.45, color);
  body.position.y = 0.62;
  group.add(body);
  const hood = box(0.8, 0.28, 1.3, color);
  hood.position.set(1.45, 0.73, 0);
  group.add(hood);
  const cabin = box(1.15, 0.58, 1.16, 0xa6ddeb);
  cabin.position.set(-0.25, 1.15, 0);
  group.add(cabin);
  const bumper = box(0.18, 0.28, 1.56, 0x14191e);
  bumper.position.set(1.76, 0.45, 0);
  group.add(bumper);
  for (const x of [-0.85, 0.95]) {
    for (const z of [-0.78, 0.78]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.33, 0.33, 0.28, 14),
        material(0x0b0d0f, 0.9),
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.37, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
  group.scale.setScalar(0.82);
  return group;
}

function syncArena(m, now) {
  for (const o of m.obstacles) {
    let mesh = obstacleMeshes.get(o.id);
    if (!mesh) {
      mesh = box(1.15, 1.15, 1.15, o.id % 3 ? 0xa66835 : 0xe5a22f);
      obstacleMeshes.set(o.id, mesh);
      scene.add(mesh);
    }
    mesh.visible = o.hp > 0;
    mesh.position.set(
      (o.x - 450) * WORLD_SCALE,
      0.58,
      (o.y - 300) * WORLD_SCALE,
    );
    mesh.rotation.y = o.id * 0.47;
  }

  for (const id of m.ids) {
    let mesh = carMeshes.get(id);
    if (!mesh) {
      mesh = createCar(player(id)?.color || "#ffffff");
      carMeshes.set(id, mesh);
      scene.add(mesh);
    }
    const car = m.cars[id];
    const jumping = now < car.jumpUntil;
    const progress = jumping ? 1 - (car.jumpUntil - now) / 650 : 0;
    mesh.position.set(
      (car.x - 450) * WORLD_SCALE,
      0.05 + (jumping ? Math.sin(progress * Math.PI) * 2.2 : 0),
      (car.y - 300) * WORLD_SCALE,
    );
    mesh.rotation.y = -car.angle;
    mesh.rotation.z = jumping ? Math.sin(progress * Math.PI) * -0.12 : 0;
  }
}

function resizeRenderer() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = renderer.getPixelRatio();
  if (
    canvas.width !== Math.round(width * pixelRatio) ||
    canvas.height !== Math.round(height * pixelRatio)
  ) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function draw() {
  requestAnimationFrame(draw);
  resizeRenderer();
  if (!room || !["playing", "final"].includes(room.status)) {
    renderer.render(scene, camera);
    return;
  }
  const m = myMatch();
  const car = m?.cars[me.id];
  if (!m || !car) return;
  const now = Date.now();
  syncArena(m, now);

  const px = (car.x - 450) * WORLD_SCALE;
  const pz = (car.y - 300) * WORLD_SCALE;
  const forward = new THREE.Vector3(
    Math.cos(car.angle),
    0,
    Math.sin(car.angle),
  );
  const targetPosition = new THREE.Vector3(px, 0.9, pz)
    .addScaledVector(forward, -7.6)
    .add(new THREE.Vector3(0, 4.4, 0));
  camera.position.lerp(targetPosition, 0.12);
  const lookAt = new THREE.Vector3(px, 1, pz).addScaledVector(forward, 5.5);
  camera.lookAt(lookAt);
  renderer.render(scene, camera);
}

buildArena();
camera.position.set(0, 8, 14);
camera.lookAt(0, 0, 0);
requestAnimationFrame(draw);
