import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import React, { useEffect, useState } from 'react'
import { AiRegistryClient } from '../contracts/AiRegistry'
import { getAlgodConfigFromViteEnvironment, getIndexerConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'
// Use noble/ed25519 for proper key generation
import * as ed from '@noble/ed25519'

// Permission options mapping to bitmap values
interface PermissionOption {
  label: string
  value: number
  description: string
}

const PERMISSION_OPTIONS: PermissionOption[] = [
  { label: 'Payment Only', value: 1, description: 'Agent can only issue payments' },
  { label: 'Asset Transfer Only', value: 2, description: 'Agent can only transfer assets' },
  { label: 'Payment + Asset Transfer', value: 3, description: 'Agent can issue payments and transfer assets' },
  { label: 'Asset Opt-In Only', value: 4, description: 'Agent can only opt-in to assets' },
  { label: 'Payment + Asset Opt-In', value: 5, description: 'Agent can issue payments and opt-in to assets' },
  { label: 'Asset Transfer + Asset Opt-In', value: 6, description: 'Agent can transfer assets and opt-in to assets' },
  { label: 'All Permissions', value: 7, description: 'Agent has all permissions (payment, transfer, opt-in)' },
]

interface Contract {
  id: number
  name: string
  appId: number
  deployed: boolean
  funded: boolean
  lsigAddress: string
  compiledLsig?: string // Base64 encoded compiled LSIG
}

interface Agent {
  id: number
  name: string
  appId: number
  deployed: boolean
  publicKey?: Uint8Array
  privateKey?: Uint8Array
  privateKeyBase64?: string
  permissions?: number
}

const AgentDeployer: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false)
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [openAgentModal, setOpenAgentModal] = useState<boolean>(false)
  const [openCreateAgentModal, setOpenCreateAgentModal] = useState<boolean>(false)
  const [openJsonModal, setOpenJsonModal] = useState<boolean>(false)
  const [openPrivateKeyModal, setOpenPrivateKeyModal] = useState<boolean>(false)
  const [openContractSelectModal, setOpenContractSelectModal] = useState<boolean>(false)
  const [agentJson, setAgentJson] = useState<string>('')
  const [agentParams, setAgentParams] = useState({
    agentName: '',
    tokenAmount: 100000,
    minRound: 0,
    maxRound: 10000000,
    permissions: 7, // Default to all permissions
  })

  const { enqueueSnackbar } = useSnackbar()
  const { transactionSigner, activeAddress } = useWallet()

  // Create Algorand client
  const algodConfig = getAlgodConfigFromViteEnvironment()
  const indexerConfig = getIndexerConfigFromViteEnvironment()
  const algorand = AlgorandClient.fromConfig({
    algodConfig,
    indexerConfig,
  })
  algorand.setDefaultSigner(transactionSigner)

  // Load deployed contracts from local storage
  useEffect(() => {
    if (activeAddress) {
      const savedContracts = localStorage.getItem('aiRegistryContracts')
      if (savedContracts) {
        const contracts = JSON.parse(savedContracts)
        setAvailableContracts(contracts.filter((c: Contract) => c.funded))
      }

      // Load saved agents for a selected contract
      const savedAgents = localStorage.getItem(`agents_${selectedContract?.appId}`)
      if (savedAgents && selectedContract) {
        setAgents(JSON.parse(savedAgents))
      }
    }
  }, [activeAddress, selectedContract?.appId])

  // Save agents to local storage when they change
  useEffect(() => {
    if (agents.length > 0 && selectedContract) {
      localStorage.setItem(`agents_${selectedContract.appId}`, JSON.stringify(agents))
    }
  }, [agents, selectedContract])

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent)
    setOpenAgentModal(true)
  }

  const handleContractSelect = (contract: Contract) => {
    setSelectedContract(contract)

    // Load agents for the selected contract
    const savedAgents = localStorage.getItem(`agents_${contract.appId}`)
    if (savedAgents) {
      setAgents(JSON.parse(savedAgents))
    } else {
      setAgents([])
    }

    setOpenContractSelectModal(false)
  }

  const showPrivateKey = (agent: Agent) => {
    setSelectedAgent(agent)
    setOpenPrivateKeyModal(true)
  }

  const downloadPrivateKeyFile = (agent: Agent) => {
    if (!agent.privateKeyBase64) {
      enqueueSnackbar('Private key not available for this agent', { variant: 'error' })
      return
    }

    const blob = new Blob([agent.privateKeyBase64], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agent.name}_private_key.txt`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
    enqueueSnackbar('Private key downloaded successfully', { variant: 'success' })
  }

  const createAgent = async () => {
    try {
      if (!selectedContract) {
        enqueueSnackbar('Please select an AI Registry first', { variant: 'warning' })
        return
      }

      if (!activeAddress) {
        enqueueSnackbar('Please connect your wallet', { variant: 'warning' })
        return
      }

      if (!agentParams.agentName) {
        enqueueSnackbar('Agent name is required', { variant: 'warning' })
        return
      }

      if (!selectedContract.compiledLsig) {
        enqueueSnackbar('Compiled LSIG is missing from the contract', { variant: 'warning' })
        return
      }

      setLoading(true)
      enqueueSnackbar('Registering agent...', { variant: 'info' })

      // Generate agent key pair using ed25519
      const privateKey = ed.utils.randomPrivateKey()
      const publicKey = await ed.getPublicKeyAsync(privateKey)

      // Get current round from network
      const currentRound = 10000000
      let validUntilRound = agentParams.maxRound

      // Try to use the max round from the form, or default to current + 10000
      if (agentParams.maxRound > 0) {
        validUntilRound = agentParams.maxRound
      } else {
        validUntilRound = currentRound + 10000 // Valid for 10000 rounds by default
      }

      // Create an AiRegistryClient instance
      const aiRegistryClient = new AiRegistryClient({
        appId: BigInt(selectedContract.appId),
        defaultSender: activeAddress,
        algorand,
      })

      // Use the permissions selected in the form
      const permissions = agentParams.permissions
      const maxAmount = BigInt(agentParams.tokenAmount)

      // Call register_agent
      const response = await aiRegistryClient.send.registerAgent({
        args: {
          agentPKey: publicKey,
          permissions: BigInt(permissions),
          maxAmount: maxAmount,
          validUntilRound: BigInt(validUntilRound),
        },
      })

      console.log('Response from register_agent:', response)

      // Encode private key for config
      const privateKeyBase64 = Buffer.from(privateKey).toString('base64')

      // Generate the JSON for the MCP server
      const json = JSON.stringify(
        {
          mcpServers: {
            algorand: {
              command: 'npx',
              env: {
                AGENT_NAME: agentParams.agentName,
                AGENT_AI_REGISTRY_APP_ID: String(selectedContract.appId),
                AGENT_LSIG_ADDRESS: selectedContract.lsigAddress,
                AGENT_LSIG: selectedContract.compiledLsig,
                AGENT_PRIVATE_KEY: privateKeyBase64,
              },
              args: ['makerx-algorand-agent-mcp-server'],
            },
          },
        },
        null,
        2,
      )

      setAgentJson(json)

      // Add the new agent to the list
      const newAgent = {
        id: Date.now(),
        name: agentParams.agentName,
        appId: selectedContract.appId,
        deployed: true,
        publicKey,
        privateKey,
        privateKeyBase64, // Store base64 encoded private key for easier access
        permissions: agentParams.permissions,
      }

      setAgents([...agents, newAgent])
      setSelectedAgent(newAgent)
      setOpenCreateAgentModal(false)
      setOpenJsonModal(true)

      enqueueSnackbar('Agent registered successfully!', { variant: 'success' })
    } catch (error) {
      console.error('Error registering agent:', error)
      enqueueSnackbar('Failed to register agent', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // Function to get permission description for display in agent details
  const getPermissionDescription = (permissionValue: number = 7): string => {
    const permission = PERMISSION_OPTIONS.find((option) => option.value === permissionValue)
    return permission ? permission.label : 'Unknown'
  }

  const showMcpConfig = (agent: Agent) => {
    try {
      if (!selectedContract) {
        enqueueSnackbar('Contract information missing', { variant: 'error' })
        return
      }

      if (!selectedContract.compiledLsig) {
        enqueueSnackbar('Compiled LSIG is missing from the contract', { variant: 'warning' })
        return
      }

      // If we have the private key stored, use it
      let privateKeyBase64 = 'YOUR_PRIVATE_KEY_HERE'
      if (agent.privateKeyBase64) {
        privateKeyBase64 = agent.privateKeyBase64
      } else if (agent.privateKey) {
        privateKeyBase64 = Buffer.from(agent.privateKey).toString('base64')
      }

      const json = JSON.stringify(
        {
          mcpServers: {
            algorand: {
              command: 'npx',
              env: {
                AGENT_NAME: agent.name,
                AGENT_AI_REGISTRY_APP_ID: String(agent.appId),
                AGENT_LSIG_ADDRESS: selectedContract.lsigAddress,
                AGENT_LSIG: selectedContract.compiledLsig,
                AGENT_PRIVATE_KEY: privateKeyBase64,
              },
              args: ['makerx-algorand-agent-mcp-server'],
            },
          },
        },
        null,
        2,
      )

      setAgentJson(json)
      setOpenJsonModal(true)
    } catch (error) {
      console.error('Error generating MCP config:', error)
      enqueueSnackbar('Failed to generate MCP configuration', { variant: 'error' })
    }
  }

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h2 className="text-2xl font-bold">AI Agents</h2>
        <div className="flex gap-2">
          {selectedContract ? (
            <>
              <div className="bg-base-200 px-4 py-2 rounded-md flex items-center">
                <span className="mr-2 text-sm">Active Registry:</span>
                <span className="font-semibold">
                  {selectedContract.name} (App ID: {selectedContract.appId})
                </span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setOpenContractSelectModal(true)}>
                Change
              </button>
              <button className="btn btn-primary" onClick={() => setOpenCreateAgentModal(true)}>
                Create Agent
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setOpenContractSelectModal(true)} disabled={availableContracts.length === 0}>
              {availableContracts.length === 0 ? 'No Registries Available' : 'Select Registry'}
            </button>
          )}
        </div>
      </div>

      {availableContracts.length === 0 && (
        <div className="alert bg-base-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info shrink-0 w-6 h-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <div>
            <h3 className="font-bold">No funded registries available</h3>
            <div className="text-sm">Go to the Contracts tab to deploy and fund an AI Registry first.</div>
          </div>
        </div>
      )}

      {selectedContract && agents.length === 0 && (
        <div className="alert bg-base-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info shrink-0 w-6 h-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <span>No agents deployed yet. Click the "Create Agent" button to deploy your first agent.</span>
        </div>
      )}

      {selectedContract && agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {agents.map((agent) => (
            <div key={agent.id} className="card bg-base-200 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">{agent.name}</h2>
                <p className="text-sm">App ID: {agent.appId}</p>
                <div className="card-actions justify-end mt-2">
                  <div className="badge badge-success">Deployed</div>
                  <button className="btn btn-sm btn-primary" onClick={() => handleAgentClick(agent)}>
                    Details
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={() => showMcpConfig(agent)}>
                    MCP Config
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contract Select Modal */}
      <dialog id="contract_select_modal" className={`modal ${openContractSelectModal ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">Select AI Registry</h3>
          <div className="py-4">
            {availableContracts.length === 0 ? (
              <p>No funded registry contracts available. Please deploy and fund a registry first.</p>
            ) : (
              <div className="grid gap-2">
                {availableContracts.map((contract) => (
                  <div
                    key={contract.id}
                    className="p-3 bg-base-300 rounded-lg cursor-pointer hover:bg-base-200"
                    onClick={() => handleContractSelect(contract)}
                  >
                    <h4 className="font-semibold">{contract.name}</h4>
                    <p className="text-sm">App ID: {contract.appId}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-action">
            <button className="btn" onClick={() => setOpenContractSelectModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      </dialog>

      {/* Agent Details Modal */}
      <dialog id="agent_modal" className={`modal ${openAgentModal ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">{selectedAgent?.name}</h3>
          <div className="py-4">
            <p>
              <span className="font-semibold">App ID:</span> {selectedAgent?.appId}
            </p>
            <p className="mt-2">
              <span className="font-semibold">Status:</span> <span className="badge badge-success">Deployed</span>
            </p>
            {selectedAgent?.permissions && (
              <p className="mt-2">
                <span className="font-semibold">Permissions:</span>{' '}
                <span className="badge badge-info">{getPermissionDescription(selectedAgent.permissions)}</span>
              </p>
            )}
            <div className="divider"></div>
            <div className="flex flex-col gap-2">
              <h4 className="font-semibold">Security Options:</h4>
              <div className="flex gap-2">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    if (selectedAgent) {
                      showPrivateKey(selectedAgent)
                    }
                  }}
                >
                  View Private Key
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    if (selectedAgent) {
                      downloadPrivateKeyFile(selectedAgent)
                    }
                  }}
                >
                  Download Private Key
                </button>
              </div>
              <p className="text-xs text-warning mt-1">
                IMPORTANT: Store your private key securely. Anyone with access to this key can control your agent.
              </p>
            </div>
          </div>
          <div className="modal-action">
            <button className="btn" onClick={() => setOpenAgentModal(false)}>
              Close
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (selectedAgent) {
                  showMcpConfig(selectedAgent)
                  setOpenAgentModal(false)
                }
              }}
            >
              Show MCP Config
            </button>
          </div>
        </div>
      </dialog>

      {/* Create Agent Modal */}
      <dialog id="create_agent_modal" className={`modal ${openCreateAgentModal ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">Create New Agent</h3>
          <div className="form-control w-full mt-4">
            <label className="label">
              <span className="label-text">Agent Name</span>
            </label>
            <input
              type="text"
              placeholder="Enter agent name"
              className="input input-bordered w-full"
              value={agentParams.agentName}
              onChange={(e) => setAgentParams({ ...agentParams, agentName: e.target.value })}
            />
          </div>
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">Token Amount (microAlgos)</span>
              <span className="label-text-alt">Maximum amount per transaction</span>
            </label>
            <input
              type="number"
              placeholder="Enter token amount"
              className="input input-bordered w-full"
              value={agentParams.tokenAmount}
              onChange={(e) => setAgentParams({ ...agentParams, tokenAmount: parseInt(e.target.value) })}
              min="1000"
            />
          </div>
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">Permissions</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={agentParams.permissions}
              onChange={(e) => setAgentParams({ ...agentParams, permissions: parseInt(e.target.value) })}
            >
              {PERMISSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="label">
              <span className="label-text-alt">
                {PERMISSION_OPTIONS.find((option) => option.value === agentParams.permissions)?.description}
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Min Round</span>
                <span className="label-text-alt">Optional</span>
              </label>
              <input
                type="number"
                placeholder="Min round"
                className="input input-bordered w-full"
                value={agentParams.minRound}
                onChange={(e) => setAgentParams({ ...agentParams, minRound: parseInt(e.target.value) })}
              />
            </div>
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Max Round</span>
                <span className="label-text-alt">Expiration round</span>
              </label>
              <input
                type="number"
                placeholder="Max round"
                className="input input-bordered w-full"
                value={agentParams.maxRound}
                onChange={(e) => setAgentParams({ ...agentParams, maxRound: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div className="modal-action">
            <button className="btn" onClick={() => setOpenCreateAgentModal(false)}>
              Cancel
            </button>
            <button
              className={`btn btn-primary ${loading ? 'loading' : ''}`}
              onClick={createAgent}
              disabled={loading || !agentParams.agentName}
            >
              {loading ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </div>
      </dialog>

      {/* JSON Modal */}
      <dialog id="json_modal" className={`modal ${openJsonModal ? 'modal-open' : ''}`}>
        <div className="modal-box max-w-2xl">
          <h3 className="font-bold text-lg">MCP Server Configuration</h3>
          <div className="divider"></div>
          <div className="py-2">
            <p className="mb-2">Copy and paste this JSON configuration to your MCP server:</p>
            <div className="mockup-code mt-2 overflow-x-auto max-h-96">
              <pre className="text-sm">
                <code>{agentJson}</code>
              </pre>
            </div>
            <div className="mt-4 bg-base-200 p-3 rounded-lg">
              <h4 className="font-medium mb-1">Configuration Guide:</h4>
              <ul className="list-disc pl-4 text-sm space-y-1">
                <li>
                  Save this configuration to a file named <code className="text-xs bg-base-300 px-1 py-0.5 rounded">config.json</code>
                </li>
                <li>The AGENT_LSIG environment variable contains the compiled LSIG program in base64 format</li>
                <li>The AGENT_LSIG_ADDRESS is the address derived from the LSIG</li>
                <li>
                  Replace <code className="text-xs bg-base-300 px-1 py-0.5 rounded">YOUR_PRIVATE_KEY_HERE</code> with your agent's private
                  key (if not already populated)
                </li>
                <li>Restart Claude Desktop to apply the new configuration</li>
              </ul>
            </div>
          </div>
          <div className="modal-action">
            <button
              className="btn btn-primary"
              onClick={() => {
                navigator.clipboard.writeText(agentJson)
                enqueueSnackbar('JSON copied to clipboard', { variant: 'success' })
              }}
            >
              Copy to Clipboard
            </button>
            <button className="btn" onClick={() => setOpenJsonModal(false)}>
              Close
            </button>
          </div>
        </div>
      </dialog>

      {/* Private Key Modal */}
      <dialog id="private_key_modal" className={`modal ${openPrivateKeyModal ? 'modal-open' : ''}`}>
        <div className="modal-box max-w-2xl">
          <h3 className="font-bold text-lg">Agent Private Key</h3>
          <div className="divider"></div>
          <div className="bg-warning/10 p-4 rounded-lg mb-4">
            <div className="flex items-start">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-warning mr-2 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h4 className="font-medium text-warning">Security Warning</h4>
                <p className="text-sm mt-1">
                  This private key grants control over your agent. Anyone with this key can use the agent to issue transactions. Store it
                  securely and never share it with untrusted parties.
                </p>
              </div>
            </div>
          </div>
          <div className="py-2">
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text font-medium">Base64 Encoded Private Key</span>
              </div>
              <div className="relative">
                <textarea
                  className="textarea textarea-bordered w-full font-mono text-xs h-24"
                  readOnly
                  value={selectedAgent?.privateKeyBase64 || ''}
                ></textarea>
                <button
                  className="btn btn-sm btn-circle absolute right-2 top-2"
                  onClick={() => {
                    if (selectedAgent?.privateKeyBase64) {
                      navigator.clipboard.writeText(selectedAgent.privateKeyBase64)
                      enqueueSnackbar('Private key copied to clipboard', { variant: 'success' })
                    }
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                    />
                  </svg>
                </button>
              </div>
            </label>
            <div className="mt-4">
              <h5 className="font-medium mb-2">How to use this key:</h5>
              <ol className="list-decimal list-inside text-sm space-y-1 pl-2">
                <li>Download or copy this key to a secure location</li>
                <li>
                  Use it in your MCP server configuration as{' '}
                  <code className="bg-base-300 px-1 py-0.5 rounded text-xs">AGENT_PRIVATE_KEY</code>
                </li>
                <li>Ensure the file permissions are restricted (chmod 600 on Linux/Mac)</li>
                <li>Consider using a secrets manager for production deployments</li>
              </ol>
            </div>
          </div>
          <div className="modal-action">
            <button
              className="btn btn-outline"
              onClick={() => {
                if (selectedAgent) {
                  downloadPrivateKeyFile(selectedAgent)
                }
              }}
            >
              Download as File
            </button>
            <button className="btn" onClick={() => setOpenPrivateKeyModal(false)}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}

export default AgentDeployer
