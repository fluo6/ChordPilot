from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

output = Path(__file__).absolute().parents[2] / 'src/renderer/help'
half_life, step = .5, .25
decay = 2 ** (-step / half_life)
time = np.concatenate(([-.08, -.0001], np.linspace(0, 3, 1201)))
old = np.where(time >= 0, 2 ** (-time / half_life), 0)
new = np.where(time >= 1, .8 * 2 ** (-(time - 1) / half_life), 0)
samples = np.arange(0, 3.01, step)
raw = 2 ** (-samples / half_life) + np.where(samples >= 1, .8 * 2 ** (-(samples - 1) / half_life), 0)
tail = np.concatenate(([0], raw[:-1] * decay))
fresh = np.maximum(0, raw - tail)

plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11,
                     'axes.spines.top': False, 'axes.spines.right': False})
fig, axes = plt.subplots(2, 1, figsize=(11, 8.3), sharex=True)
fig.patch.set_facecolor('#fafbfc')
blue, amber, green, grey = '#277da8', '#b77400', '#16856d', '#697586'
for ax in axes:
    ax.set_facecolor('#fafbfc')
    ax.grid(axis='y', color='#dbe1e7', linewidth=.7)
    ax.axvline(1, color='#aeb8c5', linestyle=':', linewidth=1)
    ax.set_ylim(-.035, 1.17)
    ax.set_ylabel('Relative signal power')
    ax.set_xlim(-.08, 3)

axes[0].set_title('1  Physical sustain: a struck note keeps ringing as it fades', loc='left', fontweight='bold', pad=14)
axes[0].plot(time, old, color=blue, linewidth=2.5, label='First note: C')
axes[0].plot(time, new, color=amber, linewidth=2.5, label='Second note: E')
axes[0].plot(time, old + new, color=grey, linewidth=1.6, linestyle='--', label='Combined power')
axes[0].fill_between(time, 0, old, where=time >= 1, color=blue, alpha=.12)
axes[0].annotate('First note is struck', xy=(0, 1), xytext=(.17, 1.08), fontsize=10,
                 arrowprops={'arrowstyle': '->', 'color': blue}, color=blue)
axes[0].annotate('Half the power after 0.5 s\n(about -3 dB)', xy=(.5, .5), xytext=(.12, .72), fontsize=10,
                 arrowprops={'arrowstyle': '->', 'color': blue}, color=blue)
axes[0].annotate('E is struck while C still rings', xy=(1, 1.05), xytext=(1.26, 1.07), fontsize=10,
                 arrowprops={'arrowstyle': '->', 'color': amber}, color=amber)
axes[0].annotate('Lingering C tail', xy=(1.36, 2 ** (-1.36 / half_life)), xytext=(1.8, .34), fontsize=10,
                 arrowprops={'arrowstyle': '->', 'color': blue}, color=blue)
axes[0].legend(loc='upper right', bbox_to_anchor=(1, .85), frameon=False, fontsize=10)

axes[1].set_title('2  Optional subtraction: keep the energy that the old tail cannot explain', loc='left', fontweight='bold', pad=14)
axes[1].plot(samples, raw, '-o', color=grey, linewidth=1.8, markersize=4, label='Observed power')
axes[1].plot(samples, tail, '--o', color=blue, linewidth=1.6, markersize=3, label='Predicted tail: 0.707 x previous power')
axes[1].plot(samples, fresh, '-o', color=green, linewidth=2.5, markersize=5, label='Fresh power = max(0, observed - tail)')
axes[1].annotate('New E attack is retained', xy=(1, .8), xytext=(1.24, .87), fontsize=10,
                 arrowprops={'arrowstyle': '->', 'color': green}, color=green)
axes[1].annotate('A pure fading tail leaves\nno fresh power in this ideal model', xy=(2, 0), xytext=(1.45, .28), fontsize=10,
                 arrowprops={'arrowstyle': '->', 'color': green}, color=green)
axes[1].legend(loc='upper right', bbox_to_anchor=(1, .74), frameon=False, fontsize=9.5)
axes[1].set_xlabel('Time (seconds)')
axes[1].set_xticks(np.arange(0, 3.01, .25))
fig.suptitle('Sustain versus new-note energy', x=.09, ha='left', fontsize=19, fontweight='bold')
fig.text(.09, .025,
         'Illustrative envelopes, not a recording. Assumed power half-life: 0.5 s; analysis interval: 0.25 s.\n'
         'The lower panel shows optional Tail Reduction at 100%. Sustained chord stability is a separate setting.\n'
         'Actual subtraction would operate per frequency. C + E may belong to one arpeggio, so both notes can be useful.',
         fontsize=10, color='#475467', linespacing=1.5)
fig.subplots_adjust(top=.89, bottom=.18, left=.09, right=.97, hspace=.34)
fig.savefig(output / 'sustain-explained.svg')
