// Beautiful UI recipes: a short "press" for theme buttons, an ascending "page" for links.
// Shared by theme buttons and sidebar navigation; playback requires user activation.
let context: AudioContext | undefined;
let output: GainNode | undefined;
let noise: AudioBuffer | undefined;
const soundKey = "codex-pulse:sounds:v1";

export function setInterfaceSound(enabled: boolean): void {
  try { localStorage.setItem(soundKey, enabled ? "on" : "off"); } catch {}
}

export function interfaceSoundEnabled(): boolean {
  try { return localStorage.getItem(soundKey) !== "off"; } catch { return true; }
}

export function playHoverSound(): void {
  // Hover alone must never unlock audio or resume a suspended browser context.
  if (context?.state === "running") playSound("tick");
}

export function playClickSound(): void {
  playSound("press");
}

export function playNavigationSound(): void {
  playSound("page");
}

function playSound(kind: "press" | "page" | "tick"): void {
  try {
    if (!interfaceSoundEnabled()) return;
    const AudioContextClass = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!context || context.state === "closed") {
      context = new AudioContextClass();
      output = context.createGain();
      output.gain.value = 0.32;
      output.connect(context.destination);
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.2), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = 2 * Math.random() - 1;
    }
    const audio = context;
    const master = output!;
    const buffer = noise!;

    function synthesize() {
      if (audio.state !== "running") return;
      const start = audio.currentTime;
      function envelope(gain: number, attack: number, decay: number) {
        const node = audio.createGain();
        node.gain.setValueAtTime(0.0001, start);
        node.gain.linearRampToValueAtTime(gain, start + attack);
        node.gain.setTargetAtTime(0.0001, start + attack, decay / 3);
        node.connect(master);
        return node;
      }

      if (kind === "tick") {
        const click = audio.createBufferSource();
        click.buffer = buffer;
        const filter = audio.createBiquadFilter();
        filter.type = "bandpass"; filter.frequency.value = 5400; filter.Q.value = 1.8;
        const clickGain = envelope(0.14, 0.001, 0.018);
        click.connect(filter); filter.connect(clickGain);
        click.onended = () => { click.disconnect(); filter.disconnect(); clickGain.disconnect(); };
        click.start(start); click.stop(start + 0.119);
        const tone = audio.createOscillator();
        tone.type = "sine";
        tone.frequency.value = 2600;
        const gain = envelope(0.018, 0.001, 0.012);
        tone.connect(gain);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(start); tone.stop(start + 0.12);
        return;
      }
      if (kind === "page") {
        const tone = audio.createOscillator();
        const duration = 0.002 + 0.11 + 0.03;
        tone.type = "sine";
        tone.frequency.setValueAtTime(430, start);
        tone.frequency.exponentialRampToValueAtTime(640, start + duration);
        const gain = envelope(0.4, 0.002, 0.11);
        tone.connect(gain);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(start);
        tone.stop(start + duration + 0.1);
        return;
      }

      const click = audio.createBufferSource();
      click.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 2400;
      filter.Q.value = 1;
      const clickGain = envelope(0.13, 0.0003, 0.009);
      click.connect(filter);
      filter.connect(clickGain);
      click.onended = () => { click.disconnect(); filter.disconnect(); clickGain.disconnect(); };
      click.start(start);
      click.stop(start + 0.0003 + 0.009 + 0.1);

      const tone = audio.createOscillator();
      tone.type = "sine";
      tone.frequency.value = 680;
      const toneGain = envelope(0.24, 0.0006, 0.022);
      tone.connect(toneGain);
      tone.onended = () => { tone.disconnect(); toneGain.disconnect(); };
      tone.start(start);
      tone.stop(start + 0.0006 + 0.022 + 0.008 + 0.1);
    }

    if (audio.state !== "running") void audio.resume().then(synthesize).catch(() => {});
    else synthesize();
  } catch {
    // Audio can be disabled by the browser; the control must still work.
  }
}
