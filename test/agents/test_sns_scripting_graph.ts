import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GraphAI, type GraphData } from "graphai";
import * as agents from "@graphai/vanilla";
import validateSchemaAgent from "../../src/agents/validate_schema_agent.js";


// Exercise the same nested GraphAI validation data path used by MulmoCast's
// native "tool scripting", without a Groq call or any paid API.
test("native Groq scripting graph passes text and the Zod schema to validation", async () => {
  const sample = JSON.parse(readFileSync("scripts/templates/sns_free_vertical_video.json", "utf8"));
  const responseText = JSON.stringify(sample);
  const graphData: GraphData = {
    version: 0.5,
    nodes: {
      llmAgent: { value: "copyAgent" },
      prompt: { value: "a Japanese SNS brief" },
      script: {
        agent: "nestedAgent",
        inputs: { llmAgent: ":llmAgent", prompt: ":prompt" },
        isResult: true,
        graph: {
          nodes: {
            llm: { agent: ":llmAgent", inputs: { text: responseText } },
            validateSchemaAgent: {
              agent: "validateSchemaAgent",
              inputs: { text: ":llm.text", schemaName: "mulmoScript" },
              isResult: true,
            },
          },
        },
      },
    },
  };
  const graph = new GraphAI(graphData, {
    ...(agents.default ?? agents),
    validateSchemaAgent,
  });
  const output = await graph.run<{ validateSchemaAgent?: { isValid: boolean; error?: string } }>();
  assert.equal(output?.script?.validateSchemaAgent?.isValid, true, JSON.stringify(output));
});
