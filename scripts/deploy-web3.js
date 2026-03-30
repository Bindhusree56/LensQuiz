const Web3 = require("web3");
const fs = require("fs");
const path = require("path");

async function main() {
  const web3 = new Web3("http://127.0.0.1:8545");
  const accounts = await web3.eth.getAccounts();
  
  console.log("Deploying from account:", accounts[0]);
  
  const contractJson = require("../build/contracts/QuizLens.json");
  
  const Contract = new web3.eth.Contract(contractJson.abi);
  const deployTx = Contract.deploy({
    data: contractJson.bytecode,
    arguments: []
  });
  
  const gas = await deployTx.estimateGas();
  console.log("Estimated gas:", gas);
  
  const instance = await deployTx.send({
    from: accounts[0],
    gas: gas + 100000
  });
  
  console.log("✅ QuizLens deployed to:", instance.options.address);
  
  // Write address to frontend config
  const config = `// Auto-generated — do not edit manually\nconst CONTRACT_ADDRESS = "${instance.options.address}";\n`;
  const outPath = path.join(__dirname, "../frontend/contract_address.js");
  fs.writeFileSync(outPath, config);
  console.log("✅ Address written to frontend/contract_address.js");
}

main().catch(console.error);
