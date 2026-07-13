import { describe, expect, it } from "vitest";
import {
  codexProviderPresets,
  generateThirdPartyConfig,
} from "@/config/codexProviderPresets";
import { parse as parseToml } from "smol-toml";
import { extractCodexModelName } from "@/utils/providerConfigUtils";

describe("Codex provider defaults", () => {
  it("uses GPT-5.6 Sol for newly generated third-party providers", () => {
    const config = generateThirdPartyConfig(
      "example",
      "https://api.example.com/v1",
    );

    expect(extractCodexModelName(config)).toBe("gpt-5.6-sol");
  });

  it("keeps E-FlowCode's automatic compaction threshold within its context window", () => {
    const preset = codexProviderPresets.find(
      (candidate) => candidate.name === "E-FlowCode",
    );

    expect(preset).toBeDefined();
    const parsed = parseToml(preset?.config ?? "") as {
      model_context_window?: number;
      model_auto_compact_token_limit?: number;
    };
    const {
      model_context_window: contextWindow,
      model_auto_compact_token_limit: compactLimit,
    } = parsed;

    expect(contextWindow).toBe(1_000_000);
    expect(compactLimit).toBe(900_000);
    expect(compactLimit).toBeLessThan(contextWindow!);
    expect(preset?.modelCatalog).toEqual([
      {
        model: "gpt-5.5",
        displayName: "GPT-5.5",
        contextWindow: 1_000_000,
        supportsParallelToolCalls: undefined,
        inputModalities: undefined,
        baseInstructions: undefined,
      },
    ]);
  });
});
