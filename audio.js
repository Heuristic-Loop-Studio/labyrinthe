// Audio is created only after a user gesture. Gameplay also works without sound.
export class SonarAudio {
  constructor(muted = false) {
    this.muted = muted;
    this.context = null;
    this.master = null;
  }

  async unlock() {
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.2;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.ratio.value = 5;
        this.master.connect(compressor);
        compressor.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // Audio can be unavailable or blocked. Never prevent visual gameplay.
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.2, this.context.currentTime, 0.025);
  }

  tone(frequency, duration, offset = 0, volume = 0.5) {
    if (!this.context || this.context.state !== 'running' || this.muted) return;
    const now = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  pulse(wave, index) {
    const duration = 0.35 + index * 0.3;
    this.tone(wave.frequency, duration);
    this.tone(wave.frequency * 1.5, duration * 0.8, 0.11, 0.15);
    this.tone(wave.frequency, duration * 0.65, 0.23 + index * 0.08, 0.07);
  }

  victory() {
    [330, 440, 660].forEach((frequency, index) => this.tone(frequency, 0.6, index * 0.16, 0.3));
  }
}
