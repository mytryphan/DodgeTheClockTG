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
let selectedMode; // "normal", "asian", or "shooting"
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
  },
  shooting: { 
    initialMinBlocks: 1,
    initialMaxBlocks: 5,
    blockSpeedMin: 5,
    blockSpeedMax: 10,
    spawnDelay: 500,
    speedIncreaseFactor: 1.05,
    maxBlockIncrease: 1,
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

// NEW: Global variable for player skin selection (values "1", "2", or "3")
let playerSkin = localStorage.getItem("playerSkin") || "1";

// Arrays for obstacle images.
const usualBlockImages = ['block1', 'block2', 'block3', 'block4', 'block5', 'block6'];
const altBlockImages = ['blockAlt1', 'blockAlt2', 'blockAlt3', 'blockAlt4', 'blockAlt5', 'blockAlt6'];

// For Shooting Mode: bullet group and timer.
let bullets;
let bulletTimer = null;

// Global leaderboard text objects (will be set in UI function)
let leaderboardNormalText, leaderboardAsianText, leaderboardShootingText;

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

// New: Update leaderboard text objects
async function updateLeaderboards(scene) {
  let leaderboardNormal = await getGlobalLeaderboard("normal");
  let leaderboardAsian = await getGlobalLeaderboard("asian");
  let leaderboardShooting = await getGlobalLeaderboard("shooting");
  if (leaderboardNormalText)
    leaderboardNormalText.setText("Normal:\n" + formatLeaderboardFromData(leaderboardNormal));
  if (leaderboardAsianText)
    leaderboardAsianText.setText("Asian:\n" + formatLeaderboardFromData(leaderboardAsian));
  if (leaderboardShootingText)
    leaderboardShootingText.setText("Shooting:\n" + formatLeaderboardFromData(leaderboardShooting));
}

// -------------------------
// PRELOAD FUNCTION
// -------------------------
function preload() {
  this.load.image('background', 'assets/background.png');
  
  // Load player skins.
  this.load.image('player1', 'assets/player1.png');
  this.load.image('player2', 'assets/player2.png');
  this.load.image('player3', 'assets/player3.png');
  
  // Load usual block images.
  for (let i = 1; i <= 6; i++) {
    this.load.image('block' + i, 'assets/block' + i + '.png');
  }
  // Load alternative block images for skin 3.
  for (let i = 1; i <= 6; i++) {
    this.load.image('blockAlt' + i, 'assets/blockAlt' + i + '.png');
  }
  
  // Load star images.
  this.load.image('star', 'assets/star.png');
  this.load.image('starAlt', 'assets/starAlt.png');
  
  this.load.image('gameOverBg', 'assets/game_over_bg.png');
  this.load.image('restartButton', 'assets/restart_button.png');
  
  // Load bullet assets.
  this.load.image('bullet', 'assets/bullet.png');
  this.load.image('bulletAlt', 'assets/bulletAlt.png');
  
  // Load explosion spritesheet.
  this.load.spritesheet('explosion', 'assets/explosion.png', { frameWidth: 64, frameHeight: 64 });
}

// -------------------------
// CREATE FUNCTION
// -------------------------
function create() {
  background = this.add.image(0, 0, 'background')
    .setOrigin(0)
    .setDisplaySize(config.width, config.height);
  
  blocks = this.add.group();
  
  this.anims.create({
    key: 'explode',
    frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 15 }),
    frameRate: 20,
    hideOnComplete: true
  });
  
  createModeSelectionUI(this);
  
  // Force immediate correct positioning.
  this.scale.resize(window.innerWidth, window.innerHeight);
  this.cameras.main.centerOn(window.innerWidth / 2, window.innerHeight / 2);
  this.cameras.main.fadeIn(500, 0, 0, 0);
}

// -------------------------
// UPDATE FUNCTION
// -------------------------
function update(time, delta) {
  if (!gameStarted || gameOver) return;
  let dt = delta / 16.67;
  
  // Player movement.
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
  
  if (selectedMode === "shooting") {
    updateBullets(dt);
  }
  
  blocks.getChildren().forEach(function(obstacle) {
    obstacle.speed = obstacle.baseSpeed * speedMultiplier;
    obstacle.y += obstacle.speed * dt;
    
    if (checkCollision(player.getBounds(), obstacle.getBounds())) {
      if (obstacle.type === "star" || obstacle.type === "starAlt") {
        score += 10;
        scoreText.setText('Score: ' + score);
        obstacle.destroy();
      } else if (obstacle.type === "block") {
        showGameOver();
      }
    }
    
    if (obstacle.y > config.height) {
      obstacle.destroy();
      if (selectedMode === "shooting" && (obstacle.type === "block")) {
        showGameOver();
      } else if (obstacle.type === "block") {
        score++;
        scoreText.setText('Score: ' + score);
      }
    }
  });
  
  let threshold = modeSettings[selectedMode].threshold;
  if (score >= nextSpeedIncreaseScore) {
    speedMultiplier *= modeSettings[selectedMode].speedIncreaseFactor;
    playerSpeed *= 1.10;
    nextSpeedIncreaseScore += threshold;
  }
  if (selectedMode === "normal" || selectedMode === "shooting") {
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
// BULLET FUNCTIONS (Shooting Mode)
// -------------------------
function shootBullet() {
  let bulletTexture = (localStorage.getItem("playerSkin") === "3") ? 'bulletAlt' : 'bullet';
  let bullet = this.add.image(player.x, player.y - player.height / 2, bulletTexture)
    .setOrigin(0.5);
  bullet.speed = 60;
  bullets.add(bullet);
}

function updateBullets(dt) {
  bullets.getChildren().forEach(function(bullet) {
    bullet.y -= bullet.speed * dt;
    if (bullet.y < 0) {
      bullet.destroy();
    } else {
      blocks.getChildren().forEach(function(obstacle) {
        if (obstacle.type === "block" && checkCollision(bullet.getBounds(), obstacle.getBounds())) {
          let explosion = bullet.scene.add.sprite(obstacle.x, obstacle.y, 'explosion');
          explosion.play('explode');
          obstacle.destroy();
          bullet.destroy();
          score += 1;
          scoreText.setText('Score: ' + score);
        }
      });
    }
  });
}

// -------------------------
// MODE SELECTION & SKIN SELECTION UI
// -------------------------
async function createModeSelectionUI(scene) {
  let storedName = localStorage.getItem("playerName");
  if (!storedName) {
    storedName = await promptForUniqueName();
    localStorage.setItem("playerName", storedName);
  }
  const currentPlayerName = storedName;
  
  playerSkin = localStorage.getItem("playerSkin") || "1";
  
  if (gameOverContainer) { gameOverContainer.destroy(); gameOverContainer = null; }
  if (modeContainer) { modeContainer.destroy(); modeContainer = null; }
  
  let personalHighscoreNormal = parseInt(localStorage.getItem('highscore_normal')) || 0;
  let personalHighscoreAsian = parseInt(localStorage.getItem('highscore_asian')) || 0;
  let personalHighscoreShooting = parseInt(localStorage.getItem('highscore_shooting')) || 0;
  
  modeContainer = scene.add.container(config.width / 2, config.height * 0.4);
  modeContainer.setDepth(100);
  
  let playerNameText = scene.add.text(0, -140, `Hello, ${currentPlayerName}!`, {
    fontSize: '20px',
    fill: '#fff',
    align: 'center'
  }).setOrigin(0.5);
  
  // --- Skin Selection UI ---
  let skinTitleText = scene.add.text(0, -110, "Select Player Skin", {
    fontSize: '18px',
    fill: '#fff',
    align: 'center'
  }).setOrigin(0.5);
  
  let skinContainer = scene.add.container(0, -70);
  
  let baseScale = 0.35;
  let selectedScale = 0.5;
  
  let skin1 = scene.add.image(-80, 0, 'player1').setScale(baseScale).setInteractive();
  let skin2 = scene.add.image(0, 0, 'player2').setScale(baseScale).setInteractive();
  let skin3 = scene.add.image(80, 0, 'player3').setScale(baseScale).setInteractive();
  
  let maxScore = Math.max(personalHighscoreNormal, personalHighscoreAsian);
  if (maxScore < 100) {
    skin2.setTint(0x555555);
  }
  if (personalHighscoreAsian < 120) {
    skin3.setTint(0x555555);
  }
  
  function updateSkinHighlight(selected) {
    skin1.setScale(selected === "1" ? selectedScale : baseScale);
    skin2.setScale(selected === "2" ? selectedScale : baseScale);
    skin3.setScale(selected === "3" ? selectedScale : baseScale);
  }
  
  updateSkinHighlight(playerSkin);
  
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
  
  let modeTitle = scene.add.text(0, -20, "Select Game Mode", {
    fontSize: '24px',
    fill: '#fff',
    align: 'center'
  }).setOrigin(0.5);
  
  let normalButton = scene.add.text(0, 20, "Normal Mode", {
    fontSize: '24px',
    fill: '#fff',
    backgroundColor: 'red',
    padding: { x: 8, y: 4 }
  }).setOrigin(0.5).setInteractive();
  
  let asianButton = scene.add.text(0, 60, "Asian Normal Mode", {
    fontSize: '24px',
    fill: '#fff',
    backgroundColor: 'red',
    padding: { x: 8, y: 4 }
  }).setOrigin(0.5).setInteractive();
  
  let shootingButton = scene.add.text(0, 100, "Shooting Mode", {
    fontSize: '24px',
    fill: '#fff',
    backgroundColor: 'red',
    padding: { x: 8, y: 4 }
  }).setOrigin(0.5).setInteractive();
  
  let personalHighscoreText = scene.add.text(0, 140, 
    `Your Highscore:
Normal: ${personalHighscoreNormal}   Asian: ${personalHighscoreAsian}   Shooting: ${personalHighscoreShooting}`, {
      fontSize: '14px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5);
  
  leaderboardNormalText = scene.add.text(-config.width / 3, 160, 
    "Normal:\n" + formatLeaderboardFromData(await getGlobalLeaderboard("normal")), {
      fontSize: '10px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
  
  leaderboardAsianText = scene.add.text(0, 160, 
    "Asian:\n" + formatLeaderboardFromData(await getGlobalLeaderboard("asian")), {
      fontSize: '10px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
  
  leaderboardShootingText = scene.add.text(config.width / 3, 160, 
    "Shooting:\n" + formatLeaderboardFromData(await getGlobalLeaderboard("shooting")), {
      fontSize: '10px',
      fill: '#fff',
      align: 'center'
    }).setOrigin(0.5, 0);
  
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
  
  shootingButton.on('pointerdown', function() {
    setMode("shooting");
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
    shootingButton,
    personalHighscoreText,
    leaderboardNormalText,
    leaderboardAsianText,
    leaderboardShootingText
  ]);
}

function setMode(mode) {
  selectedMode = mode;
  speedMultiplier = 1;
  playerSpeed = 24;
  nextSpeedIncreaseScore = modeSettings[mode].threshold;
  nextMaxBlocksIncreaseScore = (mode === "normal" || mode === "shooting")
    ? modeSettings.normal.threshold * 2
    : modeSettings[mode].threshold;
}

function startGame(scene) {
  gameStarted = true;
  if (modeContainer) { modeContainer.destroy(); modeContainer = null; }
  if (changeNameButton) { changeNameButton.destroy(); changeNameButton = null; }
  
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
  
  if (selectedMode === "shooting") {
    bullets = scene.add.group();
    bulletTimer = scene.time.addEvent({
      delay: 500,
      callback: shootBullet,
      callbackScope: scene,
      loop: true
    });
  }
  
  if (selectedMode === "normal" || selectedMode === "shooting") {
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

function shootBullet() {
  let bulletTexture = (localStorage.getItem("playerSkin") === "3") ? 'bulletAlt' : 'bullet';
  let bullet = this.add.image(player.x, player.y - player.height / 2, bulletTexture)
    .setOrigin(0.5);
  bullet.speed = 60;
  bullets.add(bullet);
}

function updateBullets(dt) {
  bullets.getChildren().forEach(function(bullet) {
    bullet.y -= bullet.speed * dt;
    if (bullet.y < 0) {
      bullet.destroy();
    } else {
      blocks.getChildren().forEach(function(obstacle) {
        if (obstacle.type === "block" && checkCollision(bullet.getBounds(), obstacle.getBounds())) {
          let explosion = bullet.scene.add.sprite(obstacle.x, obstacle.y, 'explosion');
          explosion.play('explode');
          obstacle.destroy();
          bullet.destroy();
          score += 1;
          scoreText.setText('Score: ' + score);
        }
      });
    }
  });
}

function spawnBlock() {
  if (gameOver) return;
  if (blocks.getLength() < maxBlocks) {
    let spawnY = 0;
    let isStar = Math.random() < 0.10;
    let obstacle;
    if (isStar) {
      let starKey = (localStorage.getItem("playerSkin") === "3") ? 'starAlt' : 'star';
      obstacle = this.add.image(
        Phaser.Math.Between(60, config.width - 60),
        spawnY,
        starKey
      ).setOrigin(0.5).setDisplaySize(40, 40);
      obstacle.type = (starKey === 'starAlt') ? "starAlt" : "star";
    } else {
      let textureKey;
      if (localStorage.getItem("playerSkin") === "3") {
        textureKey = altBlockImages[Math.floor(Math.random() * altBlockImages.length)];
      } else {
        textureKey = usualBlockImages[Math.floor(Math.random() * usualBlockImages.length)];
      }
      obstacle = this.add.image(
        Phaser.Math.Between(60, config.width - 60),
        spawnY,
        textureKey
      ).setOrigin(0.5).setDisplaySize(40, 40);
      obstacle.type = "block";
    }
    if (selectedMode === "normal" || selectedMode === "shooting") {
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
  
  if (selectedMode === "normal" || selectedMode === "shooting") {
    let hs = parseInt(localStorage.getItem('highscore_normal')) || 0;
    if (score > hs) {
      localStorage.setItem('highscore_normal', score);
    }
  } else if (selectedMode === "asian") {
    let hs = parseInt(localStorage.getItem('highscore_asian')) || 0;
    if (score > hs) {
      localStorage.setItem('highscore_asian', score);
    }
  } else if (selectedMode === "shooting") {
    let hs = parseInt(localStorage.getItem('highscore_shooting')) || 0;
    if (score > hs) {
      localStorage.setItem('highscore_shooting', score);
    }
  }
  
  // Update the global leaderboards immediately.
  updateLeaderboards(game.scene.scenes[0]);
}

function restartGame(scene) {
  if (spawnTimer) {
    spawnTimer.remove();
    spawnTimer = null;
  }
  if (bulletTimer) {
    bulletTimer.remove();
    bulletTimer = null;
  }
  if (bullets) {
    bullets.clear(true, true);
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
  
  if (selectedMode === "normal" || selectedMode === "shooting") {
    maxBlocks = Phaser.Math.Between(modeSettings.normal.initialMinBlocks, modeSettings.normal.initialMaxBlocks);
  } else if (selectedMode === "asian") {
    maxBlocks = Phaser.Math.Between(modeSettings.asian.initialMinBlocks, modeSettings.asian.initialMaxBlocks);
  }
  
  gameOverContainer.setVisible(false);
  createModeSelectionUI(scene);
}
