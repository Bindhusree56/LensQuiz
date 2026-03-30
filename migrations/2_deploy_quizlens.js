require("dotenv").config();
const QuizLens = artifacts.require("QuizLens");

module.exports = async function(deployer, network) {
  if (network === "sepolia" || network === "sepolia-fork") {
    console.log("Deploying to Sepolia testnet...");
    console.log("Network:", network);
    
    await deployer.deploy(QuizLens, { gas: 3000000 });
    const instance = await QuizLens.deployed();
    
    console.log("========================================");
    console.log("QuizLens deployed to Sepolia!");
    console.log("Contract Address:", instance.address);
    console.log("Owner:", await instance.owner());
    console.log("========================================");
    console.log("");
    console.log("Save this address in your .env file:");
    console.log(`SEPOLIA_CONTRACT_ADDRESS=${instance.address}`);
    console.log("");
    console.log("Then update your frontend config with this address.");
    
    const fs = require("fs");
    const envPath = ".env";
    let envContent = "";
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }
    
    if (!envContent.includes("SEPOLIA_CONTRACT_ADDRESS")) {
      envContent += `\nSEPOLIA_CONTRACT_ADDRESS=${instance.address}\n`;
      fs.writeFileSync(envPath, envContent);
      console.log("Updated .env with contract address.");
    }
  } else {
    console.log(`Deploying to ${network}...`);
    await deployer.deploy(QuizLens);
    const instance = await QuizLens.deployed();
    console.log(`QuizLens deployed! Address: ${instance.address}`);
  }
};
