import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { useWallet } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import { useSnackbar } from 'notistack'
import React, { useEffect, useState } from 'react'
import { AiRegistryFactory } from '../contracts/AiRegistry'
import { getAlgodConfigFromViteEnvironment, getIndexerConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

interface Contract {
  id: number
  name: string
  appId: number
  deployed: boolean
  funded: boolean
  lsigAddress: string
  compiledLsig?: string // Base64 encoded compiled LSIG
}

const ContractsManager: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false)
  const [deployingContract, setDeployingContract] = useState<boolean>(false)
  const [fundingContract, setFundingContract] = useState<boolean>(false)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [openContractModal, setOpenContractModal] = useState<boolean>(false)
  const [openFundModal, setOpenFundModal] = useState<boolean>(false)
  const [fundAmount, setFundAmount] = useState<number>(1_000_000_000)
  const [selectedLsigAddress, setSelectedLsigAddress] = useState<string>('')

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

  // Load any existing contract registries (mock implementation)
  useEffect(() => {
    if (activeAddress) {
      // In a real implementation, you would query the blockchain for deployed contracts
      // For now, just simulate with an empty list or local storage
      const savedContracts = localStorage.getItem('aiRegistryContracts')
      if (savedContracts) {
        setContracts(JSON.parse(savedContracts))
      }
    }
  }, [activeAddress])

  // Save contracts to local storage when they change
  useEffect(() => {
    if (contracts.length > 0) {
      localStorage.setItem('aiRegistryContracts', JSON.stringify(contracts))
    }
  }, [contracts])

  const handleContractClick = (contract: Contract) => {
    setSelectedContract(contract)
    setSelectedLsigAddress(contract.lsigAddress)
    setOpenContractModal(true)
  }

  const deployRegistry = async () => {
    try {
      setDeployingContract(true)
      enqueueSnackbar('Deploying AI Registry contract...', { variant: 'info' })
      const aiRegistryFactory = new AiRegistryFactory({
        defaultSender: activeAddress ?? undefined,
        algorand,
      })

      const deployResult = await aiRegistryFactory.send.create.bare().catch((e: Error) => {
        enqueueSnackbar(`Error deploying the contract: ${e.message}`, { variant: 'error' })
        setDeployingContract(false)
        return undefined
      })

      if (!deployResult) {
        return
      }

      const { appClient } = deployResult
      const tealUrl =
        'https://gist.githubusercontent.com/aorumbayev/057ac5d22092a6db27ba2374884127c4/raw/c5cd8ca0d58a0b22f04aff15546a57f2ce32a23b/makerx_ai_lsig.teal'
      const tealSource = await fetch(tealUrl).then((response) => response.text())
      const compiledLsig = (await algorand.app.compileTealTemplate(tealSource, { AI_REGISTRY_APP_ID: appClient.appId }))
        .compiledBase64ToBytes

      const logicSig = algorand.account.logicsig(compiledLsig)
      const lsigAddress = String(logicSig.addr)

      const response = await appClient.send.bootstrap({
        args: {
          lsigAddress: logicSig.addr.publicKey,
          adminAddress: activeAddress!,
        },
        coverAppCallInnerTransactionFees: true,
        populateAppCallResources: true,
        maxFee: AlgoAmount.Algo(0.2),
      })
      console.log('Response:', response)

      const appId = deployResult.appClient.appId
      setContracts([
        ...contracts,
        {
          id: Date.now(),
          name: `AI Registry ${contracts.length + 1}`,
          appId: Number(appId),
          deployed: true,
          funded: false,
          lsigAddress: lsigAddress,
          compiledLsig: Buffer.from(compiledLsig).toString('base64'),
        },
      ])
    } catch (error) {
      console.error('Error deploying AI Registry:', error)
      enqueueSnackbar('Failed to deploy AI Registry', { variant: 'error' })
      setDeployingContract(false)
    }
  }

  const fundContract = async (contract: Contract) => {
    try {
      setFundingContract(true)
      enqueueSnackbar(`Funding contract ${contract.appId}...`, { variant: 'info' })

      await algorand.send.payment({
        signer: transactionSigner,
        sender: activeAddress!,
        receiver: algosdk.getApplicationAddress(contract.appId),
        amount: AlgoAmount.MicroAlgos(fundAmount),
      })

      await algorand.send.payment({
        signer: transactionSigner,
        sender: activeAddress!,
        receiver: contract.lsigAddress,
        amount: AlgoAmount.MicroAlgos(fundAmount),
      })

      const updatedContracts = contracts.map((c) => (c.id === contract.id ? { ...c, funded: true } : c))
      setContracts(updatedContracts)

      enqueueSnackbar('Contract funded successfully!', { variant: 'success' })
      setFundingContract(false)
      setOpenFundModal(false)
    } catch (error) {
      console.error('Error funding contract:', error)
      enqueueSnackbar('Failed to fund contract', { variant: 'error' })
      setFundingContract(false)
    }
  }

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h2 className="text-2xl font-bold">AI Registry Contracts</h2>
        <button className={`btn btn-primary ${deployingContract ? 'loading' : ''}`} onClick={deployRegistry} disabled={deployingContract}>
          {deployingContract ? 'Deploying...' : 'Deploy New Registry'}
        </button>
      </div>

      {contracts.length === 0 ? (
        <div className="alert bg-base-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info shrink-0 w-6 h-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <span>No contracts deployed yet. Click the button above to deploy your first AI Registry.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="card bg-base-200 shadow-xl hover:shadow-2xl cursor-pointer transition-all"
              onClick={() => handleContractClick(contract)}
            >
              <div className="card-body">
                <h2 className="card-title flex justify-between">
                  {contract.name}
                  <div className="badge badge-success">Deployed</div>
                </h2>
                <p>App ID: {contract.appId}</p>
                <div className="card-actions justify-end mt-2">
                  <div className={`badge ${contract.funded ? 'badge-success' : 'badge-error'}`}>
                    {contract.funded ? 'Funded' : 'Not Funded'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contract Details Modal */}
      <dialog id="contract_modal" className={`modal ${openContractModal ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">{selectedContract?.name}</h3>
          <div className="py-4">
            <div className="mb-2 flex items-center">
              <span className="font-semibold mr-1">App ID:</span> {selectedContract?.appId}
              <button
                className="btn btn-xs btn-ghost ml-2"
                onClick={() => {
                  navigator.clipboard.writeText(String(selectedContract?.appId))
                  enqueueSnackbar('App ID copied to clipboard', { variant: 'success' })
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

            <div className="mb-3">
              <div className="font-semibold mb-1">LSIG Address:</div>
              <div className="flex">
                <div className="text-sm bg-base-300 p-2 rounded-md break-all flex-grow">{selectedLsigAddress}</div>
                <button
                  className="btn btn-sm btn-ghost ml-1 self-start mt-1"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedLsigAddress)
                    enqueueSnackbar('LSIG address copied to clipboard', { variant: 'success' })
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
            </div>

            {selectedContract?.compiledLsig && (
              <div className="mb-3">
                <div className="font-semibold mb-1">Compiled LSIG (base64):</div>
                <div className="flex">
                  <div className="text-sm bg-base-300 p-2 rounded-md break-all flex-grow font-mono">{selectedContract.compiledLsig}</div>
                  <button
                    className="btn btn-sm btn-ghost ml-1 self-start mt-1"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedContract.compiledLsig!)
                      enqueueSnackbar('Compiled LSIG copied to clipboard', { variant: 'success' })
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
                <div className="text-xs text-info mt-1">
                  This is required for the AGENT_LSIG environment variable in your MCP configuration.
                </div>
              </div>
            )}

            <div className="mt-3">
              <span className="text-sm font-semibold mr-2">Status:</span>
              <div className={`badge ${selectedContract?.funded ? 'badge-success' : 'badge-error'}`}>
                {selectedContract?.funded ? 'Funded' : 'Not Funded'}
              </div>
            </div>
          </div>
          <div className="modal-action">
            <button className="btn" onClick={() => setOpenContractModal(false)}>
              Close
            </button>
            {selectedContract && !selectedContract.funded && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setOpenContractModal(false)
                  setOpenFundModal(true)
                }}
              >
                Fund Contract
              </button>
            )}
          </div>
        </div>
      </dialog>

      {/* Fund Contract Modal */}
      <dialog id="fund_modal" className={`modal ${openFundModal ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">Fund Contract and Logic Signature</h3>
          <div className="py-4">
            <p>This will fund both the contract and its associated Logic Signature.</p>

            <div className="form-control w-full mt-4">
              <label className="label">
                <span className="label-text">Amount (microAlgos)</span>
              </label>
              <input
                type="number"
                placeholder="Enter amount in microAlgos"
                className="input input-bordered w-full"
                value={fundAmount}
                onChange={(e) => setFundAmount(parseInt(e.target.value))}
                min="100000"
              />
              <label className="label">
                <span className="label-text-alt">Minimum: 0.1 Algo (100,000 microAlgos)</span>
              </label>
            </div>
          </div>
          <div className="modal-action">
            <button className="btn" onClick={() => setOpenFundModal(false)}>
              Cancel
            </button>
            <button
              className={`btn btn-primary ${fundingContract ? 'loading' : ''}`}
              onClick={() => selectedContract && fundContract(selectedContract)}
              disabled={fundingContract || !selectedContract || fundAmount < 100000}
            >
              {fundingContract ? 'Funding...' : 'Fund Contract'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}

export default ContractsManager
