import { useWallet } from '@txnlab/use-wallet-react'
import React, { useState } from 'react'
import AgentDeployer from './AgentDeployer'
import ConnectWallet from './ConnectWallet'
import ContractsManager from './ContractsManager'

const Dashboard: React.FC = () => {
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false)
  const [activePage, setActivePage] = useState<string>('overview')
  const { activeAddress, wallets } = useWallet()

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  const handleLogout = async () => {
    if (wallets) {
      const activeWallet = wallets.find((w) => w.isActive)
      if (activeWallet) {
        await activeWallet.disconnect()
      }
    }
  }

  return (
    <div className="min-h-screen bg-base-100">
      {/* Navbar */}
      <div className="navbar bg-base-200">
        <div className="navbar-start">
          <a className="btn btn-ghost text-xl">MakerX Agent Deployer</a>
        </div>
        <div className="navbar-center">
          {activeAddress && (
            <div className="tabs tabs-boxed bg-base-200">
              <button
                className={`tab ${activePage === 'overview' ? 'tab-active' : ''}`}
                onClick={() => setActivePage('overview')}
                aria-selected={activePage === 'overview'}
                role="tab"
              >
                Overview
              </button>
              <button
                className={`tab ${activePage === 'contracts' ? 'tab-active' : ''}`}
                onClick={() => setActivePage('contracts')}
                aria-selected={activePage === 'contracts'}
                role="tab"
              >
                Contracts
              </button>
              <button
                className={`tab ${activePage === 'agents' ? 'tab-active' : ''}`}
                onClick={() => setActivePage('agents')}
                aria-selected={activePage === 'agents'}
                role="tab"
              >
                Agents
              </button>
            </div>
          )}
        </div>
        <div className="navbar-end">
          {activeAddress ? (
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-ghost btn-circle avatar">
                <div className="w-10 rounded-full bg-primary text-primary-content flex items-center justify-center">
                  <span>{activeAddress.substring(0, 2)}</span>
                </div>
              </label>
              <ul tabIndex={0} className="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52">
                <li>
                  <a className="justify-between">
                    Profile
                    <span className="badge">New</span>
                  </a>
                </li>
                <li>
                  <a onClick={toggleWalletModal}>Wallet</a>
                </li>
                <li>
                  <a onClick={handleLogout}>Logout</a>
                </li>
              </ul>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={toggleWalletModal}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto p-4">
        {!activeAddress ? (
          <div className="hero min-h-[80vh]">
            <div className="hero-content text-center">
              <div className="max-w-md">
                <h1 className="text-5xl font-bold">Welcome</h1>
                <p className="py-6">Please connect your wallet to deploy agents.</p>
                <button className="btn btn-primary" onClick={toggleWalletModal}>
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {activePage === 'overview' && (
              <div className="card bg-base-200 shadow-xl mt-4">
                <div className="card-body">
                  <h2 className="card-title">Welcome to Agent Deployer</h2>
                  <p>This tool allows you to deploy AI agents to the Algorand blockchain.</p>
                  <ul className="list-disc list-inside mt-4">
                    <li>
                      Go to the <strong>Contracts</strong> tab to deploy new AiRegistry instances
                    </li>
                    <li>
                      Go to the <strong>Agents</strong> tab to register and manage your AI agents
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {activePage === 'contracts' && <ContractsManager />}

            {activePage === 'agents' && <AgentDeployer />}
          </div>
        )}
      </div>

      {/* Wallet modal */}
      <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
    </div>
  )
}

export default Dashboard
