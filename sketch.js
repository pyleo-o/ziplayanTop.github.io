// Oyun Ayarları
let gameWidth = 400;
let gameHeight = 600;
let player;
let platforms = [];
let score = 0;
let highScore = 0;
let gameWorldY = 0;

// Telegram & Firebase Değişkenleri
let telegramUser;
let db;
let auth;
let appId;
let leaderboard = []; // En iyi skorları tutacak dizi
let leaderboardButton, backButton, restartButton;

// Oyun Sabitleri
const GRAVITY = 0.6;
const JUMP_FORCE = -15;
const PLAYER_SPEED = 6;
const PLATFORM_HEIGHT = 20;
const PLATFORM_GAP_MIN = 100;
const PLATFORM_GAP_MAX = 150;
const PLATFORM_WIDTH_MIN = 80;
const PLATFORM_WIDTH_MAX = 140;
const SCROLL_THRESHOLD = gameHeight / 2.5;
const SPRING_BOOST = -25;
const MAX_PLATFORMS = 12;

// Medya Dosyaları
let ballImg;
let poppedBallImg;
let jumpSound;
let explodeSound;
let springSound;
let backgroundMusic;

// Oyun Durumları
const GAME_STATE = {
    LOADING: -1,
    PLAYING: 0,
    GAMEOVER: 1,
    LEADERBOARD: 2,
    ERROR: 3
};
let currentState = GAME_STATE.LOADING;
let errorMessage = "";

function preload() {
    ballImg = loadImage('assets/top.png');
    poppedBallImg = loadImage('assets/patlak_top.png');

    try {
        soundFormats('mp3', 'wav');
        jumpSound = loadSound('assets/zip_basamak.wav');
        explodeSound = loadSound('assets/game_over.mp3');
        springSound = loadSound('assets/zip_ses.wav');
        backgroundMusic = loadSound('assets/background.mp3');
    } catch (e) {
        console.error("Ses dosyaları yüklenemedi: ", e);
    }
}

// setup fonksiyonunu 'async' olarak işaretliyoruz.
async function setup() {
    let canvas = createCanvas(gameWidth, gameHeight);
    canvas.parent('game-container');
    
    textAlign(CENTER, CENTER);
    textSize(24);
    
    // --- Firebase'i Başlatma ve Bekleme ---
    try {
        // Ortam değişkenlerini kontrol et
        if (typeof __firebase_config === 'undefined' || !__firebase_config) {
            throw new Error("Firebase config not found! Lütfen ortam değişkenlerini kontrol edin.");
        }
        const firebaseConfig = JSON.parse(__firebase_config);

        const app = window.firebase.initializeApp(firebaseConfig);
        db = window.firebase.getFirestore(app);
        auth = window.firebase.getAuth(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        // Daha güvenilir token kontrolü
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
             await window.firebase.signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await window.firebase.signInAnonymously(auth);
        }
        console.log("Firebase Authenticated:", auth.currentUser ? auth.currentUser.uid : "Anonymous");

    } catch (error) {
        console.error("Firebase initialization failed:", error);
        errorMessage = "Veritabanı bağlantısı kurulamadı.\nLütfen daha sonra tekrar deneyin.";
        currentState = GAME_STATE.ERROR;
        return; // Hata durumunda kurulumu durdur.
    }
    // --- BİTİŞ: Firebase'i Başlatma ---

    // Telegram verilerini al
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        const initData = window.Telegram.WebApp.initDataUnsafe;
        if (initData && initData.user) {
            telegramUser = initData.user;
        } else {
            telegramUser = { id: 'local_test_' + floor(random(10000)), first_name: 'Test', username: 'localuser' };
        }
    } else {
       telegramUser = { id: 'local_test_' + floor(random(10000)), first_name: 'Test', username: 'localuser' };
    }
    
    // Yüksek skoru yerel depolamadan al
    let storedHighScore = getItem('highScore');
    if (storedHighScore) {
        highScore = storedHighScore;
    }

    // Butonları oluştur
    restartButton = createButton('Yeniden Başla');
    restartButton.id('restartButton');
    restartButton.parent('game-container');
    restartButton.mousePressed(resetGame);
    
    leaderboardButton = createButton('En İyiler');
    leaderboardButton.id('leaderboardButton');
    leaderboardButton.parent('game-container');
    leaderboardButton.mousePressed(showLeaderboard);
    
    backButton = createButton('Geri');
    backButton.id('backButton');
    backButton.parent('game-container');
    backButton.mousePressed(showGameOver);

    resetGame();
}

function resetGame() {
    currentState = GAME_STATE.PLAYING;
    score = 0;
    gameWorldY = 0;

    player = {
        x: gameWidth / 2,
        y: gameHeight - 100,
        vx: 0,
        vy: 0,
        radius: 20,
        isPopped: false,
        popAnimationTimer: 0,
        popAnimationDuration: 60
    };

    platforms = [];
    platforms.push(new Platform(gameWidth / 2 - 50, gameHeight - 50, 100, "normal"));
    let lastY = platforms[0].y;
    while (platforms.length < MAX_PLATFORMS) {
        let newY = lastY - random(PLATFORM_GAP_MIN, PLATFORM_GAP_MAX);
        generatePlatformsAtY(newY);
        lastY = platforms[platforms.length - 1].y;
    }
    
    platforms.sort((a,b)=>a.y - b.y);

    if (backgroundMusic && !backgroundMusic.isPlaying()) {
        backgroundMusic.setVolume(0.09);
        backgroundMusic.loop();
    }

    select('#restartButton').hide();
    select('#leaderboardButton').hide();
    select('#backButton').hide();
}

function draw() {
    background(20, 30, 40);

    if (currentState === GAME_STATE.LOADING) {
        fill(255);
        textSize(24);
        text("Yükleniyor...", width / 2, height / 2);
        return;
    }
    
    if (currentState === GAME_STATE.ERROR) {
        fill(255, 100, 100);
        textSize(18);
        textAlign(CENTER, CENTER);
        text(errorMessage, width / 2, height / 2);
        return;
    }

    if (currentState === GAME_STATE.PLAYING) {
        handlePlayerInput();
        updatePlayer();
        handleCollisions();
        updatePlatforms();
        updateCamera();
        updateScore();
        
        push();
        translate(0, -gameWorldY);
        drawPlatforms();
        drawPlayer();
        pop();
        displayUI();
    } else if (currentState === GAME_STATE.GAMEOVER) {
        push();
        translate(0, -gameWorldY);
        drawPlatforms();
        drawPlayer();
        pop();
        updatePlayer();
        displayGameOver();
    } else if (currentState === GAME_STATE.LEADERBOARD) {
        displayLeaderboard();
    }
}

async function saveHighScore() {
    if (!db || !telegramUser) {
        console.log("Firestore veya kullanıcı verisi yok, skor kaydedilemedi.");
        return;
    }

    const docRef = window.firebase.doc(db, `artifacts/${appId}/public/data/leaderboard`, telegramUser.id.toString());
    
    try {
        const docSnap = await window.firebase.getDoc(docRef);

        if (docSnap.exists()) {
            if (score > docSnap.data().score) {
                await window.firebase.setDoc(docRef, {
                    score: floor(score),
                    userName: telegramUser.first_name || telegramUser.username || `user-${telegramUser.id}`,
                    userId: telegramUser.id
                }, { merge: true });
                console.log("Yüksek skor güncellendi!");
            }
        } else {
            await window.firebase.setDoc(docRef, {
                score: floor(score),
                userName: telegramUser.first_name || telegramUser.username || `user-${telegramUser.id}`,
                userId: telegramUser.id
            });
            console.log("Yeni skor kaydedildi!");
        }
    } catch (error) {
        console.error("Skor kaydedilirken hata oluştu: ", error);
    }
}

async function showLeaderboard() {
    currentState = GAME_STATE.LOADING;
    select('#restartButton').hide();
    select('#leaderboardButton').hide();

    leaderboard = []; 
    try {
        // --- GÜNCELLENMİŞ VE DAHA VERİMLİ SORGULAMA ---
        const q = window.firebase.query(
            window.firebase.collection(db, `artifacts/${appId}/public/data/leaderboard`),
            window.firebase.orderBy("score", "desc"),
            window.firebase.limit(10)
        );

        const querySnapshot = await window.firebase.getDocs(q);
        querySnapshot.forEach((doc) => {
            leaderboard.push(doc.data());
        });
        
    } catch (error) {
        console.error("Liderlik tablosu alınırken hata: ", error);
        errorMessage = "Skor tablosu yüklenemedi.\nFirebase index'ini kontrol ettiniz mi?";
        currentState = GAME_STATE.ERROR;
        return;
    }
    
    currentState = GAME_STATE.LEADERBOARD;
    select('#backButton').show();
}

function displayLeaderboard() {
    background(20, 30, 40, 220); 
    fill(255);
    textAlign(CENTER, TOP);
    textSize(32);
    text("En İyi 10 Oyuncu", width / 2, 40);

    textSize(18);
    let yPos = 100;
    if (leaderboard.length === 0) {
        text("Henüz kimse oynamamış!", width/2, height/2);
    } else {
        leaderboard.forEach((entry, index) => {
            let displayName = entry.userName || `Kullanıcı #${entry.userId}`;
            let displayText = `${index + 1}. ${displayName}: ${entry.score}`;
            text(displayText, width / 2, yPos);
            yPos += 30;
        });
    }
}

function showGameOver() {
    currentState = GAME_STATE.GAMEOVER;
    select('#restartButton').show();
    select('#leaderboardButton').show();
    select('#backButton').hide();
}

function displayGameOver() {
    if (score > highScore) {
        highScore = score;
        storeItem('highScore', highScore);
    }

    saveHighScore();

    fill(50, 50, 50, 180);
    rect(0, 0, width, height);

    fill(255);
    textAlign(CENTER, CENTER);
    textSize(48);
    text("OYUN BİTTİ", width / 2, height / 2 - 80);
    textSize(28);
    text("Skor: " + floor(score), width / 2, height / 2 - 20);
    text("En Yüksek Skor: " + floor(highScore), width / 2, height / 2 + 20);
    
    select('#restartButton').show();
    select('#leaderboardButton').show();
    select('#backButton').hide();
}

function displayUI() {
    fill(255);
    textSize(20);
    textAlign(LEFT, TOP);
    text("Skor: " + floor(score), 10, 10);
    textAlign(RIGHT, TOP);
    text("En Yüksek: " + floor(highScore), width - 10, 10);

    if (telegramUser) {
        textAlign(CENTER, TOP);
        textSize(16);
        let displayName = telegramUser.first_name || telegramUser.username || `Kullanıcı #${telegramUser.id}`;
        text(`Hoş geldin, ${displayName}!`, width / 2, 10);
    }
}

// Diğer oyun fonksiyonları ve Platform sınıfı aynı kalır...
class Platform {
    constructor(x, y, w, type) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = PLATFORM_HEIGHT;
        this.type = type || "normal";
        this.moveDir = random([-1, 1]);
        this.moveSpeed = random(1, 2.5);
        this.isGhostActive = false;
        this.ghostTimer = 0;
        this.ghostDuration = 45;
    }

    draw() {
        if (this.type === "ghost" && !this.isGhostActive && currentState === GAME_STATE.PLAYING) {
            return;
        }
        noStroke();
        if (this.type === "normal") {
            fill(60, 180, 70);
        } else if (this.type === "spiked") {
            fill(220, 60, 60);
        } else if (this.type === "moving") {
            fill(80, 120, 220);
        } else if (this.type === "spring") {
            fill(220, 220, 60);
        } else if (this.type === "ghost") {
            let alpha = currentState === GAME_STATE.PLAYING ? map(this.ghostTimer, 0, this.ghostDuration, 255, 0) : 150;
            fill(180, 180, 180, alpha);
        }
        rect(this.x, this.y, this.width, this.height, 5);
        if (this.type === "spiked") {
            fill(180, 40, 40);
            for (let i = 0; i < this.width / 15; i++) {
                triangle(this.x + i * 15 + 2, this.y, this.x + i * 15 + 7.5, this.y - 10, this.x + i * 15 + 13, this.y);
            }
        } else if (this.type === 'spring') {
            fill(180, 180, 40);
            rect(this.x + this.width / 2 - 10, this.y - 5, 20, 10, 3);
        }
    }

    update() {
        if (this.type === "moving") {
            this.x += this.moveDir * this.moveSpeed;
            if (this.x + this.width >= gameWidth || this.x <= 0) {
                this.moveDir *= -1;
            }
        }
        if (this.type === "ghost" && this.isGhostActive && currentState === GAME_STATE.PLAYING) {
            this.ghostTimer--;
            if (this.ghostTimer <= 0) {
                this.isGhostActive = false;
            }
        }
    }
}

function handlePlayerInput() {
    if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) { player.vx = -PLAYER_SPEED; } 
    else if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) { player.vx = PLAYER_SPEED; } 
    else { player.vx = 0; }
}

function updatePlayer() {
    if (player.isPopped) {
        player.popAnimationTimer++;
        if (player.popAnimationTimer >= player.popAnimationDuration) {
            currentState = GAME_STATE.GAMEOVER;
        }
        return;
    }
    player.vy += GRAVITY;
    player.y += player.vy;
    player.x += player.vx;
    if (player.x > gameWidth) { player.x = 0; } 
    else if (player.x < 0) { player.x = gameWidth; }
    if (player.y - gameWorldY > gameHeight + player.radius) {
        if (!player.isPopped) {
            player.isPopped = true;
            if (explodeSound) explodeSound.play();
            for (let p of platforms) { if (p.type === "ghost") { p.isGhostActive = true; } }
        }
    }
}

function drawPlayer() {
    imageMode(CENTER);
    if (player.isPopped) {
        image(poppedBallImg, player.x, player.y, player.radius * 2, player.radius * 2);
    } else {
        push();
        translate(player.x, player.y);
        let rotation = map(player.vx, -PLAYER_SPEED, PLAYER_SPEED, -0.5, 0.5);
        rotate(rotation);
        image(ballImg, 0, 0, player.radius * 2, player.radius * 2);
        pop();
    }
}

function updatePlatforms() {
    platforms.forEach((p, i) => {
        p.update();
        if (p.y > gameWorldY + gameHeight + 50) {
            platforms.splice(i, 1);
        }
    });
    while (platforms.length < MAX_PLATFORMS) {
        let highestPlatform = platforms.reduce((prev, current) => (prev.y < current.y) ? prev : current);
        let newY = highestPlatform.y - random(PLATFORM_GAP_MIN, PLATFORM_GAP_MAX);
        generatePlatformsAtY(newY);
    }
}

function generatePlatformsAtY(yPos) {
    let randType = random();
    let type;
    if (randType < 0.15) { type = "spiked"; } 
    else if (randType < 0.35) { type = "moving"; } 
    else if (randType < 0.50) { type = "spring"; } 
    else if (randType < 0.65) { type = "ghost"; } 
    else { type = "normal"; }
    if (type === "spiked") {
        let safeType = random() < 0.8 ? "normal" : "spring";
        let side = random() < 0.5 ? 'left' : 'right';
        let width1 = random(PLATFORM_WIDTH_MIN, PLATFORM_WIDTH_MAX - 20);
        let width2 = random(PLATFORM_WIDTH_MIN, PLATFORM_WIDTH_MAX - 20);
        let x1, x2;
        if (side === 'left') {
            x1 = random(0, gameWidth / 2 - width1);
            x2 = random(gameWidth / 2, gameWidth - width2);
        } else {
            x1 = random(gameWidth / 2, gameWidth - width1);
            x2 = random(0, gameWidth / 2 - width2);
        }
        platforms.push(new Platform(x1, yPos, width1, type));
        platforms.push(new Platform(x2, yPos - random(10, 40), width2, safeType));
    } else { 
        let newX = random(0, gameWidth - PLATFORM_WIDTH_MIN);
        let newWidth = random(PLATFORM_WIDTH_MIN, PLATFORM_WIDTH_MAX);
        platforms.push(new Platform(newX, yPos, newWidth, type));
    }
}

function drawPlatforms() {
    for (let platform of platforms) {
        platform.draw();
    }
}

function handleCollisions() {
    if (player.isPopped || player.vy < 0) { return; }
    for (let platform of platforms) {
        if (
            player.x > platform.x - player.radius &&
            player.x < platform.x + platform.width + player.radius &&
            player.y + player.radius > platform.y &&
            player.y + player.radius < platform.y + platform.height
        ) {
            if (platform.type === "spiked") {
                player.isPopped = true;
                if (explodeSound) explodeSound.play();
                return;
            }
            if (platform.type === "ghost") {
                if (platform.isGhostActive) continue;
                platform.isGhostActive = true;
                platform.ghostTimer = platform.ghostDuration;
            }
            player.vy = JUMP_FORCE;
            if (jumpSound) jumpSound.play();
            if (platform.type === "spring") {
                player.vy = SPRING_BOOST;
                if (springSound) springSound.play();
            }
        }
    }
}

function updateCamera() {
    if (player.y < gameWorldY + SCROLL_THRESHOLD) {
        gameWorldY = player.y - SCROLL_THRESHOLD;
    }
}

function updateScore() {
    score = Math.max(score, -Math.floor(player.y - (gameHeight - 100)));
}
