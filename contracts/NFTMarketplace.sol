// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./lib/Ownable.sol";
import "./lib/IERC20.sol";
import "./lib/IERC721.sol";
import "./lib/IERC2981.sol";
import "./lib/ReentrancyGuard.sol";

contract NFTMarketplace is ReentrancyGuard, Ownable {
    // Structs
    struct Listing {
        uint256 price;
        address seller;
    }

    // Events
    event ItemListed(
        uint256 indexed tokenId,
        address indexed seller,
        address NFTAddress,
        uint256 price
    );

    event ItemCancelled(
        uint256 indexed tokenId,
        address indexed seller,
        address NFTAddress
    );

    event ItemBought(
        uint256 indexed tokenId,
        address indexed buyer,
        address indexed seller,
        address NFTAddress,
        uint256 price 
    );

    // Modifiers
    modifier notListed(
        address NFTAddress,
        uint256 tokenId,
        address owner
    ) {
        require(listings[NFTAddress][tokenId].price == 0, "Market: Already listed");
        _;
    }

    modifier isNFTOwner(
        address NFTAddress,
        uint256 tokenId,
        address spender
    ) {
        require(IERC721(NFTAddress).ownerOf(tokenId) == spender, "Market: Not the owner");
        _;
    }

    modifier isListed(address NFTAddress, uint256 tokenId) {
        require(listings[NFTAddress][tokenId].price > 0, "Market: Not listed");
        _;
    }

    // An ERC-20 token that is accepted as payment in the marketplace (e.g. WAVAX)
    address tokenToPay;

    mapping(address => mapping(uint256 => Listing)) private listings;

    constructor(address _tokenToPay) {
        tokenToPay = _tokenToPay;
    }

    function listItem(
        address NFTAddress,
        uint256 tokenId,
        uint256 price
    )
        external
        notListed(NFTAddress, tokenId, msg.sender)
        isNFTOwner(NFTAddress, tokenId, msg.sender)
    {
        require(price > 0, "Price must be above zero");
        require(
            IERC721(NFTAddress).getApproved(tokenId) == address(this),
            "Not approved for marketplace"
        );
        listings[NFTAddress][tokenId] = Listing(price, msg.sender);
        emit ItemListed(tokenId, msg.sender, NFTAddress, price);
    }

    function cancelListing(address NFTAddress, uint256 tokenId)
        external
        isNFTOwner(NFTAddress, tokenId, msg.sender)
        isListed(NFTAddress, tokenId)
    {
        delete (listings[NFTAddress][tokenId]);
        emit ItemCancelled(tokenId, msg.sender, NFTAddress);
    }

    // NFT Reentrant attack: attacker may call this more than once using NFT->onReceived callback
    function buyItem(address NFTAddress, uint256 tokenId)
        external
        nonReentrant()
        isListed(NFTAddress, tokenId)
    {
        Listing memory listedItem = listings[NFTAddress][tokenId];

        uint256 amountPaidToSeller = listedItem.price;

        IERC20(tokenToPay).transferFrom(
            msg.sender,
            listedItem.seller,
            amountPaidToSeller
        );
        delete (listings[NFTAddress][tokenId]);
        IERC721(NFTAddress).safeTransferFrom(
            listedItem.seller,
            msg.sender,
            tokenId
        );
        emit ItemBought(tokenId, msg.sender, listedItem.seller, NFTAddress, listedItem.price);
    }

    function updateListing(
        address NFTAddress,
        uint256 tokenId,
        uint256 newPrice
    )
        external
        isListed(NFTAddress, tokenId)
        isNFTOwner(NFTAddress, tokenId, msg.sender)
    {
        require(newPrice > 0, "Price must be above zero");
        listings[NFTAddress][tokenId].price = newPrice;
        emit ItemListed(tokenId, msg.sender, NFTAddress, newPrice);
    }

    function getListing(address NFTAddress, uint256 tokenId)
        external
        view
        returns (Listing memory)
    {
        return listings[NFTAddress][tokenId];
    }
}
