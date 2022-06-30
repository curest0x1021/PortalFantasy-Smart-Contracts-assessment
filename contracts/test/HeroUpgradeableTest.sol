// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../lib/IERC20.sol";
import "../lib/IERC2981.sol";
import "../lib/Counters.sol";
import "../lib/upgradeable/ERC721RoyaltyUpgradeable.sol";
import "../lib/upgradeable/ContractURIStorageUpgradeable.sol";
import "../lib/upgradeable/OwnableUpgradeable.sol";
import "../lib/upgradeable/PausableUpgradeable.sol";

// @NOTE: Remove setBaseURI function to test the contract upgrade

contract HeroUpgradeableTest is
    ERC721RoyaltyUpgradeable,
    ContractURIStorageUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    string public baseURIString;

    // The hero mint price in AVAX
    uint256 public mintPriceInAVAX;

    // The hero mint price in PORB
    uint256 public mintPriceInPORB;

    // The address of the PORB contract
    IERC20 public PORB;

    // The vault contract to deposit earned PORB/AVAX and royalties
    address public vault;

    function initialize(address _PORB, address _vault) public initializer {
        __ERC721_init("Portal Fantasy Hero", "TEST");
        __ContractURIStorage_init("https://www.portalfantasy.io/hero/");
        __Ownable_init();

        // @TODO: Have added a placeholder baseURIString. Need to replace with actual when it's implemented.
        baseURIString = "https://www.portalfantasy.io/";
        PORB = IERC20(_PORB);
        vault = _vault;

        // @TODO: Set the actual initial price in PORB to mint a Hero
        // 2 PORB initial price
        mintPriceInAVAX = 2000000000000000000;

        // @TODO: Set the actual initial price in PORB to mint a Hero
        // 2 PORB initial price
        mintPriceInPORB = 2000000000000000000;

        // Set the default token royalty to 4%
        _setDefaultRoyalty(vault, 400);
    }

    // @TODO: Have added a placeholder baseURI. Need to replace with actual when it's implemented.
    /**
     * Overriding the parent _baseURI() with required baseURI
     */
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURIString;
    }

    /**
     * Allows the caller to mint a token with a payment in AVAX
     */
    function mintWithAVAX() external payable whenNotPaused {
        require(msg.value == mintPriceInAVAX, "Invalid payment amount");
        payable(vault).transfer(msg.value);
        _safeMint(_msgSender(), _tokenIdCounter.current());
        _tokenIdCounter.increment();
    }

    /**
     * Allows the caller to mint a token with a payment in PORB
     */
    function mintWithPORB() external whenNotPaused {
        PORB.transferFrom(_msgSender(), vault, mintPriceInPORB);
        _safeMint(_msgSender(), _tokenIdCounter.current());
        _tokenIdCounter.increment();
    }

    /**
     * Allows the owner to set a new contract URI
     * @param _contractURIString the new contract URI to point to
     */
    function setContractURIString(string calldata _contractURIString)
        external
        onlyOwner
    {
        _setContractURIString(_contractURIString);
    }

    /**
     * Allows the owner to set a new mint price in AVAX
     * @param _mintPriceInAVAX the new mint price
     */
    function setMintPriceInAVAX(uint256 _mintPriceInAVAX) external onlyOwner {
        mintPriceInAVAX = _mintPriceInAVAX;
    }

    /**
     * Allows the owner to set a new mint price in PORB
     * @param _mintPriceInPORB the new mint price
     */
    function setMintPriceInPORB(uint256 _mintPriceInPORB) external onlyOwner {
        mintPriceInPORB = _mintPriceInPORB;
    }

    /**
     * Enable the owner to pause / unpause minting
     * @param _paused paused when set to `true`, unpause when set to `false`
     */
    function setPaused(bool _paused) external onlyOwner {
        if (_paused) _pause();
        else _unpause();
    }

    /**
     * Allows the owner to set a new PORB contract address to point to
     * @param _PORB the new PORB address
     */
    function setPORB(address _PORB) external onlyOwner {
        PORB = IERC20(_PORB);
    }

    /**
     * Allows the owner to set a new vault to deposit earned PORB/AVAX
     * @param _vault the new address for the vault
     */
    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    /**
     * Allows the owner to set a new default royalty which applies to all tokens in absence of a specific token royalty
     * @param _feeNumerator in bips. Cannot be greater than the fee denominator (10000)
     */
    function setDefaultRoyalty(uint96 _feeNumerator) external onlyOwner {
        _setDefaultRoyalty(vault, _feeNumerator);
    }

    /**
     * Allows the owner to set a custom royalty for a specific token
     * @param _tokenId the token to set a custom royalty for
     * @param _feeNumerator in bips. Cannot be greater than the fee denominator (10000)
     */
    function setTokenRoyalty(uint256 _tokenId, uint96 _feeNumerator)
        external
        onlyOwner
    {
        _setTokenRoyalty(_tokenId, vault, _feeNumerator);
    }

    /**
     * Allows the owner to reset a specific token's royalty to the global default
     * @param _tokenId the token to set a custom royalty for
     */
    function resetTokenRoyalty(uint256 _tokenId) external onlyOwner {
        _resetTokenRoyalty(_tokenId);
    }
}