# Contributing to Markdown Rules MCP

## Development Requirements

### Setup

1. Install Node.js 20+ for development:
   ```bash
   nvm use  # Uses Node 20 from .nvmrc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

5. Run the inspector:
   ```bash
   npm run inspector
   ```

### Cursor & Running the MCP Server Locally (WSL)

Here at Valstro, we're using Windows Subsystem for Linux (WSL) to run our MCP server. Cursor runs in Powershell & uses the WSL extension.

Therefore, to test the MCP server locally, we have a local `.cursor/mcp.json` file that points to a bash script that runs the MCP server with this setup.

If you're using WSL, you can use the `wsl-start-server.sh` script to start the MCP server. Just run this first:

```bash
chmod +x wsl-start-server.sh
```

Then you can run the MCP server in Cursor Settings > MCP Servers > markdown-rules-wsl > Run Server.

### Running the MCP Server Locally using other methods

First, disable the local MCP server in Cursor Settings > MCP Servers > markdown-rules-wsl > Disable.

Now follow the instructions in the [README](README.md) to run the MCP server locally.