import { config } from './config.js';
import { plugins } from './core/loader.js';
import { api, msg, MSG } from './lib/index.js';


export function initGlobals() {
    global.botName = config.bot.name;
    global.owner = config.owner.number;
    global.ownerLid = config.owner.lid;
    global.link = config.bot.link;
    global.thumb = config.bot.thumb;
    global.plugins = plugins;
    global.api = api;
    global.msg = msg;
    global.MSG = MSG;
    global.botConnected = false;
}
