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

## AlgoKit workspace root

This is your workspace root. A `workspace` in AlgoKit is an orchestrated collection of standalone projects (backends, smart contracts, frontend apps and etc).

By default, `projects_root_path` parameter is set to `projects`. Which instructs AlgoKit CLI to create a new directory under `projects` directory when new project is instantiated via `algokit init` at the root of the workspace.

## Getting Started

To get started refer to `README.md` files in respective sub-projects in the `projects` directory.

To learn more about algokit, visit [documentation](https://github.com/algorandfoundation/algokit-cli/blob/main/docs/algokit.md).

### GitHub Codespaces

To get started execute:

1. `algokit generate devcontainer` - invoking this command from the root of this repository will create a `devcontainer.json` file with all the configuration needed to run this project in a GitHub codespace. [Run the repository inside a codespace](https://docs.github.com/en/codespaces/getting-started/quickstart) to get started.
2. `algokit init` - invoke this command inside a github codespace to launch an interactive wizard to guide you through the process of creating a new AlgoKit project

Powered by [Copier templates](https://copier.readthedocs.io/en/stable/).
