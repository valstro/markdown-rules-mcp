# Contributing to Markdown Rules MCP

## Development Requirements

### Node.js Version Requirements

This project has different Node.js requirements for development vs runtime:

- **Development/Building**: Node.js 20+ required
  - CI/CD runners use Node 20
  - Building and testing require Node 20+
  - Use `.nvmrc` file: `nvm use` will set Node 20

- **Runtime/Users**: Node.js 18+ supported
  - The built package runs on Node 18+
  - `package.json` engines field specifies `>=18.0.0`
  - Docker runtime image uses Node 18

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