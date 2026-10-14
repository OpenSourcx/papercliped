import { describe, expect, it } from "vitest";
import { errText } from "../src/ui/format.js";

describe("errText", () => {
  it("reads an Error, a string, and the plain { code, message } object Paperclip's host rejects with", () => {
    expect(errText(new Error("boom"))).toBe("boom");
    expect(errText("plain")).toBe("plain");
    expect(errText({ code: "WORKER_ERROR", message: "Wrong username or secret key." })).toBe("Wrong username or secret key.");
    expect(errText({ error: "nope" })).toBe("nope");
  });
  it("never prints [object Object]", () => {
    expect(errText({})).not.toContain("[object");
    expect(errText(undefined)).not.toContain("undefined");
  });
});

import { failure, failureOf } from "../src/action-error.js";
describe("action failures travel as data", () => {
  it("round-trips a message and ignores normal answers", () => {
    expect(failureOf(failure(new Error("That username and secret key don't match.")))).toBe("That username and secret key don't match.");
    expect(failureOf({ linked: true })).toBeNull();
    expect(failureOf(null)).toBeNull();
    expect(failureOf(failure("not an error"))).toBe("Something went wrong. Try again.");
    expect(failureOf(failure(new Error("x".repeat(1000))))!.length).toBe(300);
  });
});
