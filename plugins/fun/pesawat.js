import { sendInlineWebUI, WEBUI_MAX_PAYLOAD_BYTES } from '../../src/lib/rich-messages.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('pesawat', 'plane', 'shooter')
  .in('fun')
  .desc('Pesawat tembak canvas')
  .prefixOnly()
  .signal('User mau main game pesawat tembak atau space shooter', ['pesawat', 'plane', 'shooter'])
  .run(async (sock, { raw, from, pushname }) => {
            const name = String(pushname || 'Player').replace(/[<>'\\']/g, '').slice(0, 20);
            await sock.sendMessage(from, { text: 'tekan unduh untuk membuka panel game' }, { quoted: raw });
            const html = build(name);
            if (Buffer.byteLength(html, 'utf-8') > WEBUI_MAX_PAYLOAD_BYTES) {
                return sock.sendMessage(from, { text: '❌ Panel terlalu besar.' }, { quoted: raw });
            }
            try {
                await sendInlineWebUI(sock, from, html, '🚀 Pesawat');
            } catch (e) {
                await sock.sendMessage(from, { text: '❌ Gagal: ' + e.message }, { quoted: raw });
            }
        });

function build(name) {
    return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;padding:8px;text-align:center;-webkit-user-select:none;user-select:none}
h1{font-size:15px;color:#58a6ff;margin-bottom:2px}
.meta{font-size:11px;color:#8b949e;margin-bottom:6px}.meta b{color:#e6edf3}
#cv{width:100%;max-width:280px;height:260px;background:#0a0e14;border-radius:10px;border:1px solid #30363d;display:block;margin:0 auto;touch-action:none}
.ctrl{display:flex;gap:6px;max-width:280px;margin:8px auto 0}
.ctrl button{flex:1;height:42px;border:0;border-radius:10px;background:#21262d;color:#e6edf3;font-size:13px;font-weight:700;border:1px solid #30363d}
.ctrl button:active{background:#30363d}
#fire{background:#da3633;border-color:#f85149;color:#fff}
#go{display:block;width:100%;max-width:280px;margin:6px auto 0;height:34px;border:0;border-radius:8px;background:#238636;color:#fff;font-weight:700;font-size:12px}
#msg{margin-top:6px;font-size:11px;color:#8b949e;min-height:16px}
#msg.dead{color:#f85149;font-weight:700}
</style></head><body>
<h1>🚀 Pesawat</h1>
<div class="meta"><b id="nm"></b> · Skor <b id="sc">0</b></div>
<canvas id="cv" width="280" height="260"></canvas>
<div class="ctrl">
<button type="button" id="left">⬅️</button>
<button type="button" id="fire">🔫 Tembak</button>
<button type="button" id="right">➡️</button>
</div>
<button type="button" id="go">▶ Restart</button>
<div id="msg">Tembak & hindar!</div>
<script>
(function(){
document.getElementById('nm').textContent='` + name + `';
var cv=document.getElementById('cv'),ctx=cv.getContext('2d');
var scEl=document.getElementById('sc'),msg=document.getElementById('msg');
var W=280,H=260;
var ship,bullets,enemies,score,alive,raf,spawnT,cd,stars;
function init(){
ship={x:W/2,y:H-30};
bullets=[];enemies=[];score=0;alive=true;cd=0;
stars=[];for(var i=0;i<25;i++)stars.push({x:Math.random()*W,y:Math.random()*H,s:1+Math.random()*1.5});
scEl.textContent='0';msg.className='';msg.textContent='Tembak & hindar!';
cancelAnimationFrame(raf);clearTimeout(spawnT);
draw();loop();schedule();
}
function schedule(){
if(!alive)return;
var gap=Math.max(350,700-score*1.5);
spawnT=setTimeout(function(){
if(!alive)return;
enemies.push({x:20+Math.random()*(W-40),y:-16,w:16,h:14,vy:1.2+Math.random()*1.2+score*0.008});
schedule();
},gap);
}
function loop(){
if(!alive)return;
raf=requestAnimationFrame(loop);
if(cd>0)cd--;
for(var i=0;i<stars.length;i++){stars[i].y+=0.6;if(stars[i].y>H){stars[i].y=0;stars[i].x=Math.random()*W}}
for(var i=bullets.length-1;i>=0;i--){bullets[i].y-=7;if(bullets[i].y<0)bullets.splice(i,1)}
for(var i=enemies.length-1;i>=0;i--){
var e=enemies[i];e.y+=e.vy;
if(e.y>H){enemies.splice(i,1);continue}
if(Math.abs(e.x-ship.x)<16&&Math.abs(e.y-ship.y)<16){die();return}
for(var j=bullets.length-1;j>=0;j--){
if(Math.abs(bullets[j].x-e.x)<12&&Math.abs(bullets[j].y-e.y)<12){
enemies.splice(i,1);bullets.splice(j,1);score+=10;scEl.textContent=score;break;
}
}
}
draw();
}
function die(){alive=false;msg.className='dead';msg.textContent='💥 Hancur · Skor '+score;draw()}
function fire(){if(!alive||cd>0)return;bullets.push({x:ship.x,y:ship.y-14});cd=9}
function move(dx){if(!alive)return;ship.x=Math.max(16,Math.min(W-16,ship.x+dx))}
function drawShip(x,y){
ctx.fillStyle='#58a6ff';
ctx.beginPath();ctx.moveTo(x,y-14);ctx.lineTo(x-12,y+10);ctx.lineTo(x-4,y+6);ctx.lineTo(x+4,y+6);ctx.lineTo(x+12,y+10);ctx.closePath();ctx.fill();
ctx.fillStyle='#79c0ff';ctx.fillRect(x-3,y-4,6,8);
ctx.fillStyle='#f0883e';ctx.fillRect(x-2,y+8,4,6);
}
function drawEnemy(x,y){
ctx.fillStyle='#f85149';
ctx.beginPath();ctx.moveTo(x,y+10);ctx.lineTo(x-10,y-8);ctx.lineTo(x+10,y-8);ctx.closePath();ctx.fill();
ctx.fillStyle='#ff7b72';ctx.fillRect(x-3,y-4,6,5);
}
function draw(){
ctx.fillStyle='#0a0e14';ctx.fillRect(0,0,W,H);
ctx.fillStyle='#30363d';
for(var i=0;i<stars.length;i++)ctx.fillRect(stars[i].x,stars[i].y,stars[i].s,stars[i].s);
ctx.fillStyle='#3fb950';
for(var i=0;i<bullets.length;i++){ctx.beginPath();ctx.arc(bullets[i].x,bullets[i].y,3,0,6.3);ctx.fill()}
for(var i=0;i<enemies.length;i++)drawEnemy(enemies[i].x,enemies[i].y);
if(alive)drawShip(ship.x,ship.y);
else{ctx.fillStyle='#f85149';ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText('💥',ship.x,ship.y);ctx.textAlign='left'}
ctx.fillStyle='#8b949e';ctx.font='11px sans-serif';ctx.fillText(score+'',6,14);
}
document.getElementById('left').onclick=function(){move(-28)};
document.getElementById('right').onclick=function(){move(28)};
document.getElementById('fire').onclick=fire;
document.getElementById('go').onclick=init;
init();
})();
</script></body></html>`;
}
