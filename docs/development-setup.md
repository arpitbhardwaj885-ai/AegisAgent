# Smart Contract Development Setup

## Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn
- Git

## Installation
1. Navigate to the `contracts/` workspace:
   ```bash
   cd contracts
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
   *(This installs Hardhat, TypeScript, testing tools, and OpenZeppelin contracts).*

## Environment Variables
The development environment relies on a `.env` file located at the **root** of the repository (`../.env`).

Ensure your `.env` file contains the following keys:
```env
MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
DEPLOYER_PRIVATE_KEY=your_private_key_here
```

## Monad Testnet Configuration
The network is pre-configured in `hardhat.config.ts`.
- **Network Name**: `monadTestnet`
- **Chain ID**: 10143
- **RPC URL**: Sourced securely from `MONAD_TESTNET_RPC_URL`.

## Available Commands

Run these commands from inside the `contracts/` directory:

- **Compile Contracts**:
  ```bash
  npm run compile
  ```
- **Run Tests**:
  ```bash
  npm run test
  ```
- **Deploy to Monad Testnet** (Once deployment scripts are ready):
  ```bash
  npx hardhat run scripts/deploy.ts --network monadTestnet
  ```

## Security Rules
- **NEVER** commit the `.env` file. It is already included in `.gitignore`.
- **NEVER** hardcode private keys or RPC URLs in the configuration files or deployment scripts.
- **NEVER** expose the deployer private key in terminal outputs or documentation.
