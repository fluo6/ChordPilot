// Express static supplies byte-range requests, required for reliable audio seeking.
const express = require('express');
const path = require('node:path');
const app = express();
app.use(express.static(path.resolve(__dirname, '../outputs/song-structure')));
app.listen(3318, '127.0.0.1', () => console.log('Structure review: http://127.0.0.1:3318/overjoyed-benchmark/review/'));
