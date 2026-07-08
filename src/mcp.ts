import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult, ContentBlock, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const text = (value: string): TextContent => ({ type: 'text', text: value });

export const toolError = (message: string): CallToolResult => ({
  content: [text(message)],
  isError: true,
});

export type ToolHandlerResult = CallToolResult | ContentBlock | readonly ContentBlock[];

export type ToolHandler<TInput> = (args: {
  input: TInput;
  ctx: unknown;
}) => ToolHandlerResult | Promise<ToolHandlerResult>;

export interface ToolDefinition<TInput = unknown> {
  description: string;
  inputSchema: z.ZodType<TInput>;
  handler(args: { input: TInput; ctx: unknown }): ToolHandlerResult | Promise<ToolHandlerResult>;
}

class ToolBuilder<TInput = unknown> {
  readonly #description: string | undefined;
  readonly #inputSchema: z.ZodType<TInput> | undefined;

  constructor(descriptionValue?: string, inputSchema?: z.ZodType<TInput>) {
    this.#description = descriptionValue;
    this.#inputSchema = inputSchema;
  }

  description(value: string): ToolBuilder<TInput> {
    return new ToolBuilder(value, this.#inputSchema);
  }

  input<TSchema extends z.ZodType>(schema: TSchema): ToolBuilder<z.infer<TSchema>> {
    return new ToolBuilder(this.#description, schema as z.ZodType<z.infer<TSchema>>);
  }

  handler(handler: ToolHandler<TInput>): ToolDefinition<TInput> {
    return {
      description: this.#description ?? '',
      inputSchema: this.#inputSchema ?? (z.object({}) as z.ZodType<TInput>),
      handler,
    };
  }
}

export const tool = (): ToolBuilder => new ToolBuilder();

interface CreateServerOptions {
  name: string;
  version: string;
  instructions?: string;
  tools: Record<string, ToolDefinition<unknown>>;
}

interface ServerHandle {
  start(): Promise<void>;
  close(): Promise<void>;
}

const isCallToolResult = (result: ToolHandlerResult): result is CallToolResult =>
  typeof result === 'object' && result !== null && 'content' in result;

const isContentArray = (result: ToolHandlerResult): result is readonly ContentBlock[] =>
  Array.isArray(result);

const normalizeToolResult = (result: ToolHandlerResult): CallToolResult => {
  if (isContentArray(result)) return { content: [...result] };
  if (isCallToolResult(result)) return result;
  return { content: [result] };
};

const buildMcpServer = ({ name, version, instructions, tools }: CreateServerOptions): McpServer => {
  const mcpServer = new McpServer(
    { name, version },
    {
      ...(instructions ? { instructions } : {}),
    }
  );

  for (const [toolName, definition] of Object.entries(tools)) {
    mcpServer.registerTool(
      toolName,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
      },
      async (input, ctx) => normalizeToolResult(await definition.handler({ input, ctx }))
    );
  }

  return mcpServer;
};

export const createServer = (options: CreateServerOptions): ServerHandle => {
  let mcpServer: McpServer | undefined;

  return {
    async start() {
      mcpServer = buildMcpServer(options);
      await mcpServer.connect(new StdioServerTransport());
    },
    async close() {
      await mcpServer?.close();
    },
  };
};
