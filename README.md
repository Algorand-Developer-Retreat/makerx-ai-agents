# Algorand AI Agents by MakerX

This project implements a prototype solution to the following hypothesis:

> It's possible to enable someone to manage many (hundreds, etc.) of AI agents that have restricted permissions to perform economically useful functions (i.e. transferring value via Algorand) without needing to set up or manage new blockchain accounts for each agent (and associated minimum balance requirements etc.), or compromise my security by giving all agents my account mnemonic.

The way we have decided to implement this for this prototype implementation is through the following design:

![Algorand AI Agents architecture](./docs/Algorand%20AI%20Agents.jpg)

There are three phases in this design:

1. Setup (once only)
   1. The user bootstraps their AI agent management plane by deploying the AI Agent delegation smart contract
   2. The user funds that smart contract and the logicsig account associated with the app ID of that app so both have plenty of fee coverage
2. Agent setup (once per agent)
   1. The user generates a public/private keypair and gives the keypair, the app ID of the delegation app and the compiled logic app code to the AI agent and deploys that agent
   2. The user registers that agent with the delegation app by providing the public key (as the agent identifier) and a set of restrictions that dictate what that agent can do and for how long
3. Agent calls (ongoing, automated)
   1. The agent can make calls using the delegation app by creating a payload to describe the call to make, using it's private key to sign that payload and then using the logic sig to sign the transaction (so it doesn't need to have it's own account that needs to be managed on-chain)
   2. The delegation app then validates that the signature is valid for the public key, that the thing it is being asked to do by the agent is valid according to the restrictions for that agent, and then issues the underlying transaction(s) to perform the action

## Running Hackathon demo

> PLEASE NOTE: This setup has not been extensively tested on Windows. If you run into any windows specific issues, use unix or wait until this ideated hackathon project is further refined and improved ;)

## Quick Start Guide

1. Initialize all project dependencies:

   ```bash
   algokit project bootstrap all
   ```

2. Deploy the AI Registry smart contract to localnet:

   ```bash
   cd projects/makerx-ai-agents
   algokit project deploy localnet
   ```

3. Start the agent deployer web interface:

   ```bash
   cd projects/makerx-agent-deployer
   npm run dev
   ```

4. Complete the setup:
   - Navigate to http://localhost:3000 in your browser
   - Deploy a new AI Registry
   - Create and deploy an agent for your registry
   - Copy the generated MCP configuration
   - Paste the configuration into your Claude Desktop agent configuration JSON file
   - Restart Claude Desktop
   - Interact with your agent by asking it to perform operations within its permissions
