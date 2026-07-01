import React, { useState, useEffect, useCallback, useContext } from 'react';
import { ethers } from 'ethers';
import { toast } from 'react-toastify';

// NOTE: Create a context provider to supply these values throughout your app
// For example, using Wagmi or a custom Web3Context
import { Web3Context } from '../contexts/Web3Context'; 

const StakingInterface = () => {
  const { provider, signer, account, nftContract, stakingContract, rewardsTokenContract } = useContext(Web3Context);

  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [isStaking, setIsStaking] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState('');

  // Data State
  const [ownedTokens, setOwnedTokens] = useState([]);
  const [stakedTokens, setStakedTokens] = useState([]);
  const [rewardsBalance, setRewardsBalance] = useState('0.0');
  const [tokenIdsToStake, setTokenIdsToStake] = useState('');

  const REWARDS_TOKEN_DECIMALS = 18; // Assuming standard 18 decimals

  /**
   * @notice Fetches all relevant data from the blockchain
   * - Owned (unstaked) NFTs
   * - Staked NFTs
   * - Claimable rewards
   */
  const fetchData = useCallback(async () => {
    if (!account || !nftContract || !stakingContract) return;

    try {
      setIsLoading(true);

      // Fetch owned tokens
      const balance = await nftContract.balanceOf(account);
      const owned = [];
      for (let i = 0; i < balance; i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(account, i);
        owned.push(tokenId.toNumber());
      }
      setOwnedTokens(owned);

      // Fetch staked tokens
      const staked = await stakingContract.getStakedTokens(account);
      setStakedTokens(staked.map(id => id.toNumber()));

      // Fetch rewards balance
      const rewards = await stakingContract.earned(account);
      setRewardsBalance(ethers.utils.formatUnits(rewards, REWARDS_TOKEN_DECIMALS));

    } catch (e) {
      console.error("Error fetching data:", e);
      setError('Failed to fetch data from the blockchain. Please refresh.');
      toast.error('Failed to fetch data.');
    } finally {
      setIsLoading(false);
    }
  }, [account, nftContract, stakingContract]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * @notice Sets up event listeners for real-time UI updates
   */
  useEffect(() => {
    if (!stakingContract || !account) return;

    const onStake = (owner, _tokenIds) => {
      if (owner.toLowerCase() === account.toLowerCase()) {
        toast.info('Stake detected! Updating your assets...');
        fetchData();
      }
    };

    const onWithdraw = (owner, _tokenIds) => {
      if (owner.toLowerCase() === account.toLowerCase()) {
        toast.info('Withdrawal detected! Updating your assets...');
        fetchData();
      }
    };

    const onRewardPaid = (user, _reward) => {
      if (user.toLowerCase() === account.toLowerCase()) {
        toast.success('Rewards claimed! Updating your balance...');
        fetchData();
      }
    };

    stakingContract.on('Staked', onStake);
    stakingContract.on('Withdrawn', onWithdraw);
    stakingContract.on('RewardPaid', onRewardPaid);

    // Cleanup listeners on component unmount
    return () => {
      stakingContract.off('Staked', onStake);
      stakingContract.off('Withdrawn', onWithdraw);
      stakingContract.off('RewardPaid', onRewardPaid);
    };
  }, [stakingContract, account, fetchData]);


  /**
   * @notice Handles staking of one or more NFTs
   */
  const handleStake = async () => {
    if (!tokenIdsToStake) {
      toast.warn('Please enter Token IDs to stake.');
      return;
    }

    const tokenIds = tokenIdsToStake.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (tokenIds.length === 0) {
      toast.error('Invalid Token IDs provided.');
      return;
    }

    setIsStaking(true);
    setError('');
    const stakeToast = toast.loading('Processing stake transaction...');

    try {
      // 1. Check for approval and approve if necessary
      const isApproved = await nftContract.isApprovedForAll(account, stakingContract.address);
      if (!isApproved) {
        toast.update(stakeToast, { render: 'Approval required. Please confirm in your wallet.' });
        const approvalTx = await nftContract.connect(signer).setApprovalForAll(stakingContract.address, true);
        await approvalTx.wait();
        toast.update(stakeToast, { render: 'Approval successful! Now staking...' });
      }

      // 2. Stake the tokens
      const stakeTx = await stakingContract.connect(signer).stake(tokenIds);
      await stakeTx.wait();

      toast.update(stakeToast, { render: 'NFTs staked successfully!', type: 'success', isLoading: false, autoClose: 5000 });
      setTokenIdsToStake(''); // Clear input field
      // fetchData(); // Data will be refetched by the event listener
    } catch (e) {
      console.error("Staking failed:", e);
      const errorMessage = e.reason || e.data?.message || 'Staking transaction failed.';
      toast.update(stakeToast, { render: errorMessage, type: 'error', isLoading: false, autoClose: 5000 });
    } finally {
      setIsStaking(false);
    }
  };

  /**
   * @notice Handles withdrawal of one or more NFTs
   * @param tokenIdsToWithdraw An array of token IDs to withdraw
   */
  const handleWithdraw = async (tokenIdsToWithdraw) => {
    setIsWithdrawing(true);
    setError('');
    const withdrawToast = toast.loading(`Withdrawing Token(s) ${tokenIdsToWithdraw.join(', ')}...`);

    try {
      const withdrawTx = await stakingContract.connect(signer).withdraw(tokenIdsToWithdraw);
      await withdrawTx.wait();
      
      toast.update(withdrawToast, { render: 'NFTs withdrawn successfully!', type: 'success', isLoading: false, autoClose: 5000 });
      // fetchData(); // Data will be refetched by the event listener
    } catch (e) {
      console.error("Withdrawal failed:", e);
      const errorMessage = e.reason || e.data?.message || 'Withdrawal transaction failed.';
      toast.update(withdrawToast, { render: errorMessage, type: 'error', isLoading: false, autoClose: 5000 });
    } finally {
      setIsWithdrawing(false);
    }
  };

  /**
   * @notice Handles claiming accumulated rewards
   */
  const handleClaimRewards = async () => {
    if (parseFloat(rewardsBalance) <= 0) {
        toast.warn('No rewards to claim.');
        return;
    }

    setIsClaiming(true);
    setError('');
    const claimToast = toast.loading('Claiming your rewards...');

    try {
      const claimTx = await stakingContract.connect(signer).getReward();
      await claimTx.wait();

      toast.update(claimToast, { render: 'Rewards claimed successfully!', type: 'success', isLoading: false, autoClose: 5000 });
      // fetchData(); // Data will be refetched by the event listener
    } catch (e) {
      console.error("Claiming rewards failed:", e);
      const errorMessage = e.reason || e.data?.message || 'Claiming rewards failed.';
      toast.update(claimToast, { render: errorMessage, type: 'error', isLoading: false, autoClose: 5000 });
    } finally {
      setIsClaiming(false);
    }
  };

  // Render helpers
  const renderTokenGrid = (tokens, isStaked) => {
    if (isLoading) return <p>Loading tokens...</p>;
    if (tokens.length === 0) return <p>No NFTs found.</p>;

    return (
      <div className="token-grid">
        {tokens.map(tokenId => (
          <div key={tokenId} className="token-card">
            <div className="token-id">#{tokenId}</div>
            {/* You can add an image here by fetching tokenURI */} 
            {isStaked && (
              <button 
                onClick={() => handleWithdraw([tokenId])}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? '...' : 'Withdraw'}
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!account) {
    return <div className="staking-container"><p>Please connect your wallet to use the staking platform.</p></div>;
  }

  return (
    <div className="staking-container">
      <style>{`
        .staking-container { max-width: 900px; margin: 2rem auto; padding: 2rem; background: #f9f9f9; border-radius: 8px; color: #333; }
        .section { background: white; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .section h2 { margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
        .rewards-display { display: flex; justify-content: space-between; align-items: center; }
        .rewards-balance { font-size: 1.5rem; font-weight: bold; }
        .token-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem; }
        .token-card { border: 1px solid #ddd; border-radius: 4px; padding: 1rem; text-align: center; }
        .token-id { font-weight: bold; margin-bottom: 0.5rem; }
        .input-group { display: flex; gap: 0.5rem; }
        .input-group input { flex-grow: 1; padding: 0.75rem; border: 1px solid #ccc; border-radius: 4px; }
        button { background-color: #007bff; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; transition: background-color 0.2s; }
        button:hover:not(:disabled) { background-color: #0056b3; }
        button:disabled { background-color: #cccccc; cursor: not-allowed; }
      `}</style>
      <h1>NFT Staking</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div className="section rewards-section">
        <h2>Your Rewards</h2>
        <div className="rewards-display">
          <div>
            <span className="rewards-balance">{parseFloat(rewardsBalance).toFixed(4)}</span>
            <span> $REWARD</span>
          </div>
          <button onClick={handleClaimRewards} disabled={isClaiming || parseFloat(rewardsBalance) <= 0}>
            {isClaiming ? 'Claiming...' : 'Claim All'}
          </button>
        </div>
      </div>

      <div className="section">
        <h2>Stake Your NFTs</h2>
        <div className="input-group">
            <input 
                type="text"
                value={tokenIdsToStake}
                onChange={(e) => setTokenIdsToStake(e.target.value)}
                placeholder="Enter Token IDs, e.g., 1, 2, 3"
                disabled={isStaking}
            />
            <button onClick={handleStake} disabled={isStaking || !tokenIdsToStake}>
                {isStaking ? 'Staking...' : 'Stake Tokens'}
            </button>
        </div>
      </div>

      <div className="section">
        <h2>Your Staked NFTs ({stakedTokens.length})</h2>
        {renderTokenGrid(stakedTokens, true)}
      </div>

      <div className="section">
        <h2>Your Wallet NFTs ({ownedTokens.length})</h2>
        {renderTokenGrid(ownedTokens, false)}
      </div>
    </div>
  );
};

export default StakingInterface;
