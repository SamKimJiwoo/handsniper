let scene, camera, renderer;
let socket;
let players = {};
let isGameStarted = false;
let weaponGroup;

const keys = { w: false, a: false, s: false, d: false };
const moveSpeed = 0.1;

let settings = {
    fov: 75,
    sensitivity: 1.0,
    resolution: 1.0,
    crosshairStyle: 'classic'
};

let isAiming = false;
const defaultWeaponPos = new THREE.Vector3(0, 0, 0);
const aimWeaponPos = new THREE.Vector3(-0.2, -0.02, 0.25);

window.addEventListener('DOMContentLoaded', () => {
    const createServerBtn = document.getElementById('create-server-btn');
    const serverNameInput = document.getElementById('server-name-input');
    const nicknameInput = document.getElementById('nickname-input');
    const lobbyContainer = document.getElementById('lobby-container');

    if (createServerBtn) {
        createServerBtn.addEventListener('click', () => {
            const serverName = serverNameInput ? serverNameInput.value.trim() : '';
            const nickname = nicknameInput ? nicknameInput.value.trim() : 'Soldier_01';

            if (!serverName) {
                alert('작전 지역(서버) 이름을 입력하세요!');
                return;
            }

            document.getElementById('sb-server').innerText = serverName;
            document.getElementById('sb-nickname').innerText = nickname;

            if (lobbyContainer) lobbyContainer.style.display = 'none';
            document.getElementById('crosshair').style.display = 'block';
            document.getElementById('ui-info').style.display = 'block';

            updateCrosshairHTML(settings.crosshairStyle);

            if (!scene) {
                initGame();
            } else {
                isGameStarted = true;
            }
            connectSocket(nickname);
        });
    }

    setupMenuUI();
});

function updateCrosshairHTML(style) {
    const ch = document.getElementById('crosshair');
    if (!ch) return;

    ch.innerHTML = '';
    ch.style.color = '#38bdf8';
    ch.style.fontWeight = 'bold';
    ch.style.textAlign = 'center';
    ch.style.lineHeight = '0px';

    switch (style) {
        case 'classic':
            ch.innerHTML = `<div style="position:relative; width:20px; height:20px;">
                <span style="position:absolute; top:9px; left:0; width:20px; height:2px; background:#38bdf8; box-shadow: 0 0 4px #38bdf8;"></span>
                <span style="position:absolute; top:0; left:9px; width:2px; height:20px; background:#38bdf8; box-shadow: 0 0 4px #38bdf8;"></span>
            </div>`;
            break;
        case 'dot':
            ch.innerHTML = `<div style="width:6px; height:6px; background:#ef4444; border-radius:50%; box-shadow: 0 0 6px #ef4444;"></div>`;
            break;
        case 'circle':
            ch.innerHTML = `<div style="width:18px; height:18px; border:2px solid #38bdf8; border-radius:50%; box-sizing:border-box; position:relative; box-shadow: 0 0 6px rgba(56,189,248,0.5);">
                <span style="position:absolute; top:7px; left:7px; width:2px; height:2px; background:#38bdf8;"></span>
            </div>`;
            break;
        case 'T':
            ch.innerHTML = `<div style="font-size:16px; color:#22c55e; font-family:monospace; font-weight:bold; text-shadow: 0 0 6px #22c55e;">T</div>`;
            break;
    }
}

function connectSocket(nickname) {
    if (socket) socket.disconnect();
    socket = io('https://socket-io-chat-example.glitch.me');

    socket.on('connect', () => {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.innerText = "아레나 접속 완료 (무적 모드)";
            statusEl.style.color = "#2ed573";
        }
    });

    socket.on('currentPlayers', (serverPlayers) => {
        for (let id in serverPlayers) {
            if (id !== socket.id) {
                createRemotePlayer(serverPlayers[id]);
            }
        }
    });

    socket.on('newPlayer', (playerInfo) => {
        createRemotePlayer(playerInfo);
    });

    socket.on('playerMoved', (playerInfo) => {
        if (players[playerInfo.id]) {
            players[playerInfo.id].targetPosition.set(playerInfo.x, playerInfo.y, playerInfo.z);
        }
    });

    socket.on('disconnectPlayer', (id) => {
        if (players[id]) {
            scene.remove(players[id]);
            delete players[id];
        }
    });
}

function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f19);
    scene.fog = new THREE.FogExp2(0x0b0f19, 0.015);

    camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * settings.resolution, window.innerHeight * settings.resolution, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    document.body.appendChild(renderer.domElement);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(30, 50, 30);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    createTacticalGround();
    createArenaEnvironment();
    createAdvancedAssaultRifle();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));

    let isDragging = false;
    let prevPos = { x: 0, y: 0 };
    let euler = new THREE.Euler(0, 0, 0, 'YXZ');

    window.addEventListener('pointerdown', (e) => {
        if (!isGameStarted) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        prevPos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging || !isGameStarted) return;
        const dx = e.clientX - prevPos.x;
        const dy = e.clientY - prevPos.y;

        const sensMultiplier = isAiming ? 0.35 : 1.0;
        const sens = settings.sensitivity * 0.003 * sensMultiplier;
        
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= dx * sens;
        euler.x -= dy * sens;
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
        camera.quaternion.setFromEuler(euler);

        prevPos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointerup', () => { isDragging = false; });

    window.addEventListener('mousedown', (e) => {
        if (!isGameStarted) return;
        if (e.button === 2) {
            isAiming = true;
            const ch = document.getElementById('crosshair');
            if (ch) ch.style.display = 'none';
        }
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 2 && isGameStarted) {
            isAiming = false;
            const ch = document.getElementById('crosshair');
            if (ch) ch.style.display = 'block';
        }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    isGameStarted = true;
    animate();
}

function createTacticalGround() {
    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(120, 40, 0x38bdf8, 0x334155);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
}

function createAdvancedAssaultRifle() {
    weaponGroup = new THREE.Group();

    const metalDark = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.85, roughness: 0.25 });
    const metalGun = new THREE.MeshStandardMaterial({ color: 0x2f3542, metalness: 0.7, roughness: 0.35 });
    const polymerMat = new THREE.MeshStandardMaterial({ color: 0x1e222d, roughness: 0.6 });
    const accMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.4 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), metalDark);
    receiver.position.set(0.2, -0.2, -0.4);
    weaponGroup.add(receiver);

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.5), accMat);
    topRail.position.set(0.2, -0.125, -0.4);
    weaponGroup.add(topRail);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.11, 0.45), polymerMat);
    handguard.position.set(0.2, -0.2, -0.75);
    weaponGroup.add(handguard);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), metalGun);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.2, -0.18, -1.0);
    weaponGroup.add(barrel);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.025, 0.1), accMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0.2, -0.18, -1.22);
    weaponGroup.add(muzzle);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.26, 0.13), polymerMat);
    mag.rotation.x = -0.25;
    mag.position.set(0.2, -0.35, -0.38);
    weaponGroup.add(mag);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.2, 0.09), polymerMat);
    grip.rotation.x = 0.35;
    grip.position.set(0.2, -0.34, -0.12);
    weaponGroup.add(grip);

    const stockTop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.38), polymerMat);
    stockTop.position.set(0.2, -0.22, 0.08);
    weaponGroup.add(stockTop);

    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.16, 0.05), accMat);
    stockPad.position.set(0.2, -0.2, 0.25);
    weaponGroup.add(stockPad);

    const scopeBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.12), accMat);
    scopeBase.position.set(0.2, -0.09, -0.45);
    weaponGroup.add(scopeBase);

    const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08), metalDark);
    scopeLens.rotation.x = Math.PI / 2;
    scopeLens.position.set(0.2, -0.06, -0.45);
    weaponGroup.add(scopeLens);

    camera.add(weaponGroup);
    scene.add(camera);
}

function createArenaEnvironment() {
    const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const positions = [
        { x: -12, z: -12 }, { x: 12, z: -12 },
        { x: -12, z: 12 }, { x: 12, z: 12 },
        { x: 0, z: -25 }, { x: 0, z: 25 }
    ];

    positions.forEach(pos => {
        const boxGeo = new THREE.BoxGeometry(3.5, 4.5, 3.5);
        const obstacle = new THREE.Mesh(boxGeo, obstacleMat);
        obstacle.position.set(pos.x, 2.25, pos.z);
        scene.add(obstacle);
    });
}

function createRemotePlayer(info) {
    const geo = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
    const playerMesh = new THREE.Mesh(geo, mat);
    playerMesh.position.set(info.x, info.y, info.z);
    playerMesh.targetPosition = new THREE.Vector3(info.x, info.y, info.z);
    
    scene.add(playerMesh);
    players[info.id] = playerMesh;
}

function handleKey(e, isDown) {
    switch (e.key.toLowerCase()) {
        case 'w': keys.w = isDown; break;
        case 'a': keys.a = isDown; break;
        case 's': keys.s = isDown; break;
        case 'd': keys.d = isDown; break;
    }

    if (e.code === 'Tab') {
        e.preventDefault();
        const sb = document.getElementById('scoreboard');
        if (sb) sb.style.display = isDown ? 'block' : 'none';
    }

    if (e.code === 'Escape' && e.ctrlKey && isDown) {
        e.preventDefault();
        const pauseMenu = document.getElementById('pause-menu');
        const settingsMenu = document.getElementById('settings-menu');

        if (settingsMenu.style.display === 'flex') {
            settingsMenu.style.display = 'none';
            pauseMenu.style.display = 'flex';
            return;
        }

        if (pauseMenu.style.display === 'flex') {
            pauseMenu.style.display = 'none';
            isGameStarted = true;
        } else {
            pauseMenu.style.display = 'flex';
            isGameStarted = false;
        }
    }
}

function setupMenuUI() {
    const pauseMenu = document.getElementById('pause-menu');
    const settingsMenu = document.getElementById('settings-menu');

    document.getElementById('btn-resume').addEventListener('click', () => {
        pauseMenu.style.display = 'none';
        isGameStarted = true;
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
        pauseMenu.style.display = 'none';
        settingsMenu.style.display = 'flex';
    });

    document.getElementById('btn-leave').addEventListener('click', () => {
        pauseMenu.style.display = 'none';
        isGameStarted = false;

        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('ui-info').style.display = 'none';
        document.getElementById('lobby-container').style.display = 'flex';

        if (socket) socket.disconnect();

        for (let id in players) {
            scene.remove(players[id]);
            delete players[id];
        }
    });

    document.getElementById('close-settings').addEventListener('click', () => {
        settingsMenu.style.display = 'none';
        pauseMenu.style.display = 'flex';
    });

    document.getElementById('fov-range').addEventListener('input', (e) => {
        settings.fov = parseInt(e.target.value);
        document.getElementById('fov-val').innerText = settings.fov;
        if (camera && !isAiming) {
            camera.fov = settings.fov;
            camera.updateProjectionMatrix();
        }
    });

    document.getElementById('sens-range').addEventListener('input', (e) => {
        settings.sensitivity = parseFloat(e.target.value);
        document.getElementById('sens-val').innerText = settings.sensitivity.toFixed(1);
    });

    document.getElementById('crosshair-select').addEventListener('change', (e) => {
        settings.crosshairStyle = e.target.value;
        updateCrosshairHTML(settings.crosshairStyle);
    });

    document.getElementById('res-select').addEventListener('change', (e) => {
        settings.resolution = parseFloat(e.target.value);
        document.getElementById('res-val').innerText = Math.round(settings.resolution * 100) + '%';
        if (renderer) {
            renderer.setSize(window.innerWidth * settings.resolution, window.innerHeight * settings.resolution, false);
            renderer.domElement.style.width = '100%';
            renderer.domElement.style.height = '100%';
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    if (!isGameStarted) return;

    const targetFov = isAiming ? Math.max(30, settings.fov - 40) : settings.fov;
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();

    if (weaponGroup) {
        const targetWPos = isAiming ? aimWeaponPos : defaultWeaponPos;
        weaponGroup.position.lerp(targetWPos, 0.25);
    }

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const sideDirection = new THREE.Vector3(direction.z, 0, -direction.x);
    const currentSpeed = isAiming ? moveSpeed * 0.4 : moveSpeed;

    let moved = false;
    if (keys.w) { camera.position.addScaledVector(direction, currentSpeed); moved = true; }
    if (keys.s) { camera.position.addScaledVector(direction, -currentSpeed); moved = true; }
    if (keys.a) { camera.position.addScaledVector(sideDirection, currentSpeed); moved = true; }
    if (keys.d) { camera.position.addScaledVector(sideDirection, -currentSpeed); moved = true; }

    if (moved && socket && socket.connected) {
        socket.emit('playerMovement', {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        });
    }

    for (let id in players) {
        let p = players[id];
        if (p && p.targetPosition) {
            p.position.lerp(p.targetPosition, 0.15);
        }
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth * settings.resolution, window.innerHeight * settings.resolution, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
}
