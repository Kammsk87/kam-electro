import { describe, expect, it } from "vitest";
import { HealthController } from "../src/health/health.controller";

describe("HealthController", () => {
  it("returns an ok status", () => {
    expect(new HealthController().getHealth()).toEqual({
      status: "ok",
      service: "personaos-api"
    });
  });
});
