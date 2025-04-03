import { AlgorandClient, Config } from "@algorandfoundation/algokit-utils";
import { Logger } from "@algorandfoundation/algokit-utils/types/logging";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import algosdk, { ABIUintType } from "algosdk";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

dotenv.config({
  path: "C:\\dev\\makerx\\makerx-ai-agents\\projects\\algorand-agent-mcp-server\\.env",
});

if (!process.env.ALGOD_SERVER) {
  console.error(".env not loaded correctly");
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

server.tool("issue_transaction", { receiver: z.string().length(58), amount: z.number() }, async ({ receiver, amount }) => {
  try {
    const ed = await import("@noble/ed25519");
    const algorand = AlgorandClient.fromEnvironment();

    // Console output messes with MCP
    Config.configure({ logger: mcpAlgorandLogger });

    const agentName = process.env.AGENT_NAME!;
    const suggestedParams = await algorand.getSuggestedParams();
    const firstRound = suggestedParams.firstValid;
    const signingKey = await Buffer.from(process.env.AGENT_PRIVATE_KEY!, "base64");
    //const signingKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(signingKey);

    // const amountBuffer = Buffer.alloc(8);
    // amountBuffer.writeBigUInt64BE(BigInt(amount));

    const message = Buffer.concat([
      ABIUintType.from("uint64").encode(amount),
      algosdk.decodeAddress(receiver).publicKey,
      Buffer.from(agentName, "utf-8"),
      ABIUintType.from("uint64").encode(firstRound),
    ]);

    const signature = await ed.signAsync(message, signingKey);
    // load app spec from ../AiRegistry.arc56.json
    const appSpec = await readFile(path.resolve(__dirname, "..", "AiRegistry.arc56.json"), "utf-8");
    const client = algorand.client.getAppClientById({ appId: BigInt(process.env.AGENT_AI_REGISTRY_APP_ID!), appSpec });

    const logicSig = algorand.account.logicsig(Buffer.from(process.env.AGENT_LSIG!, "base64"));

    const response = await client.send.call({
      method: "issue_payment",
      args: [amount, receiver, agentName, publicKey, signature, firstRound],
      sender: logicSig,
      populateAppCallResources: true,
      coverAppCallInnerTransactionFees: true,
      maxFee: (4000).microAlgo(),
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
