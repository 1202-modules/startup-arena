import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config, readHost } from "../dist/config.js";

describe("server config", () => {
  describe("readHost", () => {
    it("returns default 0.0.0.0 when value is undefined", () => {
      assert.equal(readHost(undefined), "0.0.0.0");
    });

    it("returns default 0.0.0.0 when value is empty string or only whitespace", () => {
      assert.equal(readHost(""), "0.0.0.0");
      assert.equal(readHost("   "), "0.0.0.0");
    });

    it("trims and returns configured host when provided", () => {
      assert.equal(readHost("127.0.0.1"), "127.0.0.1");
      assert.equal(readHost("  127.0.0.1  "), "127.0.0.1");
      assert.equal(readHost("192.168.1.100"), "192.168.1.100");
    });
  });

  describe("config.host", () => {
    it("has a host property defined on config object", () => {
      assert.ok(typeof config.host === "string");
      assert.ok(config.host.length > 0);
    });
  });
});
