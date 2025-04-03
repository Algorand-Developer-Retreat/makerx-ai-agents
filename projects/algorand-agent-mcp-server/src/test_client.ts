import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: { tools: {}, resources: {}, prompts: {} } });

const transport = new StdioClientTransport({
  command: "node",
  args: ["build/index.js"],
});

async function main() {
  await client.connect(transport);
  //await client.initialize();

  const tools = await client.listTools();
  console.log("Available tools:", tools.tools);

  const result = await client.callTool({
    name: "issue_transaction",
    arguments: {
      receiver: "YHZMLCHDAABIX4OPBC2YR6RBVNUH3DQ7TYMESCR6VMGTRXKVZELM6AAQCY",
      amount: 3,
    },
  });

  console.log(result);

  client.close();
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
