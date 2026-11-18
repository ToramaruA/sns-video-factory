import { assert, GraphAILogger, type AgentFunction, type AgentFunctionInfo, type DefaultConfigData } from "graphai";
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
  const start = response.indexOf("```");
  if (start === -1) return response.trim();
  const firstNewline = response.indexOf("\n", start + 3);
  if (firstNewline === -1) return response.trim();
  const language = response.slice(start + 3, firstNewline).trim().toLowerCase();
  if (language !== "" && language !== "json") return response.trim();
  const end = response.indexOf("```", firstNewline + 1);
  return end === -1 ? response.trim() : response.slice(firstNewline + 1, end).trim();
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
    if (process.env.SNS_VIDEO_FREE_ONLY === "1") {
      // Log schema paths and diagnostic types only. Do not expose Groq output,
      // creative brief or any possibly private content to public Actions logs.
      const issues = (error as { issues?: { path?: PropertyKey[]; code?: string }[] } | null)?.issues;
      const reason = error instanceof SyntaxError
        ? "Response is not parseable JSON (raw and fenced formats both supported)"
        : issues?.length
          ? issues.slice(0, 6).map((issue) => String(issue.path?.join(".") || "$root") + ":" + String(issue.code || "invalid")).join(", ")
          : error instanceof Error ? error.name : "Unknown validation error";
      GraphAILogger.info("Free MulmoScript validation rejected response: " + reason);
    }
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
