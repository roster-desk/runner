import { createClaudeAdapter } from "./claude-agent-sdk.js";
import { createCommandAdapter } from "./command.js";
import { createEchoAdapter } from "./echo.js";
import { createHttpAdapter } from "./http.js";
import { createAdapterRegistry } from "./registry.js";

export function installAdapters(env: NodeJS.ProcessEnv = process.env) {
  const registry = createAdapterRegistry();
  registry.register("command", (agent) => createCommandAdapter(agent));
  registry.register("claude-agent-sdk", (agent) => createClaudeAdapter(agent));
  registry.register("http", (agent) => createHttpAdapter(agent, env));
  if (env.RUNNER_DEV === "1") registry.register("echo", createEchoAdapter);
  return registry;
}

export function devEchoEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.RUNNER_DEV === "1";
}
