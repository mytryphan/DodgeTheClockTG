// -------------------------
// CONFIGURATION & GLOBAL VARIABLES
// -------------------------
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
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
  
  // Global variables for progression and mode selection
  let selectedMode; // "normal" or "asian"
  let speedMultiplier = 1;
  let nextSpeedIncreaseScore;
  let nextMaxBlocksIncreaseScore;
  
  let playerSpeed = 6; // Initial player speed
  
  const modeSettings = {
    normal: {
      initialMinBlocks: 1,
      initialMaxBlocks: 5,
      blockSpeedMin: 5,
      blockSpeedMax: 10,
      spawnDelay: 500,
      speedIncreaseFactor: 1.05,
      maxBlockIncrease: 1,
      threshold: 10
    },
    asian: {
      initialMinBlocks: 2,
      initialMaxBlocks: 8,
      blockSpeedMin: 8,
      blockSpeedMax: 13,
      spawnDelay: 300,
      speedIncreaseFactor: 1.10,
      maxBlockIncrease: 2,
      threshold: 10
    }
  };
  
  let player, cursors, score = 0, scoreText, gameOver = false;
  let background, gameOverContainer, modeContainer;
  let targetX = null;
  const playerBaseSpeed = 6;
  let blocks;
  let maxBlocks;
  let gameStarted = false;
  let spawnTimer = null;
  let gameOverShown = false;
  
  // -------------------------
  // LEADERBOARD HELPER FUNCTIONS (Using Netlify Functions / LocalStorage demo)
  // -------------------------
  function submitScore(mode, name, score) {
    fetch('https://dodgetheblock.netlify.app/.netlify/functions/submit-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, name, score })
    })
      .then(res => res.json())
      .then(data => console.log("Score submitted", data))
      .catch(err => console.error("Error submitting score", err));
  }
  
  function fetchLeaderboard(mode, callback) {
    fetch(`https://dodgetheblock.netlify.app/.netlify/functions/get-leaderboard?mode=${mode}`)
      .then(res => res.json())
      .then(data => callback(data.leaderboard))
      .catch(err => {
        console.error("Error fetching leaderboard", err);
        callback(null);
      });
  }
  
  function formatLeaderboardFromData(data) {
    let text = "";
    if (!data || data.length === 0) return "No entries";
    for (let i = 0; i < data.length; i++) {
      text += `${i + 1}. ${data[i].name} - ${data[i].score}\n`;
    }
    return text;
  }
  
  function formatLeaderboard(mode) {
    // For demo, return placeholder text; later you can fetch from your backend.
    return "Loading...";
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
    background = this.add.image(0, 0, 'background')
      .setOrigin(0)
      .setDisplaySize(config.width, config.height);
      
    createModeSelectionUI(this);
  }
  
  // -------------------------
  // UPDATE FUNCTION (with delta time normalization)
  // -------------------------
  function update(time, delta) {
    if (!gameStarted || gameOver) return;
    let dt = delta / 16.67;
    
    // Player Movement
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
    
    // Blocks Movement & Collision
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
    
    // Progression
    let threshold = modeSettings[selectedMode].threshold;
    if (score >= nextSpeedIncreaseScore) {
      speedMultiplier *= modeSettings[selectedMode].speedIncreaseFactor;
      playerSpeed *= 1.10;
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
    let playerName = localStorage.getItem("playerName");
    if (!playerName) {
      playerName = prompt("Please enter your name:");
      if (!playerName) { playerName = "Guest"; }
      localStorage.setItem("playerName", playerName);
    }
    
    if (gameOverContainer) { gameOverContainer.destroy(); gameOverContainer = null; }
    if (modeContainer) { modeContainer.destroy(); modeContainer = null; }
    
    let personalHighscoreNormal = localStorage.getItem('highscore_normal') || 0;
    let personalHighscoreAsian = localStorage.getItem('highscore_asian') || 0;
    
    modeContainer = scene.add.container(config.width / 2, config.height * 0.3);
    modeContainer.setDepth(100);
    
    let playerNameText = scene.add.text(0, -100, `Hello, ${playerName}!`, {
      fontSize: '20px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let modeTitleText = scene.add.text(0, -60, "Select Game Mode", {
      fontSize: '24px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let normalButton = scene.add.text(0, -20, "Normal Mode", {
      fontSize: '24px',
      fill: '#fff',
      backgroundColor: '#000',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setInteractive();
    
    let asianButton = scene.add.text(0, 20, "Asian Normal Mode", {
      fontSize: '24px',
      fill: '#fff',
      backgroundColor: '#000',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setInteractive();
    
    let personalHighscoreText = scene.add.text(0, 50, 
      `Your Highscore:\nNormal: ${personalHighscoreNormal}   Asian: ${personalHighscoreAsian}`, {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let leaderboardNormalText = scene.add.text(-config.width / 4, 80, 
      "Normal:\n" + formatLeaderboard("normal"), {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    let leaderboardAsianText = scene.add.text(config.width / 4, 80, 
      "Asian:\n" + formatLeaderboard("asian"), {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    let changeNameButton = scene.add.text(0, 110, "Change Name", {
      fontSize: '14px',
      fill: '#ff0',
      backgroundColor: '#000',
      padding: { x: 6, y: 3 }
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
    
    modeContainer.add([
      playerNameText,
      modeTitleText,
      normalButton,
      asianButton,
      personalHighscoreText,
      leaderboardNormalText,
      leaderboardAsianText,
      changeNameButton
    ]);
  }
  
  function setMode(mode) {
    selectedMode = mode;
    speedMultiplier = 1;
    playerSpeed = 6;
    nextSpeedIncreaseScore = modeSettings[mode].threshold;
    nextMaxBlocksIncreaseScore = (mode === "normal") ? modeSettings[mode].threshold * 2 : modeSettings[mode].threshold;
  }
  
  function startGame(scene) {
    gameStarted = true;
    if (modeContainer) { modeContainer.destroy(); modeContainer = null; }
    
    player = scene.add.image(config.width / 2, config.height - 80, 'player')
      .setOrigin(0.5)
      .setDisplaySize(40, 40);
    score = 0;
    scoreText = scene.add.text(10, 10, 'Score: 0', { fontSize: '20px', fill: '#fff' });
    
    cursors = scene.input.keyboard.createCursorKeys();
    scene.input.on('pointerdown', (pointer) => { targetX = pointer.x; });
    scene.input.on('pointermove', (pointer) => { targetX = pointer.x; });
    scene.input.on('pointerup', () => { targetX = null; });
    
    blocks = scene.add.group();
    
    if (selectedMode === "normal") {
      maxBlocks = Phaser.Math.Between(modeSettings.normal.initialMinBlocks, modeSettings.normal.initialMaxBlocks);
    } else if (selectedMode === "asian") {
      maxBlocks = Phaser.Math.Between(modeSettings.asian.initialMinBlocks, modeSettings.asian.initialMaxBlocks);
    }
    
    spawnTimer = scene.time.addEvent({
      delay: modeSettings[selectedMode].spawnDelay,
      callback: spawnBlock,
      callbackScope: scene,
      loop: true
    });
    
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
    if (gameOverShown) return;
    gameOver = true;
    gameOverShown = true;
    gameOverContainer.setVisible(true);
    gameOverContainer.getAt(2).setText('Score: ' + score);
    
    let playerName = localStorage.getItem("playerName") || "Guest";
    fetch('https://dodgetheblock.netlify.app/.netlify/functions/submit-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: selectedMode, name: playerName, score: score })
    })
      .then(res => res.json())
      .then(data => console.log("Score submitted", data))
      .catch(err => console.error("Error submitting score", err));
    
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
    gameOverShown = false;
    
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
  