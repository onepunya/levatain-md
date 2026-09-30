import { audioEffect } from '../../src/core/factories.js';

const EFFECTS = [
    { cmds: ['8d'],                    desc: '8D Audio — sound panning left and right',              trigger: '8d',            filter: 'apulsator=hz=0.09' },
    { cmds: ['bassboost', 'bass'],     desc: 'Bass Boost — boosted low frequencies',                 trigger: 'bass boost',    filter: 'bass=g=20:f=110:w=0.6' },
    { cmds: ['chipmunk'],              desc: 'Chipmunk — high-pitched voice like a chipmunk',        trigger: 'chipmunk',      filter: 'asetrate=44100*1.6,aresample=44100' },
    { cmds: ['deepvoice', 'deep'],     desc: 'Deep Voice — makes voice deep and heavy',              trigger: 'deep voice',    filter: 'asetrate=44100*0.7,aresample=44100' },
    { cmds: ['echo'],                  desc: 'Echo — repeating echo effect',                         trigger: 'echo',          filter: 'aecho=0.6:0.6:500:0.4' },
    { cmds: ['nightcore'],             desc: 'Nightcore — faster audio with higher pitch',           trigger: 'nightcore',     filter: 'asetrate=44100*1.3,aresample=44100' },
    { cmds: ['reverb'],                desc: 'Reverb — large room reverb effect',                    trigger: 'reverb',        filter: 'aecho=0.8:0.9:1000:0.3' },
    { cmds: ['reverse'],               desc: 'Reverse — play audio backwards',                       trigger: 'reverse',       filter: 'areverse' },
    { cmds: ['robot'],                 desc: 'Robot Voice — makes voice sound like a robot',         trigger: 'robot voice',   filter: "afftfilt=real='hypot(re,im)*cos(0.05*n)':imag='hypot(re,im)*sin(0.05*n)':win_size=512:overlap=0.75" },
    { cmds: ['slowedreverb', 'slowed'],desc: 'Slowed + Reverb — TikTok trend, slower and reverbed',  trigger: 'slowed reverb', filter: 'asetrate=44100*0.8,aresample=44100,aecho=0.8:0.88:60:0.4' },
    { cmds: ['slowmo', 'slow'],        desc: 'Slow Motion — slower audio without changing pitch',    trigger: 'slow motion',   filter: 'atempo=0.75' },
    { cmds: ['speedup', 'fast'],       desc: 'Speed Up — faster audio without changing pitch',       trigger: 'speed up',      filter: 'atempo=1.5' },
    { cmds: ['vaporwave'],             desc: 'Vaporwave — lambat, aesthetic, dikit reverb',          trigger: 'vaporwave',     filter: 'asetrate=44100*0.8,aresample=44100,atempo=0.9,bass=g=6' }
];

export default EFFECTS.map(effect => audioEffect({ ...effect, name: effect.cmds[0] }));
