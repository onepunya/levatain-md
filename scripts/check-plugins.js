import 'dotenv/config';
import { checkPlugins, formatReport } from '../src/tools/pluginCheck.js';

const args  = process.argv.slice(2);
const flags = new Set(args.filter(arg => arg.startsWith('--')));
const only  = args.find(arg => !arg.startsWith('--')) || null;

const report = await checkPlugins({ only, probe: !flags.has('--no-probe') });

console.log(formatReport(report, { full: flags.has('--full'), bold: (text) => text }));

const failed = report.files.some(entry => entry.level === 'error' || entry.level === 'down');
process.exit(failed ? 1 : 0);
