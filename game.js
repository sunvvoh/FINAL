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
    ball8Mystery: 'images/8BALL MYSTERY WEIGHT.png',
    ball8Weight1: 'images/8BALL WEIGHT 1.png',
    ball8Weight5: 'images/8BALL WEIGHT 5.png',
    ball8Weight10: 'images/8BALL WEIGHT 10.png'
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
    return scale.x - scale.armLength;
}

function getRightPanX() {
    return scale.x + scale.armLength;
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

        // Magic 8 ball properties
        this.ball8State = 'mystery'; // 'mystery', 'weight1', 'weight5', 'weight10'
        this.shakeIntensity = 0;
        this.lastShakeTime = 0;
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
            if (this.isCircle) {
                this.y = panInfo.panTop - this.radius;
            } else {
                this.y = panInfo.panTop - this.height;
            }
            this.vy = 0;
            this.vx *= 0.9;
            this.x += this.vx * dt;

            const newPanInfo = this.getPanInfo();
            if (!newPanInfo.overPan || newPanInfo.whichPan !== this.onPan) {
                if (!this.isFixed) {
                    this.grounded = false;
                    this.onPan = null;
                }
            }
            return;
        }

        // Apply gravity (reduced for feathers)
        if (this.type === 'feather') {
            this.vy += gravity * dt * 0.15; // Much slower fall
            // Add sway motion
            this.swayPhase += this.swaySpeed * dt;
            const swayForce = Math.sin(this.swayPhase) * 30;
            this.vx += swayForce * dt;
            // Wind resistance
            this.vx *= 0.85; // High air resistance
            this.vy *= 0.92; // Floaty
        } else {
            this.vy += gravity * dt;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.type !== 'feather') {
            this.vx *= 0.99;
        }

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

        if (this.type === 'tissuebox') {
            let tissueImg = images.tissueBoxFull;
            if (this.tissueBeingPulled && images.tissueBoxGrabbed) {
                tissueImg = images.tissueBoxGrabbed;
            } else if (this.tissuesRemaining === 0 && images.tissueBoxEmpty) {
                tissueImg = images.tissueBoxEmpty;
            }
            if (tissueImg) {
                ctx.drawImage(tissueImg, this.x, this.y, this.width, this.height);
                return;
            }
        }

        if (this.type === 'magic8ball') {
            let ballImg;
            switch (this.ball8State) {
                case 'weight1': ballImg = images.ball8Weight1; break;
                case 'weight5': ballImg = images.ball8Weight5; break;
                case 'weight10': ballImg = images.ball8Weight10; break;
                default: ballImg = images.ball8Mystery;
            }
            if (ballImg) {
                ctx.drawImage(ballImg, this.x, this.y, this.width, this.height);
                return;
            }
        }

        // Draw normal objects with shapes (fallback)
        ctx.fillStyle = this.color;
        if (this.isCircle) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = this.isFixed ? '#ffffff' : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = this.isFixed ? 3 : 2;
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
            ctx.strokeStyle = this.isFixed ? '#ffffff' : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = this.isFixed ? 3 : 2;
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
    scale.angle = 0;
    scale.targetAngle = 0;
    scale.angleVelocity = 0;
    dupScreen.active = false;
    dupScreen.input = '';
    dupScreen.objectOnPan = null;

    // Difficulty scaling
    const difficulty = Math.min(levelNum, 20);
    const useFixedObjects = levelNum >= 5;

    // Track used weights to avoid duplicates
    let usedWeights = new Set();

    // Generate unique weight that hasn't been used
    function getUniqueWeight(min, max) {
        let attempts = 0;
        let weight;
        do {
            weight = Math.floor(Math.random() * (max - min + 1)) + min;
            attempts++;
            if (attempts > 50) {
                for (let w = min; w <= max; w++) {
                    if (!usedWeights.has(w)) {
                        weight = w;
                        break;
                    }
                }
                break;
            }
        } while (usedWeights.has(weight));
        usedWeights.add(weight);
        return weight;
    }

    // Generate objects with unique weights that can balance
    let leftObjects = [];
    let rightObjects = [];
    let movableObjects = [];

    // Weight range increases with difficulty (1-15 at higher levels)
    const minWeight = 1;
    const maxWeight = Math.min(5 + difficulty, 15);

    // Movable object count: 3-5, more in later levels
    const numMovable = Math.min(3 + Math.floor(difficulty / 5), 5);

    if (useFixedObjects && Math.random() > 0.5) {
        // Fixed object puzzle
        const fixedWeight = getUniqueWeight(minWeight + 2, maxWeight);
        const fixedSide = Math.random() > 0.5 ? 'left' : 'right';
        
        const fixedObj = createRandomObject(fixedWeight, true);
        
        // Create movable objects - some that can sum to fixedWeight, plus extras
        let weights = [];
        let remaining = fixedWeight;
        
        // Create 2 objects that sum to fixedWeight
        const w1 = getUniqueWeight(1, Math.floor(remaining * 0.7));
        weights.push(w1);
        remaining -= w1;
        weights.push(remaining);
        usedWeights.add(remaining);
        
        // Add extra movable objects to reach numMovable
        for (let i = weights.length; i < numMovable; i++) {
            weights.push(getUniqueWeight(minWeight, maxWeight));
        }
        
        weights.forEach(w => {
            movableObjects.push(createRandomObject(w, false));
        });

        if (fixedSide === 'left') {
            leftObjects.push(fixedObj);
        } else {
            rightObjects.push(fixedObj);
        }
    } else {
        // No fixed objects - create objects that can balance
        let weights = [];
        
        for (let i = 0; i < numMovable; i++) {
            weights.push(getUniqueWeight(minWeight, maxWeight));
        }
        
        // Sort to help find valid combinations
        weights.sort((a, b) => b - a);
        
        weights.forEach(w => {
            movableObjects.push(createRandomObject(w, false));
        });
    }

    // Position fixed objects on pans
    let leftPanX = getLeftPanX();
    let rightPanX = getRightPanX();
    let leftPanY = scale.baseY - scale.pillarHeight + 50 - panHeight/2;
    let rightPanY = leftPanY;

    leftObjects.forEach((obj, i) => {
        if (obj.isCircle) {
            obj.x = leftPanX + (i - leftObjects.length/2) * 30;
            obj.y = leftPanY - obj.radius;
        } else {
            obj.x = leftPanX - obj.width/2 + (i - leftObjects.length/2) * 30;
            obj.y = leftPanY - obj.height;
        }
        obj.grounded = true;
        obj.onPan = 'left';
        objects.push(obj);
    });

    rightObjects.forEach((obj, i) => {
        if (obj.isCircle) {
            obj.x = rightPanX + (i - rightObjects.length/2) * 30;
            obj.y = rightPanY - obj.radius;
        } else {
            obj.x = rightPanX - obj.width/2 + (i - rightObjects.length/2) * 30;
            obj.y = rightPanY - obj.height;
        }
        obj.grounded = true;
        obj.onPan = 'right';
        objects.push(obj);
    });

    // Position movable objects on the ground
    const groundSpacing = canvas.width / (movableObjects.length + 1);
    movableObjects.forEach((obj, i) => {
        if (obj.isCircle) {
            obj.x = groundSpacing * (i + 1);
            obj.y = groundY - obj.radius;
        } else {
            obj.x = groundSpacing * (i + 1) - obj.width/2;
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
    const size = 80;
    return new PhysicsObject(0, 0, size, size, 0.1, '#f5f5f5', false, false, 'feather');
}

function createTissueBox() {
    const width = 100;
    const height = 80;
    const weight = 3; // Base weight with tissues
    return new PhysicsObject(0, 0, width, height, weight, '#d8c3a5', false, false, 'tissuebox');
}

function createMagic8Ball() {
    const size = 90;
    return new PhysicsObject(0, 0, size, size, 5, '#2d2d2d', true, false, 'magic8ball');
}

// Restart function
function restart() {
    generateLevel(currentLevel);
}

// Dragging state
let draggedObject = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

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

        // Check if clicking on screen
        if (pos.x >= dupScreen.x - dupScreen.width/2 && 
            pos.x <= dupScreen.x + dupScreen.width/2 &&
            pos.y >= dupScreen.y - dupScreen.height/2 && 
            pos.y <= dupScreen.y + dupScreen.height/2) {
            dupScreen.active = true;
            return;
        }

        // Check objects
        for (let i = objects.length - 1; i >= 0; i--) {
            if (objects[i].containsPoint(pos.x, pos.y) && !objects[i].isFixed) {
                draggedObject = objects[i];
                draggedObject.isDragging = true;
                draggedObject.grounded = false;
                draggedObject.onPan = null;
                if (draggedObject.isCircle) {
                    dragOffsetX = pos.x - draggedObject.x;
                    dragOffsetY = pos.y - draggedObject.y;
                } else {
                    dragOffsetX = pos.x - draggedObject.x;
                    dragOffsetY = pos.y - draggedObject.y;
                }
                dupScreen.active = false;
                return;
            }
        }

        dupScreen.active = false;
    }
}

function onPointerMove(e) {
    if (!draggedObject) return;
    const pos = getEventPos(e);
    draggedObject.x = pos.x - dragOffsetX;
    draggedObject.y = pos.y - dragOffsetY;
    draggedObject.vx = 0;
    draggedObject.vy = 0;
}

function onPointerUp(e) {
    if (draggedObject) {
        draggedObject.isDragging = false;
        draggedObject = null;
    }
}

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e); }, { passive: false });
canvas.addEventListener('touchend', onPointerUp);

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

    if (dupScreen.active) {
        if (e.key === 'Enter') {
            spawnDuplicates();
            e.preventDefault();
        } else if (e.key === 'Escape') {
            dupScreen.active = false;
            dupScreen.input = '';
        } else if (e.key === 'Backspace') {
            dupScreen.input = dupScreen.input.slice(0, -1);
            e.preventDefault();
        } else if (e.key.match(/^[0-9]$/) && dupScreen.input.length < 2) {
            dupScreen.input += e.key;
        }
    }
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
}

// Drawing functions
function drawStartScreen() {
    // Background already cleared with cream color

    // Title
    ctx.fillStyle = '#2d2d2d';
    ctx.font = 'bold 48px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Balance Scale', canvas.width / 2, canvas.height / 2 - 100);

    ctx.font = '24px Segoe UI, sans-serif';
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
    ctx.font = '18px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(btn.text, btn.x + btn.width / 2, btn.y + btn.height / 2 + 6);
}

function drawPauseScreen() {
    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pause text
    ctx.fillStyle = '#f5f5f5';
    ctx.font = 'bold 36px Segoe UI, sans-serif';
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

    // Beam
    ctx.save();
    ctx.translate(baseX, pillarTop + 25);
    ctx.rotate(-scale.angle);
    ctx.fillStyle = metalColor;
    ctx.fillRect(-scale.armLength - 50, -20, scale.armLength * 2 + 100, 40);
    ctx.restore();

    // Get pan positions
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

    // Draw chains (2 chains per pan - hanging from beam end to pan center)
    ctx.strokeStyle = '#4a4a4a';      // Dark gray chains
    ctx.lineWidth = 4;

    // Left pan chains - two parallel chains to center
    const chainSpacing = 30;
    ctx.beginPath();
    ctx.moveTo(leftBeamX - chainSpacing/2, leftBeamY);
    ctx.lineTo(leftX - chainSpacing/2, leftY - panHeight/2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(leftBeamX + chainSpacing/2, leftBeamY);
    ctx.lineTo(leftX + chainSpacing/2, leftY - panHeight/2);
    ctx.stroke();

    // Right pan chains - two parallel chains to center
    ctx.beginPath();
    ctx.moveTo(rightBeamX - chainSpacing/2, rightBeamY);
    ctx.lineTo(rightX - chainSpacing/2, rightY - panHeight/2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rightBeamX + chainSpacing/2, rightBeamY);
    ctx.lineTo(rightX + chainSpacing/2, rightY - panHeight/2);
    ctx.stroke();

    // Left pan
    ctx.fillStyle = panColor;
    ctx.fillRect(leftX - panWidth/2, leftY - panHeight/2, panWidth, panHeight);

    // Right pan
    ctx.fillRect(rightX - panWidth/2, rightY - panHeight/2, panWidth, panHeight);
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
    ctx.font = '20px Segoe UI, sans-serif';
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

    if (levelComplete) {
        statusText = '✓ Balanced! Click to continue';
        statusColor = '#5a8a8a';
    } else if (leftCount === 0 || rightCount === 0) {
        statusText = 'Place objects on both sides';
    } else if (usingDuplicates) {
        statusText = 'Use different objects on each side';
        statusColor = '#c97b63';
    } else if (Math.abs(scale.angle) < balanceThreshold) {
        statusText = `Balancing... ${Math.max(0, (balanceTimeRequired - balanceTimer)).toFixed(1)}s`;
        statusColor = '#5a8a8a';
    } else {
        statusText = 'Balance the scale';
    }

    ctx.fillStyle = statusColor;
    ctx.font = '18px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(statusText, canvas.width / 2, 90);

    // Restart button
    drawButton(buttons.restart, '#8b7d7d');
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
    drawGround();
    drawScale();
    drawDuplicationStation();
    for (const obj of objects) {
        obj.draw();
    }
    drawHUD();
    drawDevPanel();
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
        }
        checkDuplicationPan();
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
