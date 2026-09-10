// ============================================================
// えいごムシかご - アプリ本体
// localStorage にすべての状態を保存するだけのフロントエンド完結アプリ
// ============================================================

const STORAGE_KEY = "englishBeetles.v1";

const MASTERED_LEVEL = 6;

const defaultState = () => ({
  coins: 0,
  words: {}, // en -> { level: number }
  beetle: { cleanliness: 70, fullness: 70, power: 0, feedCount: 0 },
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      coins: typeof parsed.coins === "number" ? parsed.coins : base.coins,
      words: parsed.words || base.words,
      beetle: Object.assign(base.beetle, parsed.beetle || {}),
    };
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // localStorage が使えない環境ではそのまま進める（保存されないだけ）
  }
}

const state = loadState();

for (const w of WORDS) {
  if (!state.words[w.en]) state.words[w.en] = { level: 0 };
}

let lastWordEn = null;

// ---------------- 音声 ----------------

function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    // 音声合成が使えない場合は静かに諦める
  }
}

// ---------------- コイン ----------------

function addCoins(amount, fromEl) {
  state.coins += amount;
  document.getElementById("coinCount").textContent = state.coins;
  const badge = document.getElementById("coinBadge");
  badge.classList.remove("bump");
  void badge.offsetWidth;
  badge.classList.add("bump");
  popCoin(amount, fromEl);
  saveState();
}

function popCoin(amount, fromEl) {
  const pop = document.createElement("div");
  pop.className = "coin-pop";
  pop.textContent = "+" + amount + " 🪙";
  const rect = (fromEl || document.getElementById("quizCard")).getBoundingClientRect();
  pop.style.left = rect.left + rect.width / 2 - 20 + "px";
  pop.style.top = rect.top + 10 + "px";
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 900);
}

// ---------------- 単語の出題ロジック ----------------

function stageForLevel(level) {
  if (level <= 0) return "listen";
  if (level <= 2) return "choice";
  return "spelling";
}

function coinsForAnswer(stage, level) {
  if (stage === "listen") return 1;
  if (stage === "choice") return 2 + level;
  const cappedLevel = Math.min(level, MASTERED_LEVEL);
  return 5 + (cappedLevel - 3) * 2;
}

function pickWord() {
  const pool = [];
  for (const w of WORDS) {
    const level = state.words[w.en].level;
    const weight = level >= MASTERED_LEVEL ? 1 : MASTERED_LEVEL + 2 - level;
    for (let i = 0; i < weight; i++) pool.push(w);
  }
  let candidates = pool.filter((w) => w.en !== lastWordEn);
  if (candidates.length === 0) candidates = pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(correctWord, count) {
  const others = WORDS.filter((w) => w.en !== correctWord.en);
  return shuffle(others).slice(0, count).map((w) => w.ja);
}

// ---------------- 出題カードの描画 ----------------

let currentWord = null;
let currentStage = null;

function renderQuiz() {
  currentWord = pickWord();
  lastWordEn = currentWord.en;
  currentStage = stageForLevel(state.words[currentWord.en].level);

  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";

  const card = document.getElementById("quizCard");
  card.innerHTML = "";

  const tag = document.createElement("div");
  tag.className = "stage-tag " + currentStage;
  tag.textContent =
    currentStage === "listen" ? "きいてみよう" : currentStage === "choice" ? "いみをえらぼう" : "つづりをかこう";
  card.appendChild(tag);

  if (currentStage === "listen") {
    renderListenStage(card, currentWord);
  } else if (currentStage === "choice") {
    renderChoiceStage(card, currentWord);
  } else {
    renderSpellingStage(card, currentWord);
  }

  updateProgress();
}

function renderListenStage(card, word) {
  const wordEl = document.createElement("div");
  wordEl.className = "word-display";
  wordEl.textContent = word.en;
  card.appendChild(wordEl);

  const speakBtn = document.createElement("button");
  speakBtn.className = "speak-btn";
  speakBtn.textContent = "🔊";
  speakBtn.setAttribute("aria-label", "はつおんを きく");
  speakBtn.onclick = () => speak(word.en);
  card.appendChild(speakBtn);

  const meaningEl = document.createElement("div");
  meaningEl.className = "meaning-display";
  meaningEl.textContent = word.ja;
  card.appendChild(meaningEl);

  const okBtn = document.createElement("button");
  okBtn.className = "primary-btn";
  okBtn.textContent = "おぼえた！";
  okBtn.onclick = () => handleCorrect(okBtn);
  card.appendChild(okBtn);

  speak(word.en);
}

function renderChoiceStage(card, word) {
  const wordRow = document.createElement("div");
  wordRow.style.display = "flex";
  wordRow.style.alignItems = "center";
  wordRow.style.gap = "12px";

  const wordEl = document.createElement("div");
  wordEl.className = "word-display";
  wordEl.style.fontSize = "1.9rem";
  wordEl.textContent = word.en;
  wordRow.appendChild(wordEl);

  const speakBtn = document.createElement("button");
  speakBtn.className = "speak-btn";
  speakBtn.style.width = "48px";
  speakBtn.style.height = "48px";
  speakBtn.style.fontSize = "1.2rem";
  speakBtn.textContent = "🔊";
  speakBtn.onclick = () => speak(word.en);
  wordRow.appendChild(speakBtn);

  card.appendChild(wordRow);

  const choices = shuffle([word.ja, ...pickDistractors(word, 3)]);

  const grid = document.createElement("div");
  grid.className = "choice-grid";
  for (const choice of choices) {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = choice;
    btn.onclick = () => {
      const buttons = grid.querySelectorAll(".choice-btn");
      buttons.forEach((b) => (b.disabled = true));
      if (choice === word.ja) {
        btn.classList.add("correct");
        handleCorrect(btn);
      } else {
        btn.classList.add("wrong");
        buttons.forEach((b) => {
          if (b.textContent === word.ja) b.classList.add("correct");
        });
        handleWrong();
      }
    };
    grid.appendChild(btn);
  }
  card.appendChild(grid);

  speak(word.en);
}

function renderSpellingStage(card, word) {
  const meaningEl = document.createElement("div");
  meaningEl.className = "meaning-display";
  meaningEl.textContent = word.ja;
  card.appendChild(meaningEl);

  const speakBtn = document.createElement("button");
  speakBtn.className = "speak-btn";
  speakBtn.textContent = "🔊";
  speakBtn.onclick = () => speak(word.en);
  card.appendChild(speakBtn);

  const form = document.createElement("div");
  form.className = "spelling-form";

  const input = document.createElement("input");
  input.className = "spelling-input";
  input.type = "text";
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.placeholder = "つづりをにゅうりょく";
  form.appendChild(input);

  const submitBtn = document.createElement("button");
  submitBtn.className = "primary-btn";
  submitBtn.textContent = "こたえる";
  form.appendChild(submitBtn);

  const submit = () => {
    const answer = input.value.trim().toLowerCase();
    input.disabled = true;
    submitBtn.disabled = true;
    if (answer === word.en.toLowerCase()) {
      submit_correct();
    } else {
      input.classList.add("wrong-shake");
      handleWrong(word.en);
    }
  };
  function submit_correct() {
    handleCorrect(submitBtn);
  }

  submitBtn.onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === "Enter") submit();
  };

  card.appendChild(form);
  speak(word.en);
  setTimeout(() => input.focus(), 50);
}

// ---------------- 正解・不正解の処理 ----------------

function handleCorrect(nearEl) {
  const wordState = state.words[currentWord.en];
  const reward = coinsForAnswer(currentStage, wordState.level);
  wordState.level = Math.min(wordState.level + 1, MASTERED_LEVEL + 4);

  const fb = document.getElementById("feedback");
  fb.textContent = "せいかい！ 🎉";
  fb.className = "feedback ok";

  addCoins(reward, nearEl);
  applyBeetleDecay();
  saveState();

  setTimeout(renderQuiz, 900);
}

function handleWrong(correctAnswer) {
  const fb = document.getElementById("feedback");
  fb.textContent = correctAnswer ? "おしい！ せいかいは " + correctAnswer : "おしい！";
  fb.className = "feedback ng";

  applyBeetleDecay();
  saveState();

  setTimeout(renderQuiz, 1400);
}

function updateProgress() {
  const total = WORDS.length;
  const mastered = WORDS.filter((w) => state.words[w.en].level >= MASTERED_LEVEL).length;
  document.getElementById("totalCount").textContent = total;
  document.getElementById("masteredCount").textContent = mastered;
  document.getElementById("masteredFill").style.width = (mastered / total) * 100 + "%";
}

// ---------------- カブトムシ ----------------

function applyBeetleDecay() {
  const b = state.beetle;
  b.cleanliness = Math.max(0, b.cleanliness - 2);
  b.fullness = Math.max(0, b.fullness - 2);
  if (!document.getElementById("beetleTab").classList.contains("hidden")) {
    renderBeetle();
  }
}

function powerTier(power) {
  if (power >= 76) return 3;
  if (power >= 51) return 2;
  if (power >= 26) return 1;
  return 0;
}

function powerLabelText(power) {
  const tier = powerTier(power);
  return ["よわい", "ふつう", "つよい", "さいきょう！"][tier];
}

function renderBeetle() {
  const b = state.beetle;

  document.getElementById("cageDirt").style.opacity = (100 - b.cleanliness) / 100;
  document.getElementById("jellyDish").style.opacity = 0.3 + (b.fullness / 100) * 0.7;

  document.getElementById("cleanFill").style.width = b.cleanliness + "%";
  document.getElementById("cleanNum").textContent = b.cleanliness;
  document.getElementById("fullFill").style.width = b.fullness + "%";
  document.getElementById("fullNum").textContent = b.fullness;
  document.getElementById("powerFill").style.width = b.power + "%";
  document.getElementById("powerNum").textContent = b.power;

  document.getElementById("powerLabel").textContent = "つよさ: " + powerLabelText(b.power);

  const beetleEl = document.getElementById("beetleEmoji");
  let emoji = "🥚";
  let stageText = "たまご";
  if (b.feedCount >= 6) {
    emoji = "🪲";
    stageText = "カブトムシ（せいちゅう）";
  } else if (b.feedCount >= 2) {
    emoji = "🐛";
    stageText = "よう虫";
  }
  beetleEl.textContent = emoji;
  document.getElementById("stageLabel").textContent = stageText;

  const scale = 1 + b.power / 200;
  beetleEl.style.transform = "scale(" + scale.toFixed(2) + ")";
  beetleEl.classList.remove("power-tier-1", "power-tier-2", "power-tier-3");
  const tier = powerTier(b.power);
  if (tier > 0) beetleEl.classList.add("power-tier-" + tier);

  document.getElementById("btnClean").disabled = state.coins < 5;
  document.getElementById("btnJelly").disabled = state.coins < 8;
  document.getElementById("btnTrain").disabled = state.coins < 15;
}

function showBeetleMsg(text) {
  const el = document.getElementById("beetleMsg");
  el.textContent = text;
  setTimeout(() => {
    if (el.textContent === text) el.textContent = "";
  }, 1800);
}

function spendCoins(amount) {
  if (state.coins < amount) return false;
  state.coins -= amount;
  document.getElementById("coinCount").textContent = state.coins;
  saveState();
  return true;
}

document.getElementById("btnClean").onclick = () => {
  if (!spendCoins(5)) return showBeetleMsg("🪙 コインがたりないよ！");
  state.beetle.cleanliness = 100;
  saveState();
  renderBeetle();
  showBeetleMsg("きれいになったよ！✨");
};

document.getElementById("btnJelly").onclick = () => {
  if (!spendCoins(8)) return showBeetleMsg("🪙 コインがたりないよ！");
  state.beetle.fullness = Math.min(100, state.beetle.fullness + 40);
  state.beetle.feedCount += 1;
  saveState();
  renderBeetle();
  showBeetleMsg("おいしそうに たべたよ！🍮");
};

document.getElementById("btnTrain").onclick = () => {
  if (state.beetle.fullness < 20) {
    return showBeetleMsg("おなかが すいていると れんしゅうできないよ！");
  }
  if (!spendCoins(15)) return showBeetleMsg("🪙 コインがたりないよ！");
  state.beetle.power = Math.min(100, state.beetle.power + 8);
  state.beetle.fullness = Math.max(0, state.beetle.fullness - 15);
  state.beetle.cleanliness = Math.max(0, state.beetle.cleanliness - 10);
  saveState();
  renderBeetle();
  showBeetleMsg("つよくなったよ！💪");
};

// ---------------- タブ切り替え ----------------

const navStudy = document.getElementById("navStudy");
const navBeetle = document.getElementById("navBeetle");
const studyTab = document.getElementById("studyTab");
const beetleTab = document.getElementById("beetleTab");

navStudy.onclick = () => {
  navStudy.classList.add("active");
  navBeetle.classList.remove("active");
  studyTab.classList.remove("hidden");
  beetleTab.classList.add("hidden");
};

navBeetle.onclick = () => {
  navBeetle.classList.add("active");
  navStudy.classList.remove("active");
  beetleTab.classList.remove("hidden");
  studyTab.classList.add("hidden");
  renderBeetle();
};

// ---------------- 初期化 ----------------

document.getElementById("coinCount").textContent = state.coins;
renderQuiz();
renderBeetle();
