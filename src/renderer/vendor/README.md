# Offline music engraving

`vexflow-bravura-4.2.5.js` is the unmodified `package/build/cjs/vexflow-bravura.js` from the official npm `vexflow@4.2.5` tarball. It bundles Bravura glyph outlines, so staff rendering needs no CDN or font download. VexFlow's MIT notice is in `VexFlow-LICENSE.txt`; Bravura's SIL OFL notice is in `Bravura-OFL.txt`.

Source/API: https://github.com/0xfe/vexflow/wiki/Tutorial

To update intentionally, fetch an explicitly pinned official npm package, copy its Bravura build and notices, then verify desktop/web rendering and engraving tests. The desktop package already includes `src/**/*`, and web serves the renderer directory.
