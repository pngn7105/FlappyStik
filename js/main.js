const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

let GRAVITY = 0.42;
let JUMP = 7.2;
let SPEED = 3.5;
let PIPE_GAP = 140;
let PIPE_WIDTH = 90;
let PIPE_SPAWN_RATE = 115;
let PIPE_VARIATION = 180;
const GROUND_HEIGHT = 80;

let POWERUP_TYPES = {};


let currentDifficulty = 'NORMAL';
let gameMode = 'ENDLESS'; 
let activeLevel = 1;
let currentWorld = 1;
let maxUnlockedLevel = parseInt(localStorage.getItem('flappyLevelProgress')) || 1;

let DIFFICULTIES = {};
let LEVEL_CONFIG = {};
let WORLD_THEME = {};

let powerupsForcedForLevel = false;

async function loadGameData() {
    try {
        const diffResponse = await fetch('config/difficulties.json');
        DIFFICULTIES = await diffResponse.json();

        const powerupResponse = await fetch('config/powerups.json');
        POWERUP_TYPES = await powerupResponse.json();

        const musicResponse = await fetch('config/music.json');
        const musicData = await musicResponse.json();
        audioController.loadConfig(musicData);

        
        const worldResponse = await fetch('config/worlds/world1.json');
        const worldData = await worldResponse.json();
        LEVEL_CONFIG = worldData.levels;
        WORLD_THEME = worldData.theme;
        
        initRendering(); 
        init();
        prewarmPowerupSprites();
    } catch (error) {
        console.error("Failed to load game configuration:", error);
        
        alert("Error loading game data. Please ensure you are running on a web server.");
    }
}

let gameLoopId;
let menuLoopId;

function setMode(mode) {
    
    const changed = gameMode !== mode;
    gameMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mode-${mode.toLowerCase()}`).classList.add('active');
    
    const endlessControls = document.getElementById('endless-controls');
    const levelsView = document.getElementById('levels-view');
    
    if (mode === 'ENDLESS') {
        endlessControls.style.display = 'flex';
        levelsView.style.display = 'none';
        powerupsForcedForLevel = false;
        updatePowerupsButton();
        
        
        if (changed) {
            setDifficulty('NORMAL');
        }
    } else {
        endlessControls.style.display = 'none';
        levelsView.style.display = 'flex';
        powerupsForcedForLevel = true;
        updatePowerupsButton();
        
        if (changed) {
            selectWorld(1); 
        }
    }
}

function selectWorld(world) {
    currentWorld = world;
    
    renderLevelGrid();
}

function renderLevelGrid() {
    const grid = document.getElementById('level-grid');
    grid.innerHTML = '';
    
    
    for (let i = 1; i <= 10; i++) {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        btn.innerText = i;
        
        if (i > maxUnlockedLevel) {
            btn.classList.add('locked');
            
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>';
        } else {
            btn.onclick = () => startLevel(i);
        }
        
        grid.appendChild(btn);
    }
}

function startLevel(lvl) {
    activeLevel = lvl;
    const config = LEVEL_CONFIG[lvl];
    setDifficulty(config.diff);
    powerupsForcedForLevel = true;
    init();
    startGame();
}

function setDifficulty(level) {
    let config = DIFFICULTIES[level];
    if (!config) {
        level = 'NORMAL';
        config = DIFFICULTIES['NORMAL'];
    }
    
    currentDifficulty = level;
    GRAVITY = config.gravity;
    JUMP = config.jump;
    SPEED = config.speed;
    PIPE_GAP = config.gap;
    PIPE_SPAWN_RATE = config.spawn;
    PIPE_VARIATION = config.variation;
    
    diffButtons.forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.level === level) btn.classList.add('active');
    });
    
    loadHighScore();
    updatePowerupsButton();

    if (gameState === 'GAMEOVER') {
        finalScoreEl.innerText = '0';
        scoreEl.innerText = '0';
    }
}

let frames = 0;
let score = 0;
let highScore = 0;
let gameState = 'START';
let canRestartAt = 0;
let pipes = [];
let pipePool = [];
let powerups = [];
let powerupPool = [];
let lastPowerupSpawn = 0;
let clouds = [];
let buildings = [];

const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const finalScoreEl = document.getElementById('final-score');
const startScreenEl = document.getElementById('start-screen');
const gameOverScreenEl = document.getElementById('game-over-screen');
const diffButtons = Array.from(document.querySelectorAll('.diff-btn'));

function getHighScoreKey() {
    const p = arePowerupsEnabled() ? 'powerups_on' : 'powerups_off';
    return `flappyHighScore_${currentDifficulty}_${p}`;
}

function loadHighScore() {
    highScore = localStorage.getItem(getHighScoreKey()) || 0;
    bestScoreEl.innerText = highScore;
}

let birdSprite;
let groundPattern;
let pipeGradient;
let skyGradient;
let skyCanvas;
let skyCtx;
let cityCanvas;
let cloudSprite;
let pipeLayer;
let pipeLayerCtx;
const CITY_WIDTH = 400;

function createPipeGradient(targetCtx) {
    const pGrad = targetCtx.createLinearGradient(0, 0, PIPE_WIDTH, 0);
    
    
    if (WORLD_THEME.pipeGradient) {
        pGrad.addColorStop(0, WORLD_THEME.pipeGradient[0]);
        pGrad.addColorStop(0.1, WORLD_THEME.pipeGradient[1]);
        pGrad.addColorStop(0.5, WORLD_THEME.pipeGradient[2]);
        pGrad.addColorStop(1, WORLD_THEME.pipeGradient[3]);
    } else {
        pGrad.addColorStop(0, '#558c22');
        pGrad.addColorStop(0.1, '#9ce659');
        pGrad.addColorStop(0.5, '#73bf2e');
        pGrad.addColorStop(1, '#558c22');
    }
    
    return pGrad;
}

function initRendering() {
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 60;
    bCanvas.height = 30;
    const bCtx = bCanvas.getContext('2d');
    
    const w = 40;
    const h = 10;
    const r = 5;
    const x = (60 - w) / 2;
    const y = (30 - h) / 2;
    
    bCtx.translate(x + w/2, y + h/2);
    const bx = -w/2;
    const by = -h/2;

    bCtx.fillStyle = '#8B4513'; 
    bCtx.strokeStyle = '#3e1e09';
    bCtx.lineWidth = 2;
    
    bCtx.beginPath();
    bCtx.moveTo(bx + r, by);
    bCtx.lineTo(bx + w - r, by);
    bCtx.quadraticCurveTo(bx + w, by, bx + w, by + r);
    bCtx.lineTo(bx + w, by + h - r);
    bCtx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
    bCtx.lineTo(bx + r, by + h);
    bCtx.quadraticCurveTo(bx, by + h, bx, by + h - r);
    bCtx.lineTo(bx, by + r);
    bCtx.quadraticCurveTo(bx, by, bx + r, by);
    bCtx.closePath();
    bCtx.fill();
    bCtx.stroke();

    bCtx.strokeStyle = '#A0522D';
    bCtx.lineWidth = 1;
    bCtx.beginPath();
    bCtx.moveTo(bx + 5, by + 3);
    bCtx.lineTo(bx + 25, by + 3);
    bCtx.moveTo(bx + 10, by + 7);
    bCtx.lineTo(bx + 35, by + 7);
    bCtx.stroke();

    bCtx.fillStyle = '#73bf2e';
    bCtx.strokeStyle = '#4a7c1e';
    bCtx.lineWidth = 1;
    bCtx.beginPath();
    bCtx.ellipse(10, -5, 8, 4, Math.PI / 4, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(6, -1);
    bCtx.lineTo(14, -9);
    bCtx.stroke();

    birdSprite = bCanvas;

    const gCanvas = document.createElement('canvas');
    gCanvas.width = 30;
    gCanvas.height = 25;
    const gCtx = gCanvas.getContext('2d');
    
    gCtx.fillStyle = '#9ce659';
    gCtx.beginPath();
    gCtx.moveTo(0, 0);
    gCtx.lineTo(15, 25);
    gCtx.lineTo(5, 25);
    gCtx.lineTo(-10, 0);
    gCtx.fill();
    gCtx.beginPath();
    gCtx.moveTo(30, 0);
    gCtx.lineTo(45, 25);
    gCtx.lineTo(35, 25);
    gCtx.lineTo(20, 0);
    gCtx.fill();
    
    groundPattern = ctx.createPattern(gCanvas, 'repeat');

    pipeGradient = createPipeGradient(ctx);

    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 120;
    cloudCanvas.height = 70;
    const cCtx = cloudCanvas.getContext('2d');
    cCtx.fillStyle = '#fff';
    cCtx.beginPath();
    cCtx.arc(30, 40, 20, 0, Math.PI * 2);
    cCtx.arc(60, 30, 25, 0, Math.PI * 2);
    cCtx.arc(85, 40, 18, 0, Math.PI * 2);
    cCtx.fill();
    cloudSprite = cloudCanvas;
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    
    if (WORLD_THEME.skyGradient) {
        skyGradient.addColorStop(0, WORLD_THEME.skyGradient[0]);
        skyGradient.addColorStop(1, WORLD_THEME.skyGradient[1]);
    } else {
        skyGradient.addColorStop(0, '#4facfe');
        skyGradient.addColorStop(1, '#00f2fe');
    }

    if (!skyCanvas) {
        skyCanvas = document.createElement('canvas');
        skyCtx = skyCanvas.getContext('2d');
    }
    skyCanvas.width = canvas.width;
    skyCanvas.height = canvas.height;
    skyCtx.fillStyle = skyGradient;
    skyCtx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

    initBackground();
    
    if (!pipeLayer) {
        pipeLayer = document.createElement('canvas');
        pipeLayerCtx = pipeLayer.getContext('2d');
    }
    pipeLayer.width = canvas.width;
    pipeLayer.height = canvas.height;
    pipeGradient = createPipeGradient(pipeLayerCtx);
    
    bird.x = Math.min(canvas.width * 0.2, 100);
}

function initBackground() {
    clouds = [];
    buildings = [];
    
    for(let i=0; i < canvas.width / 100; i++) {
        clouds.push({
            x: Math.random() * canvas.width,
            y: Math.random() * (canvas.height/2),
            w: 80 + Math.random() * 60,
            s: 0.3 + Math.random() * 0.5
        });
    }

    const buildingCount = Math.ceil(CITY_WIDTH / 50) + 2;
    for(let i=0; i < buildingCount; i++) {
        buildings.push({
            x: i * 50,
            w: 50,
            h: 80 + Math.random() * 150,
            type: Math.floor(Math.random() * 3)
        });
    }

    cityCanvas = document.createElement('canvas');
    cityCanvas.width = CITY_WIDTH;
    cityCanvas.height = canvas.height - GROUND_HEIGHT;
    const cityCtx = cityCanvas.getContext('2d');
    cityCtx.fillStyle = '#a3d8f4';
    for (let b of buildings) {
        cityCtx.fillRect(b.x, cityCanvas.height - b.h, b.w, b.h);
    }
}

const bird = {
    x: 100,
    y: 0,
    baseRadius: 14,
    radius: 14,
    velocity: 0,
    rotation: 0,
    hasShield: false,
    shrinkTimer: 0,
    
    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        let targetRotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
        this.rotation += (targetRotation - this.rotation) * 0.1;
        ctx.rotate(this.rotation);
        
        
        let scale = 1;
        if (this.shrinkTimer > 0) {
            scale = 0.6;
            
            if (this.shrinkTimer < 120 && Math.floor(frames / 10) % 2 === 0) {
                scale = 1; 
            }
        }
        ctx.scale(scale, scale);

        
        if (this.hasShield) {
            ctx.save();
            ctx.globalAlpha = 0.5 + frameShieldPulse * 0.2;
            ctx.fillStyle = '#4facfe';
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }

        ctx.drawImage(birdSprite, -30, -15);
        
        ctx.restore();
    },
    
    update: function() {
        this.velocity += GRAVITY;
        this.y += this.velocity;
        
        
        if (this.shrinkTimer > 0) {
            this.shrinkTimer--;
            this.radius = this.baseRadius * 0.6;
        } else {
            this.radius = this.baseRadius;
        }

        if (this.y + this.radius >= canvas.height - GROUND_HEIGHT) {
            this.y = canvas.height - GROUND_HEIGHT - this.radius;
            
            
            
            
            if (this.hasShield) {
                this.hasShield = false;
                this.velocity = -JUMP * 0.7; 
                audioController.playShieldBreak();
            } else {
                gameOver();
            }
        }
        
        if (this.y - this.radius <= 0) {
            this.y = this.radius;
            this.velocity = 0;
        }
    },
    
    flap: function() {
        this.velocity = -JUMP;
        audioController.playJump();
    },

    activateShield: function() {
        this.hasShield = true;
    },

    activateShrink: function(duration) {
        this.shrinkTimer = duration;
    }
};

const ground = {
    draw: function() {
        const topY = canvas.height - GROUND_HEIGHT;
        
        ctx.fillStyle = WORLD_THEME.groundColor || '#553c2a';
        ctx.fillRect(0, topY, canvas.width, GROUND_HEIGHT);
        
        ctx.fillStyle = WORLD_THEME.groundTopColor || '#73bf2e';
        ctx.fillRect(0, topY, canvas.width, 25);
        
        ctx.save();
        ctx.translate(-(frames * SPEED) % 30, topY);
        ctx.fillStyle = groundPattern;
        ctx.fillRect(0, 0, canvas.width + 30, 25);
        ctx.restore();
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo(canvas.width, topY);
        ctx.stroke();
    }
}

const PowerupSystem = {
    _registry: {},

    register: function(type, behavior) {
        this._registry[type] = behavior;
        for (const key of POWERUP_SPRITES.keys()) {
            if (key.startsWith(`${type}|`)) {
                POWERUP_SPRITES.delete(key);
            }
        }
    },

    get: function(type) {
        return this._registry[type];
    }
};

const POWERUP_SPRITES = new Map();

function getPowerupSprite(type, color) {
    const key = `${type}|${color}`;
    if (POWERUP_SPRITES.has(key)) return POWERUP_SPRITES.get(key);
    
    const size = 64;
    const center = size / 2;
    const radius = 15;
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = size;
    spriteCanvas.height = size;
    const sCtx = spriteCanvas.getContext('2d');
    
    
    sCtx.fillStyle = '#fff';
    sCtx.beginPath();
    sCtx.arc(center, center, radius, 0, Math.PI * 2);
    sCtx.fill();
    
    sCtx.lineWidth = 3;
    sCtx.strokeStyle = color;
    sCtx.stroke();

    
    sCtx.fillStyle = color;
    const behavior = PowerupSystem.get(type);
    sCtx.save();
    sCtx.translate(center, center);
    if (behavior && behavior.drawIcon) {
        behavior.drawIcon(sCtx, color);
    } else {
        sCtx.font = 'bold 16px "Fredoka One", sans-serif';
        sCtx.textAlign = 'center';
        sCtx.textBaseline = 'middle';
        sCtx.fillText(type ? type[0] : '?', 0, 1);
    }
    sCtx.restore();
    
    POWERUP_SPRITES.set(key, spriteCanvas);
    return spriteCanvas;
}

function prewarmPowerupSprites() {
    const types = Object.keys(POWERUP_TYPES);
    for (const type of types) {
        const config = POWERUP_TYPES[type];
        if (!config || !config.color) continue;
        getPowerupSprite(type, config.color);
    }
}

class Powerup {
    constructor(y = null) {
        this.reset(y);
    }

    reset(targetY = null) {
        this.active = true;
        this.x = canvas.width;
        this.radius = 15;
        
        if (targetY !== null) {
            this.y = targetY;
        } else {
            this.y = Math.random() * (canvas.height - GROUND_HEIGHT - 100) + 50;
        }
        
        let availableTypes = Object.keys(POWERUP_TYPES);
        if (gameMode === 'LEVELS') {
            availableTypes = LEVEL_CONFIG[activeLevel].powerups;
        }

        if (availableTypes.length === 0) {
            this.active = false; 
            return;
        }

        this.type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        this.config = POWERUP_TYPES[this.type];
        this.sprite = this.config ? getPowerupSprite(this.type, this.config.color) : null;
    }

    draw() {
        if (!this.active) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        
        
        const floatY = frameFloat * 5;
        ctx.translate(0, floatY);
        
        const sprite = this.sprite || (this.config ? getPowerupSprite(this.type, this.config.color) : null);
        if (sprite) {
            ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
        }
        
        ctx.restore();
    }

    update() {
        if (!this.active) return;
        this.x -= SPEED;
        
        
        const dx = this.x - bird.x;
        const dy = this.y - bird.y;
        const minDist = this.radius + bird.radius;
        if ((dx * dx + dy * dy) < (minDist * minDist)) {
            this.collect();
        }
        
        if (this.x + this.radius < 0) {
            this.active = false;
        }
    }

    collect() {
        this.active = false;
        audioController.playPowerup();
        
        const behavior = PowerupSystem.get(this.type);
        if (behavior && behavior.onCollect) {
            behavior.onCollect(bird, this.config);
        }
    }
}

class Pipe {
    constructor(prevHeight = null) {
        this.reset(prevHeight);
    }

    reset(prevHeight = null) {
        this.x = canvas.width;
        this.ghost = false;
        const minH = 60;
        const maxH = canvas.height - GROUND_HEIGHT - PIPE_GAP - minH;
        
        let targetH;
        if (prevHeight !== null) {
            const range = PIPE_VARIATION * 2;
            const variation = (Math.random() * range) - PIPE_VARIATION;
            targetH = prevHeight + variation;
            targetH = Math.max(minH, Math.min(maxH, targetH));
        } else {
            targetH = Math.random() * (maxH - minH) + minH;
        }

        this.topHeight = targetH;
        this.bottomY = this.topHeight + PIPE_GAP;
        this.w = PIPE_WIDTH;
        this.passed = false;
    }

    draw(targetCtx = ctx) {
        const drawCtx = targetCtx;
        drawCtx.save();
        const drawX = Math.round(this.x);
        drawCtx.translate(drawX, 0);
        
        drawCtx.fillStyle = pipeGradient;
        drawCtx.strokeStyle = '#000';
        drawCtx.lineWidth = 3;

        drawCtx.fillRect(0, 0, this.w, this.topHeight);
        drawCtx.strokeRect(0, -5, this.w, this.topHeight + 5);
        
        const bottomH = canvas.height - this.bottomY - GROUND_HEIGHT;
        drawCtx.fillRect(0, this.bottomY, this.w, bottomH);
        drawCtx.strokeRect(0, this.bottomY, this.w, bottomH);
        
        const capH = 30;
        const capOverhang = 6;
        drawCtx.fillRect(-capOverhang, this.topHeight - capH, this.w + capOverhang * 2, capH);
        drawCtx.strokeRect(-capOverhang, this.topHeight - capH, this.w + capOverhang * 2, capH);
        drawCtx.fillRect(-capOverhang, this.bottomY, this.w + capOverhang * 2, capH);
        drawCtx.strokeRect(-capOverhang, this.bottomY, this.w + capOverhang * 2, capH);

        drawCtx.restore();
    }

    update() {
        this.x -= SPEED;
        
        if (bird.x + bird.radius - 5 > this.x && bird.x - bird.radius + 5 < this.x + this.w) {
            if (bird.y - bird.radius + 5 < this.topHeight || bird.y + bird.radius - 5 > this.bottomY) {
                if (bird.hasShield) {
                    bird.hasShield = false;
                    audioController.playShieldBreak();
                    
                    
                    
                    
                    this.passed = true; 
                    
                    
                    
                    this.ghost = true; 
                } else if (!this.ghost) {
                    gameOver();
                }
            }
        }
        if (this.x + this.w < bird.x && !this.passed) {
            score++;
            audioController.playScore();
            scoreEl.innerText = score;
            this.passed = true;
            
            if (gameMode === 'LEVELS' && score >= LEVEL_CONFIG[activeLevel].pipes) {
                levelComplete();
            }
        }
    }
}

function levelComplete() {
    gameState = 'LEVEL_COMPLETE';
    audioController.stopMusic();
    audioController.playVictory(); 
    
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    
    
    if (activeLevel === maxUnlockedLevel && maxUnlockedLevel < 10) {
        maxUnlockedLevel++;
        localStorage.setItem('flappyLevelProgress', maxUnlockedLevel);
    }
    
    finalScoreEl.innerText = score;
    bestScoreEl.innerText = LEVEL_CONFIG[activeLevel].pipes; 
    
    const title = gameOverScreenEl.querySelector('.logo');
    title.innerHTML = `LEVEL ${activeLevel}<br><span>COMPLETE</span>`;
    
    const diffSelector = gameOverScreenEl.querySelector('.difficulty-selector');
    diffSelector.style.display = 'none'; 
    const pRow = gameOverScreenEl.querySelector('.powerups-row');
    if (pRow) pRow.style.display = 'none';

    const btns = gameOverScreenEl.querySelector('.game-over-buttons');
    if (activeLevel < 10) {
         btns.innerHTML = `
            <button id="go-home-btn" class="action-btn" onclick="init()">HOME</button>
            <button id="go-next-btn" class="action-btn" onclick="startLevel(${activeLevel + 1})">NEXT LEVEL</button>
         `;
    } else {
         title.innerHTML = `WORLD 1<br><span>CLEARED!</span>`;
         btns.innerHTML = `
            <button id="go-home-btn" class="action-btn" onclick="init()">HOME</button>
         `;
    }
    
    gameOverScreenEl.classList.add('active');
    scoreEl.style.display = 'none';
}

function drawBackground() {
    if (skyCanvas) {
        ctx.drawImage(skyCanvas, 0, 0);
    } else {
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const cityOffset = (frames * 0.2) % CITY_WIDTH;
    
    for (let r = -1; r < (canvas.width / CITY_WIDTH) + 2; r++) {
        const baseX = r * CITY_WIDTH - cityOffset;
        ctx.drawImage(cityCanvas, baseX, 0);
    }

    ctx.globalAlpha = 0.6;
    for (let c of clouds) {
        c.x -= c.s * 0.2;
        if (c.x + c.w < -100) c.x = canvas.width + 100;
        
        const cloudH = c.w * 0.6;
        ctx.drawImage(cloudSprite, c.x, c.y - cloudH * 0.4, c.w, cloudH);
    }
    ctx.globalAlpha = 1;
}

function renderPipesLayer() {
    if (!pipeLayerCtx) return;
    pipeLayerCtx.setTransform(1, 0, 0, 1, 0, 0);
    pipeLayerCtx.clearRect(0, 0, pipeLayer.width, pipeLayer.height);
    for (const pipe of pipes) pipe.draw(pipeLayerCtx);
}

function drawPipesAndPowerups() {
    renderPipesLayer();
    if (pipeLayer) {
        ctx.drawImage(pipeLayer, 0, 0);
    } else {
        for (const pipe of pipes) pipe.draw();
    }
    for (const p of powerups) p.draw();
}

function renderScene({ showPipes } = {}) {
    drawBackground();
    if (showPipes) {
        drawPipesAndPowerups();
    }
    ground.draw();
    bird.draw();
}

let lastTime = 0;
let accumulator = 0;
const STEP = 1000 / 60;
let frameFloat = 0;
let frameShieldPulse = 0;
let fpsEl;
let fpsLastTime = 0;
let fpsFrames = 0;

function updateFrameCaches() {
    frameFloat = Math.sin(frames * 0.1);
    frameShieldPulse = Math.sin(frames * 0.2);
}

function initFpsOverlay() {
    if (fpsEl) return;
    fpsEl = document.createElement('div');
    fpsEl.id = 'fps-overlay';
    fpsEl.textContent = 'FPS --';
    document.getElementById('ui-layer').appendChild(fpsEl);
}

function updateFps(timestamp) {
    if (!fpsEl) return;
    if (!fpsLastTime) fpsLastTime = timestamp;
    fpsFrames++;
    const elapsed = timestamp - fpsLastTime;
    if (elapsed >= 250) {
        const fps = (fpsFrames * 1000) / elapsed;
        fpsEl.textContent = `FPS ${fps.toFixed(1)}`;
        fpsLastTime = timestamp;
        fpsFrames = 0;
    }
}

function init() {
    resize();
    initFpsOverlay();
    audioController.startTitleMusic();
    bird.y = canvas.height / 2;
    bird.velocity = 0;
    bird.rotation = 0;
    bird.hasShield = false;
    bird.shrinkTimer = 0;
    pipes = [];
    pipePool = [];
    powerups = [];
    powerupPool = [];
    score = 0;
    frames = 0;
    lastPowerupSpawn = 0;
    
    loadHighScore();
    
    scoreEl.innerText = score;
    gameState = 'START';
    
    startScreenEl.classList.add('active');
    gameOverScreenEl.classList.remove('active');
    
    
    const title = gameOverScreenEl.querySelector('.logo');
    title.innerHTML = `GAME<br><span>OVER</span>`;
    const btns = gameOverScreenEl.querySelector('.game-over-buttons');
    btns.innerHTML = `
        <button id="go-home-btn" class="action-btn">HOME</button>
        <button id="go-restart-btn" class="action-btn">PLAY AGAIN</button>
    `;
    
    
    document.getElementById('go-home-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        init();
    });
    document.getElementById('go-restart-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (performance.now() < canRestartAt) return;
        if (gameMode === 'LEVELS') {
            startLevel(activeLevel);
        } else {
            init();
            startGame();
        }
    });

    scoreEl.style.display = 'none';
    
    
    if (gameMode === 'LEVELS') {
        renderLevelGrid(); 
        setMode('LEVELS');
    } else {
        setMode('ENDLESS');
    }
    
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    if (menuLoopId) cancelAnimationFrame(menuLoopId);
    
    lastTime = performance.now();
    accumulator = 0;
    fpsLastTime = lastTime;
    fpsFrames = 0;
    menuLoopId = requestAnimationFrame(menuLoop);
}

function startGame() {
    const queryString = window.location.search; 

    
    const params = new URLSearchParams(queryString);
    const custom = params.get("CM")
    if (custom == "true") {
        audioController.playMP3("https://incompetech.com/music/royalty-free/mp3-royaltyfree/Local%20Forecast%20-%20Elevator.mp3", true);
    } else {
        audioController.startMusic();
    }
    gameState = 'PLAYING';
    startScreenEl.classList.remove('active');
    gameOverScreenEl.classList.remove('active');
    scoreEl.style.display = 'block';
    
    if (menuLoopId) cancelAnimationFrame(menuLoopId);
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    
    lastTime = performance.now();
    accumulator = 0;
    gameLoopId = requestAnimationFrame(loop);
}

function gameOver() {
    audioController.stopMusic();
    audioController.playCrash();
    gameState = 'GAMEOVER';
    canRestartAt = performance.now() + 1000;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem(getHighScoreKey(), highScore);
    }
    document.dispatchEvent(new Event("statecheck"));
    finalScoreEl.innerText = score;
    bestScoreEl.innerText = highScore;
    
    const diffSelector = gameOverScreenEl.querySelector('.difficulty-selector');
    if (gameMode === 'LEVELS') {
        diffSelector.style.display = 'none';
        const pRow = gameOverScreenEl.querySelector('.powerups-row');
        if (pRow) pRow.style.display = 'none';
    } else {
        diffSelector.style.display = 'flex';
        const pRow = gameOverScreenEl.querySelector('.powerups-row');
        if (pRow) pRow.style.display = '';
    }

    gameOverScreenEl.classList.add('active');
    scoreEl.style.display = 'none';
    
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
}

function loop(timestamp) {
    if (gameState !== 'PLAYING') return;
    updateFps(timestamp);
    
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    accumulator += deltaTime;
    
    if (accumulator > 1000) accumulator = 1000;

    while (accumulator >= STEP) {
        bird.update();
        
        if (frames % PIPE_SPAWN_RATE === 0) {
            let prevH = pipes.length > 0 ? pipes[pipes.length - 1].topHeight : null;
            let newPipe;
            if (pipePool.length) {
                newPipe = pipePool.pop();
                newPipe.reset(prevH);
                pipes.push(newPipe);
            } else {
                newPipe = new Pipe(prevH);
                pipes.push(newPipe);
            }

            
            
            
            if (arePowerupsEnabled() && (frames - lastPowerupSpawn > PIPE_SPAWN_RATE * 8 || Math.random() < 0.25)) { 
                const targetY = newPipe.topHeight + (PIPE_GAP / 2); 
                let p;
                if (powerupPool.length) {
                    p = powerupPool.pop();
                    p.reset(targetY);
                } else {
                    p = new Powerup(targetY);
                }
                if (p.active) { 
                    p.x = newPipe.x + PIPE_WIDTH / 2;
                    powerups.push(p);
                    lastPowerupSpawn = frames;
                }
            }
        }
        
        for (let i = 0; i < pipes.length; i++) {
            pipes[i].update();
            if (pipes[i].x + pipes[i].w < 0) {
                pipePool.push(pipes[i]);
                pipes.splice(i, 1);
                i--;
            }
        }

        for (let i = 0; i < powerups.length; i++) {
            powerups[i].update();
            if (!powerups[i].active) {
                powerupPool.push(powerups[i]);
                powerups.splice(i, 1);
                i--;
            }
        }
        
        frames++;
        accumulator -= STEP;
    }
    
    updateFrameCaches();
    renderScene({ showPipes: true });
    
    gameLoopId = requestAnimationFrame(loop);
}

function menuLoop(timestamp) {
    if (gameState === 'PLAYING') return;
    updateFps(timestamp);
    
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    accumulator += deltaTime;

    if (accumulator > 1000) accumulator = 1000;

    while (accumulator >= STEP) {
        bird.y = (canvas.height / 2) + Math.sin(frames * 0.1) * 10;
        frames++;
        accumulator -= STEP;
    }

    updateFrameCaches();
    renderScene({ showPipes: false });
    
    menuLoopId = requestAnimationFrame(menuLoop);
}

function handleAction(e) {
    audioController.unlock();
    if (gameState === 'START' && !audioController.isPlaying) {
         audioController.startTitleMusic(); 
    }
    
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (e.type === 'touchstart' || e.code === 'Space') {
        e.preventDefault(); 
    }

    if (gameState === 'START') {
        startGame();
    } else if (gameState === 'PLAYING') {
        bird.flap();
    } else if (gameState === 'GAMEOVER') {
        if (performance.now() < canRestartAt) return;
        if (gameMode === 'LEVELS') {
            startLevel(activeLevel);
        } else {
            init();
            startGame();
        }
    }
}

const POWERUPS_KEY = 'flappyPowerupsEnabled';

function arePowerupsEnabled() {
    if (powerupsForcedForLevel) return true;
    return localStorage.getItem(POWERUPS_KEY) !== '0';
}

function setPowerupsEnabled(enabled) {
    localStorage.setItem(POWERUPS_KEY, enabled ? '1' : '0');
    updatePowerupsButton();
    loadHighScore();
    if (!enabled) {
        powerups = [];
        powerupPool = [];
    }

    if (gameMode === 'ENDLESS') {
        score = 0;
        if (scoreEl) scoreEl.innerText = '0';
        if (finalScoreEl) finalScoreEl.innerText = '0';
    }
}

function updatePowerupsButton() {
    const btns = Array.from(document.querySelectorAll('.powerups-btn'));
    if (!btns.length) return;
    const enabled = arePowerupsEnabled();
    for (const btn of btns) {
        btn.textContent = enabled ? 'Power-ups: ON' : 'Power-ups: OFF';
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        btn.title = 'Toggle Power-ups';
        btn.classList.toggle('disabled', !enabled);
    }
}

document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.powerups-btn') : null;
    if (btn) {
        e.stopPropagation();
        setPowerupsEnabled(!arePowerupsEnabled());
    }
});

window.setDifficulty = setDifficulty;
window.setMode = setMode;
window.startLevel = startLevel;
window.selectWorld = selectWorld;
window.init = init;
window.startGame = startGame;
window.PowerupSystem = PowerupSystem;

document.getElementById('game-wrapper').addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

document.getElementById('go-home-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    init();
});

document.getElementById('go-restart-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (performance.now() < canRestartAt) return;
    init();
    startGame();
});

const audioController = new AudioController();

window.addEventListener('resize', resize);
window.addEventListener('keydown', handleAction);

window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (e.target.closest('.difficulty-selector')) return;
    if (e.target.closest('#levels-view')) return;
    handleAction(e);
});

loadGameData();
