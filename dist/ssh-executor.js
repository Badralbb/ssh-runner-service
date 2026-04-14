"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScript = exports.getCredentialsList = void 0;
const node_ssh_1 = require("node-ssh");
const getCredentialsList = () => {
    const usernames = [
        process.env.SSH_USERNAME,
        process.env.SSH_USERNAME_2,
    ];
    const passwords = [
        process.env.SSH_PASSWORD,
        process.env.SSH_PASSWORD_2,
    ];
    const list = usernames.flatMap((username) => passwords.map((password) => ({ username, password })));
    return list;
};
exports.getCredentialsList = getCredentialsList;
const runScript = async ({ ip, script, }) => {
    const credsList = (0, exports.getCredentialsList)();
    let lastError;
    for (const creds of credsList) {
        const ssh = new node_ssh_1.NodeSSH();
        try {
            await ssh.connect({
                host: ip,
                username: creds.username,
                password: creds.password,
                readyTimeout: 8000,
            });
            // Feed password via stdin so sudo -S works inside scripts that call sudo
            const result = await ssh.execCommand(script, {
                stdin: `${creds.password}\n`,
            });
            ssh.dispose();
            return {
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.code,
            };
        }
        catch (err) {
            ssh.dispose();
            lastError = err;
        }
    }
    throw lastError;
};
exports.runScript = runScript;
