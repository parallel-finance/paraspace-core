import promptSync from "prompt-sync";

export const input = (hint: string): string =>
  promptSync().hide(hint)?.trim()?.replace("\r", "") || "";
