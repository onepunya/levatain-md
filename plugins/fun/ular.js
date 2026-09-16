import { sendInlineWebUI, WEBUI_MAX_PAYLOAD_BYTES } from '../../src/lib/rich-messages.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('ular', 'snake')
    .in('fun')
    .desc('Game Ular solo interaktif di WebUI')
    .prefixOnly()
    .signal('User mau main game ular atau snake solo', ['ular', 'snake'])
    .run(async (sock, { raw, from, pushname }) => {
        const name = String(pushname || 'Player').replace(/[<>'\\']/g, '').slice(0, 20);
        await sock.sendMessage(from, { text: 'tekan unduh untuk membuka panel game' }, { quoted: raw });
        const html = build(name);
        if (Buffer.byteLength(html, 'utf-8') > WEBUI_MAX_PAYLOAD_BYTES) {
            return sock.sendMessage(from, { text: '❌ Panel terlalu besar.' }, { quoted: raw });
        }
        try {
            await sendInlineWebUI(sock, from, html, '🐍 Ular');
        } catch (e) {
            await sock.sendMessage(from, { text: '❌ Gagal: ' + e.message }, { quoted: raw });
        }
    });

function build(name) {
    return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;padding:12px;display:flex;flex-direction:column;align-items:center;-webkit-user-select:none;user-select:none}
h1{font-size:17px;color:#3fb950;margin-bottom:4px}
.meta{font-size:12px;color:#8b949e;margin-bottom:8px}.meta b{color:#e6edf3}
#board{display:grid;grid-template-columns:repeat(12,1fr);gap:2px;width:100%;max-width:300px;background:#161b22;padding:4px;border-radius:10px;border:1px solid #30363d}
.cell{aspect-ratio:1;border-radius:3px;background:#21262d;display:flex;align-items:center;justify-content:center;font-size:13px}
.cell.head{background:#238636}.cell.body{background:#2ea043}.cell.food{background:#da3633}
.dpad{margin-top:12px;width:168px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}
.dpad button{height:48px;border:none;border-radius:12px;background:#21262d;color:#e6edf3;font-size:20px;border:1px solid #30363d}
.dpad button:active{background:#30363d;transform:scale(.94)}
.dpad .mid{background:#0d1117;border-color:#3fb950;color:#3fb950;font-size:13px}
.dpad .ghost{visibility:hidden}
.bar{margin-top:10px;width:100%;max-width:300px}
.bar button{width:100%;height:40px;border:none;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:#238636}
#msg{margin-top:8px;font-size:12px;text-align:center;min-height:18px;color:#8b949e}
#msg.dead{color:#f85149;font-weight:700}#msg.win{color:#3fb950;font-weight:700}
</style></head><body>
<h1>🐍 Ular</h1>
<div class="meta"><b id="nm"></b> · Skor <b id="sc">0</b> · <span id="ln">2</span></div>
<div id="board"></div>
<div class="dpad">
<button class="ghost"></button><button id="u" type="button">⬆️</button><button class="ghost"></button>
<button id="l" type="button">⬅️</button><button class="mid" id="dir">➡️</button><button id="r" type="button">➡️</button>
<button class="ghost"></button><button id="d" type="button">⬇️</button><button class="ghost"></button>
</div>
<div class="bar"><button id="go" type="button">▶ Mulai / Restart</button></div>
<div id="msg">Tekan ▶ lalu arahkan</div>
<script>
(function(){
var S=12,T=260,snake,dir,nd,food,score,timer,dead,run;
var board=document.getElementById('board'),sc=document.getElementById('sc'),ln=document.getElementById('ln'),msg=document.getElementById('msg'),dirEl=document.getElementById('dir');
document.getElementById('nm').textContent='` + name + `';
var ic={U:'⬆️',D:'⬇️',L:'⬅️',R:'➡️'};
function k(x,y){return x+','+y}
function rf(){var o={};for(var i=0;i<snake.length;i++)o[k(snake[i].x,snake[i].y)]=1;var f=[];for(var y=0;y<S;y++)for(var x=0;x<S;x++)if(!o[k(x,y)])f.push({x:x,y:y});return f.length?f[Math.floor(Math.random()*f.length)]:null}
function reset(){clearInterval(timer);timer=null;var m=Math.floor(S/2);snake=[{x:m,y:m},{x:m-1,y:m}];dir='R';nd='R';food=rf();score=0;dead=false;run=false;sc.textContent='0';ln.textContent=snake.length;dirEl.textContent=ic[dir];msg.className='';msg.textContent='Tekan ▶ lalu arahkan';draw()}
function draw(){var h='',m={};for(var i=0;i<snake.length;i++)m[k(snake[i].x,snake[i].y)]=i===0?'head':'body';if(food)m[k(food.x,food.y)]='food';for(var y=0;y<S;y++)for(var x=0;x<S;x++){var t=m[k(x,y)]||'';h+='<div class="cell '+t+'">'+(t==='head'?'🟢':t==='body'?'🟩':t==='food'?'🍎':'')+'</div>'}board.innerHTML=h}
function step(){if(dead||!run)return;dir=nd;dirEl.textContent=ic[dir];var h=snake[0],n={x:h.x,y:h.y};if(dir==='U')n.y--;else if(dir==='D')n.y++;else if(dir==='L')n.x--;else n.x++;if(n.x<0)n.x=S-1;else if(n.x>=S)n.x=0;if(n.y<0)n.y=S-1;else if(n.y>=S)n.y=0;for(var i=0;i<snake.length;i++)if(snake[i].x===n.x&&snake[i].y===n.y){die();return}snake.unshift(n);if(food&&n.x===food.x&&n.y===food.y){score+=10;sc.textContent=score;food=rf();if(!food){win();return}}else snake.pop();ln.textContent=snake.length;draw()}
function die(){dead=true;run=false;clearInterval(timer);timer=null;msg.className='dead';msg.textContent='💀 Nabrak badan · '+score}
function win(){dead=true;run=false;clearInterval(timer);timer=null;msg.className='win';msg.textContent='🏆 Menang · '+score}
function setD(d){var o={U:'D',D:'U',L:'R',R:'L'};if(d===o[dir]&&snake.length>1)return;nd=d;if(!run&&!dead){run=true;msg.className='';msg.textContent='Main...';timer=setInterval(step,T)}}
document.getElementById('u').onclick=function(){setD('U')};
document.getElementById('d').onclick=function(){setD('D')};
document.getElementById('l').onclick=function(){setD('L')};
document.getElementById('r').onclick=function(){setD('R')};
document.getElementById('go').onclick=function(){reset()};
reset();
})();
</script></body></html>`;
}
