const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Environment Setup", function () {
  it("Should configure Hardhat and load the network correctly", async function () {
    expect(ethers).to.not.be.undefined;
  });
});
