// Phaser Game Configuration for Telegram
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container', // (optional) HTML element id where game is rendered
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
let player, block, cursors, score = 0, scoreText, gameOver = false;
let background, gameOverContainer;
let targetX = null;      // Mobile target x-position
const maxSpeed = 6;      // Maximum movement speed per frame

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

    // Create the player, centered horizontally near the bottom
    player = this.add.image(config.width / 2, config.height - 80, 'player')
        .setOrigin(0.5)
        .setDisplaySize(40, 40);

    // Create the falling block
    block = this.add.image(Phaser.Math.Between(40, config.width - 40), 0, 'block')
        .setOrigin(0.5)
        .setDisplaySize(40, 40);

    // Create score display
    scoreText = this.add.text(10, 10, 'Score: 0', { fontSize: '20px', fill: '#fff' });

    // Create Game Over UI (hidden initially)
    createGameOverUI(this);

    // Enable keyboard input
    cursors = this.input.keyboard.createCursorKeys();

    // Set up mobile touch events to record a target X-position
    this.input.on('pointerdown', (pointer) => { targetX = pointer.x; });
    this.input.on('pointermove', (pointer) => { targetX = pointer.x; });
    this.input.on('pointerup', () => { targetX = null; });
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
    // If a target position is set (from touch), move gradually toward it
    if (targetX !== null) {
        let delta = targetX - player.x;
        if (Math.abs(delta) > maxSpeed) {
            player.x += Math.sign(delta) * maxSpeed;
        } else {
            player.x = targetX;
        }
    }

    // Keep the player within the screen bounds
    player.x = Phaser.Math.Clamp(player.x, player.width / 2, config.width - player.width / 2);

    // Move the block downward at a fixed speed
    block.y += 2;

    // If the block goes off-screen, reset its position and update the score
    if (block.y > config.height) {
        block.y = 0;
        block.x = Phaser.Math.Between(40, config.width - 40);
        score++;
        scoreText.setText('Score: ' + score);
    }

    // Check for collision between player and block (using bounding box for now)
    if (checkPixelCollision(player, block)) {
        showGameOver();
    }
}

// For this example, we use bounding box collision (you can replace this with a more detailed pixel check if needed)
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

    // Add all UI elements to the container
    gameOverContainer.add([gameOverBg, gameOverText, finalScoreText, restartButton]);
}

// Display the Game Over UI and update final score text
function showGameOver() {
    gameOver = true;
    gameOverContainer.setVisible(true);
    // gameOverContainer.getAt(2) is the finalScoreText in our container
    gameOverContainer.getAt(2).setText('Score: ' + score);
}

// Restart the game by resetting variables and positions
function restartGame(scene) {
    gameOver = false;
    score = 0;
    scoreText.setText('Score: 0');
    player.x = config.width / 2;
    player.y = config.height - 80;
    block.x = Phaser.Math.Between(40, config.width - 40);
    block.y = 0;
    gameOverContainer.setVisible(false);
}
