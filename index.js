import 'dotenv/config';
import { initGlobals } from './src/core/globals.js';
import { guardProcess } from './src/runtime/process.js';
import { start } from './src/runtime/connection.js';
import { startBackgroundJobs } from './src/runtime/background.js';

initGlobals();
guardProcess();
start();
startBackgroundJobs();
