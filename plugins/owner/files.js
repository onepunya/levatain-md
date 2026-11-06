import { getArgs } from '../../src/util/index.js';
import { plugin } from '../../src/core/plugin.js';
import { runAgentTool } from '../../src/ai/tools.js';

export default plugin('writefile', 'readfile', 'deletefile', 'listdir', 'rmfile', 'lsdir')
    .in('owner')
    .desc('Read, write, delete, or list files inside the bot workspace. Owner only.')
    .showAllAliases()
    .ownerOnly()
    .ai({
        trigger: 'Owner asks to create, write, read, delete, or list files/folders in the bot project workspace',
        examples: [
            'writefile notes.txt\nisi catatan',
            'readfile package.json',
            'deletefile temp.txt',
            'listdir plugins/owner',
        ],
        args: { path_and_content: 'path relative to project root; for writefile put content after first newline' },
    })
    .run(async (sock, { body, command, reply, isOwner }) => {
        const args = getArgs(body);
        try {
            const text = await runAgentTool(command, args, { isOwner: true });
            return reply(text);
        } catch (e) {
            return reply(`❌ ${e.message}`);
        }
    });
