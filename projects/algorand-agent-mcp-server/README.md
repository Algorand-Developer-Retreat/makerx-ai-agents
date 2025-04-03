# Algorand agent MCP server

To experiment with this:

1. Run `npm run build` to generate the output file
2. Create a `.env` file with the private key and app id
3. Add the MCP server to your AI setup, e.g. to prototype it manually add it to Claude Desktop with a config like this:

   ```json
   {
     "mcpServers": {
       "algorand": {
         "command": "node",
         "args": ["path/to/algorand-agent-mcp-server/build/index.js"]
       }
     }
   }
   ```
