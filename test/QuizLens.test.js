const QuizLens = artifacts.require("QuizLens");

contract("QuizLens", function ([owner, notOwner, other]) {
  let instance;
  const ZERO_HASH = "0x" + "0".repeat(64);
  const ONE_HASH = "0x" + "1".repeat(64);
  const TWO_HASH = "0x" + "2".repeat(64);
  const THREE_HASH = "0x" + "3".repeat(64);
  const FOUR_HASH = "0x" + "4".repeat(64);
  const TEST_TITLE = "Test Exam Paper";

  beforeEach(async function () {
    instance = await QuizLens.new({ from: owner });
  });

  describe("Ownership", function () {
    it("should set deployer as owner", async function () {
      const contractOwner = await instance.owner();
      assert.equal(contractOwner, owner, "Owner should be the deployer");
    });

    it("should allow owner to transfer ownership", async function () {
      await instance.transferOwnership(notOwner, { from: owner });
      const pending = await instance.pendingOwner();
      assert.equal(pending, notOwner, "Pending owner should be notOwner");
    });

    it("should allow pending owner to accept ownership", async function () {
      await instance.transferOwnership(notOwner, { from: owner });
      await instance.acceptOwnership({ from: notOwner });
      const newOwner = await instance.owner();
      assert.equal(newOwner, notOwner, "Owner should be transferred to notOwner");
    });

    it("should prevent non-owner from transferring ownership", async function () {
      try {
        await instance.transferOwnership(other, { from: notOwner });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Ownable: caller is not the owner"), "Expected Ownable error");
      }
    });

    it("should allow owner to renounce ownership", async function () {
      await instance.renounceOwnership({ from: owner });
      const contractOwner = await instance.owner();
      assert.equal(contractOwner, "0x0000000000000000000000000000000000000000", "Owner should be zero address");
    });
  });

  describe("Notarize", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should notarize a paper with correct fee", async function () {
      const initialBalance = await web3.eth.getBalance(instance.address);
      
      const tx = await instance.notarize(
        ONE_HASH,
        TWO_HASH,
        TEST_TITLE,
        { from: notOwner, value: NOTARIZE_FEE }
      );

      const [valid, setter, reportHash, timestamp, blockNumber, title] = 
        await instance.verify(ONE_HASH);

      assert.isTrue(valid, "Paper should be valid");
      assert.equal(setter, notOwner, "Setter should be notOwner");
      assert.equal(reportHash, TWO_HASH, "Report hash should match");
      assert.equal(title, TEST_TITLE, "Title should match");
      assert.equal(timestamp.toString(), (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp.toString(), "Timestamp should match");
      assert.equal(blockNumber.toString(), tx.receipt.blockNumber.toString(), "Block number should match");

      const newBalance = await web3.eth.getBalance(instance.address);
      assert.equal(
        web3.utils.toBN(newBalance).sub(web3.utils.toBN(initialBalance)).toString(),
        NOTARIZE_FEE,
        "Contract balance should increase by fee"
      );
    });

    it("should reject notarization without fee", async function () {
      try {
        await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: notOwner, value: 0 });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Insufficient notarization fee"), "Expected fee error");
      }
    });

    it("should reject zero paper hash", async function () {
      try {
        await instance.notarize(ZERO_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Paper hash cannot be zero"), "Expected zero hash error");
      }
    });

    it("should reject duplicate paper", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      try {
        await instance.notarize(ONE_HASH, THREE_HASH, "Different Title", { from: owner, value: NOTARIZE_FEE });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Paper already notarized"), "Expected duplicate error");
      }
    });

    it("should reject empty title", async function () {
      try {
        await instance.notarize(ONE_HASH, TWO_HASH, "", { from: owner, value: NOTARIZE_FEE });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Invalid title length"), "Expected title error");
      }
    });

    it("should reject title too long", async function () {
      const longTitle = "a".repeat(300);
      try {
        await instance.notarize(ONE_HASH, TWO_HASH, longTitle, { from: owner, value: NOTARIZE_FEE });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Invalid title length"), "Expected title error");
      }
    });

    it("should emit Notarized event with timestamp", async function () {
      const tx = await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      const event = tx.logs.find(log => log.event === "Notarized");
      assert.exists(event, "Notarized event should be emitted");
      assert.equal(event.args.paperHash, ONE_HASH, "Paper hash should match");
      assert.equal(event.args.setter, owner, "Setter should match");
      assert.equal(event.args.title, TEST_TITLE, "Title should match");
      assert.exists(event.args.timestamp.toString(), "Timestamp should be present");
      assert.equal(event.args.reportHash, TWO_HASH, "Report hash should match");
    });
  });

  describe("Batch Notarize", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should notarize batch of papers", async function () {
      const paperHashes = [ONE_HASH, TWO_HASH, THREE_HASH];
      const reportHashes = [FOUR_HASH, FOUR_HASH, FOUR_HASH];
      const titles = ["Paper 1", "Paper 2", "Paper 3"];
      const totalFee = web3.utils.toWei("0.03", "ether");

      await instance.notarizeBatch(paperHashes, reportHashes, titles, { 
        from: owner, 
        value: totalFee 
      });

      for (let i = 0; i < paperHashes.length; i++) {
        const [valid, , , , , title] = await instance.verify(paperHashes[i]);
        assert.isTrue(valid, `Paper ${i} should be valid`);
        assert.equal(title, titles[i], `Title ${i} should match`);
      }
    });

    it("should reject batch with mismatched arrays", async function () {
      try {
        await instance.notarizeBatch(
          [ONE_HASH, TWO_HASH],
          [FOUR_HASH],
          ["Paper 1"],
          { from: owner, value: web3.utils.toWei("0.02", "ether") }
        );
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Array length mismatch"), "Expected array mismatch error");
      }
    });

    it("should reject oversized batch", async function () {
      const paperHashes = Array(101).fill(ONE_HASH);
      const reportHashes = Array(101).fill(TWO_HASH);
      const titles = Array(101).fill(TEST_TITLE);
      
      try {
        await instance.notarizeBatch(paperHashes, reportHashes, titles, { 
          from: owner, 
          value: web3.utils.toWei("1.01", "ether") 
        });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Batch too large"), "Expected batch size error");
      }
    });

    it("should emit multiple Notarized events for batch", async function () {
      const paperHashes = [ONE_HASH, TWO_HASH];
      const reportHashes = [THREE_HASH, FOUR_HASH];
      const titles = ["Paper 1", "Paper 2"];

      const tx = await instance.notarizeBatch(paperHashes, reportHashes, titles, { 
        from: owner, 
        value: web3.utils.toWei("0.02", "ether") 
      });

      const notarizedEvents = tx.logs.filter(log => log.event === "Notarized");
      assert.equal(notarizedEvents.length, 2, "Should emit 2 Notarized events");
    });
  });

  describe("Verify", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should return false for unnotarized paper", async function () {
      const [valid] = await instance.verify(ONE_HASH);
      assert.isFalse(valid, "Unnotarized paper should be invalid");
    });

    it("should return correct record after notarization", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      const [valid, setter, reportHash, timestamp, blockNumber, title] = 
        await instance.verify(ONE_HASH);

      assert.isTrue(valid);
      assert.equal(setter, owner);
      assert.equal(reportHash, TWO_HASH);
      assert.equal(title, TEST_TITLE);
      assert.isTrue(timestamp > 0);
      assert.isTrue(blockNumber > 0);
    });
  });

  describe("Merkle Root", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should return zero hash for empty tree", async function () {
      const root = await instance.merkleRoot();
      assert.equal(root, ZERO_HASH, "Empty tree should have zero root");
    });

    it("should compute correct root for single leaf", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      const root = await instance.merkleRoot();
      assert.equal(root, ONE_HASH, "Single leaf root should equal the leaf hash");
    });

    it("should compute correct root for two leaves", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      await instance.notarize(TWO_HASH, THREE_HASH, "Paper 2", { from: owner, value: NOTARIZE_FEE });
      
      const root = await instance.merkleRoot();
      const expectedRoot = web3.utils.keccak256(
        web3.utils.encodePacked({ type: "bytes32", value: ONE_HASH }, { type: "bytes32", value: TWO_HASH })
      );
      assert.equal(root, expectedRoot, "Root should match expected Merkle root");
    });

    it("should compute correct root for odd number of leaves", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      await instance.notarize(TWO_HASH, THREE_HASH, "Paper 2", { from: owner, value: NOTARIZE_FEE });
      await instance.notarize(THREE_HASH, FOUR_HASH, "Paper 3", { from: owner, value: NOTARIZE_FEE });
      
      const root = await instance.merkleRoot();
      assert.notEqual(root, ZERO_HASH, "Root should not be zero");
      assert.notEqual(root, ONE_HASH, "Root should not equal first leaf");
    });

    it("should update root on each notarization", async function () {
      const root0 = await instance.merkleRoot();
      
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      const root1 = await instance.merkleRoot();
      
      await instance.notarize(TWO_HASH, THREE_HASH, "Paper 2", { from: owner, value: NOTARIZE_FEE });
      const root2 = await instance.merkleRoot();

      assert.notEqual(root0, root1, "Root should change after first notarization");
      assert.notEqual(root1, root2, "Root should change after second notarization");
    });

    it("should emit MerkleRootUpdated event", async function () {
      const tx = await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { 
        from: owner, 
        value: NOTARIZE_FEE 
      });
      
      const event = tx.logs.find(log => log.event === "MerkleRootUpdated");
      assert.exists(event, "MerkleRootUpdated event should be emitted");
      assert.equal(event.args.newRoot, await instance.merkleRoot(), "Event root should match current root");
    });
  });

  describe("Merkle Proof Verification", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should verify valid proof for single leaf", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      const isValid = await instance.verifyMerkleProof(
        ONE_HASH,
        [],
        [],
        { from: owner }
      );
      assert.isTrue(isValid, "Single leaf should verify against its own hash");
    });

    it("should reject proof with mismatched sides length", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      try {
        await instance.verifyMerkleProof(
          ONE_HASH,
          [TWO_HASH],
          [true, false],
          { from: owner }
        );
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Proof and sides length mismatch"), "Expected length mismatch error");
      }
    });

    it("should reject empty proof for multi-leaf tree", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      await instance.notarize(TWO_HASH, THREE_HASH, "Paper 2", { from: owner, value: NOTARIZE_FEE });
      
      try {
        await instance.verifyMerkleProof(
          ONE_HASH,
          [],
          [],
          { from: owner }
        );
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Empty proof"), "Expected empty proof error");
      }
    });

    it("should verify valid proof with correct side", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      
      const proof = [TWO_HASH];
      const sides = [false];
      
      const isValid = await instance.verifyMerkleProof(ONE_HASH, proof, sides, { from: owner });
      assert.isTrue(isValid, "Proof should verify when sibling is on right (side=false)");
    });

    it("should reject invalid proof", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      
      const proof = [THREE_HASH];
      const sides = [false];
      
      const isValid = await instance.verifyMerkleProof(ONE_HASH, proof, sides, { from: owner });
      assert.isFalse(isValid, "Invalid proof should not verify");
    });

    it("should verify proof for leaf in multi-level tree", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      await instance.notarize(TWO_HASH, THREE_HASH, "Paper 2", { from: owner, value: NOTARIZE_FEE });
      await instance.notarize(THREE_HASH, FOUR_HASH, "Paper 3", { from: owner, value: NOTARIZE_FEE });
      
      const root = await instance.merkleRoot();
      const leaf0 = ONE_HASH;
      const leaf1 = TWO_HASH;
      const leaf2 = THREE_HASH;
      
      const hash01 = web3.utils.keccak256(
        web3.utils.encodePacked({ type: "bytes32", value: leaf0 }, { type: "bytes32", value: leaf1 })
      );
      const hash012 = web3.utils.keccak256(
        web3.utils.encodePacked({ type: "bytes32", value: hash01 }, { type: "bytes32", value: leaf2 })
      );
      
      const proof = [leaf1, leaf2];
      const sides = [false, false];
      
      const isValid = await instance.verifyMerkleProof(leaf0, proof, sides, { from: owner });
      assert.isTrue(isValid, "Multi-level proof should verify");
    });
  });

  describe("computeRootFromLeaves", function () {
    it("should return zero for empty array", async function () {
      const root = await instance.computeRootFromLeaves([]);
      assert.equal(root, ZERO_HASH, "Empty leaves should return zero hash");
    });

    it("should return single leaf as root", async function () {
      const root = await instance.computeRootFromLeaves([ONE_HASH]);
      assert.equal(root, ONE_HASH, "Single leaf should be returned as root");
    });

    it("should compute correct root for multiple leaves", async function () {
      const leaves = [ONE_HASH, TWO_HASH];
      const root = await instance.computeRootFromLeaves(leaves);
      
      const expectedRoot = web3.utils.keccak256(
        web3.utils.encodePacked({ type: "bytes32", value: ONE_HASH }, { type: "bytes32", value: TWO_HASH })
      );
      assert.equal(root, expectedRoot, "Computed root should match expected");
    });

    it("should compute correct root for three leaves", async function () {
      const leaves = [ONE_HASH, TWO_HASH, THREE_HASH];
      const root = await instance.computeRootFromLeaves(leaves);
      
      const hash01 = web3.utils.keccak256(
        web3.utils.encodePacked({ type: "bytes32", value: ONE_HASH }, { type: "bytes32", value: TWO_HASH })
      );
      const expectedRoot = web3.utils.keccak256(
        web3.utils.encodePacked({ type: "bytes32", value: hash01 }, { type: "bytes32", value: THREE_HASH })
      );
      assert.equal(root, expectedRoot, "Computed root for odd count should match");
    });
  });

  describe("Leaf Access", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should return correct leaf count", async function () {
      assert.equal((await instance.leafCount()).toString(), "0", "Initial count should be 0");
      
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      assert.equal((await instance.leafCount()).toString(), "1", "Count should be 1 after first notarization");
      
      await instance.notarize(TWO_HASH, THREE_HASH, "Paper 2", { from: owner, value: NOTARIZE_FEE });
      assert.equal((await instance.leafCount()).toString(), "2", "Count should be 2 after second notarization");
    });

    it("should return correct leaf hash by index", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      await instance.notarize(TWO_HASH, THREE_HASH, "Paper 2", { from: owner, value: NOTARIZE_FEE });
      
      const leaf0 = await instance.getLeafHash(0);
      const leaf1 = await instance.getLeafHash(1);
      
      assert.equal(leaf0, ONE_HASH, "First leaf should match");
      assert.equal(leaf1, TWO_HASH, "Second leaf should match");
    });

    it("should revert for out-of-bounds index", async function () {
      try {
        await instance.getLeafHash(0);
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Index out of bounds"), "Expected bounds error");
      }
    });

    it("should check if leaf is indexed correctly", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      
      const [isIndexed0, idx0] = await instance.isLeafIndexed(ONE_HASH);
      const [isIndexed1, idx1] = await instance.isLeafIndexed(TWO_HASH);
      
      assert.isTrue(isIndexed0, "First leaf should be indexed");
      assert.equal(idx0.toString(), "0", "Index of first leaf should be 0");
      assert.isFalse(isIndexed1, "Non-existent leaf should not be indexed");
    });
  });

  describe("Paginated Leaf Access", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should return empty array for offset beyond count", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, "Paper 1", { from: owner, value: NOTARIZE_FEE });
      
      const leaves = await instance.getAllLeavesPaginated(5, 10);
      assert.equal(leaves.length, 0, "Should return empty array for out-of-bounds offset");
    });

    it("should return limited results with pagination", async function () {
      for (let i = 0; i < 5; i++) {
        await instance.notarize(
          web3.utils.keccak256(`leaf${i}`),
          web3.utils.keccak256(`report${i}`),
          `Paper ${i}`,
          { from: owner, value: NOTARIZE_FEE }
        );
      }
      
      const leaves1 = await instance.getAllLeavesPaginated(0, 2);
      const leaves2 = await instance.getAllLeavesPaginated(2, 2);
      const leaves3 = await instance.getAllLeavesPaginated(4, 2);
      
      assert.equal(leaves1.length, 2, "First page should have 2 leaves");
      assert.equal(leaves2.length, 2, "Second page should have 2 leaves");
      assert.equal(leaves3.length, 1, "Last page should have 1 leaf");
    });
  });

  describe("Fee Management", function () {
    const NOTARIZE_FEE = web3.utils.toWei("0.01", "ether");

    it("should accept notarization fee", async function () {
      const initialBalance = await web3.eth.getBalance(instance.address);
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      const newBalance = await web3.eth.getBalance(instance.address);
      
      assert.equal(
        web3.utils.toBN(newBalance).sub(web3.utils.toBN(initialBalance)).toString(),
        NOTARIZE_FEE,
        "Fee should be received"
      );
    });

    it("should allow owner to withdraw fees", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      const contractBalance = await instance.getContractBalance();
      const ownerBalanceBefore = await web3.eth.getBalance(owner);
      
      await instance.withdrawFees(owner, { from: owner });
      
      const ownerBalanceAfter = await web3.eth.getBalance(owner);
      const contractBalanceAfter = await instance.getContractBalance();
      
      assert.equal(contractBalanceAfter.toString(), "0", "Contract balance should be 0");
      assert.isTrue(
        web3.utils.toBN(ownerBalanceAfter).gt(web3.utils.toBN(ownerBalanceBefore)),
        "Owner balance should increase"
      );
    });

    it("should prevent non-owner from withdrawing fees", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      try {
        await instance.withdrawFees(notOwner, { from: notOwner });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Ownable: caller is not the owner"), "Expected Ownable error");
      }
    });

    it("should prevent withdrawal to zero address", async function () {
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      
      try {
        await instance.withdrawFees("0x0000000000000000000000000000000000000000", { from: owner });
        assert.fail("Should have reverted");
      } catch (err) {
        assert(err.message.includes("Invalid recipient"), "Expected invalid recipient error");
      }
    });

    it("should return correct contract balance", async function () {
      const balance0 = await instance.getContractBalance();
      assert.equal(balance0.toString(), "0", "Initial balance should be 0");
      
      await instance.notarize(ONE_HASH, TWO_HASH, TEST_TITLE, { from: owner, value: NOTARIZE_FEE });
      const balance1 = await instance.getContractBalance();
      assert.equal(balance1.toString(), NOTARIZE_FEE, "Balance should equal fee");
    });
  });
});
