// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AtomicRescue
 * @notice Rescue contract for EIP-7702 delegated wallets
 * @dev When V1 delegates to this contract, calling execute() 
 *      runs this code in V1's context, allowing NFT transfers
 */

interface IERC721 {
    function transferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface INameWrapper {
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external;
    function ownerOf(uint256 id) external view returns (address);
}

contract AtomicRescue {
    // ERC-8004 Registry on Ethereum mainnet
    address public constant ERC8004_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    
    // ENS NameWrapper on Ethereum mainnet
    address public constant ENS_NAME_WRAPPER = 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401;
    
    // The specific assets we're rescuing
    uint256 public constant AGENT_ID = 22583;
    
    // namehash("0xclaw.eth") - precomputed via viem
    bytes32 public constant ENS_NODE = 0x79b59aaad31ac5d39c00bcaabb05724d18ebdaa559b308a61ba0712949a6e624;
    
    // Authorized rescue destination - IMMUTABLE after deploy
    address public immutable rescueDestination;
    
    // Events for tracking
    event RescueExecuted(address indexed destination, bool erc8004Success, bool ensSuccess);
    event AssetRescued(string assetType, address indexed destination);
    
    constructor(address _destination) {
        require(_destination != address(0), "Invalid destination");
        rescueDestination = _destination;
    }
    
    /**
     * @notice Execute the rescue - transfers all assets to the preset destination
     * @dev This runs in the context of the delegating account (V1)
     *      So address(this) in the transferFrom call = V1's address
     */
    function execute() external {
        bool erc8004Success = false;
        bool ensSuccess = false;
        
        // Transfer ERC-8004 Agent #22583
        // In delegated context, address(this) = V1 = owner of the NFT
        try IERC721(ERC8004_REGISTRY).transferFrom(
            address(this),  // from = V1 (we're executing as V1)
            rescueDestination,
            AGENT_ID
        ) {
            erc8004Success = true;
            emit AssetRescued("ERC-8004", rescueDestination);
        } catch {}
        
        // Transfer ENS 0xclaw.eth via NameWrapper
        try INameWrapper(ENS_NAME_WRAPPER).safeTransferFrom(
            address(this),  // from = V1
            rescueDestination,
            uint256(ENS_NODE),
            1,
            ""
        ) {
            ensSuccess = true;
            emit AssetRescued("ENS", rescueDestination);
        } catch {}
        
        emit RescueExecuted(rescueDestination, erc8004Success, ensSuccess);
        
        // Sweep any remaining ETH
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(rescueDestination).transfer(balance);
        }
    }
    
    /**
     * @notice Check if assets can be rescued (ownership check)
     */
    function canRescue() external view returns (bool hasAgent, bool hasENS) {
        try IERC721(ERC8004_REGISTRY).ownerOf(AGENT_ID) returns (address owner) {
            hasAgent = (owner == address(this));
        } catch {}
        
        try INameWrapper(ENS_NAME_WRAPPER).ownerOf(uint256(ENS_NODE)) returns (address owner) {
            hasENS = (owner == address(this));
        } catch {}
    }
    
    // Accept ETH for gas purposes
    receive() external payable {}
}
