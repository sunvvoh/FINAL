const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Image preloading
const images = {};
let imagesLoaded = 0;
let totalImages = 0;
const imageList = {
    feather: 'images/FEATHER.png',
    tissueBoxFull: 'images/TISSUE BOX (WITH TISSUE).png',
    tissueBoxGrabbed: 'images/TISSUE BOX (TISSUE GRABBED).png',
    tissueBoxEmpty: 'images/TISSUE BOX (TISSUE GONE).png',
    tissue: 'images/TISSUE.png',
    tissueDropped: 'images/TISSUE DROPPED.png',
    ball8Mystery: 'images/8BALL MYSTERY WEIGHT.png',
    ball8Weight1: 'images/8BALL WEIGHT 1.png',
    ball8Weight5: 'images/8BALL WEIGHT 5.png',
    ball8Weight10: 'images/8BALL WEIGHT 10.png',
    balanced: 'images/BALANCED.png',
    pan: 'images/PAN.png',
    anvil: 'images/ANVIL.png'
};

function preloadImages(callback) {
    totalImages = Object.keys(imageList).length;
    if (totalImages === 0) {
        callback();
        return;
    }

    for (const [key, src] of Object.entries(imageList)) {
        const img = new Image();
        img.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
                callback();
            }
        };
        img.onerror = () => {
            console.error(`Failed to load image: ${src}`);
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
                callback();
            }
        };
        img.src = src;
        images[key] = img;
    }
}

// Resize canvas
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// Game state
let gameState = 'start'; // 'start', 'playing', 'paused'
let currentLevel = 1;
let secretInput = '';
let devMode = false;

// Physics constants
const gravity = 800;
let groundY;

// Scale properties
const scale = {
    x: 0,
    baseY: 0,
    pillarHeight: 625,
    armLength: 375,
    angle: 0,
    targetAngle: 0,
    angleVelocity: 0,
    maxAngle: Math.PI / 4.5,
    chainLength: 200  // Length of chains hanging from beam to pans
};

// Pan properties
const panWidth = 300;
const panHeight = 38;

function updateScalePosition() {
    groundY = canvas.height - 50;
    scale.x = canvas.width / 2;
    scale.baseY = groundY;
}
updateScalePosition();
window.addEventListener('resize', updateScalePosition);

function getLeftPanY() {
    return scale.baseY - scale.pillarHeight + 50 + Math.sin(scale.angle) * scale.armLength + scale.chainLength;
}

function getRightPanY() {
    return scale.baseY - scale.pillarHeight + 50 - Math.sin(scale.angle) * scale.armLength + scale.chainLength;
}

function getLeftPanX() {
    const beamY = scale.baseY - scale.pillarHeight + 50;
    return scale.x + Math.cos(-scale.angle) * (-scale.armLength);
}

function getRightPanX() {
    const beamY = scale.baseY - scale.pillarHeight + 50;
    return scale.x + Math.cos(-scale.angle) * scale.armLength;
}

// Duplication station
const dupStation = {
    x: 150,
    y: 0,
    panWidth: 100,
    panHeight: 10,
    rimHeight: 15
};

function updateDupStationPosition() {
    dupStation.y = groundY;
}
updateDupStationPosition();
window.addEventListener('resize', updateDupStationPosition);

// Screen for duplicator
const dupScreen = {
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    active: false,
    input: '',
    objectOnPan: null
};

function updateDupScreenPosition() {
    dupScreen.x = dupStation.x + 80;
    dupScreen.y = dupStation.y - 120;
}
updateDupScreenPosition();
window.addEventListener('resize', updateDupScreenPosition);

// Balance detection
let balanceTimer = 0;
let isBalanced = false;
let levelComplete = false;
const balanceThreshold = 0.02;
const balanceTimeRequired = 1.0;

// Balanced text fade-in
let balancedFadeAlpha = 0;
const balancedFadeDuration = 2.0;

// Camera shake (for anvil impact)
let cameraShakeX = 0;
let cameraShakeY = 0;
let cameraShakeDecay = 0;

// Objects array
let objects = [];
let objectIdCounter = 0;

// Color palette for objects - Modernist muted/pastel tones
const objectColors = [
    '#2d2d2d', // Black
    '#5a8a8a', // Muted teal
    '#d4a574', // Sand/tan
    '#8b7d7d', // Gray-brown
    '#c97b63', // Muted coral
    '#7a9d9d', // Sage gray
    '#b8a89a', // Warm gray
    '#a5a5a5', // Light gray
    '#6b8e8e', // Dark teal
    '#d8c3a5', // Beige
    '#8e7e7e', // Mauve gray
    '#5d7a7a'  // Deep teal-gray
];

// Physics object class
class PhysicsObject {
    constructor(x, y, width, height, mass, color, isCircle = false, isFixed = false, type = 'normal') {
        this.id = objectIdCounter++;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.mass = mass;
        this.baseMass = mass; // Store original mass
        this.color = color;
        this.isCircle = isCircle;
        this.isFixed = isFixed;
        this.type = type; // 'normal', 'feather', 'tissuebox', 'magic8ball'
        this.vx = 0;
        this.vy = 0;
        this.grounded = false;
        this.onPan = null;
        this.isDragging = false;

        // Feather properties
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = 2 + Math.random();

        // Tissue box properties
        this.tissuesRemaining = 5;
        this.tissueBeingPulled = false;
        this.tissueGrabStartTime = 0;
        this.tissuePulled = false;

        // Magic 8 ball properties
        this.ball8State = 'mystery'; // 'mystery', 'weight1', 'weight5', 'weight10'
        this.shakeTime = 0; // Time spent shaking
        this.isShaking = false;
        this.lastWeightChangeTime = 0;

        // Pan positioning properties (for rotation)
        this.panOffsetX = 0; // Offset from pan center
        this.panOffsetY = 0;

        // Anvil properties
        this.anvilSlipSpeed = 0; // How fast it's slipping off cursor
        this.anvilFalling = false; // Is it falling from slip
        this.anvilImpactVelocity = 0; // Speed at impact for shake calculation
    }

    get radius() {
        return this.isCircle ? this.width / 2 : Math.min(this.width, this.height) / 2;
    }

    get bottom() {
        return this.isCircle ? this.y + this.radius : this.y + this.height;
    }

    get centerX() {
        return this.isCircle ? this.x : this.x + this.width / 2;
    }

    get centerY() {
        return this.isCircle ? this.y : this.y + this.height / 2;
    }

    containsPoint(px, py) {
        if (this.isCircle) {
            const dx = px - this.x;
            const dy = py - this.y;
            return Math.sqrt(dx * dx + dy * dy) <= this.radius;
        } else {
            return px >= this.x && px <= this.x + this.width &&
                   py >= this.y && py <= this.y + this.height;
        }
    }

    getPanInfo() {
        const leftPanX = getLeftPanX();
        const leftPanY = getLeftPanY();
        const rightPanX = getRightPanX();
        const rightPanY = getRightPanY();

        const cx = this.centerX;

        if (cx > leftPanX - panWidth/2 && cx < leftPanX + panWidth/2) {
            return {
                overPan: true,
                whichPan: 'left',
                panTop: leftPanY - panHeight/2,
                panBottom: leftPanY + panHeight/2
            };
        }

        if (cx > rightPanX - panWidth/2 && cx < rightPanX + panWidth/2) {
            return {
                overPan: true,
                whichPan: 'right',
                panTop: rightPanY - panHeight/2,
                panBottom: rightPanY + panHeight/2
            };
        }

        if (cx > dupStation.x - dupStation.panWidth/2 && cx < dupStation.x + dupStation.panWidth/2) {
            return {
                overPan: true,
                whichPan: 'dup',
                panTop: dupStation.y - dupStation.panHeight,
                panBottom: dupStation.y
            };
        }

        return { overPan: false, whichPan: null, panTop: 0, panBottom: 0 };
    }

    update(dt) {
        if (this.isDragging) return;

        const panInfo = this.getPanInfo();
        const objectBottom = this.bottom;

        if (this.grounded && this.onPan && panInfo.whichPan === this.onPan) {
            // Get current pan position
            let panX, panY;
            if (this.onPan === 'left') {
                panX = getLeftPanX();
                panY = getLeftPanY();
            } else if (this.onPan === 'right') {
                panX = getRightPanX();
                panY = getRightPanY();
            } else {
                panX = dupStation.x;
                panY = dupStation.y - dupStation.panHeight / 2;
            }

            // Update position based on pan center + stored horizontal offset
            // Pans stay level (don't rotate), so no rotation transform needed
            if (this.isCircle) {
                this.x = panX + this.panOffsetX;
                this.y = panY - panHeight/2 - this.radius;
            } else {
                this.x = panX + this.panOffsetX - this.width/2;
                this.y = panY - panHeight/2 - this.height;
            }

            this.vy = 0;
            this.vx *= 0.9;

            const newPanInfo = this.getPanInfo();
            if (!newPanInfo.overPan || newPanInfo.whichPan !== this.onPan) {
                if (!this.isFixed) {
                    this.grounded = false;
                    this.onPan = null;
                }
            }
            return;
        }

        // Apply gravity (slightly reduced for feathers and tissues)
        if (this.type === 'feather' || this.type === 'tissue' || this.type === 'tissueDropped') {
            this.vy += gravity * dt * 0.4; // Moderate fall speed
            // Add sway motion
            this.swayPhase += this.swaySpeed * dt;
            const swayForce = Math.sin(this.swayPhase) * 30;
            this.vx += swayForce * dt;
            // Wind resistance
            this.vx *= 0.92; // Some air resistance
            this.vy *= 0.96; // Slightly floaty
        } else {
            this.vy += gravity * dt;
            this.vx *= 0.99;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        const objectTop = this.isCircle ? this.y - this.radius : this.y;

        if (panInfo.overPan && this.vy >= 0) {
            if (objectTop < panInfo.panTop && objectBottom >= panInfo.panTop - 5) {
                if (this.isCircle) {
                    this.y = panInfo.panTop - this.radius;
                } else {
                    this.y = panInfo.panTop - this.height;
                }
                this.vy = 0;
                this.grounded = true;
                this.onPan = panInfo.whichPan;

                // Calculate and store offset from pan center
                let panX;
                if (panInfo.whichPan === 'left') {
                    panX = getLeftPanX();
                } else if (panInfo.whichPan === 'right') {
                    panX = getRightPanX();
                } else {
                    panX = dupStation.x;
                }

                // Store the offset from pan center
                if (this.isCircle) {
                    this.panOffsetX = this.x - panX;
                } else {
                    this.panOffsetX = (this.x + this.width/2) - panX;
                }
                this.panOffsetY = 0; // Objects sit on top, no Y offset needed

                return;
            }
        }

        this.checkPanBottomCollision();

        if (objectBottom >= groundY) {
            if (this.isCircle) {
                this.y = groundY - this.radius;
            } else {
                this.y = groundY - this.height;
            }

            // Anvil impact detection
            if (this.type === 'anvil' && this.vy > 200) {
                // Trigger camera shake based on fall speed
                const shakeIntensity = Math.min(this.vy / 500, 1.0);
                triggerCameraShake(shakeIntensity);

                // Make other grounded objects bounce
                for (const obj of objects) {
                    if (obj !== this && obj.grounded && obj.onPan === null) {
                        obj.vy = -200 * shakeIntensity; // Bounce up
                        obj.grounded = false;
                    }
                }
            }

            if (this.vy > 50) {
                this.vy = -this.vy * 0.3;
            } else {
                this.vy = 0;
                this.grounded = true;
            }
            this.onPan = null;
        } else if (!panInfo.overPan) {
            this.grounded = false;
            this.onPan = null;
        }

        if (this.isCircle) {
            if (this.x - this.radius < 0) this.x = this.radius;
            if (this.x + this.radius > canvas.width) this.x = canvas.width - this.radius;
        } else {
            if (this.x < 0) this.x = 0;
            if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
        }
    }

    checkPanBottomCollision() {
        const leftPanX = getLeftPanX();
        const leftPanY = getLeftPanY();
        const rightPanX = getRightPanX();
        const rightPanY = getRightPanY();

        const objectTop = this.isCircle ? this.y - this.radius : this.y;
        const cx = this.centerX;

        if (cx > leftPanX - panWidth/2 && cx < leftPanX + panWidth/2) {
            const panBottom = leftPanY + panHeight/2;
            if (objectTop < panBottom && objectTop > leftPanY - panHeight/2 && this.vy < 0) {
                if (this.isCircle) {
                    this.y = panBottom + this.radius;
                } else {
                    this.y = panBottom;
                }
                this.vy = Math.abs(this.vy) * 0.3;
            }
        }

        if (cx > rightPanX - panWidth/2 && cx < rightPanX + panWidth/2) {
            const panBottom = rightPanY + panHeight/2;
            if (objectTop < panBottom && objectTop > rightPanY - panHeight/2 && this.vy < 0) {
                if (this.isCircle) {
                    this.y = panBottom + this.radius;
                } else {
                    this.y = panBottom;
                }
                this.vy = Math.abs(this.vy) * 0.3;
            }
        }
    }

    draw() {
        // Draw special objects with images
        if (this.type === 'feather' && images.feather) {
            ctx.drawImage(images.feather, this.x, this.y, this.width, this.height);
            return;
        }

        if (this.type === 'tissue' && images.tissue) {
            ctx.drawImage(images.tissue, this.x, this.y, this.width, this.height);
            return;
        }

        if (this.type === 'tissueDropped' && images.tissueDropped) {
            ctx.drawImage(images.tissueDropped, this.x, this.y, this.width, this.height);
            return;
        }

        if (this.type === 'tissuebox') {
            let tissueImg;
            if (this.tissueBeingPulled) {
                // Show empty state while pulling tissue
                tissueImg = images.tissueBoxEmpty;
            } else if (this.tissuesRemaining > 0) {
                // Show full state if tissues remain
                tissueImg = images.tissueBoxFull;
            } else {
                // Show empty state if no tissues left
                tissueImg = images.tissueBoxEmpty;
            }
            if (tissueImg) {
                ctx.drawImage(tissueImg, this.x, this.y, this.width, this.height);
                return;
            }
        }

        if (this.type === 'magic8ball') {
            // Draw glow effect if active
            if (this.glowAlpha > 0) {
                ctx.shadowBlur = 40 * this.glowAlpha;
                ctx.shadowColor = this.glowColor;
            }

            let ballImg;
            switch (this.ball8State) {
                case 'weight1': ballImg = images.ball8Weight1; break;
                case 'weight5': ballImg = images.ball8Weight5; break;
                case 'weight10': ballImg = images.ball8Weight10; break;
                default: ballImg = images.ball8Mystery;
            }
            if (ballImg) {
                ctx.drawImage(ballImg, this.x, this.y, this.width, this.height);
            }

            // Reset shadow
            if (this.glowAlpha > 0) {
                ctx.shadowBlur = 0;
            }
            return;
        }

        if (this.type === 'anvil') {
            if (images.anvil) {
                ctx.drawImage(images.anvil, this.x, this.y, this.width, this.height);
                return;
            }

            // Fallback rendering
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            return;
        }

        // Draw normal objects with shapes and grainy texture
        ctx.fillStyle = this.color;
        if (this.isCircle) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();

            // Apply grainy texture to circle
            const boundingX = Math.floor(this.x - this.radius);
            const boundingY = Math.floor(this.y - this.radius);
            const boundingSize = Math.ceil(this.radius * 2);
            applyLocalGrainTexture(boundingX, boundingY, boundingSize, boundingSize, 0.12);

            // Subtle border
            ctx.strokeStyle = this.isFixed ? '#ffffff' : 'rgba(0,0,0,0.2)';
            ctx.lineWidth = this.isFixed ? 3 : 1.5;
            ctx.stroke();

            if (this.isFixed) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        } else {
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // Apply grainy texture to rectangle
            applyLocalGrainTexture(Math.floor(this.x), Math.floor(this.y),
                                   Math.ceil(this.width), Math.ceil(this.height), 0.12);

            // Subtle border
            ctx.strokeStyle = this.isFixed ? '#ffffff' : 'rgba(0,0,0,0.2)';
            ctx.lineWidth = this.isFixed ? 3 : 1.5;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            if (this.isFixed) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.strokeRect(this.x + this.width * 0.3, this.y + this.height * 0.3,
                               this.width * 0.4, this.height * 0.4);
            }
        }
    }
}

// Procedural level generation
function generateLevel(levelNum) {
    objects = [];
    objectIdCounter = 0;
    balanceTimer = 0;
    isBalanced = false;
    levelComplete = false;
    balancedFadeAlpha = 0;
    scale.angle = 0;
    scale.targetAngle = 0;
    scale.angleVelocity = 0;
    dupScreen.active = false;
    dupScreen.input = '';
    dupScreen.objectOnPan = null;

    // Progressive object introduction based on level
    let movableObjects = [];

    if (devMode) {
        // Dev mode: spawn all object types
        const numNormal = 3;
        const numFeathers = 2;
        const numTissueBoxes = 2;
        const numMagic8Balls = 2;
        const numAnvils = 1;

        for (let i = 0; i < numNormal; i++) {
            const weight = Math.floor(Math.random() * 10) + 1;
            movableObjects.push(createRandomObject(weight, false));
        }
        for (let i = 0; i < numFeathers; i++) {
            movableObjects.push(createFeather());
        }
        for (let i = 0; i < numTissueBoxes; i++) {
            movableObjects.push(createTissueBox());
        }
        for (let i = 0; i < numMagic8Balls; i++) {
            movableObjects.push(createMagic8Ball());
        }
        for (let i = 0; i < numAnvils; i++) {
            movableObjects.push(createAnvil());
        }
    } else {
        // Normal mode: mix of normal and special objects
        // Always include some normal objects for variety
        const numNormal = 2 + Math.floor(levelNum / 3);
        for (let i = 0; i < numNormal; i++) {
            const weight = Math.floor(Math.random() * 10) + 1;
            movableObjects.push(createRandomObject(weight, false));
        }

        // Progressive special object introduction
        const numFeathers = 1 + Math.floor(levelNum / 2);
        for (let i = 0; i < numFeathers; i++) {
            movableObjects.push(createFeather());
        }

        if (levelNum >= 4) {
            const numTissueBoxes = 1 + Math.floor((levelNum - 3) / 3);
            for (let i = 0; i < numTissueBoxes; i++) {
                movableObjects.push(createTissueBox());
            }
        }

        if (levelNum >= 7) {
            const numMagic8Balls = 1 + Math.floor((levelNum - 6) / 4);
            for (let i = 0; i < numMagic8Balls; i++) {
                movableObjects.push(createMagic8Ball());
            }
        }

        if (levelNum >= 10) {
            const numAnvils = 1;
            for (let i = 0; i < numAnvils; i++) {
                movableObjects.push(createAnvil());
            }
        }
    }

    // Randomize spawn locations spread across the ground
    const margin = 200; // Keep away from edges
    const spawnWidth = canvas.width - margin * 2;
    movableObjects.forEach((obj) => {
        // Random X position with margin
        const randomX = margin + Math.random() * spawnWidth;

        if (obj.isCircle) {
            obj.x = randomX;
            obj.y = groundY - obj.radius;
        } else {
            obj.x = randomX - obj.width/2;
            obj.y = groundY - obj.height;
        }
        obj.grounded = true;
        objects.push(obj);
    });
}

function createRandomObject(weight, isFixed) {
    const isCircle = Math.random() > 0.5;
    const size = 30 + weight * 8;
    const color = objectColors[Math.floor(Math.random() * objectColors.length)];

    return new PhysicsObject(0, 0, size, size, weight, color, isCircle, isFixed);
}

// Create special objects
function createFeather() {
    const size = 120; // 80 * 1.5
    return new PhysicsObject(0, 0, size, size, 1, '#f5f5f5', false, false, 'feather');
}

function createTissueBox() {
    const width = 150; // 100 * 1.5
    const height = 120; // 80 * 1.5
    const weight = 6; // Base weight with 5 tissues
    const box = new PhysicsObject(0, 0, width, height, weight, '#d8c3a5', false, false, 'tissuebox');
    box.tissuesRemaining = 5;
    return box;
}

function createMagic8Ball() {
    const size = 135; // 90 * 1.5
    const ball = new PhysicsObject(0, 0, size, size, 0, '#2d2d2d', true, false, 'magic8ball');
    ball.ball8State = 'mystery';
    ball.mass = 0; // Mystery has no weight
    ball.glowAlpha = 0; // For glow effect
    ball.glowColor = '#FFCF57';
    return ball;
}

function createTissue(x, y, dropped = false) {
    const width = 90; // 60 * 1.5
    const height = 90; // 60 * 1.5
    const tissue = new PhysicsObject(x, y, width, height, 1, '#f5f5f5', false, false, dropped ? 'tissueDropped' : 'tissue');
    return tissue;
}

function createAnvil() {
    const width = 180; // 120 * 1.5
    const height = 180; // 120 * 1.5
    const weight = 10; // Heavy but balanced
    const anvil = new PhysicsObject(0, 0, width, height, weight, '#3a3a3a', false, false, 'anvil');
    anvil.anvilSlipSpeed = 150; // Pixels per second it slips down
    return anvil;
}

// Restart function
function restart() {
    generateLevel(currentLevel);
}

// Dragging state
let draggedObject = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Tissue pulling state
let pulledTissue = null; // The floating tissue object being pulled

// Button definitions
const buttons = {
    play: { x: 0, y: 0, width: 200, height: 50, text: 'Play' },
    resume: { x: 0, y: 0, width: 200, height: 50, text: 'Resume' },
    quitToMenu: { x: 0, y: 0, width: 200, height: 50, text: 'Quit to Menu' },
    restart: { x: 0, y: 0, width: 120, height: 40, text: 'Restart (R)' }
};

function updateButtonPositions() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    buttons.play.x = centerX - 100;
    buttons.play.y = centerY - 25;

    buttons.resume.x = centerX - 100;
    buttons.resume.y = centerY - 40;
    buttons.quitToMenu.x = centerX - 100;
    buttons.quitToMenu.y = centerY + 30;

    buttons.restart.x = canvas.width - 140;
    buttons.restart.y = 20;
}
updateButtonPositions();
window.addEventListener('resize', updateButtonPositions);

function isPointInButton(px, py, button) {
    return px >= button.x && px <= button.x + button.width &&
           py >= button.y && py <= button.y + button.height;
}

// Mouse/touch handlers
function getEventPos(e) {
    if (e.touches) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function onPointerDown(e) {
    const pos = getEventPos(e);

    // Handle different game states
    if (gameState === 'start') {
        if (isPointInButton(pos.x, pos.y, buttons.play)) {
            gameState = 'playing';
            currentLevel = 1;
            generateLevel(currentLevel);
        }
        return;
    }

    if (gameState === 'paused') {
        if (isPointInButton(pos.x, pos.y, buttons.resume)) {
            gameState = 'playing';
            return;
        }
        if (isPointInButton(pos.x, pos.y, buttons.quitToMenu)) {
            gameState = 'start';
            return;
        }
        return;
    }

    if (gameState === 'playing') {
        // Check restart button
        if (isPointInButton(pos.x, pos.y, buttons.restart)) {
            restart();
            return;
        }

        if (levelComplete) return;

        // Duplicator removed
        // Check objects
        for (let i = objects.length - 1; i >= 0; i--) {
            if (objects[i].containsPoint(pos.x, pos.y) && !objects[i].isFixed) {
                draggedObject = objects[i];
                draggedObject.isDragging = true;
                draggedObject.grounded = false;
                draggedObject.onPan = null;

                // Tissue box: start tissue pull mode
                if (draggedObject.type === 'tissuebox' && draggedObject.tissuesRemaining > 0) {
                    draggedObject.tissueBeingPulled = true; // Show empty state immediately
                    draggedObject.isDragging = false; // Tissue box cannot be dragged
                    dragOffsetX = 0;
                    dragOffsetY = 0;
                } else {
                    // Normal dragging for other objects
                    if (draggedObject.isCircle) {
                        dragOffsetX = pos.x - draggedObject.x;
                        dragOffsetY = pos.y - draggedObject.y;
                    } else {
                        dragOffsetX = pos.x - draggedObject.x;
                        dragOffsetY = pos.y - draggedObject.y;
                    }
                }
                return;
            }
        }
    }
}

function onPointerMove(e) {
    if (!draggedObject) return;
    const pos = getEventPos(e);
    const oldX = draggedObject.x;
    const oldY = draggedObject.y;

    // Tissue box: spawn tissue on first drag movement
    if (draggedObject.type === 'tissuebox' && draggedObject.tissueBeingPulled && !pulledTissue) {
        // Spawn tissue at cursor
        pulledTissue = createTissue(pos.x - 45, pos.y - 45, false);
        pulledTissue.isDragging = true;

        // Update tissue box weight
        draggedObject.tissuesRemaining--;
        draggedObject.mass = Math.max(1, 6 - (5 - draggedObject.tissuesRemaining)); // 6kg -> 1kg
    }

    // Update pulled tissue position if exists
    if (pulledTissue) {
        pulledTissue.x = pos.x - 45;
        pulledTissue.y = pos.y - 45;
    } else if (draggedObject.isDragging) {
        // Normal object dragging (not tissue box in pull mode)
        draggedObject.x = pos.x - dragOffsetX;
        draggedObject.y = pos.y - dragOffsetY;

        // Anvil: slowly slips down off cursor
        if (draggedObject.type === 'anvil') {
            dragOffsetY -= draggedObject.anvilSlipSpeed * 0.016; // Slip down
            if (dragOffsetY < -draggedObject.height) {
                // Anvil has slipped off completely
                draggedObject.isDragging = false;
                draggedObject.anvilFalling = true;
            }
        }

        // Magic 8 ball shake detection (time-based)
        if (draggedObject.type === 'magic8ball') {
            const dx = draggedObject.x - oldX;
            const dy = draggedObject.y - oldY;
            const speed = Math.sqrt(dx * dx + dy * dy);

            // Consider it "shaking" if moving fast enough
            draggedObject.isShaking = speed > 5;
        }

        draggedObject.vx = 0;
        draggedObject.vy = 0;
    }
}

function onPointerUp(e) {
    if (draggedObject) {
        draggedObject.isDragging = false;

        // Reset tissue box state - return to "with tissue" if tissues remain
        if (draggedObject.type === 'tissuebox') {
            draggedObject.tissueBeingPulled = false;
        }

        draggedObject = null;
    }

    // Drop the pulled tissue
    if (pulledTissue) {
        pulledTissue.type = 'tissueDropped'; // Change to dropped version
        pulledTissue.isDragging = false;
        objects.push(pulledTissue);
        pulledTissue = null;
    }
}

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e); }, { passive: false });
canvas.addEventListener('touchend', onPointerUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu

// Keyboard handler
window.addEventListener('keydown', (e) => {
    // Secret dev mode during gameplay
    if (gameState === 'playing') {
        if (!dupScreen.active) {
            secretInput += e.key.toLowerCase();
            if (secretInput.length > 10) {
                secretInput = secretInput.slice(-10);
            }
            if (secretInput.includes('sunwoo')) {
                devMode = !devMode;
                secretInput = '';
            }
        }
    }

    if (e.key === 'Escape') {
        if (gameState === 'playing') {
            gameState = 'paused';
        } else if (gameState === 'paused') {
            gameState = 'playing';
        }
        return;
    }

    if (e.key.toLowerCase() === 'r' && gameState === 'playing') {
        restart();
        return;
    }

    // Duplicator removed
    // if (dupScreen.active) {
    //     if (e.key === 'Enter') {
    //         spawnDuplicates();
    //         e.preventDefault();
    //     } else if (e.key === 'Escape') {
    //         dupScreen.active = false;
    //         dupScreen.input = '';
    //     } else if (e.key === 'Backspace') {
    //         dupScreen.input = dupScreen.input.slice(0, -1);
    //         e.preventDefault();
    //     } else if (e.key.match(/^[0-9]$/) && dupScreen.input.length < 2) {
    //         dupScreen.input += e.key;
    //     }
    // }
});

function spawnDuplicates() {
    if (!dupScreen.objectOnPan || !dupScreen.input) return;

    const count = parseInt(dupScreen.input);
    if (isNaN(count) || count <= 0 || count > 10) return;

    const template = dupScreen.objectOnPan;

    for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetY = -100 - (i * 50);
        
        const newObj = new PhysicsObject(
            template.centerX + offsetX,
            offsetY,
            template.width,
            template.height,
            template.mass,
            template.color,
            template.isCircle,
            false
        );
        newObj.vy = 50;
        objects.push(newObj);
    }

    dupScreen.input = '';
}

function checkDuplicationPan() {
    dupScreen.objectOnPan = null;
    for (const obj of objects) {
        if (obj.onPan === 'dup' && obj.grounded && !obj.isFixed) {
            dupScreen.objectOnPan = obj;
            break;
        }
    }
}

// Update scale
function updateScale(dt) {
    let leftWeight = 0;
    let rightWeight = 0;
    let leftCount = 0;
    let rightCount = 0;

    for (const obj of objects) {
        if (obj.onPan === 'left' && obj.grounded) {
            leftWeight += obj.mass;
            leftCount++;
        } else if (obj.onPan === 'right' && obj.grounded) {
            rightWeight += obj.mass;
            rightCount++;
        }
    }

    let newTargetAngle = 0;
    if (leftWeight > 0 || rightWeight > 0) {
        if (rightWeight === 0 && leftWeight > 0) {
            newTargetAngle = scale.maxAngle;
        } else if (leftWeight === 0 && rightWeight > 0) {
            newTargetAngle = -scale.maxAngle;
        } else {
            const totalWeight = leftWeight + rightWeight;
            const weightDiff = leftWeight - rightWeight;
            newTargetAngle = (weightDiff / totalWeight) * scale.maxAngle;
        }
    }

    scale.targetAngle = newTargetAngle;

    const angleDiff = scale.targetAngle - scale.angle;
    
    // When balanced (equal weights), use a set animation to level out quickly
    if (scale.targetAngle === 0 && leftWeight > 0 && rightWeight > 0 && leftWeight === rightWeight) {
        // Set animation: move 2% of remaining distance per frame
        scale.angle *= 0.98;
        scale.angleVelocity = 0;
        
        // Snap to exactly 0 when very close
        if (Math.abs(scale.angle) < 0.01) {
            scale.angle = 0;
        }
    } else {
        // Normal physics for unbalanced
        const acceleration = angleDiff * 5.0;
        scale.angleVelocity += acceleration * dt;
        scale.angleVelocity *= 0.95;
        scale.angle += scale.angleVelocity * dt;

        if (Math.abs(angleDiff) < 0.05) {
            scale.angleVelocity *= 0.7;
        }

        if (Math.abs(angleDiff) < 0.01 && Math.abs(scale.angleVelocity) < 0.1) {
            scale.angle = scale.targetAngle;
            scale.angleVelocity = 0;
        }
    }

    // Check balance
    // Ensure objects on each side are different (prevent duplicating one object to win)
    let hasDifferentObjects = true;
    if (leftCount === 1 && rightCount === 1) {
        let leftObj = objects.find(o => o.onPan === 'left' && o.grounded);
        let rightObj = objects.find(o => o.onPan === 'right' && o.grounded);
        
        // If single objects on each side have same mass and color, they're duplicates
        if (leftObj && rightObj && 
            leftObj.mass === rightObj.mass && 
            leftObj.color === rightObj.color) {
            hasDifferentObjects = false;
        }
    }

    const isCurrentlyBalanced = Math.abs(scale.angle) < balanceThreshold && 
                                leftCount > 0 && rightCount > 0 && hasDifferentObjects;

    if (isCurrentlyBalanced && !levelComplete) {
        balanceTimer += dt;

        if (balanceTimer >= balanceTimeRequired) {
            levelComplete = true;
        }
    } else if (!levelComplete) {
        balanceTimer = 0;
        isBalanced = false;
    }

    // Update balanced text fade-in
    if (levelComplete && balancedFadeAlpha < 1.0) {
        balancedFadeAlpha += dt / balancedFadeDuration;
        if (balancedFadeAlpha > 1.0) balancedFadeAlpha = 1.0;
    }
}

// Drawing functions
function drawStartScreen() {
    // Background already cleared with cream color

    // Title
    ctx.fillStyle = '#2d2d2d';
    ctx.font = 'bold 48px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Balance Scale', canvas.width / 2, canvas.height / 2 - 100);

    ctx.font = '24px Poppins, sans-serif';
    ctx.fillStyle = '#6b6b6b';
    ctx.fillText('A Physics Puzzle Game', canvas.width / 2, canvas.height / 2 - 50);

    // Play button
    drawButton(buttons.play, '#5a8a8a');
}

function drawButton(btn, color, disabled = false) {
    ctx.fillStyle = disabled ? '#a5a5a5' : color;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.width, btn.height, 10);
    ctx.fill();

    ctx.fillStyle = disabled ? '#6b6b6b' : '#f5f5f5';
    ctx.font = '18px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(btn.text, btn.x + btn.width / 2, btn.y + btn.height / 2 + 6);
}

function drawPauseScreen() {
    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pause text
    ctx.fillStyle = '#f5f5f5';
    ctx.font = 'bold 36px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 100);

    drawButton(buttons.resume, '#5a8a8a');
    drawButton(buttons.quitToMenu, '#c97b63');
}

function drawScale() {
    const baseX = scale.x;
    const baseY = scale.baseY;
    const pillarTop = baseY - scale.pillarHeight;

    // Modernist scale colors - muted metallics
    const baseColor = '#5a4a3a';      // Dark brown
    const metalColor = '#6b6b6b';     // Medium gray
    const panColor = '#8b8b8b';       // Light gray

    // Base
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(baseX - 150, baseY);
    ctx.lineTo(baseX + 150, baseY);
    ctx.lineTo(baseX + 125, baseY - 50);
    ctx.lineTo(baseX - 125, baseY - 50);
    ctx.closePath();
    ctx.fill();

    // Pillar
    ctx.fillStyle = metalColor;
    ctx.fillRect(baseX - 25, pillarTop, 50, scale.pillarHeight - 50);

    // Top ornament
    ctx.beginPath();
    ctx.arc(baseX, pillarTop - 25, 37.5, 0, Math.PI * 2);
    ctx.fill();

    // Get pan positions (needed for chains)
    const leftX = getLeftPanX();
    const leftY = getLeftPanY();
    const rightX = getRightPanX();
    const rightY = getRightPanY();

    // Calculate beam end positions (where chains attach)
    const beamY = pillarTop + 25;
    const leftBeamX = baseX + Math.cos(-scale.angle) * (-scale.armLength) - Math.sin(-scale.angle) * 0;
    const leftBeamY = beamY + Math.sin(-scale.angle) * (-scale.armLength) + Math.cos(-scale.angle) * 0;
    const rightBeamX = baseX + Math.cos(-scale.angle) * scale.armLength - Math.sin(-scale.angle) * 0;
    const rightBeamY = beamY + Math.sin(-scale.angle) * scale.armLength + Math.cos(-scale.angle) * 0;

    // Draw chains BEHIND beam (1 chain per pan - hanging from beam end to pan center)
    ctx.strokeStyle = '#4a4a4a';      // Dark gray chains
    ctx.lineWidth = 4;

    // Left pan chain
    ctx.beginPath();
    ctx.moveTo(leftBeamX, leftBeamY);
    ctx.lineTo(leftX, leftY - panHeight/2);
    ctx.stroke();

    // Right pan chain
    ctx.beginPath();
    ctx.moveTo(rightBeamX, rightBeamY);
    ctx.lineTo(rightX, rightY - panHeight/2);
    ctx.stroke();

    // Beam (drawn OVER chains)
    ctx.save();
    ctx.translate(baseX, pillarTop + 25);
    ctx.rotate(-scale.angle);
    ctx.fillStyle = metalColor;
    ctx.fillRect(-scale.armLength - 50, -20, scale.armLength * 2 + 100, 40);
    ctx.restore();

    // Left pan
    if (images.pan) {
        ctx.drawImage(images.pan, leftX - panWidth/2, leftY - panHeight/2, panWidth, panHeight);
    } else {
        // Fallback if image not loaded
        ctx.fillStyle = panColor;
        ctx.fillRect(leftX - panWidth/2, leftY - panHeight/2, panWidth, panHeight);
    }

    // Right pan
    if (images.pan) {
        ctx.drawImage(images.pan, rightX - panWidth/2, rightY - panHeight/2, panWidth, panHeight);
    } else {
        // Fallback if image not loaded
        ctx.fillStyle = panColor;
        ctx.fillRect(rightX - panWidth/2, rightY - panHeight/2, panWidth, panHeight);
    }
}

function drawDuplicationStation() {
    ctx.fillStyle = '#555577';
    ctx.fillRect(dupStation.x - dupStation.panWidth/2, dupStation.y - dupStation.panHeight, 
                dupStation.panWidth, dupStation.panHeight);

    ctx.fillStyle = '#7777aa';
    ctx.fillRect(dupStation.x - dupStation.panWidth/2 - 5, dupStation.y - dupStation.panHeight - dupStation.rimHeight,
                5, dupStation.rimHeight);
    ctx.fillRect(dupStation.x + dupStation.panWidth/2, dupStation.y - dupStation.panHeight - dupStation.rimHeight,
                5, dupStation.rimHeight);

    ctx.fillStyle = '#333344';
    ctx.fillRect(dupStation.x + 70, dupStation.y - 100, 10, 100);

    ctx.fillStyle = '#222233';
    ctx.fillRect(dupScreen.x - dupScreen.width/2 - 5, dupScreen.y - dupScreen.height/2 - 5,
                dupScreen.width + 10, dupScreen.height + 10);

    ctx.fillStyle = dupScreen.active ? '#1a3a1a' : '#0a1a0a';
    ctx.fillRect(dupScreen.x - dupScreen.width/2, dupScreen.y - dupScreen.height/2,
                dupScreen.width, dupScreen.height);

    ctx.strokeStyle = dupScreen.active ? '#44ff44' : '#226622';
    ctx.lineWidth = 2;
    ctx.strokeRect(dupScreen.x - dupScreen.width/2, dupScreen.y - dupScreen.height/2,
                  dupScreen.width, dupScreen.height);

    ctx.fillStyle = dupScreen.active ? '#44ff44' : '#226622';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DUPLICATOR', dupScreen.x, dupScreen.y - dupScreen.height/2 + 15);

    ctx.font = '10px monospace';
    if (dupScreen.objectOnPan) {
        ctx.fillText('Object ready', dupScreen.x, dupScreen.y - 10);
    } else {
        ctx.fillStyle = '#664422';
        ctx.fillText('Place object', dupScreen.x, dupScreen.y - 10);
    }

    ctx.fillStyle = dupScreen.active ? '#0a2a0a' : '#050f05';
    ctx.fillRect(dupScreen.x - 40, dupScreen.y + 5, 80, 20);
    ctx.strokeStyle = dupScreen.active ? '#44ff44' : '#226622';
    ctx.lineWidth = 1;
    ctx.strokeRect(dupScreen.x - 40, dupScreen.y + 5, 80, 20);

    ctx.fillStyle = dupScreen.active ? '#44ff44' : '#226622';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    const displayText = dupScreen.input + (dupScreen.active ? '_' : '');
    ctx.fillText(displayText || (dupScreen.active ? '_' : 'Count'), dupScreen.x - 35, dupScreen.y + 19);

    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillText('Enter: Spawn (1-10)', dupScreen.x, dupScreen.y + dupScreen.height/2 - 5);
}

function drawGround() {
    // Modernist color scheme - cream/beige tones
    const bgColor = '#e8e4d9';        // Warm cream
    const groundColor = '#d4cfc3';     // Lighter beige
    const gridColor = '#c4bfb3';       // Subtle grid

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, groundY);

    ctx.fillStyle = groundColor;
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

    // Subtle grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
}

function drawHUD() {
    // Level indicator
    ctx.fillStyle = '#2d2d2d';
    ctx.font = '20px Poppins, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${currentLevel}`, 20, 40);

    // Balance indicator
    let leftCount = 0;
    let rightCount = 0;
    for (const obj of objects) {
        if (obj.onPan === 'left' && obj.grounded) leftCount++;
        if (obj.onPan === 'right' && obj.grounded) rightCount++;
    }

    // Check for duplicate objects
    let usingDuplicates = false;
    if (leftCount === 1 && rightCount === 1) {
        let leftObj = objects.find(o => o.onPan === 'left' && o.grounded);
        let rightObj = objects.find(o => o.onPan === 'right' && o.grounded);
        if (leftObj && rightObj &&
            leftObj.mass === rightObj.mass &&
            leftObj.color === rightObj.color) {
            usingDuplicates = true;
        }
    }

    let statusText = '';
    let statusColor = '#6b6b6b';
    let statusY = 90; // Default Y position

    if (levelComplete) {
        statusText = 'Click to continue';
        statusColor = '#a0b4be'; // Bluish grey like balanced text
        statusY = 40; // Align with level indicator
    } else if (leftCount === 0 || rightCount === 0) {
        statusText = 'Place objects on both sides';
    } else if (usingDuplicates) {
        statusText = 'Use different objects on each side';
        statusColor = '#c97b63';
    }
    // Removed: "Balance the scale" text and countdown

    if (statusText) {
        ctx.fillStyle = statusColor;
        ctx.font = '18px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(statusText, canvas.width / 2, statusY);
    }

    // Restart button
    drawButton(buttons.restart, '#8b7d7d');
}

function drawBalancedText() {
    if (balancedFadeAlpha <= 0) return;

    // Use the balanced image if available, otherwise draw text
    if (images.balanced) {
        const imgWidth = canvas.width;
        const imgHeight = images.balanced.height * (canvas.width / images.balanced.width);
        const y = canvas.height / 2 - imgHeight / 2;

        ctx.globalAlpha = balancedFadeAlpha;
        ctx.drawImage(images.balanced, 0, y, imgWidth, imgHeight);
        ctx.globalAlpha = 1.0;
    } else {
        // Fallback: draw text with gradient
        const centerY = canvas.height / 2;
        ctx.font = 'bold 120px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Create gradient for bottom fade
        const gradient = ctx.createLinearGradient(0, centerY - 60, 0, centerY + 60);
        gradient.addColorStop(0, `rgba(160, 180, 190, ${balancedFadeAlpha})`); // Light bluish grey
        gradient.addColorStop(0.5, `rgba(160, 180, 190, ${balancedFadeAlpha})`);
        gradient.addColorStop(1, `rgba(160, 180, 190, 0)`); // Fade to transparent at bottom

        ctx.fillStyle = gradient;
        ctx.fillText('BALANCED', canvas.width / 2, centerY);
        ctx.textBaseline = 'alphabetic';
    }
}

function drawDevPanel() {
    if (!devMode) return;

    // Panel background
    const panelX = canvas.width - 220;
    const panelY = 80;
    const panelWidth = 200;
    const panelHeight = Math.min(60 + objects.length * 25, 400);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
    ctx.fill();

    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ff00ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DEV MODE', panelX + 10, panelY + 20);

    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';
    ctx.fillText('Type "sunwoo" to toggle', panelX + 10, panelY + 35);

    // Calculate total weights
    let leftWeight = 0;
    let rightWeight = 0;
    for (const obj of objects) {
        if (obj.onPan === 'left' && obj.grounded) leftWeight += obj.mass;
        if (obj.onPan === 'right' && obj.grounded) rightWeight += obj.mass;
    }

    // Weight totals
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText(`Left: ${leftWeight}kg | Right: ${rightWeight}kg`, panelX + 10, panelY + 55);

    // Object list
    ctx.font = '11px monospace';
    objects.forEach((obj, i) => {
        const y = panelY + 75 + i * 20;
        if (y > panelY + panelHeight - 10) return;

        const shape = obj.isCircle ? '●' : '■';
        const fixed = obj.isFixed ? ' [FIXED]' : '';
        const location = obj.onPan ? ` (${obj.onPan})` : ' (ground)';
        
        ctx.fillStyle = obj.color;
        ctx.fillText(shape, panelX + 10, y);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${obj.mass}kg${fixed}${location}`, panelX + 25, y);
    });

    // Draw weight labels on objects
    objects.forEach(obj => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.roundRect(obj.centerX - 15, obj.centerY - 8, 30, 16, 4);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${obj.mass}`, obj.centerX, obj.centerY + 4);
    });
}

function drawGame() {
    // Apply camera shake if active
    if (cameraShakeDecay > 0) {
        ctx.save();
        ctx.translate(cameraShakeX, cameraShakeY);
    }

    drawGround();
    drawBalancedText(); // Draw balanced text in background
    drawScale();
    // drawDuplicationStation(); // Removed duplicator
    for (const obj of objects) {
        obj.draw();
    }
    // Draw pulled tissue on top
    if (pulledTissue) {
        pulledTissue.draw();
    }
    drawHUD();
    drawDevPanel();

    // Restore camera transform
    if (cameraShakeDecay > 0) {
        ctx.restore();
    }
}

function triggerCameraShake(intensity) {
    cameraShakeDecay = intensity;
    cameraShakeX = (Math.random() - 0.5) * intensity * 20;
    cameraShakeY = (Math.random() - 0.5) * intensity * 20;
}

// Handle level complete click
canvas.addEventListener('click', (e) => {
    if (gameState === 'playing' && levelComplete) {
        currentLevel++;
        generateLevel(currentLevel);
    }
});

// Grain texture function for modernist aesthetic
function applyGrainTexture(alpha = 0.03) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const noise = (Math.random() - 0.5) * 255 * alpha;
        pixels[i] += noise;     // R
        pixels[i + 1] += noise; // G
        pixels[i + 2] += noise; // B
    }

    ctx.putImageData(imageData, 0, 0);
}

// Apply grainy texture to a specific rectangular area
function applyLocalGrainTexture(x, y, width, height, alpha = 0.15) {
    const imageData = ctx.getImageData(x, y, width, height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const noise = (Math.random() - 0.5) * 255 * alpha;
        pixels[i] += noise;     // R
        pixels[i + 1] += noise; // G
        pixels[i + 2] += noise; // B
    }

    ctx.putImageData(imageData, x, y);
}

// Animation loop
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Clear with cream background
    ctx.fillStyle = '#e8e4d9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'start') {
        drawStartScreen();
        applyGrainTexture(0.04);
    } else if (gameState === 'playing') {
        // Update
        for (const obj of objects) {
            obj.update(dt);

            // Magic 8 ball shake time tracking
            if (obj.type === 'magic8ball' && obj.isShaking && obj.isDragging) {
                obj.shakeTime += dt;

                // After 2 seconds of shaking, change weight randomly
                if (obj.shakeTime >= 2.0 && performance.now() - obj.lastWeightChangeTime > 2000) {
                    const weights = ['mystery', 'weight1', 'weight5', 'weight10'];
                    // Pick random weight different from current
                    let newState = obj.ball8State;
                    while (newState === obj.ball8State) {
                        newState = weights[Math.floor(Math.random() * weights.length)];
                    }
                    obj.ball8State = newState;

                    // Update mass based on state
                    switch (obj.ball8State) {
                        case 'weight1': obj.mass = 1; break;
                        case 'weight5': obj.mass = 5; break;
                        case 'weight10': obj.mass = 10; break;
                        default: obj.mass = 0; // Mystery has no weight
                    }

                    obj.shakeTime = 0;
                    obj.lastWeightChangeTime = performance.now();
                    obj.glowAlpha = 1.0; // Trigger glow effect
                }
            } else if (obj.type === 'magic8ball' && !obj.isShaking) {
                // Reset shake time if not shaking
                obj.shakeTime = Math.max(0, obj.shakeTime - dt * 2); // Decay twice as fast
            }

            // Decay glow effect for magic 8 ball
            if (obj.type === 'magic8ball' && obj.glowAlpha > 0) {
                obj.glowAlpha = Math.max(0, obj.glowAlpha - dt * 2); // Fade over 0.5 seconds
            }
        }

        // Update camera shake
        if (cameraShakeDecay > 0) {
            cameraShakeDecay = Math.max(0, cameraShakeDecay - dt * 5); // Decay over time
            if (cameraShakeDecay > 0) {
                // Add random jitter
                cameraShakeX = (Math.random() - 0.5) * cameraShakeDecay * 20;
                cameraShakeY = (Math.random() - 0.5) * cameraShakeDecay * 20;
            } else {
                cameraShakeX = 0;
                cameraShakeY = 0;
            }
        }

        // checkDuplicationPan(); // Removed duplicator
        updateScale(dt);
        drawGame();
        applyGrainTexture(0.04);
    } else if (gameState === 'paused') {
        drawGame();
        drawPauseScreen();
        applyGrainTexture(0.04);
    }
}

// Initialize
updateButtonPositions();

// Start game after images load
preloadImages(() => {
    console.log('All images loaded!');
    animate();
});
