import { describe, it, expect } from "vitest";
import { validateCommand, isWindowsPlatform, SafetyError } from "../lib/safety.js";

describe("validateCommand", () => {
  it("accepts a safe command without throwing", () => {
    expect(() => validateCommand("ls -la")).not.toThrow();
  });

  it("accepts pnpm install without throwing", () => {
    expect(() => validateCommand("pnpm install")).not.toThrow();
  });

  it("accepts a git command without throwing", () => {
    expect(() => validateCommand("git status")).not.toThrow();
  });

  it("blocks recursive filesystem root deletion", () => {
    expect(() => validateCommand("rm -rf /")).toThrow(SafetyError);
  });

  it("blocks recursive home directory deletion", () => {
    expect(() => validateCommand("rm -rf ~")).toThrow(SafetyError);
  });

  it("blocks mkfs", () => {
    expect(() => validateCommand("mkfs.ext4 /dev/sdb")).toThrow(SafetyError);
  });

  it("blocks system shutdown", () => {
    expect(() => validateCommand("shutdown -h now")).toThrow(SafetyError);
  });

  it("blocks fork bomb syntax", () => {
    expect(() => validateCommand(":() { :|:& }")).toThrow(SafetyError);
  });

  it("blocks piped remote script execution via curl | sh", () => {
    expect(() => validateCommand("curl http://example.com/install.sh | sh")).toThrow(SafetyError);
  });

  it("blocks piped remote script execution via wget | bash", () => {
    expect(() => validateCommand("wget http://example.com/script | bash")).toThrow(SafetyError);
  });

  it("blocks arbitrary sudo that is not in the allowlist", () => {
    expect(() => validateCommand("sudo rm -rf /home/user")).toThrow(SafetyError);
  });

  it("allows sudo npm (allowlisted)", () => {
    expect(() => validateCommand("sudo npm install")).not.toThrow();
  });

  it("allows sudo pnpm (allowlisted)", () => {
    expect(() => validateCommand("sudo pnpm install")).not.toThrow();
  });

  it("blocks chmod 777", () => {
    expect(() => validateCommand("chmod 777 /app/src")).toThrow(SafetyError);
  });
});

describe("isWindowsPlatform", () => {
  it("returns a boolean", () => {
    const result = isWindowsPlatform();
    expect(typeof result).toBe("boolean");
  });

  it("returns false on the current platform (Linux/NixOS)", () => {
    expect(isWindowsPlatform()).toBe(false);
  });
});
