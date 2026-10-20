# Offline music engraving

`vexflow-bravura-4.2.5.js` is the unmodified `package/build/cjs/vexflow-bravura.js` from the official npm `vexflow@4.2.5` tarball. It bundles Bravura glyph outlines, so staff rendering needs no CDN or font download. VexFlow's MIT notice is in `VexFlow-LICENSE.txt`; Bravura's SIL OFL notice is in `Bravura-OFL.txt`.

Source/API: https://github.com/0xfe/vexflow/wiki/Tutorial

To update intentionally, fetch an explicitly pinned official npm package, copy its Bravura build and notices, then verify desktop/web rendering and engraving tests. The desktop package already includes `src/**/*`, and web serves the renderer directory.

`alphatab/alphaTab.min.js` is the unmodified browser/worker bundle from
`@coderline/alphatab@1.8.4`. Its bundled Bravura fonts are in `alphatab/font/`;
alphaTab's MPL 2.0 notice and the font's SIL OFL notices are included alongside
the assets. Rendering and workers run offline from these local files. Source:
https://github.com/CoderLine/alphaTab/tree/v1.8.4
