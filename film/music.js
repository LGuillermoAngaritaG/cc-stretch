// The film's soundtrack, synthesized offline in the compositor page so every sound lands on its
// frame: a soft FM electric piano over one continuous pad per section, a music-box note for each
// word that pops into Nelson's sentence, quiet keys and clicks at the take's own typing and
// clicks, and a chiptune turn for the parody.
// window.renderMusic({ total, clicks, typing, tTerm, tEnd, pops }) resolves a 16-bit stereo WAV as base64.
window.renderMusic = async ({ total, clicks, typing, tTerm, tEnd, tTitle, pops, sections }) => {
	const { turn, nelson, quote, never } = sections;
	const RATE = 48000, BEAT = 60 / 96, BAR = BEAT * 4;
	const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
	const master = ctx.createDynamicsCompressor();
	master.threshold.value = -18; master.ratio.value = 2.5; master.attack.value = 0.02; master.release.value = 0.3;
	const out = ctx.createGain(); out.gain.value = 2.2;
	master.connect(out).connect(ctx.destination);

	// A soft room: decaying, lowpassed stereo noise as the impulse response.
	const room = ctx.createConvolver();
	const ir = ctx.createBuffer(2, RATE * 2.8, RATE);
	for (let c = 0; c < 2; c++) {
		const d = ir.getChannelData(c);
		let lp = 0;
		for (let i = 0; i < d.length; i++) { lp += 0.25 * ((Math.random() * 2 - 1) - lp); d[i] = lp * (1 - i / d.length) ** 2.5; }
	}
	room.buffer = ir;
	const wet = ctx.createGain(); wet.gain.value = 0.55;
	room.connect(wet).connect(master);
	const bus = (dry, send) => { const g = ctx.createGain(); g.gain.value = dry; g.connect(master); const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(room); return g; };
	const keys = bus(0.8, 0.5), pads = bus(0.7, 0.6), bells = bus(0.5, 0.8), fx = bus(0.6, 0.15);
	const chipTone = ctx.createBiquadFilter(); chipTone.type = 'lowpass'; chipTone.frequency.value = 5000;
	const chip = ctx.createGain(); chip.gain.value = 0.45; chip.connect(chipTone).connect(master);

	const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
	/** An electric piano note: a sine carrier whose brightness (FM index) decays with the note. */
	function ep(at, midi, vel = 0.12, len = 1.6, out = keys) {
		const car = ctx.createOscillator(), mod = ctx.createOscillator(), modGain = ctx.createGain(), amp = ctx.createGain();
		car.frequency.value = hz(midi); mod.frequency.value = hz(midi);
		modGain.gain.setValueAtTime(hz(midi) * 1.6, at);
		modGain.gain.exponentialRampToValueAtTime(hz(midi) * 0.15, at + 0.5);
		amp.gain.setValueAtTime(0, at);
		amp.gain.linearRampToValueAtTime(vel, at + 0.006);
		amp.gain.exponentialRampToValueAtTime(vel * 0.35, at + 0.4);
		amp.gain.exponentialRampToValueAtTime(0.0001, at + len);
		mod.connect(modGain).connect(car.frequency);
		car.connect(amp).connect(out);
		car.start(at); mod.start(at); car.stop(at + len + 0.05); mod.stop(at + len + 0.05);
	}
	/** A music-box bell: inharmonic FM, short and high. */
	function bell(at, midi, vel = 0.06) {
		const car = ctx.createOscillator(), mod = ctx.createOscillator(), modGain = ctx.createGain(), amp = ctx.createGain();
		car.frequency.value = hz(midi); mod.frequency.value = hz(midi) * 3.5;
		modGain.gain.setValueAtTime(hz(midi) * 2, at); modGain.gain.exponentialRampToValueAtTime(1, at + 1.2);
		amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(vel, at + 0.003); amp.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
		mod.connect(modGain).connect(car.frequency); car.connect(amp).connect(bells);
		car.start(at); mod.start(at); car.stop(at + 1.5); mod.stop(at + 1.5);
	}
	/** One continuous pad across [a, b], moving through `chords` (one per bar) with crossfades. */
	function pad(a, b, chords, vel = 0.03) {
		const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.4;
		f.connect(pads);
		let bar = 0;
		for (let at = a; at < b - 0.05; at += BAR, bar++) {
			const end = Math.min(b, at + BAR);
			const g = ctx.createGain();
			const fadeIn = bar === 0 ? 0.8 : 0.35, fadeOut = end >= b - 0.01 ? 0.8 : 0.35;
			g.gain.setValueAtTime(0, at);
			g.gain.linearRampToValueAtTime(vel, at + fadeIn);
			g.gain.setValueAtTime(vel, Math.max(at + fadeIn, end - 0.01));
			g.gain.linearRampToValueAtTime(0, end + fadeOut);
			g.connect(f);
			for (const m of chords[bar % chords.length]) for (const detune of [-6, 6]) {
				const o = ctx.createOscillator();
				o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = detune;
				const soft = ctx.createGain(); soft.gain.value = 0.25;
				o.connect(soft).connect(g); o.start(at); o.stop(end + fadeOut + 0.05);
			}
		}
	}
	function sub(at, midi, len, vel = 0.08) {
		const o = ctx.createOscillator(), g = ctx.createGain();
		o.frequency.value = hz(midi);
		g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel, at + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
		o.connect(g).connect(master); o.start(at); o.stop(at + len + 0.05);
	}
	/** A soft tick, a key or a mouse button: a short, low-passed knock with a little body under it. */
	function tick(at, freq, vel) {
		const len = 0.03, b = ctx.createBuffer(1, Math.ceil(RATE * len), RATE), d = b.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (RATE * 0.004));
		const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), soft = ctx.createBiquadFilter(), g = ctx.createGain();
		s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 2.5; soft.type = 'lowpass'; soft.frequency.value = 3200; g.gain.value = vel;
		s.connect(f).connect(soft).connect(g).connect(fx); s.start(at);
		const body = ctx.createOscillator(), bg = ctx.createGain();
		body.frequency.value = freq / 8;
		bg.gain.setValueAtTime(vel * 0.5, at); bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
		body.connect(bg).connect(fx); body.start(at); body.stop(at + 0.05);
	}
	function square(at, midi, len, vel = 0.035, type = 'square') {
		const o = ctx.createOscillator(), g = ctx.createGain();
		o.type = type; o.frequency.value = hz(midi);
		g.gain.setValueAtTime(vel, at); g.gain.setValueAtTime(vel, at + len * 0.8); g.gain.linearRampToValueAtTime(0, at + len * 0.95);
		o.connect(g).connect(chip); o.start(at); o.stop(at + len);
	}

	// D major: Dmaj9, Bm9, Gmaj7, A6sus, voiced in the middle register.
	const CHORDS = [[50, 57, 61, 64, 66], [47, 54, 57, 61, 62], [43, 50, 54, 57, 59], [45, 52, 57, 59, 62]];
	const ROOTS = [38, 35, 31, 33];
	const parodyAt = tTitle + 5 + 1.55;

	// 0-5 s, the opening: a pad and a light, slightly too busy piano, like the reply on screen.
	pad(0, turn + 0.2, CHORDS.slice(0, 2), 0.022);
	for (let i = 0; i < 16; i++) ep(0.2 + i * BEAT / 2, CHORDS[Math.floor(i / 8)][(i * 3) % 5] + 12, 0.05 + 0.002 * i, 0.9);
	// The archive: almost nothing.
	pad(turn, nelson + 0.4, [[50, 57, 62]], 0.03);
	ep(turn + 0.2, 74, 0.07, 2.5);
	// 1967: a held drone, and a music-box note for every word that pops into a gap.
	pad(nelson, never + 0.4, [[38, 50, 57]], 0.025);
	const BOX = [74, 76, 78, 81, 83, 86, 88, 90];
	(pops ?? []).forEach((t, i) => bell(t, BOX[i % BOX.length], 0.05));
	for (let t = quote + 0.1, i = 0; t < quote + 1.7; t += 0.18, i++) bell(t, BOX[BOX.length - 1 - (i % BOX.length)], 0.03);
	// It never caught on; then Clawd arrives with a two-note chirp.
	pad(never, tTerm + 0.4, [CHORDS[2]], 0.03);
	square(never + 1.4, 84, 0.08); square(never + 1.52, 91, 0.12);
	// The take: the electric piano walks the progression, one gentle chord per bar.
	pad(tTerm, tEnd + 0.4, CHORDS, 0.024);
	for (let bar = 0, at = tTerm; at < tEnd; bar++, at = tTerm + bar * BAR) {
		const chord = CHORDS[bar % 4];
		sub(at, ROOTS[bar % 4], BAR * 0.9);
		[0, 1.5, 2, 3].forEach((beat, i) => { if (at + beat * BEAT < tEnd) ep(at + beat * BEAT, chord[(i * 2 + 1) % 5] + 12, i === 0 ? 0.08 : 0.055, 1.2); });
	}
	for (const [a, b] of typing) for (let t = a; t < b; t += 0.09 + Math.random() * 0.04) tick(t, 1600 + Math.random() * 300, 0.18);
	for (const t of clicks) { tick(t, 1300, 0.4); tick(t + 0.07, 1100, 0.3); }
	// The number: the progression holds on its fourth chord.
	pad(tEnd, tTitle + 0.4, [CHORDS[3]], 0.03);
	bell(tEnd + 0.3, 81, 0.04); bell(tEnd + 0.6, 85, 0.035);
	// The launch card: the tonic, held, and one bell.
	pad(tTitle, parodyAt, [[50, 57, 61, 64, 69]], 0.035);
	ep(tTitle + 0.15, 62, 0.08, 4); ep(tTitle + 0.15, 66, 0.06, 4); ep(tTitle + 0.15, 69, 0.06, 4);
	bell(tTitle + 0.4, 86, 0.05);
	// The parody: the tape stops, then an eight-bit victory lap.
	const stop = ctx.createOscillator(), stopGain = ctx.createGain();
	stop.type = 'triangle'; stop.frequency.setValueAtTime(220, parodyAt - 0.2); stop.frequency.exponentialRampToValueAtTime(40, parodyAt + 0.15);
	stopGain.gain.setValueAtTime(0.12, parodyAt - 0.2); stopGain.gain.linearRampToValueAtTime(0, parodyAt + 0.15);
	stop.connect(stopGain).connect(master); stop.start(parodyAt - 0.2); stop.stop(parodyAt + 0.2);
	const LEAD = [72, 76, 79, 84, 79, 76, 79, 84, 86, 84, 79, 76, 74, 76, 79, 72];
	const BASS = [48, 48, 55, 55, 53, 53, 55, 55];
	for (let i = 0; parodyAt + 0.25 + i * 0.15 < total - 0.6; i++) {
		const at = parodyAt + 0.25 + i * 0.15;
		square(at, LEAD[i % LEAD.length], 0.14);
		if (i % 2 === 0) square(at, BASS[(i / 2) % BASS.length] - 12, 0.28, 0.05, 'triangle');
	}

	const rendered = await ctx.startRendering();
	const n = rendered.length, bytes = new DataView(new ArrayBuffer(44 + n * 4));
	const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes.setUint8(o + i, s.charCodeAt(i)); };
	str(0, 'RIFF'); bytes.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
	bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
	bytes.setUint32(24, RATE, true); bytes.setUint32(28, RATE * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
	str(36, 'data'); bytes.setUint32(40, n * 4, true);
	const ch = [rendered.getChannelData(0), rendered.getChannelData(1)];
	for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) bytes.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
	let s = '';
	const u = new Uint8Array(bytes.buffer);
	for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
	return btoa(s);
};
