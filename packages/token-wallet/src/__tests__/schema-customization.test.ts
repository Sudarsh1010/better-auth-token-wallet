import { describe, it, expect } from "vitest";
import { buildSchema, resolveTableName, resolveFieldName } from "../schema-resolver.js";
import { tokenWallet } from "../index.js";

describe("schema customization", () => {
  it("default schema has expected table names", () => {
    const schema = buildSchema();
    const tables = Object.keys(schema);
    expect(tables).toContain("walletAccount");
    expect(tables).toContain("walletTransaction");
    expect(tables).toContain("walletEntry");
    expect(tables).toContain("walletHold");
    expect(tables).toHaveLength(4);
  });

  it("default schema has expected field names", () => {
    const schema = buildSchema();
    const walletAccountFields = Object.keys(schema.walletAccount.fields);
    expect(walletAccountFields).toContain("referenceKey");
    expect(walletAccountFields).toContain("referenceType");
    expect(walletAccountFields).toContain("accountType");
    expect(walletAccountFields).toContain("postedBalance");
    expect(walletAccountFields).toContain("pendingDebits");
    expect(walletAccountFields).toContain("availableBalance");
    expect(walletAccountFields).toContain("lockVersion");
    expect(walletAccountFields).toContain("currency");
    expect(walletAccountFields).toContain("createdAt");
    expect(walletAccountFields).toContain("updatedAt");
  });

  it("custom table name override works via modelName", () => {
    const schema = buildSchema({
      walletAccount: { tableName: "my_wallets" },
    });
    expect(schema.walletAccount.modelName).toBe("my_wallets");
  });

  it("custom field name override works via fieldName", () => {
    const schema = buildSchema({
      walletAccount: {
        fields: { postedBalance: "posted_bal" },
      },
    });
    expect(schema.walletAccount.fields.postedBalance.fieldName).toBe(
      "posted_bal",
    );
  });

  it("multiple overrides work simultaneously", () => {
    const schema = buildSchema({
      walletAccount: {
        tableName: "my_wallets",
        fields: {
          postedBalance: "posted_bal",
          availableBalance: "avail_bal",
        },
      },
      walletTransaction: {
        tableName: "my_transactions",
        fields: { idempotencyKey: "idem_key" },
      },
    });
    expect(schema.walletAccount.modelName).toBe("my_wallets");
    expect(schema.walletAccount.fields.postedBalance.fieldName).toBe(
      "posted_bal",
    );
    expect(schema.walletAccount.fields.availableBalance.fieldName).toBe(
      "avail_bal",
    );
    expect(schema.walletTransaction.modelName).toBe("my_transactions");
    expect(schema.walletTransaction.fields.idempotencyKey.fieldName).toBe(
      "idem_key",
    );
    expect(
      (schema.walletAccount.fields.referenceKey as Record<string, unknown>)
        .fieldName,
    ).toBeUndefined();
  });

  it("unknown table/field names in overrides are ignored", () => {
    const schema = buildSchema({
      unknownTable: { tableName: "ignored" },
      walletAccount: {
        fields: { unknownField: "ignored_col" },
      },
    });
    expect(Object.keys(schema)).not.toContain("unknownTable");

    expect(
      (schema.walletAccount.fields.referenceKey as Record<string, unknown>)
        .fieldName,
    ).toBeUndefined();
  });
});

describe("resolveTableName", () => {
  it("returns default when no overrides", () => {
    expect(resolveTableName(undefined, "walletAccount", "walletAccount")).toBe(
      "walletAccount",
    );
  });

  it("returns override when provided", () => {
    const overrides = { walletAccount: { tableName: "my_wallets" } };
    expect(resolveTableName(overrides, "walletAccount", "walletAccount")).toBe(
      "my_wallets",
    );
  });
});

describe("resolveFieldName", () => {
  it("returns default when no overrides", () => {
    expect(
      resolveFieldName(undefined, "walletAccount", "postedBalance", "postedBalance"),
    ).toBe("postedBalance");
  });

  it("returns override when provided", () => {
    const overrides = {
      walletAccount: { fields: { postedBalance: "posted_bal" } },
    };
    expect(
      resolveFieldName(
        overrides,
        "walletAccount",
        "postedBalance",
        "postedBalance",
      ),
    ).toBe("posted_bal");
  });
});

describe("schema customization via plugin options", () => {
  it("plugin passes schema overrides to schema builder", () => {
    const plugin = tokenWallet({
      schema: {
        walletAccount: {
          tableName: "custom_wallets",
          fields: { postedBalance: "posted_balance" },
        },
      },
    });
    expect(plugin.schema).toBeDefined();
    const schema = plugin.schema!;
    expect((schema.walletAccount as Record<string, unknown>).modelName).toBe(
      "custom_wallets",
    );
    const fields = schema.walletAccount.fields as unknown as Record<
      string,
      Record<string, unknown>
    >;
    expect(fields.postedBalance.fieldName).toBe("posted_balance");
  });
});
