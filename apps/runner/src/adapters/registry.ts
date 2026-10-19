import type { AgentAdapter, AgentDescriptor } from "./types.js";

export type AdapterAgent = {
  id: string;
  name: string;
  description: string;
  adapter: AgentDescriptor["adapterKind"];
  capabilities: string[];
  options: Record<string, unknown>;
  policy: string;
};

type Factory = (agent: AdapterAgent) => AgentAdapter;

export function createAdapterRegistry() {
  const factories = new Map<string, Factory>();
  return {
    register(kind: AgentDescriptor["adapterKind"], factory: Factory) {
      factories.set(kind, factory);
    },
    create(agent: AdapterAgent) {
      const factory = factories.get(agent.adapter);
      if (!factory) throw new Error(`adapter_missing:${agent.adapter}`);
      return factory(agent);
    },
  };
}
