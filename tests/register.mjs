// Lets Node's built-in test runner load the app's TypeScript files:
// resolves "@/..." imports and extension-less "./x" imports to .ts files.
import { register } from "node:module";
register("./resolve.mjs", import.meta.url);
