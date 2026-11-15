const fs = require('fs');
const path = require('path');

try {
    // Cek apakah ada module unzipper / adm-zip atau bisa kita buat parser sederhana
    console.log('Checking global or local node modules...');
    const execSync = require('child_process').execSync;
    let res = execSync('npm list --depth=0').toString();
    console.log(res);
} catch (e) {
    console.log('Error checking npm list:', e.message);
}
