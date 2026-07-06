import { Static, Type } from '@sinclair/typebox';

export const commandSchema = Type.Object({
  name: Type.String(),
  command: Type.String(),
  folder: Type.Union([Type.Literal('xgd'), Type.Literal('zixiCat')]),
});

export const commandListPayloadSchema = Type.Object({
  commands: Type.Array(commandSchema),
});

export const commandParamsSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
});

export type CommandDefinition = Static<typeof commandSchema>;
export type CommandParams = Static<typeof commandParamsSchema>;

export interface CommandCatalog {
  commands: CommandDefinition[];
  scriptsRoot: string;
}

export interface SelectedCommandResult extends CommandCatalog {
  selectedCommand?: CommandDefinition;
}