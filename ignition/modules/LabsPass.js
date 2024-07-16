const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const WIZDOG_TOKEN_ADDRESS = "0x..."; 
const VRF_COORDINATOR = "0x...";
const LINK_TOKEN = "0x...";
const KEY_HASH = "0x...";
const FEE = ethers.utils.parseEther("0.1"); 
const INITIAL_OWNER = "0x...";

module.exports = buildModule("MagelabsPassDeployment", (m) => {
  const magelabsPass = m.contract("MagelabsPass", [
    WIZDOG_TOKEN_ADDRESS,
    VRF_COORDINATOR,
    LINK_TOKEN,
    KEY_HASH,
    FEE,
    INITIAL_OWNER
  ]);

  m.call(magelabsPass, "setTierThresholds", [[10, 50, 100, 500]]);

  m.call(magelabsPass, "setTierNFTCounts", [[100, 50, 25, 10]]);

  return { magelabsPass };
});