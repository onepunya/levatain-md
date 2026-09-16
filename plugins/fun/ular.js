import { sendInlineWebUI, WEBUI_MAX_PAYLOAD_BYTES } from '../../src/lib/rich-messages.js';

/**
 * Ular (Snake) — fully interactive WebUI
 * Semua kontrol (D-pad, restart) jalan di dalam HTML/JS.
 */

export const meta = {
    interface: {
        cmd: ['ular', 'snake'],
        tag: 'fun',
        aliasOnly: true,
        desc: 'Game Ular solo interaktif di WebUI — klik tombol di dalam board',
        ai: {
            trigger: 'User mau main game ular / snake solo interaktif',
            examples: ['ular', 'snake', 'main ular'],
        },
        async run(sock, { raw, from, pushname }) {
            const name = pushname || 'Player';
            const html = buildSnakeHTML(name);

            const bytes = Buffer.byteLength(html, 'utf-8');
            if (bytes > WEBUI_MAX_PAYLOAD_BYTES) {
                return sock.sendMessage(from, {
                    text: `❌ HTML terlalu besar (${(bytes / 1024).toFixed(1)}KB).`,
                }, { quoted: raw });
            }

            try {
                await sendInlineWebUI(sock, from, html, '🐍 Ular');
            } catch (e) {
                await sock.sendMessage(from, {
                    text: `❌ Gagal kirim WebUI: ${e.message}`,
                }, { quoted: raw });
            }
        },
    },
};

function buildSnakeHTML(playerName) {
    // Escape minimal untuk nama di string JS
    const safeName = String(playerName)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/</g, '')
        .replace(/>/g, '')
        .slice(0, 24);

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  background:#0d1117;color:#c9d1d9;
  font-family:system-ui,-apple-system,sans-serif;
  padding:12px;min-height:100vh;
  display:flex;flex-direction:column;align-items:center;
  -webkit-user-select:none;user-select:none;
}
h1{font-size:18px;color:#3fb950;margin-bottom:6px}
.meta{font-size:12px;color:#8b949e;margin-bottom:10px}
.meta b{color:#e6edf3}
#board{
  display:grid;
  grid-template-columns:repeat(12,1fr);
  gap:2px;
  width:100%;max-width:320px;
  background:#161b22;padding:4px;border-radius:10px;
  border:1px solid #30363d;
}
.cell{
  aspect-ratio:1;border-radius:3px;
  background:#21262d;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;
}
.cell.head{background:#238636}
.cell.body{background:#2ea043}
.cell.food{background:#da3633}
.dpad{
  margin-top:14px;width:180px;
  display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;
}
.dpad button{
  height:52px;border:none;border-radius:12px;
  background:#21262d;color:#e6edf3;font-size:22px;
  border:1px solid #30363d;
  active:scale(.95);
}
.dpad button:active{background:#30363d;transform:scale(.94)}
.dpad .mid{background:#0d1117;border-color:#3fb950;color:#3fb950;font-size:14px}
.dpad .ghost{visibility:hidden}
.bar{
  margin-top:12px;display:flex;gap:8px;width:100%;max-width:320px;
}
.bar button{
  flex:1;height:40px;border:none;border-radius:10px;
  font-size:13px;font-weight:600;color:#fff;
}
#btn-start{background:#238636}
#btn-pause{background:#9e6a03}
#msg{
  margin-top:10px;font-size:13px;text-align:center;
  min-height:20px;color:#8b949e;
}
#msg.win{color:#3fb950;font-weight:700}
#msg.dead{color:#f85149;font-weight:700}
</style>
</head>
<body>
  <h1>🐍 Ular</h1>
  <div class="meta"><b id="name"></b> · Skor <b id="score">0</b> · <span id="len">2</span> 🟩</div>
  <div id="board"></div>

  <div class="dpad">
    <button class="ghost"></button>
    <button id="u" type="button">⬆️</button>
    <button class="ghost"></button>
    <button id="l" type="button">⬅️</button>
    <button class="mid" id="dir">➡️</button>
    <button id="r" type="button">➡️</button>
    <button class="ghost"></button>
    <button id="d" type="button">⬇️</button>
    <button class="ghost"></button>
  </div>

  <div class="bar">
    <button id="btn-start" type="button">▶ Mulai / Restart</button>
  </div>
  <div id="msg">Tekan ▶ lalu arahkan dengan tombol</div>

<script>
(function(){
  var SIZE=12, TICK=180;
  var snake, dir, nextDir, food, score, timer, dead, running;
  var board=document.getElementById('board');
  var scoreEl=document.getElementById('score');
  var lenEl=document.getElementById('len');
  var msgEl=document.getElementById('msg');
  var dirEl=document.getElementById('dir');
  document.getElementById('name').textContent='${safeName}';

  var dirIcon={U:'⬆️',D:'⬇️',L:'⬅️',R:'➡️'};

  function key(x,y){return x+','+y}
  function randFood(){
    var occ={};
    for(var i=0;i<snake.length;i++) occ[key(snake[i].x,snake[i].y)]=1;
    var free=[];
    for(var y=0;y<SIZE;y++) for(var x=0;x<SIZE;x++)
      if(!occ[key(x,y)]) free.push({x:x,y:y});
    if(!free.length) return null;
    return free[Math.floor(Math.random()*free.length)];
  }

  function reset(){
    clearInterval(timer); timer=null;
    var m=Math.floor(SIZE/2);
    snake=[{x:m,y:m},{x:m-1,y:m}];
    dir='R'; nextDir='R';
    food=randFood(); score=0; dead=false; running=false;
    scoreEl.textContent='0'; lenEl.textContent=snake.length;
    dirEl.textContent=dirIcon[dir];
    msgEl.className='';
    msgEl.textContent='Tekan ▶ lalu arahkan dengan tombol';
    draw();
  }

  function draw(){
    var html='';
    var map={};
    for(var i=0;i<snake.length;i++) map[key(snake[i].x,snake[i].y)]=i===0?'head':'body';
    if(food) map[key(food.x,food.y)]='food';
    for(var y=0;y<SIZE;y++){
      for(var x=0;x<SIZE;x++){
        var t=map[key(x,y)]||'';
        var emoji=t==='head'?'🟢':t==='body'?'🟩':t==='food'?'🍎':'';
        html+='<div class="cell '+(t||'')+'">'+emoji+'</div>';
      }
    }
    board.innerHTML=html;
  }

  function step(){
    if(dead||!running) return;
    dir=nextDir;
    dirEl.textContent=dirIcon[dir];
    var h=snake[0];
    var n={x:h.x,y:h.y};
    if(dir==='U') n.y--; else if(dir==='D') n.y++;
    else if(dir==='L') n.x--; else n.x++;

    if(n.x<0||n.x>=SIZE||n.y<0||n.y>=SIZE){ die(); return; }
    for(var i=0;i<snake.length;i++) if(snake[i].x===n.x&&snake[i].y===n.y){ die(); return; }

    snake.unshift(n);
    if(food&&n.x===food.x&&n.y===food.y){
      score+=10; scoreEl.textContent=score;
      food=randFood();
      if(!food){ win(); return; }
    } else {
      snake.pop();
    }
    lenEl.textContent=snake.length;
    draw();
  }

  function die(){
    dead=true; running=false;
    clearInterval(timer); timer=null;
    msgEl.className='dead';
    msgEl.textContent='💀 Game Over · Skor '+score;
  }
  function win(){
    dead=true; running=false;
    clearInterval(timer); timer=null;
    msgEl.className='win';
    msgEl.textContent='🏆 MENANG! Papan penuh · Skor '+score;
  }

  function setDir(d){
    var opp={U:'D',D:'U',L:'R',R:'L'};
    if(d===opp[dir]&&snake.length>1) return;
    nextDir=d;
    if(!running&&!dead){
      running=true;
      msgEl.className='';
      msgEl.textContent='Main...';
      timer=setInterval(step, TICK);
    }
  }

  document.getElementById('u').onclick=function(){setDir('U')};
  document.getElementById('d').onclick=function(){setDir('D')};
  document.getElementById('l').onclick=function(){setDir('L')};
  document.getElementById('r').onclick=function(){setDir('R')};
  document.getElementById('btn-start').onclick=function(){reset();};

  reset();
})();
</script>
</body>
</html>`;
}
