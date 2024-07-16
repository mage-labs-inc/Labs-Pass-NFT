const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MagelabsPass", function () {
  let MagelabsPass, magelabsPass, owner, addr1, addr2;
  let MockERC20, wizdogToken;
  let MockVRFCoordinator, vrfCoordinator;

  const LINK_TOKEN = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
  const KEY_HASH = "0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4";
  const FEE = ethers.utils.parseEther("0.1");

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy mock WIZDOG token
    MockERC20 = await ethers.getContractFactory("MockERC20");
    wizdogToken = await MockERC20.deploy("WIZDOG", "WZD");
    await wizdogToken.deployed();

    // Deploy mock VRF Coordinator
    MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    vrfCoordinator = await MockVRFCoordinator.deploy(LINK_TOKEN);
    await vrfCoordinator.deployed();

    // Deploy MagelabsPass
    MagelabsPass = await ethers.getContractFactory("MagelabsPass");
    magelabsPass = await MagelabsPass.deploy(
      wizdogToken.address,
      vrfCoordinator.address,
      LINK_TOKEN,
      KEY_HASH,
      FEE,
      owner.address
    );
    await magelabsPass.deployed();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await magelabsPass.owner()).to.equal(owner.address);
    });

    it("Should set the correct WIZDOG token address", async function () {
      expect(await magelabsPass.wizdogToken()).to.equal(wizdogToken.address);
    });
  });

  describe("setFee", function () {
    it("Should allow owner to set fee", async function () {
      const newFee = ethers.utils.parseEther("0.2");
      await magelabsPass.setFee(newFee);
      // We can't directly access the fee as it's internal, so we'll check the event
      await expect(magelabsPass.setFee(newFee))
        .to.emit(magelabsPass, "FeeUpdated")
        .withArgs(newFee);
    });

    it("Should not allow non-owner to set fee", async function () {
      const newFee = ethers.utils.parseEther("0.2");
      await expect(magelabsPass.connect(addr1).setFee(newFee)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setTierThresholds", function () {
    it("Should allow owner to set tier thresholds", async function () {
      const newThresholds = [20, 100, 200, 1000];
      await magelabsPass.setTierThresholds(newThresholds);
      for (let i = 0; i < newThresholds.length; i++) {
        expect(await magelabsPass.tierThresholds(i)).to.equal(newThresholds[i]);
      }
    });

    it("Should not allow setting incorrect number of thresholds", async function () {
      const invalidThresholds = [20, 100, 200];
      await expect(magelabsPass.setTierThresholds(invalidThresholds)).to.be.revertedWith("Must provide 4 thresholds");
    });
  });

  describe("setTierNFTCounts", function () {
    it("Should allow owner to set tier NFT counts", async function () {
      const newCounts = [200, 100, 50, 20];
      await magelabsPass.setTierNFTCounts(newCounts);
      for (let i = 0; i < newCounts.length; i++) {
        expect(await magelabsPass.tierNFTCounts(i)).to.equal(newCounts[i]);
        expect(await magelabsPass.tierToMaxNFTs(i)).to.equal(newCounts[i]);
      }
    });

    it("Should not allow setting incorrect number of counts", async function () {
      const invalidCounts = [200, 100, 50];
      await expect(magelabsPass.setTierNFTCounts(invalidCounts)).to.be.revertedWith("Must provide 4 counts");
    });
  });

  describe("mint", function () {
    beforeEach(async function () {
      // Fund the contract with LINK
      await vrfCoordinator.fundContract(magelabsPass.address, ethers.utils.parseEther("10"));
    });

    it("Should not allow minting if user has no WIZDOG tokens", async function () {
      await expect(magelabsPass.connect(addr1).mint()).to.be.revertedWith("Not eligible to mint");
    });

    it("Should request randomness when minting", async function () {
      // Give addr1 some WIZDOG tokens
      await wizdogToken.transfer(addr1.address, 100);

      await expect(magelabsPass.connect(addr1).mint())
        .to.emit(vrfCoordinator, "RandomnessRequested");
    });

    it("Should mint NFTs when randomness is fulfilled", async function () {
      // Give addr1 enough WIZDOG tokens for all tiers
      await wizdogToken.transfer(addr1.address, 1000);

      const mintTx = await magelabsPass.connect(addr1).mint();
      const receipt = await mintTx.wait();
      const requestId = receipt.events.find(e => e.event === "RandomnessRequested").args.requestId;

      // Simulate VRF Coordinator fulfilling the randomness
      await vrfCoordinator.fulfillRandomness(requestId, 12345);

      // Check that NFTs were minted
      expect(await magelabsPass.balanceOf(addr1.address)).to.equal(4); // One from each tier
    });
  });

  describe("tokenURI", function () {
    it("Should return correct token URI", async function () {
      // Mint an NFT first
      await wizdogToken.transfer(addr1.address, 1000);
      const mintTx = await magelabsPass.connect(addr1).mint();
      const receipt = await mintTx.wait();
      const requestId = receipt.events.find(e => e.event === "RandomnessRequested").args.requestId;
      await vrfCoordinator.fulfillRandomness(requestId, 12345);

      const tokenId = 0; // Assuming this is the first minted token
      const uri = await magelabsPass.tokenURI(tokenId);
      expect(uri).to.match(/^https:\/\/api\.magelabs\.com\/nft\/\d+\/\d+$/);
    });

    it("Should revert for non-existent token", async function () {
      await expect(magelabsPass.tokenURI(9999)).to.be.revertedWith("Token does not exist");
    });
  });
});