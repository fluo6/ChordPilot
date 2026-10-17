"""Compact spectral evidence shared by song analysis and Local Study."""
from __future__ import annotations

import math
from bisect import bisect_left
from typing import Any
from chordpilot_common import PITCH_NAMES


def spectral_power_for_crop(crop: Any, sr: int, np: Any) -> Any:
    """Windowed average FFT power on a fixed frequency grid."""
    frame = 2 ** math.ceil(math.log2(max(2048, sr * .5)))
    frequencies = np.fft.rfftfreq(frame, 1 / sr)
    power = np.zeros(len(frequencies))
    weight = 0
    for offset in range(0, len(crop), frame // 2):
        chunk = crop[offset:offset + frame]
        if len(chunk) < 3:
            continue
        window = np.hanning(len(chunk))
        energy = np.abs(np.fft.rfft(chunk * window, n=frame)) ** 2 / max(float((window ** 2).sum()), 1)
        power += energy * len(chunk)
        weight += len(chunk)
    if weight:
        power /= weight
    return power


def spectrum_from_power(power: Any, sr: int, np: Any, bin_count: int = 768,
                        reference_power: float | None = None) -> dict[str, Any]:
    frame = (len(power) - 1) * 2
    frequencies = np.fft.rfftfreq(frame, 1 / sr)
    high = min(4500, sr / 2)
    edges = np.geomspace(20, high, bin_count + 1)
    indices = np.searchsorted(frequencies, edges)
    values = np.asarray([float(power[left:right].max()) if right > left else 0 for left, right in zip(indices, indices[1:])])
    valid = (frequencies >= 20) & (frequencies <= high)
    maximum = float(power[valid].max()) if reference_power is None and valid.any() else float(reference_power or 0)
    levels = 10 * np.log10(np.maximum(values / maximum, 1e-8)) if maximum > 1e-16 else np.full(bin_count, -80.)
    peaks = []
    if maximum > 1e-16:
        candidates = np.flatnonzero((power[1:-1] > power[:-2]) & (power[1:-1] >= power[2:])) + 1
        candidates = [index for index in candidates if valid[index] and power[index] >= maximum * .004]
        for index in sorted(candidates, key=lambda value: power[value], reverse=True)[:24]:
            left, center, right = np.log(np.maximum(power[index - 1:index + 2], 1e-30))
            denominator = left - 2 * center + right
            adjustment = .5 * (left - right) / denominator if denominator else 0
            frequency = float((index + adjustment) * sr / frame)
            midi = round(69 + 12 * math.log2(frequency / 440))
            if 21 <= midi <= 108:
                peaks.append({"frequency_hz": round(frequency, 2), "midi": midi,
                              "note": f"{PITCH_NAMES[midi % 12]}{midi // 12 - 1}",
                              "level_db": round(10 * math.log10(float(power[index]) / maximum), 1)})
    return {"frequencies_hz": [round(float(value), 3) for value in np.sqrt(edges[:-1] * edges[1:])],
            "reference_power": maximum,
            "magnitudes_db": [round(float(value), 1) for value in levels],
            "peaks": sorted(peaks, key=lambda item: item["frequency_hz"])}


def spectrum_for_crop(crop: Any, sr: int, np: Any, bin_count: int = 768) -> dict[str, Any]:
    return spectrum_from_power(spectral_power_for_crop(crop, sr, np), sr, np, bin_count)


def reduce_sustain_tail(current: Any, previous: Any, elapsed: float, options: dict[str, Any], np: Any) -> tuple[Any, dict[str, Any]]:
    strength = float(options.get('tail_reduction', 0))
    half_life = float(options.get('tail_half_life', .5))
    applied = strength > 0 and previous is not None and len(previous) == len(current) and elapsed > 0
    decay = 2 ** (-elapsed / half_life) if applied else 0.
    reduced = np.maximum(0, current - strength * decay * previous) if applied else current.copy()
    total = float(current.sum())
    return reduced, {'applied': applied, 'strength': strength, 'half_life': half_life,
        'elapsed': round(float(elapsed), 6), 'decay_factor': decay,
        'removed_fraction': max(0., min(1., float((current - reduced).sum()) / total)) if total > 0 else 0.}


def chroma_from_power(power: Any, sr: int, np: Any, options: dict[str, Any]) -> Any:
    frequencies = np.fft.rfftfreq((len(power) - 1) * 2, 1 / sr)
    valid = (frequencies >= options.get('chroma_low_hz', 65)) & (frequencies <= options.get('chroma_high_hz', 1800))
    pitch_classes = np.round(69 + 12 * np.log2(frequencies[valid] / 440)).astype(int) % 12
    chroma = np.bincount(pitch_classes, weights=np.sqrt(power[valid]), minlength=12)
    return chroma / (float(chroma.sum()) or 1)


def apply_tail_to_chroma(original: Any, current_power: Any, reduced_power: Any, sr: int, np: Any, options: dict[str, Any]) -> Any:
    # Apply relative attenuation to the established chroma extractor, preserving its baseline.
    if np.array_equal(current_power, reduced_power):
        return original.copy()
    before = chroma_from_power(current_power, sr, np, options)
    after = chroma_from_power(reduced_power, sr, np, options)
    survival = np.divide(after, before, out=np.ones(12), where=before > 0)
    chroma = original * survival
    return chroma / (float(chroma.sum()) or 1)


def reduce_overtones(power: Any, sr: int, np: Any, strength: float) -> tuple[Any, dict[str, Any]]:
    """Conservatively downweight partials supported by a measured harmonic family."""
    reduced = power.copy()
    info = {'strength': strength, 'applied': False, 'removed_fraction': 0., 'families': []}
    maximum = float(power.max()) if len(power) else 0.
    if strength <= 0 or maximum <= 1e-16:
        return reduced, info
    frame = (len(power) - 1) * 2
    frequencies = np.fft.rfftfreq(frame, 1 / sr)
    indices = np.flatnonzero((power[1:-1] > power[:-2]) & (power[1:-1] >= power[2:])) + 1
    indices = [int(index) for index in indices if 20 <= frequencies[index] <= 4500 and power[index] >= maximum * .004]
    peaks = {}
    floors = {}
    for index in indices:
        left, center, right = np.log(np.maximum(power[index - 1:index + 2], 1e-30))
        denominator = left - 2 * center + right
        adjustment = .5 * (left - right) / denominator if denominator else 0.
        peaks[index] = (index + adjustment) * sr / frame
        floors[index] = float(np.median(power[max(0, index - 8):index + 9]))
    peak_indices = list(peaks)
    peak_frequencies = [peaks[index] for index in peak_indices]
    families = []
    for index, fundamental in peaks.items():
        if power[index] < maximum * .08 or power[index] < floors[index] * 8:
            continue
        partials = {}
        for harmonic in range(2, 7):
            target = fundamental * harmonic
            position = bisect_left(peak_frequencies, target)
            match = min(peak_indices[max(0, position - 1):position + 1],
                key=lambda candidate: abs(math.log2(peaks[candidate] / target)), default=None)
            if match is not None and abs(1200 * math.log2(peaks[match] / target)) <= 30 and power[match] >= floors[match] * 4:
                partials[harmonic] = match
        # A lone octave or fifth is insufficient evidence to call a note an overtone.
        if 2 in partials and 3 in partials and len(partials) >= 3:
            families.append((index, fundamental, partials))
    protected = {index for index, _, _ in families}
    gains = np.ones(len(power))
    # ponytail: an averaged harmonic-family heuristic; independent onsets need a future temporal model.
    for index, fundamental, partials in families:
        affected = []
        eligible = np.ones(len(power), dtype=bool)
        for neighbor in peak_indices:
            if power[neighbor] <= power[index]:
                continue
            frequency = peaks[neighbor]
            radius = max(2 * sr / frame, frequency * (2 ** (30 / 1200) - 1))
            left = int(np.searchsorted(frequencies, frequency - radius))
            right = int(np.searchsorted(frequencies, frequency + radius, side='right'))
            eligible[left:right] = False
        for harmonic, partial in partials.items():
            if partial in protected or power[partial] > power[index]:
                continue
            frequency = peaks[partial]
            radius = max(2 * sr / frame, frequency * (2 ** (30 / 1200) - 1))
            bins = (np.abs(frequencies - frequency) <= radius) & eligible
            # Keep at least 25% power even at maximum strength; overlapping notes remain possible.
            gains[bins] = np.minimum(gains[bins], 1 - .75 * strength)
            affected.append(harmonic)
        if affected:
            midi = round(69 + 12 * math.log2(fundamental / 440))
            info['families'].append({'fundamental_hz': round(float(fundamental), 2),
                'note': f'{PITCH_NAMES[midi % 12]}{midi // 12 - 1}', 'partials': affected})
    # Protect the whole measured root band, even when another partial's mask overlaps it.
    for index in protected:
        frequency = peaks[index]
        radius = max(2 * sr / frame, frequency * (2 ** (30 / 1200) - 1))
        gains[np.abs(frequencies - frequency) <= radius] = 1
    reduced *= gains
    total = float(power.sum())
    info['removed_fraction'] = float((power - reduced).sum()) / total if total else 0.
    info['applied'] = info['removed_fraction'] > 1e-9
    return reduced, info


def apply_overtone_weighting(evidence: dict[str, Any], chroma: Any, power: Any, sr: int,
                            np: Any, options: dict[str, Any], bin_count: int = 768) -> Any:
    strength = float(options.get('overtone_weighting', .5))
    if strength <= 0:
        return chroma
    weighted, info = reduce_overtones(power, sr, np, strength)
    evidence['overtone_weighting'] = info
    evidence['overtone_weighted_spectrum'] = spectrum_from_power(weighted, sr, np, bin_count,
        reference_power=evidence['spectrum']['reference_power'])
    if info['applied']:
        evidence['pre_overtone_detected_notes'] = evidence.get('detected_notes', [])
        evidence['pre_overtone_detected_pitches'] = evidence.get('detected_pitches', [])
        chroma = apply_tail_to_chroma(chroma, power, weighted, sr, np, options)
        from chordpilot_chords import chord_evidence
        adjusted = chord_evidence(chroma, 0, 0, '', np)
        evidence['detected_notes'] = adjusted['detected_notes']
        evidence['summary'] = adjusted['summary']
        evidence['detected_pitches'] = attenuate_detected_pitches(evidence['pre_overtone_detected_pitches'], power, weighted, sr, np, minimum_strength=0)
    return chroma



def detected_pitches_for_crop(crop: Any, sr: int, np: Any) -> list[dict[str, Any]]:
    """Keep spectral peaks in MIDI space instead of folding them into pitch classes."""
    # Spectral pitches can include instrumental overtones; they are not a played-note transcription.
    frame = 2 ** math.ceil(math.log2(max(2048, sr * .5)))
    frequencies = np.fft.rfftfreq(frame, 1 / sr)
    energy, frequency_sum = {}, {}
    for offset in range(0, len(crop), frame // 2):
        chunk = crop[offset:offset + frame]
        if len(chunk) < 3:
            continue
        # Window the actual crop before zero padding; never pull neighboring samples.
        spectrum = np.abs(np.fft.rfft(chunk * np.hanning(len(chunk)), n=frame))
        maximum = float(spectrum.max())
        if maximum <= 1e-9:
            continue
        peaks = np.flatnonzero((spectrum[1:-1] > spectrum[:-2]) & (spectrum[1:-1] >= spectrum[2:])) + 1
        for index in peaks:
            if spectrum[index] < maximum * .1 or not 20 <= frequencies[index] <= 4500:
                continue
            left, center, right = spectrum[index - 1:index + 2]
            denominator = left - 2 * center + right
            adjustment = .5 * (left - right) / denominator if denominator else 0
            frequency = float((index + adjustment) * sr / frame)
            midi = round(69 + 12 * math.log2(frequency / 440))
            if not 21 <= midi <= 108:
                continue
            weight = float(center ** 2 / len(chunk))
            energy[midi] = energy.get(midi, 0) + weight
            frequency_sum[midi] = frequency_sum.get(midi, 0) + frequency * weight
    total = sum(energy.values())
    return [{"midi": midi, "note": f"{PITCH_NAMES[midi % 12]}{midi // 12 - 1}",
             "frequency_hz": round(frequency_sum[midi] / energy[midi], 2), "strength": round(energy[midi] / total, 3)}
            for midi in sorted(energy, key=energy.get, reverse=True) if energy[midi] / total >= .02]


def attenuate_detected_pitches(pitches: list[dict[str, Any]], current: Any, reduced: Any, sr: int, np: Any, minimum_strength: float = .02) -> list[dict[str, Any]]:
    if np.array_equal(current, reduced):
        return pitches
    frequencies = np.fft.rfftfreq((len(current) - 1) * 2, 1 / sr)
    valid = (frequencies >= 20) & (frequencies <= 4500)
    midis = np.round(69 + 12 * np.log2(frequencies[valid] / 440)).astype(int)
    powers = {}
    for pitch in pitches:
        bins = midis == pitch['midi']
        before = float(current[valid][bins].sum())
        after = float(reduced[valid][bins].sum())
        powers[pitch['midi']] = pitch['strength'] * min(1., after / before) if before > 0 else pitch['strength']
    total = sum(powers.values())
    return [{**pitch, 'strength': round(powers[pitch['midi']] / total, 3)}
        for pitch in pitches if total > 0 and powers[pitch['midi']] > 0 and powers[pitch['midi']] / total >= minimum_strength]


def voicing_frames_for_crop(crop: Any, sr: int, np: Any, options: dict[str, Any],
                            current_power: Any = None, retained_power: Any = None) -> list[dict[str, Any]]:
    """Short stable register snapshots; never union sequential arpeggio pitches."""
    frame = round(sr * .32)
    if len(crop) < frame:
        return []
    current_power = spectral_power_for_crop(crop, sr, np) if current_power is None else current_power
    retained_power = current_power if retained_power is None else retained_power
    retained_power, _ = reduce_overtones(retained_power, sr, np, float(options.get('overtone_weighting', .5)))
    starts = range(0, len(crop) - frame + 1, frame // 2)
    if len(starts) == 1 and len(crop) >= round(sr * .4):
        starts = [0, len(crop) - frame]
    # ponytail: sample at most 64 slices in long studies; this is a shape hint, not transcription.
    if len(starts) > 64:
        starts = [starts[i] for i in np.linspace(0, len(starts) - 1, 64).astype(int)]
    result = []
    level = float(np.sqrt(np.mean(crop ** 2)))
    for start in starts:
        halves = []
        for part in (crop[start:start + frame // 2], crop[start + frame // 2:start + frame]):
            if float(np.sqrt(np.mean(part ** 2))) < max(1e-5, level * .08):
                halves.append([])
                continue
            pitches = attenuate_detected_pitches(detected_pitches_for_crop(part, sr, np),
                current_power, retained_power, sr, np)
            midis = sorted(p['midi'] for p in pitches if p['strength'] >= .06 and
                abs(1200 * math.log2(p['frequency_hz'] / (440 * 2 ** ((p['midi'] - 69) / 12)))) <= 25)
            halves.append(midis if 3 <= len(midis) <= 5 else [])
        stable = halves[0] if halves[0] == halves[1] else []
        if stable:
            # Matching FFT sets can still be a fast repeated arpeggio. Fit the
            # candidate frequencies in 40 ms slices and require each voice to
            # persist throughout; allow decay, but abstain on a disappearing voice.
            frequencies = 440 * 2 ** ((np.array(stable) - 69) / 12)
            amplitudes = []
            for part in np.array_split(crop[start:start + frame], 8):
                phase = 2 * np.pi * np.arange(len(part))[:, None] / sr * frequencies
                basis = np.column_stack((np.cos(phase), np.sin(phase), np.ones(len(part))))
                coefficients = np.linalg.lstsq(basis, part, rcond=None)[0]
                amplitudes.append(np.hypot(coefficients[:len(stable)], coefficients[len(stable):2 * len(stable)]))
            amplitudes = np.array(amplitudes)
            if np.any(amplitudes.min(axis=0) < amplitudes.max(axis=0) * .2):
                stable = []
        result.append({'start': round(start / sr, 4), 'end': round((start + frame) / sr, 4), 'midis': stable})
    return result


