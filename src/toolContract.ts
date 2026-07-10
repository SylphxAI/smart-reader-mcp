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