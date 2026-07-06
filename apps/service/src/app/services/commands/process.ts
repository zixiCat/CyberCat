import { ChildProcess, spawn } from 'child_process';
import type { CommandDefinition } from './types';

interface RunCommandProcessOptions {
  command: CommandDefinition;
  scriptsRoot: string;
  onStdout: (text: string) => void;
  onStderr: (text: string) => void;
  onError: (error: Error) => void;
  onClose: (code: number | null, signal: string | null) => void;
}

export const runCommandProcess = ({
  command,
  scriptsRoot,
  onStdout,
  onStderr,
  onError,
  onClose,
}: RunCommandProcessOptions): ChildProcess => {
  const child = spawn(command.command, {
    cwd: scriptsRoot,
    env: process.env,
    shell: true,
  });

  child.stdout.on('data', (chunk: Buffer) => {
    onStdout(chunk.toString());
  });

  child.stderr.on('data', (chunk: Buffer) => {
    onStderr(chunk.toString());
  });

  child.on('error', (error) => {
    onError(error);
  });

  child.on('close', (code, signal) => {
    onClose(code, signal);
  });

  return child;
};