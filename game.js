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
  
  // Global variables for mode progression and selection
  let selectedMode; // "normal" or "asian"
  let speedMultiplier = 1;
  let nextSpeedIncreaseScore;
  let nextMaxBlocksIncreaseScore;
  
  // Base player speed is now 24 (doubled from previous value of 12)
  let playerSpeed = 24;
  
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
  let blocks;
  let maxBlocks;
  let gameStarted = false;
  let spawnTimer = null;
  let gameOverShown = false;
  
  // Global variable for the "Change Name" button
  let changeNameButton;
  
  // -------------------------
  // FIREBASE LEADERBOARD & USER FUNCTIONS (Firestore)
  // -------------------------
  async function registerUniqueName(name) {
    const docRef = db.collection("users").doc(name);
    const doc = await docRef.get();
    return !doc.exists;
  }
  
  async function promptForUniqueName() {
    let name = prompt("Please enter your name:");
    if (!name) name = "Guest";
    const unique = await registerUniqueName(name);
    if (!unique) {
      alert(`The name "${name}" is already in use. Please choose a different name.`);
      return await promptForUniqueName();
    }
    return name;
  }
  
  async function submitScoreFirestore(mode, name, score) {
    try {
      // Every run is recorded as a new document.
      await db.collection("scores").add({
        mode: mode,
        name: name,
        score: score,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("Score submitted for", name);
    } catch (err) {
      console.error("Error in submitScoreFirestore:", err);
    }
  }
  
  async function getGlobalLeaderboard(mode) {
    try {
      const querySnapshot = await db.collection("scores")
        .where("mode", "==", mode)
        .orderBy("score", "desc")
        .limit(10)
        .get();
      let leaderboard = [];
      querySnapshot.forEach(doc => {
        leaderboard.push(doc.data());
      });
      return leaderboard;
    } catch (err) {
      console.error("Error getting leaderboard from Firestore:", err);
      return [];
    }
  }
  
  function formatLeaderboardFromData(data) {
    let text = "";
    if (!data || data.length === 0) return "No entries";
    for (let i = 0; i < data.length; i++) {
      text += `${i + 1}. ${data[i].name} - ${data[i].score}\n`;
    }
    return text;
  }
  
  // -------------------------
  // PRELOAD FUNCTION
  // -------------------------
  function preload() {
    this.load.image('background', 'assets/background.png');
    this.load.image('player', 'assets/player.png');
    this.load.image('block', 'assets/block.png');
    this.load.image('star', 'assets/star.png'); // New star asset
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
    
    // Player movement
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
    
    // Process obstacles (blocks or stars)
    blocks.getChildren().forEach(function(obstacle) {
      obstacle.speed = obstacle.baseSpeed * speedMultiplier;
      obstacle.y += obstacle.speed * dt;
      
      if (checkCollision(player, obstacle)) {
        if (obstacle.type === "star") {
          // Collect the star: increase score by 10 and destroy the star.
          score += 10;
          scoreText.setText('Score: ' + score);
          obstacle.destroy();
        } else {
          // For blocks, trigger game over.
          showGameOver();
        }
      }
      
      if (obstacle.y > config.height) {
        obstacle.destroy();
        // For blocks only: increment score by 1 (as before).
        if (obstacle.type === "block") {
          score++;
          scoreText.setText('Score: ' + score);
        }
      }
    });
    
    // Progression logic (unchanged)
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
  // SPAWN FUNCTION: Spawns an obstacle which is either a block or (10% chance) a star
  // -------------------------
  function spawnBlock() {
    if (gameOver) return;
    if (blocks.getLength() < maxBlocks) {
      // 10% chance to spawn a star instead of a block.
      let isStar = Math.random() < 0.10;
      let obstacle;
      if (isStar) {
        obstacle = this.add.image(
          Phaser.Math.Between(40, config.width - 40),
          0,
          'star'
        ).setOrigin(0.5).setDisplaySize(40, 40);
        obstacle.type = "star";
      } else {
        obstacle = this.add.image(
          Phaser.Math.Between(40, config.width - 40),
          0,
          'block'
        ).setOrigin(0.5).setDisplaySize(40, 40);
        obstacle.type = "block";
      }
      // Set baseSpeed from the mode settings
      if (selectedMode === "normal") {
        obstacle.baseSpeed = Phaser.Math.Between(
          modeSettings.normal.blockSpeedMin,
          modeSettings.normal.blockSpeedMax
        );
      } else if (selectedMode === "asian") {
        obstacle.baseSpeed = Phaser.Math.Between(
          modeSettings.asian.blockSpeedMin,
          modeSettings.asian.blockSpeedMax
        );
      }
      obstacle.speed = obstacle.baseSpeed * speedMultiplier;
      blocks.add(obstacle);
    }
  }
  
  function checkCollision(spriteA, spriteB) {
    const boundsA = spriteA.getBounds();
    const boundsB = spriteB.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(boundsA, boundsB);
  }
  
  // -------------------------
  // MODE SELECTION UI & GAME START FUNCTIONS
  // -------------------------
  async function createModeSelectionUI(scene) {
    // Check for stored name; if exists, use it; if not, prompt once.
    let storedName = localStorage.getItem("playerName");
    if (!storedName) {
      storedName = await promptForUniqueName();
      localStorage.setItem("playerName", storedName);
    }
    const currentPlayerName = storedName;
    
    // Clear any previous UI elements.
    if (gameOverContainer) { gameOverContainer.destroy(); gameOverContainer = null; }
    if (modeContainer) { modeContainer.destroy(); modeContainer = null; }
    
    let personalHighscoreNormal = localStorage.getItem('highscore_normal') || 0;
    let personalHighscoreAsian = localStorage.getItem('highscore_asian') || 0;
    
    // Position container at 40% of screen height.
    modeContainer = scene.add.container(config.width / 2, config.height * 0.4);
    modeContainer.setDepth(100);
    
    let playerNameText = scene.add.text(0, -80, `Hello, ${currentPlayerName}!`, {
      fontSize: '20px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let modeTitleText = scene.add.text(0, -40, "Select Game Mode", {
      fontSize: '24px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let normalButton = scene.add.text(0, 0, "Normal Mode", {
      fontSize: '24px',
      fill: '#fff',
      backgroundColor: '#000',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setInteractive();
    
    let asianButton = scene.add.text(0, 40, "Asian Normal Mode", {
      fontSize: '24px',
      fill: '#fff',
      backgroundColor: '#000',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setInteractive();
    
    let personalHighscoreText = scene.add.text(0, 80, 
      `Your Highscore:\nNormal: ${personalHighscoreNormal}   Asian: ${personalHighscoreAsian}`, {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let leaderboardNormal = await getGlobalLeaderboard("normal");
    let leaderboardAsian = await getGlobalLeaderboard("asian");
    
    let leaderboardNormalText = scene.add.text(-config.width / 4, 100, 
      "Normal:\n" + formatLeaderboardFromData(leaderboardNormal), {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    let leaderboardAsianText = scene.add.text(config.width / 4, 100, 
      "Asian:\n" + formatLeaderboardFromData(leaderboardAsian), {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    // Place the Change Name button at the very bottom of the screen (outside the container)
    if (changeNameButton) { changeNameButton.destroy(); }
    changeNameButton = scene.add.text(config.width / 2, config.height - 30, "Change Name", {
      fontSize: '14px',
      fill: '#ff0',
      backgroundColor: '#000',
      padding: { x: 6, y: 3 }
    }).setOrigin(0.5).setInteractive();
    
    changeNameButton.on('pointerdown', async () => {
      let newName = prompt("Enter your new name:");
      if (newName) {
        const unique = await registerUniqueName(newName);
        if (!unique) {
          alert("This name is already in use. Please choose a different name.");
        } else {
          localStorage.setItem("playerName", newName);
          playerNameText.setText(`Hello, ${newName}!`);
        }
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
      leaderboardAsianText
    ]);
  }
  
  function setMode(mode) {
    selectedMode = mode;
    speedMultiplier = 1;
    playerSpeed = 24;
    nextSpeedIncreaseScore = modeSettings[mode].threshold;
    nextMaxBlocksIncreaseScore = (mode === "normal") ? modeSettings[mode].threshold * 2 : modeSettings[mode].threshold;
  }
  
  function startGame(scene) {
    gameStarted = true;
    if (modeContainer) { modeContainer.destroy(); modeContainer = null; }
    if (changeNameButton) { changeNameButton.destroy(); changeNameButton = null; }
    
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
  
  function spawnBlock() {
    if (gameOver) return;
    if (blocks.getLength() < maxBlocks) {
      // 10% chance for a star instead of a block.
      let isStar = Math.random() < 0.10;
      let obstacle;
      if (isStar) {
        obstacle = this.add.image(
          Phaser.Math.Between(40, config.width - 40),
          0,
          'star'
        ).setOrigin(0.5).setDisplaySize(40, 40);
        obstacle.type = "star";
      } else {
        obstacle = this.add.image(
          Phaser.Math.Between(40, config.width - 40),
          0,
          'block'
        ).setOrigin(0.5).setDisplaySize(40, 40);
        obstacle.type = "block";
      }
      if (selectedMode === "normal") {
        obstacle.baseSpeed = Phaser.Math.Between(
          modeSettings.normal.blockSpeedMin,
          modeSettings.normal.blockSpeedMax
        );
      } else if (selectedMode === "asian") {
        obstacle.baseSpeed = Phaser.Math.Between(
          modeSettings.asian.blockSpeedMin,
          modeSettings.asian.blockSpeedMax
        );
      }
      obstacle.speed = obstacle.baseSpeed * speedMultiplier;
      blocks.add(obstacle);
    }
  }
  
  function checkCollision(spriteA, spriteB) {
    const boundsA = spriteA.getBounds();
    const boundsB = spriteB.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(boundsA, boundsB);
  }
  
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
    
    let currentName = localStorage.getItem("playerName") || "Guest";
    submitScoreFirestore(selectedMode, currentName, score);
    
    if (selectedMode === "normal") {
      let hs = localStorage.getItem('highscore_normal') || 0;
      if (score > hs) {
        localStorage.setItem('highscore_normal', score);
      }
    } else if (selectedMode === "asian") {
      let hs = localStorage.getItem('highscore_asian') || 0;
      if (score > hs) {
        localStorage.setItem('highscore_asian', score);
      }
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
    playerSpeed = 24; // Reset to base speed (24)
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
  