# Algorand agent MCP server

This project implements an MCP server for Algorand agent interactions, available in both TypeScript and Python implementations.

## TypeScript Implementation

To experiment with the TypeScript implementation:

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

## Python Implementation

To use the Python implementation:

1. Set up a Python environment (Python 3.8+ recommended)
2. Install dependencies: `pip install -r requirements.txt`
3. Create a `.env` file with the required parameters (use `.env.template` as a guide)
4. Run the server: `python app.py`
5. Add the MCP server to your AI setup, e.g. to prototype it manually add it to Claude Desktop with a config like this:

   ```json
   {
     "mcpServers": {
       "algorand": {
         "command": "python",
         "args": ["path/to/algorand-agent-mcp-server/app.py"]
       }
     }
   }
   ```
