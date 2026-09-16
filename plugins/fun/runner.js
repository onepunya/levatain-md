import { sendInlineWebUI, WEBUI_MAX_PAYLOAD_BYTES } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('runner', 'lari')
    .in('fun')
    .desc('Endless runner solo canvas')
    .prefixOnly()
    .signal('User mau main endless runner atau game lari loncat', ['runner', 'lari'])
    .run(async (sock, { raw, from, pushname }) => {
        const name = String(pushname || 'Player').replace(/[<>'\\']/g, '').slice(0, 20);
        await sock.sendMessage(from, { text: 'tekan unduh untuk membuka panel game' }, { quoted: raw });
        const html = build(name);
        if (Buffer.byteLength(html, 'utf-8') > WEBUI_MAX_PAYLOAD_BYTES) {
            return sock.sendMessage(from, { text: '❌ Panel terlalu besar.' }, { quoted: raw });
        }
        try {
            await sendInlineWebUI(sock, from, html, '🏃 Runner');
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
#cv{width:100%;max-width:300px;height:160px;background:#161b22;border-radius:10px;border:1px solid #30363d;display:block;margin:0 auto;touch-action:none}
.ctrl{display:flex;gap:6px;max-width:300px;margin:8px auto 0}
.ctrl button{flex:1;height:42px;border:0;border-radius:10px;background:#21262d;color:#e6edf3;font-size:14px;font-weight:700;border:1px solid #30363d}
.ctrl button:active{background:#30363d}
#go{display:block;width:100%;max-width:300px;margin:6px auto 0;height:34px;border:0;border-radius:8px;background:#238636;color:#fff;font-weight:700;font-size:12px}
#msg{margin-top:6px;font-size:11px;color:#8b949e;min-height:16px}
#msg.dead{color:#f85149;font-weight:700}
</style></head><body>
<h1>🏃 Runner</h1>
<div class="meta"><b id="nm"></b> · Skor <b id="sc">0</b></div>
<canvas id="cv" width="300" height="160"></canvas>
<div class="ctrl">
<button type="button" id="left">⬅️</button>
<button type="button" id="jump">⬆️ Loncat</button>
<button type="button" id="right">➡️</button>
</div>
<button type="button" id="go">▶ Restart</button>
<div id="msg">Lari!</div>
<script>
(function(){
document.getElementById('nm').textContent='` + name + `';
var cv=document.getElementById('cv'),ctx=cv.getContext('2d');
var scEl=document.getElementById('sc'),msg=document.getElementById('msg');
var W=300,H=160,G=130;
var p,obs,score,baseSpeed,alive,raf,spawnT,grav,jumpV;
function init(){
p={x:50,y:G-28,w:18,h:28,vy:0};
obs=[];score=0;baseSpeed=2.4;alive=true;grav=0.55;jumpV=-11;
scEl.textContent='0';msg.className='';msg.textContent='Lari!';
cancelAnimationFrame(raf);clearTimeout(spawnT);
draw();loop();schedule();
}
function schedule(){
if(!alive)return;
var gap=1100-Math.min(500,score*2);
spawnT=setTimeout(function(){
if(!alive)return;
var h=16+Math.floor(Math.random()*10);
obs.push({x:W+8,y:G-h,w:14,h:h});
schedule();
},Math.max(600,gap));
}
function loop(){
if(!alive)return;
raf=requestAnimationFrame(loop);
var spd=baseSpeed+score*0.012;
p.vy+=grav;p.y+=p.vy;
if(p.y>G-p.h){p.y=G-p.h;p.vy=0}
score+=0.06+spd*0.01;scEl.textContent=Math.floor(score);
for(var i=obs.length-1;i>=0;i--){
obs[i].x-=spd;
if(obs[i].x<-20){obs.splice(i,1);continue}
if(p.x<obs[i].x+obs[i].w-2&&p.x+p.w>obs[i].x+2&&p.y<obs[i].y+obs[i].h&&p.y+p.h>obs[i].y+2){
alive=false;msg.className='dead';msg.textContent='💀 Nabrak · Skor '+Math.floor(score);draw();return;
}
}
draw();
}
function draw(){
ctx.fillStyle='#161b22';ctx.fillRect(0,0,W,H);
ctx.fillStyle='#21262d';ctx.fillRect(0,G,W,H-G);
ctx.fillStyle='#3fb950';ctx.fillRect(0,G,W,3);
ctx.fillStyle='#2ea043';ctx.fillRect(p.x,p.y,p.w,p.h);
ctx.fillStyle='#3fb950';ctx.fillRect(p.x+3,p.y+4,5,5);ctx.fillRect(p.x+10,p.y+4,5,5);
ctx.fillStyle='#238636';ctx.fillRect(p.x+4,p.y+14,10,8);
ctx.fillStyle='#f85149';
for(var i=0;i<obs.length;i++){
ctx.fillRect(obs[i].x,obs[i].y,obs[i].w,obs[i].h);
ctx.fillStyle='#da3633';ctx.fillRect(obs[i].x+2,obs[i].y+2,obs[i].w-4,4);
ctx.fillStyle='#f85149';
}
ctx.fillStyle='#8b949e';ctx.font='11px sans-serif';ctx.fillText(Math.floor(score)+'',6,14);
}
function jump(){if(!alive)return;if(p.y>=G-p.h-1)p.vy=jumpV}
function move(dx){if(!alive)return;p.x=Math.max(4,Math.min(W-p.w-4,p.x+dx))}
document.getElementById('left').onclick=function(){move(-32)};
document.getElementById('right').onclick=function(){move(32)};
document.getElementById('jump').onclick=jump;
document.getElementById('go').onclick=init;
init();
})();
</script></body></html>`;
}
