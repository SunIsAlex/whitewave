const tracks = [
  {
    title: "Pressure",
    artist: "Billy Joel",
    duration: "4:40",
    cover: "cover-one",
    src: "audio/Billy_Joel_-_Pressure_-_The_Boys_2_OST_(mp3.pm).mp3"
  },
  {
    title: "Stay Alive",
    artist: "Emilia (CV: Rie Takahashi)",
    duration: "3:47",
    cover: "cover-two",
    src: "audio/Re_Zero_-_Stay_Alive_2_ending_Full_(mp3.pm).mp3"
  }
];

const audio = document.querySelector("#audio");
const player = document.querySelector(".player");
const playButton = document.querySelector(".play-button");
const progress = document.querySelector(".progress");
const volume = document.querySelector(".volume");
const currentTime = document.querySelector(".current-time");
const totalTime = document.querySelector(".total-time");
const trackElements = [...document.querySelectorAll(".track")];
const nowPlaying = document.querySelector(".now-playing");
let currentIndex = 0;
let isSeeking = false;
let isDraggingProgress = false;
let pendingSeekPercent = null;
let suppressProgressUntil = 0;
let seekFallbackTimer = null;
let activeObjectUrl = null;
let loadVersion = 0;
let trackReady = Promise.resolve();

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function paintRange(input, value) {
  input.style.setProperty("--fill", `${value}%`);
}

function loadTrack(index, autoplay = false) {
  currentIndex = (index + tracks.length) % tracks.length;
  const version = ++loadVersion;
  isSeeking = false;
  isDraggingProgress = false;
  pendingSeekPercent = null;
  suppressProgressUntil = 0;
  clearTimeout(seekFallbackTimer);
  const track = tracks[currentIndex];
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  nowPlaying.innerHTML = `
    <span class="mini-cover ${track.cover}" aria-hidden="true"><i></i></span>
    <span><strong>${track.title}</strong><small>${track.artist}</small></span>
  `;
  totalTime.textContent = track.duration;
  currentTime.textContent = "0:00";
  progress.value = 0;
  paintRange(progress, 0);
  trackElements.forEach((element, i) => element.classList.toggle("active", i === currentIndex));

  trackReady = fetch(track.src)
    .then((response) => {
      if (!response.ok) throw new Error(`音频加载失败：${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      if (version !== loadVersion) return;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = URL.createObjectURL(blob);
      audio.src = activeObjectUrl;
      audio.load();
      if (autoplay) return audio.play();
    })
    .catch((error) => {
      if (version !== loadVersion) return;
      console.warn("Blob 音频加载失败，回退到直接路径。", error);
      audio.src = track.src;
      audio.load();
      if (autoplay) return audio.play();
    })
    .catch(() => setPlaying(false));

  return trackReady;
}

function setPlaying(playing) {
  player.classList.toggle("playing", playing);
  trackElements.forEach((element, i) => {
    element.classList.toggle("is-playing", playing && i === currentIndex);
  });
  playButton.setAttribute("aria-label", playing ? "暂停" : "播放");
}

async function togglePlayback() {
  if (!audio.src) {
    if (!trackReady) loadTrack(currentIndex);
    await trackReady;
  }
  if (audio.paused) await audio.play().catch(() => setPlaying(false));
  else audio.pause();
}

playButton.addEventListener("click", togglePlayback);
document.querySelector(".previous").addEventListener("click", () => loadTrack(currentIndex - 1, true));
document.querySelector(".next").addEventListener("click", () => loadTrack(currentIndex + 1, true));

trackElements.forEach((element, index) => {
  element.querySelector(".track-main").addEventListener("click", () => {
    if (index === currentIndex && audio.src) togglePlayback();
    else loadTrack(index, true);
  });
});

audio.addEventListener("play", () => setPlaying(true));
audio.addEventListener("pause", () => setPlaying(false));
audio.addEventListener("ended", () => loadTrack(currentIndex + 1, true));
audio.addEventListener("loadedmetadata", () => {
  if (Number.isFinite(audio.duration)) {
    totalTime.textContent = formatTime(audio.duration);
    if (pendingSeekPercent !== null) {
      audio.currentTime = (pendingSeekPercent / 100) * audio.duration;
      pendingSeekPercent = null;
    }
  }
});
audio.addEventListener("timeupdate", () => {
  if (
    isSeeking ||
    isDraggingProgress ||
    audio.seeking ||
    performance.now() < suppressProgressUntil
  ) return;
  const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  progress.value = percent;
  currentTime.textContent = formatTime(audio.currentTime);
  paintRange(progress, percent);
});

function seekToPercent(percent) {
  const safePercent = Math.min(100, Math.max(0, Number(percent)));
  isSeeking = true;
  progress.value = safePercent;
  paintRange(progress, safePercent);

  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    const targetTime = (safePercent / 100) * audio.duration;
    currentTime.textContent = formatTime(targetTime);
    suppressProgressUntil = performance.now() + 600;

    try {
      audio.currentTime = targetTime;
    } catch {
      pendingSeekPercent = safePercent;
    }
  } else {
    pendingSeekPercent = safePercent;
    if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) audio.load();
  }
}

function finishSeek() {
  isDraggingProgress = false;
  seekToPercent(progress.value);
  clearTimeout(seekFallbackTimer);
  seekFallbackTimer = setTimeout(() => {
    isSeeking = false;
  }, 800);
}

progress.addEventListener("input", () => seekToPercent(progress.value));
progress.addEventListener("change", finishSeek);
progress.addEventListener("pointerdown", () => {
  isDraggingProgress = true;
  isSeeking = true;
});
progress.addEventListener("pointerup", finishSeek);
progress.addEventListener("pointercancel", finishSeek);

audio.addEventListener("seeked", () => {
  if (isDraggingProgress) return;
  clearTimeout(seekFallbackTimer);
  isSeeking = false;
  suppressProgressUntil = performance.now() + 150;

  const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  progress.value = percent;
  currentTime.textContent = formatTime(audio.currentTime);
  paintRange(progress, percent);
});

audio.volume = Number(volume.value);
volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
  paintRange(volume, volume.value * 100);
});

document.querySelectorAll(".heart").forEach((button) => {
  button.addEventListener("click", () => {
    const liked = button.classList.toggle("liked");
    button.setAttribute("aria-pressed", liked);
  });
});

const searchPanel = document.querySelector(".search-panel");
const searchInput = document.querySelector("#search");
const emptyState = document.querySelector(".empty-state");

document.querySelector(".search-toggle").addEventListener("click", () => {
  searchPanel.hidden = !searchPanel.hidden;
  if (!searchPanel.hidden) searchInput.focus();
});

function filterTracks() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  trackElements.forEach((element) => {
    const match = element.textContent.toLowerCase().includes(query);
    element.hidden = !match;
    if (match) visible += 1;
  });
  emptyState.hidden = visible !== 0;
  document.querySelector(".track-count").textContent = `${visible} 首曲目`;
}

searchInput.addEventListener("input", filterTracks);
document.querySelector(".clear-search").addEventListener("click", () => {
  searchInput.value = "";
  filterTracks();
  searchInput.focus();
});

loadTrack(0);
