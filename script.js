// ===================== KONFIGURASI =====================
const CONFIG = {
    unit: 'MPH',              // 'MPH' atau 'KMH'
    rpmSegments: 24,          // jumlah kotak pada bar RPM
    redline: 0.85,            // mulai zona merah (0.0 - 1.0)
    // Intro / brand
    intro: true,              // mainkan intro saat HUD baru dipakai
    brandText: 'WELCOME',       // teks animasi (dipakai jika logo.png tidak ada)
    brandLogo: 'logo.png',    // foto/logo: taruh di folder yang sama, namai logo.png

    chimeVolume: 0.35,
    fuelWarn: 0.2,
    fuelRepeatMs: 30000,      // ulangi chime bensin (0 = sekali)

    // Suara seatbelt: taruh file audio di folder yang sama dengan index.html
    seatbeltSound: 'seatbelt.mp3',
    seatbeltVolume: 0.8
};

const SPEED_FACTOR = CONFIG.unit === 'KMH' ? 3.6 : 2.236936;
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.has('preview')) document.documentElement.classList.add('preview');

// ===================== BAR RPM =====================
const segs = [];
(function buildRpm() {
    const bar = $('rpm');
    for (let i = 0; i < CONFIG.rpmSegments; i++) {
        const s = document.createElement('div');
        s.className = 'seg' + (i / CONFIG.rpmSegments >= CONFIG.redline ? ' red' : '');
        bar.appendChild(s);
        segs.push(s);
    }
    $('speed-mode').textContent = CONFIG.unit === 'KMH' ? 'KM/H' : 'MPH';
    $('odo-unit').textContent = CONFIG.unit === 'KMH' ? 'km' : 'mi';
})();

// ===================== AUDIO =====================
let audioCtx = null;
function getAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}

// Buka kunci audio saat interaksi pertama + lanjutkan seatbelt jika tertunda
['click', 'keydown', 'touchstart', 'mousedown'].forEach(evt =>
    window.addEventListener(evt, () => { getAudio(); if (seatbeltBuckled === false) startSeatbeltSound(); }, { once: true })
);

function tone(freq, offset, duration) {
    const ctx = getAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + offset;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, CONFIG.chimeVolume), t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + duration + 0.05);
}

const CHIMES = {
    seatbelt: [[1318.5, 0, 0.25], [1046.5, 0.2, 0.3], [1318.5, 0.6, 0.25], [1046.5, 0.8, 0.4]], // cadangan
    fuel: [[880, 0, 0.3], [698.5, 0.26, 0.3], [523.25, 0.52, 0.55]]
};
function playChime(type) { (CHIMES[type] || []).forEach(n => tone(n[0], n[1], n[2])); }
window.playChime = playChime;

// Suara seatbelt: file audio (loop) selama sabuk TIDAK dipakai; berhenti saat dipakai
const seatbeltAudio = new Audio(CONFIG.seatbeltSound);
seatbeltAudio.loop = true;
seatbeltAudio.volume = CONFIG.seatbeltVolume;
let seatbeltFallbackTimer = null;
let seatbeltFileOK = true;
seatbeltAudio.addEventListener('error', () => { seatbeltFileOK = false; });

function startSeatbeltSound() {
    if (seatbeltFileOK) {
        seatbeltAudio.play().catch(() => {});   // jika diblokir autoplay, dicoba lagi saat interaksi pertama
    } else if (!seatbeltFallbackTimer) {
        playChime('seatbelt');
        seatbeltFallbackTimer = setInterval(() => playChime('seatbelt'), 5000);
    }
}
function stopSeatbeltSound() {
    seatbeltAudio.pause();
    seatbeltAudio.currentTime = 0;
    clearInterval(seatbeltFallbackTimer);
    seatbeltFallbackTimer = null;
}

// ===================== HELPER =====================
const isTrue = v => v === true || v === 1 || v === '1' || v === 'true';

// ===================== INTRO (ANNIS / logo.png) =====================
let logoOK = false, introActive = false, introId = 0, lastSpeed = 0, lastRPM = 0;

function fractionToSegs(f) {
    const lit = Math.round(Math.max(0, Math.min(1, f)) * CONFIG.rpmSegments);
    segs.forEach((s, i) => s.classList.toggle('on', i < lit));
}

function tween(from, to, ms, fn, done) {
    const t0 = performance.now();
    (function step(now) {
        const k = Math.min(1, (now - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        fn(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step); else if (done) done();
    })(t0);
}

function probeLogo(cb) {
    let finished = false;
    const fin = ok => { if (finished) return; finished = true; logoOK = ok; cb(); };
    const img = new Image();
    img.onload = () => fin(true);
    img.onerror = () => fin(false);
    setTimeout(() => fin(false), 1200);
    img.src = CONFIG.brandLogo;
}

function renderBrand() {
    const brand = $('brand');
    brand.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'brand-row';
    if (logoOK) {
        const img = new Image();
        img.className = 'brand-logo';
        img.src = CONFIG.brandLogo;
        img.alt = CONFIG.brandText;
        row.appendChild(img);
    } else {
        Array.from(CONFIG.brandText).forEach((ch, i) => {
            const s = document.createElement('span');
            s.className = 'brand-letter';
            s.style.setProperty('--i', i);
            s.textContent = ch;
            row.appendChild(s);
        });
    }
    const line = document.createElement('div');
    line.className = 'intro-line';
    brand.appendChild(row);
    brand.appendChild(line);
}

function playIntro() {
    const id = ++introId;
    const alive = () => id === introId;
    introActive = true;
    $('hud').classList.add('booting');
    renderBrand();
    $('intro').classList.add('show');

    // Self-test: bar RPM menyapu penuh lalu kembali
    setTimeout(() => {
        if (!alive()) return;
        tween(0, 1, 1100, fractionToSegs, () => {
            if (alive()) tween(1, 0, 1100, fractionToSegs);
        });
    }, 300);

    setTimeout(() => { if (alive()) $('intro').classList.remove('show'); }, 3000);
    setTimeout(() => {
        if (!alive()) return;
        introActive = false;
        $('hud').classList.remove('booting');
        window.setRPM(lastRPM);
    }, 3500);
}
window.playIntro = playIntro; // panggil lagi saat pemain masuk kendaraan jika perlu

// ===================== API UNTUK JGRP / CEF =====================

// 1. Kecepatan (m/s) -> 3 digit, nol di depan redup
window.setSpeed = function (speed) {
    const v = Math.min(999, Math.round(Number(speed || 0) * SPEED_FACTOR));
    const str = String(v).padStart(3, '0');
    const firstReal = v === 0 ? 2 : str.search(/[1-9]/);
    const spans = $('speed').children;
    for (let i = 0; i < 3; i++) {
        spans[i].textContent = str[i];
        spans[i].className = i < firstReal ? 'dim' : '';
    }
};

// 2. RPM (0.0 - 1.0) -> bar bersegmen
window.setRPM = function (rpm) {
    lastRPM = rpm;
    if (introActive) return;
    const f = Math.max(0, Math.min(1, Number(rpm || 0)));
    const lit = Math.round(f * CONFIG.rpmSegments);
    segs.forEach((s, i) => s.classList.toggle('on', i < lit));
};

// 3. Bensin (0.0-1.0 atau 0-100) + chime saat rendah
let fuelIsLow = false, fuelTimer = null;
window.setFuel = function (fuel) {
    const val = Number(fuel || 0);
    const p = Math.max(0, Math.min(1, val > 1 ? val / 100 : val));
    $('fuel-value').textContent = Math.round(p * 100);
    const low = p < CONFIG.fuelWarn;
    $('fuel-group').classList.toggle('low', low);
    if (low !== fuelIsLow) {
        fuelIsLow = low;
        clearInterval(fuelTimer); fuelTimer = null;
        if (low) {
            playChime('fuel');
            if (CONFIG.fuelRepeatMs > 0) fuelTimer = setInterval(() => playChime('fuel'), CONFIG.fuelRepeatMs);
        }
    }
};

// 4. Engine health (0.0-1.0 atau 0-1000) -> persen
window.setHealth = function (health) {
    const val = Number(health || 0);
    const p = Math.max(0, Math.min(1, val > 1 ? val / 1000 : val));
    $('health-value').textContent = Math.round(p * 100);
    const g = $('health-group');
    g.className = 'stat' + (p <= 0.25 ? ' danger' : p <= 0.5 ? ' warn' : '');
};

// 5. Gear (0 = R, 'N' = netral, 1..n)
window.setGear = function (gear) {
    $('gear').textContent = (gear === 'N' || gear === 'n') ? 'N' : (gear == 0 ? 'R' : String(gear));
};

// 6. Lampu (0 = mati, 1 = dekat/hijau, 2 = jauh/biru)
window.setHeadlights = function (state) {
    const v = Number(state || 0);
    $('headlight').className = 'icon headlight' + (v === 2 ? ' high-beam' : v === 1 ? ' active' : '');
};

// 7. Seatbelt: suara berbunyi saat TIDAK dipakai, diam saat dipakai
let seatbeltBuckled = null;
window.setSeatbelts = function (state) {
    const buckled = isTrue(state);
    $('seatbelts').className = buckled ? 'icon active' : 'icon warn';
    if (buckled === seatbeltBuckled) return;
    seatbeltBuckled = buckled;
    buckled ? stopSeatbeltSound() : startSeatbeltSound();
};

// 8. Odometer
window.setOdometer = function (d) {
    $('odometer').textContent = Number(d || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

// 9. Mesin: nyala -> ikon mesin di baris bawah jadi hijau
window.setEngine = function (state) {
    $('engine').className = 'icon' + (isTrue(state) ? ' on' : '');
};

// 10. Sein: setTurnSignal('left' | 'right' | 'both' | 'off')
window.setTurnSignal = function (dir) {
    $('sig-left').className = 'icon' + (dir === 'left' || dir === 'both' ? ' signal' : '');
    $('sig-right').className = 'icon' + (dir === 'right' || dir === 'both' ? ' signal' : '');
};

// ===================== START =====================
if (CONFIG.intro && !params.has('nointro')) probeLogo(playIntro);
else $('hud').classList.remove('booting');

// ===================== DEMO (index.html?preview&demo) =====================
if (params.has('demo')) {
    let t = 0, fuel = 1, odo = 124567.4;
    setGear(1); setHealth(1000); setHeadlights(1); setEngine(1); setSeatbelts(1);
    setInterval(() => {
        t += 0.05;
        const mps = (Math.sin(t) * 0.5 + 0.5) * 65;
        setSpeed(mps);
        setRPM(0.2 + (Math.sin(t * 2) * 0.5 + 0.5) * 0.75);
        setGear(Math.min(6, 1 + Math.floor(mps / 11)));
        fuel = Math.max(0, fuel - 0.0004); setFuel(fuel);
        odo += mps * 0.00002; setOdometer(odo);
    }, 50);
}
