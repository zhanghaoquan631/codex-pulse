/**
 * Original short Web Audio cues for the paper-world combat.
 * Reference study: work/game-public.js uses transient noise + a low pitched body
 * for gunfire, and a separate rising confirmation for a kill. No source audio,
 * melodies, or reference implementation are imported here.
 *
 * Call unlock() directly from a click/pointer gesture, then setEnabled(true).
 * play() never starts/resumes a context or queues sounds while muted/suspended.
 * Supported types: shot/attack, hit, kill, coin/reward, enemySlowShot, bossAlert,
 * hurt, swing. A shot accepts {weaponId:'rifle'|'shotgun'}; kill accepts {boss:true}.
 * One shot call represents one trigger, including all six shotgun pellets.
 */
export function createCombatAudio() {
  let context = null, master = null, compressor = null, noiseBuffer = null;
  let enabled = false, disposed = false;
  const voices = new Set(), lastPlayed = new Map();
  const masterVolume = 0.24;
  const quiet = 0.0001;

  function release(voice) {
    voices.delete(voice);
    for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
  }

  function stopVoices(at) {
    for (const voice of [...voices]) {
      try { voice.source.stop(at); } catch { release(voice); }
    }
  }

  async function unlock() {
    if (disposed) return false;
    try {
      if (!context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return false;
        context = new AudioContextClass({latencyHint:'interactive'});
        master = context.createGain();
        master.gain.value = enabled ? masterVolume : 0;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 14;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        master.connect(compressor);
        compressor.connect(context.destination);
        noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.8), context.sampleRate);
        const noise = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
      }
      // Invoke resume before yielding so it retains the caller's user activation.
      if (context.state !== 'running') await context.resume();
      return !disposed && context?.state === 'running';
    } catch {
      return false;
    }
  }

  function setEnabled(value) {
    if (disposed) return false;
    enabled = Boolean(value);
    lastPlayed.clear();
    if (context && master) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(enabled ? masterVolume : 0, now, 0.006);
      if (!enabled) stopVoices(now + 0.025);
    }
    return enabled;
  }

  function envelope(gain, at, duration, amplitude, attack = 0.002) {
    gain.gain.setValueAtTime(quiet, at);
    gain.gain.linearRampToValueAtTime(amplitude, at + attack);
    gain.gain.exponentialRampToValueAtTime(quiet, at + duration);
  }

  function startVoice(source, nodes, at, duration, offset) {
    if (voices.size >= 48) {
      const oldest = [...voices][0];
      try { oldest.source.stop(); } catch {}
      release(oldest);
    }
    const voice = {source, nodes:[source, ...nodes]};
    voices.add(voice);
    source.onended = () => release(voice);
    if (offset === undefined) source.start(at); else source.start(at, offset);
    source.stop(at + duration + 0.02);
  }

  function tone(at, frequency, end, duration, amplitude, type = 'triangle') {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
    envelope(gain, at, duration, amplitude);
    oscillator.connect(gain); gain.connect(master);
    startVoice(oscillator, [gain], at, duration);
  }

  function noise(at, frequency, end, duration, amplitude, type = 'bandpass', q = 0.7) {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noiseBuffer; source.loop = true;
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(end, at + duration);
    envelope(gain, at, duration, amplitude);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    startVoice(source, [filter, gain], at, duration, Math.random() * 0.4);
  }

  function play(type, {weaponId = 'rifle', boss = false} = {}) {
    if (disposed || !enabled || !context || context.state !== 'running') return false;
    const aliases = {attack:'shot',rifle:'shot',shotgun:'shot',reward:'coin','enemy-shot':'enemySlowShot','boss-warning':'bossAlert','echo-warning':'bossAlert','boss-alert':'bossAlert'};
    if (type === 'shotgun') weaponId = 'shotgun';
    type = aliases[type] || type;
    const gaps = {shot:0.035,hit:0.035,kill:0.045,coin:0.08,enemySlowShot:0.07,bossAlert:0.85,hurt:0.16,swing:0.08};
    if (!Object.hasOwn(gaps, type)) return false;
    const at = context.currentTime;
    if (at - (lastPlayed.get(type) ?? -Infinity) < gaps[type]) return false;
    lastPlayed.set(type, at);
    try {
      if (type === 'shot') {
        if (weaponId === 'shotgun') {
          // A broader paper crack and longer low body distinguish one shell.
          noise(at, 1900, 360, 0.21, 0.48, 'lowpass');
          noise(at, 3400, 1900, 0.033, 0.2, 'highpass');
          tone(at, 124, 43, 0.24, 0.35);
          noise(at + 0.12, 1100, 650, 0.045, 0.065);
        } else if (weaponId === 'sword') {
          noise(at, 540, 2500, 0.13, 0.22);
        } else if (weaponId === 'staff') {
          tone(at, 510, 240, 0.18, 0.18, 'sine');
          noise(at, 1450, 580, 0.10, 0.12);
        } else if (weaponId === 'crossbow') {
          noise(at, 1700, 720, 0.055, 0.25);
          tone(at, 315, 110, 0.09, 0.12);
        } else {
          noise(at, 1750, 520, 0.085, 0.34);
          noise(at, 4200, 2500, 0.021, 0.14, 'highpass');
          tone(at, 188, 62, 0.09, 0.22);
        }
      } else if (type === 'hit') {
        // Quiet confirmation is shorter/brighter than either gunfire or a kill.
        noise(at, 2100, 950, 0.024, 0.10);
        tone(at, 1040, 740, 0.047, 0.115, 'sine');
      } else if (type === 'kill') {
        noise(at, 740, 170, 0.11, 0.13, 'lowpass');
        tone(at, 740, 740, 0.07, 0.17);
        tone(at + 0.075, 1110, 1110, 0.14, 0.15);
        if (boss) {
          tone(at + 0.18, 1480, 1480, 0.26, 0.14, 'sine');
          tone(at, 92, 42, 0.30, 0.22, 'sine');
        }
      } else if (type === 'coin') {
        tone(at, 1397, 1568, 0.075, 0.095, 'sine');
        tone(at + 0.075, 2093, 2093, 0.14, 0.08, 'sine');
      } else if (type === 'enemySlowShot') {
        // Hollow descending spit: clearly distinct from the player's crack.
        tone(at, boss ? 240 : 365, boss ? 83 : 135, 0.19, 0.17);
        noise(at, 930, 340, 0.11, 0.12, 'bandpass', 1.6);
      } else if (type === 'bossAlert') {
        for (let i = 0; i < 3; i++) {
          tone(at + i * 0.23, 185 + i * 36, 235 + i * 36, 0.17, 0.19);
          tone(at + i * 0.23, 370 + i * 72, 470 + i * 72, 0.17, 0.045, 'sine');
        }
        noise(at, 450, 170, 0.38, 0.12, 'lowpass');
      } else if (type === 'hurt') {
        tone(at, 155, 76, 0.17, 0.18);
        noise(at, 680, 260, 0.09, 0.14, 'lowpass');
      } else if (type === 'swing') {
        noise(at, 540, 2500, 0.13, 0.22);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true; enabled = false; lastPlayed.clear();
    if (!context) return;
    stopVoices(context.currentTime);
    for (const voice of [...voices]) release(voice);
    try { master?.disconnect(); compressor?.disconnect(); } catch {}
    try { if (context.state !== 'closed') await context.close(); } catch {}
    context = null; master = null; compressor = null; noiseBuffer = null;
  }

  return Object.freeze({unlock, setEnabled, play, dispose});
}
