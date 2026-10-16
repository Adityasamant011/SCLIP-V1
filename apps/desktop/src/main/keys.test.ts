import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const disk = vi.hoisted(() => ({ files: new Map<string, string>(), failRename: false, encryptionAvailable: true }));
vi.mock("electron", () => ({
  app: { getPath: () => "/test-credentials" },
  safeStorage: {
    isEncryptionAvailable: () => disk.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    decryptString: (value: Buffer) => {
      const text = value.toString();
      if (!text.startsWith("encrypted:")) throw new Error("Invalid encrypted key");
      return text.slice(10);
    },
  },
}));
vi.mock("node:fs", () => ({ default: {
  readFileSync: (file: string) => { if (!disk.files.has(file)) throw new Error("Missing"); return disk.files.get(file); },
  writeFileSync: (file: string, value: string) => { disk.files.set(file, value); },
  renameSync: (from: string, to: string) => {
    if (disk.failRename) throw new Error("Disk full");
    disk.files.set(to, disk.files.get(from)!); disk.files.delete(from);
  },
} }));
import { clearKey, loadAllKeys, setKey } from "./keys";
const target = path.join("/test-credentials", "cloud_keys.json");
beforeEach(() => { disk.files.clear(); disk.failRename = false; disk.encryptionAvailable = true; });

describe("credential persistence", () => {
  it("persists keys independently and clears only the requested credential", () => {
    setKey("openai", " first "); setKey("model-custom-test", "second");
    expect(loadAllKeys()).toEqual({ openai: "first", "model-custom-test": "second" });
    setKey("openai", "SCLIP_TEST_SECRET_DO_NOT_LEAK_12345");
    expect(loadAllKeys()).toEqual({ openai: "SCLIP_TEST_SECRET_DO_NOT_LEAK_12345", "model-custom-test": "second" });
    expect(disk.files.get(target)).not.toContain("SCLIP_TEST_SECRET_DO_NOT_LEAK_12345");
    clearKey("model-custom-test");
    expect(loadAllKeys()).toEqual({ openai: "SCLIP_TEST_SECRET_DO_NOT_LEAK_12345" });
  });
  it("reports a failed atomic replacement and preserves all previous keys", () => {
    setKey("openai", "previous"); setKey("model-custom-test", "other");
    disk.failRename = true;
    expect(() => setKey("openai", "replacement")).toThrow("Disk full");
    expect(loadAllKeys()).toEqual({ openai: "previous", "model-custom-test": "other" });
  });
  it("still reads usable keys if removing a corrupted entry cannot be persisted", () => {
    setKey("openai", "valid");
    disk.files.set(target, JSON.stringify({ ...JSON.parse(disk.files.get(target)!), corrupt: "invalid" }));
    disk.failRename = true;
    expect(loadAllKeys()).toEqual({ openai: "valid" });
  });
  it("refuses to persist a credential without OS-backed encryption", () => {
    disk.encryptionAvailable = false;
    expect(() => setKey("openai", "SCLIP_TEST_SECRET_DO_NOT_LEAK_12345")).toThrow("Secure OS key storage");
    expect(disk.files.size).toBe(0);
  });
  it("never deletes encrypted keys from disk when decryption fails", () => {
    setKey("openai", "valid-key");
    disk.files.set(target, JSON.stringify({ ...JSON.parse(disk.files.get(target)!), lockedKey: "invalid" }));
    expect(loadAllKeys()).toEqual({ openai: "valid-key" });
    const rawOnDisk = JSON.parse(disk.files.get(target)!);
    expect(rawOnDisk).toHaveProperty("lockedKey");
  });
});
