const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// Buat file contoh yang mau dikompres
fs.writeFileSync('.sandbox/data_penting.txt', 'Halo Bos, ini data penting yang dibungkus di sandbox!');

// Kompres pakai Gzip (bawaan Node.js, aman tanpa install npm)
const gzip = zlib.createGzip();
const source = fs.createReadStream('.sandbox/data_penting.txt');
const destination = fs.createWriteStream('.sandbox/hasil_data.txt.gz');

source.pipe(gzip).pipe(destination);
console.log('File berhasil dikompres ke gzip!');