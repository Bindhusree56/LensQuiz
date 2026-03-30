// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

abstract contract Ownable {
    address public owner;
    address public pendingOwner;
    
    event OwnershipTransferInitiated(address indexed oldOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferInitiated(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Ownable: caller is not the pending owner");
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function renounceOwnership() external onlyOwner {
        address oldOwner = owner;
        owner = address(0);
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, address(0));
    }
}

contract QuizLens is Ownable {
    uint256 public constant NOTARIZE_FEE = 0.01 ether;
    uint256 public constant MAX_LEAVES_PER_BATCH = 100;
    
    struct Record {
        bool valid;
        address setter;
        bytes32 reportHash;
        uint256 timestamp;
        uint256 blockNumber;
        string title;
    }

    mapping(bytes32 => Record) private records;
    mapping(bytes32 => uint256) private leafIndices;
    bytes32 public merkleRoot;
    
    bytes32[] private _leaves;
    uint256 public leafCount;
    
    event Notarized(
        bytes32 indexed paperHash, 
        address indexed setter, 
        string title, 
        uint256 timestamp,
        uint256 blockNumber,
        bytes32 reportHash
    );
    event MerkleRootUpdated(bytes32 newRoot);
    event FeeWithdrawn(address indexed recipient, uint256 amount);
    event NotarizeFeeUpdated(uint256 newFee);

    constructor() {
        leafCount = 0;
    }

    receive() external payable {}

    function notarize(
        bytes32 paperHash, 
        bytes32 reportHash, 
        string calldata title
    ) external payable {
        require(msg.value >= NOTARIZE_FEE, "Insufficient notarization fee");
        require(paperHash != bytes32(0), "Paper hash cannot be zero");
        require(!records[paperHash].valid, "Paper already notarized");
        require(bytes(title).length > 0 && bytes(title).length <= 256, "Invalid title length");
        
        uint256 idx = leafCount;
        leafIndices[paperHash] = idx;
        _leaves.push(paperHash);
        leafCount++;
        
        records[paperHash] = Record({
            valid: true,
            setter: msg.sender,
            reportHash: reportHash,
            timestamp: block.timestamp,
            blockNumber: block.number,
            title: title
        });
        
        merkleRoot = _computeRoot();
        emit Notarized(
            paperHash, 
            msg.sender, 
            title, 
            block.timestamp,
            block.number,
            reportHash
        );
        emit MerkleRootUpdated(merkleRoot);
    }

    function notarizeBatch(
        bytes32[] calldata paperHashes,
        bytes32[] calldata reportHashes,
        string[] calldata titles
    ) external payable {
        require(paperHashes.length == reportHashes.length, "Array length mismatch");
        require(paperHashes.length == titles.length, "Array length mismatch");
        require(paperHashes.length <= MAX_LEAVES_PER_BATCH, "Batch too large");
        
        uint256 totalFee = NOTARIZE_FEE * paperHashes.length;
        require(msg.value >= totalFee, "Insufficient notarization fee");
        
        for (uint256 i = 0; i < paperHashes.length; i++) {
            require(paperHashes[i] != bytes32(0), "Paper hash cannot be zero");
            require(!records[paperHashes[i]].valid, "Paper already notarized");
            
            uint256 idx = leafCount;
            leafIndices[paperHashes[i]] = idx;
            _leaves.push(paperHashes[i]);
            leafCount++;
            
            records[paperHashes[i]] = Record({
                valid: true,
                setter: msg.sender,
                reportHash: reportHashes[i],
                timestamp: block.timestamp,
                blockNumber: block.number,
                title: titles[i]
            });
            
            emit Notarized(
                paperHashes[i], 
                msg.sender, 
                titles[i], 
                block.timestamp,
                block.number,
                reportHashes[i]
            );
        }
        
        merkleRoot = _computeRoot();
        emit MerkleRootUpdated(merkleRoot);
    }

    function verifyMerkleProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        bool[] calldata sides
    ) external view returns (bool) {
        require(proof.length == sides.length, "Proof and sides length mismatch");
        require(proof.length > 0, "Empty proof");
        
        bytes32 computed = leaf;
        for (uint i = 0; i < proof.length; i++) {
            if (sides[i]) {
                computed = keccak256(abi.encodePacked(proof[i], computed));
            } else {
                computed = keccak256(abi.encodePacked(computed, proof[i]));
            }
        }
        return computed == merkleRoot;
    }

    function _computeRoot() internal view returns (bytes32) {
        if (leafCount == 0) return bytes32(0);
        
        bytes32[] memory layer = new bytes32[](leafCount);
        for (uint i = 0; i < leafCount; i++) {
            layer[i] = _leaves[i];
        }
        
        while (layer.length > 1) {
            uint len = layer.length;
            uint newLen = (len + 1) / 2;
            bytes32[] memory next = new bytes32[](newLen);
            
            for (uint i = 0; i < newLen; i++) {
                uint left = i * 2;
                uint right = left + 1 < len ? left + 1 : left;
                next[i] = keccak256(abi.encodePacked(layer[left], layer[right]));
            }
            layer = next;
        }
        return layer[0];
    }

    function computeRootFromLeaves(bytes32[] calldata leaves) external pure returns (bytes32) {
        if (leaves.length == 0) return bytes32(0);
        
        bytes32[] memory layer = new bytes32[](leaves.length);
        for (uint i = 0; i < leaves.length; i++) {
            layer[i] = leaves[i];
        }
        
        while (layer.length > 1) {
            uint len = layer.length;
            uint newLen = (len + 1) / 2;
            bytes32[] memory next = new bytes32[](newLen);
            
            for (uint i = 0; i < newLen; i++) {
                uint left = i * 2;
                uint right = left + 1 < len ? left + 1 : left;
                next[i] = keccak256(abi.encodePacked(layer[left], layer[right]));
            }
            layer = next;
        }
        return layer[0];
    }

    function verify(bytes32 paperHash) external view returns (
        bool valid,
        address setter,
        bytes32 reportHash,
        uint256 timestamp,
        uint256 blockNumber,
        string memory title
    ) {
        Record storage r = records[paperHash];
        return (r.valid, r.setter, r.reportHash, r.timestamp, r.blockNumber, r.title);
    }

    function getLeafHash(uint256 index) external view returns (bytes32) {
        require(index < leafCount, "Index out of bounds");
        return _leaves[index];
    }

    function getAllLeavesPaginated(uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        uint256 actualLimit = offset + limit > leafCount ? leafCount - offset : limit;
        bytes32[] memory result = new bytes32[](actualLimit);
        
        for (uint256 i = 0; i < actualLimit; i++) {
            result[i] = _leaves[offset + i];
        }
        return result;
    }

    function isLeafIndexed(bytes32 paperHash) external view returns (bool, uint256) {
        if (leafCount == 0) return (false, 0);
        uint256 idx = leafIndices[paperHash];
        return (_leaves[idx] == paperHash, idx);
    }

    function withdrawFees(address payable recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        (bool success, ) = recipient.call{value: balance}("");
        require(success, "Transfer failed");
        emit FeeWithdrawn(recipient, balance);
    }

    function setNotarizeFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1 ether, "Fee too high");
        NOTARIZE_FEE = newFee;
        emit NotarizeFeeUpdated(newFee);
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
