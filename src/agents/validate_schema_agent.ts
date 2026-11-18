import { assert, type AgentFunction, type AgentFunctionInfo, type DefaultConfigData } from "graphai";
import { type MulmoScript, mulmoScriptSchema } from "../types/index.js";

interface ValidateMulmoScriptInputs {
  text: string;
  schema: typeof mulmoScriptSchema;
}

interface ValidateMulmoScriptResponse {
  isValid: boolean;
  data?: MulmoScript;
  error?: string;
}

/**
 * LLMs may return either a fenced JSON block (as the prompt requests) or
 * a bare JSON object. Keep MulmoCast's existing schema as the sole validator.
 * Do not try to repair invalid objects or silently alter provider/beat fields.
 */
export const extractMulmoJsonText = (response: string): string => {
  const match = response.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i);
  return (match?.[1] ?? response).trim();
};

/**
 * Zod schema validation agent
 * Validates if a JSON string conforms to the Zod schema
 */
export const validateSchemaAgent: AgentFunction<object, ValidateMulmoScriptResponse, ValidateMulmoScriptInputs, DefaultConfigData> = async ({
  namedInputs,
}) => {
  const { text, schema } = namedInputs;
  try {
    assert(!!schema, "schema is required");
    assert(!!text, "text is required");

    const jsonData = JSON.parse(extractMulmoJsonText(text));
    const parsed = schema.parse(jsonData);
    return {
      isValid: true,
      data: parsed,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const validateMulmoScriptAgentInfo: AgentFunctionInfo = {
  name: "validateSchemaAgent",
  agent: validateSchemaAgent,
  mock: validateSchemaAgent,
  samples: [],
  description: "Validates if a JSON string conforms to the Zod schema",
  category: ["validation"],
  author: "Receptron Team",
  repository: "https://github.com/receptron/mulmocast-cli/tree/main/src/agents/validate_schema_agent.ts",
  license: "MIT",
};

export default validateMulmoScriptAgentInfo;
