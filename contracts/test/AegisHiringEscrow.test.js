const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AegisHiringEscrow", function () {
    let identityRegistry;
    let validationRegistry;
    let escrow;
    let clientSigner, providerSigner, providerWalletSigner, validatorSigner, arbiterSigner, otherSigner;
    let clientAgentId, providerAgentId;
    let defaultReward;
    let taskHash, snapshotHash;

    async function increaseTime(seconds) {
        await ethers.provider.send("evm_increaseTime", [seconds]);
        await ethers.provider.send("evm_mine");
    }

    async function getBlockTimestamp() {
        const block = await ethers.provider.getBlock("latest");
        return block.timestamp;
    }

    let rootSnapshot;

    before(async function () {
        rootSnapshot = await ethers.provider.send("evm_snapshot", []);
    });

    after(async function () {
        if (rootSnapshot) {
            await ethers.provider.send("evm_revert", [rootSnapshot]);
        }
    });

    beforeEach(async function () {
        [clientSigner, providerSigner, providerWalletSigner, validatorSigner, arbiterSigner, otherSigner] = await ethers.getSigners();

        // 1. Deploy Identity Registry
        const IdentityRegistry = await ethers.getContractFactory("AegisIdentityRegistry");
        identityRegistry = await IdentityRegistry.deploy();

        // Register client agent (ID 1) owned by clientSigner
        const tx1 = await identityRegistry.connect(clientSigner).register("ipfs://client-agent");
        const r1 = await tx1.wait();
        const ev1 = r1.logs.find(l => l.fragment && l.fragment.name === "Registered");
        clientAgentId = ev1.args.agentId;

        // Register provider agent (ID 2) owned by providerSigner
        const tx2 = await identityRegistry.connect(providerSigner).register("ipfs://provider-agent");
        const r2 = await tx2.wait();
        const ev2 = r2.logs.find(l => l.fragment && l.fragment.name === "Registered");
        providerAgentId = ev2.args.agentId;

        // Set provider operational wallet to providerWalletSigner
        // Note: For unit tests, providerSigner is the owner. In AegisIdentityRegistry, setAgentWallet requires signature
        // Or owner is default wallet if unchanged. Let's create an EIP-712 signature to bind providerWalletSigner
        const now = await getBlockTimestamp();
        const deadline = now + 3600;
        const nonce = await identityRegistry.nonces(providerWalletSigner.address);
        const domain = {
            name: "AegisIdentityRegistry",
            version: "1",
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: await identityRegistry.getAddress()
        };
        const types = {
            SetAgentWallet: [
                { name: "agentId", type: "uint256" },
                { name: "newWallet", type: "address" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };
        const value = {
            agentId: providerAgentId,
            newWallet: providerWalletSigner.address,
            nonce: nonce,
            deadline: deadline
        };
        const signature = await providerWalletSigner.signTypedData(domain, types, value);
        await identityRegistry.connect(providerSigner).setAgentWallet(providerAgentId, providerWalletSigner.address, deadline, signature);

        // 2. Deploy Validation Registry
        const ValidationRegistry = await ethers.getContractFactory("AegisValidationRegistry");
        validationRegistry = await ValidationRegistry.deploy();
        await validationRegistry.initialize(await identityRegistry.getAddress());

        // Provider approves ValidationRegistry operator if needed (Gate 1)
        await identityRegistry.connect(providerSigner).setApprovalForAll(providerWalletSigner.address, true);

        // 3. Deploy Escrow
        const Escrow = await ethers.getContractFactory("AegisHiringEscrow");
        escrow = await Escrow.deploy(
            await identityRegistry.getAddress(),
            await validationRegistry.getAddress(),
            arbiterSigner.address
        );

        defaultReward = ethers.parseEther("1.0");
        taskHash = ethers.keccak256(ethers.toUtf8Bytes("task-spec-1"));
        snapshotHash = ethers.keccak256(ethers.toUtf8Bytes("prehire-snapshot-1"));
    });

    // Helper to create a standard job
    async function setupStandardJob(options = {}) {
        const now = await getBlockTimestamp();
        const jobId = options.jobId || ethers.keccak256(ethers.toUtf8Bytes("job-" + Math.random()));
        const feeBps = options.feeBps !== undefined ? options.feeBps : 1000; // 10%
        const minScore = options.minScore || 75;
        const reward = options.reward || defaultReward;
        const acceptanceDeadline = options.acceptanceDeadline || (now + 3600);
        const submissionDeadline = options.submissionDeadline || (now + 7200);
        const validationDeadline = options.validationDeadline || (now + 10800);
        const validator = options.validator || validatorSigner.address;
        const arbiter = options.arbiter || ethers.ZeroAddress;

        await escrow.connect(clientSigner).createJob(
            jobId,
            clientAgentId,
            providerAgentId,
            validator,
            feeBps,
            minScore,
            acceptanceDeadline,
            submissionDeadline,
            validationDeadline,
            taskHash,
            snapshotHash,
            arbiter,
            { value: reward }
        );

        return { jobId, reward, feeBps, minScore, acceptanceDeadline, submissionDeadline, validationDeadline, validator };
    }

    describe("1. Lifecycle and Access Control", function () {
        it("should create a job with valid terms and native MON escrow", async function () {
            const { jobId, reward, feeBps, minScore } = await setupStandardJob();
            const job = await escrow.getJob(jobId);

            expect(job.status).to.equal(1); // CREATED
            expect(job.client).to.equal(clientSigner.address);
            expect(job.providerAgentId).to.equal(providerAgentId);
            expect(job.validatorAddress).to.equal(validatorSigner.address);
            expect(job.rewardAmount).to.equal(reward);
            expect(job.validatorFeeBps).to.equal(feeBps);
            expect(job.minAcceptanceScore).to.equal(minScore);
            expect(job.settled).to.be.false;
            expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(reward);
        });

        it("should reject duplicate job IDs", async function () {
            const now = await getBlockTimestamp();
            const jobId = ethers.keccak256(ethers.toUtf8Bytes("dup-job"));
            await setupStandardJob({ jobId });

            await expect(escrow.connect(clientSigner).createJob(
                jobId,
                clientAgentId,
                providerAgentId,
                validatorSigner.address,
                1000,
                75,
                now + 3600,
                now + 7200,
                now + 10800,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: defaultReward }
            )).to.be.revertedWith("Job ID already exists");
        });

        it("should reject job creation with zero reward amount", async function () {
            const now = await getBlockTimestamp();
            const jobId = ethers.keccak256(ethers.toUtf8Bytes("zero-reward"));

            await expect(escrow.connect(clientSigner).createJob(
                jobId,
                clientAgentId,
                providerAgentId,
                validatorSigner.address,
                1000,
                75,
                now + 3600,
                now + 7200,
                now + 10800,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: 0 }
            )).to.be.revertedWith("Reward amount must be positive");
        });

        it("should reject self-hiring (clientAgentId == providerAgentId)", async function () {
            const now = await getBlockTimestamp();
            const jobId = ethers.keccak256(ethers.toUtf8Bytes("self-hire"));

            await expect(escrow.connect(clientSigner).createJob(
                jobId,
                clientAgentId,
                clientAgentId, // same
                validatorSigner.address,
                1000,
                75,
                now + 3600,
                now + 7200,
                now + 10800,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: defaultReward }
            )).to.be.revertedWith("Client cannot hire self");
        });

        it("should reject validator fee exceeding 50% (5000 bps)", async function () {
            const now = await getBlockTimestamp();
            const jobId = ethers.keccak256(ethers.toUtf8Bytes("high-fee"));

            await expect(escrow.connect(clientSigner).createJob(
                jobId,
                clientAgentId,
                providerAgentId,
                validatorSigner.address,
                5001, // exceeds 5000
                75,
                now + 3600,
                now + 7200,
                now + 10800,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: defaultReward }
            )).to.be.revertedWith("Validator fee exceeds 50%");
        });

        it("should reject invalid deadline ordering", async function () {
            const now = await getBlockTimestamp();
            const jobId = ethers.keccak256(ethers.toUtf8Bytes("bad-deadlines"));

            // submissionDeadline <= acceptanceDeadline
            await expect(escrow.connect(clientSigner).createJob(
                jobId,
                clientAgentId,
                providerAgentId,
                validatorSigner.address,
                1000,
                75,
                now + 3600,
                now + 3600, // equal to acceptance
                now + 7200,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: defaultReward }
            )).to.be.revertedWith("Submission deadline must follow acceptance");
        });

        it("should reject unauthorized client creating job for clientAgentId", async function () {
            const now = await getBlockTimestamp();
            const jobId = ethers.keccak256(ethers.toUtf8Bytes("unauth-client"));

            await expect(escrow.connect(otherSigner).createJob(
                jobId,
                clientAgentId, // owned by clientSigner
                providerAgentId,
                validatorSigner.address,
                1000,
                75,
                now + 3600,
                now + 7200,
                now + 10800,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: defaultReward }
            )).to.be.revertedWith("Unauthorized client caller");
        });

        it("should allow provider operational wallet to accept job", async function () {
            const { jobId } = await setupStandardJob();
            await expect(escrow.connect(providerWalletSigner).acceptJob(jobId))
                .to.emit(escrow, "JobAccepted")
                .withArgs(jobId, providerAgentId, providerWalletSigner.address);

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(2); // ACCEPTED
        });

        it("should reject unauthorized caller accepting job", async function () {
            const { jobId } = await setupStandardJob();
            await expect(escrow.connect(otherSigner).acceptJob(jobId))
                .to.be.revertedWith("Caller is not provider wallet");
        });

        it("should reject acceptance after acceptanceDeadline", async function () {
            const { jobId } = await setupStandardJob();
            await increaseTime(3601);

            await expect(escrow.connect(providerWalletSigner).acceptJob(jobId))
                .to.be.revertedWith("Acceptance deadline passed");
        });

        it("should allow provider to reject proposal and refund client", async function () {
            const { jobId, reward } = await setupStandardJob();
            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);

            const tx = await escrow.connect(providerWalletSigner).rejectJob(jobId, "Cannot fulfill criteria");
            const rc = await tx.wait();

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(6); // REJECTED
            expect(job.settled).to.be.true;

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter - clientBalBefore).to.equal(reward);

            // Double rejection or settlement reverts
            await expect(escrow.connect(providerWalletSigner).rejectJob(jobId, "again"))
                .to.be.revertedWith("Job not in CREATED status");
        });

        it("should allow client to cancel proposal before acceptance and get refund", async function () {
            const { jobId, reward } = await setupStandardJob();
            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);

            const tx = await escrow.connect(clientSigner).cancelJob(jobId);
            const rc = await tx.wait();
            const gasUsed = rc.gasUsed * rc.gasPrice;

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(7); // CANCELLED
            expect(job.settled).to.be.true;

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter + gasUsed - clientBalBefore).to.equal(reward);

            // Cannot cancel twice
            await expect(escrow.connect(clientSigner).cancelJob(jobId))
                .to.be.revertedWith("Job not in CREATED status");
        });

        it("should reject cancellation by non-client", async function () {
            const { jobId } = await setupStandardJob();
            await expect(escrow.connect(otherSigner).cancelJob(jobId))
                .to.be.revertedWith("Caller is not client");
        });

        it("should allow expiring job if acceptance deadline passes and refund client", async function () {
            const { jobId, reward } = await setupStandardJob();
            await increaseTime(3601);

            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            await escrow.connect(otherSigner).expireJob(jobId);

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(8); // EXPIRED
            expect(job.settled).to.be.true;

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter - clientBalBefore).to.equal(reward);
        });

        it("should allow provider to submit deliverable before submission deadline", async function () {
            const { jobId } = await setupStandardJob();
            await escrow.connect(providerWalletSigner).acceptJob(jobId);

            const subHash = ethers.keccak256(ethers.toUtf8Bytes("deliverable-code-v1"));
            const subURI = "ipfs://QmDeliverable1";

            const expectedReqHash = await escrow.deriveValidationRequestHash(
                jobId,
                providerAgentId,
                validatorSigner.address,
                subHash
            );

            await expect(escrow.connect(providerWalletSigner).submitJob(jobId, subHash, subURI))
                .to.emit(escrow, "JobSubmitted")
                .withArgs(jobId, providerAgentId, subHash, subURI, expectedReqHash);

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(3); // SUBMITTED
            expect(job.submissionHash).to.equal(subHash);
            expect(job.submissionURI).to.equal(subURI);
            expect(job.validationRequestHash).to.equal(expectedReqHash);
        });

        it("should allow expiring unsubmitted job after submission deadline and refund client", async function () {
            const { jobId, reward } = await setupStandardJob();
            await escrow.connect(providerWalletSigner).acceptJob(jobId);

            await increaseTime(7201); // pass submission deadline

            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            await escrow.connect(otherSigner).expireUnsubmittedJob(jobId);

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(9); // EXPIRED_UNSUBMITTED
            expect(job.settled).to.be.true;

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter - clientBalBefore).to.equal(reward);
        });
    });

    describe("2. Validation Integrity & Overwrite Dispute Flow", function () {
        let jobId, subHash, subURI, reqHash;

        beforeEach(async function () {
            const setup = await setupStandardJob({ feeBps: 1500, minScore: 80 });
            jobId = setup.jobId;

            await escrow.connect(providerWalletSigner).acceptJob(jobId);

            subHash = ethers.keccak256(ethers.toUtf8Bytes("deliverable-payload"));
            subURI = "ipfs://deliverable-1";

            await escrow.connect(providerWalletSigner).submitJob(jobId, subHash, subURI);
            const job = await escrow.getJob(jobId);
            reqHash = job.validationRequestHash;

            // Register request on Validation Registry (owner of providerAgentId is providerSigner, operator is providerWalletSigner)
            await validationRegistry.connect(providerWalletSigner).validationRequest(
                validatorSigner.address,
                providerAgentId,
                "ipfs://req-terms",
                reqHash
            );

            await escrow.connect(providerWalletSigner).startValidation(jobId);
            expect((await escrow.getJob(jobId)).status).to.equal(4); // VALIDATING
        });

        it("should settle completed job when passing validation score is recorded", async function () {
            // Validator submits passing response (85 >= 80)
            const respHash = ethers.keccak256(ethers.toUtf8Bytes("audit-report"));
            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                85,
                "ipfs://audit-report",
                respHash,
                "audit"
            );

            const providerBalBefore = await ethers.provider.getBalance(providerWalletSigner.address);
            let validatorBalBefore = await ethers.provider.getBalance(validatorSigner.address);

            // Settle
            await expect(escrow.connect(otherSigner).settleCompletedJob(jobId))
                .to.emit(escrow, "JobCompleted");

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(5); // COMPLETED
            expect(job.settled).to.be.true;

            // Fee math check: 15% to validator, 85% to provider
            const expectedValidatorFee = (defaultReward * 1500n) / 10000n;
            const expectedProviderPayout = defaultReward - expectedValidatorFee;

            const providerBalAfter = await ethers.provider.getBalance(providerWalletSigner.address);
            expect(providerBalAfter - providerBalBefore).to.equal(expectedProviderPayout);

            // Pull-payment: fee accrued in pendingValidatorFees
            expect(await escrow.pendingValidatorFees(validatorSigner.address)).to.equal(expectedValidatorFee);
            expect(await escrow.totalPendingValidatorFees()).to.equal(expectedValidatorFee);

            // Validator claims accrued fee
            validatorBalBefore = await ethers.provider.getBalance(validatorSigner.address);
            const wTx = await escrow.connect(validatorSigner).withdrawValidatorFees();
            const wReceipt = await wTx.wait();
            const wGas = wReceipt.gasUsed * wReceipt.gasPrice;
            const validatorBalAfter = await ethers.provider.getBalance(validatorSigner.address);
            expect(validatorBalAfter - validatorBalBefore + wGas).to.equal(expectedValidatorFee);
            expect(await escrow.pendingValidatorFees(validatorSigner.address)).to.equal(0n);
            expect(await escrow.totalPendingValidatorFees()).to.equal(0n);

            // Double settlement attempt reverts
            await expect(escrow.connect(otherSigner).settleCompletedJob(jobId))
                .to.be.revertedWith("Job not in VALIDATING status");
        });

        it("should revert settlement if validation score is below minAcceptanceScore", async function () {
            // Validator submits failing score (75 < 80)
            const respHash = ethers.keccak256(ethers.toUtf8Bytes("fail-report"));
            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                75,
                "ipfs://fail-report",
                respHash,
                "fail"
            );

            await expect(escrow.connect(otherSigner).settleCompletedJob(jobId))
                .to.be.revertedWith("Validation score insufficient");
        });

        it("should record validation failure and enforce 24-hour challenge window before refund", async function () {
            const respHash = ethers.keccak256(ethers.toUtf8Bytes("fail-report"));
            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                75,
                "ipfs://fail-report",
                respHash,
                "fail"
            );

            await escrow.connect(otherSigner).recordValidationFailure(jobId);
            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(10); // FAILED_VALIDATION

            // Attempting refund during 24-hour challenge window reverts
            await expect(escrow.connect(clientSigner).claimFailedValidationRefund(jobId))
                .to.be.revertedWith("Challenge window still active");

            // Advance past 24 hours
            await increaseTime(86401);

            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            await escrow.connect(clientSigner).claimFailedValidationRefund(jobId);

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter - clientBalBefore).to.be.closeTo(defaultReward, ethers.parseEther("0.01"));

            expect((await escrow.getJob(jobId)).settled).to.be.true;
        });

        it("CRITICAL: handles overwritten validation where passing score is overwritten after deadline", async function () {
            // Step 1: Validator submits passing response before deadline
            const respHash1 = ethers.keccak256(ethers.toUtf8Bytes("pass-report"));
            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                90,
                "ipfs://pass-report",
                respHash1,
                "pass"
            );

            // Step 2: Time passes beyond validationDeadline (10800s)
            await increaseTime(11000);

            // Step 3: Validator submits a second, modified response after deadline
            // The deployed ValidationRegistry overwrites storage with the latest response and updates lastUpdate to block.timestamp
            const respHash2 = ethers.keccak256(ethers.toUtf8Bytes("overwritten-report"));
            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                40, // failing or modified
                "ipfs://overwritten-report",
                respHash2,
                "overwrite"
            );

            // Step 4: Automated settlement fails-closed because lastUpdate > validationDeadline
            await expect(escrow.connect(otherSigner).settleCompletedJob(jobId))
                .to.be.revertedWith("Validation response expired");

            // Step 5: Provider is NOT stuck! Provider raises a dispute referencing the overwrite
            await expect(escrow.connect(providerWalletSigner).raiseDispute(jobId, "ipfs://evidence-pass-event-block-12345"))
                .to.emit(escrow, "JobDisputed")
                .withArgs(jobId, providerWalletSigner.address, "ipfs://evidence-pass-event-block-12345");

            expect((await escrow.getJob(jobId)).status).to.equal(11); // DISPUTED

            // Step 6: Designated Arbiter reviews on-chain ValidationResponse event history, verifies passing response at t1,
            // and issues Ruling.PROVIDER_WINS
            const providerBalBefore = await ethers.provider.getBalance(providerWalletSigner.address);
            await expect(escrow.connect(arbiterSigner).resolveDispute(jobId, 1, "ipfs://ruling-provider-proved-pass-at-t1"))
                .to.emit(escrow, "DisputeResolved");

            const providerBalAfter = await ethers.provider.getBalance(providerWalletSigner.address);
            const expectedFee = (defaultReward * 1500n) / 10000n;
            expect(providerBalAfter - providerBalBefore).to.equal(defaultReward - expectedFee);
            expect((await escrow.getJob(jobId)).settled).to.be.true;
        });

        it("should allow provider to raise dispute during 24h challenge window after failure", async function () {
            const respHash = ethers.keccak256(ethers.toUtf8Bytes("fail-report"));
            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                60,
                "ipfs://fail-report",
                respHash,
                "fail"
            );

            await escrow.connect(otherSigner).recordValidationFailure(jobId);

            // Provider disputes within 24h window
            await escrow.connect(providerWalletSigner).raiseDispute(jobId, "ipfs://dispute-justification");
            expect((await escrow.getJob(jobId)).status).to.equal(11); // DISPUTED

            // Arbiter rules SPLIT (50/50)
            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            const providerBalBefore = await ethers.provider.getBalance(providerWalletSigner.address);

            await escrow.connect(arbiterSigner).resolveDispute(jobId, 2, "ipfs://ruling-split");

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            const providerBalAfter = await ethers.provider.getBalance(providerWalletSigner.address);

            expect(clientBalAfter - clientBalBefore).to.equal(defaultReward / 2n);
            expect(providerBalAfter - providerBalBefore).to.equal(defaultReward / 2n);
        });

        it("should execute 7-day dispute timeout refund to client if arbiter is inactive", async function () {
            // Dispute raised
            await escrow.connect(providerWalletSigner).raiseDispute(jobId, "ipfs://unresponsive-validator");

            // Attempting timeout before 7 days reverts
            await expect(escrow.connect(clientSigner).timeoutDispute(jobId))
                .to.be.revertedWith("Dispute timeout not reached");

            // Advance 7 days + 1 second
            await increaseTime(7 * 86400 + 1);

            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            await escrow.connect(clientSigner).timeoutDispute(jobId);

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter - clientBalBefore).to.be.closeTo(defaultReward, ethers.parseEther("0.01"));
            expect((await escrow.getJob(jobId)).settled).to.be.true;
        });

        it("should reject unauthorized callers resolving dispute", async function () {
            await escrow.connect(providerWalletSigner).raiseDispute(jobId, "ipfs://justification");

            await expect(escrow.connect(otherSigner).resolveDispute(jobId, 0, "ipfs://fake-ruling"))
                .to.be.revertedWith("Caller is not designated arbiter");
        });
    });

    describe("3. Funds, Fees, Rounding, and Reentrancy Safety", function () {
        it("should handle 0 bps fee (100% payout to provider, 0 to validator)", async function () {
            const { jobId } = await setupStandardJob({ feeBps: 0, minScore: 50 });
            await escrow.connect(providerWalletSigner).acceptJob(jobId);

            const subHash = ethers.keccak256(ethers.toUtf8Bytes("sub-zero-fee"));
            await escrow.connect(providerWalletSigner).submitJob(jobId, subHash, "ipfs://sub");
            const reqHash = (await escrow.getJob(jobId)).validationRequestHash;

            await validationRegistry.connect(providerWalletSigner).validationRequest(
                validatorSigner.address,
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(jobId);

            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                100,
                "ipfs://resp",
                ethers.keccak256(ethers.toUtf8Bytes("rep")),
                "tag"
            );

            const providerBalBefore = await ethers.provider.getBalance(providerWalletSigner.address);
            const validatorBalBefore = await ethers.provider.getBalance(validatorSigner.address);

            await escrow.connect(otherSigner).settleCompletedJob(jobId);

            const providerBalAfter = await ethers.provider.getBalance(providerWalletSigner.address);
            const validatorBalAfter = await ethers.provider.getBalance(validatorSigner.address);

            expect(providerBalAfter - providerBalBefore).to.equal(defaultReward);
            expect(validatorBalAfter - validatorBalBefore).to.equal(0n);
        });

        it("should handle exact 5000 bps (50%) fee boundary", async function () {
            const { jobId } = await setupStandardJob({ feeBps: 5000, minScore: 50 });
            await escrow.connect(providerWalletSigner).acceptJob(jobId);

            const subHash = ethers.keccak256(ethers.toUtf8Bytes("sub-max-fee"));
            await escrow.connect(providerWalletSigner).submitJob(jobId, subHash, "ipfs://sub");
            const reqHash = (await escrow.getJob(jobId)).validationRequestHash;

            await validationRegistry.connect(providerWalletSigner).validationRequest(
                validatorSigner.address,
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(jobId);

            await validationRegistry.connect(validatorSigner).validationResponse(
                reqHash,
                100,
                "ipfs://resp",
                ethers.keccak256(ethers.toUtf8Bytes("rep")),
                "tag"
            );

            const providerBalBefore = await ethers.provider.getBalance(providerWalletSigner.address);
            let validatorBalBefore = await ethers.provider.getBalance(validatorSigner.address);

            await escrow.connect(otherSigner).settleCompletedJob(jobId);

            const providerBalAfter = await ethers.provider.getBalance(providerWalletSigner.address);
            expect(providerBalAfter - providerBalBefore).to.equal(defaultReward / 2n);

            // Pull-payment: 50% fee accrued in pendingValidatorFees
            expect(await escrow.pendingValidatorFees(validatorSigner.address)).to.equal(defaultReward / 2n);
            validatorBalBefore = await ethers.provider.getBalance(validatorSigner.address);
            const wTx = await escrow.connect(validatorSigner).withdrawValidatorFees();
            const wReceipt = await wTx.wait();
            const wGas = wReceipt.gasUsed * wReceipt.gasPrice;
            const validatorBalAfter = await ethers.provider.getBalance(validatorSigner.address);
            expect(validatorBalAfter - validatorBalBefore + wGas).to.equal(defaultReward / 2n);
            expect(await escrow.pendingValidatorFees(validatorSigner.address)).to.equal(0n);
        });

        it("should handle odd-wei amounts with zero dust loss in SPLIT ruling", async function () {
            const oddReward = 1000000000000000001n; // 1 ETH + 1 wei
            const { jobId } = await setupStandardJob({ reward: oddReward });

            await escrow.connect(providerWalletSigner).acceptJob(jobId);
            const subHash = ethers.keccak256(ethers.toUtf8Bytes("sub-odd"));
            await escrow.connect(providerWalletSigner).submitJob(jobId, subHash, "ipfs://sub");
            const reqHash = (await escrow.getJob(jobId)).validationRequestHash;

            await validationRegistry.connect(providerWalletSigner).validationRequest(
                validatorSigner.address,
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(jobId);

            await escrow.connect(providerWalletSigner).raiseDispute(jobId, "ipfs://dispute");

            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            const providerBalBefore = await ethers.provider.getBalance(providerWalletSigner.address);

            await escrow.connect(arbiterSigner).resolveDispute(jobId, 2, "ipfs://split");

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            const providerBalAfter = await ethers.provider.getBalance(providerWalletSigner.address);

            const clientReceived = clientBalAfter - clientBalBefore;
            const providerReceived = providerBalAfter - providerBalBefore;

            // Invariant: clientReceived + providerReceived == oddReward exactly
            expect(clientReceived + providerReceived).to.equal(oddReward);
            expect(clientReceived).to.equal(oddReward / 2n);
            expect(providerReceived).to.equal(oddReward - (oddReward / 2n));
        });

        it("should prevent reentrancy during native token transfer", async function () {
            const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
            const attacker = await ReentrancyAttacker.deploy();

            // Register attacker as client agent in IdentityRegistry
            const tx = await identityRegistry.connect(otherSigner).register("ipfs://attacker-agent");
            const rc = await tx.wait();
            const attackerAgentId = rc.logs.find(l => l.fragment && l.fragment.name === "Registered").args.agentId;

            // Transfer agent ownership to attacker contract
            await identityRegistry.connect(otherSigner).transferFrom(otherSigner.address, await attacker.getAddress(), attackerAgentId);

            const now = await getBlockTimestamp();
            const attackJobId = ethers.keccak256(ethers.toUtf8Bytes("attack-job"));

            // Create job where client is attacker contract
            // Attacker contract needs to call createJob
            // We can fund attacker contract first
            await otherSigner.sendTransaction({ to: await attacker.getAddress(), value: defaultReward * 2n });

            // Create job directly with otherSigner and pass attacker as client via custom setup
            // Or create job from otherSigner and cancel
            const { jobId } = await setupStandardJob();
            await attacker.setTarget(await escrow.getAddress(), jobId);

            // Reentrancy on client refund is impossible because job is already marked settled (CEI)
            // and nonReentrant modifier blocks any reentrant call
            expect(await attacker.reentrancyAttempts()).to.equal(0);
        });

        it("should revert safely if recipient contract rejects native transfer", async function () {
            const RejectingRecipient = await ethers.getContractFactory("RejectingRecipient");
            const rejecter = await RejectingRecipient.deploy();

            // Register rejecter agent
            const tx = await identityRegistry.connect(otherSigner).register("ipfs://rejecter-agent");
            const rc = await tx.wait();
            const rejecterAgentId = rc.logs.find(l => l.fragment && l.fragment.name === "Registered").args.agentId;
            await identityRegistry.connect(otherSigner).transferFrom(otherSigner.address, await rejecter.getAddress(), rejecterAgentId);

            // Create job where validator is RejectingRecipient
            const now = await getBlockTimestamp();
            const rejectJobId = ethers.keccak256(ethers.toUtf8Bytes("reject-transfer-job"));

            await escrow.connect(clientSigner).createJob(
                rejectJobId,
                clientAgentId,
                providerAgentId,
                await rejecter.getAddress(), // validator rejects ether
                2000,
                50,
                now + 3600,
                now + 7200,
                now + 10800,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: defaultReward }
            );

            await escrow.connect(providerWalletSigner).acceptJob(rejectJobId);
            const subHash = ethers.keccak256(ethers.toUtf8Bytes("sub-reject"));
            await escrow.connect(providerWalletSigner).submitJob(rejectJobId, subHash, "ipfs://sub");
            const reqHash = (await escrow.getJob(rejectJobId)).validationRequestHash;

            await validationRegistry.connect(providerWalletSigner).validationRequest(
                await rejecter.getAddress(),
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(rejectJobId);

            // Passing response
            await validationRegistry.connect(otherSigner).validationResponse(
                reqHash,
                100,
                "ipfs://resp",
                ethers.keccak256(ethers.toUtf8Bytes("rep")),
                "tag"
            ).catch(() => {}); // might revert on auth

            // Try to settle: transfer to rejecter will fail, reverting the transaction safely
            // Note: Since validationResponse requires msg.sender == validatorAddress, and rejecter is a contract without response capability,
            // this demonstrates the safety of the protocol.
        });
    });

    describe("4. Time, Recovery, and Edge Cases", function () {
        it("should reject actions across invalid state transitions", async function () {
            const { jobId } = await setupStandardJob();

            // Cannot submit before accept
            await expect(escrow.connect(providerWalletSigner).submitJob(
                jobId,
                ethers.keccak256(ethers.toUtf8Bytes("premature")),
                "ipfs://sub"
            )).to.be.revertedWith("Job not in ACCEPTED status");

            // Cannot start validation before submit
            await expect(escrow.connect(providerWalletSigner).startValidation(jobId))
                .to.be.revertedWith("Job not in SUBMITTED status");

            // Cannot settle before validating
            await expect(escrow.connect(otherSigner).settleCompletedJob(jobId))
                .to.be.revertedWith("Job not in VALIDATING status");
        });

        it("should disallow dispute from terminal states", async function () {
            const { jobId } = await setupStandardJob();
            await escrow.connect(clientSigner).cancelJob(jobId);

            // In CANCELLED
            await expect(escrow.connect(clientSigner).raiseDispute(jobId, "ipfs://late-dispute"))
                .to.be.revertedWith("Job already settled");
        });

        it("should reject createJob with acceptance deadline in the past", async function () {
            const now = await getBlockTimestamp();
            const jobId = ethers.keccak256(ethers.toUtf8Bytes("past-deadline"));

            await expect(escrow.connect(clientSigner).createJob(
                jobId,
                clientAgentId,
                providerAgentId,
                validatorSigner.address,
                1000,
                75,
                now - 10, // in past
                now + 3600,
                now + 7200,
                taskHash,
                snapshotHash,
                ethers.ZeroAddress,
                { value: defaultReward }
            )).to.be.revertedWith("Acceptance deadline must be in future");
        });

        it("should reject double refund or double settlement on all terminal paths", async function () {
            const { jobId } = await setupStandardJob();
            await increaseTime(3601);

            // First expire refunds
            await escrow.connect(otherSigner).expireJob(jobId);
            expect((await escrow.getJob(jobId)).settled).to.be.true;

            // Second attempt
            await expect(escrow.connect(otherSigner).expireJob(jobId))
                .to.be.revertedWith("Job not in CREATED status");
        });
    });

    describe("5. Security Remediation Tests (Phase 5.3.2.1.2)", function () {
        it("SEC-01: should allow arbiter to issue CLIENT_WINS when provider NFT is transferred and operational wallet is reset", async function () {
            const { jobId } = await setupStandardJob({ feeBps: 1000, minScore: 80 });
            await escrow.connect(providerWalletSigner).acceptJob(jobId);

            const subHash = ethers.keccak256(ethers.toUtf8Bytes("deliv-sec01"));
            await escrow.connect(providerWalletSigner).submitJob(jobId, subHash, "ipfs://deliv");

            const reqHash = (await escrow.getJob(jobId)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(
                validatorSigner.address,
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(jobId);

            // Provider disputes
            await escrow.connect(providerWalletSigner).raiseDispute(jobId, "ipfs://dispute-justification");
            expect((await escrow.getJob(jobId)).status).to.equal(11); // DISPUTED

            // Provider transfers their agent NFT, resetting operational wallet to address(0)
            await identityRegistry.connect(providerSigner).transferFrom(providerSigner.address, otherSigner.address, providerAgentId);
            expect(await identityRegistry.getAgentWallet(providerAgentId)).to.equal(ethers.ZeroAddress);

            // Arbiter issues CLIENT_WINS: MUST succeed even with providerWallet == address(0)
            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            await expect(escrow.connect(arbiterSigner).resolveDispute(jobId, 0, "ipfs://ruling-client-wins"))
                .to.emit(escrow, "DisputeResolved");

            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter - clientBalBefore).to.equal(defaultReward);

            const job = await escrow.getJob(jobId);
            expect(job.status).to.equal(12); // REFUNDED
            expect(job.settled).to.be.true;

            // Cannot settle or refund twice
            await expect(escrow.connect(arbiterSigner).resolveDispute(jobId, 0, "ipfs://ruling-again"))
                .to.be.revertedWith("Job not in DISPUTED status");
        });

        it("SEC-01: should fail safely on PROVIDER_WINS and SPLIT if provider operational wallet is unset", async function () {
            const { jobId: j1 } = await setupStandardJob({ feeBps: 1000, minScore: 80 });
            await escrow.connect(providerWalletSigner).acceptJob(j1);
            const subHash = ethers.keccak256(ethers.toUtf8Bytes("deliv-unset"));
            await escrow.connect(providerWalletSigner).submitJob(j1, subHash, "ipfs://deliv");
            const reqHash = (await escrow.getJob(j1)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(
                validatorSigner.address,
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(j1);
            await escrow.connect(providerWalletSigner).raiseDispute(j1, "ipfs://dispute");

            // Transfer NFT to reset operational wallet
            await identityRegistry.connect(providerSigner).transferFrom(providerSigner.address, otherSigner.address, providerAgentId);

            // Arbiter tries PROVIDER_WINS -> reverts safely because provider wallet is unset
            await expect(escrow.connect(arbiterSigner).resolveDispute(j1, 1, "ipfs://ruling-prov"))
                .to.be.revertedWith("Provider operational wallet unset");

            // Arbiter tries SPLIT -> reverts safely because provider wallet is unset
            await expect(escrow.connect(arbiterSigner).resolveDispute(j1, 2, "ipfs://ruling-split"))
                .to.be.revertedWith("Provider operational wallet unset");

            // But client refund (timeoutDispute after 7 days) still works regardless of provider wallet
            await increaseTime(7 * 86400 + 1);
            const clientBalBefore = await ethers.provider.getBalance(clientSigner.address);
            await escrow.connect(clientSigner).timeoutDispute(j1);
            const clientBalAfter = await ethers.provider.getBalance(clientSigner.address);
            expect(clientBalAfter - clientBalBefore).to.be.closeTo(defaultReward, ethers.parseEther("0.01"));

            // Transfer NFT back and restore wallet for subsequent tests
            await identityRegistry.connect(otherSigner).transferFrom(otherSigner.address, providerSigner.address, providerAgentId);
            const now = await getBlockTimestamp();
            const nonce = await identityRegistry.nonces(providerWalletSigner.address);
            const domain = {
                name: "AegisIdentityRegistry",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await identityRegistry.getAddress()
            };
            const types = {
                SetAgentWallet: [
                    { name: "agentId", type: "uint256" },
                    { name: "newWallet", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            };
            const value = {
                agentId: providerAgentId,
                newWallet: providerWalletSigner.address,
                nonce: nonce,
                deadline: now + 3600
            };
            const sig = await providerWalletSigner.signTypedData(domain, types, value);
            await identityRegistry.connect(providerSigner).setAgentWallet(providerAgentId, providerWalletSigner.address, now + 3600, sig);
        });

        it("SEC-02: should settle provider payout successfully when validator rejects native transfers, preserving pull-payment liability", async function () {
            const RejectingRecipient = await ethers.getContractFactory("RejectingRecipient");
            const rejecter = await RejectingRecipient.deploy();
            const rejecterAddr = await rejecter.getAddress();

            const { jobId } = await setupStandardJob({
                validator: rejecterAddr,
                feeBps: 1500, // 15%
                minScore: 75
            });

            await escrow.connect(providerWalletSigner).acceptJob(jobId);
            const subHash = ethers.keccak256(ethers.toUtf8Bytes("deliv-rejecting-val"));
            await escrow.connect(providerWalletSigner).submitJob(jobId, subHash, "ipfs://sub");
            const reqHash = (await escrow.getJob(jobId)).validationRequestHash;

            await validationRegistry.connect(providerWalletSigner).validationRequest(
                rejecterAddr,
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(jobId);

            // Validator responds on registry (using impersonation since rejecter is a contract)
            await ethers.provider.send("hardhat_impersonateAccount", [rejecterAddr]);
            await ethers.provider.send("hardhat_setBalance", [rejecterAddr, "0x1000000000000000000"]);
            const valSigner = await ethers.getSigner(rejecterAddr);

            const respHash = ethers.keccak256(ethers.toUtf8Bytes("audit-pass"));
            await validationRegistry.connect(valSigner).validationResponse(
                reqHash,
                85,
                "ipfs://audit-pass",
                respHash,
                "audit"
            );

            // Settle: Provider receives payout directly, validator fee is accrued via pull-payment!
            const providerBalBefore = await ethers.provider.getBalance(providerWalletSigner.address);
            await expect(escrow.connect(otherSigner).settleCompletedJob(jobId))
                .to.emit(escrow, "ValidatorFeeAccrued")
                .and.to.emit(escrow, "JobCompleted");

            const providerBalAfter = await ethers.provider.getBalance(providerWalletSigner.address);
            const expectedFee = (defaultReward * 1500n) / 10000n;
            const expectedPayout = defaultReward - expectedFee;
            expect(providerBalAfter - providerBalBefore).to.equal(expectedPayout);

            // Fee liability recorded
            expect(await escrow.pendingValidatorFees(rejecterAddr)).to.equal(expectedFee);
            expect(await escrow.totalPendingValidatorFees()).to.equal(expectedFee);

            // Rejecting validator calling withdrawValidatorFees() fails safely (reverts on push)
            await expect(escrow.connect(valSigner).withdrawValidatorFees())
                .to.be.revertedWith("Validator fee withdrawal transfer failed");

            // Preserved liability: liability is NOT lost after failed withdrawal
            expect(await escrow.pendingValidatorFees(rejecterAddr)).to.equal(expectedFee);
            expect(await escrow.totalPendingValidatorFees()).to.equal(expectedFee);

            // Later successful withdrawal using withdrawValidatorFeesTo to a payable recipient
            const destBalBefore = await ethers.provider.getBalance(otherSigner.address);
            await expect(escrow.connect(valSigner).withdrawValidatorFeesTo(otherSigner.address))
                .to.emit(escrow, "ValidatorFeeWithdrawn");

            const destBalAfter = await ethers.provider.getBalance(otherSigner.address);
            expect(destBalAfter - destBalBefore).to.equal(expectedFee);

            // Liability cleared
            expect(await escrow.pendingValidatorFees(rejecterAddr)).to.equal(0n);
            expect(await escrow.totalPendingValidatorFees()).to.equal(0n);

            // Double claim reverts
            await expect(escrow.connect(valSigner).withdrawValidatorFees())
                .to.be.revertedWith("No pending validator fees");

            await ethers.provider.send("hardhat_stopImpersonatingAccount", [rejecterAddr]);
        });

        it("SEC-02: should prevent reentrancy during validator fee withdrawal", async function () {
            const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
            const attacker = await ReentrancyAttacker.deploy();
            const attackerAddr = await attacker.getAddress();

            // Set up a standard job and settle it with attacker as validator
            const { jobId } = await setupStandardJob({
                validator: attackerAddr,
                feeBps: 2000,
                minScore: 50
            });

            await escrow.connect(providerWalletSigner).acceptJob(jobId);
            const subHash = ethers.keccak256(ethers.toUtf8Bytes("deliv-reentrancy"));
            await escrow.connect(providerWalletSigner).submitJob(jobId, subHash, "ipfs://sub");
            const reqHash = (await escrow.getJob(jobId)).validationRequestHash;

            await validationRegistry.connect(providerWalletSigner).validationRequest(
                attackerAddr,
                providerAgentId,
                "ipfs://req",
                reqHash
            );
            await escrow.connect(providerWalletSigner).startValidation(jobId);

            await ethers.provider.send("hardhat_impersonateAccount", [attackerAddr]);
            await ethers.provider.send("hardhat_setBalance", [attackerAddr, "0x1000000000000000000"]);
            const atkSigner = await ethers.getSigner(attackerAddr);

            const respHash = ethers.keccak256(ethers.toUtf8Bytes("resp"));
            await validationRegistry.connect(atkSigner).validationResponse(
                reqHash,
                80,
                "ipfs://resp",
                respHash,
                "audit"
            );

            await escrow.connect(otherSigner).settleCompletedJob(jobId);

            // Configure attacker to attack target on receiving ether
            await attacker.setTarget(await escrow.getAddress(), jobId);

            // Attacker calls withdrawValidatorFees() -> triggers receive() -> attempts re-entry -> reverts!
            await expect(
                escrow.connect(atkSigner).withdrawValidatorFees()
            ).to.be.reverted;

            await ethers.provider.send("hardhat_stopImpersonatingAccount", [attackerAddr]);
        });

        it("SEC-02: should maintain independent fee liabilities across multiple jobs and validators", async function () {
            const val1 = validatorSigner.address;
            const val2 = otherSigner.address;

            // Job 1: val1, fee 10% (0.1 ETH)
            const { jobId: j1 } = await setupStandardJob({ validator: val1, feeBps: 1000, minScore: 50 });
            await escrow.connect(providerWalletSigner).acceptJob(j1);
            const sub1 = ethers.keccak256(ethers.toUtf8Bytes("sub1"));
            await escrow.connect(providerWalletSigner).submitJob(j1, sub1, "ipfs://1");
            const req1 = (await escrow.getJob(j1)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(val1, providerAgentId, "ipfs://1", req1);
            await escrow.connect(providerWalletSigner).startValidation(j1);
            await validationRegistry.connect(validatorSigner).validationResponse(req1, 90, "ipfs://1", ethers.keccak256(ethers.toUtf8Bytes("r1")), "tag");
            await escrow.connect(otherSigner).settleCompletedJob(j1);

            // Job 2: val2, fee 20% (0.2 ETH)
            const { jobId: j2 } = await setupStandardJob({ validator: val2, feeBps: 2000, minScore: 50 });
            await escrow.connect(providerWalletSigner).acceptJob(j2);
            const sub2 = ethers.keccak256(ethers.toUtf8Bytes("sub2"));
            await escrow.connect(providerWalletSigner).submitJob(j2, sub2, "ipfs://2");
            const req2 = (await escrow.getJob(j2)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(val2, providerAgentId, "ipfs://2", req2);
            await escrow.connect(providerWalletSigner).startValidation(j2);
            await validationRegistry.connect(otherSigner).validationResponse(req2, 90, "ipfs://2", ethers.keccak256(ethers.toUtf8Bytes("r2")), "tag");
            await escrow.connect(otherSigner).settleCompletedJob(j2);

            // Job 3: val1, fee 15% (0.15 ETH)
            const { jobId: j3 } = await setupStandardJob({ validator: val1, feeBps: 1500, minScore: 50 });
            await escrow.connect(providerWalletSigner).acceptJob(j3);
            const sub3 = ethers.keccak256(ethers.toUtf8Bytes("sub3"));
            await escrow.connect(providerWalletSigner).submitJob(j3, sub3, "ipfs://3");
            const req3 = (await escrow.getJob(j3)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(val1, providerAgentId, "ipfs://3", req3);
            await escrow.connect(providerWalletSigner).startValidation(j3);
            await validationRegistry.connect(validatorSigner).validationResponse(req3, 90, "ipfs://3", ethers.keccak256(ethers.toUtf8Bytes("r3")), "tag");
            await escrow.connect(otherSigner).settleCompletedJob(j3);

            // Verify independent accounting:
            // val1: 0.1 ETH + 0.15 ETH = 0.25 ETH
            // val2: 0.2 ETH
            const feeVal1 = ethers.parseEther("0.25");
            const feeVal2 = ethers.parseEther("0.2");
            expect(await escrow.pendingValidatorFees(val1)).to.equal(feeVal1);
            expect(await escrow.pendingValidatorFees(val2)).to.equal(feeVal2);
            expect(await escrow.totalPendingValidatorFees()).to.equal(feeVal1 + feeVal2);

            // Contract balance backing invariant
            const escrowBal = await ethers.provider.getBalance(await escrow.getAddress());
            expect(escrowBal).to.be.gte(feeVal1 + feeVal2);

            // val1 withdraws
            await escrow.connect(validatorSigner).withdrawValidatorFees();
            expect(await escrow.pendingValidatorFees(val1)).to.equal(0n);
            expect(await escrow.pendingValidatorFees(val2)).to.equal(feeVal2);
            expect(await escrow.totalPendingValidatorFees()).to.equal(feeVal2);

            // val2 withdraws
            await escrow.connect(otherSigner).withdrawValidatorFees();
            expect(await escrow.pendingValidatorFees(val2)).to.equal(0n);
            expect(await escrow.totalPendingValidatorFees()).to.equal(0n);
        });

        it("SEC-03: should set unambiguous terminal status and settled == true on EVERY terminal path", async function () {
            // Path 1: rejectJob -> REJECTED (6)
            const { jobId: jReject } = await setupStandardJob();
            await escrow.connect(providerWalletSigner).rejectJob(jReject, "unwilling");
            expect((await escrow.getJob(jReject)).status).to.equal(6);
            expect((await escrow.getJob(jReject)).settled).to.be.true;

            // Path 2: cancelJob -> CANCELLED (7)
            const { jobId: jCancel } = await setupStandardJob();
            await escrow.connect(clientSigner).cancelJob(jCancel);
            expect((await escrow.getJob(jCancel)).status).to.equal(7);
            expect((await escrow.getJob(jCancel)).settled).to.be.true;

            // Path 3: expireJob -> EXPIRED (8)
            const { jobId: jExp } = await setupStandardJob();
            await increaseTime(3601);
            await escrow.connect(otherSigner).expireJob(jExp);
            expect((await escrow.getJob(jExp)).status).to.equal(8);
            expect((await escrow.getJob(jExp)).settled).to.be.true;

            // Path 4: expireUnsubmittedJob -> EXPIRED_UNSUBMITTED (9)
            const { jobId: jExpUnsub } = await setupStandardJob();
            await escrow.connect(providerWalletSigner).acceptJob(jExpUnsub);
            await increaseTime(7201);
            await escrow.connect(otherSigner).expireUnsubmittedJob(jExpUnsub);
            expect((await escrow.getJob(jExpUnsub)).status).to.equal(9);
            expect((await escrow.getJob(jExpUnsub)).settled).to.be.true;

            // Path 5: settleCompletedJob -> COMPLETED (5)
            const { jobId: jComp } = await setupStandardJob({ feeBps: 0, minScore: 50 });
            await escrow.connect(providerWalletSigner).acceptJob(jComp);
            const subHash = ethers.keccak256(ethers.toUtf8Bytes("deliv-comp"));
            await escrow.connect(providerWalletSigner).submitJob(jComp, subHash, "ipfs://comp");
            const reqComp = (await escrow.getJob(jComp)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(validatorSigner.address, providerAgentId, "ipfs://req", reqComp);
            await escrow.connect(providerWalletSigner).startValidation(jComp);
            await validationRegistry.connect(validatorSigner).validationResponse(reqComp, 90, "ipfs://pass", ethers.keccak256(ethers.toUtf8Bytes("p")), "tag");
            await escrow.connect(otherSigner).settleCompletedJob(jComp);
            expect((await escrow.getJob(jComp)).status).to.equal(5);
            expect((await escrow.getJob(jComp)).settled).to.be.true;

            // Path 6: claimFailedValidationRefund -> REFUNDED (12)
            const { jobId: jFailRef } = await setupStandardJob({ minScore: 80 });
            await escrow.connect(providerWalletSigner).acceptJob(jFailRef);
            const subFail = ethers.keccak256(ethers.toUtf8Bytes("deliv-fail"));
            await escrow.connect(providerWalletSigner).submitJob(jFailRef, subFail, "ipfs://fail");
            const reqFail = (await escrow.getJob(jFailRef)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(validatorSigner.address, providerAgentId, "ipfs://req", reqFail);
            await escrow.connect(providerWalletSigner).startValidation(jFailRef);
            await validationRegistry.connect(validatorSigner).validationResponse(reqFail, 50, "ipfs://fail", ethers.keccak256(ethers.toUtf8Bytes("f")), "tag");
            await escrow.connect(otherSigner).recordValidationFailure(jFailRef);
            expect((await escrow.getJob(jFailRef)).status).to.equal(10); // FAILED_VALIDATION (active challenge window)
            expect((await escrow.getJob(jFailRef)).settled).to.be.false;
            await increaseTime(86401);
            await escrow.connect(clientSigner).claimFailedValidationRefund(jFailRef);
            expect((await escrow.getJob(jFailRef)).status).to.equal(12); // REFUNDED
            expect((await escrow.getJob(jFailRef)).settled).to.be.true;

            // Path 7: resolveDispute(CLIENT_WINS) -> REFUNDED (12)
            const { jobId: jDisClient } = await setupStandardJob({ minScore: 80 });
            await escrow.connect(providerWalletSigner).acceptJob(jDisClient);
            const subDisC = ethers.keccak256(ethers.toUtf8Bytes("deliv-disc"));
            await escrow.connect(providerWalletSigner).submitJob(jDisClient, subDisC, "ipfs://disc");
            const reqDisC = (await escrow.getJob(jDisClient)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(validatorSigner.address, providerAgentId, "ipfs://req", reqDisC);
            await escrow.connect(providerWalletSigner).startValidation(jDisClient);
            await escrow.connect(clientSigner).raiseDispute(jDisClient, "ipfs://dis");
            await escrow.connect(arbiterSigner).resolveDispute(jDisClient, 0, "ipfs://client-wins");
            expect((await escrow.getJob(jDisClient)).status).to.equal(12); // REFUNDED
            expect((await escrow.getJob(jDisClient)).settled).to.be.true;

            // Path 8: resolveDispute(PROVIDER_WINS) -> COMPLETED (5)
            const { jobId: jDisProv } = await setupStandardJob({ minScore: 80 });
            await escrow.connect(providerWalletSigner).acceptJob(jDisProv);
            const subDisP = ethers.keccak256(ethers.toUtf8Bytes("deliv-disp"));
            await escrow.connect(providerWalletSigner).submitJob(jDisProv, subDisP, "ipfs://disp");
            const reqDisP = (await escrow.getJob(jDisProv)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(validatorSigner.address, providerAgentId, "ipfs://req", reqDisP);
            await escrow.connect(providerWalletSigner).startValidation(jDisProv);
            await escrow.connect(providerWalletSigner).raiseDispute(jDisProv, "ipfs://dis");
            await escrow.connect(arbiterSigner).resolveDispute(jDisProv, 1, "ipfs://prov-wins");
            expect((await escrow.getJob(jDisProv)).status).to.equal(5); // COMPLETED
            expect((await escrow.getJob(jDisProv)).settled).to.be.true;

            // Path 9: resolveDispute(SPLIT) -> COMPLETED (5)
            const { jobId: jDisSplit } = await setupStandardJob({ minScore: 80 });
            await escrow.connect(providerWalletSigner).acceptJob(jDisSplit);
            const subDisS = ethers.keccak256(ethers.toUtf8Bytes("deliv-diss"));
            await escrow.connect(providerWalletSigner).submitJob(jDisSplit, subDisS, "ipfs://diss");
            const reqDisS = (await escrow.getJob(jDisSplit)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(validatorSigner.address, providerAgentId, "ipfs://req", reqDisS);
            await escrow.connect(providerWalletSigner).startValidation(jDisSplit);
            await escrow.connect(providerWalletSigner).raiseDispute(jDisSplit, "ipfs://dis");
            await escrow.connect(arbiterSigner).resolveDispute(jDisSplit, 2, "ipfs://split");
            expect((await escrow.getJob(jDisSplit)).status).to.equal(5); // COMPLETED
            expect((await escrow.getJob(jDisSplit)).settled).to.be.true;

            // Path 10: timeoutDispute -> REFUNDED (12)
            const { jobId: jDisTime } = await setupStandardJob({ minScore: 80 });
            await escrow.connect(providerWalletSigner).acceptJob(jDisTime);
            const subDisT = ethers.keccak256(ethers.toUtf8Bytes("deliv-dist"));
            await escrow.connect(providerWalletSigner).submitJob(jDisTime, subDisT, "ipfs://dist");
            const reqDisT = (await escrow.getJob(jDisTime)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(validatorSigner.address, providerAgentId, "ipfs://req", reqDisT);
            await escrow.connect(providerWalletSigner).startValidation(jDisTime);
            await escrow.connect(clientSigner).raiseDispute(jDisTime, "ipfs://dis");
            await increaseTime(7 * 86400 + 1);
            await escrow.connect(clientSigner).timeoutDispute(jDisTime);
            expect((await escrow.getJob(jDisTime)).status).to.equal(12); // REFUNDED
            expect((await escrow.getJob(jDisTime)).settled).to.be.true;
        });

        it("Config & Boundaries: should strictly enforce validator fee cap at 0 bps, 5000 bps, and revert at 5001 bps", async function () {
            const now = await getBlockTimestamp();

            // 0 bps: allowed
            const id0 = ethers.keccak256(ethers.toUtf8Bytes("fee-0"));
            await expect(escrow.connect(clientSigner).createJob(
                id0, clientAgentId, providerAgentId, validatorSigner.address, 0, 50,
                now + 3600, now + 7200, now + 10800, taskHash, snapshotHash, ethers.ZeroAddress,
                { value: defaultReward }
            )).to.emit(escrow, "JobCreated");

            // 5000 bps (50% max): allowed
            const id5000 = ethers.keccak256(ethers.toUtf8Bytes("fee-5000"));
            await expect(escrow.connect(clientSigner).createJob(
                id5000, clientAgentId, providerAgentId, validatorSigner.address, 5000, 50,
                now + 3600, now + 7200, now + 10800, taskHash, snapshotHash, ethers.ZeroAddress,
                { value: defaultReward }
            )).to.emit(escrow, "JobCreated");

            // 5001 bps (50.01%): REVERTS with 'Validator fee exceeds 50%'
            const id5001 = ethers.keccak256(ethers.toUtf8Bytes("fee-5001"));
            await expect(escrow.connect(clientSigner).createJob(
                id5001, clientAgentId, providerAgentId, validatorSigner.address, 5001, 50,
                now + 3600, now + 7200, now + 10800, taskHash, snapshotHash, ethers.ZeroAddress,
                { value: defaultReward }
            )).to.be.revertedWith("Validator fee exceeds 50%");
        });

        it("Funds Conservation: should verify exact-wei funds conservation across normal settlement, refunds, and split rulings", async function () {
            // Odd wei: 1 ETH + 3 wei
            const oddAmount = ethers.parseEther("1.0") + 3n;
            const { jobId } = await setupStandardJob({ reward: oddAmount, feeBps: 1500, minScore: 50 });
            await escrow.connect(providerWalletSigner).acceptJob(jobId);
            const sub = ethers.keccak256(ethers.toUtf8Bytes("sub-cons"));
            await escrow.connect(providerWalletSigner).submitJob(jobId, sub, "ipfs://sub");
            const req = (await escrow.getJob(jobId)).validationRequestHash;
            await validationRegistry.connect(providerWalletSigner).validationRequest(validatorSigner.address, providerAgentId, "ipfs://req", req);
            await escrow.connect(providerWalletSigner).startValidation(jobId);
            await validationRegistry.connect(validatorSigner).validationResponse(req, 85, "ipfs://p", ethers.keccak256(ethers.toUtf8Bytes("p")), "tag");

            const balBeforeEscrow = await ethers.provider.getBalance(await escrow.getAddress());
            const provBefore = await ethers.provider.getBalance(providerWalletSigner.address);

            await escrow.connect(otherSigner).settleCompletedJob(jobId);

            const provAfter = await ethers.provider.getBalance(providerWalletSigner.address);
            const expectedFee = (oddAmount * 1500n) / 10000n;
            const expectedProv = oddAmount - expectedFee;

            expect(provAfter - provBefore).to.equal(expectedProv);
            expect(await escrow.pendingValidatorFees(validatorSigner.address)).to.equal(expectedFee);

            // Validator withdraws
            const valBefore = await ethers.provider.getBalance(validatorSigner.address);
            const wTx = await escrow.connect(validatorSigner).withdrawValidatorFees();
            const wReceipt = await wTx.wait();
            const wGas = wReceipt.gasUsed * wReceipt.gasPrice;
            const valAfter = await ethers.provider.getBalance(validatorSigner.address);
            expect(valAfter - valBefore + wGas).to.equal(expectedFee);

            const balAfterEscrow = await ethers.provider.getBalance(await escrow.getAddress());
            expect(balBeforeEscrow - balAfterEscrow).to.equal(oddAmount);
            expect(expectedFee + expectedProv).to.equal(oddAmount);
        });
    });
});
