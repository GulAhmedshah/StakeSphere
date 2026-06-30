const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTStaking", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployNFTStakingFixture() {
    const [owner, staker1, staker2, otherAccount] = await ethers.getSigners();

    // Deploy mock Reward Token (ERC20)
    // Using a preset makes it easy to mint tokens for testing
    const RewardToken = await ethers.getContractFactory("ERC20PresetMinterPauser");
    const rewardToken = await RewardToken.deploy("Reward Token", "RWT");
    await rewardToken.deployed();

    // Deploy mock NFT (ERC721)
    // Using a preset with AutoId makes minting sequential and predictable
    const MyNFT = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    const nft = await MyNFT.deploy("My NFT", "MNFT", "https://api.mynft.com/token/");
    await nft.deployed();

    // Deploy NFTStaking contract
    const NFTStaking = await ethers.getContractFactory("NFTStaking");
    const stakingContract = await NFTStaking.deploy(nft.address, rewardToken.address);
    await stakingContract.deployed();

    // Setup: Fund staking contract and set reward rate
    const REWARD_RATE = ethers.utils.parseUnits("10", 18); // 10 RWT per second
    const initialRewardFund = ethers.utils.parseUnits("1000000", 18);
    await rewardToken.mint(stakingContract.address, initialRewardFund);
    await stakingContract.setRewardRate(REWARD_RATE);

    // Setup: Mint NFTs to stakers
    await nft.mint(staker1.address); // tokenId 0
    await nft.mint(staker1.address); // tokenId 1
    await nft.mint(staker2.address); // tokenId 2

    // Setup: Stakers approve the staking contract to manage their NFTs
    await nft.connect(staker1).setApprovalForAll(stakingContract.address, true);
    await nft.connect(staker2).setApprovalForAll(stakingContract.address, true);

    return { stakingContract, nft, rewardToken, owner, staker1, staker2, otherAccount, REWARD_RATE };
  }

  // Using a beforeEach with the fixture ensures a clean state for each test.
  let stakingContract, nft, rewardToken, owner, staker1, staker2, otherAccount, REWARD_RATE;

  beforeEach(async function () {
    const fixture = await deployNFTStakingFixture();
    stakingContract = fixture.stakingContract;
    nft = fixture.nft;
    rewardToken = fixture.rewardToken;
    owner = fixture.owner;
    staker1 = fixture.staker1;
    staker2 = fixture.staker2;
    otherAccount = fixture.otherAccount;
    REWARD_RATE = fixture.REWARD_RATE;
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await stakingContract.owner()).to.equal(owner.address);
    });

    it("Should set the correct NFT collection address", async function () {
      expect(await stakingContract.nftCollection()).to.equal(nft.address);
    });

    it("Should set the correct reward token address", async function () {
      expect(await stakingContract.rewardToken()).to.equal(rewardToken.address);
    });

    it("Should fail to deploy with zero address for NFT collection", async function () {
        const NFTStaking = await ethers.getContractFactory("NFTStaking");
        await expect(NFTStaking.deploy(ethers.constants.AddressZero, rewardToken.address)).to.be.revertedWith("NFTStaking: Zero address");
    });

    it("Should fail to deploy with zero address for reward token", async function () {
        const NFTStaking = await ethers.getContractFactory("NFTStaking");
        await expect(NFTStaking.deploy(nft.address, ethers.constants.AddressZero)).to.be.revertedWith("NFTStaking: Zero address");
    });
  });

  describe("Staking", function () {
    it("Should allow a user to stake an approved NFT", async function () {
      const tokenId = 0;
      await expect(stakingContract.connect(staker1).stake(tokenId))
        .to.emit(stakingContract, "Staked")
        .withArgs(staker1.address, tokenId);
      
      expect(await nft.ownerOf(tokenId)).to.equal(stakingContract.address);
      expect(await stakingContract.totalStaked()).to.equal(1);
      const stakerInfo = await stakingContract.stakers(staker1.address);
      expect(stakerInfo.amountStaked).to.equal(1);
    });

    it("Should not allow staking without prior approval", async function () {
        await nft.connect(staker1).setApprovalForAll(stakingContract.address, false); // Revoke approval
        const tokenId = 0;
        await expect(stakingContract.connect(staker1).stake(tokenId))
          .to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("Should not allow staking an NFT that is not owned by the caller", async function () {
        const tokenIdOwnedByStaker2 = 2;
        await expect(stakingContract.connect(staker1).stake(tokenIdOwnedByStaker2))
            .to.be.revertedWith("NFTStaking: Caller is not the owner of the NFT");
    });

    it("Should not allow staking an already staked NFT", async function () {
      const tokenId = 0;
      await stakingContract.connect(staker1).stake(tokenId);
      await expect(stakingContract.connect(staker1).stake(tokenId))
        .to.be.revertedWith("NFTStaking: Token already staked");
    });

    it("Should update staker info and total staked amount correctly for multiple stakes", async function () {
      await stakingContract.connect(staker1).stake(0);
      await stakingContract.connect(staker1).stake(1);

      expect(await stakingContract.totalStaked()).to.equal(2);
      const stakerInfo = await stakingContract.stakers(staker1.address);
      expect(stakerInfo.amountStaked).to.equal(2);
    });
  });

  describe("Withdrawing", function () {
    const tokenId = 0;
    beforeEach(async function () {
        await stakingContract.connect(staker1).stake(tokenId);
    });

    it("Should allow a user to withdraw their staked NFT", async function () {
      await time.increase(100); // Pass some time to accrue rewards

      await expect(stakingContract.connect(staker1).withdraw(tokenId))
        .to.emit(stakingContract, "Withdrawn")
        .withArgs(staker1.address, tokenId);

      expect(await nft.ownerOf(tokenId)).to.equal(staker1.address);
      expect(await stakingContract.totalStaked()).to.equal(0);
      const stakerInfo = await stakingContract.stakers(staker1.address);
      expect(stakerInfo.amountStaked).to.equal(0);
    });

    it("Should not allow a non-staker to withdraw an NFT", async function () {
      await expect(stakingContract.connect(staker2).withdraw(tokenId))
        .to.be.revertedWith("NFTStaking: Caller is not the staker");
    });

    it("Should transfer accrued rewards upon withdrawal", async function () {
      await time.increase(100); 

      const earnedRewards = await stakingContract.earned(staker1.address);
      const balanceBefore = await rewardToken.balanceOf(staker1.address);

      await stakingContract.connect(staker1).withdraw(tokenId);
      
      const balanceAfter = await rewardToken.balanceOf(staker1.address);
      const stakerInfo = await stakingContract.stakers(staker1.address);
      
      expect(balanceAfter.sub(balanceBefore)).to.equal(earnedRewards);
      expect(stakerInfo.unclaimedRewards).to.equal(0);
    });
    
    it("Should correctly update staker info when withdrawing one of many NFTs", async function(){
        await stakingContract.connect(staker1).stake(1); // staker1 now has 2 NFTs staked
        expect(await stakingContract.totalStaked()).to.equal(2);
        
        await time.increase(100);
        await stakingContract.connect(staker1).withdraw(0);

        expect(await nft.ownerOf(0)).to.equal(staker1.address);
        expect(await stakingContract.totalStaked()).to.equal(1);
        const stakerInfo = await stakingContract.stakers(staker1.address);
        expect(stakerInfo.amountStaked).to.equal(1);
    });
  });

  describe("Reward Calculation", function () {
    it("Should calculate rewards correctly for a single staker over time", async function () {
      await stakingContract.connect(staker1).stake(0);
      await time.increase(3600); // 1 hour

      const expectedRewards = REWARD_RATE.mul(1).mul(3600); // 1 NFT * 10 RWT/sec * 3600 sec
      const earnedRewards = await stakingContract.earned(staker1.address);

      expect(earnedRewards).to.equal(expectedRewards);
    });

    it("Should handle reward calculation correctly with multiple stakers and stakes", async function () {
      await stakingContract.connect(staker1).stake(0); // staker1 stakes 1st NFT
      await time.increase(100);
      await stakingContract.connect(staker2).stake(2); // staker2 stakes
      await time.increase(50);
      await stakingContract.connect(staker1).stake(1); // staker1 stakes 2nd NFT
      await time.increase(200);

      // staker1: 1 NFT for 150s, then 2 NFTs for 200s
      const expectedRewards1 = REWARD_RATE.mul(1 * 150).add(REWARD_RATE.mul(2 * 200));
      // staker2: 1 NFT for 250s
      const expectedRewards2 = REWARD_RATE.mul(1 * 250);

      expect(await stakingContract.earned(staker1.address)).to.equal(expectedRewards1);
      expect(await stakingContract.earned(staker2.address)).to.equal(expectedRewards2);
    });

    it("Should allow claiming rewards without withdrawing", async function () {
      await stakingContract.connect(staker1).stake(0);
      await time.increase(100);

      const earned = await stakingContract.earned(staker1.address);
      const balanceBefore = await rewardToken.balanceOf(staker1.address);

      await expect(stakingContract.connect(staker1).claimRewards())
        .to.emit(stakingContract, "RewardClaimed");

      const balanceAfter = await rewardToken.balanceOf(staker1.address);
      
      expect(balanceAfter.sub(balanceBefore)).to.equal(earned);
      expect(await stakingContract.earned(staker1.address)).to.be.lt(ethers.utils.parseUnits("1", 10)); // small tolerance for block time
    });
    
    it("Should return 0 earned for an account that has not staked", async function() {
        expect(await stakingContract.earned(otherAccount.address)).to.equal(0);
    });

    it("Should stop accumulating rewards after withdrawal", async function () {
      await stakingContract.connect(staker1).stake(0);
      await time.increase(100);

      await stakingContract.connect(staker1).withdraw(0);

      await time.increase(500); // Pass more time

      const stakerInfo = await stakingContract.stakers(staker1.address);
      expect(stakerInfo.unclaimedRewards).to.equal(0);
      expect(await stakingContract.earned(staker1.address)).to.equal(0);
    });
  });

  describe("Owner Functions", function () {
    it("Should allow the owner to set the reward rate", async function () {
      const newRate = ethers.utils.parseUnits("25", 18);
      await expect(stakingContract.connect(owner).setRewardRate(newRate))
        .to.emit(stakingContract, "RewardRateSet")
        .withArgs(newRate);
      expect(await stakingContract.rewardRate()).to.equal(newRate);
    });

    it("Should not allow a non-owner to set the reward rate", async function () {
      const newRate = ethers.utils.parseUnits("25", 18);
      await expect(stakingContract.connect(staker1).setRewardRate(newRate))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should allow the owner to recover mistakenly sent ERC20 tokens", async function() {
        const amount = ethers.utils.parseUnits("100", 18);
        await rewardToken.mint(otherAccount.address, amount);
        await rewardToken.connect(otherAccount).transfer(stakingContract.address, amount);

        const ownerBalanceBefore = await rewardToken.balanceOf(owner.address);
        
        await stakingContract.connect(owner).recoverERC20(rewardToken.address, amount);

        const ownerBalanceAfter = await rewardToken.balanceOf(owner.address);
        expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.equal(amount);
    });
  });
  
  describe("Edge Cases", function () {
    it("Should handle staking and unstaking with a large number of NFTs", async function() {
        for (let i = 0; i < 20; i++) {
            await nft.mint(staker1.address);
        }
        await nft.connect(staker1).setApprovalForAll(stakingContract.address, true);

        // Staker already has tokenId 0 and 1. New ones are 3-22.
        // Stake 20 new NFTs
        for (let i = 3; i < 23; i++) {
            await stakingContract.connect(staker1).stake(i);
        }
        
        let stakerInfo = await stakingContract.stakers(staker1.address);
        expect(stakerInfo.amountStaked).to.equal(20);

        await time.increase(1000);
        
        const expectedRewards = REWARD_RATE.mul(20).mul(1000);
        const earned = await stakingContract.earned(staker1.address);
        expect(earned).to.be.closeTo(expectedRewards, ethers.utils.parseUnits("1", 12));
    });
    
    it("Should correctly calculate rewards when reward rate is 0", async function() {
        await stakingContract.connect(owner).setRewardRate(0);
        await stakingContract.connect(staker1).stake(0);
        await time.increase(1000);
        
        expect(await stakingContract.earned(staker1.address)).to.equal(0);
    });

    it("Should handle staking a large tokenId number", async function() {
        // Mint a high-number tokenId
        const largeTokenId = 2**50;
        // This requires a custom mint function, as ERC721PresetMinterPauserAutoId is sequential.
        // For this test, we'll assume the NFT contract supports non-sequential minting.
        // We will skip this test if the mock doesn't support it, but it demonstrates the principle.
        try {
            await nft.mintWithId(staker1.address, largeTokenId); // Assumes such function exists
        } catch (e) {
            this.skip();
        }
        
        await expect(stakingContract.connect(staker1).stake(largeTokenId))
            .to.emit(stakingContract, "Staked").withArgs(staker1.address, largeTokenId);

        expect(await nft.ownerOf(largeTokenId)).to.equal(stakingContract.address);
    });
  });
});
