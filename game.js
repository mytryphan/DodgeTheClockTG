// Phaser Game Configuration for Telegram
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container', // optional: the HTML element id where the game will render
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: { preload, create, update }
};

let game = new Phaser.Game(config);

// Global variables
let player, cursors, score = 0, scoreText, gameOver = false;
let background, gameOverContainer;
let targetX = null; // Mobile target x-position
const maxSpeed = 6; // Maximum player movement speed per frame
let blocks;         // Group for falling blocks
let maxBlocks = Phaser.Math.Between(1, 5); // Maximum number of blocks on screen at once

// Preload assets
function preload() {
    this.load.image('background', 'assets/background.png');
    this.load.image('player', 'assets/player.png');
    this.load.image('block', 'assets/block.png');
    this.load.image('gameOverBg', 'assets/game_over_bg.png');
    this.load.image('restartButton', 'assets/restart_button.png');
}

// Create game scene
function create() {
    // Add full-screen background
    background = this.add.image(0, 0, 'background')
        .setOrigin(0)
        .setDisplaySize(config.width, config.height);

    // Create the player (centered horizontally near the bottom)
    player = this.add.image(config.width / 2, config.height - 80, 'player')
        .setOrigin(0.5)
        .setDisplaySize(40, 40);

    // Create score display
    scoreText = this.add.text(10, 10, 'Score: 0', { fontSize: '20px', fill: '#fff' });

    // Create Game Over UI (hidden initially)
    createGameOverUI(this);

    // Enable keyboard input
    cursors = this.input.keyboard.createCursorKeys();

    // Set up mobile touch controls
    this.input.on('pointerdown', (pointer) => { targetX = pointer.x; });
    this.input.on('pointermove', (pointer) => { targetX = pointer.x; });
    this.input.on('pointerup', () => { targetX = null; });

    // Create a group for blocks
    blocks = this.add.group();

    // Timed event to spawn new blocks every 500ms if under the current max
    this.time.addEvent({
        delay: 500,
        callback: spawnBlock,
        callbackScope: this,
        loop: true
    });

    // Timed event to recalculate the maximum number of blocks (random 1 to 5) every 5 seconds
    this.time.addEvent({
        delay: 5000,
        callback: () => { maxBlocks = Phaser.Math.Between(1, 8); },
        loop: true
    });
}

// Update game logic
function update() {
    if (gameOver) return;

    // --- Keyboard Movement ---
    if (cursors.left.isDown) {
        player.x -= maxSpeed;
    } else if (cursors.right.isDown) {
        player.x += maxSpeed;
    }

    // --- Mobile Movement ---
    if (targetX !== null) {
        let delta = targetX - player.x;
        if (Math.abs(delta) > maxSpeed) {
            player.x += Math.sign(delta) * maxSpeed;
        } else {
            player.x = targetX;
        }
    }

    // Keep the player within screen bounds
    player.x = Phaser.Math.Clamp(player.x, player.width / 2, config.width - player.width / 2);

    // For each falling block in the group
    blocks.getChildren().forEach(function(block) {
        // Move the block downward by its own speed
        block.y += block.speed;

        // Check for collision with the player (using bounding box collision)
        if (checkPixelCollision(player, block)) {
            showGameOver();
        }

        // If the block goes off-screen, remove it and update score
        if (block.y > config.height) {
            block.destroy();
            score++;
            scoreText.setText('Score: ' + score);
        }
    });
}

// Spawn a new block if current count is below maxBlocks
function spawnBlock() {
    if (gameOver) return;
    if (blocks.getLength() < maxBlocks) {
        let newBlock = this.add.image(
            Phaser.Math.Between(40, config.width - 40),
            0,
            'block'
        ).setOrigin(0.5).setDisplaySize(40, 40);
        // Assign a random falling speed between 3 and 10
        newBlock.speed = Phaser.Math.Between(5, 20);
        blocks.add(newBlock);
    }
}

// Simple collision check using bounding boxes (placeholder for pixel-perfect collision)
function checkPixelCollision(spriteA, spriteB) {
    const boundsA = spriteA.getBounds();
    const boundsB = spriteB.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(boundsA, boundsB);
}

// Create Game Over UI container with background, text, and restart button
function createGameOverUI(scene) {
    gameOverContainer = scene.add.container(config.width / 2, config.height / 2);
    gameOverContainer.setDepth(100); // Ensure it appears on top
    gameOverContainer.setVisible(false);

    let gameOverBg = scene.add.image(0, 0, 'gameOverBg')
        .setOrigin(0.5)
        .setDisplaySize(300, 200);

    let gameOverText = scene.add.text(0, -50, 'Game Over!', {
        fontSize: '30px',
        fill: '#fff',
        align: 'center'
    }).setOrigin(0.5);

    let finalScoreText = scene.add.text(0, 0, 'Score: 0', {
        fontSize: '20px',
        fill: '#fff',
        align: 'center'
    }).setOrigin(0.5);

    let restartButton = scene.add.image(0, 50, 'restartButton')
        .setOrigin(0.5)
        .setInteractive();
    restartButton.on('pointerdown', () => { restartGame(scene); });

    gameOverContainer.add([gameOverBg, gameOverText, finalScoreText, restartButton]);
}

// Display the Game Over UI and update the final score text
function showGameOver() {
    gameOver = true;
    gameOverContainer.setVisible(true);
    // Update final score (index 2 in container is the final score text)
    gameOverContainer.getAt(2).setText('Score: ' + score);
}

// Restart the game by resetting variables and positions
function restartGame(scene) {
    gameOver = false;
    score = 0;
    scoreText.setText('Score: 0');
    player.x = config.width / 2;
    player.y = config.height - 80;
    // Remove all existing blocks
    blocks.clear(true, true);
    // Optionally, recalculate maxBlocks immediately
    maxBlocks = Phaser.Math.Between(1, 5);
    gameOverContainer.setVisible(false);
}
