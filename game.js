import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, query, orderByChild, limitToFirst, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { map1 } from './SpeedrunMap/map1.js';

const mapData = { map1: map1 };

const firebaseConfig = {
    apiKey: "AIzaSyBBBFWrlHqn0o67pnx2Fzq70YD_NOv_sxo",
    authDomain: "hook-ee923.firebaseapp.com",
    databaseURL: "https://hook-ee923-default-rtdb.firebaseio.com/",
    projectId: "hook-ee923",
    storageBucket: "hook-ee923.firebasestorage.app",
    appId: "1:1043446793127:web:32112b9c8e5cb29ef92c82"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 🌟 가속 버그 원천 차단 변수 (isLoopRunning)
let isLoopRunning = false, score = 0, isGameOver = false, isStarted = false;
let currentGameMode = 'infinite', currentMapId = 'map1';
let cameraX = 0, deadlineX = -600, mousePos = { x: 0, y: 0 }, lastSpawnX = 1200;
let particles = [], obstacles = [], keys = {}, guideOpacity = 1, startTime = 0, canReboot = false;

const player = { x: 400, y: 300, vx: 0, vy: 0, size: 22, color: '#00ffff', onGround: false, alive: true };
const hook = { active: false, x: 0, y: 0, length: 0, maxDist: 700 };

let audioCtx, windGain;
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const noise = audioCtx.createBuffer(1, 2 * audioCtx.sampleRate, audioCtx.sampleRate);
    const output = noise.getChannelData(0);
    for (let i = 0; i < noise.length; i++) output[i] = Math.random() * 2 - 1;
    const source = audioCtx.createBufferSource(); source.buffer = noise; source.loop = true;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600;
    windGain = audioCtx.createGain(); windGain.gain.value = 0;
    source.connect(filter); filter.connect(windGain); windGain.connect(audioCtx.destination);
    source.start();
}

function playSound(f, t, d, v) {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = f; o.frequency.setValueAtTime(t, audioCtx.currentTime);
    g.gain.setValueAtTime(v, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + d);
}

function showMainMenuRankings() {
    const leftPanel = document.getElementById('ranking-left');
    const rightPanel = document.getElementById('ranking-right');
    leftPanel.style.display = 'flex';
    rightPanel.style.display = 'flex';

    onValue(query(ref(db, 'scores/infinite'), orderByChild('score'), limitToLast(10)), (snapshot) => {
        let sorted = snapshot.val() ? Object.values(snapshot.val()).sort((a,b) => b.score - a.score) : [];
        leftPanel.innerHTML = `
            <div class="ranking-title">INFINITE TOP 10</div>
            <ul class="ranking-list">${sorted.map((s,i) => `<li><span>${i+1}. ${s.name}</span><span>${s.score}m</span></li>`).join('')}</ul>
        `;
    });

    rightPanel.innerHTML = `<div class="ranking-title">SPEEDRUN TOP 3</div>`;
    Object.keys(mapData).forEach(mId => {
        let mapContainer = document.createElement('div');
        mapContainer.id = `rank-${mId}`;
        rightPanel.appendChild(mapContainer);

        onValue(query(ref(db, `scores/speedrun/${mId}`), orderByChild('score'), limitToFirst(3)), (snapshot) => {
            let sorted = snapshot.val() ? Object.values(snapshot.val()).sort((a,b) => a.score - b.score) : [];
            let html = `<div class="map-title">[ ${mId.toUpperCase()} ]</div><ul class="ranking-list">`;
            if (sorted.length === 0) html += `<li style="color:#ffcc00; justify-content:center;">NO DATA</li>`;
            sorted.forEach((s,i) => html += `<li style="color:#00ffff;"><span>${i+1}. ${s.name}</span><span>${s.score}s</span></li>`);
            html += `</ul>`;
            document.getElementById(`rank-${mId}`).innerHTML = html;
        });
    });
}

function showResultRanking() {
    const leftPanel = document.getElementById('ranking-left');
    leftPanel.style.display = 'flex';

    const isSpeedrun = currentGameMode === 'speedrun';
    const path = isSpeedrun ? `scores/speedrun/${currentMapId}` : 'scores/infinite';
    const q = isSpeedrun ? query(ref(db, path), orderByChild('score'), limitToFirst(10)) 
                         : query(ref(db, path), orderByChild('score'), limitToLast(10));

    onValue(q, (snapshot) => {
        let sorted = snapshot.val() ? Object.values(snapshot.val()) : [];
        if(isSpeedrun) sorted.sort((a,b) => a.score - b.score);
        else sorted.sort((a,b) => b.score - a.score);
        
        const title = isSpeedrun ? `SPEEDRUN (${currentMapId.toUpperCase()})` : "INFINITE MODE";
        const unit = isSpeedrun ? 's' : 'm';
        leftPanel.innerHTML = `
            <div class="ranking-title">${title} TOP 10</div>
            <ul class="ranking-list">${sorted.map((s,i) => `<li><span>${i+1}. ${s.name}</span><span>${s.score}${unit}</span></li>`).join('')}</ul>
        `;
    });
}

showMainMenuRankings();

window.showMapSelection = () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('map-selection').style.display = 'flex';
};
window.backToMain = () => {
    document.getElementById('map-selection').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
};

window.startGame = (mode, mapId = 'map1') => {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('map-selection').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    document.getElementById('msg').style.display = 'none';
    document.getElementById('restart-guide').style.display = 'none';
    document.getElementById('ranking-left').style.display = 'none';
    document.getElementById('ranking-right').style.display = 'none';
    
    // UI 및 버튼 복구
    const nameInput = document.getElementById('playerName');
    const btn = document.getElementById('submitBtn');
    if (nameInput && btn) {
        nameInput.style.display = 'inline-block'; 
        nameInput.value = ''; 
        btn.innerText = "UPLOAD DATA";
        btn.disabled = false;
        btn.style.color = "#00ffff";
        btn.style.borderColor = "#00ffff";
    }
    
    currentGameMode = mode;
    currentMapId = mapId;
    isStarted = true; isGameOver = false; canReboot = false;
    player.alive = true; player.x = 400; player.y = 300; player.vx = 0; player.vy = 0;
    cameraX = 0; deadlineX = -600; lastSpawnX = 1200; particles = []; guideOpacity = 1; hook.active = false;
    
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;

    if (mode === 'speedrun') {
        obstacles = [...mapData[mapId].obstacles];
        document.getElementById('mode-label').innerText = `SPEEDRUN: ${mapId.toUpperCase()}`;
        document.getElementById('unit').innerText = "s";
        startTime = Date.now();
    } else {
        obstacles = [{ x: 0, y: canvas.height/2 + 100, w: 1200, h: 40, type: 'platform' }];
        document.getElementById('mode-label').innerText = "MODE: INFINITE";
        document.getElementById('unit').innerText = "m";
    }
    
    // 🌟 가속 버그 원천 차단: 엔진 시동은 무조건 한 번만!
    if (!isLoopRunning) {
        isLoopRunning = true;
        gameLoop();
    }
};

function gameLoop() { 
    requestAnimationFrame(gameLoop); 
    if (!isStarted) return;
    update(); 
    draw(); 
}

function update() {
    if (isGameOver) {
        particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; }); return;
    }
    if (guideOpacity > 0) guideOpacity -= 0.01;
    if (keys['Space'] && player.onGround) { player.vy = -16; player.onGround = false; playSound('sine', 400, 0.2, 0.2); }
    if (keys['KeyA']) player.vx -= 0.8; if (keys['KeyD']) player.vx += 0.8;
    player.vy += 0.6; player.vx *= 0.97;

    if (hook.active) {
        if (keys['ShiftLeft']) hook.length = Math.max(20, hook.length - 12);
        let dx = (player.x+11)-hook.x, dy = (player.y+11)-hook.y, dist = Math.sqrt(dx*dx+dy*dy);
        if (dist > hook.length) {
            let nx = dx/dist, ny = dy/dist;
            player.x = hook.x + nx*hook.length - 11; player.y = hook.y + ny*hook.length - 11;
            let dot = player.vx*nx + player.vy*ny; if (dot > 0) { player.vx -= dot*nx; player.vy -= dot*ny; }
        }
    }

    player.x += player.vx; checkCollisions(true);
    if(isGameOver) return; 
    
    player.onGround = false; // 🌟 공중 점프 방지 🌟

    player.y += player.vy; checkCollisions(false);
    if(isGameOver) return;
    
    cameraX += (player.x - cameraX - 400) * 0.15;

    if (windGain) {
        const speed = Math.sqrt(player.vx**2 + player.vy**2);
        windGain.gain.setTargetAtTime((!player.onGround && speed > 5) ? Math.min(0.2, speed * 0.015) : 0, audioCtx.currentTime, 0.1);
    }

    if (currentGameMode === 'infinite') {
        deadlineX += 6.5 + (Math.max(0, player.x - deadlineX) * 0.012);
        score = Math.floor(player.x / 10);
        if (player.x < deadlineX) finishGame(false);
        if (lastSpawnX < cameraX + canvas.width + 800) spawnChunk();
    } else {
        score = ((Date.now() - startTime) / 1000).toFixed(2);
    }
    document.getElementById('score').innerText = score;
    if (player.y > canvas.height + 600) finishGame(false);
}

function checkCollisions(ax) {
    for (let o of obstacles) {
        if (player.x < o.x + o.w && player.x + player.size > o.x && player.y < o.y + o.h && player.y + player.size > o.y) {
            if (o.type === 'goal') { finishGame(true); return; }
            if (o.type === 'danger') { finishGame(false); return; }
            if (ax) { player.x = player.vx > 0 ? o.x - player.size : o.x + o.w; player.vx = 0; }
            else { if (player.vy > 0) { player.y = o.y - player.size; player.onGround = true; } player.vy = 0; }
        }
    }
}

function spawnChunk() {
    const spacing = 350 + Math.random() * 300;
    const type = Math.random() > 0.3 ? 'platform' : 'danger';
    let w = type === 'danger' ? 60 : 200 + Math.random() * 200;
    let h = type === 'danger' ? 350 : 40;
    let y = type === 'danger' ? 0 : 250 + Math.random() * (canvas.height - 450);
    obstacles.push({ x: lastSpawnX + spacing, y: y, w: w, h: h, type: type });
    lastSpawnX += spacing;
}

function draw() {
    ctx.fillStyle = '#020205'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentGameMode === 'infinite') {
        ctx.save(); ctx.beginPath(); const wallX = deadlineX - cameraX;
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, wallX, canvas.height);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.4)'; ctx.fillRect(0, 0, wallX, canvas.height);
        ctx.shadowBlur = 25; ctx.shadowColor = '#ff0000'; ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 5;
        ctx.moveTo(wallX, 0); ctx.lineTo(wallX, canvas.height); ctx.stroke(); ctx.restore();
    }

    if (isStarted && !isGameOver && !hook.active) {
        const sx_world = player.x + 11, sy_world = player.y + 11;
        const ang = Math.atan2(mousePos.y - sy_world, (mousePos.x + cameraX) - sx_world);
        const tx_world = sx_world + Math.cos(ang) * hook.maxDist, ty_world = sy_world + Math.sin(ang) * hook.maxDist;

        let canHit = false, minT = 1.0;
        obstacles.forEach(o => {
            const dx = tx_world - sx_world, dy = ty_world - sy_world;
            const l = o.x, r = o.x + o.w, t = o.y, b = o.y + o.h;
            let t1 = (l-sx_world)/dx, t2 = (r-sx_world)/dx, t3 = (t-sy_world)/dy, t4 = (b-sy_world)/dy;
            let tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4)), tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
            if (tmax >= tmin && tmax > 0 && tmin < 1 && tmin < minT) { minT = tmin; canHit = true; }
        });

        ctx.save(); ctx.beginPath(); ctx.setLineDash([8, 6]);
        ctx.strokeStyle = canHit ? 'rgba(255, 255, 0, 0.6)' : 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 2.5;
        ctx.moveTo(sx_world - cameraX, sy_world); ctx.lineTo(tx_world - cameraX, ty_world); ctx.stroke(); ctx.restore();
    }

    obstacles.forEach(o => {
        ctx.save(); ctx.beginPath();
        if (o.type === 'goal') { ctx.shadowBlur = 20; ctx.shadowColor = '#ffff00'; ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'; ctx.strokeStyle = '#ffff00'; } 
        else { ctx.shadowBlur = 10; ctx.shadowColor = o.type === 'danger' ? '#ff3333' : '#00ff00'; ctx.fillStyle = o.type === 'danger' ? '#200000' : '#001a00'; ctx.strokeStyle = o.type === 'danger' ? '#ff3333' : '#00ff00'; }
        ctx.fillRect(o.x - cameraX, o.y, o.w, o.h); ctx.strokeRect(o.x - cameraX, o.y, o.w, o.h); ctx.restore();
    });

    if (player.alive) {
        ctx.save(); ctx.beginPath(); ctx.shadowBlur = 15; ctx.shadowColor = '#00ffff'; ctx.fillStyle = '#00ffff';
        ctx.fillRect(player.x - cameraX, player.y, player.size, player.size); ctx.restore();
    }
    
    particles.forEach(p => { ctx.fillStyle = `rgba(0, 255, 255, ${p.life})`; ctx.fillRect(p.x, p.y, p.size, p.size); });

    if (hook.active && player.alive) {
        ctx.save(); ctx.beginPath(); ctx.shadowBlur = 10; ctx.shadowColor = '#ffff00'; ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 3;
        ctx.moveTo(player.x+11-cameraX, player.y+11); ctx.lineTo(hook.x-cameraX, hook.y); ctx.stroke(); ctx.restore();
    }
}

function finishGame(isWin) {
    if (isGameOver) return;
    isGameOver = true; player.alive = false;
    
    if (windGain) windGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    playSound(isWin ? 'sine' : 'square', 150, 0.3, 0.3);
    for (let i=0; i<20; i++) particles.push({ x: player.x+11-cameraX, y: player.y+11, vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15, size: Math.random()*6+2, life: 1 });
    
    const title = document.getElementById('status-title');
    const scoreText = document.getElementById('finalScoreText');
    const inputArea = document.getElementById('nameInputArea');
    
    if (currentGameMode === 'infinite') {
        title.innerText = "SYSTEM CRASHED"; title.style.color = "#ff3333";
        scoreText.innerText = score + "m"; 
        inputArea.style.display = 'block';
    } else {
        scoreText.innerText = score + "s"; 
        if (isWin) { 
            title.innerText = "MISSION COMPLETE"; title.style.color = "#00ff00"; 
            inputArea.style.display = 'block'; 
        } else { 
            title.innerText = "MISSION FAILED"; title.style.color = "#ff3333"; 
            inputArea.style.display = 'none'; 
        }
    }

    document.getElementById('msg').style.display = 'block';
    showResultRanking(); 
    
    setTimeout(() => { 
        canReboot = true; 
        document.getElementById('rebootBtn').style.display = 'inline-block'; 
        document.getElementById('restart-guide').style.display = 'block';
    }, 1000);
}

// 🌟 오디오 기상 및 입력 핸들링
window.addEventListener('keydown', e => { 
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    keys[e.code] = true; 
    if (isGameOver && canReboot && e.code === 'Space') {
        canReboot = false; 
        window.startGame(currentGameMode, currentMapId); 
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousemove', e => { mousePos.x = e.clientX; mousePos.y = e.clientY; });
window.addEventListener('mousedown', e => {
    if (!audioCtx) initAudio(); 
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (!isStarted || isGameOver) return;
    const sx = player.x+11, sy = player.y+11, ang = Math.atan2(e.clientY - sy, (e.clientX + cameraX) - sx);
    const tx = sx + Math.cos(ang)*hook.maxDist, ty = sy + Math.sin(ang)*hook.maxDist;
    let hit = null, minT = 1.0;
    obstacles.forEach(o => {
        const dx = tx - sx, dy = ty - sy, l = o.x, r = o.x + o.w, t = o.y, b = o.y + o.h;
        let t1 = (l-sx)/dx, t2 = (r-sx)/dx, t3 = (t-sy)/dy, t4 = (b-sy)/dy;
        let tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4)), tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
        if (tmax >= tmin && tmax > 0 && tmin < 1 && tmin < minT) { minT = tmin; hit = { x: sx+dx*tmin, y: sy+dy*tmin }; }
    });
    if (hit) { hook.active = true; hook.x = hit.x; hook.y = hit.y; hook.length = Math.sqrt((hit.x-sx)**2 + (hit.y-sy)**2); playSound('square', 800, 0.05, 0.1); }
});
window.addEventListener('mouseup', () => hook.active = false);

// 🌟 Firebase 업로드 및 UI 처리
document.getElementById('submitBtn').onclick = () => {
    const nameInput = document.getElementById('playerName');
    const name = nameInput.value.trim().toUpperCase() || "ANON";
    const path = currentGameMode === 'infinite' ? 'scores/infinite' : `scores/speedrun/${currentMapId}`;
    const finalScore = parseFloat(score);
    const btn = document.getElementById('submitBtn');

    btn.innerText = "UPLOADING...";
    btn.disabled = true;

    set(push(ref(db, path)), { name: name, score: finalScore })
        .then(() => { 
            nameInput.style.display = 'none'; 
            btn.innerText = "UPLOAD COMPLETE!";
            btn.style.color = "#00ff00";
            btn.style.borderColor = "#00ff00";
        })
        .catch((error) => {
            console.error("Firebase Error: ", error);
            btn.innerText = "UPLOAD FAILED";
            btn.style.color = "#ff3333";
            btn.style.borderColor = "#ff3333";
        });
};
