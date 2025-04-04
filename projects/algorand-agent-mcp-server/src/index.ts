#!/usr/bin/env node

// Add fetch polyfill
import "cross-fetch/polyfill";

import { AlgorandClient, Config } from "@algorandfoundation/algokit-utils";
import { Logger } from "@algorandfoundation/algokit-utils/types/logging";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import algosdk from "algosdk";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AiRegistryClient } from "./AiRegistry";

// Load from .env file only if environment variables aren't already set
if (!process.env.AGENT_NAME || !process.env.AGENT_AI_REGISTRY_APP_ID) {
  dotenv.config({
    path: path.resolve(__dirname, "..", ".env"),
  });
}

// Validate required environment variables
const requiredEnvVars = ["AGENT_NAME", "AGENT_AI_REGISTRY_APP_ID", "AGENT_PRIVATE_KEY"];

// Check for either AGENT_LSIG or AGENT_LSIG_ADDRESS
if (!process.env.AGENT_LSIG && !process.env.AGENT_LSIG_ADDRESS) {
  requiredEnvVars.push("AGENT_LSIG or AGENT_LSIG_ADDRESS");
}

// Check all required env vars
const missingVars = requiredEnvVars.filter((varName) => {
  if (varName.includes("or")) {
    // Special case for AGENT_LSIG or AGENT_LSIG_ADDRESS
    return false;
  }
  return !process.env[varName];
});

if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(", ")}`);
  process.exit(1);
}

// Create an MCP server
const server = new McpServer(
  {
    name: "algorand-agent-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      logging: {
        level: "debug",
        logToStdout: true,
      },
    },
  }
);

// Register required methods as tools
server.tool("resources", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: "[]",
      },
    ],
  };
});

server.tool("prompts", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: "[]",
      },
    ],
  };
});

const mcpAlgorandLogger: Logger = {
  error: (message: string, ...optionalParams: unknown[]) =>
    server.server.sendLoggingMessage({
      level: "error",
      data: message,
    }),
  warn: (message: string, ...optionalParams: unknown[]) =>
    server.server.sendLoggingMessage({
      level: "warning",
      data: message,
    }),
  info: (message: string, ...optionalParams: unknown[]) =>
    server.server.sendLoggingMessage({
      level: "info",
      data: message,
    }),
  verbose: (message: string, ...optionalParams: unknown[]) =>
    server.server.sendLoggingMessage({
      level: "notice",
      data: message,
    }),
  debug: (message: string, ...optionalParams: unknown[]) =>
    server.server.sendLoggingMessage({
      level: "debug",
      data: message,
    }),
};

server.tool("issue_payment_transaction", { receiver: z.string().length(58), amount: z.number() }, async ({ receiver, amount }) => {
  try {
    const ed = await import("@noble/ed25519");
    // Configure the ed25519 library to use Node.js crypto
    ed.etc.sha512Async = async (message: Uint8Array): Promise<Uint8Array> => {
      return crypto.createHash("sha512").update(Buffer.from(message)).digest();
    };

    const algorand = AlgorandClient.fromEnvironment();

    // Console output messes with MCP
    Config.configure({ logger: mcpAlgorandLogger });

    const agentName = process.env.AGENT_NAME!;
    const suggestedParams = await algorand.getSuggestedParams();
    const firstRound = suggestedParams.firstValid;
    const signingKey = await Buffer.from(process.env.AGENT_PRIVATE_KEY!, "base64");
    const publicKey = await ed.getPublicKeyAsync(signingKey);

    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64BE(BigInt(amount));

    const receiverPk = algosdk.decodeAddress(receiver).publicKey;

    const firstRoundBuffer = Buffer.alloc(8);
    firstRoundBuffer.writeBigUInt64BE(BigInt(firstRound));

    const message = Buffer.concat([amountBuffer, receiverPk, Buffer.from(agentName, "utf-8"), firstRoundBuffer]);

    const signature = await ed.signAsync(message, signingKey);

    // load app spec from ../AiRegistry.arc56.json
    const appSpec = await readFile(path.resolve(__dirname, "..", "AiRegistry.arc56.json"), "utf-8");
    const client = algorand.client.getTypedAppClientById(AiRegistryClient, {
      appId: BigInt(process.env.AGENT_AI_REGISTRY_APP_ID!),
    });

    // Use AGENT_LSIG if available, otherwise try to get it from AGENT_LSIG_ADDRESS
    let logicSig;
    if (process.env.AGENT_LSIG) {
      logicSig = algorand.account.logicsig(Buffer.from(process.env.AGENT_LSIG, "base64"));
    } else if (process.env.AGENT_LSIG_ADDRESS) {
      // When AGENT_LSIG_ADDRESS is provided, use it directly as the sender address
      mcpAlgorandLogger.info(`Using LSIG address: ${process.env.AGENT_LSIG_ADDRESS}`);
      logicSig = process.env.AGENT_LSIG_ADDRESS;
    }

    if (!logicSig) {
      throw new Error("Either AGENT_LSIG or valid AGENT_LSIG_ADDRESS must be provided");
    }

    const response = await client.send.issuePayment({
      args: [amount, receiver, agentName, publicKey, signature],
      sender: logicSig,
      populateAppCallResources: true,
      coverAppCallInnerTransactionFees: true,
      maxFee: (3000).microAlgo(), // Match the Python implementation's fee
    });

    return {
      content: [
        {
          type: "text",
          text: `Transaction issued to ${receiver} for amount ${amount} with transaction ID ${response.transaction.txID()} in round ${
            response.confirmation.confirmedRound
          }`,
        },
      ],
    };
  } catch (e: unknown) {
    console.error(e, (e as any).stack);
    throw e;
  }
});

async function main() {
  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
