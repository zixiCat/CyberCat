import { promises as fs } from 'fs';
import * as path from 'path';
import type { CommandCatalog, CommandDefinition, SelectedCommandResult } from './types';

const commandFolders = [
  { folder: 'xgd', prefix: 'xgd-' },
  { folder: 'zixiCat', prefix: 'zx-' },
] as const;

const shellExtensions = new Set(['.bash', '.sh']);

const toPosixPath = (value: string): string => value.split(path.sep).join('/');

const toCommandName = (prefix: string, fileName: string): string => `${prefix}${path.parse(fileName).name}`;

const toCommandDefinition = (candidateRoot: string, folder: string, prefix: string, fileName: string): CommandDefinition => {
  const relativePath = toPosixPath(path.relative(candidateRoot, path.join(candidateRoot, 'commands', folder, fileName)));

  return {
    name: toCommandName(prefix, fileName),
    command: `bash ./${relativePath}`,
    folder: folder as CommandDefinition['folder'],
  };
};

const readCommandFolder = async (
  candidateRoot: string,
  folder: (typeof commandFolders)[number]
): Promise<CommandDefinition[]> => {
  try {
    const commandDirectory = path.join(candidateRoot, 'commands', folder.folder);
    const entries = await fs.readdir(commandDirectory, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && shellExtensions.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => toCommandDefinition(candidateRoot, folder.folder, folder.prefix, entry.name));
  } catch {
    return [];
  }
};

const readCommandCatalog = async (candidateRoot: string): Promise<CommandCatalog | null> => {
  const nestedCommands = await Promise.all(commandFolders.map((folder) => readCommandFolder(candidateRoot, folder)));
  const commands = nestedCommands.flat().sort((left, right) => left.name.localeCompare(right.name));

  if (commands.length === 0) {
    return null;
  }

  return {
    commands,
    scriptsRoot: candidateRoot,
  };
};

const findCommandCatalog = async (): Promise<CommandCatalog> => {
  const visitedRoots = new Set<string>();
  const rootsToSearch = [process.env.SCRIPTS_ROOT, process.cwd(), __dirname]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value));

  for (const initialRoot of rootsToSearch) {
    let currentRoot = initialRoot;

    while (!visitedRoots.has(currentRoot)) {
      visitedRoots.add(currentRoot);

      const catalog = await readCommandCatalog(currentRoot);

      if (catalog) {
        return catalog;
      }

      const parentRoot = path.dirname(currentRoot);

      if (parentRoot === currentRoot) {
        break;
      }

      currentRoot = parentRoot;
    }
  }

  throw new Error('Unable to find command files under commands/.');
};

export const loadCommands = async (): Promise<CommandDefinition[]> => {
  const { commands } = await findCommandCatalog();

  return commands;
};

export const getSelectedCommand = async (name: string): Promise<SelectedCommandResult> => {
  const catalog = await findCommandCatalog();

  return {
    ...catalog,
    selectedCommand: catalog.commands.find((command) => command.name === name),
  };
};