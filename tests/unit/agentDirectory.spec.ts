import { describe, expect, it } from "vitest";

import {
  agentAgencyLabel,
  agentDisplayName,
  agentInitials,
} from "../../src/modules/submissions/agentDirectory";

describe("agent directory fallbacks", () => {
  it("keeps the local demo identity product-facing and Russian", () => {
    expect(agentDisplayName("local-agent-tony")).toBe("Агент Тони");
    expect(agentInitials("local-agent-tony")).toBe("АТ");
    expect(agentAgencyLabel("local-agent-tony")).toBe("Команда VisaFlow");
  });

  it("retains safe labels when an agent identity is absent", () => {
    expect(agentDisplayName()).toBe("Агент не указан");
    expect(agentAgencyLabel()).toBe("Агентство не указано");
  });
});
