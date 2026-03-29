import type { BetterAuthPluginDBSchema } from "better-auth";
import { buildSchema } from "./schema-resolver.js";
import type { SchemaOverrides } from "./schema-resolver.js";

export const tokenWalletSchema: BetterAuthPluginDBSchema = buildSchema();

export function createCustomSchema(
  overrides?: SchemaOverrides,
): BetterAuthPluginDBSchema {
  return buildSchema(overrides);
}
