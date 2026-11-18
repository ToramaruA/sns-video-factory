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
  const languageToken = response.slice(start + 3, firstNewline);
  const language = languageToken.trim().toLowerCase();
  if (language !== "" && language !== "json") return response.trim();
  const end = response.indexOf("```", firstNewline + 1);
  return end === -1 ? response.trim() : response.slice(firstNewline + 1, end).trim();
};

const sanitizedReason = (error: unknown): string => {
  if (error instanceof SyntaxError) return "Response is not parseable JSON";
  if (error instanceof Error && error.message === "text is required") return "Groq response text was missing";
  const issues = (error as { issues?: { path?: PropertyKey[]; code?: string }[] } | null)?.issues;
  if (issues?.length) {
    const paths = issues.slice(0, 6).map((issue) => {
      const path = String(issue.path?.join(".") || "$root");
      return path + ":" + String(issue.code || "invalid");
    });
    return paths.join(", ");
  }
  return error instanceof Error ? error.name : "Unknown validation error";
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
      GraphAILogger.info("Free MulmoScript validation rejected response: " + sanitizedReason(error));
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
