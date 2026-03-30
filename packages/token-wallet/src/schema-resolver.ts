import type { BetterAuthPluginDBSchema, DBFieldAttribute } from "better-auth";

export type SchemaOverrides = Record<
  string,
  { tableName?: string; fields?: Record<string, string> }
>;

export function resolveTableName(
  overrides: SchemaOverrides | undefined,
  modelName: string,
  defaultName: string,
): string {
  return overrides?.[modelName]?.tableName ?? defaultName;
}

export function resolveFieldName(
  overrides: SchemaOverrides | undefined,
  modelName: string,
  fieldName: string,
  defaultFieldName: string,
): string {
  return overrides?.[modelName]?.fields?.[fieldName] ?? defaultFieldName;
}

function applyFieldOverrides(
  fields: Record<string, DBFieldAttribute>,
  modelOverrides: { fields?: Record<string, string> } | undefined,
): Record<string, DBFieldAttribute> {
  if (!modelOverrides?.fields) return fields;

  const result: Record<string, DBFieldAttribute> = {};
  for (const [name, fieldDef] of Object.entries(fields)) {
    const override = modelOverrides.fields[name];
    if (override !== undefined) {
      result[name] = { ...fieldDef, fieldName: override };
    } else {
      result[name] = { ...fieldDef };
    }
  }
  return result;
}

export function buildSchema(
  overrides?: SchemaOverrides,
): BetterAuthPluginDBSchema {
  const baseSchema: BetterAuthPluginDBSchema = {
    walletAccount: {
      fields: {
        referenceKey: { type: "string", required: true, unique: true },
        referenceType: { type: "string", required: true },
        accountType: { type: "string", required: true },
        postedBalance: {
          type: "number",
          required: true,
          defaultValue: 0,
        },
        pendingDebits: {
          type: "number",
          required: true,
          defaultValue: 0,
        },
        availableBalance: {
          type: "number",
          required: true,
          defaultValue: 0,
        },
        lockVersion: { type: "number", required: true, defaultValue: 0 },
        currency: {
          type: "string",
          required: true,
          defaultValue: "token",
        },
        createdAt: {
          type: "date",
          required: true,
          defaultValue: (): Date => new Date(),
        },
        updatedAt: {
          type: "date",
          required: true,
          defaultValue: (): Date => new Date(),
        },
      },
    },
    walletTransaction: {
      fields: {
        idempotencyKey: { type: "string", required: true, unique: true },
        transactionType: { type: "string", required: true },
        status: {
          type: "string",
          required: true,
          defaultValue: "posted",
        },
        metadata: { type: "json", required: false },
        referenceTxId: { type: "string", required: false },
        referenceKey: { type: "string", required: false },
        createdAt: {
          type: "date",
          required: true,
          defaultValue: (): Date => new Date(),
        },
      },
    },
    walletEntry: {
      fields: {
        transactionId: {
          type: "string",
          required: true,
          references: { model: "walletTransaction", field: "id" },
        },
        accountId: {
          type: "string",
          required: true,
          references: { model: "walletAccount", field: "id" },
        },
        entryType: { type: "string", required: true },
        amount: { type: "number", required: true },
        balanceType: { type: "string", required: true },
        createdAt: {
          type: "date",
          required: true,
          defaultValue: (): Date => new Date(),
        },
      },
    },
    walletHold: {
      fields: {
        transactionId: {
          type: "string",
          required: true,
          references: { model: "walletTransaction", field: "id" },
        },
        accountId: {
          type: "string",
          required: true,
          references: { model: "walletAccount", field: "id" },
        },
        status: {
          type: "string",
          required: true,
          defaultValue: "active",
        },
        amount: { type: "number", required: true },
        capturedAmount: { type: "number", required: false },
        captureTransactionId: { type: "string", required: false },
        voidTransactionId: { type: "string", required: false },
        createdAt: {
          type: "date",
          required: true,
          defaultValue: (): Date => new Date(),
        },
      },
    },
  };

  if (!overrides) return baseSchema;

  const result: BetterAuthPluginDBSchema = {};

  for (const [modelName, modelDef] of Object.entries(baseSchema)) {
    const modelOverrides = overrides[modelName];
    const resolvedModel: (typeof baseSchema)[string] = {
      fields: applyFieldOverrides(modelDef.fields, modelOverrides),
    };

    if (modelOverrides?.tableName) {
      resolvedModel.modelName = modelOverrides.tableName;
    }

    result[modelName] = resolvedModel;
  }

  return result;
}
