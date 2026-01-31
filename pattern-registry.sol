// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PatternRegistry
 * @dev On-chain registry for validated trading patterns
 * Agents can register patterns, stake on predictions, earn from accuracy
 */
contract PatternRegistry {
    struct Pattern {
        address agent;
        string name;
        string description;
        uint256 wins;
        uint256 total;
        uint256 stake;
        bool active;
    }
    
    struct Prediction {
        bytes32 patternId;
        string token;
        int256 entryPrice;  // scaled by 1e8
        int256 targetPrice; // scaled by 1e8
        uint256 timestamp;
        bool validated;
        bool won;
    }
    
    mapping(bytes32 => Pattern) public patterns;
    mapping(bytes32 => Prediction) public predictions;
    
    uint256 public minStake = 0.01 ether;
    
    event PatternRegistered(bytes32 indexed patternId, address indexed agent, string name);
    event PredictionMade(bytes32 indexed predictionId, bytes32 indexed patternId, string token);
    event PredictionValidated(bytes32 indexed predictionId, bool won);
    
    function registerPattern(
        string memory name,
        string memory description
    ) external payable returns (bytes32) {
        require(msg.value >= minStake, "Insufficient stake");
        
        bytes32 patternId = keccak256(abi.encodePacked(msg.sender, name, block.timestamp));
        
        patterns[patternId] = Pattern({
            agent: msg.sender,
            name: name,
            description: description,
            wins: 0,
            total: 0,
            stake: msg.value,
            active: true
        });
        
        emit PatternRegistered(patternId, msg.sender, name);
        return patternId;
    }
    
    function makePrediction(
        bytes32 patternId,
        string memory token,
        int256 entryPrice,
        int256 targetPrice
    ) external returns (bytes32) {
        require(patterns[patternId].active, "Pattern not active");
        require(patterns[patternId].agent == msg.sender, "Not pattern owner");
        
        bytes32 predictionId = keccak256(abi.encodePacked(patternId, token, block.timestamp));
        
        predictions[predictionId] = Prediction({
            patternId: patternId,
            token: token,
            entryPrice: entryPrice,
            targetPrice: targetPrice,
            timestamp: block.timestamp,
            validated: false,
            won: false
        });
        
        patterns[patternId].total++;
        
        emit PredictionMade(predictionId, patternId, token);
        return predictionId;
    }
    
    // Oracle would call this to validate
    function validatePrediction(bytes32 predictionId, bool won) external {
        // In production: require oracle or DAO validation
        Prediction storage pred = predictions[predictionId];
        require(!pred.validated, "Already validated");
        
        pred.validated = true;
        pred.won = won;
        
        if (won) {
            patterns[pred.patternId].wins++;
        }
        
        emit PredictionValidated(predictionId, won);
    }
    
    function getWinRate(bytes32 patternId) external view returns (uint256 wins, uint256 total) {
        Pattern storage p = patterns[patternId];
        return (p.wins, p.total);
    }
}
