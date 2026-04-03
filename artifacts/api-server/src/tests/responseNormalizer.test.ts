import { describe, it, expect } from "vitest";
import {
  extractAllJsonObjects,
  normalizeModelResponse,
} from "../lib/responseNormalizer.js";

describe("extractAllJsonObjects", () => {
  it("returns empty array for empty string", () => {
    expect(extractAllJsonObjects("")).toEqual([]);
  });

  it("returns empty array for plain text", () => {
    expect(extractAllJsonObjects("no json here")).toEqual([]);
  });

  it("extracts a single JSON object", () => {
    const result = extractAllJsonObjects('{"action":"read_file","path":"foo.ts"}');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ action: "read_file", path: "foo.ts" });
  });

  it("extracts multiple JSON objects from a stream", () => {
    const text = 'Some text {"a":1} more text {"b":2} end';
    const result = extractAllJsonObjects(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ a: 1 });
    expect(result[1]).toEqual({ b: 2 });
  });

  it("skips invalid JSON fragments", () => {
    const text = '{invalid json} {"valid":true}';
    const result = extractAllJsonObjects(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ valid: true });
  });

  it("handles nested objects", () => {
    const text = '{"outer":{"inner":"value"},"flag":true}';
    const result = extractAllJsonObjects(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ outer: { inner: "value" }, flag: true });
  });

  it("handles JSON with escaped strings", () => {
    const text = '{"message":"say \\"hello\\""}';
    const result = extractAllJsonObjects(text);
    expect(result).toHaveLength(1);
    expect((result[0] as { message: string }).message).toBe('say "hello"');
  });
});

describe("normalizeModelResponse", () => {
  it("returns no_json failure for plain text", () => {
    const result = normalizeModelResponse("plain text without any JSON");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/no_json|conversational/);
    }
  });

  it("returns conversational failure for a one-word greeting", () => {
    const result = normalizeModelResponse("thanks!");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("conversational");
    }
  });

  it("succeeds for a well-formed action object", () => {
    const action = JSON.stringify({ action: "done", final_status: "complete", summary: "done" });
    const result = normalizeModelResponse(action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toHaveProperty("action", "done");
    }
  });

  it("returns failure for JSON that is not an action", () => {
    const result = normalizeModelResponse('{"not":"an action"}');
    expect(result.ok).toBe(false);
  });
});
