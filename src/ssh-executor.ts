import { NodeSSH } from "node-ssh";

export type SshResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

type SshConfig = {
  ip: string;
  script: string;
};

type Credentials = { username: string; password: string };

export const getCredentialsList = (): Credentials[] => {
  const usernames = [
    process.env.SSH_USERNAME,
    process.env.SSH_USERNAME_2,
  ] as string[];
  const passwords = [
    process.env.SSH_PASSWORD,
    process.env.SSH_PASSWORD_2,
  ] as string[];
  const list: Credentials[] = usernames.flatMap((username) =>
    passwords.map((password) => ({ username, password })),
  );

  return list;
};

export const runScript = async ({
  ip,
  script,
}: SshConfig): Promise<SshResult> => {
  const credsList = getCredentialsList();

  let lastError: unknown;

  for (const creds of credsList) {
    const ssh = new NodeSSH();
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
    } catch (err) {
      ssh.dispose();
      lastError = err;
    }
  }

  throw lastError;
};
