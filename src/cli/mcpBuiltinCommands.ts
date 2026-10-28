import { Formatter, z } from "incur";

import {
  declaredSensitiveValues,
  splitIncurBuiltinArguments,
} from "../cliBuiltinArguments.js";
import { parseCliOutputArguments } from "../cliOutput.js";
import { redactExplicitText } from "../domain/explicitSensitiveValues.js";
import type { CliInstance } from "./types.js";

type ServeOptions = NonNullable<Parameters<CliInstance["serve"]>[1]>;

/** Pinned Incur 0.6.1 `mcp` builtin subcommands; Incur does not export them. */
export const MCP_BUILTIN_SUBCOMMANDS = new Map([
  [
    "add",
    {
      description: "Register as MCP server",
      alias: { command: "c" },
      options: z.object({
        agent: z.string().optional(),
        command: z.string().optional(),
        noGlobal: z.boolean().optional(),
      }),
    },
  ],
  ["doctor", { description: "Validate MCP server startup and tool listing" }],
]);

/**
 * Incur 0.6.1 rejects an unknown `mcp` subcommand in TOON regardless of the
 * selected format. Report the same envelope in the explicitly selected format;
 * without one, Incur's TOON or human rendering is already the selected output.
 * The arguments are the ones Incur receives, after REA's output adaptation.
 */
export const reportUnknownMcpSubcommand = (
  name: string,
  arguments_: readonly string[],
  options: ServeOptions,
): boolean => {
  const { command } = splitIncurBuiltinArguments(arguments_);
  const [entry, subcommand] = command;
  if (
    entry !== "mcp" ||
    // Incur shows group help for an empty token and owns flag-shaped globals.
    !subcommand ||
    subcommand.startsWith("-") ||
    MCP_BUILTIN_SUBCOMMANDS.has(subcommand) ||
    // Incur handles these builtins before its `mcp` subcommand branch.
    arguments_.some((token) => token === "--mcp" || token === "--update")
  )
    return false;
  const output = parseCliOutputArguments(arguments_);
  // Invalid output controls keep Incur's own parse diagnostic.
  if (!output.formatExplicit || !output.validation.ok) return false;
  const sensitive = declaredSensitiveValues(command);
  const text = (value: string): string => redactExplicitText(value, sensitive);
  const suggestion = [...MCP_BUILTIN_SUBCOMMANDS.keys()].find((candidate) =>
    candidate.startsWith(subcommand.toLowerCase()),
  );
  const commands = [
    ...(suggestion === undefined
      ? []
      : [
          {
            command: text(
              `${name} ${arguments_.map((token) => (token === subcommand ? suggestion : token)).join(" ")}`,
            ),
          },
        ]),
    {
      command: `${name} mcp --help`,
      description: "see all available commands",
    },
  ];
  const document = {
    code: "COMMAND_NOT_FOUND",
    message: text(
      `'${subcommand}' is not a command for '${name} mcp'.${suggestion === undefined ? "" : ` Did you mean '${suggestion}'?`}`,
    ),
    cta: {
      description:
        commands.length === 1 ? "Suggested command:" : "Suggested commands:",
      commands,
    },
  };
  (options.stdout ?? ((value: string) => process.stdout.write(value)))(
    `${Formatter.format(document, output.format as Formatter.Format)}\n`,
  );
  (options.exit ?? ((code: number) => process.exit(code)))(1);
  return true;
};
