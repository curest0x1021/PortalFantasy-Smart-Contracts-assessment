import { deployProxy, upgradeProxy } from '@openzeppelin/truffle-upgrades';
import bigInt from 'big-integer';
import { localExpect } from '../lib/test-libraries';
import {
    HeroUpgradeableInstance,
    USDPUpgradeableInstance,
    MultiSigWalletInstance,
    NFTMarketplaceUpgradeableInstance,
    NFTMarketplaceUpgradeableTestInstance,
} from '../../types/truffle-contracts';
import NFT_MARKETPLACE_UPGRADEABLE_JSON from '../../build/contracts/NFTMarketplaceUpgradeable.json';
import HERO_UPGRADEABLE_JSON from '../../build/contracts/HeroUpgradeable.json';
import USDP_UPGRADEABLE_JSON from '../../build/contracts/USDPUpgradeable.json';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import { getTxIdFromMultiSigWallet } from '../lib/test-helpers';

const ethers = require('ethers');
const testAccountsData = require('../../test/data/test-accounts-data').testAccountsData;
const config = require('../../config').config;

const NFTMarketplaceUpgradeable = artifacts.require('NFTMarketplaceUpgradeable');
const heroUpgradeable = artifacts.require('HeroUpgradeable');
const USDPUpgradeable = artifacts.require('USDPUpgradeable');
const multiSigWallet = artifacts.require('MultiSigWallet');
const NFTMarketplaceUpgradeableTest = artifacts.require('NFTMarketplaceUpgradeableTest');

const web3 = new Web3(new Web3.providers.HttpProvider(config.AVAX.localSubnetHTTP));
const NFT_MARKETPLACE_ABI = NFT_MARKETPLACE_UPGRADEABLE_JSON.abi as AbiItem[];
const HERO_UPGRADEABLE_ABI = HERO_UPGRADEABLE_JSON.abi as AbiItem[];
const USDP_UPGRADEABLE_ABI = USDP_UPGRADEABLE_JSON.abi as AbiItem[];

const rpcEndpoint = config.AVAX.localSubnetHTTP;
const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);
const signer = new ethers.Wallet(testAccountsData[1].privateKey, provider);

contract.skip('NFTMarketplaceUpgradeable.sol', ([owner, account1, account2, account3, account4, account5, account6, account7, account8, account9]) => {
    let NFTMarketplaceUpgradeableInstance: NFTMarketplaceUpgradeableInstance;
    let heroUpgradeableInstance: HeroUpgradeableInstance;
    let USDPUpgradeableInstance: USDPUpgradeableInstance;
    let multiSigWalletInstance: MultiSigWalletInstance;
    let NFTMarketplaceUpgradeableTestInstance: NFTMarketplaceUpgradeableTestInstance;
    let NFTMarketplaceUpgradeableContract: any;
    let heroUpgradeableContract: any;
    let USDPContract: any;

    beforeEach(async () => {
        // Require 2 signatures for multiSig
        multiSigWalletInstance = await multiSigWallet.new([owner, account1, account2], 2);
        USDPUpgradeableInstance = (await deployProxy(USDPUpgradeable as any, [], {
            initializer: 'initialize',
        })) as USDPUpgradeableInstance;
        NFTMarketplaceUpgradeableInstance = (await deployProxy(NFTMarketplaceUpgradeable as any, [USDPUpgradeableInstance.address], {
            initializer: 'initialize',
        })) as NFTMarketplaceUpgradeableInstance;
        heroUpgradeableInstance = (await deployProxy(heroUpgradeable as any, [account1, USDPUpgradeableInstance.address, account9], {
            initializer: 'initialize',
        })) as HeroUpgradeableInstance;
        await NFTMarketplaceUpgradeableInstance.transferOwnership(multiSigWalletInstance.address);
        await USDPUpgradeableInstance.transferOwnership(multiSigWalletInstance.address);
        await heroUpgradeableInstance.transferOwnership(multiSigWalletInstance.address);

        NFTMarketplaceUpgradeableContract = new web3.eth.Contract(NFT_MARKETPLACE_ABI, NFTMarketplaceUpgradeableInstance.address);
        heroUpgradeableContract = new web3.eth.Contract(HERO_UPGRADEABLE_ABI, heroUpgradeableInstance.address);
        USDPContract = new web3.eth.Contract(USDP_UPGRADEABLE_ABI, USDPUpgradeableInstance.address);
    });

    it('only allows the contract owner to whitelist an NFT collection', async () => {
        const exampleNFTContractAddress = '0xb794f5ea0ba39494ce839613fffba74279579268';

        await localExpect(NFTMarketplaceUpgradeableInstance.updateCollectionsWhitelist(exampleNFTContractAddress, true)).to.eventually.be.rejected;

        let data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(exampleNFTContractAddress, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await localExpect(multiSigWalletInstance.confirmTransaction(txId, { from: account1 })).to.eventually.be.fulfilled;
    });

    it('only allows an NFT to be listed for sale if its contract has been whitelisted', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Attempt to list the hero token without whitelisting hero contract
        const listPriceOfHero = bigInt(priceOfHeroInUSDP).multiply(2).toString();
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, listPriceOfHero, { from: account1 })).to.eventually.be.rejected;

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, listPriceOfHero, { from: account1 })).to.eventually.be.fulfilled;
    });

    it("prevents a token from being listed by an account that doesn't own it", async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Attempt to list the token by an address that doesn't own it
        const listPriceOfHero = bigInt(priceOfHeroInUSDP).multiply(2).toString();
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, listPriceOfHero, { from: account2 })).to.eventually.be.rejected;
    });

    it('prevents a token from being listed if the price is not greater than zero', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Try to list the item at various prices
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '0', { from: account1 })).to.eventually.be.rejected;
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '-1', { from: account1 })).to.eventually.be.rejected;
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '1', { from: account1 })).to.eventually.be.fulfilled;
    });

    it("prevents a token from being re-listed if it's already listed", async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Attempt to relist an already listen item
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '1', { from: account1 })).to.eventually.be.fulfilled;
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '2', { from: account1 })).to.eventually.be.rejected;
    });

    it('only allows the NFT owner to update the listing', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Attempt to update the listing of a token by an address that doesn't own it, as well as the owner
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '1', { from: account1 })).to.eventually.be.fulfilled;
        await localExpect(NFTMarketplaceUpgradeableInstance.updateListing(heroUpgradeableInstance.address, heroTokenId, '2', { from: account2 })).to.eventually.be.rejected;
        await localExpect(NFTMarketplaceUpgradeableInstance.updateListing(heroUpgradeableInstance.address, heroTokenId, '3', { from: account1 })).to.eventually.be.fulfilled;

        const { price, seller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(seller).to.equal(account1);
        expect(price).to.equal('3');
    });

    it('only allows the NFT owner to cancel the listing', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Attempt to update the listing of a token by an address that doesn't own it, as well as the owner
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '1', { from: account1 })).to.eventually.be.fulfilled;

        await localExpect(NFTMarketplaceUpgradeableInstance.cancelListing(heroUpgradeableInstance.address, heroTokenId, { from: account2 })).to.eventually.be.rejected;
        const { price: prevPrice, seller: prevSeller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(prevSeller).to.equal(account1);
        expect(prevPrice).to.equal('1');

        await localExpect(NFTMarketplaceUpgradeableInstance.cancelListing(heroUpgradeableInstance.address, heroTokenId, { from: account1 })).to.eventually.be.fulfilled;
        const { price, seller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(seller).to.equal('0x0000000000000000000000000000000000000000');
        expect(price).to.equal('0');
    });

    it('only allows the marketplace contract owner to force-cancel a listing', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Attempt to update the listing of a token by an address that doesn't own it, as well as the owner
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, '1', { from: account1 })).to.eventually.be.fulfilled;

        await localExpect(NFTMarketplaceUpgradeableInstance.forceCancelListing(heroUpgradeableInstance.address, heroTokenId, { from: account2 })).to.eventually.be.rejected;
        const { price: prevPrice, seller: prevSeller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(prevSeller).to.equal(account1);
        expect(prevPrice).to.equal('1');

        data = NFTMarketplaceUpgradeableContract.methods.forceCancelListing(heroUpgradeableInstance.address, heroTokenId).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });
        const { price, seller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(seller).to.equal('0x0000000000000000000000000000000000000000');
        expect(price).to.equal('0');
    });

    it('allows an NFT to be purchased only if the buyer has sufficient USDP', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');
        const heroTokenListPrice = '10';
        const initialUSDPAmountMintedToBuyer = heroTokenListPrice;

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP for owner
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP for buyer
        data = USDPContract.methods.mint(account2, initialUSDPAmountMintedToBuyer).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // List item
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, heroTokenListPrice, { from: account1 })).to.eventually.be
            .fulfilled;

        // Attempt to buy the item with two different accounts (only one has sufficient USDP)
        await USDPUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenListPrice, { from: account3 });
        await localExpect(NFTMarketplaceUpgradeableInstance.buyItem(heroUpgradeableInstance.address, heroTokenId, { from: account3 })).to.eventually.be.rejected;

        await USDPUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenListPrice, { from: account2 });
        await localExpect(NFTMarketplaceUpgradeableInstance.buyItem(heroUpgradeableInstance.address, heroTokenId, { from: account2 })).to.eventually.be.fulfilled;

        const { price, seller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(seller).to.equal('0x0000000000000000000000000000000000000000');
        expect(price).to.equal('0');
    });

    it('records the correct proceeds and royalties when a token is purchased', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');
        const heroTokenListPrice = '100';
        const initialUSDPAmountMintedToBuyer = heroTokenListPrice;

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP for owner
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Deposit USDP for buyer
        data = USDPContract.methods.mint(account2, initialUSDPAmountMintedToBuyer).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        const sellerUSDPBalanceBefore = (await USDPUpgradeableInstance.balanceOf(account1)).toString();
        const royaltyReceiverBalanceBefore = (await USDPUpgradeableInstance.balanceOf(account9)).toString();
        // Buy item
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, heroTokenListPrice, { from: account1 });
        await USDPUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenListPrice, { from: account2 });
        await NFTMarketplaceUpgradeableInstance.buyItem(heroUpgradeableInstance.address, heroTokenId, { from: account2 });

        const expectedRoyalties = '4';
        const expectedSellerProceeds = (Number(heroTokenListPrice) - Number(expectedRoyalties)).toString();
        const sellerProceeds = bigInt((await USDPUpgradeableInstance.balanceOf(account1)).toString())
            .minus(sellerUSDPBalanceBefore)
            .toString();
        const royalties = bigInt((await USDPUpgradeableInstance.balanceOf(account9)).toString())
            .minus(royaltyReceiverBalanceBefore)
            .toString();
        expect(sellerProceeds).to.equal(expectedSellerProceeds);
        expect(royalties).to.equal(expectedRoyalties);
    });

    it("doesn't allow a token to be purchased if the collection has been removed from the whitelist since it was listed", async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');
        const heroTokenListPrice = '10';
        const initialUSDPAmountMintedToBuyer = heroTokenListPrice;

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP for owner
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // List item
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, heroTokenListPrice, { from: account1 })).to.eventually.be
            .fulfilled;

        // Remove the hero contract from the whitelist
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, false).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Deposit USDP for buyer
        data = USDPContract.methods.mint(account2, initialUSDPAmountMintedToBuyer).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Attempt to buy the item
        await localExpect(NFTMarketplaceUpgradeableInstance.buyItem(heroUpgradeableInstance.address, heroTokenId, { from: account2 })).to.eventually.be.rejected;

        const { price, seller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(seller).to.equal(account1);
        expect(price).to.equal(heroTokenListPrice);
    });

    it("doesn't allow a list to be updated if the collection has been removed from the whitelist since it was listed", async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP for owner
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // List item
        const heroTokenListPrice = '10';
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await localExpect(NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, heroTokenListPrice, { from: account1 })).to.eventually.be
            .fulfilled;

        // Remove the hero contract from the whitelist
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, false).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Attempt to buy the item
        await localExpect(NFTMarketplaceUpgradeableInstance.updateListing(heroUpgradeableInstance.address, heroTokenId, '20', { from: account2, value: heroTokenListPrice })).to
            .eventually.be.rejected;

        const { price, seller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(seller).to.equal(account1);
        expect(price).to.equal(heroTokenListPrice);
    });

    it('can be upgraded and store new state variables from the new contract', async () => {
        const initialUSDPAmountMintedToOwner = web3.utils.toWei('1000000000', 'ether');
        const priceOfHeroInUSDP = web3.utils.toWei('2', 'ether');
        const heroTokenListPrice = '10';

        // Add controller for USDP
        let data = USDPContract.methods.addController(multiSigWalletInstance.address).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        let txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Mint USDP for owner
        data = USDPContract.methods.mint(account1, initialUSDPAmountMintedToOwner).encodeABI();
        await multiSigWalletInstance.submitTransaction(USDPUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // Approve marketplace to handle hero token
        await USDPUpgradeableInstance.approve(heroUpgradeableInstance.address, priceOfHeroInUSDP, { from: account1 });

        const types = {
            HeroMintConditions: [
                { name: 'minter', type: 'address' },
                { name: 'tokenIds', type: 'uint256[]' },
                { name: 'tokenPrices', type: 'uint256[]' },
            ],
        };
        const heroTokenId = '0';
        const tokenIds = [heroTokenId];
        const tokenPrices = [web3.utils.toWei('1', 'ether')];
        const heroMintConditions = { minter: testAccountsData[1].address, tokenIds, tokenPrices };

        const domain = {
            name: 'PortalFantasy',
            version: '1',
            chainId: 43214,
            verifyingContract: heroUpgradeableInstance.address,
        };

        // Sign according to the EIP-712 standard
        const signature = await signer._signTypedData(domain, types, heroMintConditions);

        await heroUpgradeableInstance.safeMintTokens(signature, tokenIds, tokenPrices, { from: testAccountsData[1].address });

        // Whitelist hero contract and then list the hero token
        data = NFTMarketplaceUpgradeableContract.methods.updateCollectionsWhitelist(heroUpgradeableInstance.address, true).encodeABI();
        await multiSigWalletInstance.submitTransaction(NFTMarketplaceUpgradeableInstance.address, 0, data, { from: owner });
        txId = await getTxIdFromMultiSigWallet(multiSigWalletInstance);
        await multiSigWalletInstance.confirmTransaction(txId, { from: account1 });

        // List item
        await heroUpgradeableInstance.approve(NFTMarketplaceUpgradeableInstance.address, heroTokenId, { from: account1 });
        await NFTMarketplaceUpgradeableInstance.listItem(heroUpgradeableInstance.address, heroTokenId, heroTokenListPrice, { from: account1 });

        const { price, seller } = await NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId);
        expect(seller).to.equal(account1);
        expect(price).to.equal(heroTokenListPrice);

        // Now upgrade the contract
        NFTMarketplaceUpgradeableTestInstance = (await upgradeProxy(
            NFTMarketplaceUpgradeableInstance.address,
            NFTMarketplaceUpgradeableTest as any,
            {}
        )) as NFTMarketplaceUpgradeableInstance;

        // The test contract doesn't have the getListing method, so any calls to it should be rejected
        await localExpect(NFTMarketplaceUpgradeableInstance.getListing(heroUpgradeableInstance.address, heroTokenId)).to.eventually.be.rejected;
    });
});
