import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  closeSseStream,
  commandListPayloadSchema,
  commandParamsSchema,
  type CommandParams,
  getSelectedCommand,
  loadCommands,
  openSseStream,
  runCommandProcess,
  writeSseEvent,
} from '../services/commands';

export default async function (fastify: FastifyInstance) {
  fastify.get(
    '/commands/stream',
    {
      schema: {
        response: {
          200: commandListPayloadSchema,
        },
      },
    },
    async (_request, reply) => {
      openSseStream(reply);

      try {
        const commands = await loadCommands();
        writeSseEvent(reply, 'commands', { commands });
        writeSseEvent(reply, 'done', {});
      } catch (err) {
        fastify.log.error({ err }, 'Failed to load script commands');
        writeSseEvent(reply, 'error', { message: 'Unable to load script commands.' });
      } finally {
        closeSseStream(reply);
      }
    }
  );

  fastify.post<{ Params: CommandParams }>(
    '/commands/:name/run',
    {
      schema: {
        params: commandParamsSchema,
        response: {
          200: Type.String(),
        },
      },
    },
    async (request, reply) => {
      openSseStream(reply);

      try {
        const { scriptsRoot, selectedCommand } = await getSelectedCommand(request.params.name);

        if (!selectedCommand) {
          writeSseEvent(reply, 'error', { message: 'Command is not available.' });
          writeSseEvent(reply, 'done', {});
          closeSseStream(reply);
          return;
        }

        writeSseEvent(reply, 'start', {
          command: selectedCommand.command,
          name: selectedCommand.name,
        });

        const child = runCommandProcess({
          command: selectedCommand,
          scriptsRoot,
          onStdout: (text) => {
            writeSseEvent(reply, 'stdout', { text });
          },
          onStderr: (text) => {
            writeSseEvent(reply, 'stderr', { text });
          },
          onError: (err) => {
            fastify.log.error({ err, command: selectedCommand.name }, 'Failed to start script command');
            writeSseEvent(reply, 'error', { message: 'Unable to start command.' });
            closeSseStream(reply);
          },
          onClose: (code, signal) => {
            writeSseEvent(reply, 'exit', { code, signal });
            writeSseEvent(reply, 'done', {});
            closeSseStream(reply);
          },
        });

        request.raw.on('close', () => {
          if (!child.killed) {
            child.kill();
          }
        });
      } catch (err) {
        fastify.log.error({ err }, 'Failed to prepare script command');
        writeSseEvent(reply, 'error', { message: 'Unable to prepare command.' });
        writeSseEvent(reply, 'done', {});
        closeSseStream(reply);
      }
    }
  );
}