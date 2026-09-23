import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandDefinition } from './types';

const findBashExecutable = (): string => {
  if (process.env.CYBERCAT_BASH_PATH?.trim()) {
    return process.env.CYBERCAT_BASH_PATH.trim();
  }

  if (process.platform !== 'win32') {
    return 'bash';
  }

  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ];

  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate))) ?? 'bash';
};

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
  const child = spawn(findBashExecutable(), [command.scriptPath], {
    cwd: scriptsRoot,
    env: process.env,
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
