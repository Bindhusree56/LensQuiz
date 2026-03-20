// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract QuizLens {
    struct Record {
        bool valid;
        address setter;
        bytes32 reportHash;
        uint256 timestamp;
        string title;
    }

    mapping(bytes32 => Record) private records;

    event Notarized(bytes32 indexed paperHash, address indexed setter, string title);

    function notarize(bytes32 paperHash, bytes32 reportHash, string calldata title) external {
        records[paperHash] = Record(true, msg.sender, reportHash, block.timestamp, title);
        emit Notarized(paperHash, msg.sender, title);
    }

    function verify(bytes32 paperHash) external view returns (
        bool valid, address setter, bytes32 reportHash, uint256 timestamp, string memory title
    ) {
        Record storage r = records[paperHash];
        return (r.valid, r.setter, r.reportHash, r.timestamp, r.title);
    }
}