declare module "commander" {
  export class Command {
    constructor(name?: string);
    name(n: string): this;
    description(d: string): this;
    option(flags: string, desc?: string, defaultValue?: unknown): this;
    requiredOption(flags: string, desc: string): this;
    command(name: string): Command;
    command(name: string, desc: string): Command;
    action(fn: (this: Command, ...args: unknown[]) => void | Promise<void>): this;
    parse(): void;
    opts(): Record<string, unknown>;
    addCommand(cmd: Command): this;
  }
}
