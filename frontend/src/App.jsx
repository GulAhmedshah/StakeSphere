import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { createWeb3Modal, useWeb3ModalProvider, useWeb3ModalAccount } from '@web3modal/ethers/react';

// --- Contract ABIs and Addresses (Replace with your actual data) ---
// Minimal ABI for the functions we need to call
const stakingABI = [
  "function stakedTokensOfOwner(address owner) public view returns (uint256[] memory)",
  "function calculateRewards(address owner) public view returns (uint256)",
  "function stake(uint256[] calldata tokenIds) public",
  "function unstake(uint256[] calldata tokenIds) public",
  "function claimRewards() public",
];

// IMPORTANT: Replace these with your deployed contract addresses on Sepolia
const stakingContractAddress = "0x0000000000000000000000000000000000000000"; // TODO: Replace with your Staking contract address

// --- Web3Modal Configuration ---
// 1. Get a project ID from https://cloud.walletconnect.com
const projectId = 'YOUR_WALLETCONNECT_PROJECT_ID'; // TODO: Replace with your WalletConnect project ID

// 2. Set up chains
const sepolia = {
  chainId: 11155111,
  name: 'Sepolia',
  currency: 'ETH',
  explorerUrl: 'https://sepolia.etherscan.io',
  rpcUrl: 'https://rpc.sepolia.org'
};

// 3. Create modal metadata
const metadata = {
  name: 'NFT Staking DApp',
  description: 'Stake your NFTs to earn rewards.',
  url: 'https://your-dapp-url.com', // origin must match your domain & subdomain
  icons: ['https://avatars.your-dapp-url.com/']
};

// 4. Create Ethers config
const ethersConfig = {
  metadata
};

// 5. Create a Web3Modal instance
createWeb3Modal({
  ethersConfig,
  chains: [sepolia],
  projectId,
  enableAnalytics: true // Optional - defaults to your Cloud configuration
});

function App() {
  // --- Web3Modal Hooks ---
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  // --- React State ---
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState({});
  const [stakedTokens, setStakedTokens] = useState([]);
  const [rewards, setRewards] = useState(ethers.BigNumber.from(0));
  const [error, setError] = useState('');

  // --- Data Loading Effect ---
  // This effect runs when the user connects or disconnects their wallet.
  useEffect(() => {
    const loadBlockchainData = async () => {
      if (isConnected && walletProvider && address) {
        setLoading(true);
        setError('');
        try {
          // Initialize provider, signer, and contract
          const provider = new ethers.providers.Web3Provider(walletProvider);
          const signer = provider.getSigner();
          const stakingContract = new ethers.Contract(stakingContractAddress, stakingABI, signer);
          
          setContracts({ staking: stakingContract });

          // Fetch data in parallel
          const [staked, rewardAmount] = await Promise.all([
            stakingContract.stakedTokensOfOwner(address),
            stakingContract.calculateRewards(address)
          ]);

          setStakedTokens(staked.map(id => id.toString()));
          setRewards(rewardAmount);
        } catch (err) {
          console.error("Failed to load blockchain data:", err);
          setError("Failed to load data. Ensure you're on the Sepolia network and the contract address is correct.");
          // Reset state on error
          setStakedTokens([]);
          setRewards(ethers.BigNumber.from(0));
        } finally {
          setLoading(false);
        }
      } else {
        // Reset state when wallet is disconnected
        setContracts({});
        setStakedTokens([]);
        setRewards(ethers.BigNumber.from(0));
        setError('');
      }
    };

    loadBlockchainData();
  }, [isConnected, walletProvider, address]);

  // --- UI Rendering ---
  const renderContent = () => {
    if (loading) {
      return <p>Loading data...</p>;
    }
    if (error) {
      return <p className="error-message">{error}</p>;
    }
    if (!isConnected) {
      return <p>Please connect your wallet to use the platform.</p>;
    }
    return (
      <div className="content">
        <div className="account-info">
          <h2>Your Account</h2>
          <p><strong>Address:</strong> {`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}</p>
          <p><strong>Staked NFT Count:</strong> {stakedTokens.length}</p>
        </div>

        <div className="staking-info">
          <h2>Your Staked Tokens</h2>
          {stakedTokens.length > 0 ? (
            <ul>
              {stakedTokens.map(tokenId => (
                <li key={tokenId}>NFT ID: {tokenId}</li>
              ))}
            </ul>
          ) : (
            <p>You have no NFTs staked.</p>
          )}
        </div>

        <div className="actions">
            <h2>Actions</h2>
            <p><em>Staking, unstaking, and claiming functionalities will be added in the next steps.</em></p>
            <button disabled>Stake NFTs</button>
            <button disabled={stakedTokens.length === 0}>Unstake NFTs</button>
            <button disabled={rewards.isZero()}>Claim Rewards</button>
        </div>
      </div>
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>NFT Staking Platform</h1>
        <nav>
          {isConnected && (
            <div className="rewards-display">
              <p>Rewards: {loading ? '...' : `${ethers.utils.formatUnits(rewards, 18)} RWT`}</p>
            </div>
          )}
          <w3m-button />
        </nav>
      </header>
      
      <main>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
