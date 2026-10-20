// ===================== KONFIGURASI =====================
const CONFIG = {
    unit: 'MPH',              // 'MPH' atau 'KMH'
    rpmMax: 8,                // angka tertinggi di dial (x1000 RPM)
    redline: 0.85,            // mulai zona merah (0.0 - 1.0)
    sideSegments: 10,         // jumlah kotak pada bar fuel / engine
    // Intro / brand
    intro: true,
    brandText: 'WELCOME',
    brandLogo: 'logo.png',

    chimeVolume: 0.35,
    fuelWarn: 0.2,
    fuelRepeatMs: 30000,      // ulangi chime bensin (0 = sekali)

    seatbeltSound: 'seatbelt.mp3',
    seatbeltVolume: 0.8
};

const SPEED_FACTOR = CONFIG.unit === 'KMH' ? 3.6 : 2.236936;
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.has('preview')) document.documentElement.classList.add('preview');

// ===================== GEOMETRI GAUGE =====================
const NS = 'http://www.w3.org/2000/svg';
const CX = 400, CY = 240;
const A0 = 180, SWEEP = 275;           // 0 RPM di bawah, putar searah jarum jam
const pt = (r, a) => { const t = a * Math.PI / 180; return [CX + r * Math.sin(t), CY - r * Math.cos(t)]; };
function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}
const f1 = n => n.toFixed(1);

// Skala + angka dial
(function buildDial() {
    const ticks = $('ticks'), nums = $('nums');
    const total = CONFIG.rpmMax * 5;
    for (let i = 0; i <= total; i++) {
        const f = i / total, a = A0 + f * SWEEP, major = i % 5 === 0;
        const [x1, y1] = pt(major ? 184 : 195, a), [x2, y2] = pt(206, a);
        svgEl('line', {
            x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2),
            class: 'tick' + (major ? ' major' : '') + (f >= CONFIG.redline - 0.001 ? ' red' : '')
        }, ticks);
        if (major) {
            const [tx, ty] = pt(155, a);
            const t = svgEl('text', { x: f1(tx), y: f1(ty), class: 'num' }, nums);
            t.textContent = i / 5;
        }
    }
    $('speed-mode').textContent = CONFIG.unit === 'KMH' ? 'KM/H' : 'MPH';
    $('odo-unit').textContent = CONFIG.unit === 'KMH' ? 'km' : 'mi';
})();

// Bar melengkung kiri (fuel) & kanan (engine)
function buildSide(prefix, a0, dir) {
    const R = 345, N = CONFIG.sideSegments, STEP = 50 / N, sweep = dir > 0 ? 1 : 0;
    const arc = (r, s, e) => {
        const [x1, y1] = pt(r, s), [x2, y2] = pt(r, e);
        return `M${f1(x1)} ${f1(y1)} A${r} ${r} 0 0 ${sweep} ${f1(x2)} ${f1(y2)}`;
    };
    $(prefix + '-guide').setAttribute('d', arc(366, a0, a0 + dir * 50));
    const g = $(prefix + '-group');
    const [mx1, my1] = pt(318, a0 + dir * 25), [mx2, my2] = pt(332, a0 + dir * 25);
    svgEl('line', { x1: f1(mx1), y1: f1(my1), x2: f1(mx2), y2: f1(my2), class: 'mid' }, g);
    const segs = [];
    for (let i = 0; i < N; i++) {
        const s = a0 + dir * (i * STEP + 0.5);
        segs.push(svgEl('path', { d: arc(R, s, s + dir * (STEP - 1)), class: 'seg' }, $(prefix + '-segs')));
    }
    return segs;
}
const fuelSegs = buildSide('fuel', 245, +1);      // naik di sisi kiri
const healthSegs = buildSide('health', 115, -1);  // naik di sisi kanan

function setBar(segs, p) {
    const lit = p <= 0 ? 0 : Math.max(1, Math.round(p * segs.length));
    segs.forEach((s, i) => s.classList.toggle('on', i < lit));
}

// ===================== RPM: JARUM + SAPUAN =====================
let rpmTarget = 0, rpmCur = 0, rpmRAF = null;

function drawRpm(f) {
    const a1 = A0 + f * SWEEP;
    $('needle').setAttribute('transform', `rotate(${f1(a1)} ${CX} ${CY})`);
    const span = a1 - A0;
    if (span < 0.5) { $('sweep').setAttribute('d', ''); return; }
    const big = span > 180 ? 1 : 0, rO = 192, rI = 108;
    const [ox0, oy0] = pt(rO, A0), [ox1, oy1] = pt(rO, a1);
    const [ix0, iy0] = pt(rI, A0), [ix1, iy1] = pt(rI, a1);
    $('sweep').setAttribute('d',
        `M${f1(ox0)} ${f1(oy0)} A${rO} ${rO} 0 ${big} 1 ${f1(ox1)} ${f1(oy1)} ` +
        `L${f1(ix1)} ${f1(iy1)} A${rI} ${rI} 0 ${big} 0 ${f1(ix0)} ${f1(iy0)} Z`);
}
function rpmLoop() {
    rpmCur += (rpmTarget - rpmCur) * 0.35;
    if (Math.abs(rpmTarget - rpmCur) < 0.0015) rpmCur = rpmTarget;
    drawRpm(rpmCur);
    rpmRAF = rpmCur === rpmTarget ? null : requestAnimationFrame(rpmLoop);
}
function renderRpm(f) {
    rpmTarget = Math.max(0, Math.min(1, f));
    if (!rpmRAF) rpmRAF = requestAnimationFrame(rpmLoop);
}
drawRpm(0);

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
    seatbelt: [[1318.5, 0, 0.25], [1046.5, 0.2, 0.3], [1318.5, 0.6, 0.25], [1046.5, 0.8, 0.4]],
    fuel: [[880, 0, 0.3], [698.5, 0.26, 0.3], [523.25, 0.52, 0.55]]
};
function playChime(type) { (CHIMES[type] || []).forEach(n => tone(n[0], n[1], n[2])); }
window.playChime = playChime;

const seatbeltAudio = new Audio(CONFIG.seatbeltSound);
seatbeltAudio.loop = true;
seatbeltAudio.volume = CONFIG.seatbeltVolume;
let seatbeltFallbackTimer = null;
let seatbeltFileOK = true;
seatbeltAudio.addEventListener('error', () => { seatbeltFileOK = false; });

function startSeatbeltSound() {
    if (seatbeltFileOK) {
        seatbeltAudio.play().catch(() => {});
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

// ===================== INTRO =====================
let logoOK = false, introActive = false, introId = 0, lastRPM = 0;

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

    // Self-test: jarum menyapu penuh lalu kembali
    setTimeout(() => {
        if (!alive()) return;
        tween(0, 1, 1100, renderRpm, () => {
            if (alive()) tween(1, 0, 1100, renderRpm);
        });
    }, 300);

    setTimeout(() => { if (alive()) $('intro').classList.remove('show'); }, 2800);
    setTimeout(() => {
        if (!alive()) return;
        introActive = false;
        $('hud').classList.remove('booting');
        window.setRPM(lastRPM);
    }, 3000);
}
window.playIntro = playIntro;

// ===================== API UNTUK JGRP / CEF =====================

// 1. Kecepatan (m/s)
window.setSpeed = function (speed) {
    $('speed').textContent = Math.min(999, Math.round(Number(speed || 0) * SPEED_FACTOR));
};

// 2. RPM (0.0 - 1.0) -> jarum + sapuan
window.setRPM = function (rpm) {
    lastRPM = rpm;
    if (introActive) return;
    renderRpm(Number(rpm || 0));
};

// 3. Bensin (kiri)
let fuelIsLow = false, fuelTimer = null;
window.setFuel = function (fuel) {
    const val = Number(fuel || 0);
    const p = Math.max(0, Math.min(1, val > 1 ? val / 100 : val));
    $('fuel-value').textContent = Math.round(p * 100);
    setBar(fuelSegs, p);
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

// 4. Engine health (kanan)
window.setHealth = function (health) {
    const val = Number(health || 0);
    const p = Math.max(0, Math.min(1, val > 1 ? val / 1000 : val));
    $('health-value').textContent = Math.round(p * 100);
    setBar(healthSegs, p);
    $('health-group').setAttribute('class', 'side' + (p <= 0.25 ? ' danger' : p <= 0.5 ? ' warn' : ''));
};

// 5. Gear (0 = R, 'N' = netral, 1..n)
window.setGear = function (gear) {
    $('gear').textContent = (gear === 'N' || gear === 'n') ? 'N' : (gear == 0 ? 'R' : String(gear));
};

// 6. Lampu (0 = mati, 1 = dekat, 2 = jauh)
window.setHeadlights = function (state) {
    const v = Number(state || 0);
    $('headlight').className = 'icon headlight' + (v === 2 ? ' high-beam' : v === 1 ? ' active' : '');
};

// 7. Seatbelt
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

// 9. Kunci kontak / mesin nyala (ikon bawah)
window.setEngine = function (state) {
    $('engine').className = 'icon' + (isTrue(state) ? ' on' : '');
};

// 10. Sein
window.setTurnSignal = function (dir) {
    $('sig-left').className = 'icon' + (dir === 'left' || dir === 'both' ? ' signal' : '');
    $('sig-right').className = 'icon' + (dir === 'right' || dir === 'both' ? ' signal' : '');
};

// ===================== START =====================
setFuel(1); setHealth(1000);
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
        setHealth(1000 - (Math.sin(t * 0.3) * 0.5 + 0.5) * 800);
        fuel = Math.max(0, fuel - 0.0004); setFuel(fuel);
        odo += mps * 0.00002; setOdometer(odo);
    }, 50);
}
