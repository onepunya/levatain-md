import fs from 'fs';
import zlib from 'zlib';

fs.writeFileSync('data_penting.txt', 'Halo Bos, ini data penting yang dibungkus di sandbox!');

const gzip = zlib.createGzip();
const source = fs.createReadStream('data_penting.txt');
const destination = fs.createWriteStream('hasil_data.txt.gz');

source.pipe(gzip).pipe(destination);
console.log('File berhasil dikompres pakai ES module dan zlib!');