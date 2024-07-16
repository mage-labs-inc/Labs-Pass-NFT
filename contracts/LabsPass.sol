// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../.openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../.openzeppelin/contracts/access/Ownable.sol";
import "../.chainlink/contracts/src/v0.8/vrf/VRFConsumerBase.sol";
import "../.openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MagelabsPass is ERC721, Ownable, VRFConsumerBase {
    IERC20 public wizdogToken;

    uint256[] public tierThresholds;
    uint256[] public tierNFTCounts;

    mapping(uint256 => uint256) public tierToMaxNFTs;
    mapping(uint256 => uint256) public tierToMintedNFTs;

    bytes32 internal keyHash;
    uint256 internal fee;
    string internal baseURL;

    mapping(bytes32 => address) public requestToSender;
    mapping(bytes32 => uint256[]) public requestToTiers;

    uint256 public tokenIdCounter;

    event NFTsMinted(address indexed recipient, uint256[] tokenIds);

    constructor(
        address _wizdogTokenAddress,
        address _vrfCoordinator,
        address _linkToken,
        bytes32 _keyHash,
        uint256 _fee,
        address initialOwner
    ) 
        ERC721("Magelabs Pass", "LABSPASS")
        Ownable(initialOwner)
        VRFConsumerBase(_vrfCoordinator, _linkToken)
    {
        wizdogToken = IERC20(_wizdogTokenAddress);
        keyHash = _keyHash;
        fee = _fee;
        
        tierThresholds = [10, 50, 100, 500];
        tierNFTCounts = [100, 50, 25, 10];
        
        for (uint256 i = 0; i < 4; i++) {
            tierToMaxNFTs[i] = tierNFTCounts[i];
        }
    }

    function setTierThresholds(uint256[] memory _thresholds)
        external
        onlyOwner
    {
        require(_thresholds.length == 4, "Must provide 4 thresholds");
        tierThresholds = _thresholds;
    }

    function setTierNFTCounts(uint256[] memory _counts) external onlyOwner {
        require(_counts.length == 4, "Must provide 4 counts");
        tierNFTCounts = _counts;
        for (uint256 i = 0; i < 4; i++) {
            tierToMaxNFTs[i] = _counts[i];
        }
    }

    function setFee(uint256 _newFee) external onlyOwner {
        fee = _newFee;
    }

    function setBaseURL(string memory _newUrl) external onlyOwner {
        baseURL = _newUrl;
    }

    function mint() external returns (bytes32 requestId) {
        uint256 wizdogBalance = wizdogToken.balanceOf(msg.sender);
        uint256[] memory qualifyingTiers = getQualifyingTiers(wizdogBalance);

        require(qualifyingTiers.length > 0, "Not eligible to mint");

        requestId = requestRandomness(keyHash, fee);
        requestToSender[requestId] = msg.sender;
        requestToTiers[requestId] = qualifyingTiers;

        return requestId;
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        address sender = requestToSender[requestId];
        uint256[] memory tiers = requestToTiers[requestId];

        uint256[] memory mintedTokenIds = new uint256[](tiers.length);

        for (uint256 i = 0; i < tiers.length; i++) {
            uint256 tier = tiers[i];
            require(
                tierToMintedNFTs[tier] < tierToMaxNFTs[tier],
                "Tier fully minted"
            );

            uint256 nftId = (randomness %
                (tierToMaxNFTs[tier] - tierToMintedNFTs[tier])) +
                tierToMintedNFTs[tier];
            uint256 tokenId = (tier * 1000) + nftId;

            _safeMint(sender, tokenId);
            tierToMintedNFTs[tier]++;

            mintedTokenIds[i] = tokenId;

            // Update randomness for next iteration
            randomness = uint256(keccak256(abi.encode(randomness)));
        }

        emit NFTsMinted(sender, mintedTokenIds);

        delete requestToSender[requestId];
        delete requestToTiers[requestId];
    }

    function getQualifyingTiers(uint256 balance)
        internal
        view
        returns (uint256[] memory)
    {
        uint256[] memory qualifyingTiers = new uint256[](4);
        uint256 count = 0;

        for (uint256 i = 3; i >= 0 && i < 4; i--) {
            if (balance >= tierThresholds[i]) {
                qualifyingTiers[count] = i;
                count++;
            }
        }

        assembly {
            mstore(qualifyingTiers, count)
        }

        return qualifyingTiers;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        uint256 tier = tokenId / 1000;
        uint256 nftId = tokenId % 1000;
        return
            string(
                abi.encodePacked(
                    baseURL,
                    Strings.toString(tier),
                    "/",
                    Strings.toString(nftId)
                )
            );
    }
}
