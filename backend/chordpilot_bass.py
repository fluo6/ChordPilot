"""Monophonic bass fundamentals, separate from the spectrum's harmonic peaks."""
from __future__ import annotations

import math
from typing import Any

from chordpilot_common import PITCH_NAMES


def periodic_bass_pitch(chunk: Any, sr: float, np: Any, minimum_duration: float = .075) -> tuple[int, float, float] | None:
    """YIN cumulative normalized difference; earliest good period avoids suboctaves.

    This is a monophonic estimate for a separated stem, not polyphonic transcription.
    Reference: de Cheveigne & Kawahara (2002), YIN, JASA 111, 1917–1930.
    """
    x = np.asarray(chunk, dtype=np.float64)
    x = x - x.mean()
    count = len(x)
    if count < sr * minimum_duration or float(np.sqrt(np.mean(x * x))) < 1e-5:
        return None
    maximum = min(count // 2, math.ceil(sr / 27.5))
    minimum = 2  # Inspect upper bleed too; excluding it can force a false suboctave.
    fft_size = 1 << (count * 2 - 1).bit_length()
    correlation = np.fft.irfft(abs(np.fft.rfft(x, fft_size)) ** 2, fft_size)[:maximum + 1]
    energy = np.r_[0, np.cumsum(x * x)]
    lags = np.arange(maximum + 1)
    difference = np.maximum(0, energy[count - lags] + energy[count] - energy[lags] - 2 * correlation)
    normalized = np.ones(maximum + 1)
    normalized[1:] = difference[1:] * lags[1:] / np.maximum(np.cumsum(difference[1:]), 1e-20)
    troughs = [i for i in range(minimum, maximum)
               if normalized[i] < normalized[i - 1] and normalized[i] <= normalized[i + 1]]
    strong = [i for i in troughs if normalized[i] < .15]
    lag = strong[0] if strong else min(troughs, key=lambda i: normalized[i], default=maximum)
    # A loud partial can itself pass the first-period threshold. Prefer the
    # longer integral period only when it explains the waveform substantially
    # better. Equal minima of a pure tone must not create a lower octave.
    deeper = [i for i in troughs if 2 <= round(i / lag) <= 6 and abs(i / lag - round(i / lag)) < .08
              and normalized[i] < normalized[lag] * .25 and normalized[lag] - normalized[i] > .015]
    spectrum = abs(np.fft.rfft(x * np.hanning(count), fft_size))
    threshold = float(spectrum.max()) * .08

    def supported(frequency):
        index = round(frequency * fft_size / sr)
        return float(spectrum[max(0, index - 1):min(len(spectrum), index + 2)].max(initial=0)) >= threshold

    if deeper:
        # A pure upper tone's integer-lag interpolation error must not invent a
        # lower octave. Require a measured root or two coprime partials (2 + 3).
        deeper = [i for i in deeper if supported(sr / i)
                  or (supported(2 * sr / i) and supported(3 * sr / i))]
        if deeper:
            lag = min(deeper)
    if normalized[lag] > .2 or lag == maximum:
        return None
    left, center, right = normalized[lag - 1:lag + 2]
    denominator = left - 2 * center + right
    delta = .5 * (left - right) / denominator if denominator else 0
    frequency = sr / (lag + float(np.clip(delta, -.5, .5)))
    if not (supported(frequency) or (supported(2 * frequency) and supported(3 * frequency))):
        return None  # Validate even the first period; it can already be an alias.
    fractional_midi = 69 + 12 * math.log2(frequency / 440)
    midi = round(fractional_midi)
    if not 21 <= midi <= 67 or abs(fractional_midi - midi) > .4:
        return None  # Do not engrave a noisy attack or glide as a chromatic passing note.
    return midi, float(1 - center), frequency


def bass_noise_floor(audio: Any, sr: float, np: Any) -> float:
    """Calibrate amplitude from the recording, never pitch from outside a selection."""
    from scipy.signal import resample_poly
    factor = max(1, int(sr / 5500))
    if factor > 1:
        audio, sr = resample_poly(audio, 1, factor), sr / factor
    # Use the same bandwidth and frame length as the pitch tracker's level gate;
    # upper-frequency bleed must not raise only the local-study threshold.
    frame = max(1, round(sr * .06) * 2)
    levels = [float(np.sqrt(np.mean(audio[offset:offset + frame] ** 2)))
              for offset in range(0, len(audio), frame)]
    return max(1e-4, float(np.percentile(levels, 95)) * .005) if levels else 1e-4


def split_bass_reattacks(notes: list[dict[str, Any]], signal: Any, rate: float, start: float,
                        noise_floor: float, np: Any) -> list[dict[str, Any]]:
    """Split an already verified pitch only after a short mute and renewed attack."""
    from scipy.signal import find_peaks
    energy = np.r_[0., np.cumsum(signal * signal, dtype=np.float64)]
    hop = max(1, round(rate * .005))
    result = []
    for note in notes:
        cuts = []
        if note['end'] - note['start'] >= .22:
            centers = np.arange(round((note['start']-start)*rate), round((note['end']-start)*rate), hop)
            half = round(rate * max(.015, min(.04, 1 / note['frequency_hz'])) / 2)
            left, right = np.maximum(0, centers-half), np.minimum(len(signal), centers+half)
            level = np.sqrt(np.maximum(0, energy[right]-energy[left]) / np.maximum(1, right-left))
            dips, _ = find_peaks(-level, distance=max(1, round(.10*rate/hop)),
                                prominence=max(noise_floor, float(level.max())*.12))
            for index in dips:
                time = start + centers[index]/rate
                if time-note['start'] < .10 or note['end']-time < .08:
                    continue
                before = level[max(0,index-12):index]
                after = level[index+1:index+5]
                if not len(before) or not len(after):
                    continue
                high_before, high_after = float(before.max()), float(after.max())
                if level[index] > min(high_before, high_after)*.55 or high_after < max(noise_floor*4, high_before*.35):
                    continue
                # A renewed pluck reaches most of its level within 20 ms. A
                # smooth tremolo valley can be deep but keeps rising gradually.
                if high_after < float(level[index+1:index+13].max())*.8:
                    continue
                center = centers[index]+round(rate*.045)
                radius = round(rate*.04)
                pitch = periodic_bass_pitch(signal[max(0,center-radius):min(len(signal),center+radius)],rate,np)
                if pitch and pitch[0] == note['midi'] and pitch[1] >= .9:
                    cuts.append(round(time+.005,6))
        bounds = [note['start'], *cuts, note['end']]
        for left, right in zip(bounds,bounds[1:]):
            result.append({**note, 'start':left, 'end':right, 'attack_start':left})
    return result


def bass_note_events(audio: Any, sr: int, np: Any, start: float = 0, end: float | None = None,
                     noise_floor: float | None = None) -> list[dict[str, Any]]:
    """Track 120 ms frames with an 80 ms short-note rescue, every 20 ms."""
    from scipy.signal import resample_poly
    start = max(0., start)
    end = min(len(audio) / sr, end if end is not None else len(audio) / sr)
    crop = audio[math.ceil(start * sr):math.floor(end * sr)]
    if len(crop) < sr * .075:
        return []
    factor = max(1, int(sr / 5500))
    signal = resample_poly(crop, 1, factor) if factor > 1 else crop
    rate = sr / factor
    half, hop = round(rate * .06), max(1, round(rate * .02))
    if noise_floor is None:
        # Whole-track tracking keeps its established resampled calibration.
        # A local selection inherits recording context rather than amplifying
        # a quiet artifact into a confident note by resetting the relative gate.
        noise_floor = bass_noise_floor(signal, rate, np) if start == 0 and end == len(audio) / sr else bass_noise_floor(audio, sr, np)
    frames = []
    for center in range(hop // 2, len(signal), hop):
        chunk = signal[max(0, center - half):min(len(signal), center + half)]
        pitch = periodic_bass_pitch(chunk, rate, np) if float(np.sqrt(np.mean(chunk ** 2))) >= noise_floor else None
        primary = pitch is not None
        if pitch is None and float(np.sqrt(np.mean(chunk ** 2))) >= noise_floor:
            # A long frame can straddle both neighbours of an audible short note.
            # Keep the same periodicity / tuning checks on a shorter rescue frame.
            short_half = round(rate * .04)
            pitch = periodic_bass_pitch(signal[max(0, center-short_half):min(len(signal), center+short_half)], rate, np)
        frames.append((center, pitch, primary))
    notes = []
    for center, pitch, primary in frames:
        if pitch is None:
            continue
        midi, confidence, frequency = pitch
        left = max(start, start + (center - hop / 2) / rate)
        right = min(end, start + (center + hop / 2) / rate)
        if notes and notes[-1]['midi'] == midi and left - notes[-1]['end'] < .001:
            note = notes[-1]
            note['end'] = right
            note['_confidences'].append(confidence)
            note['_frequencies'].append(frequency)
            note['_primary_support'] += int(primary)
        else:
            notes.append({'start': left, 'end': right, 'midi': midi,
                          '_confidences': [confidence], '_frequencies': [frequency], '_primary_support': int(primary)})
    retained = []
    retained_levels = []
    retained_core_ends = []
    previous = None
    for index, note in enumerate(notes):
        prior, previous = previous, note
        if note['end'] - note['start'] < .039:
            continue
        primary_support = note.pop('_primary_support')
        confidence = float(np.mean(note['_confidences']))
        duration = note['end'] - note['start']
        if duration < .16:
            frequencies = note['_frequencies']
            following = notes[index + 1] if index + 1 < len(notes) else None
            if prior and following and len(frequencies) >= 2:
                before_step = note['midi'] - prior['midi']
                after_step = following['midi'] - note['midi']
                core = frequencies[1:-1] if len(frequencies) >= 4 else frequencies
                drift = 1200 * math.log2(core[-1] / core[0]) / max((len(core) - 1) * hop / rate, 1e-9)
                sliding = (0 < abs(before_step) <= 2 and 0 < abs(after_step) <= 2 and before_step * after_step > 0
                    and drift * before_step > 0 and abs(drift) > 500
                    and note['start'] - prior['end'] < .1 and following['start'] - note['end'] < .1)
                if sliding:
                    # Long windows smear fast, separately held chromatic notes.
                    # A slide must still be moving in the shorter central windows.
                    center = round(((note['start'] + note['end']) / 2 - start) * rate)
                    short_half = round(rate * .03)
                    early, late = [periodic_bass_pitch(signal[max(0,c-short_half):c+short_half], rate, np, .05)
                                   for c in (center-hop//2, center+hop//2)]
                    sliding = bool(early and late and
                        1200 * math.log2(late[2] / early[2]) / (hop / rate) * before_step > 500 * abs(before_step))
                if sliding:
                    first = round((note['start'] - start) * rate)
                    before = [float(np.sqrt(np.mean(signal[i:i+hop] ** 2)))
                              for i in range(max(0, first-hop*4), first, hop) if i+hop <= len(signal)]
                    during = [float(np.sqrt(np.mean(signal[i:i+hop] ** 2)))
                              for i in range(first, min(len(signal)-hop+1, first+hop*3), hop)]
                    if before and during and max(during) < max(noise_floor, min(before)) * 1.4:
                        continue  # A pitch passing through this semitone is not a new played note.
            low, high = np.percentile(frequencies, [25,75]) if len(frequencies) >= 4 else (min(frequencies),max(frequencies))
            span = 1200 * math.log2(high / low)
            if span > 40 or (0 < primary_support < 3 and confidence < .9 and span > 15):
                continue  # Passing through a semitone while sliding is not a held pitch.
            if confidence < .9 or not primary_support:
                center = round(((note['start']+note['end'])/2-start)*rate)
                crop = signal[max(0,center-round(rate*.04)):center+round(rate*.04)]
                size = 1 << (len(crop)*2-1).bit_length()
                spectrum = abs(np.fft.rfft(crop*np.hanning(len(crop)),size))
                frequency = float(np.median(frequencies))
                def supported(harmonic):
                    peak = round(frequency*harmonic*size/rate)
                    return spectrum[max(0,peak-1):peak+2].max(initial=0) >= spectrum.max()*.3
                harmonic_core = len(frequencies)>=3 and span<=15 and supported(2) and supported(3)
                if not supported(1) and not harmonic_core:
                    continue  # Reject aliases; a stable 2+3 pair can prove a missing root.
        crop = signal[round((note['start']-start)*rate):round((note['end']-start)*rate)]
        note_level = float(np.sqrt(np.mean(crop**2)))
        recent_level = max((level for core_end, level in zip(retained_core_ends, retained_levels)
                            if note['start']-core_end < .6), default=0.)
        if note_level < recent_level * .1:
            first = round((note['start'] - start) * rate)
            before = signal[max(0, first - round(rate * .04)):first]
            fresh_attack = (retained and note['midi'] != retained[-1]['midi'] and duration >= .08
                            and primary_support >= 3 and note['start'] - retained_core_ends[-1] >= .06
                            and len(before) >= round(rate * .02)
                            and float(np.sqrt(np.mean(before ** 2))) < note_level * .25)
            if not fresh_attack:
                if retained and retained[-1]['midi'] == note['midi'] and note['start']-retained_core_ends[-1] < .6:
                    retained[-1]['end'] = round(note['end'], 6)
                continue  # Quiet ringing without a distinct attack is not a new note.
        release_prior = retained[-1] if retained else None
        if (release_prior and duration < .16 and note['start'] - release_prior['end'] < .08
                and 0 < abs(note['midi'] - release_prior['midi']) <= 2):
            first = round((note['start'] - start) * rate)
            last = round((note['end'] - start) * rate)
            context = round(rate * .06)
            before = signal[max(0, first - context):first]
            after = signal[last:min(len(signal), last + context)]
            if len(before) >= context // 2 and len(after) >= context // 2:
                level_before = float(np.sqrt(np.mean(before ** 2)))
                level_after = float(np.sqrt(np.mean(after ** 2)))
                level_during = max(float(np.sqrt(np.mean(signal[i:min(last, i + hop)] ** 2)))
                                   for i in range(first, last, hop))
                # A dying string can drift through neighboring semitones without
                # a new played note. Leave those short releases blank; a renewed
                # attack or a longer chromatic note is retained.
                following = next((other for other in notes[index+1:] if other['end']-other['start'] >= .15), None)
                preceding = retained[-1] if retained else None
                passing = (preceding and following and preceding['end']-preceding['start'] >= .15
                    and note['start']-preceding['end'] < .16 and following['start']-note['end'] < .16
                    and min(preceding['midi'], following['midi']) < note['midi'] < max(preceding['midi'], following['midi'])
                    and float(np.mean(note['_confidences'])) >= .9)
                if level_after < level_before * .7 and level_during < level_before * 1.25 and not passing:
                    continue
        note.pop('_confidences')
        note['confidence'] = round(confidence, 3)
        note['frequency_hz'] = round(float(np.median(note.pop('_frequencies'))), 2)
        note['note'] = f"{PITCH_NAMES[note['midi'] % 12]}{note['midi'] // 12 - 1}"
        note['start'], note['end'] = round(note['start'], 6), round(note['end'], 6)
        if retained and retained[-1]['midi'] == note['midi'] and note['start'] - retained[-1]['end'] <= .04:
            retained[-1]['end'] = note['end']
            retained_levels[-1] = max(retained_levels[-1], note_level)
            retained_core_ends[-1] = note['end']
        else:
            retained.append(note)
            retained_levels.append(note_level)
            retained_core_ends.append(note['end'])
    return split_bass_reattacks(retained, signal, rate, start, noise_floor, np)


def bass_reference_from_events(events: list[dict[str, Any]], start: float, end: float) -> dict[str, Any] | None:
    weights, frequencies, periodicity = {}, {}, {}
    for note in events:
        duration = max(0., min(end, note['end']) - max(start, note['start']))
        if not duration:
            continue
        midi = note['midi']
        weight = duration * note['confidence']
        weights[midi] = weights.get(midi, 0.) + weight
        frequencies[midi] = frequencies.get(midi, 0.) + weight * note['frequency_hz']
        periodicity[midi] = periodicity.get(midi, 0.) + duration
    total = sum(weights.values())
    if total < (end - start) * .2 or total <= 0:
        return None
    classes = {}
    for midi, weight in weights.items():
        classes[midi % 12] = classes.get(midi % 12, 0.) + weight
    root = max(classes, key=classes.get)
    midi = max((m for m in weights if m % 12 == root), key=weights.get)
    confidence = weights[midi] / periodicity[midi] * (.55 + .45 * classes[root] / total)
    confidence *= min(1., total / max((end - start) * .5, 1e-9))
    return {'pitch_class': root, 'note': PITCH_NAMES[root], 'midi': midi,
            'frequency_hz': round(frequencies[midi] / weights[midi], 2),
            'confidence': round(min(.98, confidence), 3), 'method': 'periodicity',
            'detected_notes': [{'note': PITCH_NAMES[pc], 'strength': round(weight / total, 3)}
                               for pc, weight in sorted(classes.items(), key=lambda item: -item[1])],
            'detected_pitches': [{'midi': m, 'note': f'{PITCH_NAMES[m % 12]}{m // 12 - 1}',
                                 'frequency_hz': round(frequencies[m] / weights[m], 2), 'strength': round(weight / total, 3)}
                                for m, weight in sorted(weights.items(), key=lambda item: -item[1])]}
