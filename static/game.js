// ===== 常量 =====
const GRID_SIZE = 4;
const API_BASE = "";

// ===== 状态 =====
let grid = [];
let score = 0;
let bestScore = 0;
let steps = 0;
let timerInterval = null;
let elapsedSeconds = 0;
let playerName = "";
let history = []; // 撤销历史
let gameOver = false;
let won = false;
let scoreSubmitted = false;

// ===== DOM =====
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const stepsEl = document.getElementById("steps-display");
const timeEl = document.getElementById("time-display");
const rankEl = document.getElementById("rank-display");
const tilesContainer = document.getElementById("tiles-container");
const playerNameDisplay = document.getElementById("player-name-display");

// 弹窗
const nicknameModal = document.getElementById("nickname-modal");
const nicknameInput = document.getElementById("nickname-input");
const nicknameConfirmBtn = document.getElementById("nickname-confirm-btn");
const gameoverModal = document.getElementById("gameover-modal");
const gameoverTitle = document.getElementById("gameover-title");
const gameoverScoreText = document.getElementById("gameover-score-text");
const gameoverRankText = document.getElementById("gameover-rank-text");
const leaderboardModal = document.getElementById("leaderboard-modal");
const leaderboardList = document.getElementById("leaderboard-list");

// 按钮
document.getElementById("new-game-btn").addEventListener("click", startNewGame);
document.getElementById("undo-btn").addEventListener("click", undoMove);
document.getElementById("leaderboard-btn").addEventListener("click", openLeaderboard);
document.getElementById("change-name-btn").addEventListener("click", openNicknameModal);
document.getElementById("nickname-confirm-btn").addEventListener("click", confirmNickname);
document.getElementById("gameover-restart-btn").addEventListener("click", () => {
  gameoverModal.classList.add("hidden");
  startNewGame();
});
document.getElementById("gameover-leaderboard-btn").addEventListener("click", () => {
  gameoverModal.classList.add("hidden");
  openLeaderboard();
});
document.getElementById("leaderboard-close-btn").addEventListener("click", () => {
  leaderboardModal.classList.add("hidden");
});

nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmNickname();
});

// ===== 昵称弹窗 =====
function openNicknameModal() {
  nicknameInput.value = playerName || "";
  nicknameModal.classList.remove("hidden");
  setTimeout(() => nicknameInput.focus(), 100);
}

function confirmNickname() {
  const name = nicknameInput.value.trim();
  if (!name) {
    nicknameInput.style.borderColor = "#f67c5f";
    nicknameInput.placeholder = "昵称不能为空！";
    return;
  }
  nicknameInput.style.borderColor = "";
  playerName = name;
  localStorage.setItem("2048_player_name", playerName);
  playerNameDisplay.textContent = playerName;
  nicknameModal.classList.add("hidden");

  // 查询该玩家历史最高分
  fetchPlayerBest();
}

async function fetchPlayerBest() {
  if (!playerName) return;
  try {
    const res = await fetch(`${API_BASE}/api/player/${encodeURIComponent(playerName)}`);
    const data = await res.json();
    if (data.found && data.score > bestScore) {
      bestScore = data.score;
      bestScoreEl.textContent = bestScore;
      localStorage.setItem("2048_best_score", bestScore);
      if (data.rank) {
        rankEl.textContent = `排名第 ${data.rank} 名`;
        rankEl.classList.remove("hidden");
      }
    }
  } catch (e) {
    // 网络错误忽略
  }
}

// ===== 游戏初始化 =====
function init() {
  // 读取本地存储
  playerName = localStorage.getItem("2048_player_name") || "";
  bestScore = parseInt(localStorage.getItem("2048_best_score") || "0");
  bestScoreEl.textContent = bestScore;

  if (playerName) {
    playerNameDisplay.textContent = playerName;
    nicknameModal.classList.add("hidden");
    fetchPlayerBest();
  } else {
    nicknameModal.classList.remove("hidden");
    setTimeout(() => nicknameInput.focus(), 300);
  }

  // 尝试恢复存档
  const saved = loadGame();
  if (!saved) {
    startNewGame();
  }
}

function startNewGame() {
  stopTimer();
  grid = createEmptyGrid();
  score = 0;
  steps = 0;
  elapsedSeconds = 0;
  gameOver = false;
  won = false;
  scoreSubmitted = false;
  history = [];
  rankEl.classList.add("hidden");

  updateScoreDisplay();
  prevGrid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  tilesContainer.innerHTML = "";
  addRandomTile();
  addRandomTile();
  renderBoard();
  startTimer();
  saveGame();
}

// ===== 网格操作 =====
function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

function addRandomTile() {
  const empty = [];
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (grid[r][c] === 0) empty.push([r, c]);
  if (empty.length === 0) return null;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  return [r, c];
}

// ===== 移动逻辑 =====
function slide(row) {
  const filtered = row.filter(v => v !== 0);
  const merged = [];
  let mergedFlags = [];
  let i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const val = filtered[i] * 2;
      merged.push(val);
      mergedFlags.push(true);
      score += val;
      i += 2;
    } else {
      merged.push(filtered[i]);
      mergedFlags.push(false);
      i++;
    }
  }
  while (merged.length < GRID_SIZE) { merged.push(0); mergedFlags.push(false); }
  return { row: merged, mergedFlags };
}

function moveLeft() {
  let moved = false;
  const mergedPositions = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const { row, mergedFlags } = slide(grid[r]);
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] !== row[c]) moved = true;
      if (mergedFlags[c]) mergedPositions.push([r, c]);
    }
    grid[r] = row;
  }
  return { moved, mergedPositions };
}

function moveRight() {
  let moved = false;
  const mergedPositions = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const { row, mergedFlags } = slide([...grid[r]].reverse());
    const newRow = row.reverse();
    const newFlags = mergedFlags.reverse();
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] !== newRow[c]) moved = true;
      if (newFlags[c]) mergedPositions.push([r, c]);
    }
    grid[r] = newRow;
  }
  return { moved, mergedPositions };
}

function moveUp() {
  let moved = false;
  const mergedPositions = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    const col = grid.map(r => r[c]);
    const { row, mergedFlags } = slide(col);
    for (let r = 0; r < GRID_SIZE; r++) {
      if (grid[r][c] !== row[r]) moved = true;
      if (mergedFlags[r]) mergedPositions.push([r, c]);
      grid[r][c] = row[r];
    }
  }
  return { moved, mergedPositions };
}

function moveDown() {
  let moved = false;
  const mergedPositions = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    const col = grid.map(r => r[c]).reverse();
    const { row, mergedFlags } = slide(col);
    const newCol = row.reverse();
    const newFlags = mergedFlags.reverse();
    for (let r = 0; r < GRID_SIZE; r++) {
      if (grid[r][c] !== newCol[r]) moved = true;
      if (newFlags[r]) mergedPositions.push([r, c]);
      grid[r][c] = newCol[r];
    }
  }
  return { moved, mergedPositions };
}

function handleMove(direction) {
  if (gameOver) return;
  // 保存历史
  history.push({ grid: JSON.parse(JSON.stringify(grid)), score, steps });
  if (history.length > 5) history.shift();

  const prevScore = score;
  let result;
  if (direction === "left") result = moveLeft();
  else if (direction === "right") result = moveRight();
  else if (direction === "up") result = moveUp();
  else if (direction === "down") result = moveDown();

  if (!result.moved) {
    history.pop();
    return;
  }

  steps++;
  const newTilePos = addRandomTile();
  renderBoard(result.mergedPositions, newTilePos);
  updateScoreDisplay();
  saveGame();

  // 检查胜利
  if (!won && hasValue(2048)) {
    won = true;
    // 不强制结束，允许继续
  }

  // 检查游戏结束
  if (isGameOver()) {
    gameOver = true;
    stopTimer();
    setTimeout(() => showGameOver(), 400);
  }
}

function undoMove() {
  if (history.length === 0) return;
  const prev = history.pop();
  grid = prev.grid;
  score = prev.score;
  steps = prev.steps;
  updateScoreDisplay();
  renderBoard();
  saveGame();
}

function hasValue(val) {
  return grid.some(row => row.includes(val));
}

function isGameOver() {
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === 0) return false;
      if (c + 1 < GRID_SIZE && grid[r][c] === grid[r][c + 1]) return false;
      if (r + 1 < GRID_SIZE && grid[r][c] === grid[r + 1][c]) return false;
    }
  return true;
}

// ===== 渲染 =====
// 记录上一帧的网格状态，用于判断方块是否发生变化
let prevGrid = [];

function renderBoard(mergedPositions = [], newTilePos = null) {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const val = grid[r][c];
      const prevVal = prevGrid[r] ? prevGrid[r][c] : -1;
      const key = `tile-${r}-${c}`;
      let existing = tilesContainer.querySelector(`[data-key="${key}"]`);

      if (val === 0) {
        // 该格子为空，移除已有方块
        if (existing) existing.remove();
        continue;
      }

      const isMerged = mergedPositions.some(([mr, mc]) => mr === r && mc === c);
      const isNew = newTilePos && newTilePos[0] === r && newTilePos[1] === c;
      const valueChanged = prevVal !== val;

      if (existing) {
        if (valueChanged || isMerged) {
          // 值发生变化（合并）：更新内容并播放合并动画
          existing.className = `tile ${getTileClass(val)}`;
          existing.textContent = val;
          if (isMerged) {
            existing.classList.remove("merged");
            // 强制重绘以重新触发动画
            void existing.offsetWidth;
            existing.classList.add("merged");
          }
        }
        // 值未变化：什么都不做，保持原样，不触发动画
      } else {
        // 新方块：创建并添加出现动画
        const tile = document.createElement("div");
        tile.className = `tile ${getTileClass(val)}`;
        tile.dataset.key = key;
        tile.textContent = val;
        tile.style.gridRow = r + 1;
        tile.style.gridColumn = c + 1;
        tilesContainer.appendChild(tile);
      }
    }
  }
  // 更新 prevGrid
  prevGrid = grid.map(row => [...row]);
}

function getTileClass(val) {
  if (val <= 2048) return `tile-${val}`;
  return "tile-super";
}

function updateScoreDisplay() {
  scoreEl.textContent = score;
  if (score > bestScore) {
    bestScore = score;
    bestScoreEl.textContent = bestScore;
    localStorage.setItem("2048_best_score", bestScore);
  }
}

// ===== 计时器 =====
function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    const m = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
    const s = String(elapsedSeconds % 60).padStart(2, "0");
    timeEl.textContent = `时间：${m}:${s}`;
    stepsEl.textContent = `步数：${steps}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ===== 游戏结束 =====
async function showGameOver() {
  gameoverTitle.textContent = score >= 2048 ? "🎉 成功通关！太棒了!" : "😊 差一点点，继续加油！";
  gameoverScoreText.textContent = `本局得分：${score} 分，共走 ${steps} 步`;
  gameoverRankText.textContent = "正在提交分数...";
  gameoverModal.classList.remove("hidden");

  if (playerName && score > 0 && !scoreSubmitted) {
    scoreSubmitted = true;
    try {
      const res = await fetch(`${API_BASE}/api/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_name: playerName, score }),
      });
      const data = await res.json();
      if (data.success) {
        gameoverRankText.textContent = data.message;
        rankEl.textContent = `排名第 ${data.rank} 名`;
        rankEl.classList.remove("hidden");
        bestScore = data.best_score;
        bestScoreEl.textContent = bestScore;
        localStorage.setItem("2048_best_score", bestScore);
      }
    } catch (e) {
      gameoverRankText.textContent = "分数提交失败（网络错误）";
    }
  } else if (!playerName) {
    gameoverRankText.textContent = "设置昵称后可上传排行榜";
  }
}

// ===== 排行榜 =====
async function openLeaderboard() {
  leaderboardModal.classList.remove("hidden");
  leaderboardList.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard?limit=20`);
    const data = await res.json();
    renderLeaderboard(data);
  } catch (e) {
    leaderboardList.innerHTML = '<div class="lb-empty">加载失败，请检查网络</div>';
  }
}

function renderLeaderboard(list) {
  if (!list || list.length === 0) {
    leaderboardList.innerHTML = '<div class="lb-empty">暂无记录，快来成为第一名！</div>';
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  leaderboardList.innerHTML = list.map((item) => {
    const topClass = item.rank <= 3 ? `top${item.rank}` : "";
    const isCurrent = item.player_name === playerName ? "current-player" : "";
    const medal = item.rank <= 3 ? `<span class="lb-medal">${medals[item.rank - 1]}</span>` : "";
    return `
      <div class="lb-item ${topClass} ${isCurrent}">
        <div class="lb-rank">${item.rank}</div>
        <div class="lb-name">${escapeHtml(item.player_name)}${item.player_name === playerName ? " <small style='color:#f67c5f'>（我）</small>" : ""}</div>
        ${medal}
        <div class="lb-score">${item.score.toLocaleString()}</div>
      </div>
    `;
  }).join("");
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===== 存档 =====
function saveGame() {
  localStorage.setItem("2048_grid", JSON.stringify(grid));
  localStorage.setItem("2048_score", score);
  localStorage.setItem("2048_steps", steps);
  localStorage.setItem("2048_elapsed", elapsedSeconds);
}

function loadGame() {
  try {
    const savedGrid = localStorage.getItem("2048_grid");
    if (!savedGrid) return false;
    grid = JSON.parse(savedGrid);
    score = parseInt(localStorage.getItem("2048_score") || "0");
    steps = parseInt(localStorage.getItem("2048_steps") || "0");
    elapsedSeconds = parseInt(localStorage.getItem("2048_elapsed") || "0");
    updateScoreDisplay();
    prevGrid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    tilesContainer.innerHTML = "";
    renderBoard();
    startTimer();
    return true;
  } catch (e) {
    return false;
  }
}

// ===== 键盘控制 =====
document.addEventListener("keydown", (e) => {
  if (nicknameModal.classList.contains("hidden") === false) return;
  const map = {
    ArrowLeft: "left", ArrowRight: "right",
    ArrowUp: "up", ArrowDown: "down",
  };
  if (map[e.key]) {
    e.preventDefault();
    handleMove(map[e.key]);
  }
});

// ===== 触摸控制 =====
let touchStartX = 0, touchStartY = 0;
const board = document.getElementById("game-board");

board.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

board.addEventListener("touchmove", (e) => {
  // 在游戏区域内滑动时阻止页面滚动
  e.preventDefault();
}, { passive: false });

board.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absDx = Math.abs(dx), absDy = Math.abs(dy);
  if (Math.max(absDx, absDy) < 20) return;
  if (absDx > absDy) handleMove(dx > 0 ? "right" : "left");
  else handleMove(dy > 0 ? "down" : "up");
}, { passive: true });

// ===== 启动 =====
init();
