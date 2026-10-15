import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(import.meta.url);
/** Support the user's desktop as well as Linux CI. Explicit executable paths take precedence. */
export function getBinary(name) {
  const override = process.env[name.toUpperCase() + "_PATH"];
  if (override) return override;
  const suffix = process.platform === "win32" ? ".exe" : "";
  const packages =
    process.platform === "win32"
      ? ["@remotion/compositor-win32-x64-msvc"]
      : process.platform === "darwin"
        ? [
            "@remotion/compositor-darwin-arm64",
            "@remotion/compositor-darwin-x64",
          ]
        : process.arch === "arm64"
          ? ["@remotion/compositor-linux-arm64-gnu"]
          : [
              "@remotion/compositor-linux-x64-gnu",
              "@remotion/compositor-linux-x64-musl",
            ];
  for (const pkg of packages) {
    try {
      const candidate = path.join(
        path.dirname(require.resolve(pkg + "/package.json")),
        name + suffix,
      );
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  throw new Error(
    `No bundled ${name} for ${process.platform}/${process.arch}. Set ${name.toUpperCase()}_PATH to an installed executable.`,
  );
}
