export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: GainNode | null = null;
  private drone: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private mood = 0;
  private biome = 0;
  enabled = true;

  unlock() {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.enabled ? 0.2 : 0;
      this.master.connect(context.destination);

      this.ambient = context.createGain();
      this.ambient.gain.value = 0;
      this.ambient.connect(this.master);

      // Layered low drone: three detuned sines for a cold, hollow night.
      this.drone = context.createGain();
      this.drone.gain.value = 0.5;
      this.drone.connect(this.ambient);
      [55, 82.4, 110.3, 164.8].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index > 1 ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? 0.16 : 0.03;
        oscillator.connect(gain);
        gain.connect(this.drone!);
        oscillator.start();
      });

      // Filtered wind bed, raised in pitch by danger and coloured by biome.
      const seconds = 3;
      const buffer = context.createBuffer(
        1,
        context.sampleRate * seconds,
        context.sampleRate,
      );
      const channel = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < channel.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        channel[i] = last * 3.5;
      }
      this.filter = context.createBiquadFilter();
      this.filter.type = "bandpass";
      this.filter.frequency.value = 420;
      this.filter.Q.value = 0.6;
      const windGain = context.createGain();
      windGain.gain.value = 0.35;
      this.noise = context.createBufferSource();
      this.noise.buffer = buffer;
      this.noise.loop = true;
      this.noise.connect(this.filter);
      this.filter.connect(windGain);
      windGain.connect(this.ambient);
      this.noise.start();
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  setEnabled(enabled: boolean, ambience: boolean) {
    this.enabled = enabled;
    if (this.context && this.master && this.ambient) {
      this.master.gain.setTargetAtTime(
        enabled ? 0.2 : 0,
        this.context.currentTime,
        0.08,
      );
      this.ambient.gain.setTargetAtTime(
        ambience ? 0.85 : 0,
        this.context.currentTime,
        0.5,
      );
    }
  }

  /** 0 = calm refuge, 1 = maximum nightly tension. */
  setMood(level: number, biome = 0) {
    const next = Math.max(0, Math.min(1, level));
    const changed = Math.abs(next - this.mood) > 0.04 || biome !== this.biome;
    this.mood = next;
    this.biome = biome;
    if (!this.context || !this.filter || !this.drone || !changed) return;
    const now = this.context.currentTime;
    const biomeFreq = [460, 620, 340, 300, 520][Math.max(0, biome)] ?? 420;
    this.filter.frequency.setTargetAtTime(biomeFreq + next * 900, now, 1.4);
    this.filter.Q.setTargetAtTime(0.55 + next * 1.6, now, 1.4);
    this.drone.gain.setTargetAtTime(0.4 + next * 0.5, now, 1.2);
  }

  play(
    kind:
      | "shoot"
      | "shotgun"
      | "rifle"
      | "smg"
      | "reload"
      | "reloadDone"
      | "knife"
      | "hit"
      | "kill"
      | "sink"
      | "pickup"
      | "hurt"
      | "upgrade"
      | "dash"
      | "crit"
      | "levelup"
      | "chest"
      | "heart"
      | "wave"
      | "step",
  ) {
    if (!this.context || !this.master || !this.enabled) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(this.master);
    const data = {
      shoot: [230, 52, 0.07, 0.24],
      shotgun: [150, 32, 0.13, 0.32],
      rifle: [310, 62, 0.08, 0.25],
      smg: [370, 88, 0.05, 0.18],
      reload: [340, 520, 0.09, 0.14],
      reloadDone: [540, 880, 0.09, 0.18],
      knife: [680, 135, 0.17, 0.26],
      hit: [130, 50, 0.07, 0.12],
      kill: [200, 65, 0.12, 0.15],
      sink: [265, 34, 0.46, 0.2],
      pickup: [650, 1300, 0.13, 0.15],
      hurt: [100, 35, 0.2, 0.3],
      upgrade: [440, 1200, 0.35, 0.2],
      dash: [180, 50, 0.15, 0.12],
      crit: [920, 310, 0.11, 0.24],
      levelup: [392, 1175, 0.44, 0.24],
      chest: [523, 1568, 0.52, 0.25],
      heart: [72, 44, 0.17, 0.3],
      wave: [120, 320, 0.7, 0.22],
      step: [150, 90, 0.05, 0.05],
    }[kind];
    oscillator.type =
      kind === "pickup" ||
      kind === "upgrade" ||
      kind === "reloadDone" ||
      kind === "levelup" ||
      kind === "chest"
        ? "sine"
        : kind === "knife" ||
            kind === "shotgun" ||
            kind === "crit" ||
            kind === "wave" ||
            kind === "heart"
          ? "sawtooth"
          : "triangle";
    oscillator.frequency.setValueAtTime(data[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(data[1], now + data[2]);
    gain.gain.setValueAtTime(data[3], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + data[2]);
    oscillator.start(now);
    oscillator.stop(now + data[2]);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  dispose() {
    if (this.context) void this.context.close();
  }
}
