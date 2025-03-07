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
  
  // Base player speed is 24
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
  
  // NEW: Player skin selection variable (stored as "playerSkin", values "1", "2", or "3")
  let playerSkin = localStorage.getItem("playerSkin") || "1";
  
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
    // Load player skins:
    this.load.image('player1', 'assets/player1.png');
    this.load.image('player2', 'assets/player2.png');
    this.load.image('player3', 'assets/player3.png');
    
    // Load obstacles:
    this.load.image('block', 'assets/block.png');
    this.load.image('star', 'assets/star.png');
    // Alternative obstacles for skin 3:
    this.load.image('block3', 'assets/block3.png');
    this.load.image('star3', 'assets/star3.png');
    
    this.load.image('gameOverBg', 'assets/game_over_bg.png');
    this.load.image('restartButton', 'assets/restart_button.png');
    // Shooting code is not needed now.
  }
  
  // -------------------------
  // CREATE FUNCTION
  // -------------------------
  function create() {
    background = this.add.image(0, 0, 'background')
      .setOrigin(0)
      .setDisplaySize(config.width, config.height);
    
    // Create group for obstacles.
    blocks = this.add.group();
    
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
    
    // Update obstacles: move downward and check for collisions with player.
    blocks.getChildren().forEach(function(obstacle) {
      obstacle.speed = obstacle.baseSpeed * speedMultiplier;
      obstacle.y += obstacle.speed * dt;
      
      if (checkCollision(player.getBounds(), obstacle.getBounds())) {
        if (obstacle.type === "star") {
          score += 10;
          scoreText.setText('Score: ' + score);
          obstacle.destroy();
        } else if (obstacle.type === "block") {
          showGameOver();
        }
      }
      
      if (obstacle.y > config.height) {
        obstacle.destroy();
        if (obstacle.type === "block") {
          score++;
          scoreText.setText('Score: ' + score);
        }
      }
    });
    
    // Progression logic
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
  // MODE SELECTION UI & SKIN SELECTION
  // -------------------------
  async function createModeSelectionUI(scene) {
    // Get stored name; if not, prompt once.
    let storedName = localStorage.getItem("playerName");
    if (!storedName) {
      storedName = await promptForUniqueName();
      localStorage.setItem("playerName", storedName);
    }
    const currentPlayerName = storedName;
    
    // Get the stored skin selection; default to "1"
    playerSkin = localStorage.getItem("playerSkin") || "1";
    
    // Clear previous UI elements.
    if (gameOverContainer) { gameOverContainer.destroy(); gameOverContainer = null; }
    if (modeContainer) { modeContainer.destroy(); modeContainer = null; }
    
    let personalHighscoreNormal = parseInt(localStorage.getItem('highscore_normal')) || 0;
    let personalHighscoreAsian = parseInt(localStorage.getItem('highscore_asian')) || 0;
    
    modeContainer = scene.add.container(config.width / 2, config.height * 0.4);
    modeContainer.setDepth(100);
    
    let playerNameText = scene.add.text(0, -120, `Hello, ${currentPlayerName}!`, {
      fontSize: '20px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
   // --- Skin Selection UI ---
   let skinTitleText = scene.add.text(0, -90, "Select Player Skin", {
    fontSize: '18px',
    fill: '#fff',
    align: 'center'
  }).setOrigin(0.5);

  // Create a container for skins.
  let skinContainer = scene.add.container(0, -50);

  // Define base and selected scales.
  let baseScale = 0.35;     // 30% smaller than the previous default (0.5)
  let selectedScale = 0.5;  // Selected skin is larger

  // Create skin images with increased spacing.
  let skin1 = scene.add.image(-80, 0, 'player1').setScale(baseScale).setInteractive();
  let skin2 = scene.add.image(0, 0, 'player2').setScale(baseScale).setInteractive();
  let skin3 = scene.add.image(80, 0, 'player3').setScale(baseScale).setInteractive();

  // Lock skins if conditions are not met.
  let maxScore = Math.max(personalHighscoreNormal, personalHighscoreAsian);
  if (maxScore < 100) {
    skin2.setTint(0x555555);
  }
  if (personalHighscoreAsian < 120) {
    skin3.setTint(0x555555);
  }

  // Function to update skin highlight: selected skin scales up.
  function updateSkinHighlight(selected) {
    skin1.setScale(selected === "1" ? selectedScale : baseScale);
    skin2.setScale(selected === "2" ? selectedScale : baseScale);
    skin3.setScale(selected === "3" ? selectedScale : baseScale);
  }

  // Initialize highlight based on stored skin.
  updateSkinHighlight(playerSkin);

  // On click, if unlocked, update selection.
  skin1.on('pointerdown', () => {
    localStorage.setItem("playerSkin", "1");
    updateSkinHighlight("1");
    playerNameText.setText(`Hello, ${currentPlayerName}! (Skin 1)`);
  });
  skin2.on('pointerdown', () => {
    if (maxScore >= 100) {
      localStorage.setItem("playerSkin", "2");
      updateSkinHighlight("2");
      playerNameText.setText(`Hello, ${currentPlayerName}! (Skin 2)`);
    } else {
      alert("Unlock Skin 2 by reaching a score of 100 in any mode!");
    }
  });
  skin3.on('pointerdown', () => {
    if (personalHighscoreAsian >= 120) {
      localStorage.setItem("playerSkin", "3");
      updateSkinHighlight("3");
      playerNameText.setText(`Hello, ${currentPlayerName}! (Skin 3)`);
    } else {
      alert("Unlock Skin 3 by reaching a score of 120 in Asian mode!");
    }
  });

  skinContainer.add([skin1, skin2, skin3]);
  // --- End Skin Selection UI ---


    
    let modeTitle = scene.add.text(0, 20, "Select Game Mode", {
      fontSize: '24px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    // Mode buttons with red background.
    let normalButton = scene.add.text(0, 60, "Normal Mode", {
      fontSize: '24px',
      fill: '#fff',
      backgroundColor: 'red',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setInteractive();
    
    let asianButton = scene.add.text(0, 100, "Asian Normal Mode", {
      fontSize: '24px',
      fill: '#fff',
      backgroundColor: 'red',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setInteractive();
    
    let personalHighscoreText = scene.add.text(0, 140, 
      `Your Highscore:\nNormal: ${personalHighscoreNormal}   Asian: ${personalHighscoreAsian}`, {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
    
    let leaderboardNormal = await getGlobalLeaderboard("normal");
    let leaderboardAsian = await getGlobalLeaderboard("asian");
    
    let leaderboardNormalText = scene.add.text(-config.width / 4, 160, 
      "Normal:\n" + formatLeaderboardFromData(leaderboardNormal), {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    let leaderboardAsianText = scene.add.text(config.width / 4, 160, 
      "Asian:\n" + formatLeaderboardFromData(leaderboardAsian), {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    // Place the Change Name button at the very bottom of the screen.
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
      skinTitleText,
      skinContainer,
      modeTitle,
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
    
    // Choose player texture based on selected skin.
    let playerTexture = 'player1';
    if (localStorage.getItem("playerSkin") === "2") {
      playerTexture = 'player2';
    } else if (localStorage.getItem("playerSkin") === "3") {
      playerTexture = 'player3';
    }
    
    player = scene.add.image(config.width / 2, config.height - 80, playerTexture)
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
      // Spawn obstacles from the top (y = 0).
      let spawnY = 0;
      let isStar = Math.random() < 0.10;
      let obstacle;
      // If skin 3 is selected, use alternate assets.
      if (localStorage.getItem("playerSkin") === "3") {
        if (isStar) {
          obstacle = this.add.image(
            Phaser.Math.Between(40, config.width - 40),
            spawnY,
            'star3'
          ).setOrigin(0.5).setDisplaySize(40, 40);
          obstacle.type = "star";
        } else {
          obstacle = this.add.image(
            Phaser.Math.Between(40, config.width - 40),
            spawnY,
            'block3'
          ).setOrigin(0.5).setDisplaySize(40, 40);
          obstacle.type = "block";
        }
      } else {
        if (isStar) {
          obstacle = this.add.image(
            Phaser.Math.Between(40, config.width - 40),
            spawnY,
            'star'
          ).setOrigin(0.5).setDisplaySize(40, 40);
          obstacle.type = "star";
        } else {
          obstacle = this.add.image(
            Phaser.Math.Between(40, config.width - 40),
            spawnY,
            'block'
          ).setOrigin(0.5).setDisplaySize(40, 40);
          obstacle.type = "block";
        }
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
  
  function checkCollision(boundsA, boundsB) {
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
      let hs = parseInt(localStorage.getItem('highscore_normal')) || 0;
      if (score > hs) {
        localStorage.setItem('highscore_normal', score);
      }
    } else if (selectedMode === "asian") {
      let hs = parseInt(localStorage.getItem('highscore_asian')) || 0;
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
    playerSpeed = 24;
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
  