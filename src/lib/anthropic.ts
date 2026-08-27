import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient() {
  return new Anthropic();
}
