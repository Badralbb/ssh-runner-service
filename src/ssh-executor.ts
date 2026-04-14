import { NodeSSH } from 'node-ssh';

export type SshResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

type SshConfig = {
  ip: string;
  script: string;
};

const buildSshConnection = () => {
  return {
    username: process.env.SSH_USERNAME ?? 'admin',
    password: process.env.SSH_PASSWORD ?? '',
    readyTimeout: 8000,
  }
};

export const runScript = async ({ ip, script }: SshConfig): Promise<SshResult> => {
  const ssh = new NodeSSH();
  await ssh.connect({ host: ip, ...buildSshConnection() });
  // Feed password via stdin so sudo -S works inside scripts that call sudo
  const result = await ssh.execCommand(script, {
    stdin: `${process.env.SSH_PASSWORD ?? ''}\n`,
  });
  ssh.dispose();
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.code,
  };
};
