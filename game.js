// -------------------------
// CONFIGURATION & GLOBAL VARIABLES
// -------------------------
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container', // ID of the HTML element where the game renders
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
  
  // Global variables for mode progression and selection
  let selectedMode;  // "normal" or "asian"
  let speedMultiplier = 1;         // For block speed progression
  let nextSpeedIncreaseScore;      // Score threshold for next speed increase
  let nextMaxBlocksIncreaseScore;  // Score threshold for next increase in max blocks
  
  // Global player speed variable
  let playerSpeed = 6; // Initial player speed (pixels per frame at 60 FPS)
  
  // Mode settings object
  const modeSettings = {
    normal: {
      initialMinBlocks: 1,
      initialMaxBlocks: 5,
      blockSpeedMin: 5,
      blockSpeedMax: 10,
      spawnDelay: 500, // ms
      speedIncreaseFactor: 1.05, // 5% block speed increase every threshold
      maxBlockIncrease: 1,       // Increase max blocks by 1 every threshold (applied every 20 scores)
      threshold: 10              // Every 10 scores for speed/player; for max blocks, threshold is 20 scores
    },
    asian: {
      initialMinBlocks: 2,
      initialMaxBlocks: 8,
      blockSpeedMin: 8,
      blockSpeedMax: 13,
      spawnDelay: 300, // ms
      speedIncreaseFactor: 1.10, // 10% block speed increase every threshold
      maxBlockIncrease: 2,       // Increase max blocks by 2 every threshold (applied every 10 scores)
      threshold: 10              // Every 10 scores for both
    }
  };
  
  let player, cursors, score = 0, scoreText, gameOver = false;
  let background, gameOverContainer, modeContainer;
  let targetX = null; // For mobile touch input
  const playerBaseSpeed = 6; // Base player movement speed (pixels per frame at 60 FPS)
  let blocks; // Group for falling blocks
  let maxBlocks; // Current maximum allowed blocks on screen
  let gameStarted = false; // Indicates if game has started (after mode selection)
  let spawnTimer = null; // Timer for block spawning
  
  // -------------------------
  // LEADERBOARD HELPER FUNCTIONS (LOCALSTORAGE DEMO)
  // -------------------------
  function getLeaderboard(mode) {
    let key = "leaderboard_" + mode;
    let board = localStorage.getItem(key);
    return board ? JSON.parse(board) : [];
  }
  
  function updateLeaderboard(mode, playerName, score) {
    let board = getLeaderboard(mode);
    board.push({ name: playerName, score: score });
    board.sort((a, b) => b.score - a.score);
    if (board.length > 10) board = board.slice(0, 10);
    localStorage.setItem("leaderboard_" + mode, JSON.stringify(board));
  }
  
  function formatLeaderboard(mode) {
    let board = getLeaderboard(mode);
    let text = "";
    for (let i = 0; i < board.length; i++) {
      text += `${i + 1}. ${board[i].name} - ${board[i].score}\n`;
    }
    return text || "No entries";
  }
  
  // -------------------------
  // PRELOAD FUNCTION
  // -------------------------
  function preload() {
    this.load.image('background', 'assets/background.png');
    this.load.image('player', 'assets/player.png');
    this.load.image('block', 'assets/block.png');
    this.load.image('gameOverBg', 'assets/game_over_bg.png');
    this.load.image('restartButton', 'assets/restart_button.png');
  }
  
  // -------------------------
  // CREATE FUNCTION
  // -------------------------
  function create() {
    // Add full-screen background
    background = this.add.image(0, 0, 'background')
      .setOrigin(0)
      .setDisplaySize(config.width, config.height);
      
    // Show mode selection UI
    createModeSelectionUI(this);
  }
  
  // -------------------------
  // UPDATE FUNCTION (with delta time normalization)
  // -------------------------
  function update(time, delta) {
    if (!gameStarted || gameOver) return;
    let dt = delta / 16.67; // Normalize movement to 60 FPS
    
    // --- Player Movement ---
    if (cursors.left.isDown) {
      player.x -= playerSpeed * dt;
    } else if (cursors.right.isDown) {
      player.x += playerSpeed * dt;
    }
    if (targetX !== null) {
      let diff = targetX - player.x;
      if (Math.abs(diff) > playerSpeed) {
        player.x += Math.sign(diff) * playerSpeed * dt;
      } else {
        player.x = targetX;
      }
    }
    player.x = Phaser.Math.Clamp(player.x, player.width / 2, config.width - player.width / 2);
    
    // --- Blocks Movement & Collision ---
    blocks.getChildren().forEach(function(block) {
      block.speed = block.baseSpeed * speedMultiplier;
      block.y += block.speed * dt;
      if (checkCollision(player, block)) {
        showGameOver();
      }
      if (block.y > config.height) {
        block.destroy();
        score++;
        scoreText.setText('Score: ' + score);
      }
    });
    
    // --- Progression ---
    let threshold = modeSettings[selectedMode].threshold;
    if (score >= nextSpeedIncreaseScore) {
      speedMultiplier *= modeSettings[selectedMode].speedIncreaseFactor;
      playerSpeed *= 1.10; // Increase player's speed by 10%
      nextSpeedIncreaseScore += threshold;
    }
    if (selectedMode === "normal") {
      if (score >= nextMaxBlocksIncreaseScore) {
        maxBlocks = Phaser.Math.Between(
          modeSettings.normal.initialMinBlocks,
          modeSettings.normal.initialMaxBlocks + Math.floor(score / 20) * modeSettings.normal.maxBlockIncrease
        );
        nextMaxBlocksIncreaseScore += threshold * 2;
      }
    } else if (selectedMode === "asian") {
      if (score >= nextMaxBlocksIncreaseScore) {
        maxBlocks = Phaser.Math.Between(
          modeSettings.asian.initialMinBlocks,
          modeSettings.asian.initialMaxBlocks + Math.floor(score / threshold) * modeSettings.asian.maxBlockIncrease
        );
        nextMaxBlocksIncreaseScore += threshold;
      }
    }
  }
  
  // -------------------------
  // MODE SELECTION UI & GAME START FUNCTIONS
  // -------------------------
  function createModeSelectionUI(scene) {
    // Ask for player's name if not already set in localStorage.
    let playerName = localStorage.getItem("playerName");
    if (!playerName) {
      playerName = prompt("Please enter your name:");
      if (!playerName) { playerName = "Guest"; }
      localStorage.setItem("playerName", playerName);
    }
    
    // Remove any existing UI containers.
    if (gameOverContainer) {
      gameOverContainer.destroy();
      gameOverContainer = null;
    }
    if (modeContainer) {
      modeContainer.destroy();
      modeContainer = null;
    }
    
    let personalHighscoreNormal = localStorage.getItem('highscore_normal') || 0;
    let personalHighscoreAsian = localStorage.getItem('highscore_asian') || 0;
    
    // Create a container for the mode selection UI, positioned at one-fourth of the screen height.
    modeContainer = scene.add.container(config.width / 2, config.height / 4);
    modeContainer.setDepth(100);
    
    let playerNameText = scene.add.text(0, -120, `Hello, ${playerName}!`, {
      fontSize: '24px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let modeTitleText = scene.add.text(0, -80, "Select Game Mode", {
      fontSize: '28px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let normalButton = scene.add.text(0, -20, "Normal Mode", {
      fontSize: '28px',
      fill: '#fff',
      backgroundColor: '#000',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setInteractive();
    
    let asianButton = scene.add.text(0, 30, "Asian Normal Mode", {
      fontSize: '28px',
      fill: '#fff',
      backgroundColor: '#000',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setInteractive();
    
    // Personal highscore text for each mode.
    let personalHighscoreText = scene.add.text(0, 80, 
      `Your Highscore - Normal: ${personalHighscoreNormal}   Asian: ${personalHighscoreAsian}`, {
      fontSize: '20px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    // Leaderboard columns, with headers shortened.
    let leaderboardNormalText = scene.add.text(-config.width / 4, 130, 
      "Normal:\n" + formatLeaderboard("normal"), {
      fontSize: '16px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    let leaderboardAsianText = scene.add.text(config.width / 4, 130, 
      "Asian:\n" + formatLeaderboard("asian"), {
      fontSize: '16px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    // "Change Name" button at the bottom.
    let changeNameButton = scene.add.text(0, 200, "Change Name", {
      fontSize: '20px',
      fill: '#ff0',
      backgroundColor: '#000',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setInteractive();
    
    changeNameButton.on('pointerdown', () => {
      let newName = prompt("Enter your new name:");
      if (newName) {
        localStorage.setItem("playerName", newName);
        playerNameText.setText(`Hello, ${newName}!`);
      }
    });
    
    normalButton.on('pointerdown', function() {
      setMode("normal");
      modeContainer.destroy();
      startGame(scene);
    });
    asianButton.on('pointerdown', function() {
      setMode("asian");
      modeContainer.destroy();
      startGame(scene);
    });
    
    modeContainer.add([playerNameText, modeTitleText, normalButton, asianButton, personalHighscoreText, leaderboardNormalText, leaderboardAsianText, changeNameButton]);
  }
  
  function setMode(mode) {
    selectedMode = mode;
    speedMultiplier = 1;
    playerSpeed = 6; // Reset player's speed
    nextSpeedIncreaseScore = modeSettings[mode].threshold;
    nextMaxBlocksIncreaseScore = (mode === "normal") ? modeSettings[mode].threshold * 2 : modeSettings[mode].threshold;
  }
  
  function startGame(scene) {
    gameStarted = true;
    // Destroy mode selection UI if it exists.
    if (modeContainer) {
      modeContainer.destroy();
      modeContainer = null;
    }
    
    // Create player.
    player = scene.add.image(config.width / 2, config.height - 80, 'player')
      .setOrigin(0.5)
      .setDisplaySize(40, 40);
    
    // Create score display.
    score = 0;
    scoreText = scene.add.text(10, 10, 'Score: 0', { fontSize: '20px', fill: '#fff' });
    
    // Set up input controls.
    cursors = scene.input.keyboard.createCursorKeys();
    scene.input.on('pointerdown', (pointer) => { targetX = pointer.x; });
    scene.input.on('pointermove', (pointer) => { targetX = pointer.x; });
    scene.input.on('pointerup', () => { targetX = null; });
    
    // Create group for blocks.
    blocks = scene.add.group();
    
    // Set initial maxBlocks based on mode settings.
    if (selectedMode === "normal") {
      maxBlocks = Phaser.Math.Between(modeSettings.normal.initialMinBlocks, modeSettings.normal.initialMaxBlocks);
    } else if (selectedMode === "asian") {
      maxBlocks = Phaser.Math.Between(modeSettings.asian.initialMinBlocks, modeSettings.asian.initialMaxBlocks);
    }
    
    // Start block spawning timer.
    spawnTimer = scene.time.addEvent({
      delay: modeSettings[selectedMode].spawnDelay,
      callback: spawnBlock,
      callbackScope: scene,
      loop: true
    });
    
    // (Re)create Game Over UI if needed.
    createGameOverUI(scene);
  }
  
  // -------------------------
  // BLOCK SPAWNING & COLLISION
  // -------------------------
  function spawnBlock() {
    if (gameOver) return;
    if (blocks.getLength() < maxBlocks) {
      let newBlock = this.add.image(
        Phaser.Math.Between(40, config.width - 40),
        0,
        'block'
      ).setOrigin(0.5).setDisplaySize(40, 40);
      if (selectedMode === "normal") {
        newBlock.baseSpeed = Phaser.Math.Between(modeSettings.normal.blockSpeedMin, modeSettings.normal.blockSpeedMax);
      } else if (selectedMode === "asian") {
        newBlock.baseSpeed = Phaser.Math.Between(modeSettings.asian.blockSpeedMin, modeSettings.asian.blockSpeedMax);
      }
      newBlock.speed = newBlock.baseSpeed * speedMultiplier;
      blocks.add(newBlock);
    }
  }
  
  function checkCollision(spriteA, spriteB) {
    const boundsA = spriteA.getBounds();
    const boundsB = spriteB.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(boundsA, boundsB);
  }
  
  // -------------------------
  // GAME OVER & RESTART UI
  // -------------------------
  function createGameOverUI(scene) {
    if (gameOverContainer) return;
    gameOverContainer = scene.add.container(config.width / 2, config.height / 2);
    gameOverContainer.setDepth(100);
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
  
  function showGameOver() {
    gameOver = true;
    gameOverContainer.setVisible(true);
    gameOverContainer.getAt(2).setText('Score: ' + score);
    
    // Update personal highscore and global leaderboard.
    let playerName = localStorage.getItem("playerName") || "Guest";
    if (selectedMode === "normal") {
      let hs = localStorage.getItem('highscore_normal') || 0;
      if (score > hs) {
        localStorage.setItem('highscore_normal', score);
      }
      updateLeaderboard("normal", playerName, score);
    } else if (selectedMode === "asian") {
      let hs = localStorage.getItem('highscore_asian') || 0;
      if (score > hs) {
        localStorage.setItem('highscore_asian', score);
      }
      updateLeaderboard("asian", playerName, score);
    }
  }
  
  function restartGame(scene) {
    if (spawnTimer) {
      spawnTimer.remove();
      spawnTimer = null;
    }
    
    gameOver = false;
    gameStarted = false;
    score = 0;
    speedMultiplier = 1;
    playerSpeed = 6;
    
    if (player) { player.destroy(); player = null; }
    if (scoreText) { scoreText.destroy(); scoreText = null; }
    if (blocks) { blocks.clear(true, true); }
    
    if (selectedMode === "normal") {
      maxBlocks = Phaser.Math.Between(modeSettings.normal.initialMinBlocks, modeSettings.normal.initialMaxBlocks);
    } else if (selectedMode === "asian") {
      maxBlocks = Phaser.Math.Between(modeSettings.asian.initialMinBlocks, modeSettings.asian.initialMaxBlocks);
    }
    
    gameOverContainer.setVisible(false);
    createModeSelectionUI(scene);
  }
  