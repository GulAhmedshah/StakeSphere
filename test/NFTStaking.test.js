const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// NOTE: This test suite assumes the presence of mock contracts:
// - contracts/mocks/MockERC20.sol
// - contracts/mocks/MockERC721.sol
// These are standard OpenZeppelin extensions used for testing.

describe("NFTStaking", function () {
  // Constants for readability
  const DAY = 86400; // seconds in a day
  const INITIAL_REWARD_RATE = ethers.utils.parseEther("10"); // 10 reward tokens per NFT per day

  async function deployContractsFixture() {
    const [owner, user1, user2, otherAccount] = await ethers.getSigners();

    const RewardToken = await ethers.getContractFactory("MockERC20");
    const rewardToken = await RewardToken.deploy("Reward Token", "RWT");

    const NFTCollection = await ethers.getContractFactory("MockERC721");
    const nftCollection = await NFTCollection.deploy("My NFT", "MNFT");

    await nftCollection.mint(user1.address, 1);
    await nftCollection.mint(user1.address, 2);
    await nftCollection.mint(user2.address, 3);

    const NFTStaking = await ethers.getContractFactory("NFTStaking");
    const nftStaking = await NFTStaking.deploy(
      rewardToken.address,
      nftCollection.address,
      INITIAL_REWARD_RATE
    );

    const totalRewards = ethers.utils.parseEther("1000000");
    await rewardToken.mint(nftStaking.address, totalRewards);

    await nftCollection.connect(user1).setApprovalForAll(nftStaking.address, true);
    await nftCollection.connect(user2).setApprovalForAll(nftStaking.address, true);

    return {
      nftStaking,
      rewardToken,
      nftCollection,
      owner,
      user1,
      user2,
      otherAccount,
    };
  }

  function calculateRewards(stakedDuration, rewardRate, nftCount) {
    return ethers.BigNumber.from(stakedDuration)
      .mul(rewardRate)
      .mul(nftCount)
      .div(DAY);
  }

  describe("Deployment", function () {
    it("Should set the right owner, tokens, and initial reward rate", async function () {
      const { nftStaking, rewardToken, nftCollection, owner } = await loadFixture(deployContractsFixture);
      expect(await nftStaking.owner()).to.equal(owner.address);
      expect(await nftStaking.rewardToken()).to.equal(rewardToken.address);
      expect(await nftStaking.nftCollection()).to.equal(nftCollection.address);
      expect(await nftStaking.rewardRate()).to.equal(INITIAL_REWARD_RATE);
    });
  });

  describe("Emergency Withdraw", function () {
    it("Should allow a staker to emergency withdraw their NFT", async function () {
        const { nftStaking, nftCollection, user1 } = await loadFixture(deployContractsFixture);
        const tokenId = 1;

        await nftStaking.connect(user1).stake([tokenId]);
        
        await expect(nftStaking.connect(user1).emergencyWithdraw([tokenId]))
            .to.emit(nftStaking, "EmergencyWithdrawn")
            .withArgs(user1.address, [tokenId]);
        
        expect(await nftCollection.ownerOf(tokenId)).to.equal(user1.address);
        
        const stakerInfo = await nftStaking.stakers(user1.address);
        expect(stakerInfo.amountStaked).to.equal(0);
        expect(await nftStaking.stakedTokenOwner(tokenId)).to.equal(ethers.constants.AddressZero);
    });

    it("Should not update rewards or rewardDebt on emergency withdraw", async function () {
        const { nftStaking, rewardToken, user1 } = await loadFixture(deployContractsFixture);
        const tokenId = 1;

        await nftStaking.connect(user1).stake([tokenId]);
        await time.increase(DAY); // Accrue some rewards

        const initialRewardBalance = await rewardToken.balanceOf(user1.address);
        const stakerBefore = await nftStaking.stakers(user1.address);

        await nftStaking.connect(user1).emergencyWithdraw([tokenId]);

        const finalRewardBalance = await rewardToken.balanceOf(user1.address);
        const stakerAfter = await nftStaking.stakers(user1.address);
        
        expect(finalRewardBalance).to.equal(initialRewardBalance);
        expect(stakerAfter.rewardDebt).to.equal(stakerBefore.rewardDebt); // Should not have been updated
    });

    it("Should revert if trying to emergency withdraw a token not staked by caller", async function () {
        const { nftStaking, user1, user2 } = await loadFixture(deployContractsFixture);
        const tokenId = 1; 
        await nftStaking.connect(user1).stake([tokenId]);

        await expect(nftStaking.connect(user2).emergencyWithdraw([tokenId]))
            .to.be.revertedWithCustomError(nftStaking, "NotStakedByCaller");
    });
  });

  describe("Reward Rate Management", function () {
    it("Should only allow the owner to change the reward rate", async function () {
        const { nftStaking, user1 } = await loadFixture(deployContractsFixture);
        const newRate = ethers.utils.parseEther("20");

        await expect(nftStaking.connect(user1).setRewardRate(newRate))
            .to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should apply the new reward rate correctly for future rewards", async function () {
        const { nftStaking, user1, owner } = await loadFixture(deployContractsFixture);
        const tokenId = 1;
        const nftCount = 1;
        
        await nftStaking.connect(user1).stake([tokenId]);
        
        await time.increase(DAY);
        const rewardsAfterDay1 = calculateRewards(DAY, INITIAL_REWARD_RATE, nftCount);

        const newRate = ethers.utils.parseEther("20");
        await nftStaking.connect(owner).setRewardRate(newRate);

        await time.increase(DAY);
        
        const rewardsFromNewRate = calculateRewards(DAY, newRate, nftCount);
        const totalExpectedRewards = rewardsAfterDay1.add(rewardsFromNewRate);
        
        expect(await nftStaking.pendingRewards(user1.address)).to.be.closeTo(totalExpectedRewards, ethers.utils.parseEther("0.0001"));
    });
  });

  describe("Pausable Functionality", function () {
    it("Should prevent staking when paused and allow after unpausing", async function () {
        const { nftStaking, owner, user1 } = await loadFixture(deployContractsFixture);
        const tokenId = 1;

        await nftStaking.connect(owner).pause();
        await expect(nftStaking.connect(user1).stake([tokenId]))
            .to.be.revertedWith("Pausable: paused");
        
        await nftStaking.connect(owner).unpause();
        await expect(nftStaking.connect(user1).stake([tokenId])).to.not.be.reverted;
    });

    it("Should allow withdraw, claim, and emergency withdraw when paused", async function () {
        const { nftStaking, user1, owner, nftCollection } = await loadFixture(deployContractsFixture);
        const tokenId1 = 1;
        const tokenId2 = 2;
        await nftStaking.connect(user1).stake([tokenId1, tokenId2]);
        await time.increase(DAY);

        await nftStaking.connect(owner).pause();

        await expect(nftStaking.connect(user1).claimRewards()).to.not.be.reverted;
        await expect(nftStaking.connect(user1).emergencyWithdraw([tokenId1])).to.not.be.reverted;
        expect(await nftCollection.ownerOf(tokenId1)).to.equal(user1.address);
        await expect(nftStaking.connect(user1).withdraw([tokenId2])).to.not.be.reverted;
        expect(await nftCollection.ownerOf(tokenId2)).to.equal(user1.address);
    });
  });

  describe("Integration & Multi-User Scenarios", function () {
    it("Full flow: stake, wait 1 day, claim rewards, withdraw", async function () {
        const { nftStaking, rewardToken, nftCollection, user1 } = await loadFixture(deployContractsFixture);
        const tokenId = 1;
        const nftCount = 1;

        await nftStaking.connect(user1).stake([tokenId]);
        await time.increase(DAY);
        
        const expectedRewards = calculateRewards(DAY, INITIAL_REWARD_RATE, nftCount);

        const balanceBefore = await rewardToken.balanceOf(user1.address);
        await nftStaking.connect(user1).claimRewards();
        const balanceAfter = await rewardToken.balanceOf(user1.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(expectedRewards, ethers.utils.parseEther("0.0001"));
        
        await nftStaking.connect(user1).withdraw([tokenId]);
        expect(await nftCollection.ownerOf(tokenId)).to.equal(user1.address);
        expect((await nftStaking.stakers(user1.address)).amountStaked).to.equal(0);
    });

    it("Should handle multiple users staking and claiming independently", async function () {
        const { nftStaking, rewardToken, user1, user2 } = await loadFixture(deployContractsFixture);
        const user1Token = 1;
        const user2Token = 3;

        await nftStaking.connect(user1).stake([user1Token]);
        await time.increase(DAY);
        await nftStaking.connect(user2).stake([user2Token]);
        await time.increase(DAY);

        const user1ExpectedRewards = calculateRewards(DAY * 2, INITIAL_REWARD_RATE, 1);
        const user2ExpectedRewards = calculateRewards(DAY * 1, INITIAL_REWARD_RATE, 1);
        expect(await nftStaking.pendingRewards(user1.address)).to.be.closeTo(user1ExpectedRewards, ethers.utils.parseEther("0.0001"));
        expect(await nftStaking.pendingRewards(user2.address)).to.be.closeTo(user2ExpectedRewards, ethers.utils.parseEther("0.0001"));

        const user1BalanceBefore = await rewardToken.balanceOf(user1.address);
        await nftStaking.connect(user1).claimRewards();
        const user1BalanceAfter = await rewardToken.balanceOf(user1.address);
        expect(user1BalanceAfter.sub(user1BalanceBefore)).to.be.closeTo(user1ExpectedRewards, ethers.utils.parseEther("0.0001"));

        const user2BalanceBefore = await rewardToken.balanceOf(user2.address);
        await nftStaking.connect(user2).withdraw([user2Token]);
        const user2BalanceAfter = await rewardToken.balanceOf(user2.address);
        expect(user2BalanceAfter.sub(user2BalanceBefore)).to.be.closeTo(user2ExpectedRewards, ethers.utils.parseEther("0.0001"));
    });
  });

  describe("Error Message Validation", function () {
      it("Should revert with 'NoNFTsStaked' when claiming with no NFTs staked", async function () {
          const { nftStaking, user1 } = await loadFixture(deployContractsFixture);
          await expect(nftStaking.connect(user1).claimRewards())
              .to.be.revertedWithCustomError(nftStaking, "NoNFTsStaked");
      });

      it("Should revert if staking zero NFTs", async function () {
        const { nftStaking, user1 } = await loadFixture(deployContractsFixture);
        await expect(nftStaking.connect(user1).stake([]))
            .to.be.revertedWithCustomError(nftStaking, "CannotStakeZeroNFTs");
      });
  });

  describe("Gas Usage", function () {
    it("Should have reasonable gas costs (manual snapshot)", async function () {
        const { nftStaking, user1 } = await loadFixture(deployContractsFixture);
        
        const stakeTx = await nftStaking.connect(user1).stake([1, 2]);
        const stakeReceipt = await stakeTx.wait();
        console.log(`\tGas to stake 2 NFTs: ${stakeReceipt.gasUsed.toString()}`);
        expect(stakeReceipt.gasUsed).to.be.lt(300000);

        await time.increase(DAY);

        const claimTx = await nftStaking.connect(user1).claimRewards();
        const claimReceipt = await claimTx.wait();
        console.log(`\tGas to claim rewards: ${claimReceipt.gasUsed.toString()}`);
        expect(claimReceipt.gasUsed).to.be.lt(150000);

        const withdrawTx = await nftStaking.connect(user1).withdraw([1, 2]);
        const withdrawReceipt = await withdrawTx.wait();
        console.log(`\tGas to withdraw 2 NFTs: ${withdrawReceipt.gasUsed.toString()}`);
        expect(withdrawReceipt.gasUsed).to.be.lt(250000);
    });
  });
});
